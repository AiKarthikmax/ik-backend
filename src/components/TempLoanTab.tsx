import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  runTransaction,
  writeBatch,
  getDocs,
  getDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { TempLoan, TempLoanPayment } from "../types";
import { generatePDF, generateFriendLoanPDF } from "../pdfGenerator";
import { useFirebase } from "./FirebaseProvider";
import {
  Plus, ArrowDownLeft, ArrowUpRight, FileText, User, Clock, Calendar,
  ChevronDown, ChevronUp, Check, AlertCircle, Trash2, RotateCcw, Lock, X
} from "lucide-react";
import ConfirmModal from "./ConfirmModal";

export default function TempLoanTab() {
  const { online } = useFirebase();
  const [tempLoans, setTempLoans] = useState<TempLoan[]>([]);
  const [archivedLoans, setArchivedLoans] = useState<TempLoan[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation tabs: active vs archive
  const [viewMode, setViewMode] = useState<"active" | "archive">("active");
  const [activeSubTab, setActiveSubTab] = useState<"borrowed" | "lent">("lent");

  // Form state
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dateBorrowed, setDateBorrowed] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [loanDirection, setLoanDirection] = useState<"borrowed" | "lent">("lent");
  const [formError, setFormError] = useState("");

  // Subcollection payments state
  const [loanPayments, setLoanPayments] = useState<Record<string, TempLoanPayment[]>>({});
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);

  // 4-Step Smart Payment Modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentLoanId, setPaymentLoanId] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState(1);
  const [paymentType, setPaymentType] = useState<"full" | "partial">("partial");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm modal state for New Entry
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<Omit<TempLoan, "id"> | null>(null);

  const todayStr = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const nowISO = new Date().toISOString();

  // Active loans subscription
  useEffect(() => {
    const q = query(collection(db, "tempLoans"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TempLoan[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as TempLoan);
        });
        list.sort((a, b) => b.dateBorrowed.localeCompare(a.dateBorrowed));
        setTempLoans(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "tempLoans");
      }
    );
    return () => unsubscribe();
  }, []);

  // Archived loans subscription
  useEffect(() => {
    const q = query(collection(db, "archived_tempLoans"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TempLoan[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as TempLoan);
        });
        list.sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || "") || b.dateBorrowed.localeCompare(a.dateBorrowed));
        setArchivedLoans(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "archived_tempLoans");
      }
    );
    return () => unsubscribe();
  }, []);

  // Subcollection payments subscription when loan is expanded
  useEffect(() => {
    if (!expandedLoan) return;
    const isActive = tempLoans.some((l) => l.id === expandedLoan);
    const collPath = isActive ? "tempLoans" : "archived_tempLoans";
    const q = query(collection(db, collPath, expandedLoan, "payments"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TempLoanPayment[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as TempLoanPayment);
        });
        list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || b.date.localeCompare(a.date));
        setLoanPayments((prev) => ({ ...prev, [expandedLoan]: list }));
      },
      (error) => {
        console.error("Error fetching subcollection payments:", error);
      }
    );
    return () => unsubscribe();
  }, [expandedLoan, tempLoans]);

  // Archive loan move helper
  const archiveTempLoan = async (loanId: string, loanData: any) => {
    const batch = writeBatch(db);
    const archivedRef = doc(db, "archived_tempLoans", loanId);
    batch.set(archivedRef, {
      ...loanData,
      archivedAt: new Date().toISOString()
    });

    const paymentsSnap = await getDocs(collection(db, "tempLoans", loanId, "payments"));
    paymentsSnap.forEach((pDoc) => {
      const archivedPaymentRef = doc(db, "archived_tempLoans", loanId, "payments", pDoc.id);
      batch.set(archivedPaymentRef, pDoc.data());
      
      const activePaymentRef = doc(db, "tempLoans", loanId, "payments", pDoc.id);
      batch.delete(activePaymentRef);
    });

    const activeRef = doc(db, "tempLoans", loanId);
    batch.delete(activeRef);
    await batch.commit();
  };

  // Soft Delete Active Loan (moves to archive with status: "deleted")
  const handleDeleteLoan = async (loanId: string) => {
    if (!confirm("Are you sure you want to archive this record (Soft Delete)?")) return;
    try {
      const loanRef = doc(db, "tempLoans", loanId);
      const snap = await getDoc(loanRef);
      if (snap.exists()) {
        const data = snap.data();
        await archiveTempLoan(loanId, {
          ...data,
          status: "deleted",
          updatedAt: new Date().toISOString()
        });
        alert("Record soft-deleted and moved to Archive.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tempLoans/${loanId}`);
    }
  };

  // Restore Loan (moves back to active with status: "live")
  const handleRestoreLoan = async (loanId: string) => {
    if (!confirm("Restore this record back to active tracking?")) return;
    try {
      const archivedRef = doc(db, "archived_tempLoans", loanId);
      const snap = await getDoc(archivedRef);
      if (snap.exists()) {
        const data = snap.data();
        const batch = writeBatch(db);
        const activeRef = doc(db, "tempLoans", loanId);
        
        batch.set(activeRef, {
          ...data,
          status: "live",
          archivedAt: null,
          archiveReason: null,
          updatedAt: new Date().toISOString()
        });

        const paymentsSnap = await getDocs(collection(db, "archived_tempLoans", loanId, "payments"));
        paymentsSnap.forEach((pDoc) => {
          const activePaymentRef = doc(db, "tempLoans", loanId, "payments", pDoc.id);
          batch.set(activePaymentRef, pDoc.data());

          const archivedPaymentRef = doc(db, "archived_tempLoans", loanId, "payments", pDoc.id);
          batch.delete(archivedPaymentRef);
        });

        batch.delete(archivedRef);
        await batch.commit();
        alert("Record restored successfully.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `archived_tempLoans/${loanId}`);
    }
  };

  // Permanent Hard Delete from Archive (Requires PIN 2525)
  const handlePermanentDelete = async (loanId: string) => {
    const pin = prompt("Enter Security PIN to confirm permanent delete:");
    if (pin !== "2525") {
      alert("Incorrect PIN. Action blocked.");
      return;
    }

    try {
      const batch = writeBatch(db);
      const paymentsSnap = await getDocs(collection(db, "archived_tempLoans", loanId, "payments"));
      paymentsSnap.forEach((pDoc) => {
        const archivedPaymentRef = doc(db, "archived_tempLoans", loanId, "payments", pDoc.id);
        batch.delete(archivedPaymentRef);
      });

      const archivedRef = doc(db, "archived_tempLoans", loanId);
      batch.delete(archivedRef);

      await batch.commit();
      alert("Record permanently deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `archived_tempLoans/${loanId}`);
    }
  };

  // Filtered lists for view modes
  const activeLoansList = tempLoans.filter((l) => l.status === "live");
  const archivedLoansList = archivedLoans;

  const borrowedLoans = (viewMode === "active" ? activeLoansList : archivedLoansList).filter(
    (l) => l.loanDirection === "borrowed"
  );
  const lentLoans = (viewMode === "active" ? activeLoansList : archivedLoansList).filter(
    (l) => l.loanDirection === "lent" || !l.loanDirection
  );
  const displayLoans = activeSubTab === "borrowed" ? borrowedLoans : lentLoans;

  // Outstanding amounts calculations
  const totalBorrowedRem = activeLoansList
    .filter((l) => l.loanDirection === "borrowed")
    .reduce((sum, l) => sum + (l.remainingAmount !== undefined ? l.remainingAmount : l.amount), 0);

  const totalLentRem = activeLoansList
    .filter((l) => l.loanDirection === "lent" || !l.loanDirection)
    .reduce((sum, l) => sum + (l.remainingAmount !== undefined ? l.remainingAmount : l.amount), 0);

  // Form submission with confirm modal
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!personName.trim()) {
      setFormError("Friend's name is required.");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("Amount must be greater than 0.");
      return;
    }
    const payload: Omit<TempLoan, "id"> = {
      loanDirection,
      personName: personName.trim(),
      amount: Number(amount),
      remainingAmount: Number(amount),
      description: description.trim() || (loanDirection === "borrowed" ? "Money Borrowed from Friend" : "Money Lent to Friend"),
      dateBorrowed,
      timeBorrowed: nowTime,
      dueDate: dueDate.trim() || undefined,
      payments: [],
      status: "live",
      createdAt: nowISO,
      updatedAt: nowISO
    };
    setPendingFormData(payload);
    setConfirmOpen(true);
  };

  const cleanPayload = (obj: any) => {
    const cleaned = { ...obj };
    Object.keys(cleaned).forEach((key) => {
      if (cleaned[key] === undefined) {
        delete cleaned[key];
      }
    });
    return cleaned;
  };

  const handleConfirmSave = async () => {
    if (!pendingFormData) return;
    setConfirmOpen(false);
    try {
      const payloadToWrite = cleanPayload(pendingFormData);
      await addDoc(collection(db, "tempLoans"), payloadToWrite);
      setPersonName("");
      setAmount("");
      setDescription("");
      setDueDate("");
      setFormError("");
      setPendingFormData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "tempLoans");
    }
  };

  // Smart Repayment Modal Submission (via transaction)
  const handlePaymentSubmit = async () => {
    if (!paymentLoanId) return;
    if (!online) {
      alert("⚠️ Repayment cannot be logged while offline. A stable internet connection is required to complete this secure transaction.");
      return;
    }
    setIsSubmitting(true);
    try {
      const loanRef = doc(db, "tempLoans", paymentLoanId);
      await runTransaction(db, async (transaction) => {
        const loanSnap = await transaction.get(loanRef);
        if (!loanSnap.exists()) {
          throw new Error("Loan document does not exist!");
        }
        const loanData = loanSnap.data();
        const principal = Number(loanData.amount);
        const currentRemaining = loanData.remainingAmount !== undefined ? Number(loanData.remainingAmount) : principal;
        const payAmt = Number(paymentAmount);
        
        const nextRemaining = Math.max(0, currentRemaining - payAmt);
        const isNowClosed = nextRemaining <= 0;

        transaction.update(loanRef, {
          remainingAmount: nextRemaining,
          status: isNowClosed ? "closed" : "live",
          updatedAt: nowISO
        });

        const paymentRef = doc(collection(db, "tempLoans", paymentLoanId, "payments"));
        transaction.set(paymentRef, {
          id: paymentRef.id,
          date: todayStr,
          time: nowTime,
          amount: payAmt,
          description: paymentDescription.trim() || (paymentType === "full" ? "Full Repayment" : "Partial Payment"),
          type: paymentType,
          remainingAfter: nextRemaining,
          createdAt: nowISO
        });
      });

      // Post-transaction check for archiving closed loans
      const updatedSnap = await getDoc(loanRef);
      if (updatedSnap.exists()) {
        const data = updatedSnap.data();
        if (data.status === "closed") {
          await archiveTempLoan(paymentLoanId, data);
          alert("Payment logged! Loan fully paid off & moved to Archive.");
        } else {
          alert(`Payment logged! Remaining balance: ₹${data.remainingAmount.toLocaleString()}`);
        }
      }

      setPaymentModalOpen(false);
      setPaymentLoanId(null);
      setPaymentStep(1);
      setPaymentAmount("");
      setPaymentDescription("");
    } catch (error) {
      console.error("Transaction failed: ", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      alert(`Repayment failed: ${errMsg}\n\nPlease check your internet connection or console logs.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDueDateStatus = (dueDate?: string) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: `Overdue by ${Math.abs(diffDays)}d`, color: "text-rose-400 bg-rose-500/10 border-rose-500/30", pulse: true };
    if (diffDays <= 7) return { label: `Due in ${diffDays}d`, color: "text-amber-400 bg-amber-500/10 border-amber-500/30", pulse: true };
    return { label: `Due ${dueDate}`, color: "text-slate-400 bg-slate-800 border-slate-700", pulse: false };
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm animate-fade-in-up">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
              Friend Money Tracker
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">Track money you borrowed from or lent to friends</p>
          </div>
          <button
            onClick={() => generatePDF("tempLoans", { tempLoans })}
            className="px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700 text-xs rounded-xl flex items-center gap-1.5 hover:text-white hover:border-indigo-500/40 transition shadow-sm cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            Export All PDF
          </button>
        </div>
      </div>

      {/* Main View Switcher (Active Tracker vs Archive Registry) */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-2xl gap-1">
        <button
          onClick={() => setViewMode("active")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            viewMode === "active" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Active Tracker
        </button>
        <button
          onClick={() => setViewMode("archive")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            viewMode === "archive" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🗂️ Archive Registry
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
            activeSubTab === "borrowed" ? "bg-rose-950/30 border-rose-500/40" : "bg-slate-900 border-slate-800 hover:border-rose-500/30"
          }`}
          onClick={() => setActiveSubTab("borrowed")}
        >
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownLeft className="w-4 h-4 text-rose-400" />
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">I Owe (Borrowed)</span>
          </div>
          <span className="text-2xl font-black text-rose-400">₹ {totalBorrowedRem.toLocaleString()}</span>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            {activeLoansList.filter((l) => l.loanDirection === "borrowed").length} active entries
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
            activeSubTab === "lent" ? "bg-emerald-950/30 border-emerald-500/40" : "bg-slate-900 border-slate-800 hover:border-emerald-500/30"
          }`}
          onClick={() => setActiveSubTab("lent")}
        >
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Owed to Me (Lent)</span>
          </div>
          <span className="text-2xl font-black text-emerald-400">₹ {totalLentRem.toLocaleString()}</span>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            {activeLoansList.filter((l) => l.loanDirection === "lent" || !l.loanDirection).length} active entries
          </div>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-2xl gap-1">
        <button
          onClick={() => setActiveSubTab("lent")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 ${
            activeSubTab === "lent"
              ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          I Lent (They Owe Me)
        </button>
        <button
          onClick={() => setActiveSubTab("borrowed")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 ${
            activeSubTab === "borrowed"
              ? "bg-rose-600/20 text-rose-400 border border-rose-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          I Borrowed (I Owe Them)
        </button>
      </div>

      <div className="list-left-layout">
        {/* Loan List (Left Panel) */}
        <div className="left-panel space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              {activeSubTab === "lent" ? (
                <><ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> {viewMode === "active" ? "Money I Lent" : "Archived Lent Records"}</>
              ) : (
                <><ArrowDownLeft className="w-3.5 h-3.5 text-rose-400" /> {viewMode === "active" ? "Money I Borrowed" : "Archived Borrowed Records"}</>
              )}
              <span className="ml-1 text-slate-500 font-mono">({displayLoans.length})</span>
            </h3>
          </div>

          {loading ? (
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center">
              <span className="text-xs font-mono text-slate-500 animate-pulse">Loading entries...</span>
            </div>
          ) : displayLoans.length === 0 ? (
            <div className="bg-slate-900 p-12 rounded-2xl border border-slate-800 text-center">
              <div className="text-3xl mb-3">{activeSubTab === "lent" ? "🤝" : "💸"}</div>
              <span className="text-xs font-mono text-slate-400">
                No {activeSubTab === "lent" ? "lending" : "borrowing"} records yet.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 align-start items-start content-start">
              {displayLoans.map((loan) => {
                const outstandingRem = loan.remainingAmount !== undefined ? loan.remainingAmount : loan.amount;
                const totalRepaid = Math.max(0, loan.amount - outstandingRem);
                const progressPct = Math.min(100, Math.round((totalRepaid / loan.amount) * 100));
                const dueSt = getDueDateStatus(loan.dueDate);
                const isExpanded = expandedLoan === loan.id;
                const isLent = loan.loanDirection === "lent" || !loan.loanDirection;

                // Load payments locally or from subcollection
                const payments = loanPayments[loan.id] || [];

                return (
                  <div
                    key={loan.id}
                    id={`temp-${loan.id}`}
                    className={`bg-slate-900 border rounded-2xl p-4 transition-all duration-300 space-y-3 shadow-sm ${
                      loan.status === "live"
                        ? isLent
                          ? "border-slate-800 hover:border-emerald-500/30"
                          : "border-slate-800 hover:border-rose-500/30"
                        : "border-slate-800 opacity-75"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${isLent ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                          <User className={`w-4 h-4 ${isLent ? "text-emerald-400" : "text-rose-400"}`} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{loan.personName}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-slate-500 font-mono">
                              {loan.dateBorrowed}{loan.timeBorrowed ? " · " + loan.timeBorrowed : ""}
                            </span>
                            {dueSt && (
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${dueSt.color} ${dueSt.pulse ? "animate-pulse" : ""}`}>
                                {dueSt.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {loan.status === "closed" ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold font-mono uppercase">✓ PAID</span>
                        ) : loan.status === "deleted" ? (
                          <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded font-bold font-mono uppercase">🗑️ DELETED</span>
                        ) : (
                          <span className={`text-[9px] font-mono tracking-wider px-2 py-0.5 rounded font-black ${isLent ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"} animate-pulse`}>
                            ACTIVE
                          </span>
                        )}
                        <button
                          onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                          className="text-slate-500 hover:text-white transition"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {loan.description && (
                      <p className="text-[11px] text-slate-400 italic">"{loan.description}"</p>
                    )}

                    {/* Amount Grid */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                      <div>
                        <span className="text-[9px] text-slate-500 font-mono block">ORIGINAL</span>
                        <span className="text-sm font-black text-white block mt-0.5">₹{loan.amount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-mono block">{isLent ? "RETURNED" : "PAID BACK"}</span>
                        <span className="text-sm font-black text-emerald-400 block mt-0.5">₹{totalRepaid.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-mono block">REMAINING</span>
                        <span className={`text-sm font-black block mt-0.5 ${outstandingRem > 0 ? (isLent ? "text-amber-400" : "text-rose-400") : "text-emerald-400"}`}>
                          ₹{outstandingRem.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-slate-500">
                        <span>Repayment Progress</span>
                        <span>{progressPct}% complete</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isLent ? "bg-emerald-500" : "bg-rose-500"}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Expanded: Payment History + Individual PDF */}
                    {isExpanded && (
                      <div className="space-y-3 pt-2 border-t border-slate-800 animate-fade-in-up">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Payment History</span>
                          <button
                            onClick={() => generateFriendLoanPDF({ ...loan, payments })}
                            className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-mono px-2 py-1 bg-indigo-500/10 rounded-lg border border-indigo-500/20 transition cursor-pointer"
                          >
                            <FileText className="w-3 h-3" /> PDF Report
                          </button>
                        </div>

                        {payments && payments.length > 0 ? (
                          <div className="space-y-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                            {payments.map((p, pIdx) => (
                              <div key={p.id || pIdx} className="flex justify-between items-start text-[10px] font-mono border-b border-slate-800/40 last:border-0 pb-1.5 last:pb-0">
                                <div>
                                  <span className="text-slate-300">{p.date}</span>
                                  {p.time && <span className="text-slate-600 ml-1">· {p.time}</span>}
                                  <span className="text-slate-500 ml-2">— {p.description || "Payment"}</span>
                                </div>
                                <span className="text-emerald-400 font-bold ml-2">+₹{p.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-600 font-mono text-center py-2">No payments recorded yet.</div>
                        )}
                      </div>
                    )}

                    {/* Actions Panel */}
                    <div className="pt-2 border-t border-slate-800 flex gap-2">
                      {viewMode === "active" ? (
                        <>
                          <button
                            onClick={() => {
                              setPaymentLoanId(loan.id);
                              setPaymentStep(1);
                              setPaymentAmount("");
                              setPaymentDescription("");
                              setPaymentModalOpen(true);
                            }}
                            className={`flex-1 py-1.5 font-bold text-[11px] rounded-xl cursor-pointer transition border ${
                              isLent
                                ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400"
                                : "bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {isLent ? "💰 Record Return Payment" : "💸 Record Repayment"}
                          </button>
                          <button
                            onClick={() => handleDeleteLoan(loan.id)}
                            className="p-2 bg-slate-800 border border-slate-700 hover:border-rose-500/30 hover:text-rose-400 rounded-xl cursor-pointer text-slate-400 transition"
                            title="Soft Delete / Archive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRestoreLoan(loan.id)}
                            className="flex-1 py-1.5 font-bold text-[11px] rounded-xl cursor-pointer transition bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Restore Account
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(loan.id)}
                            className="p-2 bg-slate-800 border border-slate-700 hover:border-rose-500/30 hover:text-rose-400 rounded-xl cursor-pointer text-slate-400 transition flex items-center justify-center gap-1"
                            title="Permanently Delete"
                          >
                            <Trash2 className="w-4 h-4 text-rose-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Entry Form (Right Panel, Only visible in Active mode) */}
        {viewMode === "active" ? (
          <div className="right-panel bg-slate-900 border border-slate-800 p-5 rounded-2xl h-fit shadow-sm">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-400" />
              Add New Entry
            </h3>

            <form onSubmit={handleSubmitForm} className="space-y-3.5">
              {/* Direction toggle */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
                <button
                  type="button"
                  onClick={() => setLoanDirection("lent")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    loanDirection === "lent"
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ArrowUpRight className="w-3 h-3" /> I Lent
                </button>
                <button
                  type="button"
                  onClick={() => setLoanDirection("borrowed")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    loanDirection === "borrowed"
                      ? "bg-rose-600/20 text-rose-400 border border-rose-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ArrowDownLeft className="w-3 h-3" /> I Borrowed
                </button>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">
                  {loanDirection === "lent" ? "Friend's Name (Borrower)" : "Friend's Name (Lender)"}
                </label>
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="e.g. Anand Kumar"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">
                  {loanDirection === "lent" ? "Amount Lent (₹)" : "Amount Borrowed (₹)"}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Description / Purpose</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Emergency help, event expenses..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 h-14 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    <Calendar className="w-3 h-3 inline mr-1" />Date
                  </label>
                  <input
                    type="date"
                    value={dateBorrowed}
                    onChange={(e) => setDateBorrowed(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">
                    <Clock className="w-3 h-3 inline mr-1" />Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-rose-500 text-xs font-semibold mt-1">{formError}</p>
              )}

              <button
                type="submit"
                className={`w-full py-2.5 text-white font-bold text-xs rounded-xl cursor-pointer shadow-lg transition active:scale-95 ${
                  loanDirection === "lent"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-500/10"
                }`}
              >
                {loanDirection === "lent" ? "➕ Record Money Lent" : "➕ Record Money Borrowed"}
              </button>
            </form>
          </div>
        ) : (
          <div className="right-panel bg-slate-900 border border-slate-800 p-5 rounded-2xl h-fit shadow-sm text-slate-400 text-xs leading-relaxed space-y-3 font-mono">
            <div className="flex items-center gap-1.5 text-white font-bold uppercase tracking-wider text-2xs">
              <Lock className="w-4 h-4 text-indigo-400" /> Secure Archived Vault
            </div>
            <p>
              This section contains closed accounts and soft-deleted financial trackers.
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-[10px]">
              <li>Paid loans are moved here for tax & history verification.</li>
              <li>Archived items can be restored to active tracking at any time.</li>
              <li>Permanent deletion requires verification of security PIN <span className="text-white bg-slate-800 px-1 py-0.5 rounded font-bold">2525</span>.</li>
            </ul>
          </div>
        )}
      </div>

      {/* 4-Step Smart Payment Modal */}
      {paymentModalOpen && paymentLoanId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl shadow-black/80 animate-scale-in text-slate-200">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Record Repayment</h3>
                <p className="text-[10px] text-slate-400 font-mono">Step {paymentStep} of 4</p>
              </div>
              <button
                onClick={() => {
                  setPaymentModalOpen(false);
                  setPaymentStep(1);
                  setPaymentAmount("");
                  setPaymentDescription("");
                }}
                className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="h-1 bg-slate-800 my-4 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${(paymentStep / 4) * 100}%` }}
              />
            </div>

            {/* Step Contents */}
            <div className="space-y-4 min-h-[160px]">
              {!online && (
                <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Repayments cannot be logged offline. Internet connection required.</span>
                </div>
              )}
              {paymentStep === 1 && (
                <div className="space-y-3">
                  <label className="block text-2xs text-slate-400 uppercase tracking-widest font-mono">Select Payment Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType("partial");
                        setPaymentStep(2);
                      }}
                      className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                        paymentType === "partial" ? "bg-indigo-600/10 border-indigo-500/50 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="font-bold text-xs uppercase">Partial Repayment</span>
                      <span className="text-[9px] text-slate-500">Pay a custom amount</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType("full");
                        const loan = tempLoans.find((l) => l.id === paymentLoanId);
                        if (loan) {
                          const remaining = loan.remainingAmount !== undefined ? loan.remainingAmount : loan.amount;
                          setPaymentAmount(remaining.toString());
                        }
                        setPaymentStep(2);
                      }}
                      className={`p-4 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                        paymentType === "full" ? "bg-indigo-600/10 border-indigo-500/50 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="font-bold text-xs uppercase">Full Repayment</span>
                      <span className="text-[9px] text-slate-500">Pay off remaining balance</span>
                    </button>
                  </div>
                </div>
              )}

              {paymentStep === 2 && (
                <div className="space-y-3">
                  <label className="block text-2xs text-slate-400 uppercase tracking-widest font-mono">Specify Amount (₹)</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center font-mono">
                    <span className="text-[10px] text-slate-500 block">REMAINING OUTSTANDING</span>
                    <span className="text-lg font-black text-rose-400 block mt-0.5">
                      ₹{(tempLoans.find((l) => l.id === paymentLoanId)?.remainingAmount !== undefined
                        ? tempLoans.find((l) => l.id === paymentLoanId)?.remainingAmount
                        : tempLoans.find((l) => l.id === paymentLoanId)?.amount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <input
                      type="number"
                      value={paymentAmount}
                      disabled={paymentType === "full"}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Amount (₹)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              {paymentStep === 3 && (
                <div className="space-y-3">
                  <label className="block text-2xs text-slate-400 uppercase tracking-widest font-mono">Reason / Note (Required)</label>
                  <div>
                    <input
                      type="text"
                      value={paymentDescription}
                      onChange={(e) => setPaymentDescription(e.target.value)}
                      placeholder="e.g. Paid via GPay, Cash returned"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {paymentStep === 4 && (
                <div className="space-y-3">
                  <label className="block text-2xs text-slate-400 uppercase tracking-widest font-mono">Confirm Details</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">PAYING AMOUNT:</span>
                      <span className="text-emerald-400 font-black">₹{Number(paymentAmount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">BALANCE AFTER:</span>
                      <span className="text-white font-bold">
                        ₹{Math.max(0, (
                          (tempLoans.find((l) => l.id === paymentLoanId)?.remainingAmount !== undefined
                            ? tempLoans.find((l) => l.id === paymentLoanId)?.remainingAmount
                            : tempLoans.find((l) => l.id === paymentLoanId)?.amount || 0)
                          - Number(paymentAmount)
                        )).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">DESCRIPTION:</span>
                      <span className="text-slate-300 font-medium truncate max-w-[180px]">{paymentDescription || "—"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-2.5 mt-6 pt-4 border-t border-slate-800">
              {paymentStep > 1 && (
                <button
                  onClick={() => setPaymentStep((prev) => prev - 1)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Back
                </button>
              )}
              
              {paymentStep < 4 ? (
                <button
                  onClick={() => {
                    if (paymentStep === 2) {
                      const payAmt = Number(paymentAmount);
                      const maxAmt = (tempLoans.find((l) => l.id === paymentLoanId)?.remainingAmount !== undefined
                        ? tempLoans.find((l) => l.id === paymentLoanId)?.remainingAmount
                        : tempLoans.find((l) => l.id === paymentLoanId)?.amount || 0);
                      if (!paymentAmount || payAmt <= 0) {
                        alert("Please enter a valid amount!");
                        return;
                      }
                      if (payAmt > maxAmt) {
                        alert(`Amount cannot exceed outstanding balance of ₹${maxAmt}!`);
                        return;
                      }
                    }
                    if (paymentStep === 3 && !paymentDescription.trim()) {
                      alert("Description note is required!");
                      return;
                    }
                    setPaymentStep((prev) => prev + 1);
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer text-center"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handlePaymentSubmit}
                  disabled={isSubmitting || !online}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? "Processing..." : "Confirm & Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm: New Entry */}
      {pendingFormData && (
        <ConfirmModal
          isOpen={confirmOpen && !!pendingFormData}
          title={pendingFormData.loanDirection === "lent" ? "Confirm Lending Entry" : "Confirm Borrowing Entry"}
          message={`Are you sure you want to save this ${pendingFormData.loanDirection === "lent" ? "lending" : "borrowing"} record?`}
          details={[
            { label: "Person", value: pendingFormData.personName },
            { label: "Amount", value: `₹ ${Number(pendingFormData.amount).toLocaleString()}` },
            { label: "Direction", value: pendingFormData.loanDirection === "lent" ? "I Lent (They Owe Me)" : "I Borrowed (I Owe Them)" },
            { label: "Date", value: pendingFormData.dateBorrowed },
            { label: "Time", value: pendingFormData.timeBorrowed || "—" },
          ]}
          confirmLabel="Yes, Save Record"
          confirmColor={pendingFormData.loanDirection === "lent" ? "emerald" : "rose"}
          onConfirm={handleConfirmSave}
          onCancel={() => { setConfirmOpen(false); setPendingFormData(null); }}
        />
      )}
    </div>
  );
}
