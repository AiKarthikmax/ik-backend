import React, { useState, useRef, useEffect } from "react";
import { X, RotateCw, ZoomIn, Check, Camera } from "lucide-react";

interface ImageCropperModalProps {
  imageSrc: string;
  imageName: string;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
  onRetake: () => void;
}

export default function ImageCropperModal({
  imageSrc,
  imageName,
  onCrop,
  onCancel,
  onRetake
}: ImageCropperModalProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset values when a new image source is loaded (e.g. on retake)
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, [imageSrc]);

  // Pointer drag event handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragStart({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleSave = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    // Create a hidden canvas for high-quality square cropping (500x500 pixels)
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "#0f172a"; // background slate-900
      ctx.fillRect(0, 0, 500, 500);

      // Translate to canvas center
      ctx.translate(250, 250);
      ctx.rotate((rotation * Math.PI) / 180);

      // Determine visual scale
      // Visual container size = 300px
      // Visual crop box size = 240px
      // Display fit mapping
      const containerSize = 300;
      const cropBoxSize = 240;

      const imgRatio = img.naturalWidth / img.naturalHeight;
      let displayWidth = containerSize;
      let displayHeight = containerSize;

      if (imgRatio > 1) {
        displayHeight = containerSize / imgRatio;
      } else {
        displayWidth = containerSize * imgRatio;
      }

      // Base scale fits the image inside the container
      const baseScale = displayWidth / img.naturalWidth;
      const totalScale = baseScale * scale;

      // Crop conversion ratio from visual crop area (240px) to output canvas (500px)
      const conversion = 500 / cropBoxSize;

      // Apply scale
      ctx.scale(totalScale * conversion, totalScale * conversion);
      
      // Apply offset translation
      ctx.translate(offset.x / (totalScale * conversion), offset.y / (totalScale * conversion));

      // Draw the image centered
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      // Export cropped image as file
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const croppedFile = new File([blob], imageName.replace(/\.[^/.]+$/, "") + "_cropped.jpg", {
              type: "image/jpeg",
              lastModified: Date.now()
            });
            onCrop(croppedFile);
          }
        },
        "image/jpeg",
        0.9
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh] animate-scale-in">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <span className="text-xs font-bold text-white truncate max-w-[70%] font-mono">
            📷 Edit & Crop Photo
          </span>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Editor Body */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center space-y-6 bg-slate-950/40">
          
          {/* Crop Container */}
          <div className="w-[300px] h-[300px] bg-slate-950 rounded-2xl relative border border-slate-800/80 overflow-hidden select-none">
            
            {/* Visual Crop Guide (Transparent Square with outer shade) */}
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
              {/* Visual Crop Box border */}
              <div className="w-[240px] h-[240px] border-2 border-indigo-500 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]" />
            </div>

            {/* Draggable Image Container */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="absolute inset-0 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Original source"
                draggable={false}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
                  transition: isDragging ? "none" : "transform 0.15s ease-out",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain"
                }}
              />
            </div>
          </div>

          {/* Scale Slider */}
          <div className="w-full space-y-1">
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1"><ZoomIn className="w-3.5 h-3.5" /> ZOOM / SCALE</span>
              <span className="font-bold text-white">{Math.round(scale * 100)}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="0.02"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
            />
          </div>

          {/* Toolbar Buttons */}
          <div className="flex w-full gap-2 pt-2 border-t border-slate-800/40">
            <button
              onClick={handleRotate}
              className="flex-1 py-2 bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 rounded-xl hover:text-white transition text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
              Rotate 90°
            </button>

            <button
              onClick={onRetake}
              className="flex-1 py-2 bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 rounded-xl hover:text-white transition text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-400" />
              Retake
            </button>
          </div>

        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 flex gap-3 bg-slate-950/80">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition hover:scale-[1.02] shadow-lg shadow-indigo-600/10"
          >
            <Check className="w-3.5 h-3.5" />
            Crop & Save
          </button>
        </div>

      </div>
    </div>
  );
}
