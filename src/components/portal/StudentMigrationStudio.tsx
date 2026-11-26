import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  History,
  KeyRound,
  Layers,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Upload,
} from 'lucide-react';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import {
  analyzeMigrationSheet,
  buildMigratedStudentDocPayload,
  downloadErrorReportXlsx,
  downloadPreImportBackupXlsx,
  DuplicateResolution,
  EvaluatedMigrationRow,
  LMS_FIELD_DEFINITIONS,
  LmsTargetField,
  ParsedWorkbook,
  parseWorkbookFromArrayBuffer,
  suggestColumnMapping,
} from '../../lib/bulkMigrationEngine';
import {
  INSTITUTE_INFO,
  UPLOADED_MIGRATION_DATASETS,
} from '../../data/catalogSeed';
import {
  Application,
  Branch,
  Course,
  MigratedStudentRecord,
  MigrationBatch,
  UserProfile,
} from '../../types/lms';
import { StatusLabel } from '../common/PlatformWidgets';

interface StudentMigrationStudioProps {
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  branches: Branch[];
  applications: Application[];
  migratedStudents: MigratedStudentRecord[];
  migrationBatches: MigrationBatch[];
  onRefreshData: () => Promise<void>;
}

type WizardStep =
  | 'inspect'
  | 'mapping'
  | 'resolvers'
  | 'duplicates'
  | 'preview'
  | 'history';

interface PostImportReport {
  batchId: string;
  sourceFileName: string;
  sourceSheetName: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  legacyPaymentsCreated: number;
  errors: Array<{ rowNumber: number; name: string; error: string }>;
}

const PAGE_SIZE = 15;

export const StudentMigrationStudio: React.FC<StudentMigrationStudioProps> = ({
  profile,
  userEmail,
  isOwner,
  courses,
  branches,
  applications,
  migratedStudents,
  migrationBatches,
  onRefreshData,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeStep, setActiveStep] = useState<WizardStep>('inspect');
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);
  const [columnMapping, setColumnMapping] = useState<Record<string, LmsTargetField>>({});
  const [idPrefix, setIdPrefix] = useState<string>('TMAI');
  const [academicYear, setAcademicYear] = useState<string>('2026');
  const [courseOverrides, setCourseOverrides] = useState<Record<string, string>>({});
  const [branchOverrides, setBranchOverrides] = useState<Record<string, string>>({});
  const [duplicateResolutions, setDuplicateResolutions] = useState<
    Record<number, DuplicateResolution>
  >({});

  // Preview filters & pagination
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState<
    'all' | 'valid' | 'needs_mapping' | 'duplicate' | 'invalid'
  >('all');
  const [previewPage, setPreviewPage] = useState(1);

  // Safety gates & execution states
  const [backupSummary, setBackupSummary] = useState<string | null>(null);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [allowUnmappedFallback, setAllowUnmappedFallback] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [postReport, setPostReport] = useState<PostImportReport | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [activatingBusy, setActivatingBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const activeSheet = workbook?.sheets[selectedSheetIndex] || null;

  const analysis = useMemo(() => {
    if (!activeSheet) return null;
    return analyzeMigrationSheet({
      sheet: activeSheet,
      columnMapping,
      idPrefix: idPrefix.trim().toUpperCase() || 'TMAI',
      academicYear: academicYear.trim() || '2026',
      courses,
      branches,
      existingMigrated: migratedStudents,
      existingApplications: applications,
      courseOverrides,
      branchOverrides,
      duplicateResolutions,
    });
  }, [
    activeSheet,
    columnMapping,
    idPrefix,
    academicYear,
    courses,
    branches,
    migratedStudents,
    applications,
    courseOverrides,
    branchOverrides,
    duplicateResolutions,
  ]);

  const initializeWorkbook = (wb: ParsedWorkbook) => {
    setWorkbook(wb);
    setSelectedSheetIndex(0);
    const firstSheet = wb.sheets[0];
    setColumnMapping(firstSheet ? suggestColumnMapping(firstSheet.headers) : {});
    setCourseOverrides({});
    setBranchOverrides({});
    setDuplicateResolutions({});
    setBackupSummary(null);
    setApprovalChecked(false);
    setPostReport(null);
    setPreviewPage(1);
    setBanner(
      firstSheet && firstSheet.headers.length <= 1
        ? {
            type: 'warn',
            text: `Inspected "${wb.fileName}": only ${firstSheet.headers.length} column detected (${firstSheet.headers.join(', ')}). Missing student identity columns — no records can be imported until valid columns are supplied.`,
          }
        : {
            type: 'ok',
            text: `Inspected "${wb.fileName}" (${wb.sheets.length} worksheet${wb.sheets.length === 1 ? '' : 's'}, ${firstSheet?.rows.length || 0} rows, ${firstSheet?.headers.length || 0} columns). No database records have been modified.`,
          }
    );
  };

  const handleSelectWorksheet = (idx: number) => {
    if (!workbook) return;
    setSelectedSheetIndex(idx);
    const sheet = workbook.sheets[idx];
    setColumnMapping(sheet ? suggestColumnMapping(sheet.headers) : {});
    setCourseOverrides({});
    setBranchOverrides({});
    setDuplicateResolutions({});
    setBackupSummary(null);
    setApprovalChecked(false);
    setPreviewPage(1);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBanner(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = parseWorkbookFromArrayBuffer(buffer, file.name);
      initializeWorkbook(wb);
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? `Failed to parse file: ${err.message}` : 'Unable to parse workbook.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadUploadedDataset = async (path: string, fileName: string) => {
    setBanner(null);
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Could not fetch ${fileName} (HTTP ${res.status})`);
      const buffer = await res.arrayBuffer();
      const wb = parseWorkbookFromArrayBuffer(buffer, fileName);
      initializeWorkbook(wb);
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load dataset.',
      });
    }
  };

  const handleCreatePreImportBackup = () => {
    const summary = downloadPreImportBackupXlsx(migratedStudents, applications);
    setBackupSummary(summary);
    setBanner({
      type: 'ok',
      text: `Pre-import backup saved: ${summary}. You may now approve and execute the migration.`,
    });
  };

  const rowsEligibleForExecution = useMemo(() => {
    if (!analysis) return [];
    return analysis.rows.filter((r) => {
      if (r.status === 'invalid') return false;
      if (r.status === 'duplicate') {
        return r.resolution === 'import_new' || r.resolution === 'update_existing';
      }
      if (r.status === 'needs_mapping') {
        return allowUnmappedFallback;
      }
      return true;
    });
  }, [analysis, allowUnmappedFallback]);

  const handleExecuteApprovedImport = async () => {
    if (!workbook || !activeSheet || !analysis) return;
    if (!backupSummary || !approvalChecked) {
      setBanner({
        type: 'err',
        text: 'Create the pre-import backup and check the Super Admin approval box before importing.',
      });
      return;
    }

    const targets = rowsEligibleForExecution;
    if (targets.length === 0) {
      setBanner({
        type: 'warn',
        text: 'There are 0 eligible rows to import. Resolve unmatched branches/courses or duplicate actions first.',
      });
      return;
    }

    setExecuting(true);
    setBanner(null);
    const batchId = makeSafeId('MIG');
    const nowIso = new Date().toISOString();
    const createdRecordIds: string[] = [];
    let imported = 0;
    let updated = 0;
    let failed = 0;
    let legacyPaymentsCreated = 0;
    const rowErrors: Array<{ rowNumber: number; name: string; error: string }> = [];

    const skippedCount = analysis.totalRows - targets.length;
    setExecutionProgress({ done: 0, total: targets.length });

    try {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (row) => {
            try {
              const isUpdateExisting =
                row.status === 'duplicate' &&
                row.resolution === 'update_existing' &&
                Boolean(row.duplicate?.existingDocId);

              const targetDocId = isUpdateExisting
                ? row.duplicate!.existingDocId!
                : row.assignedStudentId;

              const payload = buildMigratedStudentDocPayload({
                row: { ...row, assignedStudentId: targetDocId },
                batchId,
                sourceFileName: workbook.fileName,
                sourceSheetName: activeSheet.name,
                importedByEmail: userEmail,
                nowIso,
              });

              await setDoc(doc(db, 'migratedStudents', targetDocId), payload, {
                merge: isUpdateExisting,
              });

              if (isUpdateExisting) {
                updated++;
              } else {
                imported++;
                createdRecordIds.push(targetDocId);
              }

              // Legacy financial record — ONLY if real paid amount > 0 existed in source file!
              if (row.hasLegacyFinancials && (row.amountPaidLkr || 0) > 0) {
                const payId = `LPAY-${batchId.slice(-6)}-${row.rowNumber}`;
                await setDoc(doc(db, 'payments', payId), {
                  userId: profile.uid,
                  studentId: targetDocId,
                  studentName: row.fullName.slice(0, 120),
                  courseId: row.matchedCourseId || undefined,
                  courseName: (row.matchedCourseName || 'Legacy Programme').slice(0, 160),
                  branchId: row.matchedBranchId || 'branch-colombo-hq',
                  feeType: 'Course Fee',
                  amountLkr: row.amountPaidLkr!,
                  method: 'Bank Transfer',
                  referenceNo: `LEGACY-${batchId.slice(-6)}-R${row.rowNumber}`,
                  proofNotes: `legacy_imported from ${workbook.fileName} (Row #${row.rowNumber}). Original status: ${row.paymentStatus || 'Unspecified'}. Pending Accountant/Super Admin reconciliation.`,
                  status: 'Pending Verification',
                  institutionId: INSTITUTE_INFO.institutionId,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                });
                legacyPaymentsCreated++;
              }
            } catch (err) {
              failed++;
              rowErrors.push({
                rowNumber: row.rowNumber,
                name: row.fullName || `Row #${row.rowNumber}`,
                error: err instanceof Error ? err.message : 'Write failed',
              });
            }
          })
        );
        setExecutionProgress({
          done: Math.min(i + CHUNK_SIZE, targets.length),
          total: targets.length,
        });
      }

      // Persist immutable MigrationBatch record for audit & safe rollback
      await setDoc(doc(db, 'migrationBatches', batchId), {
        sourceFileName: workbook.fileName.slice(0, 200),
        sourceSheetName: activeSheet.name.slice(0, 120),
        academicYear: academicYear.trim() || '2026',
        idPrefix: idPrefix.trim().toUpperCase() || 'TMAI',
        totalRows: analysis.totalRows,
        importedCount: imported,
        updatedCount: updated,
        skippedCount,
        failedCount: failed,
        duplicateCount: analysis.duplicateCount,
        createdRecordIds,
        backupSnapshotSummary: backupSummary.slice(0, 400),
        status: 'completed',
        importedByUid: profile.uid,
        importedByEmail: userEmail,
        importedAt: nowIso,
        institutionId: INSTITUTE_INFO.institutionId,
      });

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'BULK_STUDENT_MIGRATION_IMPORT',
        targetType: 'migrationBatches',
        targetId: batchId,
        details: `File: ${workbook.fileName} [${activeSheet.name}] · Created: ${imported}, Updated: ${updated}, Skipped: ${skippedCount}, Failed: ${failed}`,
      });

      setPostReport({
        batchId,
        sourceFileName: workbook.fileName,
        sourceSheetName: activeSheet.name,
        imported,
        updated,
        skipped: skippedCount,
        failed,
        legacyPaymentsCreated,
        errors: rowErrors,
      });
      setApprovalChecked(false);
      setActiveStep('history');
      setBanner({
        type: failed > 0 ? 'warn' : 'ok',
        text: `Batch ${batchId} completed: ${imported} created, ${updated} updated, ${skippedCount} skipped, ${failed} failed.`,
      });
      await onRefreshData();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? `Migration failed: ${err.message}` : 'Migration execution error.',
      });
    } finally {
      setExecuting(false);
      setExecutionProgress(null);
    }
  };

  const handleRollbackBatch = async (batch: MigrationBatch) => {
    if (batch.status === 'rolled_back') return;
    setRollingBackId(batch.id);
    setBanner(null);
    const nowIso = new Date().toISOString();
    let deletedCount = 0;

    try {
      const ids = batch.createdRecordIds || [];
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        await Promise.all(
          chunk.map(async (studentDocId) => {
            try {
              await deleteDoc(doc(db, 'migratedStudents', studentDocId));
              deletedCount++;
            } catch {
              // ignore already removed docs
            }
          })
        );
      }

      await updateDoc(doc(db, 'migrationBatches', batch.id), {
        status: 'rolled_back',
        rolledBackAt: nowIso,
      });

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'BULK_STUDENT_MIGRATION_ROLLBACK',
        targetType: 'migrationBatches',
        targetId: batch.id,
        details: `Rolled back batch ${batch.id} (${batch.sourceFileName}): deleted ${deletedCount} created student records safely without affecting pre-existing data.`,
      });

      setBanner({
        type: 'ok',
        text: `Safely rolled back batch ${batch.id}. Removed ${deletedCount} newly created records; pre-existing records remained untouched.`,
      });
      await onRefreshData();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? `Rollback error: ${err.message}` : 'Rollback failed.',
      });
    } finally {
      setRollingBackId(null);
    }
  };

  const handleBulkActivateMigratedStudents = async (batchIdFilter?: string) => {
    const candidates = migratedStudents.filter(
      (s) =>
        s.accountActivationStatus === 'not_activated' &&
        Boolean(s.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) &&
        (!batchIdFilter || s.importBatchId === batchIdFilter)
    );
    if (candidates.length === 0) {
      setBanner({
        type: 'warn',
        text: 'No unactivated migrated students with valid email addresses found in this scope.',
      });
      return;
    }

    setActivatingBusy(true);
    setBanner(null);
    const nowIso = new Date().toISOString();
    let sent = 0;
    try {
      for (let i = 0; i < candidates.length; i += 8) {
        const chunk = candidates.slice(i, i + 8);
        await Promise.all(
          chunk.map(async (s) => {
            const invId = makeSafeId('INV');
            await setDoc(doc(db, 'roleInvitations', invId), {
              email: s.email!.toLowerCase().slice(0, 160),
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
            sent++;
          })
        );
      }

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'BULK_STUDENT_ACCOUNT_ACTIVATION',
        targetType: 'roleInvitations',
        targetId: batchIdFilter || 'ALL_MIGRATED',
        details: `Issued ${sent} passwordless verified-email portal activation invitations linked to official Student IDs.`,
      });

      setBanner({
        type: 'ok',
        text: `Issued ${sent} secure passwordless Student Activation Invitation${sent === 1 ? '' : 's'}. Students can sign in with Google using their verified email to link their Student ID automatically.`,
      });
      await onRefreshData();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Bulk activation failed.',
      });
    } finally {
      setActivatingBusy(false);
    }
  };

  // Filtered & paginated preview rows
  const filteredPreviewRows = useMemo(() => {
    if (!analysis) return [];
    const q = previewSearch.trim().toLowerCase();
    return analysis.rows.filter((r) => {
      if (previewFilter !== 'all' && r.status !== previewFilter) return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.mobile.toLowerCase().includes(q) ||
        r.assignedStudentId.toLowerCase().includes(q) ||
        r.rawCourseValue.toLowerCase().includes(q) ||
        r.rawBranchValue.toLowerCase().includes(q)
      );
    });
  }, [analysis, previewSearch, previewFilter]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / PAGE_SIZE));
  const paginatedPreviewRows = filteredPreviewRows.slice(
    (previewPage - 1) * PAGE_SIZE,
    previewPage * PAGE_SIZE
  );

  const duplicateRows = useMemo(
    () => (analysis ? analysis.rows.filter((r) => r.duplicate !== null) : []),
    [analysis]
  );

  const invalidRows = useMemo(
    () => (analysis ? analysis.rows.filter((r) => r.errors.length > 0) : []),
    [analysis]
  );

  if (!isOwner) {
    return (
      <div className="p-8 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-800 dark:text-rose-300 flex items-start gap-3">
        <Lock className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold">Super Admin Authorization Required</h2>
          <p className="mt-1">
            Bulk Student Data Import, Rollback, and Migration History are strictly restricted to verified TECHMAN COLLEGE Super Admin accounts (
            {INSTITUTE_INFO.ownerEmails.join(', ')}).
          </p>
        </div>
      </div>
    );
  }

  const steps: Array<{ id: WizardStep; label: string; count?: number }> = [
    { id: 'inspect', label: '1. Inspect Source' },
    { id: 'mapping', label: '2. Field Mapping & IDs', count: activeSheet?.headers.length },
    {
      id: 'resolvers',
      label: '3. Branches & Courses',
      count:
        (analysis?.unmatchedBranchValues.length || 0) +
        (analysis?.unmatchedCourseValues.length || 0),
    },
    {
      id: 'duplicates',
      label: '4. Duplicates & Errors',
      count: (analysis?.duplicateCount || 0) + (analysis?.invalidCount || 0),
    },
    { id: 'preview', label: '5. Preview & Approve', count: rowsEligibleForExecution.length },
    { id: 'history', label: '6. History & Rollback', count: migrationBatches.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400">
            <ShieldCheck className="w-4 h-4" />
            Super Admin Governance · Excel (.xlsx) &amp; CSV to Cloud Firestore
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white mt-0.5">
            Bulk Student Data Import &amp; Migration Studio
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspect source workbooks, map columns without data loss, resolve duplicates &amp; branches (Panadura, Kalutara, Colombo), download backups, and execute auditable batch imports with one-click rollback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleUploadFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700 text-white text-xs font-medium cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Upload Excel (.xlsx) / CSV
          </button>
          {analysis && (
            <button
              onClick={() => downloadErrorReportXlsx(analysis, workbook?.fileName || 'workbook')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Error Report (.xlsx)
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            banner.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : banner.type === 'warn'
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Stepper Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {steps.map((s) => {
          const disabled = s.id !== 'inspect' && s.id !== 'history' && !activeSheet;
          const active = activeStep === s.id;
          return (
            <button
              key={s.id}
              disabled={disabled}
              onClick={() => setActiveStep(s.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 ${
                active
                  ? 'bg-violet-700 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{s.label}</span>
              {s.count !== undefined && (
                <span
                  className={`font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded ${
                    active
                      ? 'bg-violet-900/60 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* STEP 1: SOURCE INSPECTION */}
      {activeStep === 'inspect' && (
        <div className="space-y-6">
          {/* Quick-Load Uploaded TECHMAN Datasets */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-violet-600" />
                  Uploaded TECHMAN COLLEGE Registration Datasets (Ready to Inspect)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any uploaded dataset to run non-destructive inspection, or upload a new Excel (.xlsx) workbook above.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {UPLOADED_MIGRATION_DATASETS.map((ds) => {
                const isLoaded = workbook?.fileName === ds.fileName;
                return (
                  <div
                    key={ds.id}
                    className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                      isLoaded
                        ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                        {ds.label}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                        {ds.notes}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-500 truncate">
                        {ds.fileName}
                      </span>
                      <button
                        onClick={() => void handleLoadUploadedDataset(ds.path, ds.fileName)}
                        className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium shrink-0 cursor-pointer"
                      >
                        {isLoaded ? 'Re-Inspect' : 'Inspect File'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Inspected Workbook Summary */}
          {workbook && activeSheet && analysis && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-violet-700 dark:text-violet-400 uppercase">
                    Active Source · {workbook.fileType.toUpperCase()}
                  </div>
                  <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                    {workbook.fileName}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {workbook.sheets.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-slate-400" />
                      <select
                        value={selectedSheetIndex}
                        onChange={(e) => handleSelectWorksheet(Number(e.target.value))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                      >
                        {workbook.sheets.map((sh, i) => (
                          <option key={sh.name} value={i}>
                            Sheet {i + 1}: {sh.name} ({sh.rows.length} rows)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => setActiveStep('mapping')}
                    className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer"
                  >
                    Continue to Field Mapping &rarr;
                  </button>
                </div>
              </div>

              {/* Worksheet Health Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Worksheets', val: workbook.sheets.length },
                  { label: 'Data Rows', val: activeSheet.rows.length },
                  { label: 'Columns', val: activeSheet.headers.length },
                  { label: 'Empty Cells', val: activeSheet.emptyCellCount },
                  { label: 'Unnamed Cols', val: activeSheet.unnamedColumnCount },
                  { label: 'Duplicate Rows', val: analysis.duplicateCount },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40"
                  >
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.label}</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-[#0F172A] dark:text-white mt-0.5">
                      {m.val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Detected Column Headers Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Detected Column Headers &amp; Sample Values (Row #2)
                </h3>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 sticky top-0">
                      <tr>
                        <th className="py-2 px-3 font-medium">Col #</th>
                        <th className="py-2 px-3 font-medium">Source Header</th>
                        <th className="py-2 px-3 font-medium">Sample Value</th>
                        <th className="py-2 px-3 font-medium">Auto-Suggested LMS Field</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeSheet.headers.map((h, i) => {
                        const sample = activeSheet.rows[0]?.cells[h] || '—';
                        const target = columnMapping[h] || '__custom__';
                        const def = LMS_FIELD_DEFINITIONS.find((d) => d.key === target);
                        return (
                          <tr key={h}>
                            <td className="py-2 px-3 font-mono text-slate-500">{i + 1}</td>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                              {h}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                              {sample}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`text-[11px] font-medium ${
                                  target === '__custom__'
                                    ? 'text-slate-500 dark:text-slate-400'
                                    : 'text-violet-700 dark:text-violet-400 font-semibold'
                                }`}
                              >
                                {def?.label || target}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: VISUAL FIELD MAPPING & STUDENT ID CONFIG */}
      {activeStep === 'mapping' && activeSheet && analysis && (
        <div className="space-y-6">
          {/* Student ID Format Config */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
              Student ID Generation Rules
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  ID Prefix
                </label>
                <input
                  type="text"
                  value={idPrefix}
                  onChange={(e) => setIdPrefix(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">Generated Format Preview</div>
                <div className="font-mono font-bold text-violet-700 dark:text-violet-400 text-sm mt-0.5">
                  {(idPrefix || 'TMAI').toUpperCase()}-{academicYear || '2026'}-0001
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Existing valid Student IDs are never overwritten.
                </div>
              </div>
            </div>
          </div>

          {/* Column Mapper */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Visual Field Mapping ({activeSheet.headers.length} Source Columns)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Map source columns to official LMS fields. Unrecognized columns default to &ldquo;Preserve in Custom Fields Archive&rdquo; so zero data is lost.
                </p>
              </div>
              <button
                onClick={() => setActiveStep('resolvers')}
                className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer shrink-0"
              >
                Next: Branches &amp; Courses &rarr;
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Source Column</th>
                    <th className="py-2.5 px-4 font-medium">Sample Data (Rows 2–3)</th>
                    <th className="py-2.5 px-4 font-medium">Target LMS Field</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeSheet.headers.map((header) => {
                    const s1 = activeSheet.rows[0]?.cells[header] || '';
                    const s2 = activeSheet.rows[1]?.cells[header] || '';
                    return (
                      <tr key={header} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                          {header}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 max-w-sm truncate">
                          {[s1, s2].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <select
                            value={columnMapping[header] || '__custom__'}
                            onChange={(e) =>
                              setColumnMapping((prev) => ({
                                ...prev,
                                [header]: e.target.value as LmsTargetField,
                              }))
                            }
                            className="w-full max-w-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                          >
                            {LMS_FIELD_DEFINITIONS.map((def) => (
                              <option key={def.key} value={def.key}>
                                [{def.group}] {def.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: UNMATCHED BRANCHES & COURSES RESOLVER */}
      {activeStep === 'resolvers' && analysis && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Unmatched Branches */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Branch Mapping Resolver ({analysis.unmatchedBranchValues.length} Unmatched)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Official college branches include Panadura, Kalutara, Colombo, Online &amp; International Campus, and Kandy. Assign regional districts manually without auto-creating duplicate branches.
                </p>
              </div>

              {analysis.unmatchedBranchValues.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  All branch/district values in this worksheet are cleanly mapped to official LMS branches.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        const online = branches.find((b) => b.id === 'branch-online-global') || branches[0];
                        if (!online) return;
                        const next = { ...branchOverrides };
                        for (const item of analysis.unmatchedBranchValues) {
                          next[item.value] = online.id;
                        }
                        setBranchOverrides(next);
                      }}
                      className="text-xs font-medium text-violet-700 dark:text-violet-400 hover:underline cursor-pointer"
                    >
                      Assign all unmatched regional districts to Online &amp; International Campus
                    </button>
                  </div>
                  {analysis.unmatchedBranchValues.map((item) => (
                    <div
                      key={item.value}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {item.value}
                        </span>
                        <span className="ml-2 font-mono text-slate-500">({item.count} rows)</span>
                      </div>
                      <select
                        value={branchOverrides[item.value] || ''}
                        onChange={(e) =>
                          setBranchOverrides((prev) => ({ ...prev, [item.value]: e.target.value }))
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      >
                        <option value="">— Select Official Branch —</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unmatched Courses */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Course Mapping Resolver ({analysis.unmatchedCourseValues.length} Unmatched)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Match unrecognized course names or multi-skill strings to your official 32-course LMS catalog. Duplicate courses are never auto-created.
                </p>
              </div>

              {analysis.unmatchedCourseValues.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  All course names in this worksheet match official TECHMAN COLLEGE LMS programmes.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                  {analysis.unmatchedCourseValues.map((item) => (
                    <div
                      key={item.value}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white break-words">
                          {item.value}
                        </span>
                        <span className="font-mono text-slate-500 shrink-0">({item.count})</span>
                      </div>
                      <select
                        value={courseOverrides[item.value] || ''}
                        onChange={(e) =>
                          setCourseOverrides((prev) => ({ ...prev, [item.value]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      >
                        <option value="">— Map to Official LMS Course —</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            [{c.code}] {c.name} ({c.category})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setActiveStep('duplicates')}
              className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer"
            >
              Next: Duplicates &amp; Validation Queue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: DUPLICATES & VALIDATION ERRORS */}
      {activeStep === 'duplicates' && analysis && (
        <div className="space-y-6">
          {/* Duplicate Candidates */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Duplicate Detection Queue ({duplicateRows.length} Candidates)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Checked across Student ID, Mobile Number, Email Address, and Name + Date of Birth. Records are never auto-merged or overwritten.
                </p>
              </div>
              <button
                onClick={() => setActiveStep('preview')}
                className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer shrink-0"
              >
                Next: Import Preview &amp; Approval &rarr;
              </button>
            </div>

            {duplicateRows.length === 0 ? (
              <div className="p-5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Zero duplicate candidates detected in this worksheet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Row</th>
                      <th className="py-2.5 px-4 font-medium">Student</th>
                      <th className="py-2.5 px-4 font-medium">Matched On</th>
                      <th className="py-2.5 px-4 font-medium">Existing / Prior Match</th>
                      <th className="py-2.5 px-4 font-medium text-right">Super Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {duplicateRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="py-2.5 px-4 font-mono text-slate-500">#{row.rowNumber}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {row.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {row.email || '—'} · {row.mobile || row.whatsapp || '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-amber-700 dark:text-amber-400">
                          {row.duplicate?.reason}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          <div>{row.duplicate?.matchedName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {row.duplicate?.matchSource === 'firestore' ? 'Firestore' : 'Same File'}:{' '}
                            {row.duplicate?.matchedRef}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <select
                            value={row.resolution}
                            onChange={(e) =>
                              setDuplicateResolutions((prev) => ({
                                ...prev,
                                [row.rowNumber]: e.target.value as DuplicateResolution,
                              }))
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                          >
                            <option value="skip">Skip duplicate (Safe)</option>
                            <option value="import_new">Import as new student</option>
                            {row.duplicate?.matchSource === 'firestore' && (
                              <option value="update_existing">Update existing record</option>
                            )}
                            <option value="manual_review">Hold for manual review</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Invalid Rows Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Validation Errors ({invalidRows.length} Invalid Rows Excluded from Import)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Download the Excel Error Report to correct invalid emails, phone numbers, or missing fields and safely re-import later.
                </p>
              </div>
              <button
                onClick={() => downloadErrorReportXlsx(analysis, workbook?.fileName || 'workbook')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Error Report (.xlsx)
              </button>
            </div>
            {invalidRows.length === 0 ? (
              <div className="p-5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                All inspected rows passed email, phone, and required-field validation.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Row</th>
                      <th className="py-2.5 px-4 font-medium">Student</th>
                      <th className="py-2.5 px-4 font-medium">Validation Error Descriptions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {invalidRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="py-2.5 px-4 font-mono text-slate-500">#{row.rowNumber}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                          {row.fullName || '(Missing Name)'}
                        </td>
                        <td className="py-2.5 px-4 text-rose-700 dark:text-rose-400 space-y-0.5">
                          {row.errors.map((err, i) => (
                            <div key={i}>• {err}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 5: IMPORT PREVIEW, BACKUP & EXPLICIT APPROVAL */}
      {activeStep === 'preview' && analysis && workbook && activeSheet && (
        <div className="space-y-6">
          {/* 10 Required Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total Rows', value: analysis.totalRows, tone: 'text-slate-900 dark:text-white' },
              { label: 'Valid Records', value: analysis.validCount, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Invalid Records', value: analysis.invalidCount, tone: 'text-rose-700 dark:text-rose-400' },
              { label: 'Duplicate Candidates', value: analysis.duplicateCount, tone: 'text-amber-700 dark:text-amber-400' },
              { label: 'Missing Required', value: analysis.missingRequiredCount, tone: 'text-rose-700 dark:text-rose-400' },
              { label: 'Matched Courses', value: analysis.matchedCoursesCount, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Unmatched Courses', value: analysis.unmatchedCoursesCount, tone: 'text-amber-700 dark:text-amber-400' },
              { label: 'Matched Branches', value: analysis.matchedBranchesCount, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Unmatched Branches', value: analysis.unmatchedBranchesCount, tone: 'text-amber-700 dark:text-amber-400' },
              { label: 'Existing / New IDs', value: `${analysis.existingStudentIdsCount} / ${analysis.newStudentIdsCount}`, tone: 'text-violet-700 dark:text-violet-400' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{kpi.label}</div>
                <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${kpi.tone}`}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Searchable / Filterable / Paginated Preview Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={previewSearch}
                  onChange={(e) => {
                    setPreviewSearch(e.target.value);
                    setPreviewPage(1);
                  }}
                  placeholder="Search preview by Name, Student ID, Email, Phone, Course..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'valid', 'needs_mapping', 'duplicate', 'invalid'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setPreviewFilter(f);
                      setPreviewPage(1);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      previewFilter === f
                        ? 'bg-[#0F172A] dark:bg-violet-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Row</th>
                    <th className="py-2.5 px-3 font-medium">Student ID</th>
                    <th className="py-2.5 px-3 font-medium">Student &amp; Contact</th>
                    <th className="py-2.5 px-3 font-medium">Course</th>
                    <th className="py-2.5 px-3 font-medium">Branch</th>
                    <th className="py-2.5 px-3 font-medium">Status &amp; Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedPreviewRows.map((row: EvaluatedMigrationRow) => (
                    <tr key={row.rowNumber} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-mono text-slate-500">#{row.rowNumber}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-violet-700 dark:text-violet-400 whitespace-nowrap">
                        {row.assignedStudentId}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {row.fullName || '(Missing Name)'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {row.email || '—'} · {row.mobile || row.whatsapp || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 dark:text-slate-200 max-w-[200px] truncate">
                          {row.matchedCourseName || '—'}
                        </div>
                        {row.courseMatchStatus === 'unmatched' && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400">
                            Unmatched course
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 dark:text-slate-200">
                          {row.matchedBranchName || '—'}
                        </div>
                        {row.branchMatchStatus === 'unmatched' && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400">
                            Unmatched branch
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusLabel
                          status={
                            row.status === 'valid'
                              ? 'Approved'
                              : row.status === 'invalid'
                                ? 'Rejected'
                                : row.status === 'duplicate'
                                  ? `Duplicate (${row.resolution})`
                                  : 'Pending Verification'
                          }
                        />
                        {row.errors[0] && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                            {row.errors[0]}
                          </div>
                        )}
                        {!row.errors[0] && row.warnings[0] && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                            {row.warnings[0]}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing {(previewPage - 1) * PAGE_SIZE + 1}–
                {Math.min(previewPage * PAGE_SIZE, filteredPreviewRows.length)} of{' '}
                {filteredPreviewRows.length} rows
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  Prev
                </button>
                <span className="font-mono tabular-nums">
                  {previewPage} / {totalPreviewPages}
                </span>
                <button
                  disabled={previewPage >= totalPreviewPages}
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Pre-Import Backup & Super Admin Production Approval Gate */}
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900/70 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-violet-700 dark:text-violet-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Pre-Import Safety Backup &amp; Explicit Super Admin Approval
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Production Firestore student records are never modified until you download a backup snapshot and explicitly approve execution. Student accounts are NOT given default passwords — you can issue verified-email activation invitations after import.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handleCreatePreImportBackup}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
              >
                <Download className="w-4 h-4 text-violet-600" />
                1. Download Pre-Import Backup (.xlsx)
              </button>
              {backupSummary && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Backup captured: {backupSummary}
                </span>
              )}
            </div>

            {(analysis.unmatchedBranchesCount > 0 || analysis.unmatchedCoursesCount > 0) && (
              <label className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowUnmappedFallback}
                  onChange={(e) => setAllowUnmappedFallback(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Also include rows with unresolved branches/courses (preserving raw original text without creating duplicate courses or branches). Recommended: map them in Step 3 first.
                </span>
              </label>
            )}

            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={approvalChecked}
                onChange={(e) => setApprovalChecked(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                As Super Admin (<strong>{userEmail}</strong>), I have reviewed the inspection report, field mapping, and duplicate resolutions and approve writing{' '}
                <strong className="font-mono">{rowsEligibleForExecution.length}</strong> validated student record
                {rowsEligibleForExecution.length === 1 ? '' : 's'} into Cloud Firestore with batch audit logging.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                {executionProgress
                  ? `Importing ${executionProgress.done} / ${executionProgress.total} records into Firestore...`
                  : `Ready to write ${rowsEligibleForExecution.length} record(s) · ${analysis.totalRows - rowsEligibleForExecution.length} row(s) excluded/skipped`}
              </div>
              <button
                disabled={
                  executing ||
                  !backupSummary ||
                  !approvalChecked ||
                  rowsEligibleForExecution.length === 0
                }
                onClick={() => void handleExecuteApprovedImport()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                <Database className="w-4 h-4" />
                {executing
                  ? 'Executing Firestore Migration...'
                  : `Approve & Import ${rowsEligibleForExecution.length} Records`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: IMPORT HISTORY, ROLLBACK & SECURE ACCOUNT ACTIVATION */}
      {activeStep === 'history' && (
        <div className="space-y-6">
          {/* Post-Import Detailed Report */}
          {postReport && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-5 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    MIGRATION REPORT · {postReport.batchId}
                  </div>
                  <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                    {postReport.sourceFileName} ({postReport.sourceSheetName})
                  </h2>
                </div>
                <button
                  disabled={activatingBusy}
                  onClick={() => void handleBulkActivateMigratedStudents(postReport.batchId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Issue Secure Activation Invites for This Batch
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Created</div>
                  <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {postReport.imported}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Updated</div>
                  <div className="text-lg font-bold font-mono text-violet-700 dark:text-violet-400">
                    {postReport.updated}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Skipped</div>
                  <div className="text-lg font-bold font-mono text-slate-700 dark:text-slate-300">
                    {postReport.skipped}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Failed</div>
                  <div className="text-lg font-bold font-mono text-rose-700 dark:text-rose-400">
                    {postReport.failed}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Legacy Payments</div>
                  <div className="text-lg font-bold font-mono text-amber-700 dark:text-amber-400">
                    {postReport.legacyPaymentsCreated}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Secure Student Account Activation Banner */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-violet-600" />
                Passwordless Student Account Activation ({migratedStudents.filter((s) => s.accountActivationStatus === 'not_activated').length} Pending)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Zero passwords are stored in Excel or Firestore. Issue verified-email portal invitations so migrated students link directly to their assigned Student ID on sign-in.
              </p>
            </div>
            <button
              disabled={activatingBusy}
              onClick={() => void handleBulkActivateMigratedStudents()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700 text-white text-xs font-medium cursor-pointer shrink-0 disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {activatingBusy ? 'Issuing Invitations...' : 'Activate All Pending Students'}
            </button>
          </div>

          {/* Batch Audit History & Safe Rollback */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-violet-600" />
                Migration Batch Audit History &amp; Safe Rollback ({migrationBatches.length})
              </h2>
            </div>

            {migrationBatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                <Table2 className="w-6 h-6 text-slate-400" />
                No bulk migration batches have been executed yet. Inspect a workbook in Step 1 to begin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Batch ID &amp; Date</th>
                      <th className="py-2.5 px-4 font-medium">Source File / Sheet</th>
                      <th className="py-2.5 px-4 font-medium">Counts (New / Upd / Skip / Fail)</th>
                      <th className="py-2.5 px-4 font-medium">Imported By</th>
                      <th className="py-2.5 px-4 font-medium">Status</th>
                      <th className="py-2.5 px-4 font-medium text-right">Safe Rollback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {migrationBatches.map((b) => (
                      <tr key={b.id}>
                        <td className="py-3 px-4 font-mono">
                          <div className="font-semibold text-slate-900 dark:text-white">{b.id}</div>
                          <div className="text-[11px] text-slate-500">
                            {b.importedAt.slice(0, 16).replace('T', ' ')}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {b.sourceFileName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Sheet: {b.sourceSheetName} · Year: {b.academicYear}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {b.importedCount} / {b.updatedCount} / {b.skippedCount} / {b.failedCount}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {b.importedByEmail}
                        </td>
                        <td className="py-3 px-4">
                          <StatusLabel status={b.status === 'completed' ? 'Verified' : 'Revoked'} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {b.status === 'completed' ? (
                            <button
                              disabled={rollingBackId === b.id}
                              onClick={() => void handleRollbackBatch(b)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium cursor-pointer disabled:opacity-50"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" />
                              {rollingBackId === b.id
                                ? 'Rolling back...'
                                : `Rollback (${b.createdRecordIds.length})`}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Rolled back {b.rolledBackAt?.slice(0, 10) || ''}
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
        </div>
      )}
    </div>
  );
};
