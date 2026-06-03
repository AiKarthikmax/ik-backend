import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, getApiUrl } from "../firebase";
import { Transaction, Category, PRELOADED_CATEGORIES, Loan, TempLoan, FormalLoan } from "../types";
import { handleFileUpload } from "../attachmentHelper";
import ConfirmModal from "./ConfirmModal";
import ImageCropperModal from "./ImageCropperModal";
import {
  Plus,
  Trash,
  Edit2,
  FileText,
  Camera,
  Mic,
  MicOff,
  Sparkles,
  Search,
  CheckCircle,
  HelpCircle,
  Clock,
  CreditCard,
  X,
  RotateCcw
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from "recharts";

const COLORS = ["#6366f1", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f43f5e"];

export default function IncomeExpenseTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  
  // Image Crop state
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [cropImageName, setCropImageName] = useState<string>("");
  const [subCategory, setSubCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [tags, setTags] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<Transaction["paymentMethod"]>("Cash");



  // Attachments State
  const [uploading, setUploading] = useState(false);
  const [tempAttachments, setTempAttachments] = useState<{ name: string; url: string; type: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [activeAttachment, setActiveAttachment] = useState<{ name: string; url: string; type: string } | null>(null);

  // Search/Filters State
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMonth, setFilterMonth] = useState(""); // YYYY-MM

  // AI & Suggestions Info
  const [aiSuggestion, setAiSuggestion] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  // Edit State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editReason, setEditReason] = useState("");

  // Category Manager State
  const [manageCategories, setManageCategories] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newSubTags, setNewSubTags] = useState("");
  const [newCatType, setNewCatType] = useState<"income" | "expense" | "both">("expense");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Archive & List States
  const [listMode, setListMode] = useState<"active" | "archive">("active");
  const [archivedTransactions, setArchivedTransactions] = useState<Transaction[]>([]);

  // FAB Quick Add Modal states
  const [fabOpen, setFabOpen] = useState(false);
  const [fabType, setFabType] = useState<"income" | "expense">("expense");
  const [fabAmount, setFabAmount] = useState("");
  const [fabCategory, setFabCategory] = useState("");
  const [fabSubCategory, setFabSubCategory] = useState("");
  const [fabDescription, setFabDescription] = useState("");
  const [fabDate, setFabDate] = useState(new Date().toISOString().split("T")[0]);
  const [fabPaymentMethod, setFabPaymentMethod] = useState<Transaction["paymentMethod"]>("Cash");
  const [fabIsSubmitting, setFabIsSubmitting] = useState(false);

  // Form Submitting State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingSub, setEditingSub] = useState<{ catId: string; subName: string } | null>(null);
  const [editingSubVal, setEditingSubVal] = useState("");
  const [newSubVals, setNewSubVals] = useState<Record<string, string>>({});

  // Quick Add State
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickType, setQuickType] = useState<"income" | "expense">("expense");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAmount || isNaN(Number(quickAmount)) || Number(quickAmount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    setQuickSubmitting(true);
    const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const payload = {
      type: quickType,
      amount: Number(quickAmount),
      category: quickType === "income" ? "Income / Salary" : "Family Expense",
      subCategory: "General",
      description: quickDescription.trim() || "Quick Add Entry",
      date: new Date().toISOString().split("T")[0],
      time: nowTime,
      paymentMethod: "Cash",
      attachments: [],
      deleted: false,
      tags: [],
      editHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "transactions"), payload);
      setQuickAmount("");
      setQuickDescription("");
      setQuickAddOpen(false);
    } catch (error) {
      console.error("Error saving quick transaction:", error);
      alert("Failed to save entry. Please check your connection.");
    } finally {
      setQuickSubmitting(false);
    }
  };

  // Debt Tracker States for Summary Card
  const [loans, setLoans] = useState<Loan[]>([]);
  const [tempLoans, setTempLoans] = useState<TempLoan[]>([]);
  const [formalLoans, setFormalLoans] = useState<FormalLoan[]>([]);

  // Fetch Transactions and Categories from Firestore
  useEffect(() => {
    const qTrans = query(collection(db, "transactions"));
    const unsubscribeTrans = onSnapshot(
      qTrans,
      (snapshot) => {
        const list: Transaction[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Transaction);
        });
        // Sort by datetime descending (latest first)
        list.sort((a, b) => {
          const dtA = new Date(`${a.date} ${a.time || "00:00:00"}`).getTime();
          const dtB = new Date(`${b.date} ${b.time || "00:00:00"}`).getTime();
          return (isNaN(dtB) ? new Date(b.date).getTime() : dtB) - (isNaN(dtA) ? new Date(a.date).getTime() : dtA);
        });
        setTransactions(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "transactions");
      }
    );

    const qArchived = query(collection(db, "archived_transactions"));
    const unsubscribeArchived = onSnapshot(
      qArchived,
      (snapshot) => {
        const list: Transaction[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Transaction);
        });
        // Sort by datetime descending (latest first)
        list.sort((a, b) => {
          const dtA = new Date(`${a.date} ${a.time || "00:00:00"}`).getTime();
          const dtB = new Date(`${b.date} ${b.time || "00:00:00"}`).getTime();
          return (isNaN(dtB) ? new Date(b.date).getTime() : dtB) - (isNaN(dtA) ? new Date(a.date).getTime() : dtA);
        });
        setArchivedTransactions(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "archived_transactions");
      }
    );

    const qCats = query(collection(db, "categories"));
    const unsubscribeCats = onSnapshot(
      qCats,
      (snapshot) => {
        if (snapshot.empty) {
          // Preload default categories
          PRELOADED_CATEGORIES.forEach(async (c) => {
            await addDoc(collection(db, "categories"), c);
          });
        } else {
          const list: Category[] = [];
          snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Category);
          });
          setCategories(list);
          if (list.length > 0) {
            setCategory((prev) => prev || list[0].name);
            setFabCategory((prev) => prev || list[0].name);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "categories");
      }
    );

    return () => {
      unsubscribeTrans();
      unsubscribeArchived();
      unsubscribeCats();
    };
  }, []);

  // Fetch Loans, Temp Loans, and Formal Loans for Outstanding Debt Card in real-time
  useEffect(() => {
    const unsubLoans = onSnapshot(
      query(collection(db, "loans")),
      (snapshot) => {
        const list: Loan[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Loan));
        setLoans(list);
      },
      (err) => console.error("Error loading loans for dashboard:", err)
    );

    const unsubTempLoans = onSnapshot(
      query(collection(db, "tempLoans")),
      (snapshot) => {
        const list: TempLoan[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as TempLoan));
        setTempLoans(list);
      },
      (err) => console.error("Error loading tempLoans for dashboard:", err)
    );

    const unsubFormalLoans = onSnapshot(
      query(collection(db, "formalLoans")),
      (snapshot) => {
        const list: FormalLoan[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as FormalLoan));
        setFormalLoans(list);
      },
      (err) => console.error("Error loading formalLoans for dashboard:", err)
    );

    return () => {
      unsubLoans();
      unsubTempLoans();
      unsubFormalLoans();
    };
  }, []);

  // Compute Aggregates
  const activeTransactions = transactions.filter((t) => !t.deleted);
  const currentMonthStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const allTimeIncome = activeTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const allTimeExpense = activeTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthlyTrans = activeTransactions.filter((t) => t.date.startsWith(currentMonthStr));

  const monthlyIncome = monthlyTrans
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const monthlyExpense = monthlyTrans
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Compute Outstanding Debts for Summary Card
  const thavanaiDebt = loans
    .filter((l) => l.status === "live")
    .reduce((sum, l) => {
      const paid = (l.installments || []).reduce((s: number, inst: any) => s + (inst.type === "skip" ? 0 : inst.amount), 0);
      return sum + Math.max(0, l.amount - paid);
    }, 0);

  const friendDebt = tempLoans
    .filter((l) => l.loanDirection === "borrowed" && l.status === "live")
    .reduce((sum, l) => {
      const paid = (l.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
      return sum + Math.max(0, l.amount - paid);
    }, 0);

  const goldLoanDebt = formalLoans
    .filter((l) => l.loanType === "gold" && l.status === "live")
    .reduce((sum, l) => {
      const paid = (l.payments || []).filter((p: any) => !p.isInterestOnly).reduce((s: number, p: any) => s + p.amount, 0);
      return sum + Math.max(0, l.amount - paid);
    }, 0);

  const personalLoanDebt = formalLoans
    .filter((l) => l.loanType === "personal" && l.status === "live")
    .reduce((sum, l) => {
      const paid = (l.payments || []).filter((p: any) => !p.isInterestOnly).reduce((s: number, p: any) => s + p.amount, 0);
      return sum + Math.max(0, l.amount - paid);
    }, 0);

  const homeLoanDebt = formalLoans
    .filter((l) => l.loanType === "housing" && l.status === "live")
    .reduce((sum, l) => {
      const paid = (l.payments || []).filter((p: any) => !p.isInterestOnly).reduce((s: number, p: any) => s + p.amount, 0);
      return sum + Math.max(0, l.amount - paid);
    }, 0);

  const overallDebt = thavanaiDebt + friendDebt + goldLoanDebt + personalLoanDebt + homeLoanDebt;
  const dailyPayoffAmount = Math.round(overallDebt / 365);

  // Setup Dynamic Charts Data
  const expensesGrouped = activeTransactions
    .filter((t) => t.type === "expense")
    .reduce((acc: { [key: string]: number }, t) => {
      acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
      return acc;
    }, {});

  const pieData = Object.entries(expensesGrouped).map(([name, value]) => ({
    name,
    value
  }));

  const last6Months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setDate(1); // Reset day of the month to 1 to prevent overflow (e.g. Feb 31 -> Mar 3)
    d.setMonth(d.getMonth() - i);
    const mStr = d.toISOString().slice(0, 7);
    const mLabel = d.toLocaleString("default", { month: "short" });
    const inc = activeTransactions
      .filter((t) => t.type === "income" && t.date.startsWith(mStr))
      .reduce((s, t) => s + Number(t.amount), 0);
    const exp = activeTransactions
      .filter((t) => t.type === "expense" && t.date.startsWith(mStr))
      .reduce((s, t) => s + Number(t.amount), 0);
    return { name: mLabel, Income: inc, Expense: exp, monthKey: mStr };
  }).reverse();

  // Get AI Insight on Spending Patterns from Server Proxy
  const getAISuggestions = async () => {
    setAiLoading(true);
    setAiSuggestion("");
    try {
      const response = await fetch(getApiUrl("/api/ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          payload: {
            transactions: activeTransactions.slice(0, 30).map((t) => ({
              id: t.id,
              amount: t.amount,
              category: t.category,
              date: t.date,
              description: t.description || "",
              type: t.type
            }))
          }
        })
      });
      const data = await response.json();
      if (data.suggestion) {
        setAiSuggestion(data.suggestion);
      } else {
        setAiSuggestion("All items look healthy and structured. Focus on minimizing luxury category costs!");
      }
    } catch (e) {
      console.error(e);
      setAiSuggestion("Check connection status. Rules fallback: Keep Family Travel allocations under 15% of total income.");
    } finally {
      setAiLoading(false);
    }
  };

  // Trigger automated comparison alert
  const getBudgetAlerts = () => {
    const travelThisMonth = monthlyTrans
      .filter((t) => t.category.toLowerCase().includes("travel") || t.category.toLowerCase().includes("petrol"))
      .reduce((s, t) => s + Number(t.amount), 0);

    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStr = prevMonth.toISOString().slice(0, 7);
    const travelPrevMonth = activeTransactions
      .filter((t) => (t.category.toLowerCase().includes("travel") || t.category.toLowerCase().includes("petrol")) && t.date.startsWith(prevMonthStr))
      .reduce((s, t) => s + Number(t.amount), 0);

    if (travelThisMonth > travelPrevMonth && travelPrevMonth > 0) {
      const pct = Math.round(((travelThisMonth - travelPrevMonth) / travelPrevMonth) * 100);
      return `⚠️ Budget Alert: You spent ${pct}% more on Travel & transit this month vs last month (Rs. ${travelThisMonth} vs Rs. ${travelPrevMonth}).`;
    }
    return null;
  };

  // Camera Photo capturing with visual Crop Modal trigger
  const triggerCamera = async () => {
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
  };

  const handleCroppedImage = async (croppedFile: File) => {
    setCropImageSrc("");
    setUploading(true);
    setFormError("");
    try {
      const attach = await handleFileUpload(croppedFile, "transactions", croppedFile.name);
      setTempAttachments((prev) => [...prev, attach]);
    } catch (err: any) {
      console.error("Camera upload error:", err);
      setFormError(err.message || "Failed to process captured image.");
    } finally {
      setUploading(false);
    }
  };

  // Voice Note capturing using MediaRecorder API with low bitrate constraint
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
          const fileObj = new File([audioBlob], "voice_note.webm", { type: mediaRecorder.mimeType || "audio/webm" });
          const attach = await handleFileUpload(fileObj, "transactions", "Voice Record.webm");
          setTempAttachments((prev) => [...prev, attach]);
        } catch (err: any) {
          console.error("Audio upload error:", err);
          setFormError(err.message || "Failed to upload audio recording.");
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (e) {
      alert("Microphone connection not allowed or missing.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      // Stop stream tracks
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  // Document attachments
  const handleDocumentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      setFormError("");
      try {
        const attach = await handleFileUpload(file, "transactions", file.name || "document");
        setTempAttachments((prev) => [...prev, attach]);
      } catch (err: any) {
        console.error("Document upload error:", err);
        setFormError(err.message || "Failed to upload document.");
      } finally {
        setUploading(false);
      }
    }
  };

  // Save Transaction — saves directly without confirm modal (same flow as quick add)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("Please enter a valid Amount greater than 0.");
      return;
    }
    if (!category) {
      setFormError("Please select a Category.");
      return;
    }
    setIsSubmitting(true);
    const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const payload: Omit<Transaction, "id"> = {
      type,
      amount: Number(amount),
      category,
      subCategory: subCategory || "General",
      description: description.trim(),
      date,
      time: nowTime,
      paymentMethod,
      attachments: tempAttachments,
      deleted: false,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      editHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "transactions"), payload);
      setAmount("");
      setDescription("");
      setSubCategory("");
      setTags("");
      setPaymentMethod("Cash");
      setTempAttachments([]);
      setFormError("");
      alert("Transaction logged successfully!");
    } catch (error: any) {
      console.error("Failed to save transaction registry:", error);
      let msg = error.message || String(error);
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch (e) {}
      setFormError(`Failed to save entry: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // FAB submit handler with double submission lock
  const handleFabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fabAmount || !fabCategory) {
      alert("Please fill in Amount and Category!");
      return;
    }
    setFabIsSubmitting(true);
    const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const payload: Omit<Transaction, "id"> = {
      type: fabType,
      amount: Number(fabAmount),
      category: fabCategory,
      subCategory: fabSubCategory || "General",
      description: fabDescription,
      date: fabDate,
      time: nowTime,
      paymentMethod: fabPaymentMethod,
      attachments: [],
      deleted: false,
      tags: [],
      editHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "transactions"), payload);
      setFabAmount("");
      setFabDescription("");
      setFabSubCategory("");
      setFabOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "transactions");
    } finally {
      setFabIsSubmitting(false);
    }
  };

  // Edit / Update Transaction with Mandatory Edit Reason
  const handleEditClick = (trans: Transaction) => {
    setEditingTransaction(trans);
    setEditReason("");
    // Populate form with edits
    setType(trans.type);
    setAmount(trans.amount.toString());
    setCategory(trans.category);
    setSubCategory(trans.subCategory || "");
    setDescription(trans.description || "");
    setDate(trans.date);
    setTags(trans.tags ? trans.tags.join(", ") : "");
    setTempAttachments(trans.attachments || []);
  };

  const saveEdit = async () => {
    if (!editingTransaction) return;
    if (!editReason.trim()) {
      alert("Edit Reason is mandatory!");
      return;
    }

    const updatedHistory = [
      ...(editingTransaction.editHistory || []),
      {
        timestamp: new Date().toISOString(),
        reason: editReason,
        previousData: {
          amount: editingTransaction.amount,
          category: editingTransaction.category,
          subCategory: editingTransaction.subCategory,
          description: editingTransaction.description,
          date: editingTransaction.date
        }
      }
    ];

    try {
      const transRef = doc(db, "transactions", editingTransaction.id);
      await updateDoc(transRef, {
        type,
        amount: Number(amount),
        category,
        subCategory: subCategory || "General",
        description,
        date,
        tags: tags ? tags.split(",").map((t) => t.trim()) : [],
        attachments: tempAttachments,
        editHistory: updatedHistory
      });

      setEditingTransaction(null);
      setEditReason("");
      setAmount("");
      setDescription("");
      setSubCategory("");
      setTags("");
      setTempAttachments([]);
      alert("Transaction updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${editingTransaction.id}`);
    }
  };

  // Soft Delete Transaction (moves to archived_transactions collection)
  const handleDeleteClick = async (id: string) => {
    if (confirm("Are you sure you want to soft-delete this transaction record?")) {
      try {
        const transRef = doc(db, "transactions", id);
        const transSnap = await getDoc(transRef);
        if (transSnap.exists()) {
          const transData = transSnap.data();
          const batch = writeBatch(db);
          const archRef = doc(db, "archived_transactions", id);
          batch.set(archRef, {
            ...transData,
            deleted: true,
            archivedAt: new Date().toISOString()
          });
          batch.delete(transRef);
          await batch.commit();
          alert("Transaction soft-deleted and moved to archive.");
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
      }
    }
  };

  // Restore Transaction (moves from archived_transactions back to transactions)
  const handleRestoreTransaction = async (id: string) => {
    try {
      const archRef = doc(db, "archived_transactions", id);
      const archSnap = await getDoc(archRef);
      if (archSnap.exists()) {
        const archData = archSnap.data();
        const batch = writeBatch(db);
        const transRef = doc(db, "transactions", id);
        batch.set(transRef, {
          ...archData,
          deleted: false,
          restoredAt: new Date().toISOString()
        });
        batch.delete(archRef);
        await batch.commit();
        alert("Transaction restored successfully.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `archived_transactions/${id}`);
    }
  };

  // Permanent Delete Transaction (requires PIN 2525)
  const handlePermanentDeleteTransaction = async (id: string) => {
    const pin = prompt("Enter 4-digit Security PIN to permanently delete this archived transaction:");
    if (pin === null) return;
    if (pin !== "2525") {
      alert("Invalid PIN! Permanent deletion denied.");
      return;
    }
    try {
      await deleteDoc(doc(db, "archived_transactions", id));
      alert("Transaction permanently deleted.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `archived_transactions/${id}`);
    }
  };

  // Automatically sync/update form category state when type changes or categories load
  useEffect(() => {
    const filtered = categories.filter((c) => c.type === type || c.type === "both");
    if (filtered.length > 0) {
      if (!filtered.some((c) => c.name === category)) {
        setCategory(filtered[0].name);
        setSubCategory("");
      }
    } else {
      setCategory("");
      setSubCategory("");
    }
  }, [type, categories, category]);

  useEffect(() => {
    const filtered = categories.filter((c) => c.type === fabType || c.type === "both");
    if (filtered.length > 0) {
      if (!filtered.some((c) => c.name === fabCategory)) {
        setFabCategory(filtered[0].name);
        setFabSubCategory("");
      }
    } else {
      setFabCategory("");
      setFabSubCategory("");
    }
  }, [fabType, categories, fabCategory]);

  // Create Category Custom Item
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      await addDoc(collection(db, "categories"), {
        name: newCatName.trim(),
        subCategories: newSubTags ? newSubTags.split(",").map((s) => s.trim()).filter(Boolean) : ["General"],
        type: newCatType
      });
      setNewCatName("");
      setNewSubTags("");
      setNewCatType("expense");
      alert("Category added successfully!");
    } catch (e) {
      alert("Could not save category.");
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCatId || !newCatName.trim()) return;

    try {
      const catRef = doc(db, "categories", editingCatId);
      await updateDoc(catRef, {
        name: newCatName.trim(),
        subCategories: newSubTags ? newSubTags.split(",").map((s) => s.trim()).filter(Boolean) : ["General"],
        type: newCatType
      });
      setEditingCatId(null);
      setNewCatName("");
      setNewSubTags("");
      setNewCatType("expense");
      alert("Category updated successfully!");
    } catch (err) {
      alert("Could not update category.");
    }
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    if (confirm(`Are you sure you want to delete category "${name}"? This category and its subcategories will be removed.`)) {
      try {
        await deleteDoc(doc(db, "categories", catId));
        if (editingCatId === catId) {
          setEditingCatId(null);
          setNewCatName("");
          setNewSubTags("");
          setNewCatType("expense");
        }
        alert("Category deleted successfully!");
      } catch (err) {
        alert("Could not delete category.");
      }
    }
  };

  // Add a sub-category under a specific category
  const handleAddSubCategory = async (cat: Category, newSubName: string) => {
    if (!newSubName.trim()) {
      alert("Sub-category name cannot be empty!");
      return;
    }
    const cleanSub = newSubName.trim();
    if (cat.subCategories && cat.subCategories.includes(cleanSub)) {
      alert("Sub-category already exists!");
      return;
    }
    const updatedSubs = [...(cat.subCategories || []), cleanSub];
    try {
      const catRef = doc(db, "categories", cat.id);
      await updateDoc(catRef, { subCategories: updatedSubs });
    } catch (err) {
      alert("Could not add sub-category.");
    }
  };

  // Edit/Rename a sub-category under a specific category
  const handleEditSubCategory = async (cat: Category, oldSubName: string, newSubName: string) => {
    if (!newSubName.trim() || oldSubName === newSubName) return;
    const cleanSub = newSubName.trim();
    if (cat.subCategories && cat.subCategories.includes(cleanSub)) {
      alert("Sub-category name already exists!");
      return;
    }
    const updatedSubs = (cat.subCategories || []).map(s => s === oldSubName ? cleanSub : s);
    try {
      const catRef = doc(db, "categories", cat.id);
      await updateDoc(catRef, { subCategories: updatedSubs });
    } catch (err) {
      alert("Could not rename sub-category.");
    }
  };

  // Delete a sub-category under a specific category
  const handleDeleteSubCategory = async (cat: Category, subToDelete: string) => {
    const updatedSubs = (cat.subCategories || []).filter(s => s !== subToDelete);
    try {
      const catRef = doc(db, "categories", cat.id);
      await updateDoc(catRef, { subCategories: updatedSubs });
    } catch (err) {
      alert("Could not delete sub-category.");
    }
  };

  // Render helper for transaction cards
  const renderTransactionCard = (t: Transaction) => (
    <div
      id={`trans-${t.id}`}
      key={t.id}
      className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3 relative overflow-hidden hover:border-slate-700 transition"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${t.type === "income" ? "bg-emerald-400" : "bg-rose-500"}`}
          />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white font-sans">{t.category}</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                {t.subCategory || "General"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
             {t.description && <p className="text-2xs text-slate-400 leading-relaxed">{t.description}</p>}
             {t.paymentMethod && (
               <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-700">
                 {t.paymentMethod}
               </span>
             )}
           </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-bold font-mono ${t.type === "income" ? "text-emerald-450 font-black" : "text-rose-400"}`}>
            {t.type === "income" ? "+" : "-"} ₹ {t.amount.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{t.date}{t.time ? " · " + t.time : ""}</span>
        </div>
      </div>

      {/* Inline visual showing loaded media clips */}
      {t.attachments && t.attachments.length > 0 && (
        <div className="flex gap-2 items-center flex-wrap pt-2 border-t border-slate-800/60">
          {t.attachments.map((at, i) => (
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
              ) : at.type.startsWith("audio/") ? (
                <button
                  type="button"
                  onClick={() => setActiveAttachment(at)}
                  className="flex items-center gap-1 text-[10px] text-amber-400 bg-slate-800 px-2.5 py-1 rounded cursor-pointer hover:bg-slate-750 transition font-mono border border-slate-700"
                  title="Click to play voice note"
                >
                  <Mic className="w-3.5 h-3.5 text-amber-400" /> Play Audio
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveAttachment(at)}
                  className="flex items-center gap-1 text-[10px] text-cyan-400 bg-slate-800 px-2.5 py-1 rounded cursor-pointer hover:bg-slate-750 transition font-mono border border-slate-700"
                  title="Click to view document"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" /> View Doc
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit History view */}
      {t.editHistory && t.editHistory.length > 0 && (
        <div className="mt-2 bg-slate-900/55 p-2 rounded-lg text-[9px] font-mono text-slate-400 space-y-1">
          <div className="flex items-center gap-1 text-slate-300 font-sans font-bold">
            <Clock className="w-3 h-3 text-cyan-400" />
            Edit History Logging:
          </div>
          {t.editHistory.map((hist, idx) => (
            <div key={idx} className="border-l border-cyan-500/30 pl-1.5 py-0.5">
              <span>{new Date(hist.timestamp).toLocaleDateString()}:</span>
              <span className="text-white ml-1">"{hist.reason}"</span>
              <span className="text-slate-500 ml-1">(Previous value: Rs. {hist.previousData?.amount})</span>
            </div>
          ))}
        </div>
      )}

      {/* Action tags bottom border */}
      <div className="flex justify-between items-center pt-2 border-t border-slate-800/40">
        <div className="flex gap-1.5 flex-wrap">
          {t.tags?.map((tag, idx) => (
            <span key={idx} className="text-[10px] text-cyan-300/80 bg-cyan-950/40 border border-cyan-800/30 px-1.5 py-0.5 rounded-full font-mono">
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          {listMode === "active" ? (
            <>
              <button
                onClick={() => handleEditClick(t)}
                className="text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                title="Edit Transaction"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteClick(t.id)}
                className="text-slate-400 hover:text-rose-455 transition cursor-pointer"
                title="Soft Delete"
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleRestoreTransaction(t.id)}
                className="text-slate-400 hover:text-emerald-450 transition cursor-pointer"
                title="Restore Transaction"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handlePermanentDeleteTransaction(t.id)}
                className="text-slate-400 hover:text-rose-500 transition cursor-pointer"
                title="Permanently Delete"
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Filter & Search Log
  const sourceList = listMode === "active" ? activeTransactions : archivedTransactions;
  const filteredList = sourceList.filter((t) => {
    const matchesSearch =
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.subCategory?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === "all" || t.category === filterCategory;
    const matchesMonth = !filterMonth || t.date.startsWith(filterMonth);
    return matchesSearch && matchesCategory && matchesMonth;
  });

  const selectedCategoryObj = categories.find((c) => c.name === category);

  return (
    <div className="space-y-6">
      {/* Module Cover & Fast Alerts */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-800 gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block block" />
            Module 1 — Income & Expense Manager
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Analyze, track, and optimize transactions instantly with AI budgets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Inline Quick Add Button */}
          <button
            onClick={() => setQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 font-semibold text-xs rounded-xl shadow-lg cursor-pointer transition"
            title="Quick Add Transaction"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quick Add</span>
          </button>

          {/* AI Spending Advice Button */}
          <button
            onClick={getAISuggestions}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
            {aiLoading ? "Consulting Claude..." : "AI Spending Advice"}
          </button>
        </div>
      </div>

      {getBudgetAlerts() && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-mono">
          {getBudgetAlerts()}
        </div>
      )}

      {/* AI Intelligence Suggestion Block */}
      {aiSuggestion && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-indigo-200 text-xs space-y-2 animate-fade-in-up shadow-lg">
          <div className="flex items-center gap-2 font-bold text-white uppercase tracking-wider font-sans text-2xs">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Claude AI Smart Nudge
          </div>
          <p className="leading-relaxed font-mono whitespace-pre-wrap">{aiSuggestion}</p>
        </div>
      )}

      {/* Finance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm">
          <span className="text-slate-400 text-2xs font-mono uppercase tracking-wider">MONTHLY INCOME</span>
          <span className="text-2xl font-black text-emerald-400 mt-1">₹ {monthlyIncome.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-2 font-mono">All-time: ₹{allTimeIncome.toLocaleString()}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm">
          <span className="text-slate-400 text-2xs font-mono uppercase tracking-wider">MONTHLY EXPENSE</span>
          <span className="text-2xl font-black text-rose-400 mt-1">₹ {monthlyExpense.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-2 font-mono">All-time: ₹{allTimeExpense.toLocaleString()}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm">
          <span className="text-slate-400 text-2xs font-mono uppercase tracking-wider">NET BALANCE</span>
          <span className="text-2xl font-black text-indigo-400 mt-1">₹ {(monthlyIncome - monthlyExpense).toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-2 font-mono">All-time: ₹{(allTimeIncome - allTimeExpense).toLocaleString()}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-sm hover:border-rose-500/30 transition duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all duration-500" />
          <span className="text-slate-400 text-2xs font-mono uppercase tracking-wider">OVERALL OUTSTANDING DEBT</span>
          <span className="text-2xl font-black text-rose-500 mt-1">₹ {overallDebt.toLocaleString()}</span>
          
          <div className="mt-2.5 space-y-1 text-[10px] font-mono text-slate-400 border-t border-slate-850 pt-2">
            <div className="flex justify-between">
              <span>Thavanai Debt:</span>
              <span className="text-slate-300 font-bold">₹ {thavanaiDebt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Friend Debt:</span>
              <span className="text-slate-300 font-bold">₹ {friendDebt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Gold Loan:</span>
              <span className="text-slate-300 font-bold">₹ {goldLoanDebt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Personal Loan:</span>
              <span className="text-slate-300 font-bold">₹ {personalLoanDebt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Home Loan:</span>
              <span className="text-slate-300 font-bold">₹ {homeLoanDebt.toLocaleString()}</span>
            </div>
          </div>

          {overallDebt > 0 && (
            <div className="mt-3 bg-rose-950/20 border border-rose-500/20 rounded-lg p-2 text-[9px] text-rose-300 leading-normal">
              💡 <span className="font-bold text-rose-200">1-Year Payoff:</span> Earn/save <span className="font-extrabold text-white">₹ {dailyPayoffAmount.toLocaleString()}</span> daily to close this.
            </div>
          )}
        </div>
      </div>

      {/* Charts Block */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Share Recharts Pie */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 shadow-sm">
          <h3 className="text-xs font-bold font-sans text-white uppercase tracking-wider mb-4">Expense Categories Shares</h3>
          {pieData.length > 0 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} fill="#8884d8">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `Rs. ${Number(value).toLocaleString()}`} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-xs text-slate-400 font-mono">
              Establish expense records to display data shares.
            </div>
          )}
        </div>

        {/* 6 Months Trend Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 shadow-sm">
          <h3 className="text-xs font-bold font-sans text-white uppercase tracking-wider mb-4">Half Yearly Finance Trends</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last6Months}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip formatter={(value) => `Rs. ${Number(value).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Bar dataKey="Income" fill="#10b981" />
                <Bar dataKey="Expense" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="page-layout">
        {/* Entry Forms */}
        <div className="left-panel bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm overflow-visible">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-indigo-400" />
            {editingTransaction ? "Edit Transaction Form" : "Add Income / Expense"}
          </h3>

          <form onSubmit={editingTransaction ? (e) => e.preventDefault() : handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setType("expense")}
                className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${
                  type === "expense" ? "bg-rose-500/10 text-rose-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setType("income")}
                className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${
                  type === "income" ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Income
              </button>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 text-left"
                placeholder="e.g. 5000"
                required
              />
            </div>

            {/* Category selection */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-2xs text-slate-400 uppercase tracking-wider font-mono">Category</label>
                <button
                  type="button"
                  onClick={() => setManageCategories(!manageCategories)}
                  className="text-2xs text-indigo-400 hover:underline cursor-pointer"
                >
                  Manage
                </button>
              </div>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setSubCategory("");
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {categories
                  .filter((c) => c.type === type || c.type === "both")
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Sub-Category tags selection */}
            {selectedCategoryObj && (
              <div>
                <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Sub-Category</label>
                <select
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select Sub-tag...</option>
                  {selectedCategoryObj.subCategories.map((sub, i) => (
                    <option key={i} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Transaction Date */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">
                <CreditCard className="w-3 h-3 inline mr-1" />Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as Transaction["paymentMethod"])}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 h-16 resize-none"
                placeholder="Purchase details or notes..."
              />
            </div>

            {/* Tags (Optional) */}
            <div>
              <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Tags (comma separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="e.g. fuel, grocery, monthly"
              />
            </div>

            {/* Attachments controller */}
            <div className="space-y-2 border-t border-slate-800/60 pt-3">
              <span className="block text-2xs text-slate-400 uppercase tracking-wider font-mono">Attachments</span>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={triggerCamera}
                  className="flex-1 flex items-center justify-center gap-1 bg-slate-950 py-2 border border-slate-800 text-slate-300 rounded-xl hover:text-white hover:border-indigo-500 active:scale-95 transition text-[10px] cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-indigo-400" />
                  Photo
                </button>
                
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  className={`flex-1 flex items-center justify-center gap-1 bg-slate-950 py-2 border text-slate-300 rounded-xl hover:text-white transition text-[10px] cursor-pointer ${
                    recording ? "border-rose-500 text-rose-400 animate-pulse" : "border-slate-800 hover:border-indigo-500"
                  }`}
                >
                  {recording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-indigo-400" />}
                  {recording ? "Stop" : "Audio"}
                </button>

                <label className="flex-1 flex items-center justify-center gap-1 bg-slate-950 py-2 border border-slate-800 text-slate-300 rounded-xl hover:text-white hover:border-indigo-500 active:scale-95 transition text-[10px] cursor-pointer">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Doc
                  <input type="file" onChange={handleDocumentChange} accept=".pdf,image/*" className="hidden" />
                </label>
              </div>

              {uploading && (
                <div className="text-[10px] text-indigo-400 font-mono text-center animate-pulse">
                  Uploading captured media...
                </div>
              )}

              {/* Temp Attachment Displays */}
              {tempAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {tempAttachments.map((at, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-slate-805 px-2 py-1 rounded text-[10px]">
                      <span 
                        onClick={() => setActiveAttachment(at)}
                        className="text-indigo-400 hover:text-indigo-350 hover:underline cursor-pointer font-sans truncate max-w-[80px]"
                        title="Click to view attachment"
                      >
                        {at.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTempAttachments(tempAttachments.filter((_, idx) => idx !== i))}
                        className="text-rose-400 hover:text-rose-300 font-bold ml-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Buttons & Reason field for Editable transactions */}
            {formError && (
              <p className="text-[11px] text-rose-455 font-mono text-left bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                ⚠️ {formError}
              </p>
            )}
            {editingTransaction ? (
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
                    className="w-full bg-slate-950 border border-rose-500/30 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    placeholder="Provide reason for modification..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs rounded-xl cursor-pointer"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTransaction(null);
                      setAmount("");
                    }}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition text-white font-semibold text-xs rounded-xl cursor-pointer mt-2"
              >
                Save Registry Entry
              </button>
            )}
          </form>

          {/* Manage Categories Popup Modal */}
          {manageCategories && (
            <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="glass-card w-full max-w-lg rounded-2xl p-6 shadow-2xl relative space-y-4 bg-slate-900 border border-slate-800 max-h-[85vh] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setManageCategories(false);
                    setEditingCatId(null);
                    setNewCatName("");
                    setNewSubTags("");
                    setNewCatType("expense");
                  }}
                  className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 rounded-lg transition cursor-pointer hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    {editingCatId ? "Edit Category" : "Add Custom Category"}
                  </h4>
                  {editingCatId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(null);
                        setNewCatName("");
                        setNewSubTags("");
                        setNewCatType("expense");
                      }}
                      className="text-2xs text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <form onSubmit={editingCatId ? handleUpdateCategory : handleAddCategory} className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Category Name *</label>
                    <input
                      type="text"
                      placeholder="Category Name"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs text-white px-3 py-2 rounded-xl focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-mono">Initial Sub-categories (comma-separated, optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Rent, Electricity, Water"
                      value={newSubTags}
                      onChange={(e) => setNewSubTags(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs text-white px-3 py-2 rounded-xl focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-between items-center text-xs pt-1">
                    <div className="flex gap-2.5 text-2xs">
                      <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="newCatType"
                          checked={newCatType === "expense"}
                          onChange={() => setNewCatType("expense")}
                          className="cursor-pointer"
                        />
                        Expense
                      </label>
                      <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="newCatType"
                          checked={newCatType === "income"}
                          onChange={() => setNewCatType("income")}
                          className="cursor-pointer"
                        />
                        Income
                      </label>
                      <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="newCatType"
                          checked={newCatType === "both"}
                          onChange={() => setNewCatType("both")}
                          className="cursor-pointer"
                        />
                        Both
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-semibold rounded-xl cursor-pointer transition"
                    >
                      {editingCatId ? "Save Changes" : "Create Category"}
                    </button>
                  </div>
                </form>

                {/* List of existing categories to edit or delete */}
                <div className="pt-4 border-t border-slate-800/80 space-y-2">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Registered Categories ({categories.length})</h5>
                  <div className="max-h-[35vh] overflow-y-auto space-y-3 pr-1">
                    {categories.map((c) => (
                      <div key={c.id} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-xs">{c.name}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ${
                              c.type === "income" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              c.type === "expense" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                              "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            }`}>
                              {c.type}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatId(c.id);
                                setNewCatName(c.name);
                                setNewSubTags(c.subCategories?.join(", ") || "");
                                setNewCatType(c.type);
                              }}
                              className="text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                              title="Edit Category Name/Type"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(c.id, c.name)}
                              className="text-slate-400 hover:text-rose-455 transition cursor-pointer"
                              title="Delete Category"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Sub-categories management inline */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-900/60">
                          <span className="block text-[9px] text-slate-500 font-mono uppercase">Sub-Categories:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {(!c.subCategories || c.subCategories.length === 0) ? (
                              <span className="text-[10px] text-slate-650 italic">No sub-categories.</span>
                            ) : (
                              c.subCategories.map((sub, i) => {
                                const isEditingThisSub = editingSub?.catId === c.id && editingSub?.subName === sub;
                                return (
                                  <div key={i} className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
                                    {isEditingThisSub ? (
                                      <input
                                        type="text"
                                        value={editingSubVal}
                                        onChange={(e) => setEditingSubVal(e.target.value)}
                                        className="bg-slate-950 border border-slate-700 text-white rounded px-1 py-0.5 text-[9px] focus:outline-none w-16"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleEditSubCategory(c, sub, editingSubVal);
                                            setEditingSub(null);
                                          } else if (e.key === "Escape") {
                                            setEditingSub(null);
                                          }
                                        }}
                                      />
                                    ) : (
                                      <span
                                        className="text-slate-300 cursor-pointer hover:text-white"
                                        onClick={() => {
                                          setEditingSub({ catId: c.id, subName: sub });
                                          setEditingSubVal(sub);
                                        }}
                                        title="Click to rename"
                                      >
                                        {sub}
                                      </span>
                                    )}
                                    {isEditingThisSub ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleEditSubCategory(c, sub, editingSubVal);
                                          setEditingSub(null);
                                        }}
                                        className="text-emerald-400 hover:text-emerald-350 font-bold ml-0.5"
                                      >
                                        ✓
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSubCategory(c, sub)}
                                      className="text-rose-400 hover:text-rose-350 font-bold ml-1 cursor-pointer"
                                      title="Delete subcategory"
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Inline subcategory addition */}
                          <div className="flex gap-1.5 mt-2 pt-1">
                            <input
                              type="text"
                              placeholder="New sub-category..."
                              value={newSubVals[c.id] || ""}
                              onChange={(e) => setNewSubVals({ ...newSubVals, [c.id]: e.target.value })}
                              className="bg-slate-950 border border-slate-900 text-[10px] text-white px-2 py-1 rounded-lg focus:border-indigo-500 focus:outline-none w-full max-w-[150px]"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddSubCategory(c, newSubVals[c.id] || "");
                                  setNewSubVals({ ...newSubVals, [c.id]: "" });
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                handleAddSubCategory(c, newSubVals[c.id] || "");
                                setNewSubVals({ ...newSubVals, [c.id]: "" });
                              }}
                              className="text-[9px] bg-slate-900 hover:bg-slate-800 text-indigo-400 px-2 py-1 rounded-lg border border-slate-800 font-bold cursor-pointer"
                            >
                              + Add Sub
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transactions Logs and Records */}
        <div id="transactions-log" className="right-panel space-y-4">
          {/* Active vs Archive sub-tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setListMode("active")}
              className={`flex-1 py-1.5 text-center font-bold rounded-lg transition cursor-pointer ${
                listMode === "active" ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Active Transactions ({activeTransactions.length})
            </button>
            <button
              onClick={() => setListMode("archive")}
              className={`flex-1 py-1.5 text-center font-bold rounded-lg transition cursor-pointer ${
                listMode === "archive" ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Archived Transactions ({archivedTransactions.length})
            </button>
          </div>

          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search description, tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl pl-9 pr-3.5 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Select filter & monthly picker */}
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-2xs text-white rounded-lg px-2.5 py-1.5 flex-1"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-2xs text-white rounded-lg px-2 py-1 flex-1"
              />
            </div>
          </div>

          {/* List display */}
          {loading ? (
            <div className="text-center font-mono py-12 text-xs text-slate-400 animate-pulse">
              Synchronizing Ledger logs...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="bg-slate-900 p-12 text-center rounded-2xl border border-slate-800 text-xs text-slate-400 font-mono">
              No transactions match active filter configurations.
            </div>
          ) : listMode === "active" ? (
            /* Split layout: left side expenses, right side income */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Expenses */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 bg-rose-500 rounded-full" />
                  Expenses Detail
                </h4>
                {filteredList.filter((t) => t.type === "expense").length === 0 ? (
                  <div className="bg-slate-900/50 p-6 text-center rounded-xl border border-slate-850 text-2xs text-slate-505 font-mono">
                    No expenses recorded under current filters.
                  </div>
                ) : (
                  filteredList.filter((t) => t.type === "expense").map(renderTransactionCard)
                )}
              </div>

              {/* Right Column: Income */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 bg-emerald-450 rounded-full" />
                  Income Detail
                </h4>
                {filteredList.filter((t) => t.type === "income").length === 0 ? (
                  <div className="bg-slate-900/50 p-6 text-center rounded-xl border border-slate-850 text-2xs text-slate-505 font-mono">
                    No income recorded under current filters.
                  </div>
                ) : (
                  filteredList.filter((t) => t.type === "income").map(renderTransactionCard)
                )}
              </div>
            </div>
          ) : (
            /* Archive simple grid layout */
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 pr-1 items-start">
              {filteredList.map(renderTransactionCard)}
            </div>
          )}
        </div>
      </div>



      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm rounded-2xl p-6 shadow-2xl relative space-y-4 bg-slate-900 border border-slate-800">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <Plus className="w-4 h-4 text-indigo-400" />
                Quick Add Transaction
              </h3>
              <button
                onClick={() => setQuickAddOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="space-y-4">
              {/* Type Toggle */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setQuickType("expense")}
                  className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition cursor-pointer ${
                    quickType === "expense" ? "bg-rose-500/10 text-rose-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setQuickType("income")}
                  className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition cursor-pointer ${
                    quickType === "income" ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Income
                </button>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Amount (₹)</label>
                <input
                  type="number"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="Amount (₹)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  required
                  autoFocus
                />
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-2xs text-slate-400 uppercase tracking-wider mb-1 font-mono">Description</label>
                <input
                  type="text"
                  value={quickDescription}
                  onChange={(e) => setQuickDescription(e.target.value)}
                  placeholder="Description (single line)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={quickSubmitting}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {quickSubmitting ? "Saving..." : "Save Entry"}
              </button>
            </form>
          </div>
        </div>
      )}
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
          onCrop={handleCroppedImage}
          onCancel={() => setCropImageSrc("")}
          onRetake={() => {
            setCropImageSrc("");
            triggerCamera();
          }}
        />
      )}

    </div>
  );
}
