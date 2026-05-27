import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

// Compress an image safely using Canvas rendering with multi-stage downscaling
export async function compressImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        // Multi-stage downscaling helper
        const renderToBlob = (maxDim: number, q: number): Promise<Blob> => {
          return new Promise((resBlob) => {
            const canvas = document.createElement("canvas");
            let w = img.width;
            let h = img.height;
            
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(img, 0, 0, w, h);
            }
            canvas.toBlob((b) => resBlob(b || file), "image/jpeg", q);
          });
        };

        // Iteratively try combinations of dimensions and qualities until we get <= 120KB
        // Or if we run out of options, return the smallest we got
        const dimensions = [800, 600, 450, 300];
        const qualities = [0.7, 0.5, 0.3, 0.15];
        
        let bestBlob: Blob | null = null;
        
        for (const dim of dimensions) {
          for (const quality of qualities) {
            try {
              const blob = await renderToBlob(dim, quality);
              if (!bestBlob || blob.size < bestBlob.size) {
                bestBlob = blob;
              }
              if (blob.size <= 120 * 1024) {
                resolve(blob);
                return;
              }
            } catch (err) {
              console.warn("Compression iteration error:", err);
            }
          }
        }
        
        if (bestBlob) {
          resolve(bestBlob);
        } else {
          resolve(file);
        }
      };
      
      img.onerror = () => {
        console.warn("Failed to load image for compression");
        resolve(file);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      console.warn("Failed to read file for compression");
      resolve(file);
    };
  });
}

// Upload a generic file/audio/image to Storage with high-grade Base64 local fallback
export async function handleFileUpload(
  fileOrBlob: File | Blob,
  folder: string,
  fileName?: string
): Promise<{ name: string; url: string; type: string }> {
  let fileToUpload = fileOrBlob;
  
  const safeFileName = fileName || (fileOrBlob.type.startsWith("image/") ? "photo.jpg" : fileOrBlob.type.startsWith("audio/") ? "audio.webm" : "file");
  const fileExtension = safeFileName.split('.').pop()?.toLowerCase() || '';
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  const isImage = fileOrBlob.type.startsWith("image/") || imageExtensions.includes(fileExtension);
  
  let detectedType = fileOrBlob.type;
  if (isImage) {
    if (!detectedType || detectedType === "application/octet-stream") {
      detectedType = "image/jpeg";
    }
  } else if (fileExtension === "pdf") {
    if (!detectedType || detectedType === "application/octet-stream") {
      detectedType = "application/pdf";
    }
  } else if (fileExtension === "webm" || fileExtension === "ogg" || fileExtension === "mp3" || fileExtension === "wav") {
    if (!detectedType || detectedType === "application/octet-stream") {
      detectedType = `audio/${fileExtension === "mp3" ? "mpeg" : fileExtension}`;
    }
  }

  if (isImage) {
    try {
      const compressed = await compressImage(fileOrBlob);
      fileToUpload = new Blob([compressed], { type: "image/jpeg" });
      detectedType = "image/jpeg";
    } catch (e) {
      console.warn("Image compression failed, uploading original:", e);
    }
  }

  const generatedName = `${Date.now()}_${safeFileName}`;
  const uploadPath = `${folder}/${generatedName}`;

  try {
    const storageRef = ref(storage, uploadPath);
    
    // Set up a 5-second timeout race to prevent hanging on slow/blocked connections
    const uploadProcess = (async () => {
      const snapshot = await uploadBytes(storageRef, fileToUpload);
      return await getDownloadURL(snapshot.ref);
    })();
    
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firebase Storage upload timed out after 5 seconds")), 5000)
    );
    
    const url = await Promise.race([uploadProcess, timeoutPromise]);
    
    return {
      name: safeFileName,
      url,
      type: detectedType || fileOrBlob.type
    };
  } catch (err) {
    console.warn("Firebase Storage upload fallback triggered (using direct dataURI/Base64 scheme):", err);
    
    // If the file is still larger than 600KB, reject it for offline fallback.
    const maxSize = 600 * 1024;
    if (fileToUpload.size > maxSize) {
      throw new Error(
        `Offline attachment size exceeds the 600KB database limit (Current: ${Math.round(
          fileToUpload.size / 1024
        )}KB). Please upload a smaller file/document.`
      );
    }

    // Secure Offline/Direct Firestore fallback
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          name: safeFileName,
          url: reader.result as string, // base64 encoded string
          type: detectedType || fileOrBlob.type
        });
      };
      reader.onerror = () => reject(new Error("Failed to read file for fallback inline storage."));
      reader.readAsDataURL(fileToUpload);
    });
  }
}

