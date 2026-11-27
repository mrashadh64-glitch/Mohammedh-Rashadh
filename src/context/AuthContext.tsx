import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { activateOrLoadUserProfile } from '../lib/firestoreService';
import { StudentAccountRecord, UserPrivatePII, UserProfile } from '../types/lms';
import { INSTITUTE_INFO, isProtectedOwnerEmail } from '../data/catalogSeed';

export interface PendingPasswordChangeState {
  token: string;
  student: StudentAccountRecord;
  message: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  authMode: 'firebase' | 'student_credentials' | null;
  studentSessionToken: string | null;
  studentAccount: StudentAccountRecord | null;
  pendingPasswordChange: PendingPasswordChangeState | null;
  profile: UserProfile | null;
  pii: UserPrivatePII | null;
  loading: boolean;
  authError: string | null;
  isOwner: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signInWithStudentCredentials: (
    identifier: string,
    password: string
  ) => Promise<{ ok: boolean; requiresPasswordChange?: boolean; error?: string }>;
  completeFirstLoginPasswordChange: (
    newPassword: string
  ) => Promise<{ ok: boolean; error?: string }>;
  activateStudentAccount: (
    activationToken: string,
    newPassword: string
  ) => Promise<{ ok: boolean; error?: string }>;
  cancelPendingPasswordChange: () => void;
  getBearerToken: () => Promise<string | null>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildStudentProfileFromAccount(acc: StudentAccountRecord): {
  profile: UserProfile;
  pii: UserPrivatePII;
} {
  const uid = acc.linkedUserUid || `stuid_${acc.id}`;
  return {
    profile: {
      uid,
      displayName: acc.fullName,
      role: 'STUDENT',
      designation: acc.courseName || '2027 Student',
      studentId: acc.studentId,
      branchId: acc.branchId || 'branch-colombo-hq',
      institutionId: acc.institutionId || INSTITUTE_INFO.institutionId,
      accountStatus: acc.status === 'Suspended' ? 'suspended' : 'active',
      xpPoints: 100,
      streakDays: 1,
      level: 1,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    },
    pii: {
      uid,
      email: acc.email,
      phone: acc.phone,
      updatedAt: acc.updatedAt,
    },
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  // Held strictly in React memory — never persisted to localStorage/sessionStorage
  const [studentSessionToken, setStudentSessionToken] = useState<string | null>(null);
  const [studentAccount, setStudentAccount] = useState<StudentAccountRecord | null>(null);
  const [pendingPasswordChange, setPendingPasswordChange] =
    useState<PendingPasswordChangeState | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pii, setPii] = useState<UserPrivatePII | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadForUser = async (user: User | null) => {
    if (!user) {
      setProfile((prev) => (studentSessionToken ? prev : null));
      setPii((prev) => (studentSessionToken ? prev : null));
      setLoading(false);
      return;
    }
    try {
      setAuthError(null);
      setStudentSessionToken(null);
      setStudentAccount(null);
      setPendingPasswordChange(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async (): Promise<boolean> => {
    try {
      setAuthError(null);
      setPendingPasswordChange(null);
      setLoading(true);
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await loadForUser(cred.user);
        return true;
      }
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      setAuthError(
        msg.includes('popup-closed') ? 'Sign-in popup was closed before completing.' : msg
      );
      setLoading(false);
      return false;
    }
  };

  const applyAuthenticatedStudentSession = (token: string, acc: StudentAccountRecord) => {
    const built = buildStudentProfileFromAccount(acc);
    setStudentSessionToken(token);
    setStudentAccount(acc);
    setPendingPasswordChange(null);
    setProfile(built.profile);
    setPii(built.pii);
    setAuthError(null);
  };

  const signInWithStudentCredentials = async (
    identifier: string,
    password: string
  ): Promise<{ ok: boolean; requiresPasswordChange?: boolean; error?: string }> => {
    try {
      setAuthError(null);
      const res = await fetch('/api/student-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Invalid Student ID / Username or password.';
        setAuthError(errMsg);
        return { ok: false, error: errMsg };
      }
      if (data.requiresPasswordChange && data.passwordChangeToken && data.student) {
        setPendingPasswordChange({
          token: data.passwordChangeToken,
          student: data.student as StudentAccountRecord,
          message:
            data.message ||
            'You must set a new personal password before accessing your Student Dashboard.',
        });
        return { ok: true, requiresPasswordChange: true };
      }
      if (data.sessionToken && data.student) {
        applyAuthenticatedStudentSession(data.sessionToken, data.student as StudentAccountRecord);
        return { ok: true, requiresPasswordChange: false };
      }
      setAuthError('Unexpected login response from authentication server.');
      return { ok: false, error: 'Unexpected login response.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach student login service.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const completeFirstLoginPasswordChange = async (
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!pendingPasswordChange?.token) {
      return { ok: false, error: 'Password setup session expired. Please sign in again.' };
    }
    try {
      setAuthError(null);
      const res = await fetch('/api/student-auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingPasswordChange.token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Unable to update password.';
        setAuthError(errMsg);
        return { ok: false, error: errMsg };
      }
      if (data.sessionToken && data.student) {
        applyAuthenticatedStudentSession(data.sessionToken, data.student as StudentAccountRecord);
        return { ok: true };
      }
      return { ok: false, error: 'Unable to activate student session.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password update failed.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const activateStudentAccount = async (
    activationToken: string,
    newPassword: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      setAuthError(null);
      const res = await fetch('/api/student-auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Activation failed.';
        setAuthError(errMsg);
        return { ok: false, error: errMsg };
      }
      if (data.sessionToken && data.student) {
        applyAuthenticatedStudentSession(data.sessionToken, data.student as StudentAccountRecord);
        return { ok: true };
      }
      return { ok: false, error: 'Unable to complete activation.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Account activation failed.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const cancelPendingPasswordChange = () => {
    setPendingPasswordChange(null);
    setAuthError(null);
  };

  const getBearerToken = async (): Promise<string | null> => {
    if (auth.currentUser) {
      try {
        return await auth.currentUser.getIdToken();
      } catch {
        return null;
      }
    }
    return studentSessionToken;
  };

  const signOutUser = async () => {
    if (firebaseUser) {
      await signOut(auth);
    }
    setStudentSessionToken(null);
    setStudentAccount(null);
    setPendingPasswordChange(null);
    setProfile(null);
    setPii(null);
    setAuthError(null);
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      await loadForUser(firebaseUser);
      return;
    }
    if (studentSessionToken) {
      try {
        const r = await fetch('/api/student-auth/me', {
          headers: { Authorization: `Bearer ${studentSessionToken}` },
        });
        if (r.ok) {
          const data = await r.json();
          if (data.student) {
            applyAuthenticatedStudentSession(
              studentSessionToken,
              data.student as StudentAccountRecord
            );
          }
        }
      } catch {
        // Keep current session state on transient error
      }
    }
  };

  const authMode: 'firebase' | 'student_credentials' | null = firebaseUser
    ? 'firebase'
    : studentSessionToken
      ? 'student_credentials'
      : null;

  const isOwner = Boolean(
    firebaseUser?.emailVerified &&
      (isProtectedOwnerEmail(firebaseUser.email) || profile?.role === 'SUPER_ADMIN')
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authMode,
        studentSessionToken,
        studentAccount,
        pendingPasswordChange,
        profile,
        pii,
        loading,
        authError,
        isOwner,
        signInWithGoogle,
        signInWithStudentCredentials,
        completeFirstLoginPasswordChange,
        activateStudentAccount,
        cancelPendingPasswordChange,
        getBearerToken,
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
