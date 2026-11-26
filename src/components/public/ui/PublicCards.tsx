import React from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';
import { BRAND_IMAGES, INSTITUTE_INFO } from '../../../data/catalogSeed';
import { formatLkr } from '../../../lib/firestoreService';
import { CmsItem, Course, SpecialProgramme } from '../../../types/lms';
import { getCourseSlug, getEventSlug, PublicPage } from '../../../lib/publicRoutes';

export interface PublicFacultyProfile {
  id: string;
  name: string;
  designation: string;
  expertise: string;
  assignedCourses: string[];
  bio: string;
  photoUrl?: string;
  isVerifiedDb?: boolean;
}

export function getCourseCoverImage(course: Course): string {
  if (course.imageUrl) return course.imageUrl;
  const domain = (course.domain || '').toLowerCase();
  if (domain.includes('ai')) return BRAND_IMAGES.card3dAiBrain;
  if (domain.includes('creative') || domain.includes('design')) return BRAND_IMAGES.card3dCreativeTech;
  if (domain.includes('it') || domain.includes('software') || domain.includes('web')) {
    return BRAND_IMAGES.card3dWebDev;
  }
  if (domain.includes('marketing') || domain.includes('business')) {
    return BRAND_IMAGES.careerInnovationCenter;
  }
  if (domain.includes('robotics') || domain.includes('stem')) {
    return BRAND_IMAGES.card3dRoboticsStem;
  }
  return BRAND_IMAGES.aboutModernCampus;
}

/* 1. COURSE CARD */
export const CourseCard: React.FC<{
  course: Course;
  isCompared?: boolean;
  onToggleCompare?: (course: Course) => void;
  onViewDetails: (course: Course) => void;
  onApply: (course: Course) => void;
}> = React.memo(({ course, isCompared, onToggleCompare, onViewDetails, onApply }) => {
  const isFree = course.courseFeeLkr === 0;
  const cover = getCourseCoverImage(course);

  return (
    <article className="group flex flex-col justify-between rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-lg hover:border-[#1677FF]/40 dark:hover:border-[#1677FF]/50 transition-all duration-200">
      <div>
        <div className="relative aspect-[16/10] bg-[#EAF1FC] dark:bg-[#172A45] overflow-hidden">
          <img
            src={cover}
            alt={course.name}
            width={800}
            height={500}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101D35]/70 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-[11px] font-semibold text-white">
            <span className="truncate">{course.domain}</span>
            <span className="font-mono shrink-0">{course.code}</span>
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-[#1677FF] dark:text-sky-400">
              {course.category}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {course.duration}
            </span>
            <span aria-hidden="true">·</span>
            <span>{course.mode}</span>
          </div>

          <h3 className="mt-2.5 text-base font-bold text-[#101D35] dark:text-white leading-snug line-clamp-2 group-hover:text-[#1677FF] dark:group-hover:text-sky-400 transition-colors">
            <button
              type="button"
              onClick={() => onViewDetails(course)}
              className="text-left cursor-pointer"
            >
              {course.name}
            </button>
          </h3>

          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
            {course.description}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {isFree ? 'Course Fee' : 'Tuition Fee'}
            </div>
            <div
              className={`text-sm font-bold font-mono tabular-nums ${
                isFree
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-[#101D35] dark:text-white'
              }`}
            >
              {isFree ? '100% Free Tuition' : formatLkr(course.courseFeeLkr)}
            </div>
          </div>

          {onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(course)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                isCompared
                  ? 'bg-[#101D35] dark:bg-[#1677FF] text-white border-[#101D35] dark:border-[#1677FF]'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#1677FF]'
              }`}
            >
              {isCompared ? 'Comparing' : 'Compare'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onViewDetails(course)}
            className="py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-slate-200 hover:border-[#1677FF] hover:text-[#1677FF] dark:hover:text-sky-400 transition cursor-pointer"
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => onApply(course)}
            className="py-2 px-3 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            Apply Now
          </button>
        </div>
      </div>
    </article>
  );
});

/* 2. PROGRAMME CARD */
export const ProgrammeCard: React.FC<{
  programme: SpecialProgramme;
  onExplore: () => void;
}> = ({ programme, onExplore }) => (
  <article className="rounded-2xl bg-[#101D35] text-white border border-slate-800 overflow-hidden shadow-lg">
    <div className="grid grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-7 p-7 sm:p-9 flex flex-col justify-between gap-6">
        <div>
          <div className="text-xs font-semibold text-sky-400 tracking-wide">
            Featured Islandwide Initiative · {programme.feeBadge}
          </div>
          <h3 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {programme.title}
          </h3>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            “{programme.theme}”
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-200">
            <div className="p-3 rounded-xl bg-[#172A45] border border-white/10">
              <div className="text-sky-400 font-semibold">Schedule</div>
              <div className="mt-0.5 font-bold">{programme.schedule}</div>
            </div>
            <div className="p-3 rounded-xl bg-[#172A45] border border-white/10">
              <div className="text-sky-400 font-semibold">Availability</div>
              <div className="mt-0.5 font-bold">{programme.availability}</div>
            </div>
            <div className="p-3 rounded-xl bg-[#172A45] border border-white/10">
              <div className="text-sky-400 font-semibold">Format</div>
              <div className="mt-0.5 font-bold">{programme.programmeType}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExplore}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-sm font-semibold transition cursor-pointer"
          >
            Explore Programme &amp; 12 Modules
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="lg:col-span-5 bg-[#172A45] p-6 sm:p-8 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-white/10">
        <div className="flex items-center gap-4">
          <img
            src={programme.trainerPhotoUrl || BRAND_IMAGES.trainerMohammedRashadh}
            alt={programme.trainerName}
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-2xl object-cover object-top border border-white/15 shrink-0"
          />
          <div>
            <div className="text-[11px] font-semibold text-sky-400">
              Featured Speaker &amp; Chief Trainer
            </div>
            <div className="text-lg font-extrabold text-white mt-0.5">
              {programme.trainerName}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">{programme.trainerPosition}</div>
            <div className="text-xs font-semibold text-sky-300 mt-0.5">
              {programme.trainerTitle}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-300 leading-relaxed">
          {programme.feeSummary}
        </p>
      </div>
    </div>
  </article>
);

/* 3. LECTURER CARD */
export const LecturerCard: React.FC<{
  lecturer: PublicFacultyProfile;
  onViewProfile: (lecturer: PublicFacultyProfile) => void;
}> = ({ lecturer, onViewProfile }) => (
  <article className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:shadow-md hover:border-[#1677FF]/40 transition-all">
    <div>
      <div className="flex items-center gap-4">
        {lecturer.photoUrl ? (
          <img
            src={lecturer.photoUrl}
            alt={lecturer.name}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-2xl object-cover object-top border border-slate-200 dark:border-slate-700 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-[#EAF1FC] dark:bg-[#172A45] text-[#1677FF] dark:text-sky-400 flex items-center justify-center text-lg font-extrabold shrink-0">
            {lecturer.name
              .split(' ')
              .slice(0, 2)
              .map((w) => w[0])
              .join('')
              .toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#101D35] dark:text-white truncate">
            {lecturer.name}
          </h3>
          <p className="text-xs font-medium text-[#1677FF] dark:text-sky-400 truncate">
            {lecturer.designation}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {lecturer.expertise}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
        {lecturer.bio}
      </p>

      {lecturer.assignedCourses.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Assigned Focus ({lecturer.assignedCourses.length})
          </div>
          <div className="text-xs text-[#101D35] dark:text-slate-200 mt-1 line-clamp-1">
            {lecturer.assignedCourses.slice(0, 2).join(' · ')}
          </div>
        </div>
      )}
    </div>

    <button
      type="button"
      onClick={() => onViewProfile(lecturer)}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
    >
      View Profile
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  </article>
);

/* 4. EVENT CARD */
export const EventCard: React.FC<{
  item: CmsItem;
  onOpen: (item: CmsItem) => void;
}> = ({ item, onOpen }) => (
  <article className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:shadow-md hover:border-[#1677FF]/40 transition">
    <div>
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-[#1677FF] dark:text-sky-400">{item.itemType}</span>
        {item.eventDate && (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              {item.eventDate}
            </span>
          </>
        )}
      </div>
      <h3 className="mt-2 text-base font-bold text-[#101D35] dark:text-white leading-snug">
        {item.title}
      </h3>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
        {item.summary}
      </p>
    </div>
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
    >
      Read Details
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  </article>
);

/* 5. NOTICE CARD */
export const NoticeCard: React.FC<{
  item: CmsItem;
  onOpen: (item: CmsItem) => void;
}> = ({ item, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(item)}
    className="w-full text-left p-4 rounded-xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 hover:border-[#1677FF]/50 hover:shadow-xs transition cursor-pointer flex items-start justify-between gap-4"
  >
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <span className="font-semibold text-[#1677FF] dark:text-sky-400">
          {item.category || item.itemType}
        </span>
        {item.eventDate && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{item.eventDate}</span>
          </>
        )}
      </div>
      <div className="mt-1 text-sm font-bold text-[#101D35] dark:text-white line-clamp-1">
        {item.title}
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
        {item.summary}
      </p>
    </div>
    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
  </button>
);

/* 6. TESTIMONIAL CARD */
export const TestimonialCard: React.FC<{ item: CmsItem }> = ({ item }) => (
  <article className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 p-6 flex flex-col justify-between gap-4">
    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
      “{item.summary}”
    </p>
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div className="text-sm font-bold text-[#101D35] dark:text-white">{item.title}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        {item.category || 'Verified TECHMAN COLLEGE Learner Story'}
      </div>
    </div>
  </article>
);

/* 7. STATISTICS SECTION */
export const StatisticsSection: React.FC<{
  stats: { label: string; value: string; note: string }[];
}> = ({ stats }) => (
  <section className="py-16 bg-[#101D35] text-white border-y border-slate-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">
            Verified Institutional Footprint
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Live Database Figures — TECHMAN COLLEGE
          </h2>
        </div>
        <p className="text-xs text-slate-400 max-w-md">
          Synced directly with our live college records. Figures reflect real published courses,
          active campuses, and verified database rosters without fabricated estimates.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-[#172A45] border border-white/10 p-6 flex flex-col justify-between"
          >
            <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-white">
              {s.value}
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-sky-300">{s.label}</div>
              <div className="text-xs text-slate-400 mt-1">{s.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* 8. CTA SECTION */
export const CTASection: React.FC<{
  onNavigate: (page: PublicPage) => void;
}> = ({ onNavigate }) => (
  <section className="py-20 bg-[#101D35] text-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl bg-[#172A45] border border-white/10 p-8 sm:p-14 text-center max-w-5xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">
          {INSTITUTE_INFO.officialName} · {INSTITUTE_INFO.establishedLabel}
        </p>
        <h2
          className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight text-white"
          style={{ textWrap: 'balance' }}
        >
          YOUR FUTURE STARTS HERE.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Join structured Certificate and International Diploma cohorts or partner with TECHMAN
          COLLEGE for islandwide youth skill development across Sri Lanka.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('admissions')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-sm font-semibold transition cursor-pointer"
          >
            Apply Now
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('courses')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-[#101D35] hover:bg-[#EAF1FC] text-sm font-semibold transition cursor-pointer"
          >
            Explore Courses
          </button>
          <button
            type="button"
            onClick={() => onNavigate('contact')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/25 hover:border-white/50 text-white text-sm font-semibold transition cursor-pointer"
          >
            Contact Admissions
          </button>
        </div>
      </div>
    </div>
  </section>
);

/* 9. SEARCH BAR & FILTER PANEL */
export const SearchBar: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search courses, modules, or codes...' }) => (
  <div className="relative flex-1 min-w-[240px]">
    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101D35] text-sm text-[#101D35] dark:text-white focus:outline-none focus:border-[#1677FF]"
    />
  </div>
);

export const FilterPanel: React.FC<{
  category: 'All' | 'Certificate' | 'Diploma' | 'Free';
  onCategoryChange: (c: 'All' | 'Certificate' | 'Diploma' | 'Free') => void;
  domain: string;
  domains: string[];
  onDomainChange: (d: string) => void;
  mode: 'All' | 'Online' | 'Physical' | 'Hybrid';
  onModeChange: (m: 'All' | 'Online' | 'Physical' | 'Hybrid') => void;
  duration: string;
  durations: string[];
  onDurationChange: (dur: string) => void;
  sortBy: 'featured' | 'fee-asc' | 'fee-desc' | 'name';
  onSortChange: (s: 'featured' | 'fee-asc' | 'fee-desc' | 'name') => void;
}> = ({
  category,
  onCategoryChange,
  domain,
  domains,
  onDomainChange,
  mode,
  onModeChange,
  duration,
  durations,
  onDurationChange,
  sortBy,
  onSortChange,
}) => (
  <div className="rounded-2xl bg-[#F5F7FA] dark:bg-[#101D35] border border-slate-200/90 dark:border-slate-800 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#172A45] border border-slate-200/80 dark:border-slate-700">
        {(['All', 'Certificate', 'Diploma', 'Free'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryChange(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              category === cat
                ? 'bg-[#101D35] dark:bg-[#1677FF] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#101D35] dark:hover:text-white'
            }`}
          >
            {cat === 'Free' ? '100% Free' : cat}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
        <select
          aria-label="Filter by department"
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172A45] text-[#101D35] dark:text-slate-100 text-xs font-medium"
        >
          {domains.map((d) => (
            <option key={d} value={d}>
              {d === 'All' ? 'All Departments' : d}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by study mode"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as 'All' | 'Online' | 'Physical' | 'Hybrid')}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172A45] text-[#101D35] dark:text-slate-100 text-xs font-medium"
        >
          <option value="All">All Study Modes</option>
          <option value="Online">Online</option>
          <option value="Physical">Physical</option>
          <option value="Hybrid">Hybrid</option>
        </select>

        <select
          aria-label="Filter by duration"
          value={duration}
          onChange={(e) => onDurationChange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172A45] text-[#101D35] dark:text-slate-100 text-xs font-medium"
        >
          {durations.map((dur) => (
            <option key={dur} value={dur}>
              {dur === 'All' ? 'All Durations' : dur}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort courses"
          value={sortBy}
          onChange={(e) =>
            onSortChange(e.target.value as 'featured' | 'fee-asc' | 'fee-desc' | 'name')
          }
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#172A45] text-[#101D35] dark:text-slate-100 text-xs font-medium"
        >
          <option value="featured">Sort: Featured</option>
          <option value="fee-asc">Fee: Low to High</option>
          <option value="fee-desc">Fee: High to Low</option>
          <option value="name">Title: A–Z</option>
        </select>
      </div>
    </div>
  </div>
);

/* 10. STUDENT PORTAL ENTRY (/student-login) */
export const StudentPortalEntry: React.FC<{
  isSignedIn: boolean;
  userDisplayName?: string;
  userRole?: string;
  authError: string | null;
  onGoogleSignIn: () => Promise<void>;
  onOpenPortal: () => void;
  onNavigate: (page: PublicPage) => void;
}> = ({
  isSignedIn,
  userDisplayName,
  userRole,
  authError,
  onGoogleSignIn,
  onOpenPortal,
  onNavigate,
}) => (
  <section className="py-16 sm:py-24 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-[#101D35]">
        {/* Left Navy Panel */}
        <div className="lg:col-span-5 bg-[#101D35] text-white p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={BRAND_IMAGES.officialLogo}
                alt="TECHMAN COLLEGE logo"
                className="w-11 h-11 rounded-xl object-cover border border-white/15"
              />
              <div>
                <div className="text-sm font-extrabold tracking-tight">TECHMAN COLLEGE</div>
                <div className="text-[11px] text-sky-400">{INSTITUTE_INFO.establishedLabel}</div>
              </div>
            </div>

            <h1 className="mt-8 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Unified Role-Scoped LMS Portal
            </h1>
            <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Sign in securely with your verified Google account to access your personalized
              Student, Lecturer, Branch Admin, Coordinator, Accountant, or Super Admin dashboard.
            </p>

            <ul className="mt-6 space-y-2.5 text-xs text-slate-200">
              {[
                'Course lessons, live classes & attendance sync',
                'TECHMAN AI Personal Tutor (EN / TA / SI)',
                'Assignments, timed exams & instant gradebook',
                'LKR fee status, receipts & verified QR certificates',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-[11px] text-slate-400">
            Protected by Firebase Authentication &amp; Role-Based Security Rules.
          </div>
        </div>

        {/* Right Sign-In Panel */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1677FF] dark:text-sky-400">
            Single Sign-On Access
          </div>
          <h2 className="mt-2 text-2xl font-extrabold text-[#101D35] dark:text-white">
            {isSignedIn ? `Welcome back, ${userDisplayName || 'Member'}` : 'Sign in to TECHMAN LMS'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {isSignedIn
              ? `You are signed in with role ${userRole || 'STUDENT'}. Continue directly to your workspace.`
              : 'Use your registered TECHMAN COLLEGE Google email. Your role permissions are verified automatically on the backend.'}
          </p>

          {authError && (
            <div className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {authError}
            </div>
          )}

          <div className="mt-7 space-y-3">
            {isSignedIn ? (
              <button
                type="button"
                onClick={onOpenPortal}
                className="w-full py-3.5 px-5 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer"
              >
                Enter Role-Scoped LMS Portal
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onGoogleSignIn()}
                className="w-full py-3.5 px-5 rounded-xl bg-[#101D35] hover:bg-[#172A45] dark:bg-[#1677FF] dark:hover:bg-blue-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Continue with Google SSO
              </button>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('admissions')}
                className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-slate-200 hover:border-[#1677FF] transition cursor-pointer"
              >
                New Student? Apply Now
              </button>
              <button
                type="button"
                onClick={() => onNavigate('verify')}
                className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-slate-200 hover:border-[#1677FF] transition cursor-pointer"
              >
                Verify Certificate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export { getCourseSlug, getEventSlug };
