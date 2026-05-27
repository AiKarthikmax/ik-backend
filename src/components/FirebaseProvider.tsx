import React, { createContext, useContext, useEffect, useState } from "react";
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { auth, testConnection } from "../firebase";

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  online: boolean;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  online: true
});

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Monitor online status
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    testConnection();

    // Authenticate anonymously so rule blocks are passed securely
    signInAnonymously(auth)
      .then((cred) => {
        console.log("Firebase Auth established anonymously:", cred.user.uid);
      })
      .catch((err) => {
        console.error("Firebase Anonymous login failed:", err);
      });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      unsubscribe();
    };
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, loading, online }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}
