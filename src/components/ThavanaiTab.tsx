import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
  getDoc,
  deleteDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Loan, LoanInstallment } from "../types";
import { generatePDF } from "../pdfGenerator";
import ConfirmModal from "./ConfirmModal";
import {
  Sparkles,
  Percent,
  TrendingDown,
  ChevronRight,
  Plus,
  CheckCircle,
  FileText,
  User,
  Activity,
  Calendar,
  Trash2,
  RotateCcw,
  Lock,
  X,
  ChevronDown,
  ChevronUp,
  Edit2
} from "lucide-react";

export default function ThavanaiTab() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [archivedLoans, setArchivedLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  // View state: active vs archive
  const [viewMode, setViewMode] = useState<"active" | "archive">("active");

  // Form states
  const [borrowerName, setBorrowerName] = useState("");
  const [amount, setAmount] = useState("");
  const [deductedInterest, setDeductedInterest] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [frequency, setFrequency] = useState<"day" | "week" | "month">("day");
  const [dateTaken, setDateTaken] = useState(new Date().toISOString().split("T")[0]);

  // Edit and Validation state
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [formError, setFormError] = useState("");

  // AI advisory panels
  const [aiAdvice, setAiAdvice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Partial Payment State
  const [activePartialLoan, setActivePartialLoan] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");

  // Submitting States
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];

  // Active loans subscription
  useEffect(() => {
    const q = query(collection(db, "loans"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Loan[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Loan);
        });
        setLoans(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "loans");
      }
    );

    return () => unsubscribe();
  }, []);

  // Archived loans subscription
  useEffect(() => {
    const q = query(collection(db, "archived_loans"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Loan[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Loan);
        });
        setArchivedLoans(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "archived_loans");
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute Outstanding stats (based on active loans only)
  const activeLoans = loans.filter((l) => l.status === "live");
  const closedLoans = archivedLoans.filter((l) => l.status === "closed");

  const totalOutstanding = activeLoans.reduce((sum, l) => {
    const paid = (l.installments || []).reduce((s, inst) => s + (inst.type === "skip" ? 0 : inst.amount), 0);
    return sum + (l.amount - paid);
  }, 0);

  const totalDebtAllTime = loans.reduce((sum, l) => sum + l.amount, 0) + archivedLoans.reduce((sum, l) => sum + l.amount, 0);

  const askDebtAdvice = async () => {
    setAiLoading(true);
    setAiAdvice("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "debt",
          payload: { totalDebt: totalOutstanding }
        })
      });
      const data = await response.json();
      setAiAdvice(data.suggestion);
    } catch (e) {
      console.error(e);
      setAiAdvice(
        `Nudge: You have ₹${totalOutstanding.toLocaleString()} debt. To close it in 1 year, commit ₹${Math.round(
          totalOutstanding / 365
        ).toLocaleString()}/day, or save ₹${Math.round(totalOutstanding / 12).toLocaleString()}/month.`
      );
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (totalOutstanding > 0) {
      askDebtAdvice();
    }
  }, [totalOutstanding]);

  // Handle Edit click prefill
  const handleEditClick = (loan: Loan) => {
    setEditingLoan(loan);
    setBorrowerName(loan.borrowerName);
    setAmount(loan.amount.toString());
    setDeductedInterest(loan.deductedInterest?.toString() || "");
    setTotalInstallments(loan.totalInstallments.toString());
    setInstallmentAmount(loan.installmentAmount.toString());
    setFrequency(loan.frequency);
    setDateTaken(loan.dateTaken);
  };

  const handleCancelEdit = () => {
    setEditingLoan(null);
    setBorrowerName("");
    setAmount("");
    setDeductedInterest("");
    setTotalInstallments("");
    setInstallmentAmount("");
    setFrequency("day");
    setDateTaken(new Date().toISOString().split("T")[0]);
    setFormError("");
  };

  // Clear editing state on viewMode change
  useEffect(() => {
    handleCancelEdit();
  }, [viewMode]);

  // Submit adding/editing Thavanai
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!borrowerName.trim()) {
      setFormError("Borrower Name is required.");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("Loan Amount must be greater than 0.");
      return;
    }
    if (!installmentAmount || isNaN(Number(installmentAmount)) || Number(installmentAmount) <= 0) {
      setFormError("Installment Amount must be greater than 0.");
      return;
    }
    setIsFormSubmitting(true);

    try {
      if (editingLoan) {
        const loanRef = doc(db, "loans", editingLoan.id);
        await updateDoc(loanRef, {
          borrowerName: borrowerName.trim(),
          amount: Number(amount),
          deductedInterest: Number(deductedInterest) || 0,
          totalInstallments: Number(totalInstallments) || 100,
          installmentAmount: Number(installmentAmount),
          frequency,
          dateTaken,
          updatedAt: new Date().toISOString()
        });
        setEditingLoan(null);
        alert("Thavanai contract updated successfully!");
      } else {
        const payload: Omit<Loan, "id"> = {
          borrowerName: borrowerName.trim(),
          amount: Number(amount),
          deductedInterest: Number(deductedInterest) || 0,
          totalInstallments: Number(totalInstallments) || 100,
          installmentAmount: Number(installmentAmount),
          frequency,
          dateTaken,
          installments: [],
          status: "live"
        };
        await addDoc(collection(db, "loans"), payload);
        alert("Installment Loan registered successfully!");
      }
      setBorrowerName("");
      setAmount("");
      setDeductedInterest("");
      setTotalInstallments("");
      setInstallmentAmount("");
      setFormError("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "loans");
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Archive loan move helper
  const archiveLoanDoc = async (loanId: string, loanData: any) => {
    const batch = writeBatch(db);
    const archivedRef = doc(db, "archived_loans", loanId);
    batch.set(archivedRef, {
      ...loanData,
      archivedAt: new Date().toISOString()
    });

    const activeRef = doc(db, "loans", loanId);
    batch.delete(activeRef);
    await batch.commit();
  };

  // Soft Delete Active Loan (moves to archive with status: "deleted")
  const handleDeleteLoan = async (loanId: string) => {
    if (!confirm("Are you sure you want to archive this Thavanai (Soft Delete)?")) return;
    try {
      const loanRef = doc(db, "loans", loanId);
      const snap = await getDoc(loanRef);
      if (snap.exists()) {
        const data = snap.data();
        await archiveLoanDoc(loanId, {
          ...data,
          status: "deleted",
          updatedAt: new Date().toISOString()
        });
        alert("Record soft-deleted and moved to Archive.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `loans/${loanId}`);
    }
  };

  // Restore Loan (moves back to active with status: "live")
  const handleRestoreLoan = async (loanId: string) => {
    if (!confirm("Restore this Thavanai back to active tracking?")) return;
    try {
      const archivedRef = doc(db, "archived_loans", loanId);
      const snap = await getDoc(archivedRef);
      if (snap.exists()) {
        const data = snap.data();
        const batch = writeBatch(db);
        const activeRef = doc(db, "loans", loanId);
        
        batch.set(activeRef, {
          ...data,
          status: "live",
          archivedAt: null,
          archiveReason: null,
          updatedAt: new Date().toISOString()
        });

        batch.delete(archivedRef);
        await batch.commit();
        alert("Record restored successfully.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `archived_loans/${loanId}`);
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
      const archivedRef = doc(db, "archived_loans", loanId);
      await deleteDoc(archivedRef);
      alert("Record permanently deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `archived_loans/${loanId}`);
    }
  };

  // Confirm payment modal states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    loanId: string;
    type: "full" | "partial" | "skip";
    customAmt?: number;
  } | null>(null);

  const handlePaymentClick = (loanId: string, type: "full" | "partial" | "skip", customAmt?: number) => {
    if (type === "partial" && (!customAmt || customAmt <= 0)) {
      alert("Please enter a valid partial payment amount!");
      return;
    }
    setPendingPayment({ loanId, type, customAmt });
    setConfirmOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!pendingPayment || isSubmitting) return;
    const { loanId, type, customAmt } = pendingPayment;
    setIsSubmitting(true);
    setConfirmOpen(false);
    setPendingPayment(null);

    const targetLoan = loans.find((l) => l.id === loanId);
    if (!targetLoan) {
      setIsSubmitting(false);
      return;
    }

    let installAmt = targetLoan.installmentAmount;
    if (type === "partial") {
      installAmt = customAmt || 0;
    } else if (type === "skip") {
      installAmt = 0;
    }

    const newInstallment: LoanInstallment = {
      id: `${Date.now()}_idx`,
      date: todayStr,
      amount: installAmt,
      type
    };

    const updatedInstallments = [...(targetLoan.installments || []), newInstallment];
    const totalPaid = updatedInstallments.reduce((s, i) => s + (i.type === "skip" ? 0 : i.amount), 0);
    const isNowClosed = totalPaid >= targetLoan.amount;

    try {
      const loanRef = doc(db, "loans", loanId);
      if (isNowClosed) {
        // Move to archived_loans
        const loanData = {
          ...targetLoan,
          installments: updatedInstallments,
          status: "closed",
          updatedAt: new Date().toISOString()
        };
        delete (loanData as any).id;
        await archiveLoanDoc(loanId, loanData);
        alert(`Payment logged! Loan fully paid off & moved to Archive.`);
      } else {
        await updateDoc(loanRef, {
          installments: updatedInstallments,
          status: "live"
        });
        alert(`Payment logged! Paid: Rs. ${installAmt.toLocaleString()}. Outstanding pending: Rs. ${Math.max(0, targetLoan.amount - totalPaid).toLocaleString()}`);
      }
      setActivePartialLoan(null);
      setPartialAmount("");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `loans/${loanId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate individual Thavanai PDF with payments histories
  const downloadIndividualReport = (loan: Loan) => {
    const paid = (loan.installments || []).reduce((s, i) => s + (i.type === "skip" ? 0 : i.amount), 0);
    const balance = loan.amount - paid;
    const itemsList = [
      ["Registered Borrower", loan.borrowerName],
      ["Date Taken", loan.dateTaken],
      ["Principal Total Limit", `Rs. ${loan.amount.toLocaleString()}`],
      ["Deducted Upfront Interest", `Rs. ${loan.deductedInterest.toLocaleString()}`],
      ["Actual Received Capitals", `Rs. ${(loan.amount - loan.deductedInterest).toLocaleString()}`],
      ["Installments Structure", `${loan.totalInstallments} instalments at Rs. ${loan.installmentAmount}/${loan.frequency}`],
      ["Total Repayments logged", `Rs. ${paid.toLocaleString()}`],
      ["Remained Outstanding", `Rs. ${balance.toLocaleString()}`],
      ["Current Contract State", loan.status.toUpperCase()]
    ];

    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        
        // Header
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, 210, 30, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Thavanai Installment Contract Audit", 15, 18);
        doc.setFontSize(9);
        doc.text("MK — Maha Karthik Family Finance Tracker", 15, 25);

        // Core Contract Details Table
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.text("Lending Specifications:", 15, 40);

        autoTable(doc, {
          startY: 45,
          head: [["Contract Attribute", "Data Values"]],
          body: itemsList,
          theme: "grid"
        });

        // Payment Logs
        doc.setFontSize(11);
        doc.text("Payment Breakdown Logs:", 15, (doc as any).lastAutoTable.finalY + 12);

        const paymentLogsList = (loan.installments || []).map((inst, index) => [
          (index + 1).toString(),
          inst.date,
          inst.type.toUpperCase(),
          `Rs. ${inst.amount.toLocaleString()}`
        ]);

        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 18,
          head: [["#", "Date Paid", "Transaction Category", "Repaid value"]],
          body: paymentLogsList,
          theme: "striped"
        });

        doc.save(`thavanai_repayment_${loan.borrowerName.replace(/\s/g, "_")}.pdf`);
      });
    });
  };

  const displayLoans = viewMode === "active" ? activeLoans : archivedLoans;

  return (
    <div className="space-y-6">
      {/* Overview Card banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 gap-4 shadow-sm animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
            EMI / Thavanai (Installment) Tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Track high-frequency thavanai loans, auto-recalculate closure paces, and generate files.
          </p>
        </div>

        <button
          onClick={() => generatePDF("loans", { loans })}
          className="px-4 py-2 bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition shadow-sm"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          Export All Thavanais PDF
        </button>
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

      {/* Debt calculations dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm hover:border-slate-700 transition duration-300">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">OUTSTANDING EMI LIABILITY</span>
          <span className="text-2xl font-black text-rose-400 block mt-1">₹ {totalOutstanding.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 font-mono mt-1.5 inline-block">All Time Debt Taken: ₹{totalDebtAllTime.toLocaleString()}</span>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm hover:border-slate-700 transition duration-300">
          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">LIVE THAVANAIS COUNT</span>
          <span className="text-2xl font-black text-white block mt-1">{activeLoans.length} Contracts</span>
          <span className="text-[10px] text-slate-400 font-mono mt-1.5 inline-block">Completed/Closed: {closedLoans.length}</span>
        </div>

        {/* AI smart text output */}
        <div className="bg-indigo-950/40 border border-indigo-500/30 p-5 rounded-2xl sm:col-span-1 text-indigo-200 text-xs shadow-sm">
          <div className="flex items-center gap-1.5 font-bold text-white uppercase text-[10px] mb-2 tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Active Payoff Advisor
          </div>
          {aiLoading ? (
            <span className="font-mono animate-pulse">Computing recalculation vectors...</span>
          ) : (
            <p className="font-mono leading-relaxed">{aiAdvice || "carrying zero active installment debts!"}</p>
          )}
        </div>
      </div>

      <div className="list-left-layout">

        {/* Repayment Log visual cards (Left Panel) */}
        <div id="thavanais-list" className="left-panel space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
            {viewMode === "active" ? "Active Thavanais" : "Archived Thavanais"}
          </h3>

          {loading ? (
            <div className="text-center font-mono py-10 text-xs text-slate-500 animate-pulse">Syncing contracts data...</div>
          ) : displayLoans.length === 0 ? (
            <div className="empty-state bg-slate-900 p-12 rounded-2xl border border-slate-800 text-center font-mono text-xs text-slate-400 shadow-sm animate-fade-in-up">
              <div className="text-3xl mb-3">📭</div>
              <span>
                {viewMode === "active" ? "No active Thavanai installment sheets under ledger registry." : "No archived Thavanai installment sheets found."}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-fade-in-up align-start items-start content-start">
              {displayLoans.map((loan) => {
                const totalPaid = (loan.installments || []).reduce((s, i) => s + (i.type === "skip" ? 0 : i.amount), 0);
                const outstandingRem = loan.amount - totalPaid;
                
                // Forecast Closure pace
                const remainingInst = Math.ceil(outstandingRem / loan.installmentAmount);
                const closureStatsText = loan.status === "closed"
                  ? "✓ CONTRACT FULLY REPAID / CLOSED"
                  : loan.status === "deleted"
                  ? "⚠ SOFT DELETED FROM ACTIVE LIST"
                  : `${remainingInst} ${loan.frequency}s to completely close at standard rate.`;

                return (
                  <div
                    id={`loan-${loan.id}`}
                    key={loan.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/30 transition duration-300 space-y-4 shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-indigo-400" />
                        <div>
                          <h4 className="text-sm font-bold text-white font-sans">{loan.borrowerName}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">Date Taken: {loan.dateTaken}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-black ${
                          loan.status === "live"
                            ? "bg-amber-500/10 text-amber-400"
                            : loan.status === "closed"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-455"
                        }`}>
                          {loan.status}
                        </span>

                        {loan.status === "live" && viewMode === "active" && (
                          <button
                            onClick={() => handleEditClick(loan)}
                            className="p-1 hover:bg-slate-800 text-indigo-400 rounded cursor-pointer"
                            title="Edit Thavanai details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => downloadIndividualReport(loan)}
                          className="p-1 hover:bg-slate-800 text-indigo-400 rounded cursor-pointer"
                          title="Download individual Thavanai details"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Numeric breakdown limits */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-850 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 font-mono tracking-widest block">CONTRACT MAX</span>
                        <span className="text-xs font-bold text-white block mt-0.5">₹ {loan.amount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-mono tracking-widest block">TOTAL REPAID</span>
                        <span className="text-xs font-bold text-emerald-400 block mt-0.5">₹ {totalPaid.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-rose-400/80 font-mono tracking-widest block">PENDING DEBT</span>
                        <span className="text-xs font-bold text-rose-400 block mt-0.5">₹ {outstandingRem.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Completion bar */}
                    <div className="space-y-1">
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${Math.min(100, (totalPaid / loan.amount) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        Forecast Pacings: {closureStatsText}
                      </span>
                    </div>

                    {/* Actions button panels */}
                    {viewMode === "active" ? (
                      loan.status === "live" && (
                        <div className="space-y-2 pt-2 border-t border-slate-850 flex flex-col">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePaymentClick(loan.id, "full")}
                              className="flex-1 py-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/25 transition text-emerald-400 font-bold text-2xs rounded-lg cursor-pointer"
                            >
                              ✓ Pay Today (Rs. {loan.installmentAmount})
                            </button>

                            <button
                              onClick={() => setActivePartialLoan(activePartialLoan === loan.id ? null : loan.id)}
                              className="px-3.5 py-1.5 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/25 text-indigo-400 text-2xs font-bold rounded-lg cursor-pointer animate-pulse"
                            >
                              Rs. Partial
                            </button>

                            <button
                              onClick={() => handlePaymentClick(loan.id, "skip")}
                              className="px-3.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-2xs rounded-lg cursor-pointer transition"
                            >
                              ⏭ Skip
                            </button>

                            <button
                              onClick={() => handleDeleteLoan(loan.id)}
                              className="p-1.5 bg-slate-800 border border-slate-700 hover:border-rose-500/30 hover:text-rose-455 text-slate-400 text-2xs rounded-lg cursor-pointer transition"
                              title="Soft Delete to Archive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Partial Payment Input Field collapse */}
                          {activePartialLoan === loan.id && (
                            <div className="flex gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-850 animate-fade-in-up shadow-inner mt-2">
                              <input
                                type="number"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                placeholder="Enter custom amount (Rs.)"
                                className="flex-1 bg-slate-900 text-xs text-white px-3 py-1.5 border border-slate-800 rounded focus:outline-none focus:border-indigo-500"
                              />
                              <button
                                onClick={() => handlePaymentClick(loan.id, "partial", Number(partialAmount))}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 font-bold text-2xs rounded text-white cursor-pointer transition"
                              >
                                Submit
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="pt-2 border-t border-slate-850 flex gap-2">
                        <button
                          onClick={() => handleRestoreLoan(loan.id)}
                          className="flex-1 py-1.5 font-bold text-[11px] rounded-xl cursor-pointer transition bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-400 flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore Contract
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(loan.id)}
                          className="p-2 bg-slate-800 border border-slate-700 hover:border-rose-500/30 hover:text-rose-400 rounded-xl cursor-pointer text-slate-400 transition flex items-center justify-center"
                          title="Permanently Delete"
                        >
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Creation Form (Right Panel, Only in active mode) */}
        {viewMode === "active" ? (
          <div className="right-panel bg-slate-900 border border-slate-800 p-5 rounded-2xl h-fit shadow-sm">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              {editingLoan ? "Edit Thavanai" : "Register New Thavanai"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Borrower name */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Borrower Name</label>
                <input
                  type="text"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  placeholder="e.g. Nazir"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Principal amount */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Loan Amount (Principal ₹)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Interest deducted upfront */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Upfront Deducted Interest (₹)</label>
                <input
                  type="number"
                  value={deductedInterest}
                  onChange={(e) => setDeductedInterest(e.target.value)}
                  placeholder="e.g. 5000 (Actual received 45000)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Installment configuration */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Total Repayments</label>
                  <input
                    type="number"
                    value={totalInstallments}
                    onChange={(e) => setTotalInstallments(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Installment (₹/frequency)</label>
                  <input
                    type="number"
                    value={installmentAmount}
                    onChange={(e) => setInstallmentAmount(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* Frequency selection */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </div>

              {/* Date signed */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Start Date</label>
                <input
                  type="date"
                  value={dateTaken}
                  onChange={(e) => setDateTaken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {formError && (
                <p className="text-rose-500 text-xs font-semibold mt-1">{formError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isFormSubmitting}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition text-white font-semibold text-xs rounded-xl cursor-pointer shadow-lg shadow-indigo-500/10"
                >
                  {isFormSubmitting
                    ? (editingLoan ? "Saving..." : "Registering...")
                    : (editingLoan ? "Save Changes" : "Sign Installment Contract")}
                </button>
                {editingLoan && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl cursor-pointer transition border border-slate-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        ) : (
          <div className="right-panel bg-slate-900 border border-slate-800 p-5 rounded-2xl h-fit text-center text-slate-400 text-xs shadow-sm">
            <div className="flex flex-col items-center p-4">
              <Lock className="w-8 h-8 text-slate-600 mb-2" />
              <p className="font-bold text-slate-300">Archive Registry Mode</p>
              <p className="text-[10px] text-slate-500 mt-1">Permanently delete documents using PIN 2525, or restore them back to active tracking sheets.</p>
            </div>
          </div>
        )}

      </div>

      {pendingPayment && (
        <ConfirmModal
          isOpen={confirmOpen && !!pendingPayment}
          title={
            pendingPayment.type === "full"
              ? "Confirm Installment Payment"
              : pendingPayment.type === "partial"
              ? "Confirm Partial Payment"
              : "Confirm Skip Installment"
          }
          message={
            pendingPayment.type === "skip"
              ? "Are you sure you want to skip today's installment? This installment will be logged with Rs. 0."
              : "Are you sure you want to log this repayment?"
          }
          details={[
            { label: "Borrower", value: (viewMode === "active" ? loans : archivedLoans).find(l => l.id === pendingPayment.loanId)?.borrowerName || "" },
            {
              label: "Amount",
              value: `Rs. ${(
                pendingPayment.type === "full"
                  ? (viewMode === "active" ? loans : archivedLoans).find(l => l.id === pendingPayment.loanId)?.installmentAmount || 0
                  : pendingPayment.type === "partial"
                  ? pendingPayment.customAmt || 0
                  : 0
              ).toLocaleString()}`
            },
            { label: "Action Type", value: pendingPayment.type.toUpperCase() },
            { label: "Date", value: todayStr }
          ]}
          confirmLabel={isSubmitting ? "Processing..." : "Yes, Record Action"}
          confirmColor={pendingPayment.type === "skip" ? "rose" : "emerald"}
          onConfirm={handleConfirmPayment}
          onCancel={() => {
            setConfirmOpen(false);
            setPendingPayment(null);
          }}
        />
      )}
    </div>
  );
}
