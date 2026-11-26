import { INSTITUTE_INFO, SEED_COURSES } from '../data/catalogSeed';
import { Application, Course } from '../types/lms';

export interface ParsedRegistrationRow {
  applicationNumber: string;
  fullName: string;
  email: string;
  phone: string;
  whatsapp: string;
  courseId: string;
  courseName: string;
  preferredMode: 'Online' | 'Physical' | 'Hybrid';
  branchId: string;
  batchName: string;
  highestQualification: string;
  documentNotes: string;
  referralCode: string;
  district: string;
  submittedTimestamp: string;
}

export interface CsvImportPreview {
  totalRows: number;
  uniqueRows: ParsedRegistrationRow[];
  duplicatesSkipped: number;
  courseBreakdown: Record<string, number>;
}

/**
 * RFC-4180 compliant CSV parser supporting quoted multiline fields and escaped double quotes.
 */
export function parseRfc4180Csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function cleanPhone(raw: string): string {
  const trimmed = raw.trim().replace(/^O(?=\d)/i, '0').replace(/\s+/g, ' ');
  return trimmed.slice(0, 32);
}

function cleanEmail(raw: string, fallback: string): string {
  const candidate = (raw || fallback || '').trim().replace(/\s+/g, '').toLowerCase();
  return candidate.slice(0, 160);
}

function matchCourseFromFormLabel(
  rawLabel: string,
  catalog: Course[]
): { courseId: string; courseName: string } {
  const label = rawLabel.trim().toLowerCase();
  const list = catalog.length > 0 ? catalog : SEED_COURSES;

  const direct = list.find((c) => c.name.toLowerCase() === label);
  if (direct) return { courseId: direct.id, courseName: direct.name };

  if (label.includes('graphic')) {
    const c = list.find((x) => x.id === 'cert-graphic-design') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('digital marketing')) {
    const c = list.find((x) => x.id === 'dip-intl-digital-marketing') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('web')) {
    const c = list.find((x) => x.id === 'cert-web-dev-design') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('video')) {
    const c = list.find((x) => x.id === 'dip-intl-video-editing') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('ai tools') || label.includes('artificial intelligence') || label.includes('prompt')) {
    const c = list.find((x) => x.id === 'dip-intl-ai') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('canva')) {
    const c = list.find((x) => x.id === 'cert-canva-design') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('social media')) {
    const c = list.find((x) => x.id === 'cert-social-media-marketing') || list[0];
    return { courseId: c.id, courseName: c.name };
  }
  if (label.includes('it') || label.includes('software')) {
    const c = list.find((x) => x.id === 'dip-intl-it') || list[0];
    return { courseId: c.id, courseName: c.name };
  }

  const partial = list.find(
    (c) => c.name.toLowerCase().includes(label) || (c.domain ? label.includes(c.domain.toLowerCase()) : false)
  );
  if (partial) return { courseId: partial.id, courseName: partial.name };

  return { courseId: list[0].id, courseName: list[0].name };
}

function matchBranchFromDistrict(district: string, mode: 'Online' | 'Physical' | 'Hybrid'): string {
  const d = district.trim().toLowerCase();
  if (mode === 'Online') return 'branch-online-global';
  if (d.includes('kandy')) return 'branch-kandy-regional';
  if (d.includes('colombo')) return 'branch-colombo-hq';
  return 'branch-online-global';
}

function normalizeMode(raw: string): 'Online' | 'Physical' | 'Hybrid' {
  const v = raw.trim().toLowerCase();
  if (v.includes('hybrid')) return 'Hybrid';
  if (v.includes('physical') || v.includes('offline')) return 'Physical';
  return 'Online';
}

function findColumnIndex(headers: string[], patterns: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const pat of patterns) {
    const idx = normalized.findIndex((h) => h.includes(pat));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parses TECHMAN AI Student Registration Form CSV exports into Firestore-validated Application payloads.
 */
export function parseStudentRegistrationCsv(
  csvText: string,
  catalog: Course[],
  existingApplications: Application[] = []
): CsvImportPreview {
  const matrix = parseRfc4180Csv(csvText);
  if (matrix.length < 2) {
    return { totalRows: 0, uniqueRows: [], duplicatesSkipped: 0, courseBreakdown: {} };
  }

  const headers = matrix[0];
  const dataRows = matrix.slice(1);

  const idxTimestamp = findColumnIndex(headers, ['timestamp']);
  const idxUsername = findColumnIndex(headers, ['username']);
  const idxFullName = findColumnIndex(headers, ['full name']);
  const idxMobile = findColumnIndex(headers, ['mobile number', 'phone']);
  const idxWhatsapp = findColumnIndex(headers, ['whatsapp number']);
  const idxEmail = findColumnIndex(headers, ['email address', 'email']);
  const idxCity = findColumnIndex(headers, ['city / town', 'city']);
  const idxDistrict = findColumnIndex(headers, ['district']);
  const idxQual = findColumnIndex(headers, ['highest educational qualification', 'qualification']);
  const idxStatus = findColumnIndex(headers, ['current status']);
  const idxCourse = findColumnIndex(headers, ['select your course', 'course']);
  const idxMode = findColumnIndex(headers, ['preferred learning mode', 'mode']);
  const idxGoal = findColumnIndex(headers, ['main learning goal', 'goal']);
  const idxReferral = findColumnIndex(headers, ['who referred you', 'referral']);
  const idxDevice = findColumnIndex(headers, ['what device will you mainly use', 'device']);
  const idxInternet = findColumnIndex(headers, ['internet connection']);

  const seenKeys = new Set<string>(
    existingApplications.map((a) => `${a.email.toLowerCase()}::${a.courseId}`)
  );

  const uniqueRows: ParsedRegistrationRow[] = [];
  const courseBreakdown: Record<string, number> = {};
  let duplicatesSkipped = 0;

  dataRows.forEach((cols, idx) => {
    const get = (colIdx: number) => (colIdx >= 0 && colIdx < cols.length ? cols[colIdx].trim() : '');

    const rawName = get(idxFullName);
    const email = cleanEmail(get(idxEmail), get(idxUsername));
    if (!rawName && !email) return;

    const fullName = (rawName || email.split('@')[0]).replace(/\s+/g, ' ').slice(0, 120);
    const rawCourse = get(idxCourse) || 'Graphic Design';
    const matchedCourse = matchCourseFromFormLabel(rawCourse, catalog);

    const dedupeKey = `${email}::${matchedCourse.courseId}`;
    if (seenKeys.has(dedupeKey)) {
      duplicatesSkipped++;
      return;
    }
    seenKeys.add(dedupeKey);

    const mode = normalizeMode(get(idxMode));
    const district = get(idxDistrict) || 'Sri Lanka';
    const city = get(idxCity);
    const phone = cleanPhone(get(idxMobile) || get(idxWhatsapp) || 'Not provided');
    const whatsapp = cleanPhone(get(idxWhatsapp) || phone);
    const qual = [get(idxQual), get(idxStatus)].filter(Boolean).join(' · ').slice(0, 160);
    const device = get(idxDevice);
    const internet = get(idxInternet);
    const goal = get(idxGoal).replace(/\s+/g, ' ');
    const notesParts = [
      `Form Course: ${rawCourse}`,
      city || district ? `Location: ${[city, district].filter(Boolean).join(', ')}` : '',
      device ? `Device: ${device}` : '',
      internet ? `Internet: ${internet}` : '',
      goal ? `Goal: ${goal}` : '',
    ].filter(Boolean);

    const referralRaw = get(idxReferral).replace(/\s+/g, ' ');
    const referralCode =
      referralRaw && !['no', 'none', 'no one', '-'].includes(referralRaw.toLowerCase())
        ? referralRaw.slice(0, 40)
        : '';

    // Deterministic safe Firestore document ID (alphanumeric + hyphen only)
    const seq = String(idx + 1).padStart(3, '0');
    const applicationNumber = `TM27-REG-${seq}`;

    courseBreakdown[matchedCourse.courseName] = (courseBreakdown[matchedCourse.courseName] || 0) + 1;

    uniqueRows.push({
      applicationNumber,
      fullName,
      email: email || `applicant${seq}@techmemai.lk`,
      phone: phone || '0000000000',
      whatsapp,
      courseId: matchedCourse.courseId,
      courseName: matchedCourse.courseName.slice(0, 160),
      preferredMode: mode,
      branchId: matchBranchFromDistrict(district, mode),
      batchName: mode === 'Online' ? 'Online Batch 04 (2027 Intake)' : 'Physical Batch 02 (2027 Intake)',
      highestQualification: qual,
      documentNotes: notesParts.join(' | ').slice(0, 400),
      referralCode,
      district,
      submittedTimestamp: get(idxTimestamp),
    });
  });

  return {
    totalRows: dataRows.length,
    uniqueRows,
    duplicatesSkipped,
    courseBreakdown,
  };
}

export function buildFirestoreApplicationPayload(row: ParsedRegistrationRow, nowIso: string) {
  return {
    applicationNumber: row.applicationNumber,
    fullName: row.fullName.slice(0, 120),
    email: row.email.slice(0, 160),
    phone: row.phone.slice(0, 32),
    whatsapp: row.whatsapp.slice(0, 32),
    courseId: row.courseId,
    courseName: row.courseName.slice(0, 160),
    preferredMode: row.preferredMode,
    branchId: row.branchId,
    batchName: row.batchName.slice(0, 80),
    highestQualification: row.highestQualification.slice(0, 160),
    documentNotes: row.documentNotes.slice(0, 400),
    referralCode: row.referralCode.slice(0, 40),
    status: 'Submitted' as const,
    institutionId: INSTITUTE_INFO.institutionId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function buildFirestoreTrackerPayload(row: ParsedRegistrationRow, nowIso: string) {
  const initials = row.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('.');

  return {
    applicationNumber: row.applicationNumber,
    applicantInitials: (initials || 'ST').slice(0, 24),
    courseName: row.courseName.slice(0, 160),
    status: 'Submitted',
    updatedAt: nowIso,
  };
}
