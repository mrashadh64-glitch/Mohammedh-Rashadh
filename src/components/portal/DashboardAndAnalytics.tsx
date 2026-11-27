import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Flame,
  GraduationCap,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import {
  Application,
  AttendanceRecord,
  Branch,
  Certificate,
  Course,
  Enrollment,
  Expense,
  GeneratedPoster,
  LeadRecord,
  ModuleProgressRecord,
  Payment,
  SpecialProgramme,
  StudentAccountRecord,
  Submission,
  SyllabusRecord,
  SyllabusVersionRecord,
  UserProfile,
} from '../../types/lms';
import { auth } from '../../lib/firebase';
import { formatLkr, initialize2027InstituteCatalog } from '../../lib/firestoreService';
import { BRAND_IMAGES, INSTITUTE_INFO } from '../../data/catalogSeed';
import { StatusLabel } from '../common/PlatformWidgets';

interface DashboardProps {
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  branches: Branch[];
  applications: Application[];
  enrollments: Enrollment[];
  payments: Payment[];
  expenses: Expense[];
  certificates: Certificate[];
  attendance: AttendanceRecord[];
  submissions: Submission[];
  usersList: UserProfile[];
  leads?: LeadRecord[];
  syllabuses?: SyllabusRecord[];
  syllabusVersions?: SyllabusVersionRecord[];
  studentAccounts?: StudentAccountRecord[];
  generatedPosters?: GeneratedPoster[];
  moduleProgress?: ModuleProgressRecord[];
  specialProgramme?: SpecialProgramme;
  onNavigateTab: (tab: string) => void;
  onRefreshData: () => Promise<void>;
  onOpenFreeSkillPublic?: () => void;
}

const CHART_COLORS = ['#6D28D9', '#0F172A', '#2563EB', '#059669', '#D97706', '#475569'];

export const DashboardAndAnalytics: React.FC<DashboardProps> = ({
  profile,
  userEmail,
  isOwner,
  courses,
  branches,
  applications,
  enrollments,
  payments,
  expenses,
  certificates,
  attendance,
  submissions,
  usersList,
  leads = [],
  syllabuses = [],
  syllabusVersions = [],
  studentAccounts = [],
  generatedPosters = [],
  moduleProgress = [],
  specialProgramme,
  onNavigateTab,
  onRefreshData,
  onOpenFreeSkillPublic,
}) => {
  const [seeding, setSeeding] = useState(false);
  const [seedDoneMsg, setSeedDoneMsg] = useState<string | null>(null);
  const [seedErrMsg, setSeedErrMsg] = useState<string | null>(null);

  // Private AI CEO Assistant state
  const [ceoQuestion, setCeoQuestion] = useState('');
  const [ceoLoading, setCeoLoading] = useState(false);
  const [ceoResponse, setCeoResponse] = useState<{
    answer: string;
    dataSource: string;
    reportingPeriod: string;
    lastUpdated: string;
  } | null>(null);
  const [ceoError, setCeoError] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const verifiedRevenueLkr = payments
      .filter((p) => p.status === 'Verified')
      .reduce((acc, p) => acc + (Number(p.amountLkr) || 0), 0);
    const pendingPaymentsLkr = payments
      .filter((p) => p.status === 'Pending Verification')
      .reduce((acc, p) => acc + (Number(p.amountLkr) || 0), 0);
    const totalExpensesLkr = expenses.reduce((acc, e) => acc + (Number(e.amountLkr) || 0), 0);
    const pendingApplications = applications.filter((a) =>
      ['Submitted', 'Under Review', 'Documents Required', 'Payment Pending'].includes(a.status)
    ).length;
    const activeStudents = usersList.filter((u) => u.role === 'STUDENT' && u.accountStatus === 'active').length;
    const lecturersCount = usersList.filter((u) => u.role === 'LECTURER').length;
    const pendingSubmissions = submissions.filter((s) => s.status === 'Submitted' || s.status === 'Late').length;
    const issuedCertificates = certificates.filter((c) => c.status === 'Issued' || c.status === 'Reissued').length;
    const presentAttendance = attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
    const attendanceRate = attendance.length > 0 ? Math.round((presentAttendance / attendance.length) * 100) : 0;

    return {
      verifiedRevenueLkr,
      pendingPaymentsLkr,
      totalExpensesLkr,
      netBalanceLkr: verifiedRevenueLkr - totalExpensesLkr,
      pendingApplications,
      totalApplications: applications.length,
      activeStudents,
      totalEnrollments: enrollments.length,
      lecturersCount,
      pendingSubmissions,
      issuedCertificates,
      attendanceRate,
      publishedCourses: courses.filter((c) => c.status === 'published').length,
      totalCourses: courses.length,
      totalBranches: branches.length,
      totalStudentAccounts: studentAccounts.length,
      activeStudentAccounts: studentAccounts.filter((a) => a.status === 'Active').length,
      pendingStudentInvitations: studentAccounts.filter(
        (a) => a.status === 'Invitation Sent' || a.status === 'Not Created'
      ).length,
      passwordResetRequests: studentAccounts.filter(
        (a) => a.status === 'Password Reset Required'
      ).length,
      totalPostersGenerated: generatedPosters.length,
      postersPendingApproval: generatedPosters.filter(
        (p) => p.status === 'pending_approval' || p.status === 'needs_update'
      ).length,
      publishedPosters: generatedPosters.filter((p) => p.status === 'published').length,
      totalSyllabuses: syllabuses.length,
      syllabusUpdatesPending: syllabusVersions.filter((v) => v.status === 'Pending Review').length,
    };
  }, [
    payments,
    expenses,
    applications,
    usersList,
    enrollments,
    submissions,
    certificates,
    attendance,
    courses,
    branches,
    studentAccounts,
    generatedPosters,
    syllabuses,
    syllabusVersions,
  ]);

  const domainChartData = useMemo(() => {
    const counts = new Map<string, number>();
    courses.forEach((c) => {
      const dom = c.domain || 'General';
      counts.set(dom, (counts.get(dom) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [courses]);

  const categoryBreakdown = useMemo(() => {
    const certCount = courses.filter((c) => c.category === 'Certificate').length;
    const dipCount = courses.filter((c) => c.category === 'Diploma').length;
    return [
      { name: 'Certificate Programmes', value: certCount },
      { name: 'International Diplomas', value: dipCount },
    ];
  }, [courses]);

  const handleSeedCatalog = async () => {
    setSeeding(true);
    setSeedDoneMsg(null);
    setSeedErrMsg(null);
    try {
      await initialize2027InstituteCatalog(profile.uid, userEmail);
      await onRefreshData();
      setSeedDoneMsg(
        'Successfully synced all 40 official 2027 courses (22 Certificate incl. 5 FREE + 18 Diploma), 5 branches, 13 RBAC role configs, brand settings, workflows, and CMS items in Firestore.'
      );
    } catch (err) {
      setSeedErrMsg(
        err instanceof Error
          ? err.message
          : 'Failed to sync the 40-course 2027 catalog. Verify Super Admin permissions.'
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleAskCeoAssistant = async (e: React.FormEvent, preset?: string) => {
    e.preventDefault();
    const q = (preset ?? ceoQuestion).trim();
    if (!q) return;
    setCeoQuestion(q);
    setCeoLoading(true);
    setCeoError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Super Admin authentication is required.');
      const res = await fetch('/api/ai/ceo-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          question: q,
          reportingPeriod: '2027 Academic Intake (Live Firestore Data)',
          metricsSnapshot: {
            college: INSTITUTE_INFO.officialName,
            establishedYear: INSTITUTE_INFO.establishedYear,
            currency: 'LKR',
            ...metrics,
            coursesByDomain: domainChartData,
            branchNames: branches.map((b) => ({ name: b.name, city: b.city, status: b.status })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI CEO Assistant request failed.');
      setCeoResponse(data);
    } catch (err) {
      setCeoError(err instanceof Error ? err.message : 'Unable to reach AI CEO Assistant.');
    } finally {
      setCeoLoading(false);
    }
  };

  const isExecutiveOrStaff = [
    'SUPER_ADMIN',
    'ADMIN',
    'BRANCH_MANAGER',
    'COORDINATOR',
    'ADMISSION_OFFICER',
    'ACADEMIC_MANAGER',
    'ACCOUNTANT',
    'EXAMINER',
    'CONTENT_MANAGER',
  ].includes(profile.role);

  // STUDENT DASHBOARD
  if (profile.role === 'STUDENT') {
    const myEnrollments = enrollments.filter((e) => e.userId === profile.uid);
    const myAttendance = attendance.filter((a) => a.userId === profile.uid);
    const myPresent = myAttendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
    const myAttPct = myAttendance.length ? Math.round((myPresent / myAttendance.length) * 100) : 100;
    const myPayments = payments.filter((p) => p.userId === profile.uid);
    const verifiedPaid = myPayments
      .filter((p) => p.status === 'Verified')
      .reduce((acc, p) => acc + p.amountLkr, 0);
    const myCerts = certificates.filter((c) => c.userId === profile.uid);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-white">
              Welcome back, {profile.displayName}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {INSTITUTE_INFO.officialName} Student Portal · {INSTITUTE_INFO.establishedLabel} · Academic Intake 2027 ·{' '}
              <span className="font-mono">{profile.studentId || 'Pending Student ID'}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('ai-tutor')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Open College AI Tutor
            </button>
          </div>
        </div>

        {/* 4 Student KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Enrolled Courses</div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
              {myEnrollments.length}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Active 2027 cohorts</div>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Attendance Rate</div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
              {myAttPct}%
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {myAttendance.length} recorded sessions
            </div>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Verified Payments</div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
              {formatLkr(verifiedPaid)}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {myPayments.filter((p) => p.status === 'Pending Verification').length} pending review
            </div>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Learning XP &amp; Streak</div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-violet-700 dark:text-violet-400 flex items-center gap-2">
              {profile.xpPoints ?? 25} XP
              <Flame className="w-5 h-5 text-amber-500" />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Level {profile.level ?? 1} · {profile.streakDays ?? 1}-day streak
            </div>
          </div>
        </div>

        {/* Digital QR Student ID + Enrolled Courses */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                My Enrolled Courses
              </h2>
              <button
                onClick={() => onNavigateTab('lms')}
                className="text-xs font-medium text-violet-700 dark:text-violet-400 hover:underline cursor-pointer"
              >
                Open Learning Portal →
              </button>
            </div>
            {myEnrollments.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  You have no formal batch enrollments assigned yet. You can still explore open
                  learning modules, practice with TECHMAN COLLEGE AI Tutor, or build your AI Career profile.
                </p>
                <button
                  onClick={() => onNavigateTab('lms')}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#0F172A] dark:bg-violet-600 text-white text-xs font-medium cursor-pointer"
                >
                  Browse Learning Portal
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {myEnrollments.map((enr) => {
                  const modProg = moduleProgress.find(
                    (mp) => mp.userId === profile.uid && mp.courseId === enr.courseId
                  );
                  const pubSyl = syllabuses.find(
                    (s) => s.courseId === enr.courseId && s.publishedStatus === 'published'
                  );
                  const pct = modProg?.progressPercent ?? enr.progressPercent ?? 0;

                  return (
                    <div key={enr.id} className="py-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {enr.courseName}
                            </span>
                            {pubSyl?.publishedVersionNumber && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#EAF1FC] text-[#1677FF] dark:bg-blue-950/60 dark:text-blue-300">
                                Syllabus v{pubSyl.publishedVersionNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {enr.batchName || '2027 Intake'} · Student ID:{' '}
                            <span className="font-mono">{enr.studentId}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-mono font-semibold text-[#1677FF] tabular-nums">
                            {pct}%
                          </div>
                          <StatusLabel status={enr.status} />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-[#1677FF] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">
                            {modProg
                              ? `${modProg.completedTrackableItems}/${modProg.totalTrackableItems} syllabus items completed`
                              : pubSyl
                              ? `${pubSyl.moduleCount} syllabus modules available`
                              : 'Awaiting published syllabus'}
                          </span>
                          <button
                            type="button"
                            onClick={() => onNavigateTab('lms')}
                            className="font-semibold text-[#1677FF] hover:underline cursor-pointer"
                          >
                            View Syllabus &amp; Track Progress →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Digital Student ID Card with scannable QR */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0F172A] text-white p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] text-violet-300 font-medium tracking-wide">
                  {INSTITUTE_INFO.officialName} · {INSTITUTE_INFO.establishedLabel}
                </div>
                <div className="text-lg font-bold mt-1">Digital Student ID</div>
              </div>
              <GraduationCap className="w-6 h-6 text-violet-400 shrink-0" />
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="space-y-1.5 text-xs">
                <div className="text-base font-semibold text-white">{profile.displayName}</div>
                <div className="font-mono text-slate-300">
                  ID: {profile.studentId || `TM27-${profile.uid.slice(0, 6).toUpperCase()}`}
                </div>
                <div className="text-slate-400">Intake: 2027 · Sri Lanka</div>
                <div className="text-slate-400">Certificates Earned: {myCerts.length}</div>
              </div>
              <div className="p-2.5 bg-white rounded-lg shrink-0">
                <QRCodeSVG
                  value={`TECHMAN-ID:${profile.studentId || profile.uid}`}
                  size={88}
                />
              </div>
            </div>
          </div>
        </div>

        {/* TECHMAN FREE SKILL DEVELOPMENT PROGRAMME — Student Overview Card */}
        {specialProgramme && specialProgramme.status === 'published' && (
          <div className="rounded-2xl border border-blue-200/80 dark:border-slate-800 bg-gradient-to-br from-[#F4F8FF] via-white to-violet-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shrink-0">
                  <img
                    src={specialProgramme.trainerPhotoUrl || BRAND_IMAGES.trainerMohammedRashadh}
                    alt={specialProgramme.trainerName}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    <span>{specialProgramme.feeBadge}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {specialProgramme.schedule}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {specialProgramme.availability}
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-[#0F172A] dark:text-white">
                    {specialProgramme.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    Led by <strong>{specialProgramme.trainerName}</strong> ({specialProgramme.trainerPosition}) —{' '}
                    &ldquo;{specialProgramme.theme}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {onOpenFreeSkillPublic && (
                  <button
                    onClick={onOpenFreeSkillPublic}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                  >
                    View Full Programme
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onNavigateTab('lms')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
                >
                  Open LMS Modules
                </button>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                {specialProgramme.modules.length} Workshop Modules Included
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {specialProgramme.modules.map((m) => (
                  <div
                    key={`${m.number}-${m.title}`}
                    className="rounded-lg bg-white/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 px-3 py-2 text-xs"
                  >
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-400 mr-1.5">
                      {m.number}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{m.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // OWNER / SUPER ADMIN / STAFF / LECTURER EXECUTIVE DASHBOARD
  return (
    <div className="space-y-6">
      {/* Header & Owner 32-Course Seed Action */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-white">
            {isOwner
              ? 'Owner / CEO Executive Command Center'
              : `${profile.designation || profile.role.replace(/_/g, ' ')} Dashboard`}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {INSTITUTE_INFO.officialName} · {INSTITUTE_INFO.establishedLabel} · Academic Intake 2027 · Live Firestore Metrics (LKR)
          </p>
        </div>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleSeedCatalog}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-xs font-medium transition cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4" />
              {seeding
                ? 'Syncing 40 Official 2027 Courses...'
                : courses.length >= 40
                ? 'Sync Official 40-Course 2027 Catalog'
                : 'Initialize / Sync 40 Official 2027 Courses'}
            </button>
          </div>
        )}
      </div>

      {seedDoneMsg && (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{seedDoneMsg}</span>
        </div>
      )}

      {seedErrMsg && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-300 flex items-center justify-between gap-2.5">
          <span>{seedErrMsg}</span>
          <button
            onClick={() => setSeedErrMsg(null)}
            className="text-xs underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigateTab('admissions')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-400 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Pending Applications</span>
            <Users className="w-4 h-4 text-violet-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
            {metrics.pendingApplications}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics.totalApplications} total 2027 applications
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('courses')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-400 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Active Programmes</span>
            <BookOpen className="w-4 h-4 text-violet-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
            {metrics.publishedCourses}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics.totalCourses} total · {metrics.totalBranches} branches
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('finance')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-400 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Verified LKR Revenue</span>
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
            {formatLkr(metrics.verifiedRevenueLkr)}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-400 font-mono tabular-nums">
            {formatLkr(metrics.pendingPaymentsLkr)} awaiting verification
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('certificates')}
          className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-violet-400 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Certificates &amp; Attendance</span>
            <Award className="w-4 h-4 text-violet-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-white">
            {metrics.issuedCertificates}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics.attendanceRate}% avg attendance · {metrics.pendingSubmissions} ungraded
          </div>
        </button>
      </div>

      {/* Platform Governance & Academic Operations KPIs (10 Required Admin Metrics) */}
      {isExecutiveOrStaff && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                Accounts, Posters &amp; Syllabus Governance Overview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time operational metrics across student credentials, course posters, and syllabus approvals
              </p>
            </div>
            {(isOwner || profile.role === 'ADMIN') && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onNavigateTab('student-accounts')}
                  className="px-3 py-1.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Manage Student Accounts
                </button>
                <button
                  onClick={() => onNavigateTab('email-logs')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Email Delivery Logs
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              {
                label: 'Total Student Accounts',
                value: metrics.totalStudentAccounts,
                tab: 'student-accounts',
                accent: 'text-[#0F172A] dark:text-white',
              },
              {
                label: 'Active Accounts',
                value: metrics.activeStudentAccounts,
                tab: 'student-accounts',
                accent: 'text-emerald-700 dark:text-emerald-400',
              },
              {
                label: 'Invitations Pending',
                value: metrics.pendingStudentInvitations,
                tab: 'student-accounts',
                accent: 'text-amber-600 dark:text-amber-400',
              },
              {
                label: 'Password Reset Requests',
                value: metrics.passwordResetRequests,
                tab: 'student-accounts',
                accent: 'text-rose-600 dark:text-rose-400',
              },
              {
                label: 'Total Courses',
                value: metrics.totalCourses,
                tab: 'courses',
                accent: 'text-[#1677FF] dark:text-sky-400',
              },
              {
                label: 'Total Posters Generated',
                value: metrics.totalPostersGenerated,
                tab: 'poster-library',
                accent: 'text-[#0F172A] dark:text-white',
              },
              {
                label: 'Posters Pending Approval',
                value: metrics.postersPendingApproval,
                tab: 'poster-approval',
                accent: 'text-amber-600 dark:text-amber-400',
              },
              {
                label: 'Published Posters',
                value: metrics.publishedPosters,
                tab: 'poster-library',
                accent: 'text-emerald-700 dark:text-emerald-400',
              },
              {
                label: 'Total Syllabuses',
                value: metrics.totalSyllabuses,
                tab: 'syllabus-list',
                accent: 'text-[#1677FF] dark:text-sky-400',
              },
              {
                label: 'Syllabus Updates Pending',
                value: metrics.syllabusUpdatesPending,
                tab: 'syllabus-list',
                accent: 'text-amber-600 dark:text-amber-400',
              },
            ].map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={() => onNavigateTab(stat.tab)}
                className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-[#1677FF] transition cursor-pointer"
              >
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  {stat.label}
                </div>
                <div className={`mt-1.5 text-xl font-bold font-mono tabular-nums ${stat.accent}`}>
                  {stat.value}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Secondary Executive Counters */}
      {isExecutiveOrStaff && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 py-4 px-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Registered Students</span>
            <span className="font-mono font-bold text-base text-slate-900 dark:text-white tabular-nums">
              {metrics.activeStudents}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Active Enrollments</span>
            <span className="font-mono font-bold text-base text-slate-900 dark:text-white tabular-nums">
              {metrics.totalEnrollments}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Faculty / Lecturers</span>
            <span className="font-mono font-bold text-base text-slate-900 dark:text-white tabular-nums">
              {metrics.lecturersCount}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('lead-dashboard')}
            className="text-left hover:opacity-80 cursor-pointer"
          >
            <span className="text-slate-500 dark:text-slate-400 block">CRM Leads Pipeline →</span>
            <span className="font-mono font-bold text-base text-[#1677FF] tabular-nums">
              {leads.filter((l) => !l.archived).length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('syllabus-list')}
            className="text-left hover:opacity-80 cursor-pointer"
          >
            <span className="text-slate-500 dark:text-slate-400 block">Published Syllabuses →</span>
            <span className="font-mono font-bold text-base text-slate-900 dark:text-white tabular-nums">
              {syllabuses.filter((s) => s.publishedStatus === 'published').length}
            </span>
          </button>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Net LKR Position</span>
            <span className="font-mono font-bold text-base text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatLkr(metrics.netBalanceLkr)}
            </span>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-violet-600" />
                2027 Course Catalogue Distribution by Academic Domain
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Live breakdown from Firestore courses collection
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={domainChartData} margin={{ top: 8, right: 12, left: -16, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-18} textAnchor="end" interval={0} height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Courses" fill="#6D28D9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-violet-600" />
            Certificate vs International Diploma Split
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Proportion of active 2027 academic levels
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={4}
                >
                  {categoryBreakdown.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 text-xs text-slate-600 dark:text-slate-300">
            {categoryBreakdown.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ backgroundColor: CHART_COLORS[idx] }}
                />
                <span>
                  {item.name}: <strong className="font-mono tabular-nums">{item.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRIVATE AI SUPER ADMIN / CEO ASSISTANT (Owner Only) */}
      {isOwner && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-violet-700 dark:text-violet-400" />
              <div>
                <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Private AI Super Admin Assistant (Owner / CEO Only)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Read-only operational insights backed by live Firestore data. Never deletes records, issues refunds, or alters permissions autonomously.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              'Summarize current 2027 admissions, verified LKR revenue, and pending payments.',
              'Which operational queues need Owner attention today?',
              'Give a branch and course catalog readiness report for the 2027 intake.',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={(e) => void handleAskCeoAssistant(e, q)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void handleAskCeoAssistant(e)} className="mt-4 flex gap-2">
            <input
              type="text"
              value={ceoQuestion}
              onChange={(e) => setCeoQuestion(e.target.value)}
              placeholder="Ask an operational question (e.g., How many applications and payments are pending?)"
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-600"
            />
            <button
              type="submit"
              disabled={ceoLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F172A] dark:bg-violet-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition cursor-pointer whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              {ceoLoading ? 'Analyzing...' : 'Ask Assistant'}
            </button>
          </form>

          {ceoError && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
              {ceoError}
            </div>
          )}

          {ceoResponse && (
            <div className="mt-5 p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {ceoResponse.answer}
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span>Source: {ceoResponse.dataSource}</span>
                <span>Period: {ceoResponse.reportingPeriod}</span>
                <span>Updated: {new Date(ceoResponse.lastUpdated).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
