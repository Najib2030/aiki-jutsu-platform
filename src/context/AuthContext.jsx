// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  const registrationInProgressRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (registrationInProgressRef.current) return;

      if (!user) {
        setCurrentUser(null);
        setUserData(null);
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();

          // Block disabled accounts (soft-deleted by admin)
          if (data.isDisabled) {
            await signOut(auth);
            setCurrentUser(null);
            setUserData(null);
            setLoading(false);
            return;
          }

          // Email verification gate:
          //   - Firebase Auth says verified → OK
          //   - Admin created the account and vouched for the email → OK
          //   - Admins bypass this gate (manually created, often unverified)
          const isVerified =
            user.emailVerified || data.adminVerified === true;
          if (!isVerified && data.role !== 'admin') {
            await signOut(auth);
            setCurrentUser(null);
            setUserData(null);
            setLoading(false);
            return;
          }

          // Sync emailVerified into Firestore so admins can filter.
          // Admin-verified users keep `emailVerified: false` (truthful)
          // — the override lives in `adminVerified`.
          if (data.emailVerified !== user.emailVerified) {
            try {
              await updateDoc(userDocRef, { emailVerified: user.emailVerified });
              data.emailVerified = user.emailVerified;
            } catch (err) {
              console.error('Failed to sync emailVerified:', err);
            }
          }

          setCurrentUser(user);
          setUserData(data);
        } else {
          await signOut(auth);
          setCurrentUser(null);
          setUserData(null);
        }
      } catch (err) {
        console.error('Auth bootstrap error:', err);
        setCurrentUser(null);
        setUserData(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const beginRegistration = () => { registrationInProgressRef.current = true; };
  const endRegistration = () => { registrationInProgressRef.current = false; };

  useEffect(() => {
    if (loading) return;
    const splash = document.getElementById('app-splash');
    if (!splash) return;
    splash.classList.add('is-leaving');
    const timer = setTimeout(() => splash.remove(), 500);
    return () => clearTimeout(timer);
  }, [loading]);
  
  const value = {
    currentUser,
    userData,
    setUserData,
    beginRegistration,
    endRegistration,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}