import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Globe,
  GraduationCap,
  Layers,
  Library,
  MapPin,
  Megaphone,
  Palette,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { BRAND_IMAGES, INSTITUTE_INFO } from '../../../data/catalogSeed';
import { formatLkr } from '../../../lib/firestoreService';
import { PublicPage } from '../../../lib/publicRoutes';
import { Branch, CmsItem, CommunityPost, Course, SpecialProgramme } from '../../../types/lms';
import {
  CourseCard,
  EventCard,
  getCourseCoverImage,
  LecturerCard,
  NoticeCard,
  ProgrammeCard,
  PublicFacultyProfile,
} from './PublicCards';

/* 1. /academics */
export const AcademicsPage: React.FC<{
  courses: Course[];
  onSelectDomainCourses: (domain: string) => void;
  onNavigate: (page: PublicPage, param?: string) => void;
}> = ({ courses, onSelectDomainCourses, onNavigate }) => {
  const divisions = [
    {
      title: 'Artificial Intelligence & Automation',
      domain: 'AI & Automation',
      image: BRAND_IMAGES.card3dAiBrain,
      icon: Cpu,
      summary:
        'Generative AI workflows, Prompt Engineering, and intelligent automation built around real industry case studies.',
    },
    {
      title: 'Graphic Design & Creative Technology',
      domain: 'Creative Design',
      image: BRAND_IMAGES.card3dCreativeTech,
      icon: Palette,
      summary:
        'Visual branding, Canva, Adobe Photoshop, Illustrator, video production, and creative storytelling studios.',
    },
    {
      title: 'Web & App Development',
      domain: 'IT & Software',
      image: BRAND_IMAGES.card3dWebDev,
      icon: Layers,
      summary:
        'Full-stack web interfaces, modern JavaScript frameworks, cloud databases, and practical software engineering.',
    },
    {
      title: 'Digital Marketing',
      domain: 'Digital Marketing',
      image: BRAND_IMAGES.careerInnovationCenter,
      icon: Megaphone,
      summary:
        'Social media strategy, e-commerce growth, brand communication, and performance analytics for modern businesses.',
    },
    {
      title: 'Robotics & STEM',
      domain: 'AI & Automation',
      image: BRAND_IMAGES.card3dRoboticsStem,
      icon: Sparkles,
      summary:
        'Hands-on robotics fundamentals, electronics prototyping, and STEM innovation workshops for youth and learners.',
    },
    {
      title: 'Professional Development',
      domain: 'Business & Management',
      image: BRAND_IMAGES.aboutModernCampus,
      icon: Briefcase,
      summary:
        'Business Management, HRM, Psychology, leadership, communication, and career readiness for Sri Lanka and global remote work.',
    },
  ];

  return (
    <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="rounded-3xl bg-[#101D35] text-white p-8 sm:p-12 border border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">
            Academic Structure · {INSTITUTE_INFO.officialName}
          </p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold tracking-tight">
            Future-Ready Academic Divisions
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
            Every academic pathway combines structured theory, hands-on practical projects, guided
            mentorship, and continuous assessment inside our unified LMS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {divisions.map((div) => {
            const count = courses.filter((c) => c.domain === div.domain).length;
            const Icon = div.icon;
            return (
              <article
                key={div.title}
                className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between hover:shadow-lg transition"
              >
                <div>
                  <div className="aspect-[16/10] bg-[#EAF1FC] dark:bg-[#172A45] overflow-hidden">
                    <img
                      src={div.image}
                      alt={div.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#1677FF] dark:text-sky-400 font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="w-4 h-4" />
                        Academic Division
                      </span>
                      <span className="font-mono">{count > 0 ? `${count} Courses` : 'Workshops'}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-extrabold text-[#101D35] dark:text-white">
                      {div.title}
                    </h2>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {div.summary}
                    </p>
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => onSelectDomainCourses(div.domain)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    Browse Division Courses
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6">
          <div>
            <h2 className="text-lg font-bold text-[#101D35] dark:text-white">
              Need help selecting the right pathway?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Compare all {courses.length} published courses side-by-side or speak with admissions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="px-4 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Explore All Courses
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
            >
              Speak to Admissions
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/* 2. /courses/:slug */
export const CourseDetailPage: React.FC<{
  course: Course | undefined;
  relatedCourses: Course[];
  faculty: PublicFacultyProfile[];
  onNavigate: (page: PublicPage, param?: string) => void;
  onApply: (course: Course) => void;
}> = ({ course, relatedCourses, faculty, onNavigate, onApply }) => {
  if (!course) {
    return (
      <section className="py-20 max-w-3xl mx-auto px-4 text-center">
        <h1 className="text-2xl font-extrabold text-[#101D35] dark:text-white">Course Not Found</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          The requested programme could not be located in the published catalogue.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('courses')}
          className="mt-6 px-5 py-2.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
        >
          Back to All Courses
        </button>
      </section>
    );
  }

  const cover = getCourseCoverImage(course);
  const isFree = course.courseFeeLkr === 0;
  const matchedFaculty =
    faculty.find(
      (f) =>
        f.expertise.toLowerCase().includes((course.domain || '').toLowerCase()) ||
        f.assignedCourses.some((cName) => cName === course.name)
    ) || faculty[0];

  const courseFaqs = [
    {
      q: 'How is this programme delivered?',
      a: `This course is offered in ${course.mode} mode across TECHMAN COLLEGE Sri Lanka learning centres and our online LMS platform.`,
    },
    {
      q: 'How do I receive my certificate upon completion?',
      a: 'Students who satisfy attendance, coursework, and assessment requirements receive a unique QR-verifiable TECHMAN COLLEGE certificate.',
    },
    {
      q: 'Can working professionals or school students join?',
      a: 'Yes. Batch schedules are structured to accommodate students, job seekers, and working professionals.',
    },
  ];

  return (
    <article className="bg-[#F5F7FA] dark:bg-[#0A1324] pb-16">
      {/* Dark Navy Course Hero */}
      <div className="bg-[#101D35] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <button
            type="button"
            onClick={() => onNavigate('courses')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:underline cursor-pointer mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Courses Catalogue
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-400">
                <span>{course.category}</span>
                <span aria-hidden="true">·</span>
                <span>{course.domain}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{course.code}</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                {course.name}
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                {course.description}
              </p>

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onApply(course)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-sm font-semibold transition cursor-pointer"
                >
                  Apply Now
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="px-5 py-3 rounded-lg border border-white/25 hover:border-white/50 text-white text-sm font-semibold transition cursor-pointer"
                >
                  Admission Enquiry
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl overflow-hidden border border-white/15 bg-[#172A45]">
                <img
                  src={cover}
                  alt={course.name}
                  referrerPolicy="no-referrer"
                  className="w-full aspect-[16/10] object-cover"
                />
                <div className="p-5 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-slate-400">Duration</div>
                    <div className="font-bold text-white mt-0.5">{course.duration}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Study Mode</div>
                    <div className="font-bold text-white mt-0.5">{course.mode}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Tuition Fee</div>
                    <div className="font-bold font-mono text-sky-300 mt-0.5">
                      {isFree ? '100% Free Tuition' : formatLkr(course.courseFeeLkr)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Registration Fee</div>
                    <div className="font-bold font-mono text-white mt-0.5">
                      {formatLkr(course.registrationFeeLkr)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Course Details Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Learning Outcomes & Syllabus */}
          <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white">
              Programme Overview &amp; Learning Outcomes
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {course.description}
            </p>

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-[#1677FF] dark:text-sky-400">
              Verified Syllabus Modules ({(course.syllabusTopics || []).length})
            </h3>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(course.syllabusTopics || []).map((topic: string, idx: number) => (
                <div
                  key={topic}
                  className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#172A45] border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3 text-xs"
                >
                  <span className="font-mono font-bold text-[#1677FF] dark:text-sky-400 shrink-0">
                    {String(idx + 1).padStart(2, '0')}.
                  </span>
                  <span className="font-semibold text-[#101D35] dark:text-white">{topic}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Entry Requirements & Admission Process */}
          <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h2 className="text-base font-extrabold text-[#101D35] dark:text-white">
                Entry Requirements
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                  <span>Open to school leavers, undergraduates, job seekers, and professionals.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                  <span>Basic computer literacy and readiness for practical project assignments.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                  <span>Valid NIC, Passport, or Student ID for credential issuance.</span>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-extrabold text-[#101D35] dark:text-white">
                Admission Process
              </h2>
              <ol className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li>1. Submit the 6-step online admission form.</li>
                <li>2. Receive your application tracking number immediately.</li>
                <li>3. Complete registration confirmation with Admissions.</li>
                <li>4. Receive your Student ID &amp; LMS portal access.</li>
              </ol>
            </div>
          </div>

          {/* Course FAQs */}
          <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-lg font-extrabold text-[#101D35] dark:text-white">
              Frequently Asked Questions
            </h2>
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {courseFaqs.map((faq) => (
                <div key={faq.q} className="py-4 first:pt-0 last:pb-0">
                  <div className="text-sm font-bold text-[#101D35] dark:text-white">{faq.q}</div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Fee Breakdown + Faculty */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-[#101D35] dark:text-white">
              Official LKR Fee Breakdown
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Course Fee</span>
                <span className="font-mono font-bold text-[#101D35] dark:text-white">
                  {isFree ? 'LKR 0 (100% Free)' : formatLkr(course.courseFeeLkr)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Registration Fee</span>
                <span className="font-mono font-semibold text-[#101D35] dark:text-white">
                  {formatLkr(course.registrationFeeLkr ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Certificate Fee</span>
                <span className="font-mono font-semibold text-[#101D35] dark:text-white">
                  {formatLkr(course.certificateFeeLkr ?? 0)}
                </span>
              </div>
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <span className="font-semibold text-[#101D35] dark:text-white">
                  Installment Options
                </span>
                <span className="font-semibold text-[#1677FF] dark:text-sky-400">
                  {course.installmentPlan || 'Flexible LKR Schedule'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApply(course)}
              className="w-full py-3 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
            >
              Start Application for This Course
            </button>
          </div>

          {matchedFaculty && (
            <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1677FF] dark:text-sky-400">
                Faculty Lead
              </div>
              <div className="text-base font-bold text-[#101D35] dark:text-white">
                {matchedFaculty.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {matchedFaculty.designation}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {matchedFaculty.bio}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('lecturer-detail', matchedFaculty.id)}
                className="text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
              >
                View Faculty Profile →
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Related Courses */}
      {relatedCourses.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-14">
          <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white mb-5">
            Related Programmes in {course.domain}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedCourses.slice(0, 3).map((rel) => (
              <CourseCard
                key={rel.id}
                course={rel}
                onViewDetails={(c) => onNavigate('course-detail', c.id)}
                onApply={onApply}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

/* 3. /programmes */
export const ProgrammesPage: React.FC<{
  programme: SpecialProgramme;
  freeCourses: Course[];
  onNavigate: (page: PublicPage, param?: string) => void;
  onApply: (course: Course) => void;
}> = ({ programme, freeCourses, onNavigate, onApply }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
          Special Outreach &amp; Skill Pathways
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
          TECHMAN COLLEGE Programmes
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
          Flagship youth empowerment initiatives, islandwide physical workshops, and 100% free
          certificate scholarships delivered across Sri Lanka.
        </p>
      </div>

      <ProgrammeCard
        programme={programme}
        onExplore={() => onNavigate('free-skill-programme')}
      />

      {freeCourses.length > 0 && (
        <div>
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-[#101D35] dark:text-white">
                100% Free Tuition Certificate Programmes
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Zero tuition fee programmes open for the 2027 intake.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
            >
              View All Courses →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {freeCourses.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                onViewDetails={(course) => onNavigate('course-detail', course.id)}
                onApply={onApply}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  </section>
);

/* 4. /lecturers & /lecturers/:id */
export const LecturersPage: React.FC<{
  faculty: PublicFacultyProfile[];
  onNavigate: (page: PublicPage, param?: string) => void;
}> = ({ faculty, onNavigate }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
          Academic Leadership &amp; Trainers
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
          Lecturers &amp; Chief Trainers
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
          Verified trainers, faculty leaders, and subject-matter specialists guiding practical
          project learning across TECHMAN COLLEGE.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {faculty.map((f) => (
          <LecturerCard
            key={f.id}
            lecturer={f}
            onViewProfile={(lec) => onNavigate('lecturer-detail', lec.id)}
          />
        ))}
      </div>
    </div>
  </section>
);

export const LecturerDetailPage: React.FC<{
  lecturer: PublicFacultyProfile | undefined;
  courses: Course[];
  onNavigate: (page: PublicPage, param?: string) => void;
  onApply: (course: Course) => void;
}> = ({ lecturer, courses, onNavigate, onApply }) => {
  if (!lecturer) {
    return (
      <section className="py-20 max-w-3xl mx-auto px-4 text-center">
        <h1 className="text-2xl font-extrabold text-[#101D35] dark:text-white">
          Faculty Profile Not Found
        </h1>
        <button
          type="button"
          onClick={() => onNavigate('lecturers')}
          className="mt-5 px-5 py-2.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
        >
          Back to All Lecturers
        </button>
      </section>
    );
  }

  const matchedCourses = courses.filter((c) => lecturer.assignedCourses.includes(c.name));

  return (
    <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <button
          type="button"
          onClick={() => onNavigate('lecturers')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Lecturers &amp; Trainers
        </button>

        <div className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-8 sm:p-10 flex flex-col sm:flex-row gap-8 items-start">
          {lecturer.photoUrl ? (
            <img
              src={lecturer.photoUrl}
              alt={lecturer.name}
              referrerPolicy="no-referrer"
              className="w-32 h-32 rounded-2xl object-cover object-top border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl bg-[#EAF1FC] dark:bg-[#172A45] text-[#1677FF] dark:text-sky-400 flex items-center justify-center text-3xl font-extrabold shrink-0">
              {lecturer.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="space-y-3">
            <div className="text-xs font-semibold text-[#1677FF] dark:text-sky-400">
              {lecturer.expertise}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#101D35] dark:text-white">
              {lecturer.name}
            </h1>
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {lecturer.designation}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {lecturer.bio}
            </p>
          </div>
        </div>

        {matchedCourses.length > 0 && (
          <div>
            <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white mb-5">
              Associated Courses ({matchedCourses.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {matchedCourses.slice(0, 6).map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  onViewDetails={(course) => onNavigate('course-detail', course.id)}
                  onApply={onApply}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

/* 5. /campus */
export const CampusPage: React.FC<{
  branches: Branch[];
  onNavigate: (page: PublicPage) => void;
}> = ({ branches, onNavigate }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            Physical &amp; Digital Campuses
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
            TECHMAN COLLEGE Branches &amp; Learning Centres
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Connected across physical Sri Lanka campuses and our Global Online Learning Centre so
            every student receives consistent syllabus quality, attendance tracking, and AI study
            support.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('admissions')}
              className="px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Apply to a Campus
            </button>
            <button
              type="button"
              onClick={() => onNavigate('gallery')}
              className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
            >
              View Campus Gallery
            </button>
          </div>
        </div>
        <div className="lg:col-span-6">
          <img
            src={BRAND_IMAGES.aboutModernCampus}
            alt="TECHMAN COLLEGE modern campus studio"
            referrerPolicy="no-referrer"
            className="w-full aspect-[16/10] object-cover rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-[#1677FF] dark:text-sky-400 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {b.code}
              </span>
              <span>{b.city}</span>
            </div>
            <h2 className="text-lg font-extrabold text-[#101D35] dark:text-white">{b.name}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{b.address}</span>
            </p>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{b.phone}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* 6. /achievements */
export const AchievementsPage: React.FC<{
  showcasePosts: CommunityPost[];
  stories: CmsItem[];
  onNavigate: (page: PublicPage) => void;
}> = ({ showcasePosts, stories, onNavigate }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            Student Outcomes &amp; Credentials
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
            Student Achievements &amp; Portfolios
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
            Approved student projects, verified graduate credentials, and portfolio highlights
            published with learner consent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('verify')}
          className="px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold self-start cursor-pointer"
        >
          Verify a Student Certificate
        </button>
      </div>

      {/* Approved Community Project Showcases */}
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white">
          Approved Student Project Showcases
        </h2>
        {showcasePosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {showcasePosts.map((post) => (
              <article
                key={post.id}
                className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-3"
              >
                <div className="text-xs font-semibold text-[#1677FF] dark:text-sky-400">
                  {post.postType} · {post.authorName}
                </div>
                <h3 className="text-base font-bold text-[#101D35] dark:text-white">{post.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {post.body}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-8 text-sm text-slate-600 dark:text-slate-300">
            Approved student project showcases published from the Student Community Hub appear here
            automatically once moderated by faculty.
          </div>
        )}
      </div>

      {/* Verified Stories */}
      {stories.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white">
            Verified Student Stories
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {stories.map((st) => (
              <article
                key={st.id}
                className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 space-y-2"
              >
                <div className="text-xs font-semibold text-[#1677FF] dark:text-sky-400">
                  {st.category || 'Graduate Story'}
                </div>
                <h3 className="text-base font-bold text-[#101D35] dark:text-white">{st.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {st.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  </section>
);

/* 7. /events & /events/:slug */
export const EventsPage: React.FC<{
  events: CmsItem[];
  onNavigate: (page: PublicPage, param?: string) => void;
}> = ({ events, onNavigate }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
          Workshops · Webinars · Intake Sessions
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
          Events &amp; College Calendar
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
          Live workshops, orientation dates, webinars, and islandwide free training sessions hosted
          by TECHMAN COLLEGE.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((ev) => (
          <EventCard
            key={ev.id}
            item={ev}
            onOpen={(item) => onNavigate('event-detail', item.id)}
          />
        ))}
      </div>
    </div>
  </section>
);

export const EventDetailPage: React.FC<{
  item: CmsItem | undefined;
  onNavigate: (page: PublicPage) => void;
}> = ({ item, onNavigate }) => {
  if (!item) {
    return (
      <section className="py-20 max-w-3xl mx-auto px-4 text-center">
        <h1 className="text-2xl font-extrabold text-[#101D35] dark:text-white">Event Not Found</h1>
        <button
          type="button"
          onClick={() => onNavigate('events')}
          className="mt-5 px-5 py-2.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
        >
          Back to Events
        </button>
      </section>
    );
  }

  return (
    <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <button
          type="button"
          onClick={() => onNavigate('events')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Events &amp; Notices
        </button>

        <article className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-8 sm:p-10 space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-[#1677FF] dark:text-sky-400">{item.itemType}</span>
            {item.category && (
              <>
                <span aria-hidden="true">·</span>
                <span>{item.category}</span>
              </>
            )}
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
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#101D35] dark:text-white leading-tight">
            {item.title}
          </h1>
          <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
            {item.summary}
          </p>
          {item.aiSuggestedTags && item.aiSuggestedTags.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              Topics: {item.aiSuggestedTags.join(' · ')}
            </div>
          )}
          <div className="pt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('admissions')}
              className="px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Register / Apply Now
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
            >
              Contact Organizers
            </button>
          </div>
        </article>
      </div>
    </section>
  );
};

/* 8. /career */
export const CareerPage: React.FC<{
  isSignedIn: boolean;
  onNavigate: (page: PublicPage) => void;
  onPortalAction: () => void;
}> = ({ isSignedIn, onNavigate, onPortalAction }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            TECHMAN COLLEGE Career Centre
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
            From Classroom Projects to Real Careers
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Our Career Centre equips students with practical portfolio development, ATS-ready CV
            preparation, mock technical &amp; behavioral interview coaching, and freelancing /
            internship guidance across Sri Lanka and international remote markets.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => (isSignedIn ? onPortalAction() : onNavigate('student-login'))}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Open AI Career &amp; CV Center in LMS
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-white cursor-pointer"
            >
              Explore Career Courses
            </button>
          </div>
        </div>
        <div className="lg:col-span-6">
          <img
            src={BRAND_IMAGES.careerInnovationCenter}
            alt="TECHMAN COLLEGE Career Centre mentorship"
            referrerPolicy="no-referrer"
            className="w-full aspect-[16/10] object-cover rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          {
            title: 'Career Guidance',
            desc: 'Personalized 90-day skill roadmaps matched to Sri Lankan and remote tech roles.',
          },
          {
            title: 'Internship Pathways',
            desc: 'Structured preparation for local software, design, and digital marketing placements.',
          },
          {
            title: 'Job Opportunities',
            desc: 'Curated role readiness checklists and employer-facing project portfolios.',
          },
          {
            title: 'Portfolio Development',
            desc: 'Turn real course assignments into verifiable case studies and GitHub/design showcases.',
          },
          {
            title: 'Interview Preparation',
            desc: 'AI-assisted mock interviews, CV reviews, and communication coaching inside the LMS.',
          },
        ].map((pillar) => (
          <div
            key={pillar.title}
            className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-5"
          >
            <Briefcase className="w-5 h-5 text-[#1677FF] dark:text-sky-400" />
            <h2 className="mt-3 text-sm font-extrabold text-[#101D35] dark:text-white">
              {pillar.title}
            </h2>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pillar.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* 9. /library */
export const LibraryPage: React.FC<{
  courses: Course[];
  isSignedIn: boolean;
  onNavigate: (page: PublicPage, param?: string) => void;
  onPortalAction: () => void;
}> = ({ courses, isSignedIn, onNavigate, onPortalAction }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
      <div className="rounded-3xl bg-[#101D35] text-white p-8 sm:p-12 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">
            Digital Library &amp; Knowledge Repository
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Course Handbooks, PDFs &amp; Study Materials
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Enrolled TECHMAN COLLEGE students enjoy 24/7 access to course-linked PDFs, lecture
            notes, revision summaries, and downloadable guides inside the authenticated Digital
            Library.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (isSignedIn ? onPortalAction() : onNavigate('student-login'))}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1677FF] hover:bg-blue-600 text-white text-sm font-semibold self-start lg:self-center shrink-0 cursor-pointer"
        >
          <Library className="w-4 h-4" />
          {isSignedIn ? 'Open Full Digital Library' : 'Sign In for Full Library Access'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.slice(0, 6).map((course) => (
          <div
            key={course.id}
            className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="text-xs font-semibold text-[#1677FF] dark:text-sky-400">
                Syllabus Guide · {course.domain}
              </div>
              <h2 className="mt-1.5 text-base font-bold text-[#101D35] dark:text-white">
                {course.name}
              </h2>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Includes {(course.syllabusTopics || []).length} structured modules, practical
                exercises, and LMS study notes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('course-detail', course.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677FF] dark:text-sky-400 hover:underline cursor-pointer"
            >
              Inspect Public Syllabus
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* 10. /privacy-policy & /terms */
export const PrivacyPolicyPage: React.FC<{ onNavigate: (page: PublicPage) => void }> = ({
  onNavigate,
}) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-8 sm:p-12 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            Legal &amp; Data Protection
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#101D35] dark:text-white">
            Privacy Policy — {INSTITUTE_INFO.officialName}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {INSTITUTE_INFO.establishedLabel} · Effective for 2027 Academic Intake
          </p>
        </div>

        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            <strong>1. Data We Collect:</strong> TECHMAN COLLEGE collects only information
            necessary for admissions processing, academic delivery, attendance, assessments, LKR fee
            receipting, and QR certificate verification.
          </p>
          <p>
            <strong>2. PII Isolation &amp; Role-Based Security:</strong> Personal contact details
            and academic records are stored in protected Cloud Firestore collections governed by
            strict role-based security rules. Public website pages never expose private student
            records, emails, or phone numbers.
          </p>
          <p>
            <strong>3. Student Consent:</strong> Student photographs, project portfolios, and
            testimonials are published publicly only after explicit learner consent and faculty
            approval.
          </p>
          <p>
            <strong>4. AI Learning Features:</strong> Course-aware AI Tutor queries are processed
            strictly to support academic learning and do not expose private student records to other
            users.
          </p>
          <p>
            <strong>5. Data Inquiries:</strong> Contact {INSTITUTE_INFO.publicEmail} or{' '}
            {INSTITUTE_INFO.phone} for any privacy or data correction request.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('contact')}
          className="px-5 py-2.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
        >
          Contact Data Protection Desk
        </button>
      </div>
    </div>
  </section>
);

export const TermsPage: React.FC<{ onNavigate: (page: PublicPage) => void }> = ({ onNavigate }) => (
  <section className="py-14 bg-[#F5F7FA] dark:bg-[#0A1324]">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-8 sm:p-12 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            Academic &amp; Platform Governance
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#101D35] dark:text-white">
            Terms &amp; Conditions — {INSTITUTE_INFO.officialName}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {INSTITUTE_INFO.establishedLabel} · Sri Lanka
          </p>
        </div>

        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            <strong>1. Enrollment &amp; Student IDs:</strong> Official Student IDs and LMS access
            are issued upon admissions verification by authorized TECHMAN COLLEGE staff.
          </p>
          <p>
            <strong>2. Fees &amp; Free Programmes:</strong> Tuition fees, registration fees, and
            certificate fees follow the published LKR schedule. The TECHMAN Free Skill Development
            Programme is 100% free of charge, with host institutions responsible solely for
            transport and accommodation for the visiting team.
          </p>
          <p>
            <strong>3. Academic Integrity:</strong> Students must submit original coursework. AI
            Tutor tools are provided strictly for guided learning and revision.
          </p>
          <p>
            <strong>4. Certificates &amp; Verification:</strong> Digital certificates are issued
            only upon fulfilling course completion, attendance, and assessment criteria and remain
            verifiable via our public QR registry.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('admissions')}
          className="px-5 py-2.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer"
        >
          Proceed to Admissions
        </button>
      </div>
    </div>
  </section>
);
