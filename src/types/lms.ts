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
  slug?: string;
  name: string;
  category: 'Certificate' | 'Diploma';
  domain?: string;
  description?: string;
  imageUrl?: string;
  bannerUrl?: string;
  level?: string;
  duration: string;
  mode: 'Online' | 'Physical' | 'Hybrid';
  courseFeeLkr: number;
  feeConfigured?: boolean;
  isFree?: boolean;
  currency?: string;
  registrationFeeLkr?: number;
  certificateFeeLkr?: number;
  installmentPlan?: string;
  courseLanguage?: string;
  branchIds?: string[];
  admissionStatus?: 'open' | 'closing_soon' | 'closed' | 'upcoming';
  academicYear?: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
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
  batchFingerprint?: string;
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

// ============================================================
// MODULE 3: AI POSTER AUTOMATION, BRAND SETTINGS & CAMPAIGNS
// ============================================================

export type PosterSizePreset =
  | 'instagram_square'
  | 'instagram_portrait'
  | 'instagram_story'
  | 'facebook_landscape'
  | 'a4_print'
  | 'website_banner'
  | 'whatsapp_promo';

export type PosterType =
  | 'Course Admission Poster'
  | 'Free Course Poster'
  | 'Diploma Course Poster'
  | 'Certificate Course Poster'
  | 'Scholarship / Promotion Poster'
  | 'Registration Announcement Poster'
  | 'Social Media Ad Creative'
  | 'Instagram Post'
  | 'Instagram Story'
  | 'Facebook Post'
  | 'WhatsApp Promotion Poster'
  | 'Website Banner';

export type PosterTemplateStyle =
  | 'navy_executive'
  | 'electric_tech'
  | 'free_spotlight'
  | 'editorial_minimal';

export type PosterLanguage = 'English' | 'Tamil' | 'Sinhala' | 'Arabic';

export interface BrandSettings {
  institutionId: string;
  brandName: string;
  shortName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  lightSurfaceColor: string;
  logoUrl: string;
  altLogoUrl?: string;
  founderPhotoUrl?: string;
  contactPhone: string;
  whatsappNumber: string;
  website: string;
  email: string;
  defaultFooterNote: string;
  updatedByUid?: string;
  updatedAt?: string;
}

export type PosterWorkflowStatus =
  | 'draft'
  | 'pending_approval'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'needs_update'
  | 'archived';

export interface PosterValidationCheck {
  code: string;
  label: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
}

export interface PosterValidationResult {
  passed: boolean;
  checkedAt: string;
  errors: string[];
  warnings: string[];
  checks: PosterValidationCheck[];
}

export interface GeneratedPoster {
  id: string;
  courseId?: string;
  courseName?: string;
  courseCode?: string;
  courseCategory?: 'Certificate' | 'Diploma' | 'General';
  isFreeCourse?: boolean;
  title: string;
  posterType: PosterType;
  templateStyle: PosterTemplateStyle;
  sizePreset: PosterSizePreset;
  language: PosterLanguage;
  headline: string;
  subheadline?: string;
  badgeText?: string;
  highlights: string[];
  feeLabel?: string;
  registrationFeeLabel?: string;
  durationLabel?: string;
  modeLabel?: string;
  ctaText: string;
  footerContact?: string;
  backgroundImageUrl?: string;
  customLogoUrl?: string;
  logoPosition: 'top-left' | 'top-right' | 'top-center';
  accentColor?: string;
  fontScale?: number;
  fontFamily?: 'inter' | 'geometric' | 'serif' | 'mono';
  textAlign?: 'left' | 'center';
  headlineOffsetY?: number;
  bgOpacity?: number;
  socialCaption?: string;
  hashtags?: string[];
  whatsappMessage?: string;
  status: PosterWorkflowStatus;
  versionNumber: number;
  contentHash?: string;
  approvedVersionNumber?: number;
  approvedContentHash?: string;
  validationPassed?: boolean;
  validationSummary?: string;
  rejectionReason?: string;
  changeInstructions?: string;
  courseSnapshotHash?: string;
  courseSnapshotUpdatedAt?: string;
  campaignId?: string;
  generatedByProvider?: string;
  publishDestinations?: string[];
  scheduledPublishAt?: string;
  createdByUid: string;
  createdByName: string;
  createdByRole?: string;
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: string;
  publishedByUid?: string;
  publishedByName?: string;
  publishedAt?: string;
  institutionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PosterVersion {
  id: string;
  posterId: string;
  versionNumber: number;
  headline: string;
  subheadline?: string;
  templateStyle: PosterTemplateStyle;
  sizePreset: PosterSizePreset;
  language: PosterLanguage;
  highlights: string[];
  ctaText: string;
  socialCaption?: string;
  contentHash?: string;
  validationPassed?: boolean;
  validationSummary?: string;
  editableDesignDataJson?: string;
  changeNote?: string;
  createdByUid: string;
  createdByName: string;
  institutionId: string;
  createdAt: string;
}

export interface PosterApprovalLog {
  id: string;
  posterId: string;
  posterTitle?: string;
  courseName?: string;
  versionNumber: number;
  action:
    | 'submitted_for_approval'
    | 'approved'
    | 'rejected'
    | 'changes_requested'
    | 'approval_invalidated'
    | 'archived';
  reason?: string;
  performedByUid: string;
  performedByName: string;
  performedByEmail: string;
  institutionId: string;
  timestamp: string;
}

export interface PosterPublishingLog {
  id: string;
  posterId: string;
  posterTitle?: string;
  courseId?: string;
  versionNumber: number;
  destination:
    | 'website_marketing_library'
    | 'public_course_page'
    | 'download_png'
    | 'download_jpg'
    | 'download_pdf'
    | 'export_whatsapp'
    | 'export_social_media'
    | 'scheduled_campaign';
  scheduledFor?: string;
  publishedByUid: string;
  publishedByName: string;
  publishedByEmail: string;
  institutionId: string;
  timestamp: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  campaignType: 'free_courses' | 'certificate_intake' | 'diploma_intake' | 'custom_bulk';
  courseIds: string[];
  posterIds: string[];
  language: PosterLanguage;
  status: 'draft' | 'pending_approval' | 'approved' | 'published' | 'archived';
  summary?: string;
  createdByUid: string;
  createdByName: string;
  institutionId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// MODULE 4: CENTRALIZED AI INTEGRATIONS & AUTOMATION WORKFLOWS
// ============================================================

export type IntegrationProviderId =
  | 'openai'
  | 'apify'
  | 'gemini_ai'
  | 'google_sheets'
  | 'firebase'
  | 'email_provider'
  | 'whatsapp_business'
  | 'analytics';

export interface IntegrationConfig {
  id: IntegrationProviderId;
  provider: IntegrationProviderId;
  label: string;
  category: 'AI & LLM' | 'Automation & Research' | 'Data & Storage' | 'Messaging & Analytics';
  enabled: boolean;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  monthlyBudgetUsd?: number;
  allowedFeatures?: string[];
  defaultActorId?: string;
  connectionStatus: 'not_configured' | 'connected' | 'error' | 'testing';
  lastTestedAt?: string;
  lastError?: string;
  notes?: string;
  updatedByUid?: string;
  institutionId: string;
  updatedAt?: string;
}

export interface IntegrationLog {
  id: string;
  provider: IntegrationProviderId;
  action: string;
  status: 'success' | 'error' | 'not_configured';
  modelOrActor?: string;
  durationMs?: number;
  summary: string;
  actorUid: string;
  actorEmail: string;
  institutionId: string;
  createdAt: string;
}

export interface ApifyRunRecord {
  id: string;
  actorId: string;
  runId: string;
  datasetId?: string;
  purpose: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'QUEUED';
  itemCount?: number;
  previewJson?: string;
  reviewedByUid?: string;
  startedByUid: string;
  startedByEmail: string;
  institutionId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AutomationWorkflow {
  id: string;
  workflowKey:
    | 'new_course_poster'
    | 'course_update_detector'
    | 'free_course_campaign'
    | 'bulk_campaign_package';
  name: string;
  description: string;
  enabled: boolean;
  requiresAdminApproval: boolean;
  defaultLanguage: PosterLanguage;
  defaultSizePreset: PosterSizePreset;
  lastTriggeredAt?: string;
  lastRunSummary?: string;
  institutionId: string;
  updatedAt?: string;
}

// ============================================================
// MODULE 5: STUDENT ACCOUNTS, EMAIL LOGS & SYLLABUS AUDIT LOGS
// ============================================================

export type StudentAccountStatus =
  | 'Not Created'
  | 'Invitation Sent'
  | 'Active'
  | 'Suspended'
  | 'Password Reset Required';

export interface StudentAccountRecord {
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
  invitationCount?: number;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
  createdByUid: string;
  createdByEmail: string;
  institutionId: string;
  createdAt: string;
  updatedAt: string;
}

export type EmailNotificationType =
  | 'student_account_created'
  | 'login_credentials'
  | 'password_reset'
  | 'admission_confirmation'
  | 'syllabus_updated'
  | 'academic_announcement';

export interface EmailLogRecord {
  id: string;
  emailType: EmailNotificationType;
  recipientEmail: string;
  recipientName?: string;
  studentId?: string;
  courseId?: string;
  subject: string;
  bodyPreview: string;
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

export interface SyllabusApprovalLog {
  id: string;
  syllabusId: string;
  courseId: string;
  courseName: string;
  previousVersionNumber: number;
  versionNumber: number;
  action: 'submitted_for_approval' | 'approved' | 'published' | 'archived' | 'restored' | 'rejected';
  changeDescription: string;
  performedByUid: string;
  performedByName: string;
  performedByEmail: string;
  institutionId: string;
  timestamp: string;
}




