import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { activateOrLoadUserProfile } from '../lib/firestoreService';
import { UserPrivatePII, UserProfile } from '../types/lms';
import { isProtectedOwnerEmail } from '../data/catalogSeed';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  pii: UserPrivatePII | null;
  loading: boolean;
  authError: string | null;
  isOwner: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pii, setPii] = useState<UserPrivatePII | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadForUser = async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setPii(null);
      setLoading(false);
      return;
    }
    try {
      setAuthError(null);
      const data = await activateOrLoadUserProfile(user);
      setProfile(data.profile);
      setPii(data.pii);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load your profile.';
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      void loadForUser(user);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async (): Promise<boolean> => {
    try {
      setAuthError(null);
      setLoading(true);
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await loadForUser(cred.user);
        return true;
      }
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setAuthError(msg.includes('popup-closed') ? 'Sign-in popup was closed before completing.' : msg);
      setLoading(false);
      return false;
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    setProfile(null);
    setPii(null);
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      await loadForUser(firebaseUser);
    }
  };

  const isOwner = Boolean(
    firebaseUser?.emailVerified &&
      (isProtectedOwnerEmail(firebaseUser.email) || profile?.role === 'SUPER_ADMIN')
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        pii,
        loading,
        authError,
        isOwner,
        signInWithGoogle,
        signOutUser,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
