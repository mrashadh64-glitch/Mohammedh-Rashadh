import 'dotenv/config';
import compression from 'compression';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import firebaseClientConfig from './firebase-applet-config.json' with { type: 'json' };

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

async function verifyFirebaseBearerToken(req: express.Request): Promise<{ uid: string; email: string } | null> {
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
    if (!u?.localId || !u.email) return null;
    return { uid: u.localId, email: u.email };
  } catch {
    return null;
  }
}

const PORT = 3000;
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
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: '22mb' }));

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

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'TECHMAN COLLEGE LMS',
      college: 'TECHMAN COLLEGE',
      establishedYear: 2021,
      timestamp: new Date().toISOString(),
    });
  });

  // Syllabus Document Upload Fallback (Authenticated via Firebase ID Token, strict MIME/extension/path guards)
  app.post('/api/uploads/syllabus', async (req, res) => {
    try {
      const verifiedUser = await verifyFirebaseBearerToken(req);
      if (!verifiedUser) {
        return res.status(401).json({ error: 'Authentication required to upload syllabus documents.' });
      }

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

      return res.json({
        fileId,
        fileName: safeFileName,
        mimeType,
        extension: ext.replace('.', ''),
        sizeBytes: buffer.length,
        url: `/api/uploads/syllabus/${fileId}`,
        storageProvider: 'server_fallback',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Syllabus upload failed.';
      console.error('[Syllabus Upload Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  app.get('/api/uploads/syllabus/:fileId', (req, res) => {
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
      };
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

  // 1. TECHMAN AI TUTOR (English default + Tamil / Sinhala support, grounded in course materials)
  app.post('/api/ai/tutor', aiRateLimit, async (req, res) => {
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

  // 2. AI EXAM & ASSIGNMENT ASSISTANT (Lecturer approval strictly required)
  app.post('/api/ai/exam-assistant', aiRateLimit, async (req, res) => {
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

  // 3. AI CAREER CENTER (Advisor, Skill Assessment, Resume/CV Builder, Interview Coach)
  app.post('/api/ai/career', aiRateLimit, async (req, res) => {
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

  // 4. AI MEDIA ORGANIZER (CMS Image Analysis — Draft only, Admin approval required)
  app.post('/api/ai/media-organize', aiRateLimit, async (req, res) => {
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

  // 5. PRIVATE AI SUPER ADMIN / CEO ASSISTANT (Read-only operational analytics; no autonomous mutations)
  app.post('/api/ai/ceo-assistant', aiRateLimit, async (req, res) => {
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

  const httpServer = http.createServer(app);

  // Mount Vite middleware in dev, or serve static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const disableHmr = process.env.DISABLE_HMR === 'true';
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
