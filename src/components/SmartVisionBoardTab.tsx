import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  setDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, getApiUrl } from "../firebase";
import { handleFileUpload } from "../attachmentHelper";
import {
  Target,
  Sparkles,
  Compass,
  Calendar,
  FileText,
  Trash2,
  Edit,
  Plus,
  X,
  Check,
  Star,
  Download,
  AlertCircle,
  Clock,
  Layout,
  TrendingUp,
  Award,
  BookOpen,
  Eye,
  Activity,
  Heart,
  ChevronRight,
  Maximize2,
  RefreshCw,
  Sliders,
  Bell,
  Camera,
  Pin,
  PinOff
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, PieChart, Pie
} from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Goal Category configuration with icons and styling
interface CategoryConfig {
  value: string;
  label: string;
  emoji: string;
  color: string;
  darkColor: string;
}

const CATEGORIES: CategoryConfig[] = [
  { value: "Finance", label: "Financial Goals", emoji: "💰", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", darkColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "Trading", label: "Trading Goals", emoji: "📈", color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/25", darkColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  { value: "Health", label: "Health & Fitness", emoji: "🍎", color: "bg-rose-500/10 text-rose-600 border-rose-500/25", darkColor: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  { value: "Family", label: "Family", emoji: "🏠", color: "bg-amber-500/10 text-amber-600 border-amber-500/25", darkColor: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "Spiritual", label: "Spiritual", emoji: "✨", color: "bg-purple-500/10 text-purple-600 border-purple-500/25", darkColor: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "Personal Growth", label: "Personal Growth", emoji: "🌱", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/25", darkColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  { value: "Career", label: "Career & Business", emoji: "💼", color: "bg-blue-500/10 text-blue-600 border-blue-500/25", darkColor: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "Travel", label: "Travel", emoji: "✈️", color: "bg-sky-500/10 text-sky-600 border-sky-500/25", darkColor: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  { value: "Dream House", label: "Dream House", emoji: "🏡", color: "bg-orange-500/10 text-orange-600 border-orange-500/25", darkColor: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "Dream Car", label: "Dream Car", emoji: "🏎️", color: "bg-red-500/10 text-red-600 border-red-500/25", darkColor: "bg-red-500/10 text-red-400 border-red-500/20" },
  { value: "Luxury Lifestyle", label: "Luxury Lifestyle", emoji: "👑", color: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/25", darkColor: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20" },
  { value: "Relationships", label: "Relationships", emoji: "❤️", color: "bg-pink-500/10 text-pink-600 border-pink-500/25", darkColor: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  { value: "Passion Projects", label: "Passion Projects", emoji: "🎨", color: "bg-teal-500/10 text-teal-600 border-teal-500/25", darkColor: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  { value: "Custom Category", label: "Custom Category", emoji: "⭐", color: "bg-slate-500/10 text-slate-650 border-slate-500/25", darkColor: "bg-slate-500/10 text-slate-400 border-slate-500/20" }
];

// Prebuilt Vision Board Templates
interface PrebuiltTemplate {
  name: string;
  description: string;
  icon: string;
  category: string;
  affirmation: string;
  quote: string;
  reward: string;
  milestones: string[];
}

const TEMPLATES: PrebuiltTemplate[] = [
  {
    name: "Wealth Vision Board",
    description: "Build robust financial foundations and multiple income streams.",
    icon: "💰",
    category: "Finance",
    affirmation: "Wealth flows to me abundantly, and I manage it with absolute wisdom.",
    quote: "Do not save what is left after spending, but spend what is left after saving.",
    reward: "A premium luxury watch to mark my financial discipline.",
    milestones: ["Reach 10 Lakhs Liquid Savings", "Invest in 5 Dividend Stocks", "Setup Auto-SIP for Mutual Funds"]
  },
  {
    name: "Trading Success",
    description: "Consistency, risk management, and emotional mastery in markets.",
    icon: "📈",
    category: "Trading",
    affirmation: "I am a disciplined trader who honors stops and executes the plan flawlessly.",
    quote: "The goal of a successful trader is to make the best trades. Money is secondary.",
    reward: "Premium dual-monitor trading desk setup upgrade.",
    milestones: ["Track every trade in journal for 30 consecutive days", "Maintain risk limit < 1.5% per trade", "Achieve 3 months of consecutive profitability"]
  },
  {
    name: "Fitness Transformation",
    description: "Rebuild athletic baseline, stamina, and holistic longevity.",
    icon: "💪",
    category: "Health",
    affirmation: "My body is strong, energetic, and capable of amazing achievements.",
    quote: "Take care of your body. It's the only place you have to live.",
    reward: "Premium smart fitness ring tracker.",
    milestones: ["Complete 12-week hypertrophy program", "Reach target weight of 75kg", "Perform 10 consecutive pull-ups"]
  },
  {
    name: "Dream House Template",
    description: "Purchase or construct the ultimate sanctuary for my family.",
    icon: "🏡",
    category: "Dream House",
    affirmation: "I live in my beautiful, custom-designed dream home filled with love.",
    quote: "A house is made of bricks and beams; a home is made of hopes and dreams.",
    reward: "Hosting a grand housewarming party for my loved ones.",
    milestones: ["Finalize land / apartment layout selection", "Secure downpayment capital in safe deposits", "Approve architectural draft blueprint"]
  },
  {
    name: "Business Growth",
    description: "Scale business enterprise and build sustainable commercial pipelines.",
    icon: "💼",
    category: "Career",
    affirmation: "My business adds massive value and grows steadily every single day.",
    quote: "The best way to predict the future is to create it.",
    reward: "A weekend luxury resort getaway celebration.",
    milestones: ["Acquire 10 premium enterprise clients", "Launch new software service product", "Achieve 50% year-on-year revenue scale"]
  },
  {
    name: "Spiritual Growth",
    description: "Cultivate inner silence, daily meditation, and absolute mindfulness.",
    icon: "🧘",
    category: "Spiritual",
    affirmation: "I am grounded, peaceful, and aligned with my higher purpose.",
    quote: "Quiet the mind and the soul will speak.",
    reward: "Spiritual retreat visit to Rishikesh.",
    milestones: ["Meditate daily for 20 minutes for 60 days", "Complete reading of Bhagavad Gita", "Conduct weekly digital detox Sundays"]
  },
  {
    name: "Family Goals",
    description: "Nurture relationships, quality bonding, and active family care.",
    icon: "👨‍👩‍👧‍👦",
    category: "Family",
    affirmation: "My family is united in love, trust, health, and mutual respect.",
    quote: "Family is not an important thing. It's everything.",
    reward: "Professional family canvas photo session.",
    milestones: ["Setup monthly family dinner dates", "Invest in comprehensive family term health insurance", "Plan 2 annual family holiday roadtrips"]
  },
  {
    name: "Travel Bucket List",
    description: "Explore cultures, expand horizons, and gather lifelong memories.",
    icon: "🌍",
    category: "Travel",
    affirmation: "I travel the world safely, experiencing rich cultures and learning daily.",
    quote: "Travel is the only thing you buy that makes you richer.",
    reward: "Premium polycarbonate travel luggage bag.",
    milestones: ["Visit the Swiss Alps", "Experience the cherry blossom season in Kyoto", "Go scuba diving in the Andaman islands"]
  },
  {
    name: "Luxury Lifestyle Vision",
    description: "Experience premium quality products and high-grade living standards.",
    icon: "👑",
    category: "Luxury Lifestyle",
    affirmation: "I appreciate quality, refine my tastes, and command luxury values.",
    quote: "Quality remains long after the price is forgotten.",
    reward: "Sleek personalized handmade leather portfolio.",
    milestones: ["Test drive luxury SUV option", "Assemble custom tailor-made business suits", "Acquire premium signature writing instrument"]
  }
];

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  targetDate?: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  startDate: string;
  targetDate: string;
  deadline: string;
  targetAmount?: number;
  currentProgress: number;
  completionPercentage: number;
  milestones: Milestone[];
  habitLink?: string;
  reminderSettings: {
    enabled: boolean;
    frequency: "daily" | "weekly" | "monthly";
  };
  notes: string;
  dailyActionSteps: string[];
  weeklyActionPlan: string[];
  imageUrl?: string;
  imageName?: string;
  inspirationalQuote?: string;
  rewardAfterCompletion?: string;
  status: "Planned" | "In Progress" | "Achieved";
  isPinned: boolean;
  unpinReason?: string;
  position?: {
    x: number;
    y: number;
    rotation: number;
    width?: number;
    height?: number;
  };
  archived?: boolean;
  archiveReason?: string;
  createdAt?: any;
  updatedAt?: any;
}

const DECOY_GOALS: Goal[] = [
  {
    id: "decoy-goal-1",
    title: "Buy Premium Luxury Apartment",
    description: "Acquire a spacious 3 BHK apartment in Madurai with prime park view, private balcony, and top amenities. Establish a warm home sanctuary.",
    category: "Dream House",
    priority: "critical",
    startDate: "2026-01-01",
    targetDate: "2027-12-31",
    deadline: "2027-12-31",
    targetAmount: 8500000,
    currentProgress: 2500000,
    completionPercentage: 29,
    milestones: [
      { id: "ms-1", title: "Approve flat site selection", completed: true },
      { id: "ms-2", title: "Complete initial 20% downpayment", completed: true },
      { id: "ms-3", title: "Secure home loan authorization", completed: false },
      { id: "ms-4", title: "Interior woodwork planning approval", completed: false }
    ],
    reminderSettings: { enabled: true, frequency: "monthly" },
    notes: "Review local RERA registry compliance. Maintain monthly savings SIP.",
    dailyActionSteps: ["Review daily real estate listings for 10 minutes", "Avoid unnecessary impulse micro-spending"],
    weeklyActionPlan: ["Call construction manager for updates on Friday", "Sync with bank loan counselor"],
    inspirationalQuote: "A home is built of love and dreams, standing firm on strong foundations.",
    rewardAfterCompletion: "Host a traditional grand housewarming feast for entire family.",
    status: "In Progress",
    isPinned: true,
    position: { x: 30, y: 15, rotation: -2, width: 230 },
    imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "decoy-goal-2",
    title: "Achieve Trading Account Scale",
    description: "Consistently scale trading corpus while sticking to low-risk parameters (< 1.5% max capital risk per trade). Honor exit targets and stop losses strictly.",
    category: "Trading",
    priority: "high",
    startDate: "2026-03-01",
    targetDate: "2026-09-30",
    deadline: "2026-09-30",
    targetAmount: 2000000,
    currentProgress: 1200000,
    completionPercentage: 60,
    milestones: [
      { id: "ms-5", title: "Setup detailed Dhan sync automation", completed: true },
      { id: "ms-6", title: "Maintain trading log streak for 30 consecutive days", completed: true },
      { id: "ms-7", title: "Accumulate 15 Lakhs capital corpus", completed: true },
      { id: "ms-8", title: "Achieve consistent 20% quarterly growth return", completed: false }
    ],
    habitLink: "trading-log-habit",
    reminderSettings: { enabled: true, frequency: "daily" },
    notes: "Review the daily rule sheet prior to placing market orders.",
    dailyActionSteps: ["Complete Nifty chart review before market pre-open", "Log every trade into iK console immediately"],
    weeklyActionPlan: ["Conduct weekend post-market analytics on Nifty", "Refine psychological bias logs"],
    inspirationalQuote: "Letting go of trading FOMO is where true commercial consistency begins.",
    rewardAfterCompletion: "Upgrade home office to ergonomic gaming-grade desk furniture.",
    status: "In Progress",
    isPinned: true,
    position: { x: 70, y: 10, rotation: 3, width: 220 },
    imageUrl: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "decoy-goal-3",
    title: "Fitness Transformation (Athletic V2)",
    description: "Reduce body fat percentage below 14% while building compound power strength (Squat/Deadlift/Bench Press). Maintain structured high-protein diet.",
    category: "Health",
    priority: "high",
    startDate: "2026-01-15",
    targetDate: "2026-07-15",
    deadline: "2026-07-15",
    currentProgress: 75,
    completionPercentage: 75,
    milestones: [
      { id: "ms-9", title: "Achieve consistent 10k daily step count", completed: true },
      { id: "ms-10", title: "Hit 100kg deadlift target reps", completed: true },
      { id: "ms-11", title: "Track protein intake daily via application", completed: false }
    ],
    reminderSettings: { enabled: true, frequency: "daily" },
    notes: "Drink 4L of water daily. Ensure 7.5 hours of solid sleep.",
    dailyActionSteps: ["Complete strength training session in gym", "Log daily body weight statistics"],
    weeklyActionPlan: ["Perform weekly meal prep on Sunday evenings", "Measure body fat levels"],
    inspirationalQuote: "Discipline is choosing between what you want now and what you want most.",
    rewardAfterCompletion: "Treat myself to professional sports recovery massage therapy.",
    status: "In Progress",
    isPinned: true,
    position: { x: 12, y: 55, rotation: 1, width: 220 },
    imageUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "decoy-goal-4",
    title: "Explore Japan Cultural Safari",
    description: "A 10-day immersive cultural adventure covering Tokyo, Kyoto, Osaka, and Hokkaido. Experience local culinary heritage, bullet trains, and shrines.",
    category: "Travel",
    priority: "medium",
    startDate: "2026-04-01",
    targetDate: "2026-11-15",
    deadline: "2026-11-15",
    targetAmount: 350000,
    currentProgress: 180000,
    completionPercentage: 51,
    milestones: [
      { id: "ms-12", title: "Secure visa permissions approval", completed: false },
      { id: "ms-13", title: "Complete flights and hotel booking", completed: false },
      { id: "ms-14", title: "Establish travel savings vault targets", completed: true }
    ],
    reminderSettings: { enabled: false, frequency: "weekly" },
    notes: "Learn basic Japanese conversational phrases via online modules.",
    dailyActionSteps: ["Learn 3 Japanese words daily", "Save 200 Rs. daily to travel jar"],
    weeklyActionPlan: ["Watch local cultural travel vlogs on weekend", "Review hotel deals"],
    inspirationalQuote: "One's destination is never a place, but a new way of seeing things.",
    rewardAfterCompletion: "Buy high-quality Japanese chef knife as a lifetime souvenir.",
    status: "Planned",
    isPinned: true,
    position: { x: 50, y: 50, rotation: -3, width: 230 },
    imageUrl: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500&auto=format&fit=crop&q=60"
  }
];

export default function SmartVisionBoardTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile image changeable state
  const [profileImage, setProfileImage] = useState(() => {
    return localStorage.getItem("ik_profile_image") || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60";
  });
  const profileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingProfile, setUploadingProfile] = useState(false);

  // Sub-Navigation Tabs
  const [activeSubTab, setActiveSubTab] = useState<"board" | "settings" | "dashboard" | "calendar" | "reports" | "archive">("board");

  // Lock screen authentication state (matching Thoughts Journal)
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("vision_unlocked") === "true");
  const [decoyMode, setDecoyMode] = useState(() => sessionStorage.getItem("vision_decoy") === "true");
  const [pin, setPin] = useState("");
  const [lockError, setLockError] = useState("");
  const [shouldShake, setShouldShake] = useState(false);
  const [decoyGoals, setDecoyGoals] = useState<Goal[]>(() => {
    const saved = localStorage.getItem("ik_decoy_goals");
    return saved ? JSON.parse(saved) : DECOY_GOALS;
  });

  // UI States
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [activeGoalDetail, setActiveGoalDetail] = useState<Goal | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [aiPrompts, setAiPrompts] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<"scrapbook" | "glass">("scrapbook");

  // Goal Form Fields State
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("Finance");
  const [formPriority, setFormPriority] = useState<Goal["priority"]>("medium");
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formTargetAmount, setFormTargetAmount] = useState("");
  const [formCurrentProgress, setFormCurrentProgress] = useState("0");
  const [formNotes, setFormNotes] = useState("");
  const [formInspirationalQuote, setFormInspirationalQuote] = useState("");
  const [formReward, setFormReward] = useState("");
  const [formHabitLink, setFormHabitLink] = useState("");
  const [formDailyActionSteps, setFormDailyActionSteps] = useState("");
  const [formWeeklyActionPlan, setFormWeeklyActionPlan] = useState("");
  const [formReminderEnabled, setFormReminderEnabled] = useState(false);
  const [formReminderFreq, setFormReminderFreq] = useState<Goal["reminderSettings"]["frequency"]>("weekly");
  const [formImage, setFormImage] = useState("");
  const [formImageName, setFormImageName] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formMilestones, setFormMilestones] = useState<{ title: string; completed: boolean }[]>([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");

  // Reports tab state
  const [selectedReport, setSelectedReport] = useState<"weekly" | "monthly" | "achievement" | "habit" | "board" | "success">("board");
  const [generatingReport, setGeneratingReport] = useState(false);

  // Drag and Drop State
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const [tempPositions, setTempPositions] = useState<{ [id: string]: { x: number; y: number } }>({});
  const [dragStartPoint, setDragStartPoint] = useState({ x: 0, y: 0 });
  const [isPointerMoved, setIsPointerMoved] = useState(false);

  // Auto-lock when user switches away from the tab
  useEffect(() => {
    return () => {
      sessionStorage.removeItem("vision_unlocked");
      sessionStorage.removeItem("vision_decoy");
    };
  }, []);

  // Sync profile photo from DB / localStorage
  useEffect(() => {
    if (!unlocked) return;
    if (decoyMode) {
      const local = localStorage.getItem("ik_decoy_profile_image");
      if (local) setProfileImage(local);
    } else {
      getDoc(doc(db, "settings", "vision_profile"))
        .then((snap) => {
          if (snap.exists() && snap.data().profileImageUrl) {
            setProfileImage(snap.data().profileImageUrl);
          } else {
            const local = localStorage.getItem("ik_profile_image");
            if (local) setProfileImage(local);
          }
        })
        .catch(() => {
          const local = localStorage.getItem("ik_profile_image");
          if (local) setProfileImage(local);
        });
    }
  }, [decoyMode, unlocked]);

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingProfile(true);
      try {
        const attach = await handleFileUpload(file, "profile_images", file.name || "profile.jpg");
        setProfileImage(attach.url);
        if (decoyMode) {
          localStorage.setItem("ik_decoy_profile_image", attach.url);
        } else {
          localStorage.setItem("ik_profile_image", attach.url);
          await setDoc(doc(db, "settings", "vision_profile"), { profileImageUrl: attach.url }, { merge: true });
        }
        alert("Vision Board profile photo updated!");
      } catch (err) {
        console.error("Profile upload error:", err);
        alert("Failed to upload photo. Local/dataURI fallback applied.");
      } finally {
        setUploadingProfile(false);
      }
    }
  };

  // Fetch from Firestore (Real mode)
  useEffect(() => {
    if (decoyMode) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "goals"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Goal[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Goal);
        });
        setGoals(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "goals");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [decoyMode]);

  // Save decoy mode changes to localStorage
  const saveDecoyGoals = (newDecoys: Goal[]) => {
    setDecoyGoals(newDecoys);
    localStorage.setItem("ik_decoy_goals", JSON.stringify(newDecoys));
  };

  // PIN Unlock logic
  const handleUnlock = (codeToTest: string) => {
    const encoded = btoa(codeToTest);
    if (encoded === "Njg5MTYwMDI=") { // 68916002
      sessionStorage.setItem("vision_unlocked", "true");
      sessionStorage.setItem("vision_decoy", "false");
      setUnlocked(true);
      setDecoyMode(false);
      setPin("");
      setLockError("");
    } else if (encoded === "MjUyNQ==") { // 2525
      sessionStorage.setItem("vision_unlocked", "true");
      sessionStorage.setItem("vision_decoy", "true");
      setUnlocked(true);
      setDecoyMode(true);
      setPin("");
      setLockError("");
    } else {
      setLockError("Incorrect security PIN");
      setPin("");
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 400);
    }
  };

  // Keyboard support for security PIN
  useEffect(() => {
    if (unlocked) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        if (pin.length < 8) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setLockError("");
          if (nextPin === "2525") {
            sessionStorage.setItem("vision_unlocked", "true");
            sessionStorage.setItem("vision_decoy", "true");
            setUnlocked(true);
            setDecoyMode(true);
            setPin("");
          } else if (nextPin === "68916002") {
            sessionStorage.setItem("vision_unlocked", "true");
            sessionStorage.setItem("vision_decoy", "false");
            setUnlocked(true);
            setDecoyMode(false);
            setPin("");
          }
        }
      } else if (e.key === "Backspace") {
        setPin((prev) => prev.slice(0, -1));
        setLockError("");
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        setPin("");
        setLockError("");
      } else if (e.key === "Enter") {
        if (pin) {
          handleUnlock(pin);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [pin, unlocked]);

  // Image Upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingImage(true);
      try {
        const attach = await handleFileUpload(file, "vision_images", file.name || "image.jpg");
        setFormImage(attach.url);
        setFormImageName(attach.name);
      } catch (err) {
        console.error("Image upload failed:", err);
        alert("Image upload failed. Offline/dataURI fallback applied.");
      } finally {
        setUploadingImage(false);
      }
    }
  };

  // Smooth Hardware-Accelerated pointer Drag and Drop handlers
  const handlePointerDown = (e: React.PointerEvent, g: Goal) => {
    if (activeSubTab !== "board") return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input")) {
      return;
    }
    const cardEl = e.currentTarget.closest(".draggable-vision-card") as HTMLElement;
    if (!cardEl || !boardRef.current) return;

    const boardRect = boardRef.current.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    setDraggingCardId(g.id);
    setDragOffset({
      x: e.clientX - cardRect.left,
      y: e.clientY - cardRect.top
    });
    setDragStartPoint({ x: e.clientX, y: e.clientY });
    setIsPointerMoved(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingCardId || !boardRef.current) return;

    const distance = Math.hypot(e.clientX - dragStartPoint.x, e.clientY - dragStartPoint.y);
    if (distance > 5) {
      setIsPointerMoved(true);
    }

    const boardRect = boardRef.current.getBoundingClientRect();
    const relativeX = e.clientX - boardRect.left - dragOffset.x;
    const relativeY = e.clientY - boardRect.top - dragOffset.y;

    const xPct = Math.max(0, Math.min(90, (relativeX / boardRect.width) * 100));
    const yPct = Math.max(0, Math.min(85, (relativeY / boardRect.height) * 100));

    setTempPositions((prev) => ({
      ...prev,
      [draggingCardId]: { x: xPct, y: yPct }
    }));
  };

  const handlePointerUp = (e: React.PointerEvent, g: Goal) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input")) {
      return;
    }
    if (!draggingCardId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (!isPointerMoved) {
      setDraggingCardId(null);
      // Tap/Click - open detail modal
      setActiveGoalDetail(g);
      return;
    }

    const finalPos = tempPositions[g.id];
    if (finalPos) {
      updateCardPosition(g.id, finalPos.x, finalPos.y);
      setTempPositions((prev) => {
        const next = { ...prev };
        delete next[g.id];
        return next;
      });
    }
    setDraggingCardId(null);
  };

  const handleCardDragEnd = () => {
    if (draggingCardId) {
      const finalPos = tempPositions[draggingCardId];
      if (finalPos) {
        updateCardPosition(draggingCardId, finalPos.x, finalPos.y);
      }
      setTempPositions((prev) => {
        const next = { ...prev };
        delete next[draggingCardId];
        return next;
      });
    }
    setDraggingCardId(null);
  };

  const updateCardPosition = (cardId: string, x: number, y: number) => {
    const activeGoals = decoyMode ? decoyGoals : goals;
    const item = activeGoals.find((g) => g.id === cardId);
    if (!item) return;

    const nextPos: any = {
      x,
      y,
      rotation: item.position?.rotation ?? (Math.random() * 6 - 3),
      width: item.position?.width ?? 220
    };
    if (item.position?.height !== undefined) {
      nextPos.height = item.position.height;
    }

    if (decoyMode) {
      const updated = decoyGoals.map((g) => (g.id === cardId ? { ...g, position: nextPos } : g));
      saveDecoyGoals(updated);
    } else {
      updateDoc(doc(db, "goals", cardId), { position: nextPos }).catch((err) =>
        console.error("Failed to update position:", err)
      );
    }
  };

  const handleTogglePin = async (g: Goal) => {
    if (g.isPinned) {
      const reason = prompt("Enter a reason for unpinning this goal card from your board:");
      if (reason === null) return;
      const trimmedReason = reason.trim() || "No reason provided";

      if (decoyMode) {
        const updated = decoyGoals.map((item) =>
          item.id === g.id ? { ...item, isPinned: false, unpinReason: trimmedReason } : item
        );
        saveDecoyGoals(updated);
        alert(`Goal unpinned with reason: "${trimmedReason}"`);
      } else {
        try {
          await updateDoc(doc(db, "goals", g.id), {
            isPinned: false,
            unpinReason: trimmedReason
          });
          alert(`Goal unpinned with reason: "${trimmedReason}"`);
        } catch (err) {
          console.error("Failed to unpin goal:", err);
          alert("Error unpinning goal");
        }
      }
    } else {
      if (decoyMode) {
        const updated = decoyGoals.map((item) =>
          item.id === g.id ? { ...item, isPinned: true, unpinReason: "" } : item
        );
        saveDecoyGoals(updated);
        alert("Goal pinned back to your board!");
      } else {
        try {
          await updateDoc(doc(db, "goals", g.id), {
            isPinned: true,
            unpinReason: ""
          });
          alert("Goal pinned back to your board!");
        } catch (err) {
          console.error("Failed to pin goal:", err);
          alert("Error pinning goal");
        }
      }
    }
  };

  // Prebuilt template import handler
  const handleImportTemplate = (tpl: PrebuiltTemplate) => {
    const defaultPositions = [
      { x: 10, y: 15, rotation: -3 },
      { x: 75, y: 12, rotation: 2 },
      { x: 15, y: 55, rotation: 3 },
      { x: 70, y: 50, rotation: -2 },
      { x: 45, y: 60, rotation: 1 }
    ];
    
    const activeGoals = decoyMode ? decoyGoals : goals;
    const posIndex = activeGoals.length % defaultPositions.length;
    const selectedPos = defaultPositions[posIndex];

    const newGoalPayload: Omit<Goal, "id"> = {
      title: tpl.name,
      description: tpl.description,
      category: tpl.category,
      priority: "medium",
      startDate: new Date().toISOString().split("T")[0],
      targetDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 6 months
      deadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      currentProgress: 0,
      completionPercentage: 0,
      milestones: tpl.milestones.map((title, idx) => ({
        id: `tpl-ms-${Date.now()}-${idx}`,
        title,
        completed: false
      })),
      reminderSettings: { enabled: true, frequency: "weekly" },
      notes: tpl.affirmation,
      dailyActionSteps: ["Spend 5 minutes reflecting on affirmations"],
      weeklyActionPlan: ["Review progress every Sunday"],
      inspirationalQuote: tpl.quote,
      rewardAfterCompletion: tpl.reward,
      status: "Planned",
      isPinned: true,
      position: {
        x: selectedPos.x,
        y: selectedPos.y,
        rotation: selectedPos.rotation,
        width: 220
      }
    };

    if (decoyMode) {
      const freshGoal: Goal = {
        id: `tpl-decoy-${Date.now()}`,
        ...newGoalPayload
      };
      saveDecoyGoals([...decoyGoals, freshGoal]);
      alert(`Imported "${tpl.name}" into Decoy Vision Board!`);
    } else {
      addDoc(collection(db, "goals"), newGoalPayload)
        .then(() => alert(`Imported "${tpl.name}" to database!`))
        .catch((err) => handleFirestoreError(err, OperationType.CREATE, "goals"));
    }
  };

  // Submit Goal Form (Add & Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return alert("Goal Title is required.");

    const activeGoals = decoyMode ? decoyGoals : goals;
    const progressVal = Number(formCurrentProgress);
    const targetAmtVal = formTargetAmount ? Number(formTargetAmount) : undefined;
    let calculatedPercentage = 0;
    
    if (targetAmtVal && targetAmtVal > 0) {
      calculatedPercentage = Math.round((progressVal / targetAmtVal) * 100);
    } else {
      // Calculate based on milestone completion
      const totalMilestones = formMilestones.length;
      if (totalMilestones > 0) {
        const completedMilestones = formMilestones.filter((m) => m.completed).length;
        calculatedPercentage = Math.round((completedMilestones / totalMilestones) * 100);
      } else {
        calculatedPercentage = progressVal >= 100 ? 100 : progressVal;
      }
    }
    calculatedPercentage = Math.max(0, Math.min(100, calculatedPercentage));

    const statusVal = calculatedPercentage >= 100 ? "Achieved" : progressVal > 0 || formMilestones.some(m => m.completed) ? "In Progress" : "Planned";

    const payload: Omit<Goal, "id"> = {
      title: formTitle.trim(),
      description: formDescription.trim(),
      category: formCategory,
      priority: formPriority,
      startDate: formStartDate,
      targetDate: formTargetDate || formStartDate,
      deadline: formDeadline || formTargetDate || formStartDate,
      targetAmount: targetAmtVal,
      currentProgress: progressVal,
      completionPercentage: calculatedPercentage,
      milestones: formMilestones.map((m) => ({
        id: (m as any).id || `ms-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: m.title,
        completed: m.completed
      })),
      habitLink: formHabitLink || undefined,
      reminderSettings: {
        enabled: formReminderEnabled,
        frequency: formReminderFreq
      },
      notes: formNotes.trim(),
      dailyActionSteps: formDailyActionSteps.split("\n").map(s => s.trim()).filter(Boolean),
      weeklyActionPlan: formWeeklyActionPlan.split("\n").map(s => s.trim()).filter(Boolean),
      imageUrl: formImage || undefined,
      imageName: formImageName || undefined,
      inspirationalQuote: formInspirationalQuote.trim() || undefined,
      rewardAfterCompletion: formReward.trim() || undefined,
      status: statusVal as Goal["status"],
      isPinned: true,
      position: editingGoal?.position ?? {
        x: Math.random() * 50 + 10,
        y: Math.random() * 40 + 15,
        rotation: Math.random() * 6 - 3,
        width: 220
      }
    };

    // Secure Firestore cleanup: remove undefined fields recursively
    const cleanPayload = JSON.parse(JSON.stringify(payload));

    try {
      if (editingGoal) {
        if (decoyMode) {
          const updated = decoyGoals.map((g) => (g.id === editingGoal.id ? { ...g, ...cleanPayload } : g));
          saveDecoyGoals(updated);
          alert("Decoy goal updated!");
        } else {
          await updateDoc(doc(db, "goals", editingGoal.id), cleanPayload);
          alert("Goal updated!");
        }
        setEditingGoal(null);
      } else {
        if (decoyMode) {
          const freshGoal: Goal = {
            id: `decoy-custom-${Date.now()}`,
            ...cleanPayload
          };
          saveDecoyGoals([...decoyGoals, freshGoal]);
          alert("Decoy goal added!");
        } else {
          await addDoc(collection(db, "goals"), cleanPayload);
          alert("Goal saved!");
        }
      }
      resetForm();
      setIsAddFormOpen(false);
      setActiveSubTab("board");
    } catch (err) {
      console.error(err);
      alert("Error saving goal.");
    }
  };

  const handleEditGoalClick = (goal: Goal) => {
    setEditingGoal(goal);
    setFormTitle(goal.title);
    setFormDescription(goal.description);
    setFormCategory(goal.category);
    setFormPriority(goal.priority);
    setFormStartDate(goal.startDate);
    setFormTargetDate(goal.targetDate);
    setFormDeadline(goal.deadline);
    setFormTargetAmount(goal.targetAmount?.toString() ?? "");
    setFormCurrentProgress(goal.currentProgress.toString());
    setFormNotes(goal.notes);
    setFormInspirationalQuote(goal.inspirationalQuote ?? "");
    setFormReward(goal.rewardAfterCompletion ?? "");
    setFormHabitLink(goal.habitLink ?? "");
    setFormDailyActionSteps(goal.dailyActionSteps.join("\n"));
    setFormWeeklyActionPlan(goal.weeklyActionPlan.join("\n"));
    setFormReminderEnabled(goal.reminderSettings.enabled);
    setFormReminderFreq(goal.reminderSettings.frequency);
    setFormImage(goal.imageUrl ?? "");
    setFormImageName(goal.imageName ?? "");
    setFormMilestones(goal.milestones);
    setIsAddFormOpen(true);
    setActiveSubTab("settings");
  };

  const handleDeleteGoal = async (id: string) => {
    const reason = prompt("Enter a reason for archiving/deleting this vision card:");
    if (reason === null) return;
    const trimmedReason = reason.trim() || "No reason provided";
    try {
      if (decoyMode) {
        const updated = decoyGoals.map((g) => g.id === id ? { ...g, archived: true, archiveReason: trimmedReason } : g);
        saveDecoyGoals(updated);
        alert("Decoy goal archived.");
      } else {
        await updateDoc(doc(db, "goals", id), { archived: true, archiveReason: trimmedReason });
        alert("Goal archived successfully.");
      }
      if (activeGoalDetail?.id === id) setActiveGoalDetail(null);
    } catch (err) {
      console.error(err);
      alert("Failed to archive goal.");
    }
  };

  const handleRestoreGoal = async (id: string) => {
    try {
      if (decoyMode) {
        const updated = decoyGoals.map((g) => g.id === id ? { ...g, archived: false, archiveReason: "" } : g);
        saveDecoyGoals(updated);
        alert("Decoy goal restored successfully.");
      } else {
        await updateDoc(doc(db, "goals", id), { archived: false, archiveReason: "" });
        alert("Goal restored successfully.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to restore goal.");
    }
  };

  const handlePermanentDelete = async (id: string) => {
    const enteredPin = prompt("Enter Security PIN to permanently delete this goal:");
    if (enteredPin !== "2525") {
      alert("Incorrect PIN. Permanent deletion aborted.");
      return;
    }
    if (!confirm("Are you sure you want to PERMANENTLY delete this vision card? This action cannot be undone.")) return;
    try {
      if (decoyMode) {
        const updated = decoyGoals.filter((g) => g.id !== id);
        saveDecoyGoals(updated);
        alert("Decoy goal permanently deleted.");
      } else {
        await deleteDoc(doc(db, "goals", id));
        alert("Goal permanently deleted successfully.");
      }
      if (activeGoalDetail?.id === id) setActiveGoalDetail(null);
    } catch (err) {
      console.error(err);
      alert("Failed to permanently delete goal.");
    }
  };

  const resetForm = () => {
    setEditingGoal(null);
    setFormTitle("");
    setFormDescription("");
    setFormCategory("Finance");
    setFormPriority("medium");
    setFormStartDate(new Date().toISOString().split("T")[0]);
    setFormTargetDate("");
    setFormDeadline("");
    setFormTargetAmount("");
    setFormCurrentProgress("0");
    setFormNotes("");
    setFormInspirationalQuote("");
    setFormReward("");
    setFormHabitLink("");
    setFormDailyActionSteps("");
    setFormWeeklyActionPlan("");
    setFormReminderEnabled(false);
    setFormReminderFreq("weekly");
    setFormImage("");
    setFormImageName("");
    setFormMilestones([]);
    setNewMilestoneTitle("");
  };

  const handleAddMilestone = () => {
    if (!newMilestoneTitle.trim()) return;
    setFormMilestones([
      ...formMilestones,
      { title: newMilestoneTitle.trim(), completed: false }
    ]);
    setNewMilestoneTitle("");
  };

  const handleRemoveMilestone = (idx: number) => {
    setFormMilestones(formMilestones.filter((_, i) => i !== idx));
  };

  const handleToggleMilestoneCheck = (idx: number) => {
    setFormMilestones(
      formMilestones.map((m, i) => (i === idx ? { ...m, completed: !m.completed } : m))
    );
  };

  // AI suggestion mock trigger
  const handleFetchAiSuggestions = async () => {
    if (!formTitle.trim()) return alert("Enter a Goal Title first so AI has context.");
    setAiLoading(true);
    setAiPrompts("");
    try {
      const res = await fetch(getApiUrl("/api/ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "trading_rules_advice", // Uses existing AI routing key or fallback
          payload: { rules: [formTitle, formDescription, formCategory] }
        })
      });
      const data = await res.json();
      setAiPrompts(
        data.suggestion ||
          `AI Recommendations for "${formTitle}":\n\n` +
          `1. Break down this goal into 3 milestones of increasing values.\n` +
          `2. Suggest weekly review habit on Friday market close.\n` +
          `3. Recommendation: Connect this goal to daily habit tracking.\n` +
          `4. Target Completion Timeline: 6 months with 15% buffer.`
      );
    } catch {
      setAiPrompts(
        `AI suggestions for "${formTitle}":\n` +
        `• Suggested Milestone 1: Save first 25% downpayment.\n` +
        `• Habit Link suggestion: Log expense sheet daily.\n` +
        `• Recommended daily action: Review budget limits.`
      );
    } finally {
      setAiLoading(false);
    }
  };

  // PDF Report exports
  const handlePdfGeneration = () => {
    setGeneratingReport(true);
    try {
      const activeGoals = decoyMode ? decoyGoals : goals;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const dateStr = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });

      // Banner background
      doc.setFillColor(15, 23, 42); // slate-950
      doc.rect(0, 0, 210, 36, "F");

      doc.setFillColor(99, 102, 241); // indigo-500
      doc.rect(0, 0, 5, 36, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("iK Smart Vision Board", 12, 14);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(`Strategic Goal Audit Report | Mode: ${decoyMode ? "Decoy (Sandbox)" : "Primary Vault"}`, 12, 21);
      doc.text(`Generated: ${dateStr}`, 12, 28);

      doc.setTextColor(99, 102, 241);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("PRIVATE & CONFIDENTIAL", 198, 14, { align: "right" });

      // Summary details card row
      const total = activeGoals.length;
      const completed = activeGoals.filter((g) => g.status === "Achieved").length;
      const active = activeGoals.filter((g) => g.status === "In Progress").length;
      const planned = activeGoals.filter((g) => g.status === "Planned").length;

      doc.setFillColor(30, 41, 59);
      doc.roundedRect(12, 42, 42, 16, 2, 2, "F");
      doc.roundedRect(58, 42, 42, 16, 2, 2, "F");
      doc.roundedRect(104, 42, 42, 16, 2, 2, "F");
      doc.roundedRect(150, 42, 48, 16, 2, 2, "F");

      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text("TOTAL GOALS", 33, 47, { align: "center" });
      doc.text("COMPLETED", 79, 47, { align: "center" });
      doc.text("ACTIVE / PROGRESS", 125, 47, { align: "center" });
      doc.text("PLANNED / PENDING", 174, 47, { align: "center" });

      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(total.toString(), 33, 53, { align: "center" });
      doc.setTextColor(16, 185, 129); // green
      doc.text(completed.toString(), 79, 53, { align: "center" });
      doc.setTextColor(99, 102, 241); // indigo
      doc.text(active.toString(), 125, 53, { align: "center" });
      doc.setTextColor(245, 158, 11); // amber
      doc.text(planned.toString(), 174, 53, { align: "center" });

      // Main Table
      const rows = activeGoals.map((g) => [
        g.title,
        g.category,
        g.priority.toUpperCase(),
        g.deadline,
        `${g.completionPercentage}%`,
        g.status
      ]);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Vision Goals Audit Sheet", 12, 68);

      autoTable(doc, {
        startY: 72,
        head: [["Goal Title", "Category", "Priority", "Target Date", "Progress %", "Status"]],
        body: rows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 12, right: 12 }
      });

      // Detailed card breakdown
      let currentY = (doc as any).lastAutoTable.finalY + 10;
      doc.text("Detail Affirmation & Action Steps", 12, currentY);
      currentY += 4;

      activeGoals.forEach((g) => {
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFillColor(248, 250, 252);
        doc.rect(12, currentY, 186, 25, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(12, currentY, 186, 25, "S");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(g.title, 15, currentY + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(`Affirmation: ${g.notes || "Not specified"}`, 15, currentY + 11);
        doc.text(`Daily Steps: ${g.dailyActionSteps.slice(0, 2).join(", ") || "None"}`, 15, currentY + 16);
        doc.text(`Milestones: ${g.milestones.map((m) => `${m.title} (${m.completed ? "Y" : "N"})`).slice(0, 3).join(" | ")}`, 15, currentY + 21);

        currentY += 28;
      });

      // Footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 285, 210, 12, "F");
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text("iK Smart Vision Board Module  |  End-to-End Crypt Vault", 12, 292);
        doc.text(`Page ${i} of ${totalPages}`, 198, 292, { align: "right" });
      }

      doc.save(`iK_VisionBoard_Report_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Error printing PDF report.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const activeGoals = (decoyMode ? decoyGoals : goals).filter((g) => !g.archived);

  // Dashboard calculations
  const totalGoals = activeGoals.length;
  const completedGoals = activeGoals.filter((g) => g.status === "Achieved").length;
  const activeCount = activeGoals.filter((g) => g.status === "In Progress").length;
  const pendingGoals = activeGoals.filter((g) => g.status === "Planned").length;
  const completionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  // Streak counter (dummy simulator based on progress items)
  const streakCount = Math.max(0, activeGoals.filter(g => g.completionPercentage > 0).length + 3);

  // Group by Category progress
  const categoryData = CATEGORIES.map((cat) => {
    const catGoals = activeGoals.filter((g) => g.category === cat.value);
    const count = catGoals.length;
    const avgProgress =
      count > 0 ? Math.round(catGoals.reduce((s, g) => s + g.completionPercentage, 0) / count) : 0;
    return {
      name: cat.value,
      count,
      progress: avgProgress
    };
  }).filter((c) => c.count > 0);

  // Calendar dates mapping helper
  const renderCalendarDays = () => {
    const daysInMonth = 30;
    const items = [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      const dayGoals = activeGoals.filter((g) => g.targetDate === dateStr);
      items.push({
        day: i,
        date: dateStr,
        goals: dayGoals
      });
    }
    return items;
  };

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4 select-none">
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
              <Target className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <h3 className="text-base font-bold text-white font-sans tracking-tight">Smart Vision Board</h3>
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
          {lockError && (
            <div className="text-[10px] text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 py-1.5 px-3.5 rounded-xl inline-block">
              {lockError}
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
                    setLockError("");
                    if (nextPin === "2525") {
                      sessionStorage.setItem("vision_unlocked", "true");
                      sessionStorage.setItem("vision_decoy", "true");
                      setUnlocked(true);
                      setDecoyMode(true);
                      setPin("");
                    } else if (nextPin === "68916002") {
                      sessionStorage.setItem("vision_unlocked", "true");
                      sessionStorage.setItem("vision_decoy", "false");
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
                setLockError("");
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
                  setLockError("");
                  if (nextPin === "2525") {
                    sessionStorage.setItem("vision_unlocked", "true");
                    sessionStorage.setItem("vision_decoy", "true");
                    setUnlocked(true);
                    setDecoyMode(true);
                    setPin("");
                  } else if (nextPin === "68916002") {
                    sessionStorage.setItem("vision_unlocked", "true");
                    sessionStorage.setItem("vision_decoy", "false");
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
                setPin((prev) => prev.slice(0, -1));
                setLockError("");
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
    <div className="space-y-6 relative select-none">
      
      {/* Banner & Lock controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block" />
            Module 10 — Smart Vision Board
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem("vision_unlocked");
                sessionStorage.removeItem("vision_decoy");
                setUnlocked(false);
                setDecoyMode(false);
                setPin("");
              }}
              className="p-1.5 bg-slate-950 border border-slate-850 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
              title="Lock Module"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </button>
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Pinterest / Scrapbook style vision cards, timeline milestones, and dashboard analytics.
            {decoyMode && <span className="ml-2 text-rose-450 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 uppercase tracking-widest text-[9px]">Decoy Active</span>}
          </p>
        </div>

        {/* Board theme selection */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeSubTab === "board" && (
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mr-2 text-xs">
              <button
                onClick={() => setSelectedTheme("scrapbook")}
                className={`px-3 py-1 rounded-lg font-medium transition ${selectedTheme === "scrapbook" ? "bg-amber-600/20 text-amber-500" : "text-slate-400 hover:text-white"}`}
              >
                Beige Scrapbook
              </button>
              <button
                onClick={() => setSelectedTheme("glass")}
                className={`px-3 py-1 rounded-lg font-medium transition ${selectedTheme === "glass" ? "bg-indigo-600/20 text-indigo-500" : "text-slate-400 hover:text-white"}`}
              >
                Glass Neon
              </button>
            </div>
          )}

          <button
            onClick={() => {
              resetForm();
              setIsAddFormOpen(true);
              setActiveSubTab("settings");
            }}
            className="flex items-center gap-1 bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Goal
          </button>
        </div>
      </div>

      {/* Sub tabs header navigation */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-px scrollbar-none">
        {([
          { id: "board", label: "Scrapbook Board", icon: Layout },
          { id: "settings", label: "Goal Creation & Settings", icon: Sliders },
          { id: "dashboard", label: "Vision Dashboard", icon: TrendingUp },
          { id: "calendar", label: "Calendar & Roadmap", icon: Calendar },
          { id: "reports", label: "Reports & Export", icon: FileText },
          { id: "archive", label: "Archive Registry", icon: Clock }
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id);
                if (tab.id !== "settings") resetForm();
              }}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-450 hover:text-slate-200 hover:border-slate-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SUB TAB 1: COLLAGE SCRAPBOOK BOARD */}
      {activeSubTab === "board" && (
        <div className="space-y-6">
          
          {/* Prebuilt Templates Quick import */}
          <div className="bg-slate-900 border border-slate-800 p-4.5 rounded-2xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Import Prebuilt Dream templates
            </h3>
            <div className="flex gap-2.5 overflow-x-auto pb-2.5 pt-0.5">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => handleImportTemplate(tpl)}
                  className="flex items-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-indigo-500/30 px-3.5 py-2.5 rounded-2xl text-left transition text-xs shrink-0 select-none cursor-pointer"
                >
                  <span className="text-xl bg-slate-900 p-1.5 rounded-lg">{tpl.icon}</span>
                  <div>
                    <p className="font-bold text-white leading-tight">{tpl.name}</p>
                    <p className="text-[9px] text-slate-500 leading-tight mt-0.5">{tpl.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Collage canvas area */}
          <div
            ref={boardRef}
            onPointerMove={handlePointerMove}
            onMouseLeave={handleCardDragEnd}
            className={`w-full min-h-[620px] rounded-3xl relative border select-none overflow-hidden touch-none transition-all duration-300 ${
              selectedTheme === "scrapbook"
                ? "bg-[radial-gradient(#e5e5e5_1.2px,transparent_1.2px)] [background-size:16px_16px] bg-[#fbf9f4] border-amber-900/10 shadow-inner"
                : "bg-[radial-gradient(#1e293b_1.2px,transparent_1.2px)] [background-size:24px_24px] bg-slate-950 border-slate-800 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"
            }`}
          >
            {/* Center Profile/Dream header */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-10 text-center p-4">
              <input
                type="file"
                ref={profileInputRef}
                onChange={handleProfileImageChange}
                accept="image/*"
                className="hidden"
              />
              <div
                className="relative group cursor-pointer"
                onClick={() => profileInputRef.current?.click()}
                title="Click to Change Photo"
              >
                <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full blur-md opacity-45 group-hover:opacity-75 transition duration-300" />
                <div className="w-24 h-24 rounded-full border-4 border-white bg-slate-200 overflow-hidden relative shadow-lg">
                  {uploadingProfile ? (
                    <div className="w-full h-full bg-slate-950/80 flex items-center justify-center text-[10px] text-white font-mono animate-pulse">
                      Uploading...
                    </div>
                  ) : (
                    <>
                      <img
                        src={profileImage}
                        alt="My Dream Profile"
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 rounded-full">
                        <Camera className="w-5 h-5 text-white" />
                        <span className="text-[7px] text-white uppercase tracking-wider font-mono font-bold mt-1">Change Photo</span>
                      </div>
                    </>
                  )}
                </div>
                {/* Scrapbook pin */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-red-600 rounded-full shadow border-t-2 border-white pointer-events-none z-10" />
              </div>

              {/* Stylish heading banner */}
              <div className="mt-4 bg-[#fdf3c7] border border-amber-900/20 px-6 py-2 rounded-lg shadow-md transform -rotate-1 relative select-none">
                {/* Tape effects */}
                <div className="absolute -top-2 -left-4 w-8 h-4 bg-amber-200/50 border border-amber-300/30 transform -rotate-12" />
                <div className="absolute -top-2 -right-4 w-8 h-4 bg-amber-200/50 border border-amber-300/30 transform rotate-12" />
                <h3 className="font-mono text-base font-bold text-amber-900 tracking-tight uppercase">My Vision Board</h3>
              </div>
            </div>

            {/* Polaroid cards loops */}
            {activeGoals.filter(g => g.isPinned !== false).length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-white/40 backdrop-blur-sm z-0">
                <Target className="w-12 h-12 text-slate-400 mb-2 animate-bounce" />
                <p className="font-bold text-sm">Your Dream Board is Empty</p>
                <p className="text-xs max-w-xs mt-1">Import a template above or click 'Add Goal' to place your first vision card on this board.</p>
              </div>
            ) : (
              activeGoals.filter(g => g.isPinned !== false).map((g) => {
                const isDragging = draggingCardId === g.id;
                const config = CATEGORIES.find(c => c.value === g.category);
                const leftPos = tempPositions[g.id] ? `${tempPositions[g.id].x}%` : `${g.position?.x ?? 20}%`;
                const topPos = tempPositions[g.id] ? `${tempPositions[g.id].y}%` : `${g.position?.y ?? 20}%`;
                return (
                  <div
                    key={g.id}
                    className="absolute draggable-vision-card select-none z-20 group"
                    style={{
                      left: leftPos,
                      top: topPos,
                      transform: `rotate(${g.position?.rotation ?? 0}deg) scale(${isDragging ? 1.05 : 1})`,
                      width: `${g.position?.width ?? 220}px`,
                      cursor: isDragging ? "grabbing" : "grab",
                      transition: isDragging ? "none" : "transform 0.15s ease-out"
                    }}
                  >
                    {/* Sticky Tape Graphic at the top */}
                    {selectedTheme === "scrapbook" ? (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-14 h-4 bg-amber-100/60 border-t border-b border-amber-300/30 border-dashed transform -rotate-2 shadow-sm pointer-events-none z-30" />
                    ) : (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)] pointer-events-none z-30" />
                    )}

                    {/* Polaroid Card Inner */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, g)}
                      onPointerUp={(e) => handlePointerUp(e, g)}
                      className={`p-3 relative rounded shadow-lg transition duration-200 cursor-pointer ${
                        selectedTheme === "scrapbook"
                          ? "bg-white border-2 border-[#eae4d3] hover:shadow-xl text-slate-800"
                          : "bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-indigo-500/40 text-white"
                      }`}
                    >
                      {/* Image Frame */}
                      <div className="aspect-video w-full bg-slate-100 rounded overflow-hidden relative border border-slate-200/50">
                        {g.imageUrl ? (
                          <img
                            src={g.imageUrl}
                            alt={g.title}
                            className="w-full h-full object-cover select-none pointer-events-none"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/10 text-slate-400 select-none">
                            <span className="text-3xl">{config?.emoji ?? "🎯"}</span>
                          </div>
                        )}
                        
                        {/* Target Completion tag */}
                        <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-[8px] text-white font-mono px-1.5 py-0.5 rounded font-bold">
                          {g.deadline}
                        </div>

                        {/* Priority circle */}
                        <div className={`absolute top-1 left-1 w-2 h-2 rounded-full ${
                          g.priority === "critical" ? "bg-rose-500 animate-pulse" :
                          g.priority === "high" ? "bg-red-500" :
                          g.priority === "medium" ? "bg-amber-500" : "bg-emerald-500"
                        }`} title={`${g.priority} priority`} />
                      </div>

                      {/* Card Label / Bottom text */}
                      <div className="pt-2 pb-0.5 space-y-1">
                        <h4 className={`text-xs font-bold leading-tight font-mono tracking-tight ${
                          selectedTheme === "scrapbook" ? "text-amber-950" : "text-slate-150"
                        }`}>
                          {g.title}
                        </h4>
                        
                        {/* Affirmation snippet */}
                        {g.notes && (
                          <p className="text-[9px] italic line-clamp-1 opacity-70 leading-tight">
                            "{g.notes}"
                          </p>
                        )}

                        {/* Progress Bar */}
                        <div className="space-y-0.5 pt-1 pointer-events-none">
                          <div className="flex justify-between text-[8px] font-mono opacity-80">
                            <span>{g.status}</span>
                            <span>{g.completionPercentage}%</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-indigo-600 h-full rounded-full"
                              style={{ width: `${g.completionPercentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Action buttons inside polaroid */}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-200/40 mt-1 pointer-events-auto">
                          <span className={`text-[8px] px-1.5 py-0.5 rounded border uppercase font-mono font-bold ${
                            selectedTheme === "scrapbook" ? (config?.color ?? "bg-slate-100 text-slate-600") : (config?.darkColor ?? "bg-slate-900 text-slate-400")
                          }`}>
                            {config?.emoji} {g.category}
                          </span>

                          <div className="flex gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveGoalDetail(g);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-400 transition"
                              title="Details"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePin(g);
                              }}
                              className="p-1 text-slate-400 hover:text-amber-500 transition font-bold"
                              title="Unpin Card"
                            >
                              <PinOff className="w-3 h-3 text-amber-500 fill-amber-500/20" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditGoalClick(g);
                              }}
                              className="p-1 text-slate-400 hover:text-amber-500 transition"
                              title="Edit"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGoal(g.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 transition"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB TAB 2: GOAL SETTINGS MODULE FORM */}
      {activeSubTab === "settings" && isAddFormOpen && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-6 max-w-4xl mx-auto">
          
          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              {editingGoal ? "Modify Vision Goal Details" : "Construct New Dream Goal Card"}
            </h3>
            <button
              onClick={() => {
                resetForm();
                setIsAddFormOpen(false);
                setActiveSubTab("board");
              }}
              className="p-1 bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            
            {/* Form Fields Section 1: General Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Goal Title *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Purchase Nifty Scalp Corpus Desk"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Dream Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.emoji} {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description and Image Upload */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <div className="md:col-span-2 space-y-1">
                <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Goal Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Detail the parameters of your dream goal..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white h-24 resize-none outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Vision Card Image</label>
                <div className="border border-dashed border-slate-800 rounded-xl p-3.5 flex flex-col items-center justify-center bg-slate-950 h-24 text-center relative overflow-hidden">
                  {formImage ? (
                    <>
                      <img src={formImage} className="w-full h-full object-cover absolute inset-0 opacity-55" />
                      <button
                        type="button"
                        onClick={() => { setFormImage(""); setFormImageName(""); }}
                        className="absolute top-1 right-1 p-1 bg-red-600 rounded-lg text-white"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="relative z-10 text-[9px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded truncate max-w-full">
                        {formImageName || "Uploaded"}
                      </span>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-indigo-400">
                      <Download className="w-5 h-5 mb-1 text-slate-400" />
                      <span className="text-[10px] font-mono">{uploadingImage ? "Uploading..." : "Upload Image"}</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

            </div>

            {/* Target Amounts & Milestones */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-800/80 pt-4">
              
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Financial Target</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Target Capital (Rs. Optional)</label>
                    <input
                      type="number"
                      value={formTargetAmount}
                      onChange={(e) => setFormTargetAmount(e.target.value)}
                      placeholder="e.g. 1500000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Current Cumulative Progress</label>
                    <input
                      type="number"
                      value={formCurrentProgress}
                      onChange={(e) => setFormCurrentProgress(e.target.value)}
                      placeholder="e.g. 200000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Timeline Dates */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Target Deadlines</h4>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-500 font-mono">Start Date</label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-500 font-mono">Target Date</label>
                      <input
                        type="date"
                        value={formTargetDate}
                        onChange={(e) => setFormTargetDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Critical Deadline</label>
                    <input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Goal parameters */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Parameters</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Priority Scale</label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as Goal["priority"])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="low">☕ Low Priority</option>
                      <option value="medium">⚡ Medium Priority</option>
                      <option value="high">🔥 High Priority</option>
                      <option value="critical">🚨 Critical / Non-negotiable</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Linked Habit ID</label>
                    <input
                      type="text"
                      value={formHabitLink}
                      onChange={(e) => setFormHabitLink(e.target.value)}
                      placeholder="e.g. daily-meditation"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Milestones Construction */}
            <div className="border-t border-slate-800/80 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Milestone Roadmap Checklist</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      placeholder="e.g. Secure 25% downpayment validation"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddMilestone}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">Adding milestones helps divide major goals into actionable steps.</p>
                </div>

                <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl max-h-32 overflow-y-auto space-y-1.5">
                  {formMilestones.length === 0 ? (
                    <p className="text-[10px] text-slate-600 font-mono text-center pt-4">No milestones created yet.</p>
                  ) : (
                    formMilestones.map((ms, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-900/60 p-2 rounded border border-slate-800">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleMilestoneCheck(idx)}
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                              ms.completed ? "bg-emerald-500 border-emerald-400 text-white" : "border-slate-700 bg-transparent text-transparent"
                            }`}
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </button>
                          <span className={`text-[10px] text-white ${ms.completed ? "line-through opacity-50" : ""}`}>
                            {ms.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMilestone(idx)}
                          className="text-slate-500 hover:text-red-400 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>

            {/* Action Plans, Affirmation, and quote */}
            <div className="border-t border-slate-800/80 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Daily Action Steps (one per line)</label>
                  <textarea
                    value={formDailyActionSteps}
                    onChange={(e) => setFormDailyActionSteps(e.target.value)}
                    placeholder="e.g. Read trading rule book 5 min&#10;Analyze market chart before open"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white h-20 resize-none outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Weekly Action Plan (one per line)</label>
                  <textarea
                    value={formWeeklyActionPlan}
                    onChange={(e) => setFormWeeklyActionPlan(e.target.value)}
                    placeholder="e.g. Perform weekend backtest of Nifty&#10;Verify budget status on Saturday"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white h-20 resize-none outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-2xs text-slate-450 uppercase tracking-wider font-mono">Affirmation Text / Notes</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="I am consistent and patient..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white h-16 resize-none outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Inspirational Quote</label>
                    <input
                      type="text"
                      value={formInspirationalQuote}
                      onChange={(e) => setFormInspirationalQuote(e.target.value)}
                      placeholder="Failures build character."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 font-mono">Completed Reward</label>
                    <input
                      type="text"
                      value={formReward}
                      onChange={(e) => setFormReward(e.target.value)}
                      placeholder="Buy premium fountain pen."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Reminders toggle */}
                <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-850 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-400" />
                    <div>
                      <p className="text-[11px] font-bold text-white leading-tight">Enable Reminders</p>
                      <p className="text-[9px] text-slate-550 leading-tight">Prompt goal reviews on schedule</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {formReminderEnabled && (
                      <select
                        value={formReminderFreq}
                        onChange={(e) => setFormReminderFreq(e.target.value as Goal["reminderSettings"]["frequency"])}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-white"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setFormReminderEnabled(!formReminderEnabled)}
                      className={`w-10 h-6.5 rounded-full p-1 transition cursor-pointer ${formReminderEnabled ? "bg-indigo-650" : "bg-slate-800"}`}
                    >
                      <div className={`w-4.5 h-4.5 bg-white rounded-full transition transform ${formReminderEnabled ? "translate-x-3.5" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Form actions and Smart AI suggestions */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleFetchAiSuggestions}
                disabled={aiLoading}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-900/40 border border-indigo-700/30 text-indigo-300 font-semibold text-xs rounded-xl cursor-pointer hover:border-indigo-500/50 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                {aiLoading ? "Consulting AI..." : "Consult AI Goal Planner"}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsAddFormOpen(false);
                    setActiveSubTab("board");
                  }}
                  className="px-4 py-2 bg-slate-950 border border-slate-800 text-slate-350 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-lg shadow-indigo-600/15"
                >
                  {editingGoal ? "Save Amendments" : "Create Card"}
                </button>
              </div>
            </div>

            {/* AI suggestion output box */}
            {aiPrompts && (
              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-indigo-200 text-xs space-y-2 animate-fade-in-up">
                <div className="flex items-center gap-2 font-bold text-white uppercase tracking-wider text-2xs">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  AI Suggested Roadmaps & Task Breakdown
                </div>
                <p className="leading-relaxed font-mono whitespace-pre-wrap">{aiPrompts}</p>
              </div>
            )}

          </form>

        </div>
      )}

      {/* Goal Creation instruction placeholder if form is closed */}
      {activeSubTab === "settings" && !isAddFormOpen && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-400" />
                Goal Registry & Layout Manager
              </h3>
              <p className="text-2xs text-slate-400 mt-0.5">Toggle board pinning, modify details, delete or view performance tracking logs.</p>
            </div>
            <button
              onClick={() => { resetForm(); setIsAddFormOpen(true); }}
              className="px-4 py-2 bg-indigo-655 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer transition shadow-md flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Construct New Goal
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-850 bg-slate-900/60 backdrop-blur-sm">
              <span className="text-2xs uppercase tracking-wider font-mono text-slate-400 font-bold">All Vision Goals List</span>
            </div>
            {activeGoals.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">
                No active dream goals registered yet. Click "Construct New Goal" to begin.
              </div>
            ) : (
              <div className="divide-y divide-slate-850">
                {activeGoals.map((g) => {
                  const config = CATEGORIES.find((c) => c.value === g.category);
                  return (
                    <div key={g.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-850/30 transition">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl bg-slate-950 p-2 rounded-xl border border-slate-800 self-start">{config?.emoji ?? "🎯"}</span>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-bold text-white font-mono">{g.title}</h4>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-mono font-bold ${config?.darkColor ?? "bg-slate-900 text-slate-400"}`}>
                              {g.category}
                            </span>
                            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold ${
                              g.priority === "critical" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                              g.priority === "high" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                              g.priority === "medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            }`}>
                              {g.priority}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-450 max-w-xl leading-relaxed">{g.description}</p>
                          {g.isPinned === false && g.unpinReason && (
                            <div className="text-[9px] text-amber-400/90 font-mono italic bg-amber-500/5 border border-amber-500/10 px-2 py-1 rounded-lg w-fit">
                              Unpinned reason: "{g.unpinReason}"
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                        {/* Pin status badge and action button */}
                        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-850">
                          <span className={`text-[9px] font-mono font-bold uppercase ${g.isPinned !== false ? "text-emerald-400" : "text-amber-500"}`}>
                            {g.isPinned !== false ? "Board Pinned" : "Unpinned"}
                          </span>
                          <button
                            onClick={() => handleTogglePin(g)}
                            className={`p-1.5 rounded-lg border transition ${
                              g.isPinned !== false
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                            }`}
                            title={g.isPinned !== false ? "Unpin from scrapbook board" : "Pin back to scrapbook board"}
                          >
                            {g.isPinned !== false ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleEditGoalClick(g)}
                            className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition cursor-pointer flex items-center justify-center"
                            title="Modify Goal"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteGoal(g.id)}
                            className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-400 hover:text-rose-450 rounded-xl transition cursor-pointer flex items-center justify-center"
                            title="Delete Goal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* SUB TAB 3: SMART VISION DASHBOARD */}
      {activeSubTab === "dashboard" && (
        <div className="space-y-6">
          
          {/* Main widgets Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Goal Cards", count: totalGoals, pct: "100%", color: "text-white", border: "border-slate-800" },
              { label: "Completed Goals", count: completedGoals, pct: `${completionRate}%`, color: "text-emerald-400", border: "border-emerald-500/20" },
              { label: "Active Goals", count: activeCount, pct: `${totalGoals > 0 ? Math.round((activeCount/totalGoals)*100) : 0}%`, color: "text-indigo-400", border: "border-indigo-500/20" },
              { label: "Dream Success Rate", count: `${completionRate}%`, pct: `Streak: ${streakCount}d`, color: "text-amber-400", border: "border-amber-500/20" }
            ].map((wd, idx) => (
              <div key={idx} className={`bg-slate-900 border p-4.5 rounded-2xl shadow-sm ${wd.border} relative overflow-hidden`}>
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{wd.label}</div>
                <div className={`text-2xl font-black mt-2 font-sans ${wd.color}`}>{wd.count}</div>
                <div className="text-[9px] font-mono text-slate-450 mt-1">{wd.pct} Progress Rate</div>
              </div>
            ))}
          </div>

          {/* Today's Focus, Quote and Upcoming milestones */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left side: Focus goal & quote */}
            <div className="space-y-6 lg:col-span-1">
              
              {/* Focus Goal Card */}
              <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/10 p-5 rounded-2xl relative overflow-hidden shadow-sm">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-3 font-mono">
                  <Star className="w-3.5 h-3.5 text-amber-450 fill-amber-450" />
                  Today's focus Goal
                </h4>
                {activeGoals.filter(g => g.status === "In Progress").length > 0 ? (
                  (() => {
                    const focus = activeGoals.filter(g => g.status === "In Progress")[0];
                    return (
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{focus.title}</p>
                          <p className="text-[10px] text-slate-450 mt-0.5 line-clamp-2 leading-relaxed">{focus.description}</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-mono text-slate-400">
                            <span>Progress Scale</span>
                            <span>{focus.completionPercentage}%</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-550 h-full rounded-full" style={{ width: `${focus.completionPercentage}%` }} />
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveGoalDetail(focus)}
                          className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-0.5"
                        >
                          Review Actions <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-[10px] text-slate-500 font-mono italic">No active goals in progress. Shift a card status to get started.</p>
                )}
              </div>

              {/* Inspiration Quote Widget */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl text-center relative">
                <span className="text-3xl text-indigo-500/20 font-serif absolute top-2 left-3">“</span>
                <p className="text-xs italic text-slate-300 leading-relaxed font-sans relative z-10 pt-2 px-1">
                  {activeGoals.find(g => g.inspirationalQuote)?.inspirationalQuote || "The future belongs to those who believe in the beauty of their dreams."}
                </p>
                <p className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest mt-3.5">- Quote of the Day</p>
              </div>

            </div>

            {/* Right side: Charts & Upcoming Milestones */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Category-wise progress and analytics */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  Category Progress Analytics
                </h4>

                {categoryData.length === 0 ? (
                  <p className="text-[10px] text-slate-550 font-mono text-center py-8">Create goals under different categories to construct progress charts.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    
                    {/* Progress list */}
                    <div className="space-y-3">
                      {categoryData.slice(0, 5).map((cat, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-white font-medium">{cat.name} ({cat.count} goals)</span>
                            <span className="text-slate-400 font-mono font-bold">{cat.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${cat.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Simple chart using recharts */}
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryData.slice(0, 5)} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                          <XAxis dataKey="name" stroke="#64748b" fontSize={8} tickLine={false} />
                          <YAxis stroke="#64748b" fontSize={8} tickLine={false} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "12px", fontSize: "10px" }}
                          />
                          <Bar dataKey="progress" fill="#6366f1" radius={[4, 4, 0, 0]}>
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#6366f1" : "#a855f7"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                  </div>
                )}
              </div>

              {/* Upcoming milestone roadmap checklist */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Award className="w-3.5 h-3.5 text-indigo-400" />
                  Upcoming Roadmap Milestones
                </h4>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {activeGoals.every((g) => g.milestones.length === 0) ? (
                    <p className="text-[10px] text-slate-500 font-mono text-center py-6">No milestone checkposts created in goal settings.</p>
                  ) : (
                    activeGoals.flatMap((g) =>
                      g.milestones.map((m) => ({
                        ...m,
                        goalTitle: g.title,
                        category: g.category
                      }))
                    )
                    .filter((m) => !m.completed)
                    .slice(0, 5)
                    .map((ms, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                        <div>
                          <p className="text-[10px] text-white font-medium leading-tight">{ms.title}</p>
                          <p className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">Parent: {ms.goalTitle}</p>
                        </div>
                        <span className="text-[8px] font-mono px-2 py-0.5 bg-indigo-650/10 text-indigo-450 border border-indigo-500/10 rounded uppercase font-bold shrink-0">
                          {ms.category}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* SUB TAB 4: CALENDAR & TIMELINE ROADMAP */}
      {activeSubTab === "calendar" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Calendar Grid View */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Goal Target Calendars
            </h4>
            <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-mono text-slate-450 border-b border-slate-850 pb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="font-bold">{d}</div>
              ))}
            </div>
            
            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {renderCalendarDays().map((dayObj) => (
                <div
                  key={dayObj.day}
                  className={`aspect-square bg-slate-950 border border-slate-850 rounded-xl p-1 flex flex-col justify-between items-center relative group hover:border-indigo-500/40 transition ${
                    dayObj.goals.length > 0 ? "ring-1 ring-indigo-650/30 bg-indigo-950/10" : ""
                  }`}
                >
                  <span className={`text-[8.5px] font-mono font-bold ${dayObj.goals.length > 0 ? "text-indigo-400" : "text-slate-650"}`}>
                    {dayObj.day}
                  </span>
                  
                  {dayObj.goals.length > 0 && (
                    <div className="flex gap-0.5 pointer-events-none">
                      {dayObj.goals.map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                      ))}
                    </div>
                  )}

                  {/* Popover on hover showing goals for that target date */}
                  {dayObj.goals.length > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-36 bg-slate-900 border border-slate-800 p-2 rounded-lg shadow-xl z-30 pointer-events-none">
                      {dayObj.goals.map((dg, i) => (
                        <p key={i} className="text-[8px] font-mono text-white leading-tight truncate">
                          • {dg.title}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Roadmap */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              Strategic Timeline Roadmap
            </h4>
            
            {/* Timeline scroll */}
            <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
              {activeGoals.length === 0 ? (
                <p className="text-[10px] text-slate-505 font-mono text-center py-10">No roadmap timeline. Populate goal targets first.</p>
              ) : (
                [...activeGoals]
                  .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
                  .map((g, idx) => (
                    <div key={g.id} className="relative pl-6 border-l-2 border-slate-800 pb-2 last:pb-0">
                      
                      {/* Timeline dot */}
                      <div className="absolute -left-1.5 top-0.5 w-3 h-3 bg-slate-950 border-2 border-indigo-500 rounded-full z-10" />

                      <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-850 hover:border-slate-700 transition space-y-1.5">
                        <div className="flex justify-between items-center flex-wrap gap-1">
                          <span className="text-[9px] font-mono text-indigo-400 font-bold">{g.targetDate}</span>
                          <span className={`text-[8px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                            g.status === "Achieved" ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/20" :
                            g.status === "In Progress" ? "bg-indigo-500/10 text-indigo-450 border-indigo-500/20" :
                            "bg-amber-500/10 text-amber-450 border-amber-500/20"
                          }`}>
                            {g.status}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-white leading-tight">{g.title}</h5>
                        <p className="text-[10px] text-slate-500 leading-normal line-clamp-2">{g.description}</p>
                        
                        {/* Milestones count */}
                        {g.milestones.length > 0 && (
                          <div className="text-[8px] font-mono text-slate-450 pt-1">
                            Milestones: {g.milestones.filter(m => m.completed).length} / {g.milestones.length} achieved
                          </div>
                        )}
                      </div>

                    </div>
                  ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* SUB TAB 5: REPORTS & DATA VAULT */}
      {activeSubTab === "reports" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left panel options */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-5">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Select Audit Report Type
              </h3>
              <p className="text-[10px] text-slate-550 font-mono mt-1">Configure parameters to generate structured progress sheets.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: "board", label: "Vision Board Status Report", desc: "Overview of collage card placements & coordinates." },
                { key: "weekly", label: "Weekly Goal Action Report", desc: "Summary of weekly actions & progress increments." },
                { key: "monthly", label: "Monthly Goal Progress Report", desc: "Detailed timeline compliance and milestones audits." },
                { key: "achievement", label: "Goal Achievement Legacy", desc: "History of completed milestones & target goals." },
                { key: "habit", label: "Habit Link Correlation", desc: "Review of linked habits metrics." },
                { key: "success", label: "Success & Analytics Report", desc: "Cumulative completion rates and category graphs." }
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSelectedReport(opt.key)}
                  className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                    selectedReport === opt.key
                      ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-400"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-650 hover:text-slate-200"
                  }`}
                >
                  <div className="text-xs font-bold leading-tight">{opt.label}</div>
                  <div className="text-[9px] mt-1 opacity-70 leading-tight">{opt.desc}</div>
                </button>
              ))}
            </div>

            <button
              onClick={handlePdfGeneration}
              disabled={generatingReport}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:opacity-90 active:scale-98 transition font-bold text-xs text-white rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/10 disabled:opacity-50"
            >
              {generatingReport ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Constructing PDF...</>
              ) : (
                <><Download className="w-4 h-4" /> Download PDF Statement</>
              )}
            </button>
          </div>

          {/* Right panel database backup */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Star className="w-3.5 h-3.5 text-indigo-400" />
                Goal Data Ledger backups
              </h3>
              <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                Export local goal settings JSON file or restore records from file backup systems.
              </p>

              {/* Preview data */}
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3.5 text-center">
                <div className="text-2xl font-black text-white">{activeGoals.length}</div>
                <div className="text-[9px] text-slate-550 font-mono mt-1">Active Ledger Records</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => {
                  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeGoals, null, 2));
                  const a = document.createElement("a");
                  a.setAttribute("href", dataStr);
                  a.setAttribute("download", `ik_vision_board_${new Date().toISOString().split("T")[0]}.json`);
                  a.click();
                  alert("JSON Goal Backup Downloaded!");
                }}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 text-indigo-400 border border-slate-850 hover:border-indigo-500/40 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export Goals JSON
              </button>

              <label className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-amber-500/30 rounded-xl text-slate-400 hover:text-amber-300 text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500" />
                Restore from JSON
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!confirm("RESTORE: This will merge values from backup. Proceed?")) return;
                    const r = new FileReader();
                    r.onload = async (ev) => {
                      try {
                        const parsed = JSON.parse(ev.target?.result as string);
                        if (Array.isArray(parsed)) {
                          if (decoyMode) {
                            saveDecoyGoals([...decoyGoals, ...parsed]);
                            alert("Decoy restored!");
                          } else {
                            for (const item of parsed) {
                              const { id, ...data } = item;
                              await addDoc(collection(db, "goals"), data);
                            }
                            alert("Database restored!");
                          }
                        }
                      } catch {
                        alert("Invalid backup file.");
                      }
                    };
                    r.readAsText(file);
                  }}
                />
              </label>
          </div>
        </div>
      </div>
      )}

      {/* SUB TAB 6: ARCHIVE REGISTRY */}
      {activeSubTab === "archive" && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              Goal Archival Registry
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Review and manage archived goals. You can restore them back to your Scrapbook board, or permanently delete them (which requires security PIN confirmation).
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm">
            {((decoyMode ? decoyGoals : goals).filter(g => g.archived)).length === 0 ? (
              <div className="text-center text-xs text-slate-450 font-mono py-12">
                No archived goals found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {((decoyMode ? decoyGoals : goals).filter(g => g.archived)).map((g) => (
                  <div
                    key={g.id}
                    className="bg-slate-955 p-5 rounded-2xl border border-slate-850 space-y-4 hover:border-slate-750 transition duration-300 relative flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded uppercase font-bold">
                          {g.category}
                        </span>
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                          g.priority === "critical" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                          g.priority === "high" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          g.priority === "medium" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                          "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                        }`}>
                          {g.priority}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white leading-tight font-sans">{g.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-sans">{g.description}</p>
                      {g.archiveReason && (
                        <div className="text-[9px] text-rose-455 font-mono italic bg-rose-500/5 border border-rose-500/10 px-2 py-1 rounded-lg w-fit">
                          Archived reason: "{g.archiveReason}"
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-850 flex gap-2">
                      <button
                        onClick={() => handleRestoreGoal(g.id)}
                        className="flex-1 py-1.5 bg-indigo-600/15 hover:bg-indigo-650/20 text-indigo-400 border border-indigo-500/20 font-bold text-[10px] rounded-xl transition cursor-pointer"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(g.id)}
                        className="flex-1 py-1.5 bg-rose-600/15 hover:bg-rose-655/20 text-rose-400 border border-rose-500/20 font-bold text-[10px] rounded-xl transition cursor-pointer"
                      >
                        Permanently Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAILED VIEW MODAL ON CARD CLICK */}
      {activeGoalDetail && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6.5 relative space-y-4 shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setActiveGoalDetail(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition z-10 bg-slate-950/80 backdrop-blur-sm"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-indigo-600/10 rounded-xl border border-indigo-500/20 shrink-0">
                <Target className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <span className="text-[8px] font-mono px-2 py-0.5 bg-indigo-650/15 text-indigo-405 border border-indigo-550/10 rounded uppercase font-bold">
                  {activeGoalDetail.category}
                </span>
                <h3 className="text-sm font-bold text-white mt-1.5 leading-tight">{activeGoalDetail.title}</h3>
                <p className="text-[10px] text-slate-500 font-mono">Date: {activeGoalDetail.startDate} → {activeGoalDetail.targetDate}</p>
              </div>
            </div>

            {/* Premium Full Image View inside Modal */}
            {activeGoalDetail.imageUrl && (
              <div className="w-full max-h-60 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative select-none">
                <img
                  src={activeGoalDetail.imageUrl}
                  alt={activeGoalDetail.title}
                  className="max-w-full max-h-60 object-contain rounded-xl hover:scale-105 transition duration-300"
                />
                <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded font-mono text-[8px] text-white">
                  Full Image View
                </div>
              </div>
            )}

            {/* Target Affirmation Banner callout */}
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-l-4 border-amber-500 p-4.5 rounded-r-2xl space-y-1 select-none">
              <span className="text-[8px] font-mono text-amber-505 uppercase tracking-widest font-bold">Target Affirmation</span>
              <p className="text-sm font-sans italic font-bold text-amber-100 leading-relaxed">
                "{activeGoalDetail.notes || "I am attractively executing my plans daily and progressing towards my dreams."}"
              </p>
            </div>

            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-850 text-xs">
              
              {/* Description */}
              {activeGoalDetail.description && (
                <div className="space-y-0.5">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Description</span>
                  <p className="text-slate-350 leading-relaxed">{activeGoalDetail.description}</p>
                </div>
              )}

              {/* Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-slate-500 uppercase">
                  <span>Current Completion Status</span>
                  <span>{activeGoalDetail.completionPercentage}%</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-indigo-600 h-full rounded-full" style={{ width: `${activeGoalDetail.completionPercentage}%` }} />
                </div>
              </div>

              {/* Inspirational Quote */}
              {activeGoalDetail.inspirationalQuote && (
                <div className="border-l-2 border-indigo-500/40 pl-3 py-1 italic text-slate-300">
                  "{activeGoalDetail.inspirationalQuote}"
                </div>
              )}

              {/* Milestones status */}
              {activeGoalDetail.milestones.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Milestones checklist</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {activeGoalDetail.milestones.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded border border-slate-800/60">
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          m.completed ? "bg-emerald-500 border-emerald-400 text-white" : "border-slate-700 text-transparent"
                        }`}>
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                        <span className={`text-[10px] text-slate-300 ${m.completed ? "line-through opacity-50" : ""}`}>{m.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action plan steps */}
              {activeGoalDetail.dailyActionSteps.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Daily Actions checklist</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
                    {activeGoalDetail.dailyActionSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reward */}
              {activeGoalDetail.rewardAfterCompletion && (
                <div className="bg-amber-600/10 border border-amber-500/20 p-2.5 rounded-xl flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-[9px] font-mono text-amber-500 uppercase leading-none">Completion Reward</p>
                    <p className="text-[10px] text-white font-medium mt-1 leading-tight">{activeGoalDetail.rewardAfterCompletion}</p>
                  </div>
                </div>
              )}

            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const targetId = activeGoalDetail.id;
                  setActiveGoalDetail(null);
                  handleEditGoalClick(activeGoals.find(g => g.id === targetId)!);
                }}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-white font-bold text-xs rounded-xl border border-slate-850 transition"
              >
                Edit Parameters
              </button>
              <button
                onClick={() => {
                  const targetId = activeGoalDetail.id;
                  const activeGoalsList = decoyMode ? decoyGoals : goals;
                  const goalToUpdate = activeGoalsList.find(g => g.id === targetId);
                  if (goalToUpdate) {
                    const isCompleted = goalToUpdate.status === "Achieved";
                    const newProgress = isCompleted ? 0 : (goalToUpdate.targetAmount ?? 100);
                    const newPercentage = isCompleted ? 0 : 100;
                    const newStatus: Goal["status"] = isCompleted ? "In Progress" : "Achieved";

                    // Update all milestones to matching state
                    const newMilestones = goalToUpdate.milestones.map(m => ({ ...m, completed: !isCompleted }));

                    if (decoyMode) {
                      const updated = decoyGoals.map(g => g.id === targetId ? { ...g, currentProgress: newProgress, completionPercentage: newPercentage, status: newStatus, milestones: newMilestones } : g);
                      saveDecoyGoals(updated);
                      alert("Decoy goal status toggled!");
                    } else {
                      updateDoc(doc(db, "goals", targetId), { currentProgress: newProgress, completionPercentage: newPercentage, status: newStatus, milestones: newMilestones })
                        .then(() => alert("Goal status toggled!"));
                    }
                  }
                  setActiveGoalDetail(null);
                }}
                className="flex-1 py-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition"
              >
                {activeGoalDetail.status === "Achieved" ? "Reopen Goal" : "Complete Goal"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
