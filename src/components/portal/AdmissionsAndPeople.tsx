import React, { useMemo, useRef, useState } from 'react';
import {
  Building2,
  Database,
  Download,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Plus,
  Search,
  Shield,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import {
  buildFirestoreApplicationPayload,
  buildFirestoreTrackerPayload,
  CsvImportPreview,
  parseStudentRegistrationCsv,
} from '../../lib/csvImporter';
import {
  DEFAULT_ROLE_PERMISSIONS,
  INSTITUTE_INFO,
  isProtectedOwnerEmail,
  UPLOADED_REGISTRATION_CSV_PATH,
} from '../../data/catalogSeed';
import {
  Application,
  ApplicationStatus,
  Branch,
  Course,
  MigratedStudentRecord,
  MigrationBatch,
  RoleInvitation,
  UserProfile,
  UserRole,
} from '../../types/lms';
import { EmptyState, StatusLabel } from '../common/PlatformWidgets';

interface AdmissionsPeopleProps {
  mode: 'admissions' | 'people' | 'branches';
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  applications: Application[];
  usersList: UserProfile[];
  invitations: RoleInvitation[];
  branches: Branch[];
  courses: Course[];
  migratedStudents?: MigratedStudentRecord[];
  migrationBatches?: MigrationBatch[];
  onOpenMigration?: () => void;
  onRefreshData: () => Promise<void>;
}

const APPLICATION_STATUSES: ApplicationStatus[] = [
  'Submitted',
  'Under Review',
  'Documents Required',
  'Approved',
  'Payment Pending',
  'Enrolled',
  'Rejected',
];

const ALL_13_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'BRANCH_MANAGER',
  'COORDINATOR',
  'ADMISSION_OFFICER',
  'ACADEMIC_MANAGER',
  'LECTURER',
  'ACCOUNTANT',
  'EXAMINER',
  'CONTENT_MANAGER',
  'STUDENT',
  'AFFILIATE',
  'SUPPORT_STAFF',
];

export const AdmissionsAndPeople: React.FC<AdmissionsPeopleProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  applications,
  usersList,
  invitations,
  branches,
  courses,
  migratedStudents = [],
  migrationBatches = [],
  onOpenMigration,
  onRefreshData,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Migrated Students Directory Filters (People / Reports)
  const [migSearch, setMigSearch] = useState('');
  const [migBranchFilter, setMigBranchFilter] = useState('All');
  const [migCourseFilter, setMigCourseFilter] = useState('All');
  const [migBatchFilter, setMigBatchFilter] = useState('All');

  const filteredMigratedStudents = useMemo(() => {
    const q = migSearch.trim().toLowerCase();
    return migratedStudents.filter((s) => {
      if (migBranchFilter !== 'All' && (s.branchId || s.branchName || '') !== migBranchFilter) {
        return false;
      }
      if (migCourseFilter !== 'All' && (s.courseId || s.courseName || '') !== migCourseFilter) {
        return false;
      }
      if (migBatchFilter !== 'All' && s.importBatchId !== migBatchFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.mobile || '').toLowerCase().includes(q) ||
        (s.whatsapp || '').toLowerCase().includes(q) ||
        (s.courseName || '').toLowerCase().includes(q)
      );
    });
  }, [migratedStudents, migSearch, migBranchFilter, migCourseFilter, migBatchFilter]);

  // CSV Import State (Owner / Admissions Officer)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvImportPreview | null>(null);
  const [csvSourceName, setCsvSourceName] = useState<string>('');
  const [importingCsv, setImportingCsv] = useState(false);

  // Invite Staff / Student Modal
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRole, setInvRole] = useState<UserRole>('LECTURER');
  const [invBranchId, setInvBranchId] = useState(branches[0]?.id || 'branch-colombo-hq');

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [brCode, setBrCode] = useState('');
  const [brName, setBrName] = useState('');
  const [brCity, setBrCity] = useState('');
  const [brManager, setBrManager] = useState('');
  const [brCoordinator, setBrCoordinator] = useState('');

  const handleUpdateApplicationStatus = async (
    app: Application,
    nextStatus: ApplicationStatus
  ) => {
    setBusyId(app.id);
    setFeedback(null);
    const now = new Date().toISOString();
    try {
      let assignedStudentId = app.assignedStudentId || '';
      if (nextStatus === 'Enrolled' && !assignedStudentId) {
        assignedStudentId = `TM27-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      await updateDoc(doc(db, 'applications', app.id), {
        status: nextStatus,
        assignedStudentId,
        updatedAt: now,
      });

      await setDoc(
        doc(db, 'applicationTrackers', app.applicationNumber),
        {
          applicationNumber: app.applicationNumber,
          courseName: app.courseName,
          status: nextStatus,
          assignedStudentId,
          updatedAt: now,
        },
        { merge: true }
      );

      if (nextStatus === 'Enrolled') {
        // Create secure activation invitation for the student
        const invId = makeSafeId('INV');
        await setDoc(doc(db, 'roleInvitations', invId), {
          email: app.email.toLowerCase(),
          fullName: app.fullName,
          role: 'STUDENT',
          branchId: app.branchId || 'branch-colombo-hq',
          studentId: assignedStudentId,
          status: 'pending',
          invitedBy: profile.uid,
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: now,
        });

        // If student user already exists in usersList, create live enrollment too
        const matchedUser = usersList.find(
          (u) => u.displayName.toLowerCase() === app.fullName.toLowerCase()
        );
        if (matchedUser) {
          const enrId = makeSafeId('ENR');
          await setDoc(doc(db, 'enrollments', enrId), {
            userId: matchedUser.uid,
            studentId: assignedStudentId,
            studentName: app.fullName,
            courseId: app.courseId,
            courseName: app.courseName,
            branchId: app.branchId || 'branch-colombo-hq',
            batchName: app.batchName || '2027 Intake — Batch 01',
            progressPercent: 0,
            status: 'active',
            institutionId: INSTITUTE_INFO.institutionId,
            enrolledAt: now,
          });
        }
      }

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: `APPLICATION_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        targetType: 'applications',
        targetId: app.applicationNumber,
        details: `Set ${app.fullName} (${app.courseName}) to ${nextStatus}${assignedStudentId ? ` · Student ID: ${assignedStudentId}` : ''}`,
      });

      if (nextStatus === 'Approved' || nextStatus === 'Enrolled') {
        try {
          const token = await auth.currentUser?.getIdToken();
          if (token && app.email) {
            await fetch('/api/emails/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                emailType: 'admission_confirmation',
                toEmail: app.email.toLowerCase(),
                toName: app.fullName,
                applicationNumber: app.applicationNumber,
                studentId: assignedStudentId || app.assignedStudentId || '',
                courseName: app.courseName,
                batchName: app.batchName || '2027 Intake',
                status: nextStatus,
              }),
            });
          }
        } catch (emailErr) {
          console.warn('Admission confirmation email warning:', emailErr);
        }
      }

      setFeedback(
        `Updated ${app.applicationNumber} to "${nextStatus}"${
          nextStatus === 'Approved' || nextStatus === 'Enrolled'
            ? ' & dispatched Admission Confirmation email.'
            : '.'
        }`
      );
      await onRefreshData();
    } finally {
      setBusyId(null);
    }
  };

  const handleExportApplicationsCsv = () => {
    const header = ['ApplicationNumber', 'FullName', 'Email', 'Phone', 'Course', 'Mode', 'Status', 'StudentID'];
    const rows = applications.map((a) => [
      a.applicationNumber,
      a.fullName,
      a.email,
      a.phone,
      a.courseName,
      a.preferredMode,
      a.status,
      a.assignedStudentId || '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techman-college-admissions-2027.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadUploadedBatchCsv = async () => {
    setFeedback(null);
    try {
      const resp = await fetch(UPLOADED_REGISTRATION_CSV_PATH);
      if (!resp.ok) throw new Error('Unable to load uploaded registration CSV.');
      const text = await resp.text();
      const preview = parseStudentRegistrationCsv(text, courses, applications);
      setCsvSourceName('TECHMAN COLLEGE — Student Registration Form (Uploaded Batch)');
      setCsvPreview(preview);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to parse uploaded CSV.');
    }
  };

  const handlePickCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const text = await file.text();
      const preview = parseStudentRegistrationCsv(text, courses, applications);
      setCsvSourceName(file.name);
      setCsvPreview(preview);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to read CSV file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || csvPreview.uniqueRows.length === 0) return;
    setImportingCsv(true);
    setFeedback(null);
    const now = new Date().toISOString();
    let importedCount = 0;
    try {
      // Import in controlled chunks of 8 to respect Firestore write throughput cleanly
      const rows = csvPreview.uniqueRows;
      for (let i = 0; i < rows.length; i += 8) {
        const chunk = rows.slice(i, i + 8);
        await Promise.all(
          chunk.map(async (row) => {
            const appPayload = buildFirestoreApplicationPayload(row, now);
            const trackerPayload = buildFirestoreTrackerPayload(row, now);
            await Promise.all([
              setDoc(doc(db, 'applications', row.applicationNumber), appPayload),
              setDoc(doc(db, 'applicationTrackers', row.applicationNumber), trackerPayload),
            ]);
            importedCount++;
          })
        );
      }

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'IMPORT_ADMISSIONS_CSV',
        targetType: 'applications',
        targetId: `CSV-${importedCount}`,
        details: `Imported ${importedCount} student registrations from ${csvSourceName} (${csvPreview.duplicatesSkipped} duplicates skipped)`,
      });

      setCsvPreview(null);
      setFeedback(
        `Successfully imported ${importedCount} student registration${importedCount === 1 ? '' : 's'} into Firestore (${csvPreview.duplicatesSkipped} duplicate${csvPreview.duplicatesSkipped === 1 ? '' : 's'} skipped).`
      );
      await onRefreshData();
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? `Import interrupted after ${importedCount} records: ${err.message}`
          : 'CSV import failed.'
      );
    } finally {
      setImportingCsv(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) return;
    const invId = makeSafeId('INV');
    const now = new Date().toISOString();
    await setDoc(doc(db, 'roleInvitations', invId), {
      email: invEmail.trim().toLowerCase().slice(0, 160),
      fullName: invName.trim().slice(0, 120),
      role: invRole,
      branchId: invBranchId,
      status: 'pending',
      invitedBy: profile.uid,
      institutionId: INSTITUTE_INFO.institutionId,
      createdAt: now,
    });
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: 'CREATE_ROLE_INVITATION',
      targetType: 'roleInvitations',
      targetId: invId,
      details: `Invited ${invEmail} as ${invRole} (Branch: ${invBranchId})`,
    });
    setInvEmail('');
    setInvName('');
    setShowInvite(false);
    setFeedback(`Secure role invitation created for ${invEmail} (${invRole}).`);
    await onRefreshData();
  };

  const handleChangeUserRole = async (target: UserProfile, nextRole: UserRole) => {
    if (target.role === 'SUPER_ADMIN') return; // Owner accounts are protected
    setBusyId(target.uid);
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', target.uid), {
        role: nextRole,
        designation: nextRole.replace(/_/g, ' '),
        updatedAt: now,
      });
      if (
        ['ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'ADMISSION_OFFICER', 'ACADEMIC_MANAGER', 'EXAMINER', 'CONTENT_MANAGER', 'COORDINATOR'].includes(
          nextRole
        ) &&
        isOwner
      ) {
        await setDoc(
          doc(db, 'admins', target.uid),
          {
            uid: target.uid,
            email: `${target.uid}@techman.local`,
            role: nextRole,
            branchId: target.branchId || 'branch-colombo-hq',
            protectedOwner: false,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'UPDATE_USER_ROLE',
        targetType: 'users',
        targetId: target.uid,
        details: `Updated ${target.displayName} role from ${target.role} to ${nextRole}`,
      });
      setFeedback(`Updated ${target.displayName} to ${nextRole}.`);
      await onRefreshData();
    } finally {
      setBusyId(null);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brCode.trim() || !brName.trim() || !brCity.trim()) return;
    const id = `branch-${brCode.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;
    await setDoc(doc(db, 'branches', id), {
      code: brCode.trim().toUpperCase().slice(0, 24),
      name: brName.trim().slice(0, 120),
      city: brCity.trim().slice(0, 80),
      managerName: brManager.trim().slice(0, 120),
      coordinatorName: brCoordinator.trim().slice(0, 120),
      phone: INSTITUTE_INFO.phone,
      status: 'active',
      institutionId: INSTITUTE_INFO.institutionId,
      createdAt: new Date().toISOString(),
    });
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: 'CREATE_BRANCH',
      targetType: 'branches',
      targetId: id,
      details: `Created branch ${brName} (${brCity})`,
    });
    setBrCode('');
    setBrName('');
    setBrCity('');
    setBrManager('');
    setBrCoordinator('');
    setShowBranchModal(false);
    await onRefreshData();
  };

  // MODE 1: ADMISSIONS 2027 MANAGEMENT
  if (mode === 'admissions') {
    const filteredApps =
      statusFilter === 'All'
        ? applications
        : applications.filter((a) => a.status === statusFilter);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              2027 Admissions &amp; Enrollment Pipeline
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Review applications, verify documents, generate official Student IDs, and activate portal invitations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handlePickCsvFile}
              className="hidden"
            />
            {isOwner && onOpenMigration && (
              <button
                onClick={onOpenMigration}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0F172A] hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700 text-xs font-medium text-white cursor-pointer whitespace-nowrap"
              >
                <Database className="w-4 h-4" />
                Bulk Migration Studio (.xlsx / .csv)
              </button>
            )}
            <button
              onClick={() => void handleLoadUploadedBatchCsv()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-xs font-medium text-white cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Quick Admissions CSV
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              Upload CSV
            </button>
            <button
              onClick={handleExportApplicationsCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* CSV IMPORT CONFIRMATION & PREVIEW MODAL */}
        {csvPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
            <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden my-6">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-violet-700 dark:text-violet-400">
                    Student Registration Batch Import
                  </div>
                  <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                    {csvSourceName}
                  </h2>
                </div>
                <button
                  onClick={() => setCsvPreview(null)}
                  disabled={importingCsv}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Close CSV preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Rows in CSV</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                      {csvPreview.totalRows}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">New Ready to Import</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-300 mt-0.5">
                      {csvPreview.uniqueRows.length}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Duplicates Skipped</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
                      {csvPreview.duplicatesSkipped}
                    </div>
                  </div>
                </div>

                {Object.keys(csvPreview.courseBreakdown).length > 0 && (
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">Mapped Courses: </span>
                    {Object.entries(csvPreview.courseBreakdown)
                      .map(([name, count]) => `${name} (${count})`)
                      .join(' · ')}
                  </div>
                )}

                {csvPreview.uniqueRows.length === 0 ? (
                  <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">
                    All student registrations from this CSV already exist in Firestore. No duplicate records will be created.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-3 py-2 font-medium">App No</th>
                          <th className="px-3 py-2 font-medium">Applicant</th>
                          <th className="px-3 py-2 font-medium">Mapped Course</th>
                          <th className="px-3 py-2 font-medium">District</th>
                          <th className="px-3 py-2 font-medium">Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {csvPreview.uniqueRows.slice(0, 12).map((row) => (
                          <tr key={row.applicationNumber}>
                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">
                              {row.applicationNumber}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900 dark:text-white">{row.fullName}</div>
                              <div className="text-[11px] text-slate-500">{row.email}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.courseName}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.district}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.preferredMode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvPreview.uniqueRows.length > 12 && (
                      <div className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800">
                        + {csvPreview.uniqueRows.length - 12} more applicants ready to import
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50 dark:bg-slate-950/40">
                <button
                  onClick={() => setCsvPreview(null)}
                  disabled={importingCsv}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleConfirmCsvImport()}
                  disabled={importingCsv || csvPreview.uniqueRows.length === 0}
                  className="px-5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-xs font-medium text-white cursor-pointer"
                >
                  {importingCsv
                    ? 'Importing into Firestore...'
                    : `Import ${csvPreview.uniqueRows.length} Registrations`}
                </button>
              </div>
            </div>
          </div>
        )}

        {feedback && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {['All', ...APPLICATION_STATUSES].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                statusFilter === st
                  ? 'bg-[#0F172A] dark:bg-violet-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {filteredApps.length === 0 ? (
          <EmptyState
            title="No Applications in This Queue"
            description="Prospective students submitting applications on the public 2027 Admissions portal appear here in real time for review and Student ID assignment."
          />
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 font-medium">App No.</th>
                    <th className="py-3 px-4 font-medium">Applicant</th>
                    <th className="py-3 px-4 font-medium">Programme · Mode</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Workflow Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredApps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{app.applicationNumber}</div>
                        {app.assignedStudentId && (
                          <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {app.assignedStudentId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{app.fullName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {app.email} · {app.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium text-slate-900 dark:text-white">
                          {app.courseName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {app.preferredMode} {app.referralCode ? `· Ref: ${app.referralCode}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={app.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <select
                          disabled={busyId === app.id}
                          value={app.status}
                          onChange={(e) =>
                            void handleUpdateApplicationStatus(
                              app,
                              e.target.value as ApplicationStatus
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                        >
                          {APPLICATION_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              Set: {st}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleActivateSingleMigratedStudent = async (s: MigratedStudentRecord) => {
    if (!s.email) {
      setFeedback(`Cannot activate ${s.fullName}: no email address on record.`);
      return;
    }
    setBusyId(s.id);
    setFeedback(null);
    const nowIso = new Date().toISOString();
    try {
      const invId = makeSafeId('INV');
      await setDoc(doc(db, 'roleInvitations', invId), {
        email: s.email.toLowerCase().slice(0, 160),
        fullName: s.fullName.slice(0, 120),
        role: 'STUDENT',
        branchId: s.branchId || 'branch-colombo-hq',
        studentId: s.studentId,
        status: 'pending',
        invitedBy: profile.uid,
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: nowIso,
      });
      await updateDoc(doc(db, 'migratedStudents', s.id), {
        accountActivationStatus: 'invited',
        invitationId: invId,
        updatedAt: nowIso,
      });
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'ACTIVATE_MIGRATED_STUDENT',
        targetType: 'migratedStudents',
        targetId: s.studentId,
        details: `Issued passwordless portal activation invitation (${invId}) for ${s.fullName} (${s.email})`,
      });
      setFeedback(`Issued secure portal activation invitation for ${s.fullName} (${s.studentId}).`);
      await onRefreshData();
    } finally {
      setBusyId(null);
    }
  };

  const handleExportMigratedXlsx = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      filteredMigratedStudents.map((s) => ({
        Student_ID: s.studentId,
        Full_Name: s.fullName,
        Email: s.email || '',
        Mobile: s.mobile || '',
        WhatsApp: s.whatsapp || '',
        Course: s.courseName || '',
        Branch: s.branchName || '',
        Batch: s.batchName || '',
        Academic_Year: s.academicYear,
        Status: s.studentStatus,
        Activation: s.accountActivationStatus,
        Import_Batch_ID: s.importBatchId,
        Source_File: s.sourceFileName,
        Source_Row: s.sourceRowNumber,
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws, 'Migrated_Students');
    XLSX.writeFile(wb, `TECHMAN_COLLEGE_Migrated_Students_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // MODE 2: PEOPLE, LECTURERS, STUDENTS & 13-ROLE RBAC
  if (mode === 'people') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              Users, Lecturers &amp; 13-Role Access Control
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Protected Dual-Owner governance (`techmanfgoc@gmail.com` &amp; `mrashadh64@gmail.com`), secure email invitations, and RBAC matrix.
            </p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Invite Staff / Lecturer / Student
          </button>
        </div>

        {feedback && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        {/* Active Users Directory */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-violet-600" />
              Registered Platform Accounts ({usersList.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Role &amp; Designation</th>
                  <th className="py-3 px-4 font-medium">Branch</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {isOwner && <th className="py-3 px-4 font-medium text-right">Role Assignment</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {usersList.map((u) => {
                  const lockedOwner = u.role === 'SUPER_ADMIN';
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{u.displayName}</div>
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {u.studentId || u.lecturerId || u.uid.slice(0, 10)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-semibold text-violet-700 dark:text-violet-400">
                          {u.role}
                        </span>
                        {u.designation && (
                          <span className="text-slate-500 dark:text-slate-400"> · {u.designation}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {u.branchId || 'HQ'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={u.accountStatus} />
                      </td>
                      {isOwner && (
                        <td className="py-3 px-4 text-right">
                          {lockedOwner ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                              <Lock className="w-3.5 h-3.5" />
                              Protected Owner
                            </span>
                          ) : (
                            <select
                              disabled={busyId === u.uid}
                              value={u.role}
                              onChange={(e) => void handleChangeUserRole(u, e.target.value as UserRole)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                            >
                              {ALL_13_ROLES.filter((r) => r !== 'SUPER_ADMIN').map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Migrated Student Records Directory & Search (Super Admin Integration) */}
        {isOwner && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-violet-600" />
                  Migrated Students Directory &amp; Reports ({filteredMigratedStudents.length} / {migratedStudents.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Search, filter by branch/course/batch, export Excel reports, or issue passwordless portal activation invitations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onOpenMigration && (
                  <button
                    onClick={onOpenMigration}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    Migration Studio
                  </button>
                )}
                <button
                  disabled={filteredMigratedStudents.length === 0}
                  onClick={handleExportMigratedXlsx}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel (.xlsx)
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={migSearch}
                  onChange={(e) => setMigSearch(e.target.value)}
                  placeholder="Search Student ID, Name, Email, Mobile..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <select
                value={migBranchFilter}
                onChange={(e) => setMigBranchFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="All">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={migCourseFilter}
                onChange={(e) => setMigCourseFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="All">All Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={migBatchFilter}
                onChange={(e) => setMigBatchFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="All">All Import Batches</option>
                {migrationBatches.map((mb) => (
                  <option key={mb.id} value={mb.id}>
                    {mb.id} ({mb.sourceFileName.slice(0, 22)})
                  </option>
                ))}
              </select>
            </div>

            {filteredMigratedStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {migratedStudents.length === 0
                  ? 'No migrated student records in Firestore yet. Open Bulk Migration Studio to inspect, approve, and import Excel/CSV student records.'
                  : 'No migrated students match the selected filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Student ID · Batch</th>
                      <th className="py-2.5 px-4 font-medium">Student &amp; Contact</th>
                      <th className="py-2.5 px-4 font-medium">Course &amp; Branch</th>
                      <th className="py-2.5 px-4 font-medium">Activation</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredMigratedStudents.slice(0, 100).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                          <div className="font-semibold text-violet-700 dark:text-violet-400">
                            {s.studentId}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Migrated · {s.importBatchId.slice(0, 12)} · R#{s.sourceRowNumber}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {s.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {s.email || '—'} · {s.mobile || s.whatsapp || '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="text-slate-800 dark:text-slate-200">
                            {s.courseName || '—'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {s.branchName || 'Unassigned Branch'} · {s.academicYear}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusLabel
                            status={
                              s.accountActivationStatus === 'activated'
                                ? 'Verified'
                                : s.accountActivationStatus === 'invited'
                                  ? 'Pending Verification'
                                  : 'Draft'
                            }
                          />
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {s.accountActivationStatus === 'not_activated' ? (
                            <button
                              disabled={busyId === s.id || !s.email}
                              onClick={() => void handleActivateSingleMigratedStudent(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 font-medium cursor-pointer disabled:opacity-40"
                            >
                              <KeyRound className="w-3 h-3" />
                              Send Invite
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {s.accountActivationStatus}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Pending Invitations */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
            Secure Role Activation Invitations ({invitations.length})
          </h2>
          {invitations.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No invitations issued yet. Invite Lecturers, Accountants, Branch Managers, Coordinators, or Students above.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {invitations.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{inv.email}</span>
                    {inv.fullName && <span className="text-slate-500"> · {inv.fullName}</span>}
                    <div className="text-slate-500 mt-0.5">
                      Assigned Role: <strong className="text-violet-700 dark:text-violet-400">{inv.role}</strong> · Branch: {inv.branchId || 'HQ'}
                    </div>
                  </div>
                  <StatusLabel status={inv.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 13-Role RBAC Matrix */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-violet-600" />
            13-Role Centralized RBAC Matrix
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEFAULT_ROLE_PERMISSIONS.map((rp) => (
              <div
                key={rp.role}
                className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
              >
                <div className="text-xs font-mono text-violet-700 dark:text-violet-400 font-semibold">
                  {rp.role}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                  {rp.label}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {rp.description}
                </p>
                <div className="mt-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {rp.permissions.length} configured capabilities
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <form
              onSubmit={handleCreateInvitation}
              className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Create Secure Role Invitation
                </h2>
                <button type="button" onClick={() => setShowInvite(false)} className="cursor-pointer">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <input
                type="email"
                required
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="Verified Google Email Address *"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <input
                type="text"
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <select
                value={invRole}
                onChange={(e) => setInvRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {ALL_13_ROLES.filter((r) => r !== 'SUPER_ADMIN' || isProtectedOwnerEmail(invEmail)).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={invBranchId}
                onChange={(e) => setInvBranchId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-violet-700 text-white text-sm font-medium cursor-pointer"
                >
                  Issue Invitation
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // MODE 3: BRANCHES & COORDINATORS
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            Branches &amp; Coordinator Operations
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Isolated regional campuses, coordinators, and branch-level academic oversight across Sri Lanka.
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowBranchModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {branches.map((b) => {
          const branchApps = applications.filter((a) => a.branchId === b.id).length;
          const branchMigrated = migratedStudents.filter(
            (s) =>
              s.branchId === b.id ||
              (s.branchName || '').toLowerCase() === b.name.toLowerCase() ||
              (s.branchName || '').toLowerCase() === b.city.toLowerCase()
          ).length;
          return (
            <div
              key={b.id}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-violet-700 dark:text-violet-400 font-semibold">
                  {b.code}
                </span>
                <StatusLabel status={b.status} />
              </div>
              <div className="flex items-start gap-2.5">
                <Building2 className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">{b.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{b.city}</p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <div>Manager: {b.managerName || 'Assigned by HQ'}</div>
                <div>Coordinator: {b.coordinatorName || 'Assigned by HQ'}</div>
                <div className="font-mono tabular-nums pt-1 text-slate-500">
                  2027 Apps: {branchApps} · Migrated Students: {branchMigrated} · Courses: {courses.length}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleAddBranch}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0F172A] dark:text-white">Create Branch</h2>
              <button type="button" onClick={() => setShowBranchModal(false)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={brCode}
                onChange={(e) => setBrCode(e.target.value)}
                placeholder="Code (e.g., GAL-01) *"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono uppercase"
              />
              <input
                type="text"
                required
                value={brCity}
                onChange={(e) => setBrCity(e.target.value)}
                placeholder="City (e.g., Galle) *"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <input
              type="text"
              required
              value={brName}
              onChange={(e) => setBrName(e.target.value)}
              placeholder="Branch Name *"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              value={brManager}
              onChange={(e) => setBrManager(e.target.value)}
              placeholder="Branch Manager Name"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              value={brCoordinator}
              onChange={(e) => setBrCoordinator(e.target.value)}
              placeholder="Coordinator Name"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBranchModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-violet-700 text-white text-sm font-medium cursor-pointer"
              >
                Save Branch
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
