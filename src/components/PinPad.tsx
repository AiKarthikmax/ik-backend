import React, { useState, useEffect } from "react";
import { Lock, ShieldAlert, Fingerprint, Eye, EyeOff, Check } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

interface PinPadProps {
  onSuccess: () => void;
}

// ─── WebAuthn Biometric Helper ────────────────────────────────────
async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch {
    return false;
  }
}

async function registerBiometric(): Promise<boolean> {
  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Maha Finance", id: window.location.hostname },
        user: {
          id: new Uint8Array([1]),
          name: "maha_user",
          displayName: "Maha User"
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000
      }
    });
    if (cred) {
      const credId = btoa(String.fromCharCode(...new Uint8Array((cred as any).rawId)));
      localStorage.setItem("maha_biometric_cred_id", credId);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Biometric registration failed:", err);
    return false;
  }
}

async function authenticateBiometric(): Promise<boolean> {
  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const credId = localStorage.getItem("maha_biometric_cred_id");
    if (!credId) return false;

    const credIdBytes = Uint8Array.from(atob(credId), c => c.charCodeAt(0));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: credIdBytes, transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000
      }
    });
    return !!assertion;
  } catch (err) {
    console.warn("Biometric auth failed:", err);
    return false;
  }
}

export default function PinPad({ onSuccess }: PinPadProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [storedSecondaryKey, setStoredSecondaryKey] = useState("Madurai@2528");
  const [loading, setLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricRegistered, setBiometricRegistered] = useState(false);

  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [showPin, setShowPin] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [stars, setStars] = useState<{ id: number; top: string; left: string; size: string; delay: string; duration: string }[]>([]);

  useEffect(() => {
    const rem = localStorage.getItem("ik_remember_device") === "true";
    setRememberDevice(rem);
  }, []);

  useEffect(() => {
    const starList = [];
    for (let i = 0; i < 45; i++) {
      starList.push({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: `${Math.random() * 1.8 + 0.8}px`,
        delay: `${Math.random() * 6}s`,
        duration: `${Math.random() * 4 + 2.5}s`
      });
    }
    setStars(starList);
  }, []);

  useEffect(() => {
    if (lockoutTime <= 0) return;
    const timer = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setError(null);
          setWrongAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutTime]);

  useEffect(() => {
    async function init() {
      try {
        const configRef = doc(db, "settings", "app_config");
        const docSnap = await getDoc(configRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.changeableKey) setStoredSecondaryKey(data.changeableKey);
          if (data.biometricEnabled !== undefined) setBiometricEnabled(data.biometricEnabled);
        } else {
          await setDoc(configRef, { changeableKey: "Madurai@2528", theme: "dark", biometricEnabled: false });
        }
      } catch (e) {
        console.warn("Could not retrieve Firestore keys (Using offline default):", e);
      } finally {
        setLoading(false);
      }

      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      const registered = !!localStorage.getItem("maha_biometric_cred_id");
      setBiometricRegistered(registered);
    }
    init();
  }, []);

  const handleWrongAttempt = () => {
    const nextAttempts = wrongAttempts + 1;
    setWrongAttempts(nextAttempts);
    setPin("");
    if (nextAttempts >= 5) {
      setError("Too many incorrect attempts. Locked for 30 seconds.");
      setLockoutTime(30);
    } else {
      setError(`Incorrect password. Attempt ${nextAttempts} of 5.`);
    }
  };

  const verifyPin = async (enteredPin: string) => {
    if (lockoutTime > 0) return;

    if (enteredPin === storedSecondaryKey) {
      setWrongAttempts(0);
      grantAccess();
      return;
    }

    try {
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: enteredPin })
      });
      const data = await res.json();
      if (data.success) {
        setWrongAttempts(0);
        grantAccess();
      } else {
        handleWrongAttempt();
      }
    } catch {
      handleWrongAttempt();
    }
  };

  const grantAccess = () => {
    const sessionLength = rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
    const expiry = Date.now() + sessionLength;
    localStorage.setItem("maha_session_expiry", expiry.toString());
    localStorage.setItem("maha_auth_verified", "true");
    localStorage.setItem("ik_remember_device", rememberDevice ? "true" : "false");
    onSuccess();
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setError(null);
    try {
      if (!biometricRegistered) {
        const success = await registerBiometric();
        if (success) {
          setBiometricRegistered(true);
          grantAccess();
        } else {
          setError("Biometric setup failed. Use password instead.");
        }
      } else {
        const success = await authenticateBiometric();
        if (success) {
          grantAccess();
        } else {
          setError("Biometric not recognized. Try password.");
        }
      }
    } catch {
      setError("Biometric error. Please use password.");
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <div 
      id="pinpad-container" 
      className="fixed inset-0 min-h-screen flex flex-col items-center justify-center p-4 z-50 overflow-hidden select-none" 
      style={{ 
        background: 'radial-gradient(circle at 30% 20%, rgba(99, 102, 241, 0.12) 0%, transparent 40%), radial-gradient(circle at 70% 80%, rgba(168, 85, 247, 0.12) 0%, transparent 40%), #030712' 
      }}
    >
      {/* Twinkling Star Field Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {stars.map(star => (
          <div 
            key={star.id} 
            className="absolute bg-white rounded-full"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              animation: `pulse ${star.duration} infinite ease-in-out`,
              animationDelay: star.delay,
              opacity: 0.65
            }}
          />
        ))}
      </div>

      {/* Trading Vector Graphics Background */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <path d="M 0 320 Q 250 240 500 370 T 1000 180 T 1500 280 T 2000 120" fill="none" stroke="#6366f1" strokeWidth="3" />
          <path d="M 0 470 Q 300 370 600 520 T 1200 270 T 1800 170" fill="none" stroke="#a855f7" strokeWidth="2" />
        </svg>
      </div>

      <div id="login-container" className="relative w-full max-w-sm glass-card rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col items-center border border-white/5 bg-slate-950/70 backdrop-blur-xl">
        
        {/* App Logo with Universe Ring */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-3xl bg-indigo-500/20 blur-xl animate-pulse" />
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-700 flex items-center justify-center border border-white/10 shadow-lg shadow-indigo-500/30 relative z-10">
            <Lock className="w-9 h-9 text-white" />
          </div>
          <div className="absolute -inset-2 border border-indigo-500/20 rounded-full animate-[spin_20s_linear_infinite] pointer-events-none" />
          <div className="absolute -inset-4 border border-purple-500/10 rounded-full animate-[spin_35s_linear_infinite] pointer-events-none" />
        </div>

        <h1 className="text-xl font-black tracking-tight text-white mb-1 font-sans">iK Trading Platform</h1>
        <p className="text-[10px] text-slate-400 mb-6 font-mono text-center uppercase tracking-wider">Management Console • Secure Vault</p>

        {/* Password Form */}
        <form onSubmit={(e) => { e.preventDefault(); verifyPin(pin); }} className="w-full space-y-4">
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => { setError(null); setPin(e.target.value); }}
              placeholder="Enter secure password"
              className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500/80 rounded-2xl pl-4 pr-11 py-3.5 text-xs text-white placeholder-slate-500 outline-none transition font-sans"
              required
              disabled={lockoutTime > 0}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition cursor-pointer"
            >
              {showPin ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          {/* Remember Device & Security Status */}
          <div className="flex items-center justify-between px-0.5 select-none">
            <div 
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => setRememberDevice(!rememberDevice)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${rememberDevice ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-800 bg-slate-900 text-transparent'}`}>
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span className="text-[10px] text-slate-450 font-medium">Remember device</span>
            </div>
            <span className="text-[9px] text-indigo-400 font-mono font-bold tracking-tight">SSL ENCRYPTED</span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-[10px] px-3.5 py-2 bg-rose-500/10 rounded-2xl border border-rose-500/20 w-full leading-normal">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="text-center text-[10px] text-slate-500 font-mono">Syncing system authorization keys...</div>
          )}

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={lockoutTime > 0 || !pin || loading}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:opacity-90 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition cursor-pointer shadow-lg shadow-indigo-500/10 min-h-[44px]"
          >
            Access Console
          </button>
        </form>

        {/* Biometric Login */}
        {biometricAvailable && biometricEnabled && (
          <button
            type="button"
            onClick={handleBiometricLogin}
            disabled={biometricLoading}
            className="w-full mt-3 flex items-center justify-center gap-2 px-5 py-3 bg-slate-900/60 border border-slate-800 hover:bg-slate-850 hover:border-indigo-500/30 rounded-2xl text-indigo-400 hover:text-indigo-300 text-xs font-bold disabled:opacity-50 cursor-pointer min-h-[44px] transition duration-200"
          >
            <Fingerprint className="w-4.5 h-4.5" />
            {biometricLoading
              ? "Verifying..."
              : biometricRegistered
                ? "Unlock with Biometrics"
                : "Register Biometrics"}
          </button>
        )}

        <div className="mt-6 text-[9px] text-slate-600 font-mono text-center tracking-wide">
          Trading Terminal Vault • 5-min auto-lock
        </div>
      </div>
    </div>
  );
}
