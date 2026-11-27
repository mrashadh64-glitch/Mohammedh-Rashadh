import * as XLSX from 'xlsx';
import {
  Application,
  Branch,
  Course,
  LeadPriority,
  LeadRecord,
  LeadStatus,
  MigratedStudentRecord,
} from '../types/lms';

export const LEAD_STATUS_OPTIONS: LeadStatus[] = [
  'New Lead',
  'Contacted',
  'Follow-up Required',
  'Interested',
  'Application Started',
  'Converted to Student',
  'Not Interested',
  'Lost',
  'Invalid Contact',
];

export const LEAD_PRIORITY_OPTIONS: LeadPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

export const LEAD_SOURCES = [
  'Website Enquiry',
  'Facebook Ads',
  'Instagram Ads',
  'TikTok',
  'WhatsApp Direct',
  'Walk-in / Campus Visit',
  'Referral / Alumni',
  'School / Outreach Programme',
  'Phone Call',
  'Bulk Excel Import',
];

export type LeadImportFieldKey =
  | 'fullName'
  | 'mobile'
  | 'whatsapp'
  | 'email'
  | 'dateOfBirth'
  | 'gender'
  | 'address'
  | 'city'
  | 'district'
  | 'interestedCourseName'
  | 'courseCategory'
  | 'preferredBranchName'
  | 'preferredStudyMode'
  | 'educationQualification'
  | 'academicYear'
  | 'leadSource'
  | 'campaignName'
  | 'adReference'
  | 'socialMediaPlatform'
  | 'referralName'
  | 'enquiryDate'
  | 'status'
  | 'assignedToName'
  | 'nextFollowUpDate'
  | 'followUpNotes'
  | 'priority';

export interface LeadFieldDefinition {
  key: LeadImportFieldKey;
  label: string;
  group: 'Personal' | 'Academic' | 'Marketing' | 'Follow-up';
  required?: boolean;
  aliases: string[];
}

export const LEAD_FIELD_DEFS: LeadFieldDefinition[] = [
  { key: 'fullName', label: 'Full Name', group: 'Personal', required: true, aliases: ['full name', 'fullname', 'name', 'student name', 'lead name', 'applicant name'] },
  { key: 'mobile', label: 'Mobile Number', group: 'Personal', required: true, aliases: ['mobile', 'mobile number', 'phone', 'phone number', 'contact', 'contact number', 'tel', 'telephone'] },
  { key: 'whatsapp', label: 'WhatsApp Number', group: 'Personal', aliases: ['whatsapp', 'whatsapp number', 'wa', 'wa number'] },
  { key: 'email', label: 'Email Address', group: 'Personal', aliases: ['email', 'email address', 'e-mail', 'mail'] },
  { key: 'dateOfBirth', label: 'Date of Birth', group: 'Personal', aliases: ['dob', 'date of birth', 'birth date', 'birthday'] },
  { key: 'gender', label: 'Gender', group: 'Personal', aliases: ['gender', 'sex'] },
  { key: 'address', label: 'Address', group: 'Personal', aliases: ['address', 'home address', 'street'] },
  { key: 'city', label: 'City', group: 'Personal', aliases: ['city', 'town'] },
  { key: 'district', label: 'District', group: 'Personal', aliases: ['district', 'province', 'region'] },
  { key: 'interestedCourseName', label: 'Interested Course', group: 'Academic', aliases: ['interested course', 'course', 'course name', 'programme', 'program'] },
  { key: 'courseCategory', label: 'Course Category', group: 'Academic', aliases: ['course category', 'category', 'level'] },
  { key: 'preferredBranchName', label: 'Preferred Branch', group: 'Academic', aliases: ['preferred branch', 'branch', 'campus', 'center', 'centre'] },
  { key: 'preferredStudyMode', label: 'Preferred Study Mode', group: 'Academic', aliases: ['study mode', 'preferred study mode', 'mode', 'delivery mode'] },
  { key: 'educationQualification', label: 'Education Qualification', group: 'Academic', aliases: ['qualification', 'education qualification', 'education', 'highest qualification'] },
  { key: 'academicYear', label: 'Academic Year', group: 'Academic', aliases: ['academic year', 'intake', 'year'] },
  { key: 'leadSource', label: 'Lead Source', group: 'Marketing', aliases: ['lead source', 'source', 'channel'] },
  { key: 'campaignName', label: 'Campaign Name', group: 'Marketing', aliases: ['campaign', 'campaign name'] },
  { key: 'adReference', label: 'Ad Reference', group: 'Marketing', aliases: ['ad reference', 'ad ref', 'ad id', 'ad name'] },
  { key: 'socialMediaPlatform', label: 'Social Media Platform', group: 'Marketing', aliases: ['social media', 'social media platform', 'platform'] },
  { key: 'referralName', label: 'Referral Name', group: 'Marketing', aliases: ['referral', 'referral name', 'referred by', 'referrer'] },
  { key: 'enquiryDate', label: 'Enquiry Date', group: 'Marketing', aliases: ['enquiry date', 'inquiry date', 'date', 'created date'] },
  { key: 'status', label: 'Lead Status', group: 'Follow-up', aliases: ['lead status', 'status', 'stage'] },
  { key: 'assignedToName', label: 'Assigned Staff', group: 'Follow-up', aliases: ['assigned staff', 'assigned to', 'owner', 'counselor', 'counsellor'] },
  { key: 'nextFollowUpDate', label: 'Next Follow-up Date', group: 'Follow-up', aliases: ['next follow-up', 'next follow up', 'next followup date', 'follow-up date', 'followup date'] },
  { key: 'followUpNotes', label: 'Follow-up Notes', group: 'Follow-up', aliases: ['notes', 'follow-up notes', 'followup notes', 'remarks', 'comments'] },
  { key: 'priority', label: 'Priority', group: 'Follow-up', aliases: ['priority', 'urgency'] },
];

export function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 10) {
    return `94${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith('7')) {
    return `94${digits}`;
  }
  return digits;
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function formatWhatsAppUrl(phone: string, fullName?: string, courseName?: string): string {
  const norm = normalizePhone(phone);
  if (!norm) return '#';
  const greeting = `Hello ${fullName || 'there'}, greetings from TECHMAN COLLEGE (Established in 2021).${
    courseName ? ` Thank you for your interest in ${courseName}.` : ''
  } How can our admissions team assist you today?`;
  return `https://wa.me/${norm}?text=${encodeURIComponent(greeting)}`;
}

export function generateLeadCode(seq?: number): string {
  const year = new Date().getFullYear();
  const suffix =
    typeof seq === 'number'
      ? String(seq).padStart(4, '0')
      : `${Math.floor(1000 + Math.random() * 9000)}`;
  return `LD-${year}-${suffix}`;
}

export interface ParsedLeadSpreadsheet {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
}

export function parseLeadSpreadsheet(
  data: ArrayBuffer,
  fileName: string,
  requestedSheet?: string
): ParsedLeadSpreadsheet {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return { fileName, sheetNames: [], activeSheet: '', headers: [], rows: [] };
  }
  const activeSheet =
    requestedSheet && sheetNames.includes(requestedSheet) ? requestedSheet : sheetNames[0];
  const sheet = workbook.Sheets[activeSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) {
    return { fileName, sheetNames, activeSheet, headers: [], rows: [] };
  }

  const rawHeaders = (matrix[0] || []).map((cell, idx) => {
    const label = String(cell ?? '').trim();
    return label || `Column_${idx + 1}`;
  });

  // Ensure unique header names
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) || 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h} (${count + 1})`;
  });

  const rows: Array<{ rowNumber: number; values: Record<string, string> }> = [];
  for (let i = 1; i < matrix.length; i++) {
    const rowArr = matrix[i] || [];
    const values: Record<string, string> = {};
    let hasAnyValue = false;
    headers.forEach((h, colIdx) => {
      const val = String(rowArr[colIdx] ?? '').trim();
      if (val) hasAnyValue = true;
      values[h] = val;
    });
    if (hasAnyValue) {
      rows.push({ rowNumber: i + 1, values });
    }
  }

  return { fileName, sheetNames, activeSheet, headers, rows };
}

export function autoMapLeadColumns(headers: string[]): Record<LeadImportFieldKey, string> {
  const mapping = {} as Record<LeadImportFieldKey, string>;
  const usedHeaders = new Set<string>();

  for (const def of LEAD_FIELD_DEFS) {
    let matched = '';
    for (const h of headers) {
      if (usedHeaders.has(h)) continue;
      const clean = h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (def.aliases.includes(clean)) {
        matched = h;
        break;
      }
    }
    if (!matched) {
      for (const h of headers) {
        if (usedHeaders.has(h)) continue;
        const clean = h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        if (def.aliases.some((alias) => clean.includes(alias) && alias.length >= 4)) {
          matched = h;
          break;
        }
      }
    }
    if (matched) usedHeaders.add(matched);
    mapping[def.key] = matched;
  }

  return mapping;
}

export type PreviewRowStatus = 'valid' | 'duplicate' | 'error';
export type DuplicateAction = 'skip' | 'merge';

export interface PreviewLeadRow {
  rowNumber: number;
  status: PreviewRowStatus;
  errors: string[];
  duplicateReason?: string;
  matchedLeadId?: string;
  matchedStudentRecord?: boolean;
  duplicateAction: DuplicateAction;
  payload: Partial<LeadRecord>;
}

function normalizeStudyMode(raw: string): 'Online' | 'Physical' | 'Hybrid' | '' {
  const lower = raw.trim().toLowerCase();
  if (!lower) return '';
  if (lower.includes('hybrid') || lower.includes('both')) return 'Hybrid';
  if (lower.includes('online') || lower.includes('remote')) return 'Online';
  if (lower.includes('phys') || lower.includes('campus') || lower.includes('class')) return 'Physical';
  return '';
}

function normalizeLeadStatus(raw: string): LeadStatus {
  const lower = raw.trim().toLowerCase();
  const matched = LEAD_STATUS_OPTIONS.find((s) => s.toLowerCase() === lower);
  return matched || 'New Lead';
}

function normalizePriority(raw: string): LeadPriority | undefined {
  const lower = raw.trim().toLowerCase();
  const matched = LEAD_PRIORITY_OPTIONS.find((p) => p.toLowerCase() === lower);
  return matched;
}

export function validateAndPreviewLeadRows(params: {
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
  mapping: Record<LeadImportFieldKey, string>;
  existingLeads: LeadRecord[];
  existingApplications: Application[];
  existingMigratedStudents: MigratedStudentRecord[];
  courses: Course[];
  branches: Branch[];
  defaultDuplicateAction?: DuplicateAction;
}): PreviewLeadRow[] {
  const {
    rows,
    mapping,
    existingLeads,
    existingApplications,
    existingMigratedStudents,
    courses,
    branches,
    defaultDuplicateAction = 'skip',
  } = params;

  const existingByPhone = new Map<string, LeadRecord>();
  const existingByEmail = new Map<string, LeadRecord>();
  for (const lead of existingLeads) {
    const p = normalizePhone(lead.normalizedMobile || lead.mobile);
    const e = normalizeEmail(lead.email);
    if (p) existingByPhone.set(p, lead);
    if (e) existingByEmail.set(e, lead);
  }

  const studentPhones = new Set<string>();
  const studentEmails = new Set<string>();
  for (const app of existingApplications) {
    const p = normalizePhone(app.phone);
    const e = normalizeEmail(app.email);
    if (p) studentPhones.add(p);
    if (e) studentEmails.add(e);
  }
  for (const ms of existingMigratedStudents) {
    const p = normalizePhone(ms.mobile);
    const e = normalizeEmail(ms.email);
    if (p) studentPhones.add(p);
    if (e) studentEmails.add(e);
  }

  const seenPhonesInFile = new Set<string>();
  const seenEmailsInFile = new Set<string>();

  return rows.map(({ rowNumber, values }) => {
    const getVal = (key: LeadImportFieldKey): string => {
      const col = mapping[key];
      if (!col) return '';
      return (values[col] || '').trim();
    };

    const fullName = getVal('fullName');
    const mobile = getVal('mobile');
    const normalizedMobile = normalizePhone(mobile);
    const email = normalizeEmail(getVal('email'));

    const errors: string[] = [];
    if (!fullName) errors.push('Missing required Full Name');
    if (!mobile) {
      errors.push('Missing required Mobile Number');
    } else if (normalizedMobile.length < 7 || normalizedMobile.length > 15) {
      errors.push(`Invalid Mobile Number format ("${mobile}")`);
    }
    if (email && !isValidEmailFormat(email)) {
      errors.push(`Invalid Email format ("${email}")`);
    }

    // Only populate fields actually present in the uploaded sheet
    const payload: Partial<LeadRecord> = {
      fullName: fullName.slice(0, 140),
      mobile: mobile.slice(0, 32),
      normalizedMobile: normalizedMobile.slice(0, 32),
    };

    const optFields: Array<[LeadImportFieldKey, number]> = [
      ['whatsapp', 32],
      ['dateOfBirth', 24],
      ['gender', 32],
      ['address', 300],
      ['city', 80],
      ['district', 80],
      ['courseCategory', 64],
      ['educationQualification', 160],
      ['academicYear', 16],
      ['leadSource', 80],
      ['campaignName', 120],
      ['adReference', 120],
      ['socialMediaPlatform', 64],
      ['referralName', 120],
      ['enquiryDate', 32],
      ['assignedToName', 120],
      ['nextFollowUpDate', 32],
      ['followUpNotes', 2000],
    ];

    if (email) payload.email = email.slice(0, 160);

    for (const [k, maxLen] of optFields) {
      const v = getVal(k);
      if (v) {
        (payload as Record<string, string>)[k] = v.slice(0, maxLen);
      }
    }

    const rawCourse = getVal('interestedCourseName');
    if (rawCourse) {
      const matchedCourse = courses.find(
        (c) =>
          c.name.toLowerCase() === rawCourse.toLowerCase() ||
          c.code.toLowerCase() === rawCourse.toLowerCase() ||
          c.name.toLowerCase().includes(rawCourse.toLowerCase())
      );
      payload.interestedCourseName = (matchedCourse?.name || rawCourse).slice(0, 160);
      if (matchedCourse) {
        payload.interestedCourseId = matchedCourse.id;
        if (!payload.courseCategory) payload.courseCategory = matchedCourse.category;
      }
    }

    const rawBranch = getVal('preferredBranchName');
    if (rawBranch) {
      const matchedBranch = branches.find(
        (b) =>
          b.name.toLowerCase() === rawBranch.toLowerCase() ||
          b.city.toLowerCase() === rawBranch.toLowerCase() ||
          b.code.toLowerCase() === rawBranch.toLowerCase()
      );
      payload.preferredBranchName = (matchedBranch?.name || rawBranch).slice(0, 120);
      if (matchedBranch) payload.preferredBranchId = matchedBranch.id;
    }

    const rawMode = getVal('preferredStudyMode');
    if (rawMode) {
      const mode = normalizeStudyMode(rawMode);
      if (mode) payload.preferredStudyMode = mode;
    }

    const rawStatus = getVal('status');
    payload.status = rawStatus ? normalizeLeadStatus(rawStatus) : 'New Lead';

    const rawPriority = getVal('priority');
    if (rawPriority) {
      const p = normalizePriority(rawPriority);
      if (p) payload.priority = p;
    }

    if (errors.length > 0) {
      return {
        rowNumber,
        status: 'error',
        errors,
        duplicateAction: 'skip',
        payload,
      };
    }

    // Duplicate detection against existing leads, existing student records, and earlier rows in this file
    const matchedLead =
      (normalizedMobile && existingByPhone.get(normalizedMobile)) ||
      (email && existingByEmail.get(email)) ||
      undefined;

    if (matchedLead) {
      return {
        rowNumber,
        status: 'duplicate',
        errors: [],
        duplicateReason: `Matches existing Lead ${matchedLead.leadId} (${matchedLead.fullName})`,
        matchedLeadId: matchedLead.id,
        duplicateAction: defaultDuplicateAction,
        payload,
      };
    }

    if (
      (normalizedMobile && studentPhones.has(normalizedMobile)) ||
      (email && studentEmails.has(email))
    ) {
      return {
        rowNumber,
        status: 'duplicate',
        errors: [],
        duplicateReason: 'Matches an existing TECHMAN COLLEGE Student / Application record',
        matchedStudentRecord: true,
        duplicateAction: 'skip',
        payload,
      };
    }

    if (
      (normalizedMobile && seenPhonesInFile.has(normalizedMobile)) ||
      (email && seenEmailsInFile.has(email))
    ) {
      return {
        rowNumber,
        status: 'duplicate',
        errors: [],
        duplicateReason: 'Duplicate mobile/email repeated within uploaded file',
        duplicateAction: 'skip',
        payload,
      };
    }

    if (normalizedMobile) seenPhonesInFile.add(normalizedMobile);
    if (email) seenEmailsInFile.add(email);

    return {
      rowNumber,
      status: 'valid',
      errors: [],
      duplicateAction: 'skip',
      payload,
    };
  });
}

export function mergeLeadFields(
  existing: LeadRecord,
  incoming: Partial<LeadRecord>
): Partial<LeadRecord> {
  const merged: Record<string, unknown> = {};
  const mergeableKeys: Array<keyof LeadRecord> = [
    'whatsapp',
    'email',
    'dateOfBirth',
    'gender',
    'address',
    'city',
    'district',
    'interestedCourseId',
    'interestedCourseName',
    'courseCategory',
    'preferredBranchId',
    'preferredBranchName',
    'preferredStudyMode',
    'educationQualification',
    'academicYear',
    'leadSource',
    'campaignName',
    'adReference',
    'socialMediaPlatform',
    'referralName',
    'nextFollowUpDate',
    'priority',
  ];

  for (const key of mergeableKeys) {
    const newVal = incoming[key];
    if (typeof newVal === 'string' && newVal.trim()) {
      merged[key] = newVal.trim();
    }
  }

  // Append follow-up notes safely rather than overwriting existing history
  if (incoming.followUpNotes && incoming.followUpNotes.trim()) {
    const combined = existing.followUpNotes
      ? `${existing.followUpNotes}\n[Merged Import] ${incoming.followUpNotes.trim()}`
      : incoming.followUpNotes.trim();
    merged.followUpNotes = combined.slice(0, 2000);
  }

  return merged as Partial<LeadRecord>;
}

export function downloadLeadSampleTemplate(): void {
  const headers = [
    'Full Name',
    'Mobile Number',
    'WhatsApp Number',
    'Email Address',
    'City',
    'District',
    'Interested Course',
    'Preferred Branch',
    'Preferred Study Mode',
    'Education Qualification',
    'Academic Year',
    'Lead Source',
    'Campaign Name',
    'Social Media Platform',
    'Referral Name',
    'Enquiry Date',
    'Priority',
    'Next Follow-up Date',
    'Follow-up Notes',
  ];

  const sampleRows = [
    [
      'Amina Farook',
      '0771234567',
      '0771234567',
      'amina.farook@example.com',
      'Colombo',
      'Colombo',
      'International Diploma in Artificial Intelligence & Prompt Engineering',
      'Colombo HQ',
      'Hybrid',
      'G.C.E. A/L',
      '2027',
      'Facebook Ads',
      '2027 AI Intake Campaign',
      'Facebook',
      '',
      new Date().toISOString().slice(0, 10),
      'High',
      new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      'Requested weekend batch fee installment plan',
    ],
    [
      'Kasun Perera',
      '0719876543',
      '0719876543',
      'kasun.perera@example.com',
      'Kandy',
      'Kandy',
      'Certificate in Web Design & Full-Stack Fundamentals',
      'Kandy Regional Center',
      'Online',
      'Undergraduate',
      '2027',
      'Website Enquiry',
      'Organic Search',
      'Google',
      '',
      new Date().toISOString().slice(0, 10),
      'Medium',
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      'Interested in online evening classes',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads_Template');
  XLSX.writeFile(wb, 'TECHMAN_COLLEGE_Lead_Import_Template.xlsx');
}

export function downloadLeadCsvTemplate(): void {
  const headers = [
    'Full Name',
    'Mobile Number',
    'WhatsApp Number',
    'Email Address',
    'City',
    'District',
    'Interested Course',
    'Preferred Branch',
    'Preferred Study Mode',
    'Education Qualification',
    'Academic Year',
    'Lead Source',
    'Campaign Name',
    'Social Media Platform',
    'Referral Name',
    'Enquiry Date',
    'Priority',
    'Next Follow-up Date',
    'Follow-up Notes',
  ];
  const sampleRow = [
    'Amina Farook',
    '0771234567',
    '0771234567',
    'amina.farook@example.com',
    'Colombo',
    'Colombo',
    'Diploma in Artificial Intelligence',
    'Colombo HQ',
    'Hybrid',
    'G.C.E. A/L',
    '2027',
    'Facebook Ads',
    '2027 AI Intake Campaign',
    'Facebook',
    '',
    new Date().toISOString().slice(0, 10),
    'High',
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    'Requested weekend batch details',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads_Template');
  XLSX.writeFile(wb, 'TECHMAN_COLLEGE_Lead_Import_Template.csv', { bookType: 'csv' });
}

export function computeLeadBatchFingerprint(
  fileName: string,
  rows: Array<{ rowNumber: number; values: Record<string, string> }>
): string {
  const canonical = JSON.stringify({
    fileName: fileName.trim().toLowerCase(),
    count: rows.length,
    sample: rows.slice(0, 25).map((r) => r.values),
  });
  let h1 = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h1 ^= canonical.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fp_${(h1 >>> 0).toString(16).padStart(8, '0')}_${rows.length}`;
}

export function normalizeGoogleSheetsCsvUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('https://docs.google.com/spreadsheets/')) return null;
  if (trimmed.includes('output=csv') || trimmed.includes('format=csv')) return trimmed;
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/);
  const gid = gidMatch ? `&gid=${gidMatch[1]}` : '';
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv${gid}`;
}

export function exportLeadsToSpreadsheet(
  leads: LeadRecord[],
  fileName: string,
  format: 'xlsx' | 'csv' = 'xlsx'
): void {
  const rows = leads.map((l) => ({
    'Lead ID': l.leadId,
    'Full Name': l.fullName,
    Mobile: l.mobile,
    WhatsApp: l.whatsapp || '',
    Email: l.email || '',
    City: l.city || '',
    District: l.district || '',
    'Interested Course': l.interestedCourseName || '',
    'Course Category': l.courseCategory || '',
    Branch: l.preferredBranchName || '',
    'Study Mode': l.preferredStudyMode || '',
    Qualification: l.educationQualification || '',
    'Academic Year': l.academicYear || '',
    'Lead Source': l.leadSource || '',
    Campaign: l.campaignName || '',
    'Social Platform': l.socialMediaPlatform || '',
    Referral: l.referralName || '',
    'Enquiry Date': l.enquiryDate || '',
    Status: l.status,
    Priority: l.priority || '',
    'Assigned Staff': l.assignedToName || '',
    'Last Contact': l.lastContactDate || '',
    'Next Follow-up': l.nextFollowUpDate || '',
    'Follow-up Notes': l.followUpNotes || '',
    'Converted Student ID': l.convertedStudentId || '',
    'Created At': l.createdAt || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TECHMAN_Leads');
  if (format === 'csv') {
    XLSX.writeFile(wb, `${fileName}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, `${fileName}.xlsx`, { bookType: 'xlsx' });
  }
}

export function exportLeadErrorReport(rows: PreviewLeadRow[], sourceFileName: string): void {
  const failed = rows.filter((r) => r.status === 'error' || r.status === 'duplicate');
  const data = failed.map((r) => ({
    'Excel Row #': r.rowNumber,
    'Validation Result': r.status.toUpperCase(),
    'Full Name': r.payload.fullName || '',
    Mobile: r.payload.mobile || '',
    Email: r.payload.email || '',
    'Issues / Duplicate Details':
      r.errors.length > 0 ? r.errors.join('; ') : r.duplicateReason || 'Duplicate record',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import_Error_Report');
  const cleanBase = sourceFileName.replace(/\.[^.]+$/, '').slice(0, 40);
  XLSX.writeFile(wb, `${cleanBase}_Error_Report.xlsx`);
}
