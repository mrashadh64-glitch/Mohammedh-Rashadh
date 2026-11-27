import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { logAuditEvent } from '../../lib/firestoreService';
import { INSTITUTE_INFO } from '../../data/catalogSeed';
import {
  Branch,
  Course,
  EmailLogRecord,
  MigratedStudentRecord,
  StudentAccountRecord,
  StudentAccountStatus,
  UserProfile,
} from '../../types/lms';
import { EmptyState, StatusLabel } from '../common/PlatformWidgets';

interface StudentAccountsHubProps {
  mode: 'student-accounts' | 'email-logs';
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  branches: Branch[];
  migratedStudents: MigratedStudentRecord[];
  onRefreshData: () => Promise<void>;
}

interface OneTimeCredentialHandoff {
  studentId: string;
  username: string;
  temporaryPassword: string;
  activationUrl: string;
  loginUrl: string;
  note: string;
}

interface ParsedBulkRow {
  rowNumber: number;
  fullName: string;
  email: string;
  phone: string;
  studentId: string;
  courseId: string;
  courseName: string;
  batchName: string;
  branchId: string;
  error?: string;
}

const STATUS_FILTERS: Array<'All' | StudentAccountStatus> = [
  'All',
  'Invitation Sent',
  'Active',
  'Password Reset Required',
  'Suspended',
  'Not Created',
];

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export const StudentAccountsHub: React.FC<StudentAccountsHubProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  courses,
  branches,
  migratedStudents,
  onRefreshData,
}) => {
  const canManage = isOwner || ['SUPER_ADMIN', 'ADMIN'].includes(profile.role);

  const [subTab, setSubTab] = useState<'accounts' | 'bulk' | 'emails'>(
    mode === 'email-logs' ? 'emails' : 'accounts'
  );
  const [accounts, setAccounts] = useState<StudentAccountRecord[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogRecord[]>([]);
  const [providerInfo, setProviderInfo] = useState<{
    provider: string;
    configured: boolean;
    from: string;
  }>({ provider: 'sandbox_outbox', configured: false, from: 'TECHMAN COLLEGE' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [oneTimeHandoff, setOneTimeHandoff] = useState<OneTimeCredentialHandoff | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | StudentAccountStatus>('All');
  const [courseFilter, setCourseFilter] = useState('All');

  // Create Single Account Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStudentId, setFormStudentId] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formCourseId, setFormCourseId] = useState(courses[0]?.id || '');
  const [formBatchName, setFormBatchName] = useState('2027 Intake — Batch 01');
  const [formBranchId, setFormBranchId] = useState(branches[0]?.id || 'branch-colombo-hq');
  const [linkedMigratedId, setLinkedMigratedId] = useState('');

  // Edit Student ID / Course Modal
  const [editingAccount, setEditingAccount] = useState<StudentAccountRecord | null>(null);
  const [editStudentId, setEditStudentId] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editBatchName, setEditBatchName] = useState('');

  // Bulk Upload State
  const [bulkRows, setBulkRows] = useState<ParsedBulkRow[]>([]);
  const [bulkSummary, setBulkSummary] = useState<{
    totalProcessed: number;
    createdCount: number;
    skippedCount: number;
    skipped: Array<{ rowNumber: number; studentId?: string; email?: string; reason: string }>;
  } | null>(null);

  // Academic Announcement Composer State
  const [announceRecipients, setAnnounceRecipients] = useState<'all_active' | 'course' | 'single'>('all_active');
  const [announceCourseId, setAnnounceCourseId] = useState(courses[0]?.id || '');
  const [announceSingleEmail, setAnnounceSingleEmail] = useState('');
  const [announceSubject, setAnnounceSubject] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');

  useEffect(() => {
    setSubTab(mode === 'email-logs' ? 'emails' : 'accounts');
  }, [mode]);

  const getToken = async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Super Admin / Admin Firebase authentication required.');
    return token;
  };

  const loadData = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const [accRes, emailRes] = await Promise.all([
        fetch('/api/student-accounts', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/emails/logs', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (accRes.ok) {
        const d = await accRes.json();
        setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
        if (d.emailProvider) setProviderInfo(d.emailProvider);
      }
      if (emailRes.ok) {
        const d = await emailRes.json();
        setEmailLogs(Array.isArray(d.logs) ? d.logs : []);
        if (d.provider) setProviderInfo(d.provider);
      }
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to load student accounts.',
      });
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Mirror non-secret metadata into Firestore `studentAccounts` and `emailLogs`
  const syncAccountToFirestore = async (acc: StudentAccountRecord) => {
    try {
      await setDoc(doc(db, 'studentAccounts', acc.id), stripUndefined({
        studentId: acc.studentId,
        username: acc.username,
        fullName: acc.fullName,
        email: acc.email,
        phone: acc.phone,
        courseId: acc.courseId,
        courseName: acc.courseName,
        batchName: acc.batchName,
        branchId: acc.branchId,
        linkedUserUid: acc.linkedUserUid,
        linkedMigratedId: acc.linkedMigratedId,
        status: acc.status,
        mustChangePassword: acc.mustChangePassword,
        invitationSentAt: acc.invitationSentAt,
        invitationCount: acc.invitationCount ?? 0,
        passwordUpdatedAt: acc.passwordUpdatedAt,
        lastLoginAt: acc.lastLoginAt,
        createdByUid: profile.uid,
        createdByEmail: userEmail,
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: acc.createdAt,
        updatedAt: acc.updatedAt,
      }));
    } catch {
      // Non-blocking mirror
    }
  };

  const syncEmailLogToFirestore = async (log: EmailLogRecord) => {
    try {
      await setDoc(doc(db, 'emailLogs', log.id), stripUndefined({
        emailType: log.emailType,
        recipientEmail: log.recipientEmail,
        recipientName: log.recipientName,
        studentId: log.studentId,
        courseId: log.courseId,
        subject: log.subject,
        bodyPreview: log.bodyPreview,
        provider: log.provider,
        status: log.status,
        errorMessage: log.errorMessage,
        retryCount: log.retryCount ?? 0,
        sentByUid: profile.uid,
        sentByEmail: userEmail,
        institutionId: INSTITUTE_INFO.institutionId,
        sentAt: log.sentAt,
        createdAt: log.createdAt,
      }));
    } catch {
      // Non-blocking mirror
    }
  };

  const handlePrefillFromMigrated = (migId: string) => {
    setLinkedMigratedId(migId);
    const m = migratedStudents.find((x) => x.id === migId);
    if (!m) return;
    setFormFullName(m.fullName || '');
    setFormEmail(m.email || '');
    setFormPhone(m.mobile || m.whatsapp || '');
    setFormStudentId(m.studentId || '');
    const matchedCourse = courses.find(
      (c) =>
        c.id === m.courseId ||
        c.name.toLowerCase() === (m.courseName || '').toLowerCase()
    );
    if (matchedCourse) setFormCourseId(matchedCourse.id);
    if (m.batchName) setFormBatchName(m.batchName);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    setOneTimeHandoff(null);
    try {
      const token = await getToken();
      const course = courses.find((c) => c.id === formCourseId);
      const res = await fetch('/api/student-accounts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: formFullName,
          email: formEmail,
          phone: formPhone,
          studentId: formStudentId || undefined,
          username: formUsername || undefined,
          courseId: course?.id || '',
          courseName: course?.name || '',
          batchName: formBatchName,
          branchId: formBranchId,
          linkedMigratedId: linkedMigratedId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create student account.');

      const createdAcc = data.account as StudentAccountRecord;
      const emailLog = data.emailLog as EmailLogRecord | undefined;
      await syncAccountToFirestore(createdAcc);
      if (emailLog) await syncEmailLogToFirestore(emailLog);
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'STUDENT_ACCOUNT_CREATED',
        targetType: 'studentAccounts',
        targetId: createdAcc.id,
        details: `Created student account ${createdAcc.studentId} (${createdAcc.fullName}) — credentials email status: ${emailLog?.status || 'logged'}`,
      });

      if (data.oneTimeCredentialsPreview) {
        setOneTimeHandoff(data.oneTimeCredentialsPreview);
      }
      setFormFullName('');
      setFormEmail('');
      setFormPhone('');
      setFormStudentId('');
      setFormUsername('');
      setLinkedMigratedId('');
      setShowCreateForm(false);
      setBanner({
        type: 'success',
        message: `Student account ${createdAcc.studentId} (${createdAcc.fullName}) created and login credentials email processed.`,
      });
      await Promise.all([loadData(), onRefreshData()]);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to create student account.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setBusy(true);
    setBanner(null);
    try {
      const token = await getToken();
      const course = courses.find((c) => c.id === editCourseId);
      const res = await fetch(`/api/student-accounts/${encodeURIComponent(editingAccount.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentId: editStudentId,
          courseId: course?.id || '',
          courseName: course?.name || '',
          batchName: editBatchName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to update student account.');
      const updatedAcc = data.account as StudentAccountRecord;
      await syncAccountToFirestore(updatedAcc);
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'STUDENT_ID_OR_COURSE_UPDATED',
        targetType: 'studentAccounts',
        targetId: updatedAcc.id,
        details: `Updated ${updatedAcc.fullName}: Student ID=${updatedAcc.studentId}, Course=${updatedAcc.courseName || 'Unassigned'}, Batch=${updatedAcc.batchName || ''}`,
      });
      setEditingAccount(null);
      setBanner({ type: 'success', message: `Updated Student Account ${updatedAcc.studentId}.` });
      await Promise.all([loadData(), onRefreshData()]);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to update student account.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSuspend = async (acc: StudentAccountRecord) => {
    setBusy(true);
    setBanner(null);
    try {
      const token = await getToken();
      const nextStatus: StudentAccountStatus =
        acc.status === 'Suspended' ? (acc.mustChangePassword ? 'Invitation Sent' : 'Active') : 'Suspended';
      const res = await fetch(`/api/student-accounts/${encodeURIComponent(acc.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to change status.');
      const updated = data.account as StudentAccountRecord;
      await syncAccountToFirestore(updated);
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: nextStatus === 'Suspended' ? 'STUDENT_ACCOUNT_SUSPENDED' : 'STUDENT_ACCOUNT_REACTIVATED',
        targetType: 'studentAccounts',
        targetId: updated.id,
        details: `Set ${updated.studentId} (${updated.fullName}) status to ${nextStatus}`,
      });
      setBanner({ type: 'success', message: `${updated.studentId} status updated to ${nextStatus}.` });
      await Promise.all([loadData(), onRefreshData()]);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to update status.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResetOrResend = async (
    acc: StudentAccountRecord,
    actionMode: 'reset' | 'resend_invite'
  ) => {
    setBusy(true);
    setBanner(null);
    setOneTimeHandoff(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/student-accounts/${encodeURIComponent(acc.id)}/reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ mode: actionMode }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password reset failed.');
      const updated = data.account as StudentAccountRecord;
      const emailLog = data.emailLog as EmailLogRecord | undefined;
      await syncAccountToFirestore(updated);
      if (emailLog) await syncEmailLogToFirestore(emailLog);
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: actionMode === 'reset' ? 'STUDENT_PASSWORD_RESET_INITIATED' : 'STUDENT_INVITE_RESENT',
        targetType: 'studentAccounts',
        targetId: updated.id,
        details: `${actionMode === 'reset' ? 'Password reset' : 'Invitation resend'} for ${updated.studentId} (${updated.email})`,
      });
      if (data.oneTimeCredentialsPreview) {
        setOneTimeHandoff(data.oneTimeCredentialsPreview);
      }
      setBanner({
        type: 'success',
        message:
          actionMode === 'reset'
            ? `Password reset initiated for ${updated.studentId}. New temporary credentials email processed.`
            : `Fresh login invitation sent to ${updated.email}.`,
      });
      await Promise.all([loadData(), onRefreshData()]);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to reset credentials.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Bulk Excel/CSV Template Download & Parser
  const handleDownloadTemplate = () => {
    const sample = [
      {
        'Full Name': 'Ayesha Fernando',
        Email: 'ayesha.fernando@example.com',
        Phone: '+94771234567',
        'Student ID (Optional)': '',
        'Course Name': courses[0]?.name || 'Diploma in Artificial Intelligence',
        Batch: '2027 Intake — Batch 01',
      },
      {
        'Full Name': 'Kasun Perera',
        Email: 'kasun.perera@example.com',
        Phone: '+94719876543',
        'Student ID (Optional)': 'TM27-2050',
        'Course Name': courses[1]?.name || 'Certificate in Graphic Design',
        Batch: '2027 Intake — Batch 01',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Accounts');
    XLSX.writeFile(wb, 'TECHMAN_Student_Accounts_Template.xlsx');
  };

  const handleBulkFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkSummary(null);
    setBanner(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const existingIds = new Set(accounts.map((a) => a.studentId.toUpperCase()));
      const existingEmails = new Set(accounts.map((a) => a.email.toLowerCase()));
      const seenIds = new Set<string>();
      const seenEmails = new Set<string>();

      const parsed: ParsedBulkRow[] = rawRows.slice(0, 250).map((r, i) => {
        const pick = (...keys: string[]) => {
          for (const k of Object.keys(r)) {
            const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (keys.includes(norm)) return String(r[k] ?? '').trim();
          }
          return '';
        };
        const fullName = pick('fullname', 'name', 'studentname');
        const email = pick('email', 'emailaddress', 'studentemail').toLowerCase();
        const phone = pick('phone', 'mobile', 'whatsapp', 'contact');
        const studentId = pick('studentid', 'studentidoptional', 'id', 'regno').toUpperCase();
        const courseRaw = pick('coursename', 'course', 'programme');
        const batchName = pick('batch', 'batchname', 'intake') || '2027 Intake — Batch 01';
        const matchedCourse = courses.find(
          (c) =>
            c.name.toLowerCase() === courseRaw.toLowerCase() ||
            c.code.toLowerCase() === courseRaw.toLowerCase() ||
            (courseRaw && c.name.toLowerCase().includes(courseRaw.toLowerCase()))
        );

        let error: string | undefined;
        if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          error = 'Missing valid full name or email';
        } else if (existingEmails.has(email) || seenEmails.has(email)) {
          error = 'Duplicate email address';
        } else if (studentId && (existingIds.has(studentId) || seenIds.has(studentId))) {
          error = `Duplicate Student ID (${studentId})`;
        }

        if (email) seenEmails.add(email);
        if (studentId) seenIds.add(studentId);

        return {
          rowNumber: i + 2,
          fullName,
          email,
          phone,
          studentId,
          courseId: matchedCourse?.id || '',
          courseName: matchedCourse?.name || courseRaw,
          batchName,
          branchId: branches[0]?.id || 'branch-colombo-hq',
          error,
        };
      });

      setBulkRows(parsed);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to read spreadsheet file.',
      });
    }
  };

  const handleRunBulkCreate = async () => {
    const validRows = bulkRows.filter((r) => !r.error);
    if (validRows.length === 0) {
      setBanner({ type: 'error', message: 'No valid student rows ready to create.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/student-accounts/bulk-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: bulkRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk creation failed.');
      for (const item of data.created || []) {
        await syncAccountToFirestore(item.account as StudentAccountRecord);
      }
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'BULK_STUDENT_ACCOUNTS_CREATED',
        targetType: 'studentAccounts',
        targetId: `batch_${Date.now()}`,
        details: `Bulk created ${data.createdCount} student accounts (${data.skippedCount} skipped)`,
      });
      setBulkSummary({
        totalProcessed: data.totalProcessed,
        createdCount: data.createdCount,
        skippedCount: data.skippedCount,
        skipped: data.skipped || [],
      });
      setBulkRows([]);
      setBanner({
        type: 'success',
        message: `Bulk import complete: ${data.createdCount} accounts created, ${data.skippedCount} skipped.`,
      });
      await Promise.all([loadData(), onRefreshData()]);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Bulk student account creation failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const token = await getToken();
      let recipients: Array<{ email: string; name?: string; studentId?: string }> = [];
      if (announceRecipients === 'single') {
        recipients = [{ email: announceSingleEmail.trim(), name: 'Student' }];
      } else if (announceRecipients === 'course') {
        recipients = accounts
          .filter((a) => a.courseId === announceCourseId && a.status !== 'Suspended')
          .map((a) => ({ email: a.email, name: a.fullName, studentId: a.studentId }));
      } else {
        recipients = accounts
          .filter((a) => a.status !== 'Suspended')
          .map((a) => ({ email: a.email, name: a.fullName, studentId: a.studentId }));
      }
      if (recipients.length === 0) {
        throw new Error('No eligible student email recipients found for the selected audience.');
      }

      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          emailType: 'academic_announcement',
          recipients,
          courseId: announceRecipients === 'course' ? announceCourseId : undefined,
          subject: announceSubject,
          message: announceMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send announcement.');
      for (const l of data.logs || []) {
        await syncEmailLogToFirestore(l as EmailLogRecord);
      }
      setAnnounceSubject('');
      setAnnounceMessage('');
      setAnnounceSingleEmail('');
      setBanner({
        type: 'success',
        message: `Announcement processed for ${recipients.length} recipient(s): ${data.sentCount} sent, ${data.queuedCount} queued, ${data.failedCount} failed.`,
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to send email announcement.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResendEmailLog = async (log: EmailLogRecord) => {
    setBusy(true);
    setBanner(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/emails/resend/${encodeURIComponent(log.id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to resend email.');
      if (data.log) await syncEmailLogToFirestore(data.log as EmailLogRecord);
      setBanner({
        type: 'success',
        message: `Resend attempt completed for ${log.recipientEmail} (Status: ${data.log?.status}).`,
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Resend failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = (label: string, value: string) => {
    void navigator.clipboard.writeText(value);
    setCopiedField(label);
    window.setTimeout(() => setCopiedField(null), 1800);
  };

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (courseFilter !== 'All' && a.courseId !== courseFilter) return false;
      if (!q) return true;
      return (
        a.studentId.toLowerCase().includes(q) ||
        a.fullName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.courseName || '').toLowerCase().includes(q)
      );
    });
  }, [accounts, searchQuery, statusFilter, courseFilter]);

  const kpis = useMemo(
    () => ({
      total: accounts.length,
      active: accounts.filter((a) => a.status === 'Active').length,
      pending: accounts.filter((a) => a.status === 'Invitation Sent').length,
      resetReq: accounts.filter((a) => a.status === 'Password Reset Required').length,
      suspended: accounts.filter((a) => a.status === 'Suspended').length,
    }),
    [accounts]
  );

  if (!canManage) {
    return (
      <div className="p-8 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm">
        <ShieldAlert className="w-5 h-5 mb-2" />
        Super Owner or Authorized Admin access is strictly required to manage student accounts and email credentials.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-white">
            Student ID, Credentials &amp; Email Notification Centre
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Create verified student accounts, enforce first-login password setup, prevent duplicate Student IDs, and track automated email delivery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('accounts');
              setShowCreateForm(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create Student Account
          </button>
        </div>
      </div>

      {/* Email Provider Status Bar */}
      <div
        className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
          providerInfo.configured
            ? 'border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
            : 'border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 shrink-0" />
          <span>
            <strong>Email Delivery Engine:</strong>{' '}
            {providerInfo.configured
              ? `Live (${providerInfo.provider.toUpperCase()} · From: ${providerInfo.from})`
              : 'Delivery Outbox Mode (Add RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS in server secrets for live inbox delivery — one-time setup links & logs work immediately)'}
          </span>
        </div>
        <span className="font-mono text-[11px]">Zero Plaintext Password Storage Active</span>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="text-xs underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* One-Time Credentials Handoff Box */}
      {oneTimeHandoff && (
        <div className="p-5 rounded-2xl border-2 border-[#1677FF] bg-blue-50/80 dark:bg-blue-950/30 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#1677FF] dark:text-sky-400">
                One-Time Student Credentials Handoff (Shown Once Only)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{oneTimeHandoff.note}</p>
            </div>
            <button
              type="button"
              onClick={() => setOneTimeHandoff(null)}
              className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 block">Student ID</span>
              <div className="flex items-center justify-between mt-1">
                <code className="font-bold text-sm text-[#101D35] dark:text-white">
                  {oneTimeHandoff.studentId}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy('sid', oneTimeHandoff.studentId)}
                  className="text-[#1677FF] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedField === 'sid' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 block">Username</span>
              <div className="flex items-center justify-between mt-1">
                <code className="font-bold text-sm text-[#101D35] dark:text-white">
                  {oneTimeHandoff.username}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy('usr', oneTimeHandoff.username)}
                  className="text-[#1677FF] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedField === 'usr' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 block">Temporary Password (First Login Only)</span>
              <div className="flex items-center justify-between mt-1">
                <code className="font-bold text-sm text-rose-700 dark:text-rose-400">
                  {oneTimeHandoff.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy('pw', oneTimeHandoff.temporaryPassword)}
                  className="text-[#1677FF] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedField === 'pw' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="truncate max-w-2xl">
              <span className="text-slate-500 mr-2">One-Time Activation Link (48h):</span>
              <code className="text-[#1677FF]">{oneTimeHandoff.activationUrl}</code>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('act', oneTimeHandoff.activationUrl)}
              className="px-3 py-1.5 rounded-lg bg-[#101D35] text-white font-semibold cursor-pointer shrink-0"
            >
              {copiedField === 'act' ? 'Copied Link!' : 'Copy Activation Link'}
            </button>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Student Accounts', value: kpis.total, accent: 'text-[#101D35] dark:text-white' },
          { label: 'Active Accounts', value: kpis.active, accent: 'text-emerald-700 dark:text-emerald-400' },
          { label: 'Invitations Pending', value: kpis.pending, accent: 'text-[#1677FF] dark:text-sky-400' },
          { label: 'Password Reset Requests', value: kpis.resetReq, accent: 'text-amber-700 dark:text-amber-400' },
          { label: 'Suspended Accounts', value: kpis.suspended, accent: 'text-rose-700 dark:text-rose-400' },
        ].map((item) => (
          <div
            key={item.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
            <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${item.accent}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'accounts' as const, label: 'Student Accounts Directory', icon: ShieldCheck },
          { id: 'bulk' as const, label: 'Bulk Excel / CSV Creation', icon: FileSpreadsheet },
          { id: 'emails' as const, label: `Email Delivery Logs (${emailLogs.length})`, icon: Mail },
        ].map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                active
                  ? 'bg-[#101D35] text-white dark:bg-[#1677FF]'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-[#1677FF]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: STUDENT ACCOUNTS DIRECTORY */}
      {subTab === 'accounts' && (
        <div className="space-y-5">
          {showCreateForm && (
            <form
              onSubmit={handleCreateAccount}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                  Create New Student Account &amp; Send Login Credentials
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  Close
                </button>
              </div>

              {migratedStudents.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Optional: Link from Migrated Student Registry
                  </label>
                  <select
                    value={linkedMigratedId}
                    onChange={(e) => handlePrefillFromMigrated(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">-- Enter manually or select an existing student record --</option>
                    {migratedStudents.slice(0, 100).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.studentId} — {m.fullName} ({m.email || 'No email'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Student Full Name *</label>
                  <input
                    required
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="e.g. Ayesha Fernando"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Student Email *</label>
                  <input
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Phone / WhatsApp</label>
                  <input
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+94 7X XXX XXXX"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Student ID (Auto-generated if blank)
                  </label>
                  <input
                    value={formStudentId}
                    onChange={(e) => setFormStudentId(e.target.value)}
                    placeholder="Auto: TM27-XXXX"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Username (Auto-generated if blank)
                  </label>
                  <input
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Auto from name"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Linked Course</label>
                  <select
                    value={formCourseId}
                    onChange={(e) => setFormCourseId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">-- Select Course --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Batch &amp; Branch</label>
                  <input
                    value={formBatchName}
                    onChange={(e) => setFormBatchName(e.target.value)}
                    placeholder="2027 Intake — Batch 01"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500">
                  A unique temporary password and 48-hour activation link will be generated and emailed automatically. Plaintext passwords are never saved.
                </span>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1677FF] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {busy ? 'Creating & Sending Email...' : 'Create Account & Email Credentials'}
                </button>
              </div>
            </form>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Student ID, username, name, email, or course..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | StudentAccountStatus)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  Status: {s}
                </option>
              ))}
            </select>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-w-[240px]"
            >
              <option value="All">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Accounts Table */}
          {filteredAccounts.length === 0 ? (
            <EmptyState
              title="No Student Accounts Found"
              description="Create your first student portal account manually or import a batch via Excel/CSV to send automated login credentials."
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Student ID &amp; Username</th>
                    <th className="py-3 px-4 font-semibold">Student &amp; Email</th>
                    <th className="py-3 px-4 font-semibold">Course &amp; Batch</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Activity</th>
                    <th className="py-3 px-4 font-semibold text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#101D35] dark:text-white">
                          {acc.studentId}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{acc.username}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{acc.fullName}</div>
                        <div className="text-[11px] text-slate-500">{acc.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200 max-w-[220px] truncate">
                          {acc.courseName || 'Unassigned'}
                        </div>
                        <div className="text-[11px] text-slate-500">{acc.batchName || '2027 Intake'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={acc.status} />
                        {acc.mustChangePassword && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                            First-login password change required
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500">
                        <div>Invites: {acc.invitationCount || 0}</div>
                        <div>
                          Last Login:{' '}
                          {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleDateString() : 'Never'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccount(acc);
                              setEditStudentId(acc.studentId);
                              setEditCourseId(acc.courseId || '');
                              setEditBatchName(acc.batchName || '');
                            }}
                            title="Edit Student ID / Course"
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#1677FF] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" /> Edit ID
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleResetOrResend(acc, 'reset')}
                            title="Initiate Password Reset"
                            className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <KeyRound className="w-3 h-3" /> Reset PW
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleResetOrResend(acc, 'resend_invite')}
                            title="Resend Credentials Email"
                            className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Mail className="w-3 h-3" /> Resend
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleSuspend(acc)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                              acc.status === 'Suspended'
                                ? 'bg-emerald-600 text-white'
                                : 'border border-rose-200 text-rose-700 dark:text-rose-300 hover:bg-rose-50'
                            }`}
                          >
                            {acc.status === 'Suspended' ? (
                              <>
                                <UserCheck className="w-3 h-3" /> Activate
                              </>
                            ) : (
                              <>
                                <UserX className="w-3 h-3" /> Suspend
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BULK EXCEL / CSV ACCOUNT CREATION */}
      {subTab === 'bulk' && (
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                Bulk Student Account Creation (Excel / CSV)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload an .xlsx, .xls, or .csv sheet. Duplicate Student IDs and duplicate emails are automatically flagged and rejected before creation.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download Sample Template (.xlsx)
            </button>
          </div>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center cursor-pointer hover:border-[#1677FF] transition">
            <Upload className="w-7 h-7 text-[#1677FF] mb-2" />
            <span className="text-xs font-semibold text-slate-800 dark:text-white">
              Click to upload Excel (.xlsx / .xls) or CSV (.csv) student roster
            </span>
            <span className="text-[11px] text-slate-500 mt-1">
              Columns: Full Name, Email, Phone, Student ID (optional), Course Name, Batch (max 250 rows per batch)
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => void handleBulkFileUpload(e)}
              className="hidden"
            />
          </label>

          {bulkRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">
                  Preview: {bulkRows.length} rows parsed ·{' '}
                  <span className="text-emerald-700">
                    {bulkRows.filter((r) => !r.error).length} valid
                  </span>{' '}
                  ·{' '}
                  <span className="text-rose-700">
                    {bulkRows.filter((r) => r.error).length} duplicate/invalid
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy || bulkRows.every((r) => Boolean(r.error))}
                  onClick={() => void handleRunBulkCreate()}
                  className="px-4 py-2 rounded-xl bg-[#1677FF] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {busy ? 'Creating Accounts...' : 'Create Valid Student Accounts & Email Credentials'}
                </button>
              </div>
              <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Full Name</th>
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Student ID</th>
                      <th className="py-2 px-3">Course</th>
                      <th className="py-2 px-3">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bulkRows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                        <td className="py-2 px-3 font-medium">{r.fullName}</td>
                        <td className="py-2 px-3">{r.email}</td>
                        <td className="py-2 px-3 font-mono">{r.studentId || 'Auto'}</td>
                        <td className="py-2 px-3">{r.courseName || '-'}</td>
                        <td className="py-2 px-3">
                          {r.error ? (
                            <span className="text-rose-700 font-semibold">{r.error}</span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {bulkSummary && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
              <div className="font-bold text-slate-900 dark:text-white">
                Bulk Import Report: {bulkSummary.createdCount} Created · {bulkSummary.skippedCount} Skipped (out of {bulkSummary.totalProcessed})
              </div>
              {bulkSummary.skipped.length > 0 && (
                <ul className="list-disc pl-5 text-rose-700 dark:text-rose-400 space-y-0.5">
                  {bulkSummary.skipped.map((s, idx) => (
                    <li key={idx}>
                      Row {s.rowNumber}: {s.email || s.studentId || 'Unknown'} — {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EMAIL NOTIFICATION CENTER & DELIVERY LOGS */}
      {subTab === 'emails' && (
        <div className="space-y-6">
          {/* Academic Announcement Composer */}
          <form
            onSubmit={handleSendAnnouncement}
            className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
          >
            <h2 className="text-base font-bold text-[#101D35] dark:text-white">
              Send Official Academic Announcement Email
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Target Audience</label>
                <select
                  value={announceRecipients}
                  onChange={(e) =>
                    setAnnounceRecipients(e.target.value as 'all_active' | 'course' | 'single')
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="all_active">All Active / Invited Student Accounts</option>
                  <option value="course">Students in Specific Course</option>
                  <option value="single">Single Recipient Email</option>
                </select>
              </div>
              {announceRecipients === 'course' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Course</label>
                  <select
                    value={announceCourseId}
                    onChange={(e) => setAnnounceCourseId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {announceRecipients === 'single' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Recipient Email *</label>
                  <input
                    required
                    type="email"
                    value={announceSingleEmail}
                    onChange={(e) => setAnnounceSingleEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              )}
              <div className={announceRecipients === 'all_active' ? 'md:col-span-2' : ''}>
                <label className="block text-xs font-semibold mb-1">Email Subject *</label>
                <input
                  required
                  value={announceSubject}
                  onChange={(e) => setAnnounceSubject(e.target.value)}
                  placeholder="e.g. 2027 Intake Orientation & Schedule Update"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Announcement Message *</label>
              <textarea
                required
                rows={3}
                value={announceMessage}
                onChange={(e) => setAnnounceMessage(e.target.value)}
                placeholder="Write the official academic notice to deliver via TECHMAN COLLEGE email service..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#101D35] dark:bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {busy ? 'Sending...' : 'Send Academic Announcement'}
              </button>
            </div>
          </form>

          {/* Delivery Logs Table */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#101D35] dark:text-white">
                Transactional Email Delivery &amp; Failure Logs
              </h3>
              <span className="text-[11px] text-slate-500">
                Credentials are strictly redacted in all stored logs
              </span>
            </div>
            {emailLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No email deliveries logged yet. Create a student account or send an academic announcement to record delivery logs.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Type &amp; Time</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Subject &amp; Redacted Preview</th>
                    <th className="py-3 px-4">Delivery Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {emailLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {log.emailType.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {log.recipientEmail}
                        </div>
                        {log.studentId && (
                          <div className="font-mono text-[11px] text-slate-500">{log.studentId}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {log.subject}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                          {log.bodyPreview}
                        </div>
                        {log.errorMessage && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                            {log.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusLabel
                          status={
                            log.status === 'sent'
                              ? 'Sent'
                              : log.status === 'failed'
                                ? 'Failed'
                                : 'Queued (Outbox)'
                          }
                        />
                        <div className="text-[10px] text-slate-500 mt-1">
                          Provider: {log.provider} · Retries: {log.retryCount}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {log.emailType === 'student_account_created' ||
                        log.emailType === 'password_reset' ||
                        log.emailType === 'login_credentials' ? (
                          <span className="text-[11px] text-slate-400">
                            Use Account Reset/Resend
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleResendEmailLog(log)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#1677FF] text-[11px] font-semibold cursor-pointer"
                          >
                            Resend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* EDIT STUDENT ID / COURSE MODAL */}
      {editingAccount && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setEditingAccount(null)}
        >
          <form
            onSubmit={handleSaveEditAccount}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#101D35] dark:text-white">
                Edit Student ID &amp; Enrollment Link
              </h3>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="p-1 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-500">
              Student: <strong>{editingAccount.fullName}</strong> ({editingAccount.email})
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Student ID (Unique) *</label>
              <input
                required
                value={editStudentId}
                onChange={(e) => setEditStudentId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Linked Course</label>
              <select
                value={editCourseId}
                onChange={(e) => setEditCourseId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Unassigned --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Batch Name</label>
              <input
                value={editBatchName}
                onChange={(e) => setEditBatchName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
              >
                {busy ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
