import * as XLSX from 'xlsx';
import {
  Application,
  Branch,
  Course,
  MigratedStudentRecord,
} from '../types/lms';
import { INSTITUTE_INFO } from '../data/catalogSeed';

export type LmsTargetField =
  | '__ignore__'
  | '__custom__'
  | 'studentId'
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'mobile'
  | 'whatsapp'
  | 'address'
  | 'dateOfBirth'
  | 'gender'
  | 'guardianName'
  | 'guardianContact'
  | 'courseName'
  | 'courseCode'
  | 'branch'
  | 'batch'
  | 'admissionDate'
  | 'academicYear'
  | 'registrationFee'
  | 'courseFee'
  | 'amountPaid'
  | 'outstandingBalance'
  | 'paymentStatus'
  | 'studentStatus'
  | 'additionalInfo';

export interface LmsFieldDefinition {
  key: LmsTargetField;
  label: string;
  group: 'Identity' | 'Contact' | 'Academic' | 'Financial (Legacy)' | 'Meta';
}

export const LMS_FIELD_DEFINITIONS: LmsFieldDefinition[] = [
  { key: '__custom__', label: 'Preserve in Custom Fields Archive', group: 'Meta' },
  { key: '__ignore__', label: 'Ignore Column (Do Not Import)', group: 'Meta' },
  { key: 'studentId', label: 'Student ID', group: 'Identity' },
  { key: 'fullName', label: 'Full Name', group: 'Identity' },
  { key: 'firstName', label: 'First Name', group: 'Identity' },
  { key: 'lastName', label: 'Last Name', group: 'Identity' },
  { key: 'dateOfBirth', label: 'Date of Birth', group: 'Identity' },
  { key: 'gender', label: 'Gender', group: 'Identity' },
  { key: 'email', label: 'Email Address', group: 'Contact' },
  { key: 'mobile', label: 'Mobile Number', group: 'Contact' },
  { key: 'whatsapp', label: 'WhatsApp Number', group: 'Contact' },
  { key: 'address', label: 'Residential Address', group: 'Contact' },
  { key: 'guardianName', label: 'Guardian / Parent Name', group: 'Contact' },
  { key: 'guardianContact', label: 'Guardian / Parent Contact', group: 'Contact' },
  { key: 'courseName', label: 'Course Name', group: 'Academic' },
  { key: 'courseCode', label: 'Course Code', group: 'Academic' },
  { key: 'branch', label: 'Branch / Campus / District', group: 'Academic' },
  { key: 'batch', label: 'Batch', group: 'Academic' },
  { key: 'admissionDate', label: 'Admission / Registration Date', group: 'Academic' },
  { key: 'academicYear', label: 'Academic Year', group: 'Academic' },
  { key: 'studentStatus', label: 'Student Status', group: 'Academic' },
  { key: 'registrationFee', label: 'Registration Fee (LKR)', group: 'Financial (Legacy)' },
  { key: 'courseFee', label: 'Course Fee (LKR)', group: 'Financial (Legacy)' },
  { key: 'amountPaid', label: 'Amount Paid (LKR)', group: 'Financial (Legacy)' },
  { key: 'outstandingBalance', label: 'Outstanding Balance (LKR)', group: 'Financial (Legacy)' },
  { key: 'paymentStatus', label: 'Payment Status', group: 'Financial (Legacy)' },
  { key: 'additionalInfo', label: 'Additional Information', group: 'Meta' },
];

export interface ParsedWorksheet {
  name: string;
  headers: string[];
  originalHeaders: string[];
  rows: Array<{
    rowNumber: number; // 1-based Excel/CSV row number (row 1 = headers)
    cells: Record<string, string>;
  }>;
  emptyCellCount: number;
  unnamedColumnCount: number;
}

export interface ParsedWorkbook {
  fileName: string;
  fileType: 'xlsx' | 'csv';
  sheets: ParsedWorksheet[];
}

export type DuplicateResolution = 'skip' | 'import_new' | 'update_existing' | 'manual_review';

export interface DuplicateMatchInfo {
  reason: 'Student ID' | 'Mobile Number' | 'Email Address' | 'Name + Date of Birth';
  matchSource: 'firestore' | 'within_file';
  matchedRef: string; // existing studentId / appNo or "Row #N"
  matchedName: string;
  existingDocId?: string;
}

export interface EvaluatedMigrationRow {
  rowNumber: number;
  rawCells: Record<string, string>;
  // Extracted normalized fields (never invented if absent in source)
  existingStudentId: string;
  assignedStudentId: string;
  studentIdOrigin: 'existing' | 'generated';
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  whatsapp: string;
  address: string;
  dateOfBirth: string;
  gender: string;
  guardianName: string;
  guardianContact: string;
  rawCourseValue: string;
  matchedCourseId: string;
  matchedCourseName: string;
  matchedCourseCode: string;
  courseMatchStatus: 'matched' | 'unmatched' | 'empty';
  rawBranchValue: string;
  matchedBranchId: string;
  matchedBranchName: string;
  branchMatchStatus: 'matched' | 'unmatched' | 'empty';
  batchName: string;
  admissionDate: string;
  academicYear: string;
  registrationFeeLkr?: number;
  courseFeeLkr?: number;
  amountPaidLkr?: number;
  outstandingBalanceLkr?: number;
  paymentStatus: string;
  hasLegacyFinancials: boolean;
  studentStatus: string;
  additionalInfo: string;
  customFields: Record<string, string>;
  // Validation & Duplicates
  errors: string[];
  warnings: string[];
  duplicate: DuplicateMatchInfo | null;
  resolution: DuplicateResolution;
  status: 'valid' | 'invalid' | 'duplicate' | 'needs_mapping';
}

export interface MigrationAnalysisSummary {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  missingRequiredCount: number;
  matchedCoursesCount: number;
  unmatchedCoursesCount: number;
  matchedBranchesCount: number;
  unmatchedBranchesCount: number;
  existingStudentIdsCount: number;
  newStudentIdsCount: number;
  legacyFinancialRowsCount: number;
  unmatchedCourseValues: Array<{ value: string; count: number }>;
  unmatchedBranchValues: Array<{ value: string; count: number }>;
  rows: EvaluatedMigrationRow[];
}

export function normalizeCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).replace(/\u00A0/g, ' ').trim();
}

export function normalizeEmail(val: string): string {
  return val.trim().toLowerCase();
}

export function normalizePhoneKey(val: string): string {
  const digits = val.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('94') && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }
  if (digits.length === 9 && digits.startsWith('7')) {
    return `0${digits}`;
  }
  return digits;
}

export function validateEmailStrict(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (/\s/.test(trimmed)) {
    return `Invalid email (contains spaces): "${trimmed}"`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return `Malformed email address: "${trimmed}"`;
  }
  if (/gamil\.com$|\.coma$|@gmail\.co$/i.test(trimmed)) {
    return `Suspicious email domain typo: "${trimmed}"`;
  }
  return null;
}

export function validatePhoneStrict(phone: string, label: string): { error: string | null; warning: string | null } {
  if (!phone) return { error: null, warning: null };
  const trimmed = phone.trim();
  if (/[a-zA-Z]/.test(trimmed)) {
    return { error: `Invalid ${label} (contains letters): "${trimmed}"`, warning: null };
  }
  const digits = trimmed.replace(/[\s\-()+]/g, '');
  if (/^0\d{9}$/.test(digits) || /^94\d{9}$/.test(digits)) {
    return { error: null, warning: null };
  }
  if (/^7\d{8}$/.test(digits)) {
    return {
      error: null,
      warning: `${label} missing leading zero ("${trimmed}" → normalized as 0${digits})`,
    };
  }
  if (digits.length < 10 || digits.length > 13) {
    return { error: `Invalid ${label} length (${digits.length} digits): "${trimmed}"`, warning: null };
  }
  return { error: null, warning: null };
}

export function validateDobStrict(dob: string): string | null {
  if (!dob) return null;
  const m = dob.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const year = parseInt(m[1], 10);
    const currentYear = new Date().getFullYear();
    if (year > currentYear - 4 || year < 1940) {
      return `Suspicious Date of Birth year (${year}): "${dob}"`;
    }
  }
  return null;
}

export function parseCurrencyNumber(val: string): number | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseCsvLossless(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"' && cleaned[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r' && cleaned[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function buildWorksheetFromMatrix(sheetName: string, matrix: unknown[][]): ParsedWorksheet {
  if (matrix.length === 0) {
    return {
      name: sheetName,
      headers: [],
      originalHeaders: [],
      rows: [],
      emptyCellCount: 0,
      unnamedColumnCount: 0,
    };
  }

  const rawHeaderRow = matrix[0] || [];
  const maxCols = Math.max(
    rawHeaderRow.length,
    ...matrix.slice(1).map((r) => (Array.isArray(r) ? r.length : 0))
  );

  const originalHeaders: string[] = [];
  const headers: string[] = [];
  const usedHeaderCounts = new Map<string, number>();
  let unnamedColumnCount = 0;

  for (let c = 0; c < maxCols; c++) {
    const rawH = normalizeCellValue(rawHeaderRow[c]);
    originalHeaders.push(rawH);
    let label = rawH;
    if (!label) {
      unnamedColumnCount++;
      label = `Unnamed_Column_${c + 1}`;
    }
    const seen = usedHeaderCounts.get(label) || 0;
    usedHeaderCounts.set(label, seen + 1);
    headers.push(seen > 0 ? `${label} (${seen + 1})` : label);
  }

  let emptyCellCount = 0;
  const rows: ParsedWorksheet['rows'] = [];

  for (let r = 1; r < matrix.length; r++) {
    const arr = Array.isArray(matrix[r]) ? matrix[r] : [];
    const cells: Record<string, string> = {};
    let hasAnyValue = false;
    for (let c = 0; c < headers.length; c++) {
      const val = normalizeCellValue(arr[c]);
      cells[headers[c]] = val;
      if (val) {
        hasAnyValue = true;
      } else {
        emptyCellCount++;
      }
    }
    if (hasAnyValue) {
      rows.push({
        rowNumber: r + 1,
        cells,
      });
    }
  }

  return {
    name: sheetName,
    headers,
    originalHeaders,
    rows,
    emptyCellCount,
    unnamedColumnCount,
  };
}

export function parseWorkbookFromArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string
): ParsedWorkbook {
  const isCsv = fileName.toLowerCase().endsWith('.csv');

  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const matrix = parseCsvLossless(text);
    return {
      fileName,
      fileType: 'csv',
      sheets: [buildWorksheetFromMatrix('Sheet1', matrix)],
    };
  }

  const wb = XLSX.read(buffer, {
    type: 'array',
    raw: false,
    cellDates: false,
  });

  const sheets: ParsedWorksheet[] = wb.SheetNames.map((sheetName) => {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    return buildWorksheetFromMatrix(sheetName, matrix);
  });

  return {
    fileName,
    fileType: 'xlsx',
    sheets,
  };
}

export function suggestColumnMapping(headers: string[]): Record<string, LmsTargetField> {
  const mapping: Record<string, LmsTargetField> = {};
  const assigned = new Set<LmsTargetField>();

  const claim = (header: string, field: LmsTargetField): boolean => {
    if (assigned.has(field)) return false;
    mapping[header] = field;
    assigned.add(field);
    return true;
  };

  for (const h of headers) {
    const low = h.toLowerCase().trim();

    // Never mis-map consent/announcement questions containing "whatsapp" or "course"
    if (
      /\b(consent|updates|announcements|receive|future courses|declaration|confirmation|referred|hear about|device|internet|computer|smartphone|why do you want|main learning goal|previous experience|describe your)\b/i.test(
        low
      )
    ) {
      mapping[h] = '__custom__';
      continue;
    }

    if (/student\s*id|reg(\.|istration)?\s*(no|number|id)|index\s*no/i.test(low)) {
      if (claim(h, 'studentId')) continue;
    }
    if (/full\s*name/i.test(low) && !/parent|guardian|emergency/i.test(low)) {
      if (claim(h, 'fullName')) continue;
    }
    if (/first\s*name/i.test(low) && !/parent|guardian/i.test(low)) {
      if (claim(h, 'firstName')) continue;
    }
    if (/last\s*name|surname/i.test(low) && !/parent|guardian/i.test(low)) {
      if (claim(h, 'lastName')) continue;
    }
    if (/email\s*address|^email$/i.test(low)) {
      if (claim(h, 'email')) continue;
    }
    if (/mobile\s*(no|number)|phone\s*(no|number)|^mobile$|^phone$/i.test(low) && !/parent|guardian|emergency/i.test(low)) {
      if (claim(h, 'mobile')) continue;
    }
    if (/whatsapp\s*(no|number)|^whatsapp$/i.test(low) && !/parent|guardian|emergency/i.test(low)) {
      if (claim(h, 'whatsapp')) continue;
    }
    if (/residential\s*address|^address$/i.test(low)) {
      if (claim(h, 'address')) continue;
    }
    if (/date\s*of\s*birth|^dob$/i.test(low)) {
      if (claim(h, 'dateOfBirth')) continue;
    }
    if (/^(\d+\.\s*)?gender$|^sex$/i.test(low)) {
      if (claim(h, 'gender')) continue;
    }
    if (/(parent|guardian).*name/i.test(low)) {
      if (claim(h, 'guardianName')) continue;
    }
    if (/(parent|guardian).*(contact|phone|mobile)/i.test(low)) {
      if (claim(h, 'guardianContact')) continue;
    }
    if (/select your course|course\s*name|programme|program|which skills/i.test(low)) {
      if (claim(h, 'courseName')) continue;
    }
    if (/course\s*code/i.test(low)) {
      if (claim(h, 'courseCode')) continue;
    }
    if (/preferred\s*branch|^branch$|campus/i.test(low)) {
      if (claim(h, 'branch')) continue;
    }
    if (/^(\d+\.\s*)?district$/i.test(low) && !headers.some((x) => /preferred\s*branch|^branch$/i.test(x))) {
      if (claim(h, 'branch')) continue;
    }
    if (/^batch$|batch\s*(name|no|code)/i.test(low)) {
      if (claim(h, 'batch')) continue;
    }
    if (/admission\s*date|registration\s*date|^timestamp$/i.test(low)) {
      if (claim(h, 'admissionDate')) continue;
    }
    if (/academic\s*year|intake\s*year/i.test(low)) {
      if (claim(h, 'academicYear')) continue;
    }
    if (/registration\s*fee|reg\s*fee/i.test(low)) {
      if (claim(h, 'registrationFee')) continue;
    }
    if (/course\s*fee|total\s*fee|tuition/i.test(low)) {
      if (claim(h, 'courseFee')) continue;
    }
    if (/amount\s*paid|paid\s*amount|^paid$/i.test(low)) {
      if (claim(h, 'amountPaid')) continue;
    }
    if (/outstanding|balance|due\s*amount/i.test(low)) {
      if (claim(h, 'outstandingBalance')) continue;
    }
    if (/payment\s*status/i.test(low)) {
      if (claim(h, 'paymentStatus')) continue;
    }
    if (/student\s*status/i.test(low)) {
      if (claim(h, 'studentStatus')) continue;
    }
    if (/additional\s*info|notes|remarks/i.test(low)) {
      if (claim(h, 'additionalInfo')) continue;
    }

    // Fallback: preserve every unrecognized column safely in Custom Fields Archive
    mapping[h] = '__custom__';
  }

  // Secondary fallback: if no explicit Email Address column was matched, check "Username" if it looks like emails
  if (!assigned.has('email')) {
    const usernameCol = headers.find((h) => /^username$/i.test(h.trim()));
    if (usernameCol) {
      mapping[usernameCol] = 'email';
      assigned.add('email');
    }
  }

  // If WhatsApp was mapped but Mobile wasn't (like Multi-Skill Mastery CSV), map WhatsApp to mobile too?
  // No — keep exact column mapping truthful; validation accepts either mobile OR whatsapp as contact.

  return mapping;
}

export function matchBranchAutomatically(
  rawValue: string,
  branches: Branch[],
  manualOverrides: Record<string, string>
): { branch: Branch | null; status: 'matched' | 'unmatched' | 'empty' } {
  const cleaned = rawValue.trim();
  if (!cleaned) return { branch: null, status: 'empty' };

  const overrideId = manualOverrides[cleaned];
  if (overrideId) {
    const found = branches.find((b) => b.id === overrideId);
    if (found) return { branch: found, status: 'matched' };
  }

  const low = cleaned.toLowerCase();
  // Direct exact or substring matches against official branches (Panadura, Kalutara, Colombo, Online, Kandy)
  for (const b of branches) {
    const bName = b.name.toLowerCase();
    const bCity = b.city.toLowerCase();
    const bCode = b.code.toLowerCase();
    if (low === bName || low === bCity || low === bCode) {
      return { branch: b, status: 'matched' };
    }
  }
  if (/panadura/i.test(low)) {
    const b = branches.find((x) => x.id === 'branch-panadura' || /panadura/i.test(x.name));
    if (b) return { branch: b, status: 'matched' };
  }
  if (/kalutara/i.test(low)) {
    const b = branches.find((x) => x.id === 'branch-kalutara' || /kalutara/i.test(x.name));
    if (b) return { branch: b, status: 'matched' };
  }
  if (/colombo/i.test(low)) {
    const b = branches.find((x) => x.id === 'branch-colombo-hq' || /colombo/i.test(x.name));
    if (b) return { branch: b, status: 'matched' };
  }
  if (/online/i.test(low)) {
    const b = branches.find((x) => x.id === 'branch-online-global' || /online/i.test(x.name));
    if (b) return { branch: b, status: 'matched' };
  }
  if (/kandy/i.test(low)) {
    const b = branches.find((x) => x.id === 'branch-kandy-regional' || /kandy/i.test(x.name));
    if (b) return { branch: b, status: 'matched' };
  }

  return { branch: null, status: 'unmatched' };
}

export function matchCourseAutomatically(
  rawValue: string,
  rawCode: string,
  courses: Course[],
  manualOverrides: Record<string, string>
): { course: Course | null; status: 'matched' | 'unmatched' | 'empty' } {
  const cleaned = rawValue.trim();
  const cleanedCode = rawCode.trim();
  if (!cleaned && !cleanedCode) return { course: null, status: 'empty' };

  if (cleaned && manualOverrides[cleaned]) {
    const found = courses.find((c) => c.id === manualOverrides[cleaned]);
    if (found) return { course: found, status: 'matched' };
  }

  if (cleanedCode) {
    const byCode = courses.find(
      (c) => c.code.toLowerCase() === cleanedCode.toLowerCase()
    );
    if (byCode) return { course: byCode, status: 'matched' };
  }

  const low = cleaned.toLowerCase();
  // Reject semicolon multi-skill lists from auto-guessing — require Super Admin explicit resolution!
  if (cleaned.includes(';')) {
    return { course: null, status: 'unmatched' };
  }

  const exact = courses.find(
    (c) => c.name.toLowerCase() === low || c.code.toLowerCase() === low
  );
  if (exact) return { course: exact, status: 'matched' };

  const aliasMap: Array<{ test: RegExp; courseId: string }> = [
    { test: /^(ai-powered\s*)?graphic\s*design$/i, courseId: 'cert-graphic-design' },
    { test: /^canva(\s*design)?$/i, courseId: 'cert-canva-design' },
    { test: /^web\s*(development|design)$/i, courseId: 'cert-web-dev-design' },
    { test: /^digital\s*marketing$/i, courseId: 'dip-intl-digital-marketing' },
    { test: /^social\s*media\s*marketing$/i, courseId: 'cert-social-media-marketing' },
    { test: /^video\s*editing$/i, courseId: 'dip-intl-video-editing' },
    { test: /^content\s*creation$/i, courseId: 'cert-content-creation' },
    { test: /^ai\s*tools\s*(&|and)\s*productivity$/i, courseId: 'dip-intl-ai' },
    { test: /^artificial\s*intelligence$/i, courseId: 'dip-intl-ai' },
    { test: /^prompt\s*engineering$/i, courseId: 'dip-intl-prompt-eng' },
    { test: /^ai\s*automation$/i, courseId: 'dip-intl-ai-automation' },
    { test: /^information\s*technology$|^it$/i, courseId: 'cert-information-technology' },
  ];

  for (const rule of aliasMap) {
    if (rule.test.test(cleaned)) {
      const target = courses.find((c) => c.id === rule.courseId);
      if (target) return { course: target, status: 'matched' };
    }
  }

  return { course: null, status: 'unmatched' };
}

export function extractMaxStudentIdSequence(
  prefix: string,
  academicYear: string,
  existingMigrated: MigratedStudentRecord[],
  existingApplications: Application[]
): number {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escapedPrefix}-${academicYear}-(\\d+)$`, 'i');
  let maxSeq = 0;

  for (const m of existingMigrated) {
    const match = (m.studentId || '').match(re);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq) maxSeq = num;
    }
  }
  for (const a of existingApplications) {
    const match = (a.assignedStudentId || '').match(re);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq) maxSeq = num;
    }
  }
  return maxSeq;
}

export function analyzeMigrationSheet(params: {
  sheet: ParsedWorksheet;
  columnMapping: Record<string, LmsTargetField>;
  idPrefix: string;
  academicYear: string;
  courses: Course[];
  branches: Branch[];
  existingMigrated: MigratedStudentRecord[];
  existingApplications: Application[];
  courseOverrides: Record<string, string>;
  branchOverrides: Record<string, string>;
  duplicateResolutions: Record<number, DuplicateResolution>;
}): MigrationAnalysisSummary {
  const {
    sheet,
    columnMapping,
    idPrefix,
    academicYear,
    courses,
    branches,
    existingMigrated,
    existingApplications,
    courseOverrides,
    branchOverrides,
    duplicateResolutions,
  } = params;

  // Build Firestore existing lookup indexes for 4-way duplicate detection
  const fsByStudentId = new Map<string, { id: string; name: string }>();
  const fsByEmail = new Map<string, { id: string; name: string }>();
  const fsByPhone = new Map<string, { id: string; name: string }>();
  const fsByNameDob = new Map<string, { id: string; name: string }>();

  for (const m of existingMigrated) {
    if (m.studentId) fsByStudentId.set(m.studentId.toUpperCase(), { id: m.id, name: m.fullName });
    if (m.email) fsByEmail.set(normalizeEmail(m.email), { id: m.id, name: m.fullName });
    const mobKey = normalizePhoneKey(m.mobile || '');
    if (mobKey) fsByPhone.set(mobKey, { id: m.id, name: m.fullName });
    const waKey = normalizePhoneKey(m.whatsapp || '');
    if (waKey) fsByPhone.set(waKey, { id: m.id, name: m.fullName });
    if (m.fullName && m.dateOfBirth) {
      fsByNameDob.set(
        `${m.fullName.toLowerCase().replace(/\s+/g, ' ')}|${m.dateOfBirth}`,
        { id: m.id, name: m.fullName }
      );
    }
  }
  for (const a of existingApplications) {
    if (a.assignedStudentId && !fsByStudentId.has(a.assignedStudentId.toUpperCase())) {
      fsByStudentId.set(a.assignedStudentId.toUpperCase(), { id: a.id, name: a.fullName });
    }
    if (a.email && !fsByEmail.has(normalizeEmail(a.email))) {
      fsByEmail.set(normalizeEmail(a.email), { id: a.id, name: a.fullName });
    }
    const pKey = normalizePhoneKey(a.phone || '');
    if (pKey && !fsByPhone.has(pKey)) {
      fsByPhone.set(pKey, { id: a.id, name: a.fullName });
    }
  }

  // Within-file duplicate indexes
  const fileByStudentId = new Map<string, { rowNumber: number; name: string }>();
  const fileByEmail = new Map<string, { rowNumber: number; name: string }>();
  const fileByPhone = new Map<string, { rowNumber: number; name: string }>();
  const fileByNameDob = new Map<string, { rowNumber: number; name: string }>();

  let nextSeq = extractMaxStudentIdSequence(
    idPrefix,
    academicYear,
    existingMigrated,
    existingApplications
  );

  const unmatchedCourseCounts = new Map<string, number>();
  const unmatchedBranchCounts = new Map<string, number>();

  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let missingRequiredCount = 0;
  let matchedCoursesCount = 0;
  let unmatchedCoursesCount = 0;
  let matchedBranchesCount = 0;
  let unmatchedBranchesCount = 0;
  let existingStudentIdsCount = 0;
  let newStudentIdsCount = 0;
  let legacyFinancialRowsCount = 0;

  const evaluatedRows: EvaluatedMigrationRow[] = [];

  for (const row of sheet.rows) {
    const fieldValues: Partial<Record<LmsTargetField, string>> = {};
    const customFields: Record<string, string> = {};

    for (const header of sheet.headers) {
      const target = columnMapping[header] || '__custom__';
      const val = row.cells[header] || '';
      if (target === '__ignore__') continue;
      if (target === '__custom__') {
        if (val) customFields[header] = val;
      } else {
        if (val) {
          fieldValues[target] = fieldValues[target]
            ? `${fieldValues[target]} | ${val}`
            : val;
        }
      }
    }

    const firstName = (fieldValues.firstName || '').trim();
    const lastName = (fieldValues.lastName || '').trim();
    const fullName = (fieldValues.fullName || `${firstName} ${lastName}`).trim();
    const email = (fieldValues.email || '').trim();
    const mobile = (fieldValues.mobile || '').trim();
    const whatsapp = (fieldValues.whatsapp || '').trim();
    const address = (fieldValues.address || '').trim();
    const dateOfBirth = (fieldValues.dateOfBirth || '').trim();
    const gender = (fieldValues.gender || '').trim();
    const guardianName = (fieldValues.guardianName || '').trim();
    const guardianContact = (fieldValues.guardianContact || '').trim();
    const existingStudentId = (fieldValues.studentId || '').trim().toUpperCase();
    const rawCourseValue = (fieldValues.courseName || '').trim();
    const rawCourseCode = (fieldValues.courseCode || '').trim();
    const rawBranchValue = (fieldValues.branch || '').trim();
    const batchName = (fieldValues.batch || '').trim();
    const admissionDate = (fieldValues.admissionDate || '').trim();
    const rowAcademicYear = (fieldValues.academicYear || academicYear).trim();
    const studentStatus = (fieldValues.studentStatus || 'Active (Migrated)').trim();
    const additionalInfo = (fieldValues.additionalInfo || '').trim();

    // Legacy financials — strictly extracted ONLY if real numeric/status values exist
    const registrationFeeLkr = parseCurrencyNumber(fieldValues.registrationFee || '');
    const courseFeeLkr = parseCurrencyNumber(fieldValues.courseFee || '');
    const amountPaidLkr = parseCurrencyNumber(fieldValues.amountPaid || '');
    const outstandingBalanceLkr = parseCurrencyNumber(fieldValues.outstandingBalance || '');
    const paymentStatus = (fieldValues.paymentStatus || '').trim();
    const hasLegacyFinancials =
      registrationFeeLkr !== undefined ||
      courseFeeLkr !== undefined ||
      amountPaidLkr !== undefined ||
      outstandingBalanceLkr !== undefined ||
      paymentStatus.length > 0;
    if (hasLegacyFinancials) legacyFinancialRowsCount++;

    // Validation
    const errors: string[] = [];
    const warnings: string[] = [];
    let missingReq = false;

    if (!fullName) {
      errors.push('Missing required Full Name (no student name column or empty cell).');
      missingReq = true;
    }
    if (!email && !mobile && !whatsapp) {
      errors.push('Missing contact details (no Email, Mobile, or WhatsApp number).');
      missingReq = true;
    }
    if (missingReq) missingRequiredCount++;

    const emailErr = validateEmailStrict(email);
    if (emailErr) errors.push(emailErr);

    const mobRes = validatePhoneStrict(mobile, 'Mobile Number');
    if (mobRes.error) errors.push(mobRes.error);
    if (mobRes.warning) warnings.push(mobRes.warning);

    const waRes = validatePhoneStrict(whatsapp, 'WhatsApp Number');
    if (waRes.error) errors.push(waRes.error);
    if (waRes.warning) warnings.push(waRes.warning);

    const dobWarn = validateDobStrict(dateOfBirth);
    if (dobWarn) warnings.push(dobWarn);

    // Match Course
    const courseRes = matchCourseAutomatically(
      rawCourseValue,
      rawCourseCode,
      courses,
      courseOverrides
    );
    if (courseRes.status === 'matched') {
      matchedCoursesCount++;
    } else if (courseRes.status === 'unmatched') {
      unmatchedCoursesCount++;
      unmatchedCourseCounts.set(
        rawCourseValue,
        (unmatchedCourseCounts.get(rawCourseValue) || 0) + 1
      );
      warnings.push(`Unmatched course: "${rawCourseValue}" — map manually before importing.`);
    }

    // Match Branch
    const branchRes = matchBranchAutomatically(rawBranchValue, branches, branchOverrides);
    if (branchRes.status === 'matched') {
      matchedBranchesCount++;
    } else if (branchRes.status === 'unmatched') {
      unmatchedBranchesCount++;
      unmatchedBranchCounts.set(
        rawBranchValue,
        (unmatchedBranchCounts.get(rawBranchValue) || 0) + 1
      );
      warnings.push(`Unmatched branch/district: "${rawBranchValue}" — assign to an official branch.`);
    }

    // 4-Way Duplicate Detection (Never auto-merge or auto-overwrite!)
    let duplicate: DuplicateMatchInfo | null = null;
    const normEmail = normalizeEmail(email);
    const normMob = normalizePhoneKey(mobile || whatsapp);
    const nameDobKey =
      fullName && dateOfBirth
        ? `${fullName.toLowerCase().replace(/\s+/g, ' ')}|${dateOfBirth}`
        : '';

    if (existingStudentId && fsByStudentId.has(existingStudentId)) {
      const m = fsByStudentId.get(existingStudentId)!;
      duplicate = {
        reason: 'Student ID',
        matchSource: 'firestore',
        matchedRef: m.id,
        matchedName: m.name,
        existingDocId: m.id,
      };
    } else if (existingStudentId && fileByStudentId.has(existingStudentId)) {
      const m = fileByStudentId.get(existingStudentId)!;
      duplicate = {
        reason: 'Student ID',
        matchSource: 'within_file',
        matchedRef: `Row #${m.rowNumber}`,
        matchedName: m.name,
      };
    } else if (normEmail && fsByEmail.has(normEmail)) {
      const m = fsByEmail.get(normEmail)!;
      duplicate = {
        reason: 'Email Address',
        matchSource: 'firestore',
        matchedRef: m.id,
        matchedName: m.name,
        existingDocId: m.id,
      };
    } else if (normEmail && fileByEmail.has(normEmail)) {
      const m = fileByEmail.get(normEmail)!;
      duplicate = {
        reason: 'Email Address',
        matchSource: 'within_file',
        matchedRef: `Row #${m.rowNumber}`,
        matchedName: m.name,
      };
    } else if (normMob && fsByPhone.has(normMob)) {
      const m = fsByPhone.get(normMob)!;
      duplicate = {
        reason: 'Mobile Number',
        matchSource: 'firestore',
        matchedRef: m.id,
        matchedName: m.name,
        existingDocId: m.id,
      };
    } else if (normMob && fileByPhone.has(normMob)) {
      const m = fileByPhone.get(normMob)!;
      duplicate = {
        reason: 'Mobile Number',
        matchSource: 'within_file',
        matchedRef: `Row #${m.rowNumber}`,
        matchedName: m.name,
      };
    } else if (nameDobKey && fsByNameDob.has(nameDobKey)) {
      const m = fsByNameDob.get(nameDobKey)!;
      duplicate = {
        reason: 'Name + Date of Birth',
        matchSource: 'firestore',
        matchedRef: m.id,
        matchedName: m.name,
        existingDocId: m.id,
      };
    } else if (nameDobKey && fileByNameDob.has(nameDobKey)) {
      const m = fileByNameDob.get(nameDobKey)!;
      duplicate = {
        reason: 'Name + Date of Birth',
        matchSource: 'within_file',
        matchedRef: `Row #${m.rowNumber}`,
        matchedName: m.name,
      };
    }

    // Record first occurrence in within-file maps
    if (existingStudentId && !fileByStudentId.has(existingStudentId)) {
      fileByStudentId.set(existingStudentId, { rowNumber: row.rowNumber, name: fullName });
    }
    if (normEmail && !fileByEmail.has(normEmail)) {
      fileByEmail.set(normEmail, { rowNumber: row.rowNumber, name: fullName });
    }
    if (normMob && !fileByPhone.has(normMob)) {
      fileByPhone.set(normMob, { rowNumber: row.rowNumber, name: fullName });
    }
    if (nameDobKey && !fileByNameDob.has(nameDobKey)) {
      fileByNameDob.set(nameDobKey, { rowNumber: row.rowNumber, name: fullName });
    }

    const resolution: DuplicateResolution = duplicate
      ? duplicateResolutions[row.rowNumber] || 'skip'
      : 'import_new';

    // Determine row status
    let status: EvaluatedMigrationRow['status'] = 'valid';
    if (errors.length > 0) {
      status = 'invalid';
      invalidCount++;
    } else if (duplicate) {
      status = 'duplicate';
      duplicateCount++;
    } else if (courseRes.status === 'unmatched' || branchRes.status === 'unmatched') {
      status = 'needs_mapping';
    } else {
      status = 'valid';
      validCount++;
    }

    // Student ID Assignment (preserve valid existing Student ID; generate sequential only for records being imported)
    let assignedStudentId = existingStudentId;
    let studentIdOrigin: 'existing' | 'generated' = 'existing';
    const isValidExistingId = /^[A-Z0-9][A-Z0-9\-_]{2,39}$/.test(existingStudentId);

    if (isValidExistingId) {
      existingStudentIdsCount++;
      studentIdOrigin = 'existing';
    } else {
      studentIdOrigin = 'generated';
      const willBeAssignedId =
        status === 'valid' ||
        status === 'needs_mapping' ||
        (status === 'duplicate' && resolution === 'import_new');
      if (willBeAssignedId) {
        nextSeq++;
        assignedStudentId = `${idPrefix}-${academicYear}-${String(nextSeq).padStart(4, '0')}`;
        newStudentIdsCount++;
      } else if (status === 'duplicate' && resolution === 'update_existing' && duplicate?.existingDocId) {
        assignedStudentId = duplicate.existingDocId;
      } else {
        assignedStudentId = '—';
      }
    }

    evaluatedRows.push({
      rowNumber: row.rowNumber,
      rawCells: row.cells,
      existingStudentId,
      assignedStudentId,
      studentIdOrigin,
      fullName,
      firstName,
      lastName,
      email,
      mobile,
      whatsapp,
      address,
      dateOfBirth,
      gender,
      guardianName,
      guardianContact,
      rawCourseValue,
      matchedCourseId: courseRes.course?.id || '',
      matchedCourseName: courseRes.course?.name || rawCourseValue,
      matchedCourseCode: courseRes.course?.code || rawCourseCode,
      courseMatchStatus: courseRes.status,
      rawBranchValue,
      matchedBranchId: branchRes.branch?.id || '',
      matchedBranchName: branchRes.branch?.name || rawBranchValue,
      branchMatchStatus: branchRes.status,
      batchName,
      admissionDate,
      academicYear: rowAcademicYear,
      registrationFeeLkr,
      courseFeeLkr,
      amountPaidLkr,
      outstandingBalanceLkr,
      paymentStatus,
      hasLegacyFinancials,
      studentStatus,
      additionalInfo,
      customFields,
      errors,
      warnings,
      duplicate,
      resolution,
      status,
    });
  }

  return {
    totalRows: sheet.rows.length,
    validCount,
    invalidCount,
    duplicateCount,
    missingRequiredCount,
    matchedCoursesCount,
    unmatchedCoursesCount,
    matchedBranchesCount,
    unmatchedBranchesCount,
    existingStudentIdsCount,
    newStudentIdsCount,
    legacyFinancialRowsCount,
    unmatchedCourseValues: Array.from(unmatchedCourseCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    unmatchedBranchValues: Array.from(unmatchedBranchCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    rows: evaluatedRows,
  };
}

export function buildMigratedStudentDocPayload(params: {
  row: EvaluatedMigrationRow;
  batchId: string;
  sourceFileName: string;
  sourceSheetName: string;
  importedByEmail: string;
  nowIso: string;
}): Omit<MigratedStudentRecord, 'id'> {
  const { row, batchId, sourceFileName, sourceSheetName, importedByEmail, nowIso } = params;

  const customJson =
    Object.keys(row.customFields).length > 0
      ? JSON.stringify(row.customFields).slice(0, 7900)
      : '';

  const payload: Omit<MigratedStudentRecord, 'id'> = {
    studentId: row.assignedStudentId.slice(0, 40),
    fullName: row.fullName.slice(0, 140),
    academicYear: row.academicYear.slice(0, 16),
    studentStatus: row.studentStatus.slice(0, 40) || 'Active (Migrated)',
    importBatchId: batchId.slice(0, 64),
    sourceFileName: sourceFileName.slice(0, 200),
    sourceSheetName: sourceSheetName.slice(0, 120),
    sourceRowNumber: row.rowNumber,
    importedByEmail: importedByEmail.slice(0, 160),
    importedAt: nowIso,
    accountActivationStatus: 'not_activated',
    legacyPaymentStatus: row.hasLegacyFinancials
      ? 'legacy_imported_pending_reconciliation'
      : 'none',
    isMigrated: true,
    institutionId: INSTITUTE_INFO.institutionId,
    updatedAt: nowIso,
  };

  if (row.firstName) payload.firstName = row.firstName.slice(0, 80);
  if (row.lastName) payload.lastName = row.lastName.slice(0, 80);
  if (row.email) payload.email = normalizeEmail(row.email).slice(0, 160);
  if (row.mobile) payload.mobile = row.mobile.slice(0, 40);
  if (row.whatsapp) payload.whatsapp = row.whatsapp.slice(0, 40);
  if (row.address) payload.address = row.address.slice(0, 360);
  if (row.dateOfBirth) payload.dateOfBirth = row.dateOfBirth.slice(0, 32);
  if (row.gender) payload.gender = row.gender.slice(0, 32);
  if (row.guardianName) payload.guardianName = row.guardianName.slice(0, 140);
  if (row.guardianContact) payload.guardianContact = row.guardianContact.slice(0, 40);
  if (row.matchedCourseId) payload.courseId = row.matchedCourseId.slice(0, 128);
  if (row.matchedCourseName) payload.courseName = row.matchedCourseName.slice(0, 200);
  if (row.matchedCourseCode) payload.courseCode = row.matchedCourseCode.slice(0, 40);
  if (row.matchedBranchId) payload.branchId = row.matchedBranchId.slice(0, 64);
  if (row.matchedBranchName) payload.branchName = row.matchedBranchName.slice(0, 120);
  if (row.batchName) payload.batchName = row.batchName.slice(0, 100);
  if (row.admissionDate) payload.admissionDate = row.admissionDate.slice(0, 40);
  if (row.registrationFeeLkr !== undefined) payload.registrationFeeLkr = row.registrationFeeLkr;
  if (row.courseFeeLkr !== undefined) payload.courseFeeLkr = row.courseFeeLkr;
  if (row.amountPaidLkr !== undefined) payload.amountPaidLkr = row.amountPaidLkr;
  if (row.outstandingBalanceLkr !== undefined) {
    payload.outstandingBalanceLkr = row.outstandingBalanceLkr;
  }
  if (row.paymentStatus) payload.paymentStatus = row.paymentStatus.slice(0, 64);
  if (row.additionalInfo) payload.additionalInfo = row.additionalInfo.slice(0, 1200);
  if (customJson) payload.customFieldsJson = customJson;

  return payload;
}

export function downloadErrorReportXlsx(
  analysis: MigrationAnalysisSummary,
  sourceFileName: string
): void {
  const wb = XLSX.utils.book_new();

  const issueRows = analysis.rows
    .filter((r) => r.errors.length > 0 || r.warnings.length > 0 || r.duplicate !== null)
    .map((r) => ({
      Source_Row: r.rowNumber,
      Status: r.status.toUpperCase(),
      Full_Name: r.fullName,
      Email: r.email,
      Mobile: r.mobile,
      WhatsApp: r.whatsapp,
      Date_Of_Birth: r.dateOfBirth,
      Raw_Course: r.rawCourseValue,
      Raw_Branch: r.rawBranchValue,
      Errors: r.errors.join(' ; '),
      Warnings: r.warnings.join(' ; '),
      Duplicate_Reason: r.duplicate
        ? `${r.duplicate.reason} (${r.duplicate.matchSource}: ${r.duplicate.matchedRef} - ${r.duplicate.matchedName})`
        : '',
      Selected_Resolution: r.duplicate ? r.resolution : '',
    }));

  const wsIssues = XLSX.utils.json_to_sheet(
    issueRows.length > 0
      ? issueRows
      : [{ Message: 'Zero validation errors, warnings, or duplicates found.' }]
  );
  XLSX.utils.book_append_sheet(wb, wsIssues, 'Validation_Error_Report');

  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Source File', Value: sourceFileName },
    { Metric: 'Total Rows Inspected', Value: analysis.totalRows },
    { Metric: 'Valid Ready Records', Value: analysis.validCount },
    { Metric: 'Invalid Records', Value: analysis.invalidCount },
    { Metric: 'Duplicate Candidates', Value: analysis.duplicateCount },
    { Metric: 'Missing Required Info', Value: analysis.missingRequiredCount },
    { Metric: 'Matched Courses', Value: analysis.matchedCoursesCount },
    { Metric: 'Unmatched Courses', Value: analysis.unmatchedCoursesCount },
    { Metric: 'Matched Branches', Value: analysis.matchedBranchesCount },
    { Metric: 'Unmatched Branches', Value: analysis.unmatchedBranchesCount },
    { Metric: 'Existing Valid Student IDs', Value: analysis.existingStudentIdsCount },
    { Metric: 'New Sequential Student IDs', Value: analysis.newStudentIdsCount },
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const safeBase = sourceFileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  XLSX.writeFile(wb, `TECHMAN_COLLEGE_Error_Report_${safeBase}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadPreImportBackupXlsx(
  existingMigrated: MigratedStudentRecord[],
  existingApplications: Application[]
): string {
  const wb = XLSX.utils.book_new();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const migratedSheet = XLSX.utils.json_to_sheet(
    existingMigrated.length > 0
      ? existingMigrated
      : [{ Notice: 'No pre-existing migratedStudents records prior to this import.' }]
  );
  XLSX.utils.book_append_sheet(wb, migratedSheet, 'MigratedStudents_Backup');

  const appsSheet = XLSX.utils.json_to_sheet(
    existingApplications.length > 0
      ? existingApplications
      : [{ Notice: 'No pre-existing applications records prior to this import.' }]
  );
  XLSX.utils.book_append_sheet(wb, appsSheet, 'Applications_Backup');

  const fileName = `TECHMAN_COLLEGE_PreImport_Backup_${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return `${fileName} (${existingMigrated.length} migrated students, ${existingApplications.length} applications)`;
}
