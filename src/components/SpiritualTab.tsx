import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { GratitudeLog } from "../types";
import { handleFileUpload } from "../attachmentHelper";
import {
  Sparkles,
  Heart,
  Plus,
  Compass,
  Calendar,
  Camera,
  Mic,
  Smile,
  FileText,
  X
} from "lucide-react";

export default function SpiritualTab() {
  const [gratitudes, setGratitudes] = useState<GratitudeLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Spiritual Messages states
  const [msgType, setMsgType] = useState<"god" | "angel">("god");
  const [currentMessage, setCurrentMessage] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Gratitude form states
  const [prompt1, setPrompt1] = useState("");
  const [prompt2, setPrompt2] = useState("");
  const [prompt3, setPrompt3] = useState("");
  const [emojiReaction, setEmojiReaction] = useState("💖");
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [activeAttachment, setActiveAttachment] = useState<{ name: string; url: string; type: string } | null>(null);

  // AI gratitude coaching tips
  const [aiTip, setAiTip] = useState("");
  const [aiTipLoading, setAiTipLoading] = useState(false);

  // Date String
  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    // Load gratitude entries
    const q = query(collection(db, "gratitude"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: GratitudeLog[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as GratitudeLog);
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setGratitudes(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "gratitude");
      }
    );

    // Load bookmarked favorites from localStorage
    const saved = localStorage.getItem("maha_favorite_spiritual");
    if (saved) {
      setFavorites(JSON.parse(saved));
    }

    // Trigger initial message fetch
    fetchSpiritualMessage();
    fetchAISuggestedGratitude();

    return () => unsubscribe();
  }, []);

  // Fetch spiritual guidelines from server
  const fetchSpiritualMessage = async (forcedType?: "god" | "angel") => {
    setMsgLoading(true);
    const targetType = forcedType || msgType;
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "spiritual",
          payload: { msgType: targetType }
        })
      });
      const data = await response.json();
      setCurrentMessage(data.suggestion);
    } catch (e) {
      setCurrentMessage(
        targetType === "god"
          ? "Your strength is not in your hands, but in your faith and patience."
          : "An angel of abundance surrounds your workspace today."
      );
    } finally {
      setMsgLoading(false);
    }
  };

  const handleTypeToggle = (type: "god" | "angel") => {
    setMsgType(type);
    fetchSpiritualMessage(type);
  };

  // Bookmark current wisdom card
  const handleFavoriteClick = () => {
    if (!currentMessage) return;
    let updated;
    if (favorites.includes(currentMessage)) {
      updated = favorites.filter((x) => x !== currentMessage);
    } else {
      updated = [...favorites, currentMessage];
    }
    setFavorites(updated);
    localStorage.setItem("maha_favorite_spiritual", JSON.stringify(updated));
  };

  // Get smart gratitude topic prompts
  const fetchAISuggestedGratitude = async () => {
    setAiTipLoading(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "gratitude", payload: {} })
      });
      const data = await response.json();
      setAiTip(data.suggestion);
    } catch (e) {
      setAiTip("Try expressing gratitude for micro comforts: a clean writing space, or soft ambient daylight.");
    } finally {
      setAiTipLoading(false);
    }
  };

  // File / Photo helpers
  const handlePhotoCapture = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setUploading(true);
        try {
          const attach = await handleFileUpload(file, "gratitude", file.name || "photo.jpg");
          setAttachments((prev) => [...prev, attach]);
        } catch (err: any) {
          console.error("Gratitude photo upload error:", err);
          alert(err.message || "Failed to process gratitude photo.");
        } finally {
          setUploading(false);
        }
      }
    };
    input.click();
  };

  // Submit today's gratitude journal
  const handleSubmitGratitude = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt1.trim() && !prompt2.trim() && !prompt3.trim()) {
      alert("Please log at least one statement of gratitude before saving.");
      return;
    }

    const entriesList = [
      prompt1.trim() || "A beautiful, calm day.",
      prompt2.trim() || "Support from friends or teammates.",
      prompt3.trim() || "Good food and physical balance."
    ];

    const payload: Omit<GratitudeLog, "id"> = {
      date: todayStr,
      entries: entriesList,
      attachments,
      reactions: [emojiReaction]
    };

    try {
      await addDoc(collection(db, "gratitude"), payload);
      setPrompt1("");
      setPrompt2("");
      setPrompt3("");
      setAttachments([]);
      alert("Today's gratitude successfully registered!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "gratitude");
    }
  };

  const alreadySavedToday = gratitudes.some((g) => g.date === todayStr);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm animate-fade-in-up">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block block" />
          Module 4 — Spiritual Dashboard
        </h2>
        <p className="text-xs text-slate-400 mt-1 font-medium">
          A meditative center featuring angelic guiding quotes and your daily gratitude book.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left column—Hourly auto-refreshing messages */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between min-h-[300px] relative overflow-hidden shadow-sm animate-fade-in-up">
            
            {/* Header selection pills */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex bg-slate-950 p-1 rounded-xl">
                <button
                  onClick={() => handleTypeToggle("god")}
                  className={`px-3.5 py-1 rounded-lg text-2xs font-black transition flex items-center gap-1 cursor-pointer ${
                    msgType === "god" ? "bg-indigo-500/10 text-indigo-400" : "text-slate-400"
                  }`}
                >
                  <Compass className="w-3 h-3" />
                  God's Messages
                </button>
                <button
                  onClick={() => handleTypeToggle("angel")}
                  className={`px-3.5 py-1 rounded-lg text-2xs font-black transition flex items-center gap-1 cursor-pointer ${
                    msgType === "angel" ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Angel's Messages
                </button>
              </div>

              <button
                onClick={() => fetchSpiritualMessage()}
                className="text-2xs text-indigo-400 hover:text-indigo-300 font-bold hover:underline font-mono cursor-pointer"
              >
                Refresh Now
              </button>
            </div>

            {/* Quote Body */}
            <div className="py-8 text-center animate-fade-in-up flex-1 flex items-center justify-center">
              {msgLoading ? (
                <span className="text-xs text-slate-500 font-mono animate-pulse">
                  Opening divine guidance channel...
                </span>
              ) : (
                <blockquote className="space-y-2">
                  <p className="text-sm md:text-base text-gray-100 font-serif leading-relaxed italic px-4">
                    "{currentMessage}"
                  </p>
                  <footer className="text-2xs text-indigo-400 font-mono tracking-widest uppercase font-bold">
                    — {msgType === "god" ? "Heavenly Father Wisdom" : "Angel Protection Core"}
                  </footer>
                </blockquote>
              )}
            </div>

            {/* Favorite bookmarks bottom bar */}
            <button
              onClick={handleFavoriteClick}
              className="flex justify-center items-center gap-1.5 py-2 hover:bg-slate-950 rounded-xl text-xs text-slate-300 transition cursor-pointer"
            >
              <Heart
                className={`w-4 h-4 transition ${
                  favorites.includes(currentMessage) ? "fill-rose-500 text-rose-500" : "text-slate-400"
                }`}
              />
              {favorites.includes(currentMessage) ? "Favorited Message" : "Favorite Message"}
            </button>
          </div>

          {/* Favorited library logs */}
          {favorites.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl lg:max-h-[220px] lg:overflow-y-auto shadow-sm">
              <h3 className="text-2xs font-bold text-white uppercase tracking-wider mb-3">Saved Inspirations Archives ({favorites.length})</h3>
              <div className="space-y-2">
                {favorites.map((fav, i) => (
                  <div key={i} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-2xs font-serif leading-relaxed text-slate-300 relative">
                    "{fav}"
                    <button
                      onClick={() => {
                        const updated = favorites.filter((_, idx) => idx !== i);
                        setFavorites(updated);
                        localStorage.setItem("maha_favorite_spiritual", JSON.stringify(updated));
                      }}
                      className="absolute top-2 right-2 text-rose-400 font-bold hover:text-rose-300 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column—Daily Gratitude form */}
        <div className="space-y-4">
          
          {/* Gratitude checklist card */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-sm animate-fade-in-up">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Today's Gratitude Session</h3>
              <span className="text-[10px] text-slate-400 font-mono">{todayStr}</span>
            </div>

            {/* AI Prompts alerts */}
            {aiTip && (
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/25 rounded-xl text-indigo-200 text-2xs font-mono">
                💡 AI Prompt: {aiTip}
              </div>
            )}

            {alreadySavedToday ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-center text-xs font-mono">
                ✓ Gratitude session complete for today. Visit logs to reflect on earlier gratitude.
              </div>
            ) : (
              <form onSubmit={handleSubmitGratitude} className="space-y-4">
                
                {/* 3 Prompts inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">1. I am extremely grateful for...</label>
                    <input
                      type="text"
                      value={prompt1}
                      onChange={(e) => setPrompt1(e.target.value)}
                      placeholder="My health, a warm coffee, or clear daylight..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1">2. My second gratitude is...</label>
                    <input
                      type="text"
                      value={prompt2}
                      onChange={(e) => setPrompt2(e.target.value)}
                      placeholder="Finances are robust, family members are safe..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono mb-1 font-sans">3. Third thankfulness moment...</label>
                    <input
                      type="text"
                      value={prompt3}
                      onChange={(e) => setPrompt3(e.target.value)}
                      placeholder="Completing hard duties beautifully today..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Emotional/reaction select */}
                <div className="flex gap-2 items-center">
                  <span className="text-2xs font-mono text-slate-405 uppercase tracking-wide">Reaction:</span>
                  {["💖", "✨", "🌸", "⭐", "🍃"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setEmojiReaction(emoji)}
                      className={`text-base p-1.5 rounded-lg border cursor-pointer transition ${
                        emojiReaction === emoji ? "bg-slate-800 border-indigo-500" : "border-transparent"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Photo capture tools */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handlePhotoCapture}
                      className="flex-1 py-1.5 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-xl text-3xs text-slate-300 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      Attach Gratitude Photo
                    </button>
                  </div>
                  
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                      {attachments.map((at, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-slate-805 px-2 py-1 rounded text-[10px]">
                          <span 
                            onClick={() => setActiveAttachment(at)}
                            className="text-indigo-400 hover:text-indigo-350 hover:underline cursor-pointer truncate max-w-[120px]"
                            title="Click to view photo"
                          >
                            {at.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                            className="text-rose-400 font-bold ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {uploading ? (
                  <div className="text-[10px] text-indigo-400 font-mono animate-pulse text-center">Uploading photo...</div>
                ) : (
                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition text-white font-semibold text-xs rounded-xl cursor-pointer"
                  >
                    Confirm Today's Gratitude Session
                  </button>
                )}
              </form>
            )}
          </div>
        </div>

      </div>

      {/* History timeline calendar */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm animate-fade-in-up">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-indigo-400" />
          Historic Gratitude Timeline
        </h3>

        {loading ? (
          <span className="text-xs text-slate-500 font-mono animate-pulse">Retrieving historic logs...</span>
        ) : gratitudes.length === 0 ? (
          <div className="text-center text-xs text-slate-400 font-mono py-8">Begin logging gratitude moments to review milestones.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:max-h-[300px] lg:overflow-y-auto">
            {gratitudes.map((g) => (
              <div key={g.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 hover:border-indigo-500/50 transition duration-300 shadow-inner">
                <div className="flex justify-between items-center pb-1 border-b border-slate-800/40">
                  <span className="text-xs font-bold text-white font-sans">{g.date}</span>
                  <span className="text-base">{g.reactions?.[0] || "💖"}</span>
                </div>
                <ul className="space-y-1 text-2xs text-slate-300 list-disc list-inside">
                  {g.entries.map((ent, idx) => (
                    <li key={idx} className="leading-relaxed truncate">{ent}</li>
                  ))}
                </ul>
                
                {/* Photo Attachments rendering */}
                {g.attachments && g.attachments.length > 0 && (
                  <div className="flex gap-2 items-center flex-wrap pt-2 border-t border-slate-800/40">
                    {g.attachments.map((at, i) => (
                      <div key={i} className="flex items-center gap-1">
                        {at.type.startsWith("image/") ? (
                          <img
                            src={at.url}
                            alt="Attachment"
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 object-cover rounded border border-slate-700 hover:scale-105 transition cursor-pointer"
                            onClick={() => setActiveAttachment(at)}
                            title="Click to view photo"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveAttachment(at)}
                            className="flex items-center gap-1 text-[9px] text-cyan-400 bg-slate-800 px-2 py-0.5 rounded cursor-pointer hover:bg-slate-750 transition font-mono border border-slate-700"
                            title="Click to view file"
                          >
                            <FileText className="w-2.5 h-2.5" /> View File
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachment Viewer Modal */}
      {activeAttachment && (
        <div className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[85vh] animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <span className="text-xs font-bold text-white truncate max-w-[80%] font-mono">
                📎 {activeAttachment.name}
              </span>
              <button
                onClick={() => setActiveAttachment(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Content Preview */}
            <div className="p-6 flex-1 overflow-auto flex items-center justify-center bg-slate-950/40 min-h-[300px]">
              {activeAttachment.type.startsWith("image/") ? (
                <img
                  src={activeAttachment.url}
                  alt={activeAttachment.name}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg border border-slate-800 shadow"
                />
              ) : (
                <div className="text-center space-y-4">
                  <FileText className="w-12 h-12 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">Preview not supported for this file type.</p>
                  <a
                    href={activeAttachment.url}
                    download={activeAttachment.name}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition hover:scale-[1.02]"
                  >
                    Download & View Attachment
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
