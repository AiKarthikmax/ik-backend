export interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  subCategory: string;
  description: string;
  paymentMethod?: "Cash" | "UPI" | "Card" | "Bank Transfer" | "Other";
  account?: string; // wallet/account name
  attachments?: { name: string; url: string; type: string }[];
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM:SS
  createdAt?: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  editHistory?: { timestamp: string; reason: string; previousData: any }[];
  deleted: boolean;
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
  subCategories: string[];
  type: "income" | "expense" | "both";
}

export interface Habit {
  id: string;
  name: string;
  archived: boolean;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  status?: "completed" | "skipped" | "pending";
  note?: string; // Optional completion note or skip reason
  completedAt?: string | null;
  updatedAt?: string;
  streak?: number;
}

export interface DailyHabitDetail {
  status: "completed" | "skipped" | "pending";
  note?: string;
  completedAt?: string | null;
  updatedAt: string;
  streak: number;
}

export interface DailySummary {
  id: string; // YYYY-MM-DD (document ID)
  mood?: number; // 1-10
  energy?: number; // 1-10
  dailyNote?: string;
  updatedAt: string;
  habits: {
    [habitId: string]: DailyHabitDetail;
  };
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  mood: "happy" | "neutral" | "tired" | "anxious" | "sad" | string;
  attachments?: { name: string; url: string; type: string }[];
  editHistory?: { timestamp: string; reason: string; previousData: any }[];
  deleted: boolean;
}

export interface GratitudeLog {
  id: string;
  date: string;
  entries: string[]; // exactly 3 prompts
  attachments?: { name: string; url: string; type: string }[];
  reactions?: string[];
}

export interface SpiritualMessage {
  id: string;
  type: "god" | "angel";
  message: string;
  source: string;
  active: boolean;
}

export interface LoanInstallment {
  id: string;
  date: string;
  amount: number;
  type: "full" | "partial" | "skip";
}

export interface Loan {
  id: string;
  borrowerName: string;
  amount: number; // e.g., 50000
  deductedInterest: number; // e.g., 5000, received amount actual = amount - interest
  totalInstallments: number;
  installmentAmount: number;
  frequency: "day" | "week" | "month";
  dateTaken: string;
  installments: LoanInstallment[];
  status: "live" | "closed" | "deleted";
  remainingAmount?: number;
  deleted?: boolean;
  archivedAt?: string;
  archiveReason?: string;
}

export interface TempLoanPayment {
  id?: string;
  date: string;
  time?: string; // HH:MM:SS
  amount: number;
  description: string;
  type?: "full" | "partial" | "interest-only";
  remainingAfter?: number;
  createdAt?: string; // ISO timestamp
}

export interface TempLoan {
  id: string;
  loanDirection: "borrowed" | "lent"; // "borrowed" = I owe them, "lent" = they owe me
  personName: string;
  amount: number;
  description: string;
  dateBorrowed: string;
  timeBorrowed?: string; // HH:MM:SS
  dueDate?: string; // YYYY-MM-DD expected return date
  payments: TempLoanPayment[];
  status: "live" | "closed" | "deleted";
  remainingAmount?: number;
  deleted?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  createdAt?: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
}

export interface FormalLoanPayment {
  id: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM:SS
  amount: number;
  description: string;
  isInterestOnly: boolean; // true = only interest paid, not principal
  type?: "full" | "partial" | "interest-only";
  remainingAfter?: number;
  createdAt?: string;
}

export interface FormalLoan {
  id: string;
  loanType: "gold" | "personal" | "housing";
  bank: string;
  amount: number;
  description?: string;
  goldWeight?: number; // optional, for gold loan
  interestRate: number; // Monthly % or Yearly %
  interestType: "monthly" | "yearly" | "fixed";
  startDate?: string;
  payments: FormalLoanPayment[];
  attachments?: { name: string; url: string; type: string }[];
  status: "live" | "closed" | "deleted";
  remainingAmount?: number;
  deleted?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppSettings {
  changeableKey: string;
  theme: "dark" | "light";
  biometricEnabled?: boolean;
}

export const PRELOADED_CATEGORIES: Omit<Category, "id">[] = [
  { name: "Maha Personal", subCategories: ["General", "Clothing", "Snacks"], type: "expense" },
  { name: "iK Personal", subCategories: ["General", "Work", "Tech"], type: "expense" },
  { name: "Family Expense", subCategories: ["Rent", "Groceries", "Bills", "Milk", "EB Bill"], type: "expense" },
  { name: "Travel", subCategories: ["Auto", "Bus", "Train"], type: "expense" },
  { name: "Petrol / Diesel", subCategories: ["Petrol", "Diesel"], type: "expense" },
  { name: "Shopping Family", subCategories: ["Festival", "Dress", "Gifts"], type: "expense" },
  { name: "Chicken / Mutton / Fish", subCategories: ["Chicken", "Mutton", "Fish", "Dry Fish"], type: "expense" },
  { name: "Egg", subCategories: ["Chicken Egg", "Country Egg"], type: "expense" },
  {
    name: "Centre Expense",
    subCategories: ["Paper", "Xerox Machine", "Printer Ink", "General", "Stapler & Similar Items"],
    type: "expense"
  },
  { name: "Income / Salary", subCategories: ["Salary", "Business", "Freelance", "Interest"], type: "income" }
];
