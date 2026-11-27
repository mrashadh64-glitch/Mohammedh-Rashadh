import {
  BrandSettings,
  Course,
  GeneratedPoster,
  PosterLanguage,
  PosterSizePreset,
  PosterTemplateStyle,
  PosterType,
  PosterValidationCheck,
  PosterValidationResult,
} from '../types/lms';
import { DEFAULT_BRAND_SETTINGS } from '../data/catalogSeed';

export interface PosterSizeMeta {
  id: PosterSizePreset;
  label: string;
  platform: string;
  width: number;
  height: number;
  aspectLabel: string;
}

export const POSTER_SIZE_PRESETS: PosterSizeMeta[] = [
  {
    id: 'instagram_square',
    label: 'Instagram Post (1080 × 1080)',
    platform: 'Instagram / Feed',
    width: 1080,
    height: 1080,
    aspectLabel: '1:1',
  },
  {
    id: 'instagram_portrait',
    label: 'Instagram Portrait (1080 × 1350)',
    platform: 'Instagram / WhatsApp',
    width: 1080,
    height: 1350,
    aspectLabel: '4:5',
  },
  {
    id: 'instagram_story',
    label: 'Instagram Story / Status (1080 × 1920)',
    platform: 'Stories / Reels Cover',
    width: 1080,
    height: 1920,
    aspectLabel: '9:16',
  },
  {
    id: 'facebook_landscape',
    label: 'Facebook Ad / Feed (1200 × 628)',
    platform: 'Facebook / LinkedIn',
    width: 1200,
    height: 628,
    aspectLabel: '1.91:1',
  },
  {
    id: 'whatsapp_promo',
    label: 'WhatsApp Promotional Poster (1080 × 1200)',
    platform: 'WhatsApp Broadcast / Groups',
    width: 1080,
    height: 1200,
    aspectLabel: '9:10',
  },
  {
    id: 'a4_print',
    label: 'A4 Print Poster (1240 × 1754)',
    platform: 'Print / Noticeboard',
    width: 1240,
    height: 1754,
    aspectLabel: 'A4',
  },
  {
    id: 'website_banner',
    label: 'Website Promo Banner (1600 × 600)',
    platform: 'College Website Hero',
    width: 1600,
    height: 600,
    aspectLabel: '8:3',
  },
];

export const POSTER_TYPES: PosterType[] = [
  'Course Admission Poster',
  'Free Course Poster',
  'Diploma Course Poster',
  'Certificate Course Poster',
  'Scholarship / Promotion Poster',
  'Registration Announcement Poster',
  'Social Media Ad Creative',
  'Instagram Post',
  'Instagram Story',
  'Facebook Post',
  'WhatsApp Promotion Poster',
  'Website Banner',
];

export const POSTER_TEMPLATES: Array<{
  id: PosterTemplateStyle;
  label: string;
  description: string;
  bgFrom: string;
  bgTo: string;
  accent: string;
  surface: string;
  textPrimary: string;
  textMuted: string;
}> = [
  {
    id: 'navy_executive',
    label: 'Deep Navy Executive',
    description: 'Signature TECHMAN Deep Navy (#101D35) with Electric Blue geometric accents.',
    bgFrom: '#0B1528',
    bgTo: '#172A45',
    accent: '#1677FF',
    surface: 'rgba(255,255,255,0.08)',
    textPrimary: '#FFFFFF',
    textMuted: '#CBD5E1',
  },
  {
    id: 'electric_tech',
    label: 'Electric AI Future',
    description: 'High-contrast cyber-blue neural grid crafted for AI, IT & Web courses.',
    bgFrom: '#081226',
    bgTo: '#0D3B8C',
    accent: '#38BDF8',
    surface: 'rgba(15,23,42,0.55)',
    textPrimary: '#FFFFFF',
    textMuted: '#DBEAFE',
  },
  {
    id: 'free_spotlight',
    label: 'FREE Course Spotlight',
    description: 'Vibrant emerald + deep navy layout tailored for the 5 official FREE courses.',
    bgFrom: '#0B1D2C',
    bgTo: '#064E3B',
    accent: '#10B981',
    surface: 'rgba(255,255,255,0.10)',
    textPrimary: '#FFFFFF',
    textMuted: '#D1FAE5',
  },
  {
    id: 'editorial_minimal',
    label: 'Academic White & Navy',
    description: 'Clean white editorial brochure layout for print, Psychology & Business programmes.',
    bgFrom: '#FFFFFF',
    bgTo: '#EAF1FC',
    accent: '#1677FF',
    surface: 'rgba(16,29,53,0.06)',
    textPrimary: '#101D35',
    textMuted: '#475569',
  },
];

export const POSTER_LANGUAGES: PosterLanguage[] = ['English', 'Tamil', 'Sinhala', 'Arabic'];

export function getSizePresetMeta(preset: PosterSizePreset): PosterSizeMeta {
  return POSTER_SIZE_PRESETS.find((s) => s.id === preset) || POSTER_SIZE_PRESETS[1];
}

// Deterministic FNV-1a dual-lane hash identical to server.ts so client & server hashes match 100%
function fnv1aHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `tm_${combined.toString(16).padStart(14, '0')}`;
}

export function computePosterContentHash(
  p: Pick<
    GeneratedPoster,
    | 'courseId'
    | 'courseName'
    | 'posterType'
    | 'templateStyle'
    | 'sizePreset'
    | 'language'
    | 'headline'
    | 'subheadline'
    | 'badgeText'
    | 'highlights'
    | 'feeLabel'
    | 'registrationFeeLabel'
    | 'durationLabel'
    | 'modeLabel'
    | 'ctaText'
    | 'footerContact'
    | 'backgroundImageUrl'
    | 'customLogoUrl'
    | 'logoPosition'
    | 'accentColor'
    | 'fontFamily'
    | 'textAlign'
    | 'headlineOffsetY'
    | 'bgOpacity'
  >
): string {
  const highlights = Array.isArray(p.highlights)
    ? p.highlights.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const payload = JSON.stringify({
    courseId: String(p.courseId || ''),
    courseName: String(p.courseName || ''),
    posterType: String(p.posterType || ''),
    templateStyle: String(p.templateStyle || ''),
    sizePreset: String(p.sizePreset || ''),
    language: String(p.language || ''),
    headline: String(p.headline || '').trim(),
    subheadline: String(p.subheadline || '').trim(),
    badgeText: String(p.badgeText || '').trim(),
    highlights,
    feeLabel: String(p.feeLabel || '').trim(),
    registrationFeeLabel: String(p.registrationFeeLabel || '').trim(),
    durationLabel: String(p.durationLabel || '').trim(),
    modeLabel: String(p.modeLabel || '').trim(),
    ctaText: String(p.ctaText || '').trim(),
    footerContact: String(p.footerContact || '').trim(),
    backgroundImageUrl: String(p.backgroundImageUrl || '').trim(),
    customLogoUrl: String(p.customLogoUrl || '').trim(),
    logoPosition: String(p.logoPosition || 'top-left'),
    accentColor: String(p.accentColor || ''),
    fontFamily: String(p.fontFamily || 'inter'),
    textAlign: String(p.textAlign || 'left'),
    headlineOffsetY: Number(p.headlineOffsetY || 0),
    bgOpacity: Number(p.bgOpacity ?? 0.24),
  });
  return fnv1aHash(payload);
}

export function computeCourseSnapshotHash(course: Course): string {
  const payload = JSON.stringify({
    id: String(course.id || ''),
    name: String(course.name || '').trim(),
    category: String(course.category || ''),
    duration: String(course.duration || '').trim(),
    mode: String(course.mode || ''),
    courseFeeLkr: Number(course.courseFeeLkr || 0),
    feeConfigured: Boolean(course.feeConfigured),
    isFree: Boolean(course.isFree),
    registrationFeeLkr: Number(course.registrationFeeLkr || 0),
    certificateFeeLkr: Number(course.certificateFeeLkr || 0),
    status: String(course.status || ''),
  });
  return fnv1aHash(payload);
}

const FORBIDDEN_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'Unverified accreditation or government/university recognition claim',
    regex:
      /\b(ugc\s*approved|ministry\s*of\s*education\s*approved|nvq\s*level|tvec\s*registered|pearson\s*btec|cambridge\s*certified|oxford\s*certified|harvard\s*certified|government\s*accredited|iso\s*9001\s*certified|100%\s*government\s*recognized)\b/i,
  },
  {
    label: 'Fabricated job or income guarantee',
    regex:
      /\b(100%\s*job\s*guarantee|guaranteed\s*job|guaranteed\s*placement|guaranteed\s*income|guaranteed\s*salary|earn\s*\$?\d[\d,]*\+?\s*guaranteed|get\s*rich\s*quick|instant\s*visa)\b/i,
  },
  {
    label: 'Unverified scholarship fabrication',
    regex: /\b(100%\s*government\s*scholarship|full\s*foreign\s*scholarship|free\s*laptop\s*guaranteed)\b/i,
  },
];

export function validatePosterAgainstCourse(
  poster: Partial<GeneratedPoster>,
  course: Course | null,
  brand: BrandSettings = DEFAULT_BRAND_SETTINGS
): PosterValidationResult {
  const checks: PosterValidationCheck[] = [];
  const headline = String(poster.headline || '').trim();
  const subheadline = String(poster.subheadline || '').trim();
  const badgeText = String(poster.badgeText || '').trim();
  const feeLabel = String(poster.feeLabel || '').trim();
  const durationLabel = String(poster.durationLabel || '').trim();
  const ctaText = String(poster.ctaText || '').trim();
  const footerContact = String(poster.footerContact || '').trim();
  const highlights = Array.isArray(poster.highlights)
    ? poster.highlights.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const socialCaption = String(poster.socialCaption || '').trim();

  const combinedText = [
    headline,
    subheadline,
    badgeText,
    feeLabel,
    durationLabel,
    ctaText,
    highlights.join(' '),
    socialCaption,
  ].join(' ');

  if (course) {
    const cName = String(course.name || '').trim();
    const shortName = cName.replace(/^(International Diploma|Diploma|Certificate)\s+in\s+/i, '').trim();
    const matchesCourse =
      combinedText.toLowerCase().includes(cName.toLowerCase()) ||
      (shortName.length >= 4 && combinedText.toLowerCase().includes(shortName.toLowerCase()));
    checks.push({
      code: 'COURSE_NAME',
      label: 'Course Name Matches Verified Record',
      passed: matchesCourse,
      severity: 'error',
      message: matchesCourse
        ? `Course title verified against "${cName}".`
        : `Poster text must clearly reference the verified course name "${cName}".`,
    });

    const cat = course.category;
    const hasWrongLevel =
      (cat === 'Certificate' && /\b(diploma|degree|bachelor|masters|mba|phd)\b/i.test(headline + ' ' + badgeText)) ||
      (cat === 'Diploma' && /\b(degree|bachelor|masters|mba|phd)\b/i.test(headline + ' ' + badgeText));
    checks.push({
      code: 'COURSE_LEVEL',
      label: 'Course Level Classification',
      passed: !hasWrongLevel,
      severity: 'error',
      message: !hasWrongLevel
        ? `Course level (${cat}) is accurately represented.`
        : `Poster level conflicts with verified course category (${cat}).`,
    });

    const isFree = Boolean(course.isFree);
    const claimsFree = /\b(100%\s*free|free\s*course|free\s*tuition|tuition\s*free)\b/i.test(
      headline + ' ' + badgeText + ' ' + feeLabel
    );
    const freeConsistent = isFree ? claimsFree || /free/i.test(feeLabel + ' ' + badgeText) : !claimsFree;
    checks.push({
      code: 'FREE_PAID_CLASSIFICATION',
      label: 'FREE / PAID Status Accuracy',
      passed: freeConsistent,
      severity: 'error',
      message: freeConsistent
        ? isFree
          ? 'Verified FREE course badge confirmed.'
          : 'Paid course is not misleadingly marked as FREE.'
        : isFree
          ? 'This is an official FREE course and must display its FREE classification clearly.'
          : 'Paid course must NEVER be advertised as 100% Free or Free Course.',
    });

    const feeConfigured = course.feeConfigured !== false;
    const feeLkr = Number(course.courseFeeLkr || 0);
    let feeOk = true;
    let feeMsg = 'Course fee display matches verified record.';
    if (!isFree && feeConfigured && feeLkr > 0) {
      const formatted = feeLkr.toLocaleString('en-US');
      const digitsOnly = String(feeLkr);
      const mentionsFee =
        feeLabel.includes(formatted) ||
        feeLabel.includes(digitsOnly) ||
        /contact|enquir|flexible|installment/i.test(feeLabel);
      feeOk = Boolean(feeLabel) && mentionsFee;
      feeMsg = feeOk
        ? `Verified fee (LKR ${formatted}) accurately represented.`
        : `Fee label must reflect verified course fee LKR ${formatted} (or clearly direct to admissions).`;
    } else if (!isFree && !feeConfigured) {
      const fabricatedFee = /(?:lkr|rs\.?)\s*\d[\d,]{2,}/i.test(feeLabel + ' ' + headline);
      feeOk = !fabricatedFee;
      feeMsg = feeOk
        ? 'Unconfigured fee safely shown as enquiry-based without invented pricing.'
        : 'Fee is not configured in database — remove invented LKR/Rs amount.';
    }
    checks.push({
      code: 'FEE_ACCURACY',
      label: 'Fee Accuracy & Anti-Fabrication',
      passed: feeOk,
      severity: 'error',
      message: feeMsg,
    });

    const dur = String(course.duration || '').trim();
    const isDurPlaceholder = !dur || /to be configured|pending admin setup/i.test(dur);
    const inventedDur = isDurPlaceholder && /\b\d+\s*(months?|weeks?|years?)\b/i.test(durationLabel);
    checks.push({
      code: 'DURATION_ACCURACY',
      label: 'Course Duration Accuracy',
      passed: !inventedDur,
      severity: 'error',
      message: !inventedDur
        ? isDurPlaceholder
          ? 'Duration is not yet configured and no duration was fabricated.'
          : `Duration aligned with verified record (${dur}).`
        : 'Duration is not configured in database — do not invent a duration on the poster.',
    });

    const activeCourse = course.status === 'published';
    checks.push({
      code: 'COURSE_ACTIVE',
      label: 'Linked Course Is Published & Active',
      passed: activeCourse,
      severity: 'error',
      message: activeCourse
        ? 'Linked course is active and published in the 2027 catalog.'
        : `Linked course status is "${course.status}" — must be published before poster publishing.`,
    });
  }

  const hasEssential = headline.length >= 6 && ctaText.length >= 3 && highlights.length >= 1;
  checks.push({
    code: 'ESSENTIAL_INFO',
    label: 'Essential Copy & Highlights',
    passed: hasEssential,
    severity: 'error',
    message: hasEssential
      ? `Headline, CTA, and ${highlights.length} highlight(s) verified.`
      : 'Headline (min 6 chars), CTA (min 3 chars), and at least 1 highlight are required.',
  });

  const expectedPhoneDigits = String(brand.whatsappNumber || '94710108803').replace(/\D/g, '').slice(-9);
  const expectedWebsite = String(brand.website || 'techmancollege.online')
    .replace(/^https?:\/\//i, '')
    .toLowerCase();
  const contactDigits = footerContact.replace(/\D/g, '');
  const contactOk =
    (expectedPhoneDigits.length >= 7 && contactDigits.includes(expectedPhoneDigits)) ||
    footerContact.toLowerCase().includes(expectedWebsite);
  checks.push({
    code: 'CONTACT_WEBSITE',
    label: 'Verified Contact & Official Website',
    passed: contactOk,
    severity: 'error',
    message: contactOk
      ? 'Verified TECHMAN COLLEGE contact phone & website included.'
      : `Footer must include verified phone (${brand.contactPhone}) or website (${expectedWebsite}).`,
  });

  const logoOk = Boolean(brand.logoUrl && brand.logoUrl.trim().length > 4);
  checks.push({
    code: 'INSTITUTE_LOGO',
    label: 'Official TECHMAN COLLEGE Logo',
    passed: logoOk,
    severity: 'error',
    message: logoOk
      ? 'Official TECHMAN COLLEGE brand logo embedded on poster.'
      : 'Official logo URL is missing in Brand Settings.',
  });

  const violations = FORBIDDEN_PATTERNS.filter((p) => p.regex.test(combinedText));
  checks.push({
    code: 'NO_UNVERIFIED_CLAIMS',
    label: 'No Unverified Accreditations, Scholarships or Guarantees',
    passed: violations.length === 0,
    severity: 'error',
    message:
      violations.length === 0
        ? 'No prohibited claims, fake accreditations, or job/income guarantees detected.'
        : `Blocked claim detected: ${violations.map((v) => v.label).join('; ')}.`,
  });

  const errors = checks.filter((c) => !c.passed && c.severity === 'error').map((c) => c.message);
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message);

  return {
    passed: errors.length === 0,
    checkedAt: new Date().toISOString(),
    errors,
    warnings,
    checks,
  };
}

export function buildVerifiedPosterDraftFromCourse(
  course: Course,
  brand: BrandSettings = DEFAULT_BRAND_SETTINGS,
  options?: {
    posterType?: PosterType;
    templateStyle?: PosterTemplateStyle;
    sizePreset?: PosterSizePreset;
    language?: PosterLanguage;
  }
): Omit<
  GeneratedPoster,
  'id' | 'createdByUid' | 'createdByName' | 'institutionId' | 'createdAt' | 'updatedAt'
> {
  const isFree = Boolean(course.isFree);
  const feeConfigured = course.feeConfigured !== false;
  const posterType: PosterType =
    options?.posterType ||
    (isFree
      ? 'Free Course Poster'
      : course.category === 'Diploma'
        ? 'Diploma Course Poster'
        : 'Certificate Course Poster');
  const templateStyle: PosterTemplateStyle =
    options?.templateStyle ||
    (isFree
      ? 'free_spotlight'
      : course.domain === 'IT & Technology'
        ? 'electric_tech'
        : 'navy_executive');
  const sizePreset: PosterSizePreset = options?.sizePreset || 'instagram_portrait';
  const language: PosterLanguage = options?.language || 'English';

  const feeLabel = isFree
    ? `100% FREE Tuition${course.registrationFeeLkr ? ` · Reg LKR ${course.registrationFeeLkr.toLocaleString()}` : ''}`
    : feeConfigured && course.courseFeeLkr > 0
      ? `Course Fee: LKR ${course.courseFeeLkr.toLocaleString()}`
      : 'Fee Details: Contact Admissions';

  const durationLabel =
    course.duration && !/to be configured/i.test(course.duration)
      ? `Duration: ${course.duration}`
      : 'Schedule: 2027 Intake';

  const modeLabel = `Mode: ${course.mode}`;
  const badgeText = isFree
    ? '100% FREE COURSE · 2027 INTAKE'
    : `2027 INTAKE · ${course.category.toUpperCase()}`;

  const highlights = (
    course.syllabusTopics && course.syllabusTopics.length > 0
      ? course.syllabusTopics.slice(0, 5)
      : [
          'Structured Practical Projects & Guided Mentorship',
          'Live & Recorded LMS Learning Access',
          'Official TECHMAN COLLEGE Digital Certificate',
          'Flexible 2027 Online & Campus Schedules',
        ]
  ).map((h) => h.slice(0, 90));

  const footerContact = `${brand.contactPhone} · ${brand.website.replace(/^https?:\/\//i, '')}`;
  const ctaText = isFree ? 'Reserve Your Free Seat Today' : 'Apply Now — 2027 Intake';

  const hashtags = [
    '#TECHMANCollege',
    '#TECHMAN2027',
    course.category === 'Diploma' ? '#InternationalDiploma' : '#CertificateCourse',
    isFree ? '#FreeCourseSriLanka' : '#SriLankaEducation',
    '#FutureSkills',
  ];

  const socialCaption = `${badgeText}\n\n${course.name} at ${brand.brandName} (Established 2021).\n${feeLabel} | ${durationLabel} | ${modeLabel}\n\nKey Modules:\n${highlights.map((h) => `• ${h}`).join('\n')}\n\nApply online: ${brand.website}\nCall / WhatsApp: ${brand.contactPhone}\n\n${hashtags.join(' ')}`;

  const whatsappMessage = `*${brand.brandName} — ${badgeText}*\n\nProgramme: *${course.name}*\n${feeLabel}\n${durationLabel} | ${modeLabel}\n\nWhat you will learn:\n${highlights.map((h) => `- ${h}`).join('\n')}\n\nApply now: ${brand.website}\nAdmissions Hotline: ${brand.contactPhone}`;

  const draft = {
    courseId: course.id,
    courseName: course.name,
    courseCode: course.code,
    courseCategory: course.category,
    isFreeCourse: isFree,
    title: `${course.name} — ${posterType}`.slice(0, 175),
    posterType,
    templateStyle,
    sizePreset,
    language,
    headline: course.name.slice(0, 190),
    subheadline: (course.description || `Build practical, career-ready skills with ${brand.brandName}.`).slice(0, 220),
    badgeText,
    highlights,
    feeLabel,
    registrationFeeLabel:
      Number(course.registrationFeeLkr || 0) > 0
        ? `Reg. Fee: LKR ${Number(course.registrationFeeLkr).toLocaleString('en-LK')}`
        : '',
    durationLabel,
    modeLabel,
    ctaText,
    footerContact,
    backgroundImageUrl: course.imageUrl || '',
    customLogoUrl: '',
    logoPosition: 'top-left' as const,
    accentColor: isFree ? '#10B981' : brand.accentColor || '#1677FF',
    fontScale: 1,
    fontFamily: 'inter' as const,
    textAlign: 'left' as const,
    headlineOffsetY: 0,
    bgOpacity: 0.24,
    socialCaption,
    hashtags,
    whatsappMessage,
    status: 'draft' as const,
    versionNumber: 1,
    approvedVersionNumber: 0,
    approvedContentHash: '',
    courseSnapshotHash: computeCourseSnapshotHash(course),
    courseSnapshotUpdatedAt: course.updatedAt || new Date().toISOString(),
  };

  const validation = validatePosterAgainstCourse(draft, course, brand);
  return {
    ...draft,
    contentHash: computePosterContentHash(draft),
    validationPassed: validation.passed,
    validationSummary: validation.passed
      ? `All ${validation.checks.length} automated accuracy checks passed.`
      : validation.errors.join(' | ').slice(0, 480),
  };
}

// =========================================================================
// HIGH-DPI HTML5 CANVAS POSTER RENDERING ENGINE + PNG / JPG / PDF EXPORTS
// =========================================================================

const imageCache = new Map<string, HTMLImageElement | null>();

function loadImageSafe(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src) || null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      imageCache.set(src, null);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export async function renderPosterToCanvas(
  canvas: HTMLCanvasElement,
  poster: Partial<GeneratedPoster>,
  brand: BrandSettings = DEFAULT_BRAND_SETTINGS,
  scale = 1
): Promise<void> {
  const preset = getSizePresetMeta(poster.sizePreset || 'instagram_portrait');
  const W = preset.width;
  const H = preset.height;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(scale, scale);

  const tpl =
    POSTER_TEMPLATES.find((t) => t.id === poster.templateStyle) || POSTER_TEMPLATES[0];
  const accent = poster.accentColor || tpl.accent || '#1677FF';
  const isLight = poster.templateStyle === 'editorial_minimal';
  const isWide = W > H * 1.25;
  const fontScale = Number(poster.fontScale || 1);
  const fontStack =
    poster.fontFamily === 'geometric'
      ? 'Poppins, "Trebuchet MS", system-ui, sans-serif'
      : poster.fontFamily === 'serif'
        ? 'Georgia, "Times New Roman", serif'
        : poster.fontFamily === 'mono'
          ? '"JetBrains Mono", ui-monospace, monospace'
          : 'Inter, system-ui, sans-serif';
  const headlineOffsetY = Math.max(-60, Math.min(60, Number(poster.headlineOffsetY || 0)));
  const alignMode: CanvasTextAlign = poster.textAlign === 'center' ? 'center' : 'left';
  const resolvedBgOpacity = Math.max(
    0.05,
    Math.min(0.65, Number(poster.bgOpacity ?? (isLight ? 0.14 : 0.24)))
  );

  // 1. Base Gradient Background
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, tpl.bgFrom);
  grad.addColorStop(1, tpl.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 2. Optional Background Image with tasteful atmospheric scrim
  const bgImg = await loadImageSafe(poster.backgroundImageUrl);
  if (bgImg) {
    const imgRatio = bgImg.width / bgImg.height;
    const canvasRatio = W / H;
    let drawW = W;
    let drawH = H;
    let dx = 0;
    let dy = 0;
    if (imgRatio > canvasRatio) {
      drawW = H * imgRatio;
      dx = (W - drawW) / 2;
    } else {
      drawH = W / imgRatio;
      dy = (H - drawH) / 2;
    }
    ctx.save();
    ctx.globalAlpha = resolvedBgOpacity;
    ctx.drawImage(bgImg, dx, dy, drawW, drawH);
    ctx.restore();

    const scrim = ctx.createLinearGradient(0, 0, isWide ? W : 0, isWide ? 0 : H);
    scrim.addColorStop(0, isLight ? 'rgba(255,255,255,0.92)' : 'rgba(11,21,40,0.90)');
    scrim.addColorStop(0.55, isLight ? 'rgba(234,241,252,0.82)' : 'rgba(16,29,53,0.78)');
    scrim.addColorStop(1, isLight ? 'rgba(255,255,255,0.95)' : 'rgba(11,21,40,0.95)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);
  }

  // 3. Futuristic Geometric Accents & Subtle Tech Grid
  ctx.save();
  ctx.strokeStyle = isLight ? 'rgba(22,119,255,0.08)' : 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const gridStep = 64;
  for (let gx = 0; gx < W; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }
  // Ambient accent glow orb
  const orb = ctx.createRadialGradient(W * 0.86, H * 0.14, 20, W * 0.86, H * 0.14, W * 0.42);
  orb.addColorStop(0, `${accent}44`);
  orb.addColorStop(1, 'rgba(22,119,255,0)');
  ctx.fillStyle = orb;
  ctx.fillRect(0, 0, W, H);
  // Top accent bar
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 10);
  ctx.restore();

  const padX = isWide ? 68 : 64;
  const padY = isWide ? 44 : 56;
  const contentW = W - padX * 2;

  // 4. Header: Official TECHMAN Logo (or custom override) + Badge
  const logoImg = await loadImageSafe(poster.customLogoUrl || brand.logoUrl);
  const logoW = isWide ? 220 : 250;
  const logoH = isWide ? 66 : 74;
  let logoX = padX;
  if (poster.logoPosition === 'top-center') logoX = (W - logoW) / 2;
  if (poster.logoPosition === 'top-right') logoX = W - padX - logoW;

  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, logoX - 8, padY - 6, logoW + 16, logoH + 12, 14);
    ctx.fillStyle = isLight ? '#101D35' : 'rgba(16,29,53,0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const ratio = Math.min(logoW / logoImg.width, logoH / logoImg.height);
    const lw = logoImg.width * ratio;
    const lh = logoImg.height * ratio;
    ctx.drawImage(logoImg, logoX + (logoW - lw) / 2, padY + (logoH - lh) / 2, lw, lh);
    ctx.restore();
  } else {
    ctx.fillStyle = tpl.textPrimary;
    ctx.font = '800 32px Inter, system-ui, sans-serif';
    ctx.fillText(brand.brandName || 'TECHMAN COLLEGE', logoX, padY + 42);
  }

  // Badge pill on opposite top corner (or below centered logo)
  const badgeStr = (poster.badgeText || '2027 INTAKE').toUpperCase();
  ctx.font = `800 ${isWide ? 18 : 20}px Inter, system-ui, sans-serif`;
  const badgeTW = ctx.measureText(badgeStr).width;
  const badgeW = Math.min(badgeTW + 44, contentW * 0.56);
  const badgeH = isWide ? 44 : 48;
  const badgeX =
    poster.logoPosition === 'top-right'
      ? padX
      : poster.logoPosition === 'top-center'
        ? (W - badgeW) / 2
        : W - padX - badgeW;
  const badgeY = poster.logoPosition === 'top-center' ? padY + logoH + 22 : padY + 12;

  ctx.save();
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 24);
  ctx.fillStyle = poster.isFreeCourse ? '#10B981' : accent;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(badgeStr.slice(0, 38), badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
  ctx.restore();

  // Layout split for wide banners vs vertical/square posters
  const topStart =
    poster.logoPosition === 'top-center' ? badgeY + badgeH + 34 : padY + logoH + (isWide ? 28 : 44);

  if (isWide) {
    // TWO-COLUMN WIDE BANNER LAYOUT
    const leftW = contentW * 0.56;
    const rightX = padX + leftW + 44;
    const rightW = contentW - leftW - 44;

    // Headline
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const hSize = Math.round(48 * fontScale);
    ctx.font = `900 ${hSize}px ${fontStack}`;
    ctx.fillStyle = tpl.textPrimary;
    const hLines = wrapTextLines(ctx, poster.headline || 'TECHMAN COLLEGE 2027 Programme', leftW, 3);
    let cy = topStart + Math.round(headlineOffsetY * 0.5);
    for (const line of hLines) {
      ctx.fillText(line, padX, cy);
      cy += hSize * 1.15;
    }

    // Subheadline
    if (poster.subheadline) {
      cy += 10;
      ctx.font = `500 ${Math.round(21 * fontScale)}px ${fontStack}`;
      ctx.fillStyle = tpl.textMuted;
      const sLines = wrapTextLines(ctx, poster.subheadline, leftW, 3);
      for (const line of sLines) {
        ctx.fillText(line, padX, cy);
        cy += 28;
      }
    }

    // Verified Info Chips
    cy += 18;
    const chips = [
      poster.feeLabel,
      poster.registrationFeeLabel,
      poster.durationLabel,
      poster.modeLabel,
    ].filter(Boolean) as string[];
    let cx = padX;
    ctx.font = `700 18px ${fontStack}`;
    for (const chip of chips) {
      const cw = Math.min(ctx.measureText(chip).width + 32, leftW);
      if (cx + cw > padX + leftW) {
        cx = padX;
        cy += 46;
      }
      drawRoundedRect(ctx, cx, cy, cw, 38, 10);
      ctx.fillStyle = tpl.surface;
      ctx.fill();
      ctx.strokeStyle = isLight ? 'rgba(16,29,53,0.14)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = tpl.textPrimary;
      ctx.textBaseline = 'middle';
      ctx.fillText(chip, cx + 16, cy + 19);
      cx += cw + 12;
    }

    // Right Column: Highlights Box + CTA
    const boxY = topStart;
    const boxH = H - boxY - 108;
    drawRoundedRect(ctx, rightX, boxY, rightW, boxH, 20);
    ctx.fillStyle = tpl.surface;
    ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(16,29,53,0.12)' : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.fillStyle = accent;
    ctx.font = `800 17px ${fontStack}`;
    ctx.fillText('KEY COURSE HIGHLIGHTS', rightX + 26, boxY + 22);

    let hy = boxY + 56;
    const items = (poster.highlights || []).slice(0, 5);
    ctx.font = `600 19px ${fontStack}`;
    for (const item of items) {
      if (hy > boxY + boxH - 86) break;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(rightX + 34, hy + 11, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tpl.textPrimary;
      const lines = wrapTextLines(ctx, item, rightW - 70, 2);
      for (const l of lines) {
        ctx.fillText(l, rightX + 52, hy);
        hy += 25;
      }
      hy += 8;
    }

    // CTA Pill
    const ctaW = rightW - 52;
    const ctaH = 52;
    const ctaY = boxY + boxH - ctaH - 20;
    drawRoundedRect(ctx, rightX + 26, ctaY, ctaW, ctaH, 14);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 20px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((poster.ctaText || 'Apply Now').slice(0, 44), rightX + 26 + ctaW / 2, ctaY + ctaH / 2);
  } else {
    // VERTICAL / SQUARE / WHATSAPP / A4 POSTER LAYOUT
    let cy = topStart + headlineOffsetY;
    const textX = alignMode === 'center' ? W / 2 : padX;
    ctx.textAlign = alignMode;
    ctx.textBaseline = 'top';

    // Category Eyebrow
    ctx.font = `800 22px ${fontStack}`;
    ctx.fillStyle = accent;
    const eyebrow = `${brand.brandName || 'TECHMAN COLLEGE'} · ${poster.courseCategory || '2027 PROGRAMME'}`.toUpperCase();
    ctx.fillText(eyebrow, textX, cy);
    cy += 38;

    // Main Headline
    const baseHead = H >= 1650 ? 74 : H >= 1300 ? 64 : 56;
    const hSize = Math.round(baseHead * fontScale);
    ctx.font = `900 ${hSize}px ${fontStack}`;
    ctx.fillStyle = tpl.textPrimary;
    const hLines = wrapTextLines(ctx, poster.headline || 'TECHMAN COLLEGE 2027 Intake', contentW, 3);
    for (const line of hLines) {
      ctx.fillText(line, textX, cy);
      cy += hSize * 1.14;
    }

    // Subheadline
    if (poster.subheadline) {
      cy += 14;
      const sSize = Math.round((H >= 1650 ? 28 : 24) * fontScale);
      ctx.font = `500 ${sSize}px ${fontStack}`;
      ctx.fillStyle = tpl.textMuted;
      const sLines = wrapTextLines(ctx, poster.subheadline, contentW, 3);
      for (const line of sLines) {
        ctx.fillText(line, textX, cy);
        cy += sSize * 1.38;
      }
    }

    // Verified Fact Cards (Fee + Registration Fee, Duration, Study Mode)
    ctx.textAlign = 'left';
    cy += 24;
    const facts = [
      {
        label: 'TUITION / FEE',
        value: poster.feeLabel || 'Contact Admissions',
        sub: poster.registrationFeeLabel || '',
      },
      {
        label: 'DURATION',
        value: (poster.durationLabel || '2027 Intake').replace(/^Duration:\s*/i, ''),
        sub: '',
      },
      {
        label: 'DELIVERY MODE',
        value: (poster.modeLabel || 'Online / Hybrid').replace(/^Mode:\s*/i, ''),
        sub: '',
      },
    ];
    const gap = 18;
    const cardW = (contentW - gap * 2) / 3;
    const cardH = H >= 1650 ? 124 : poster.registrationFeeLabel ? 112 : 98;
    facts.forEach((f, idx) => {
      const fx = padX + idx * (cardW + gap);
      drawRoundedRect(ctx, fx, cy, cardW, cardH, 18);
      ctx.fillStyle = idx === 0 && poster.isFreeCourse ? 'rgba(16,185,129,0.22)' : tpl.surface;
      ctx.fill();
      ctx.strokeStyle =
        idx === 0 && poster.isFreeCourse
          ? '#10B981'
          : isLight
            ? 'rgba(16,29,53,0.14)'
            : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = idx === 0 && poster.isFreeCourse ? '#34D399' : accent;
      ctx.font = `800 15px ${fontStack}`;
      ctx.fillText(f.label, fx + 18, cy + 16);

      ctx.fillStyle = tpl.textPrimary;
      ctx.font = `800 20px ${fontStack}`;
      const valLines = wrapTextLines(ctx, f.value, cardW - 36, 2);
      valLines.forEach((vl, li) => {
        ctx.fillText(vl, fx + 18, cy + 40 + li * 23);
      });
      if (f.sub) {
        ctx.fillStyle = tpl.textMuted;
        ctx.font = `600 14px ${fontStack}`;
        ctx.fillText(f.sub.slice(0, 32), fx + 18, cy + cardH - 24);
      }
    });
    cy += cardH + 28;

    // Highlights Panel
    const footerH = 112;
    const ctaH = 68;
    const highlightsMaxH = Math.max(180, H - cy - footerH - ctaH - 44);
    drawRoundedRect(ctx, padX, cy, contentW, highlightsMaxH, 24);
    ctx.fillStyle = tpl.surface;
    ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(16,29,53,0.12)' : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = '800 20px Inter, system-ui, sans-serif';
    ctx.fillText('WHAT YOU WILL MASTER', padX + 32, cy + 26);

    let hy = cy + 68;
    const itemSize = Math.round((H >= 1650 ? 27 : 23) * fontScale);
    ctx.font = `600 ${itemSize}px Inter, system-ui, sans-serif`;
    const items = (poster.highlights || []).slice(0, 6);
    for (const item of items) {
      if (hy > cy + highlightsMaxH - 36) break;
      ctx.fillStyle = poster.isFreeCourse ? '#10B981' : accent;
      drawRoundedRect(ctx, padX + 32, hy + 6, 14, 14, 4);
      ctx.fill();
      ctx.fillStyle = tpl.textPrimary;
      const lines = wrapTextLines(ctx, item, contentW - 92, 2);
      for (const l of lines) {
        ctx.fillText(l, padX + 62, hy);
        hy += itemSize * 1.32;
      }
      hy += 10;
    }

    // CTA Button
    const ctaY = H - footerH - ctaH - 20;
    drawRoundedRect(ctx, padX, ctaY, contentW, ctaH, 18);
    ctx.fillStyle = poster.isFreeCourse ? '#10B981' : accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 26px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((poster.ctaText || 'Apply Now — 2027 Intake').slice(0, 56), W / 2, ctaY + ctaH / 2 + 1);
  }

  // 5. Verified Footer Strip (Contact + Website + Brand Tagline)
  const fBarH = isWide ? 68 : 88;
  const fBarY = H - fBarH;
  ctx.fillStyle = isLight ? '#101D35' : 'rgba(6,13,26,0.92)';
  ctx.fillRect(0, fBarY, W, fBarH);
  ctx.fillStyle = accent;
  ctx.fillRect(0, fBarY, W, 3);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 ${isWide ? 20 : 23}px Inter, system-ui, sans-serif`;
  const contactLine = poster.footerContact || `${brand.contactPhone} · ${brand.website.replace(/^https?:\/\//i, '')}`;
  ctx.fillText(contactLine, padX, fBarY + fBarH / 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#94A3B8';
  ctx.font = `600 ${isWide ? 16 : 18}px Inter, system-ui, sans-serif`;
  ctx.fillText(`${brand.brandName || 'TECHMAN COLLEGE'} · Est. 2021`, W - padX, fBarY + fBarH / 2);

  ctx.restore();
}

function triggerDownloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeSlug(str: string): string {
  return (str || 'techman-poster')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function exportPosterAsPNG(
  poster: Partial<GeneratedPoster>,
  brand: BrandSettings = DEFAULT_BRAND_SETTINGS
): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderPosterToCanvas(canvas, poster, brand, 1);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (blob) triggerDownloadBlob(blob, `${safeSlug(poster.title || poster.headline || 'poster')}_v${poster.versionNumber || 1}.png`);
}

export async function exportPosterAsJPG(
  poster: Partial<GeneratedPoster>,
  brand: BrandSettings = DEFAULT_BRAND_SETTINGS
): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderPosterToCanvas(canvas, poster, brand, 1);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.94));
  if (blob) triggerDownloadBlob(blob, `${safeSlug(poster.title || poster.headline || 'poster')}_v${poster.versionNumber || 1}.jpg`);
}

// Lightweight standards-compliant PDF 1.4 single-page wrapper embedding the rendered JPEG bytes
export async function exportPosterAsPDF(
  poster: Partial<GeneratedPoster>,
  brand: BrandSettings = DEFAULT_BRAND_SETTINGS
): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderPosterToCanvas(canvas, poster, brand, 1);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const b64 = jpegDataUrl.split(',')[1];
  const raw = atob(b64);
  const imgBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) imgBytes[i] = raw.charCodeAt(i);

  const imgW = canvas.width;
  const imgH = canvas.height;
  // Scale to fit A4-like points (max 595 x 842)
  const ptScale = Math.min(595 / imgW, 842 / imgH);
  const pageW = Math.round(imgW * ptScale);
  const pageH = Math.round(imgH * ptScale);

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    cursor += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    cursor += b.length;
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  offsets.push(cursor);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets.push(cursor);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  offsets.push(cursor);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  offsets.push(cursor);
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
  );
  pushBytes(imgBytes);
  pushStr('\nendstream\nendobj\n');

  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets.push(cursor);
  pushStr(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  const xrefPos = cursor;
  pushStr(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) {
    pushStr(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }

  triggerDownloadBlob(
    new Blob([out], { type: 'application/pdf' }),
    `${safeSlug(poster.title || poster.headline || 'poster')}_v${poster.versionNumber || 1}.pdf`
  );
}
