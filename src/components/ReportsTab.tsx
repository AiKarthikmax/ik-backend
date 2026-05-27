import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Transaction, Habit, HabitLog, JournalEntry, GratitudeLog, Loan, TempLoan, FormalLoan } from "../types";
import { generatePDF } from "../pdfGenerator";
import {
  Download, Upload, FileText, Database, RefreshCw,
  Calendar, CalendarDays, TrendingUp, LayoutGrid, Clock
} from "lucide-react";

type ReportType = "transactions" | "habits" | "journal" | "gratitude" | "loans" | "tempLoans" | "formalLoans" | "overall";

const REPORT_OPTIONS: { value: ReportType; label: string; desc: string }[] = [
  { value: "overall",      label: "Overall Portfolio",         desc: "Complete financial health snapshot" },
  { value: "transactions", label: "Transaction Ledger",        desc: "All income & expense entries" },
  { value: "habits",       label: "Habits & Routines",         desc: "Daily habit completion report" },
  { value: "journal",      label: "Personal Journal",          desc: "Thoughts & mood entries" },
  { value: "gratitude",    label: "Gratitude Legacy",          desc: "Daily thankfulness logs" },
  { value: "loans",        label: "Thavanai EMIs",             desc: "Installment debt registry" },
  { value: "tempLoans",    label: "Friend Loans",              desc: "Borrowed & lent money tracker" },
  { value: "formalLoans",  label: "Bank / Gold Loans",         desc: "Formal loan portfolio" },
];

type QuickFilter = "today" | "week" | "month" | "year" | "custom";

function getQuickDates(filter: QuickFilter): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (filter === "today") return { start: today, end: today };

  if (filter === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { start: d.toISOString().split("T")[0], end: today };
  }

  if (filter === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: d.toISOString().split("T")[0], end: today };
  }

  if (filter === "year") {
    return { start: `${now.getFullYear()}-01-01`, end: today };
  }

  return { start: "", end: "" }; // custom
}

export default function ReportsTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [gratitudes, setGratitudes] = useState<GratitudeLog[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [tempLoans, setTempLoans] = useState<TempLoan[]>([]);
  const [formalLoans, setFormalLoans] = useState<FormalLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [reportType, setReportType] = useState<ReportType>("overall");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Apply quick filter dates
  useEffect(() => {
    if (quickFilter !== "custom") {
      const { start, end } = getQuickDates(quickFilter);
      setStartDate(start);
      setEndDate(end);
    }
  }, [quickFilter]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [transSnap, habitSnap, habitLogsSnap, journalSnap, gratSnap, loansSnap, tempSnap, formalSnap] = await Promise.all([
        getDocs(collection(db, "transactions")),
        getDocs(collection(db, "habits")),
        getDocs(collection(db, "habitLogs")),
        getDocs(collection(db, "journals")),
        getDocs(collection(db, "gratitude")),
        getDocs(collection(db, "loans")),
        getDocs(collection(db, "tempLoans")),
        getDocs(collection(db, "formalLoans")),
      ]);

      const parse = <T,>(snap: any): T[] => {
        const arr: T[] = [];
        snap.forEach((d: any) => arr.push({ id: d.id, ...d.data() } as T));
        return arr;
      };

      setTransactions(parse<Transaction>(transSnap));
      setHabits(parse<Habit>(habitSnap));
      setHabitLogs(parse<HabitLog>(habitLogsSnap));
      setJournals(parse<JournalEntry>(journalSnap));
      setGratitudes(parse<GratitudeLog>(gratSnap));
      setLoans(parse<Loan>(loansSnap));
      setTempLoans(parse<TempLoan>(tempSnap));
      setFormalLoans(parse<FormalLoan>(formalSnap));
      setLastRefresh(new Date());
    } catch (e) {
      console.warn("Could not fetch data for reports:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Get record counts for preview
  const getRecordCount = (): number => {
    const sd = startDate;
    const ed = endDate;
    const filter = (date: string) => {
      if (sd && date < sd) return false;
      if (ed && date > ed) return false;
      return true;
    };
    switch (reportType) {
      case "transactions": return transactions.filter(t => !t.deleted && filter(t.date)).length;
      case "habits":       return habits.length;
      case "journal":      return journals.filter(j => !j.deleted && filter(j.date)).length;
      case "gratitude":    return gratitudes.filter(g => filter(g.date)).length;
      case "loans":        return loans.length;
      case "tempLoans":    return tempLoans.length;
      case "formalLoans":  return formalLoans.length;
      default:             return transactions.filter(t => !t.deleted).length;
    }
  };

  const handlePdfGeneration = async () => {
    setGenerating(true);
    try {
      const sd = startDate;
      const ed = endDate;
      const dateFilter = (date: string) => {
        if (sd && date < sd) return false;
        if (ed && date > ed) return false;
        return true;
      };

      const filteredTrans = transactions.filter(t => dateFilter(t.date));
      const filteredJournals = journals.filter(j => dateFilter(j.date));
      const filteredGratitudes = gratitudes.filter(g => dateFilter(g.date));
      const packedHabits = habits.map(h => ({
        habit: h,
        logs: habitLogs.filter(l => l.habitId === h.id && dateFilter(l.date))
      }));

      // Small async delay to allow "generating" state to render
      await new Promise(r => setTimeout(r, 50));

      generatePDF(reportType, {
        transactions: filteredTrans,
        habits: packedHabits,
        journals: filteredJournals,
        gratitudes: filteredGratitudes,
        loans,
        tempLoans,
        formalLoans,
        dateRange: sd && ed ? { start: sd, end: ed } : undefined
      });
    } finally {
      setGenerating(false);
    }
  };

  const triggerExportBackup = () => {
    const backup = {
      transactions, habits, habitLogs, journals,
      gratitude: gratitudes, loans, tempLoans, formalLoans,
      backupTimestamp: new Date().toISOString()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `ik_backup_${new Date().toISOString().split("T")[0]}.json`);
    a.click();
    alert("✅ Backup JSON downloaded successfully!");
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("⚠️ RESTORE WARNING: This will add entries from the backup into your current data. Proceed?")) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const collections: [string, any[]][] = [
          ["transactions", parsed.transactions || []],
          ["habits", parsed.habits || []],
          ["habitLogs", parsed.habitLogs || []],
          ["journals", parsed.journals || []],
          ["gratitude", parsed.gratitude || []],
          ["loans", parsed.loans || []],
          ["tempLoans", parsed.tempLoans || []],
          ["formalLoans", parsed.formalLoans || []],
        ];
        for (const [colName, items] of collections) {
          for (const item of items) {
            const { id, ...data } = item;
            await addDoc(collection(db, colName), data);
          }
        }
        alert("✅ Database restoration complete!");
        window.location.reload();
      } catch {
        alert("❌ Invalid backup file.");
      }
    };
    reader.readAsText(file);
  };

  const selectedReport = REPORT_OPTIONS.find(r => r.value === reportType);
  const recordCount = getRecordCount();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm animate-fade-in-up">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
              Reports & Data Export
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">Generate detailed PDF reports and manage data backups</p>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-indigo-500/40 text-slate-400 hover:text-indigo-400 text-xs font-mono rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>
        {lastRefresh && (
          <p className="text-[10px] text-slate-600 font-mono mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last loaded: {lastRefresh.toLocaleTimeString("en-IN")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* PDF Generator Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* Report Type Grid */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
              Select Report Type
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {REPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setReportType(opt.value)}
                  className={`p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                    reportType === opt.value
                      ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-400"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  <div className="text-xs font-bold leading-tight">{opt.label}</div>
                  <div className="text-[9px] mt-0.5 opacity-70 leading-tight">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Date Filters */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
              Date Filter
            </h3>

            {/* Quick filter pills */}
            <div className="flex flex-wrap gap-2">
              {([
                { key: "today", label: "Today" },
                { key: "week",  label: "Last 7 Days" },
                { key: "month", label: "This Month" },
                { key: "year",  label: "This Year" },
                { key: "custom",label: "Custom" },
              ] as { key: QuickFilter; label: string }[]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(f.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    quickFilter === f.key
                      ? "bg-indigo-600/25 border-indigo-500/50 text-indigo-400"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {quickFilter === "custom" && (
              <div className="grid grid-cols-2 gap-3 animate-fade-in-up">
                <div>
                  <label className="block text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* Period summary */}
            {startDate && endDate && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                <Calendar className="w-3 h-3 text-indigo-400" />
                {startDate} → {endDate}
                <span className="ml-auto text-indigo-400 font-bold">{recordCount} records</span>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handlePdfGeneration}
            disabled={generating || loading}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-98 transition-all font-bold text-sm text-white rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xl shadow-indigo-500/15"
          >
            {generating ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Generating PDF...</>
            ) : (
              <><Download className="w-4 h-4" /> Download {selectedReport?.label} PDF</>
            )}
          </button>
        </div>

        {/* Backup & Recovery */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-5 flex flex-col">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              Data Backup & Recovery
            </h3>
            <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
              Export a complete backup JSON of all your data, or restore from a previous backup file.
            </p>
          </div>

          {/* Stats preview */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Transactions", count: transactions.filter(t => !t.deleted).length },
              { label: "Habits",       count: habits.length },
              { label: "Journals",     count: journals.filter(j => !j.deleted).length },
              { label: "Friend Loans", count: tempLoans.length },
            ].map(s => (
              <div key={s.label} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-center">
                <div className="text-base font-black text-white">{s.count}</div>
                <div className="text-[9px] text-slate-500 font-mono">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 mt-auto">
            <button
              onClick={triggerExportBackup}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-indigo-400 hover:text-white border border-slate-800 hover:border-indigo-500/40 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Backup JSON
            </button>

            <label className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/30 rounded-xl text-slate-400 hover:text-amber-300 text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5">
              <Upload className="w-4 h-4" />
              Restore from JSON
              <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
            </label>
          </div>
        </div>

      </div>
    </div>
  );
}
