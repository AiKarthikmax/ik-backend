import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  where,
  getDocs
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useFirebase } from "./FirebaseProvider";
import { Habit, HabitLog } from "../types";
import { Plus, Archive, RefreshCw, Sparkles, Check, Bell, Calendar } from "lucide-react";

export default function HabitTab() {
  const { user } = useFirebase();
  const userId = user?.uid || "family";

  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Form input
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");

  // AI Assistance
  const [coachAdvice, setCoachAdvice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Today Date String
  const todayStr = new Date().toISOString().split("T")[0];

  const loadHabitLogs = async () => {
    if (!userId) return;
    const loadedLogs: HabitLog[] = [];
    const promises = [];
    // Load last 60 days of logs
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const colRef = collection(db, "habitLogs", userId, dateStr);
      
      promises.push(
        getDocs(colRef).then((snapshot) => {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            loadedLogs.push({
              id: `${dateStr}_${docSnap.id}`,
              habitId: docSnap.id,
              date: dateStr,
              completed: data.status === "completed" || data.completed === true,
              status: data.status || (data.completed ? "completed" : "pending")
            } as HabitLog);
          });
        })
      );
    }
    try {
      await Promise.all(promises);
      setLogs(loadedLogs);
    } catch (err) {
      console.error("Error loading habit logs:", err);
    }
  };

  useEffect(() => {
    const qHabit = query(collection(db, "habits"), where("archived", "==", false));
    const unsubscribeHabit = onSnapshot(
      qHabit,
      (snapshot) => {
        const list: Habit[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Habit);
        });
        setHabits(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "habits");
      }
    );

    if (userId) {
      loadHabitLogs();
    }

    return () => {
      unsubscribeHabit();
    };
  }, [userId]);

  // Request browser notification
  const enableNotifications = () => {
    if ("Notification" in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification("Maha Reminders Enabled!", {
            body: "You will now receive daily nudges to log your vital habits.",
            icon: "https://img.icons8.com/fluent/192/000000/finance.png"
          });
        }
      });
    } else {
      alert("Browser notification is not supported on this platform.");
    }
  };

  // Add Habit
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("Habit name is required.");
      return;
    }

    try {
      await addDoc(collection(db, "habits"), {
        name: name.trim(),
        archived: false
      });
      setName("");
      setFormError("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "habits");
    }
  };

  // Set status directly (for 3-state selector)
  const handleSetStatus = async (habitId: string, targetDate: string, newStatus: "completed" | "skipped" | "pending") => {
    // 1. Optimistically update local state
    setLogs((prev) => {
      const filtered = prev.filter((l) => !(l.habitId === habitId && l.date === targetDate));
      return [
        ...filtered,
        {
          id: `${targetDate}_${habitId}`,
          habitId,
          date: targetDate,
          completed: newStatus === "completed",
          status: newStatus
        }
      ];
    });

    try {
      const logRef = doc(db, "habitLogs", userId, targetDate, habitId);
      await setDoc(logRef, {
        status: newStatus,
        completed: newStatus === "completed",
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `habitLogs/${userId}/${targetDate}/${habitId}`);
      // Re-load if fail
      loadHabitLogs();
    }
  };

  // Toggle completion per day (cycles through: completed -> skipped -> pending)
  const handleToggle = async (habitId: string, targetDate: string) => {
    const log = logs.find((l) => l.habitId === habitId && l.date === targetDate);
    const currentStatus = log?.status || "pending";
    let nextStatus: "completed" | "skipped" | "pending" = "completed";
    if (currentStatus === "completed") {
      nextStatus = "skipped";
    } else if (currentStatus === "skipped") {
      nextStatus = "pending";
    }
    await handleSetStatus(habitId, targetDate, nextStatus);
  };

  // Archive Habit
  const handleArchive = async (id: string) => {
    if (confirm("Are you sure you want to archive this goal? Archived habits remain inside logs history.")) {
      try {
        const docRef = doc(db, "habits", id);
        await updateDoc(docRef, { archived: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `habits/${id}`);
      }
    }
  };

  // Ask AI Coaching Advice
  const askCoachingAdvice = async () => {
    setAiLoading(true);
    setCoachAdvice("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "habit",
          payload: {
            habits: habits.map(h => ({ name: h.name })),
            logs: logs.slice(0, 50)
          }
        })
      });
      const data = await response.json();
      setCoachAdvice(data.suggestion);
    } catch (e) {
      console.error(e);
      setCoachAdvice("Nudge: Missed workout logs? Build tiny momentum: replace with an ultra-easy 5-minutes stretches sequence.");
    } finally {
      setAiLoading(false);
    }
  };

  // Calculate Streak count helper
  const calculateStreak = (habitId: string) => {
    let streak = 0;
    let t = new Date();
    while (true) {
      const dateStr = t.toISOString().split("T")[0];
      const log = logs.find((l) => l.habitId === habitId && l.date === dateStr);
      if (log && log.status === "completed") {
        streak++;
        t.setDate(t.getDate() - 1);
      } else if (log && log.status === "skipped") {
        // Skipped doesn't break streak, but doesn't increment
        t.setDate(t.getDate() - 1);
        continue;
      } else {
        // Break streak unless it's just today and they haven't ticked it off yet
        if (dateStr === todayStr) {
          t.setDate(t.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return streak;
  };

  // Calculate completion rates per habit
  const getCompletionRate = (habitId: string) => {
    const relevantLogs = logs.filter((l) => l.habitId === habitId && l.status && l.status !== "pending");
    if (relevantLogs.length === 0) return 0;
    const completed = relevantLogs.filter((l) => l.status === "completed").length;
    return Math.round((completed / relevantLogs.length) * 100);
  };

  // Generate date array for GitHub grid display (last 28 days)
  const getGridDays = () => {
    const list = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      list.push(d.toISOString().split("T")[0]);
    }
    return list;
  };

  const gridDays = getGridDays();

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Tab Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block block" />
            Module 2 — Daily Habit Tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Build compounding consistency through routines auditing and streak tracking.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={enableNotifications}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 cursor-pointer transition"
          >
            <Bell className="w-3.5 h-3.5" />
            Reminders
          </button>
          
          <button
            onClick={askCoachingAdvice}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5 font-bold" />
            {aiLoading ? "Consulting Coach..." : "AI Habit Coach"}
          </button>
        </div>
      </div>

      {/* AI Coach Suggestion */}
      {coachAdvice && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-indigo-200 text-xs space-y-2 animate-fade-in-up shadow-lg">
          <div className="flex items-center gap-2 font-bold text-white uppercase tracking-wider text-2xs">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Weekly Routine Synthesis
          </div>
          <p className="leading-relaxed font-mono whitespace-pre-wrap">{coachAdvice}</p>
        </div>
      )}

      {/* Habits Checklist Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Tracker Form & Checklist */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Add Custom Daily Routine</h3>
            
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workout, Read, Meditate..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 bg-indigo-600 hover:bg-indigo-700 font-semibold text-xs text-white rounded-xl cursor-pointer transition"
              >
                Add
              </button>
            </form>
            {formError && (
              <p className="text-[10px] text-rose-455 font-mono">
                ⚠️ {formError}
              </p>
            )}
          </div>

          {/* Today checklist */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm animate-fade-in-up">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Today's Tasks Checklist</h3>
              <span className="text-[10px] font-mono text-slate-400">{todayStr}</span>
            </div>

            {loading ? (
              <div className="text-center text-xs text-slate-500 font-mono py-6 animate-pulse">Syncing routines database...</div>
            ) : habits.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-6 font-mono">Create custom goals to log consistency.</div>
            ) : (
              <div className="space-y-3">
                {habits.map((h) => {
                  const logToday = logs.find((l) => l.habitId === h.id && l.date === todayStr);
                  const currentStatus = logToday?.status || "pending";
                  return (
                    <div
                      key={h.id}
                      className="flex flex-col gap-2.5 p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-slate-700 transition"
                    >
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-semibold text-slate-200 ${currentStatus === "completed" ? "line-through text-slate-500" : ""}`}>
                          {h.name}
                        </span>
                        <button
                          onClick={() => handleArchive(h.id)}
                          className="text-slate-500 hover:text-amber-400 p-1 rounded hover:bg-slate-900 transition cursor-pointer"
                          title="Archive goal"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex justify-between items-center gap-2 mt-1 pt-2 border-t border-slate-900">
                        <span className="text-[10px] text-slate-500 font-mono">Status:</span>
                        <div className="flex bg-slate-900/50 p-0.5 rounded-lg border border-slate-800 gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetStatus(h.id, todayStr, "completed")}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                              currentStatus === "completed"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetStatus(h.id, todayStr, "skipped")}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                              currentStatus === "skipped"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/20"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            Skip
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetStatus(h.id, todayStr, "pending")}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                              currentStatus === "pending"
                                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/20"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            Pending
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Global Calendar heat grids & completion visualizations */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* GitHub Style Streak Grid */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Consolidated Consistency Heat Map (Past 28 Days)
            </h3>

            <div className="flex gap-2 justify-end mb-2 text-[9px] font-mono text-slate-400 items-center">
              <span>Low</span>
              <div className="w-2.5 h-2.5 bg-slate-800 rounded-sm" />
              <div className="w-2.5 h-2.5 bg-emerald-950 rounded-sm" />
              <div className="w-2.5 h-2.5 bg-emerald-800 rounded-sm" />
              <div className="w-2.5 h-2.5 bg-emerald-50 rounded-sm" />
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm font-bold" />
              <span>High (100%)</span>
            </div>

            {/* Streak Grid Box */}
            <div className="grid grid-cols-7 gap-1.5 max-w-[340px] sm:max-w-none justify-center">
              {gridDays.map((dayStr) => {
                const dayLogs = logs.filter((l) => l.date === dayStr && l.status === "completed");
                const activeCount = habits.length;
                let intensity = "bg-slate-800 border-transparent";

                if (activeCount > 0 && dayLogs.length > 0) {
                  const ratio = dayLogs.length / activeCount;
                  if (ratio <= 0.25) intensity = "bg-emerald-950 border-emerald-900";
                  else if (ratio <= 0.5) intensity = "bg-emerald-800 border-emerald-700";
                  else if (ratio <= 0.75) intensity = "bg-emerald-500 border-emerald-400";
                  else intensity = "bg-emerald-400 border-emerald-300 shadow-[0_0_6px_#34d399]";
                }

                const dObj = new Date(dayStr);
                const numStr = dObj.getDate();

                return (
                  <div
                    key={dayStr}
                    className={`aspect-square w-full rounded flex items-center justify-center text-[8px] font-bold border ${intensity}`}
                    title={`${dayStr}: Completed ${dayLogs.length} of ${activeCount}`}
                  >
                    <span className="text-white/60">{numStr}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 text-[10px] text-slate-400 font-mono text-center">
              GitHub style metrics tracks completion percentiles. Active routines: {habits.length}.
            </div>
          </div>

          {/* Metric details per Habit */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Strength Profiles & Streaks</h3>

            {habits.length === 0 ? (
              <div className="text-center text-xs text-slate-500 font-mono py-4">Add habits to evaluate streaks.</div>
            ) : (
              <div className="space-y-4">
                {habits.map((h) => {
                  const rate = getCompletionRate(h.id);
                  const streak = calculateStreak(h.id);

                  return (
                    <div key={h.id} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-200">{h.name}</span>
                        <div className="space-x-2 text-[10px] font-mono">
                          <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold">Streak: {streak}d</span>
                          <span className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-bold">Consistency: {rate}%</span>
                        </div>
                      </div>

                      {/* Bar indicator */}
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-600 to-emerald-400 transition-all duration-300"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
