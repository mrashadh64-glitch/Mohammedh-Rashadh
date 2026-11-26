import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  FileCheck2,
  FileText,
  FolderOpen,
  Layers,
  Lock,
  Paperclip,
  Play,
  Plus,
  Search,
  Video,
  X,
} from 'lucide-react';
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatLkr, logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import { computeModuleProgressMetrics, formatFileSize } from '../../lib/syllabusEngine';
import { DOMAIN_SYLLABI, INSTITUTE_INFO } from '../../data/catalogSeed';
import {
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

interface AcademicsProps {
  mode: 'courses' | 'lms' | 'library';
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
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
  const [catFilter, setCatFilter] = useState<'All' | 'Certificate' | 'Diploma'>('All');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [savingCourse, setSavingCourse] = useState(false);

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
    setSavingCourse(true);
    try {
      const id = editingCourse.id || makeSafeId('CRS').toLowerCase();
      await setDoc(
        doc(db, 'courses', id),
        {
          code: editingCourse.code.trim().slice(0, 32),
          name: editingCourse.name.trim().slice(0, 160),
          category: editingCourse.category,
          domain: (editingCourse.domain || 'General').slice(0, 64),
          description: (editingCourse.description || '').slice(0, 1200),
          imageUrl: (editingCourse.imageUrl || '').slice(0, 500),
          level: (editingCourse.level || '').slice(0, 40),
          duration: editingCourse.duration.trim().slice(0, 64),
          mode: editingCourse.mode,
          courseFeeLkr: Math.max(0, Number(editingCourse.courseFeeLkr) || 0),
          registrationFeeLkr: Math.max(0, Number(editingCourse.registrationFeeLkr) || 0),
          certificateFeeLkr: Math.max(0, Number(editingCourse.certificateFeeLkr) || 0),
          installmentPlan: (editingCourse.installmentPlan || '').slice(0, 120),
          lecturerName: (editingCourse.lecturerName || 'TECHMAN COLLEGE Senior Faculty').slice(0, 120),
          batchName: (editingCourse.batchName || '2027 Intake — Batch 01').slice(0, 80),
          startDate: (editingCourse.startDate || '2027-01-18').slice(0, 32),
          endDate: (editingCourse.endDate || '2027-08-30').slice(0, 32),
          maxStudents: Math.max(1, Number(editingCourse.maxStudents) || 45),
          entryRequirements: (editingCourse.entryRequirements || '').slice(0, 400),
          learningOutcomes: (editingCourse.learningOutcomes || []).slice(0, 20),
          syllabusTopics: (editingCourse.syllabusTopics || []).slice(0, 30),
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
        action: 'UPSERT_COURSE',
        targetType: 'courses',
        targetId: id,
        details: `Updated course ${editingCourse.name} (Fee: LKR ${editingCourse.courseFeeLkr})`,
      });
      setEditingCourse(null);
      await onRefreshData();
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

  // MODE 1: COURSE MANAGEMENT (EDITABLE 32-COURSE CATALOG)
  if (mode === 'courses') {
    const filtered = courses.filter((c) => {
      if (catFilter !== 'All' && c.category !== catFilter) return false;
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
              Course &amp; Syllabus Management
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Edit LKR course fees, durations, modes, batches, and module syllabi live without code changes.
            </p>
          </div>
          {canManageCourses && (
            <div className="flex flex-wrap items-center gap-2">
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('syllabus-list')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-4 h-4 text-[#1677FF]" />
                  Manage Syllabuses
                </button>
              )}
              <button
                onClick={() =>
                  setEditingCourse({
                    id: '',
                    code: 'TM-NEW-27',
                    name: '',
                    category: 'Diploma',
                    domain: 'Artificial Intelligence',
                    description: '',
                    duration: '6 Months',
                    mode: 'Hybrid',
                    courseFeeLkr: 55000,
                    registrationFeeLkr: 5000,
                    certificateFeeLkr: 4000,
                    installmentPlan: '3 Monthly Installments',
                    lecturerName: 'TECHMAN COLLEGE Senior Faculty',
                    batchName: '2027 Intake — Batch 01',
                    maxStudents: 45,
                    syllabusTopics: DOMAIN_SYLLABI['Artificial Intelligence'],
                    certificateEligible: true,
                    status: 'published',
                    institutionId: INSTITUTE_INFO.institutionId,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                New Course
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses by name, code, or domain..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
            {(['All', 'Certificate', 'Diploma'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  catFilter === cat
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {cat}
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
                  {canManageCourses && <th className="py-3 px-4 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {course.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{course.name}</div>
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
                    <td className="py-3 px-4 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatLkr(course.courseFeeLkr)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={course.status} />
                    </td>
                    {canManageCourses && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setEditingCourse(course)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
                    value={editingCourse.courseFeeLkr}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, courseFeeLkr: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
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
                  className="px-5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
                >
                  {savingCourse ? 'Saving...' : 'Save Course'}
                </button>
              </div>
            </form>
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
