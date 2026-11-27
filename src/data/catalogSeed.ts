import {
  AutomationWorkflow,
  Branch,
  BrandSettings,
  CmsItem,
  Course,
  IntegrationConfig,
  RolePermissionConfig,
  SpecialProgramme,
  SystemSettings,
  UserRole,
} from '../types/lms';

export const INSTITUTE_INFO = {
  officialName: 'TECHMAN COLLEGE',
  platformName: 'TECHMAN COLLEGE ONLINE',
  establishedYear: '2021',
  establishedLabel: 'Established in 2021',
  institutionId: 'techman-ai-lk',
  website: 'https://techmancollege.online',
  publicEmail: 'info@techmancollege.online',
  phone: '+94 710 108 803',
  whatsappDigits: '94710108803',
  country: 'Sri Lanka',
  academicIntake: '2027',
  currency: 'LKR',
  onlineBatch: 'Online Batch 04',
  physicalBatch: 'Physical Batch 02',
  registrationDeadline: '2026-11-27',
  courseStartDate: '2026-12-05',
  accreditations: [
    'ABE Endorsed (Online Verification)',
    'CPD Approved (Online Verification)',
    'Department of the Registrar of Companies Sri Lanka',
  ],
  ownerEmails: ['techmanfgoc@gmail.com', 'mrashadh64@gmail.com'] as const,
};

export const BRAND_IMAGES = {
  officialLogo: '/assets/aistudio/TECHMAN_COLLEGE_Logo_2ded40b0.png',
  officialLogoLegacy: '/assets/opt/logo_techman_college.webp',
  heroFuturisticAi: '/assets/opt/hero_futuristic_ai.webp',
  card3dRoboticsStem: '/assets/opt/card_3d_robotics_stem.webp',
  careerInnovationCenter: '/assets/opt/career_innovation_center.webp',
  heroTechLearner: '/assets/opt/hero_tech_learner.webp',
  card3dAiBrain: '/assets/opt/card_3d_ai_brain.webp',
  card3dAiBrainHeroBg: '/assets/opt/card_3d_ai_brain_hero_bg.webp',
  card3dCreativeTech: '/assets/opt/card_3d_creative_tech.webp',
  card3dWebDev: '/assets/opt/card_3d_web_dev.webp',
  aboutModernCampus: '/assets/opt/about_modern_campus.webp',
  heroStudents: '/assets/opt/hero_college_students.webp',
  heroCampus: '/assets/opt/hero_techman_campus.webp',
  campusComputerLab: '/assets/opt/campus_computer_lab.webp',
  campusLectureHall: '/assets/opt/campus_lecture_hall.webp',
  campusLibraryStudy: '/assets/opt/campus_library_study.webp',
  aiEngineering: '/assets/opt/course_ai_engineering.webp',
  creativeDesign: '/assets/opt/course_creative_design.webp',
  graduationCert: '/assets/opt/campus_graduation_cert.webp',
  posterAdmission2027: '/assets/opt/poster_admission_2027.webp',
  posterIntakeOverview: '/assets/opt/poster_intake_overview.webp',
  posterDiplomaIT: '/assets/opt/poster_diploma_it.webp',
  posterDiplomaBusinessMarketing: '/assets/opt/poster_diploma_business.webp',
  posterFreeGraphicDesign: '/assets/opt/poster_free_graphic_design.webp',
  posterFreeSkillDev: '/assets/opt/poster_free_skill_dev.webp',
  founderPhotoOriginal: '/assets/opt/founder_profile_original.webp',
  founderPhotoOriginalMobile: '/assets/opt/founder_profile_mobile.webp',
  founderPhotoCutout: '/assets/opt/founder_hero_cutout.webp',
  founderPhotoCutoutMobile: '/assets/opt/founder_hero_cutout_mobile.webp',
  trainerMohammedRashadh: '/assets/opt/founder_profile_original.webp',
  // Uploaded Official 2026/2027 TECHMAN Showcase Posters & AI First Class Deck
  posterUploadedWebApp: '/assets/aistudio/74e41ca3-1def-4cf6-a48f-3cbdcc903d75_baf9414e.png',
  posterUploadedGraphicAI: '/assets/aistudio/354ef4ab-a919-4f15-b046-8cb01a9cd203_269ca448.png',
  posterUploadedWebAppGreen: '/assets/aistudio/384c3027-5d88-4476-8c91-e75680faaf10_eee2d683.png',
  posterUploadedWebAppPurple: '/assets/aistudio/9cb94ca1-566b-4616-8e73-2203617bc851_76ddd927.png',
  posterUploadedCertGraphic: '/assets/aistudio/74dc5a2f-d68a-4154-aa70-715b210f6579_-_Copy_4502978f.png',
  posterUploadedDigitalMktAI: '/assets/aistudio/ChatGPT_Image_Sep_8__2026__11_31_05_PM_919734fe.png',
  posterUploadedDiplomaAI: '/assets/aistudio/d1cfb068-19aa-403f-887a-63a216582b29_e8c896e4.png',
  posterUploadedDoubleSkills: '/assets/aistudio/d3359bae-d1c2-48bf-9d8c-dc7159e646a8_6134c37d.png',
  posterUploadedPaidVsFree: '/assets/aistudio/fb05b940eb28af9c0a175270d0baa203_12d7bd90.jpg',
  posterUploadedCanvaBundle1: '/assets/aistudio/95f42d39-3e23-4e1a-872b-41c21d9a4557_6556eff7.png',
  posterUploadedCanvaBundle2: '/assets/aistudio/e6090a6e-6b56-4175-8b44-8aacbcb845f9_24f25cc0.png',
  posterUploadedCanvaBundle3: '/assets/aistudio/c2dcac7e-f3df-4083-802b-fbd46a81d858_5de7fe62.png',
  aiFirstClassPdf: '/assets/aistudio/AI_First_Class_-_No_Hype_Only_Reality_8465d6c3.pdf',
};

export interface CampusGalleryItem {
  id: string;
  title: string;
  caption: string;
  category: 'Campus Life' | 'Labs & Studios' | 'Official Posters';
  imageUrl: string;
  courseId?: string;
}

export const CAMPUS_GALLERY: CampusGalleryItem[] = [
  {
    id: 'gal-students-courtyard',
    title: 'TECHMAN COLLEGE Student Community',
    caption: 'Collaborative campus life supporting students across Sri Lanka since 2021.',
    category: 'Campus Life',
    imageUrl: BRAND_IMAGES.heroStudents,
  },
  {
    id: 'gal-computer-lab',
    title: 'AI & Software Engineering Computer Lab',
    caption: 'Hands-on practical workstations for coding, Generative AI, and cloud projects.',
    category: 'Labs & Studios',
    imageUrl: BRAND_IMAGES.campusComputerLab,
  },
  {
    id: 'gal-lecture-hall',
    title: 'Interactive Faculty Seminar & Mentorship',
    caption: 'Small-cohort sessions led by experienced lecturers and industry practitioners.',
    category: 'Campus Life',
    imageUrl: BRAND_IMAGES.campusLectureHall,
  },
  {
    id: 'gal-digital-library',
    title: 'Digital Library & Collaborative Study Lounge',
    caption: 'Quiet academic spaces paired with 24/7 digital notes and recorded lectures.',
    category: 'Campus Life',
    imageUrl: BRAND_IMAGES.campusLibraryStudy,
  },
  {
    id: 'gal-creative-studio',
    title: 'Creative Design & Media Production Studio',
    caption: 'Modern workspaces for Graphic Design, Video Editing, and Digital Marketing cohorts.',
    category: 'Labs & Studios',
    imageUrl: BRAND_IMAGES.creativeDesign,
  },
  {
    id: 'gal-graduation-credentials',
    title: 'Convocation & Verified Digital Credentials',
    caption: 'ABE-Endorsed and CPD-Approved certificates with instant online QR verification.',
    category: 'Campus Life',
    imageUrl: BRAND_IMAGES.graduationCert,
  },
  {
    id: 'gal-poster-intake',
    title: 'New Intake Open 2027 — Full Programme Catalogue',
    caption: 'Online Batch 04 · Physical Batch 02 · Registration open until 27-11-2026.',
    category: 'Official Posters',
    imageUrl: BRAND_IMAGES.posterIntakeOverview,
  },
  {
    id: 'gal-poster-it',
    title: 'Diploma in IT & Software Development',
    caption: '6 Months · Online & Offline · Coding & Non-Coding Tracks · LKR 35,000.',
    category: 'Official Posters',
    imageUrl: BRAND_IMAGES.posterDiplomaIT,
    courseId: 'dip-intl-it',
  },
  {
    id: 'gal-poster-biz',
    title: 'International Diploma in Business & Digital Marketing',
    caption: '6 Months · Online & Offline · TECHMAN COLLEGE Independent International Diploma.',
    category: 'Official Posters',
    imageUrl: BRAND_IMAGES.posterDiplomaBusinessMarketing,
    courseId: 'dip-intl-digital-marketing',
  },
  {
    id: 'gal-poster-free-gd',
    title: 'Certificate in Graphic Design — 100% Free Course',
    caption: '3 Months · ABE Endorsed · Canva, ChatGPT, Photoshop & Illustrator Basics.',
    category: 'Official Posters',
    imageUrl: BRAND_IMAGES.posterFreeGraphicDesign,
    courseId: 'cert-graphic-design',
  },
  {
    id: 'gal-poster-free-skill-dev',
    title: 'TECHMAN FREE SKILL DEVELOPMENT PROGRAMME',
    caption: '100% Free of Charge · Saturday & Sunday Only · Islandwide Physical Programme led by Mohammed Rashadh.',
    category: 'Official Posters',
    imageUrl: BRAND_IMAGES.posterFreeSkillDev,
  },
];

export interface OfficialPoster {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  imageUrl: string;
  courseId?: string;
  highlights: string;
}

export const OFFICIAL_POSTERS: OfficialPoster[] = [
  {
    id: 'poster-new-intake-2027',
    title: 'New Intake Open 2027 — Full Programme Catalogue',
    subtitle: 'Online Batch 04 · Physical Batch 02 · Start 05-12-2026',
    category: '2027 Intake',
    imageUrl: BRAND_IMAGES.posterIntakeOverview,
    highlights: 'ABE Endorsed · CPD Approved · 5 Fully Free Certificate Courses + 16 Diplomas',
  },
  {
    id: 'poster-admission-2027',
    title: 'Admission Open 2027 — Beginner to Professional',
    subtitle: 'Academic Excellence & Career-Ready Practical Mentorship',
    category: 'Admissions',
    imageUrl: BRAND_IMAGES.posterAdmission2027,
    highlights: 'Skill-Based Learning · Expert Mentorship · Future Career Guidance',
  },
  {
    id: 'poster-diploma-it-dev',
    title: 'Diploma in IT & Software Development',
    subtitle: '6 Months · Online & Offline · Reg LKR 3,000 · Course LKR 35,000',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterDiplomaIT,
    courseId: 'dip-intl-it',
    highlights: 'HTML/CSS/JS · React/Node.js · Flutter · Firebase/SQL · WordPress/Wix · Git/GitHub',
  },
  {
    id: 'poster-diploma-biz-mkt',
    title: 'International Diploma in Business & Digital Marketing',
    subtitle: '6 Months · Online & Offline · Reg LKR 3,000 · Course LKR 30,000',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterDiplomaBusinessMarketing,
    courseId: 'dip-intl-digital-marketing',
    highlights: 'TECHMAN COLLEGE Independent International Diploma · Build Your Career',
  },
  {
    id: 'poster-free-graphic-design',
    title: 'Certificate in Graphic Design — 100% Free Course',
    subtitle: '3 Months · Reg LKR 2,000 · Certificate LKR 3,000 · ABE Endorsed',
    category: 'Free Certificate',
    imageUrl: BRAND_IMAGES.posterFreeGraphicDesign,
    courseId: 'cert-graphic-design',
    highlights: 'Canva · ChatGPT · Cloud AI · Adobe Photoshop Basic · Adobe Illustrator Basic',
  },
  {
    id: 'poster-diploma-ai-flagship',
    title: 'Diploma in Artificial Intelligence — Build Your Future with AI',
    subtitle: 'AI · Automation · Generative AI · Hands-on Projects & Global Careers',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterUploadedDiplomaAI,
    courseId: 'dip-intl-ai',
    highlights: 'AI Fundamentals · Prompt Engineering · AI Automation (n8n/Make) · AI Agents',
  },
  {
    id: 'poster-diploma-graphic-ai',
    title: 'Diploma in Graphic Design with AI — 6 Months',
    subtitle: 'Canva · Adobe Photoshop · Adobe Illustrator · AI Design Tools',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterUploadedGraphicAI,
    courseId: 'dip-intl-graphic-design',
    highlights: 'Poster Design · Logo & Branding · Social Media · Portfolio & Freelancing',
  },
  {
    id: 'poster-diploma-web-app-ai',
    title: 'AI-Powered Advanced Web & App Development',
    subtitle: '6 Month Program · Build Websites & Apps Without Coding + Modern Stack',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterUploadedWebApp,
    courseId: 'dip-intl-web-design-dev',
    highlights: 'WordPress · Framer · Webflow · FlutterFlow · Bolt · ChatGPT · Claude · Gemini',
  },
  {
    id: 'poster-diploma-digital-mkt-ai',
    title: 'Diploma in Digital Marketing & Content Creation with AI',
    subtitle: '100% Online · Bilingual Support · Paid Ads, SEO & Reels Mastery',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterUploadedDigitalMktAI,
    courseId: 'dip-intl-digital-marketing',
    highlights: 'Digital Marketing · Content Creation · Meta/Google Ads · Copywriting · Analytics',
  },
  {
    id: 'poster-double-skills-promo',
    title: 'Double Your Skills — Graphic Design + Digital Marketing with AI',
    subtitle: 'Live + Recorded Sessions · Practical Projects · Certificates for Both Tracks',
    category: 'Campaign',
    imageUrl: BRAND_IMAGES.posterUploadedDoubleSkills,
    courseId: 'dip-intl-graphic-design',
    highlights: 'Design Fundamentals · Adobe Suite · Social Media Marketing · AI Automation',
  },
];

export const UPLOADED_REGISTRATION_CSV_PATH =
  '/assets/aistudio/TECHMAN_AI___STUDENT_REGISTRATION_FORM_31d60d6a.csv';

export interface UploadedMigrationDataset {
  id: string;
  label: string;
  fileName: string;
  path: string;
  notes: string;
}

export const UPLOADED_MIGRATION_DATASETS: UploadedMigrationDataset[] = [
  {
    id: 'reg-form-main',
    label: 'Student Registration Form (Primary — 54 rows)',
    fileName: 'TECHMAN AI — STUDENT REGISTRATION FORM.csv',
    path: '/assets/aistudio/TECHMAN_AI___STUDENT_REGISTRATION_FORM_31d60d6a.csv',
    notes: '43 columns · Primary registration export with full contact, guardian, course, and district details.',
  },
  {
    id: 'multi-skill-2026',
    label: 'Multi-Skill Mastery 2026 (13 rows)',
    fileName: 'MULTI-SKILL MASTERY – STUDENT REGISTRATION 2026.csv',
    path: '/assets/aistudio/MULTI-SKILL_MASTERY___STUDENT_REGISTRATION_2026_1cbccc44.csv',
    notes: '14 columns · Includes Preferred Branch, District, Learning Mode, and multi-skill selections.',
  },
  {
    id: 'reg-form-copy',
    label: 'Student Registration Form (Duplicate Copy — 54 rows)',
    fileName: 'TECHMAN AI — STUDENT REGISTRATION FORM (Copy).csv',
    path: '/assets/aistudio/TECHMAN_AI___STUDENT_REGISTRATION_FORM_5957df57.csv',
    notes: 'Duplicate export of the primary registration form (same 54 student records).',
  },
  {
    id: 'voucher-reg',
    label: 'Student Voucher Registration (30 rows — Timestamp Only)',
    fileName: 'TECHMAN AI INSTITUTE AND ACADEMY – Student Voucher Registration.csv',
    path: '/assets/aistudio/TECHMAN_AI_INSTITUTE_AND_ACADEMY___Student_Voucher_Registration_0e50f940.csv',
    notes: 'Warning: Contains only 1 column (Timestamp) with no student identity fields.',
  },
];

export function isProtectedOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  return INSTITUTE_INFO.ownerEmails.includes(email.toLowerCase() as (typeof INSTITUTE_INFO.ownerEmails)[number]);
}

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionConfig[] = [
  {
    role: 'SUPER_ADMIN',
    label: 'Super Admin — Owner / CEO',
    description: 'Full sovereign control over all branches, courses, financials, RBAC, AI CEO Assistant, audit logs, and SaaS governance.',
    permissions: [
      'dashboard.owner', 'students.manage', 'lecturers.manage', 'staff.manage', 'branches.manage',
      'courses.manage', 'admissions.manage', 'attendance.manage', 'assignments.manage', 'exams.manage',
      'finance.manage', 'certificates.manage', 'cms.manage', 'affiliates.manage', 'ai.ceo',
      'ai.tutor', 'ai.exam', 'ai.career', 'library.manage', 'community.moderate', 'audit.view', 'settings.manage',
    ],
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    description: 'Manages assigned college operations, admissions, courses, and day-to-day workflows.',
    permissions: [
      'dashboard.owner', 'students.manage', 'lecturers.manage', 'courses.manage', 'admissions.manage',
      'attendance.manage', 'assignments.manage', 'exams.manage', 'certificates.manage', 'cms.manage',
      'library.manage', 'community.moderate',
    ],
  },
  {
    role: 'BRANCH_MANAGER',
    label: 'Branch Manager',
    description: 'Oversees assigned regional branch students, lecturers, batches, attendance, and branch reports.',
    permissions: ['students.manage', 'lecturers.manage', 'admissions.manage', 'attendance.manage', 'finance.manage'],
  },
  {
    role: 'COORDINATOR',
    label: 'Coordinator',
    description: 'Coordinates assigned student cohorts, admission follow-ups, and batch scheduling.',
    permissions: ['students.manage', 'admissions.manage', 'attendance.manage'],
  },
  {
    role: 'ADMISSION_OFFICER',
    label: 'Admission Officer',
    description: 'Handles prospective inquiries, 2027 applications, document verification, and student ID enrollment.',
    permissions: ['admissions.manage', 'students.manage'],
  },
  {
    role: 'ACADEMIC_MANAGER',
    label: 'Academic Manager',
    description: 'Oversees curriculum templates, lecturers, examinations, and certificate eligibility.',
    permissions: ['courses.manage', 'lecturers.manage', 'exams.manage', 'certificates.manage', 'library.manage'],
  },
  {
    role: 'LECTURER',
    label: 'Lecturer / Trainer',
    description: 'Delivers assigned lessons, marks attendance, evaluates assignments, and approves AI exam drafts.',
    permissions: ['attendance.manage', 'assignments.manage', 'exams.manage', 'ai.exam', 'library.manage'],
  },
  {
    role: 'ACCOUNTANT',
    label: 'Accountant',
    description: 'Verifies LKR student payments, generates receipts, tracks expenses, and exports branch financial reports.',
    permissions: ['finance.manage'],
  },
  {
    role: 'EXAMINER',
    label: 'Examiner',
    description: 'Approves examinations, moderates grading rubrics, publishes results, and validates certificate readiness.',
    permissions: ['exams.manage', 'ai.exam', 'certificates.manage'],
  },
  {
    role: 'CONTENT_MANAGER',
    label: 'Content Manager',
    description: 'Manages public website CMS, news, events, posters, AI Media Organizer drafts, and digital library.',
    permissions: ['cms.manage', 'library.manage', 'community.moderate'],
  },
  {
    role: 'STUDENT',
    label: 'Student',
    description: 'Accesses enrolled courses, lessons, assignments, exams, payments, Digital ID, AI Tutor, and AI Career Center.',
    permissions: ['ai.tutor', 'ai.career'],
  },
  {
    role: 'AFFILIATE',
    label: 'Affiliate / Referral Partner',
    description: 'Generates referral links & QR codes, tracks student conversions, and submits approved commission withdrawals.',
    permissions: ['affiliates.manage'],
  },
  {
    role: 'SUPPORT_STAFF',
    label: 'Support Staff',
    description: 'Assists students and visitors with inquiries, onboarding help, and community moderation.',
    permissions: ['community.moderate'],
  },
];

export function hasRolePermission(role: UserRole | undefined, perm: string): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return true;
  const found = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role === role);
  return Boolean(found?.permissions.includes(perm as never));
}

// Course-specific editable syllabus templates (Section 6)
export const DOMAIN_SYLLABI: Record<string, string[]> = {
  'Graphic Design': [
    'Canva & Canva AI Design Systems',
    'Adobe Photoshop Essentials & Retouching',
    'Adobe Illustrator Vector Mastery',
    'CorelDRAW Print Production',
    'ChatGPT & Prompt Engineering for Designers',
    'Logo Design & Brand Identity Systems',
    'Poster, Social Media, Business Card & Brochure Design',
    'CV Design & Commercial Packaging Design',
    'Portfolio Development & Freelancing Projects',
  ],
  'Web Development': [
    'HTML5 Semantic Structure & CSS3 Responsive Layouts',
    'Modern JavaScript (ES2024+)',
    'React Basics & Component Architecture',
    'Backend Development & REST APIs',
    'Database Management, Firebase & SQL',
    'WordPress, No-Code & AI Website Creation',
    'Cloud Hosting, Git & GitHub Workflows',
    'Live Production Projects & Portfolio Development',
  ],
  'Digital Marketing': [
    'Marketing Fundamentals & Content Strategy',
    'Social Media, Facebook & Instagram Marketing',
    'Meta Ads & Google Ads Campaign Engineering',
    'Google Analytics & Performance Attribution',
    'WhatsApp Business Marketing & CRM Funnels',
    'Search Engine Optimization (SEO) & Email Marketing',
    'Video Marketing, Branding & Campaign Planning',
    'Freelancing & Agency Client Acquisition',
  ],
  'Artificial Intelligence': [
    'AI Fundamentals & Generative AI Architecture',
    'Advanced Prompt Engineering (ChatGPT, Gemini, Claude)',
    'AI Image Generation & Creative Direction',
    'AI Video Creation & AI Audio Tools',
    'AI Automation, Workflow Automation & No-Code AI',
    'Autonomous AI Agents & Tool Integrations',
    'Capstone Real-World AI Projects',
  ],
  'Video Editing': [
    'Video Editing Fundamentals & Visual Storytelling',
    'CapCut Pro & AI Video Editing Workflows',
    'Script Writing & Visual Prompt Writing',
    'Reels & High-Retention Short-Form Content',
    'Motion Graphics & Kinetic Typography',
    'Audio Editing, Mastering & Multi-Platform Exporting',
  ],
  'Information Technology': [
    'Computer Systems, OS & Productivity Suites',
    'Networking & Cloud Collaboration Fundamentals',
    'Cybersecurity Hygiene & Digital Privacy',
    'Database Foundations & Automation Tools',
    'AI Productivity Workflows & Practical Capstone',
  ],
  'Business & Management': [
    'Organizational Strategy & Business Operations',
    'Financial Literacy & Budgeting in LKR/Global Markets',
    'People Leadership, HRM & Talent Development',
    'E-Commerce Storefronts & Supply Chain Basics',
    'AI-Driven Business Analytics & Case Project',
  ],
  'Psychology': [
    'Foundations of General & Cognitive Psychology',
    'Human Development & Behavioral Analysis',
    'Workplace Communication & Emotional Intelligence',
    'Counseling Ethics & Applied Research Methods',
    'Case Study Evaluation & Practical Portfolio',
  ],
  'Arabic & Islamic Studies': [
    'Arabic Phonetics, Script & Structured Grammar',
    'Conversational Arabic & Quranic Vocabulary',
    'Makharij, Sifaat & Applied Tajweed Rules',
    'Classical & Contemporary Islamic Studies Foundations',
    'Guided Recitation Assessment & Oral Examination',
  ],
};

function imageForDomain(domain: string): string {
  if (domain === 'Digital Marketing & Creative Media' || domain === 'Graphic Design' || domain === 'Video Editing' || domain === 'Digital Marketing') {
    return BRAND_IMAGES.creativeDesign;
  }
  if (domain === 'IT & Technology' || domain === 'Artificial Intelligence' || domain === 'Web Development' || domain === 'Information Technology') {
    return BRAND_IMAGES.aiEngineering;
  }
  return BRAND_IMAGES.graduationCert;
}

function makeCourseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

interface RawCourseSeed {
  id: string;
  code: string;
  name: string;
  category: 'Certificate' | 'Diploma';
  domain:
    | 'IT & Technology'
    | 'Digital Marketing & Creative Media'
    | 'Business & Management'
    | 'Psychology'
    | 'Arabic & Islamic Studies';
  syllabusKey: keyof typeof DOMAIN_SYLLABI;
  duration: string;
  mode: 'Online' | 'Physical' | 'Hybrid';
  courseFeeLkr: number;
  feeConfigured: boolean;
  isFree?: boolean;
  registrationFeeLkr?: number;
  certificateFeeLkr?: number;
  description: string;
  imageUrl?: string;
  featured?: boolean;
  customSyllabus?: string[];
}

export const COURSE_SUBJECT_DOMAINS = [
  'IT & Technology',
  'Digital Marketing & Creative Media',
  'Business & Management',
  'Psychology',
  'Arabic & Islamic Studies',
] as const;

// EXACTLY 40 UNIQUE 2027 COURSES: 22 Certificate (5 marked FREE, zero duplicates) + 18 Diploma
const RAW_40_COURSES: RawCourseSeed[] = [
  // =========================================================================
  // A. CERTIFICATE LEVEL — 22 COURSES
  // =========================================================================

  // IT & Technology (8)
  {
    id: 'cert-graphic-design',
    code: 'TM-CGD-27',
    name: 'Certificate in Graphic Design',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Graphic Design',
    duration: '3 Months',
    mode: 'Hybrid',
    courseFeeLkr: 0,
    feeConfigured: true,
    isFree: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 3000,
    imageUrl: BRAND_IMAGES.posterFreeGraphicDesign,
    featured: true,
    description:
      '100% Free Certificate Course (2027 Intake). Master Canva, ChatGPT, Cloud AI, Adobe Photoshop basics, and Adobe Illustrator basics with practical portfolio projects.',
  },
  {
    id: 'cert-web-dev-design',
    code: 'TM-CWD-27',
    name: 'Certificate in Web Design',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Web Development',
    duration: '4 Months',
    mode: 'Hybrid',
    courseFeeLkr: 34000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3000,
    description:
      'Build responsive modern websites with HTML5, CSS3, JavaScript fundamentals, WordPress, no-code AI web builders, and live cloud publishing.',
  },
  {
    id: 'cert-information-technology',
    code: 'TM-CIT-27',
    name: 'Certificate in Information Technology',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Information Technology',
    duration: '3 Months',
    mode: 'Hybrid',
    courseFeeLkr: 0,
    feeConfigured: true,
    isFree: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 3000,
    featured: true,
    description:
      '100% Free Certificate Course. Essential computing, cloud office suites, cybersecurity basics, and AI-assisted workplace productivity.',
  },
  {
    id: 'cert-artificial-intelligence',
    code: 'TM-CAI-27',
    name: 'Certificate in Artificial Intelligence',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Artificial Intelligence',
    duration: 'To be configured by Admin',
    mode: 'Hybrid',
    courseFeeLkr: 0,
    feeConfigured: false,
    featured: true,
    imageUrl: BRAND_IMAGES.posterUploadedDiplomaAI,
    description:
      'Practical foundation in Artificial Intelligence: real-world AI concepts, Generative AI tools, ethical usage, and workplace productivity workflows.',
  },
  {
    id: 'cert-prompt-engineering',
    code: 'TM-CPE-27',
    name: 'Certificate in Prompt Engineering',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Artificial Intelligence',
    duration: 'To be configured by Admin',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'Structured prompt design, logical instruction frameworks, multi-model prompting (ChatGPT, Gemini, Claude), and applied productivity workflows.',
  },
  {
    id: 'cert-ai-automation',
    code: 'TM-CAA-27',
    name: 'Certificate in AI Automation',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Artificial Intelligence',
    duration: 'To be configured by Admin',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'No-code AI workflow automation fundamentals for business operations, document pipelines, and customer communication workflows.',
  },
  {
    id: 'cert-video-editing',
    code: 'TM-CVE-27',
    name: 'Certificate in Video Editing',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Video Editing',
    duration: 'To be configured by Admin',
    mode: 'Hybrid',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'Hands-on video editing essentials covering CapCut Pro, timeline storytelling, audio cleanup, short-form Reels editing, and multi-platform exports.',
  },
  {
    id: 'cert-canva-design',
    code: 'TM-CCD-27',
    name: 'Certificate in Canva Design',
    category: 'Certificate',
    domain: 'IT & Technology',
    syllabusKey: 'Graphic Design',
    duration: '3 Months',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: true,
    isFree: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 3000,
    featured: true,
    description:
      '100% Free Certificate Course. Commercial visual design using Canva and Canva AI for social media kits, pitch decks, and print templates.',
  },

  // Digital Marketing & Creative Media (4)
  {
    id: 'cert-digital-marketing',
    code: 'TM-CDM-27',
    name: 'Certificate in Digital Marketing',
    category: 'Certificate',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Digital Marketing',
    duration: 'To be configured by Admin',
    mode: 'Hybrid',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'Practical digital marketing foundations covering content strategy, paid social campaigns, SEO essentials, analytics, and customer funnels.',
  },
  {
    id: 'cert-social-media-marketing',
    code: 'TM-CSM-27',
    name: 'Certificate in Social Media Marketing',
    category: 'Certificate',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Digital Marketing',
    duration: '3 Months',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: true,
    isFree: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 3000,
    featured: true,
    description:
      '100% Free Certificate Course. Practical Facebook, Instagram, TikTok, and WhatsApp Business growth strategies with Meta Ads fundamentals.',
  },
  {
    id: 'cert-content-creation',
    code: 'TM-CCC-27',
    name: 'Certificate in Content Creation',
    category: 'Certificate',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Video Editing',
    duration: '3 Months',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: true,
    isFree: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 3000,
    featured: true,
    description:
      '100% Free Certificate Course. End-to-end creator training covering scripting, CapCut editing, AI visual storytelling, and digital audience building.',
  },
  {
    id: 'cert-personal-branding',
    code: 'TM-CPB-27',
    name: 'Certificate in Personal Branding',
    category: 'Certificate',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Digital Marketing',
    duration: 'To be configured by Admin',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'Build a credible professional identity across LinkedIn, social media, digital portfolios, and public communication for career and freelance growth.',
  },

  // Business & Management (3)
  {
    id: 'cert-business-management',
    code: 'TM-CBM-27',
    name: 'Certificate in Business Management',
    category: 'Certificate',
    domain: 'Business & Management',
    syllabusKey: 'Business & Management',
    duration: '4 Months',
    mode: 'Hybrid',
    courseFeeLkr: 30000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3000,
    description:
      'Core management principles, financial planning, operations, and entrepreneurship for Sri Lankan and regional businesses.',
  },
  {
    id: 'cert-hrm',
    code: 'TM-CHR-27',
    name: 'Certificate in Human Resource Management (HRM)',
    category: 'Certificate',
    domain: 'Business & Management',
    syllabusKey: 'Business & Management',
    duration: '4 Months',
    mode: 'Hybrid',
    courseFeeLkr: 30000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3000,
    description:
      'Talent acquisition, employee relations, workplace policy basics, and modern HR analytics.',
  },
  {
    id: 'cert-ecommerce',
    code: 'TM-CEC-27',
    name: 'Certificate in E-Commerce',
    category: 'Certificate',
    domain: 'Business & Management',
    syllabusKey: 'Business & Management',
    duration: '3 Months',
    mode: 'Online',
    courseFeeLkr: 27000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3000,
    description:
      'Launch, optimize, and scale online retail stores with payment gateways, logistics, and digital customer retention.',
  },

  // Psychology (1)
  {
    id: 'cert-general-psychology',
    code: 'TM-CGP-27',
    name: 'Certificate in General Psychology',
    category: 'Certificate',
    domain: 'Psychology',
    syllabusKey: 'Psychology',
    duration: '4 Months',
    mode: 'Hybrid',
    courseFeeLkr: 32000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3000,
    description:
      'Foundational exploration of human cognition, behavior, motivation, emotional intelligence, and everyday interpersonal psychology.',
  },

  // Arabic & Islamic Studies (6)
  {
    id: 'cert-arabic-language',
    code: 'TM-CAL-27',
    name: 'Certificate in Arabic Language',
    category: 'Certificate',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '4 Months',
    mode: 'Online',
    courseFeeLkr: 22000,
    feeConfigured: true,
    registrationFeeLkr: 2500,
    certificateFeeLkr: 2500,
    description:
      'Structured reading, writing, vocabulary, and foundational Modern Standard Arabic grammar.',
  },
  {
    id: 'cert-arabic-speaking',
    code: 'TM-CAS-27',
    name: 'Certificate in Arabic Speaking',
    category: 'Certificate',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '3 Months',
    mode: 'Online',
    courseFeeLkr: 20000,
    feeConfigured: true,
    registrationFeeLkr: 2500,
    certificateFeeLkr: 2500,
    description:
      'Interactive spoken Arabic sessions designed for daily conversation, travel, and Middle East career readiness.',
  },
  {
    id: 'cert-quran-reading',
    code: 'TM-CQR-27',
    name: "Certificate in Qur'an Reading",
    category: 'Certificate',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '4 Months',
    mode: 'Online',
    courseFeeLkr: 16000,
    feeConfigured: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 2000,
    description:
      "Guided step-by-step Qur'anic recitation fluency with personalized instructor recitation checks.",
  },
  {
    id: 'cert-tajweed',
    code: 'TM-CTJ-27',
    name: 'Certificate in Tajweed',
    category: 'Certificate',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '4 Months',
    mode: 'Online',
    courseFeeLkr: 18000,
    feeConfigured: true,
    registrationFeeLkr: 2000,
    certificateFeeLkr: 2000,
    description:
      'Accurate articulation points (Makharij), characteristics of letters, and applied Tajweed recitation practice.',
  },
  {
    id: 'cert-islamic-studies',
    code: 'TM-CIS-27',
    name: 'Certificate in Islamic Studies',
    category: 'Certificate',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '4 Months',
    mode: 'Online',
    courseFeeLkr: 20000,
    feeConfigured: true,
    registrationFeeLkr: 2500,
    certificateFeeLkr: 2500,
    description:
      'Comprehensive foundations in Aqeedah, Fiqh, Seerah, and contemporary Islamic ethics.',
  },
  {
    id: 'cert-quranic-arabic',
    code: 'TM-CQA-27',
    name: "Certificate in Qur'anic Arabic",
    category: 'Certificate',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '4 Months',
    mode: 'Online',
    courseFeeLkr: 22000,
    feeConfigured: true,
    registrationFeeLkr: 2500,
    certificateFeeLkr: 2500,
    description:
      "Understand Qur'anic vocabulary, morphology (Sarf), and sentence structure (Nahw) directly from text.",
  },

  // =========================================================================
  // B. DIPLOMA LEVEL — 18 COURSES
  // =========================================================================

  // IT & Technology (6)
  {
    id: 'dip-intl-graphic-design',
    code: 'TM-DGD-27',
    name: 'International Diploma in Graphic Design',
    category: 'Diploma',
    domain: 'IT & Technology',
    syllabusKey: 'Graphic Design',
    duration: '6 Months',
    mode: 'Hybrid',
    courseFeeLkr: 58000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4000,
    imageUrl: BRAND_IMAGES.posterUploadedGraphicAI,
    featured: true,
    description:
      'Industry-grade creative suite mastery across Adobe Photoshop, Illustrator, CorelDRAW, Canva AI, packaging, and agency portfolio creation.',
  },
  {
    id: 'dip-intl-web-design-dev',
    code: 'TM-DWD-27',
    name: 'International Diploma in Web Design & Development',
    category: 'Diploma',
    domain: 'IT & Technology',
    syllabusKey: 'Web Development',
    duration: '6 Months',
    mode: 'Hybrid',
    courseFeeLkr: 35000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4500,
    imageUrl: BRAND_IMAGES.posterUploadedWebApp,
    featured: true,
    description:
      'Full-stack & AI-powered web engineering covering HTML/CSS/JS, React, Node.js, APIs, Firebase, SQL, WordPress/Framer, Git/GitHub, and live capstone builds.',
  },
  {
    id: 'dip-intl-it',
    code: 'TM-DIT-27',
    name: 'International Diploma in Information Technology',
    category: 'Diploma',
    domain: 'IT & Technology',
    syllabusKey: 'Information Technology',
    duration: '6 Months',
    mode: 'Hybrid',
    courseFeeLkr: 35000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4500,
    imageUrl: BRAND_IMAGES.posterDiplomaIT,
    featured: true,
    description:
      'Professional International Diploma in Information Technology covering modern systems, web & database foundations, cloud tools, no-code platforms, and portfolio projects.',
    customSyllabus: [
      'Web Development (HTML, CSS, JS)',
      'Modern Development (React / Node.js)',
      'App Development (Flutter Basics)',
      'Database & Backend (Firebase / SQL)',
      'No-Code Development (WordPress / Wix)',
      'IT Tools & Productivity',
      'Cloud & Deployment (Hosting, Git, GitHub)',
      'Project Development & Portfolio',
    ],
  },
  {
    id: 'dip-intl-ai',
    code: 'TM-DAI-27',
    name: 'International Diploma in Artificial Intelligence',
    category: 'Diploma',
    domain: 'IT & Technology',
    syllabusKey: 'Artificial Intelligence',
    duration: '8 Months',
    mode: 'Hybrid',
    courseFeeLkr: 85000,
    feeConfigured: true,
    registrationFeeLkr: 5000,
    certificateFeeLkr: 5000,
    imageUrl: BRAND_IMAGES.posterUploadedDiplomaAI,
    featured: true,
    description:
      'Flagship 2027 programme covering Generative AI, ChatGPT, Gemini, Claude, prompt engineering, multimodal production, AI agents, and applied enterprise builds.',
  },
  {
    id: 'dip-intl-ai-automation',
    code: 'TM-DAA-27',
    name: 'International Diploma in AI Automation',
    category: 'Diploma',
    domain: 'IT & Technology',
    syllabusKey: 'Artificial Intelligence',
    duration: '6 Months',
    mode: 'Online',
    courseFeeLkr: 74000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4500,
    description:
      'Build autonomous business workflows, no-code AI pipelines (Make/n8n), CRM agents, and automated client delivery systems.',
  },
  {
    id: 'dip-intl-software-dev',
    code: 'TM-DSD-27',
    name: 'International Diploma in Software Development',
    category: 'Diploma',
    domain: 'IT & Technology',
    syllabusKey: 'Web Development',
    duration: 'To be configured by Admin',
    mode: 'Hybrid',
    courseFeeLkr: 0,
    feeConfigured: false,
    imageUrl: BRAND_IMAGES.posterUploadedWebAppGreen,
    description:
      'Comprehensive software engineering diploma covering programming logic, web & mobile application architecture, APIs, databases, testing, and cloud deployment.',
  },

  // Digital Marketing & Creative Media (4)
  {
    id: 'dip-intl-digital-marketing',
    code: 'TM-DDM-27',
    name: 'International Diploma in Digital Marketing',
    category: 'Diploma',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Digital Marketing',
    duration: '6 Months',
    mode: 'Hybrid',
    courseFeeLkr: 30000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4000,
    imageUrl: BRAND_IMAGES.posterUploadedDigitalMktAI,
    featured: true,
    description:
      'Master Digital Strategy, Meta Ads, Google Ads, SEO, Analytics, Copywriting, WhatsApp CRM, and full-funnel growth campaigns with AI tools.',
  },
  {
    id: 'dip-intl-video-editing',
    code: 'TM-DVE-27',
    name: 'International Diploma in Video Editing & Content Creation',
    category: 'Diploma',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Video Editing',
    duration: '6 Months',
    mode: 'Hybrid',
    courseFeeLkr: 56000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4000,
    description:
      'Commercial video production with CapCut Pro, AI video synthesis, motion graphics, sound design, and multi-channel creator publishing.',
  },
  {
    id: 'dip-intl-social-media-marketing',
    code: 'TM-DSM-27',
    name: 'International Diploma in Social Media Marketing',
    category: 'Diploma',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Digital Marketing',
    duration: 'To be configured by Admin',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'Advanced social media brand strategy, multi-platform content calendars, paid performance campaigns, community analytics, and agency reporting.',
  },
  {
    id: 'dip-intl-freelancing',
    code: 'TM-DFE-27',
    name: 'International Diploma in Freelancing & Digital Entrepreneurship',
    category: 'Diploma',
    domain: 'Digital Marketing & Creative Media',
    syllabusKey: 'Business & Management',
    duration: 'To be configured by Admin',
    mode: 'Online',
    courseFeeLkr: 0,
    feeConfigured: false,
    description:
      'Independent digital business building covering service positioning, international freelancing platforms, client proposals, pricing, and digital venture operations.',
  },

  // Business & Management (3)
  {
    id: 'dip-intl-business-mgmt',
    code: 'TM-DBM-27',
    name: 'International Diploma in Business Management',
    category: 'Diploma',
    domain: 'Business & Management',
    syllabusKey: 'Business & Management',
    duration: '6 Months',
    mode: 'Hybrid',
    courseFeeLkr: 30000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4500,
    imageUrl: BRAND_IMAGES.posterDiplomaBusinessMarketing,
    description:
      'Strategic leadership, managerial finance, marketing operations, and digital transformation for modern executives.',
  },
  {
    id: 'dip-intl-hrm',
    code: 'TM-DHR-27',
    name: 'International Diploma in Human Resource Management',
    category: 'Diploma',
    domain: 'Business & Management',
    syllabusKey: 'Business & Management',
    duration: '8 Months',
    mode: 'Hybrid',
    courseFeeLkr: 66000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4500,
    description:
      'Strategic workforce planning, performance systems, Sri Lankan labor law awareness, and people analytics.',
  },
  {
    id: 'dip-intl-ecommerce',
    code: 'TM-DEC-27',
    name: 'International Diploma in E-Commerce',
    category: 'Diploma',
    domain: 'Business & Management',
    syllabusKey: 'Business & Management',
    duration: '6 Months',
    mode: 'Online',
    courseFeeLkr: 60000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4000,
    description:
      'Cross-border e-commerce architecture, conversion optimization, marketplace scaling, and AI-assisted merchandising.',
  },

  // Psychology (1)
  {
    id: 'dip-intl-psychology',
    code: 'TM-DPS-27',
    name: 'International Diploma in Psychology',
    category: 'Diploma',
    domain: 'Psychology',
    syllabusKey: 'Psychology',
    duration: '8 Months',
    mode: 'Hybrid',
    courseFeeLkr: 70000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 4500,
    description:
      'In-depth cognitive, developmental, organizational, and applied counseling foundations with structured case studies.',
  },

  // Arabic & Islamic Studies (4)
  {
    id: 'dip-arabic-language',
    code: 'TM-DAL-27',
    name: 'Diploma in Arabic Language',
    category: 'Diploma',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '10 Months',
    mode: 'Online',
    courseFeeLkr: 48000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3500,
    description:
      'Advanced Arabic linguistics, fluent conversation, classical and modern reading comprehension, and translation skills.',
  },
  {
    id: 'dip-islamic-studies',
    code: 'TM-DIS-27',
    name: 'Diploma in Islamic Studies',
    category: 'Diploma',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '10 Months',
    mode: 'Online',
    courseFeeLkr: 48000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3500,
    description:
      'Structured multi-discipline Islamic scholarship covering Tafsir, Hadith principles, Fiqh, and Islamic civilization.',
  },
  {
    id: 'dip-advanced-tajweed',
    code: 'TM-DAT-27',
    name: 'Advanced Tajweed Programme',
    category: 'Diploma',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '8 Months',
    mode: 'Online',
    courseFeeLkr: 42000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3000,
    description:
      'Mastery-level Tajweed theory and intensive oral recitation refinement under qualified teachers.',
  },
  {
    id: 'dip-hifz-ul-quran',
    code: 'TM-DHQ-27',
    name: "Hifz-ul-Qur'an Programme",
    category: 'Diploma',
    domain: 'Arabic & Islamic Studies',
    syllabusKey: 'Arabic & Islamic Studies',
    duration: '12–24 Months',
    mode: 'Hybrid',
    courseFeeLkr: 54000,
    feeConfigured: true,
    registrationFeeLkr: 3000,
    certificateFeeLkr: 3500,
    description:
      "Structured Qur'an memorization track with daily Sabaq, Sabqi, and Manzil milestones and personalized revision schedules.",
  },
];

export const SEED_COURSES: Course[] = RAW_40_COURSES.map(
  ({ customSyllabus, imageUrl, syllabusKey, ...item }) => {
    const isFree = Boolean(item.isFree);
    return {
      ...item,
      slug: makeCourseSlug(item.name),
      imageUrl: imageUrl || imageForDomain(item.domain),
      bannerUrl: imageUrl || imageForDomain(item.domain),
      currency: 'LKR',
      isFree,
      feeConfigured: isFree,
      courseFeeLkr: 0,
      registrationFeeLkr: 0,
      certificateFeeLkr: 0,
      duration: 'Pending Admin Setup',
      courseLanguage: 'Pending Admin Setup',
      branchIds: ['branch-panadura', 'branch-kalutara', 'branch-colombo-hq', 'branch-online-global'],
      admissionStatus: 'open',
      academicYear: '2027',
      featured: Boolean(item.featured),
      seoTitle: `${item.name} — 2027 Intake | TECHMAN COLLEGE ONLINE`.slice(0, 180),
      seoDescription: item.description.slice(0, 360),
      level:
        item.category === 'Diploma'
          ? 'Diploma Level (2027)'
          : 'Certificate Level (2027)',
      installmentPlan: isFree
        ? '100% Free Course Tuition'
        : 'Pending Admin Setup',
      lecturerName: 'Pending Admin Setup',
      batchName: '2027 Intake — Pending Admin Setup',
      startDate: 'Pending Admin Setup',
      endDate: 'Pending Admin Setup',
      maxStudents: 45,
      entryRequirements: 'Pending Admin Setup',
      learningOutcomes: [
        `Build practical foundational and applied competencies in ${item.name}`,
        'Complete structured hands-on coursework and guided assessments via TECHMAN COLLEGE ONLINE',
        'Prepare a verifiable project portfolio reviewed by course lecturers',
      ],
      syllabusTopics:
        customSyllabus || DOMAIN_SYLLABI[syllabusKey] || DOMAIN_SYLLABI['Information Technology'],
      certificateEligible: true,
      status: 'published',
      institutionId: INSTITUTE_INFO.institutionId,
    };
  }
);

export const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  institutionId: INSTITUTE_INFO.institutionId,
  brandName: 'TECHMAN COLLEGE ONLINE',
  shortName: 'TECHMAN COLLEGE',
  tagline: 'Learn · Innovate · Create — 2027 Official Intake',
  primaryColor: '#101D35',
  secondaryColor: '#172A45',
  accentColor: '#1677FF',
  lightSurfaceColor: '#EAF1FC',
  logoUrl: BRAND_IMAGES.officialLogo,
  altLogoUrl: BRAND_IMAGES.officialLogo,
  founderPhotoUrl: BRAND_IMAGES.founderPhotoOriginal,
  contactPhone: INSTITUTE_INFO.phone,
  whatsappNumber: INSTITUTE_INFO.whatsappDigits,
  website: INSTITUTE_INFO.website,
  email: INSTITUTE_INFO.publicEmail,
  defaultFooterNote: 'TECHMAN COLLEGE ONLINE · Established in 2021 · https://techmancollege.online',
};

export const DEFAULT_INTEGRATION_CONFIGS: IntegrationConfig[] = [
  {
    id: 'openai',
    provider: 'openai',
    label: 'OpenAI / ChatGPT',
    category: 'AI & LLM',
    enabled: true,
    defaultModel: 'gpt-4o-mini',
    temperature: 0.5,
    maxTokens: 1200,
    monthlyBudgetUsd: 50,
    allowedFeatures: [
      'poster_copy',
      'course_descriptions',
      'social_captions',
      'syllabus_drafts',
      'translations',
      'faqs',
    ],
    connectionStatus: 'not_configured',
    notes: 'Reads server-side OPENAI_API_KEY via /api/integrations/openai/*. Never stored in browser.',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'gemini_ai',
    provider: 'gemini_ai',
    label: 'Google Gemini AI (Server SDK)',
    category: 'AI & LLM',
    enabled: true,
    defaultModel: 'gemini-4-hydrogen',
    temperature: 0.4,
    maxTokens: 2048,
    allowedFeatures: ['poster_copy', 'ai_tutor', 'exam_assistant', 'career_center', 'ceo_assistant'],
    connectionStatus: 'not_configured',
    notes: 'Server-side @google/genai SDK backed by GEMINI_API_KEY.',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'apify',
    provider: 'apify',
    label: 'Apify Automation & Research',
    category: 'Automation & Research',
    enabled: false,
    defaultActorId: 'apify/website-content-crawler',
    allowedFeatures: ['public_course_research', 'trend_monitoring', 'website_content_check'],
    connectionStatus: 'not_configured',
    notes: 'Reads server-side APIFY_API_TOKEN. Strictly limited to approved public research workflows.',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'google_sheets',
    provider: 'google_sheets',
    label: 'Google Sheets Lead Import',
    category: 'Data & Storage',
    enabled: true,
    connectionStatus: 'not_configured',
    notes: 'Supports published Google Sheets CSV URLs and OAuth read-only spreadsheets import.',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'firebase',
    provider: 'firebase',
    label: 'Firebase Auth, Firestore & Storage',
    category: 'Data & Storage',
    enabled: true,
    connectionStatus: 'connected',
    notes: 'Primary authenticated database & security rules engine (Enterprise Firestore).',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'whatsapp_business',
    provider: 'whatsapp_business',
    label: 'WhatsApp Click-to-Chat & Promo Export',
    category: 'Messaging & Analytics',
    enabled: true,
    connectionStatus: 'connected',
    notes: 'Direct wa.me enquiry links and formatted WhatsApp promotional broadcasts (+94 710 108 803).',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'email_provider',
    provider: 'email_provider',
    label: 'SMTP / Transactional Email',
    category: 'Messaging & Analytics',
    enabled: false,
    connectionStatus: 'not_configured',
    notes: 'Configure external SMTP / Resend / SendGrid server credentials to enable automated outbound emails.',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'analytics',
    provider: 'analytics',
    label: 'Web & Campaign Analytics',
    category: 'Messaging & Analytics',
    enabled: false,
    connectionStatus: 'not_configured',
    notes: 'Optional GA4 / Meta Pixel server-side measurement ID.',
    institutionId: INSTITUTE_INFO.institutionId,
  },
];

export const DEFAULT_AUTOMATION_WORKFLOWS: AutomationWorkflow[] = [
  {
    id: 'new_course_poster',
    workflowKey: 'new_course_poster',
    name: 'New Course Poster Draft',
    description:
      'Prepares a validated draft poster + social caption whenever a new course is added. Saves as PENDING_APPROVAL — never publishes automatically.',
    enabled: true,
    requiresAdminApproval: true,
    defaultLanguage: 'English',
    defaultSizePreset: 'instagram_portrait',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'course_update_detector',
    workflowKey: 'course_update_detector',
    name: 'Course Update Change Detector',
    description:
      'Flags linked posters when a course fee, duration, title, or study mode changes, invalidating stale approvals and queueing a new version.',
    enabled: true,
    requiresAdminApproval: true,
    defaultLanguage: 'English',
    defaultSizePreset: 'instagram_portrait',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'free_course_campaign',
    workflowKey: 'free_course_campaign',
    name: 'FREE Course Campaign Generator',
    description:
      'Generates FREE-badged promotional posters and WhatsApp/social copy for all 5 official FREE Certificate courses for Super Admin review.',
    enabled: true,
    requiresAdminApproval: true,
    defaultLanguage: 'English',
    defaultSizePreset: 'instagram_square',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'bulk_campaign_package',
    workflowKey: 'bulk_campaign_package',
    name: 'Bulk 2027 Intake Campaign Package',
    description:
      'Creates individual validated posters, social captions, hashtags, and WhatsApp announcements for selected courses. Every poster requires explicit approval.',
    enabled: true,
    requiresAdminApproval: true,
    defaultLanguage: 'English',
    defaultSizePreset: 'instagram_portrait',
    institutionId: INSTITUTE_INFO.institutionId,
  },
];

export const SEED_BRANCHES: Branch[] = [
  {
    id: 'branch-panadura',
    code: 'PNR-01',
    name: 'Panadura Branch',
    city: 'Panadura',
    address: 'TECHMAN COLLEGE Study Center, Panadura, Kalutara District, Sri Lanka',
    phone: '+94 710 108 803',
    managerName: 'Panadura Branch Manager',
    coordinatorName: 'Panadura Admissions Desk',
    status: 'active',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'branch-kalutara',
    code: 'KLT-01',
    name: 'Kalutara Branch',
    city: 'Kalutara',
    address: 'TECHMAN COLLEGE Study Center, Kalutara, Sri Lanka',
    phone: '+94 710 108 803',
    managerName: 'Kalutara Branch Manager',
    coordinatorName: 'Kalutara Admissions Desk',
    status: 'active',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'branch-colombo-hq',
    code: 'CMB-HQ',
    name: 'Colombo Main Campus (HQ)',
    city: 'Colombo',
    address: 'TECHMAN COLLEGE Academic Hub, Colombo, Sri Lanka',
    phone: '+94 710 108 803',
    managerName: 'Branch Operations Office',
    coordinatorName: 'Colombo Admissions Desk',
    status: 'active',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'branch-online-global',
    code: 'ONL-GLB',
    name: 'Online & International Campus',
    city: 'Sri Lanka & Global',
    address: 'Live Interactive LMS — https://techmemai.lk',
    phone: '+94 710 108 803',
    managerName: 'Digital Learning Office',
    coordinatorName: 'Online Student Support Desk',
    status: 'active',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'branch-kandy-regional',
    code: 'KDY-01',
    name: 'Kandy Regional Center',
    city: 'Kandy',
    address: 'Central Province Study Center, Kandy, Sri Lanka',
    phone: '+94 710 108 803',
    managerName: 'Central Region Coordinator',
    coordinatorName: 'Kandy Academic Desk',
    status: 'active',
    institutionId: INSTITUTE_INFO.institutionId,
  },
];

export const SEED_CMS_ITEMS: CmsItem[] = [
  {
    id: 'cms-poster-new-intake-2027',
    itemType: 'Poster',
    title: 'New Intake Open 2027 — Online Batch 04 & Physical Batch 02',
    summary: 'ABE Endorsed & CPD Approved programmes with 5 Fully Free Certificate Courses and 16 International Diplomas. Registration open until 27-11-2026; classes start 05-12-2026.',
    category: '2027 Intake',
    imageUrl: BRAND_IMAGES.posterIntakeOverview,
    eventDate: '2026-12-05',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-poster-admission-2027',
    itemType: 'Poster',
    title: 'Admission Open 2027 — From Beginner to Professional',
    summary: 'Industry-relevant Certificate & Diploma programmes with expert mentorship, skill-based learning, and career guidance across Sri Lanka.',
    category: 'Admissions',
    imageUrl: BRAND_IMAGES.posterAdmission2027,
    eventDate: '2026-11-27',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-poster-diploma-it',
    itemType: 'Poster',
    title: 'Diploma in IT & Software Development (6 Months — LKR 35,000)',
    summary: 'Both Coding & Non-Coding tracks: HTML/CSS/JS, React/Node.js, Flutter Basics, Firebase/SQL, WordPress/Wix, Cloud & GitHub. Registration Fee LKR 3,000.',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterDiplomaIT,
    eventDate: '2026-12-05',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-poster-diploma-biz-mkt',
    itemType: 'Poster',
    title: 'International Diploma in Business & Digital Marketing (6 Months — LKR 30,000)',
    summary: 'TECHMAN COLLEGE Independent International Diploma delivered Online & Offline. Registration Fee LKR 3,000 · Course Fee LKR 30,000.',
    category: 'Diploma',
    imageUrl: BRAND_IMAGES.posterDiplomaBusinessMarketing,
    eventDate: '2026-12-05',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-poster-free-graphic-design',
    itemType: 'Poster',
    title: 'Certificate in Graphic Design — 100% Free 3-Month Course (ABE Endorsed)',
    summary: 'Learn Canva, ChatGPT, Cloud AI, Adobe Photoshop Basic, and Adobe Illustrator Basic. Registration Fee LKR 2,000 · Certificate Fee LKR 3,000.',
    category: 'Free Certificate',
    imageUrl: BRAND_IMAGES.posterFreeGraphicDesign,
    eventDate: '2026-12-05',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-news-2027-intake',
    itemType: 'News',
    title: '2027 Academic Intake Open — Online Batch 04 & Physical Batch 02',
    summary: 'Prospective students across Sri Lanka and overseas can now submit online applications until 27-11-2026 across 5 Fully Free Certificate courses and 27 additional Certificate & International Diploma programmes. Classes commence on 05-12-2026.',
    category: 'Admissions',
    imageUrl: BRAND_IMAGES.posterIntakeOverview,
    eventDate: '2026-12-05',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-news-free-certificates',
    itemType: 'News',
    title: 'Scholarship Initiative: 5 Fully Free Certificate Courses for 2027 Intake',
    summary: 'TECHMAN COLLEGE offers 100% tuition-free enrollment in Graphic Design, Information Technology, Canva Design, Content Creation, and Social Media Marketing. Students pay only the LKR 2,000 registration fee and optional LKR 3,000 certificate fee.',
    category: 'Scholarships',
    imageUrl: BRAND_IMAGES.posterFreeGraphicDesign,
    eventDate: '2026-11-27',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-event-orientation-2027',
    itemType: 'Event',
    title: '2027 Intake Orientation & Digital LMS Onboarding Session',
    summary: 'Mandatory welcome briefing for Online Batch 04 and Physical Batch 02 students covering Digital QR Student IDs, live classroom schedules, assignment submissions, and the 24/7 TECHMAN COLLEGE AI Tutor.',
    category: 'Upcoming Classes',
    imageUrl: BRAND_IMAGES.campusLectureHall,
    eventDate: '2026-12-05',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-event-ai-bootcamp',
    itemType: 'Event',
    title: 'Live Workshop: Building Production AI Agents & Prompt Workflows for 2027 Careers',
    summary: 'Join TECHMAN COLLEGE faculty for an interactive live session demonstrating practical Generative AI, Gemini & ChatGPT workflows, and portfolio engineering for Sri Lankan graduates.',
    category: 'Workshops',
    imageUrl: BRAND_IMAGES.aiEngineering,
    eventDate: '2027-01-10',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-event-free-skill-dev',
    itemType: 'Event',
    title: 'TECHMAN FREE SKILL DEVELOPMENT PROGRAMME — Islandwide Sri Lanka (Sat & Sun)',
    summary: '100% Free of Charge physical outreach programme conducted at host institutions across Sri Lanka on Saturdays and Sundays, featuring 12 practical modules led by Founder & CEO Mohammed Rashadh.',
    category: 'Free Skill Programme',
    imageUrl: BRAND_IMAGES.posterFreeSkillDev,
    eventDate: 'Sat & Sun',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-story-ai-grad',
    itemType: 'Story',
    title: 'From Beginner to Remote AI Automation Specialist in 6 Months',
    summary: 'Graduating from the International Diploma in AI Automation equipped our cohort with client-ready workflow systems, verified digital credentials, and international freelancing contracts.',
    category: 'Student Outcome',
    imageUrl: BRAND_IMAGES.graduationCert,
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-story-design-grad',
    itemType: 'Story',
    title: 'Building a Commercial Brand Identity Portfolio from Scratch',
    summary: 'Through hands-on studio critiques in Graphic Design and Canva AI, students graduated with commercial branding packages, social media campaign decks, and freelance agency readiness.',
    category: 'Graduate Spotlight',
    imageUrl: BRAND_IMAGES.creativeDesign,
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-faq-verification',
    itemType: 'FAQ',
    title: 'How can employers verify a TECHMAN COLLEGE Certificate or Diploma?',
    summary: 'Every approved graduate credential carries a unique Certificate Number and embedded QR code with ABE Endorsed / CPD Approved online verification directly on our public college registry.',
    category: 'Certificates',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-faq-installments',
    itemType: 'FAQ',
    title: 'Which Certificate courses are 100% Free and how do fees work?',
    summary: 'Five Certificate courses (Graphic Design, IT, Canva Design, Content Creation, and Social Media Marketing) carry LKR 0 tuition (Registration LKR 2,000, optional Certificate LKR 3,000). Diploma programmes start from LKR 30,000 with monthly LKR installments.',
    category: 'Fees & Payments',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
  {
    id: 'cms-faq-learning-modes',
    itemType: 'FAQ',
    title: 'Can I study fully online or switch between Physical and Hybrid classes?',
    summary: 'Yes. Join Online Batch 04 or Physical Batch 02 with recorded lesson playback, downloadable library notes, and physical campus workshops in Sri Lanka.',
    category: 'Learning Modes',
    status: 'published',
    institutionId: INSTITUTE_INFO.institutionId,
  },
];

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  institutionId: INSTITUTE_INFO.institutionId,
  instituteName: INSTITUTE_INFO.officialName,
  platformName: INSTITUTE_INFO.platformName,
  website: INSTITUTE_INFO.website,
  contactPhone: INSTITUTE_INFO.phone,
  currency: INSTITUTE_INFO.currency,
  academicIntake: INSTITUTE_INFO.academicIntake,
  defaultAffiliateCommissionPercent: 10,
  xpPerLesson: 50,
  xpPerAssignment: 120,
  publicTenantRegistrationEnabled: false,
  catalogInitialized: false,
};

export const SRI_LANKA_DISTRICTS: string[] = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
  'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
  'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa',
  'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

export const DEFAULT_FREE_SKILL_PROGRAMME: SpecialProgramme = {
  id: 'free-skill-development',
  slug: 'free-skill-development',
  title: 'TECHMAN FREE SKILL DEVELOPMENT PROGRAMME',
  theme: 'Empowering the Next Generation Through Technology, Creativity & Personal Development',
  description:
    'An islandwide physical outreach initiative by TECHMAN COLLEGE (Established in 2021) delivering 12 hands-on modules across Artificial Intelligence, creative media, STEM, personal leadership, entrepreneurship, and freelancing directly at host schools, colleges, and community institutions across Sri Lanka.',
  feeBadge: '100% FREE OF CHARGE!',
  feeSummary:
    'The programme is completely free. The host institution is responsible only for providing the required transport and accommodation for the visiting team.',
  schedule: 'Saturday & Sunday Only',
  availability: 'Islandwide – Sri Lanka',
  programmeType: 'Physical Programme',
  deliveryLocation: "At the host institution's premises",
  trainerName: 'MOHAMMED RASHADH',
  trainerPosition: 'Founder & CEO – TECHMAN COLLEGE',
  trainerTitle: 'AI ENGINEER & CREATIVE TECHNOLOGIST',
  trainerPhotoUrl: BRAND_IMAGES.trainerMohammedRashadh,
  trainerBio:
    'Founder & CEO of TECHMAN COLLEGE (Established in 2021), AI Engineer and Creative Technologist dedicated to equipping Sri Lankan youth and institutions with practical technology, modern design, leadership, and digital career skills.',
  posterUrl: BRAND_IMAGES.posterFreeSkillDev,
  galleryUrls: [
    BRAND_IMAGES.posterFreeSkillDev,
    BRAND_IMAGES.campusLectureHall,
    BRAND_IMAGES.campusComputerLab,
    BRAND_IMAGES.heroStudents,
  ],
  modules: [
    {
      number: '01',
      title: 'AI Workshop',
      shortDescription: 'Artificial Intelligence & Automation',
      iconKey: 'cpu',
      details:
        'Hands-on exploration of modern Generative AI tools, practical automation workflows, and responsible AI use for students and future professionals.',
      relatedCourseId: 'dip-intl-ai',
      relatedDomain: 'Artificial Intelligence',
    },
    {
      number: '02',
      title: 'Digital Marketing',
      shortDescription: 'Social Media, Branding & Marketing',
      iconKey: 'megaphone',
      details:
        'Practical introduction to digital brand building, social media content strategy, audience outreach, and modern online marketing foundations.',
      relatedCourseId: 'cert-social-media-marketing',
      relatedDomain: 'Digital Marketing',
    },
    {
      number: '03',
      title: 'Graphic Design',
      shortDescription: 'Canva, Photoshop & AI Design',
      iconKey: 'palette',
      details:
        'Visual communication fundamentals covering layout principles, Canva, Adobe Photoshop essentials, and AI-assisted creative design workflows.',
      relatedCourseId: 'cert-graphic-design',
      relatedDomain: 'Graphic Design',
    },
    {
      number: '04',
      title: 'Web Design & Development',
      shortDescription: 'Websites, UI/UX & App Development',
      iconKey: 'code',
      details:
        'Introduction to modern websites, user interface thinking (UI/UX), responsive layouts, and foundational application development concepts.',
      relatedCourseId: 'dip-intl-web-design-dev',
      relatedDomain: 'Web Development',
    },
    {
      number: '05',
      title: 'Robotics & STEM',
      shortDescription: 'Robotics, Electronics & Practical Projects',
      iconKey: 'bot',
      details:
        'Interactive STEM session introducing electronics basics, logical problem-solving, and practical robotics concepts for young innovators.',
      relatedCourseId: 'dip-intl-it',
      relatedDomain: 'Information Technology',
    },
    {
      number: '06',
      title: 'Psychology',
      shortDescription: 'Human Psychology & Emotional Intelligence',
      iconKey: 'brain',
      details:
        'Understanding human behavior, emotional intelligence, self-awareness, stress resilience, and constructive interpersonal relationships.',
      relatedCourseId: 'cert-general-psychology',
      relatedDomain: 'Psychology',
    },
    {
      number: '07',
      title: 'Motivation & Leadership',
      shortDescription: 'Confidence, Mindset & Goal Setting',
      iconKey: 'trending-up',
      details:
        'Practical frameworks for developing a growth mindset, personal discipline, structured goal setting, and student leadership.',
      relatedCourseId: 'cert-business-management',
      relatedDomain: 'Business & Management',
    },
    {
      number: '08',
      title: 'Career Development',
      shortDescription: 'Future Careers, Skills & Job Readiness',
      iconKey: 'briefcase',
      details:
        'Guidance on emerging global and Sri Lankan career paths, portfolio building, workplace professionalism, and lifelong skill planning.',
      relatedCourseId: 'cert-hrm',
      relatedDomain: 'Business & Management',
    },
    {
      number: '09',
      title: 'Public Speaking',
      shortDescription: 'Presentation & Leadership Communication',
      iconKey: 'mic',
      details:
        'Overcoming stage hesitation, structuring clear presentations, vocal clarity, and confident speaking in academic and leadership settings.',
      relatedDomain: 'Business & Management',
    },
    {
      number: '10',
      title: 'Communication Skills',
      shortDescription: 'Effective Communication & Teamwork',
      iconKey: 'message-square',
      details:
        'Active listening, collaborative teamwork, professional etiquette, and clear written and verbal communication in diverse environments.',
      relatedDomain: 'Psychology',
    },
    {
      number: '11',
      title: 'Entrepreneurship',
      shortDescription: 'Idea to Business & Innovation',
      iconKey: 'lightbulb',
      details:
        'Turning practical ideas into structured solutions through problem discovery, basic business modeling, and innovative thinking.',
      relatedCourseId: 'cert-ecommerce',
      relatedDomain: 'Business & Management',
    },
    {
      number: '12',
      title: 'Freelancing',
      shortDescription: 'Online Earning, Platforms & Practical Guidance',
      iconKey: 'laptop',
      details:
        'Practical orientation to digital skill portfolios, freelancing platforms, client communication ethics, and responsible independent work habits.',
      relatedCourseId: 'cert-content-creation',
      relatedDomain: 'Digital Marketing',
    },
  ],
  benefits: [
    'Practical technology knowledge',
    'Artificial Intelligence awareness',
    'Creative and design skills',
    'Digital marketing knowledge',
    'Communication and presentation skills',
    'Leadership and confidence',
    'Career development guidance',
    'Entrepreneurship awareness',
    'Freelancing and online earning guidance',
    'Practical project experience',
  ],
  status: 'published',
  institutionId: INSTITUTE_INFO.institutionId,
};

