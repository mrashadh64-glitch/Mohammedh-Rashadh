import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  Library,
  Menu,
  QrCode,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { INSTITUTE_INFO } from '../../../data/catalogSeed';
import { PublicPage } from '../../../lib/publicRoutes';
import { ThemeToggleButton } from '../../common/PlatformWidgets';

export interface MainHeaderProps {
  page: PublicPage;
  courseCount: number;
  isSignedIn: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onNavigate: (page: PublicPage, param?: string) => void;
  onSelectDomainCourses: (domain: string) => void;
  onSelectCategoryCourses: (category: 'All' | 'Certificate' | 'Diploma' | 'Free') => void;
  onOpenSearch: () => void;
  onPortalAction: () => void;
}

interface MegaMenuItem {
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  onClick: () => void;
  highlight?: boolean;
}

export const MegaMenu: React.FC<{
  title: string;
  subtitle: string;
  items: MegaMenuItem[];
  footerCta?: { label: string; onClick: () => void };
}> = ({ title, subtitle, items, footerCta }) => (
  <div
    role="menu"
    className="absolute left-1/2 -translate-x-1/2 mt-3 w-[540px] max-w-[90vw] rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-700/80 shadow-[0_24px_60px_rgba(16,29,53,0.18)] p-5 z-50"
  >
    <div className="pb-3 mb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF] dark:text-sky-400">
          {title}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
      </div>
      {footerCta && (
        <button
          type="button"
          onClick={footerCta.onClick}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline whitespace-nowrap cursor-pointer"
        >
          {footerCta.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={item.onClick}
            className={`group text-left p-3 rounded-xl transition cursor-pointer flex items-start gap-3 ${
              item.highlight
                ? 'bg-[#EAF1FC] dark:bg-[#172A45] hover:bg-blue-100/80 dark:hover:bg-[#1e3557]'
                : 'hover:bg-[#F5F7FA] dark:hover:bg-[#172A45]/80'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                item.highlight
                  ? 'bg-[#1677FF] text-white'
                  : 'bg-[#EAF1FC] dark:bg-[#172A45] text-[#1677FF] dark:text-sky-400 group-hover:bg-[#1677FF] group-hover:text-white transition-colors'
              }`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#101D35] dark:text-white leading-snug">
                {item.label}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                {item.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export const MobileNavigation: React.FC<{
  open: boolean;
  page: PublicPage;
  courseCount: number;
  isSignedIn: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onClose: () => void;
  onNavigate: (page: PublicPage, param?: string) => void;
  onPortalAction: () => void;
}> = ({
  open,
  page,
  courseCount,
  isSignedIn,
  theme,
  toggleTheme,
  onClose,
  onNavigate,
  onPortalAction,
}) => {
  if (!open) return null;

  const links: { page: PublicPage; label: string; group: string }[] = [
    { page: 'home', label: 'Home', group: 'Main' },
    { page: 'about', label: 'About TECHMAN COLLEGE', group: 'Main' },
    { page: 'academics', label: 'Academics & Learning Areas', group: 'Academics' },
    { page: 'courses', label: `Courses (${courseCount} Programmes)`, group: 'Academics' },
    { page: 'programmes', label: 'Special Programmes', group: 'Academics' },
    { page: 'free-skill-programme', label: 'Free Skill Development (100% Free)', group: 'Academics' },
    { page: 'lecturers', label: 'Lecturers & Trainers', group: 'Academics' },
    { page: 'library', label: 'Digital Library', group: 'Academics' },
    { page: 'verify', label: 'Certificate Verification (QR)', group: 'Academics' },
    { page: 'campus', label: 'Campuses & Branches', group: 'Campus & Life' },
    { page: 'gallery', label: 'College Gallery', group: 'Campus & Life' },
    { page: 'achievements', label: 'Student Achievements', group: 'Campus & Life' },
    { page: 'career', label: 'Career Centre', group: 'Campus & Life' },
    { page: 'events', label: 'Events & Workshops', group: 'Campus & Life' },
    { page: 'notices', label: 'Official Notices', group: 'Campus & Life' },
    { page: 'contact', label: 'Contact Admissions', group: 'Campus & Life' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden flex justify-end bg-[#101D35]/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#101D35] h-full overflow-y-auto shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="TECHMAN COLLEGE logo" width={32} height={32} className="w-8 h-8 rounded-lg" />
            <span className="text-sm font-extrabold tracking-tight text-[#101D35] dark:text-white">
              {INSTITUTE_INFO.officialName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#172A45] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 space-y-1">
          {links.map((item) => {
            const active = page === item.page;
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => {
                  onNavigate(item.page);
                  onClose();
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer flex items-center justify-between ${
                  active
                    ? 'bg-[#EAF1FC] dark:bg-[#172A45] text-[#1677FF] dark:text-sky-400 font-semibold'
                    : 'text-[#101D35] dark:text-slate-200 hover:bg-[#F5F7FA] dark:hover:bg-[#172A45]/70'
                }`}
              >
                <span>{item.label}</span>
                {active && <ArrowRight className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 bg-[#F5F7FA] dark:bg-[#0B1528]">
          <button
            type="button"
            onClick={() => {
              onNavigate('admissions');
              onClose();
            }}
            className="w-full py-3 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-sm font-semibold transition cursor-pointer"
          >
            Apply Now
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (isSignedIn) {
                  onPortalAction();
                } else {
                  onNavigate('student-login');
                }
              }}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#172A45] text-sm font-semibold text-[#101D35] dark:text-white cursor-pointer"
            >
              {isSignedIn ? 'Open LMS Portal' : 'Student Login'}
            </button>
            <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const MainHeader: React.FC<MainHeaderProps> = React.memo(({
  page,
  courseCount,
  isSignedIn,
  theme,
  toggleTheme,
  onNavigate,
  onSelectDomainCourses,
  onSelectCategoryCourses,
  onOpenSearch,
  onPortalAction,
}) => {
  const [openMenu, setOpenMenu] = useState<'academics' | 'campus' | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  const go = (target: PublicPage, param?: string) => {
    setOpenMenu(null);
    setMobileOpen(false);
    onNavigate(target, param);
  };

  const navBtnClass = (active: boolean) =>
    `px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1677FF] ${
      active
        ? 'text-[#1677FF] dark:text-sky-400 font-semibold'
        : 'text-slate-700 dark:text-slate-200 hover:text-[#101D35] dark:hover:text-white'
    }`;

  const academicsActive =
    page === 'academics' || page === 'library' || page === 'verify';
  const campusActive =
    page === 'campus' || page === 'gallery' || page === 'achievements' || page === 'notices';

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-all duration-200 border-b ${
          scrolled
            ? 'bg-white/95 dark:bg-[#101D35]/95 backdrop-blur-md border-slate-200/90 dark:border-slate-800 shadow-[0_6px_24px_rgba(16,29,53,0.06)]'
            : 'bg-white dark:bg-[#101D35] border-slate-200/70 dark:border-slate-800/80'
        }`}
      >
        <div
          ref={navContainerRef}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"
        >
          {/* Left: Official TECHMAN COLLEGE Logo + Single-Line Brand Name */}
          <button
            type="button"
            onClick={() => go('home')}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer group focus-visible:outline-2 focus-visible:outline-[#1677FF] rounded-lg"
          >
            <img
              src="/icon.svg"
              alt="TECHMAN COLLEGE logo"
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg shrink-0"
            />
            <span className="text-sm sm:text-[15px] font-extrabold tracking-tight text-[#101D35] dark:text-white group-hover:text-[#1677FF] dark:group-hover:text-sky-400 transition-colors whitespace-nowrap shrink-0">
              {INSTITUTE_INFO.officialName}
            </span>
          </button>

          {/* Center: Responsive Single-Line Desktop Navigation with Mega Menus */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-0.5 xl:gap-1"
          >
            <button type="button" onClick={() => go('home')} className={navBtnClass(page === 'home')}>
              Home
            </button>
            <button type="button" onClick={() => go('about')} className={navBtnClass(page === 'about')}>
              About
            </button>

            {/* Academics Mega Menu */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={openMenu === 'academics'}
                aria-haspopup="menu"
                onClick={() => setOpenMenu((m) => (m === 'academics' ? null : 'academics'))}
                className={`${navBtnClass(academicsActive)} inline-flex items-center gap-1`}
              >
                Academics
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    openMenu === 'academics' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openMenu === 'academics' && (
                <MegaMenu
                  title="Academics & Learning Divisions"
                  subtitle="Structured practical pathways across technology, design, and career skills"
                  footerCta={{ label: 'Explore Academics', onClick: () => go('academics') }}
                  items={[
                    {
                      label: 'Academic Divisions',
                      description: 'AI, Creative Tech, Web & App, Digital Marketing, Robotics & STEM',
                      icon: Layers,
                      onClick: () => go('academics'),
                    },
                    {
                      label: `All Published Courses (${courseCount})`,
                      description: 'Certificate & International Diploma catalogues with comparison',
                      icon: BookOpen,
                      onClick: () => {
                        setOpenMenu(null);
                        onSelectCategoryCourses('All');
                      },
                    },
                    {
                      label: 'Free Skill Development Programme',
                      description: '100% Free weekend physical programme across Sri Lanka',
                      icon: Sparkles,
                      highlight: true,
                      onClick: () => go('free-skill-programme'),
                    },
                    {
                      label: 'Lecturers & Trainers',
                      description: 'Meet verified faculty, Chief Trainer, and subject specialists',
                      icon: Users,
                      onClick: () => go('lecturers'),
                    },
                    {
                      label: 'Digital Library',
                      description: 'Study handbooks, PDF notes, and LMS learning resources',
                      icon: Library,
                      onClick: () => go('library'),
                    },
                    {
                      label: 'Certificate Verification (QR)',
                      description: 'Instant public lookup for issued TECHMAN COLLEGE credentials',
                      icon: QrCode,
                      onClick: () => go('verify'),
                    },
                  ]}
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => go('courses')}
              className={navBtnClass(page === 'courses' || page === 'course-detail')}
            >
              Courses
            </button>
            <button
              type="button"
              onClick={() => go('programmes')}
              className={navBtnClass(page === 'programmes' || page === 'free-skill-programme')}
            >
              Programmes
            </button>
            <button
              type="button"
              onClick={() => go('lecturers')}
              className={`${navBtnClass(page === 'lecturers' || page === 'lecturer-detail')} hidden xl:inline-flex`}
            >
              Lecturers
            </button>

            {/* Campus Mega Menu */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={openMenu === 'campus'}
                aria-haspopup="menu"
                onClick={() => setOpenMenu((m) => (m === 'campus' ? null : 'campus'))}
                className={`${navBtnClass(campusActive)} inline-flex items-center gap-1`}
              >
                Campus
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    openMenu === 'campus' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openMenu === 'campus' && (
                <MegaMenu
                  title="Campus, Student Life & Career"
                  subtitle="Physical Sri Lanka branches, Global Online campus, events, and outcomes"
                  footerCta={{ label: 'Explore Campuses', onClick: () => go('campus') }}
                  items={[
                    {
                      label: 'Branches & Online Campus',
                      description: 'Colombo HQ, Panadura, Kalutara, Kandy & Global Online',
                      icon: Building2,
                      onClick: () => go('campus'),
                    },
                    {
                      label: 'College Gallery',
                      description: 'Computer labs, creative studios, seminars & official posters',
                      icon: ImageIcon,
                      onClick: () => go('gallery'),
                    },
                    {
                      label: 'Student Achievements',
                      description: 'Approved student projects, portfolios & graduate credentials',
                      icon: Award,
                      onClick: () => go('achievements'),
                    },
                    {
                      label: 'Career Centre',
                      description: 'Internships, jobs, CV builder & interview preparation',
                      icon: Briefcase,
                      onClick: () => go('career'),
                    },
                    {
                      label: 'Events & Workshops',
                      description: 'Upcoming seminars, webinars, and open day sessions',
                      icon: Calendar,
                      onClick: () => go('events'),
                    },
                    {
                      label: 'Official Notices',
                      description: 'Admission circulars, scholarship alerts & college updates',
                      icon: FileText,
                      onClick: () => go('notices'),
                    },
                  ]}
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => go('career')}
              className={`${navBtnClass(page === 'career')} hidden xl:inline-flex`}
            >
              Career
            </button>
            <button
              type="button"
              onClick={() => go('events')}
              className={`${navBtnClass(page === 'events' || page === 'event-detail')} hidden xl:inline-flex`}
            >
              Events
            </button>
            <button
              type="button"
              onClick={() => go('contact')}
              className={navBtnClass(page === 'contact')}
            >
              Contact
            </button>
          </nav>

          {/* Right: Search, Student Login, Apply Now, Mobile Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search courses, programmes, and notices"
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-[#EAF1FC] dark:hover:bg-[#172A45] hover:text-[#1677FF] dark:hover:text-sky-400 transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (isSignedIn) {
                  onPortalAction();
                } else {
                  go('student-login');
                }
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white hover:border-[#1677FF] dark:hover:border-sky-400 hover:bg-[#EAF1FC]/60 dark:hover:bg-[#172A45] transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5 text-[#1677FF] dark:text-sky-400" />
              {isSignedIn ? 'Open LMS' : 'Student Login'}
            </button>

            <button
              type="button"
              onClick={() => go('admissions')}
              className="px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              Apply Now
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-[#101D35] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#172A45] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <MobileNavigation
        open={mobileOpen}
        page={page}
        courseCount={courseCount}
        isSignedIn={isSignedIn}
        theme={theme}
        toggleTheme={toggleTheme}
        onClose={() => setMobileOpen(false)}
        onNavigate={onNavigate}
        onPortalAction={onPortalAction}
      />
    </>
  );
});
