import React, { useState, useEffect, useRef } from "react";
import { FirebaseProvider, useFirebase } from "./components/FirebaseProvider";
import PinPad from "./components/PinPad";

import IncomeExpenseTab from "./components/IncomeExpenseTab";
import HabitTab from "./components/HabitTab";
import JournalTab from "./components/JournalTab";
import SpiritualTab from "./components/SpiritualTab";
import ThavanaiTab from "./components/ThavanaiTab";
import TempLoanTab from "./components/TempLoanTab";
import FormalLoanTab from "./components/FormalLoanTab";
import ReportsTab from "./components/ReportsTab";
import TradingTab from "./components/TradingTab";

import {
  Wallet, CheckCircle, BookOpen, Sparkles, TrendingDown,
  Users, Building2, FileBarChart2, Settings, Wifi, WifiOff,
  LogOut, Fingerprint, X, Shield, ToggleLeft, ToggleRight,
  Sun, Moon, Plus, TrendingUp
} from "lucide-react";
import { doc, setDoc, getDoc, addDoc, collection } from "firebase/firestore";
import { db } from "./firebase";

// Navigation items config
const navigationItems = [
  { id: "transactions", label: "Ledger",     shortLabel: "Ledger",   icon: Wallet,       comp: IncomeExpenseTab },
  { id: "trading",      label: "Trading Hub", shortLabel: "Trading",  icon: TrendingUp,   comp: TradingTab },
  { id: "habits",       label: "Habits",     shortLabel: "Habits",   icon: CheckCircle,  comp: HabitTab },
  { id: "journal",      label: "Journal",    shortLabel: "Journal",  icon: BookOpen,     comp: JournalTab },
  { id: "spiritual",    label: "Spiritual",  shortLabel: "Spirit",   icon: Sparkles,     comp: SpiritualTab },
  { id: "loans",        label: "Thavanais",  shortLabel: "EMIs",     icon: TrendingDown, comp: ThavanaiTab },
  { id: "tempLoans",    label: "Friends",    shortLabel: "Friends",  icon: Users,        comp: TempLoanTab },
  { id: "formalLoans",  label: "Bank Loans", shortLabel: "Loans",    icon: Building2,    comp: FormalLoanTab },
  { id: "reports",      label: "Reports",    shortLabel: "Reports",  icon: FileBarChart2,comp: ReportsTab },
];

function AppContent() {
  const { user, online } = useFirebase();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("transactions");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newSecondaryPassword, setNewSecondaryPassword] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");



  const lastActiveRef = useRef<number>(Date.now());

  // Check session on mount
  useEffect(() => {
    const isVerified = localStorage.getItem("maha_auth_verified") === "true";
    const expiry = localStorage.getItem("maha_session_expiry");
    if (isVerified && expiry && Date.now() < Number(expiry)) {
      setIsAuthenticated(true);
    } else {
      handleLogout();
    }
  }, []);

  // Theme Sync setup
  useEffect(() => {
    // 1. Initial local theme
    const localTheme = (localStorage.getItem("ik_theme") || "dark") as "light" | "dark";
    setTheme(localTheme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(localTheme);

    // 2. Load from Firestore if online and authenticated
    if (user) {
      const userRef = doc(db, "users", user.uid);
      getDoc(userRef).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.theme && (data.theme === "light" || data.theme === "dark")) {
            setTheme(data.theme);
            localStorage.setItem("ik_theme", data.theme);
            document.documentElement.classList.remove("light", "dark");
            document.documentElement.classList.add(data.theme);
          }
        }
      }).catch(err => console.log("Theme fetch error:", err));
    }
  }, [user]);

  // Load biometric setting
  useEffect(() => {
    async function loadSettings() {
      // Check if WebAuthn is available
      if (window.PublicKeyCredential) {
        try {
          const av = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometricAvailable(av);
        } catch { /* not available */ }
      }
      // Load from Firestore
      try {
        const configRef = doc(db, "settings", "app_config");
        const snap = await getDoc(configRef);
        if (snap.exists()) {
          const data = snap.data();
          setBiometricEnabled(!!data.biometricEnabled);
        }
      } catch { /* offline */ }
    }
    loadSettings();
  }, []);

  const [autoLogoutTime, setAutoLogoutTime] = useState<number>(() => {
    const val = localStorage.getItem("ik_auto_logout_time");
    return val ? Number(val) : 5 * 60 * 1000;
  });

  // Inactivity auto-lock
  useEffect(() => {
    if (!isAuthenticated || autoLogoutTime === -1) return;
    const extendSession = () => {
      lastActiveRef.current = Date.now();
      localStorage.setItem("maha_session_expiry", (Date.now() + autoLogoutTime).toString());
    };
    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"];
    events.forEach(e => window.addEventListener(e, extendSession));
    const timer = setInterval(() => {
      if (Date.now() - lastActiveRef.current > autoLogoutTime) {
        handleLogout();
        alert("🔒 Locked due to inactivity.");
      }
    }, 10000);
    return () => {
      events.forEach(e => window.removeEventListener(e, extendSession));
      clearInterval(timer);
    };
  }, [isAuthenticated, autoLogoutTime]);

  const handleLogout = () => {
    localStorage.removeItem("maha_auth_verified");
    localStorage.removeItem("maha_session_expiry");
    setIsAuthenticated(false);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    lastActiveRef.current = Date.now();
  };

  // Change secondary password
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError("");
    setPasswordChangeSuccess("");
    if (newSecondaryPassword.length < 6) {
      setPasswordChangeError("Password must be at least 6 characters long.");
      return;
    }
    try {
      const configRef = doc(db, "settings", "app_config");
      await setDoc(configRef, { changeableKey: newSecondaryPassword }, { merge: true });
      setPasswordChangeSuccess("Password updated successfully!");
      setNewSecondaryPassword("");
    } catch {
      setPasswordChangeError("Could not save password. Check connection.");
    }
  };

  // Toggle biometric in Firestore + UI
  const handleBiometricToggle = async () => {
    setBiometricLoading(true);
    const newVal = !biometricEnabled;
    try {
      // If turning off, clear stored credential
      if (!newVal) {
        localStorage.removeItem("maha_biometric_cred_id");
      }
      const configRef = doc(db, "settings", "app_config");
      await setDoc(configRef, { biometricEnabled: newVal }, { merge: true });
      setBiometricEnabled(newVal);
    } catch {
      alert("Could not update biometric setting.");
    } finally {
      setBiometricLoading(false);
    }
  };

  // Toggle theme handler
  const handleThemeToggle = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("ik_theme", nextTheme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);

    // Sync theme to firestore
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), { theme: nextTheme }, { merge: true });
      } catch (err) {
        console.warn("Could not save theme to Firestore:", err);
      }
    }
  };

  if (!isAuthenticated) {
    return <PinPad onSuccess={handleLoginSuccess} />;
  }

  const ActiveComponent = navigationItems.find(item => item.id === activeTab)?.comp || IncomeExpenseTab;

  return (
    <div id="maha-app" className="app-root text-[var(--text-primary)] font-sans relative">

      {/* Desktop Sidebar */}
      <aside className="sidebar hidden lg:flex lg:w-56 flex-col glass-card p-3 rounded-2xl gap-0.5 animate-fade-in">
        <span className="block text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-widest px-2 mb-2 font-mono mt-4">Navigation</span>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 shadow-inner"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--input-bg)] border border-transparent"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
              {item.label}
              {isActive && <div className="ml-auto w-1.5 h-1.5 bg-indigo-400 rounded-full" />}
            </button>
          );
        })}
      </aside>

      {/* Main Content Area */}
      <div className="main-content flex flex-col relative">
        {/* ─── Top Header ───────────────────────────────── */}
        <header className="glass-nav px-4 lg:px-8 py-3.5 select-none flex-shrink-0 sticky top-0 z-50">
          <div className="w-full flex justify-between items-center">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <h1 className="text-sm font-black uppercase tracking-wider leading-none">iK Personal</h1>
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono mt-1">Finance Management</span>
                </div>
              </div>

              {/* Online Sync Indicator */}
              {online ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-tight border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  Synced
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-tight border border-rose-500/20 bg-rose-500/10 text-rose-400">
                  <span className="w-1.5 h-1.5 bg-rose-400 rounded-full" />
                  Offline Mode
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleThemeToggle}
                className="p-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl hover:border-indigo-500/50 text-[var(--text-secondary)] hover:text-indigo-400 transition cursor-pointer"
                title="Toggle Theme"
              >
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl hover:border-indigo-500/50 text-[var(--text-secondary)] hover:text-indigo-400 transition cursor-pointer"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl hover:border-rose-500/50 text-[var(--text-secondary)] hover:text-rose-400 transition cursor-pointer"
                title="Lock"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <main id="maha-tab-view" className="inner-page-container flex-1 py-4 lg:py-6">
          {activeTab === "transactions" && <IncomeExpenseTab />}
          {activeTab === "trading"      && <TradingTab />}
          {activeTab === "habits"       && <HabitTab />}
          {activeTab === "journal"      && <JournalTab />}
          {activeTab === "spiritual"    && <SpiritualTab />}
          {activeTab === "loans"        && <ThavanaiTab />}
          {activeTab === "tempLoans"    && <TempLoanTab />}
          {activeTab === "formalLoans"  && <FormalLoanTab />}
          {activeTab === "reports"      && <ReportsTab />}
        </main>

        {/* Footer */}
        <footer className="hidden lg:block py-3 border-t border-[var(--glass-border)] text-center text-[10px] text-[var(--text-muted)] font-mono select-none">
          iK Personal Finance Management  •  "Track Every Rupee. Every Day."  •  Secure Vault
        </footer>
      </div>

      {/* ─── Mobile Bottom Navigation ─────────────────── */}
      <nav className="mobile-bottom-nav lg:hidden">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`mobile-nav-item ${isActive ? "active" : ""}`}
            >
              <Icon />
              <span>{item.shortLabel}</span>
              {isActive && <div className="w-1 h-1 bg-indigo-400 rounded-full" />}
            </button>
          );
        })}
      </nav>

      {/* ─── Settings Modal ────────────────────────────── */}
      {isSettingsOpen && (
        <div id="settings-overlay" className="fixed inset-0 z-50 bg-[var(--overlay-bg)] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-sm rounded-2xl p-6 shadow-2xl relative space-y-5">

            <button
              onClick={() => { setIsSettingsOpen(false); setPasswordChangeError(""); setPasswordChangeSuccess(""); }}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600/20 rounded-xl border border-indigo-500/20">
                <Shield className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Security Settings</h2>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono">Manage password and biometric access</p>
              </div>
            </div>

            {/* Change User Key / Changeable Password */}
            <div className="space-y-3 p-4 bg-[var(--input-bg)] rounded-2xl border border-[var(--input-border)] font-sans">
              <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider font-mono">Change Password</h3>
              <form onSubmit={handlePasswordUpdate} className="space-y-3">
                <input
                  type="password"
                  value={newSecondaryPassword}
                  onChange={(e) => setNewSecondaryPassword(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] px-3.5 py-2 rounded-xl focus:outline-none focus:border-indigo-500 font-sans"
                />
                {passwordChangeError && <p className="text-[10px] text-rose-400 font-mono">{passwordChangeError}</p>}
                {passwordChangeSuccess && <p className="text-[10px] text-emerald-400 font-mono">{passwordChangeSuccess}</p>}
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl cursor-pointer transition"
                >
                  Update Password
                </button>
              </form>
            </div>

            {/* Inactivity Auto Logout Options */}
            <div className="space-y-3 p-4 bg-[var(--input-bg)] rounded-2xl border border-[var(--input-border)] font-sans">
              <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider font-mono">Inactivity Auto Logout</h3>
              <select
                value={autoLogoutTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAutoLogoutTime(val);
                  localStorage.setItem("ik_auto_logout_time", val.toString());
                }}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
              >
                <option value={300000}>5 Minutes</option>
                <option value={600000}>10 Minutes</option>
                <option value={1800000}>30 Minutes</option>
                <option value={3600000}>1 Hour</option>
                <option value={-1}>Disabled</option>
              </select>
            </div>

            {/* Biometric Toggle — only show if device supports it */}
            {biometricAvailable && (
              <div className="flex items-center justify-between p-4 bg-[var(--input-bg)] rounded-2xl border border-[var(--input-border)]">
                <div className="flex items-center gap-2.5">
                  <Fingerprint className={`w-5 h-5 ${biometricEnabled ? "text-indigo-400" : "text-slate-600"}`} />
                  <div>
                    <p className="text-xs font-semibold">Biometric Login</p>
                    <p className="text-[10px] text-[var(--text-secondary)] font-mono">Fingerprint / Face ID unlock</p>
                  </div>
                </div>
                <button
                  onClick={handleBiometricToggle}
                  disabled={biometricLoading}
                  className={`transition-all cursor-pointer disabled:opacity-50 ${biometricEnabled ? "text-indigo-400" : "text-slate-600"}`}
                >
                  {biometricEnabled
                    ? <ToggleRight className="w-8 h-8" />
                    : <ToggleLeft className="w-8 h-8" />
                  }
                </button>
              </div>
            )}

            <div className="text-[9px] font-mono text-slate-600 text-center leading-relaxed pt-1">
              Auto-locks after 5 min inactivity  •  End-to-end encrypted vault
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}
