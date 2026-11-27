import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileText,
  FolderOpen,
  Globe,
  History,
  Layers,
  Lock,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatLkr, logAuditEvent, makeSafeId, syncMissing2027Courses } from '../../lib/firestoreService';
import { invalidatePublicCatalogCache } from '../../lib/publicCache';
import { computeModuleProgressMetrics, formatFileSize } from '../../lib/syllabusEngine';
import { BRAND_IMAGES, DOMAIN_SYLLABI, INSTITUTE_INFO } from '../../data/catalogSeed';
import {
  AuditLog,
  Branch,
  Course,
  Enrollment,
  Lesson,
  LibraryResource,
  ModuleProgressRecord,
  SyllabusRecord,
  SyllabusVersionRecord,
  UserProfile,
} from '../../types/lms';
import { EmptyState, StatusLabel } from '../common/PlatformWidgets';

async function compressCourseImageToDataUrl(file: File, maxWidth: number): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload a valid image file (PNG, JPG, or WebP).');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode uploaded image.'));
      el.src = objectUrl;
    });
    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas image processing unavailable.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 220000 && quality > 0.35) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    if (dataUrl.length > 235000) {
      throw new Error('Image is still too large after compression. Please choose a smaller image.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function slugifyCourseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/–|—/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

interface AcademicsProps {
  mode: 'courses' | 'lms' | 'library';
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  branches?: Branch[];
  auditLogs?: AuditLog[];
  libraryResources: LibraryResource[];
  enrollments?: Enrollment[];
  syllabuses?: SyllabusRecord[];
  syllabusVersions?: SyllabusVersionRecord[];
  moduleProgress?: ModuleProgressRecord[];
  onNavigateTab?: (tab: string) => void;
  onRefreshData: () => Promise<void>;
}

export const AcademicsAndLMS: React.FC<AcademicsProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  courses,
  branches = [],
  auditLogs = [],
  libraryResources,
  enrollments = [],
  syllabuses = [],
  syllabusVersions = [],
  moduleProgress = [],
  onNavigateTab,
  onRefreshData,
}) => {
  const canManageCourses = isOwner || ['ADMIN', 'ACADEMIC_MANAGER'].includes(profile.role);
  const canManageLessons = canManageCourses || profile.role === 'LECTURER';
  const isStudent = profile.role === 'STUDENT';

  const myActiveEnrollments = useMemo(
    () => enrollments.filter((e) => e.userId === profile.uid && e.status !== 'suspended'),
    [enrollments, profile.uid]
  );
  const enrolledCourseIds = useMemo(
    () => new Set(myActiveEnrollments.map((e) => e.courseId)),
    [myActiveEnrollments]
  );

  // Course CRUD Modal State
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<'All' | 'Certificate' | 'Diploma' | 'Free'>('All');
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [previewingCourse, setPreviewingCourse] = useState<Course | null>(null);
  const [historyCourse, setHistoryCourse] = useState<Course | null>(null);
  const [courseToast, setCourseToast] = useState<string | null>(null);
  const [savingCourse, setSavingCourse] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [uploadingMediaField, setUploadingMediaField] = useState<'imageUrl' | 'bannerUrl' | null>(null);

  // LMS Video / Lesson & Syllabus State
  const [activeCourseId, setActiveCourseId] = useState<string>(
    myActiveEnrollments[0]?.courseId || courses[0]?.id || ''
  );
  const [lmsSubTab, setLmsSubTab] = useState<'syllabus' | 'lessons'>('syllabus');
  const [expandedModuleIds, setExpandedModuleIds] = useState<Record<string, boolean>>({});
  const [savingProgressKey, setSavingProgressKey] = useState<string | null>(null);
  const [localProgressMap, setLocalProgressMap] = useState<Record<string, ModuleProgressRecord>>({});

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [addingLesson, setAddingLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonModule, setNewLessonModule] = useState('Module 01');
  const [newLessonType, setNewLessonType] = useState<'video' | 'live' | 'pdf' | 'audio' | 'reading'>('video');
  const [newLessonSummary, setNewLessonSummary] = useState('');
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState('');

  // Digital Library State
  const [libSearch, setLibSearch] = useState('');
  const [showLibModal, setShowLibModal] = useState(false);
  const [libTitle, setLibTitle] = useState('');
  const [libCategory, setLibCategory] = useState('Artificial Intelligence');
  const [libType, setLibType] = useState<LibraryResource['resourceType']>('PDF Notes');
  const [libUrl, setLibUrl] = useState('');
  const [libSummary, setLibSummary] = useState('');
  const [libAccess, setLibAccess] = useState<'public' | 'enrolled'>('enrolled');

  useEffect(() => {
    const map: Record<string, ModuleProgressRecord> = {};
    for (const rec of moduleProgress) {
      if (rec.userId === profile.uid) {
        map[rec.courseId] = rec;
      }
    }
    setLocalProgressMap(map);
  }, [moduleProgress, profile.uid]);

  useEffect(() => {
    if (!activeCourseId && courses.length > 0) {
      setActiveCourseId(myActiveEnrollments[0]?.courseId || courses[0].id);
    }
  }, [courses, activeCourseId, myActiveEnrollments]);

  useEffect(() => {
    if (mode !== 'lms' || !activeCourseId) return;
    const loadLessonsAndProgress = async () => {
      try {
        const lq = isOwner
          ? collection(db, 'courses', activeCourseId, 'lessons')
          : query(collection(db, 'courses', activeCourseId, 'lessons'), where('published', '==', true));
        const snap = await getDocs(lq);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Lesson, 'id'>) }))
          .sort((a, b) => a.orderIndex - b.orderIndex);
        setLessons(list);
        setActiveLesson(list[0] || null);

        const pq = query(
          collection(db, 'learningProgress'),
          where('userId', '==', profile.uid)
        );
        const pSnap = await getDocs(pq);
        const done = new Set<string>();
        pSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.courseId === activeCourseId && data.completed) {
            done.add(data.lessonId);
          }
        });
        setCompletedLessonIds(done);
      } catch (err) {
        console.warn('Unable to fetch lessons:', err);
      }
    };
    void loadLessonsAndProgress();
  }, [mode, activeCourseId, isOwner, profile.uid]);

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    const trimmedName = editingCourse.name.trim();
    const trimmedCode = editingCourse.code.trim();
    const computedSlug = (editingCourse.slug?.trim() || slugifyCourseName(trimmedName)).slice(0, 140);

    // Duplicate prevention check (matches by normalized name, code, or slug on other records)
    const normName = trimmedName.toLowerCase();
    const normCode = trimmedCode.toLowerCase();
    const normSlug = computedSlug.toLowerCase();
    const duplicate = courses.find((c) => {
      if (editingCourse.id && c.id === editingCourse.id) return false;
      return (
        c.name.trim().toLowerCase() === normName ||
        c.code.trim().toLowerCase() === normCode ||
        (c.slug && c.slug.trim().toLowerCase() === normSlug)
      );
    });
    if (duplicate) {
      setCourseToast(
        `Duplicate prevented: "${duplicate.name}" (${duplicate.code}) already exists in the catalogue.`
      );
      return;
    }

    setSavingCourse(true);
    try {
      const id = editingCourse.id || makeSafeId('CRS').toLowerCase();
      const feeVal = editingCourse.isFree ? 0 : Math.max(0, Number(editingCourse.courseFeeLkr) || 0);
      const feeConfigured = editingCourse.isFree
        ? true
        : editingCourse.feeConfigured !== undefined
          ? Boolean(editingCourse.feeConfigured)
          : feeVal > 0;
      const cleanOutcomes = (editingCourse.learningOutcomes || [])
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const cleanTopics = (editingCourse.syllabusTopics || [])
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30);
      const cleanBranchIds = (editingCourse.branchIds || []).filter(Boolean).slice(0, 20);

      await setDoc(
        doc(db, 'courses', id),
        {
          code: trimmedCode.slice(0, 32),
          slug: computedSlug,
          name: trimmedName.slice(0, 160),
          category: editingCourse.category,
          domain: (editingCourse.domain || 'IT & Technology').slice(0, 64),
          description: (editingCourse.description || '').slice(0, 1200),
          imageUrl: (editingCourse.imageUrl || '').slice(0, 240000),
          bannerUrl: (editingCourse.bannerUrl || '').slice(0, 240000),
          level: (editingCourse.level || editingCourse.category).slice(0, 40),
          duration: (editingCourse.duration.trim() || 'Pending Admin Setup').slice(0, 64),
          mode: editingCourse.mode,
          isFree: Boolean(editingCourse.isFree),
          feeConfigured,
          currency: (editingCourse.currency || 'LKR').slice(0, 12),
          featured: Boolean(editingCourse.featured),
          courseFeeLkr: feeVal,
          registrationFeeLkr: Math.max(0, Number(editingCourse.registrationFeeLkr) || 0),
          certificateFeeLkr: Math.max(0, Number(editingCourse.certificateFeeLkr) || 0),
          installmentPlan: (editingCourse.installmentPlan || (editingCourse.isFree ? 'FREE Programme' : 'Pending Admin Setup')).slice(0, 120),
          courseLanguage: (editingCourse.courseLanguage || 'Pending Admin Setup').slice(0, 64),
          branchIds: cleanBranchIds,
          admissionStatus: editingCourse.admissionStatus || 'open',
          academicYear: (editingCourse.academicYear || '2027').slice(0, 16),
          lecturerName: (editingCourse.lecturerName || 'Pending Admin Setup').slice(0, 120),
          batchName: (editingCourse.batchName || 'Pending Admin Setup').slice(0, 80),
          startDate: (editingCourse.startDate || 'Pending Admin Setup').slice(0, 32),
          endDate: (editingCourse.endDate || 'Pending Admin Setup').slice(0, 32),
          maxStudents: Math.max(1, Number(editingCourse.maxStudents) || 45),
          entryRequirements: (editingCourse.entryRequirements || 'Pending Admin Setup').slice(0, 400),
          learningOutcomes: cleanOutcomes,
          syllabusTopics: cleanTopics,
          certificateEligible: editingCourse.certificateEligible !== false,
          status: editingCourse.status,
          institutionId: INSTITUTE_INFO.institutionId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: editingCourse.id ? 'UPDATE_COURSE' : 'CREATE_COURSE',
        targetType: 'courses',
        targetId: id,
        details: `Saved ${trimmedName} (${trimmedCode}) · Status: ${editingCourse.status} · Admissions: ${editingCourse.admissionStatus || 'open'} · Fee: ${editingCourse.isFree ? 'FREE' : feeConfigured ? `LKR ${feeVal}` : 'Pending Admin Setup'}`,
      });
      invalidatePublicCatalogCache();
      setEditingCourse(null);
      setCourseToast(`Saved course "${trimmedName}". Public catalogue cache refreshed.`);
      await onRefreshData();
    } finally {
      setSavingCourse(false);
    }
  };

  const handleToggleCoursePublish = async (course: Course) => {
    if (!canManageCourses) return;
    setSavingCourse(true);
    try {
      const nextStatus: Course['status'] = course.status === 'published' ? 'draft' : 'published';
      await updateDoc(doc(db, 'courses', course.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: nextStatus === 'published' ? 'PUBLISH_COURSE' : 'UNPUBLISH_COURSE',
        targetType: 'courses',
        targetId: course.id,
        details: `${nextStatus === 'published' ? 'Published' : 'Unpublished (draft)'} course ${course.code} — ${course.name}`,
      });
      invalidatePublicCatalogCache();
      setCourseToast(
        nextStatus === 'published'
          ? `Published "${course.name}" to the public website.`
          : `Unpublished "${course.name}" (hidden from public visitors).`
      );
      await onRefreshData();
    } finally {
      setSavingCourse(false);
    }
  };

  const handleToggleAdmissions = async (course: Course) => {
    if (!canManageCourses) return;
    setSavingCourse(true);
    try {
      const nextAdmission: NonNullable<Course['admissionStatus']> =
        course.admissionStatus === 'closed' ? 'open' : 'closed';
      await updateDoc(doc(db, 'courses', course.id), {
        admissionStatus: nextAdmission,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'TOGGLE_COURSE_ADMISSIONS',
        targetType: 'courses',
        targetId: course.id,
        details: `Set admissions to ${nextAdmission.toUpperCase()} for ${course.code} — ${course.name}`,
      });
      invalidatePublicCatalogCache();
      setCourseToast(
        `Admissions ${nextAdmission === 'open' ? 'activated' : 'closed'} for "${course.name}".`
      );
      await onRefreshData();
    } finally {
      setSavingCourse(false);
    }
  };

  const handleSync40Courses = async () => {
    if (!canManageCourses) return;
    setSyncingCatalog(true);
    try {
      const result = await syncMissing2027Courses(profile.uid, userEmail);
      invalidatePublicCatalogCache();
      setCourseToast(
        result.addedCount > 0
          ? `2027 Catalogue Sync Complete: Added ${result.addedCount} missing unique course(s); preserved ${result.skippedCount} existing record(s).`
          : `All 40 official 2027 courses are already synced (${result.skippedCount} verified, 0 duplicates added).`
      );
      await onRefreshData();
    } catch (err) {
      setCourseToast(
        err instanceof Error ? `Sync error: ${err.message}` : 'Failed to sync 2027 course catalogue.'
      );
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleUploadCourseMedia = async (field: 'imageUrl' | 'bannerUrl', file: File) => {
    if (!editingCourse) return;
    setUploadingMediaField(field);
    try {
      const maxWidth = field === 'bannerUrl' ? 1200 : 800;
      const dataUrl = await compressCourseImageToDataUrl(file, maxWidth);
      setEditingCourse({ ...editingCourse, [field]: dataUrl });
      setCourseToast(
        `${field === 'bannerUrl' ? 'Banner' : 'Thumbnail'} image uploaded and optimized (${Math.round(dataUrl.length / 1024)} KB). Click Save Course to apply.`
      );
    } catch (err) {
      setCourseToast(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingMediaField(null);
    }
  };

  const handleDuplicateCourseAsDraft = async (source: Course) => {
    if (!canManageCourses) return;
    setSavingCourse(true);
    try {
      const newId = makeSafeId('CRS').toLowerCase();
      const copyCode = `${source.code}-COPY`.slice(0, 32);
      const copyName = `${source.name} (Draft Copy)`.slice(0, 160);
      const { id: _omitId, ...restSource } = source;
      void _omitId;
      await setDoc(doc(db, 'courses', newId), {
        ...restSource,
        code: copyCode,
        slug: slugifyCourseName(`${source.slug || source.name}-copy-${newId.slice(-4)}`),
        name: copyName,
        status: 'draft',
        institutionId: INSTITUTE_INFO.institutionId,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'DUPLICATE_COURSE',
        targetType: 'courses',
        targetId: newId,
        details: `Duplicated ${source.code} as draft ${copyCode}`,
      });
      invalidatePublicCatalogCache();
      setCourseToast(`Duplicated "${source.name}" as a draft.`);
      await onRefreshData();
    } finally {
      setSavingCourse(false);
    }
  };

  const handleDeleteCourseConfirmed = async () => {
    if (!deletingCourse || !isOwner) return;
    setSavingCourse(true);
    try {
      await deleteDoc(doc(db, 'courses', deletingCourse.id));
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'DELETE_COURSE',
        targetType: 'courses',
        targetId: deletingCourse.id,
        details: `Deleted course ${deletingCourse.code} — ${deletingCourse.name}`,
      });
      invalidatePublicCatalogCache();
      setCourseToast(`Deleted course "${deletingCourse.name}".`);
      setDeletingCourse(null);
      await onRefreshData();
    } finally {
      setSavingCourse(false);
    }
  };

  const handleExportCourses = (format: 'json' | 'xlsx') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(courses, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TECHMAN_2027_Courses_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const rows = courses.map((c) => ({
      Code: c.code,
      Name: c.name,
      Category: c.category,
      Domain: c.domain,
      Duration: c.duration,
      Mode: c.mode,
      Free: c.isFree ? 'YES' : 'NO',
      FeeConfigured: c.feeConfigured === false ? 'NO' : 'YES',
      CourseFeeLKR: c.courseFeeLkr,
      RegistrationFeeLKR: c.registrationFeeLkr,
      CertificateFeeLKR: c.certificateFeeLkr,
      Status: c.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '2027_Courses');
    XLSX.writeFile(wb, `TECHMAN_2027_Courses_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportCoursesFile = async (file: File) => {
    if (!canManageCourses) return;
    setSavingCourse(true);
    try {
      let incoming: Array<Record<string, unknown>> = [];
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(await file.text());
        incoming = Array.isArray(parsed) ? parsed : [];
      } else {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        incoming = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      }
      const existingByCode = new Map(courses.map((c) => [c.code.toLowerCase(), c]));
      const existingByName = new Map(courses.map((c) => [c.name.toLowerCase(), c]));
      let created = 0;
      let skipped = 0;
      for (const raw of incoming) {
        const name = String(raw.name || raw.Name || '').trim();
        const code = String(raw.code || raw.Code || makeSafeId('TM').slice(0, 10)).trim();
        if (!name || existingByCode.has(code.toLowerCase()) || existingByName.has(name.toLowerCase())) {
          skipped += 1;
          continue;
        }
        const category = String(raw.category || raw.Category || 'Certificate').toLowerCase().includes('diploma')
          ? 'Diploma'
          : 'Certificate';
        const isFreeVal = Boolean(raw.isFree) || String(raw.Free || '').toUpperCase() === 'YES';
        const feeVal = isFreeVal ? 0 : Math.max(0, Number(raw.courseFeeLkr ?? raw.CourseFeeLKR ?? 0) || 0);
        const docId = makeSafeId('CRS').toLowerCase();
        await setDoc(doc(db, 'courses', docId), {
          code: code.slice(0, 32),
          slug: slugifyCourseName(name),
          name: name.slice(0, 160),
          category,
          domain: String(raw.domain || raw.Domain || 'IT & Technology').slice(0, 64),
          description: String(raw.description || raw.Description || `${name} programme at TECHMAN COLLEGE ONLINE.`).slice(0, 1200),
          duration: String(raw.duration || raw.Duration || 'Pending Admin Setup').slice(0, 64),
          mode: ['Online', 'Physical', 'Hybrid'].includes(String(raw.mode || raw.Mode))
            ? String(raw.mode || raw.Mode)
            : 'Hybrid',
          isFree: isFreeVal,
          feeConfigured: isFreeVal || feeVal > 0,
          courseFeeLkr: feeVal,
          registrationFeeLkr: Math.max(0, Number(raw.registrationFeeLkr ?? raw.RegistrationFeeLKR ?? 0) || 0),
          certificateFeeLkr: Math.max(0, Number(raw.certificateFeeLkr ?? raw.CertificateFeeLKR ?? 0) || 0),
          courseLanguage: 'Pending Admin Setup',
          entryRequirements: 'Pending Admin Setup',
          admissionStatus: 'open',
          academicYear: '2027',
          status: 'draft',
          institutionId: INSTITUTE_INFO.institutionId,
          updatedAt: new Date().toISOString(),
        });
        created += 1;
      }
      invalidatePublicCatalogCache();
      setCourseToast(`Course import complete: ${created} added as drafts, ${skipped} duplicates skipped.`);
      await onRefreshData();
    } catch (err) {
      setCourseToast(err instanceof Error ? `Import error: ${err.message}` : 'Course import failed.');
    } finally {
      setSavingCourse(false);
    }
  };

  const handleToggleLessonComplete = async (lesson: Lesson) => {
    const progressId = `${profile.uid}_${lesson.courseId}_${lesson.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
    const nextDone = !completedLessonIds.has(lesson.id);
    await setDoc(
      doc(db, 'learningProgress', progressId),
      {
        userId: profile.uid,
        courseId: lesson.courseId,
        lessonId: lesson.id,
        completed: nextDone,
        lastPositionSec: nextDone ? (lesson.durationMinutes || 30) * 60 : 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    const nextSet = new Set(completedLessonIds);
    if (nextDone) {
      nextSet.add(lesson.id);
      // Award verified XP for lesson completion
      const nextXp = (profile.xpPoints ?? 0) + 50;
      await updateDoc(doc(db, 'users', profile.uid), {
        xpPoints: nextXp,
        level: Math.floor(nextXp / 250) + 1,
        updatedAt: new Date().toISOString(),
      });
    } else {
      nextSet.delete(lesson.id);
    }
    setCompletedLessonIds(nextSet);
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourseId || !newLessonTitle.trim()) return;
    const lessonId = makeSafeId('LSN').toLowerCase();
    const newLesson: Lesson = {
      id: lessonId,
      courseId: activeCourseId,
      moduleTitle: newLessonModule.trim().slice(0, 140),
      title: newLessonTitle.trim().slice(0, 160),
      type: newLessonType,
      durationMinutes: 40,
      orderIndex: lessons.length + 1,
      videoUrl: newLessonVideoUrl.trim().slice(0, 500),
      summary: newLessonSummary.trim().slice(0, 2000),
      published: true,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'courses', activeCourseId, 'lessons', lessonId), newLesson);
    setLessons((prev) => [...prev, newLesson]);
    setActiveLesson(newLesson);
    setNewLessonTitle('');
    setNewLessonSummary('');
    setNewLessonVideoUrl('');
    setAddingLesson(false);
  };

  const handleAddLibraryResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libTitle.trim()) return;
    const id = makeSafeId('LIB');
    await setDoc(doc(db, 'libraryResources', id), {
      title: libTitle.trim().slice(0, 160),
      category: libCategory.slice(0, 64),
      resourceType: libType,
      version: 'v1.0',
      url: libUrl.trim().slice(0, 500),
      summary: libSummary.trim().slice(0, 600),
      accessLevel: libAccess,
      uploadedBy: profile.uid,
      updatedAt: new Date().toISOString(),
    });
    setLibTitle('');
    setLibUrl('');
    setLibSummary('');
    setShowLibModal(false);
    await onRefreshData();
  };

  // Explicit student syllabus item completion toggle.
  // Opening or downloading a syllabus PDF NEVER calls this function.
  const handleToggleSyllabusItem = async (
    courseId: string,
    syllabus: SyllabusRecord,
    publishedVersion: SyllabusVersionRecord,
    itemType: 'module' | 'topic' | 'activity' | 'assignment',
    itemId: string
  ) => {
    const toggleKey = `${itemType}:${itemId}`;
    setSavingProgressKey(toggleKey);
    try {
      const existing = localProgressMap[courseId];
      const modSet = new Set(existing?.completedModuleIds || []);
      const topicSet = new Set(existing?.completedTopicIds || []);
      const actSet = new Set(existing?.completedActivityIds || []);
      const assignSet = new Set(existing?.completedAssignmentIds || []);

      const targetSet =
        itemType === 'module'
          ? modSet
          : itemType === 'topic'
          ? topicSet
          : itemType === 'activity'
          ? actSet
          : assignSet;

      if (targetSet.has(itemId)) {
        targetSet.delete(itemId);
      } else {
        targetSet.add(itemId);
      }

      const completedModuleIds = Array.from(modSet).slice(0, 100);
      const completedTopicIds = Array.from(topicSet).slice(0, 500);
      const completedActivityIds = Array.from(actSet).slice(0, 300);
      const completedAssignmentIds = Array.from(assignSet).slice(0, 300);

      const metrics = computeModuleProgressMetrics(publishedVersion.modules || [], {
        completedModuleIds,
        completedTopicIds,
        completedActivityIds,
        completedAssignmentIds,
      });

      const progressDocId = `${profile.uid}_${courseId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      const now = new Date().toISOString();

      const payload: ModuleProgressRecord = {
        id: progressDocId,
        userId: profile.uid,
        courseId,
        syllabusId: syllabus.syllabusId,
        versionNumber: publishedVersion.versionNumber,
        completedModuleIds,
        completedTopicIds,
        completedActivityIds,
        completedAssignmentIds,
        totalTrackableItems: metrics.totalTrackableItems,
        completedTrackableItems: metrics.completedTrackableItems,
        progressPercent: metrics.progressPercent,
        institutionId: INSTITUTE_INFO.institutionId,
        updatedAt: now,
      };

      const { id: _ignoreId, ...firestoreData } = payload;
      await setDoc(doc(db, 'moduleProgress', progressDocId), firestoreData, { merge: true });

      setLocalProgressMap((prev) => ({
        ...prev,
        [courseId]: payload,
      }));

      // Sync overall progressPercent onto the student's matching enrollment doc if present
      const matchingEnrollment = myActiveEnrollments.find((e) => e.courseId === courseId);
      if (matchingEnrollment) {
        await updateDoc(doc(db, 'enrollments', matchingEnrollment.id), {
          progressPercent: metrics.progressPercent,
        }).catch(() => {
          // Ignore if enrollment doc is not writable in a preview context
        });
      }
    } finally {
      setSavingProgressKey(null);
    }
  };

  // MODE 1: COURSE MANAGEMENT (EDITABLE 40-COURSE 2027 CATALOG)
  if (mode === 'courses') {
    const distinctDomains = Array.from(new Set(courses.map((c) => c.domain).filter(Boolean))).sort();
    const filtered = courses.filter((c) => {
      if (catFilter === 'Certificate' && c.category !== 'Certificate') return false;
      if (catFilter === 'Diploma' && c.category !== 'Diploma') return false;
      if (catFilter === 'Free' && !c.isFree) return false;
      if (domainFilter !== 'All' && c.domain !== domainFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              2027 Course Catalogue &amp; Management ({courses.length})
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Manage all Certificate, Diploma, and Free programmes, configure LKR fees &amp; durations, and export or import courses.
            </p>
          </div>
          {canManageCourses && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncingCatalog}
                onClick={() => void handleSync40Courses()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1677FF]/40 bg-[#EAF1FC] dark:bg-blue-950/40 text-[#101D35] dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-950/70 text-xs font-semibold cursor-pointer disabled:opacity-60"
                title="Safely insert any missing unique records from the 40-course 2027 catalogue without overwriting existing courses"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#1677FF] ${syncingCatalog ? 'animate-spin' : ''}`} />
                {syncingCatalog ? 'Syncing 40 Courses...' : 'Sync 40-Course 2027 Catalogue'}
              </button>
              <button
                type="button"
                onClick={() => handleExportCourses('xlsx')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => handleExportCourses('json')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#1677FF]" />
                Import
                <input
                  type="file"
                  accept=".json,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportCoursesFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('syllabus-list')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5 text-[#1677FF]" />
                  Syllabuses
                </button>
              )}
              <button
                onClick={() =>
                  setEditingCourse({
                    id: '',
                    code: `TM-27-${String(courses.length + 1).padStart(2, '0')}`,
                    slug: '',
                    name: '',
                    category: 'Certificate',
                    domain: 'IT & Technology',
                    description: '',
                    duration: 'Pending Admin Setup',
                    mode: 'Hybrid',
                    isFree: false,
                    feeConfigured: false,
                    featured: false,
                    courseFeeLkr: 0,
                    registrationFeeLkr: 0,
                    certificateFeeLkr: 0,
                    installmentPlan: 'Pending Admin Setup',
                    courseLanguage: 'Pending Admin Setup',
                    branchIds: branches.map((b) => b.id),
                    admissionStatus: 'open',
                    academicYear: '2027',
                    lecturerName: 'Pending Admin Setup',
                    batchName: 'Pending Admin Setup',
                    startDate: 'Pending Admin Setup',
                    endDate: 'Pending Admin Setup',
                    entryRequirements: 'Pending Admin Setup',
                    learningOutcomes: [],
                    maxStudents: 45,
                    syllabusTopics: DOMAIN_SYLLABI['IT & Technology'] || [],
                    certificateEligible: true,
                    status: 'draft',
                    institutionId: INSTITUTE_INFO.institutionId,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                New Course
              </button>
            </div>
          )}
        </div>

        {courseToast && (
          <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between gap-3">
            <span>{courseToast}</span>
            <button onClick={() => setCourseToast(null)} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courses by name, code, or subject category..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
            >
              <option value="All">All Subject Categories</option>
              {distinctDomains.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 self-start">
            {(['All', 'Certificate', 'Diploma', 'Free'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  catFilter === cat
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {cat === 'Free' ? `Free (${courses.filter((c) => c.isFree).length})` : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Code</th>
                  <th className="py-3 px-4 font-medium">Programme</th>
                  <th className="py-3 px-4 font-medium">Category · Mode</th>
                  <th className="py-3 px-4 font-medium">Duration</th>
                  <th className="py-3 px-4 font-medium text-right">Course Fee (LKR)</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canManageCourses && <th className="py-3 px-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {course.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{course.name}</span>
                        {course.isFree && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold">
                            FREE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {course.domain} · {(course.syllabusTopics || []).length} syllabus modules
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {course.category} · {course.mode}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {course.duration}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right font-semibold whitespace-nowrap">
                      {course.isFree ? (
                        <span className="text-emerald-700 dark:text-emerald-400">FREE</span>
                      ) : course.feeConfigured === false ? (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 text-[11px] font-sans font-semibold">
                          Pending Admin Setup
                        </span>
                      ) : (
                        <span className="text-slate-900 dark:text-white">{formatLkr(course.courseFeeLkr)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <StatusLabel status={course.status} />
                        {canManageCourses && (
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              disabled={savingCourse}
                              onClick={() => void handleToggleCoursePublish(course)}
                              className="underline text-[#1677FF] hover:text-blue-700 font-medium cursor-pointer"
                            >
                              {course.status === 'published' ? 'Unpublish' : 'Publish'}
                            </button>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <button
                              type="button"
                              disabled={savingCourse}
                              onClick={() => void handleToggleAdmissions(course)}
                              className={`font-medium cursor-pointer ${
                                course.admissionStatus === 'closed'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {course.admissionStatus === 'closed' ? 'Admissions Closed' : 'Admissions Active'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    {canManageCourses && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewingCourse(course)}
                            title="Preview Public Course Page"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryCourse(course)}
                            title="View Course Change & Version History"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          {onNavigateTab && (
                            <button
                              type="button"
                              onClick={() => onNavigateTab('poster-generator')}
                              title="Open AI Poster Generator"
                              className="p-1.5 rounded-lg border border-blue-200 dark:border-blue-900 text-[#1677FF] hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingCourse(course)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={savingCourse}
                            onClick={() => void handleDuplicateCourseAsDraft(course)}
                            title="Duplicate as Draft"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => setDeletingCourse(course)}
                              title="Delete Course (Super Admin)"
                              className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deletingCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Course "{deletingCourse.name}"?
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                This permanently removes course record <span className="font-mono font-semibold">{deletingCourse.code}</span> from the catalogue. Existing student applications and issued certificates remain intact.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingCourse(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingCourse}
                  onClick={() => void handleDeleteCourseConfirmed()}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingCourse ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit / Create Course Modal */}
        {editingCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
            <form
              onSubmit={handleSaveCourse}
              className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 my-8 space-y-4 max-h-[88vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-bold text-[#0F172A] dark:text-white">
                  {editingCourse.id ? 'Edit Course & Fees' : 'Create New 2027 Course'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="p-1 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Course Code *</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.code}
                    onChange={(e) => setEditingCourse({ ...editingCourse, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1">Course Name *</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.name}
                    onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <select
                    value={editingCourse.category}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        category: e.target.value as 'Certificate' | 'Diploma',
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="Certificate">Certificate</option>
                    <option value="Diploma">Diploma</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Learning Mode</label>
                  <select
                    value={editingCourse.mode}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        mode: e.target.value as 'Online' | 'Physical' | 'Hybrid',
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="Online">Online</option>
                    <option value="Physical">Physical</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    value={editingCourse.status}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        status: e.target.value as 'published' | 'draft' | 'archived',
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Course Fee (LKR)</label>
                  <input
                    type="number"
                    min={0}
                    disabled={Boolean(editingCourse.isFree)}
                    value={editingCourse.isFree ? 0 : editingCourse.courseFeeLkr}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditingCourse({
                        ...editingCourse,
                        courseFeeLkr: val,
                        feeConfigured: val > 0 ? true : editingCourse.feeConfigured,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Registration (LKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingCourse.registrationFeeLkr ?? 0}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        registrationFeeLkr: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Certificate (LKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingCourse.certificateFeeLkr ?? 0}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        certificateFeeLkr: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Duration *</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.duration}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, duration: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingCourse.isFree)}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        isFree: e.target.checked,
                        courseFeeLkr: e.target.checked ? 0 : editingCourse.courseFeeLkr,
                        feeConfigured: e.target.checked ? true : editingCourse.feeConfigured,
                      })
                    }
                  />
                  Official FREE Programme
                </label>
                <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={Boolean(editingCourse.isFree)}
                    checked={editingCourse.isFree ? true : editingCourse.feeConfigured !== false}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        feeConfigured: e.target.checked,
                      })
                    }
                  />
                  Fee Officially Configured
                </label>
                <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingCourse.featured)}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, featured: e.target.checked })
                    }
                  />
                  Featured on Portal
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">URL Slug</label>
                  <input
                    type="text"
                    value={editingCourse.slug || ''}
                    onChange={(e) => setEditingCourse({ ...editingCourse, slug: e.target.value })}
                    placeholder={slugifyCourseName(editingCourse.name || 'course-slug')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Medium / Language</label>
                  <input
                    type="text"
                    value={editingCourse.courseLanguage || ''}
                    onChange={(e) => setEditingCourse({ ...editingCourse, courseLanguage: e.target.value })}
                    placeholder="Pending Admin Setup"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Admission Status</label>
                  <select
                    value={editingCourse.admissionStatus || 'open'}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        admissionStatus: e.target.value as NonNullable<Course['admissionStatus']>,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  >
                    <option value="open">Admissions Open</option>
                    <option value="closing_soon">Closing Soon</option>
                    <option value="upcoming">Upcoming Intake</option>
                    <option value="closed">Admissions Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Academic Year</label>
                  <input
                    type="text"
                    value={editingCourse.academicYear || '2027'}
                    onChange={(e) => setEditingCourse({ ...editingCourse, academicYear: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium">Course Thumbnail / Poster</label>
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1677FF] hover:underline cursor-pointer">
                      <Upload className="w-3 h-3" />
                      {uploadingMediaField === 'imageUrl' ? 'Optimizing...' : 'Upload Image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUploadCourseMedia('imageUrl', f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={editingCourse.imageUrl || ''}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, imageUrl: e.target.value })
                    }
                    placeholder="/assets/... or upload image"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium">Course Banner Image</label>
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1677FF] hover:underline cursor-pointer">
                      <Upload className="w-3 h-3" />
                      {uploadingMediaField === 'bannerUrl' ? 'Optimizing...' : 'Upload Banner'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUploadCourseMedia('bannerUrl', f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={editingCourse.bannerUrl || ''}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, bannerUrl: e.target.value })
                    }
                    placeholder="/assets/... or upload banner"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              {branches.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-medium mb-2">Available Campus Branches</div>
                  <div className="flex flex-wrap gap-3">
                    {branches.map((br) => {
                      const checked = (editingCourse.branchIds || []).includes(br.id);
                      return (
                        <label key={br.id} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const current = new Set(editingCourse.branchIds || []);
                              if (e.target.checked) current.add(br.id);
                              else current.delete(br.id);
                              setEditingCourse({ ...editingCourse, branchIds: Array.from(current) });
                            }}
                          />
                          <span>{br.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1">Course Description</label>
                <textarea
                  rows={2}
                  value={editingCourse.description || ''}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Entry Requirements</label>
                  <textarea
                    rows={3}
                    value={editingCourse.entryRequirements || ''}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, entryRequirements: e.target.value })
                    }
                    placeholder="Pending Admin Setup"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Learning Outcomes (one per line)</label>
                  <textarea
                    rows={3}
                    value={(editingCourse.learningOutcomes || []).join('\n')}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        learningOutcomes: e.target.value.split('\n'),
                      })
                    }
                    placeholder="Enter each verified learning outcome on a new line"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium">
                    Editable Syllabus Topics (one per line)
                  </label>
                  <select
                    value={editingCourse.domain || ''}
                    onChange={(e) => {
                      const dom = e.target.value;
                      setEditingCourse({
                        ...editingCourse,
                        domain: dom,
                        syllabusTopics: DOMAIN_SYLLABI[dom] || editingCourse.syllabusTopics,
                      });
                    }}
                    className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {Object.keys(DOMAIN_SYLLABI).map((d) => (
                      <option key={d} value={d}>
                        Template: {d}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={5}
                  value={(editingCourse.syllabusTopics || []).join('\n')}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      syllabusTopics: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCourse}
                  className="px-5 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {savingCourse ? 'Saving...' : 'Save Course'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Public Course Page Preview Modal */}
        {previewingCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto">
            <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
              <div className="bg-[#101D35] text-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-300 mb-1">
                      Public Website Preview · https://techmancollege.online/courses/{previewingCourse.slug || previewingCourse.id}
                    </div>
                    <h2 className="text-xl font-bold">{previewingCourse.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-blue-100">
                      <span>{previewingCourse.category}</span>
                      <span>·</span>
                      <span>{previewingCourse.domain || 'General'}</span>
                      <span>·</span>
                      <span>{previewingCourse.mode}</span>
                      <span>·</span>
                      <span>{previewingCourse.duration || 'Pending Admin Setup'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewingCourse(null)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[#EAF1FC] dark:bg-slate-800 border border-blue-200 dark:border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Public Visibility: </span>
                    <strong className={previewingCourse.status === 'published' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}>
                      {previewingCourse.status === 'published' ? 'Published (Visible Publicly)' : `${previewingCourse.status.toUpperCase()} (Hidden from Public)`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Tuition Fee: </span>
                    <strong className="text-[#101D35] dark:text-white">
                      {previewingCourse.isFree
                        ? 'FREE (100% Free Tuition)'
                        : previewingCourse.feeConfigured === false
                          ? 'Pending Admin Setup'
                          : formatLkr(previewingCourse.courseFeeLkr)}
                    </strong>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Course Overview</h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {previewingCourse.description || 'Pending Admin Setup'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-500">Medium</div>
                    <div className="font-semibold mt-0.5">{previewingCourse.courseLanguage || 'Pending Admin Setup'}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-500">Admissions</div>
                    <div className="font-semibold mt-0.5 uppercase">{previewingCourse.admissionStatus || 'open'}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-500">Academic Year</div>
                    <div className="font-semibold mt-0.5">{previewingCourse.academicYear || '2027'}</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Entry Requirements</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {previewingCourse.entryRequirements || 'Pending Admin Setup'}
                  </p>
                </div>
                {(previewingCourse.learningOutcomes || []).length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Learning Outcomes</h3>
                    <ul className="list-disc pl-5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      {(previewingCourse.learningOutcomes || []).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(previewingCourse.syllabusTopics || []).length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Syllabus Outline ({(previewingCourse.syllabusTopics || []).length} topics)
                    </h3>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                      {(previewingCourse.syllabusTopics || []).slice(0, 8).map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-mono text-[#1677FF]">{String(i + 1).padStart(2, '0')}</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/50">
                <a
                  href={`/courses/${previewingCourse.slug || previewingCourse.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Open Live Route
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewingCourse(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Course Change & Version History Modal */}
        {historyCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto">
            <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                    Course Change &amp; Version History
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {historyCourse.code} — {historyCourse.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryCourse(null)}
                  className="p-1 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2.5">
                {auditLogs.filter(
                  (log) => log.targetType === 'courses' && log.targetId === historyCourse.id
                ).length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 text-center">
                    No edit history logged for this course yet. Any future fee, syllabus, publish, or admission updates will be recorded automatically with timestamp and admin actor.
                  </div>
                ) : (
                  auditLogs
                    .filter((log) => log.targetType === 'courses' && log.targetId === historyCourse.id)
                    .map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 font-semibold text-slate-900 dark:text-white">
                          <span>{log.action}</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 mt-1">{log.details}</p>
                        <div className="text-[11px] text-slate-500 mt-1">
                          By {log.actorEmail} ({log.actorRole})
                        </div>
                      </div>
                    ))
                )}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setHistoryCourse(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // MODE 2: STUDENT LMS & OFFICIAL ENROLLED SYLLABUS PORTAL
  if (mode === 'lms') {
    const activeCourse = courses.find((c) => c.id === activeCourseId) || courses[0];
    const progressPct =
      lessons.length > 0 ? Math.round((completedLessonIds.size / lessons.length) * 100) : 0;

    // Strict Student Syllabus Access Rule:
    // Students see ONLY Published syllabuses for their officially enrolled courses.
    const isEnrolledInActiveCourse = activeCourse
      ? enrolledCourseIds.has(activeCourse.id)
      : false;
    const canViewCourseSyllabus = !isStudent || isEnrolledInActiveCourse;

    const activePublishedSyllabus = activeCourse
      ? syllabuses.find(
          (s) => s.courseId === activeCourse.id && s.publishedStatus === 'published'
        ) || null
      : null;

    const activePublishedVersion = activePublishedSyllabus
      ? syllabusVersions.find(
          (v) =>
            v.courseId === activeCourse?.id &&
            v.status === 'Published' &&
            (!activePublishedSyllabus.publishedVersionId ||
              v.id === activePublishedSyllabus.publishedVersionId)
        ) ||
        syllabusVersions.find(
          (v) => v.courseId === activeCourse?.id && v.status === 'Published'
        ) ||
        null
      : null;

    const currentProgress = activeCourse ? localProgressMap[activeCourse.id] : undefined;
    const liveProgressMetrics = activePublishedVersion
      ? computeModuleProgressMetrics(activePublishedVersion.modules || [], {
          completedModuleIds: currentProgress?.completedModuleIds || [],
          completedTopicIds: currentProgress?.completedTopicIds || [],
          completedActivityIds: currentProgress?.completedActivityIds || [],
          completedAssignmentIds: currentProgress?.completedAssignmentIds || [],
        })
      : { totalTrackableItems: 0, completedTrackableItems: 0, progressPercent: 0 };

    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#101D35] dark:text-white">
              Student Learning Portal (LMS)
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Official published course syllabuses, explicit module progress tracking, video lessons, and study notes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={activeCourseId}
              onChange={(e) => setActiveCourseId(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm max-w-xs"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {enrolledCourseIds.has(c.id) ? '★ [Enrolled] ' : ''}
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {canManageLessons && (
              <button
                onClick={() => setAddingLesson((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Lesson
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab Switcher: Official Course Syllabus & Progress vs Video Lessons */}
        <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setLmsSubTab('syllabus')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition cursor-pointer ${
              lmsSubTab === 'syllabus'
                ? 'bg-white dark:bg-slate-900 text-[#101D35] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[#1677FF]" />
            Official Syllabus &amp; Progress
            {canViewCourseSyllabus && activePublishedVersion && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#EAF1FC] text-[#1677FF] dark:bg-blue-950/60 dark:text-blue-300 tabular-nums">
                {liveProgressMetrics.progressPercent}%
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setLmsSubTab('lessons')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition cursor-pointer ${
              lmsSubTab === 'lessons'
                ? 'bg-white dark:bg-slate-900 text-[#101D35] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-violet-600" />
            Video Lessons &amp; Notes ({lessons.length})
          </button>
        </div>

        {/* SUB-TAB A: OFFICIAL PUBLISHED SYLLABUS & EXPLICIT PROGRESS TRACKER */}
        {lmsSubTab === 'syllabus' && activeCourse && (
          <div className="space-y-5">
            {!canViewCourseSyllabus ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center max-w-2xl mx-auto space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                  Enrolled Students Only — {activeCourse.name}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Approved course syllabuses, downloadable PDFs, and module progress trackers are unlocked exclusively for officially enrolled courses. Select one of your enrolled courses from the dropdown above.
                </p>
                {myActiveEnrollments.length > 0 && (
                  <div className="pt-2 flex flex-wrap justify-center gap-2">
                    {myActiveEnrollments.map((enr) => (
                      <button
                        key={enr.id}
                        type="button"
                        onClick={() => setActiveCourseId(enr.courseId)}
                        className="px-3.5 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Open {enr.courseName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : !activePublishedSyllabus || !activePublishedVersion ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center max-w-2xl mx-auto space-y-3">
                <div className="w-12 h-12 rounded-xl bg-[#EAF1FC] dark:bg-blue-950/50 text-[#1677FF] flex items-center justify-center mx-auto">
                  <FileText className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                  Official Syllabus Pending Publication
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  No published syllabus version is live for <strong>{activeCourse.name}</strong> yet. Draft and under-review syllabuses remain private until approved by TECHMAN COLLEGE Academic Management.
                </p>
                {canManageLessons && onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('syllabus-builder')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Author &amp; Publish Syllabus
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Syllabus Announcement Banner */}
                {activePublishedVersion.announcementNote && (
                  <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-[#EAF1FC] dark:bg-blue-950/40 text-xs text-[#101D35] dark:text-blue-200">
                    <strong className="font-semibold">Syllabus Update Notice: </strong>
                    {activePublishedVersion.announcementNote}
                  </div>
                )}

                {/* Syllabus Header & Progress Summary Card */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold">
                          Published v{activePublishedVersion.versionNumber}
                        </span>
                        <span className="text-slate-500">{activeCourse.code}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">
                          Academic Year {activePublishedVersion.academicYear}
                        </span>
                        {activePublishedVersion.totalCourseDuration && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">
                              {activePublishedVersion.totalCourseDuration}
                            </span>
                          </>
                        )}
                      </div>
                      <h2 className="text-lg font-bold text-[#101D35] dark:text-white mt-1">
                        {activePublishedVersion.courseName} — Official Course Syllabus
                      </h2>
                    </div>

                    {/* Read-only Download Approved Document (NEVER modifies progress) */}
                    {activePublishedVersion.attachment && (
                      <a
                        href={activePublishedVersion.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold shrink-0 transition"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          Download Official Syllabus ({activePublishedVersion.attachment.extension.toUpperCase()}
                          {activePublishedVersion.attachment.sizeBytes > 0
                            ? ` · ${formatFileSize(activePublishedVersion.attachment.sizeBytes)}`
                            : ''}
                          )
                        </span>
                      </a>
                    )}
                  </div>

                  {/* Progress Meter */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        My Explicit Syllabus Progress
                      </span>
                      <span className="font-mono font-bold text-[#1677FF] tabular-nums">
                        {liveProgressMetrics.completedTrackableItems} /{' '}
                        {liveProgressMetrics.totalTrackableItems} items ·{' '}
                        {liveProgressMetrics.progressPercent}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#1677FF] transition-all duration-300"
                        style={{ width: `${liveProgressMetrics.progressPercent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Check off topics, practical labs, and assignments below as you complete them. Downloading the syllabus PDF does not auto-mark items complete.
                    </p>
                  </div>
                </div>

                {/* Supporting Course Resources (Read-Only Downloads) */}
                {activePublishedVersion.supportingResources &&
                  activePublishedVersion.supportingResources.length > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Approved Supporting Course Resources (
                        {activePublishedVersion.supportingResources.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {activePublishedVersion.supportingResources.map((res) => (
                          <a
                            key={res.fileId}
                            href={res.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-[#1677FF] hover:underline"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{res.fileName}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Structured Modules Accordion with Explicit Completion Checkboxes */}
                <div className="space-y-3">
                  {(activePublishedVersion.modules || []).map((mod) => {
                    const isExpanded = expandedModuleIds[mod.id] !== false; // default open
                    const topics = mod.topics || [];
                    const activities = mod.practicalActivities || [];
                    const modAssignments = mod.assignments || [];
                    const hasSubItems =
                      topics.length + activities.length + modAssignments.length > 0;

                    const doneMod = (currentProgress?.completedModuleIds || []).includes(mod.id);
                    const doneTopicsCount = topics.filter((t) =>
                      (currentProgress?.completedTopicIds || []).includes(t.id)
                    ).length;
                    const doneActCount = activities.filter((_a, idx) =>
                      (currentProgress?.completedActivityIds || []).includes(`${mod.id}_act_${idx}`)
                    ).length;
                    const doneAsgCount = modAssignments.filter((_a, idx) =>
                      (currentProgress?.completedAssignmentIds || []).includes(
                        `${mod.id}_asg_${idx}`
                      )
                    ).length;
                    const modTotal = hasSubItems
                      ? topics.length + activities.length + modAssignments.length
                      : 1;
                    const modDone = hasSubItems
                      ? doneTopicsCount + doneActCount + doneAsgCount
                      : doneMod
                      ? 1
                      : 0;
                    const modPct = Math.round((modDone / modTotal) * 100);

                    return (
                      <div
                        key={mod.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedModuleIds((prev) => ({
                              ...prev,
                              [mod.id]: !isExpanded,
                            }))
                          }
                          className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#EAF1FC] text-[#1677FF] dark:bg-blue-950/60 dark:text-blue-300 tabular-nums">
                                Module {String(mod.moduleNumber).padStart(2, '0')}
                              </span>
                              {mod.duration && (
                                <span className="font-mono text-[11px] text-slate-500">
                                  {mod.duration}
                                </span>
                              )}
                              <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {modDone}/{modTotal} ({modPct}%)
                              </span>
                            </div>
                            <div className="text-sm font-bold text-[#101D35] dark:text-white mt-1">
                              {mod.title}
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
                            {mod.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {mod.description}
                              </p>
                            )}

                            {mod.learningOutcomes.length > 0 && (
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
                                <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
                                  Learning Outcomes
                                </div>
                                <ul className="space-y-0.5 text-slate-600 dark:text-slate-400">
                                  {mod.learningOutcomes.map((lo, idx) => (
                                    <li key={idx}>✓ {lo}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Module-level checkbox if no sub-items */}
                            {!hasSubItems && (
                              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={doneMod}
                                  disabled={savingProgressKey === `module:${mod.id}`}
                                  onChange={() =>
                                    void handleToggleSyllabusItem(
                                      activeCourse.id,
                                      activePublishedSyllabus,
                                      activePublishedVersion,
                                      'module',
                                      mod.id
                                    )
                                  }
                                  className="w-4 h-4 rounded accent-[#1677FF]"
                                />
                                <span>Mark this module complete</span>
                              </label>
                            )}

                            {/* Topics Checkboxes */}
                            {topics.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                  Topics ({doneTopicsCount}/{topics.length})
                                </div>
                                <div className="space-y-1.5">
                                  {topics.map((t) => {
                                    const checked = (
                                      currentProgress?.completedTopicIds || []
                                    ).includes(t.id);
                                    return (
                                      <label
                                        key={t.id}
                                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={savingProgressKey === `topic:${t.id}`}
                                          onChange={() =>
                                            void handleToggleSyllabusItem(
                                              activeCourse.id,
                                              activePublishedSyllabus,
                                              activePublishedVersion,
                                              'topic',
                                              t.id
                                            )
                                          }
                                          className="mt-0.5 w-4 h-4 rounded accent-[#1677FF] shrink-0"
                                        />
                                        <div className="text-xs">
                                          <div
                                            className={`font-medium ${
                                              checked
                                                ? 'line-through text-slate-400'
                                                : 'text-slate-900 dark:text-white'
                                            }`}
                                          >
                                            {t.title}
                                          </div>
                                          {t.subtopics.length > 0 && (
                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                              {t.subtopics.join(' · ')}
                                            </div>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Practical Activities & Assignments Checkboxes */}
                            {(activities.length > 0 || modAssignments.length > 0) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {activities.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                      Practical Activities ({doneActCount}/{activities.length})
                                    </div>
                                    {activities.map((act, idx) => {
                                      const actId = `${mod.id}_act_${idx}`;
                                      const checked = (
                                        currentProgress?.completedActivityIds || []
                                      ).includes(actId);
                                      return (
                                        <label
                                          key={actId}
                                          className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-xs cursor-pointer"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={savingProgressKey === `activity:${actId}`}
                                            onChange={() =>
                                              void handleToggleSyllabusItem(
                                                activeCourse.id,
                                                activePublishedSyllabus,
                                                activePublishedVersion,
                                                'activity',
                                                actId
                                              )
                                            }
                                            className="mt-0.5 w-4 h-4 rounded accent-[#1677FF] shrink-0"
                                          />
                                          <span
                                            className={
                                              checked
                                                ? 'line-through text-slate-400'
                                                : 'text-slate-700 dark:text-slate-300'
                                            }
                                          >
                                            {act}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}

                                {modAssignments.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                      Assignments ({doneAsgCount}/{modAssignments.length})
                                    </div>
                                    {modAssignments.map((asg, idx) => {
                                      const asgId = `${mod.id}_asg_${idx}`;
                                      const checked = (
                                        currentProgress?.completedAssignmentIds || []
                                      ).includes(asgId);
                                      return (
                                        <label
                                          key={asgId}
                                          className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-xs cursor-pointer"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={savingProgressKey === `assignment:${asgId}`}
                                            onChange={() =>
                                              void handleToggleSyllabusItem(
                                                activeCourse.id,
                                                activePublishedSyllabus,
                                                activePublishedVersion,
                                                'assignment',
                                                asgId
                                              )
                                            }
                                            className="mt-0.5 w-4 h-4 rounded accent-[#1677FF] shrink-0"
                                          />
                                          <span
                                            className={
                                              checked
                                                ? 'line-through text-slate-400'
                                                : 'text-slate-700 dark:text-slate-300'
                                            }
                                          >
                                            {asg}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {mod.recommendedResources.length > 0 && (
                              <div className="text-xs text-slate-500 pt-1">
                                <strong className="text-slate-700 dark:text-slate-300">
                                  Recommended Reading:{' '}
                                </strong>
                                {mod.recommendedResources.join(' · ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Final Assessment Block */}
                {activePublishedVersion.finalAssessment && (
                  <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1677FF] flex items-center gap-1.5 mb-1.5">
                      <FileCheck2 className="w-4 h-4" />
                      Final Assessment &amp; Completion Criteria
                    </h3>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {activePublishedVersion.finalAssessment}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {lmsSubTab === 'lessons' && (
          <div className="space-y-6">

        {addingLesson && (
          <form
            onSubmit={handleAddLesson}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <input
              type="text"
              required
              value={newLessonModule}
              onChange={(e) => setNewLessonModule(e.target.value)}
              placeholder="Module Title (e.g., Module 02)"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              required
              value={newLessonTitle}
              onChange={(e) => setNewLessonTitle(e.target.value)}
              placeholder="Lesson Title *"
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <select
              value={newLessonType}
              onChange={(e) => setNewLessonType(e.target.value as Lesson['type'])}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="video">Video Lesson</option>
              <option value="live">Live Class Link</option>
              <option value="pdf">PDF Notes</option>
              <option value="audio">Audio Lesson</option>
              <option value="reading">Reading Guide</option>
            </select>
            <input
              type="url"
              value={newLessonVideoUrl}
              onChange={(e) => setNewLessonVideoUrl(e.target.value)}
              placeholder="Optional Video / Resource URL (https://...)"
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="text"
              value={newLessonSummary}
              onChange={(e) => setNewLessonSummary(e.target.value)}
              placeholder="Lesson overview and study notes..."
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <div className="sm:col-span-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingLesson(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-violet-700 text-white text-xs font-medium cursor-pointer"
              >
                Publish Lesson
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Stage: Video / Lesson Viewer */}
          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="aspect-video bg-[#0F172A] text-white flex flex-col items-center justify-center p-8 text-center relative">
                {activeLesson ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-violet-700/90 flex items-center justify-center mb-4">
                      {activeLesson.type === 'pdf' ? (
                        <FileText className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6 ml-0.5" />
                      )}
                    </div>
                    <div className="text-xs font-mono text-violet-300 mb-1">
                      {activeLesson.moduleTitle} · {activeLesson.type.toUpperCase()} ·{' '}
                      {activeLesson.durationMinutes || 35} mins
                    </div>
                    <h2 className="text-xl font-bold max-w-lg">{activeLesson.title}</h2>
                    <p className="mt-2 text-xs text-slate-300 max-w-md">
                      Secure TECHMAN COLLEGE LMS Delivery · Playback Speed {playbackSpeed}x
                    </p>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Video className="w-8 h-8 text-violet-400 mx-auto" />
                    <div className="text-sm font-medium">
                      {activeCourse?.name || 'Select a course'}
                    </div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      No published lessons uploaded yet for this course. Lecturers or Owners can add
                      modules above, or review the course syllabus topics below.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Speed:</span>
                  {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-1 rounded font-mono cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-violet-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {activeLesson && (
                  <button
                    onClick={() => void handleToggleLessonComplete(activeLesson)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                      completedLessonIds.has(activeLesson.id)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#0F172A] dark:bg-violet-600 text-white hover:opacity-90'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {completedLessonIds.has(activeLesson.id)
                      ? 'Completed (+50 XP Earned)'
                      : 'Mark Lesson Complete'}
                  </button>
                )}
              </div>
            </div>

            {activeLesson?.summary && (
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-2">
                  Lesson Notes &amp; Study Summary
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeLesson.summary}
                </p>
              </div>
            )}

            {/* Syllabus Overview Fallback */}
            {activeCourse && (activeCourse.syllabusTopics || []).length > 0 && (
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
                  Official Course Syllabus Roadmap ({activeCourse.code})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  {(activeCourse.syllabusTopics || []).map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="font-mono text-violet-700 dark:text-violet-400">
                        {String(i + 1).padStart(2, '0')}.
                      </span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Deck: Module & Lesson Navigation */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 h-fit">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Course Curriculum</h3>
              <span className="text-xs font-mono font-semibold text-violet-700 dark:text-violet-400">
                {progressPct}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-4">
              <div className="h-full bg-violet-700 transition-all" style={{ width: `${progressPct}%` }} />
            </div>

            {lessons.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                No lessons uploaded for this course yet. Initialize the 2027 catalog or click &ldquo;Add Lesson&rdquo; as a Lecturer/Owner.
              </p>
            ) : (
              <div className="space-y-2">
                {lessons.map((l) => {
                  const isDone = completedLessonIds.has(l.id);
                  const isCurrent = activeLesson?.id === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setActiveLesson(l)}
                      className={`w-full text-left p-3 rounded-lg border transition cursor-pointer ${
                        isCurrent
                          ? 'border-violet-600 bg-violet-50/70 dark:bg-violet-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {l.moduleTitle} · {l.type}
                          </div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                            {l.title}
                          </div>
                        </div>
                        {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
          </div>
        )}
      </div>
    );
  }

  // MODE 3: DIGITAL LIBRARY
  const filteredLib = libraryResources.filter((r) => {
    const q = libSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.resourceType.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">Digital Library</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Versioned e-books, PDF lecture notes, design templates, and project briefs with enrollment-scoped access.
          </p>
        </div>
        {(canManageLessons || profile.role === 'CONTENT_MANAGER') && (
          <button
            onClick={() => setShowLibModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Upload Resource
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={libSearch}
          onChange={(e) => setLibSearch(e.target.value)}
          placeholder="Search library by title, category, or format..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        />
      </div>

      {/* Featured Official College Lecture Deck */}
      <div className="p-5 rounded-xl border border-[#1677FF]/30 bg-gradient-to-r from-[#EAF1FC]/80 via-white to-white dark:from-blue-950/30 dark:via-slate-900 dark:to-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1677FF] dark:text-sky-400">
            <FileText className="w-3.5 h-3.5" />
            Official TECHMAN AI Institute &amp; Academy Study Deck · PDF
          </div>
          <h2 className="text-base font-bold text-[#101D35] dark:text-white">
            AI First Class — No Hype. Only Reality.
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
            Official foundational lecture deck covering real-world Artificial Intelligence workflows, prompt discipline, and practical productivity for 2027 Certificate &amp; Diploma students.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={BRAND_IMAGES.aiFirstClassPdf}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            Open / Download PDF
          </a>
        </div>
      </div>

      {filteredLib.length === 0 ? (
        <EmptyState
          title="No Library Resources Found"
          description="Authorized Lecturers, Content Managers, and Owners can upload versioned PDF notes, e-books, and project templates here."
          actionLabel={canManageLessons ? 'Upload First Resource' : undefined}
          onAction={canManageLessons ? () => setShowLibModal(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredLib.map((res) => (
            <div
              key={res.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
            >
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-violet-600" />
                  <span>{res.resourceType}</span>
                  <span>·</span>
                  <span>{res.category}</span>
                  <span>·</span>
                  <span className="font-mono">{res.version || 'v1.0'}</span>
                </div>
                <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  {res.title}
                </h3>
                {res.summary && (
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {res.summary}
                  </p>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 capitalize">
                  Access: {res.accessLevel}
                </span>
                {res.url ? (
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-violet-700 dark:text-violet-400 hover:underline"
                  >
                    Open Resource →
                  </a>
                ) : (
                  <span className="text-slate-400">Reference Only</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showLibModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleAddLibraryResource}
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0F172A] dark:text-white">
                Add Digital Library Resource
              </h2>
              <button type="button" onClick={() => setShowLibModal(false)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <input
              type="text"
              required
              value={libTitle}
              onChange={(e) => setLibTitle(e.target.value)}
              placeholder="Resource Title *"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={libCategory}
                onChange={(e) => setLibCategory(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {Object.keys(DOMAIN_SYLLABI).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={libType}
                onChange={(e) => setLibType(e.target.value as LibraryResource['resourceType'])}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="PDF Notes">PDF Notes</option>
                <option value="E-Book">E-Book</option>
                <option value="Template">Template</option>
                <option value="Recorded Lecture">Recorded Lecture</option>
                <option value="Project Brief">Project Brief</option>
              </select>
            </div>
            <input
              type="url"
              value={libUrl}
              onChange={(e) => setLibUrl(e.target.value)}
              placeholder="Secure Document URL (https://...)"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <textarea
              rows={3}
              value={libSummary}
              onChange={(e) => setLibSummary(e.target.value)}
              placeholder="Short description of the study material..."
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <select
              value={libAccess}
              onChange={(e) => setLibAccess(e.target.value as 'public' | 'enrolled')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="enrolled">Enrolled Students &amp; Staff Only</option>
              <option value="public">Public Sample Resource</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLibModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-violet-700 text-white text-sm font-medium cursor-pointer"
              >
                Publish Resource
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
