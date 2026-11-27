import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';
import nodemailer from 'nodemailer';

export type StudentAccountStatus =
  | 'Not Created'
  | 'Invitation Sent'
  | 'Active'
  | 'Suspended'
  | 'Password Reset Required';

export type EmailNotificationType =
  | 'student_account_created'
  | 'login_credentials'
  | 'password_reset'
  | 'admission_confirmation'
  | 'syllabus_updated'
  | 'academic_announcement';

interface StoredStudentAccount {
  id: string;
  studentId: string;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  courseId?: string;
  courseName?: string;
  batchName?: string;
  branchId?: string;
  linkedUserUid?: string;
  linkedMigratedId?: string;
  status: StudentAccountStatus;
  mustChangePassword: boolean;
  passwordHash: string; // scrypt$<saltHex>$<hashHex> — NEVER plaintext
  activationTokenHash?: string; // sha256 hex of single-use activation token
  activationTokenExpiresAt?: string;
  invitationSentAt?: string;
  invitationCount: number;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
  createdByUid: string;
  createdByEmail: string;
  institutionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedStudentAccount {
  id: string;
  studentId: string;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  courseId?: string;
  courseName?: string;
  batchName?: string;
  branchId?: string;
  linkedUserUid?: string;
  linkedMigratedId?: string;
  status: StudentAccountStatus;
  mustChangePassword: boolean;
  invitationSentAt?: string;
  invitationCount: number;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
  createdByUid: string;
  createdByEmail: string;
  institutionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredEmailLog {
  id: string;
  emailType: EmailNotificationType;
  recipientEmail: string;
  recipientName?: string;
  studentId?: string;
  courseId?: string;
  subject: string;
  bodyPreview: string;
  resendHtml?: string;
  resendText?: string;
  provider: 'resend' | 'smtp' | 'sandbox_outbox';
  status: 'sent' | 'failed' | 'queued_configure_provider';
  errorMessage?: string;
  retryCount: number;
  sentByUid: string;
  sentByEmail: string;
  institutionId: string;
  sentAt?: string;
  createdAt: string;
}

export interface VerifiedStudentSession {
  uid: string;
  accountId: string;
  studentId: string;
  username: string;
  email: string;
  fullName: string;
  scope: 'student_session' | 'password_change_only';
  exp: number;
}

interface MountDeps {
  baseDir: string;
  signingSecret: string;
  firebaseConfig: {
    projectId?: string;
    apiKey?: string;
    firestoreDatabaseId?: string;
  };
  requireAuthorizedRoles: (
    req: express.Request,
    res: express.Response,
    allowedRoles: string[]
  ) => Promise<{ uid: string; email: string; token: string } | null>;
}

const INSTITUTION_ID = 'techman-college-lk';
const COLLEGE_PHONE = '+94 710 108 803';
const COLLEGE_WEBSITE = 'https://techmemai.lk';
const COLLEGE_EMAIL = 'info@techmemai.lk';

function sanitizeStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeStudentId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 64);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function hashPasswordScrypt(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPasswordScrypt(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derivedBuf = crypto.scryptSync(plain, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

function sha256Hex(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%';
  const all = upper + lower + digits + symbols;
  const chars = [
    upper[crypto.randomInt(upper.length)],
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  while (chars.length < 12) {
    chars.push(all[crypto.randomInt(all.length)]);
  }
  // Fisher-Yates shuffle with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function validateNewPasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'New password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'New password must be 128 characters or fewer.';
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'New password must contain at least one uppercase letter, one lowercase letter, and one number.';
  }
  return null;
}

function sanitizeAccountForClient(acc: StoredStudentAccount): SanitizedStudentAccount {
  return {
    id: acc.id,
    studentId: acc.studentId,
    username: acc.username,
    fullName: acc.fullName,
    email: acc.email,
    phone: acc.phone,
    courseId: acc.courseId,
    courseName: acc.courseName,
    batchName: acc.batchName,
    branchId: acc.branchId,
    linkedUserUid: acc.linkedUserUid,
    linkedMigratedId: acc.linkedMigratedId,
    status: acc.status,
    mustChangePassword: acc.mustChangePassword,
    invitationSentAt: acc.invitationSentAt,
    invitationCount: acc.invitationCount,
    passwordUpdatedAt: acc.passwordUpdatedAt,
    lastLoginAt: acc.lastLoginAt,
    createdByUid: acc.createdByUid,
    createdByEmail: acc.createdByEmail,
    institutionId: acc.institutionId,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
  };
}

function sanitizeEmailLogForClient(log: StoredEmailLog) {
  return {
    id: log.id,
    emailType: log.emailType,
    recipientEmail: log.recipientEmail,
    recipientName: log.recipientName,
    studentId: log.studentId,
    courseId: log.courseId,
    subject: log.subject,
    bodyPreview: log.bodyPreview,
    provider: log.provider,
    status: log.status,
    errorMessage: log.errorMessage,
    retryCount: log.retryCount,
    sentByUid: log.sentByUid,
    sentByEmail: log.sentByEmail,
    institutionId: log.institutionId,
    sentAt: log.sentAt,
    createdAt: log.createdAt,
  };
}

function decodeFirestoreField(val: Record<string, unknown> | undefined): unknown {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = val.arrayValue as { values?: Array<Record<string, unknown>> };
    return Array.isArray(arr?.values) ? arr.values.map((v) => decodeFirestoreField(v)) : [];
  }
  if ('mapValue' in val) {
    const map = val.mapValue as { fields?: Record<string, Record<string, unknown>> };
    const out: Record<string, unknown> = {};
    if (map?.fields) {
      for (const [k, v] of Object.entries(map.fields)) {
        out[k] = decodeFirestoreField(v);
      }
    }
    return out;
  }
  return undefined;
}

export function mountStudentAuthAndEmailModule(app: express.Express, deps: MountDeps) {
  const dataDir = path.resolve(deps.baseDir, 'server-data');
  const accountsFile = path.resolve(dataDir, 'student-credentials.json');
  const emailLogsFile = path.resolve(dataDir, 'email-logs.json');

  function ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  function loadAccounts(): StoredStudentAccount[] {
    try {
      if (!fs.existsSync(accountsFile)) return [];
      const raw = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
      return Array.isArray(raw) ? (raw as StoredStudentAccount[]) : [];
    } catch {
      return [];
    }
  }

  function saveAccounts(list: StoredStudentAccount[]) {
    ensureDataDir();
    fs.writeFileSync(accountsFile, JSON.stringify(list, null, 2), { mode: 0o600 });
  }

  function loadEmailLogs(): StoredEmailLog[] {
    try {
      if (!fs.existsSync(emailLogsFile)) return [];
      const raw = JSON.parse(fs.readFileSync(emailLogsFile, 'utf8'));
      return Array.isArray(raw) ? (raw as StoredEmailLog[]) : [];
    } catch {
      return [];
    }
  }

  function saveEmailLogs(list: StoredEmailLog[]) {
    ensureDataDir();
    // Keep latest 1000 logs on disk
    fs.writeFileSync(emailLogsFile, JSON.stringify(list.slice(0, 1000), null, 2), { mode: 0o600 });
  }

  // Dedicated auth rate limiter (15 attempts / min / IP)
  const loginRateMap = new Map<string, { count: number; resetAt: number }>();
  function studentAuthRateLimit(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rec = loginRateMap.get(ip);
    if (!rec || now > rec.resetAt) {
      loginRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (rec.count >= 25) {
      return res.status(429).json({
        error: 'Too many authentication attempts. Please wait a minute and try again.',
      });
    }
    rec.count += 1;
    return next();
  }

  function signStudentToken(payload: Omit<VerifiedStudentSession, 'exp'>, ttlSeconds: number): string {
    const full: VerifiedStudentSession = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', deps.signingSecret)
      .update(`student_jwt:${encoded}`)
      .digest('hex');
    return `st_${encoded}.${sig}`;
  }

  function verifyStudentToken(token: string): VerifiedStudentSession | null {
    if (!token || !token.startsWith('st_')) return null;
    const body = token.slice(3);
    const dot = body.indexOf('.');
    if (dot <= 0) return null;
    const encoded = body.slice(0, dot);
    const sig = body.slice(dot + 1);
    const expected = crypto
      .createHmac('sha256', deps.signingSecret)
      .update(`student_jwt:${encoded}`)
      .digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8')
      ) as VerifiedStudentSession;
      if (!parsed.accountId || !parsed.studentId || !parsed.exp) return null;
      if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function extractStudentSession(
    req: express.Request,
    allowedScopes: Array<'student_session' | 'password_change_only'> = ['student_session']
  ): VerifiedStudentSession | null {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer st_')) return null;
    const session = verifyStudentToken(authHeader.slice(7).trim());
    if (!session || !allowedScopes.includes(session.scope)) return null;
    // Verify account is still active / not suspended
    const accounts = loadAccounts();
    const acc = accounts.find((a) => a.id === session.accountId);
    if (!acc || acc.status === 'Suspended') return null;
    return session;
  }

  function getEmailProviderInfo() {
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    const smtpHost = (process.env.SMTP_HOST || '').trim();
    const smtpUser = (process.env.SMTP_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || '').trim();
    const fromAddr = (process.env.EMAIL_FROM || `TECHMAN COLLEGE <${COLLEGE_EMAIL}>`).trim();

    if (resendKey.length > 8) {
      return { provider: 'resend' as const, configured: true, from: fromAddr };
    }
    if (smtpHost && smtpUser && smtpPass) {
      return {
        provider: 'smtp' as const,
        configured: true,
        from: fromAddr,
        smtpHost,
        smtpPort: Number(process.env.SMTP_PORT) || 587,
        smtpUser,
        smtpPass,
      };
    }
    return { provider: 'sandbox_outbox' as const, configured: false, from: fromAddr };
  }

  function getPublicAppUrl(req: express.Request): string {
    const envUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (envUrl && /^https?:\/\//i.test(envUrl) && !envUrl.includes('MY_APP_URL')) {
      return envUrl;
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
  }

  async function deliverEmailNow(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{
    provider: 'resend' | 'smtp' | 'sandbox_outbox';
    status: 'sent' | 'failed' | 'queued_configure_provider';
    errorMessage?: string;
  }> {
    const cfg = getEmailProviderInfo();
    if (cfg.provider === 'resend') {
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(process.env.RESEND_API_KEY || '').trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cfg.from,
            to: [params.to],
            subject: params.subject,
            html: params.html,
            text: params.text,
          }),
        });
        if (!resp.ok) {
          const errText = (await resp.text()).slice(0, 300);
          return { provider: 'resend', status: 'failed', errorMessage: `Resend HTTP ${resp.status}: ${errText}` };
        }
        return { provider: 'resend', status: 'sent' };
      } catch (err) {
        return {
          provider: 'resend',
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Resend delivery failed.',
        };
      }
    }

    if (cfg.provider === 'smtp') {
      try {
        const transporter = nodemailer.createTransport({
          host: cfg.smtpHost,
          port: cfg.smtpPort,
          secure: cfg.smtpPort === 465,
          auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
        });
        await transporter.sendMail({
          from: cfg.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });
        return { provider: 'smtp', status: 'sent' };
      } catch (err) {
        return {
          provider: 'smtp',
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'SMTP delivery failed.',
        };
      }
    }

    return {
      provider: 'sandbox_outbox',
      status: 'queued_configure_provider',
      errorMessage:
        'External email provider (RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS) is not yet configured in server secrets. Logged in Delivery Outbox for resend once configured.',
    };
  }

  function buildStudentCredentialsEmail(opts: {
    kind: 'created' | 'reset';
    studentName: string;
    studentId: string;
    username: string;
    loginUrl: string;
    activationUrl: string;
    tempPassword: string;
    courseName?: string;
    batchName?: string;
  }) {
    const isReset = opts.kind === 'reset';
    const subject = isReset
      ? `TECHMAN COLLEGE — Password Reset & Temporary Login Credentials (${opts.studentId})`
      : `Welcome to TECHMAN COLLEGE — Your Student LMS Login Credentials (${opts.studentId})`;

    const safeName = escapeHtml(opts.studentName);
    const safeId = escapeHtml(opts.studentId);
    const safeUser = escapeHtml(opts.username);
    const safeCourse = escapeHtml(opts.courseName || 'TECHMAN COLLEGE 2027 Intake');
    const safeBatch = escapeHtml(opts.batchName || '2027 Intake');
    const safeLogin = escapeHtml(opts.loginUrl);
    const safeAct = escapeHtml(opts.activationUrl);
    const safeTemp = escapeHtml(opts.tempPassword);

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:#101D35;color:#ffffff;padding:24px 28px;">
          <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#38BDF8;font-weight:700;">TECHMAN COLLEGE · ESTABLISHED 2021</div>
          <h1 style="margin:8px 0 0;font-size:20px;line-height:1.3;">${isReset ? 'Student Account Password Reset' : 'Your Student LMS Account Is Ready'}</h1>
        </div>
        <div style="padding:26px 28px;color:#0F172A;font-size:14px;line-height:1.6;">
          <p>Dear <strong>${safeName}</strong>,</p>
          <p>${
            isReset
              ? 'An authorized TECHMAN COLLEGE administrator has initiated a password reset for your Student Portal account. Please use the temporary credentials or one-time activation link below to set a new personal password.'
              : 'Your official TECHMAN COLLEGE LMS Student Account has been created. Use the details below to sign in and activate your learning portal.'
          }</p>
          <div style="background:#F8FAFC;border:1px solid #CBD5E1;border-radius:12px;padding:16px 18px;margin:18px 0;">
            <p style="margin:4px 0;"><strong>Student Name:</strong> ${safeName}</p>
            <p style="margin:4px 0;"><strong>Student ID:</strong> <code style="font-weight:700;color:#1677FF;">${safeId}</code></p>
            <p style="margin:4px 0;"><strong>Username:</strong> <code>${safeUser}</code></p>
            <p style="margin:4px 0;"><strong>Programme / Batch:</strong> ${safeCourse} (${safeBatch})</p>
            <p style="margin:4px 0;"><strong>Temporary Password (One-Time):</strong> <code style="font-weight:700;background:#E2E8F0;padding:2px 6px;border-radius:4px;">${safeTemp}</code></p>
            <p style="margin:4px 0;"><strong>Login URL:</strong> <a href="${safeLogin}" style="color:#1677FF;">${safeLogin}</a></p>
          </div>
          <p style="margin:18px 0;">
            <a href="${safeAct}" style="display:inline-block;background:#1677FF;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">Activate Account &amp; Set New Password</a>
          </p>
          <h3 style="margin:18px 0 6px;font-size:14px;color:#101D35;">First-Login Instructions</h3>
          <ol style="margin:0;padding-left:18px;color:#334155;">
            <li>Open the Student Login page at <a href="${safeLogin}">${safeLogin}</a> (or click the one-time activation button above, valid for 48 hours).</li>
            <li>Enter your <strong>Student ID</strong> (<code>${safeId}</code>) or <strong>Username</strong> and your temporary password.</li>
            <li>You will immediately be required to create a strong personal password (at least 8 characters with uppercase, lowercase, and a number).</li>
            <li>Once saved, you will be redirected directly to your TECHMAN COLLEGE Student Dashboard.</li>
          </ol>
          <p style="margin-top:20px;font-size:12px;color:#64748B;">For security, never share your password with anyone. TECHMAN COLLEGE staff will never ask for your permanent password.</p>
        </div>
        <div style="background:#F1F5F9;padding:16px 28px;font-size:12px;color:#475569;border-top:1px solid #E2E8F0;">
          <strong>TECHMAN COLLEGE</strong> · Sri Lanka · Phone / WhatsApp: ${COLLEGE_PHONE} · Website: <a href="${COLLEGE_WEBSITE}" style="color:#1677FF;">${COLLEGE_WEBSITE}</a> · Email: ${COLLEGE_EMAIL}
        </div>
      </div>
    `;

    const text = [
      `TECHMAN COLLEGE — ${isReset ? 'Password Reset' : 'Student Login Credentials'}`,
      `Dear ${opts.studentName},`,
      `Student ID: ${opts.studentId}`,
      `Username: ${opts.username}`,
      `Programme: ${opts.courseName || '2027 Intake'} (${opts.batchName || '2027 Intake'})`,
      `Login URL: ${opts.loginUrl}`,
      `Temporary Password (One-Time): ${opts.tempPassword}`,
      `One-Time Activation Link (valid 48h): ${opts.activationUrl}`,
      ``,
      `First-Login Instructions:`,
      `1. Open ${opts.loginUrl} and enter your Student ID (${opts.studentId}) or Username and temporary password.`,
      `2. Create your new personal password when prompted.`,
      `3. Access your Student Dashboard, published course syllabuses, and AI Tutor.`,
      ``,
      `TECHMAN COLLEGE Contact: ${COLLEGE_PHONE} | ${COLLEGE_WEBSITE} | ${COLLEGE_EMAIL}`,
    ].join('\n');

    const redactedPreview = [
      `To: ${opts.studentName} (${opts.studentId} / ${opts.username})`,
      `Login URL: ${opts.loginUrl}`,
      `Temporary Password: [REDACTED ONE-TIME CREDENTIAL]`,
      `Activation Link: [REDACTED ONE-TIME LINK]`,
      `First-login password change enforced · Contact: ${COLLEGE_PHONE}`,
    ].join(' · ');

    return { subject, html, text, redactedPreview };
  }

  async function recordAndSendEmail(params: {
    emailType: EmailNotificationType;
    recipientEmail: string;
    recipientName?: string;
    studentId?: string;
    courseId?: string;
    subject: string;
    html: string;
    text: string;
    redactedPreview: string;
    storeResendBody: boolean;
    sentByUid: string;
    sentByEmail: string;
  }): Promise<StoredEmailLog> {
    const now = new Date().toISOString();
    const delivery = await deliverEmailNow({
      to: params.recipientEmail,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    const log: StoredEmailLog = {
      id: `EML_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      emailType: params.emailType,
      recipientEmail: params.recipientEmail,
      recipientName: params.recipientName,
      studentId: params.studentId,
      courseId: params.courseId,
      subject: params.subject.slice(0, 240),
      bodyPreview: params.redactedPreview.slice(0, 1200),
      resendHtml: params.storeResendBody ? params.html.slice(0, 16000) : undefined,
      resendText: params.storeResendBody ? params.text.slice(0, 8000) : undefined,
      provider: delivery.provider,
      status: delivery.status,
      errorMessage: delivery.errorMessage,
      retryCount: 0,
      sentByUid: params.sentByUid,
      sentByEmail: params.sentByEmail,
      institutionId: INSTITUTION_ID,
      sentAt: delivery.status === 'sent' ? now : undefined,
      createdAt: now,
    };
    const logs = loadEmailLogs();
    logs.unshift(log);
    saveEmailLogs(logs);
    return log;
  }

  function generateNextUniqueStudentId(existing: StoredStudentAccount[], prefix = 'TM27'): string {
    const used = new Set(existing.map((a) => a.studentId.toUpperCase()));
    let maxNum = 1000;
    for (const acc of existing) {
      const m = acc.studentId.match(/(\d{4,6})$/);
      if (m) {
        const n = Number(m[1]);
        if (n > maxNum) maxNum = n;
      }
    }
    let candidateNum = maxNum + 1;
    let candidate = `${prefix}-${candidateNum}`;
    while (used.has(candidate.toUpperCase())) {
      candidateNum += 1;
      candidate = `${prefix}-${candidateNum}`;
    }
    return candidate;
  }

  function generateUniqueUsername(
    fullName: string,
    studentId: string,
    existing: StoredStudentAccount[]
  ): string {
    const used = new Set(existing.map((a) => a.username.toLowerCase()));
    const slug =
      fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 22) || 'student';
    const suffix = studentId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(-4) || '2027';
    let candidate = `${slug}.${suffix}`;
    let i = 1;
    while (used.has(candidate)) {
      candidate = `${slug}.${suffix}${i}`;
      i += 1;
    }
    return candidate;
  }

  // =========================================================================
  // ADMIN STUDENT ACCOUNT MANAGEMENT ROUTES (SUPER ADMIN / ADMIN ONLY)
  // =========================================================================

  app.get('/api/student-accounts', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, ['SUPER_ADMIN', 'ADMIN']);
    if (!staff) return;
    const accounts = loadAccounts();
    const providerInfo = getEmailProviderInfo();
    return res.json({
      accounts: accounts.map(sanitizeAccountForClient),
      emailProvider: {
        provider: providerInfo.provider,
        configured: providerInfo.configured,
        from: providerInfo.from,
      },
      stats: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter((a) => a.status === 'Active').length,
        invitationsPending: accounts.filter((a) => a.status === 'Invitation Sent').length,
        passwordResetRequests: accounts.filter((a) => a.status === 'Password Reset Required').length,
        suspendedAccounts: accounts.filter((a) => a.status === 'Suspended').length,
      },
    });
  });

  app.post('/api/student-accounts/create', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, ['SUPER_ADMIN', 'ADMIN']);
    if (!staff) return;

    const fullName = sanitizeStr(req.body?.fullName, 140);
    const email = sanitizeStr(req.body?.email, 160).toLowerCase();
    const phone = sanitizeStr(req.body?.phone, 40);
    const courseId = sanitizeStr(req.body?.courseId, 128);
    const courseName = sanitizeStr(req.body?.courseName, 160);
    const batchName = sanitizeStr(req.body?.batchName, 120) || '2027 Intake — Batch 01';
    const branchId = sanitizeStr(req.body?.branchId, 64) || 'branch-colombo-hq';
    const linkedUserUid = sanitizeStr(req.body?.linkedUserUid, 128);
    const linkedMigratedId = sanitizeStr(req.body?.linkedMigratedId, 128);
    const rawStudentId = sanitizeStr(req.body?.studentId, 40);
    const rawUsername = sanitizeStr(req.body?.username, 80);

    if (!fullName || !email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid student full name and email address are required.' });
    }

    const accounts = loadAccounts();
    const studentId = rawStudentId
      ? normalizeStudentId(rawStudentId)
      : generateNextUniqueStudentId(accounts);

    if (!studentId || studentId.length < 4) {
      return res.status(400).json({ error: 'Student ID must be at least 4 alphanumeric characters (e.g. TM27-1001).' });
    }

    if (accounts.some((a) => a.studentId.toUpperCase() === studentId.toUpperCase())) {
      return res.status(409).json({
        error: `Duplicate Student ID rejected: "${studentId}" is already assigned to another student account.`,
      });
    }
    if (accounts.some((a) => a.email.toLowerCase() === email)) {
      return res.status(409).json({
        error: `Duplicate student account rejected: "${email}" already has an account.`,
      });
    }

    const username = rawUsername
      ? normalizeUsername(rawUsername)
      : generateUniqueUsername(fullName, studentId, accounts);
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 valid characters.' });
    }
    if (accounts.some((a) => a.username.toLowerCase() === username)) {
      return res.status(409).json({
        error: `Duplicate username rejected: "${username}" is already taken.`,
      });
    }

    const tempPassword = generateTemporaryPassword();
    const rawActivationToken = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const accountId = `STACC_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const newAccount: StoredStudentAccount = {
      id: accountId,
      studentId,
      username,
      fullName,
      email,
      phone: phone || undefined,
      courseId: courseId || undefined,
      courseName: courseName || undefined,
      batchName,
      branchId,
      linkedUserUid: linkedUserUid || undefined,
      linkedMigratedId: linkedMigratedId || undefined,
      status: 'Invitation Sent',
      mustChangePassword: true,
      passwordHash: hashPasswordScrypt(tempPassword),
      activationTokenHash: sha256Hex(rawActivationToken),
      activationTokenExpiresAt: expiresAt,
      invitationSentAt: now,
      invitationCount: 1,
      createdByUid: staff.uid,
      createdByEmail: staff.email,
      institutionId: INSTITUTION_ID,
      createdAt: now,
      updatedAt: now,
    };

    accounts.unshift(newAccount);
    saveAccounts(accounts);

    const appBaseUrl = getPublicAppUrl(req);
    const loginUrl = `${appBaseUrl}/student-login`;
    const activationUrl = `${appBaseUrl}/student-login?activate=${encodeURIComponent(rawActivationToken)}`;

    const emailContent = buildStudentCredentialsEmail({
      kind: 'created',
      studentName: fullName,
      studentId,
      username,
      loginUrl,
      activationUrl,
      tempPassword,
      courseName,
      batchName,
    });

    const emailLog = await recordAndSendEmail({
      emailType: 'student_account_created',
      recipientEmail: email,
      recipientName: fullName,
      studentId,
      courseId: courseId || undefined,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      redactedPreview: emailContent.redactedPreview,
      storeResendBody: false, // NEVER persist temporary password HTML in logs!
      sentByUid: staff.uid,
      sentByEmail: staff.email,
    });

    return res.status(201).json({
      account: sanitizeAccountForClient(newAccount),
      emailLog: sanitizeEmailLogForClient(emailLog),
      // One-time setup handoff (never persisted or retrievable again after this response)
      oneTimeCredentialsPreview: {
        studentId,
        username,
        temporaryPassword: tempPassword,
        activationUrl,
        loginUrl,
        note:
          emailLog.status === 'sent'
            ? 'Credentials email sent to the student. Copy now if needed — this temporary password cannot be retrieved later.'
            : 'Email logged in Delivery Outbox (configure RESEND_API_KEY or SMTP secrets for live inbox delivery). Share this one-time temporary password or activation link securely now; it cannot be retrieved later.',
      },
    });
  });

  app.post('/api/student-accounts/bulk-create', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, ['SUPER_ADMIN', 'ADMIN']);
    if (!staff) return;

    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 250) : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Provide at least one student row for bulk account creation.' });
    }

    const accounts = loadAccounts();
    const appBaseUrl = getPublicAppUrl(req);
    const loginUrl = `${appBaseUrl}/student-login`;
    const created: Array<{
      rowNumber: number;
      account: SanitizedStudentAccount;
      emailStatus: string;
    }> = [];
    const skipped: Array<{ rowNumber: number; studentId?: string; email?: string; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const rowNumber = Number(row.rowNumber) || i + 2;
      const fullName = sanitizeStr(row.fullName, 140);
      const email = sanitizeStr(row.email, 160).toLowerCase();
      const phone = sanitizeStr(row.phone, 40);
      const courseId = sanitizeStr(row.courseId, 128);
      const courseName = sanitizeStr(row.courseName, 160);
      const batchName = sanitizeStr(row.batchName, 120) || '2027 Intake — Batch 01';
      const branchId = sanitizeStr(row.branchId, 64) || 'branch-colombo-hq';
      const rawSid = sanitizeStr(row.studentId, 40);

      if (!fullName || !email || !isValidEmail(email)) {
        skipped.push({ rowNumber, studentId: rawSid, email, reason: 'Missing valid full name or email address.' });
        continue;
      }

      const studentId = rawSid ? normalizeStudentId(rawSid) : generateNextUniqueStudentId(accounts);
      if (accounts.some((a) => a.studentId.toUpperCase() === studentId.toUpperCase())) {
        skipped.push({ rowNumber, studentId, email, reason: `Duplicate Student ID (${studentId}).` });
        continue;
      }
      if (accounts.some((a) => a.email.toLowerCase() === email)) {
        skipped.push({ rowNumber, studentId, email, reason: `Duplicate Email (${email}).` });
        continue;
      }

      const username = generateUniqueUsername(fullName, studentId, accounts);
      const tempPassword = generateTemporaryPassword();
      const rawActivationToken = crypto.randomBytes(24).toString('hex');
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const accountId = `STACC_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

      const acc: StoredStudentAccount = {
        id: accountId,
        studentId,
        username,
        fullName,
        email,
        phone: phone || undefined,
        courseId: courseId || undefined,
        courseName: courseName || undefined,
        batchName,
        branchId,
        status: 'Invitation Sent',
        mustChangePassword: true,
        passwordHash: hashPasswordScrypt(tempPassword),
        activationTokenHash: sha256Hex(rawActivationToken),
        activationTokenExpiresAt: expiresAt,
        invitationSentAt: now,
        invitationCount: 1,
        createdByUid: staff.uid,
        createdByEmail: staff.email,
        institutionId: INSTITUTION_ID,
        createdAt: now,
        updatedAt: now,
      };
      accounts.unshift(acc);

      const activationUrl = `${appBaseUrl}/student-login?activate=${encodeURIComponent(rawActivationToken)}`;
      const emailContent = buildStudentCredentialsEmail({
        kind: 'created',
        studentName: fullName,
        studentId,
        username,
        loginUrl,
        activationUrl,
        tempPassword,
        courseName,
        batchName,
      });
      const emailLog = await recordAndSendEmail({
        emailType: 'student_account_created',
        recipientEmail: email,
        recipientName: fullName,
        studentId,
        courseId: courseId || undefined,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        redactedPreview: emailContent.redactedPreview,
        storeResendBody: false,
        sentByUid: staff.uid,
        sentByEmail: staff.email,
      });

      created.push({
        rowNumber,
        account: sanitizeAccountForClient(acc),
        emailStatus: emailLog.status,
      });
    }

    saveAccounts(accounts);

    return res.json({
      totalProcessed: rows.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  });

  app.patch('/api/student-accounts/:accountId', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, ['SUPER_ADMIN', 'ADMIN']);
    if (!staff) return;

    const accountId = sanitizeStr(req.params.accountId, 128);
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.id === accountId);
    if (idx < 0) return res.status(404).json({ error: 'Student account not found.' });

    const target = accounts[idx];
    if (typeof req.body?.studentId === 'string' && req.body.studentId.trim()) {
      const nextSid = normalizeStudentId(req.body.studentId);
      if (nextSid.length < 4) {
        return res.status(400).json({ error: 'Student ID must be at least 4 alphanumeric characters.' });
      }
      if (
        accounts.some(
          (a) => a.id !== target.id && a.studentId.toUpperCase() === nextSid.toUpperCase()
        )
      ) {
        return res.status(409).json({
          error: `Duplicate Student ID rejected: "${nextSid}" is already assigned to another student.`,
        });
      }
      target.studentId = nextSid;
    }

    if (typeof req.body?.fullName === 'string' && req.body.fullName.trim()) {
      target.fullName = sanitizeStr(req.body.fullName, 140);
    }
    if (typeof req.body?.courseId === 'string') {
      target.courseId = sanitizeStr(req.body.courseId, 128) || undefined;
    }
    if (typeof req.body?.courseName === 'string') {
      target.courseName = sanitizeStr(req.body.courseName, 160) || undefined;
    }
    if (typeof req.body?.batchName === 'string') {
      target.batchName = sanitizeStr(req.body.batchName, 120) || undefined;
    }
    if (typeof req.body?.branchId === 'string') {
      target.branchId = sanitizeStr(req.body.branchId, 64) || undefined;
    }
    if (typeof req.body?.status === 'string') {
      const allowed: StudentAccountStatus[] = ['Active', 'Suspended', 'Invitation Sent', 'Password Reset Required'];
      if (!allowed.includes(req.body.status as StudentAccountStatus)) {
        return res.status(400).json({ error: 'Invalid account status.' });
      }
      target.status = req.body.status as StudentAccountStatus;
    }

    target.updatedAt = new Date().toISOString();
    accounts[idx] = target;
    saveAccounts(accounts);

    return res.json({ account: sanitizeAccountForClient(target) });
  });

  app.post('/api/student-accounts/:accountId/reset-password', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, ['SUPER_ADMIN', 'ADMIN']);
    if (!staff) return;

    const accountId = sanitizeStr(req.params.accountId, 128);
    const mode = req.body?.mode === 'resend_invite' ? 'resend_invite' : 'reset';
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.id === accountId);
    if (idx < 0) return res.status(404).json({ error: 'Student account not found.' });

    const target = accounts[idx];
    const tempPassword = generateTemporaryPassword();
    const rawActivationToken = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    target.passwordHash = hashPasswordScrypt(tempPassword);
    target.activationTokenHash = sha256Hex(rawActivationToken);
    target.activationTokenExpiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    target.mustChangePassword = true;
    target.status = mode === 'resend_invite' ? 'Invitation Sent' : 'Password Reset Required';
    target.invitationSentAt = now;
    target.invitationCount = (target.invitationCount || 0) + 1;
    target.updatedAt = now;
    accounts[idx] = target;
    saveAccounts(accounts);

    const appBaseUrl = getPublicAppUrl(req);
    const loginUrl = `${appBaseUrl}/student-login`;
    const activationUrl = `${appBaseUrl}/student-login?activate=${encodeURIComponent(rawActivationToken)}`;

    const emailContent = buildStudentCredentialsEmail({
      kind: mode === 'resend_invite' ? 'created' : 'reset',
      studentName: target.fullName,
      studentId: target.studentId,
      username: target.username,
      loginUrl,
      activationUrl,
      tempPassword,
      courseName: target.courseName,
      batchName: target.batchName,
    });

    const emailLog = await recordAndSendEmail({
      emailType: mode === 'resend_invite' ? 'login_credentials' : 'password_reset',
      recipientEmail: target.email,
      recipientName: target.fullName,
      studentId: target.studentId,
      courseId: target.courseId,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      redactedPreview: emailContent.redactedPreview,
      storeResendBody: false,
      sentByUid: staff.uid,
      sentByEmail: staff.email,
    });

    return res.json({
      account: sanitizeAccountForClient(target),
      emailLog: sanitizeEmailLogForClient(emailLog),
      oneTimeCredentialsPreview: {
        studentId: target.studentId,
        username: target.username,
        temporaryPassword: tempPassword,
        activationUrl,
        loginUrl,
        note: 'One-time reset credentials generated. Copy now if needed — passwords are never stored in plaintext or retrievable later.',
      },
    });
  });

  // =========================================================================
  // STUDENT CREDENTIAL AUTHENTICATION & MANDATORY FIRST-LOGIN PASSWORD SETUP
  // =========================================================================

  app.post('/api/student-auth/login', studentAuthRateLimit, (req, res) => {
    const identifier = sanitizeStr(req.body?.identifier, 160);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Student ID / Username and password are required.' });
    }

    const accounts = loadAccounts();
    const normUpper = identifier.toUpperCase();
    const normLower = identifier.toLowerCase();
    const idx = accounts.findIndex(
      (a) =>
        a.studentId.toUpperCase() === normUpper ||
        a.username.toLowerCase() === normLower ||
        a.email.toLowerCase() === normLower
    );

    if (idx < 0 || !verifyPasswordScrypt(password, accounts[idx].passwordHash)) {
      return res.status(401).json({ error: 'Invalid Student ID / Username or password.' });
    }

    const acc = accounts[idx];
    if (acc.status === 'Suspended') {
      return res.status(403).json({
        error: 'This student account is currently suspended. Please contact TECHMAN COLLEGE Administration.',
      });
    }

    if (acc.mustChangePassword) {
      const passwordChangeToken = signStudentToken(
        {
          uid: acc.linkedUserUid || `stuid_${acc.id}`,
          accountId: acc.id,
          studentId: acc.studentId,
          username: acc.username,
          email: acc.email,
          fullName: acc.fullName,
          scope: 'password_change_only',
        },
        15 * 60 // 15 minutes to set permanent password
      );
      return res.json({
        requiresPasswordChange: true,
        passwordChangeToken,
        student: sanitizeAccountForClient(acc),
        message: 'First login or password reset detected. You must create a new personal password before entering the Student Dashboard.',
      });
    }

    const now = new Date().toISOString();
    acc.lastLoginAt = now;
    acc.updatedAt = now;
    accounts[idx] = acc;
    saveAccounts(accounts);

    const sessionToken = signStudentToken(
      {
        uid: acc.linkedUserUid || `stuid_${acc.id}`,
        accountId: acc.id,
        studentId: acc.studentId,
        username: acc.username,
        email: acc.email,
        fullName: acc.fullName,
        scope: 'student_session',
      },
      8 * 3600 // 8 hour session
    );

    return res.json({
      requiresPasswordChange: false,
      sessionToken,
      student: sanitizeAccountForClient(acc),
    });
  });

  app.post('/api/student-auth/change-password', studentAuthRateLimit, (req, res) => {
    const session = extractStudentSession(req, ['password_change_only', 'student_session']);
    if (!session) {
      return res.status(401).json({ error: 'Valid student authentication session is required to change your password.' });
    }

    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const strengthErr = validateNewPasswordStrength(newPassword);
    if (strengthErr) {
      return res.status(400).json({ error: strengthErr });
    }

    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.id === session.accountId);
    if (idx < 0) return res.status(404).json({ error: 'Student account not found.' });

    const acc = accounts[idx];
    if (verifyPasswordScrypt(newPassword, acc.passwordHash)) {
      return res.status(400).json({
        error: 'Your new password must be different from your temporary or previous password.',
      });
    }

    const now = new Date().toISOString();
    acc.passwordHash = hashPasswordScrypt(newPassword);
    acc.mustChangePassword = false;
    acc.status = 'Active';
    acc.activationTokenHash = undefined;
    acc.activationTokenExpiresAt = undefined;
    acc.passwordUpdatedAt = now;
    acc.lastLoginAt = now;
    acc.updatedAt = now;
    accounts[idx] = acc;
    saveAccounts(accounts);

    const sessionToken = signStudentToken(
      {
        uid: acc.linkedUserUid || `stuid_${acc.id}`,
        accountId: acc.id,
        studentId: acc.studentId,
        username: acc.username,
        email: acc.email,
        fullName: acc.fullName,
        scope: 'student_session',
      },
      8 * 3600
    );

    return res.json({
      activated: true,
      sessionToken,
      student: sanitizeAccountForClient(acc),
      message: 'Password updated securely. Redirecting to your Student Dashboard.',
    });
  });

  app.post('/api/student-auth/activate', studentAuthRateLimit, (req, res) => {
    const token = sanitizeStr(req.body?.activationToken, 128);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!token || token.length < 24) {
      return res.status(400).json({ error: 'Invalid or missing activation token.' });
    }
    const strengthErr = validateNewPasswordStrength(newPassword);
    if (strengthErr) {
      return res.status(400).json({ error: strengthErr });
    }

    const tokenHash = sha256Hex(token);
    const accounts = loadAccounts();
    const idx = accounts.findIndex(
      (a) => a.activationTokenHash && a.activationTokenHash === tokenHash
    );
    if (idx < 0) {
      return res.status(401).json({ error: 'This activation link is invalid or has already been used.' });
    }

    const acc = accounts[idx];
    if (acc.status === 'Suspended') {
      return res.status(403).json({ error: 'This student account is suspended.' });
    }
    if (acc.activationTokenExpiresAt && Date.now() > Date.parse(acc.activationTokenExpiresAt)) {
      return res.status(401).json({ error: 'This activation link has expired. Ask an administrator to resend your invitation.' });
    }

    const now = new Date().toISOString();
    acc.passwordHash = hashPasswordScrypt(newPassword);
    acc.mustChangePassword = false;
    acc.status = 'Active';
    acc.activationTokenHash = undefined;
    acc.activationTokenExpiresAt = undefined;
    acc.passwordUpdatedAt = now;
    acc.lastLoginAt = now;
    acc.updatedAt = now;
    accounts[idx] = acc;
    saveAccounts(accounts);

    const sessionToken = signStudentToken(
      {
        uid: acc.linkedUserUid || `stuid_${acc.id}`,
        accountId: acc.id,
        studentId: acc.studentId,
        username: acc.username,
        email: acc.email,
        fullName: acc.fullName,
        scope: 'student_session',
      },
      8 * 3600
    );

    return res.json({
      activated: true,
      sessionToken,
      student: sanitizeAccountForClient(acc),
      message: 'Account activated successfully. Redirecting to your Student Dashboard.',
    });
  });

  app.get('/api/student-auth/me', (req, res) => {
    const session = extractStudentSession(req, ['student_session']);
    if (!session) {
      return res.status(401).json({ error: 'Student session expired or invalid.' });
    }
    const acc = loadAccounts().find((a) => a.id === session.accountId);
    if (!acc) return res.status(404).json({ error: 'Student account not found.' });
    return res.json({ student: sanitizeAccountForClient(acc) });
  });

  // Scoped Student Workspace Data (ONLY published courses & latest published syllabus for the student's enrolled course!)
  app.get('/api/student-auth/workspace', async (req, res) => {
    const session = extractStudentSession(req, ['student_session']);
    if (!session) {
      return res.status(401).json({ error: 'Valid student session required.' });
    }
    const acc = loadAccounts().find((a) => a.id === session.accountId);
    if (!acc) return res.status(404).json({ error: 'Student account not found.' });

    const projectId = deps.firebaseConfig?.projectId;
    const databaseId = deps.firebaseConfig?.firestoreDatabaseId || '(default)';
    const apiKey = deps.firebaseConfig?.apiKey;

    async function queryPublishedCollection(collectionId: string, fieldPath: string, value: string) {
      if (!projectId || !apiKey) return [];
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:runQuery?key=${encodeURIComponent(apiKey)}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId }],
              where: {
                fieldFilter: {
                  field: { fieldPath },
                  op: 'EQUAL',
                  value: { stringValue: value },
                },
              },
              limit: 200,
            },
          }),
        });
        if (!r.ok) return [];
        const rows = (await r.json()) as Array<{ document?: { name: string; fields?: Record<string, Record<string, unknown>> } }>;
        return rows
          .filter((item) => item.document)
          .map((item) => {
            const docObj = item.document!;
            const id = docObj.name.split('/').pop() || '';
            const out: Record<string, unknown> = { id };
            if (docObj.fields) {
              for (const [k, v] of Object.entries(docObj.fields)) {
                out[k] = decodeFirestoreField(v);
              }
            }
            return out;
          });
      } catch {
        return [];
      }
    }

    const [publishedCourses, publishedSyllabuses, publishedVersions] = await Promise.all([
      queryPublishedCollection('courses', 'status', 'published'),
      queryPublishedCollection('syllabuses', 'publishedStatus', 'published'),
      queryPublishedCollection('syllabusVersions', 'status', 'Published'),
    ]);

    // Strictly scope syllabuses & versions to the student's enrolled course AND only the LATEST published version!
    const enrolledCourseIds = new Set(acc.courseId ? [acc.courseId] : []);
    const scopedSyllabuses = publishedSyllabuses.filter(
      (s) => enrolledCourseIds.size === 0 || enrolledCourseIds.has(String(s.courseId || ''))
    );

    const latestPublishedVersionsByCourse = new Map<string, Record<string, unknown>>();
    for (const v of publishedVersions) {
      const cid = String(v.courseId || '');
      if (enrolledCourseIds.size > 0 && !enrolledCourseIds.has(cid)) continue;
      const existing = latestPublishedVersionsByCourse.get(cid);
      if (!existing || Number(v.versionNumber || 0) > Number(existing.versionNumber || 0)) {
        latestPublishedVersionsByCourse.set(cid, v);
      }
    }

    const enrollments = acc.courseId
      ? [
          {
            id: `enr_${acc.id}`,
            userId: session.uid,
            studentId: acc.studentId,
            studentName: acc.fullName,
            courseId: acc.courseId,
            courseName: acc.courseName || 'Enrolled Programme',
            batchName: acc.batchName || '2027 Intake',
            branchId: acc.branchId || 'branch-colombo-hq',
            status: 'Active',
            progressPercent: 0,
            enrolledAt: acc.createdAt,
          },
        ]
      : [];

    return res.json({
      student: sanitizeAccountForClient(acc),
      courses: publishedCourses,
      enrollments,
      syllabuses: scopedSyllabuses,
      syllabusVersions: Array.from(latestPublishedVersionsByCourse.values()),
    });
  });

  // =========================================================================
  // TRANSACTIONAL EMAIL NOTIFICATION SERVICE & DELIVERY LOGS
  // =========================================================================

  app.get('/api/emails/logs', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, [
      'SUPER_ADMIN',
      'ADMIN',
      'ACADEMIC_MANAGER',
      'ADMISSION_OFFICER',
    ]);
    if (!staff) return;
    const providerInfo = getEmailProviderInfo();
    const logs = loadEmailLogs();
    return res.json({
      provider: {
        provider: providerInfo.provider,
        configured: providerInfo.configured,
        from: providerInfo.from,
      },
      logs: logs.map(sanitizeEmailLogForClient),
    });
  });

  app.post('/api/emails/send', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, [
      'SUPER_ADMIN',
      'ADMIN',
      'ACADEMIC_MANAGER',
      'ADMISSION_OFFICER',
    ]);
    if (!staff) return;

    const emailType = sanitizeStr(req.body?.emailType, 40) as EmailNotificationType;
    const allowedTypes: EmailNotificationType[] = [
      'admission_confirmation',
      'syllabus_updated',
      'academic_announcement',
      'login_credentials',
    ];
    if (!allowedTypes.includes(emailType)) {
      return res.status(400).json({ error: 'Unsupported email notification type.' });
    }

    const recipients: Array<{ email: string; name?: string; studentId?: string }> = [];
    if (Array.isArray(req.body?.recipients)) {
      for (const r of req.body.recipients.slice(0, 100)) {
        const em = sanitizeStr(r?.email, 160).toLowerCase();
        if (isValidEmail(em)) {
          recipients.push({
            email: em,
            name: sanitizeStr(r?.name, 140),
            studentId: sanitizeStr(r?.studentId, 40),
          });
        }
      }
    } else if (typeof req.body?.recipientEmail === 'string') {
      const em = sanitizeStr(req.body.recipientEmail, 160).toLowerCase();
      if (isValidEmail(em)) {
        recipients.push({
          email: em,
          name: sanitizeStr(req.body?.recipientName, 140),
          studentId: sanitizeStr(req.body?.studentId, 40),
        });
      }
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'At least one valid recipient email address is required.' });
    }

    const subject = sanitizeStr(req.body?.subject, 240);
    const messageBody = sanitizeStr(req.body?.message, 4000);
    const courseId = sanitizeStr(req.body?.courseId, 128);
    if (!subject || !messageBody) {
      return res.status(400).json({ error: 'Email subject and message body are required.' });
    }

    const appBaseUrl = getPublicAppUrl(req);
    const createdLogs: StoredEmailLog[] = [];

    for (const r of recipients) {
      const safeName = escapeHtml(r.name || 'Student');
      const safeMsg = escapeHtml(messageBody).replace(/\n/g, '<br/>');
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <div style="background:#101D35;color:#ffffff;padding:22px 26px;">
            <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#38BDF8;font-weight:700;">TECHMAN COLLEGE · OFFICIAL NOTIFICATION</div>
            <h1 style="margin:6px 0 0;font-size:19px;">${escapeHtml(subject)}</h1>
          </div>
          <div style="padding:24px 26px;color:#0F172A;font-size:14px;line-height:1.6;">
            <p>Dear <strong>${safeName}</strong>,</p>
            <p>${safeMsg}</p>
            <p style="margin-top:18px;">
              <a href="${escapeHtml(appBaseUrl)}/student-login" style="display:inline-block;background:#1677FF;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;">Open TECHMAN LMS Portal</a>
            </p>
          </div>
          <div style="background:#F1F5F9;padding:14px 26px;font-size:12px;color:#475569;border-top:1px solid #E2E8F0;">
            TECHMAN COLLEGE · ${COLLEGE_PHONE} · ${COLLEGE_WEBSITE} · ${COLLEGE_EMAIL}
          </div>
        </div>
      `;
      const text = `Dear ${r.name || 'Student'},\n\n${messageBody}\n\nPortal: ${appBaseUrl}/student-login\nTECHMAN COLLEGE · ${COLLEGE_PHONE} · ${COLLEGE_WEBSITE}`;

      const log = await recordAndSendEmail({
        emailType,
        recipientEmail: r.email,
        recipientName: r.name,
        studentId: r.studentId,
        courseId: courseId || undefined,
        subject,
        html,
        text,
        redactedPreview: messageBody.slice(0, 450),
        storeResendBody: true,
        sentByUid: staff.uid,
        sentByEmail: staff.email,
      });
      createdLogs.push(log);
    }

    return res.json({
      sentCount: createdLogs.filter((l) => l.status === 'sent').length,
      queuedCount: createdLogs.filter((l) => l.status === 'queued_configure_provider').length,
      failedCount: createdLogs.filter((l) => l.status === 'failed').length,
      logs: createdLogs.map(sanitizeEmailLogForClient),
    });
  });

  app.post('/api/emails/resend/:logId', async (req, res) => {
    const staff = await deps.requireAuthorizedRoles(req, res, ['SUPER_ADMIN', 'ADMIN']);
    if (!staff) return;

    const logId = sanitizeStr(req.params.logId, 128);
    const logs = loadEmailLogs();
    const idx = logs.findIndex((l) => l.id === logId);
    if (idx < 0) return res.status(404).json({ error: 'Email log record not found.' });

    const target = logs[idx];
    if (!target.resendHtml && !target.resendText) {
      return res.status(400).json({
        error:
          'Credential emails cannot be replayed from logs because temporary passwords are never stored. Use "Reset Password / Resend Invite" on the student account to issue fresh one-time credentials.',
      });
    }

    const delivery = await deliverEmailNow({
      to: target.recipientEmail,
      subject: target.subject,
      html: target.resendHtml || `<p>${escapeHtml(target.bodyPreview)}</p>`,
      text: target.resendText || target.bodyPreview,
    });
    const now = new Date().toISOString();
    target.provider = delivery.provider;
    target.status = delivery.status;
    target.errorMessage = delivery.errorMessage;
    target.retryCount = (target.retryCount || 0) + 1;
    if (delivery.status === 'sent') {
      target.sentAt = now;
    }
    logs[idx] = target;
    saveEmailLogs(logs);

    return res.json({ log: sanitizeEmailLogForClient(target) });
  });

  return {
    extractStudentSession,
    getEmailProviderInfo,
  };
}
