import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  History,
  Layers,
  Link2,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import {
  ALLOWED_SYLLABUS_EXTENSIONS,
  countSyllabusTopics,
  createStarterModulesFromCourseTopics,
  formatFileSize,
  reorderSyllabusModules,
  stripUndefined,
  uploadSyllabusDocumentWithFallback,
  validateSyllabusFile,
} from '../../lib/syllabusEngine';
import { INSTITUTE_INFO } from '../../data/catalogSeed';
import {
  Course,
  SyllabusApprovalStatus,
  SyllabusAttachment,
  SyllabusModule,
  SyllabusRecord,
  SyllabusTopic,
  SyllabusVersionRecord,
  UserProfile,
} from '../../types/lms';
import { EmptyState } from '../common/PlatformWidgets';

export type SyllabusMode =
  | 'syllabus-list'
  | 'syllabus-upload'
  | 'syllabus-builder'
  | 'syllabus-modules'
  | 'syllabus-versions';

interface SyllabusManagementHubProps {
  mode: SyllabusMode;
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  syllabuses: SyllabusRecord[];
  syllabusVersions: SyllabusVersionRecord[];
  onNavigateTab: (tab: string) => void;
  onRefreshData: () => Promise<void>;
}

const APPROVAL_BADGE: Record<SyllabusApprovalStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Pending Review': 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  Approved: 'bg-[#EAF1FC] text-[#1677FF] dark:bg-blue-950/60 dark:text-blue-300',
  Published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  Archived: 'bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400',
};

function ApprovalBadge({ status }: { status: SyllabusApprovalStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
        APPROVAL_BADGE[status] || APPROVAL_BADGE.Draft
      }`}
    >
      {status}
    </span>
  );
}

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function createEmptyModule(moduleNumber: number): SyllabusModule {
  const uid = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: `mod_${uid}`,
    moduleNumber,
    title: `Module ${String(moduleNumber).padStart(2, '0')} — Untitled Module`,
    description: '',
    duration: '2 Weeks',
    learningOutcomes: [],
    topics: [
      {
        id: `top_${uid}_1`,
        title: 'Core Topic 1',
        subtopics: [],
      },
    ],
    practicalActivities: [],
    assignments: [],
    recommendedResources: [],
  };
}

export const SyllabusManagementHub: React.FC<SyllabusManagementHubProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  courses,
  syllabuses,
  syllabusVersions,
  onNavigateTab,
  onRefreshData,
}) => {
  const canApprovePublish =
    isOwner || ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC_MANAGER'].includes(profile.role);
  const canAuthorDraft = canApprovePublish || profile.role === 'LECTURER';

  // Shared course focus across views
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | SyllabusApprovalStatus>('All');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  // Upload & Builder Editor state
  const [academicYear, setAcademicYear] = useState('2027');
  const [programmeName, setProgrammeName] = useState('');
  const [totalCourseDuration, setTotalCourseDuration] = useState('');
  const [finalAssessment, setFinalAssessment] = useState(
    'Final Practical Capstone Project + Structured Competency Assessment (Minimum 60% pass threshold).'
  );
  const [changeSummary, setChangeSummary] = useState('');
  const [announcementNote, setAnnouncementNote] = useState('');
  const [attachment, setAttachment] = useState<SyllabusAttachment | null>(null);
  const [supportingResources, setSupportingResources] = useState<SyllabusAttachment[]>([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalFileName, setExternalFileName] = useState('');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingResource, setUploadingResource] = useState(false);

  // Structured Modules state (Builder & Module Management)
  const [modules, setModules] = useState<SyllabusModule[]>([]);
  const [editingModule, setEditingModule] = useState<SyllabusModule | null>(null);
  const [deleteModuleConfirm, setDeleteModuleConfirm] = useState<SyllabusModule | null>(null);
  const [loadedCourseForEditor, setLoadedCourseForEditor] = useState<string>('');

  // Preview & Restore Modals
  const [previewData, setPreviewData] = useState<{
    courseName: string;
    academicYear: string;
    versionNumber: number;
    status: SyllabusApprovalStatus;
    totalCourseDuration?: string;
    finalAssessment?: string;
    announcementNote?: string;
    attachment?: SyllabusAttachment | null;
    supportingResources?: SyllabusAttachment[];
    modules: SyllabusModule[];
  } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SyllabusVersionRecord | null>(null);

  // Version History Filter
  const [versionCourseFilter, setVersionCourseFilter] = useState<string>('ALL');

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || courses[0] || null,
    [courses, selectedCourseId]
  );

  const syllabusByCourseId = useMemo(() => {
    const map = new Map<string, SyllabusRecord>();
    for (const s of syllabuses) {
      map.set(s.courseId, s);
    }
    return map;
  }, [syllabuses]);

  const versionsByCourseId = useMemo(() => {
    const map = new Map<string, SyllabusVersionRecord[]>();
    for (const v of syllabusVersions) {
      const list = map.get(v.courseId) || [];
      list.push(v);
      map.set(v.courseId, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => b.versionNumber - a.versionNumber);
      map.set(k, list);
    }
    return map;
  }, [syllabusVersions]);

  const activeSyllabus = selectedCourse ? syllabusByCourseId.get(selectedCourse.id) || null : null;
  const activeCourseVersions = useMemo(
    () => (selectedCourse ? versionsByCourseId.get(selectedCourse.id) || [] : []),
    [selectedCourse, versionsByCourseId]
  );

  // Load selected course's latest version into Builder / Upload form when course changes
  useEffect(() => {
    if (!selectedCourse) return;
    if (loadedCourseForEditor === selectedCourse.id) return;

    const latestVer = activeCourseVersions[0] || null;
    if (latestVer) {
      setAcademicYear(latestVer.academicYear || '2027');
      setProgrammeName(latestVer.programmeName || selectedCourse.category || 'Diploma');
      setTotalCourseDuration(latestVer.totalCourseDuration || selectedCourse.duration || '6 Months');
      setFinalAssessment(
        latestVer.finalAssessment ||
          'Final Practical Capstone Project + Structured Competency Assessment.'
      );
      setAnnouncementNote(latestVer.announcementNote || '');
      setAttachment(latestVer.attachment || null);
      setSupportingResources(latestVer.supportingResources || []);
      setModules(
        latestVer.modules && latestVer.modules.length > 0
          ? latestVer.modules
          : createStarterModulesFromCourseTopics(selectedCourse.syllabusTopics)
      );
    } else {
      setAcademicYear('2027');
      setProgrammeName(`${selectedCourse.category} Programme`);
      setTotalCourseDuration(selectedCourse.duration || '6 Months');
      setFinalAssessment(
        'Final Practical Capstone Project + Structured Competency Assessment.'
      );
      setAnnouncementNote('');
      setAttachment(null);
      setSupportingResources([]);
      setModules(createStarterModulesFromCourseTopics(selectedCourse.syllabusTopics));
    }
    setChangeSummary('');
    setExternalUrl('');
    setExternalFileName('');
    setLoadedCourseForEditor(selectedCourse.id);
  }, [selectedCourse, activeCourseVersions, loadedCourseForEditor]);

  const selectCourseAndSwitch = (courseId: string, targetTab?: SyllabusMode) => {
    setSelectedCourseId(courseId);
    setLoadedCourseForEditor('');
    setBanner(null);
    if (targetTab) {
      onNavigateTab(targetTab);
    }
  };

  // Upload primary syllabus document (Firebase Storage -> Authenticated Server Fallback)
  const handlePrimaryFileSelect = async (file: File | null) => {
    if (!file || !selectedCourse) return;
    setBanner(null);
    const check = validateSyllabusFile(file);
    if (!check.valid) {
      setBanner({ type: 'error', message: check.error || 'Unsupported file.' });
      return;
    }

    setUploadingFile(true);
    setUploadPercent(5);
    try {
      const syllabusId = activeSyllabus?.syllabusId || `SYL-${selectedCourse.code || selectedCourse.id.slice(0, 8)}`;
      const nextVer = (activeCourseVersions[0]?.versionNumber || 0) + 1;
      const uploaded = await uploadSyllabusDocumentWithFallback({
        file,
        courseId: selectedCourse.id,
        syllabusId,
        versionNumber: nextVer,
        uploadedByUid: profile.uid,
        uploadedByName: profile.displayName,
        onProgress: setUploadPercent,
      });
      setAttachment(uploaded);
      setBanner({
        type: 'success',
        message: `Uploaded "${uploaded.fileName}" (${formatFileSize(uploaded.sizeBytes)}) via ${
          uploaded.storageProvider === 'firebase_storage'
            ? 'Firebase Cloud Storage'
            : 'Authenticated Server Storage'
        }. Save or Publish below to record the new version.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Syllabus upload failed.',
      });
    } finally {
      setUploadingFile(false);
    }
  };

  // Upload supporting resource (available to Lecturers and Admins)
  const handleSupportingResourceUpload = async (file: File | null) => {
    if (!file || !selectedCourse) return;
    setBanner(null);
    const check = validateSyllabusFile(file);
    if (!check.valid) {
      setBanner({ type: 'error', message: check.error || 'Unsupported file.' });
      return;
    }

    setUploadingResource(true);
    try {
      const syllabusId = activeSyllabus?.syllabusId || `SYL-${selectedCourse.code || selectedCourse.id.slice(0, 8)}`;
      const nextVer = (activeCourseVersions[0]?.versionNumber || 0) + 1;
      const uploaded = await uploadSyllabusDocumentWithFallback({
        file,
        courseId: selectedCourse.id,
        syllabusId,
        versionNumber: nextVer,
        uploadedByUid: profile.uid,
        uploadedByName: profile.displayName,
      });
      setSupportingResources((prev) => [...prev, uploaded].slice(0, 20));
      setBanner({
        type: 'success',
        message: `Attached supporting resource "${uploaded.fileName}". Save or Submit to persist.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Resource upload failed.',
      });
    } finally {
      setUploadingResource(false);
    }
  };

  const handleAttachExternalLink = () => {
    const cleanUrl = externalUrl.trim();
    if (!cleanUrl || (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://'))) {
      setBanner({ type: 'error', message: 'Enter a valid http:// or https:// syllabus URL.' });
      return;
    }
    const label = externalFileName.trim() || `${selectedCourse?.code || 'Course'}_Syllabus_Link.pdf`;
    setAttachment({
      fileId: `ext_${Date.now().toString(36)}`,
      fileName: label.slice(0, 140),
      mimeType: 'application/pdf',
      extension: 'pdf',
      sizeBytes: 0,
      url: cleanUrl.slice(0, 1000),
      storageProvider: 'external_link',
      uploadedAt: new Date().toISOString(),
      uploadedByUid: profile.uid,
      uploadedByName: profile.displayName,
    });
    setExternalUrl('');
    setExternalFileName('');
    setBanner({
      type: 'info',
      message: `Linked external document "${label}". Save or Publish to create a new syllabus version.`,
    });
  };

  /**
   * Core Non-Destructive Version Persistence:
   * - Never overwrites an already-Published syllabusVersion.
   * - Lecturers can only save 'Draft' or 'Pending Review' (never 'Published').
   * - If a syllabus is already published and a Lecturer submits a 'Pending Review' update,
   *   we create the new immutable syllabusVersion document without mutating the live published syllabus record.
   * - When an Admin publishes a new version, prior Published version is marked 'Archived' cleanly.
   */
  const persistSyllabusRevision = async (
    targetStatus: SyllabusApprovalStatus,
    options?: {
      customModules?: SyllabusModule[];
      customAttachment?: SyllabusAttachment | null;
      customSupportingResources?: SyllabusAttachment[];
      restoredFromVersion?: number;
      overrideSummary?: string;
    }
  ) => {
    if (!selectedCourse || !canAuthorDraft) return;
    if (targetStatus === 'Published' && !canApprovePublish) {
      setBanner({
        type: 'error',
        message: 'Only Super Admin, Admin, or Academic Manager can publish a syllabus. Please submit for Pending Review.',
      });
      return;
    }

    setBusy(true);
    setBanner(null);

    try {
      const now = new Date().toISOString();
      const effectiveModules = (options?.customModules ?? modules).map((m, idx) => ({
        ...m,
        moduleNumber: idx + 1,
      }));
      const effectiveAttachment =
        options && 'customAttachment' in options ? options.customAttachment ?? null : attachment;
      const effectiveSupporting = options?.customSupportingResources ?? supportingResources;

      const syllabusDocId = activeSyllabus?.id || `syl_${selectedCourse.id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      const syllabusCode =
        activeSyllabus?.syllabusId ||
        `SYL-${selectedCourse.code.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24)}-${academicYear}`;

      const maxExistingVer = activeCourseVersions.reduce(
        (max, v) => Math.max(max, v.versionNumber || 0),
        activeSyllabus?.latestVersionNumber || 0
      );
      const nextVersionNumber = maxExistingVer + 1;
      const versionDocId = makeSafeId(`SYLV${nextVersionNumber}`);

      const summaryText =
        (options?.overrideSummary || changeSummary).trim() ||
        (targetStatus === 'Published'
          ? `Published revision v${nextVersionNumber} for ${selectedCourse.name}`
          : targetStatus === 'Pending Review'
          ? `Submitted revision v${nextVersionNumber} for Academic review`
          : `Saved draft revision v${nextVersionNumber}`);

      const versionPayload = stripUndefined({
        syllabusId: syllabusCode,
        courseId: selectedCourse.id,
        courseName: selectedCourse.name.slice(0, 160),
        programmeName: (programmeName || selectedCourse.category).slice(0, 160),
        academicYear: (academicYear || '2027').slice(0, 24),
        versionNumber: nextVersionNumber,
        status: targetStatus,
        changeSummary: summaryText.slice(0, 500),
        totalCourseDuration: (totalCourseDuration || selectedCourse.duration).slice(0, 64),
        finalAssessment: finalAssessment.trim().slice(0, 1500),
        announcementNote: announcementNote.trim().slice(0, 600),
        attachment: effectiveAttachment,
        supportingResources: effectiveSupporting.slice(0, 20),
        modules: effectiveModules.slice(0, 60),
        restoredFromVersion: options?.restoredFromVersion,
        createdByUid: profile.uid,
        createdByName: profile.displayName.slice(0, 120),
        createdByRole: profile.role,
        approvedByUid: targetStatus === 'Published' || targetStatus === 'Approved' ? profile.uid : undefined,
        approvedByName:
          targetStatus === 'Published' || targetStatus === 'Approved'
            ? profile.displayName.slice(0, 120)
            : undefined,
        publishedAt: targetStatus === 'Published' ? now : undefined,
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: now,
        updatedAt: now,
      });

      // 1. Write the immutable new version record
      await setDoc(doc(db, 'syllabusVersions', versionDocId), versionPayload);

      // 2. If Admin is publishing, mark any previously Published versions for this course as Archived
      if (targetStatus === 'Published' && canApprovePublish) {
        const previouslyPublished = activeCourseVersions.filter((v) => v.status === 'Published');
        for (const prev of previouslyPublished) {
          await updateDoc(doc(db, 'syllabusVersions', prev.id), {
            status: 'Archived',
            updatedAt: now,
          });
        }
      }

      // 3. Upsert master syllabuses/{syllabusDocId} record
      // Note: Lecturers cannot mutate an already-published master syllabus doc (enforced by Firestore rules)
      const isAlreadyPublished = activeSyllabus?.publishedStatus === 'published';
      const canUpdateMasterRecord = canApprovePublish || !isAlreadyPublished;

      if (canUpdateMasterRecord) {
        const willBePublished = targetStatus === 'Published' || isAlreadyPublished;
        const topicCount = countSyllabusTopics(effectiveModules);

        const masterPayload = stripUndefined({
          syllabusId: syllabusCode,
          courseId: selectedCourse.id,
          courseCode: selectedCourse.code.slice(0, 40),
          courseName: selectedCourse.name.slice(0, 160),
          programmeName: (programmeName || selectedCourse.category).slice(0, 160),
          academicYear: (academicYear || '2027').slice(0, 24),
          totalCourseDuration: (totalCourseDuration || selectedCourse.duration).slice(0, 64),
          latestVersionNumber: nextVersionNumber,
          publishedVersionNumber:
            targetStatus === 'Published'
              ? nextVersionNumber
              : activeSyllabus?.publishedVersionNumber,
          publishedVersionId:
            targetStatus === 'Published' ? versionDocId : activeSyllabus?.publishedVersionId,
          latestVersionId: versionDocId,
          approvalStatus: targetStatus,
          publishedStatus: willBePublished ? 'published' : 'unpublished',
          moduleCount: effectiveModules.length,
          topicCount,
          hasFileAttachment: Boolean(effectiveAttachment),
          latestFileName: effectiveAttachment?.fileName?.slice(0, 200),
          latestFileUrl: effectiveAttachment?.url?.slice(0, 1000),
          latestFileMimeType: effectiveAttachment?.mimeType?.slice(0, 120),
          announcementNote: announcementNote.trim().slice(0, 600),
          uploadedByUid: activeSyllabus?.uploadedByUid || profile.uid,
          uploadedByName: activeSyllabus?.uploadedByName || profile.displayName.slice(0, 120),
          approvedByUid:
            targetStatus === 'Published'
              ? profile.uid
              : activeSyllabus?.approvedByUid,
          approvedByName:
            targetStatus === 'Published'
              ? profile.displayName.slice(0, 120)
              : activeSyllabus?.approvedByName,
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: activeSyllabus?.createdAt || now,
          updatedAt: now,
        });

        await setDoc(doc(db, 'syllabuses', syllabusDocId), masterPayload);
      }

      // 4. Write immutable audit trail
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action:
          options?.restoredFromVersion
            ? 'SYLLABUS_VERSION_RESTORED'
            : targetStatus === 'Published'
            ? 'SYLLABUS_PUBLISHED'
            : targetStatus === 'Pending Review'
            ? 'SYLLABUS_SUBMITTED_REVIEW'
            : 'SYLLABUS_DRAFT_SAVED',
        targetType: 'syllabusVersions',
        targetId: versionDocId,
        details: `${selectedCourse.code} ${selectedCourse.name} — v${nextVersionNumber} (${targetStatus}): ${summaryText.slice(0, 220)}`,
      });

      setChangeSummary('');
      await onRefreshData();
      setLoadedCourseForEditor(selectedCourse.id);

      setBanner({
        type: 'success',
        message:
          targetStatus === 'Published'
            ? `Published ${selectedCourse.code} Syllabus v${nextVersionNumber}. Enrolled students now see this approved version.`
            : targetStatus === 'Pending Review'
            ? `Submitted ${selectedCourse.code} Syllabus v${nextVersionNumber} for Admin / Academic Manager review.`
            : `Saved ${selectedCourse.code} Syllabus Draft v${nextVersionNumber}.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to save syllabus revision.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Promote an existing Draft or Pending Review version to Published (Admin only)
  const handleApproveAndPublishVersion = async (ver: SyllabusVersionRecord) => {
    if (!canApprovePublish) return;
    setBusy(true);
    setBanner(null);
    try {
      const now = new Date().toISOString();
      const course = courses.find((c) => c.id === ver.courseId);
      const existingMaster = syllabusByCourseId.get(ver.courseId);
      const courseVersions = versionsByCourseId.get(ver.courseId) || [];

      // Archive previous published versions for this course
      for (const prev of courseVersions.filter((v) => v.status === 'Published' && v.id !== ver.id)) {
        await updateDoc(doc(db, 'syllabusVersions', prev.id), {
          status: 'Archived',
          updatedAt: now,
        });
      }

      // Mark selected version as Published
      await updateDoc(doc(db, 'syllabusVersions', ver.id), {
        status: 'Published',
        approvedByUid: profile.uid,
        approvedByName: profile.displayName.slice(0, 120),
        publishedAt: now,
        updatedAt: now,
      });

      const syllabusDocId = existingMaster?.id || `syl_${ver.courseId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      const maxVerNum = Math.max(
        ver.versionNumber,
        existingMaster?.latestVersionNumber || 0,
        ...courseVersions.map((v) => v.versionNumber)
      );

      const masterPayload = stripUndefined({
        syllabusId: ver.syllabusId,
        courseId: ver.courseId,
        courseCode: (course?.code || existingMaster?.courseCode || '').slice(0, 40),
        courseName: ver.courseName.slice(0, 160),
        programmeName: (ver.programmeName || course?.category || 'Diploma').slice(0, 160),
        academicYear: ver.academicYear.slice(0, 24),
        totalCourseDuration: (ver.totalCourseDuration || course?.duration || '').slice(0, 64),
        latestVersionNumber: maxVerNum,
        publishedVersionNumber: ver.versionNumber,
        publishedVersionId: ver.id,
        latestVersionId: existingMaster?.latestVersionId || ver.id,
        approvalStatus: 'Published' as SyllabusApprovalStatus,
        publishedStatus: 'published' as const,
        moduleCount: ver.modules?.length || 0,
        topicCount: countSyllabusTopics(ver.modules || []),
        hasFileAttachment: Boolean(ver.attachment),
        latestFileName: ver.attachment?.fileName?.slice(0, 200),
        latestFileUrl: ver.attachment?.url?.slice(0, 1000),
        latestFileMimeType: ver.attachment?.mimeType?.slice(0, 120),
        announcementNote: (ver.announcementNote || '').slice(0, 600),
        uploadedByUid: existingMaster?.uploadedByUid || ver.createdByUid,
        uploadedByName: existingMaster?.uploadedByName || ver.createdByName,
        approvedByUid: profile.uid,
        approvedByName: profile.displayName.slice(0, 120),
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: existingMaster?.createdAt || ver.createdAt || now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'syllabuses', syllabusDocId), masterPayload);

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'SYLLABUS_APPROVED_PUBLISHED',
        targetType: 'syllabusVersions',
        targetId: ver.id,
        details: `Approved & published ${ver.courseName} syllabus v${ver.versionNumber}`,
      });

      await onRefreshData();
      setBanner({
        type: 'success',
        message: `Approved and published ${ver.courseName} (v${ver.versionNumber}). Prior published version archived safely.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to approve syllabus version.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Non-destructive Restore: creates a new incremented Published version copied from historical version
  const handleConfirmRestoreVersion = async () => {
    if (!restoreTarget || !canApprovePublish) return;
    const target = restoreTarget;
    setRestoreTarget(null);

    const course = courses.find((c) => c.id === target.courseId);
    if (!course) return;

    setSelectedCourseId(course.id);
    setAcademicYear(target.academicYear);
    setProgrammeName(target.programmeName || course.category);
    setTotalCourseDuration(target.totalCourseDuration || course.duration);
    setFinalAssessment(target.finalAssessment || '');
    setAnnouncementNote(target.announcementNote || '');
    setAttachment(target.attachment || null);
    setSupportingResources(target.supportingResources || []);
    setModules(target.modules || []);

    // Persist directly against target course
    setBusy(true);
    setBanner(null);
    try {
      const now = new Date().toISOString();
      const existingMaster = syllabusByCourseId.get(target.courseId);
      const courseVersions = versionsByCourseId.get(target.courseId) || [];
      const nextVersionNumber =
        Math.max(
          existingMaster?.latestVersionNumber || 0,
          ...courseVersions.map((v) => v.versionNumber)
        ) + 1;

      const versionDocId = makeSafeId(`SYLV${nextVersionNumber}`);
      const summaryText = `Restored snapshot from v${target.versionNumber} into new published revision v${nextVersionNumber}`;

      await setDoc(
        doc(db, 'syllabusVersions', versionDocId),
        stripUndefined({
          syllabusId: target.syllabusId,
          courseId: target.courseId,
          courseName: target.courseName,
          programmeName: target.programmeName,
          academicYear: target.academicYear,
          versionNumber: nextVersionNumber,
          status: 'Published' as SyllabusApprovalStatus,
          changeSummary: summaryText,
          totalCourseDuration: target.totalCourseDuration,
          finalAssessment: target.finalAssessment,
          announcementNote: target.announcementNote,
          attachment: target.attachment ?? null,
          supportingResources: target.supportingResources || [],
          modules: target.modules || [],
          restoredFromVersion: target.versionNumber,
          createdByUid: profile.uid,
          createdByName: profile.displayName.slice(0, 120),
          createdByRole: profile.role,
          approvedByUid: profile.uid,
          approvedByName: profile.displayName.slice(0, 120),
          publishedAt: now,
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: now,
          updatedAt: now,
        })
      );

      for (const prev of courseVersions.filter((v) => v.status === 'Published')) {
        await updateDoc(doc(db, 'syllabusVersions', prev.id), {
          status: 'Archived',
          updatedAt: now,
        });
      }

      const syllabusDocId = existingMaster?.id || `syl_${target.courseId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      await setDoc(
        doc(db, 'syllabuses', syllabusDocId),
        stripUndefined({
          syllabusId: target.syllabusId,
          courseId: target.courseId,
          courseCode: course.code.slice(0, 40),
          courseName: target.courseName,
          programmeName: target.programmeName || course.category,
          academicYear: target.academicYear,
          totalCourseDuration: target.totalCourseDuration || course.duration,
          latestVersionNumber: nextVersionNumber,
          publishedVersionNumber: nextVersionNumber,
          publishedVersionId: versionDocId,
          latestVersionId: versionDocId,
          approvalStatus: 'Published' as SyllabusApprovalStatus,
          publishedStatus: 'published' as const,
          moduleCount: (target.modules || []).length,
          topicCount: countSyllabusTopics(target.modules || []),
          hasFileAttachment: Boolean(target.attachment),
          latestFileName: target.attachment?.fileName,
          latestFileUrl: target.attachment?.url,
          latestFileMimeType: target.attachment?.mimeType,
          announcementNote: target.announcementNote || '',
          uploadedByUid: existingMaster?.uploadedByUid || profile.uid,
          uploadedByName: existingMaster?.uploadedByName || profile.displayName.slice(0, 120),
          approvedByUid: profile.uid,
          approvedByName: profile.displayName.slice(0, 120),
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: existingMaster?.createdAt || now,
          updatedAt: now,
        })
      );

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'SYLLABUS_VERSION_RESTORED',
        targetType: 'syllabusVersions',
        targetId: versionDocId,
        details: `${course.code} ${course.name}: Restored v${target.versionNumber} as new Published v${nextVersionNumber}`,
      });

      await onRefreshData();
      setLoadedCourseForEditor('');
      setBanner({
        type: 'success',
        message: `Restored ${target.courseName} v${target.versionNumber} into new Published revision v${nextVersionNumber}. All historical versions remain preserved.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to restore syllabus version.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Module Editor Helpers
  const handleMoveModule = (index: number, direction: -1 | 1) => {
    setModules((prev) => reorderSyllabusModules(prev, index, index + direction));
  };

  const handleSaveEditedModule = (updated: SyllabusModule) => {
    setModules((prev) => {
      const exists = prev.some((m) => m.id === updated.id);
      const next = exists
        ? prev.map((m) => (m.id === updated.id ? updated : m))
        : [...prev, updated];
      return next.map((m, i) => ({ ...m, moduleNumber: i + 1 }));
    });
    setEditingModule(null);
  };

  const handleConfirmDeleteModule = () => {
    if (!deleteModuleConfirm) return;
    setModules((prev) =>
      prev
        .filter((m) => m.id !== deleteModuleConfirm.id)
        .map((m, i) => ({ ...m, moduleNumber: i + 1 }))
    );
    setDeleteModuleConfirm(null);
  };

  // KPI metrics for Syllabus Management list
  const kpis = useMemo(() => {
    const published = syllabuses.filter((s) => s.publishedStatus === 'published').length;
    const pendingReview = syllabusVersions.filter((v) => v.status === 'Pending Review').length;
    const drafts = syllabusVersions.filter((v) => v.status === 'Draft').length;
    const withFiles = syllabuses.filter((s) => s.hasFileAttachment).length;
    return {
      totalSyllabuses: syllabuses.length,
      published,
      pendingReview,
      drafts,
      withFiles,
      totalVersions: syllabusVersions.length,
    };
  }, [syllabuses, syllabusVersions]);

  const pendingVersions = useMemo(
    () => syllabusVersions.filter((v) => v.status === 'Pending Review'),
    [syllabusVersions]
  );

  if (!canAuthorDraft) {
    return (
      <EmptyState
        title="Academic Authorization Required"
        description="Syllabus authoring and version management are restricted to Super Admin, Admin, Academic Manager, and Lecturers. Students access approved syllabuses inside the Learning Portal (LMS)."
        actionLabel="Open Learning Portal (LMS)"
        onAction={() => onNavigateTab('lms')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Status Banner */}
      {banner && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
              : banner.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
              : 'border-blue-200 bg-[#EAF1FC] text-[#101D35] dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {banner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{banner.message}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 1: SYLLABUS MANAGEMENT DIRECTORY (syllabus-list)               */}
      {/* =================================================================== */}
      {mode === 'syllabus-list' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#101D35] dark:text-white">
                Course Syllabus Management
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Upload official syllabus documents, author structured modules, and govern versioned approvals for all {courses.length} TECHMAN COLLEGE programmes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => onNavigateTab('syllabus-upload')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[#1677FF]" />
                Upload Syllabus File
              </button>
              <button
                onClick={() => onNavigateTab('syllabus-builder')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Open Syllabus Builder
              </button>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Configured Syllabuses</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#101D35] dark:text-white">
                {kpis.totalSyllabuses}
                <span className="text-xs font-normal text-slate-400 ml-1">/ {courses.length}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {kpis.withFiles} with uploaded documents
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Published to Students</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {kpis.published}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Enrolled-only LMS visibility</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Pending Review Queue</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {kpis.pendingReview}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Awaiting Academic Manager sign-off</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Immutable Revisions</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#1677FF]">
                {kpis.totalVersions}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{kpis.drafts} active drafts</div>
            </div>
          </div>

          {/* Pending Review Queue (Admin Approval Banner) */}
          {canApprovePublish && pendingVersions.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/20 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
                  <Clock className="w-4 h-4" />
                  Pending Syllabus Approvals ({pendingVersions.length})
                </div>
                <span className="text-[11px] text-amber-800 dark:text-amber-400">
                  Review lecturer submissions before publishing to enrolled students
                </span>
              </div>
              <div className="space-y-2">
                {pendingVersions.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#1677FF]">
                          v{ver.versionNumber}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {ver.courseName}
                        </span>
                        <ApprovalBadge status={ver.status} />
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Submitted by <strong>{ver.createdByName}</strong> ({ver.createdByRole || 'STAFF'}) ·{' '}
                        {ver.modules?.length || 0} modules · {ver.changeSummary || 'Curriculum update'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          setPreviewData({
                            courseName: ver.courseName,
                            academicYear: ver.academicYear,
                            versionNumber: ver.versionNumber,
                            status: ver.status,
                            totalCourseDuration: ver.totalCourseDuration,
                            finalAssessment: ver.finalAssessment,
                            announcementNote: ver.announcementNote,
                            attachment: ver.attachment,
                            supportingResources: ver.supportingResources,
                            modules: ver.modules || [],
                          })
                        }
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Inspect
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void handleApproveAndPublishVersion(ver)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Approve &amp; Publish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search courses by name, code, or domain..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', 'Published', 'Pending Review', 'Draft', 'Archived'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                    statusFilter === st
                      ? 'bg-[#101D35] text-white dark:bg-[#1677FF]'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Course-Linked Syllabus Directory Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 font-medium">Course</th>
                    <th className="py-3 px-4 font-medium">Version</th>
                    <th className="py-3 px-4 font-medium">Structure</th>
                    <th className="py-3 px-4 font-medium">Document</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {courses
                    .filter((c) => {
                      const syl = syllabusByCourseId.get(c.id);
                      if (statusFilter !== 'All') {
                        if (!syl) return false;
                        if (syl.approvalStatus !== statusFilter) return false;
                      }
                      const q = searchTerm.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        c.name.toLowerCase().includes(q) ||
                        c.code.toLowerCase().includes(q) ||
                        (c.domain || '').toLowerCase().includes(q)
                      );
                    })
                    .map((course) => {
                      const syl = syllabusByCourseId.get(course.id);
                      const versions = versionsByCourseId.get(course.id) || [];
                      const latestVer = versions[0] || null;
                      const publishedVer = versions.find((v) => v.status === 'Published') || null;
                      const pendingCount = versions.filter((v) => v.status === 'Pending Review').length;

                      return (
                        <tr key={course.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {course.code}
                              </span>
                              <span className="font-medium text-slate-900 dark:text-white text-xs sm:text-sm">
                                {course.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {course.category} · {course.duration} · Year {syl?.academicYear || '2027'}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {syl ? (
                              <div className="space-y-0.5">
                                <div className="font-mono text-xs font-semibold text-[#101D35] dark:text-white tabular-nums">
                                  Latest: v{syl.latestVersionNumber}
                                </div>
                                {syl.publishedVersionNumber ? (
                                  <div className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                                    Live: v{syl.publishedVersionNumber}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400">Not published</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Not created</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                            {syl ? (
                              <div>
                                {syl.moduleCount} modules · {syl.topicCount || 0} topics
                              </div>
                            ) : (
                              <span className="text-slate-400 font-sans">
                                {(course.syllabusTopics || []).length} catalog topics
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs">
                            {syl?.latestFileUrl ? (
                              <a
                                href={syl.latestFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#1677FF] hover:underline font-medium max-w-[160px] truncate"
                                title={syl.latestFileName}
                              >
                                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{syl.latestFileName || 'Syllabus File'}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">Structured only</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              {syl ? (
                                <ApprovalBadge status={syl.approvalStatus} />
                              ) : (
                                <span className="text-[11px] text-slate-400">Catalog Seed</span>
                              )}
                              {pendingCount > 0 && syl?.approvalStatus !== 'Pending Review' && (
                                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                  +{pendingCount} pending review
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {(publishedVer || latestVer) && (
                                <button
                                  onClick={() => {
                                    const target = publishedVer || latestVer!;
                                    setPreviewData({
                                      courseName: target.courseName,
                                      academicYear: target.academicYear,
                                      versionNumber: target.versionNumber,
                                      status: target.status,
                                      totalCourseDuration: target.totalCourseDuration,
                                      finalAssessment: target.finalAssessment,
                                      announcementNote: target.announcementNote,
                                      attachment: target.attachment,
                                      supportingResources: target.supportingResources,
                                      modules: target.modules || [],
                                    });
                                  }}
                                  title="Preview syllabus"
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => selectCourseAndSwitch(course.id, 'syllabus-upload')}
                                title="Upload file"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => selectCourseAndSwitch(course.id, 'syllabus-builder')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#101D35] dark:bg-[#1677FF] text-white text-xs font-medium hover:opacity-90 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                {syl ? 'Edit' : 'Build'}
                              </button>
                              {versions.length > 0 && (
                                <button
                                  onClick={() => {
                                    setVersionCourseFilter(course.id);
                                    onNavigateTab('syllabus-versions');
                                  }}
                                  title="Version history"
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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

      {/* =================================================================== */}
      {/* VIEW 2: UPLOAD SYLLABUS DOCUMENT (syllabus-upload)                  */}
      {/* =================================================================== */}
      {mode === 'syllabus-upload' && selectedCourse && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#101D35] dark:text-white">
                Upload Course Syllabus Document
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Upload official PDF, DOCX, DOC, XLSX, PPTX, or image syllabuses via Firebase Storage with automatic authenticated server fallback.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('syllabus-builder')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#1677FF]" />
              Switch to Structured Builder
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Metadata & Primary File Upload */}
            <div className="lg:col-span-8 space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <h2 className="text-sm font-bold text-[#101D35] dark:text-white">
                  1. Course &amp; Version Metadata
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Target Course *
                    </label>
                    <select
                      value={selectedCourse.id}
                      onChange={(e) => selectCourseAndSwitch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name} ({c.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Academic Year *
                    </label>
                    <input
                      type="text"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      placeholder="2027"
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Total Course Duration
                    </label>
                    <input
                      type="text"
                      value={totalCourseDuration}
                      onChange={(e) => setTotalCourseDuration(e.target.value)}
                      placeholder="e.g., 6 Months (180 Guided Hours)"
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Programme Label
                    </label>
                    <input
                      type="text"
                      value={programmeName}
                      onChange={(e) => setProgrammeName(e.target.value)}
                      placeholder="International Diploma / Certificate"
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Revision Change Summary
                    </label>
                    <input
                      type="text"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      placeholder="e.g., Updated 2027 AI labs & practical rubrics"
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Student Syllabus Update Notice (Optional)
                    </label>
                    <input
                      type="text"
                      value={announcementNote}
                      onChange={(e) => setAnnouncementNote(e.target.value)}
                      placeholder="Shown to enrolled students when this syllabus is published..."
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Primary Document Dropzone */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#101D35] dark:text-white">
                    2. Official Syllabus Document
                  </h2>
                  <span className="text-[11px] font-mono text-slate-500">
                    Max 15 MB · {ALLOWED_SYLLABUS_EXTENSIONS.join(', ').toUpperCase()}
                  </span>
                </div>

                <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center hover:border-[#1677FF] transition cursor-pointer bg-slate-50/70 dark:bg-slate-800/40">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.xlsx,.pptx,.png,.jpg,.jpeg,.webp"
                    disabled={uploadingFile}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      void handlePrimaryFileSelect(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <Upload className="w-7 h-7 text-[#1677FF] mx-auto mb-2" />
                  <div className="text-sm font-semibold text-[#101D35] dark:text-white">
                    {uploadingFile
                      ? `Uploading syllabus document (${uploadPercent}%)...`
                      : 'Click to select official syllabus file'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Automatically uploads to Firebase Storage, with authenticated server storage fallback
                  </p>
                  {uploadingFile && (
                    <div className="mt-3 max-w-xs mx-auto h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-[#1677FF] transition-all"
                        style={{ width: `${uploadPercent}%` }}
                      />
                    </div>
                  )}
                </label>

                {attachment && (
                  <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {attachment.fileName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {attachment.extension.toUpperCase()} ·{' '}
                          {attachment.sizeBytes > 0 ? formatFileSize(attachment.sizeBytes) : 'Linked URL'} ·{' '}
                          {attachment.storageProvider === 'firebase_storage'
                            ? 'Firebase Storage'
                            : attachment.storageProvider === 'server_fallback'
                            ? 'Server Storage'
                            : 'External Link'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-[#1677FF] hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Remove attachment"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* External Link Fallback */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Or link an external institutional PDF / document URL
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={externalFileName}
                      onChange={(e) => setExternalFileName(e.target.value)}
                      placeholder="Document title (e.g., 2027 Handbook PDF)"
                      className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="https://..."
                      className="sm:col-span-6 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAttachExternalLink}
                      className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Attach
                    </button>
                  </div>
                </div>
              </div>

              {/* Supporting Resources (Lecturers & Admins) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#101D35] dark:text-white">
                      3. Supporting Course Resources ({supportingResources.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Lab manuals, slide decks, assignment briefs, or reference sheets attached to this syllabus version.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.xlsx,.pptx,.png,.jpg,.jpeg,.webp"
                      disabled={uploadingResource}
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        void handleSupportingResourceUpload(f);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <Plus className="w-3.5 h-3.5 text-[#1677FF]" />
                    {uploadingResource ? 'Uploading...' : 'Add Resource'}
                  </label>
                </div>

                {supportingResources.length > 0 && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {supportingResources.map((res) => (
                      <div
                        key={res.fileId}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {res.fileName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {res.extension.toUpperCase()} · {formatFileSize(res.sizeBytes)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1677FF] hover:underline"
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setSupportingResources((prev) =>
                                prev.filter((item) => item.fileId !== res.fileId)
                              )
                            }
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar: Save & Governance Controls */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                    Version Governance
                  </div>
                  <div className="text-base font-bold text-[#101D35] dark:text-white mt-1">
                    {selectedCourse.code} · Next Revision v
                    {(activeCourseVersions[0]?.versionNumber || 0) + 1}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Every upload creates a new numbered revision. Published versions are never overwritten silently.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Live:</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {activeSyllabus?.publishedVersionNumber
                        ? `v${activeSyllabus.publishedVersionNumber}`
                        : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Structured Modules:</span>
                    <span>{modules.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Primary File:</span>
                    <span>{attachment ? attachment.extension.toUpperCase() : 'None'}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    disabled={busy || uploadingFile}
                    onClick={() => void persistSyllabusRevision('Draft')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Save as Draft Version
                  </button>

                  <button
                    disabled={busy || uploadingFile}
                    onClick={() => void persistSyllabusRevision('Pending Review')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    Submit for Pending Review
                  </button>

                  {canApprovePublish ? (
                    <button
                      disabled={busy || uploadingFile}
                      onClick={() => void persistSyllabusRevision('Published')}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Approve &amp; Publish to Enrolled Students
                    </button>
                  ) : (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-400">
                      Lecturer accounts can upload syllabus files and submit updates for{' '}
                      <strong>Pending Review</strong>. Final publication requires Academic Manager or Admin approval.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 3 & 4: STRUCTURED SYLLABUS BUILDER & MODULE MANAGEMENT         */}
      {/* =================================================================== */}
      {(mode === 'syllabus-builder' || mode === 'syllabus-modules') && selectedCourse && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#101D35] dark:text-white">
                {mode === 'syllabus-builder' ? 'Structured Syllabus Builder' : 'Course Module Management'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {mode === 'syllabus-builder'
                  ? 'Build hierarchical Course → Modules → Topics, Subtopics, Practical Activities, Assignments, and Final Assessment.'
                  : 'Reorder, refine, add, or remove course syllabus modules and publish clean versioned updates.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCourse.id}
                onChange={(e) => selectCourseAndSwitch(e.target.value)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium max-w-xs"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  setPreviewData({
                    courseName: selectedCourse.name,
                    academicYear,
                    versionNumber: (activeCourseVersions[0]?.versionNumber || 0) + 1,
                    status: 'Draft',
                    totalCourseDuration,
                    finalAssessment,
                    announcementNote,
                    attachment,
                    supportingResources,
                    modules,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#1677FF]" />
                Student Preview
              </button>
            </div>
          </div>

          {/* Syllabus Header Metadata (Builder Mode) */}
          {mode === 'syllabus-builder' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Total Duration
                </label>
                <input
                  type="text"
                  value={totalCourseDuration}
                  onChange={(e) => setTotalCourseDuration(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Revision Change Summary
                </label>
                <input
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe what changed in this revision..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Attached Document
                </label>
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {attachment ? attachment.fileName : 'No file attached'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('syllabus-upload')}
                    className="text-[#1677FF] font-semibold hover:underline shrink-0 cursor-pointer"
                  >
                    Upload
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Module List Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-[#101D35] dark:text-white">
                Modules ({modules.length}) · Topics ({countSyllabusTopics(modules)})
              </h2>
              <button
                type="button"
                onClick={() =>
                  setModules(createStarterModulesFromCourseTopics(selectedCourse.syllabusTopics))
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#1677FF]" />
                Load Starter Modules from Catalog
              </button>
            </div>
            <button
              type="button"
              onClick={() => setEditingModule(createEmptyModule(modules.length + 1))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#101D35] dark:bg-[#1677FF] text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Module
            </button>
          </div>

          {/* Structured Modules Cards */}
          {modules.length === 0 ? (
            <EmptyState
              title="No Syllabus Modules Yet"
              description="Add structured modules or load starter modules from the 2027 course catalog to build this course's curriculum."
              actionLabel="Add First Module"
              onAction={() => setEditingModule(createEmptyModule(1))}
            />
          ) : (
            <div className="space-y-3">
              {modules.map((mod, idx) => (
                <div
                  key={mod.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#EAF1FC] text-[#1677FF] dark:bg-blue-950/60 dark:text-blue-300 tabular-nums">
                          Module {String(mod.moduleNumber).padStart(2, '0')}
                        </span>
                        {mod.duration && (
                          <span className="font-mono text-[11px] text-slate-500">
                            {mod.duration}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-[#101D35] dark:text-white">
                        {mod.title}
                      </h3>
                      {mod.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {mod.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveModule(idx, -1)}
                        title="Move module up"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === modules.length - 1}
                        onClick={() => handleMoveModule(idx, 1)}
                        title="Move module down"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingModule(mod)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModuleConfirm(mod)}
                        title="Delete module"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Compact Module Details Grid */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Topics ({mod.topics.length})
                      </div>
                      <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                        {mod.topics.map((t) => (
                          <li key={t.id}>
                            <span className="font-medium">• {t.title}</span>
                            {t.subtopics.length > 0 && (
                              <span className="text-slate-500 ml-1">
                                ({t.subtopics.join(', ')})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Learning Outcomes ({mod.learningOutcomes.length})
                      </div>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                        {mod.learningOutcomes.length === 0 ? (
                          <li className="italic text-slate-400">None added</li>
                        ) : (
                          mod.learningOutcomes.map((o, i) => <li key={i}>✓ {o}</li>)
                        )}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Activities &amp; Assignments
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-400">
                        {mod.practicalActivities.map((a, i) => (
                          <div key={`a-${i}`}>Lab: {a}</div>
                        ))}
                        {mod.assignments.map((a, i) => (
                          <div key={`asg-${i}`}>Assignment: {a}</div>
                        ))}
                        {mod.practicalActivities.length === 0 && mod.assignments.length === 0 && (
                          <span className="italic text-slate-400">None added</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Final Assessment & Save Action Bar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#101D35] dark:text-white mb-1.5">
                Final Assessment &amp; Certification Criteria
              </label>
              <textarea
                rows={2}
                value={finalAssessment}
                onChange={(e) => setFinalAssessment(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">
                Saving creates immutable revision{' '}
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  v{(activeCourseVersions[0]?.versionNumber || 0) + 1}
                </span>
                . Published versions remain intact in Version History.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => void persistSyllabusRevision('Draft')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Draft
                </button>
                <button
                  disabled={busy}
                  onClick={() => void persistSyllabusRevision('Pending Review')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100/70 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit for Review
                </button>
                {canApprovePublish && (
                  <button
                    disabled={busy}
                    onClick={() => void persistSyllabusRevision('Published')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Approve &amp; Publish
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 5: SYLLABUS VERSION HISTORY (syllabus-versions)                */}
      {/* =================================================================== */}
      {mode === 'syllabus-versions' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#101D35] dark:text-white">
                Syllabus Version History
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Complete immutable revision audit trail across all courses. Restore any historical version safely without deleting prior records.
              </p>
            </div>
            <select
              value={versionCourseFilter}
              onChange={(e) => setVersionCourseFilter(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium max-w-xs"
            >
              <option value="ALL">All Courses ({syllabusVersions.length} versions)</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {syllabusVersions.filter(
            (v) => versionCourseFilter === 'ALL' || v.courseId === versionCourseFilter
          ).length === 0 ? (
            <EmptyState
              title="No Syllabus Versions Recorded Yet"
              description="Upload a syllabus document or build structured modules to create your first versioned syllabus revision."
              actionLabel="Open Syllabus Builder"
              onAction={() => onNavigateTab('syllabus-builder')}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4 font-medium">Version</th>
                      <th className="py-3 px-4 font-medium">Course</th>
                      <th className="py-3 px-4 font-medium">Change Summary</th>
                      <th className="py-3 px-4 font-medium">Author &amp; Date</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {syllabusVersions
                      .filter(
                        (v) => versionCourseFilter === 'ALL' || v.courseId === versionCourseFilter
                      )
                      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                      .map((ver) => (
                        <tr key={ver.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono text-xs font-bold text-[#1677FF]">
                              v{ver.versionNumber}
                            </span>
                            {ver.restoredFromVersion && (
                              <div className="text-[10px] font-mono text-slate-400">
                                from v{ver.restoredFromVersion}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">
                              {ver.courseName}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {ver.academicYear} · {ver.modules?.length || 0} modules ·{' '}
                              {countSyllabusTopics(ver.modules || [])} topics
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-xs">
                            <div className="line-clamp-2">{ver.changeSummary || '—'}</div>
                            {ver.attachment && (
                              <a
                                href={ver.attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-[#1677FF] hover:underline mt-0.5"
                              >
                                <Paperclip className="w-3 h-3" />
                                {ver.attachment.fileName}
                              </a>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {ver.createdByName}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {new Date(ver.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <ApprovalBadge status={ver.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  setPreviewData({
                                    courseName: ver.courseName,
                                    academicYear: ver.academicYear,
                                    versionNumber: ver.versionNumber,
                                    status: ver.status,
                                    totalCourseDuration: ver.totalCourseDuration,
                                    finalAssessment: ver.finalAssessment,
                                    announcementNote: ver.announcementNote,
                                    attachment: ver.attachment,
                                    supportingResources: ver.supportingResources,
                                    modules: ver.modules || [],
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                Inspect
                              </button>
                              {canApprovePublish &&
                                (ver.status === 'Draft' ||
                                  ver.status === 'Pending Review' ||
                                  ver.status === 'Approved') && (
                                  <button
                                    disabled={busy}
                                    onClick={() => void handleApproveAndPublishVersion(ver)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                  >
                                    Publish
                                  </button>
                                )}
                              {canApprovePublish && ver.status !== 'Published' && (
                                <button
                                  disabled={busy}
                                  onClick={() => setRestoreTarget(ver)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-[#EAF1FC] dark:bg-blue-950/40 text-[#1677FF] dark:text-blue-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Restore
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: EDIT / ADD STRUCTURED MODULE                                 */}
      {/* =================================================================== */}
      {editingModule && (
        <ModuleEditorModal
          initial={editingModule}
          onClose={() => setEditingModule(null)}
          onSave={handleSaveEditedModule}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL: DELETE MODULE CONFIRMATION                                   */}
      {/* =================================================================== */}
      {deleteModuleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#101D35] dark:text-white">
                  Remove Module from Draft?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Remove <strong>{deleteModuleConfirm.title}</strong> from your working syllabus?
                  Published versions in Version History will not be affected until you publish a new revision.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModuleConfirm(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteModule}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                Remove Module
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: RESTORE VERSION CONFIRMATION                                 */}
      {/* =================================================================== */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1FC] dark:bg-blue-950/50 text-[#1677FF] flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#101D35] dark:text-white">
                  Restore Syllabus Version v{restoreTarget.versionNumber}?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  This creates a brand-new Published revision for{' '}
                  <strong>{restoreTarget.courseName}</strong> using the modules and attachment from{' '}
                  <strong>v{restoreTarget.versionNumber}</strong>. All existing versions remain archived and auditable.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmRestoreVersion()}
                className="px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Confirm Restore &amp; Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: STUDENT-FACING SYLLABUS PREVIEW                              */}
      {/* =================================================================== */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 my-8 max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-[#101D35] text-white">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-blue-300">
                  <span>STUDENT PORTAL PREVIEW</span>
                  <span>·</span>
                  <span>v{previewData.versionNumber}</span>
                  <span>·</span>
                  <span>{previewData.academicYear}</span>
                </div>
                <h2 className="text-base font-bold mt-0.5">{previewData.courseName}</h2>
              </div>
              <button
                onClick={() => setPreviewData(null)}
                className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {previewData.announcementNote && (
                <div className="p-3.5 rounded-lg border border-blue-200 bg-[#EAF1FC] text-[#101D35] text-xs">
                  <strong>Syllabus Update Notice:</strong> {previewData.announcementNote}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Duration: {previewData.totalCourseDuration || 'Standard Intake'}
                  </div>
                  <div className="text-slate-500">
                    {previewData.modules.length} Modules · {countSyllabusTopics(previewData.modules)}{' '}
                    Topics
                  </div>
                </div>
                {previewData.attachment && (
                  <a
                    href={previewData.attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {previewData.attachment.fileName}
                  </a>
                )}
              </div>

              <div className="space-y-3">
                {previewData.modules.map((mod) => (
                  <div
                    key={mod.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold text-[#101D35] dark:text-white">
                        <span className="font-mono text-[#1677FF] mr-2">
                          M{String(mod.moduleNumber).padStart(2, '0')}
                        </span>
                        {mod.title}
                      </div>
                      {mod.duration && (
                        <span className="text-[11px] font-mono text-slate-500">{mod.duration}</span>
                      )}
                    </div>
                    {mod.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">{mod.description}</p>
                    )}
                    {mod.topics.length > 0 && (
                      <div className="pt-1 space-y-1 text-xs">
                        {mod.topics.map((t) => (
                          <div key={t.id} className="text-slate-700 dark:text-slate-300">
                            • <strong>{t.title}</strong>
                            {t.subtopics.length > 0 && (
                              <span className="text-slate-500"> — {t.subtopics.join(' · ')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {previewData.finalAssessment && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs">
                  <div className="font-bold text-[#101D35] dark:text-white mb-1 flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-[#1677FF]" />
                    Final Assessment
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{previewData.finalAssessment}</p>
                </div>
              )}

              {previewData.supportingResources && previewData.supportingResources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#101D35] dark:text-white">
                    Supporting Course Resources
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previewData.supportingResources.map((r) => (
                      <a
                        key={r.fileId}
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-[#1677FF] hover:underline"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {r.fileName}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: STRUCTURED MODULE EDITOR MODAL
// =========================================================================
const ModuleEditorModal: React.FC<{
  initial: SyllabusModule;
  onClose: () => void;
  onSave: (mod: SyllabusModule) => void;
}> = ({ initial, onClose, onSave }) => {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description || '');
  const [duration, setDuration] = useState(initial.duration || '');
  const [outcomesText, setOutcomesText] = useState((initial.learningOutcomes || []).join('\n'));
  const [activitiesText, setActivitiesText] = useState(
    (initial.practicalActivities || []).join('\n')
  );
  const [assignmentsText, setAssignmentsText] = useState((initial.assignments || []).join('\n'));
  const [resourcesText, setResourcesText] = useState(
    (initial.recommendedResources || []).join('\n')
  );
  const [topics, setTopics] = useState<SyllabusTopic[]>(
    initial.topics && initial.topics.length > 0
      ? initial.topics
      : [{ id: `top_${Date.now().toString(36)}`, title: '', subtopics: [] }]
  );

  const handleAddTopic = () => {
    setTopics((prev) => [
      ...prev,
      {
        id: `top_${Date.now().toString(36)}_${prev.length + 1}`,
        title: '',
        subtopics: [],
      },
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const cleanTopics = topics
      .filter((t) => t.title.trim())
      .map((t) => ({
        id: t.id,
        title: t.title.trim().slice(0, 160),
        subtopics: t.subtopics.map((s) => s.trim()).filter(Boolean).slice(0, 20),
      }));

    onSave({
      ...initial,
      title: title.trim().slice(0, 160),
      description: description.trim().slice(0, 800),
      duration: duration.trim().slice(0, 64),
      learningOutcomes: linesToArray(outcomesText).slice(0, 15),
      topics: cleanTopics,
      practicalActivities: linesToArray(activitiesText).slice(0, 15),
      assignments: linesToArray(assignmentsText).slice(0, 15),
      recommendedResources: linesToArray(resourcesText).slice(0, 15),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 my-8 space-y-4 max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-[#101D35] dark:text-white">
            Module {String(initial.moduleNumber).padStart(2, '0')} — Structured Editor
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium mb-1">Module Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Duration</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g., 2 Weeks"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Module Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />
        </div>

        {/* Topics & Subtopics */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#101D35] dark:text-white">
              Topics &amp; Subtopics
            </label>
            <button
              type="button"
              onClick={handleAddTopic}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1677FF] hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Topic
            </button>
          </div>
          <div className="space-y-2.5">
            {topics.map((topic, idx) => (
              <div
                key={topic.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={topic.title}
                    onChange={(e) =>
                      setTopics((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, title: e.target.value } : item
                        )
                      )
                    }
                    placeholder={`Topic ${idx + 1} Title`}
                    className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                  />
                  {topics.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTopics((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={topic.subtopics.join(', ')}
                  onChange={(e) =>
                    setTopics((prev) =>
                      prev.map((item, i) =>
                        i === idx
                          ? {
                              ...item,
                              subtopics: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                          : item
                      )
                    )
                  }
                  placeholder="Subtopics (comma-separated, e.g., Prompt engineering, Evaluation, Safety)"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Learning Outcomes (one per line)
            </label>
            <textarea
              rows={3}
              value={outcomesText}
              onChange={(e) => setOutcomesText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Practical Activities / Labs (one per line)
            </label>
            <textarea
              rows={3}
              value={activitiesText}
              onChange={(e) => setActivitiesText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Assignments (one per line)</label>
            <textarea
              rows={3}
              value={assignmentsText}
              onChange={(e) => setAssignmentsText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Recommended Resources (one per line)
            </label>
            <textarea
              rows={3}
              value={resourcesText}
              onChange={(e) => setResourcesText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Apply Module Changes
          </button>
        </div>
      </form>
    </div>
  );
};
