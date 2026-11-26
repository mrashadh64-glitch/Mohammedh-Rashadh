export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'BRANCH_MANAGER'
  | 'COORDINATOR'
  | 'ADMISSION_OFFICER'
  | 'ACADEMIC_MANAGER'
  | 'LECTURER'
  | 'ACCOUNTANT'
  | 'EXAMINER'
  | 'CONTENT_MANAGER'
  | 'STUDENT'
  | 'AFFILIATE'
  | 'SUPPORT_STAFF';

export type PermissionKey =
  | 'dashboard.owner'
  | 'students.manage'
  | 'lecturers.manage'
  | 'staff.manage'
  | 'branches.manage'
  | 'courses.manage'
  | 'admissions.manage'
  | 'attendance.manage'
  | 'assignments.manage'
  | 'exams.manage'
  | 'finance.manage'
  | 'certificates.manage'
  | 'cms.manage'
  | 'affiliates.manage'
  | 'ai.ceo'
  | 'ai.tutor'
  | 'ai.exam'
  | 'ai.career'
  | 'library.manage'
  | 'community.moderate'
  | 'audit.view'
  | 'settings.manage';

export interface RolePermissionConfig {
  role: UserRole;
  label: string;
  description: string;
  permissions: PermissionKey[];
  updatedAt?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  designation?: string;
  studentId?: string;
  lecturerId?: string;
  branchId?: string;
  institutionId: string;
  accountStatus: 'active' | 'suspended' | 'pending';
  xpPoints?: number;
  streakDays?: number;
  level?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserPrivatePII {
  uid: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  guardianName?: string;
  guardianPhone?: string;
  qualifications?: string;
  specialization?: string;
  updatedAt?: string;
}

export interface RoleInvitation {
  id?: string;
  email: string;
  fullName?: string;
  role: UserRole;
  branchId?: string;
  studentId?: string;
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: string;
  institutionId: string;
  createdAt?: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  city: string;
  address?: string;
  phone?: string;
  managerName?: string;
  coordinatorName?: string;
  status: 'active' | 'inactive';
  institutionId: string;
  createdAt?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  category: 'Certificate' | 'Diploma';
  domain?: string;
  description?: string;
  imageUrl?: string;
  level?: string;
  duration: string;
  mode: 'Online' | 'Physical' | 'Hybrid';
  courseFeeLkr: number;
  registrationFeeLkr?: number;
  certificateFeeLkr?: number;
  installmentPlan?: string;
  lecturerId?: string;
  lecturerName?: string;
  batchName?: string;
  startDate?: string;
  endDate?: string;
  maxStudents?: number;
  entryRequirements?: string;
  learningOutcomes?: string[];
  syllabusTopics?: string[];
  certificateEligible?: boolean;
  status: 'published' | 'draft' | 'archived';
  institutionId: string;
  updatedAt?: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleTitle: string;
  title: string;
  type: 'video' | 'live' | 'pdf' | 'audio' | 'reading';
  durationMinutes?: number;
  orderIndex: number;
  videoUrl?: string;
  resourceUrl?: string;
  summary?: string;
  published: boolean;
  updatedAt?: string;
}

export type ApplicationStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Documents Required'
  | 'Approved'
  | 'Rejected'
  | 'Payment Pending'
  | 'Enrolled';

export interface Application {
  id: string;
  applicationNumber: string;
  fullName: string;
  email: string;
  phone: string;
  whatsapp?: string;
  courseId: string;
  courseName: string;
  preferredMode: 'Online' | 'Physical' | 'Hybrid';
  branchId?: string;
  batchName?: string;
  highestQualification?: string;
  documentNotes?: string;
  referralCode?: string;
  status: ApplicationStatus;
  rejectionReason?: string;
  assignedStudentId?: string;
  leadId?: string;
  institutionId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApplicationTracker {
  applicationNumber: string;
  applicantInitials?: string;
  courseName: string;
  status: ApplicationStatus;
  assignedStudentId?: string;
  updatedAt?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  branchId?: string;
  batchName?: string;
  progressPercent?: number;
  status: 'active' | 'completed' | 'suspended';
  leadId?: string;
  institutionId: string;
  enrolledAt?: string;
}

export interface LearningProgress {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
  lastPositionSec?: number;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  courseId: string;
  courseName?: string;
  batchName?: string;
  branchId?: string;
  date: string;
  userId: string;
  studentId: string;
  studentName: string;
  mode: 'Online' | 'Physical' | 'QR';
  status: 'Present' | 'Late' | 'Absent' | 'Excused';
  markedBy: string;
  correctionReason?: string;
  updatedAt?: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  courseName?: string;
  title: string;
  instructions?: string;
  dueDate: string;
  maxMarks: number;
  createdBy: string;
  createdAt?: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle?: string;
  courseId: string;
  userId: string;
  studentName: string;
  submissionUrl?: string;
  notes?: string;
  status: 'Submitted' | 'Late' | 'Evaluated' | 'Resubmit Requested';
  marks?: number;
  feedback?: string;
  evaluatedBy?: string;
  updatedAt?: string;
}

export interface ExamQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  difficulty?: string;
}

export interface Examination {
  id: string;
  courseId: string;
  courseName?: string;
  title: string;
  durationMinutes: number;
  passPercent: number;
  questions?: ExamQuestion[];
  approvalStatus: 'draft' | 'approved' | 'archived';
  aiAssisted?: boolean;
  createdBy: string;
  approvedBy?: string;
  updatedAt?: string;
}

export interface ExamResult {
  id: string;
  examId: string;
  examTitle?: string;
  courseId: string;
  userId: string;
  studentName: string;
  autoScorePercent: number;
  finalScorePercent?: number;
  grade?: string;
  passed?: boolean;
  resultStatus: 'pending_approval' | 'published';
  aiFeedbackDraft?: string;
  approvedBy?: string;
  submittedAt?: string;
}

export interface Payment {
  id: string;
  userId: string;
  studentId?: string;
  studentName: string;
  courseId?: string;
  courseName: string;
  branchId?: string;
  feeType: 'Registration' | 'Course Fee' | 'Installment' | 'Certificate Fee';
  amountLkr: number;
  method: 'Cash' | 'Bank Transfer' | 'Card' | 'Online Gateway' | 'QR Payment';
  referenceNo?: string;
  proofNotes?: string;
  status: 'Pending Verification' | 'Verified' | 'Rejected' | 'Refunded';
  receiptNumber?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  institutionId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  branchId?: string;
  amountLkr: number;
  date: string;
  recordedBy: string;
  institutionId: string;
}

export interface Certificate {
  certificateNumber: string;
  userId?: string;
  studentId?: string;
  studentName: string;
  courseId?: string;
  courseName: string;
  category?: 'Certificate' | 'Diploma';
  completionDate?: string;
  issueDate: string;
  issuingInstitution: string;
  signatoryName?: string;
  status: 'Issued' | 'Revoked' | 'Reissued';
  revocationReason?: string;
  issuedBy?: string;
  institutionId: string;
}

export interface LibraryResource {
  id: string;
  title: string;
  category: string;
  courseId?: string;
  resourceType: 'E-Book' | 'PDF Notes' | 'Template' | 'Recorded Lecture' | 'Project Brief';
  version?: string;
  url?: string;
  summary?: string;
  accessLevel: 'public' | 'enrolled';
  uploadedBy: string;
  updatedAt?: string;
}

export interface CommunityPost {
  id: string;
  userId: string;
  authorName: string;
  authorRole?: string;
  courseId?: string;
  postType: 'Discussion' | 'Lecturer Q&A' | 'Project Showcase' | 'Announcement';
  title: string;
  body: string;
  projectUrl?: string;
  moderatedStatus: 'active' | 'reported' | 'hidden';
  likesCount?: number;
  createdAt?: string;
}

export interface AffiliateRecord {
  userId: string;
  partnerName: string;
  referralCode: string;
  commissionRatePercent: number;
  leadsCount?: number;
  conversionsCount?: number;
  pendingCommissionLkr?: number;
  approvedCommissionLkr?: number;
  withdrawalRequestedLkr?: number;
  status: 'active' | 'pending_review' | 'suspended';
  updatedAt?: string;
}

export interface CmsItem {
  id: string;
  itemType: 'News' | 'Event' | 'Story' | 'FAQ' | 'Poster' | 'Banner';
  title: string;
  summary: string;
  category?: string;
  imageUrl?: string;
  eventDate?: string;
  aiSuggestedTags?: string[];
  status: 'draft' | 'published';
  createdBy?: string;
  institutionId: string;
  updatedAt?: string;
}

export interface AIConversation {
  id: string;
  userId: string;
  courseId?: string;
  language: 'English' | 'Tamil' | 'Sinhala';
  prompt: string;
  response: string;
  createdAt?: string;
}

export interface CareerProfile {
  userId: string;
  headline: string;
  bio?: string;
  skills?: string[];
  portfolioUrl?: string;
  targetRole?: string;
  aiResumeDraft?: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  category?: string;
  read: boolean;
  createdAt?: string;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: 'new' | 'responded' | 'closed';
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
  institutionId: string;
  createdAt?: string;
}

export interface SystemSettings {
  institutionId: string;
  instituteName: string;
  platformName?: string;
  website?: string;
  contactPhone?: string;
  currency: string;
  academicIntake: string;
  defaultAffiliateCommissionPercent?: number;
  xpPerLesson?: number;
  xpPerAssignment?: number;
  publicTenantRegistrationEnabled?: boolean;
  catalogInitialized?: boolean;
  updatedAt?: string;
}

export interface MigratedStudentRecord {
  id: string;
  studentId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  whatsapp?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  guardianName?: string;
  guardianContact?: string;
  courseId?: string;
  courseName?: string;
  courseCode?: string;
  branchId?: string;
  branchName?: string;
  batchName?: string;
  admissionDate?: string;
  academicYear: string;
  registrationFeeLkr?: number;
  courseFeeLkr?: number;
  amountPaidLkr?: number;
  outstandingBalanceLkr?: number;
  paymentStatus?: string;
  legacyPaymentStatus?: 'none' | 'legacy_imported_pending_reconciliation' | 'reconciled';
  studentStatus: string;
  additionalInfo?: string;
  customFieldsJson?: string;
  importBatchId: string;
  sourceFileName: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  importedByEmail: string;
  importedAt: string;
  accountActivationStatus: 'not_activated' | 'invited' | 'activated';
  invitationId?: string;
  isMigrated: boolean;
  institutionId: string;
  updatedAt?: string;
}

export interface MigrationBatch {
  id: string;
  sourceFileName: string;
  sourceSheetName: string;
  academicYear: string;
  idPrefix: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  duplicateCount: number;
  createdRecordIds: string[];
  backupSnapshotSummary?: string;
  status: 'completed' | 'rolled_back';
  importedByUid: string;
  importedByEmail: string;
  importedAt: string;
  rolledBackAt?: string;
  institutionId: string;
}

export interface SpecialProgrammeModule {
  number: string;
  title: string;
  shortDescription: string;
  iconKey: string;
  details?: string;
  relatedCourseId?: string;
  relatedDomain?: string;
}

export interface SpecialProgramme {
  id: string;
  slug: string;
  title: string;
  theme: string;
  description?: string;
  feeBadge: string;
  feeSummary: string;
  schedule: string;
  availability: string;
  programmeType: string;
  deliveryLocation: string;
  trainerName: string;
  trainerPosition: string;
  trainerTitle: string;
  trainerPhotoUrl?: string;
  trainerBio?: string;
  posterUrl?: string;
  galleryUrls?: string[];
  modules: SpecialProgrammeModule[];
  benefits: string[];
  status: 'published' | 'draft';
  institutionId: string;
  updatedAt?: string;
}

export interface ProgrammeEnquiry {
  id: string;
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
  status: 'new' | 'reviewed' | 'scheduled' | 'completed' | 'declined';
  adminNotes?: string;
  institutionId: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================
// MODULE 1: LEAD MANAGEMENT & BULK IMPORT CRM
// ============================================================

export type LeadStatus =
  | 'New Lead'
  | 'Contacted'
  | 'Follow-up Required'
  | 'Interested'
  | 'Application Started'
  | 'Converted to Student'
  | 'Not Interested'
  | 'Lost'
  | 'Invalid Contact';

export type LeadPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface LeadRecord {
  id: string;
  leadId: string;
  // Personal
  fullName: string;
  mobile: string;
  normalizedMobile?: string;
  whatsapp?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  district?: string;
  // Academic
  interestedCourseId?: string;
  interestedCourseName?: string;
  courseCategory?: string;
  preferredBranchId?: string;
  preferredBranchName?: string;
  preferredStudyMode?: 'Online' | 'Physical' | 'Hybrid' | '';
  educationQualification?: string;
  academicYear?: string;
  // Marketing
  leadSource?: string;
  campaignName?: string;
  adReference?: string;
  socialMediaPlatform?: string;
  referralName?: string;
  enquiryDate?: string;
  // Follow-up & Pipeline
  status: LeadStatus;
  assignedToUid?: string;
  assignedToName?: string;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  followUpNotes?: string;
  priority?: LeadPriority;
  notInterestedReason?: string;
  // Conversion & Audit
  convertedApplicationId?: string;
  convertedStudentId?: string;
  convertedAt?: string;
  convertedByUid?: string;
  convertedByName?: string;
  importBatchId?: string;
  archived?: boolean;
  createdByUid?: string;
  institutionId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  leadCode?: string;
  actionType:
    | 'created'
    | 'status_change'
    | 'note_added'
    | 'assigned'
    | 'call_logged'
    | 'whatsapp_opened'
    | 'converted'
    | 'merged'
    | 'edited'
    | 'archived';
  previousStatus?: string;
  newStatus?: string;
  note: string;
  actorUid: string;
  actorName: string;
  actorRole?: string;
  branchId?: string;
  institutionId: string;
  createdAt: string;
}

export interface LeadImportBatch {
  id: string;
  fileName: string;
  sheetName?: string;
  totalRows: number;
  importedCount: number;
  mergedCount: number;
  skippedDuplicates: number;
  errorCount: number;
  backupExported: boolean;
  importedByUid: string;
  importedByEmail: string;
  institutionId: string;
  createdAt: string;
}

// ============================================================
// MODULE 2: COURSE SYLLABUS UPLOAD, BUILDER, VERSIONING & PROGRESS
// ============================================================

export type SyllabusApprovalStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Approved'
  | 'Published'
  | 'Archived';

export interface SyllabusAttachment {
  fileId: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  url: string;
  storageProvider: 'firebase_storage' | 'server_fallback' | 'external_link';
  uploadedAt: string;
  uploadedByUid: string;
  uploadedByName: string;
}

export interface SyllabusTopic {
  id: string;
  title: string;
  subtopics: string[];
}

export interface SyllabusModule {
  id: string;
  moduleNumber: number;
  title: string;
  description?: string;
  duration?: string;
  learningOutcomes: string[];
  topics: SyllabusTopic[];
  practicalActivities: string[];
  assignments: string[];
  recommendedResources: string[];
}

export interface SyllabusRecord {
  id: string;
  syllabusId: string;
  courseId: string;
  courseCode?: string;
  courseName: string;
  programmeName?: string;
  academicYear: string;
  totalCourseDuration?: string;
  latestVersionNumber: number;
  publishedVersionNumber?: number;
  publishedVersionId?: string;
  latestVersionId?: string;
  approvalStatus: SyllabusApprovalStatus;
  publishedStatus: 'unpublished' | 'published' | 'archived';
  moduleCount: number;
  topicCount?: number;
  hasFileAttachment?: boolean;
  latestFileName?: string;
  latestFileUrl?: string;
  latestFileMimeType?: string;
  announcementNote?: string;
  uploadedByUid: string;
  uploadedByName: string;
  approvedByUid?: string;
  approvedByName?: string;
  institutionId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SyllabusVersionRecord {
  id: string;
  syllabusId: string;
  courseId: string;
  courseName: string;
  programmeName?: string;
  academicYear: string;
  versionNumber: number;
  status: SyllabusApprovalStatus;
  changeSummary?: string;
  totalCourseDuration?: string;
  finalAssessment?: string;
  announcementNote?: string;
  attachment?: SyllabusAttachment | null;
  supportingResources?: SyllabusAttachment[];
  modules: SyllabusModule[];
  restoredFromVersion?: number;
  createdByUid: string;
  createdByName: string;
  createdByRole?: string;
  approvedByUid?: string;
  approvedByName?: string;
  publishedAt?: string;
  institutionId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ModuleProgressRecord {
  id: string;
  userId: string;
  courseId: string;
  syllabusId: string;
  versionNumber?: number;
  completedModuleIds: string[];
  completedTopicIds: string[];
  completedActivityIds: string[];
  completedAssignmentIds: string[];
  totalTrackableItems: number;
  completedTrackableItems: number;
  progressPercent: number;
  institutionId: string;
  updatedAt: string;
}


