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
import { FormalLoan, FormalLoanPayment } from "../types";
import { generatePDF, generateFormalLoanPDF } from "../pdfGenerator";
import ConfirmModal from "./ConfirmModal";
import { useFirebase } from "./FirebaseProvider";
import {
  Plus, Calculator, Landmark, Calendar, Percent, FileText,
  ChevronDown, ChevronUp, Coins, CreditCard, X, Clock, HelpCircle,
  RotateCcw, Trash2, Lock, AlertCircle, Check
} from "lucide-react";

export default function FormalLoanTab() {
  const { online } = useFirebase();
  const [formalLoans, setFormalLoans] = useState<FormalLoan[]>([]);
  const [archivedLoans, setArchivedLoans] = useState<FormalLoan[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation tabs: active vs archive
  const [viewMode, setViewMode] = useState<"active" | "archive">("active");

  // Form states
  const [loanType, setLoanType] = useState<"gold" | "personal" | "housing">("gold");
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [goldWeight, setGoldWeight] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestType, setInterestType] = useState<"monthly" | "yearly" | "fixed">("yearly");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [formError, setFormError] = useState("");

  // Subcollection payments state
  const [loanPayments, setLoanPayments] = useState<Record<string, FormalLoanPayment[]>>({});
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);

  // 4-Step Smart Payment Modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentLoanId, setPaymentLoanId] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState(1);
  const [paymentType, setPaymentType] = useState<"full" | "partial" | "interest-only">("partial");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm modal state for New Entry
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<Omit<FormalLoan, "id"> | null>(null);

  // Interactive Calculator states
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcPrincipal, setCalcPrincipal] = useState("100000");
  const [calcRate, setCalcRate] = useState("8.5");
  const [calcTenure, setCalcTenure] = useState("5"); // years
  const [compoundingFreq, setCompoundingFreq] = useState("12"); // 12 for monthly, 1 for yearly

  const todayStr = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const nowISO = new Date().toISOString();

  // Active loans subscription
  useEffect(() => {
    const q = query(collection(db, "formalLoans"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: FormalLoan[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as FormalLoan);
        });
        list.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
        setFormalLoans(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "formalLoans");
      }
    );
    return () => unsubscribe();
  }, []);

  // Archived loans subscription
  useEffect(() => {
    const q = query(collection(db, "archived_formalLoans"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: FormalLoan[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as FormalLoan);
        });
        list.sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || "") || (b.startDate || "").localeCompare(a.startDate || ""));
        setArchivedLoans(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "archived_formalLoans");
      }
    );
    return () => unsubscribe();
  }, []);

  // Subcollection payments subscription for all active and archived loans to calculate stats
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    const allLoans = [...formalLoans, ...archivedLoans];
    
    allLoans.forEach((loan) => {
      const isActive = formalLoans.some((l) => l.id === loan.id);
      const collPath = isActive ? "formalLoans" : "archived_formalLoans";
      const q = query(collection(db, collPath, loan.id, "payments"));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: FormalLoanPayment[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as FormalLoanPayment);
          });
          list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || b.date.localeCompare(a.date));
          setLoanPayments((prev) => ({ ...prev, [loan.id]: list }));
        },
        (error) => {
          console.error(`Error fetching subcollection payments for loan ${loan.id}:`, error);
        }
      );
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [formalLoans, archivedLoans]);

  // Archive loan move helper
  const archiveFormalLoan = async (loanId: string, loanData: any) => {
    const batch = writeBatch(db);
    const archivedRef = doc(db, "archived_formalLoans", loanId);
    batch.set(archivedRef, {
      ...loanData,
      archivedAt: new Date().toISOString()
    });

    const paymentsSnap = await getDocs(collection(db, "formalLoans", loanId, "payments"));
    paymentsSnap.forEach((pDoc) => {
      const archivedPaymentRef = doc(db, "archived_formalLoans", loanId, "payments", pDoc.id);
      batch.set(archivedPaymentRef, pDoc.data());

      const activePaymentRef = doc(db, "formalLoans", loanId, "payments", pDoc.id);
      batch.delete(activePaymentRef);
    });

    const activeRef = doc(db, "formalLoans", loanId);
    batch.delete(activeRef);
    await batch.commit();
  };

  // Soft Delete Active Loan (moves to archive with status: "deleted")
  const handleDeleteLoan = async (loanId: string) => {
    if (!confirm("Are you sure you want to archive this loan record (Soft Delete)?")) return;
    try {
      const loanRef = doc(db, "formalLoans", loanId);
      const snap = await getDoc(loanRef);
      if (snap.exists()) {
        const data = snap.data();
        await archiveFormalLoan(loanId, {
          ...data,
          status: "deleted",
          updatedAt: new Date().toISOString()
        });
        alert("Loan record soft-deleted and moved to Archive.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `formalLoans/${loanId}`);
    }
  };

  // Restore Loan (moves back to active with status: "live")
  const handleRestoreLoan = async (loanId: string) => {
    if (!confirm("Restore this loan record back to active tracking?")) return;
    try {
      const archivedRef = doc(db, "archived_formalLoans", loanId);
      const snap = await getDoc(archivedRef);
      if (snap.exists()) {
        const data = snap.data();
        const batch = writeBatch(db);
        const activeRef = doc(db, "formalLoans", loanId);

        batch.set(activeRef, {
          ...data,
          status: "live",
          archivedAt: null,
          archiveReason: null,
          updatedAt: new Date().toISOString()
        });

        const paymentsSnap = await getDocs(collection(db, "archived_formalLoans", loanId, "payments"));
        paymentsSnap.forEach((pDoc) => {
          const activePaymentRef = doc(db, "formalLoans", loanId, "payments", pDoc.id);
          batch.set(activePaymentRef, pDoc.data());

          const archivedPaymentRef = doc(db, "archived_formalLoans", loanId, "payments", pDoc.id);
          batch.delete(archivedPaymentRef);
        });

        batch.delete(archivedRef);
        await batch.commit();
        alert("Loan record restored successfully.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `archived_formalLoans/${loanId}`);
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
      const paymentsSnap = await getDocs(collection(db, "archived_formalLoans", loanId, "payments"));
      paymentsSnap.forEach((pDoc) => {
        const archivedPaymentRef = doc(db, "archived_formalLoans", loanId, "payments", pDoc.id);
        batch.delete(archivedPaymentRef);
      });

      const archivedRef = doc(db, "archived_formalLoans", loanId);
      batch.delete(archivedRef);

      await batch.commit();
      alert("Loan record permanently deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `archived_formalLoans/${loanId}`);
    }
  };

  // Precise duration elapsed calculator (years, months, days format)
  const getDurationString = (startDateStr: string | undefined): string => {
    if (!startDateStr) return "N/A";
    const start = new Date(startDateStr);
    const now = new Date();
    if (isNaN(start.getTime())) return "N/A";
    if (now < start) return "0d";

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      // Get number of days in the previous month
      const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}m`);
    if (days > 0 || parts.length === 0) parts.push(`${days}d`);

    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return `${parts.join(" ")} (${diffDays} days elapsed)`;
  };

  // Interest calculation per loan
  const calcAccruedInterest = (loan: FormalLoan) => {
    if (!loan.startDate) return 0;
    const start = new Date(loan.startDate);
    const now = new Date();
    if (now < start) return 0;
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const principal = loan.remainingAmount !== undefined ? loan.remainingAmount : loan.amount;
    const rate = loan.interestRate;

    if (loan.interestType === "monthly") {
      return Math.round((principal * (rate / 100)) * (diffDays / 30));
    } else if (loan.interestType === "yearly") {
      return Math.round((principal * (rate / 100)) * (diffDays / 365));
    } else if (loan.interestType === "fixed") {
      return rate; // Flat interest
    }
    return 0;
  };

  // Outstanding calculations
  const getOutstandingPrincipal = (loan: FormalLoan) =>
    loan.remainingAmount !== undefined ? loan.remainingAmount : loan.amount;

  const activeLoansList = formalLoans.filter((l) => l.status === "live");
  const displayLoans = viewMode === "active" ? activeLoansList : archivedLoans;

  // Stats
  const totalFormalOutstanding = activeLoansList.reduce((sum, l) => sum + getOutstandingPrincipal(l), 0);

  const cleanPayload = (obj: any) => {
    const cleaned = { ...obj };
    Object.keys(cleaned).forEach((key) => {
      if (cleaned[key] === undefined) {
        delete cleaned[key];
      }
    });
    return cleaned;
  };

  // Form submit (New Contract)
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!bank.trim()) {
      setFormError("Lender / Bank Name is required.");
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("Please enter a valid Principal Amount greater than 0.");
      return;
    }
    if (!interestRate || isNaN(Number(interestRate)) || Number(interestRate) < 0) {
      setFormError("Please enter a valid Interest Rate (0 or greater).");
      return;
    }
    const payload: Omit<FormalLoan, "id"> = {
      loanType,
      bank: bank.trim(),
      amount: Number(amount),
      remainingAmount: Number(amount),
      description: description.trim() || undefined,
      goldWeight: loanType === "gold" ? (Number(goldWeight) || undefined) : undefined,
      interestRate: Number(interestRate),
      interestType,
      startDate,
      payments: [],
      status: "live",
      createdAt: nowISO,
      updatedAt: nowISO
    };
    setPendingFormData(payload);
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!pendingFormData) return;
    setConfirmOpen(false);
    try {
      const payloadToWrite = cleanPayload(pendingFormData);
      await addDoc(collection(db, "formalLoans"), payloadToWrite);
      setBank("");
      setAmount("");
      setDescription("");
      setGoldWeight("");
      setInterestRate("");
      setFormError("");
      setPendingFormData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "formalLoans");
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
      const loanRef = doc(db, "formalLoans", paymentLoanId);
      await runTransaction(db, async (transaction) => {
        const loanSnap = await transaction.get(loanRef);
        if (!loanSnap.exists()) {
          throw new Error("Loan document does not exist!");
        }
        const loanData = loanSnap.data();
        const principal = Number(loanData.amount);
        const currentRemaining = loanData.remainingAmount !== undefined ? Number(loanData.remainingAmount) : principal;
        const payAmt = Number(paymentAmount);

        // If interest-only, remaining balance doesn't reduce
        const nextRemaining = paymentType === "interest-only" 
          ? currentRemaining 
          : Math.max(0, currentRemaining - payAmt);
          
        const isNowClosed = nextRemaining <= 0;

        transaction.update(loanRef, {
          remainingAmount: nextRemaining,
          status: isNowClosed ? "closed" : "live",
          updatedAt: nowISO
        });

        const paymentRef = doc(collection(db, "formalLoans", paymentLoanId, "payments"));
        transaction.set(paymentRef, {
          id: paymentRef.id,
          date: todayStr,
          time: nowTime,
          amount: payAmt,
          description: paymentDescription.trim() || (paymentType === "full" ? "Full Repayment" : paymentType === "interest-only" ? "Interest Payment" : "Partial Payment"),
          type: paymentType,
          isInterestOnly: paymentType === "interest-only",
          remainingAfter: nextRemaining,
          createdAt: nowISO
        });
      });

      // Post-transaction check for archiving closed loans
      const updatedSnap = await getDoc(loanRef);
      if (updatedSnap.exists()) {
        const data = updatedSnap.data();
        if (data.status === "closed") {
          await archiveFormalLoan(paymentLoanId, data);
          alert("Payment logged! Loan contract fully paid off & moved to Archive.");
        } else {
          alert(`Payment logged! Remaining principal balance: ₹${data.remainingAmount.toLocaleString()}`);
        }
      }

      setPaymentModalOpen(false);
      setPaymentLoanId(null);
      setPaymentStep(1);
      setPaymentAmount("");
      setPaymentDescription("");
    } catch (error) {
      console.error("Transaction failed: ", error);
      alert("Repayment failed. Please check internet connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculator calculations
  const P = Number(calcPrincipal) || 0;
  const R = (Number(calcRate) || 0) / 100;
  const T = Number(calcTenure) || 0;
  const N = Number(compoundingFreq) || 12;

  const compoundTotal = P * Math.pow(1 + R / N, N * T);
  const compoundInterestAccrued = compoundTotal - P;

  const monthlyRateDecimal = R / 12;
  const totalMonths = T * 12;
  const emi = totalMonths > 0 && monthlyRateDecimal > 0
    ? (P * monthlyRateDecimal * Math.pow(1 + monthlyRateDecimal, totalMonths)) / (Math.pow(1 + monthlyRateDecimal, totalMonths) - 1)
    : 0;
  const emiTotalAmtRepaid = emi * totalMonths;
  const emiInterestAccrued = emiTotalAmtRepaid - P;

  const loanTypeConfig = {
    gold: { label: "Gold Loan", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: Coins },
    personal: { label: "Personal Loan", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: CreditCard },
    housing: { label: "Home Loan", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: Landmark }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm animate-fade-in-up">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
              Bank & Institutional Loan Tracker
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">Gold loans, personal loans, and home loans with interest tracking & partial payments</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsCalcOpen(!isCalcOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 text-xs cursor-pointer transition">
              <Calculator className="w-3.5 h-3.5 text-indigo-400" /> EMI Calc
            </button>
            <button onClick={() => generatePDF("formalLoans", { formalLoans: activeLoansList })}
              className="px-3 py-1.5 bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-xs rounded-xl flex items-center gap-1 cursor-pointer transition">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> Export PDF
            </button>
          </div>
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

      {/* Summary card */}
      <div className="bg-rose-950/20 border border-rose-500/30 p-4 rounded-2xl">
        <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Total Outstanding Principal</span>
        <span className="text-3xl font-black text-rose-400 block mt-1">₹ {totalFormalOutstanding.toLocaleString()}</span>
        <div className="flex gap-4 mt-2 flex-wrap">
          {(["gold", "personal", "housing"] as const).map(t => {
            const cfg = loanTypeConfig[t];
            const total = activeLoansList.filter(l => l.loanType === t)
              .reduce((s, l) => s + getOutstandingPrincipal(l), 0);
            return total > 0 ? (
              <div key={t} className="text-xs">
                <span className="text-slate-500 font-mono">{cfg.label}: </span>
                <span className={`font-bold ${cfg.color}`}>₹ {total.toLocaleString()}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Interactive Calculator */}
      {isCalcOpen && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 animate-fade-in-up shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-indigo-400" /> Loan & Interest Modeler
            </h3>
            <button onClick={() => setIsCalcOpen(false)} className="text-slate-500 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">Principal (₹)</label>
              <input type="number" value={calcPrincipal} onChange={e=>setCalcPrincipal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">Annual Rate (%)</label>
              <input type="number" value={calcRate} onChange={e=>setCalcRate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">Tenure (Years)</label>
              <input type="number" value={calcTenure} onChange={e=>setCalcTenure(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 font-mono uppercase mb-1">Compounding</label>
              <select value={compoundingFreq} onChange={e=>setCompoundingFreq(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer">
                <option value="12">Monthly compounding (n=12)</option>
                <option value="1">Yearly compounding (n=1)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/60 font-mono text-[11px]">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
              <span className="block text-indigo-400 font-bold uppercase mb-2 font-sans text-xs">Standard Mortgage EMI (Amortized)</span>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Monthly EMI payout:</span>
                  <span className="text-white font-bold">₹ {Math.round(emi).toLocaleString()} /mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Accrued Interest:</span>
                  <span className="text-amber-400 font-bold">₹ {Math.round(emiInterestAccrued).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Lifecycle Cost:</span>
                  <span className="text-rose-400 font-bold">₹ {Math.round(emiTotalAmtRepaid).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
              <span className="block text-indigo-400 font-bold uppercase mb-2 font-sans text-xs">Compound Interest Model</span>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Accrued Interest:</span>
                  <span className="text-amber-400 font-bold">₹ {Math.round(compoundInterestAccrued).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Maturity Total (A):</span>
                  <span className="text-emerald-400 font-bold">₹ {Math.round(compoundTotal).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="list-left-layout">
        {/* Display List (Left Panel) */}
        <div className="left-panel space-y-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            {viewMode === "active" ? "Active Contracts" : "Archived Contracts"} ({displayLoans.length})
          </h3>

          {loading ? (
            <div className="text-center py-10 text-xs text-slate-500 font-mono animate-pulse">Loading loans...</div>
          ) : displayLoans.length === 0 ? (
            <div className="empty-state bg-slate-900 p-12 rounded-2xl border border-slate-800 text-center text-xs text-slate-500 font-mono">
              <div className="text-3xl mb-3">📭</div>
              <span>
                {viewMode === "active" ? "No active contracts registered yet." : "No archived contracts found."}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 align-start items-start content-start">
              {displayLoans.map(loan => {
                const cfg = loanTypeConfig[loan.loanType];
                const Icon = cfg.icon;
                const remaining = getOutstandingPrincipal(loan);
                const principalPaid = Math.max(0, loan.amount - remaining);
                const progressPct = Math.min(100, Math.round((principalPaid / loan.amount) * 100));
                const accruedInterest = calcAccruedInterest(loan);
                const isExpanded = expandedLoan === loan.id;

                const disbursal = loan.startDate ? new Date(loan.startDate) : null;
                const daysDiff = disbursal ? Math.max(0, Math.ceil((new Date().getTime() - disbursal.getTime()) / (1000 * 60 * 60 * 24))) : 0;

                const payments = loanPayments[loan.id] || [];
                const interestPaid = payments
                  .filter((p) => p.isInterestOnly || p.type === "interest-only")
                  .reduce((sum, p) => sum + p.amount, 0);

                return (
                  <div key={loan.id} className={`bg-slate-900 border rounded-2xl p-4 shadow-sm space-y-3 transition-all ${
                    loan.status === "live" ? `border-slate-800 hover:${cfg.border}` : "border-slate-800 opacity-75"
                  }`}>
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{loan.bank}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} border ${cfg.border}`}>{cfg.label}</span>
                            <span className="text-[9px] text-slate-400 font-mono">Disbursed: {loan.startDate} · {getDurationString(loan.startDate)}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{loan.interestRate}% {loan.interestType}</span>
                            {loan.goldWeight && <span className="text-[9px] text-amber-400 font-mono">{loan.goldWeight}g gold</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {loan.status === "closed" ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold font-mono uppercase">✓ PAID</span>
                        ) : loan.status === "deleted" ? (
                          <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded font-bold font-mono uppercase">🗑️ DELETED</span>
                        ) : (
                          <span className={`text-[9px] font-mono tracking-wider px-2 py-0.5 rounded font-black bg-rose-500/10 text-rose-400 animate-pulse`}>
                            ACTIVE
                          </span>
                        )}
                        <button
                          onClick={() => generateFormalLoanPDF(loan, payments)}
                          className="text-slate-500 hover:text-indigo-400 p-1 hover:bg-slate-800 rounded transition cursor-pointer"
                          title="Download Detailed Loan Audit PDF Report"
                        >
                          <FileText className="w-4 h-4 text-indigo-400 font-bold" />
                        </button>
                        <button onClick={() => setExpandedLoan(isExpanded ? null : loan.id)} className="text-slate-500 hover:text-white transition cursor-pointer">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {loan.description && <p className="text-[11px] text-slate-400 italic">"{loan.description}"</p>}

                    {/* Amounts grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center font-mono">
                      <div>
                        <span className="text-[9px] text-slate-500 block">PRINCIPAL</span>
                        <span className="text-xs font-black text-white">₹ {loan.amount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">PAID BACK</span>
                        <span className="text-xs font-black text-emerald-400">₹ {principalPaid.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">OUTSTANDING</span>
                        <span className="text-xs font-black text-rose-400">₹ {remaining.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block">ACCRUED INT.</span>
                        <span className="text-xs font-black text-amber-400">₹ {accruedInterest.toLocaleString()}</span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[9px] text-slate-500 block">INTEREST PAID</span>
                        <span className="text-xs font-black text-cyan-400">₹ {interestPaid.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-slate-500">
                        <span>Principal Repayment Progress</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${cfg.color.replace('text-', 'bg-')}`} style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="space-y-3 pt-2 border-t border-slate-850">
                        <div>
                          <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" /> Repayment Timeline
                          </span>
                          {payments && payments.length > 0 ? (
                            <div className="bg-slate-950 rounded-xl border border-slate-800 divide-y divide-slate-850 mt-1.5 overflow-hidden">
                              {payments.map((p) => (
                                <div key={p.id} className="flex justify-between items-start px-3.5 py-2 text-[11px] hover:bg-slate-900/40">
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-300 font-mono font-bold">{p.date}</span>
                                      {p.time && <span className="text-slate-600 text-[10px] font-mono">{p.time}</span>}
                                      {p.isInterestOnly && (
                                        <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded font-black font-mono">
                                          INTEREST ONLY
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-slate-500 text-[10px] block mt-0.5">{p.description}</span>
                                  </div>
                                  <span className={`font-bold ${p.isInterestOnly ? "text-amber-400" : "text-emerald-400"}`}>
                                    ₹ {p.amount.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-600 font-mono text-center py-3 bg-slate-950 rounded-xl border border-slate-800 mt-1.5">
                              No payments recorded yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Record Payment Section */}
                    <div className="pt-2 border-t border-slate-850 flex gap-2">
                      {viewMode === "active" ? (
                        <>
                          <button onClick={() => {
                            setPaymentLoanId(loan.id);
                            setPaymentStep(1);
                            setPaymentAmount("");
                            setPaymentDescription("");
                            setPaymentModalOpen(true);
                          }}
                            className={`flex-1 py-1.5 text-[11px] font-bold rounded-xl cursor-pointer transition border bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 border-indigo-500/20`}>
                            💰 Record Repayment / Interest
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
                            <RotateCcw className="w-3.5 h-3.5" /> Restore Contract
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

        {/* Form or Archive Vault message (Right Panel) */}
        {viewMode === "active" ? (
          <div className="right-panel bg-slate-900 border border-slate-800 p-4 rounded-2xl h-fit shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5 uppercase tracking-wider">
              <Plus className="w-3.5 h-3.5 text-indigo-400" /> Register Contract
            </h3>
            <form onSubmit={handleSubmitForm} className="space-y-3">
              <div>
                <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5">Loan Type</label>
                <div className="grid grid-cols-3 gap-0.5 bg-slate-950 p-0.5 rounded-xl border border-slate-850">
                  {(["gold", "personal", "housing"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setLoanType(t)}
                      className={`py-1.5 text-[9px] font-bold rounded-lg capitalize cursor-pointer transition ${
                        loanType === t ? `${loanTypeConfig[t].bg} ${loanTypeConfig[t].color} border ${loanTypeConfig[t].border}` : "text-slate-400 hover:text-slate-200"
                      }`}>
                      {t === "housing" ? "Home" : t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5">Lender / Bank Name *</label>
                <input type="text" value={bank} onChange={e=>setBank(e.target.value)} placeholder="e.g. Muthoot, HDFC Bank" required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5">Principal Amount (₹) *</label>
                <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="e.g. 150000" required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5">Purpose / Description</label>
                <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. Emergency funds, Gold purchase..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 h-10 resize-none" />
              </div>

              {loanType === "gold" && (
                <div>
                  <label className="block text-[9px] text-amber-400 font-mono uppercase mb-0.5">Gold Weight (Grams)</label>
                  <input type="number" value={goldWeight} onChange={e=>setGoldWeight(e.target.value)} placeholder="e.g. 24.5"
                    className="w-full bg-slate-950 border border-amber-500/25 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5">Interest Rate (%) *</label>
                  <input type="number" value={interestRate} onChange={e=>setInterestRate(e.target.value)} placeholder="e.g. 7.5" required step="any"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5">Rate Basis</label>
                  <select value={interestType} onChange={e=>setInterestType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-1 py-1.5 text-xs text-white focus:outline-none cursor-pointer">
                    <option value="yearly">Yearly %</option>
                    <option value="monthly">Monthly %</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-slate-400 font-mono uppercase mb-0.5"><Calendar className="w-3 h-3 inline mr-1" />Disbursal Date</label>
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>

              {formError && (
                <p className="text-[10px] text-rose-455 bg-rose-500/10 border border-rose-500/25 px-2 py-1 rounded-lg font-mono">
                  ⚠️ {formError}
                </p>
              )}

              <button type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition text-white font-bold text-xs rounded-xl cursor-pointer shadow-lg shadow-indigo-500/10">
                Register Contract
              </button>
            </form>
          </div>
        ) : (
          <div className="right-panel bg-slate-900 border border-slate-800 p-4 rounded-2xl h-fit shadow-sm text-slate-400 text-xs leading-relaxed space-y-3 font-mono">
            <div className="flex items-center gap-1.5 text-white font-bold uppercase tracking-wider text-2xs">
              <Lock className="w-4 h-4 text-indigo-400" /> Secure Archived Vault
            </div>
            <p>This vault hosts institutional loans that have been completed or deleted.</p>
            <ul className="list-disc list-inside space-y-1 text-[10px]">
              <li>Paid contracts are stored here for audits.</li>
              <li>Archived records can be restored.</li>
              <li>Permanent delete requires PIN <span className="text-white bg-slate-800 px-1 py-0.5 rounded font-bold">2525</span>.</li>
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
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType("partial");
                        setPaymentStep(2);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                        paymentType === "partial" ? "bg-indigo-600/10 border-indigo-500/50 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="font-bold text-2xs uppercase">Partial</span>
                      <span className="text-[8px] text-slate-500">Pay custom amount</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType("interest-only");
                        setPaymentStep(2);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                        paymentType === "interest-only" ? "bg-amber-600/10 border-amber-500/50 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="font-bold text-2xs uppercase">Interest-Only</span>
                      <span className="text-[8px] text-slate-500">Logs only interest</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType("full");
                        const loan = formalLoans.find((l) => l.id === paymentLoanId);
                        if (loan) {
                          const remaining = getOutstandingPrincipal(loan);
                          setPaymentAmount(remaining.toString());
                        }
                        setPaymentStep(2);
                      }}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                        paymentType === "full" ? "bg-indigo-600/10 border-indigo-500/50 text-white" : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <span className="font-bold text-2xs uppercase">Full Payoff</span>
                      <span className="text-[8px] text-slate-500">Clear remaining</span>
                    </button>
                  </div>
                </div>
              )}

              {paymentStep === 2 && (
                <div className="space-y-3">
                  <label className="block text-2xs text-slate-400 uppercase tracking-widest font-mono">Specify Amount (₹)</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center font-mono">
                    <span className="text-[10px] text-slate-500 block">CURRENT PRINCIPAL BALANCE</span>
                    <span className="text-lg font-black text-rose-400 block mt-0.5">
                      ₹ {(formalLoans.find((l) => l.id === paymentLoanId)?.remainingAmount !== undefined
                        ? formalLoans.find((l) => l.id === paymentLoanId)?.remainingAmount
                        : formalLoans.find((l) => l.id === paymentLoanId)?.amount || 0).toLocaleString()}
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
                      placeholder={paymentType === "interest-only" ? "e.g. Monthly interest paid via UPI" : "e.g. Paid principal online transfer"}
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
                      <span className="text-slate-500">PAYMENT TYPE:</span>
                      <span className="text-white font-bold uppercase">{paymentType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PAYING AMOUNT:</span>
                      <span className="text-emerald-400 font-black">₹ {Number(paymentAmount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PRINCIPAL AFTER:</span>
                      <span className="text-white font-bold">
                        ₹ {Math.max(0, (
                          (formalLoans.find((l) => l.id === paymentLoanId)?.remainingAmount !== undefined
                            ? formalLoans.find((l) => l.id === paymentLoanId)?.remainingAmount
                            : formalLoans.find((l) => l.id === paymentLoanId)?.amount || 0)
                          - (paymentType === "interest-only" ? 0 : Number(paymentAmount))
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
                      const maxAmt = (formalLoans.find((l) => l.id === paymentLoanId)?.remainingAmount !== undefined
                        ? formalLoans.find((l) => l.id === paymentLoanId)?.remainingAmount
                        : formalLoans.find((l) => l.id === paymentLoanId)?.amount || 0);
                      if (!paymentAmount || payAmt <= 0) {
                        alert("Please enter a valid amount!");
                        return;
                      }
                      if (paymentType !== "interest-only" && payAmt > maxAmt) {
                        alert(`Repayment amount cannot exceed principal balance of ₹${maxAmt}!`);
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
          title="Confirm Loan Registration"
          message="Are you sure you want to register this bank/institutional loan contract?"
          details={[
            { label: "Loan Type", value: loanTypeConfig[pendingFormData.loanType].label },
            { label: "Lender / Bank", value: pendingFormData.bank },
            { label: "Principal", value: `₹ ${pendingFormData.amount.toLocaleString()}` },
            { label: "Interest Rate", value: `${pendingFormData.interestRate}% (${pendingFormData.interestType})` },
            { label: "Disbursal Date", value: pendingFormData.startDate || "-" },
            { label: "Notes", value: pendingFormData.description || "-" }
          ]}
          confirmLabel="Yes, Register Contract"
          confirmColor="indigo"
          onConfirm={handleConfirmSave}
          onCancel={() => { setConfirmOpen(false); setPendingFormData(null); }}
        />
      )}
    </div>
  );
}
