import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';
import {
  ModuleProgressRecord,
  SyllabusAttachment,
  SyllabusModule,
} from '../types/lms';

export const MAX_SYLLABUS_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_SYLLABUS_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const;

export const ALLOWED_SYLLABUS_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function validateSyllabusFile(file: File): {
  valid: boolean;
  extension: string;
  mimeType: string;
  error?: string;
} {
  const parts = file.name.split('.');
  const ext = (parts.length > 1 ? parts.pop() || '' : '').toLowerCase();
  if (!ALLOWED_SYLLABUS_EXTENSIONS.includes(ext as (typeof ALLOWED_SYLLABUS_EXTENSIONS)[number])) {
    return {
      valid: false,
      extension: ext,
      mimeType: file.type,
      error: `Unsupported file type ".${ext || 'unknown'}". Allowed formats: PDF, DOCX, DOC, XLSX, PPTX, PNG, JPG, WEBP.`,
    };
  }
  if (file.size <= 0) {
    return {
      valid: false,
      extension: ext,
      mimeType: file.type,
      error: 'Selected file is empty.',
    };
  }
  if (file.size > MAX_SYLLABUS_FILE_BYTES) {
    return {
      valid: false,
      extension: ext,
      mimeType: file.type,
      error: `File exceeds the 15 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }
  const canonicalMime = file.type || ALLOWED_SYLLABUS_MIME_MAP[ext] || 'application/octet-stream';
  return {
    valid: true,
    extension: ext,
    mimeType: canonicalMime,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadViaFirebaseStorage(
  file: File,
  storagePath: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || undefined,
    });

    // Guard against hanging if bucket is not enabled in the sandbox project
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          task.cancel();
        } catch {
          // ignore
        }
        reject(new Error('Firebase Storage upload timed out.'));
      }
    }, 12000);

    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0 && onProgress) {
          onProgress(Math.min(95, Math.round((snap.bytesTransferred / snap.totalBytes) * 100)));
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          reject(err);
        }
      },
      async () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            onProgress?.(100);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        }
      }
    );
  });
}

/**
 * Confirmed Storage Strategy:
 * 1) Attempts Firebase Storage first under syllabuses/{courseId}/{syllabusId}/v{versionNumber}/{fileName}
 * 2) Automatically falls back to the authenticated Express /api/uploads/syllabus endpoint if Storage is unreachable.
 */
export async function uploadSyllabusDocumentWithFallback(params: {
  file: File;
  courseId: string;
  syllabusId: string;
  versionNumber: number;
  uploadedByUid: string;
  uploadedByName: string;
  onProgress?: (percent: number) => void;
}): Promise<SyllabusAttachment> {
  const { file, courseId, syllabusId, versionNumber, uploadedByUid, uploadedByName, onProgress } =
    params;

  const check = validateSyllabusFile(file);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid syllabus file.');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
  const now = new Date().toISOString();

  // Attempt 1: Firebase Storage
  try {
    onProgress?.(10);
    const storagePath = `syllabuses/${courseId}/${syllabusId}/v${versionNumber}/${Date.now()}_${safeName}`;
    const url = await uploadViaFirebaseStorage(file, storagePath, onProgress);
    return {
      fileId: `fs_${Date.now().toString(36)}`,
      fileName: safeName,
      mimeType: check.mimeType,
      extension: check.extension,
      sizeBytes: file.size,
      url,
      storageProvider: 'firebase_storage',
      uploadedAt: now,
      uploadedByUid,
      uploadedByName,
    };
  } catch (storageErr) {
    console.warn('Firebase Storage unavailable, switching to authenticated server fallback:', storageErr);
  }

  // Attempt 2: Authenticated Express Server Fallback
  onProgress?.(35);
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('You must be signed in to upload syllabus documents.');
  }
  const base64Data = await fileToBase64(file);
  onProgress?.(65);

  const resp = await fetch('/api/uploads/syllabus', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fileName: safeName,
      mimeType: check.mimeType,
      courseId,
      base64Data,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error || 'Syllabus document upload failed.');
  }

  onProgress?.(100);
  return {
    fileId: data.fileId,
    fileName: data.fileName || safeName,
    mimeType: data.mimeType || check.mimeType,
    extension: data.extension || check.extension,
    sizeBytes: data.sizeBytes || file.size,
    url: data.url,
    storageProvider: 'server_fallback',
    uploadedAt: now,
    uploadedByUid,
    uploadedByName,
  };
}

export function reorderSyllabusModules(
  modules: SyllabusModule[],
  fromIndex: number,
  toIndex: number
): SyllabusModule[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= modules.length ||
    toIndex >= modules.length ||
    fromIndex === toIndex
  ) {
    return modules;
  }
  const copy = [...modules];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy.map((m, idx) => ({
    ...m,
    moduleNumber: idx + 1,
  }));
}

export function countSyllabusTopics(modules: SyllabusModule[]): number {
  return modules.reduce((sum, m) => sum + (m.topics?.length || 0), 0);
}

/**
 * Computes explicit student syllabus progress across topics, practical activities,
 * assignments, and modules (for modules without granular sub-items).
 * Opening a PDF never modifies these arrays.
 */
export function computeModuleProgressMetrics(
  modules: SyllabusModule[],
  completed: {
    completedModuleIds: string[];
    completedTopicIds: string[];
    completedActivityIds: string[];
    completedAssignmentIds: string[];
  }
): {
  totalTrackableItems: number;
  completedTrackableItems: number;
  progressPercent: number;
} {
  const modSet = new Set(completed.completedModuleIds);
  const topicSet = new Set(completed.completedTopicIds);
  const actSet = new Set(completed.completedActivityIds);
  const assignSet = new Set(completed.completedAssignmentIds);

  let total = 0;
  let done = 0;

  for (const mod of modules) {
    const topics = mod.topics || [];
    const activities = mod.practicalActivities || [];
    const assignments = mod.assignments || [];
    const subTotal = topics.length + activities.length + assignments.length;

    if (subTotal === 0) {
      total += 1;
      if (modSet.has(mod.id)) done += 1;
    } else {
      for (const t of topics) {
        total += 1;
        if (topicSet.has(t.id)) done += 1;
      }
      activities.forEach((_act, idx) => {
        total += 1;
        if (actSet.has(`${mod.id}_act_${idx}`)) done += 1;
      });
      assignments.forEach((_asg, idx) => {
        total += 1;
        if (assignSet.has(`${mod.id}_asg_${idx}`)) done += 1;
      });
    }
  }

  const progressPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return {
    totalTrackableItems: total,
    completedTrackableItems: done,
    progressPercent,
  };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function createStarterModulesFromCourseTopics(topics: string[] = []): SyllabusModule[] {
  if (!topics || topics.length === 0) {
    return [
      {
        id: `mod_${Date.now().toString(36)}_1`,
        moduleNumber: 1,
        title: 'Module 01 — Foundation & Core Concepts',
        description: 'Introduction to core frameworks, tools, and professional workflows.',
        duration: '2 Weeks',
        learningOutcomes: ['Understand foundational principles and industry standards'],
        topics: [
          {
            id: `top_${Date.now().toString(36)}_1`,
            title: 'Orientation & Environment Setup',
            subtopics: ['Workspace overview', 'Core terminology'],
          },
        ],
        practicalActivities: ['Guided hands-on lab exercise'],
        assignments: ['Foundation diagnostic reflection'],
        recommendedResources: ['Official TECHMAN COLLEGE Course Handbook'],
      },
    ];
  }

  return topics.map((t, idx) => ({
    id: `mod_seed_${idx + 1}`,
    moduleNumber: idx + 1,
    title: t,
    description: `Structured curriculum unit covering ${t}.`,
    duration: '2 Weeks',
    learningOutcomes: [`Demonstrate practical proficiency in ${t}`],
    topics: [
      {
        id: `top_seed_${idx + 1}_1`,
        title: `${t} — Core Concepts & Workshop`,
        subtopics: ['Key principles', 'Applied demonstration'],
      },
    ],
    practicalActivities: [`Hands-on workshop: ${t}`],
    assignments: [`Module ${String(idx + 1).padStart(2, '0')} Practical Assessment`],
    recommendedResources: [],
  }));
}

export function isValidProgressRecord(rec?: ModuleProgressRecord | null): rec is ModuleProgressRecord {
  return Boolean(rec && rec.userId && rec.courseId);
}

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}
