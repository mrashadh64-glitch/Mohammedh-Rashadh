import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  GitCompare,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  QrCode,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { collection, doc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  formatLkr,
  makeSafeId,
  verifyCertificateByNumber,
} from '../../lib/firestoreService';
import {
  fetchPublicCatalogOptimized,
  getCachedPublicCatalogSync,
} from '../../lib/publicCache';
import {
  BRAND_IMAGES,
  CAMPUS_GALLERY,
  CampusGalleryItem,
  DEFAULT_FREE_SKILL_PROGRAMME,
  INSTITUTE_INFO,
  SEED_BRANCHES,
  SEED_CMS_ITEMS,
  SEED_COURSES,
} from '../../data/catalogSeed';
import {
  Branch,
  Certificate,
  CmsItem,
  CommunityPost,
  Course,
  SpecialProgramme,
  UserProfile,
} from '../../types/lms';
import { useAuth } from '../../context/AuthContext';
import {
  applyRouteSeo,
  buildPublicPath,
  parsePublicPathname,
  PublicPage as RouterPublicPage,
} from '../../lib/publicRoutes';
import { LiveInstitutionStats, PublicHomeSections } from './PublicHomeSections';
import { MainHeader } from './ui/MainHeader';
import { MainFooter } from './ui/MainFooter';
import {
  CourseCard,
  FilterPanel,
  NoticeCard,
  PublicFacultyProfile,
  SearchBar,
  StudentPortalEntry,
} from './ui/PublicCards';

// Route-based code splitting for secondary public pages & heavy QR/wizard widgets
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((m) => ({ default: m.QRCodeSVG }))
);
const FreeSkillProgrammePage = lazy(() =>
  import('./FreeSkillProgrammePage').then((m) => ({ default: m.FreeSkillProgrammePage }))
);
const AdmissionWizard = lazy(() =>
  import('./ui/AdmissionWizard').then((m) => ({ default: m.AdmissionWizard }))
);
const AcademicsPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.AcademicsPage }))
);
const AchievementsPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.AchievementsPage }))
);
const CampusPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.CampusPage }))
);
const CareerPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.CareerPage }))
);
const CourseDetailPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.CourseDetailPage }))
);
const EventDetailPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.EventDetailPage }))
);
const EventsPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.EventsPage }))
);
const LecturerDetailPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.LecturerDetailPage }))
);
const LecturersPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.LecturersPage }))
);
const LibraryPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.LibraryPage }))
);
const PrivacyPolicyPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const ProgrammesPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.ProgrammesPage }))
);
const TermsPage = lazy(() =>
  import('./ui/PublicDetailPages').then((m) => ({ default: m.TermsPage }))
);

const RouteSkeleton: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-6">
    <div className="h-9 w-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
    <div className="h-4 w-96 max-w-full rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-64 rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 animate-pulse"
        />
      ))}
    </div>
  </div>
);

export type PublicPage = RouterPublicPage;

interface PublicWebsiteProps {
  initialPage?: PublicPage;
  initialParam?: string;
  initialVerifyCert?: string;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onEnterPortal: () => void;
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  initialPage = 'home',
  initialParam = '',
  initialVerifyCert = '',
  theme,
  toggleTheme,
  onEnterPortal,
}) => {
  const { firebaseUser, profile, isOwner, signInWithGoogle, authError } = useAuth();
  const [page, setPage] = useState<PublicPage>(initialPage);
  const [routeParam, setRouteParam] = useState<string>(initialParam);

  // Live Firestore collections (hydrated synchronously from TTL cache or seed fallback)
  const initialCache = useMemo(() => getCachedPublicCatalogSync(), []);
  const [courses, setCourses] = useState<Course[]>(initialCache?.courses || SEED_COURSES);
  const [branches, setBranches] = useState<Branch[]>(initialCache?.branches || SEED_BRANCHES);
  const [cmsItems, setCmsItems] = useState<CmsItem[]>(initialCache?.cmsItems || SEED_CMS_ITEMS);
  const [specialProgramme, setSpecialProgramme] = useState<SpecialProgramme>(
    initialCache?.specialProgramme || DEFAULT_FREE_SKILL_PROGRAMME
  );
  const [showcasePosts, setShowcasePosts] = useState<CommunityPost[]>(
    initialCache?.showcasePosts || []
  );
  const [lecturers, setLecturers] = useState<UserProfile[]>([]);
  const [liveStats, setLiveStats] = useState<LiveInstitutionStats>({
    studentCount: null,
    lecturerCount: 9,
    isAuthorizedLiveCount: false,
  });
  const ownerCountsLoadedRef = useRef(false);

  // Course Discovery filters & Comparison
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Certificate' | 'Diploma' | 'Free'>('All');
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [modeFilter, setModeFilter] = useState<'All' | 'Online' | 'Physical' | 'Hybrid'>('All');
  const [durationFilter, setDurationFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'featured' | 'fee-asc' | 'fee-desc' | 'name'>('featured');
  const [comparedCourseIds, setComparedCourseIds] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Admission preselection
  const [preselectedCourseId, setPreselectedCourseId] = useState<string | undefined>(undefined);

  // Quick Search & Gallery Lightbox
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<CampusGalleryItem | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<
    'All' | 'Campus Life' | 'Labs & Studios' | 'Official Posters'
  >('All');
  const [noticesPageFilter, setNoticesPageFilter] = useState<string>('All');

  // Certificate Verification
  const [certInput, setCertInput] = useState(initialVerifyCert);
  const [certLoading, setCertLoading] = useState(false);
  const [certResult, setCertResult] = useState<Certificate | null | 'not_found'>(null);

  // Contact Inquiry Form
  const [inqName, setInqName] = useState('');
  const [inqEmail, setInqEmail] = useState('');
  const [inqPhone, setInqPhone] = useState('');
  const [inqSubject, setInqSubject] = useState('');
  const [inqMessage, setInqMessage] = useState('');
  const [inqSent, setInqSent] = useState(false);
  const [inqSubmitting, setInqSubmitting] = useState(false);

  // Load bounded public Firestore collections via deduplicated 5-minute TTL cache
  useEffect(() => {
    let active = true;
    const loadPublicData = async () => {
      const payload = await fetchPublicCatalogOptimized();
      if (!active) return;
      setCourses(payload.courses);
      setBranches(payload.branches);
      setCmsItems(payload.cmsItems);
      setShowcasePosts(payload.showcasePosts);
      setSpecialProgramme(payload.specialProgramme);
      const uniqueDomains = new Set(payload.courses.map((c) => c.domain).filter(Boolean)).size;
      setLiveStats((prev) => ({
        ...prev,
        lecturerCount: prev.isAuthorizedLiveCount ? prev.lecturerCount : Math.max(uniqueDomains, 1),
      }));
    };
    void loadPublicData();
    return () => {
      active = false;
    };
  }, []);

  // Authorized Owner live roster aggregates (guarded to run ONCE per session — never re-fetching on course updates)
  useEffect(() => {
    if (!isOwner || ownerCountsLoadedRef.current) return;
    ownerCountsLoadedRef.current = true;
    const loadAuthorizedCounts = async () => {
      try {
        const [usersSnap, migratedSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), limit(500))),
          getDocs(query(collection(db, 'migratedStudents'), limit(500))),
        ]);
        const users = usersSnap.docs.map((d) => d.data() as UserProfile);
        const lmsStudents = users.filter((u) => u.role === 'STUDENT').length;
        const lecturerProfiles = users.filter((u) => u.role === 'LECTURER');
        setLecturers(lecturerProfiles);
        setLiveStats((prev) => ({
          studentCount: lmsStudents + migratedSnap.size,
          lecturerCount:
            lecturerProfiles.length > 0 ? lecturerProfiles.length : prev.lecturerCount,
          isAuthorizedLiveCount: lecturerProfiles.length > 0,
        }));
      } catch {
        ownerCountsLoadedRef.current = false;
      }
    };
    void loadAuthorizedCounts();
  }, [isOwner]);

  // Sync browser back/forward history across all 23 routes
  useEffect(() => {
    const onPopState = () => {
      const parsed = parsePublicPathname(window.location.pathname, window.location.search);
      setPage(parsed.page);
      setRouteParam(parsed.param || '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Build verified faculty list (Chief Trainer + live Firebase lecturers + real teaching divisions)
  const publicFaculty = useMemo<PublicFacultyProfile[]>(() => {
    const list: PublicFacultyProfile[] = [
      {
        id: 'mohammed-rashadh',
        name: specialProgramme.trainerName,
        designation: specialProgramme.trainerPosition,
        expertise: specialProgramme.trainerTitle,
        assignedCourses: courses
          .filter((c) => c.domain === 'AI & Automation' || c.domain === 'Creative Design')
          .slice(0, 6)
          .map((c) => c.name),
        bio:
          specialProgramme.trainerBio ||
          'Founder & CEO of TECHMAN COLLEGE — AI Engineer & Creative Technologist leading islandwide skill development across Sri Lanka.',
        photoUrl: specialProgramme.trainerPhotoUrl || BRAND_IMAGES.trainerMohammedRashadh,
        isVerifiedDb: true,
      },
    ];

    if (lecturers.length > 0) {
      lecturers.forEach((u) => {
        list.push({
          id: u.uid,
          name: u.displayName,
          designation: u.designation || 'College Lecturer',
          expertise: 'Verified TECHMAN COLLEGE Faculty',
          assignedCourses: courses.slice(0, 3).map((c) => c.name),
          bio: `${u.displayName} serves as an active faculty member at TECHMAN COLLEGE supporting practical cohorts and LMS assessments.`,
          photoUrl: u.photoURL,
          isVerifiedDb: true,
        });
      });
    } else {
      const domainGroups: { id: string; title: string; domain: string; bio: string }[] = [
        {
          id: 'faculty-ai-automation',
          title: 'Artificial Intelligence & Automation Faculty',
          domain: 'AI & Automation',
          bio: 'Mentors guiding students through Generative AI, Prompt Engineering, and intelligent workflow automation.',
        },
        {
          id: 'faculty-web-software',
          title: 'IT & Software Engineering Faculty',
          domain: 'IT & Software',
          bio: 'Practicing developers leading hands-on web development, cloud database, and software engineering cohorts.',
        },
        {
          id: 'faculty-creative-design',
          title: 'Creative Design & Media Faculty',
          domain: 'Creative Design',
          bio: 'Design practitioners instructing Graphic Design, Canva, Adobe Creative Suite, and digital video production.',
        },
        {
          id: 'faculty-business-marketing',
          title: 'Business, Marketing & Psychology Faculty',
          domain: 'Digital Marketing',
          bio: 'Industry advisors supporting digital marketing, e-commerce, business leadership, and human psychology tracks.',
        },
      ];
      domainGroups.forEach((g) => {
        const domainCourses = courses.filter((c) => c.domain === g.domain).map((c) => c.name);
        list.push({
          id: g.id,
          name: g.title,
          designation: 'Academic Teaching Division · TECHMAN COLLEGE',
          expertise: g.domain,
          assignedCourses: domainCourses,
          bio: g.bio,
        });
      });
    }

    return list;
  }, [specialProgramme, lecturers, courses]);

  const activeCourseDetail = useMemo(
    () => (page === 'course-detail' ? courses.find((c) => c.id === routeParam) : undefined),
    [page, routeParam, courses]
  );

  const activeLecturerDetail = useMemo(
    () => (page === 'lecturer-detail' ? publicFaculty.find((f) => f.id === routeParam) : undefined),
    [page, routeParam, publicFaculty]
  );

  const activeEventDetail = useMemo(
    () => (page === 'event-detail' ? cmsItems.find((i) => i.id === routeParam) : undefined),
    [page, routeParam, cmsItems]
  );

  // Apply dynamic SEO title, description, OpenGraph, and Canonical URL on every route transition
  useEffect(() => {
    const customTitle =
      page === 'course-detail'
        ? activeCourseDetail?.name
        : page === 'lecturer-detail'
          ? activeLecturerDetail?.name
          : page === 'event-detail'
            ? activeEventDetail?.title
            : undefined;
    const customDesc =
      page === 'course-detail'
        ? activeCourseDetail?.description
        : page === 'lecturer-detail'
          ? activeLecturerDetail?.bio
          : page === 'event-detail'
            ? activeEventDetail?.summary
            : undefined;

    applyRouteSeo(page, routeParam || undefined, customTitle, customDesc);
  }, [page, routeParam, activeCourseDetail, activeLecturerDetail, activeEventDetail]);

  const navigate = (next: PublicPage, param?: string) => {
    setPage(next);
    setRouteParam(param || '');
    const targetPath = buildPublicPath(next, param);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectDomainCourses = (domain: string) => {
    setDomainFilter(domain);
    setCategoryFilter('All');
    setModeFilter('All');
    setDurationFilter('All');
    navigate('courses');
  };

  const handleSelectCategoryCourses = (category: 'All' | 'Certificate' | 'Diploma' | 'Free') => {
    setCategoryFilter(category);
    setDomainFilter('All');
    navigate('courses');
  };

  const handleApplyForCourse = (course: Course) => {
    setPreselectedCourseId(course.id);
    navigate('admissions');
  };

  const handleToggleCompare = (course: Course) => {
    setComparedCourseIds((prev) => {
      if (prev.includes(course.id)) return prev.filter((id) => id !== course.id);
      if (prev.length >= 3) return [...prev.slice(1), course.id];
      return [...prev, course.id];
    });
  };

  const handleVerifyCert = async (codeOverride?: string) => {
    const cleaned = (codeOverride ?? certInput).trim().toUpperCase();
    if (!cleaned) return;
    setCertLoading(true);
    setCertResult(null);
    try {
      const cert = await verifyCertificateByNumber(cleaned);
      setCertResult(cert || 'not_found');
    } finally {
      setCertLoading(false);
    }
  };

  useEffect(() => {
    if (initialVerifyCert) {
      setCertInput(initialVerifyCert);
      void handleVerifyCert(initialVerifyCert);
    }
  }, [initialVerifyCert]);

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inqName.trim() || !inqEmail.trim() || !inqSubject.trim() || !inqMessage.trim()) return;
    setInqSubmitting(true);
    try {
      const id = makeSafeId('INQ');
      await setDoc(doc(db, 'inquiries', id), {
        name: inqName.trim().slice(0, 120),
        email: inqEmail.trim().toLowerCase().slice(0, 160),
        phone: inqPhone.trim().slice(0, 32),
        subject: inqSubject.trim().slice(0, 160),
        message: inqMessage.trim().slice(0, 2000),
        status: 'new',
        createdAt: new Date().toISOString(),
      });
      setInqSent(true);
      setInqName('');
      setInqEmail('');
      setInqPhone('');
      setInqSubject('');
      setInqMessage('');
    } finally {
      setInqSubmitting(false);
    }
  };

  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    courses.forEach((c) => {
      if (c.domain) set.add(c.domain);
    });
    return ['All', ...Array.from(set).sort()];
  }, [courses]);

  const availableDurations = useMemo(() => {
    const set = new Set<string>();
    courses.forEach((c) => {
      if (c.duration) set.add(c.duration);
    });
    return ['All', ...Array.from(set).sort()];
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = courses.filter((c) => {
      if (categoryFilter === 'Certificate' && c.category !== 'Certificate') return false;
      if (categoryFilter === 'Diploma' && c.category !== 'Diploma') return false;
      if (categoryFilter === 'Free' && c.courseFeeLkr !== 0) return false;
      if (domainFilter !== 'All' && c.domain !== domainFilter) return false;
      if (modeFilter !== 'All' && c.mode !== modeFilter) return false;
      if (durationFilter !== 'All' && c.duration !== durationFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    });

    if (sortBy === 'fee-asc') return [...list].sort((a, b) => a.courseFeeLkr - b.courseFeeLkr);
    if (sortBy === 'fee-desc') return [...list].sort((a, b) => b.courseFeeLkr - a.courseFeeLkr);
    if (sortBy === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [courses, searchQuery, categoryFilter, domainFilter, modeFilter, durationFilter, sortBy]);

  const comparedCourses = useMemo(
    () => courses.filter((c) => comparedCourseIds.includes(c.id)),
    [courses, comparedCourseIds]
  );

  const quickSearchResults = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) {
      return {
        matchedCourses: courses.slice(0, 5),
        matchedNotices: cmsItems.filter((i) => i.itemType === 'Event' || i.itemType === 'News').slice(0, 3),
      };
    }
    return {
      matchedCourses: courses
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            (c.domain || '').toLowerCase().includes(q)
        )
        .slice(0, 6),
      matchedNotices: cmsItems
        .filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.summary.toLowerCase().includes(q) ||
            (i.category || '').toLowerCase().includes(q)
        )
        .slice(0, 4),
    };
  }, [quickSearchQuery, courses, cmsItems]);

  const allNotices = useMemo(
    () => cmsItems.filter((i) => i.itemType !== 'FAQ' && i.itemType !== 'Story'),
    [cmsItems]
  );

  const filteredNotices = useMemo(() => {
    if (noticesPageFilter === 'All') return allNotices;
    return allNotices.filter(
      (n) =>
        (n.category || '').toLowerCase() === noticesPageFilter.toLowerCase() ||
        n.itemType.toLowerCase() === noticesPageFilter.toLowerCase()
    );
  }, [allNotices, noticesPageFilter]);

  const filteredGallery = useMemo(() => {
    if (galleryFilter === 'All') return CAMPUS_GALLERY;
    return CAMPUS_GALLERY.filter((g) => g.category === galleryFilter);
  }, [galleryFilter]);

  const isSignedIn = Boolean(firebaseUser && profile);

  const handleGoogleSignIn = async () => {
    const ok = await signInWithGoogle();
    if (ok) {
      onEnterPortal();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0A1324] text-[#101D35] dark:text-slate-100">
      <MainHeader
        page={page}
        courseCount={courses.length}
        isSignedIn={isSignedIn}
        theme={theme}
        toggleTheme={toggleTheme}
        onNavigate={navigate}
        onSelectDomainCourses={handleSelectDomainCourses}
        onSelectCategoryCourses={handleSelectCategoryCourses}
        onOpenSearch={() => setQuickSearchOpen(true)}
        onPortalAction={onEnterPortal}
      />

      <main className="flex-1">
        <Suspense fallback={<RouteSkeleton />}>
          {/* 1. / (HOMEPAGE) */}
        {page === 'home' && (
          <PublicHomeSections
            courses={courses}
            branches={branches}
            cmsItems={cmsItems}
            showcasePosts={showcasePosts}
            specialProgramme={specialProgramme}
            faculty={publicFaculty}
            liveStats={liveStats}
            isSignedIn={isSignedIn}
            comparedCourseIds={comparedCourseIds}
            onToggleCompare={handleToggleCompare}
            onNavigate={navigate}
            onSelectDomainCourses={handleSelectDomainCourses}
            onApplyForCourse={handleApplyForCourse}
            onPortalAction={onEnterPortal}
          />
        )}

        {/* 2. /about */}
        {page === 'about' && (
          <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
              <div className="rounded-3xl bg-[#101D35] text-white p-8 sm:p-14 border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">
                    {INSTITUTE_INFO.officialName} · {INSTITUTE_INFO.establishedLabel}
                  </p>
                  <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                    EDUCATION THAT BUILDS THE FUTURE.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                    Founded in 2021 in Sri Lanka, TECHMAN COLLEGE equips students, youth, and
                    professionals with hands-on skills across Artificial Intelligence, Software
                    Development, Creative Technology, and Career Leadership.
                  </p>
                </div>
                <div className="lg:col-span-5">
                  <img
                    src={BRAND_IMAGES.aboutModernCampus}
                    alt="TECHMAN COLLEGE collaborative learning environment"
                    width={960}
                    height={720}
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full aspect-[4/3] object-cover rounded-2xl border border-white/15"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    title: 'Our Mission',
                    body: 'Provide practical, accessible, industry-aligned digital education paired with ethical mentorship and modern LMS learning tools.',
                  },
                  {
                    title: 'Our Vision',
                    body: 'Cultivate skilled Sri Lankan innovators, designers, and engineers ready to thrive in local and international digital economies.',
                  },
                  {
                    title: 'Learning Philosophy',
                    body: 'Project-first training supported by real-world tools, structured trainer feedback, and 24/7 course-aware AI study assistance.',
                  },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-2"
                  >
                    <h2 className="text-lg font-extrabold text-[#101D35] dark:text-white">
                      {card.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center">
                <div className="lg:col-span-4 bg-[#101D35] p-6 flex items-center justify-center">
                  <img
                    src={BRAND_IMAGES.founderPhotoOriginal}
                    alt="Mohammed Rashadh — Founder & CEO of TECHMAN COLLEGE"
                    width={640}
                    height={853}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    className="w-full max-w-[300px] aspect-[3/4] object-cover object-top rounded-2xl border border-white/15"
                  />
                </div>
                <div className="lg:col-span-8 p-6 sm:p-8 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1677FF] dark:text-sky-400">
                      MEET OUR FOUNDER
                    </p>
                    <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-[#101D35] dark:text-white uppercase">
                      MOHAMMED RASHADH
                    </h2>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                      Founder &amp; CEO – TECHMAN COLLEGE · AI ENGINEER &amp; CREATIVE TECHNOLOGIST
                    </p>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Leading TECHMAN COLLEGE since 2021 across Artificial Intelligence, AI Automation,
                    Prompt Engineering, Graphic Design, Web &amp; App Development, and Technology
                    Education.
                  </p>
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => navigate('lecturer-detail', 'mohammed-rashadh')}
                      className="px-4 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      View Founder Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('lecturers')}
                      className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
                    >
                      Meet Lecturers
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('campus')}
                      className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
                    >
                      Explore Campuses
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. /academics */}
        {page === 'academics' && (
          <AcademicsPage
            courses={courses}
            onSelectDomainCourses={handleSelectDomainCourses}
            onNavigate={navigate}
          />
        )}

        {/* 4. /courses */}
        {page === 'courses' && (
          <section className="py-12 sm:py-16 bg-[#F5F7FA] dark:bg-[#0A1324]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                    {INSTITUTE_INFO.officialName} · Official Catalogue
                  </p>
                  <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                    Course Discovery &amp; Comparison
                  </h1>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Showing {filteredCourses.length} of {courses.length} published Certificate &amp;
                    International Diploma courses.
                  </p>
                </div>

                {comparedCourses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompareModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#101D35] dark:bg-[#1677FF] text-white text-xs font-semibold cursor-pointer self-start"
                  >
                    <GitCompare className="w-4 h-4" />
                    Compare Selected ({comparedCourses.length})
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by course title, code, domain, or syllabus topic..."
                />
                <FilterPanel
                  category={categoryFilter}
                  onCategoryChange={setCategoryFilter}
                  domain={domainFilter}
                  domains={availableDomains}
                  onDomainChange={setDomainFilter}
                  mode={modeFilter}
                  onModeChange={setModeFilter}
                  duration={durationFilter}
                  durations={availableDurations}
                  onDurationChange={setDurationFilter}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
              </div>

              {filteredCourses.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No published courses matched your active filters.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('All');
                      setDomainFilter('All');
                      setModeFilter('All');
                      setDurationFilter('All');
                    }}
                    className="px-4 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCourses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      isCompared={comparedCourseIds.includes(course.id)}
                      onToggleCompare={handleToggleCompare}
                      onViewDetails={(c) => navigate('course-detail', c.id)}
                      onApply={handleApplyForCourse}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 5. /courses/:slug */}
        {page === 'course-detail' && (
          <CourseDetailPage
            course={activeCourseDetail}
            relatedCourses={courses.filter(
              (c) =>
                activeCourseDetail &&
                c.id !== activeCourseDetail.id &&
                c.domain === activeCourseDetail.domain
            )}
            faculty={publicFaculty}
            onNavigate={navigate}
            onApply={handleApplyForCourse}
          />
        )}

        {/* 6. /programmes */}
        {page === 'programmes' && (
          <ProgrammesPage
            programme={specialProgramme}
            freeCourses={courses.filter((c) => c.courseFeeLkr === 0)}
            onNavigate={navigate}
            onApply={handleApplyForCourse}
          />
        )}

        {/* 7. /programmes/free-skill-development */}
        {page === 'free-skill-programme' && (
          <FreeSkillProgrammePage
            programme={specialProgramme}
            courses={courses}
            onOpenCourseDetail={(c) => navigate('course-detail', c.id)}
            onSelectDomainCourses={handleSelectDomainCourses}
            onNavigateCourses={() => navigate('courses')}
          />
        )}

        {/* 8 & 9. /lecturers & /lecturers/:id */}
        {page === 'lecturers' && (
          <LecturersPage faculty={publicFaculty} onNavigate={navigate} />
        )}
        {page === 'lecturer-detail' && (
          <LecturerDetailPage
            lecturer={activeLecturerDetail}
            courses={courses}
            onNavigate={navigate}
            onApply={handleApplyForCourse}
          />
        )}

        {/* 10. /admissions */}
        {page === 'admissions' && (
          <AdmissionWizard
            courses={courses}
            branches={branches}
            specialProgramme={specialProgramme}
            preselectedCourseId={preselectedCourseId}
          />
        )}

        {/* 11. /campus */}
        {page === 'campus' && <CampusPage branches={branches} onNavigate={navigate} />}

        {/* 12. /gallery */}
        {page === 'gallery' && (
          <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                    Campus &amp; Official Media
                  </p>
                  <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                    TECHMAN COLLEGE Gallery
                  </h1>
                </div>
                <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800">
                  {(['All', 'Campus Life', 'Labs & Studios', 'Official Posters'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setGalleryFilter(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          galleryFilter === cat
                            ? 'bg-[#101D35] dark:bg-[#1677FF] text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGallery.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedGalleryItem(item)}
                    className="group text-left rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:border-[#1677FF]/40 transition cursor-pointer"
                  >
                    <div className="aspect-[4/3] bg-[#EAF1FC] dark:bg-[#172A45] overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        width={960}
                        height={720}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                    <div className="p-4">
                      <div className="text-[11px] font-semibold text-[#1677FF] dark:text-sky-400">
                        {item.category}
                      </div>
                      <h2 className="mt-1 text-sm font-bold text-[#101D35] dark:text-white">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {item.caption}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 13. /achievements */}
        {page === 'achievements' && (
          <AchievementsPage
            showcasePosts={showcasePosts}
            stories={cmsItems.filter((i) => i.itemType === 'Story')}
            onNavigate={navigate}
          />
        )}

        {/* 14 & 15. /events & /events/:slug */}
        {page === 'events' && (
          <EventsPage
            events={cmsItems.filter((i) => i.itemType === 'Event' || i.itemType === 'News')}
            onNavigate={navigate}
          />
        )}
        {page === 'event-detail' && (
          <EventDetailPage item={activeEventDetail} onNavigate={navigate} />
        )}

        {/* 16. /career */}
        {page === 'career' && (
          <CareerPage
            isSignedIn={isSignedIn}
            onNavigate={navigate}
            onPortalAction={onEnterPortal}
          />
        )}

        {/* 17. /library */}
        {page === 'library' && (
          <LibraryPage
            courses={courses}
            isSignedIn={isSignedIn}
            onNavigate={navigate}
            onPortalAction={onEnterPortal}
          />
        )}

        {/* 18. /notices */}
        {page === 'notices' && (
          <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                    Official Bulletin
                  </p>
                  <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#101D35] dark:text-white">
                    College Notices &amp; Circulars
                  </h1>
                </div>
                <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800">
                  {['All', 'News', 'Event', 'Poster'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNoticesPageFilter(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        noticesPageFilter === cat
                          ? 'bg-[#101D35] dark:bg-[#1677FF] text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {filteredNotices.map((n) => (
                  <NoticeCard
                    key={n.id}
                    item={n}
                    onOpen={(item) => navigate('event-detail', item.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 19. /contact */}
        {page === 'contact' && (
          <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-5 space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                    Admissions &amp; Support Desk
                  </p>
                  <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#101D35] dark:text-white">
                    Contact TECHMAN COLLEGE
                  </h1>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Connect with our counselors for course advice, LKR installment details, free
                    skill programme hosting, or certificate verification support.
                  </p>
                </div>

                <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-[#1677FF] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-500">Hotline &amp; WhatsApp</div>
                      <div className="font-mono font-bold text-[#101D35] dark:text-white">
                        {INSTITUTE_INFO.phone}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-[#1677FF] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-500">Official Email</div>
                      <div className="font-semibold text-[#101D35] dark:text-white">
                        {INSTITUTE_INFO.publicEmail}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="w-5 h-5 text-[#1677FF] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-500">Official Portal</div>
                      <div className="font-semibold text-[#101D35] dark:text-white">
                        {INSTITUTE_INFO.website}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-[#1677FF] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-500">Campuses</div>
                      <div className="font-semibold text-[#101D35] dark:text-white">
                        Colombo HQ · Panadura · Kalutara · Kandy · Global Online
                      </div>
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/${INSTITUTE_INFO.whatsappDigits}?text=${encodeURIComponent(
                      'Hello TECHMAN COLLEGE, I would like information about your courses.'
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Message Admissions on WhatsApp
                  </a>
                </div>
              </div>

              <div className="lg:col-span-7">
                <form
                  onSubmit={handleSendInquiry}
                  className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4"
                >
                  <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white">
                    Send an Online Inquiry
                  </h2>
                  {inqSent && (
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
                      Thank you! Your inquiry has been securely logged with TECHMAN COLLEGE
                      Admissions.
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      required
                      value={inqName}
                      onChange={(e) => setInqName(e.target.value)}
                      placeholder="Your Full Name *"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                    />
                    <input
                      type="email"
                      required
                      value={inqEmail}
                      onChange={(e) => setInqEmail(e.target.value)}
                      placeholder="Email Address *"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="tel"
                      value={inqPhone}
                      onChange={(e) => setInqPhone(e.target.value)}
                      placeholder="Phone / WhatsApp"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={inqSubject}
                      onChange={(e) => setInqSubject(e.target.value)}
                      placeholder="Subject *"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                    />
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={inqMessage}
                    onChange={(e) => setInqMessage(e.target.value)}
                    placeholder="Tell us which programme or service you need assistance with..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                  />
                  <button
                    type="submit"
                    disabled={inqSubmitting}
                    className="px-6 py-3 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-sm font-semibold transition cursor-pointer"
                  >
                    {inqSubmitting ? 'Sending Inquiry...' : 'Submit Inquiry'}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* 20. /student-login */}
        {page === 'student-login' && (
          <StudentPortalEntry
            isSignedIn={isSignedIn}
            userDisplayName={profile?.displayName}
            userRole={profile?.role}
            authError={authError}
            onGoogleSignIn={handleGoogleSignIn}
            onOpenPortal={onEnterPortal}
            onNavigate={navigate}
          />
        )}

        {/* 21. /certificate-verification */}
        {page === 'verify' && (
          <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="text-center space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                  Public Credential Registry
                </p>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-[#101D35] dark:text-white">
                  QR Certificate Verification
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Verify the authenticity of any certificate issued by TECHMAN COLLEGE using its
                  unique certificate number.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleVerifyCert();
                }}
                className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row gap-3"
              >
                <div className="relative flex-1">
                  <QrCode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={certInput}
                    onChange={(e) => setCertInput(e.target.value)}
                    placeholder="Enter Certificate Number (e.g., TMC-2027-...)"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm font-mono uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={certLoading}
                  className="px-6 py-2.5 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {certLoading ? 'Verifying...' : 'Verify Credential'}
                </button>
              </form>

              {certResult === 'not_found' && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-6 text-xs text-amber-800 dark:text-amber-300 text-center">
                  No active certificate record matched that number. Please check the code carefully
                  or contact {INSTITUTE_INFO.publicEmail}.
                </div>
              )}

              {certResult && certResult !== 'not_found' && (
                <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-emerald-200 dark:border-emerald-800 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-sm">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                      {certResult.status === 'Revoked'
                        ? 'REVOKED CREDENTIAL'
                        : 'VERIFIED OFFICIAL CERTIFICATE'}
                    </div>
                    <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white">
                      {certResult.studentName}
                    </h2>
                    <div className="text-slate-600 dark:text-slate-300">
                      Programme: <strong>{certResult.courseName}</strong>
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Certificate No: {certResult.certificateNumber} · Issued:{' '}
                      {certResult.issueDate}
                    </div>
                    {certResult.category && (
                      <div className="text-xs font-semibold text-[#1677FF] dark:text-sky-400">
                        Qualification Level: {certResult.category}
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 shrink-0">
                    <QRCodeSVG
                      value={`${window.location.origin}/certificate-verification?verify=${encodeURIComponent(
                        certResult.certificateNumber
                      )}`}
                      size={96}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 22 & 23. /privacy-policy & /terms */}
        {page === 'privacy-policy' && <PrivacyPolicyPage onNavigate={navigate} />}
        {page === 'terms' && <TermsPage onNavigate={navigate} />}
        </Suspense>
      </main>

      {/* FLOATING COURSE COMPARISON BAR */}
      {comparedCourses.length > 0 && !compareModalOpen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-2xl rounded-2xl bg-[#101D35] text-white border border-white/15 shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs min-w-0">
            <span className="font-bold text-sky-400">
              Comparing {comparedCourses.length} course{comparedCourses.length > 1 ? 's' : ''}:
            </span>{' '}
            <span className="text-slate-300 truncate">
              {comparedCourses.map((c) => c.code).join(' · ')}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCompareModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-xs font-semibold cursor-pointer"
            >
              Compare Now
            </button>
            <button
              type="button"
              onClick={() => setComparedCourseIds([])}
              aria-label="Clear comparison"
              className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <MainFooter
        courseCount={courses.length}
        isSignedIn={isSignedIn}
        theme={theme}
        toggleTheme={toggleTheme}
        onNavigate={navigate}
        onSelectDomainCourses={handleSelectDomainCourses}
        onPortalAction={onEnterPortal}
      />

      {/* QUICK SEARCH MODAL */}
      {quickSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#101D35]/70 p-4 pt-16 sm:pt-24 overflow-y-auto"
          onClick={() => setQuickSearchOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Search className="w-5 h-5 text-[#1677FF] shrink-0" />
              <input
                type="text"
                autoFocus
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                placeholder="Search TECHMAN COLLEGE courses, modules, or notices..."
                className="flex-1 bg-transparent text-sm text-[#101D35] dark:text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setQuickSearchOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#101D35] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[65vh] overflow-y-auto space-y-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Published Courses
                </div>
                <div className="space-y-1.5">
                  {quickSearchResults.matchedCourses.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setQuickSearchOpen(false);
                        navigate('course-detail', c.id);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#EAF1FC] dark:hover:bg-[#172A45] flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#101D35] dark:text-white truncate">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {c.category} · {c.duration} · {c.mode}
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#1677FF] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
              {quickSearchResults.matchedNotices.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Events &amp; Notices
                  </div>
                  <div className="space-y-1.5">
                    {quickSearchResults.matchedNotices.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setQuickSearchOpen(false);
                          navigate('event-detail', n.id);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#EAF1FC] dark:hover:bg-[#172A45] text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
                      >
                        {n.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COURSE COMPARISON MODAL */}
      {compareModalOpen && comparedCourses.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#101D35]/75 p-4 overflow-y-auto"
          onClick={() => setCompareModalOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#101D35] dark:text-white">
                Side-by-Side Course Comparison
              </h2>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#172A45] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 pr-4 text-slate-500 font-semibold">Criteria</th>
                    {comparedCourses.map((c) => (
                      <th key={c.id} className="py-3 px-4 font-extrabold text-[#101D35] dark:text-white min-w-[200px]">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Category</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4 font-semibold">{c.category}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Department</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4">{c.domain}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Duration</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4">{c.duration}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Study Mode</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4">{c.mode}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Tuition Fee</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4 font-mono font-bold text-[#1677FF] dark:text-sky-400">
                        {c.courseFeeLkr === 0 ? '100% Free' : formatLkr(c.courseFeeLkr)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Modules</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4">
                        {(c.syllabusTopics || []).length} verified modules
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-slate-500">Action</td>
                    {comparedCourses.map((c) => (
                      <td key={c.id} className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setCompareModalOpen(false);
                            handleApplyForCourse(c);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-[#1677FF] text-white font-semibold cursor-pointer"
                        >
                          Apply Now
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* GALLERY LIGHTBOX */}
      {selectedGalleryItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#101D35]/85 p-4"
          onClick={() => setSelectedGalleryItem(null)}
        >
          <div
            className="max-w-3xl w-full rounded-2xl bg-white dark:bg-[#101D35] overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedGalleryItem.imageUrl}
              alt={selectedGalleryItem.title}
              referrerPolicy="no-referrer"
              className="w-full max-h-[70vh] object-contain bg-[#101D35]"
            />
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#1677FF] dark:text-sky-400">
                  {selectedGalleryItem.category}
                </div>
                <div className="text-base font-bold text-[#101D35] dark:text-white">
                  {selectedGalleryItem.title}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {selectedGalleryItem.caption}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGalleryItem(null)}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
