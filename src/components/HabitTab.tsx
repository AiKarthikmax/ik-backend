import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  where
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useFirebase } from "./FirebaseProvider";
import { Habit, DailySummary, HabitLog } from "../types";
import {
  Plus, Archive, RefreshCw, Sparkles, Check, Bell, Calendar,
  ChevronLeft, ChevronRight, Flame, Trophy, TrendingUp, Activity,
  Smile, Compass, Brain, Zap, AlertCircle, Edit2, Trash2, Save, X,
  TrendingDown, CheckCircle2, AlertTriangle, Lightbulb, Heart, Clock, Award
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

// Helper to get local date string YYYY-MM-DD
const getLocalDateString = (d: Date = new Date()) => {
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split("T")[0];
};

const getDaysInMonth = (year: number, monthIndex: number) => {
  return new Date(year, monthIndex + 1, 0).getDate();
};

export default function HabitTab() {
  const { user } = useFirebase();
  const userId = user?.uid || "family";

  // Data State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Date Navigation State
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [activeDate, setActiveDate] = useState(todayStr); // Left Panel date
  const [currentMonth, setCurrentMonth] = useState(new Date()); // Center grid month

  // Forms and Modals State
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState("");
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Inline inputs for Checklist
  const [inlineNotes, setInlineNotes] = useState<{ [habitId: string]: string }>({});

  // Analytics Chart Metric Toggle
  const [chartMetric, setChartMetric] = useState<"consistency" | "mood" | "energy">("consistency");
  const [trendRange, setTrendRange] = useState<"7" | "30" | "month">("7");

  // Status mapping functions to support both done/completed and skip/skipped
  const isCompleted = (status?: string) => status === "done" || status === "completed";
  const isSkipped = (status?: string) => status === "skip" || status === "skipped";
  const isPending = (status?: string) => status === "pending" || !status;
  const isPartial = (status?: string) => status === "partial";

  // Listen to Database
  useEffect(() => {
    if (!userId) return;

    // Listen to active habits
    const qHabits = query(collection(db, "habits"), where("archived", "==", false));
    const unsubscribeHabits = onSnapshot(
      qHabits,
      (snapshot) => {
        const list: Habit[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Habit);
        });
        setHabits(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "habits");
      }
    );

    // Listen to daily logs
    const qLogs = collection(db, "habitLogs", userId, "logs");
    const unsubscribeLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const list: DailySummary[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as DailySummary);
        });
        setLogs(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading logs subcollection:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeHabits();
      unsubscribeLogs();
    };
  }, [userId]);

  // Extract active day's summary
  const activeDaySummary = useMemo(() => {
    return logs.find((l) => l.id === activeDate) || {
      id: activeDate,
      updatedAt: "",
      habits: {}
    } as DailySummary;
  }, [logs, activeDate]);

  // Streak calculations per habit
  const calculateStreakForHabit = (habitId: string, dateStr: string = todayStr) => {
    let streak = 0;
    let d = new Date(dateStr);

    while (true) {
      const curDateStr = d.toISOString().split("T")[0];
      const dailyLog = logs.find((l) => l.id === curDateStr);
      const habitDetail = dailyLog?.habits?.[habitId];

      if (habitDetail && isCompleted(habitDetail.status)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (habitDetail && isSkipped(habitDetail.status)) {
        // Skip doesn't break streak, but doesn't increment
        d.setDate(d.getDate() - 1);
        continue;
      } else {
        // Only ignore today if they haven't logged it yet
        if (curDateStr === todayStr && (!habitDetail || isPending(habitDetail.status))) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return streak;
  };

  const calculateBestStreakForHabit = (habitId: string) => {
    const sortedLogs = [...logs].sort((a, b) => a.id.localeCompare(b.id));
    if (sortedLogs.length === 0) return 0;

    let best = 0;
    let current = 0;

    const start = new Date(sortedLogs[0].id);
    const end = new Date();
    let temp = new Date(start);

    while (temp <= end) {
      const curDateStr = temp.toISOString().split("T")[0];
      const dailyLog = logs.find((l) => l.id === curDateStr);
      const habitDetail = dailyLog?.habits?.[habitId];

      if (habitDetail && isCompleted(habitDetail.status)) {
        current++;
        if (current > best) best = current;
      } else if (habitDetail && isSkipped(habitDetail.status)) {
        // skip keeps it going
      } else {
        current = 0;
      }
      temp.setDate(temp.getDate() + 1);
    }
    return best;
  };

  const getCompletionRateForHabit = (habitId: string) => {
    const relevantLogs = logs.filter((l) => l.habits?.[habitId] && !isPending(l.habits?.[habitId]?.status));
    if (relevantLogs.length === 0) return 0;

    const completed = relevantLogs.filter((l) => isCompleted(l.habits?.[habitId]?.status)).length;
    return Math.round((completed / relevantLogs.length) * 100);
  };

  // Actions
  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!formName.trim()) {
      setFormError("Habit name is required.");
      return;
    }
    try {
      await addDoc(collection(db, "habits"), {
        name: formName.trim(),
        archived: false
      });
      setFormName("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "habits");
    }
  };

  const handleEditHabit = async (habitId: string) => {
    if (!editingName.trim()) return;
    try {
      await updateDoc(doc(db, "habits", habitId), { name: editingName.trim() });
      setEditingHabitId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `habits/${habitId}`);
    }
  };

  const handleArchiveHabit = async (habitId: string) => {
    if (confirm("Are you sure you want to archive this routine? Archived habits remain in logs history.")) {
      try {
        await updateDoc(doc(db, "habits", habitId), { archived: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `habits/${habitId}`);
      }
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    if (confirm("⚠️ WARNING: Deleting this routine will remove it completely. Proceed?")) {
      try {
        await deleteDoc(doc(db, "habits", habitId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `habits/${habitId}`);
      }
    }
  };

  const handleSetStatus = async (
    habitId: string,
    targetDate: string,
    newStatus: "done" | "skip" | "pending" | "partial",
    note?: string
  ) => {
    try {
      const logRef = doc(db, "habitLogs", userId, "logs", targetDate);
      const computedStreak = calculateStreakForHabit(habitId, targetDate);

      // Fetch or build the specific habit detail update
      const existingDetail = logs.find((l) => l.id === targetDate)?.habits?.[habitId];
      const habitDetail = {
        status: newStatus,
        note: note !== undefined ? note : (existingDetail?.note || ""),
        completedAt: newStatus === "done" ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        streak: newStatus === "done" ? Math.max(1, computedStreak) : 0
      };

      await setDoc(
        logRef,
        {
          updatedAt: new Date().toISOString(),
          habits: {
            [habitId]: habitDetail
          }
        },
        { merge: true }
      );

      // Update state local note cache
      if (note !== undefined) {
        setInlineNotes((prev) => ({ ...prev, [habitId]: note }));
      }
    } catch (error) {
      console.error("Error setting habit status:", error);
    }
  };

  const handleUpdateVitals = async (field: "mood" | "energy" | "dailyNote", value: any) => {
    try {
      const logRef = doc(db, "habitLogs", userId, "logs", activeDate);
      await setDoc(
        logRef,
        {
          [field]: value,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error setting vital:", error);
    }
  };

  // Excel-style cell click cycling
  const handleCellClick = async (habitId: string, cellDateStr: string) => {
    const dailyLog = logs.find((l) => l.id === cellDateStr);
    const curStatus = dailyLog?.habits?.[habitId]?.status || "pending";

    let nextStatus: "done" | "skip" | "partial" | "pending" = "done";
    if (isCompleted(curStatus)) {
      nextStatus = "skip";
    } else if (isSkipped(curStatus)) {
      nextStatus = "partial";
    } else if (isPartial(curStatus)) {
      nextStatus = "pending";
    }

    await handleSetStatus(habitId, cellDateStr, nextStatus);
    setActiveDate(cellDateStr); // sync Checklist tab instantly
  };

  // Enable Notification permission
  const enableNotifications = () => {
    if ("Notification" in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification("iK Reminders Enabled!", {
            body: "You will now receive premium notifications to log your daily routines.",
            icon: "https://img.icons8.com/fluent/192/000000/finance.png"
          });
        }
      });
    } else {
      alert("Browser notifications are not supported on this device.");
    }
  };

  // Monthly statistics
  const monthlyStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);

    const now = new Date();
    let daysToCount = daysInMonth;
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
    if (isCurrentMonth) {
      daysToCount = now.getDate();
    } else if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth())) {
      daysToCount = 0; // Future Month
    }

    let completed = 0;
    let skipped = 0;
    let partial = 0;
    const totalTrackedCells = habits.length * daysToCount;

    for (let dNum = 1; dNum <= daysToCount; dNum++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
      const dailyLog = logs.find((l) => l.id === dateStr);
      if (dailyLog?.habits) {
        Object.entries(dailyLog.habits as Record<string, any>).forEach(([habitId, detail]) => {
          if (habits.some((h) => h.id === habitId)) {
            if (isCompleted(detail.status)) completed++;
            else if (isSkipped(detail.status)) skipped++;
            else if (isPartial(detail.status)) partial++;
          }
        });
      }
    }

    const rate = totalTrackedCells > 0 ? Math.round((completed / totalTrackedCells) * 100) : 0;
    const streakRate = totalTrackedCells > 0 ? Math.round(((completed + skipped) / totalTrackedCells) * 100) : 0;

    return {
      rate,
      streakRate,
      completed,
      skipped,
      partial,
      totalTrackedCells
    };
  }, [logs, habits, currentMonth]);

  // 30 Days Heatmap calculations
  const heatmapDays = useMemo(() => {
    const arr = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(d.toISOString().split("T")[0]);
    }
    return arr;
  }, []);

  const getHeatmapColor = (dateStr: string) => {
    const dailyLog = logs.find((l) => l.id === dateStr);
    if (!dailyLog?.habits || habits.length === 0) return "bg-slate-900 border-slate-800/40";

    let completedCount = 0;
    Object.entries(dailyLog.habits as Record<string, any>).forEach(([habitId, detail]) => {
      if (habits.some((h) => h.id === habitId) && isCompleted(detail.status)) {
        completedCount++;
      }
    });

    const ratio = completedCount / habits.length;
    if (ratio === 0) return "bg-slate-900 border-slate-800/40 hover:border-slate-700";
    if (ratio <= 0.25) return "bg-emerald-950/60 border-emerald-900/30 hover:border-emerald-800";
    if (ratio <= 0.5) return "bg-emerald-800/60 border-emerald-700/40 hover:border-emerald-600";
    if (ratio <= 0.75) return "bg-emerald-600 border-emerald-500/50 hover:border-emerald-400";
    return "bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.3)] hover:scale-105";
  };

  // Streak cards and strong/weak habit analytics
  const streakAnalytics = useMemo(() => {
    if (habits.length === 0) {
      return {
        current: 0,
        best: 0,
        weeklyConsistency: 0,
        strongestHabit: "None",
        weakestHabit: "None"
      };
    }

    const strengths = habits.map((h) => ({
      name: h.name,
      currentStreak: calculateStreakForHabit(h.id),
      bestStreak: calculateBestStreakForHabit(h.id),
      rate: getCompletionRateForHabit(h.id)
    }));

    const maxCurrent = Math.max(...strengths.map((s) => s.currentStreak), 0);
    const maxBest = Math.max(...strengths.map((s) => s.bestStreak), 0);

    // Weekly consistency (last 7 days)
    let weeklyCompleted = 0;
    const weeklyTotal = habits.length * 7;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dailyLog = logs.find((l) => l.id === dateStr);
      if (dailyLog?.habits) {
        Object.entries(dailyLog.habits as Record<string, any>).forEach(([habitId, detail]) => {
          if (habits.some((h) => h.id === habitId) && isCompleted(detail.status)) {
            weeklyCompleted++;
          }
        });
      }
    }
    const weeklyConsistency = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

    // Strongest/Weakest
    const sortedStrengths = [...strengths].sort((a, b) => b.rate - a.rate);
    const strongestHabit = sortedStrengths[0]?.rate > 0 ? `${sortedStrengths[0].name} (${sortedStrengths[0].rate}%)` : "None";
    const weakestHabit = sortedStrengths[sortedStrengths.length - 1]?.rate < 100 ? `${sortedStrengths[sortedStrengths.length - 1].name} (${sortedStrengths[sortedStrengths.length - 1].rate}%)` : "None";

    return {
      current: maxCurrent,
      best: maxBest,
      weeklyConsistency,
      strongestHabit,
      weakestHabit
    };
  }, [logs, habits]);

  // Smart insights generator
  const smartInsights = useMemo(() => {
    const list = [];
    if (habits.length === 0 || logs.length === 0) return ["Log routines daily to unlock premium AI insights."];

    const stats = habits.map((h) => ({
      id: h.id,
      name: h.name,
      rate: getCompletionRateForHabit(h.id)
    }));

    const weakest = [...stats].sort((a, b) => a.rate - b.rate)[0];
    if (weakest && weakest.rate < 50) {
      list.push(`Most skipped habit: ${weakest.name} (${100 - weakest.rate}% missing). Try building small momentum.`);
    }

    const strongest = [...stats].sort((a, b) => b.rate - a.rate)[0];
    if (strongest && strongest.rate > 70) {
      list.push(`Best performing habit: ${strongest.name} with ${strongest.rate}% consistency.`);
    }

    // Weekend skips verification
    if (weakest) {
      let weekendSkips = 0;
      let weekdaySkips = 0;
      logs.forEach((l) => {
        const detail = l.habits?.[weakest.id];
        if (detail && isSkipped(detail.status)) {
          const day = new Date(l.id).getDay();
          if (day === 0 || day === 6) weekendSkips++;
          else weekdaySkips++;
        }
      });
      if (weekendSkips > weekdaySkips) {
        list.push(`You usually skip ${weakest.name} on weekends. Try setting a weekend reminder!`);
      }
    }

    // Sleep patterns check
    let sleepSkipsCount = 0;
    logs.forEach((l) => {
      if (l.habits) {
        Object.values(l.habits as Record<string, any>).forEach((detail) => {
          if (isSkipped(detail.status) && detail.note) {
            const noteLower = detail.note.toLowerCase();
            if (noteLower.includes("sleep") || noteLower.includes("late") || noteLower.includes("tired") || noteLower.includes("overslept")) {
              sleepSkipsCount++;
            }
          }
        });
      }
    });
    if (sleepSkipsCount >= 2) {
      list.push("You miss habits after sleeping late or feeling tired. Focus on sleep hygiene.");
    }

    // Month over month progress comparison
    const now = new Date();
    const thisMonthLogs = logs.filter((l) => {
      const d = new Date(l.id);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const lastMonthLogs = logs.filter((l) => {
      const d = new Date(l.id);
      let lm = now.getMonth() - 1;
      let ly = now.getFullYear();
      if (lm < 0) { lm = 11; ly--; }
      return d.getMonth() === lm && d.getFullYear() === ly;
    });

    const getAvg = (mLogs: DailySummary[]) => {
      if (mLogs.length === 0 || habits.length === 0) return 0;
      let done = 0;
      mLogs.forEach((l) => {
        if (l.habits) {
          Object.entries(l.habits as Record<string, any>).forEach(([hId, detail]) => {
            if (habits.some((h) => h.id === hId) && isCompleted(detail.status)) {
              done++;
            }
          });
        }
      });
      return done / (mLogs.length * habits.length);
    };

    const thisMonthRate = getAvg(thisMonthLogs);
    const lastMonthRate = getAvg(lastMonthLogs);

    if (thisMonthLogs.length > 0 && lastMonthLogs.length > 0) {
      if (thisMonthRate > lastMonthRate) {
        list.push(`Consistency improved by ${Math.round((thisMonthRate - lastMonthRate) * 100)}% compared to last month.`);
      } else if (thisMonthRate < lastMonthRate) {
        list.push(`Consistency dropped by ${Math.round((lastMonthRate - thisMonthRate) * 100)}% compared to last month.`);
      }
    }

    if (list.length === 0) {
      list.push("Consistency looks solid! Build a daily streak of completed routines.");
    }

    return list;
  }, [logs, habits]);

  // Recharts Trend Data formatter
  const trendData = useMemo(() => {
    let daysCount = 7;
    if (trendRange === "30") daysCount = 30;
    else if (trendRange === "month") {
      daysCount = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
    }

    const list = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      let d;
      if (trendRange === "month") {
        d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), daysCount - i);
      } else {
        d = new Date();
        d.setDate(d.getDate() - i);
      }

      const dateStr = d.toISOString().split("T")[0];
      const dailyLog = logs.find((l) => l.id === dateStr);

      let completedCount = 0;
      if (dailyLog?.habits) {
        Object.entries(dailyLog.habits as Record<string, any>).forEach(([habitId, detail]) => {
          if (habits.some((h) => h.id === habitId) && isCompleted(detail.status)) {
            completedCount++;
          }
        });
      }

      const rate = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0;
      list.push({
        date: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        "Completion %": rate,
        Mood: dailyLog?.mood || 0,
        Energy: dailyLog?.energy || 0
      });
    }
    return list;
  }, [logs, habits, trendRange, currentMonth]);

  // Pie chart progress data
  const pieData = useMemo(() => {
    const completed = monthlyStats.completed;
    const total = monthlyStats.totalTrackedCells;
    const missed = Math.max(0, total - completed);

    return [
      { name: "Completed", value: completed, color: "#10b981" },
      { name: "Pending/Missed", value: missed, color: "#334155" }
    ];
  }, [monthlyStats]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  const handleCurrentMonth = () => {
    setCurrentMonth(new Date());
  };

  // Date step helpers for Left Panel Checklist
  const handlePrevDay = () => {
    const d = new Date(activeDate);
    d.setDate(d.getDate() - 1);
    setActiveDate(d.toISOString().split("T")[0]);
  };
  const handleNextDay = () => {
    const d = new Date(activeDate);
    d.setDate(d.getDate() + 1);
    setActiveDate(d.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* ─── Top Banner ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
            Routines & Habits Module
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
        </div>
      </div>

      {/* ─── Main 3-Column Dashboard Layout ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* ==========================================
            LEFT PANEL: DAILY HABIT CHECKLIST (3/12 cols)
            ========================================== */}
        <section className="xl:col-span-3 space-y-4">
          
          {/* Add Habit card */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
              <Plus className="w-4 h-4 text-indigo-400" /> Add Custom Routine
            </h3>
            <form onSubmit={handleAddHabit} className="flex gap-2">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Yoga, Read 10 pages, Gym..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Add
              </button>
            </form>
            {formError && <p className="text-[10px] text-rose-500 font-mono">⚠️ {formError}</p>}
          </div>

          {/* Checklist Date selection card */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" /> Daily Checklist
              </h3>
              
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800/80">
                <button
                  onClick={handlePrevDay}
                  className="p-1 hover:text-indigo-400 transition cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-300 select-none">
                  {activeDate === todayStr ? "Today" : activeDate}
                </span>
                <button
                  onClick={handleNextDay}
                  className="p-1 hover:text-indigo-400 transition cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-xs text-slate-500 py-10 animate-pulse font-mono">
                Syncing routine logs...
              </div>
            ) : habits.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-10 font-mono">
                No habits configured. Add one above!
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {habits.map((h) => {
                  const detail = activeDaySummary.habits?.[h.id];
                  const status = detail?.status || "pending";
                  const noteValue = inlineNotes[h.id] !== undefined ? inlineNotes[h.id] : (detail?.note || "");
                  const isEditing = editingHabitId === h.id;

                  return (
                    <div
                      key={h.id}
                      className="bg-slate-950 border border-slate-850 hover:border-slate-700/80 rounded-xl p-3.5 transition space-y-3"
                    >
                      {/* Habit Name / Edit Rename */}
                      <div className="flex justify-between items-start gap-2">
                        {isEditing ? (
                          <div className="flex gap-1.5 flex-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleEditHabit(h.id)}
                              className="p-1 text-emerald-400 hover:bg-slate-900 rounded cursor-pointer"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingHabitId(null)}
                              className="p-1 text-rose-400 hover:bg-slate-900 rounded cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1">
                            <h4 className="text-xs font-bold text-slate-200 leading-tight">
                              {h.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.2 rounded-md flex items-center gap-0.5 select-none">
                                <Flame className="w-3 h-3 fill-amber-500" />
                                {calculateStreakForHabit(h.id, activeDate)}d Streak
                              </span>
                              {detail?.completedAt && (
                                <span className="text-[9px] font-mono text-slate-500 select-none">
                                  {new Date(detail.completedAt).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-0.5">
                          <button
                            onClick={() => {
                              setEditingHabitId(h.id);
                              setEditingName(h.name);
                            }}
                            className="p-1 text-slate-500 hover:text-indigo-400 hover:bg-slate-900 rounded transition cursor-pointer"
                            title="Rename"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleArchiveHabit(h.id)}
                            className="p-1 text-slate-500 hover:text-amber-500 hover:bg-slate-900 rounded transition cursor-pointer"
                            title="Archive"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteHabit(h.id)}
                            className="p-1 text-slate-500 hover:text-rose-500 hover:bg-slate-900 rounded transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Status selectors */}
                      <div className="grid grid-cols-3 gap-1 bg-slate-900/60 p-0.5 rounded-xl border border-slate-850/80">
                        <button
                          type="button"
                          onClick={() => handleSetStatus(h.id, activeDate, "done")}
                          className={`py-1 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            isCompleted(status)
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-md shadow-emerald-500/5"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <Check className="w-3 h-3" /> Done
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatus(h.id, activeDate, "skip")}
                          className={`py-1 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            isSkipped(status)
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/25 shadow-md shadow-rose-500/5"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <X className="w-3 h-3" /> Skip
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatus(h.id, activeDate, "pending")}
                          className={`py-1 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            isPending(status)
                              ? "bg-slate-800 text-slate-300 border border-slate-700/40"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <Clock className="w-3 h-3" /> Pending
                        </button>
                      </div>

                      {/* Optional inline note area */}
                      {isCompleted(status) && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">
                            Done Note (Optional)
                          </label>
                          <input
                            type="text"
                            value={noteValue}
                            onChange={(e) => handleSetStatus(h.id, activeDate, "done", e.target.value)}
                            placeholder="Woke up at 4:15 AM, chest day..."
                            className="w-full bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-500/45 placeholder-slate-600"
                          />
                        </div>
                      )}

                      {/* Optional Skip reason note */}
                      {isSkipped(status) && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono text-rose-500/80 uppercase tracking-wide">
                            Why today pannala?
                          </label>
                          <input
                            type="text"
                            value={noteValue}
                            onChange={(e) => handleSetStatus(h.id, activeDate, "skip", e.target.value)}
                            placeholder="Tired, Travel, Overslept, Not well..."
                            className="w-full bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-rose-500/45 placeholder-slate-600"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ==========================================
            CENTER PANEL: GRID + CHART + VITALS (6/12 cols)
            ========================================== */}
        <section className="xl:col-span-6 space-y-4">
          
          {/* Charts section */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" /> Completion Trend & Vitals Graph
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Visualize routines correlation over time</p>
              </div>

              {/* Tabs metric toggles */}
              <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800/80 gap-0.5">
                {[
                  { key: "consistency", label: "Consistency" },
                  { key: "mood", label: "Mood" },
                  { key: "energy", label: "Energy" }
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setChartMetric(m.key as any)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-bold cursor-pointer transition ${
                      chartMetric === m.key
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Days range toggles */}
              <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800/80 gap-0.5">
                {[
                  { key: "7", label: "7D" },
                  { key: "30", label: "30D" },
                  { key: "month", label: "Month" }
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setTrendRange(m.key as any)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold cursor-pointer transition ${
                      trendRange === m.key
                        ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20"
                        : "text-slate-500 hover:text-slate-350"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts Area Chart container */}
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartMetric === "consistency" ? "#6366f1" : chartMetric === "mood" ? "#e11d48" : "#eab308"} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartMetric === "consistency" ? "#6366f1" : chartMetric === "mood" ? "#e11d48" : "#eab308"} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#475569" fontSize={8} tickLine={false} />
                  <YAxis
                    stroke="#475569"
                    fontSize={8}
                    tickLine={false}
                    domain={[0, chartMetric === "consistency" ? 100 : 10]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f111c",
                      borderColor: "#1e293b",
                      borderRadius: "12px",
                      fontSize: "10px",
                      color: "#f8fafc"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric === "consistency" ? "Completion %" : chartMetric === "mood" ? "Mood" : "Energy"}
                    stroke={chartMetric === "consistency" ? "#6366f1" : chartMetric === "mood" ? "#e11d48" : "#eab308"}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorMetric)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Excel Style tracker grid */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-400" /> Excel Habits grid
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Click cells to cycle status Done (Green) ➔ Skip (Red) ➔ Partial (Yellow) ➔ Pending (Gray)</p>
              </div>

              {/* Month navigation */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-850">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 hover:text-indigo-400 transition cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCurrentMonth}
                  className="px-2 py-0.5 text-[9px] font-bold text-slate-400 hover:text-white transition cursor-pointer select-none"
                  title="Go to Today"
                >
                  {currentMonth.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1 hover:text-indigo-400 transition cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Grid Container */}
            {habits.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-10 font-mono">
                No active routines to display in Excel grid.
              </div>
            ) : (
              <div className="overflow-x-auto select-none">
                <table className="w-full border-collapse">
                  <thead>
                    {/* Week headers */}
                    <tr className="text-[9px] font-mono text-slate-500">
                      <th className="p-1 text-left min-w-[90px] border-r border-slate-800 sticky left-0 bg-slate-900 z-10">Week</th>
                      <th colSpan={7} className="text-center border border-slate-800 bg-slate-950/20">Week 1</th>
                      <th colSpan={7} className="text-center border border-slate-800 bg-slate-950/20">Week 2</th>
                      <th colSpan={7} className="text-center border border-slate-800 bg-slate-950/20">Week 3</th>
                      <th colSpan={7} className="text-center border border-slate-800 bg-slate-950/20">Week 4</th>
                      <th colSpan={getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth()) - 28} className="text-center border border-slate-800 bg-slate-950/20">Week 5</th>
                    </tr>
                    {/* Days row */}
                    <tr className="text-[9px] font-bold font-mono text-slate-400 border-b border-slate-800">
                      <th className="p-1 text-left min-w-[90px] border-r border-slate-800 sticky left-0 bg-slate-900 z-10">Habit</th>
                      {Array.from({ length: getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth()) }).map((_, i) => {
                        const dayNum = i + 1;
                        const wDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNum).toLocaleDateString("en-IN", { weekday: "narrow" });
                        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                        const isToday = dateStr === todayStr;
                        return (
                          <th
                            key={dayNum}
                            className={`p-1 text-center border-r border-slate-800/40 min-w-[20px] ${
                              isToday ? "bg-indigo-600/10 text-indigo-400 font-black border-t border-t-indigo-500/20" : ""
                            }`}
                          >
                            <div>{dayNum}</div>
                            <div className="text-[7px] opacity-60 font-semibold">{wDay}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {habits.map((h) => (
                      <tr key={h.id} className="border-b border-slate-800/40 hover:bg-slate-950/40 group">
                        {/* Habit name header cell */}
                        <td className="p-1.5 text-[10px] font-bold text-slate-350 sticky left-0 bg-slate-900 z-10 border-r border-slate-800 group-hover:bg-slate-950 transition max-w-[110px] truncate">
                          {h.name}
                        </td>
                        {/* 31 days cells */}
                        {Array.from({ length: getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth()) }).map((_, i) => {
                          const dayNum = i + 1;
                          const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          const dailyLog = logs.find((l) => l.id === dateStr);
                          const habitDetail = dailyLog?.habits?.[h.id];
                          const status = habitDetail?.status || "pending";

                          let cellColor = "bg-slate-800/40 hover:bg-slate-750 border-slate-800/50";
                          if (isCompleted(status)) cellColor = "bg-emerald-500/25 border-emerald-500/25 shadow-[0_0_6px_rgba(16,185,129,0.1)]";
                          else if (isSkipped(status)) cellColor = "bg-rose-500/25 border-rose-500/25";
                          else if (isPartial(status)) cellColor = "bg-amber-500/20 border-amber-500/25";

                          // Build custom title for cell hover details
                          let titleStr = "Pending";
                          if (isCompleted(status)) {
                            titleStr = `✓ Done\n${habitDetail?.note ? `Note: "${habitDetail.note}"\n` : ""}Time: ${habitDetail?.completedAt ? new Date(habitDetail.completedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "-"}`;
                          } else if (isSkipped(status)) {
                            titleStr = `✗ Skipped\n${habitDetail?.note ? `Reason: "${habitDetail.note}"` : ""}`;
                          } else if (isPartial(status)) {
                            titleStr = `⏳ Partially Done\n${habitDetail?.note ? `Details: "${habitDetail.note}"` : ""}`;
                          }

                          return (
                            <td
                              key={dayNum}
                              onClick={() => handleCellClick(h.id, dateStr)}
                              className={`p-0.5 text-center border-r border-slate-800/40 cursor-pointer`}
                              title={titleStr}
                            >
                              <div className={`w-5 h-5 mx-auto rounded-md border text-[9px] font-bold flex items-center justify-center transition-all active:scale-90 ${cellColor}`}>
                                {isCompleted(status) && <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3]" />}
                                {isSkipped(status) && <X className="w-2.5 h-2.5 text-rose-400 stroke-[3]" />}
                                {isPartial(status) && <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom vital tracking: Mood + Energy */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500/25 animate-pulse" /> Daily Vitals Tracker ({activeDate})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Track mood and energy to monitor emotional correlation to routine productivity</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Mood 1-10 Buttons */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Rate Your Mood</span>
                  <span className="text-rose-400 font-mono">{activeDaySummary.mood || "Not Logged"} / 10</span>
                </div>
                <div className="flex justify-between gap-1 p-1 bg-slate-950 rounded-xl border border-slate-850">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const moodVal = i + 1;
                    const isSelected = activeDaySummary.mood === moodVal;
                    return (
                      <button
                        key={moodVal}
                        onClick={() => handleUpdateVitals("mood", moodVal)}
                        className={`flex-1 aspect-square rounded-lg text-[10px] font-bold transition flex items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-rose-600 text-white shadow-md shadow-rose-500/10 font-black scale-105"
                            : "bg-transparent text-slate-500 hover:text-slate-350"
                        }`}
                      >
                        {moodVal}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Energy 1-10 Buttons */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Rate Your Energy Level</span>
                  <span className="text-amber-400 font-mono">{activeDaySummary.energy || "Not Logged"} / 10</span>
                </div>
                <div className="flex justify-between gap-1 p-1 bg-slate-950 rounded-xl border border-slate-850">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const energyVal = i + 1;
                    const isSelected = activeDaySummary.energy === energyVal;
                    return (
                      <button
                        key={energyVal}
                        onClick={() => handleUpdateVitals("energy", energyVal)}
                        className={`flex-1 aspect-square rounded-lg text-[10px] font-bold transition flex items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10 font-black scale-105"
                            : "bg-transparent text-slate-500 hover:text-slate-350"
                        }`}
                      >
                        {energyVal}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Daily note reflections */}
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">
                Daily Reflection Note (Optional)
              </label>
              <textarea
                value={activeDaySummary.dailyNote || ""}
                onChange={(e) => handleUpdateVitals("dailyNote", e.target.value)}
                placeholder="Felt incredibly productive, woke up on time, Chest workout went great..."
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/40 placeholder-slate-700 min-h-[50px] resize-y"
              />
            </div>
          </div>

        </section>

        {/* ==========================================
            RIGHT PANEL: ANALYTICS DASHBOARD (3/12 cols)
            ========================================== */}
        <section className="xl:col-span-3 space-y-4">
          
          {/* Monthly progress ring */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider w-full pb-2 border-b border-slate-800/60 mb-2 flex items-center gap-1">
              <Trophy className="w-4 h-4 text-amber-500" /> Monthly Progress
            </h3>

            {/* Recharts PieChart Ring */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={56}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={0}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute flex flex-col items-center select-none">
                <span className="text-2xl font-black text-white leading-none">
                  {monthlyStats.rate}%
                </span>
                <span className="text-[8px] font-mono text-slate-500 mt-1 uppercase tracking-wider font-bold">
                  Completed
                </span>
              </div>
            </div>

            {/* Statistics details */}
            <div className="grid grid-cols-2 gap-3 w-full mt-3 pt-3 border-t border-slate-800/60 text-center font-mono">
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-850">
                <div className="text-xs font-bold text-white">{monthlyStats.completed}</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Completed</div>
              </div>
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-850">
                <div className="text-xs font-bold text-rose-400">{monthlyStats.skipped}</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Skipped</div>
              </div>
            </div>
          </div>

          {/* GitHub style heatmap */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" /> Consistency Map
            </h3>

            {/* Grid heatmap */}
            <div className="grid grid-cols-6 gap-2 justify-center">
              {heatmapDays.map((dStr) => {
                const parts = dStr.split("-");
                const dayNum = parts[2];
                const monthName = new Date(dStr).toLocaleDateString("en-IN", { month: "short" });

                const dailyLog = logs.find((l) => l.id === dStr);
                const isLogged = dailyLog?.habits && Object.keys(dailyLog.habits).length > 0;

                return (
                  <div
                    key={dStr}
                    className={`aspect-square w-full rounded-lg flex flex-col items-center justify-center border text-[9px] font-mono cursor-default transition-all ${getHeatmapColor(dStr)}`}
                    title={`${dStr}: ${isLogged ? "Logged" : "No entry"}`}
                  >
                    <span className="text-[7px] opacity-40 font-bold select-none">{monthName}</span>
                    <span className="text-white font-bold leading-none">{dayNum}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3.5 flex justify-between text-[9px] font-mono text-slate-500 items-center">
              <span>Low Consistency</span>
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 bg-slate-900 border border-slate-800/40 rounded" />
                <div className="w-2.5 h-2.5 bg-emerald-950 border border-emerald-900/30 rounded" />
                <div className="w-2.5 h-2.5 bg-emerald-800 border border-emerald-700/40 rounded" />
                <div className="w-2.5 h-2.5 bg-emerald-650 border border-emerald-500/50 rounded" />
                <div className="w-2.5 h-2.5 bg-emerald-400 border border-emerald-300 rounded shadow-[0_0_4px_#34d399]" />
              </div>
              <span>100%</span>
            </div>
          </div>

          {/* Streak Cards */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800/60 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-indigo-400" /> Consistency Metrics
            </h3>

            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <div className="text-base font-black text-amber-500 flex items-center justify-center gap-0.5">
                  <Flame className="w-4 h-4 fill-amber-500 stroke-none" />
                  {streakAnalytics.current}d
                </div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-1">Current Streak</div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <div className="text-base font-black text-indigo-400 flex items-center justify-center gap-0.5">
                  <Trophy className="w-4 h-4 text-indigo-400 stroke-[2.5]" />
                  {streakAnalytics.best}d
                </div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-1">Best Streak</div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <div className="text-sm font-black text-emerald-400">{streakAnalytics.weeklyConsistency}%</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-1">Weekly Const.</div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <div className="text-sm font-black text-white">{monthlyStats.rate}%</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-1">Monthly Completion</div>
              </div>
            </div>

            <div className="space-y-2 mt-2 pt-2 border-t border-slate-800/60">
              <div className="flex justify-between items-center text-[10px] font-sans">
                <span className="text-slate-400 font-medium">⭐ Strongest Routine:</span>
                <span className="font-bold text-slate-200 text-right truncate max-w-[130px]">{streakAnalytics.strongestHabit}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-sans">
                <span className="text-slate-400 font-medium">⚠ Weakest Routine:</span>
                <span className="font-bold text-rose-400 text-right truncate max-w-[130px]">{streakAnalytics.weakestHabit}</span>
              </div>
            </div>
          </div>

          {/* Smart Insights Panel */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800/60 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-yellow-500" /> Smart Insights
            </h3>

            <ul className="space-y-2 text-[10px] text-slate-350 leading-relaxed font-medium">
              {smartInsights.map((insight, idx) => (
                <li key={idx} className="flex gap-2 items-start">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

        </section>

      </div>
    </div>
  );
}
