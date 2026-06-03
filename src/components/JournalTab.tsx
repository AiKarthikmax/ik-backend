import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, getApiUrl } from "../firebase";
import { JournalEntry } from "../types";
import { handleFileUpload } from "../attachmentHelper";
import ImageCropperModal from "./ImageCropperModal";
import {
  BookOpen,
  Search,
  Sparkles,
  Camera,
  Mic,
  MicOff,
  FileText,
  Clock,
  Trash,
  Edit2,
  Calendar,
  Frown,
  Meh,
  Smile,
  AlertCircle,
  X
} from "lucide-react";

const MOODS = [
  { value: "excited", label: "Excited", emoji: "🤩", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  { value: "happy", label: "Happy", emoji: "😊", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  { value: "neutral", label: "Neutral", emoji: "😐", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  { value: "tired", label: "Tired", emoji: "🥱", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  { value: "anxious", label: "Anxious", emoji: "😰", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" },
  { value: "sad", label: "Sad", emoji: "😢", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" }
];

const DECOY_ENTRIES: JournalEntry[] = [
  {
    id: "decoy-1",
    date: "2026-05-27",
    content: "Had a great gym session in the morning. Focus was on compound movements today. Hit a personal record of 120kg on squats for 5 reps. Mind feels extremely clear and energized.",
    mood: "happy",
    attachments: [],
    deleted: false,
    editHistory: []
  },
  {
    id: "decoy-2",
    date: "2026-05-25",
    content: "Reflected on the current financial markets today. Decided to sit on cash and wait for a clear setup on the Nifty index. Better to preserve capital than to force trades in a choppy range.",
    mood: "neutral",
    attachments: [],
    deleted: false,
    editHistory: []
  },
  {
    id: "decoy-3",
    date: "2026-05-24",
    content: "Feeling a bit exhausted after a long week of meetings. Need to reset my sleeping schedule this weekend. Starting a digital detox from 8 PM today.",
    mood: "tired",
    attachments: [],
    deleted: false,
    editHistory: []
  }
];

export default function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Lock screen state
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("journal_unlocked") === "true");
  const [decoyMode, setDecoyMode] = useState(() => sessionStorage.getItem("journal_decoy") === "true");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shouldShake, setShouldShake] = useState(false);
  const [decoyEntries, setDecoyEntries] = useState<JournalEntry[]>(DECOY_ENTRIES);

  const handleUnlock = (codeToTest: string) => {
    const encoded = btoa(codeToTest);
    if (encoded === "Njg5MTYwMDI=") {
      sessionStorage.setItem("journal_unlocked", "true");
      sessionStorage.setItem("journal_decoy", "false");
      setUnlocked(true);
      setDecoyMode(false);
      setPin("");
      setError("");
    } else if (encoded === "MjUyNQ==") {
      sessionStorage.setItem("journal_unlocked", "true");
      sessionStorage.setItem("journal_decoy", "true");
      setUnlocked(true);
      setDecoyMode(true);
      setPin("");
      setError("");
    } else {
      setError("Incorrect security PIN");
      setPin("");
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 400);
    }
  };

  useEffect(() => {
    if (unlocked) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        if (pin.length < 8) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setError("");
          if (nextPin === "2525") {
            sessionStorage.setItem("journal_unlocked", "true");
            sessionStorage.setItem("journal_decoy", "true");
            setUnlocked(true);
            setDecoyMode(true);
            setPin("");
          } else if (nextPin === "68916002") {
            sessionStorage.setItem("journal_unlocked", "true");
            sessionStorage.setItem("journal_decoy", "false");
            setUnlocked(true);
            setDecoyMode(false);
            setPin("");
          }
        }
      } else if (e.key === "Backspace") {
        setPin((prev) => prev.slice(0, -1));
        setError("");
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        setPin("");
        setError("");
      } else if (e.key === "Enter") {
        if (pin) {
          handleUnlock(pin);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [pin, unlocked]);

  // Auto-lock when user switches away from the Journal tab
  useEffect(() => {
    return () => {
      sessionStorage.removeItem("journal_unlocked");
      sessionStorage.removeItem("journal_decoy");
    };
  }, []);

  // Form inputs
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("happy");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [formError, setFormError] = useState("");

  // Crop Photo state
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [cropImageName, setCropImageName] = useState<string>("");

  // Attachments State
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [activeAttachment, setActiveAttachment] = useState<{ name: string; url: string; type: string } | null>(null);

  // Search/Filters State
  const [search, setSearch] = useState("");
  const [selectedMoodFilter, setSelectedMoodFilter] = useState("all");

  // AI Journal Prompts
  const [aiPrompts, setAiPrompts] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  // Editing state
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [editReason, setEditReason] = useState("");

  useEffect(() => {
    const q = query(collection(db, "journals"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: JournalEntry[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as JournalEntry);
        });
        // Sort descending by date
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEntries(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "journals");
      }
    );

    return () => unsubscribe();
  }, []);

  // Securely request AI writing prompts based on current mood
  const fetchMindfulPrompts = async () => {
    setAiLoading(true);
    setAiPrompts("");
    try {
      const response = await fetch(getApiUrl("/api/ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "journal",
          payload: { currentMood: mood }
        })
      });
      const data = await response.json();
      setAiPrompts(data.suggestion);
    } catch (e) {
      console.error(e);
      setAiPrompts("Topic ideas: 1. Draw detail from 1 object you see. 2. What would you do with 3 more hours today? 3. Describe a moment of serene focus.");
    } finally {
      setAiLoading(false);
    }
  };

  // Automated trigger on mood shift
  useEffect(() => {
    if (mood) {
      setAiPrompts(""); // Clear previous suggestions when mood updates
    }
  }, [mood]);

  // Audio Recorder actions with low bitrate constraint
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let options = {};
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          options = { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 16000 };
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          options = { mimeType: "audio/webm", audioBitsPerSecond: 16000 };
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          options = { mimeType: "audio/ogg;codecs=opus", audioBitsPerSecond: 16000 };
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options = { mimeType: "audio/mp4", audioBitsPerSecond: 16000 };
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setUploading(true);
        setFormError("");
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
          const fileObj = new File([audioBlob], "journal_voice.webm", { type: mediaRecorder.mimeType || "audio/webm" });
          const attach = await handleFileUpload(fileObj, "journals", "Voice Entry.webm");
          setAttachments((prev) => [...prev, attach]);
        } catch (err: any) {
          console.error("Audio recording upload error:", err);
          setFormError(err.message || "Failed to upload audio recording.");
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (e) {
      alert("Could not access audio hardware inputs.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      setFormError("");
      try {
        const attach = await handleFileUpload(file, "journals", file.name || "document");
        setAttachments((prev) => [...prev, attach]);
      } catch (err: any) {
        console.error("Document upload error:", err);
        setFormError(err.message || "Failed to upload document.");
      } finally {
        setUploading(false);
      }
    }
  };

  // Submit journal
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!content.trim()) {
      setFormError("Please write down your thoughts before saving.");
      return;
    }

    if (decoyMode) {
      const newEntry: JournalEntry = {
        id: `decoy-${Date.now()}`,
        date,
        content: content.trim(),
        mood,
        attachments,
        deleted: false,
        editHistory: []
      };
      setDecoyEntries((prev) => [newEntry, ...prev]);
      setContent("");
      setAttachments([]);
      setFormError("");
      alert("Journal session logged!");
      return;
    }

    const payload: Omit<JournalEntry, "id"> = {
      date,
      content: content.trim(),
      mood,
      attachments,
      deleted: false,
      editHistory: []
    };

    try {
      await addDoc(collection(db, "journals"), payload);
      setContent("");
      setAttachments([]);
      setFormError("");
      alert("Journal session logged!");
    } catch (error: any) {
      console.error("Failed to save journal registry:", error);
      let msg = error.message || String(error);
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      setFormError(`Failed to save entry: ${msg}`);
    }
  };

  // Edit action triggers
  const triggerEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setEditReason("");
    setContent(entry.content);
    setMood(entry.mood);
    setDate(entry.date);
    setAttachments(entry.attachments || []);
  };

  const saveEditChange = async () => {
    if (!editingEntry) return;
    if (!editReason.trim()) {
      alert("Edit Reason is mandatory prior to recording modifications!");
      return;
    }

    const updatedHistory = [
      ...(editingEntry.editHistory || []),
      {
        timestamp: new Date().toISOString(),
        reason: editReason,
        previousData: {
          content: editingEntry.content,
          mood: editingEntry.mood,
          date: editingEntry.date
        }
      }
    ];

    if (decoyMode) {
      setDecoyEntries((prev) =>
        prev.map((e) =>
          e.id === editingEntry.id
            ? {
                ...e,
                content: content.trim(),
                mood,
                date,
                attachments,
                editHistory: updatedHistory
              }
            : e
        )
      );
      setEditingEntry(null);
      setEditReason("");
      setContent("");
      setAttachments([]);
      alert("Journal entry updated successfully.");
      return;
    }

    try {
      const docRef = doc(db, "journals", editingEntry.id);
      await updateDoc(docRef, {
        content: content.trim(),
        mood,
        date,
        attachments,
        editHistory: updatedHistory
      });

      setEditingEntry(null);
      setEditReason("");
      setContent("");
      setAttachments([]);
      alert("Journal entry updated successfully.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `journals/${editingEntry.id}`);
    }
  };

  // Soft Delete representation
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to remove this journal entry? (Soft-deleted, retained in backend database)")) {
      if (decoyMode) {
        setDecoyEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, deleted: true } : e))
        );
        alert("Removed logged journal card.");
        return;
      }
      try {
        const docRef = doc(db, "journals", id);
        await updateDoc(docRef, { deleted: true });
        alert("Removed logged journal card.");
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `journals/${id}`);
      }
    }
  };

  const displayEntries = decoyMode ? decoyEntries : entries;
  const activeEntries = displayEntries.filter((e) => !e.deleted);

  // Mood Trend Counter metrics
  const moodAggregation = activeEntries.reduce((acc: { [key: string]: number }, e) => {
    acc[e.mood] = (acc[e.mood] || 0) + 1;
    return acc;
  }, {});

  const filteredEntries = activeEntries.filter((e) => {
    const matchesSearch = e.content.toLowerCase().includes(search.toLowerCase());
    const matchesMood = selectedMoodFilter === "all" || e.mood === selectedMoodFilter;
    return matchesSearch && matchesMood;
  });

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
        `}</style>
        <div className={`bg-slate-900/90 border border-slate-800 rounded-3xl p-6.5 max-w-sm w-full text-center space-y-6 shadow-2xl relative transition-all duration-300 ${
          shouldShake ? "animate-shake border-rose-500/50" : "hover:border-indigo-500/30"
        }`}>
          {/* Header */}
          <div className="space-y-2">
            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/20">
              <BookOpen className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <h3 className="text-base font-bold text-white font-sans tracking-tight">Thoughts Journal</h3>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">🔒 Secure Access Lock</p>
          </div>

          {/* Pin Dots Display */}
          <div className="flex justify-center gap-2.5 py-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-200 ${
                  i < pin.length
                    ? "bg-indigo-500 border-indigo-400 scale-110 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                    : "bg-slate-950 border-slate-800"
                }`}
              />
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-[10px] text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 py-1.5 px-3.5 rounded-xl inline-block">
              {error}
            </div>
          )}

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  if (pin.length < 8) {
                    const nextPin = pin + num;
                    setPin(nextPin);
                    setError("");
                    if (nextPin === "2525") {
                      sessionStorage.setItem("journal_unlocked", "true");
                      sessionStorage.setItem("journal_decoy", "true");
                      setUnlocked(true);
                      setDecoyMode(true);
                      setPin("");
                    } else if (nextPin === "68916002") {
                      sessionStorage.setItem("journal_unlocked", "true");
                      sessionStorage.setItem("journal_decoy", "false");
                      setUnlocked(true);
                      setDecoyMode(false);
                      setPin("");
                    }
                  }
                }}
                className="w-full aspect-square bg-slate-950 hover:bg-indigo-950/20 border border-slate-850 hover:border-indigo-500/30 text-white font-bold text-sm rounded-2xl flex items-center justify-center transition active:scale-95 cursor-pointer font-mono shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPin("");
                setError("");
              }}
              className="w-full aspect-square bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-400 font-bold text-xs rounded-2xl flex items-center justify-center transition active:scale-95 cursor-pointer font-mono"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                if (pin.length < 8) {
                  const nextPin = pin + "0";
                  setPin(nextPin);
                  setError("");
                  if (nextPin === "2525") {
                    sessionStorage.setItem("journal_unlocked", "true");
                    sessionStorage.setItem("journal_decoy", "true");
                    setUnlocked(true);
                    setDecoyMode(true);
                    setPin("");
                  } else if (nextPin === "68916002") {
                    sessionStorage.setItem("journal_unlocked", "true");
                    sessionStorage.setItem("journal_decoy", "false");
                    setUnlocked(true);
                    setDecoyMode(false);
                    setPin("");
                  }
                }
              }}
              className="w-full aspect-square bg-slate-950 hover:bg-indigo-950/20 border border-slate-850 hover:border-indigo-500/30 text-white font-bold text-sm rounded-2xl flex items-center justify-center transition active:scale-95 cursor-pointer font-mono shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                setPin(prev => prev.slice(0, -1));
                setError("");
              }}
              className="w-full aspect-square bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-400 font-bold text-xs rounded-2xl flex items-center justify-center transition active:scale-95 cursor-pointer font-mono"
            >
              Del
            </button>
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={() => handleUnlock(pin)}
            disabled={!pin}
            className="w-full py-3.5 bg-indigo-650 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-2xl transition active:scale-98 cursor-pointer shadow-lg shadow-indigo-600/10"
          >
            Unlock Module
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block block" />
            Module 3 — Thoughts & Mood Journal
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem("journal_unlocked");
                sessionStorage.removeItem("journal_decoy");
                setUnlocked(false);
                setDecoyMode(false);
                setPin("");
              }}
              className="p-1.5 bg-slate-950 border border-slate-850 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
              title="Lock Journal Module"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </button>
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Write, reflect, and track mindfulness logs with attachments support.
          </p>
        </div>
        <button
          onClick={fetchMindfulPrompts}
          disabled={aiLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50 transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {aiLoading ? "Consulting Mind..." : "Suggest Journal Topic"}
        </button>
      </div>

      {/* AI Prompts block */}
      {aiPrompts && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-indigo-200 text-xs space-y-2 animate-fade-in-up shadow-sm">
          <div className="flex items-center gap-2 font-bold text-white uppercase tracking-wider text-2xs">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Custom Writing Prompt recommendation
          </div>
          <p className="leading-relaxed font-mono whitespace-pre-wrap">{aiPrompts}</p>
        </div>
      )}

      {/* Mood aggregates dashboard layout */}
      <div className="grid grid-cols-6 gap-3">
        {MOODS.map((m) => {
          const count = moodAggregation[m.value] || 0;
          return (
            <div
              key={m.value}
              onClick={() => setSelectedMoodFilter(m.value === selectedMoodFilter ? "all" : m.value)}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition ${m.color} ${
                selectedMoodFilter === m.value ? "ring-2 ring-indigo-500 opacity-100 scale-105 shadow-md shadow-indigo-500/10" : "opacity-80 hover:opacity-100"
              }`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-[10px] uppercase font-mono mt-1 text-slate-400">{m.label}</span>
              <span className="text-xs font-bold font-mono text-white mt-0.5">{count} entries</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creation Input Block */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl h-fit shadow-sm">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            {editingEntry ? "Edit Thoughts Entry" : "Record Daily Reflection"}
          </h3>

          <form onSubmit={editingEntry ? (e) => e.preventDefault() : handleSubmit} className="space-y-4">
            
            {/* Input datepicker */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            {/* Mood trigger */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-2 font-mono">Current Mood</label>
              <div className="grid grid-cols-6 gap-1">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMood(m.value)}
                    className={`p-2 rounded-xl text-center border transition cursor-pointer ${
                      mood === m.value
                        ? "bg-slate-800 border-indigo-500 scale-105 shadow-sm"
                        : "bg-transparent border-slate-850 hover:border-slate-700"
                    }`}
                    title={m.label}
                  >
                    <span className="text-lg">{m.emoji}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rich entry content area */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Write Your Thoughts</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 h-44 resize-none leading-relaxed"
                placeholder="What is happening in your life today? Log your thoughts freely. Complete privacy applies..."
                required
              />
            </div>

            {/* Media attachment tools */}
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <span className="block text-2xs text-slate-400 uppercase tracking-wider font-mono">Reflection Attachments</span>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.capture = "environment";
                      input.onchange = async (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setCropImageSrc(reader.result as string);
                            setCropImageName(file.name || "photo.jpg");
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    } catch (err) {
                      alert("Camera access returned error.");
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1 bg-slate-950 py-2 border border-slate-800 text-slate-300 rounded-xl hover:text-white hover:border-indigo-500 transition text-[10px] cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  Capture
                </button>

                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  className={`flex-1 flex items-center justify-center gap-1 bg-slate-950 py-2 border text-slate-300 rounded-xl hover:text-white transition text-[10px] cursor-pointer ${
                    recording ? "border-rose-500 text-rose-400 animate-pulse" : "border-slate-800 hover:border-indigo-500"
                  }`}
                >
                  {recording ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-indigo-400" />}
                  {recording ? "Stop" : "Speak Log"}
                </button>

                <label className="flex-1 flex items-center justify-center gap-1 bg-slate-950 py-2 border border-slate-800 text-slate-300 rounded-xl hover:text-white hover:border-indigo-500 transition text-[10px] cursor-pointer">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Doc
                  <input type="file" onChange={handleDocUpload} accept=".pdf,image/*" className="hidden" />
                </label>
              </div>

              {uploading && (
                <div className="text-[10px] text-indigo-400 font-mono text-center animate-pulse">Uploading asset files...</div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {attachments.map((at, i) => (
                    <div key={i} className="flex items-center gap-1 bg-slate-805 px-2 py-0.5 rounded text-[10px]">
                      <span 
                        onClick={() => setActiveAttachment(at)}
                        className="text-indigo-400 hover:text-indigo-350 hover:underline cursor-pointer truncate max-w-[80px]"
                        title="Click to view attachment"
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

            {formError && (
              <p className="text-[11px] text-rose-455 font-mono text-left bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                ⚠️ {formError}
              </p>
            )}
            {editingEntry ? (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div>
                  <label className="block text-2xs text-rose-400 uppercase tracking-wider mb-1 font-mono">
                    Mandatory Edit Reason
                  </label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    required
                    className="w-full bg-[#0b0f19] border border-rose-500/30 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    placeholder="Describe modification reason..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEditChange}
                    className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs rounded-xl cursor-pointer"
                  >
                    Save Reflection Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEntry(null);
                      setContent("");
                      setAttachments([]);
                    }}
                    className="flex-1 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition text-white font-semibold text-xs rounded-xl cursor-pointer"
              >
                Save Reflection Book Log
              </button>
            )}

          </form>
        </div>

        {/* Search Logs display */}
        <div id="journal-lists" className="lg:col-span-2 space-y-4">
          
          {/* Header query widgets */}
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Query thoughts by date, keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-xs rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Records lists */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:max-h-[600px] lg:overflow-y-auto pr-1 align-start items-start content-start">
            {loading ? (
              <div className="text-center text-xs text-slate-500 font-mono py-12 animate-pulse">Consulting files...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-12 text-center text-xs text-slate-400 rounded-2xl font-mono">
                No matching journal logs discovered.
              </div>
            ) : (
              filteredEntries.map((e) => {
                const moodObj = MOODS.find((m) => m.value === e.mood);
                
                return (
                  <div
                    id={`journal-${e.id}`}
                    key={e.id}
                    className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3 relative hover:border-slate-700 transition shadow-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{moodObj?.emoji || "😐"}</span>
                        <div>
                          <span className="text-xs font-bold text-white font-sans">{e.date}</span>
                          <span className="text-[10px] text-slate-400 font-mono ml-2">({moodObj?.label || "Neutral"})</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => triggerEdit(e)}
                          className="text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-slate-400 hover:text-rose-400 p-0.5 rounded cursor-pointer"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{e.content}</p>

                    {/* Show attachments */}
                    {e.attachments && e.attachments.length > 0 && (
                      <div className="flex gap-2 items-center flex-wrap pt-2 border-t border-slate-800/40">
                        {e.attachments.map((at, i) => (
                          <div key={i} className="flex items-center gap-1">
                            {at.type.startsWith("image/") ? (
                              <img
                                src={at.url}
                                alt="Journal file"
                                referrerPolicy="no-referrer"
                                className="w-12 h-12 object-cover rounded border border-slate-700 hover:scale-105 transition cursor-pointer"
                                onClick={() => setActiveAttachment(at)}
                                title="Click to view photo"
                              />
                            ) : at.type.startsWith("audio/") ? (
                              <button
                                type="button"
                                onClick={() => setActiveAttachment(at)}
                                className="flex items-center gap-1 text-[10px] text-amber-400 bg-slate-800 px-2.5 py-1 rounded cursor-pointer hover:bg-slate-750 transition font-mono border border-slate-700"
                                title="Click to play voice log"
                              >
                                <Mic className="w-3 h-3 text-amber-400" /> Play Audio
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveAttachment(at)}
                                className="flex items-center gap-1 text-[10px] text-cyan-400 bg-slate-800 px-2.5 py-1 rounded cursor-pointer hover:bg-slate-750 transition font-mono border border-slate-700"
                                title="Click to view document"
                              >
                                <FileText className="w-3 h-3 text-cyan-400" /> View Doc
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Audit Trail Modification Display */}
                    {e.editHistory && e.editHistory.length > 0 && (
                      <div className="bg-slate-900/40 p-2.5 rounded-xl text-[9px] font-mono text-slate-400 space-y-1">
                        <div className="flex items-center gap-1 font-bold text-slate-300 font-sans">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          Reflection Modification Audit trail Logs:
                        </div>
                        {e.editHistory.map((h, idx) => (
                          <div key={idx} className="border-l border-rose-500/20 pl-2">
                            <span>{new Date(h.timestamp).toLocaleDateString()}:</span>
                            <span className="text-white ml-1">"{h.reason}"</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
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
              ) : activeAttachment.type.startsWith("audio/") ? (
                <div className="w-full max-w-md bg-slate-900 p-6 rounded-xl border border-slate-800 text-center space-y-4">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto">
                    <Mic className="w-6 h-6 text-indigo-400 animate-pulse" />
                  </div>
                  <p className="text-xs text-slate-350 font-mono">Voice Recording Playback</p>
                  <audio src={activeAttachment.url} controls className="w-full mt-2" autoPlay />
                </div>
              ) : activeAttachment.url.startsWith("data:application/pdf") || activeAttachment.type.includes("pdf") ? (
                <div className="w-full h-[60vh] flex flex-col items-center justify-center gap-4">
                  <iframe
                    src={activeAttachment.url}
                    className="w-full h-full rounded-lg border border-slate-850"
                    title="Document Viewer"
                  />
                  <a
                    href={activeAttachment.url}
                    download={activeAttachment.name}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-755 text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition hover:scale-[1.02]"
                  >
                    <FileText className="w-4 h-4" /> Download PDF Document
                  </a>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <FileText className="w-12 h-12 text-slate-600 mx-auto animate-bounce" />
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

      {cropImageSrc && (
        <ImageCropperModal
          imageSrc={cropImageSrc}
          imageName={cropImageName}
          onCrop={async (croppedFile) => {
            setCropImageSrc("");
            setUploading(true);
            setFormError("");
            try {
              const attach = await handleFileUpload(croppedFile, "journals", croppedFile.name);
              setAttachments((prev) => [...prev, attach]);
            } catch (err: any) {
              console.error("Camera capture error:", err);
              setFormError(err.message || "Failed to process captured image.");
            } finally {
              setUploading(false);
            }
          }}
          onCancel={() => setCropImageSrc("")}
          onRetake={() => {
            setCropImageSrc("");
            // Click visual trigger by triggering a file dialog
            const clickTrigger = document.querySelector("#journal-lists")?.parentElement?.querySelector("button[type='button']");
            if (clickTrigger) (clickTrigger as HTMLElement).click();
          }}
        />
      )}

    </div>
  </div>
);
}
