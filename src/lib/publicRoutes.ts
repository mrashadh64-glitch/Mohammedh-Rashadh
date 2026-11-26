import { CmsItem, Course } from '../types/lms';

export type PublicPage =
  | 'home'
  | 'about'
  | 'academics'
  | 'courses'
  | 'course-detail'
  | 'programmes'
  | 'free-skill-programme'
  | 'lecturers'
  | 'lecturer-detail'
  | 'admissions'
  | 'campus'
  | 'gallery'
  | 'achievements'
  | 'events'
  | 'event-detail'
  | 'career'
  | 'library'
  | 'notices'
  | 'contact'
  | 'student-login'
  | 'verify'
  | 'privacy-policy'
  | 'terms';

export interface ParsedPublicRoute {
  page: PublicPage;
  param?: string;
}

export function slugifyText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function getCourseSlug(course: Course): string {
  return course.id || slugifyText(course.name);
}

export function getEventSlug(item: CmsItem): string {
  return item.id || slugifyText(item.title);
}

export function parsePublicPathname(pathname: string, search = ''): ParsedPublicRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);

  if (clean === '/' || clean === '') {
    if (params.get('verify')) return { page: 'verify', param: params.get('verify') || undefined };
    if (params.get('ref')) return { page: 'admissions' };
    return { page: 'home' };
  }

  if (clean === '/about') return { page: 'about' };
  if (clean === '/academics') return { page: 'academics' };
  if (clean === '/courses') return { page: 'courses' };
  if (clean.startsWith('/courses/')) {
    return { page: 'course-detail', param: decodeURIComponent(clean.slice('/courses/'.length)) };
  }
  if (clean === '/programmes') return { page: 'programmes' };
  if (clean === '/programmes/free-skill-development') return { page: 'free-skill-programme' };
  if (clean === '/lecturers') return { page: 'lecturers' };
  if (clean.startsWith('/lecturers/')) {
    return { page: 'lecturer-detail', param: decodeURIComponent(clean.slice('/lecturers/'.length)) };
  }
  if (clean === '/admissions') return { page: 'admissions' };
  if (clean === '/campus') return { page: 'campus' };
  if (clean === '/gallery') return { page: 'gallery' };
  if (clean === '/achievements') return { page: 'achievements' };
  if (clean === '/events') return { page: 'events' };
  if (clean.startsWith('/events/')) {
    return { page: 'event-detail', param: decodeURIComponent(clean.slice('/events/'.length)) };
  }
  if (clean === '/career') return { page: 'career' };
  if (clean === '/library') return { page: 'library' };
  if (clean === '/notices') return { page: 'notices' };
  if (clean === '/contact') return { page: 'contact' };
  if (clean === '/student-login') return { page: 'student-login' };
  if (clean === '/certificate-verification') {
    return { page: 'verify', param: params.get('verify') || undefined };
  }
  if (clean === '/privacy-policy') return { page: 'privacy-policy' };
  if (clean === '/terms') return { page: 'terms' };

  return { page: 'home' };
}

export function buildPublicPath(page: PublicPage, param?: string): string {
  switch (page) {
    case 'home':
      return '/';
    case 'about':
      return '/about';
    case 'academics':
      return '/academics';
    case 'courses':
      return '/courses';
    case 'course-detail':
      return param ? `/courses/${encodeURIComponent(param)}` : '/courses';
    case 'programmes':
      return '/programmes';
    case 'free-skill-programme':
      return '/programmes/free-skill-development';
    case 'lecturers':
      return '/lecturers';
    case 'lecturer-detail':
      return param ? `/lecturers/${encodeURIComponent(param)}` : '/lecturers';
    case 'admissions':
      return '/admissions';
    case 'campus':
      return '/campus';
    case 'gallery':
      return '/gallery';
    case 'achievements':
      return '/achievements';
    case 'events':
      return '/events';
    case 'event-detail':
      return param ? `/events/${encodeURIComponent(param)}` : '/events';
    case 'career':
      return '/career';
    case 'library':
      return '/library';
    case 'notices':
      return '/notices';
    case 'contact':
      return '/contact';
    case 'student-login':
      return '/student-login';
    case 'verify':
      return '/certificate-verification';
    case 'privacy-policy':
      return '/privacy-policy';
    case 'terms':
      return '/terms';
    default:
      return '/';
  }
}

const ROUTE_SEO: Record<PublicPage, { title: string; description: string }> = {
  home: {
    title: 'TECHMAN COLLEGE — Build Your Future With Technology (Est. 2021)',
    description:
      'TECHMAN COLLEGE (Established in 2021, Sri Lanka) delivers practical AI, Technology, Creative Design, Web Development, and Professional Skills programmes with an integrated AI LMS.',
  },
  about: {
    title: 'About TECHMAN COLLEGE — Education That Builds The Future (Est. 2021)',
    description:
      'Learn about TECHMAN COLLEGE, established in 2021 in Sri Lanka, our mission, vision, practical teaching philosophy, and regional campuses.',
  },
  academics: {
    title: 'Academics & Learning Divisions — TECHMAN COLLEGE',
    description:
      'Explore TECHMAN COLLEGE academic divisions across Artificial Intelligence, Creative Technology, Web & App Development, Digital Marketing, Robotics, and Professional Development.',
  },
  courses: {
    title: 'Courses & Syllabi — TECHMAN COLLEGE',
    description:
      'Browse published Certificate and International Diploma courses at TECHMAN COLLEGE with real durations, study modes, comparison tools, and LKR fee details.',
  },
  'course-detail': {
    title: 'Course Details & Syllabus — TECHMAN COLLEGE',
    description:
      'Inspect complete course syllabus, learning outcomes, duration, study mode, entry requirements, and admission process at TECHMAN COLLEGE.',
  },
  programmes: {
    title: 'Special Programmes & Outreach — TECHMAN COLLEGE',
    description:
      'Discover islandwide youth empowerment initiatives, free skill development workshops, and scholarship pathways at TECHMAN COLLEGE.',
  },
  'free-skill-programme': {
    title: 'TECHMAN Free Skill Development Programme — 100% Free Islandwide',
    description:
      '100% Free physical weekend skill development programme across Sri Lanka led by Mohammed Rashadh, covering 12 future-ready technology, creativity, and career modules.',
  },
  lecturers: {
    title: 'Lecturers & Trainers — TECHMAN COLLEGE',
    description:
      'Meet the experienced trainers, educators, and technology practitioners mentoring students across TECHMAN COLLEGE programmes.',
  },
  'lecturer-detail': {
    title: 'Faculty Profile — TECHMAN COLLEGE',
    description:
      'Explore faculty expertise, assigned courses, and teaching focus at TECHMAN COLLEGE.',
  },
  admissions: {
    title: 'Online Admissions 2027 — TECHMAN COLLEGE',
    description:
      'Apply online to TECHMAN COLLEGE through our structured 6-step admission workflow, track your application status, or request a host institution workshop.',
  },
  campus: {
    title: 'Campuses & Learning Centres — TECHMAN COLLEGE Sri Lanka',
    description:
      'Explore TECHMAN COLLEGE physical branches across Sri Lanka and our Global Online Campus connected by one unified LMS.',
  },
  gallery: {
    title: 'College Gallery — TECHMAN COLLEGE',
    description:
      'View campus computer labs, creative studios, seminars, and official programme posters from TECHMAN COLLEGE.',
  },
  achievements: {
    title: 'Student Achievements & Portfolios — TECHMAN COLLEGE',
    description:
      'Explore approved student projects, digital credentials, and verified learner outcomes from TECHMAN COLLEGE.',
  },
  events: {
    title: 'Upcoming Events & Workshops — TECHMAN COLLEGE',
    description:
      'Stay updated on TECHMAN COLLEGE seminars, AI workshops, webinars, intake open days, and campus events.',
  },
  'event-detail': {
    title: 'Event Details — TECHMAN COLLEGE',
    description: 'Read full event schedule, highlights, and registration details from TECHMAN COLLEGE.',
  },
  career: {
    title: 'Career Centre & Opportunities — TECHMAN COLLEGE',
    description:
      'Access career guidance, internship pathways, portfolio coaching, and interview preparation through the TECHMAN COLLEGE Career Centre.',
  },
  library: {
    title: 'Digital Library & Study Resources — TECHMAN COLLEGE',
    description:
      'Explore TECHMAN COLLEGE digital study guides, syllabus handbooks, and course-linked resources inside our Student LMS.',
  },
  notices: {
    title: 'Official Notices & Announcements — TECHMAN COLLEGE',
    description:
      'Read verified admission notices, scholarship announcements, examination updates, and academic circulars from TECHMAN COLLEGE.',
  },
  contact: {
    title: 'Contact Admissions — TECHMAN COLLEGE',
    description:
      'Contact TECHMAN COLLEGE admissions counselors via hotline +94 710 108 803, WhatsApp, email, or online inquiry form.',
  },
  'student-login': {
    title: 'Student & Staff LMS Login — TECHMAN COLLEGE',
    description:
      'Sign in securely with Google SSO to access your TECHMAN COLLEGE Student, Lecturer, Branch Admin, or Super Admin LMS workspace.',
  },
  verify: {
    title: 'Certificate Verification (QR) — TECHMAN COLLEGE',
    description:
      'Verify official TECHMAN COLLEGE digital certificates instantly using the unique certificate number or QR code.',
  },
  'privacy-policy': {
    title: 'Privacy Policy — TECHMAN COLLEGE',
    description:
      'Read how TECHMAN COLLEGE collects, protects, and governs student, applicant, and faculty data securely.',
  },
  terms: {
    title: 'Terms & Conditions — TECHMAN COLLEGE',
    description:
      'Review the official academic, LMS usage, fee, and credential terms and conditions of TECHMAN COLLEGE.',
  },
};

export function applyRouteSeo(
  page: PublicPage,
  param?: string,
  customTitle?: string,
  customDescription?: string
): void {
  const base = ROUTE_SEO[page] || ROUTE_SEO.home;
  const title = customTitle ? `${customTitle} — TECHMAN COLLEGE` : base.title;
  const description = customDescription || base.description;
  const canonicalUrl = `${window.location.origin}${buildPublicPath(page, param)}`;

  document.title = title;

  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('content', content);
  };

  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);

  let ogUrl = document.querySelector('meta[property="og:url"]');
  if (!ogUrl) {
    ogUrl = document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrl);
  }
  ogUrl.setAttribute('content', canonicalUrl);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', canonicalUrl);
}
