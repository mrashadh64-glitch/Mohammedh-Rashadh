import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Code2,
  Cpu,
  GraduationCap,
  Layers,
  Megaphone,
  Palette,
  Sparkles,
  Target,
  Terminal,
  Users,
  Workflow,
} from 'lucide-react';
import { BRAND_IMAGES, INSTITUTE_INFO } from '../../data/catalogSeed';
import { PublicPage } from '../../lib/publicRoutes';
import {
  Branch,
  CmsItem,
  CommunityPost,
  Course,
  SpecialProgramme,
} from '../../types/lms';
import {
  CourseCard,
  CTASection,
  EventCard,
  FilterPanel,
  LecturerCard,
  NoticeCard,
  ProgrammeCard,
  PublicFacultyProfile,
  SearchBar,
  StatisticsSection,
  TestimonialCard,
} from './ui/PublicCards';

export type ExtendedPublicPage = PublicPage;

export interface LiveInstitutionStats {
  studentCount: number | null;
  lecturerCount: number;
  isAuthorizedLiveCount: boolean;
}

interface PublicHomeSectionsProps {
  courses: Course[];
  branches: Branch[];
  cmsItems: CmsItem[];
  showcasePosts: CommunityPost[];
  specialProgramme: SpecialProgramme;
  faculty: PublicFacultyProfile[];
  liveStats: LiveInstitutionStats;
  isSignedIn: boolean;
  comparedCourseIds: string[];
  onToggleCompare: (course: Course) => void;
  onNavigate: (page: PublicPage, param?: string) => void;
  onSelectDomainCourses: (domain: string) => void;
  onApplyForCourse: (course: Course) => void;
  onPortalAction: () => void;
}

export const PublicHomeSections: React.FC<PublicHomeSectionsProps> = React.memo(({
  courses,
  branches,
  cmsItems,
  showcasePosts,
  specialProgramme,
  faculty,
  liveStats,
  isSignedIn,
  comparedCourseIds,
  onToggleCompare,
  onNavigate,
  onSelectDomainCourses,
  onApplyForCourse,
  onPortalAction,
}) => {
  // Section 3 Popular Courses search, filters & sorting
  const [courseSearch, setCourseSearch] = useState('');
  const [courseCategory, setCourseCategory] = useState<'All' | 'Certificate' | 'Diploma' | 'Free'>('All');
  const [courseDomain, setCourseDomain] = useState<string>('All');
  const [courseMode, setCourseMode] = useState<'All' | 'Online' | 'Physical' | 'Hybrid'>('All');
  const [courseDuration, setCourseDuration] = useState<string>('All');
  const [courseSort, setCourseSort] = useState<'featured' | 'fee-asc' | 'fee-desc' | 'name'>('featured');

  // Subtle compositor-only scroll reveal for the Meet Our Founder section
  const founderSectionRef = useRef<HTMLElement | null>(null);
  const [founderVisible, setFounderVisible] = useState(false);

  useEffect(() => {
    const el = founderSectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setFounderVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setFounderVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const founderExpertiseAreas = [
    { label: 'Artificial Intelligence', icon: Cpu },
    { label: 'AI Automation', icon: Workflow },
    { label: 'Prompt Engineering', icon: Terminal },
    { label: 'Graphic Design', icon: Palette },
    { label: 'Web & App Development', icon: Code2 },
    { label: 'Technology Education', icon: GraduationCap },
  ];

  const domains = useMemo(() => {
    const s = new Set<string>();
    courses.forEach((c) => {
      if (c.domain) s.add(c.domain);
    });
    return ['All', ...Array.from(s).sort()];
  }, [courses]);

  const durations = useMemo(() => {
    const s = new Set<string>();
    courses.forEach((c) => {
      if (c.duration) s.add(c.duration);
    });
    return ['All', ...Array.from(s).sort()];
  }, [courses]);

  const filteredHomeCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    const list = courses.filter((c) => {
      if (courseCategory === 'Certificate' && c.category !== 'Certificate') return false;
      if (courseCategory === 'Diploma' && c.category !== 'Diploma') return false;
      if (courseCategory === 'Free' && !c.isFree) return false;
      if (courseDomain !== 'All' && c.domain !== courseDomain) return false;
      if (courseMode !== 'All' && c.mode !== courseMode) return false;
      if (courseDuration !== 'All' && c.duration !== courseDuration) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    });

    if (courseSort === 'fee-asc') return [...list].sort((a, b) => a.courseFeeLkr - b.courseFeeLkr);
    if (courseSort === 'fee-desc') return [...list].sort((a, b) => b.courseFeeLkr - a.courseFeeLkr);
    if (courseSort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [courses, courseSearch, courseCategory, courseDomain, courseMode, courseDuration, courseSort]);

  const eventsList = useMemo(
    () => cmsItems.filter((i) => i.itemType === 'Event').slice(0, 3),
    [cmsItems]
  );

  const noticesList = useMemo(
    () => cmsItems.filter((i) => i.itemType === 'News' || i.itemType === 'Poster' || i.itemType === 'Banner').slice(0, 4),
    [cmsItems]
  );

  const verifiedTestimonials = useMemo(
    () => cmsItems.filter((i) => i.itemType === 'Story'),
    [cmsItems]
  );

  const learningAreas = [
    {
      title: 'Artificial Intelligence & Automation',
      domain: 'AI & Automation',
      icon: Cpu,
      image: BRAND_IMAGES.card3dAiBrain,
      summary: 'Prompt engineering, applied AI workflows, and intelligent automation systems.',
    },
    {
      title: 'Graphic Design & Creative Technology',
      domain: 'Creative Design',
      icon: Palette,
      image: BRAND_IMAGES.card3dCreativeTech,
      summary: 'Brand design, Canva, Adobe Creative Suite, video editing, and content production.',
    },
    {
      title: 'Web & App Development',
      domain: 'IT & Software',
      icon: Layers,
      image: BRAND_IMAGES.card3dWebDev,
      summary: 'Modern web interfaces, full-stack software engineering, and cloud databases.',
    },
    {
      title: 'Digital Marketing',
      domain: 'Digital Marketing',
      icon: Megaphone,
      image: BRAND_IMAGES.careerInnovationCenter,
      summary: 'Social media strategy, e-commerce growth, and data-driven campaign execution.',
    },
    {
      title: 'Robotics & STEM',
      domain: 'AI & Automation',
      icon: Sparkles,
      image: BRAND_IMAGES.card3dRoboticsStem,
      summary: 'Practical robotics engineering, electronics prototyping, and youth STEM labs.',
    },
    {
      title: 'Professional Development',
      domain: 'Business & Management',
      icon: Briefcase,
      image: BRAND_IMAGES.aboutModernCampus,
      summary: 'Leadership, business management, psychology, public speaking, and career readiness.',
    },
  ];

  const verifiedStats = [
    {
      label: 'Active Students',
      value: liveStats.studentCount !== null ? liveStats.studentCount.toLocaleString() : 'Live LMS Roster',
      note:
        liveStats.studentCount !== null
          ? 'Verified count from live Firestore student registry'
          : 'Private roster synced inside authorized LMS dashboards',
    },
    {
      label: 'Published Courses',
      value: String(courses.length),
      note: 'Active Certificate & International Diploma programmes in database',
    },
    {
      label: 'Active Lecturers',
      value: String(liveStats.lecturerCount),
      note: liveStats.isAuthorizedLiveCount
        ? 'Verified active lecturers in Firestore'
        : 'Teaching divisions & specialist faculty teams',
    },
    {
      label: 'Active Branches',
      value: String(branches.length),
      note: 'Physical Sri Lanka centres & Global Online campus',
    },
  ];

  return (
    <div>
      {/* SECTION 1 – FUTURISTIC DARK NAVY HERO WITH FOUNDER VISUAL */}
      <section className="relative bg-[#101D35] text-white border-b border-slate-800 overflow-hidden">
        {/* Futuristic Electric-Blue Atmospheric Lighting & Digital Network Grid (GPU-light on mobile) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="hidden sm:block absolute -top-28 right-0 w-[540px] h-[540px] rounded-full opacity-35"
            style={{
              background:
                'radial-gradient(circle, rgba(22,119,255,0.68) 0%, rgba(56,189,248,0.18) 44%, rgba(16,29,53,0) 70%)',
            }}
          />
          <div
            className="hidden md:block absolute -bottom-32 -left-24 w-[420px] h-[420px] rounded-full opacity-20"
            style={{
              background:
                'radial-gradient(circle, rgba(22,119,255,0.5) 0%, rgba(16,29,53,0) 70%)',
            }}
          />
          <svg
            className="hidden sm:block absolute inset-0 w-full h-full opacity-[0.14]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="techman-hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path
                  d="M 48 0 L 0 0 0 48"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="0.6"
                  strokeOpacity="0.45"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#techman-hero-grid)" />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 sm:pt-18 sm:pb-16 lg:pt-20 lg:pb-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
            {/* Left Editorial Copy (Immediate First Paint) */}
            <div className="lg:col-span-6 space-y-5 sm:space-y-6 lg:pb-20">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
                {INSTITUTE_INFO.officialName} · {INSTITUTE_INFO.establishedLabel} · Sri Lanka
              </div>

              <h1
                className="font-extrabold tracking-tight text-white leading-[1.06]"
                style={{
                  fontSize: 'clamp(2.2rem, 4.4vw, 3.85rem)',
                  textWrap: 'balance',
                }}
              >
                BUILD YOUR FUTURE WITH TECHNOLOGY.
              </h1>

              <p className="text-lg sm:text-xl font-bold tracking-tight text-sky-300">
                Learn. Innovate. Create.
              </p>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                Explore technology, creativity and professional skill development with TECHMAN
                COLLEGE.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('courses')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#1677FF] hover:bg-blue-600 text-white text-sm font-semibold shadow-lg shadow-blue-950/50 transition cursor-pointer whitespace-nowrap"
                >
                  Explore Courses
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => (isSignedIn ? onPortalAction() : onNavigate('student-login'))}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#172A45] hover:bg-[#1e3557] border border-white/20 text-white text-sm font-semibold transition cursor-pointer whitespace-nowrap"
                >
                  <GraduationCap className="w-4 h-4 text-sky-400" />
                  {isSignedIn ? 'Open LMS Portal' : 'Student Login'}
                </button>
              </div>

              {/* Clean Quiet Metadata Bar */}
              <div className="pt-5 border-t border-white/10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
                <span>{courses.length} Published Courses</span>
                <span aria-hidden="true">·</span>
                <span>Online, Physical &amp; Hybrid Study</span>
                <span aria-hidden="true">·</span>
                <span>AI-Powered Student LMS</span>
              </div>
            </div>

            {/* Right Futuristic Founder Visual Stage (Lightweight Mobile + High-Priority LCP Image) */}
            <div className="lg:col-span-6 relative flex flex-col items-center lg:items-end justify-end">
              <div className="relative w-full max-w-[420px] sm:max-w-[520px] lg:max-w-none flex flex-col items-center justify-end pt-3 sm:pt-6">
                {/* Soft Futuristic AI Brain & Digital Network Halo Behind Portrait */}
                <div
                  className="pointer-events-none absolute inset-x-2 sm:inset-x-4 top-4 sm:top-6 bottom-6 rounded-[2rem] overflow-hidden border border-sky-400/20 bg-[#172A45]/70"
                  aria-hidden="true"
                >
                  <img
                    src={BRAND_IMAGES.card3dAiBrainHeroBg}
                    alt=""
                    width={560}
                    height={420}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="hidden sm:block w-full h-full object-cover opacity-25 mix-blend-screen scale-105"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 52% 38%, rgba(22,119,255,0.42) 0%, rgba(16,29,53,0.78) 62%, rgba(16,29,53,0.96) 100%)',
                    }}
                  />
                  {/* Subtle Digital Network Node Lines (Desktop/Tablet) */}
                  <svg
                    className="hidden sm:block absolute inset-0 w-full h-full opacity-40"
                    viewBox="0 0 520 520"
                    fill="none"
                  >
                    <circle cx="260" cy="230" r="175" stroke="#38BDF8" strokeOpacity="0.28" strokeDasharray="4 8" />
                    <circle cx="260" cy="230" r="220" stroke="#1677FF" strokeOpacity="0.22" />
                    <line x1="48" y1="120" x2="145" y2="175" stroke="#38BDF8" strokeOpacity="0.35" strokeWidth="1" />
                    <line x1="472" y1="138" x2="388" y2="190" stroke="#38BDF8" strokeOpacity="0.35" strokeWidth="1" />
                    <line x1="68" y1="365" x2="148" y2="330" stroke="#1677FF" strokeOpacity="0.4" strokeWidth="1" />
                    <circle cx="48" cy="120" r="3" fill="#38BDF8" fillOpacity="0.7" />
                    <circle cx="472" cy="138" r="3" fill="#38BDF8" fillOpacity="0.7" />
                    <circle cx="68" cy="365" r="2.5" fill="#1677FF" fillOpacity="0.8" />
                    <circle cx="448" cy="310" r="2.5" fill="#38BDF8" fillOpacity="0.65" />
                  </svg>
                </div>

                {/* Pure CSS Radial Electric-Blue Rim Light Glow (No Expensive Filter Blur on Mobile) */}
                <div
                  className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 w-72 h-72 sm:w-80 sm:h-80 rounded-full opacity-65"
                  aria-hidden="true"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(56,189,248,0.52) 0%, rgba(22,119,255,0.30) 45%, rgba(16,29,53,0) 72%)',
                  }}
                />

                {/* Responsive WebP Cutout of Mohammed Rashadh (Eager LCP, Zero CLS, Never Lazy-Loaded) */}
                <div className="relative z-10 w-full flex justify-center overflow-hidden rounded-b-3xl lg:rounded-b-none">
                  <picture>
                    <source
                      media="(max-width: 639px)"
                      srcSet={BRAND_IMAGES.founderPhotoCutoutMobile}
                      type="image/webp"
                    />
                    <img
                      src={BRAND_IMAGES.founderPhotoCutout}
                      alt="Mohammed Rashadh — Founder & CEO of TECHMAN COLLEGE"
                      width={732}
                      height={1280}
                      fetchPriority="high"
                      loading="eager"
                      decoding="sync"
                      referrerPolicy="no-referrer"
                      className="w-[270px] sm:w-[350px] lg:w-[400px] h-auto max-h-[520px] object-contain object-bottom select-none"
                      style={{
                        filter:
                          'drop-shadow(0 0 18px rgba(22, 119, 255, 0.34)) drop-shadow(0 16px 28px rgba(2, 6, 23, 0.68))',
                      }}
                    />
                  </picture>
                  {/* Smooth Bottom Deep-Navy Blend so Torso Anchors Cleanly */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#101D35] via-[#101D35]/65 to-transparent"
                    aria-hidden="true"
                  />
                </div>

                {/* Small Founder Identity Badge (Positioned Cleanly Below Shoulder — Never Overlapping Face) */}
                <div className="relative z-20 -mt-12 sm:-mt-14 mb-4 sm:mb-6 self-center sm:self-start sm:ml-6 rounded-xl bg-[#101D35]/94 border border-sky-400/30 px-4 py-2.5 shadow-xl shadow-slate-950/60">
                  <div className="text-xs sm:text-sm font-extrabold tracking-wide text-white uppercase">
                    MOHAMMED RASHADH
                  </div>
                  <div className="text-[11px] font-medium text-sky-300 mt-0.5">
                    Founder &amp; CEO – TECHMAN COLLEGE
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 – FEATURED LEARNING AREAS */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0A1324]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Featured Learning Areas
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                Six Disciplines Built for the Digital Economy
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('academics')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1677FF] dark:text-sky-400 hover:underline self-start md:self-auto cursor-pointer"
            >
              Explore All Divisions
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {learningAreas.map((area) => {
              const Icon = area.icon;
              return (
                <button
                  key={area.title}
                  type="button"
                  onClick={() => onSelectDomainCourses(area.domain)}
                  className="group text-left rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 overflow-hidden hover:border-[#1677FF]/50 hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-[16/10] bg-[#EAF1FC] dark:bg-[#172A45] overflow-hidden">
                      <img
                        src={area.image}
                        alt={area.title}
                        width={800}
                        height={500}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                    <div className="p-6">
                      <div className="w-10 h-10 rounded-xl bg-[#EAF1FC] dark:bg-[#172A45] text-[#1677FF] dark:text-sky-400 flex items-center justify-center mb-3">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-extrabold text-[#101D35] dark:text-white group-hover:text-[#1677FF] dark:group-hover:text-sky-400 transition-colors">
                        {area.title}
                      </h3>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {area.summary}
                      </p>
                    </div>
                  </div>
                  <div className="px-6 pb-5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 inline-flex items-center gap-1.5">
                    Explore Pathway
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 3 – POPULAR COURSES (LIVE FIREBASE CATALOGUE) */}
      <section className="py-16 sm:py-20 bg-[#F5F7FA] dark:bg-[#0D172B] border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Live Course Catalogue
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                Popular Certificate &amp; Diploma Courses
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1677FF] dark:text-sky-400 hover:underline self-start md:self-auto cursor-pointer"
            >
              View All {courses.length} Courses
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <SearchBar
              value={courseSearch}
              onChange={setCourseSearch}
              placeholder="Search published courses by title, code, or domain..."
            />
            <FilterPanel
              category={courseCategory}
              onCategoryChange={setCourseCategory}
              domain={courseDomain}
              domains={domains}
              onDomainChange={setCourseDomain}
              mode={courseMode}
              onModeChange={setCourseMode}
              duration={courseDuration}
              durations={durations}
              onDurationChange={setCourseDuration}
              sortBy={courseSort}
              onSortChange={setCourseSort}
            />
          </div>

          {filteredHomeCourses.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-600 dark:text-slate-300">
              No published courses matched your current filter selection.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredHomeCourses.slice(0, 6).map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isCompared={comparedCourseIds.includes(course.id)}
                  onToggleCompare={onToggleCompare}
                  onViewDetails={(c) => onNavigate('course-detail', c.id)}
                  onApply={onApplyForCourse}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4 – ABOUT TECHMAN COLLEGE */}
      <section className="py-16 sm:py-24 bg-white dark:bg-[#0A1324]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            <div className="lg:col-span-6">
              <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-lg">
                <img
                  src={BRAND_IMAGES.aboutModernCampus}
                  alt="TECHMAN COLLEGE collaborative campus learning environment"
                  width={960}
                  height={720}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[4/3] object-cover"
                />
                <div className="absolute bottom-4 left-4 right-4 sm:right-auto rounded-2xl bg-[#101D35]/95 text-white px-5 py-3.5 border border-white/15">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                    {INSTITUTE_INFO.officialName}
                  </div>
                  <div className="text-base font-extrabold mt-0.5">
                    {INSTITUTE_INFO.establishedLabel} · Sri Lanka
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                  About TECHMAN COLLEGE
                </p>
                <h2
                  className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white leading-tight"
                  style={{ textWrap: 'balance' }}
                >
                  EDUCATION THAT BUILDS THE FUTURE.
                </h2>
              </div>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Established in 2021, TECHMAN COLLEGE is a modern Sri Lankan educational institution
                focused on Artificial Intelligence, technology, creative design, and career-ready
                professional skill development.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200/80 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#1677FF] dark:text-sky-400">
                    Our Mission
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Deliver accessible, practical, project-driven education that equips learners
                    with real digital competence and ethical leadership.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200/80 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#1677FF] dark:text-sky-400">
                    Our Vision
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Build a generation of innovators, creators, and problem-solvers prepared to lead
                    across Sri Lanka and global digital industries.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#EAF1FC]/75 dark:bg-[#172A45] border border-[#1677FF]/20 space-y-2">
                <div className="text-xs font-bold text-[#101D35] dark:text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#1677FF] dark:text-sky-400" />
                  Practical Education Philosophy
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  Every module emphasizes hands-on builds, live trainer mentorship, structured
                  assessments, and continuous AI-assisted revision rather than passive rote theory.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('about')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#101D35] hover:bg-[#172A45] dark:bg-[#1677FF] dark:hover:bg-blue-600 text-white text-xs font-semibold transition cursor-pointer"
              >
                Discover TECHMAN COLLEGE
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4B – MEET OUR FOUNDER (DEDICATED FOUNDER & CEO PROFILE SECTION) */}
      <section
        ref={founderSectionRef}
        className="py-16 sm:py-24 bg-[#F5F7FA] dark:bg-[#0D172B] border-t border-slate-200/80 dark:border-slate-800"
      >
        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
            founderVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              {/* Left Column – Original Uploaded Photograph in Natural Portrait Framing */}
              <div className="lg:col-span-5 bg-[#101D35] p-6 sm:p-8 flex items-center justify-center">
                <div className="w-full max-w-[380px] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shadow-slate-950/50 bg-[#172A45]">
                  <picture>
                    <source
                      media="(max-width: 639px)"
                      srcSet={BRAND_IMAGES.founderPhotoOriginalMobile}
                      type="image/webp"
                    />
                    <img
                      src={BRAND_IMAGES.founderPhotoOriginal}
                      alt="Mohammed Rashadh — Founder & CEO of TECHMAN COLLEGE"
                      width={640}
                      height={853}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="w-full aspect-[3/4] object-cover object-top"
                    />
                  </picture>
                </div>
              </div>

              {/* Right Column – Founder & CEO Editorial Profile Details */}
              <div className="lg:col-span-7 p-7 sm:p-10 lg:p-12 flex flex-col justify-center space-y-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#1677FF] dark:text-sky-400">
                    MEET OUR FOUNDER
                  </p>
                  <h2 className="mt-2.5 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white uppercase">
                    MOHAMMED RASHADH
                  </h2>
                  <p className="mt-1.5 text-base font-semibold text-slate-700 dark:text-slate-200">
                    Founder &amp; CEO – TECHMAN COLLEGE
                  </p>
                  <p className="mt-2 text-xs sm:text-sm font-bold uppercase tracking-[0.14em] text-[#1677FF] dark:text-sky-400">
                    AI ENGINEER &amp; CREATIVE TECHNOLOGIST
                  </p>
                </div>

                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  Since establishing TECHMAN COLLEGE in 2021, Mohammed Rashadh has led curriculum
                  innovation, hands-on AI mentorship, and Sri Lanka&apos;s islandwide Free Skill
                  Development Programme—bridging practical engineering, creative design, and career
                  readiness for the next generation of digital leaders.
                </p>

                {/* Professional Areas */}
                <div className="pt-2 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Professional Areas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {founderExpertiseAreas.map((area) => {
                      const AreaIcon = area.icon;
                      return (
                        <div
                          key={area.label}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F5F7FA] dark:bg-[#172A45] border border-slate-200/80 dark:border-slate-700/70"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#EAF1FC] dark:bg-[#101D35] text-[#1677FF] dark:text-sky-400 flex items-center justify-center shrink-0">
                            <AreaIcon className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold text-[#101D35] dark:text-white">
                            {area.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('lecturer-detail', 'mohammed-rashadh')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#101D35] hover:bg-[#172A45] dark:bg-[#1677FF] dark:hover:bg-blue-600 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    View Founder Profile
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('free-skill-programme')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#EAF1FC] hover:bg-[#dce8fb] dark:bg-[#172A45] dark:hover:bg-[#1e3557] text-[#101D35] dark:text-sky-300 text-xs font-semibold transition cursor-pointer"
                  >
                    Free Skill Development Programme
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 – COLLEGE STATISTICS (REAL FIREBASE DATA ONLY) */}
      <StatisticsSection stats={verifiedStats} />

      {/* SECTION 6 – FEATURED PROGRAMME (TECHMAN FREE SKILL DEVELOPMENT PROGRAMME) */}
      <section className="py-16 sm:py-24 bg-[#F5F7FA] dark:bg-[#0D172B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Featured Islandwide Initiative
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                {specialProgramme.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('free-skill-programme')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1677FF] dark:text-sky-400 hover:underline self-start md:self-auto cursor-pointer"
            >
              Full Programme Page &amp; Host Request
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <ProgrammeCard
            programme={specialProgramme}
            onExplore={() => onNavigate('free-skill-programme')}
          />

          {/* 12 Official Programme Modules */}
          <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-[#101D35] dark:text-white">
                  12 Official Skill Development Modules
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Delivered physically at host institutions across Sri Lanka on Saturdays &amp;
                  Sundays — 100% Free of Charge.
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {specialProgramme.feeBadge}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {specialProgramme.modules.map((mod) => (
                <div
                  key={mod.number}
                  className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#172A45] border border-slate-200/80 dark:border-slate-700/70"
                >
                  <div className="text-[11px] font-mono font-bold text-[#1677FF] dark:text-sky-400">
                    {mod.number}. {mod.relatedDomain || 'Skill Track'}
                  </div>
                  <div className="mt-1 text-sm font-bold text-[#101D35] dark:text-white">
                    {mod.title}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-snug">
                    {mod.shortDescription}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7 – WHY CHOOSE TECHMAN COLLEGE? */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0A1324]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
              Why Choose TECHMAN COLLEGE?
            </p>
            <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
              Structured Around Practical Outcomes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                num: '01.',
                title: 'Practical Learning',
                desc: 'Every course centers on real software builds, design portfolios, and applied assignments evaluated by trainers.',
              },
              {
                num: '02.',
                title: 'Technology-Focused Education',
                desc: 'Modern syllabi integrating AI workflows, automation tools, and current industry software from day one.',
              },
              {
                num: '03.',
                title: 'Professional Skill Development',
                desc: 'Technical training paired with communication, leadership, entrepreneurship, and client-ready discipline.',
              },
              {
                num: '04.',
                title: 'Experienced Trainers',
                desc: 'Learn directly from practicing engineers, creative technologists, and dedicated college lecturers.',
              },
              {
                num: '05.',
                title: 'Flexible Learning',
                desc: 'Online, physical branch, and hybrid batch options backed by recorded sessions and 24/7 AI LMS support.',
              },
              {
                num: '06.',
                title: 'Career Development',
                desc: 'Dedicated CV guidance, interview preparation, portfolio reviews, and freelancing pathways inside the Student Portal.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800"
              >
                <div className="text-xs font-mono font-bold text-[#1677FF] dark:text-sky-400">
                  {item.num}
                </div>
                <h3 className="mt-2 text-lg font-extrabold text-[#101D35] dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 8 – LECTURERS */}
      <section className="py-16 sm:py-20 bg-[#F5F7FA] dark:bg-[#0D172B] border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Faculty &amp; Trainers
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                Meet Our Lecturers &amp; Chief Trainer
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('lecturers')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1677FF] dark:text-sky-400 hover:underline self-start md:self-auto cursor-pointer"
            >
              All Faculty Profiles
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {faculty.slice(0, 6).map((lec) => (
              <LecturerCard
                key={lec.id}
                lecturer={lec}
                onViewProfile={(l) => onNavigate('lecturer-detail', l.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 9 – STUDENT ACHIEVEMENTS */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0A1324]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Student Outcomes &amp; Credentials
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                Student Achievements &amp; Verified Credentials
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('achievements')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
              >
                View Achievements
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-2xl bg-[#101D35] text-white p-7 flex flex-col justify-between gap-6">
              <div>
                <Award className="w-7 h-7 text-sky-400" />
                <h3 className="mt-4 text-xl font-extrabold">
                  Public QR Certificate Registry
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Every eligible TECHMAN COLLEGE graduate receives a uniquely numbered digital
                  certificate verifiable online by employers and institutions. Student showcase
                  highlights are published only with explicit learner consent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('verify')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-xs font-semibold self-start cursor-pointer"
              >
                Verify a Certificate
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {showcasePosts.length > 0 ? (
                showcasePosts.slice(0, 4).map((post) => (
                  <article
                    key={post.id}
                    className="rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="text-[11px] font-semibold text-[#1677FF] dark:text-sky-400">
                        Approved Student Project · {post.authorName}
                      </div>
                      <h3 className="mt-1.5 text-sm font-bold text-[#101D35] dark:text-white">
                        {post.title}
                      </h3>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                        {post.body}
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <>
                  <div className="rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-2">
                    <BookOpen className="w-5 h-5 text-[#1677FF] dark:text-sky-400" />
                    <h3 className="text-base font-bold text-[#101D35] dark:text-white">
                      Capstone Project Portfolios
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Students complete real web apps, AI automations, and visual brand kits inside
                      the LMS before graduation.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-2">
                    <Users className="w-5 h-5 text-[#1677FF] dark:text-sky-400" />
                    <h3 className="text-base font-bold text-[#101D35] dark:text-white">
                      Consent-Protected Publishing
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Only approved student work and consented learner stories are featured publicly
                      on the college showcase.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 10 – EVENTS AND NOTICES */}
      <section className="py-16 sm:py-20 bg-[#F5F7FA] dark:bg-[#0D172B] border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Events Column */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                    Upcoming Schedule
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-[#101D35] dark:text-white">
                    Events, Workshops &amp; Webinars
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('events')}
                  className="text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
                >
                  All Events →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {eventsList.map((ev) => (
                  <EventCard
                    key={ev.id}
                    item={ev}
                    onOpen={(item) => onNavigate('event-detail', item.id)}
                  />
                ))}
              </div>
            </div>

            {/* Notices Column */}
            <div className="lg:col-span-5 space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                    Official Board
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-[#101D35] dark:text-white">
                    Latest Notices &amp; Updates
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('notices')}
                  className="text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
                >
                  All Notices →
                </button>
              </div>
              <div className="space-y-3">
                {noticesList.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    item={notice}
                    onOpen={(item) => onNavigate('event-detail', item.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 11 – CAREER CENTRE */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0A1324]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Career Centre
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                Preparing Graduates for Industry &amp; Global Remote Careers
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                From practical portfolio building to ATS-ready resumes and mock interviews, our
                Career Centre bridges classroom training with real professional placements.
              </p>

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-semibold text-[#101D35] dark:text-slate-200">
                {[
                  'Career Guidance & Roadmaps',
                  'Internship Opportunities',
                  'Job Readiness Pathways',
                  'Portfolio Development',
                  'Interview Preparation',
                  'AI Career Coach in LMS',
                ].map((pt) => (
                  <li key={pt} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1677FF] shrink-0" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('career')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#101D35] hover:bg-[#172A45] dark:bg-[#1677FF] dark:hover:bg-blue-600 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Explore Career Centre
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <img
                src={BRAND_IMAGES.careerInnovationCenter}
                alt="TECHMAN COLLEGE Career Centre advising session"
                width={960}
                height={720}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                className="w-full aspect-[4/3] object-cover rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 12 – VERIFIED TESTIMONIALS */}
      {verifiedTestimonials.length > 0 && (
        <section className="py-16 sm:py-20 bg-[#F5F7FA] dark:bg-[#0D172B] border-t border-slate-200/80 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
                Verified Student Voices
              </p>
              <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
                Learner Stories From TECHMAN COLLEGE
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {verifiedTestimonials.slice(0, 3).map((item) => (
                <TestimonialCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 13 – ADMISSION CTA */}
      <CTASection onNavigate={onNavigate} />
    </div>
  );
});
