import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCheck,
  CreditCard,
  Database,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  GraduationCap,
  History,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  DEFAULT_FREE_SKILL_PROGRAMME,
  DEFAULT_SYSTEM_SETTINGS,
  INSTITUTE_INFO,
  SEED_BRANCHES,
  SEED_CMS_ITEMS,
  SEED_COURSES,
} from '../../data/catalogSeed';
import { getSpecialProgrammeBySlug } from '../../lib/firestoreService';
import {
  AffiliateRecord,
  Application,
  Assignment,
  AttendanceRecord,
  AuditLog,
  Branch,
  Certificate,
  CmsItem,
  CommunityPost,
  Course,
  Enrollment,
  Examination,
  ExamResult,
  Expense,
  LeadActivity,
  LeadImportBatch,
  LeadRecord,
  LibraryResource,
  MigratedStudentRecord,
  MigrationBatch,
  ModuleProgressRecord,
  NotificationItem,
  Payment,
  ProgrammeEnquiry,
  RoleInvitation,
  SpecialProgramme,
  Submission,
  SyllabusRecord,
  SyllabusVersionRecord,
  SystemSettings,
  UserProfile,
} from '../../types/lms';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton, ThemeToggleButton } from '../common/PlatformWidgets';
import { PublicPage } from '../public/PublicWebsite';
import type { LeadMode } from './LeadManagementHub';
import type { SyllabusMode } from './SyllabusManagementHub';

// Tab-level code splitting so recharts & xlsx only load when those specific modules open
const DashboardAndAnalytics = lazy(() =>
  import('./DashboardAndAnalytics').then((m) => ({ default: m.DashboardAndAnalytics }))
);
const AcademicsAndLMS = lazy(() =>
  import('./AcademicsAndLMS').then((m) => ({ default: m.AcademicsAndLMS }))
);
const AdmissionsAndPeople = lazy(() =>
  import('./AdmissionsAndPeople').then((m) => ({ default: m.AdmissionsAndPeople }))
);
const OperationsFinanceCerts = lazy(() =>
  import('./OperationsFinanceCerts').then((m) => ({ default: m.OperationsFinanceCerts }))
);
const AIAndCommunityHub = lazy(() =>
  import('./AIAndCommunityHub').then((m) => ({ default: m.AIAndCommunityHub }))
);
const StudentMigrationStudio = lazy(() =>
  import('./StudentMigrationStudio').then((m) => ({ default: m.StudentMigrationStudio }))
);
const SpecialProgrammeAdmin = lazy(() =>
  import('./SpecialProgrammeAdmin').then((m) => ({ default: m.SpecialProgrammeAdmin }))
);
const LeadManagementHub = lazy(() =>
  import('./LeadManagementHub').then((m) => ({ default: m.LeadManagementHub }))
);
const SyllabusManagementHub = lazy(() =>
  import('./SyllabusManagementHub').then((m) => ({ default: m.SyllabusManagementHub }))
);

const ModuleSkeleton: React.FC = () => (
  <div className="space-y-4 py-4">
    <div className="h-7 w-56 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="h-32 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
        />
      ))}
    </div>
    <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
  </div>
);

interface PortalShellProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onBackToPublic: (targetPage?: PublicPage) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  section:
    | 'Learning & AI'
    | 'CRM & Admissions'
    | 'Academic Management'
    | 'Operations & Finance'
    | 'Governance & SaaS';
  visible: boolean;
}

export const PortalShell: React.FC<PortalShellProps> = ({
  theme,
  toggleTheme,
  onBackToPublic,
}) => {
  const { firebaseUser, profile, isOwner, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Core Workspace Collections
  const [courses, setCourses] = useState<Course[]>(SEED_COURSES);
  const [branches, setBranches] = useState<Branch[]>(SEED_BRANCHES);
  const [applications, setApplications] = useState<Application[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [libraryResources, setLibraryResources] = useState<LibraryResource[]>([]);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>([]);
  const [cmsItems, setCmsItems] = useState<CmsItem[]>(SEED_CMS_ITEMS);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<RoleInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [migratedStudents, setMigratedStudents] = useState<MigratedStudentRecord[]>([]);
  const [migrationBatches, setMigrationBatches] = useState<MigrationBatch[]>([]);
  const [specialProgramme, setSpecialProgramme] = useState<SpecialProgramme>(
    DEFAULT_FREE_SKILL_PROGRAMME
  );
  const [programmeEnquiries, setProgrammeEnquiries] = useState<ProgrammeEnquiry[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);

  // Module 1 (CRM Leads) & Module 2 (Syllabuses & Progress) Collections
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);
  const [leadImportBatches, setLeadImportBatches] = useState<LeadImportBatch[]>([]);
  const [syllabuses, setSyllabuses] = useState<SyllabusRecord[]>([]);
  const [syllabusVersions, setSyllabusVersions] = useState<SyllabusVersionRecord[]>([]);
  const [moduleProgress, setModuleProgress] = useState<ModuleProgressRecord[]>([]);

  const userEmail = firebaseUser?.email || '';

  const loadWorkspaceData = useCallback(async () => {
    if (!profile) return;
    setRefreshing(true);

    const safeGetDocs = async <T,>(
      q: ReturnType<typeof query> | ReturnType<typeof collection>,
      mapDoc: (id: string, data: Record<string, unknown>) => T
    ): Promise<T[]> => {
      try {
        const snap = await getDocs(q);
        return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
      } catch {
        return [];
      }
    };

    try {
      const uid = profile.uid;
      const lowerEmail = userEmail.toLowerCase();

      const canAccessLeads =
        isOwner ||
        ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ADMISSION_OFFICER', 'COORDINATOR'].includes(
          profile.role
        );
      const canAuthorSyllabus =
        isOwner ||
        ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC_MANAGER', 'LECTURER'].includes(profile.role);

      // Strictly synchronized with deployed firestore.rules allow list predicates
      const [
        coursesData,
        branchesData,
        cmsData,
        postsData,
        libEnrolledData,
        libPublicData,
        examsData,
        assignmentsData,
        enrollmentsData,
        attendanceData,
        submissionsData,
        examResultsData,
        paymentsData,
        certsData,
        affiliatesData,
        notifsData,
        usersData,
        invitesData,
        appsData,
        expensesData,
        logsData,
        migratedStudentsData,
        migrationBatchesData,
        specialProgData,
        programmeEnquiriesData,
        leadsAssignedData,
        leadsCreatedData,
        leadActivitiesData,
        leadBatchesData,
        syllabusesPubData,
        syllabusesOwnData,
        syllabusVersionsPubData,
        syllabusVersionsOwnData,
        moduleProgressData,
        settingsSnap,
      ] = await Promise.all([
        safeGetDocs(
          isOwner
            ? collection(db, 'courses')
            : query(collection(db, 'courses'), where('status', '==', 'published')),
          (id, data) => ({ id, ...(data as Omit<Course, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'branches')
            : query(collection(db, 'branches'), where('status', '==', 'active')),
          (id, data) => ({ id, ...(data as Omit<Branch, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'cmsItems')
            : query(collection(db, 'cmsItems'), where('status', '==', 'published')),
          (id, data) => ({ id, ...(data as Omit<CmsItem, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'communityPosts')
            : query(collection(db, 'communityPosts'), where('moderatedStatus', '==', 'active')),
          (id, data) => ({ id, ...(data as Omit<CommunityPost, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'libraryResources')
            : query(collection(db, 'libraryResources'), where('accessLevel', '==', 'enrolled')),
          (id, data) => ({ id, ...(data as Omit<LibraryResource, 'id'>) })
        ),
        isOwner
          ? Promise.resolve<LibraryResource[]>([])
          : safeGetDocs(
              query(collection(db, 'libraryResources'), where('accessLevel', '==', 'public')),
              (id, data) => ({ id, ...(data as Omit<LibraryResource, 'id'>) })
            ),
        safeGetDocs(
          isOwner
            ? collection(db, 'examinations')
            : query(collection(db, 'examinations'), where('approvalStatus', '==', 'approved')),
          (id, data) => ({ id, ...(data as Omit<Examination, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'assignments')
            : query(collection(db, 'assignments'), where('maxMarks', '>=', 0)),
          (id, data) => ({ id, ...(data as Omit<Assignment, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'enrollments')
            : query(collection(db, 'enrollments'), where('userId', '==', uid)),
          (id, data) => ({ id, ...(data as Omit<Enrollment, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'attendance')
            : query(collection(db, 'attendance'), where('userId', '==', uid)),
          (id, data) => ({ id, ...(data as Omit<AttendanceRecord, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'submissions')
            : query(collection(db, 'submissions'), where('userId', '==', uid)),
          (id, data) => ({ id, ...(data as Omit<Submission, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'examResults')
            : query(collection(db, 'examResults'), where('userId', '==', uid)),
          (id, data) => ({ id, ...(data as Omit<ExamResult, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'payments')
            : query(collection(db, 'payments'), where('userId', '==', uid)),
          (id, data) => ({ id, ...(data as Omit<Payment, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'certificates')
            : query(collection(db, 'certificates'), where('userId', '==', uid)),
          (id, data) => ({
            certificateNumber: id,
            ...(data as Omit<Certificate, 'certificateNumber'>),
          })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'affiliates')
            : query(collection(db, 'affiliates'), where('userId', '==', uid)),
          (id, data) => ({ userId: id, ...(data as Omit<AffiliateRecord, 'userId'>) })
        ),
        safeGetDocs(
          isOwner
            ? collection(db, 'notifications')
            : query(collection(db, 'notifications'), where('userId', '==', uid)),
          (id, data) => ({ id, ...(data as Omit<NotificationItem, 'id'>) })
        ),
        safeGetDocs(
          isOwner
            ? query(collection(db, 'users'), limit(500))
            : query(collection(db, 'users'), where('uid', '==', uid), limit(1)),
          (id, data) => ({ uid: id, ...(data as Omit<UserProfile, 'uid'>) })
        ),
        safeGetDocs(
          isOwner
            ? query(collection(db, 'roleInvitations'), limit(200))
            : query(collection(db, 'roleInvitations'), where('email', '==', lowerEmail), limit(20)),
          (id, data) => ({ id, ...(data as Omit<RoleInvitation, 'id'>) })
        ),
        isOwner
          ? safeGetDocs(query(collection(db, 'applications'), limit(300)), (id, data) => ({
              id,
              ...(data as Omit<Application, 'id'>),
            }))
          : Promise.resolve<Application[]>([]),
        isOwner
          ? safeGetDocs(query(collection(db, 'expenses'), limit(300)), (id, data) => ({
              id,
              ...(data as Omit<Expense, 'id'>),
            }))
          : Promise.resolve<Expense[]>([]),
        isOwner
          ? safeGetDocs(query(collection(db, 'auditLogs'), limit(250)), (id, data) => ({
              id,
              ...(data as Omit<AuditLog, 'id'>),
            }))
          : Promise.resolve<AuditLog[]>([]),
        isOwner
          ? safeGetDocs(query(collection(db, 'migratedStudents'), limit(500)), (id, data) => ({
              id,
              ...(data as Omit<MigratedStudentRecord, 'id'>),
            }))
          : Promise.resolve<MigratedStudentRecord[]>([]),
        isOwner
          ? safeGetDocs(query(collection(db, 'migrationBatches'), limit(100)), (id, data) => ({
              id,
              ...(data as Omit<MigrationBatch, 'id'>),
            }))
          : Promise.resolve<MigrationBatch[]>([]),
        getSpecialProgrammeBySlug('free-skill-development'),
        isOwner || ['ADMIN', 'ADMISSION_OFFICER'].includes(profile.role)
          ? safeGetDocs(query(collection(db, 'programmeEnquiries'), limit(200)), (id, data) => ({
              id,
              ...(data as Omit<ProgrammeEnquiry, 'id'>),
            }))
          : Promise.resolve<ProgrammeEnquiry[]>([]),
        // Module 1: Leads (strictly hidden from Lecturers & Students)
        canAccessLeads
          ? safeGetDocs(
              isOwner
                ? query(collection(db, 'leads'), limit(500))
                : query(collection(db, 'leads'), where('assignedToUid', '==', uid), limit(300)),
              (id, data) => ({ id, ...(data as Omit<LeadRecord, 'id'>) })
            )
          : Promise.resolve<LeadRecord[]>([]),
        canAccessLeads && !isOwner
          ? safeGetDocs(
              query(collection(db, 'leads'), where('createdByUid', '==', uid), limit(300)),
              (id, data) => ({ id, ...(data as Omit<LeadRecord, 'id'>) })
            )
          : Promise.resolve<LeadRecord[]>([]),
        canAccessLeads
          ? safeGetDocs(
              isOwner
                ? query(collection(db, 'leadActivities'), limit(400))
                : query(collection(db, 'leadActivities'), where('actorUid', '==', uid), limit(200)),
              (id, data) => ({ id, ...(data as Omit<LeadActivity, 'id'>) })
            )
          : Promise.resolve<LeadActivity[]>([]),
        isOwner
          ? safeGetDocs(query(collection(db, 'leadImportBatches'), limit(100)), (id, data) => ({
              id,
              ...(data as Omit<LeadImportBatch, 'id'>),
            }))
          : Promise.resolve<LeadImportBatch[]>([]),
        // Module 2: Syllabuses & Immutable Versions & Student Progress
        safeGetDocs(
          isOwner
            ? query(collection(db, 'syllabuses'), limit(200))
            : query(collection(db, 'syllabuses'), where('publishedStatus', '==', 'published'), limit(200)),
          (id, data) => ({ id, ...(data as Omit<SyllabusRecord, 'id'>) })
        ),
        !isOwner && canAuthorSyllabus
          ? safeGetDocs(
              query(collection(db, 'syllabuses'), where('uploadedByUid', '==', uid), limit(150)),
              (id, data) => ({ id, ...(data as Omit<SyllabusRecord, 'id'>) })
            )
          : Promise.resolve<SyllabusRecord[]>([]),
        safeGetDocs(
          isOwner
            ? query(collection(db, 'syllabusVersions'), limit(300))
            : query(collection(db, 'syllabusVersions'), where('status', '==', 'Published'), limit(200)),
          (id, data) => ({ id, ...(data as Omit<SyllabusVersionRecord, 'id'>) })
        ),
        !isOwner && canAuthorSyllabus
          ? safeGetDocs(
              query(collection(db, 'syllabusVersions'), where('createdByUid', '==', uid), limit(150)),
              (id, data) => ({ id, ...(data as Omit<SyllabusVersionRecord, 'id'>) })
            )
          : Promise.resolve<SyllabusVersionRecord[]>([]),
        safeGetDocs(
          isOwner
            ? query(collection(db, 'moduleProgress'), limit(400))
            : query(collection(db, 'moduleProgress'), where('userId', '==', uid), limit(100)),
          (id, data) => ({ id, ...(data as Omit<ModuleProgressRecord, 'id'>) })
        ),
        getDoc(doc(db, 'systemSettings', INSTITUTE_INFO.institutionId)).catch(() => null),
      ]);

      setCourses(coursesData.length > 0 ? coursesData : SEED_COURSES);
      setBranches(branchesData.length > 0 ? branchesData : SEED_BRANCHES);
      setCmsItems(cmsData.length > 0 ? cmsData : SEED_CMS_ITEMS);
      setCommunityPosts(
        postsData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );

      // Merge enrolled + public library resources uniquely
      const libMap = new Map<string, LibraryResource>();
      for (const r of [...libEnrolledData, ...libPublicData]) {
        libMap.set(r.id, r);
      }
      setLibraryResources(Array.from(libMap.values()));

      setExaminations(examsData);
      setAssignments(assignmentsData);
      setEnrollments(enrollmentsData);
      setAttendance(attendanceData.sort((a, b) => b.date.localeCompare(a.date)));
      setSubmissions(submissionsData);
      setExamResults(examResultsData);
      setPayments(paymentsData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      setCertificates(certsData);
      setAffiliates(affiliatesData);
      setNotifications(
        notifsData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
      setUsersList(usersData.length > 0 ? usersData : [profile]);
      setInvitations(invitesData);
      setApplications(
        appsData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
      setExpenses(expensesData.sort((a, b) => b.date.localeCompare(a.date)));
      setAuditLogs(logsData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      setMigratedStudents(
        migratedStudentsData.sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''))
      );
      setMigrationBatches(
        migrationBatchesData.sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''))
      );
      setSpecialProgramme(specialProgData);
      setProgrammeEnquiries(
        programmeEnquiriesData.sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );

      // Merge leads uniquely (assigned + created)
      const leadMap = new Map<string, LeadRecord>();
      for (const l of [...leadsAssignedData, ...leadsCreatedData]) {
        leadMap.set(l.id, l);
      }
      setLeads(
        Array.from(leadMap.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
      setLeadActivities(
        leadActivitiesData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
      setLeadImportBatches(
        leadBatchesData.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );

      // Merge syllabuses & versions uniquely
      const sylMap = new Map<string, SyllabusRecord>();
      for (const s of [...syllabusesPubData, ...syllabusesOwnData]) {
        sylMap.set(s.id, s);
      }
      setSyllabuses(Array.from(sylMap.values()));

      const verMap = new Map<string, SyllabusVersionRecord>();
      for (const v of [...syllabusVersionsPubData, ...syllabusVersionsOwnData]) {
        verMap.set(v.id, v);
      }
      setSyllabusVersions(
        Array.from(verMap.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
      setModuleProgress(moduleProgressData);

      if (settingsSnap && settingsSnap.exists()) {
        setSettings(settingsSnap.data() as SystemSettings);
      }
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, [profile, isOwner, userEmail]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const role = profile?.role || 'STUDENT';

  const isCrmRole =
    isOwner ||
    ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ADMISSION_OFFICER', 'COORDINATOR'].includes(role);
  const isCrmAdmin = isOwner || ['SUPER_ADMIN', 'ADMIN'].includes(role);
  const isCrmManager = isCrmAdmin || role === 'BRANCH_MANAGER';
  const isSyllabusAuthor =
    isOwner || ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC_MANAGER', 'LECTURER'].includes(role);

  const navItems: NavItem[] = useMemo(
    () => [
      // Learning & AI
      {
        id: 'dashboard',
        label: isOwner ? 'Owner Command Center' : 'My Dashboard',
        icon: LayoutDashboard,
        section: 'Learning & AI',
        visible: true,
      },
      {
        id: 'lms',
        label: 'Learning Portal (LMS)',
        icon: GraduationCap,
        section: 'Learning & AI',
        visible: true,
      },
      {
        id: 'ai-tutor',
        label: 'TECHMAN COLLEGE AI Tutor',
        icon: Sparkles,
        section: 'Learning & AI',
        visible: true,
      },
      {
        id: 'career',
        label: 'AI Career Center',
        icon: Briefcase,
        section: 'Learning & AI',
        visible: true,
      },
      {
        id: 'library',
        label: 'Digital Library',
        icon: FolderOpen,
        section: 'Learning & AI',
        visible: true,
      },
      // CRM & Admissions (strictly hidden from Lecturers & Students)
      {
        id: 'lead-dashboard',
        label: 'Lead Dashboard',
        icon: LayoutDashboard,
        section: 'CRM & Admissions',
        visible: isCrmRole,
      },
      {
        id: 'lead-all',
        label: 'All Leads',
        icon: Users,
        section: 'CRM & Admissions',
        visible: isCrmRole,
      },
      {
        id: 'lead-import',
        label: 'Import Leads',
        icon: FileSpreadsheet,
        section: 'CRM & Admissions',
        visible: isCrmAdmin,
      },
      {
        id: 'lead-calendar',
        label: 'Follow-up Calendar',
        icon: Calendar,
        section: 'CRM & Admissions',
        visible: isCrmRole,
      },
      {
        id: 'lead-assignments',
        label: 'Lead Assignments',
        icon: UserCheck,
        section: 'CRM & Admissions',
        visible: isCrmManager,
      },
      {
        id: 'lead-reports',
        label: 'Lead Reports',
        icon: BarChart3,
        section: 'CRM & Admissions',
        visible: isCrmManager,
      },
      {
        id: 'admissions',
        label: '2027 Admissions',
        icon: UserPlus,
        section: 'CRM & Admissions',
        visible: isCrmRole,
      },
      // Academic Management
      {
        id: 'courses',
        label: 'Course Management',
        icon: BookOpen,
        section: 'Academic Management',
        visible: true,
      },
      {
        id: 'syllabus-list',
        label: 'Syllabus Management',
        icon: FileText,
        section: 'Academic Management',
        visible: isSyllabusAuthor,
      },
      {
        id: 'syllabus-upload',
        label: 'Upload Syllabus',
        icon: Upload,
        section: 'Academic Management',
        visible: isSyllabusAuthor,
      },
      {
        id: 'syllabus-builder',
        label: 'Syllabus Builder',
        icon: Layers,
        section: 'Academic Management',
        visible: isSyllabusAuthor,
      },
      {
        id: 'syllabus-modules',
        label: 'Module Management',
        icon: BookOpen,
        section: 'Academic Management',
        visible: isSyllabusAuthor,
      },
      {
        id: 'syllabus-versions',
        label: 'Syllabus Version History',
        icon: History,
        section: 'Academic Management',
        visible: isSyllabusAuthor,
      },
      {
        id: 'attendance',
        label: 'Attendance & QR',
        icon: CalendarCheck,
        section: 'Academic Management',
        visible: true,
      },
      {
        id: 'assessments',
        label: 'Assignments & Exams',
        icon: FileCheck2,
        section: 'Academic Management',
        visible: true,
      },
      {
        id: 'certificates',
        label: 'Digital Certificates',
        icon: Award,
        section: 'Academic Management',
        visible: true,
      },
      {
        id: 'community',
        label: 'Community & Showcase',
        icon: MessageSquare,
        section: 'Academic Management',
        visible: true,
      },
      // Operations & Finance
      {
        id: 'finance',
        label: 'Fees & Finance (LKR)',
        icon: CreditCard,
        section: 'Operations & Finance',
        visible: true,
      },
      {
        id: 'affiliates',
        label: 'Affiliate Partners',
        icon: Share2,
        section: 'Operations & Finance',
        visible: isOwner || ['ADMIN', 'AFFILIATE', 'STUDENT', 'COORDINATOR'].includes(role),
      },
      {
        id: 'branches',
        label: 'Branches & Centers',
        icon: Building2,
        section: 'Operations & Finance',
        visible: isOwner || ['ADMIN', 'BRANCH_MANAGER', 'ACADEMIC_MANAGER'].includes(role),
      },
      // Governance & SaaS
      {
        id: 'people',
        label: 'Users, Staff & RBAC',
        icon: Users,
        section: 'Governance & SaaS',
        visible: isOwner || ['ADMIN', 'BRANCH_MANAGER'].includes(role),
      },
      {
        id: 'cms',
        label: 'CMS & AI Media',
        icon: ImageIcon,
        section: 'Governance & SaaS',
        visible: isOwner || ['ADMIN', 'CONTENT_MANAGER'].includes(role),
      },
      {
        id: 'free-skill-admin',
        label: 'Free Skill Programme',
        icon: Sparkles,
        section: 'Governance & SaaS',
        visible: isOwner || ['ADMIN', 'CONTENT_MANAGER', 'ADMISSION_OFFICER'].includes(role),
      },
      {
        id: 'migration',
        label: 'Bulk Student Migration',
        icon: Database,
        section: 'Governance & SaaS',
        visible: isOwner,
      },
      {
        id: 'security',
        label: 'Audit, Backup & SaaS',
        icon: Shield,
        section: 'Governance & SaaS',
        visible: isOwner || role === 'ADMIN',
      },
    ],
    [isOwner, role, isCrmRole, isCrmAdmin, isCrmManager, isSyllabusAuthor]
  );

  const visibleNav = navItems.filter((n) => n.visible);
  const sections = [
    'Learning & AI',
    'CRM & Admissions',
    'Academic Management',
    'Operations & Finance',
    'Governance & SaaS',
  ] as const;
  const currentNav = visibleNav.find((n) => n.id === activeTab) || visibleNav[0];

  const canEditSpecialProgramme = isOwner || ['ADMIN', 'CONTENT_MANAGER'].includes(role);
  const canManageEnquiries = isOwner || ['ADMIN', 'ADMISSION_OFFICER'].includes(role);
  const newEnquiryCount = programmeEnquiries.filter((e) => e.status === 'new').length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const dueFollowUpCount = leads.filter(
    (l) =>
      !l.archived &&
      l.nextFollowUpDate &&
      l.nextFollowUpDate <= todayIso &&
      !['Converted to Student', 'Lost', 'Not Interested', 'Invalid Contact'].includes(l.status)
  ).length;
  const pendingSyllabusReviewCount = syllabusVersions.filter(
    (v) => v.status === 'Pending Review'
  ).length;

  const unreadNotifs = notifications.filter(
    (n) =>
      !n.read &&
      (n.userId === profile?.uid || (isOwner && n.userId === 'super-admin-inbox'))
  );

  const handleMarkNotifRead = async (notif: NotificationItem) => {
    const canMark =
      profile &&
      (notif.userId === profile.uid || (isOwner && notif.userId === 'super-admin-inbox'));
    if (!canMark) return;
    try {
      await updateDoc(doc(db, 'notifications', notif.id), { read: true });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    } catch {
      // ignore if user cannot update someone else's notification
    }
  };

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 260px Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[260px] shrink-0 bg-[#0F172A] text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              TM
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-white truncate">
                TECHMAN COLLEGE
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Est. {INSTITUTE_INFO.establishedYear} · 2027 Intake
              </div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Identity Summary */}
        <div className="px-4 py-3.5 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-violet-300 shrink-0">
              {profile.displayName
                .split(' ')
                .slice(0, 2)
                .map((p) => p[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {profile.displayName}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-violet-300 truncate">
                {isOwner && <ShieldCheck className="w-3 h-3 shrink-0" />}
                <span className="truncate">
                  {profile.designation || profile.role.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sections.map((sectionName) => {
            const items = visibleNav.filter((i) => i.section === sectionName);
            if (items.length === 0) return null;
            return (
              <div key={sectionName}>
                <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {sectionName}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                          active
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate flex-1 text-left">{item.label}</span>
                        {item.id === 'free-skill-admin' && newEnquiryCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white text-[10px] font-mono font-bold tabular-nums">
                            {newEnquiryCount}
                          </span>
                        )}
                        {item.id === 'lead-calendar' && dueFollowUpCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-mono font-bold tabular-nums">
                            {dueFollowUpCount}
                          </span>
                        )}
                        {item.id === 'syllabus-list' &&
                          pendingSyllabusReviewCount > 0 &&
                          (isOwner || ['SUPER_ADMIN', 'ADMIN', 'ACADEMIC_MANAGER'].includes(role)) && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-mono font-bold tabular-nums">
                              {pendingSyllabusReviewCount}
                            </span>
                          )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom Portal Utilities */}
        <div className="p-3 border-t border-slate-800 space-y-1.5 shrink-0">
          <button
            onClick={() => onBackToPublic('home')}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <Globe className="w-4 h-4 shrink-0" />
            Public College Website
          </button>
          <button
            onClick={() => void signOutUser()}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-rose-300 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Contextual Header */}
        <header className="sticky top-0 z-30 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {currentNav?.label || INSTITUTE_INFO.platformName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {INSTITUTE_INFO.officialName} · {INSTITUTE_INFO.establishedLabel} · {profile.studentId || profile.role.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void loadWorkspaceData()}
              disabled={refreshing}
              title="Refresh workspace data"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications Popover */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-violet-600 text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                    {unreadNotifs.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Notifications
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500 text-center">
                        No notifications right now.
                      </div>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 text-xs ${
                            n.read ? 'opacity-70' : 'bg-violet-50/40 dark:bg-violet-950/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {n.title}
                            </p>
                            {!n.read &&
                              (n.userId === profile.uid ||
                                (isOwner && n.userId === 'super-admin-inbox')) && (
                                <button
                                  onClick={() => void handleMarkNotifRead(n)}
                                  className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                                >
                                  <CheckCheck className="w-3 h-3" /> Read
                                </button>
                              )}
                          </div>
                          <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                            {n.message}
                          </p>
                          {n.category === 'programme_enquiry' && canManageEnquiries && (
                            <button
                              onClick={() => {
                                setNotifOpen(false);
                                setActiveTab('free-skill-admin');
                              }}
                              className="mt-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              Open Host Enquiries →
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <PWAInstallButton compact />
            <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
          </div>
        </header>

        {/* Active Module Body */}
        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loadingData ? (
            <ModuleSkeleton />
          ) : (
            <Suspense fallback={<ModuleSkeleton />}>
              {activeTab === 'dashboard' && (
                <DashboardAndAnalytics
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  courses={courses}
                  branches={branches}
                  applications={applications}
                  enrollments={enrollments}
                  payments={payments}
                  expenses={expenses}
                  certificates={certificates}
                  attendance={attendance}
                  submissions={submissions}
                  usersList={usersList}
                  leads={leads}
                  syllabuses={syllabuses}
                  moduleProgress={moduleProgress}
                  specialProgramme={specialProgramme}
                  onNavigateTab={setActiveTab}
                  onRefreshData={loadWorkspaceData}
                  onOpenFreeSkillPublic={() => onBackToPublic('free-skill-programme')}
                />
              )}

              {(activeTab === 'lead-dashboard' ||
                activeTab === 'lead-all' ||
                activeTab === 'lead-import' ||
                activeTab === 'lead-calendar' ||
                activeTab === 'lead-assignments' ||
                activeTab === 'lead-reports') && (
                <LeadManagementHub
                  mode={activeTab as LeadMode}
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  leads={leads}
                  leadActivities={leadActivities}
                  leadImportBatches={leadImportBatches}
                  courses={courses}
                  branches={branches}
                  usersList={usersList}
                  applications={applications}
                  migratedStudents={migratedStudents}
                  onNavigateTab={setActiveTab}
                  onRefreshData={loadWorkspaceData}
                />
              )}

              {(activeTab === 'syllabus-list' ||
                activeTab === 'syllabus-upload' ||
                activeTab === 'syllabus-builder' ||
                activeTab === 'syllabus-modules' ||
                activeTab === 'syllabus-versions') && (
                <SyllabusManagementHub
                  mode={activeTab as SyllabusMode}
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  courses={courses}
                  syllabuses={syllabuses}
                  syllabusVersions={syllabusVersions}
                  onNavigateTab={setActiveTab}
                  onRefreshData={loadWorkspaceData}
                />
              )}

              {activeTab === 'free-skill-admin' && (
                <SpecialProgrammeAdmin
                  profile={profile}
                  userEmail={userEmail}
                  programme={specialProgramme}
                  enquiries={programmeEnquiries}
                  canEditContent={canEditSpecialProgramme}
                  canManageEnquiries={canManageEnquiries}
                  onRefresh={loadWorkspaceData}
                  onOpenPublicProgramme={() => onBackToPublic('free-skill-programme')}
                />
              )}

              {(activeTab === 'courses' || activeTab === 'lms' || activeTab === 'library') && (
                <AcademicsAndLMS
                  mode={activeTab}
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  courses={courses}
                  libraryResources={libraryResources}
                  enrollments={enrollments}
                  syllabuses={syllabuses}
                  syllabusVersions={syllabusVersions}
                  moduleProgress={moduleProgress}
                  onNavigateTab={setActiveTab}
                  onRefreshData={loadWorkspaceData}
                />
              )}

              {(activeTab === 'admissions' ||
                activeTab === 'people' ||
                activeTab === 'branches') && (
                <AdmissionsAndPeople
                  mode={activeTab}
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  applications={applications}
                  usersList={usersList}
                  invitations={invitations}
                  branches={branches}
                  courses={courses}
                  migratedStudents={migratedStudents}
                  migrationBatches={migrationBatches}
                  onOpenMigration={() => setActiveTab('migration')}
                  onRefreshData={loadWorkspaceData}
                />
              )}

              {activeTab === 'migration' && (
                <StudentMigrationStudio
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  courses={courses}
                  branches={branches}
                  applications={applications}
                  migratedStudents={migratedStudents}
                  migrationBatches={migrationBatches}
                  onRefreshData={loadWorkspaceData}
                />
              )}

              {(activeTab === 'attendance' ||
                activeTab === 'assessments' ||
                activeTab === 'finance' ||
                activeTab === 'certificates') && (
                <OperationsFinanceCerts
                  mode={activeTab}
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  courses={courses}
                  usersList={usersList}
                  attendance={attendance}
                  assignments={assignments}
                  submissions={submissions}
                  examinations={examinations}
                  examResults={examResults}
                  payments={payments}
                  expenses={expenses}
                  certificates={certificates}
                  onRefreshData={loadWorkspaceData}
                />
              )}

              {(activeTab === 'ai-tutor' ||
                activeTab === 'career' ||
                activeTab === 'community' ||
                activeTab === 'affiliates' ||
                activeTab === 'cms' ||
                activeTab === 'security') && (
                <AIAndCommunityHub
                  mode={activeTab}
                  profile={profile}
                  userEmail={userEmail}
                  isOwner={isOwner}
                  courses={courses}
                  communityPosts={communityPosts}
                  affiliates={affiliates}
                  cmsItems={cmsItems}
                  auditLogs={auditLogs}
                  usersList={usersList}
                  settings={settings}
                  onRefreshData={loadWorkspaceData}
                />
              )}
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
};
