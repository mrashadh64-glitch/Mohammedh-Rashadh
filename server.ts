import 'dotenv/config';
import compression from 'compression';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import firebaseClientConfig from './firebase-applet-config.json' with { type: 'json' };
import { mountStudentAuthAndEmailModule } from './server/studentAuthAndEmail.ts';
import { mountGeminiMultimodalSuite } from './server/geminiSuite.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYLLABUS_UPLOAD_DIR = path.resolve(__dirname, 'uploads', 'syllabuses');
const MAX_SYLLABUS_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_SYLLABUS_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

const ALLOWED_SYLLABUS_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

async function verifyFirebaseBearerToken(
  req: express.Request
): Promise<{ uid: string; email: string; token: string } | null> {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const idToken = header.slice(7).trim();
  if (!idToken || idToken.length > 4096) return null;
  const apiKey = firebaseClientConfig?.apiKey;
  if (!apiKey) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const u = data.users?.[0];
    if (!u?.localId || !u.email || u.emailVerified !== true) return null;
    return { uid: u.localId, email: u.email, token: idToken };
  } catch {
    return null;
  }
}

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Simple in-memory rate limiter per IP for AI endpoints
const rateMap = new Map<string, { count: number; resetAt: number }>();
function aiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (entry.count >= 30) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute before sending more AI requests.' });
  }
  entry.count += 1;
  return next();
}

function sanitizeText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: '22mb' }));

  // Production security headers (iframe-safe for AI Studio preview)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(self)');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Never cache private API or AI responses publicly
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Long-term caching for optimized versioned image assets in both dev and production
  app.use('/assets/opt', (_req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  });

  // Shared Authentication, Role Verification & HMAC Helpers
  const SUPER_ADMIN_EMAILS = new Set(['techmanfgoc@gmail.com', 'mrashadh64@gmail.com']);
  const PUBLISH_RECEIPT_SECRET =
    process.env.POSTER_RECEIPT_SECRET || crypto.randomBytes(32).toString('hex');

  function computeSyllabusSig(fileId: string, courseId: string): string {
    return crypto
      .createHmac('sha256', PUBLISH_RECEIPT_SECRET)
      .update(`syllabus:${fileId}:${courseId}`)
      .digest('hex')
      .slice(0, 32);
  }

  function decodeFirestoreValue(val: Record<string, unknown> | undefined): unknown {
    if (!val || typeof val !== 'object') return undefined;
    if ('stringValue' in val) return String(val.stringValue);
    if ('booleanValue' in val) return Boolean(val.booleanValue);
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return Number(val.doubleValue);
    if ('nullValue' in val) return null;
    if ('timestampValue' in val) return String(val.timestampValue);
    if ('arrayValue' in val) {
      const arr = val.arrayValue as { values?: Array<Record<string, unknown>> };
      return Array.isArray(arr?.values) ? arr.values.map((v) => decodeFirestoreValue(v)) : [];
    }
    if ('mapValue' in val) {
      const map = val.mapValue as { fields?: Record<string, Record<string, unknown>> };
      const out: Record<string, unknown> = {};
      if (map?.fields && typeof map.fields === 'object') {
        for (const [k, v] of Object.entries(map.fields)) {
          out[k] = decodeFirestoreValue(v);
        }
      }
      return out;
    }
    return undefined;
  }

  async function fetchAuthoritativeFirestoreDoc(
    collectionName: string,
    docId: string,
    bearerToken: string
  ): Promise<{ exists: boolean; data?: Record<string, unknown>; error?: string }> {
    const projectId = firebaseClientConfig?.projectId;
    const databaseId = firebaseClientConfig?.firestoreDatabaseId || '(default)';
    if (!projectId || !docId || !/^[a-zA-Z0-9_-]{1,128}$/.test(docId)) {
      return { exists: false, error: 'Invalid Firestore document identifier.' };
    }
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`;
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
        },
      });
      if (resp.status === 404) {
        return { exists: false };
      }
      if (!resp.ok) {
        return { exists: false, error: `Firestore lookup returned HTTP ${resp.status}.` };
      }
      const raw = (await resp.json()) as { fields?: Record<string, Record<string, unknown>> };
      const decoded: Record<string, unknown> = { id: docId };
      if (raw.fields && typeof raw.fields === 'object') {
        for (const [k, v] of Object.entries(raw.fields)) {
          decoded[k] = decodeFirestoreValue(v);
        }
      }
      return { exists: true, data: decoded };
    } catch (err) {
      return {
        exists: false,
        error: err instanceof Error ? err.message : 'Unable to reach Firestore.',
      };
    }
  }

  const studentAuthModule = mountStudentAuthAndEmailModule(app, {
    baseDir: __dirname,
    signingSecret: PUBLISH_RECEIPT_SECRET,
    firebaseConfig: firebaseClientConfig,
    requireAuthorizedRoles,
  });

  async function requireVerifiedUser(req: express.Request, res: express.Response) {
    const firebaseUser = await verifyFirebaseBearerToken(req);
    if (firebaseUser) return firebaseUser;
    const studentSess = studentAuthModule.extractStudentSession(req, ['student_session']);
    if (studentSess) {
      return { uid: studentSess.uid, email: studentSess.email, token: '' };
    }
    res.status(401).json({ error: 'Authentication required. Sign in with an authorized account.' });
    return null;
  }

  async function requireSuperAdmin(req: express.Request, res: express.Response) {
    const user = await verifyFirebaseBearerToken(req);
    if (!user) {
      res.status(401).json({ error: 'Super Admin authentication required.' });
      return null;
    }
    if (!SUPER_ADMIN_EMAILS.has(user.email.toLowerCase())) {
      res.status(403).json({
        error: 'Forbidden. Super Admin authorization is strictly required for this action.',
      });
      return null;
    }
    return user;
  }

  async function requireAuthorizedRoles(
    req: express.Request,
    res: express.Response,
    allowedRoles: string[]
  ) {
    const user = await verifyFirebaseBearerToken(req);
    if (!user) {
      res.status(401).json({ error: 'Staff authentication required.' });
      return null;
    }
    if (SUPER_ADMIN_EMAILS.has(user.email.toLowerCase())) {
      return user;
    }
    const profileLookup = await fetchAuthoritativeFirestoreDoc('users', user.uid, user.token);
    const userRole = String(profileLookup.data?.role || '');
    const accountStatus = String(profileLookup.data?.accountStatus || 'active');
    if (profileLookup.exists && accountStatus !== 'suspended' && allowedRoles.includes(userRole)) {
      return user;
    }
    if (allowedRoles.includes('ADMIN') || allowedRoles.includes('SUPER_ADMIN')) {
      const adminLookup = await fetchAuthoritativeFirestoreDoc('admins', user.uid, user.token);
      if (adminLookup.exists && adminLookup.data?.active !== false) {
        return user;
      }
    }
    res.status(403).json({
      error: 'Forbidden. Your account role is not authorized to perform this action.',
    });
    return null;
  }

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'TECHMAN COLLEGE ONLINE',
      college: 'TECHMAN COLLEGE',
      domain: 'https://techmancollege.online',
      establishedYear: 2021,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  });

  // Syllabus Document Upload Fallback (Authenticated Academic Staff/Admin Only, strict MIME/extension/path guards)
  app.post('/api/uploads/syllabus', async (req, res) => {
    try {
      const verifiedUser = await requireAuthorizedRoles(req, res, [
        'SUPER_ADMIN',
        'ADMIN',
        'ACADEMIC_MANAGER',
        'LECTURER',
      ]);
      if (!verifiedUser) return;

      const rawFileName = sanitizeText(req.body?.fileName, 180);
      const mimeType = sanitizeText(req.body?.mimeType, 120).toLowerCase();
      const courseId = sanitizeText(req.body?.courseId, 128).replace(/[^a-zA-Z0-9_-]/g, '');
      const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';

      if (!rawFileName || !base64Data || !courseId) {
        return res.status(400).json({ error: 'fileName, courseId, and base64Data are required.' });
      }

      const ext = path.extname(rawFileName).toLowerCase();
      if (!ALLOWED_SYLLABUS_EXTENSIONS.has(ext) || !ALLOWED_SYLLABUS_MIMES.has(mimeType)) {
        return res.status(400).json({
          error: 'Unsupported file format. Allowed formats: PDF, DOCX, DOC, XLSX, PPTX, PNG, JPG, WEBP.',
        });
      }

      const cleanedB64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(cleanedB64, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_SYLLABUS_BYTES) {
        return res.status(400).json({
          error: 'Invalid file size. Syllabus files must be between 1 byte and 15 MB.',
        });
      }

      fs.mkdirSync(SYLLABUS_UPLOAD_DIR, { recursive: true });
      const fileId = `syl_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
      const safeFileName = rawFileName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
      const filePath = path.resolve(SYLLABUS_UPLOAD_DIR, `${fileId}${ext}`);
      const metaPath = path.resolve(SYLLABUS_UPLOAD_DIR, `${fileId}.json`);

      if (
        !filePath.startsWith(SYLLABUS_UPLOAD_DIR + path.sep) ||
        !metaPath.startsWith(SYLLABUS_UPLOAD_DIR + path.sep)
      ) {
        return res.status(400).json({ error: 'Invalid file path.' });
      }

      fs.writeFileSync(filePath, buffer);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          fileId,
          fileName: safeFileName,
          ext,
          mimeType,
          sizeBytes: buffer.length,
          courseId,
          uploadedByUid: verifiedUser.uid,
          uploadedByEmail: verifiedUser.email,
          createdAt: new Date().toISOString(),
        })
      );

      const downloadSig = computeSyllabusSig(fileId, courseId);

      return res.json({
        fileId,
        fileName: safeFileName,
        mimeType,
        extension: ext.replace('.', ''),
        sizeBytes: buffer.length,
        url: `/api/uploads/syllabus/${fileId}?sig=${downloadSig}`,
        storageProvider: 'server_fallback',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Syllabus upload failed.';
      console.error('[Syllabus Upload Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  app.get('/api/uploads/syllabus/:fileId', async (req, res) => {
    try {
      const fileId = String(req.params.fileId || '');
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(fileId)) {
        return res.status(400).json({ error: 'Invalid syllabus file identifier.' });
      }
      const metaPath = path.resolve(SYLLABUS_UPLOAD_DIR, `${fileId}.json`);
      if (!metaPath.startsWith(SYLLABUS_UPLOAD_DIR + path.sep) || !fs.existsSync(metaPath)) {
        return res.status(404).json({ error: 'Syllabus file not found.' });
      }
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
        fileName: string;
        ext: string;
        mimeType: string;
        courseId?: string;
      };

      // Require either a valid signed syllabus URL or a verified Firebase ID token
      const providedSig = typeof req.query.sig === 'string' ? req.query.sig.trim() : '';
      const expectedSig = computeSyllabusSig(fileId, String(meta.courseId || ''));
      const sigValid =
        providedSig.length === expectedSig.length &&
        crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));
      if (!sigValid) {
        const verifiedUser = await verifyFirebaseBearerToken(req);
        if (!verifiedUser) {
          return res.status(401).json({ error: 'Authorization required to access syllabus document.' });
        }
      }

      if (!ALLOWED_SYLLABUS_EXTENSIONS.has(meta.ext)) {
        return res.status(403).json({ error: 'Disallowed file type.' });
      }
      const filePath = path.resolve(SYLLABUS_UPLOAD_DIR, `${fileId}${meta.ext}`);
      if (!filePath.startsWith(SYLLABUS_UPLOAD_DIR + path.sep) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Syllabus binary not found.' });
      }

      const inline = req.query.inline === '1' && (meta.mimeType === 'application/pdf' || meta.mimeType.startsWith('image/'));
      const disposition = inline ? 'inline' : 'attachment';
      const safeHeaderName = meta.fileName.replace(/["\\\r\n]/g, '_');

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeHeaderName}"`);
      return res.sendFile(filePath);
    } catch {
      return res.status(500).json({ error: 'Unable to retrieve syllabus document.' });
    }
  });

  // 1. TECHMAN AI TUTOR (Verified Users Only; English default + Tamil / Sinhala support)
  app.post('/api/ai/tutor', aiRateLimit, async (req, res) => {
    const verifiedUser = await requireVerifiedUser(req, res);
    if (!verifiedUser) return;
    try {
      const prompt = sanitizeText(req.body?.prompt, 2000);
      const courseName = sanitizeText(req.body?.courseName, 160) || 'General Studies';
      const syllabusTopics = Array.isArray(req.body?.syllabusTopics)
        ? req.body.syllabusTopics.slice(0, 20).map((t: unknown) => sanitizeText(t, 100)).join(', ')
        : '';
      const mode = sanitizeText(req.body?.mode, 40) || 'tutor';
      const language = ['English', 'Tamil', 'Sinhala'].includes(req.body?.language)
        ? req.body.language
        : 'English';

      if (!prompt) {
        return res.status(400).json({ error: 'Please enter a study question or topic.' });
      }

      const ai = getGenAI();
      const systemInstruction = `You are TECHMAN COLLEGE AI TUTOR, the official 24/7 academic learning assistant for TECHMAN COLLEGE (Established in 2021, Sri Lanka — 2027 Intake).
Primary language requested: ${language}. Respond clearly and accurately in ${language}.
Active Course: ${courseName}
Verified Course Syllabus Modules: ${syllabusTopics || 'General College Foundation'}
Mode requested: ${mode} (options: tutor, study_notes, lesson_summary, practice_questions, revision_plan, assignment_guidance).

STRICT ACADEMIC INTEGRITY RULES:
1. Always clearly label two sections when applicable:
   - **Verified Course Material**: Grounded directly in the course syllabus topics above.
   - **General Academic Explanation**: Broader helpful context beyond the syllabus.
2. For assignment_guidance, guide the student step-by-step without writing a plagiarizable full submission.
3. Keep formatting crisp, structured, practical, and easy to study on desktop and mobile.`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction,
        },
      });

      return res.json({
        answer: response.text || 'Unable to generate a tutor response right now.',
        language,
        courseName,
        mode,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI Tutor service error';
      console.error('[AI Tutor Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 2. AI EXAM & ASSIGNMENT ASSISTANT (Educator/Admin Only — Lecturer approval strictly required)
  app.post('/api/ai/exam-assistant', aiRateLimit, async (req, res) => {
    const staff = await requireAuthorizedRoles(req, res, [
      'SUPER_ADMIN',
      'ADMIN',
      'ACADEMIC_MANAGER',
      'LECTURER',
      'EXAMINER',
    ]);
    if (!staff) return;
    try {
      const action = sanitizeText(req.body?.action, 40) || 'generate_mcq';
      const courseName = sanitizeText(req.body?.courseName, 160);
      const topic = sanitizeText(req.body?.topic, 300);
      const difficulty = sanitizeText(req.body?.difficulty, 32) || 'Intermediate';
      const count = Math.min(Math.max(Number(req.body?.count) || 5, 1), 10);
      const studentSubmission = sanitizeText(req.body?.studentSubmission, 2500);

      if (!courseName || (!topic && !studentSubmission)) {
        return res.status(400).json({ error: 'Course name and topic or submission text are required.' });
      }

      const ai = getGenAI();

      if (action === 'generate_mcq') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Generate ${count} ${difficulty}-level MCQ examination questions for "${courseName}" covering: ${topic}. Provide 4 distinct options (A-D), the zero-based correctIndex (0-3), and a brief pedagogical explanation.`,
          config: {
            systemInstruction:
              'You are an academic examination designer for TECHMAN COLLEGE (Established in 2021). Return clean JSON matching the schema. All generated questions are drafts requiring Lecturer/Examiner approval.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                      difficulty: { type: Type.STRING },
                    },
                    required: ['question', 'options', 'correctIndex', 'explanation'],
                  },
                },
              },
              required: ['questions'],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{"questions":[]}');
        return res.json({
          questions: parsed.questions || [],
          approvalRequired: true,
          notice: 'Draft generated by AI. Lecturer or Examiner approval is required before publishing.',
        });
      }

      // Assignment / Essay Feedback Draft or Learning Gap Detection
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Course: ${courseName}\nTask: ${action}\nContext/Submission:\n${studentSubmission || topic}`,
        config: {
          systemInstruction:
            'You are an AI Academic Evaluation Assistant for TECHMAN COLLEGE (Established in 2021). Draft constructive rubric feedback, identify strengths, highlight learning gaps, and suggest a provisional mark range. Explicitly note that final marks require Lecturer/Examiner approval.',
        },
      });

      return res.json({
        draftFeedback: response.text || '',
        approvalRequired: true,
        notice: 'Provisional AI feedback draft. Final marks require explicit Lecturer or Examiner approval.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI Exam Assistant error';
      console.error('[AI Exam Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 3. AI CAREER CENTER (Verified Users Only — Advisor, Skill Assessment, Resume/CV Builder, Interview Coach)
  app.post('/api/ai/career', aiRateLimit, async (req, res) => {
    const verifiedUser = await requireVerifiedUser(req, res);
    if (!verifiedUser) return;
    try {
      const tool = sanitizeText(req.body?.tool, 40) || 'advisor';
      const studentName = sanitizeText(req.body?.studentName, 120) || 'Student';
      const enrolledCourses = sanitizeText(req.body?.enrolledCourses, 400);
      const targetRole = sanitizeText(req.body?.targetRole, 120);
      const skills = sanitizeText(req.body?.skills, 400);
      const notes = sanitizeText(req.body?.notes, 1500);

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Tool: ${tool}
Student: ${studentName}
Completed/Enrolled TECHMAN COLLEGE Courses: ${enrolledCourses || 'Not specified'}
Target Role: ${targetRole || 'Digital & AI Professional'}
Skills: ${skills || 'Foundational digital skills'}
Additional Details / Interview Prompt: ${notes || 'Provide actionable guidance for Sri Lanka and remote international careers.'}`,
        config: {
          systemInstruction: `You are the TECHMAN COLLEGE Career Development Advisor for TECHMAN COLLEGE (Established in 2021, Sri Lanka).
Tailor your response to the requested tool:
- "resume": Produce a crisp, ATS-ready professional Resume/CV layout with measurable bullet points.
- "interview": Provide 5 realistic technical & behavioral interview questions for the target role with strong sample answer frameworks.
- "skill_gap": Assess current skills against the target role and recommend specific portfolio projects and TECHMAN COLLEGE modules.
- "advisor": Provide a structured 90-day career, freelancing, and internship roadmap relevant to Sri Lanka and global remote markets.`,
        },
      });

      return res.json({
        result: response.text || '',
        tool,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI Career service error';
      console.error('[AI Career Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 4. AI MEDIA ORGANIZER (CMS Admin / Content Manager Only — Draft only, Admin approval required)
  app.post('/api/ai/media-organize', aiRateLimit, async (req, res) => {
    const staff = await requireAuthorizedRoles(req, res, [
      'SUPER_ADMIN',
      'ADMIN',
      'CONTENT_MANAGER',
    ]);
    if (!staff) return;
    try {
      const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
      const mimeType = sanitizeText(req.body?.mimeType, 60) || 'image/jpeg';
      const hintText = sanitizeText(req.body?.hintText, 500);

      if (!imageBase64 && !hintText) {
        return res.status(400).json({ error: 'Provide an uploaded image or poster notes for AI analysis.' });
      }

      const ai = getGenAI();
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (imageBase64 && /^image\/(png|jpeg|jpg|webp)$/.test(mimeType)) {
        const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        parts.push({ inlineData: { mimeType, data: cleaned } });
      }
      parts.push({
        text: `Analyze this college media asset for TECHMAN COLLEGE (Established in 2021). ${hintText ? `Admin notes: ${hintText}` : ''}
Suggest the best CMS itemType (one of: Poster, Banner, Event, News, Story), a clean title, extracted visible text if any, a compelling 2-sentence description, a category, and 3 to 6 concise tags.`,
      });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedItemType: { type: Type.STRING },
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              extractedText: { type: Type.STRING },
              description: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['suggestedItemType', 'title', 'category', 'description', 'tags'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        suggestion: parsed,
        status: 'draft',
        notice: 'AI suggestion ready. Admin review and explicit approval are required before publishing.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI Media Organizer error';
      console.error('[AI Media Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 5. PRIVATE AI SUPER ADMIN / CEO ASSISTANT (Super Admin Only — Read-only operational analytics)
  app.post('/api/ai/ceo-assistant', aiRateLimit, async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    try {
      const question = sanitizeText(req.body?.question, 1500);
      const snapshot = req.body?.metricsSnapshot;
      const reportingPeriod = sanitizeText(req.body?.reportingPeriod, 80) || '2027 Academic Intake (Live Snapshot)';

      if (!question || !snapshot || typeof snapshot !== 'object') {
        return res.status(400).json({ error: 'Operational question and authorized metrics snapshot are required.' });
      }

      const ai = getGenAI();
      const nowIso = new Date().toISOString();

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Owner / CEO Question: ${question}

Authorized Live Firestore Operational Snapshot (Read-Only):
${JSON.stringify(snapshot, null, 2)}`,
        config: {
          systemInstruction: `You are the Private AI Executive Assistant for the Owners / CEOs of TECHMAN COLLEGE (Established in 2021; techmanfgoc@gmail.com & mrashadh64@gmail.com).
STRICT GOVERNANCE RULES:
1. Answer strictly using the verified numbers in the provided Firestore snapshot. Never fabricate figures.
2. Always include at the end of your response:
   - **Data Source**: Cloud Firestore Live College Database
   - **Reporting Period**: ${reportingPeriod}
   - **Last Updated**: ${nowIso}
   - **Calculation Basis**: Briefly explain how the reported figures were derived.
3. NEVER claim to delete records, issue refunds, change permissions, approve payments, or send bulk broadcasts. If asked to perform a sensitive action, explicitly state that Owner confirmation inside the respective Admin console module is required.`,
        },
      });

      return res.json({
        answer: response.text || '',
        dataSource: 'Cloud Firestore Live College Database',
        reportingPeriod,
        lastUpdated: nowIso,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI Super Admin Assistant error';
      console.error('[AI CEO Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // =========================================================================
  // 6. CENTRALIZED AI INTEGRATIONS & POSTER PUBLISH GOVERNANCE (AUTH-GATED)
  // =========================================================================

  const FORBIDDEN_POSTER_CLAIM_PATTERNS: Array<{ label: string; regex: RegExp }> = [
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

  function fnv1aHashServer(input: string): string {
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

  function serverComputePosterHash(p: Record<string, unknown>): string {
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
    return fnv1aHashServer(payload);
  }

  function serverComputeCourseHash(c: Record<string, unknown>): string {
    const payload = JSON.stringify({
      id: String(c.id || ''),
      name: String(c.name || '').trim(),
      category: String(c.category || ''),
      duration: String(c.duration || '').trim(),
      mode: String(c.mode || ''),
      courseFeeLkr: Number(c.courseFeeLkr || 0),
      feeConfigured: Boolean(c.feeConfigured),
      isFree: Boolean(c.isFree),
      registrationFeeLkr: Number(c.registrationFeeLkr || 0),
      certificateFeeLkr: Number(c.certificateFeeLkr || 0),
      status: String(c.status || ''),
    });
    return fnv1aHashServer(payload);
  }

  function serverValidatePoster(
    poster: Record<string, unknown>,
    course: Record<string, unknown> | null,
    brand: Record<string, unknown> | null
  ) {
    const checks: Array<{
      code: string;
      label: string;
      passed: boolean;
      severity: 'error' | 'warning';
      message: string;
    }> = [];

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

    // 1. Course name accuracy
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

      // 2. Course level accuracy
      const cat = String(course.category || '');
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

      // 3. FREE vs PAID accuracy
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

      // 4. Fee accuracy (if configured)
      const feeConfigured = course.feeConfigured !== false;
      const feeLkr = Number(course.courseFeeLkr || 0);
      let feeOk = true;
      let feeMsg = 'Course fee display matches verified record.';
      if (isFree) {
        feeOk = true;
      } else if (feeConfigured && feeLkr > 0) {
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
      } else if (!feeConfigured) {
        const fabricatedFee = /(?:lkr|rs\.?)\s*\d[\d,]{2,}/i.test(feeLabel + ' ' + headline);
        feeOk = !fabricatedFee;
        feeMsg = feeOk
          ? 'Unconfigured fee is safely shown as enquiry-based without invented pricing.'
          : 'Fee is not configured in database — remove invented LKR/Rs amount.';
      }
      checks.push({
        code: 'FEE_ACCURACY',
        label: 'Fee Accuracy & Anti-Fabrication',
        passed: feeOk,
        severity: 'error',
        message: feeMsg,
      });

      // 5. Duration accuracy
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
    }

    // 6. Essential info present
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

    // 7. Verified contact & website details
    const expectedPhoneDigits = String(brand?.whatsappNumber || '94710108803').replace(/\D/g, '').slice(-9);
    const expectedWebsite = String(brand?.website || 'techmancollege.online')
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
        : `Footer must include verified contact number (+94 710 108 803) or website (${expectedWebsite}).`,
    });

    // 8. Official TECHMAN Logo configured
    const logoOk = Boolean(brand?.logoUrl && String(brand.logoUrl).trim().length > 4);
    checks.push({
      code: 'INSTITUTE_LOGO',
      label: 'Official TECHMAN COLLEGE Logo',
      passed: logoOk,
      severity: 'error',
      message: logoOk
        ? 'Official TECHMAN COLLEGE brand logo locked on canvas.'
        : 'Official TECHMAN COLLEGE logo URL is missing in Brand Settings.',
    });

    // 9. Forbidden / Unverified claims check
    const violations = FORBIDDEN_POSTER_CLAIM_PATTERNS.filter((p) => p.regex.test(combinedText));
    checks.push({
      code: 'NO_UNVERIFIED_CLAIMS',
      label: 'No Unverified Accreditations, Scholarships or Guarantees',
      passed: violations.length === 0,
      severity: 'error',
      message:
        violations.length === 0
          ? 'No prohibited claims, fake accreditations, or income/job guarantees detected.'
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

  // 6a. Integration Readiness Status (Super Admin Only — never exposes secret values)
  app.get('/api/integrations/status', async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    return res.json({
      checkedAt: new Date().toISOString(),
      providers: {
        openai: {
          envConfigured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 10),
          envVarName: 'OPENAI_API_KEY',
        },
        gemini_ai: {
          envConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10),
          envVarName: 'GEMINI_API_KEY',
          model: MODEL_NAME,
        },
        apify: {
          envConfigured: Boolean(process.env.APIFY_API_TOKEN && process.env.APIFY_API_TOKEN.trim().length > 10),
          envVarName: 'APIFY_API_TOKEN',
        },
        firebase: {
          envConfigured: Boolean(firebaseClientConfig?.projectId),
          projectId: firebaseClientConfig?.projectId || '',
        },
      },
    });
  });

  // 6b. OpenAI Live Connection Test (Super Admin Only)
  app.post('/api/integrations/openai/test', async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    const started = Date.now();
    if (!apiKey) {
      return res.json({
        status: 'not_configured',
        durationMs: Date.now() - started,
        message: 'OPENAI_API_KEY is not set in server environment secrets. Configure it in Settings → Secrets.',
      });
    }
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const durationMs = Date.now() - started;
      if (!resp.ok) {
        const errText = (await resp.text()).slice(0, 240);
        return res.json({
          status: 'error',
          durationMs,
          error: `OpenAI API returned HTTP ${resp.status}: ${errText}`,
        });
      }
      const data = (await resp.json()) as { data?: Array<{ id?: string }> };
      return res.json({
        status: 'connected',
        durationMs,
        modelsCount: Array.isArray(data.data) ? data.data.length : 0,
        message: 'OpenAI API key verified via live /v1/models check.',
      });
    } catch (err) {
      return res.json({
        status: 'error',
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : 'OpenAI connection test failed.',
      });
    }
  });

  // 6c. AI Marketing & Course Copy Generation (OpenAI when configured, else Gemini — Staff Only, Students blocked)
  const POSTER_STAFF_ROLES = [
    'SUPER_ADMIN',
    'ADMIN',
    'CONTENT_MANAGER',
    'BRANCH_MANAGER',
    'LECTURER',
  ];

  app.post('/api/integrations/openai/generate', aiRateLimit, async (req, res) => {
    const user = await requireAuthorizedRoles(req, res, POSTER_STAFF_ROLES);
    if (!user) return;
    try {
      const task = sanitizeText(req.body?.task, 60) || 'poster_copy';
      const providerPref = sanitizeText(req.body?.provider, 24) || 'auto';
      const language = ['English', 'Tamil', 'Sinhala', 'Arabic'].includes(req.body?.language)
        ? String(req.body.language)
        : 'English';
      const posterType = sanitizeText(req.body?.posterType, 80) || 'Course Admission Poster';
      const modelOverride = sanitizeText(req.body?.model, 64) || 'gpt-4o-mini';
      const course = (req.body?.course && typeof req.body.course === 'object' ? req.body.course : null) as Record<
        string,
        unknown
      > | null;
      const customPrompt = sanitizeText(req.body?.customPrompt, 1200);

      if (!course && !customPrompt) {
        return res.status(400).json({ error: 'Verified course data or a content prompt is required.' });
      }

      const verifiedFactBlock = course
        ? JSON.stringify(
            {
              name: course.name,
              code: course.code,
              category: course.category,
              domain: course.domain,
              isFree: Boolean(course.isFree),
              feeConfigured: course.feeConfigured !== false,
              courseFeeLkr: course.isFree ? 0 : course.feeConfigured !== false ? course.courseFeeLkr : 'Not configured — contact admissions',
              registrationFeeLkr: course.registrationFeeLkr ?? 'As per admission notice',
              certificateFeeLkr: course.certificateFeeLkr ?? 'Optional / as per schedule',
              duration: course.duration,
              mode: course.mode,
              syllabusTopics: Array.isArray(course.syllabusTopics) ? course.syllabusTopics.slice(0, 8) : [],
              description: course.description,
              institute: 'TECHMAN COLLEGE ONLINE (Established in 2021, Sri Lanka)',
              phone: '+94 710 108 803',
              website: 'https://techmancollege.online',
            },
            null,
            2
          )
        : customPrompt;

      const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
      const useOpenAI = (providerPref === 'openai' || providerPref === 'auto') && openaiKey.length > 10;

      if (providerPref === 'openai' && !openaiKey) {
        return res.status(400).json({
          error: 'OPENAI_API_KEY is not configured in server environment secrets. Switch provider to Auto/Gemini or configure OPENAI_API_KEY.',
        });
      }

      if (task === 'poster_copy') {
        const systemPrompt = `You are the official marketing copywriter for TECHMAN COLLEGE (Established in 2021, Sri Lanka).
Generate accurate, high-converting poster copy strictly from the VERIFIED COURSE DATA provided.
Output language: ${language}. Poster type: ${posterType}.

MANDATORY ACCURACY & ETHICS GUARDRAILS:
1. NEVER invent course fees, discounts, durations, start dates, or scholarships not in the verified data.
2. NEVER mark a paid course as FREE. Only mark isFree=true courses as "100% FREE COURSE".
3. NEVER claim unverified accreditations (no UGC, TVEC, NVQ, Pearson, Cambridge, Oxford, ISO, or government approvals).
4. NEVER promise guaranteed jobs, guaranteed placements, or guaranteed income.
5. Keep headline concise (under 70 chars), subheadline under 140 chars, 4-5 concise highlights, CTA under 40 chars.
6. Return ONLY valid JSON with keys: headline, subheadline, badgeText, highlights (string array, 4-5 items), learningBenefits (string array, 3-4 items), ctaText, socialCaption, hashtags (string array, 5-8 items starting with #), whatsappMessage.`;

        if (useOpenAI) {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: modelOverride,
              temperature: 0.4,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `VERIFIED COURSE DATA:\n${verifiedFactBlock}\n${customPrompt ? `\nADMIN BRIEF: ${customPrompt}` : ''}` },
              ],
            }),
          });
          if (!resp.ok) {
            const errTxt = (await resp.text()).slice(0, 260);
            throw new Error(`OpenAI request failed (${resp.status}): ${errTxt}`);
          }
          const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
          return res.json({
            providerUsed: `OpenAI (${modelOverride})`,
            language,
            posterCopy: parsed,
            approvalNotice: 'AI-generated draft only. Must pass automatic validation and explicit Super Admin approval before publishing.',
          });
        }

        const ai = getGenAI();
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `VERIFIED COURSE DATA:\n${verifiedFactBlock}\n${customPrompt ? `\nADMIN BRIEF: ${customPrompt}` : ''}`,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING },
                subheadline: { type: Type.STRING },
                badgeText: { type: Type.STRING },
                highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                learningBenefits: { type: Type.ARRAY, items: { type: Type.STRING } },
                ctaText: { type: Type.STRING },
                socialCaption: { type: Type.STRING },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                whatsappMessage: { type: Type.STRING },
              },
              required: ['headline', 'subheadline', 'badgeText', 'highlights', 'ctaText', 'socialCaption', 'hashtags', 'whatsappMessage'],
            },
          },
        });
        const parsed = JSON.parse(response.text || '{}');
        return res.json({
          providerUsed: `Gemini (${MODEL_NAME})`,
          language,
          posterCopy: parsed,
          approvalNotice: 'AI-generated draft only. Must pass automatic validation and explicit Super Admin approval before publishing.',
        });
      }

      // General AI Content Tasks: course_description, syllabus_draft, faq, translation
      const textSystemPrompt = `You are the academic & marketing editor for TECHMAN COLLEGE (Established in 2021, Sri Lanka).
Task: ${task}. Target Language: ${language}.
Use ONLY the verified facts provided. Never invent fees, accreditations, or job/income guarantees. Draft requires admin review.`;

      if (useOpenAI) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: modelOverride,
            temperature: 0.4,
            messages: [
              { role: 'system', content: textSystemPrompt },
              { role: 'user', content: `${verifiedFactBlock}\n\n${customPrompt}` },
            ],
          }),
        });
        if (!resp.ok) {
          throw new Error(`OpenAI request failed (${resp.status})`);
        }
        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return res.json({
          providerUsed: `OpenAI (${modelOverride})`,
          language,
          text: data.choices?.[0]?.message?.content || '',
        });
      }

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `${verifiedFactBlock}\n\n${customPrompt}`,
        config: { systemInstruction: textSystemPrompt },
      });
      return res.json({
        providerUsed: `Gemini (${MODEL_NAME})`,
        language,
        text: response.text || '',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI content generation failed.';
      console.error('[AI Marketing Generate Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 6d. Apify Connection Test, Actor Run, Status & Dataset Proxy (Super Admin Only)
  app.post('/api/integrations/apify/test', async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    const token = (process.env.APIFY_API_TOKEN || '').trim();
    const started = Date.now();
    if (!token) {
      return res.json({
        status: 'not_configured',
        durationMs: Date.now() - started,
        message: 'APIFY_API_TOKEN is not configured in server environment secrets. Add it in Settings → Secrets.',
      });
    }
    try {
      const resp = await fetch('https://api.apify.com/v2/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const durationMs = Date.now() - started;
      if (!resp.ok) {
        return res.json({
          status: 'error',
          durationMs,
          error: `Apify API returned HTTP ${resp.status}. Verify APIFY_API_TOKEN.`,
        });
      }
      const data = (await resp.json()) as { data?: { username?: string } };
      return res.json({
        status: 'connected',
        durationMs,
        username: data.data?.username || 'verified-account',
        message: 'Apify API token verified via live /v2/users/me check.',
      });
    } catch (err) {
      return res.json({
        status: 'error',
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : 'Apify connection test failed.',
      });
    }
  });

  app.post('/api/integrations/apify/run', async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    const token = (process.env.APIFY_API_TOKEN || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'APIFY_API_TOKEN is not configured in server secrets.' });
    }
    const actorId = sanitizeText(req.body?.actorId, 120);
    if (!/^[a-zA-Z0-9._~/-]{3,120}$/.test(actorId)) {
      return res.status(400).json({ error: 'Invalid Apify actor ID format.' });
    }
    const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
    try {
      const normalizedActor = actorId.replace('/', '~');
      const resp = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActor)}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      if (!resp.ok) {
        const errTxt = (await resp.text()).slice(0, 240);
        return res.status(resp.status).json({ error: `Apify actor trigger failed: ${errTxt}` });
      }
      const data = (await resp.json()) as { data?: { id?: string; status?: string; defaultDatasetId?: string } };
      return res.json({
        runId: data.data?.id || '',
        status: data.data?.status || 'RUNNING',
        datasetId: data.data?.defaultDatasetId || '',
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Apify actor run failed.' });
    }
  });

  app.get('/api/integrations/apify/runs/:runId', async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    const token = (process.env.APIFY_API_TOKEN || '').trim();
    if (!token) return res.status(400).json({ error: 'APIFY_API_TOKEN is not configured.' });
    const runId = String(req.params.runId || '');
    if (!/^[a-zA-Z0-9_-]{4,80}$/.test(runId)) return res.status(400).json({ error: 'Invalid runId.' });
    try {
      const resp = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return res.status(resp.status).json({ error: `Failed to fetch Apify run (${resp.status}).` });
      const data = (await resp.json()) as { data?: { status?: string; defaultDatasetId?: string } };
      return res.json({
        runId,
        status: data.data?.status || 'RUNNING',
        datasetId: data.data?.defaultDatasetId || '',
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Apify run lookup failed.' });
    }
  });

  app.get('/api/integrations/apify/datasets/:datasetId', async (req, res) => {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    const token = (process.env.APIFY_API_TOKEN || '').trim();
    if (!token) return res.status(400).json({ error: 'APIFY_API_TOKEN is not configured.' });
    const datasetId = String(req.params.datasetId || '');
    if (!/^[a-zA-Z0-9_-]{4,80}$/.test(datasetId)) return res.status(400).json({ error: 'Invalid datasetId.' });
    try {
      const resp = await fetch(
        `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?limit=25`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) return res.status(resp.status).json({ error: `Failed to fetch Apify dataset (${resp.status}).` });
      const items = await resp.json();
      return res.json({ datasetId, items: Array.isArray(items) ? items : [] });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Apify dataset fetch failed.' });
    }
  });

  // 6e. Server-Side Poster Automatic Validation (Staff Only — Students strictly denied)
  app.post('/api/posters/validate', async (req, res) => {
    const user = await requireAuthorizedRoles(req, res, POSTER_STAFF_ROLES);
    if (!user) return;
    const poster = req.body?.poster && typeof req.body.poster === 'object' ? req.body.poster : null;
    if (!poster) return res.status(400).json({ error: 'Poster payload is required.' });
    const course = req.body?.course && typeof req.body.course === 'object' ? req.body.course : null;
    const brand = req.body?.brand && typeof req.body.brand === 'object' ? req.body.brand : null;
    const validation = serverValidatePoster(poster, course, brand);
    const contentHash = serverComputePosterHash(poster);
    const courseSnapshotHash = course ? serverComputeCourseHash(course) : '';
    return res.json({ validation, contentHash, courseSnapshotHash });
  });

  // 6f. Optional AI Poster Background Artwork Generator (Staff Only — Draft asset only, NEVER publishes)
  app.post('/api/posters/generate-background', aiRateLimit, async (req, res) => {
    const user = await requireAuthorizedRoles(req, res, POSTER_STAFF_ROLES);
    if (!user) return;
    try {
      const courseName = sanitizeText(req.body?.courseName, 140) || 'Technology & Professional Education';
      const domain = sanitizeText(req.body?.domain, 80) || 'AI & Technology';
      const templateStyle = sanitizeText(req.body?.templateStyle, 40) || 'navy_executive';
      const customTheme = sanitizeText(req.body?.customTheme, 240);
      const providerPref = sanitizeText(req.body?.provider, 24) || 'auto';

      const artworkPrompt = [
        `Clean, high-resolution abstract academic poster background artwork for a university-grade course titled "${courseName}" in the field of "${domain}".`,
        `Visual palette aligned with "${templateStyle}" (deep navy #0A192F, electric blue #1677FF, subtle luminous geometric light trails and modern academic atmosphere).`,
        customTheme ? `Additional art direction: ${customTheme}.` : '',
        'CRITICAL: Do NOT include any text, words, letters, numbers, logos, watermarks, badges, or human faces. Leave clean dark-toned negative space for foreground typography.',
      ]
        .filter(Boolean)
        .join(' ');

      const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
      const useOpenAI = (providerPref === 'openai' || providerPref === 'auto') && openaiKey.length > 10;

      if (useOpenAI) {
        const openAiResp = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt: artworkPrompt,
            size: '1024x1024',
            n: 1,
          }),
        });
        if (openAiResp.ok) {
          const data = (await openAiResp.json()) as {
            data?: Array<{ b64_json?: string; url?: string }>;
          };
          const b64 = data.data?.[0]?.b64_json;
          if (b64) {
            return res.json({
              imageDataUrl: `data:image/png;base64,${b64}`,
              providerUsed: 'OpenAI (gpt-image-1)',
              approvalNotice:
                'Background artwork generated for draft editing only. Final poster still requires validation and Super Admin approval.',
            });
          }
        }
      }

      return res.status(400).json({
        error:
          'OpenAI image generation (OPENAI_API_KEY) is not configured in Settings → Secrets. Choose a built-in TECHMAN theme or upload a custom background image.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI background generation failed.';
      console.error('[Poster Background Generate Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  async function evaluatePublishAuthorization(
    req: express.Request,
    res: express.Response
  ): Promise<
    | {
        ok: true;
        admin: { uid: string; email: string };
        posterId: string;
        versionNumber: number;
        destination: string;
        computedHash: string;
        verifiedAt: string;
        signature: string;
        validation: ReturnType<typeof serverValidatePoster>;
      }
    | { ok: false }
  > {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return { ok: false };

    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const clientPoster =
      req.body?.poster && typeof req.body.poster === 'object'
        ? (req.body.poster as Record<string, unknown>)
        : null;
    const posterId = sanitizeText(req.body?.posterId || clientPoster?.id, 128);
    const clientCourse =
      req.body?.course && typeof req.body.course === 'object'
        ? (req.body.course as Record<string, unknown>)
        : null;
    const brand =
      req.body?.brand && typeof req.body.brand === 'object'
        ? (req.body.brand as Record<string, unknown>)
        : null;
    const destination = sanitizeText(req.body?.destination, 64) || 'website_marketing_library';

    if (!posterId || !/^[a-zA-Z0-9_-]{3,128}$/.test(posterId)) {
      res.status(400).json({
        allowed: false,
        error: 'A valid persisted posterId is required for publish authorization.',
      });
      return { ok: false };
    }

    // Fetch authoritative poster record directly from Firestore using caller's verified token
    const dbPosterLookup = await fetchAuthoritativeFirestoreDoc(
      'generatedPosters',
      posterId,
      bearerToken
    );

    if (!dbPosterLookup.exists || !dbPosterLookup.data) {
      res.status(409).json({
        allowed: false,
        failures: [
          dbPosterLookup.error ||
            `Poster "${posterId}" was not found in the authoritative database. Unpersisted or unapproved posters cannot be published.`,
        ],
        error: `Poster "${posterId}" does not exist as an approved record in Firestore.`,
      });
      return { ok: false };
    }

    const authoritativePoster = dbPosterLookup.data;

    // Fetch authoritative course record if poster is linked to a course
    const linkedCourseId = sanitizeText(authoritativePoster.courseId, 128);
    let authoritativeCourse: Record<string, unknown> | null = clientCourse;
    if (linkedCourseId) {
      const dbCourseLookup = await fetchAuthoritativeFirestoreDoc(
        'courses',
        linkedCourseId,
        bearerToken
      );
      if (dbCourseLookup.exists && dbCourseLookup.data) {
        authoritativeCourse = dbCourseLookup.data;
      }
    }

    const failures: string[] = [];
    const status = String(authoritativePoster.status || '');
    if (status !== 'approved' && status !== 'published') {
      failures.push(
        `Authoritative database status is "${status}". Only explicitly APPROVED posters can be published.`
      );
    }

    const versionNumber = Number(authoritativePoster.versionNumber || 0);
    const approvedVersionNumber = Number(authoritativePoster.approvedVersionNumber || 0);
    if (versionNumber <= 0 || approvedVersionNumber !== versionNumber) {
      failures.push(
        `Version mismatch: current v${versionNumber} does not match approved v${approvedVersionNumber}. Fresh Super Admin approval is required.`
      );
    }

    const computedHash = serverComputePosterHash(authoritativePoster);
    const approvedHash = String(authoritativePoster.approvedContentHash || '');
    if (!approvedHash || computedHash !== approvedHash) {
      failures.push(
        'Authoritative poster design or copy does not match the approved cryptographic hash. Re-approval is mandatory before publishing.'
      );
    }

    // Also verify client-submitted poster payload matches the approved authoritative hash (blocks in-transit tampering)
    if (clientPoster) {
      const clientHash = serverComputePosterHash(clientPoster);
      if (approvedHash && clientHash !== approvedHash) {
        failures.push(
          'Submitted poster preview differs from the approved database version. Save edits as a new version and obtain fresh approval.'
        );
      }
    }

    const validation = serverValidatePoster(authoritativePoster, authoritativeCourse, brand);
    if (!validation.passed) {
      failures.push(`Validation failed: ${validation.errors.join(' | ')}`);
    }

    if (authoritativeCourse) {
      if (String(authoritativeCourse.status || '') !== 'published') {
        failures.push(
          `Linked course "${authoritativeCourse.name}" is currently "${authoritativeCourse.status}" (must be published/active).`
        );
      }
      const liveCourseHash = serverComputeCourseHash(authoritativeCourse);
      if (
        authoritativePoster.courseSnapshotHash &&
        String(authoritativePoster.courseSnapshotHash) !== liveCourseHash
      ) {
        failures.push(
          'Linked course details (fee, duration, title, or mode) changed after this poster was generated. Regenerate and re-approve before publishing.'
        );
      }
    }

    if (failures.length > 0) {
      res.status(409).json({
        allowed: false,
        failures,
        computedHash,
        validation,
        error: failures[0],
      });
      return { ok: false };
    }

    const verifiedAt = new Date().toISOString();
    const receiptPayload = `${posterId}:${versionNumber}:${computedHash}:${destination}:${admin.uid}:${verifiedAt}`;
    const signature = crypto
      .createHmac('sha256', PUBLISH_RECEIPT_SECRET)
      .update(receiptPayload)
      .digest('hex');

    return {
      ok: true,
      admin,
      posterId,
      versionNumber,
      destination,
      computedHash,
      verifiedAt,
      signature,
      validation,
    };
  }

  // 6f. Server-Side Mandatory Pre-Publish Verification Gate (Super Admin Only + Authoritative Firestore Check)
  app.post('/api/posters/verify-publish', async (req, res) => {
    const result = await evaluatePublishAuthorization(req, res);
    if (!result.ok) return;
    return res.json({
      allowed: true,
      posterId: result.posterId,
      versionNumber: result.versionNumber,
      verifiedAt: result.verifiedAt,
      verifiedBy: result.admin.email,
      destination: result.destination,
      contentHash: result.computedHash,
      signature: result.signature,
      validation: result.validation,
      authoritativeDbChecked: true,
    });
  });

  // 6g. Direct Publishing Authorization Endpoint (Blocks Unauthenticated / Non-Super-Admin / Unapproved / Modified Posters)
  app.post('/api/posters/publish', async (req, res) => {
    const result = await evaluatePublishAuthorization(req, res);
    if (!result.ok) return;
    return res.json({
      authorized: true,
      posterId: result.posterId,
      versionNumber: result.versionNumber,
      destination: result.destination,
      verifiedAt: result.verifiedAt,
      verifiedBy: result.admin.email,
      contentHash: result.computedHash,
      receiptSignature: result.signature,
      message: 'Authoritative pre-publish verification passed for exact approved poster version.',
    });
  });

  const httpServer = http.createServer(app);

  // Mount Gemini Multimodal Suite (Multi-turn Chat, Search & Maps Grounding, Transcribe 3.5, Live Voice 3.8 WS)
  mountGeminiMultimodalSuite({
    app,
    httpServer,
    getGenAI,
    aiRateLimit,
    requireVerifiedUser,
    verifyRawToken: async (rawToken: string) => {
      if (!rawToken) return null;
      const fakeReq = { headers: { authorization: `Bearer ${rawToken}` } } as express.Request;
      const fbUser = await verifyFirebaseBearerToken(fakeReq);
      if (fbUser) return fbUser;
      const studentSess = studentAuthModule.extractStudentSession(fakeReq, ['student_session']);
      if (studentSess) {
        return { uid: studentSess.uid, email: studentSess.email, token: '' };
      }
      return null;
    },
  });

  // Mount Vite middleware in dev (loaded dynamically so production never touches Vite), or serve static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: disableHmr ? false : true,
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else if (
            filePath.includes(`${path.sep}assets${path.sep}`) &&
            /\.(?:js|css|webp|avif|woff2|svg|png|jpe?g)$/i.test(filePath)
          ) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TECHMAN COLLEGE LMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
