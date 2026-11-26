import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  Application,
  ApplicationTracker,
  Certificate,
  Course,
  ProgrammeEnquiry,
  SpecialProgramme,
  UserPrivatePII,
  UserProfile,
  UserRole,
} from '../types/lms';
import {
  DEFAULT_FREE_SKILL_PROGRAMME,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_SYSTEM_SETTINGS,
  INSTITUTE_INFO,
  isProtectedOwnerEmail,
  SEED_BRANCHES,
  SEED_CMS_ITEMS,
  SEED_COURSES,
} from '../data/catalogSeed';

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${stamp}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function formatLkr(amount: number | undefined): string {
  const safe = Number.isFinite(amount) ? Number(amount) : 0;
  return `LKR ${safe.toLocaleString('en-LK')}`;
}

export async function logAuditEvent(params: {
  actorUid: string;
  actorEmail: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}): Promise<void> {
  const logId = makeSafeId('AUD');
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      actorUid: params.actorUid,
      actorEmail: params.actorEmail.slice(0, 160),
      actorRole: (params.actorRole || 'USER').slice(0, 40),
      action: params.action.slice(0, 120),
      targetType: params.targetType.slice(0, 64),
      targetId: (params.targetId || '').slice(0, 128),
      details: (params.details || '').slice(0, 600),
      institutionId: INSTITUTE_INFO.institutionId,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Audit log write skipped:', err);
  }
}

export async function activateOrLoadUserProfile(firebaseUser: User): Promise<{
  profile: UserProfile;
  pii: UserPrivatePII;
}> {
  const uid = firebaseUser.uid;
  const email = (firebaseUser.email || '').toLowerCase();
  const isOwner = isProtectedOwnerEmail(email) && firebaseUser.emailVerified;
  const now = new Date().toISOString();

  const userRef = doc(db, 'users', uid);
  const piiRef = doc(db, 'users', uid, 'private', 'pii');

  let existingProfile: UserProfile | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingProfile = snap.data() as UserProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  // If this is one of the two protected Owner / CEO accounts, guarantee SUPER_ADMIN & /admins/{uid}
  if (isOwner) {
    const ownerProfile: UserProfile = {
      uid,
      displayName: firebaseUser.displayName || existingProfile?.displayName || 'Owner / CEO',
      photoURL: firebaseUser.photoURL || existingProfile?.photoURL || '',
      role: 'SUPER_ADMIN',
      designation: 'OWNER / CEO',
      branchId: existingProfile?.branchId || 'branch-colombo-hq',
      institutionId: INSTITUTE_INFO.institutionId,
      accountStatus: 'active',
      xpPoints: existingProfile?.xpPoints ?? 0,
      streakDays: existingProfile?.streakDays ?? 1,
      level: existingProfile?.level ?? 1,
      createdAt: existingProfile?.createdAt || now,
      updatedAt: now,
    };

    try {
      await setDoc(userRef, ownerProfile, { merge: true });
      await setDoc(
        doc(db, 'admins', uid),
        {
          uid,
          email,
          role: 'SUPER_ADMIN',
          branchId: 'branch-colombo-hq',
          protectedOwner: true,
          updatedAt: now,
        },
        { merge: true }
      );
      await setDoc(
        piiRef,
        {
          uid,
          email,
          phone: INSTITUTE_INFO.phone,
          whatsapp: INSTITUTE_INFO.phone,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }

    return {
      profile: ownerProfile,
      pii: { uid, email, phone: INSTITUTE_INFO.phone, whatsapp: INSTITUTE_INFO.phone, updatedAt: now },
    };
  }

  // Non-owner verified user: check if profile exists, otherwise create safe STUDENT profile
  if (!existingProfile) {
    const assignedRole: UserRole = 'STUDENT';
    const newProfile: UserProfile = {
      uid,
      displayName: (firebaseUser.displayName || email.split('@')[0] || 'Student').slice(0, 120),
      photoURL: (firebaseUser.photoURL || '').slice(0, 500),
      role: assignedRole,
      designation: 'Student',
      branchId: 'branch-online-global',
      institutionId: INSTITUTE_INFO.institutionId,
      accountStatus: 'active',
      xpPoints: 25,
      streakDays: 1,
      level: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(userRef, newProfile);
      await setDoc(piiRef, {
        uid,
        email,
        updatedAt: now,
      });

      // Check if an admin invited this email for activation tracking
      const invQ = query(collection(db, 'roleInvitations'), where('email', '==', email));
      const invSnap = await getDocs(invQ);
      for (const invDoc of invSnap.docs) {
        if (invDoc.data().status === 'pending') {
          await updateDoc(invDoc.ref, { status: 'accepted' });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }

    return {
      profile: newProfile,
      pii: { uid, email, updatedAt: now },
    };
  }

  // Load isolated PII
  let piiData: UserPrivatePII = { uid, email };
  try {
    const piiSnap = await getDoc(piiRef);
    if (piiSnap.exists()) {
      piiData = piiSnap.data() as UserPrivatePII;
    } else {
      await setDoc(piiRef, { uid, email, updatedAt: now });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/private/pii`);
  }

  return { profile: existingProfile, pii: piiData };
}

export async function initialize2027InstituteCatalog(actorUid: string, actorEmail: string): Promise<void> {
  const now = new Date().toISOString();
  const batch = writeBatch(db);

  // 1. Seed 32 official courses
  for (const course of SEED_COURSES) {
    const ref = doc(db, 'courses', course.id);
    batch.set(
      ref,
      {
        code: course.code,
        name: course.name,
        category: course.category,
        domain: course.domain || 'General',
        description: course.description || '',
        imageUrl: course.imageUrl || '',
        level: course.level || '',
        duration: course.duration,
        mode: course.mode,
        courseFeeLkr: course.courseFeeLkr,
        registrationFeeLkr: course.registrationFeeLkr ?? 3000,
        certificateFeeLkr: course.certificateFeeLkr ?? 2500,
        installmentPlan: course.installmentPlan || '',
        lecturerName: course.lecturerName || 'TECHMAN COLLEGE Senior Faculty',
        batchName: course.batchName || '2027 Intake — Batch 01',
        startDate: course.startDate || '2027-01-18',
        endDate: course.endDate || '2027-07-30',
        maxStudents: course.maxStudents ?? 45,
        entryRequirements: course.entryRequirements || '',
        learningOutcomes: course.learningOutcomes || [],
        syllabusTopics: course.syllabusTopics || [],
        certificateEligible: true,
        status: 'published',
        institutionId: INSTITUTE_INFO.institutionId,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  // 2. Seed initial branches
  for (const branch of SEED_BRANCHES) {
    batch.set(doc(db, 'branches', branch.id), { ...branch, createdAt: now }, { merge: true });
  }

  // 3. Seed 13 role permission configurations
  for (const rp of DEFAULT_ROLE_PERMISSIONS) {
    batch.set(doc(db, 'rolePermissions', rp.role), { ...rp, updatedAt: now }, { merge: true });
  }

  // 4. Seed initial CMS news, events, FAQs, and stories
  for (const item of SEED_CMS_ITEMS) {
    batch.set(doc(db, 'cmsItems', item.id), { ...item, createdBy: actorUid, updatedAt: now }, { merge: true });
  }

  // 5. System settings
  batch.set(
    doc(db, 'systemSettings', INSTITUTE_INFO.institutionId),
    {
      ...DEFAULT_SYSTEM_SETTINGS,
      catalogInitialized: true,
      updatedAt: now,
    },
    { merge: true }
  );

  try {
    await batch.commit();

    // 6. Duplicate-safe check before seeding TECHMAN FREE SKILL DEVELOPMENT PROGRAMME
    await ensureSpecialProgrammeExists(actorUid, actorEmail);

    // Add initial sample lessons for flagship courses so LMS player works immediately
    const flagshipCourses: Course[] = SEED_COURSES.slice(0, 6);
    const lessonBatch = writeBatch(db);
    for (const c of flagshipCourses) {
      const topics = (c.syllabusTopics || []).slice(0, 4);
      topics.forEach((topic, idx) => {
        const lessonId = `lesson-${idx + 1}`;
        lessonBatch.set(
          doc(db, 'courses', c.id, 'lessons', lessonId),
          {
            courseId: c.id,
            moduleTitle: `Module 0${idx + 1}`,
            title: topic,
            type: idx % 2 === 0 ? 'video' : 'pdf',
            durationMinutes: 35 + idx * 10,
            orderIndex: idx + 1,
            videoUrl: '',
            resourceUrl: '',
            summary: `Core 2027 syllabus session for ${c.name}: ${topic}. Includes hands-on lab tasks and lecturer commentary.`,
            published: true,
            updatedAt: now,
          },
          { merge: true }
        );
      });
    }
    await lessonBatch.commit();

    await logAuditEvent({
      actorUid,
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      action: 'INITIALIZE_2027_CATALOG',
      targetType: 'courses',
      targetId: INSTITUTE_INFO.institutionId,
      details: 'Initialized 32 official 2027 courses, 3 branches, 13 RBAC role configs, and initial CMS entries.',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'courses');
  }
}

export async function submitPublicApplication(input: {
  fullName: string;
  email: string;
  phone: string;
  whatsapp?: string;
  courseId: string;
  courseName: string;
  preferredMode: 'Online' | 'Physical' | 'Hybrid';
  branchId?: string;
  highestQualification?: string;
  documentNotes?: string;
  referralCode?: string;
}): Promise<{ applicationNumber: string; id: string }> {
  const numPart = Math.floor(1000 + Math.random() * 9000);
  const applicationNumber = `TM-2027-${numPart}`;
  const id = applicationNumber;
  const now = new Date().toISOString();

  const initials = input.fullName
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 6);

  const appDoc: Omit<Application, 'id'> = {
    applicationNumber,
    fullName: input.fullName.trim().slice(0, 120),
    email: input.email.trim().toLowerCase().slice(0, 160),
    phone: input.phone.trim().slice(0, 32),
    whatsapp: (input.whatsapp || input.phone).trim().slice(0, 32),
    courseId: input.courseId,
    courseName: input.courseName.slice(0, 160),
    preferredMode: input.preferredMode,
    branchId: input.branchId || 'branch-colombo-hq',
    batchName: '2027 Intake — Batch 01',
    highestQualification: (input.highestQualification || '').slice(0, 160),
    documentNotes: (input.documentNotes || '').slice(0, 400),
    referralCode: (input.referralCode || '').trim().toUpperCase().slice(0, 40),
    status: 'Submitted',
    institutionId: INSTITUTE_INFO.institutionId,
    createdAt: now,
    updatedAt: now,
  };

  const trackerDoc: ApplicationTracker = {
    applicationNumber,
    applicantInitials: initials,
    courseName: appDoc.courseName,
    status: 'Submitted',
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'applications', id), appDoc);
    await setDoc(doc(db, 'applicationTrackers', applicationNumber), trackerDoc);
    return { applicationNumber, id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `applications/${id}`);
  }
}

export async function trackApplicationByNumber(appNumber: string): Promise<ApplicationTracker | null> {
  const cleaned = appNumber.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleaned) return null;
  try {
    const snap = await getDoc(doc(db, 'applicationTrackers', cleaned));
    if (!snap.exists()) return null;
    return snap.data() as ApplicationTracker;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `applicationTrackers/${cleaned}`);
  }
}

export async function verifyCertificateByNumber(certNumber: string): Promise<Certificate | null> {
  const cleaned = certNumber.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleaned) return null;
  try {
    const snap = await getDoc(doc(db, 'certificates', cleaned));
    if (!snap.exists()) return null;
    return snap.data() as Certificate;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `certificates/${cleaned}`);
  }
}

export async function getSpecialProgrammeBySlug(
  slug = 'free-skill-development'
): Promise<SpecialProgramme> {
  try {
    const snap = await getDoc(doc(db, 'specialProgrammes', slug));
    if (snap.exists()) {
      const data = snap.data() as Omit<SpecialProgramme, 'id'>;
      return { id: snap.id, ...data };
    }
  } catch {
    // Fall back cleanly to default structured programme if not yet initialized in Firestore
  }
  return DEFAULT_FREE_SKILL_PROGRAMME;
}

export async function ensureSpecialProgrammeExists(
  actorUid: string,
  actorEmail: string
): Promise<boolean> {
  const ref = doc(db, 'specialProgrammes', DEFAULT_FREE_SKILL_PROGRAMME.slug);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      return false; // Already exists — never overwrite or duplicate
    }
    const { id: _ignore, ...payload } = DEFAULT_FREE_SKILL_PROGRAMME;
    await setDoc(ref, {
      ...payload,
      updatedAt: new Date().toISOString(),
    });
    await logAuditEvent({
      actorUid,
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      action: 'CREATE_SPECIAL_PROGRAMME',
      targetType: 'specialProgrammes',
      targetId: DEFAULT_FREE_SKILL_PROGRAMME.slug,
      details: `Initialized ${DEFAULT_FREE_SKILL_PROGRAMME.title} in Firestore without duplication.`,
    });
    return true;
  } catch (err) {
    console.warn('Special programme existence check skipped:', err);
    return false;
  }
}

export async function saveSpecialProgramme(
  programme: SpecialProgramme,
  actorUid: string,
  actorEmail: string
): Promise<void> {
  const slug = programme.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'free-skill-development';
  const now = new Date().toISOString();
  const payload = {
    slug: slug.slice(0, 80),
    title: programme.title.trim().slice(0, 180),
    theme: programme.theme.trim().slice(0, 240),
    description: (programme.description || '').trim().slice(0, 2000),
    feeBadge: programme.feeBadge.trim().slice(0, 80),
    feeSummary: programme.feeSummary.trim().slice(0, 500),
    schedule: programme.schedule.trim().slice(0, 120),
    availability: programme.availability.trim().slice(0, 120),
    programmeType: programme.programmeType.trim().slice(0, 120),
    deliveryLocation: programme.deliveryLocation.trim().slice(0, 200),
    trainerName: programme.trainerName.trim().slice(0, 120),
    trainerPosition: programme.trainerPosition.trim().slice(0, 160),
    trainerTitle: programme.trainerTitle.trim().slice(0, 160),
    trainerPhotoUrl: (programme.trainerPhotoUrl || '').trim().slice(0, 500),
    trainerBio: (programme.trainerBio || '').trim().slice(0, 1200),
    posterUrl: (programme.posterUrl || '').trim().slice(0, 500),
    galleryUrls: (programme.galleryUrls || []).filter(Boolean).slice(0, 12),
    modules: (programme.modules || []).slice(0, 24).map((m, idx) => ({
      number: (m.number || String(idx + 1).padStart(2, '0')).slice(0, 8),
      title: m.title.trim().slice(0, 100),
      shortDescription: m.shortDescription.trim().slice(0, 200),
      iconKey: (m.iconKey || 'cpu').slice(0, 32),
      details: (m.details || '').trim().slice(0, 500),
      relatedCourseId: (m.relatedCourseId || '').trim().slice(0, 128),
      relatedDomain: (m.relatedDomain || '').trim().slice(0, 80),
    })),
    benefits: (programme.benefits || []).map((b) => b.trim()).filter(Boolean).slice(0, 20),
    status: programme.status === 'draft' ? 'draft' : 'published',
    institutionId: INSTITUTE_INFO.institutionId,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'specialProgrammes', slug), payload);
    await logAuditEvent({
      actorUid,
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      action: 'UPDATE_SPECIAL_PROGRAMME',
      targetType: 'specialProgrammes',
      targetId: slug,
      details: `Updated ${payload.title} (${payload.modules.length} modules, status: ${payload.status}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `specialProgrammes/${slug}`);
  }
}

export async function submitProgrammeEnquiry(input: {
  programmeSlug: string;
  programmeTitle: string;
  institutionName: string;
  contactPerson: string;
  mobileNumber: string;
  email: string;
  institutionAddress: string;
  district: string;
  expectedParticipants: number;
  preferredDate: string;
  additionalMessage?: string;
}): Promise<{ id: string }> {
  const id = makeSafeId('FSD');
  const now = new Date().toISOString();
  const safeCount = Math.max(1, Math.min(10000, Math.round(Number(input.expectedParticipants) || 1)));

  const enquiryDoc: Omit<ProgrammeEnquiry, 'id'> = {
    programmeSlug: input.programmeSlug.trim().slice(0, 80),
    programmeTitle: input.programmeTitle.trim().slice(0, 180),
    institutionName: input.institutionName.trim().slice(0, 160),
    contactPerson: input.contactPerson.trim().slice(0, 120),
    mobileNumber: input.mobileNumber.trim().slice(0, 32),
    email: input.email.trim().toLowerCase().slice(0, 160),
    institutionAddress: input.institutionAddress.trim().slice(0, 300),
    district: input.district.trim().slice(0, 80),
    expectedParticipants: safeCount,
    preferredDate: input.preferredDate.trim().slice(0, 32),
    additionalMessage: (input.additionalMessage || '').trim().slice(0, 1500),
    status: 'new',
    institutionId: INSTITUTE_INFO.institutionId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'programmeEnquiries', id), enquiryDoc);

    // Notify Super Admin inbox in-app immediately
    const notifId = makeSafeId('NTF');
    await setDoc(doc(db, 'notifications', notifId), {
      userId: 'super-admin-inbox',
      title: `New Host Enquiry: ${enquiryDoc.institutionName}`.slice(0, 140),
      message: `${enquiryDoc.contactPerson} (${enquiryDoc.district}) requested ${enquiryDoc.programmeTitle} for ~${safeCount} participants on ${enquiryDoc.preferredDate}.`.slice(
        0,
        500
      ),
      category: 'programme_enquiry',
      read: false,
      createdAt: now,
    });

    return { id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `programmeEnquiries/${id}`);
  }
}

