import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Layers,
  Lock,
  Monitor,
  Palette,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wand2,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import { invalidatePublicCatalogCache } from '../../lib/publicCache';
import {
  AutomationWorkflow,
  BrandSettings,
  Course,
  GeneratedPoster,
  PosterApprovalLog,
  PosterLanguage,
  PosterPublishingLog,
  PosterSizePreset,
  PosterTemplateStyle,
  PosterType,
  PosterVersion,
  PosterWorkflowStatus,
  UserProfile,
} from '../../types/lms';
import {
  BRAND_IMAGES,
  DEFAULT_AUTOMATION_WORKFLOWS,
  DEFAULT_BRAND_SETTINGS,
  INSTITUTE_INFO,
  OFFICIAL_POSTERS,
} from '../../data/catalogSeed';
import {
  buildVerifiedPosterDraftFromCourse,
  computeCourseSnapshotHash,
  computePosterContentHash,
  exportPosterAsJPG,
  exportPosterAsPDF,
  exportPosterAsPNG,
  getSizePresetMeta,
  POSTER_LANGUAGES,
  POSTER_SIZE_PRESETS,
  POSTER_TEMPLATES,
  POSTER_TYPES,
  renderPosterToCanvas,
  validatePosterAgainstCourse,
} from '../../lib/posterRenderer';

export type PosterStudioTab =
  | 'poster-approval'
  | 'poster-generator'
  | 'poster-bulk'
  | 'poster-library'
  | 'poster-brand'
  | 'poster-workflows';

interface AIPosterStudioProps {
  mode: PosterStudioTab;
  profile: UserProfile;
  userEmail: string;
  isSuperAdmin: boolean;
  courses: Course[];
  brandSettings: BrandSettings;
  posters: GeneratedPoster[];
  posterVersions: PosterVersion[];
  approvalLogs: PosterApprovalLog[];
  publishingLogs: PosterPublishingLog[];
  workflows: AutomationWorkflow[];
  onRefresh: () => Promise<void>;
  onNavigateTab: (tab: PosterStudioTab) => void;
}

const BACKGROUND_PRESETS: Array<{ label: string; url: string }> = [
  { label: 'Clean Vector Navy / Gradient', url: '' },
  { label: 'TECHMAN Futuristic AI Hero', url: BRAND_IMAGES.heroFuturisticAi },
  { label: 'TECHMAN Diploma AI Poster', url: BRAND_IMAGES.posterUploadedDiplomaAI },
  { label: 'TECHMAN Graphic Design AI', url: BRAND_IMAGES.posterUploadedGraphicAI },
  { label: 'TECHMAN Web & App AI', url: BRAND_IMAGES.posterUploadedWebApp },
  { label: 'TECHMAN Digital Marketing AI', url: BRAND_IMAGES.posterUploadedDigitalMktAI },
  { label: 'TECHMAN Campus Computer Lab', url: BRAND_IMAGES.campusComputerLab },
  { label: 'TECHMAN Creative Studio', url: BRAND_IMAGES.creativeDesign },
];

const STATUS_BADGES: Record<
  PosterWorkflowStatus,
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  pending_approval: {
    label: 'Pending Approval',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  changes_requested: {
    label: 'Changes Requested',
    className: 'bg-orange-50 text-orange-800 border-orange-200',
  },
  approved: {
    label: 'Approved (Ready to Publish)',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  rejected: { label: 'Rejected', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  needs_update: {
    label: 'Needs Update (Course Changed)',
    className: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  archived: { label: 'Archived', className: 'bg-slate-200 text-slate-600 border-slate-300' },
};

const PosterCanvasPreview: React.FC<{
  poster: Partial<GeneratedPoster>;
  brand: BrandSettings;
  scale?: number;
  className?: string;
}> = ({ poster, brand, scale = 0.4, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sig = useMemo(
    () =>
      JSON.stringify([
        poster.headline,
        poster.subheadline,
        poster.badgeText,
        poster.highlights,
        poster.feeLabel,
        poster.durationLabel,
        poster.modeLabel,
        poster.ctaText,
        poster.footerContact,
        poster.templateStyle,
        poster.sizePreset,
        poster.backgroundImageUrl,
        poster.logoPosition,
        poster.accentColor,
        poster.fontScale,
        poster.isFreeCourse,
        brand.logoUrl,
        brand.brandName,
        brand.contactPhone,
        brand.website,
        scale,
      ]),
    [poster, brand, scale]
  );

  useEffect(() => {
    let active = true;
    const el = canvasRef.current;
    if (!el) return;
    renderPosterToCanvas(el, poster, brand, scale).catch(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [sig, poster, brand, scale]);

  return (
    <canvas
      ref={canvasRef}
      className={`block max-w-full h-auto rounded-lg shadow-sm border border-slate-200/80 ${className}`}
    />
  );
};

export const AIPosterStudio: React.FC<AIPosterStudioProps> = ({
  mode,
  profile,
  userEmail,
  isSuperAdmin,
  courses,
  brandSettings,
  posters,
  posterVersions,
  approvalLogs,
  publishingLogs,
  workflows,
  onRefresh,
  onNavigateTab,
}) => {
  const activeBrand = useMemo<BrandSettings>(() => {
    const base = brandSettings || DEFAULT_BRAND_SETTINGS;
    if (!base.logoUrl || base.logoUrl === '/assets/opt/logo_techman_college.webp') {
      return { ...base, logoUrl: BRAND_IMAGES.officialLogo };
    }
    return base;
  }, [brandSettings]);
  const activeWorkflows = workflows.length > 0 ? workflows : DEFAULT_AUTOMATION_WORKFLOWS;

  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Approval Centre filter & modals
  const [statusFilter, setStatusFilter] = useState<PosterWorkflowStatus | 'all'>('pending_approval');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewPoster, setPreviewPoster] = useState<GeneratedPoster | null>(null);
  const [previewCrop, setPreviewCrop] = useState<'full' | 'desktop' | 'mobile'>('full');
  const [actionModal, setActionModal] = useState<{
    type: 'reject' | 'changes';
    poster: GeneratedPoster;
    reason: string;
  } | null>(null);
  const [publishModal, setPublishModal] = useState<{
    poster: GeneratedPoster;
    destinations: Record<string, boolean>;
    scheduledFor: string;
    verifyState: 'idle' | 'verifying' | 'ok' | 'blocked';
    verifyErrors: string[];
    receiptSig?: string;
    confirmFinalPublish: boolean;
  } | null>(null);

  // Generator / Editor State
  const [editingPosterId, setEditingPosterId] = useState<string | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<GeneratedPoster | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [draft, setDraft] = useState<Partial<GeneratedPoster>>(() =>
    courses[0]
      ? buildVerifiedPosterDraftFromCourse(courses[0], activeBrand)
      : {
          title: 'TECHMAN COLLEGE 2027 Intake Poster',
          posterType: 'Course Admission Poster',
          templateStyle: 'navy_executive',
          sizePreset: 'instagram_portrait',
          language: 'English',
          headline: '2027 Academic Intake Now Open',
          subheadline: 'Build practical technology and professional skills at TECHMAN COLLEGE.',
          badgeText: '2027 INTAKE',
          highlights: ['Practical Projects', 'Expert Mentorship', 'Official Digital Certificate'],
          ctaText: 'Apply Now — 2027 Intake',
          footerContact: `${activeBrand.contactPhone} · ${activeBrand.website.replace(/^https?:\/\//i, '')}`,
          logoPosition: 'top-left',
          accentColor: '#1677FF',
          fontScale: 1,
          status: 'draft',
          versionNumber: 1,
        }
  );
  const [aiBrief, setAiBrief] = useState('');
  const [aiProviderPref, setAiProviderPref] = useState<'auto' | 'openai' | 'gemini'>('auto');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiBgGenerating, setAiBgGenerating] = useState(false);
  const [lastProviderUsed, setLastProviderUsed] = useState<string>('');
  const [aiLearningBenefits, setAiLearningBenefits] = useState<string[]>([]);

  // Bulk Generator State
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkTemplate, setBulkTemplate] = useState<PosterTemplateStyle>('navy_executive');
  const [bulkSize, setBulkSize] = useState<PosterSizePreset>('instagram_portrait');
  const [bulkLanguage, setBulkLanguage] = useState<PosterLanguage>('English');
  const [bulkGeneratedIds, setBulkGeneratedIds] = useState<string[]>([]);

  // Brand Settings Form State
  const [brandForm, setBrandForm] = useState<BrandSettings>(activeBrand);
  useEffect(() => {
    setBrandForm(activeBrand);
  }, [activeBrand]);

  const linkedCourse = useMemo(
    () => courses.find((c) => c.id === (draft.courseId || selectedCourseId)) || null,
    [courses, draft.courseId, selectedCourseId]
  );

  const liveValidation = useMemo(
    () => validatePosterAgainstCourse(draft, linkedCourse, activeBrand),
    [draft, linkedCourse, activeBrand]
  );

  const notifyUser = async (targetUid: string, title: string, message: string) => {
    if (!targetUid) return;
    try {
      const nid = makeSafeId('NTF');
      await setDoc(doc(db, 'notifications', nid), {
        userId: targetUid,
        title: title.slice(0, 140),
        message: message.slice(0, 500),
        category: 'Poster Governance',
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Non-blocking notification
    }
  };

  const writeApprovalLog = async (params: {
    poster: GeneratedPoster | { id: string; title?: string; courseName?: string; versionNumber: number };
    action: PosterApprovalLog['action'];
    reason?: string;
  }) => {
    const logId = makeSafeId('PAL');
    await setDoc(doc(db, 'posterApprovalLogs', logId), {
      posterId: params.poster.id,
      posterTitle: (params.poster.title || '').slice(0, 180),
      courseName: (params.poster.courseName || '').slice(0, 160),
      versionNumber: params.poster.versionNumber || 1,
      action: params.action,
      reason: (params.reason || '').slice(0, 800),
      performedByUid: profile.uid,
      performedByName: (profile.displayName || userEmail).slice(0, 120),
      performedByEmail: userEmail.slice(0, 160),
      institutionId: INSTITUTE_INFO.institutionId,
      timestamp: new Date().toISOString(),
    });
  };

  const writeVersionSnapshot = async (
    posterId: string,
    payload: GeneratedPoster,
    changeNote: string
  ) => {
    const verId = makeSafeId('PVER');
    await setDoc(doc(db, 'posterVersions', verId), {
      posterId,
      versionNumber: payload.versionNumber,
      headline: payload.headline.slice(0, 200),
      subheadline: (payload.subheadline || '').slice(0, 320),
      templateStyle: payload.templateStyle,
      sizePreset: payload.sizePreset,
      language: payload.language,
      highlights: (payload.highlights || []).slice(0, 10),
      ctaText: payload.ctaText.slice(0, 120),
      socialCaption: (payload.socialCaption || '').slice(0, 2500),
      contentHash: (payload.contentHash || '').slice(0, 128),
      validationPassed: Boolean(payload.validationPassed),
      validationSummary: (payload.validationSummary || '').slice(0, 500),
      editableDesignDataJson: JSON.stringify({
        badgeText: payload.badgeText,
        feeLabel: payload.feeLabel,
        durationLabel: payload.durationLabel,
        modeLabel: payload.modeLabel,
        footerContact: payload.footerContact,
        backgroundImageUrl: payload.backgroundImageUrl,
        logoPosition: payload.logoPosition,
        accentColor: payload.accentColor,
      }).slice(0, 12000),
      changeNote: changeNote.slice(0, 400),
      createdByUid: profile.uid,
      createdByName: (profile.displayName || userEmail).slice(0, 120),
      institutionId: INSTITUTE_INFO.institutionId,
      createdAt: new Date().toISOString(),
    });
  };

  // Load course into generator
  const handleSelectCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setEditingPosterId(null);
    setEditingOriginal(null);
    setDraft(buildVerifiedPosterDraftFromCourse(course, activeBrand));
    setBannerMsg(null);
  };

  // Open existing poster in editor
  const handleEditExistingPoster = (p: GeneratedPoster) => {
    setEditingPosterId(p.id);
    setEditingOriginal(p);
    setSelectedCourseId(p.courseId || '');
    setDraft({ ...p });
    setBannerMsg(null);
    onNavigateTab('poster-generator');
  };

  // Call backend AI copy generator (OpenAI / Gemini)
  const handleGenerateAICopy = async () => {
    if (!linkedCourse) {
      setBannerMsg({ type: 'err', text: 'Select a verified course first.' });
      return;
    }
    setAiGenerating(true);
    setBannerMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/integrations/openai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          task: 'poster_copy',
          provider: aiProviderPref,
          language: draft.language || 'English',
          posterType: draft.posterType || 'Course Admission Poster',
          course: linkedCourse,
          customPrompt: aiBrief,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'AI copy generation failed.');
      const copy = data.posterCopy || {};
      setLastProviderUsed(data.providerUsed || 'AI Engine');
      setAiLearningBenefits(
        Array.isArray(copy.learningBenefits)
          ? copy.learningBenefits.slice(0, 6).map((b: unknown) => String(b).slice(0, 120))
          : []
      );
      setDraft((prev) => ({
        ...prev,
        headline: String(copy.headline || prev.headline || linkedCourse.name).slice(0, 190),
        subheadline: String(copy.subheadline || prev.subheadline || '').slice(0, 300),
        badgeText: String(copy.badgeText || prev.badgeText || '2027 INTAKE').slice(0, 75),
        highlights: Array.isArray(copy.highlights) && copy.highlights.length > 0
          ? copy.highlights.slice(0, 6).map((h: unknown) => String(h).slice(0, 110))
          : prev.highlights || [],
        ctaText: String(copy.ctaText || prev.ctaText || 'Apply Now').slice(0, 110),
        socialCaption: String(copy.socialCaption || prev.socialCaption || '').slice(0, 2400),
        hashtags: Array.isArray(copy.hashtags)
          ? copy.hashtags.slice(0, 12).map((h: unknown) => String(h).slice(0, 48))
          : prev.hashtags || [],
        whatsappMessage: String(copy.whatsappMessage || prev.whatsappMessage || '').slice(0, 1400),
        generatedByProvider: String(data.providerUsed || 'AI Engine').slice(0, 60),
      }));
      setBannerMsg({
        type: 'ok',
        text: `AI draft generated via ${data.providerUsed}. Review validation checks and submit for Super Admin approval.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to generate AI poster copy.',
      });
    } finally {
      setAiGenerating(false);
    }
  };

  // Optional Step 3: Generate text-free AI background artwork (Draft asset only — never publishes)
  const handleGenerateAIBackground = async () => {
    setAiBgGenerating(true);
    setBannerMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/posters/generate-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          courseName: linkedCourse?.name || draft.headline || 'TECHMAN COLLEGE Programme',
          domain: linkedCourse?.domain || 'Technology & Education',
          templateStyle: draft.templateStyle || 'navy_executive',
          customTheme: aiBrief,
          provider: aiProviderPref,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.imageDataUrl) {
        throw new Error(data.error || 'AI background artwork generation is unavailable.');
      }
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          const maxDim = 920;
          const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * ratio));
          c.height = Math.max(1, Math.round(img.height * ratio));
          const cx = c.getContext('2d');
          if (cx) {
            cx.drawImage(img, 0, 0, c.width, c.height);
            const compact = c.toDataURL('image/jpeg', 0.72);
            setDraft((prev) => ({
              ...prev,
              backgroundImageUrl:
                compact.length <= 238000 ? compact : c.toDataURL('image/jpeg', 0.52),
            }));
          }
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to decode generated artwork.'));
        img.src = String(data.imageDataUrl);
      });
      setBannerMsg({
        type: 'ok',
        text: `AI background artwork applied via ${data.providerUsed}. Poster remains a DRAFT until validated and approved by Super Admin.`,
      });
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to generate AI background artwork.',
      });
    } finally {
      setAiBgGenerating(false);
    }
  };

  // Save as Draft OR Submit for Super Admin Approval (NEVER directly approves or publishes!)
  const handleSavePoster = async (targetStatus: 'draft' | 'pending_approval') => {
    if (targetStatus === 'pending_approval' && !liveValidation.passed) {
      setBannerMsg({
        type: 'err',
        text: `Cannot submit for approval — fix ${liveValidation.errors.length} validation error(s) first.`,
      });
      return;
    }
    setBusy(true);
    setBannerMsg(null);
    try {
      const now = new Date().toISOString();
      const isEdit = Boolean(editingPosterId && editingOriginal);
      const posterId = isEdit && editingPosterId ? editingPosterId : makeSafeId('PST');
      const wasApprovedOrPublished =
        isEdit &&
        editingOriginal &&
        (editingOriginal.status === 'approved' ||
          editingOriginal.status === 'published' ||
          Number(editingOriginal.approvedVersionNumber || 0) > 0);

      const nextVersion = isEdit && editingOriginal ? (editingOriginal.versionNumber || 1) + 1 : 1;

      const cleanHighlights = (draft.highlights || [])
        .map((h) => h.trim())
        .filter(Boolean)
        .slice(0, 10);
      const cleanHashtags = (draft.hashtags || [])
        .map((h) => h.trim())
        .filter(Boolean)
        .slice(0, 20);

      const contentHash = computePosterContentHash({
        courseId: linkedCourse?.id || draft.courseId || '',
        courseName: linkedCourse?.name || draft.courseName || '',
        posterType: (draft.posterType || 'Course Admission Poster') as PosterType,
        templateStyle: (draft.templateStyle || 'navy_executive') as PosterTemplateStyle,
        sizePreset: (draft.sizePreset || 'instagram_portrait') as PosterSizePreset,
        language: (draft.language || 'English') as PosterLanguage,
        headline: (draft.headline || '').trim(),
        subheadline: (draft.subheadline || '').trim(),
        badgeText: (draft.badgeText || '').trim(),
        highlights: cleanHighlights,
        feeLabel: (draft.feeLabel || '').trim(),
        registrationFeeLabel: (draft.registrationFeeLabel || '').trim(),
        durationLabel: (draft.durationLabel || '').trim(),
        modeLabel: (draft.modeLabel || '').trim(),
        ctaText: (draft.ctaText || '').trim(),
        footerContact: (draft.footerContact || '').trim(),
        backgroundImageUrl: (draft.backgroundImageUrl || '').trim(),
        customLogoUrl: (draft.customLogoUrl || '').trim(),
        logoPosition: draft.logoPosition || 'top-left',
        accentColor: draft.accentColor || '#1677FF',
        fontFamily: draft.fontFamily || 'inter',
        textAlign: draft.textAlign || 'left',
        headlineOffsetY: Number(draft.headlineOffsetY || 0),
        bgOpacity: Number(draft.bgOpacity ?? 0.24),
      });

      const payload: Omit<GeneratedPoster, 'id'> = {
        courseId: (linkedCourse?.id || draft.courseId || '').slice(0, 128),
        courseName: (linkedCourse?.name || draft.courseName || '').slice(0, 160),
        courseCode: (linkedCourse?.code || draft.courseCode || '').slice(0, 40),
        courseCategory: (linkedCourse?.category || draft.courseCategory || 'General') as
          | 'Certificate'
          | 'Diploma'
          | 'General',
        isFreeCourse: Boolean(linkedCourse ? linkedCourse.isFree : draft.isFreeCourse),
        title: (draft.title || `${linkedCourse?.name || 'TECHMAN'} Poster`).slice(0, 180),
        posterType: (draft.posterType || 'Course Admission Poster') as PosterType,
        templateStyle: (draft.templateStyle || 'navy_executive') as PosterTemplateStyle,
        sizePreset: (draft.sizePreset || 'instagram_portrait') as PosterSizePreset,
        language: (draft.language || 'English') as PosterLanguage,
        headline: (draft.headline || 'TECHMAN COLLEGE 2027').trim().slice(0, 200),
        subheadline: (draft.subheadline || '').trim().slice(0, 320),
        badgeText: (draft.badgeText || '').trim().slice(0, 80),
        highlights: cleanHighlights,
        feeLabel: (draft.feeLabel || '').trim().slice(0, 120),
        registrationFeeLabel: (draft.registrationFeeLabel || '').trim().slice(0, 120),
        durationLabel: (draft.durationLabel || '').trim().slice(0, 80),
        modeLabel: (draft.modeLabel || '').trim().slice(0, 80),
        ctaText: (draft.ctaText || 'Apply Now').trim().slice(0, 120),
        footerContact: (draft.footerContact || '').trim().slice(0, 200),
        backgroundImageUrl: (draft.backgroundImageUrl || '').trim().slice(0, 245000),
        customLogoUrl: (draft.customLogoUrl || '').trim().slice(0, 195000),
        logoPosition: draft.logoPosition || 'top-left',
        accentColor: (draft.accentColor || '#1677FF').slice(0, 24),
        fontScale: Number(draft.fontScale || 1),
        fontFamily: draft.fontFamily || 'inter',
        textAlign: draft.textAlign || 'left',
        headlineOffsetY: Math.max(-60, Math.min(60, Number(draft.headlineOffsetY || 0))),
        bgOpacity: Math.max(0.05, Math.min(0.65, Number(draft.bgOpacity ?? 0.24))),
        socialCaption: (draft.socialCaption || '').slice(0, 2500),
        hashtags: cleanHashtags,
        whatsappMessage: (draft.whatsappMessage || '').slice(0, 1500),
        status: targetStatus,
        versionNumber: nextVersion,
        contentHash,
        // Editing ALWAYS invalidates prior approval so re-approval is mandatory!
        approvedVersionNumber: 0,
        approvedContentHash: '',
        validationPassed: liveValidation.passed,
        validationSummary: liveValidation.passed
          ? `All ${liveValidation.checks.length} checks passed.`
          : liveValidation.errors.join(' | ').slice(0, 480),
        rejectionReason: '',
        changeInstructions: '',
        courseSnapshotHash: linkedCourse ? computeCourseSnapshotHash(linkedCourse) : '',
        courseSnapshotUpdatedAt: linkedCourse?.updatedAt || now,
        generatedByProvider: (draft.generatedByProvider || lastProviderUsed || 'Template Engine').slice(0, 64),
        createdByUid: isEdit && editingOriginal ? editingOriginal.createdByUid : profile.uid,
        createdByName: (
          isEdit && editingOriginal ? editingOriginal.createdByName : profile.displayName || userEmail
        ).slice(0, 120),
        createdByRole: (
          isEdit && editingOriginal ? editingOriginal.createdByRole || profile.role : profile.role
        ).slice(0, 40),
        approvedByUid: '',
        approvedByName: '',
        approvedAt: '',
        publishedByUid: '',
        publishedByName: '',
        publishedAt: '',
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: isEdit && editingOriginal ? editingOriginal.createdAt : now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'generatedPosters', posterId), payload);
      const savedFull: GeneratedPoster = { id: posterId, ...payload };

      await writeVersionSnapshot(
        posterId,
        savedFull,
        wasApprovedOrPublished
          ? `Edited post-approval — created v${nextVersion} and invalidated previous approval.`
          : isEdit
            ? `Updated to v${nextVersion} (${targetStatus}).`
            : `Initial v1 created (${targetStatus}).`
      );

      if (wasApprovedOrPublished) {
        await writeApprovalLog({
          poster: savedFull,
          action: 'approval_invalidated',
          reason: `Poster edited after prior approval. New version v${nextVersion} requires fresh Super Admin approval.`,
        });
        await notifyUser(
          'super-admin-inbox',
          `Approval Invalidated: ${savedFull.title}`,
          `${profile.displayName || userEmail} edited approved poster ${posterId} to v${nextVersion}. Prior approval has been revoked; re-approval is required.`
        );
        if (editingOriginal && editingOriginal.createdByUid !== profile.uid) {
          await notifyUser(
            editingOriginal.createdByUid,
            `Poster Approval Invalidated: ${savedFull.title}`,
            `New version v${nextVersion} invalidated prior approval. Fresh Super Admin review is required before publishing.`
          );
        }
      }
      if (targetStatus === 'pending_approval') {
        await writeApprovalLog({
          poster: savedFull,
          action: 'submitted_for_approval',
          reason: `Submitted v${nextVersion} for mandatory Super Admin review.`,
        });
        await notifyUser(
          'super-admin-inbox',
          `Poster Pending Approval: ${savedFull.title}`,
          `${profile.displayName || userEmail} (${profile.role}) submitted v${nextVersion} (${posterId}) for mandatory Super Admin approval.`
        );
      }

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action:
          targetStatus === 'pending_approval'
            ? 'POSTER_SUBMITTED_FOR_APPROVAL'
            : 'POSTER_DRAFT_SAVED',
        targetType: 'generatedPoster',
        targetId: posterId,
        details: `${payload.title} (v${nextVersion}) — validationPassed=${payload.validationPassed}`,
      });

      await onRefresh();
      setEditingPosterId(posterId);
      setEditingOriginal(savedFull);
      setBannerMsg({
        type: 'ok',
        text:
          targetStatus === 'pending_approval'
            ? `Poster ${posterId} (v${nextVersion}) submitted to the Approval Centre. Publishing remains locked until Super Admin approves.`
            : `Draft ${posterId} (v${nextVersion}) saved.`,
      });
      if (targetStatus === 'pending_approval') {
        setStatusFilter('pending_approval');
        onNavigateTab('poster-approval');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'generatedPosters');
    } finally {
      setBusy(false);
    }
  };

  // Super Admin APPROVE (does NOT publish — only unlocks Publish step!)
  const handleApprovePoster = async (poster: GeneratedPoster) => {
    if (!isSuperAdmin) return;
    const course = courses.find((c) => c.id === poster.courseId) || null;
    const check = validatePosterAgainstCourse(poster, course, activeBrand);
    if (!check.passed) {
      setBannerMsg({
        type: 'err',
        text: `Approval blocked: ${check.errors[0]}`,
      });
      return;
    }
    setBusy(true);
    setBannerMsg(null);
    try {
      const now = new Date().toISOString();
      const verifiedHash = computePosterContentHash(poster);
      const updated: Omit<GeneratedPoster, 'id'> = {
        ...poster,
        status: 'approved',
        contentHash: verifiedHash,
        approvedVersionNumber: poster.versionNumber,
        approvedContentHash: verifiedHash,
        validationPassed: true,
        validationSummary: `Approved v${poster.versionNumber} — all ${check.checks.length} checks verified.`,
        rejectionReason: '',
        changeInstructions: '',
        approvedByUid: profile.uid,
        approvedByName: (profile.displayName || userEmail).slice(0, 120),
        approvedAt: now,
        updatedAt: now,
      };
      delete (updated as Partial<GeneratedPoster>).id;

      await setDoc(doc(db, 'generatedPosters', poster.id), updated);
      await writeApprovalLog({
        poster,
        action: 'approved',
        reason: `Explicitly approved exact version v${poster.versionNumber} (hash ${verifiedHash}). Ready for separate publishing action.`,
      });
      await notifyUser(
        poster.createdByUid,
        `Poster Approved: ${poster.title}`,
        `Super Admin ${profile.displayName || userEmail} approved v${poster.versionNumber}. It is now unlocked for Super Admin publishing.`
      );
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'POSTER_APPROVED',
        targetType: 'generatedPoster',
        targetId: poster.id,
        details: `Approved v${poster.versionNumber} (${verifiedHash})`,
      });
      await onRefresh();
      setBannerMsg({
        type: 'ok',
        text: `Poster ${poster.id} (v${poster.versionNumber}) APPROVED. Publishing controls are now unlocked.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `generatedPosters/${poster.id}`);
    } finally {
      setBusy(false);
    }
  };

  // Super Admin REJECT or REQUEST CHANGES
  const handleConfirmRejectOrChanges = async () => {
    if (!isSuperAdmin || !actionModal) return;
    const reason = actionModal.reason.trim();
    if (reason.length < 4) {
      setBannerMsg({ type: 'err', text: 'Please provide a clear reason or correction instruction.' });
      return;
    }
    setBusy(true);
    try {
      const { poster, type } = actionModal;
      const now = new Date().toISOString();
      const nextStatus: PosterWorkflowStatus = type === 'reject' ? 'rejected' : 'changes_requested';
      const updated: Omit<GeneratedPoster, 'id'> = {
        ...poster,
        status: nextStatus,
        approvedVersionNumber: 0,
        approvedContentHash: '',
        rejectionReason: type === 'reject' ? reason.slice(0, 600) : '',
        changeInstructions: type === 'changes' ? reason.slice(0, 800) : '',
        updatedAt: now,
      };
      delete (updated as Partial<GeneratedPoster>).id;

      await setDoc(doc(db, 'generatedPosters', poster.id), updated);
      await writeApprovalLog({
        poster,
        action: type === 'reject' ? 'rejected' : 'changes_requested',
        reason,
      });
      await notifyUser(
        poster.createdByUid,
        type === 'reject' ? `Poster Rejected: ${poster.title}` : `Changes Requested: ${poster.title}`,
        reason
      );
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: type === 'reject' ? 'POSTER_REJECTED' : 'POSTER_CHANGES_REQUESTED',
        targetType: 'generatedPoster',
        targetId: poster.id,
        details: reason.slice(0, 500),
      });
      setActionModal(null);
      await onRefresh();
      setBannerMsg({
        type: 'ok',
        text:
          type === 'reject'
            ? `Poster ${poster.id} rejected and creator notified.`
            : `Correction instructions sent to creator for ${poster.id}.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `generatedPosters/${actionModal.poster.id}`);
    } finally {
      setBusy(false);
    }
  };

  // Super Admin ARCHIVE
  const handleArchivePoster = async (poster: GeneratedPoster) => {
    if (!isSuperAdmin) return;
    setBusy(true);
    try {
      const updated: Omit<GeneratedPoster, 'id'> = {
        ...poster,
        status: 'archived',
        updatedAt: new Date().toISOString(),
      };
      delete (updated as Partial<GeneratedPoster>).id;
      await setDoc(doc(db, 'generatedPosters', poster.id), updated);
      await writeApprovalLog({ poster, action: 'archived', reason: 'Archived by Super Admin.' });
      await onRefresh();
      setBannerMsg({ type: 'ok', text: `Poster ${poster.id} archived.` });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `generatedPosters/${poster.id}`);
    } finally {
      setBusy(false);
    }
  };

  // Open Separate Publishing Gate Modal + Run Live Backend Verification (/api/posters/verify-publish)
  const openPublishGate = async (poster: GeneratedPoster) => {
    if (!isSuperAdmin) return;
    setPublishModal({
      poster,
      destinations: {
        website_marketing_library: true,
        public_course_page: Boolean(poster.courseId),
        download_png: false,
        download_jpg: false,
        download_pdf: false,
        export_whatsapp: false,
        export_social_media: false,
        scheduled_campaign: false,
      },
      scheduledFor: '',
      verifyState: 'verifying',
      verifyErrors: [],
      confirmFinalPublish: false,
    });

    try {
      const token = await auth.currentUser?.getIdToken();
      const course = courses.find((c) => c.id === poster.courseId) || null;
      const resp = await fetch('/api/posters/verify-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          poster,
          course,
          brand: activeBrand,
          destination: 'website_marketing_library',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.allowed) {
        setPublishModal((prev) =>
          prev
            ? {
                ...prev,
                verifyState: 'blocked',
                verifyErrors: Array.isArray(data.failures)
                  ? data.failures
                  : [data.error || 'Server pre-publish verification denied publishing.'],
              }
            : null
        );
      } else {
        setPublishModal((prev) =>
          prev
            ? {
                ...prev,
                verifyState: 'ok',
                verifyErrors: [],
                receiptSig: data.signature,
              }
            : null
        );
      }
    } catch (err) {
      setPublishModal((prev) =>
        prev
          ? {
              ...prev,
              verifyState: 'blocked',
              verifyErrors: [err instanceof Error ? err.message : 'Unable to verify publishing gate.'],
            }
          : null
      );
    }
  };

  // Execute Explicit Final Publish Confirmation
  const handleConfirmPublish = async () => {
    if (!isSuperAdmin || !publishModal || publishModal.verifyState !== 'ok') return;
    if (!publishModal.confirmFinalPublish) {
      setBannerMsg({
        type: 'err',
        text: 'Please check the Final Publishing Confirmation box before publishing.',
      });
      return;
    }
    const selectedDests = Object.entries(publishModal.destinations)
      .filter(([, checked]) => checked)
      .map(([k]) => k as PosterPublishingLog['destination']);
    if (selectedDests.length === 0) {
      setBannerMsg({ type: 'err', text: 'Select at least one publishing or export destination.' });
      return;
    }

    setBusy(true);
    try {
      const { poster, scheduledFor } = publishModal;

      // Re-verify against authoritative Firestore record right before committing publish
      const token = await auth.currentUser?.getIdToken();
      const course = courses.find((c) => c.id === poster.courseId) || null;
      const recheckResp = await fetch('/api/posters/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          posterId: poster.id,
          poster,
          course,
          brand: activeBrand,
          destination: selectedDests[0],
        }),
      });
      const recheckData = await recheckResp.json();
      if (!recheckResp.ok || !recheckData.authorized) {
        setPublishModal((prev) =>
          prev
            ? {
                ...prev,
                verifyState: 'blocked',
                verifyErrors: Array.isArray(recheckData.failures)
                  ? recheckData.failures
                  : [recheckData.error || 'Authoritative pre-publish verification blocked publishing.'],
              }
            : null
        );
        return;
      }

      const now = new Date().toISOString();
      const mergedDestinations = Array.from(
        new Set([...(poster.publishDestinations || []), ...selectedDests])
      ).slice(0, 10);

      const updated: Omit<GeneratedPoster, 'id'> = {
        ...poster,
        status: 'published',
        publishDestinations: mergedDestinations,
        scheduledPublishAt: scheduledFor || poster.scheduledPublishAt || '',
        publishedByUid: profile.uid,
        publishedByName: (profile.displayName || userEmail).slice(0, 120),
        publishedAt: now,
        updatedAt: now,
      };
      delete (updated as Partial<GeneratedPoster>).id;

      await setDoc(doc(db, 'generatedPosters', poster.id), updated);

      // Write immutable publishing log entry per selected destination
      for (const dest of selectedDests) {
        const logId = makeSafeId('PPUB');
        await setDoc(doc(db, 'posterPublishingLogs', logId), {
          posterId: poster.id,
          posterTitle: poster.title.slice(0, 180),
          courseId: (poster.courseId || '').slice(0, 128),
          versionNumber: poster.versionNumber,
          destination: dest,
          scheduledFor: dest === 'scheduled_campaign' ? (scheduledFor || '').slice(0, 40) : '',
          publishedByUid: profile.uid,
          publishedByName: (profile.displayName || userEmail).slice(0, 120),
          publishedByEmail: userEmail.slice(0, 160),
          institutionId: INSTITUTE_INFO.institutionId,
          timestamp: now,
        });
      }

      // Trigger local downloads / exports requested by Super Admin
      if (selectedDests.includes('download_png')) await exportPosterAsPNG(poster, activeBrand);
      if (selectedDests.includes('download_jpg')) await exportPosterAsJPG(poster, activeBrand);
      if (selectedDests.includes('download_pdf')) await exportPosterAsPDF(poster, activeBrand);
      if (selectedDests.includes('export_whatsapp') && poster.whatsappMessage) {
        await navigator.clipboard?.writeText(poster.whatsappMessage).catch(() => {});
      }
      if (selectedDests.includes('export_social_media') && poster.socialCaption) {
        const socialText = poster.hashtags?.length
          ? `${poster.socialCaption}\n\n${poster.hashtags.join(' ')}`
          : poster.socialCaption;
        await navigator.clipboard?.writeText(socialText).catch(() => {});
      }

      await notifyUser(
        poster.createdByUid,
        `Poster Published: ${poster.title}`,
        `Published v${poster.versionNumber} to ${selectedDests.join(', ')} by ${profile.displayName || userEmail}.`
      );

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'POSTER_PUBLISHED',
        targetType: 'generatedPoster',
        targetId: poster.id,
        details: `Published v${poster.versionNumber} to [${selectedDests.join(', ')}] (receipt ${String(recheckData.receiptSignature || publishModal.receiptSig || '').slice(0, 12)})`,
      });

      invalidatePublicCatalogCache();
      setPublishModal(null);
      await onRefresh();
      setBannerMsg({
        type: 'ok',
        text: `Poster ${poster.id} (v${poster.versionNumber}) published with authoritative verification & audit trail (${selectedDests.length} destination(s)).`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `generatedPosters/${publishModal.poster.id}`);
    } finally {
      setBusy(false);
    }
  };

  // Bulk Generate Individual Validated Posters (NEVER Auto-Approves or Auto-Publishes!)
  const handleBulkGenerate = async () => {
    if (bulkSelectedIds.length === 0) {
      setBannerMsg({ type: 'err', text: 'Select at least one course to generate posters.' });
      return;
    }
    setBusy(true);
    setBannerMsg(null);
    const createdIds: string[] = [];
    try {
      const now = new Date().toISOString();
      const campaignId = makeSafeId('CMP');
      for (const cid of bulkSelectedIds) {
        const course = courses.find((c) => c.id === cid);
        if (!course) continue;
        const posterId = makeSafeId('PST');
        const built = buildVerifiedPosterDraftFromCourse(course, activeBrand, {
          templateStyle: course.isFree ? 'free_spotlight' : bulkTemplate,
          sizePreset: bulkSize,
          language: bulkLanguage,
        });
        const status: PosterWorkflowStatus = built.validationPassed ? 'pending_approval' : 'draft';
        const payload: Omit<GeneratedPoster, 'id'> = {
          ...built,
          status,
          campaignId,
          generatedByProvider: 'Bulk Verified Course Generator',
          createdByUid: profile.uid,
          createdByName: (profile.displayName || userEmail).slice(0, 120),
          createdByRole: profile.role,
          approvedByUid: '',
          approvedByName: '',
          approvedAt: '',
          publishedByUid: '',
          publishedByName: '',
          publishedAt: '',
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'generatedPosters', posterId), payload);
        const saved: GeneratedPoster = { id: posterId, ...payload };
        await writeVersionSnapshot(posterId, saved, `Bulk campaign ${campaignId} initial v1`);
        if (status === 'pending_approval') {
          await writeApprovalLog({
            poster: saved,
            action: 'submitted_for_approval',
            reason: `Generated in bulk campaign ${campaignId} and queued for mandatory Super Admin approval.`,
          });
        }
        createdIds.push(posterId);
      }

      await setDoc(doc(db, 'marketingCampaigns', campaignId), {
        name: `Bulk Campaign (${createdIds.length} courses) — ${new Date().toLocaleDateString()}`,
        campaignType: 'custom_bulk',
        courseIds: bulkSelectedIds.slice(0, 100),
        posterIds: createdIds.slice(0, 100),
        language: bulkLanguage,
        status: 'pending_approval',
        summary: `Generated ${createdIds.length} individual posters awaiting mandatory Super Admin approval.`,
        createdByUid: profile.uid,
        createdByName: (profile.displayName || userEmail).slice(0, 120),
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: now,
        updatedAt: now,
      });

      if (createdIds.length > 0) {
        await notifyUser(
          'super-admin-inbox',
          `Bulk Campaign Pending Approval (${createdIds.length} Posters)`,
          `${profile.displayName || userEmail} generated ${createdIds.length} individual course posters in campaign ${campaignId}. Each poster requires Super Admin review and approval before publishing.`
        );
      }

      setBulkGeneratedIds(createdIds);
      await onRefresh();
      setBannerMsg({
        type: 'ok',
        text: `Generated ${createdIds.length} separate validated poster(s) in Campaign ${campaignId}. None were auto-published — review and approve below.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'generatedPosters');
    } finally {
      setBusy(false);
    }
  };

  // Bulk Approve ONLY Validation-Passing Posters (Super Admin Only — still NEVER auto-publishes!)
  const handleBulkApproveValid = async () => {
    if (!isSuperAdmin) return;
    const candidates = posters.filter(
      (p) =>
        (bulkGeneratedIds.length === 0 || bulkGeneratedIds.includes(p.id)) &&
        p.status === 'pending_approval' &&
        p.validationPassed === true
    );
    if (candidates.length === 0) {
      setBannerMsg({ type: 'err', text: 'No validation-passing pending posters available to bulk approve.' });
      return;
    }
    setBusy(true);
    let approvedCount = 0;
    try {
      for (const p of candidates) {
        const course = courses.find((c) => c.id === p.courseId) || null;
        const v = validatePosterAgainstCourse(p, course, activeBrand);
        if (!v.passed) continue;
        const now = new Date().toISOString();
        const verifiedHash = computePosterContentHash(p);
        const updated: Omit<GeneratedPoster, 'id'> = {
          ...p,
          status: 'approved',
          contentHash: verifiedHash,
          approvedVersionNumber: p.versionNumber,
          approvedContentHash: verifiedHash,
          validationPassed: true,
          approvedByUid: profile.uid,
          approvedByName: (profile.displayName || userEmail).slice(0, 120),
          approvedAt: now,
          updatedAt: now,
        };
        delete (updated as Partial<GeneratedPoster>).id;
        await setDoc(doc(db, 'generatedPosters', p.id), updated);
        await writeApprovalLog({
          poster: p,
          action: 'approved',
          reason: `Bulk-approved by Super Admin after passing all automated validation checks (hash ${verifiedHash}).`,
        });
        await notifyUser(
          p.createdByUid,
          `Poster Approved: ${p.title}`,
          `Super Admin ${profile.displayName || userEmail} approved v${p.versionNumber}. It is now unlocked for separate publishing.`
        );
        approvedCount += 1;
      }
      await onRefresh();
      setBannerMsg({
        type: 'ok',
        text: `Bulk approved ${approvedCount} validation-passing poster(s). Publish each individually when ready.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'generatedPosters');
    } finally {
      setBusy(false);
    }
  };

  // Run Live Course Update Change Detector Workflow
  const handleRunCourseChangeScan = async () => {
    if (!isSuperAdmin) return;
    setBusy(true);
    let flagged = 0;
    try {
      const now = new Date().toISOString();
      for (const p of posters) {
        if (!p.courseId || p.status === 'archived' || p.status === 'rejected') continue;
        const liveCourse = courses.find((c) => c.id === p.courseId);
        if (!liveCourse) continue;
        const liveHash = computeCourseSnapshotHash(liveCourse);
        if (p.courseSnapshotHash && p.courseSnapshotHash !== liveHash && p.status !== 'needs_update') {
          const updated: Omit<GeneratedPoster, 'id'> = {
            ...p,
            status: 'needs_update',
            approvedVersionNumber: 0,
            approvedContentHash: '',
            changeInstructions: `Linked course "${liveCourse.name}" was updated (fee, duration, mode, or status changed). Regenerate and re-approve.`,
            updatedAt: now,
          };
          delete (updated as Partial<GeneratedPoster>).id;
          await setDoc(doc(db, 'generatedPosters', p.id), updated);
          await writeApprovalLog({
            poster: p,
            action: 'approval_invalidated',
            reason: `Course Update Detector invalidated approval because linked course "${liveCourse.name}" changed.`,
          });
          await notifyUser(
            p.createdByUid,
            `Poster Approval Invalidated: ${p.title}`,
            `Linked course "${liveCourse.name}" was updated. Regenerate and re-submit for Super Admin approval.`
          );
          await notifyUser(
            'super-admin-inbox',
            `Course Update Invalidated Poster: ${p.title}`,
            `Course "${liveCourse.name}" changed; poster ${p.id} moved to Needs Update and publishing was locked.`
          );
          flagged += 1;
        }
      }
      const wf = activeWorkflows.find((w) => w.workflowKey === 'course_update_detector');
      if (wf) {
        await setDoc(doc(db, 'automationWorkflows', wf.workflowKey), {
          workflowKey: wf.workflowKey,
          name: wf.name,
          description: wf.description,
          enabled: wf.enabled,
          requiresAdminApproval: true,
          defaultLanguage: wf.defaultLanguage,
          defaultSizePreset: wf.defaultSizePreset,
          lastTriggeredAt: now,
          lastRunSummary: `Scanned ${posters.length} posters; flagged ${flagged} stale poster(s) as needs_update.`,
          institutionId: INSTITUTE_INFO.institutionId,
          updatedAt: now,
        });
      }
      await onRefresh();
      setBannerMsg({
        type: 'ok',
        text:
          flagged > 0
            ? `Course Change Detector flagged ${flagged} poster(s) as "Needs Update" and invalidated stale approvals.`
            : 'All active posters match current verified course records.',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'generatedPosters');
    } finally {
      setBusy(false);
    }
  };

  // Save Brand Settings
  const handleSaveBrand = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, 'brandSettings', INSTITUTE_INFO.institutionId), {
        institutionId: INSTITUTE_INFO.institutionId,
        brandName: brandForm.brandName.slice(0, 140),
        shortName: brandForm.shortName.slice(0, 64),
        tagline: (brandForm.tagline || '').slice(0, 200),
        primaryColor: brandForm.primaryColor.slice(0, 24),
        secondaryColor: (brandForm.secondaryColor || '#172A45').slice(0, 24),
        accentColor: brandForm.accentColor.slice(0, 24),
        lightSurfaceColor: (brandForm.lightSurfaceColor || '#EAF1FC').slice(0, 24),
        logoUrl: brandForm.logoUrl.slice(0, 500),
        altLogoUrl: (brandForm.altLogoUrl || '').slice(0, 500),
        founderPhotoUrl: (brandForm.founderPhotoUrl || '').slice(0, 500),
        contactPhone: brandForm.contactPhone.slice(0, 40),
        whatsappNumber: (brandForm.whatsappNumber || '').slice(0, 40),
        website: brandForm.website.slice(0, 160),
        email: (brandForm.email || '').slice(0, 160),
        defaultFooterNote: (brandForm.defaultFooterNote || '').slice(0, 240),
        updatedByUid: profile.uid,
        updatedAt: now,
      });
      await onRefresh();
      setBannerMsg({ type: 'ok', text: 'Official TECHMAN Brand Settings saved.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `brandSettings/${INSTITUTE_INFO.institutionId}`);
    } finally {
      setBusy(false);
    }
  };

  // Toggle Automation Workflow
  const handleToggleWorkflow = async (wf: AutomationWorkflow) => {
    if (!isSuperAdmin) return;
    try {
      await setDoc(doc(db, 'automationWorkflows', wf.workflowKey), {
        workflowKey: wf.workflowKey,
        name: wf.name,
        description: wf.description,
        enabled: !wf.enabled,
        requiresAdminApproval: true, // Always mandatory!
        defaultLanguage: wf.defaultLanguage,
        defaultSizePreset: wf.defaultSizePreset,
        lastTriggeredAt: wf.lastTriggeredAt || '',
        lastRunSummary: wf.lastRunSummary || '',
        institutionId: INSTITUTE_INFO.institutionId,
        updatedAt: new Date().toISOString(),
      });
      await onRefresh();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `automationWorkflows/${wf.workflowKey}`);
    }
  };

  // Filtered posters for Approval Centre
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: posters.length,
      pending_approval: 0,
      approved: 0,
      changes_requested: 0,
      rejected: 0,
      published: 0,
      needs_update: 0,
      draft: 0,
      archived: 0,
    };
    posters.forEach((p) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [posters]);

  const filteredPosters = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return posters.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.courseName || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.posterType.toLowerCase().includes(q)
      );
    });
  }, [posters, statusFilter, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Governance Banner */}
      <div className="rounded-2xl bg-[#101D35] text-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border border-[#1677FF]/30">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#60A5FA]">
            <ShieldCheck className="w-4 h-4" />
            Mandatory Human Approval Governance
          </div>
          <h2 className="text-xl font-extrabold mt-1">
            TECHMAN AI Poster Studio &amp; Approval Centre
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Core Rule: <span className="text-white font-semibold">AI GENERATES. ADMIN REVIEWS. ADMIN APPROVES. ADMIN PUBLISHES.</span>{' '}
            Every poster version is cryptographically hashed and requires explicit Super Admin approval before publishing unlocks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                id: 'poster-approval',
                label: isSuperAdmin
                  ? `Approval Centre (${statusCounts.pending_approval})`
                  : `My Submissions (${statusCounts.pending_approval})`,
                show: true,
              },
              {
                id: 'poster-generator',
                label: profile.role === 'LECTURER' ? 'Suggest Course Poster' : 'AI Poster Generator',
                show: true,
              },
              {
                id: 'poster-bulk',
                label: 'Bulk Generator',
                show: profile.role !== 'LECTURER',
              },
              { id: 'poster-library', label: 'Marketing Library', show: true },
              {
                id: 'poster-brand',
                label: 'Brand Settings',
                show: isSuperAdmin || ['ADMIN', 'CONTENT_MANAGER'].includes(profile.role),
              },
              {
                id: 'poster-workflows',
                label: 'Workflows',
                show: isSuperAdmin || ['ADMIN', 'CONTENT_MANAGER'].includes(profile.role),
              },
            ] as Array<{ id: PosterStudioTab; label: string; show: boolean }>
          )
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => onNavigateTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === t.id
                    ? 'bg-[#1677FF] text-white shadow'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Role Governance Scope ({profile.role.replace(/_/g, ' ')}):</span>{' '}
            You can generate verified course poster drafts, edit your non-published submissions, and submit them to the Approval Centre. Final approval, rejection, scheduling, and public publishing are strictly restricted to authorized Super Admins.
          </div>
        </div>
      )}

      {bannerMsg && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            bannerMsg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMsg.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerMsg.text}</span>
          </div>
          <button onClick={() => setBannerMsg(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: POSTER APPROVAL CENTRE                                     */}
      {/* ================================================================= */}
      {mode === 'poster-approval' && (
        <div className="space-y-5">
          {/* Status Filter Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {(
              [
                { id: 'pending_approval', label: 'Pending Approval' },
                { id: 'approved', label: 'Approved' },
                { id: 'changes_requested', label: 'Changes Req.' },
                { id: 'rejected', label: 'Rejected' },
                { id: 'published', label: 'Published' },
                { id: 'needs_update', label: 'Needs Update' },
                { id: 'draft', label: 'Drafts' },
                { id: 'archived', label: 'Archived' },
              ] as Array<{ id: PosterWorkflowStatus; label: string }>
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`p-3 rounded-xl border text-left transition ${
                  statusFilter === s.id
                    ? 'bg-[#101D35] text-white border-[#101D35]'
                    : 'bg-white border-slate-200 hover:border-[#1677FF]'
                }`}
              >
                <div className="text-lg font-extrabold">{statusCounts[s.id] || 0}</div>
                <div className="text-[11px] font-medium opacity-80 truncate">{s.label}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Poster ID, course name, or poster type..."
                className="w-full max-w-md px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-white"
              />
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                  statusFilter === 'all'
                    ? 'bg-[#1677FF] text-white border-[#1677FF]'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                All ({statusCounts.all})
              </button>
            </div>
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <button
                  onClick={handleRunCourseChangeScan}
                  disabled={busy}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Check Stale Posters
                </button>
              )}
              <button
                onClick={() => onNavigateTab('poster-generator')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1677FF] hover:bg-blue-600 text-white flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> New AI Poster
              </button>
            </div>
          </div>

          {/* Poster Cards Grid */}
          {filteredPosters.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
              <ImageIcon className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">
                No posters in "{statusFilter.replace('_', ' ')}" right now.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Generate a course poster in the AI Poster Generator or Bulk Generator to begin the review workflow.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredPosters.map((p) => {
                const course = courses.find((c) => c.id === p.courseId) || null;
                const val = validatePosterAgainstCourse(p, course, activeBrand);
                const liveCourseStale =
                  Boolean(course && p.courseSnapshotHash) &&
                  computeCourseSnapshotHash(course!) !== p.courseSnapshotHash;
                const badge = STATUS_BADGES[p.status] || STATUS_BADGES.draft;
                const isPublishEligible =
                  isSuperAdmin &&
                  (p.status === 'approved' || p.status === 'published') &&
                  p.approvedVersionNumber === p.versionNumber &&
                  p.approvedContentHash === computePosterContentHash(p) &&
                  val.passed &&
                  !liveCourseStale;

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                  >
                    {/* Preview Header */}
                    <div className="bg-slate-100 p-3 flex items-center justify-center relative min-h-[220px]">
                      <div className="max-w-[200px]">
                        <PosterCanvasPreview poster={p} brand={activeBrand} scale={0.28} />
                      </div>
                      <span
                        className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-[#101D35] text-white text-[10px] font-bold">
                        v{p.versionNumber} · {p.language}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="p-4 flex-1 flex flex-col gap-2.5">
                      <div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {p.id} · {p.posterType}
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{p.title}</h3>
                        <p className="text-xs text-slate-600 line-clamp-1">
                          Course: <span className="font-semibold">{p.courseName || 'General Institute'}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            val.passed
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {val.passed
                            ? `✓ Validation Passed (${val.checks.length}/${val.checks.length})`
                            : `✗ ${val.errors.length} Validation Issue(s)`}
                        </span>
                        {liveCourseStale && (
                          <span className="px-2 py-0.5 rounded-md font-semibold bg-purple-50 text-purple-700">
                            ⚠ Course Changed Since Creation
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <div>
                          Created by <span className="font-medium text-slate-700">{p.createdByName}</span> ·{' '}
                          {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                        {p.approvedByName && (
                          <div className="text-blue-700">
                            Approved by {p.approvedByName} (v{p.approvedVersionNumber})
                          </div>
                        )}
                        {p.publishedByName && (
                          <div className="text-emerald-700">
                            Published by {p.publishedByName} · {(p.publishDestinations || []).join(', ')}
                          </div>
                        )}
                        {p.rejectionReason && (
                          <div className="text-rose-700 bg-rose-50 p-2 rounded-lg mt-1">
                            Rejection reason: {p.rejectionReason}
                          </div>
                        )}
                        {p.changeInstructions && (
                          <div className="text-orange-800 bg-orange-50 p-2 rounded-lg mt-1">
                            Requested changes: {p.changeInstructions}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-auto pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => {
                            setPreviewPoster(p);
                            setPreviewCrop('full');
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect
                        </button>
                        <button
                          onClick={() => handleEditExistingPoster(p)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit / New Ver
                        </button>

                        {isSuperAdmin && p.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => handleApprovePoster(p)}
                              disabled={busy || !val.passed}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() =>
                                setActionModal({ type: 'changes', poster: p, reason: '' })
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-100 hover:bg-orange-200 text-orange-800"
                            >
                              Request Changes
                            </button>
                            <button
                              onClick={() =>
                                setActionModal({ type: 'reject', poster: p, reason: '' })
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 hover:bg-rose-200 text-rose-800 flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}

                        {isSuperAdmin && (p.status === 'approved' || p.status === 'published') && (
                          <button
                            onClick={() => openPublishGate(p)}
                            disabled={busy}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                              isPublishEligible
                                ? 'bg-[#1677FF] hover:bg-blue-700 text-white'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            <Send className="w-3.5 h-3.5" />
                            {p.status === 'published' ? 'Publish / Export Again' : 'Publish Poster'}
                          </button>
                        )}

                        {isSuperAdmin && p.status !== 'archived' && (
                          <button
                            onClick={() => handleArchivePoster(p)}
                            className="px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 ml-auto"
                            title="Archive poster"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Immutable Governance Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-[#1677FF]" /> Approval Decision Audit Log (Immutable)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {approvalLogs.slice(0, 20).map((l) => (
                  <div
                    key={l.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">
                        {l.action.replace(/_/g, ' ').toUpperCase()} · v{l.versionNumber}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(l.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      {l.posterTitle || l.posterId} — by {l.performedByName}
                    </div>
                    {l.reason && <div className="text-slate-500 mt-0.5 italic">{l.reason}</div>}
                  </div>
                ))}
                {approvalLogs.length === 0 && (
                  <p className="text-xs text-slate-400">No approval events logged yet.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                <Send className="w-4 h-4 text-emerald-600" /> Publishing &amp; Export Audit Log (Immutable)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {publishingLogs.slice(0, 20).map((l) => (
                  <div
                    key={l.id}
                    className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-emerald-900">
                        {l.destination.replace(/_/g, ' ').toUpperCase()} · v{l.versionNumber}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(l.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-700 mt-0.5">
                      {l.posterTitle || l.posterId} — published by {l.publishedByName}
                    </div>
                  </div>
                ))}
                {publishingLogs.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No posters published yet. Publishing requires Super Admin approval first.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: AI POSTER GENERATOR & LIVE EDITABLE CANVAS                 */}
      {/* ================================================================= */}
      {mode === 'poster-generator' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Controls */}
          <div className="xl:col-span-7 space-y-5">
            {/* Step 1 & 2: Course & AI Copy Generation */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-[#1677FF]" />
                  Step 1 &amp; 2 — Select Verified Course &amp; Generate AI Copy
                </h3>
                {editingPosterId && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    Editing {editingPosterId} (will create v{(editingOriginal?.versionNumber || 1) + 1})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Verified 2027 Course ({courses.length} available)
                  </label>
                  <select
                    value={draft.courseId || selectedCourseId}
                    onChange={(e) => handleSelectCourse(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.category}{c.isFree ? ' · FREE' : ''}] {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Poster Type
                  </label>
                  <select
                    value={draft.posterType || 'Course Admission Poster'}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, posterType: e.target.value as PosterType }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    {POSTER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Language
                  </label>
                  <select
                    value={draft.language || 'English'}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, language: e.target.value as PosterLanguage }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    {POSTER_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    AI Engine Provider
                  </label>
                  <select
                    value={aiProviderPref}
                    onChange={(e) => setAiProviderPref(e.target.value as 'auto' | 'openai' | 'gemini')}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="auto">Auto (OpenAI if configured, else Gemini)</option>
                    <option value="openai">OpenAI (requires OPENAI_API_KEY)</option>
                    <option value="gemini">Google Gemini (gemini-4-hydrogen)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  placeholder="Optional focus (e.g., highlight evening online classes for school leavers)..."
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
                <button
                  onClick={handleGenerateAICopy}
                  disabled={aiGenerating || !linkedCourse}
                  className="px-4 py-2 rounded-xl bg-[#1677FF] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  {aiGenerating ? 'Generating...' : 'Generate AI Copy'}
                </button>
              </div>
              {lastProviderUsed && (
                <p className="text-[11px] text-slate-500">
                  Last generated by <span className="font-semibold text-slate-700">{lastProviderUsed}</span> using strictly verified course facts.
                </p>
              )}
            </div>

            {/* Step 3: Design & Copy Editor */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#1677FF]" />
                Step 3 — Editable Poster Design Engine
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Approved Template
                  </label>
                  <select
                    value={draft.templateStyle || 'navy_executive'}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        templateStyle: e.target.value as PosterTemplateStyle,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    {POSTER_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Size / Platform Preset
                  </label>
                  <select
                    value={draft.sizePreset || 'instagram_portrait'}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        sizePreset: e.target.value as PosterSizePreset,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    {POSTER_SIZE_PRESETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Logo Position
                  </label>
                  <select
                    value={draft.logoPosition || 'top-left'}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        logoPosition: e.target.value as 'top-left' | 'top-right' | 'top-center',
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Background Theme (Uploaded TECHMAN Media or Custom Upload)
                  </label>
                  <select
                    value={
                      BACKGROUND_PRESETS.some((b) => b.url === (draft.backgroundImageUrl || ''))
                        ? draft.backgroundImageUrl || ''
                        : '__custom__'
                    }
                    onChange={(e) => {
                      if (e.target.value !== '__custom__') {
                        setDraft((prev) => ({ ...prev, backgroundImageUrl: e.target.value }));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                  >
                    {BACKGROUND_PRESETS.map((b) => (
                      <option key={b.label} value={b.url}>
                        {b.label}
                      </option>
                    ))}
                    {draft.backgroundImageUrl &&
                      !BACKGROUND_PRESETS.some((b) => b.url === draft.backgroundImageUrl) && (
                        <option value="__custom__">Custom Uploaded Background</option>
                      )}
                  </select>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateAIBackground}
                      disabled={aiBgGenerating || busy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-[11px] font-semibold text-blue-800 cursor-pointer"
                    >
                      <Wand2 className="w-3 h-3" />
                      {aiBgGenerating ? 'Generating Art...' : 'Generate AI Background'}
                    </button>
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer">
                      Upload Background
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const img = new Image();
                            img.onload = () => {
                              const maxDim = 920;
                              const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
                              const c = document.createElement('canvas');
                              c.width = Math.max(1, Math.round(img.width * ratio));
                              c.height = Math.max(1, Math.round(img.height * ratio));
                              const cx = c.getContext('2d');
                              if (cx) {
                                cx.drawImage(img, 0, 0, c.width, c.height);
                                const dataUrl = c.toDataURL('image/jpeg', 0.72);
                                if (dataUrl.length <= 240000) {
                                  setDraft((prev) => ({ ...prev, backgroundImageUrl: dataUrl }));
                                } else {
                                  setBannerMsg({
                                    type: 'err',
                                    text: 'Background image is too large; choose a smaller image.',
                                  });
                                }
                              }
                            };
                            img.src = String(reader.result || '');
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer">
                      Custom Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const img = new Image();
                            img.onload = () => {
                              const maxDim = 400;
                              const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
                              const c = document.createElement('canvas');
                              c.width = Math.max(1, Math.round(img.width * ratio));
                              c.height = Math.max(1, Math.round(img.height * ratio));
                              const cx = c.getContext('2d');
                              if (cx) {
                                cx.drawImage(img, 0, 0, c.width, c.height);
                                const dataUrl = c.toDataURL('image/png');
                                if (dataUrl.length <= 190000) {
                                  setDraft((prev) => ({ ...prev, customLogoUrl: dataUrl }));
                                } else {
                                  setBannerMsg({
                                    type: 'err',
                                    text: 'Logo image is too large; choose a compact PNG/JPG.',
                                  });
                                }
                              }
                            };
                            img.src = String(reader.result || '');
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {draft.customLogoUrl && (
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, customLogoUrl: '' }))}
                        className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                      >
                        Reset Official Logo
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Accent Color
                    </label>
                    <input
                      type="color"
                      value={draft.accentColor || '#1677FF'}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      className="w-full h-10 rounded-xl border border-slate-300 p-1 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Font Scale ({Number(draft.fontScale || 1).toFixed(2)}x)
                    </label>
                    <input
                      type="range"
                      min="0.85"
                      max="1.15"
                      step="0.05"
                      value={draft.fontScale || 1}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, fontScale: Number(e.target.value) }))
                      }
                      className="w-full mt-2"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Typography Style
                  </label>
                  <select
                    value={draft.fontFamily || 'inter'}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        fontFamily: e.target.value as 'inter' | 'geometric' | 'serif' | 'mono',
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="inter">Inter Clean</option>
                    <option value="geometric">Geometric Bold</option>
                    <option value="serif">Academic Serif</option>
                    <option value="mono">Tech Mono</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Headline Align
                  </label>
                  <select
                    value={draft.textAlign || 'left'}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        textAlign: e.target.value as 'left' | 'center',
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="left">Left Aligned</option>
                    <option value="center">Centered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Position Offset ({Number(draft.headlineOffsetY || 0)}px)
                  </label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="5"
                    value={Number(draft.headlineOffsetY || 0)}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, headlineOffsetY: Number(e.target.value) }))
                    }
                    className="w-full mt-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Bg Opacity ({Math.round(Number(draft.bgOpacity ?? 0.24) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0.05"
                    max="0.6"
                    step="0.05"
                    value={Number(draft.bgOpacity ?? 0.24)}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, bgOpacity: Number(e.target.value) }))
                    }
                    className="w-full mt-1.5"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Internal Poster Title
                    </label>
                    <input
                      value={draft.title || ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Top Badge Text
                    </label>
                    <input
                      value={draft.badgeText || ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, badgeText: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Poster Headline
                  </label>
                  <input
                    value={draft.headline || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, headline: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Promotional Subtitle
                  </label>
                  <textarea
                    rows={2}
                    value={draft.subheadline || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, subheadline: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Verified Fee Label
                    </label>
                    <input
                      value={draft.feeLabel || ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, feeLabel: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Registration Fee (Optional)
                    </label>
                    <input
                      value={draft.registrationFeeLabel || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, registrationFeeLabel: e.target.value }))
                      }
                      placeholder="e.g. Reg. Fee: LKR 5,000"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Verified Duration
                    </label>
                    <input
                      value={draft.durationLabel || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, durationLabel: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Study Mode
                    </label>
                    <input
                      value={draft.modeLabel || ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, modeLabel: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Course Highlights (one per line, max 6)
                  </label>
                  <textarea
                    rows={4}
                    value={(draft.highlights || []).join('\n')}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        highlights: e.target.value.split('\n').slice(0, 6),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Call to Action Button
                    </label>
                    <input
                      value={draft.ctaText || ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, ctaText: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Verified Contact &amp; Website Footer
                    </label>
                    <input
                      value={draft.footerContact || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, footerContact: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Social Media Caption
                    </label>
                    <textarea
                      rows={3}
                      value={draft.socialCaption || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, socialCaption: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      WhatsApp Promotional Message
                    </label>
                    <textarea
                      rows={3}
                      value={draft.whatsappMessage || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, whatsappMessage: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Verified Hashtags (space or comma separated)
                  </label>
                  <input
                    value={(draft.hashtags || []).join(' ')}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hashtags: e.target.value
                          .split(/[\s,]+/)
                          .map((t) => t.trim())
                          .filter(Boolean)
                          .map((t) => (t.startsWith('#') ? t : `#${t}`))
                          .slice(0, 15),
                      }))
                    }
                    placeholder="#TechmanCollege #TechmanAI #SriLanka2027"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>

                {aiLearningBenefits.length > 0 && (
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                    <div className="text-xs font-bold text-[#101D35]">
                      AI-Suggested Learning Benefits (click to add to Poster Highlights):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {aiLearningBenefits.map((benefit, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => {
                              const current = (prev.highlights || []).filter(Boolean);
                              if (current.includes(benefit) || current.length >= 6) return prev;
                              return { ...prev, highlights: [...current, benefit] };
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-[11px] font-medium text-blue-900 hover:bg-blue-100 transition cursor-pointer"
                        >
                          + {benefit}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Live Canvas + Step 4 Validation Gate + Step 5 Save */}
          <div className="xl:col-span-5 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 text-sm">Live Poster Preview</h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {getSizePresetMeta(draft.sizePreset || 'instagram_portrait').width} ×{' '}
                  {getSizePresetMeta(draft.sizePreset || 'instagram_portrait').height}px
                </span>
              </div>
              <div className="bg-slate-100 rounded-xl p-4 flex items-center justify-center">
                <PosterCanvasPreview poster={draft} brand={activeBrand} scale={0.48} />
              </div>
              <p className="text-[11px] text-slate-500 mt-2.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Publishing &amp; final campaign exports unlock ONLY after explicit Super Admin approval.
              </p>
            </div>

            {/* Step 4: Automatic Validation Engine */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  {liveValidation.passed ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  )}
                  Step 4 — Automatic Accuracy Validation
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    liveValidation.passed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {liveValidation.passed ? 'PASSED' : `${liveValidation.errors.length} BLOCKED`}
                </span>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {liveValidation.checks.map((chk) => (
                  <div
                    key={chk.code}
                    className={`p-2 rounded-lg text-xs border flex items-start gap-2 ${
                      chk.passed
                        ? 'bg-emerald-50/60 border-emerald-100 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    {chk.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold">{chk.label}</div>
                      <div className="text-[11px] opacity-85">{chk.message}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Step 5: Save Draft / Duplicate / Submit for Approval */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => handleSavePoster('draft')}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  Save as Draft
                </button>
                {editingPosterId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPosterId(null);
                      setDraft((prev) => ({
                        ...prev,
                        title: `${(prev.title || 'Poster').replace(/\s*\(Copy\)$/i, '')} (Copy)`,
                        status: 'draft',
                      }));
                      setBannerMsg({
                        type: 'ok',
                        text: 'Duplicated into a new unsaved draft. Click "Save as Draft" or "Submit for Admin Approval" to persist as a separate poster.',
                      });
                    }}
                    disabled={busy}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Duplicate Poster
                  </button>
                )}
                <button
                  onClick={() => handleSavePoster('pending_approval')}
                  disabled={busy || !liveValidation.passed}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#172A45] disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#60A5FA]" />
                  Submit for Admin Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: BULK POSTER GENERATOR & REVIEW GALLERY                     */}
      {/* ================================================================= */}
      {mode === 'poster-bulk' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#1677FF]" />
                  Bulk Course Poster Generator (Individual Validation &amp; Approval Required)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Creates a separate uniquely identified poster per course. Bulk generation NEVER publishes automatically.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    setBulkSelectedIds(courses.filter((c) => c.isFree).map((c) => c.id))
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                >
                  Select All 5 FREE Courses
                </button>
                <button
                  onClick={() =>
                    setBulkSelectedIds(
                      courses.filter((c) => c.category === 'Certificate').map((c) => c.id)
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                >
                  All Certificates ({courses.filter((c) => c.category === 'Certificate').length})
                </button>
                <button
                  onClick={() =>
                    setBulkSelectedIds(
                      courses.filter((c) => c.category === 'Diploma').map((c) => c.id)
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200"
                >
                  All Diplomas ({courses.filter((c) => c.category === 'Diploma').length})
                </button>
                <button
                  onClick={() => setBulkSelectedIds([])}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={bulkTemplate}
                onChange={(e) => setBulkTemplate(e.target.value as PosterTemplateStyle)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
              >
                {POSTER_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    Template: {t.label}
                  </option>
                ))}
              </select>
              <select
                value={bulkSize}
                onChange={(e) => setBulkSize(e.target.value as PosterSizePreset)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
              >
                {POSTER_SIZE_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                value={bulkLanguage}
                onChange={(e) => setBulkLanguage(e.target.value as PosterLanguage)}
                className="px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
              >
                {POSTER_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    Language: {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {courses.map((c) => {
                const checked = bulkSelectedIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border ${
                      checked
                        ? 'bg-blue-50 border-[#1677FF] text-[#101D35] font-semibold'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setBulkSelectedIds((prev) =>
                          prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                        )
                      }
                    />
                    <span className="truncate flex-1">{c.name}</span>
                    {c.isFree && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        FREE
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600">
                Selected: <strong>{bulkSelectedIds.length}</strong> course(s)
              </span>
              <div className="flex gap-2">
                {isSuperAdmin && (
                  <button
                    onClick={handleBulkApproveValid}
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    Bulk Approve Valid Pending Posters
                  </button>
                )}
                <button
                  onClick={handleBulkGenerate}
                  disabled={busy || bulkSelectedIds.length === 0}
                  className="px-5 py-2 rounded-xl bg-[#1677FF] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold"
                >
                  {busy
                    ? 'Generating...'
                    : `Generate ${bulkSelectedIds.length} Individual Draft Posters`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: MARKETING ASSET LIBRARY & OFFICIAL UPLOADED POSTERS        */}
      {/* ================================================================= */}
      {mode === 'poster-library' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 text-sm mb-3">
              Published AI Posters ({posters.filter((p) => p.status === 'published').length})
            </h3>
            {posters.filter((p) => p.status === 'published').length === 0 ? (
              <p className="text-xs text-slate-500">
                No AI posters have been explicitly published yet. Approve and publish a poster from the Approval Centre to feature it here and on the public website.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {posters
                  .filter((p) => p.status === 'published')
                  .map((p) => (
                    <div key={p.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <PosterCanvasPreview poster={p} brand={activeBrand} scale={0.3} />
                      <div className="font-bold text-xs text-slate-900">{p.title}</div>
                      <div className="text-[11px] text-emerald-700">
                        Published v{p.versionNumber} · {p.publishedByName}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => exportPosterAsPNG(p, activeBrand)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> PNG
                        </button>
                        <button
                          onClick={() => exportPosterAsJPG(p, activeBrand)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold"
                        >
                          JPG
                        </button>
                        <button
                          onClick={() => exportPosterAsPDF(p, activeBrand)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold"
                        >
                          PDF
                        </button>
                        {p.whatsappMessage && (
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(p.whatsappMessage || '');
                              setBannerMsg({ type: 'ok', text: 'WhatsApp broadcast message copied.' });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-semibold flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> WhatsApp
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 text-sm mb-3">
              Official TECHMAN COLLEGE Uploaded Posters &amp; Creative Assets ({OFFICIAL_POSTERS.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {OFFICIAL_POSTERS.map((op) => (
                <div
                  key={op.id}
                  className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex flex-col"
                >
                  <img
                    src={op.imageUrl}
                    alt={op.title}
                    loading="lazy"
                    className="w-full h-52 object-cover bg-slate-900"
                  />
                  <div className="p-3 flex-1 flex flex-col">
                    <span className="text-[10px] font-bold uppercase text-[#1677FF]">
                      {op.category}
                    </span>
                    <div className="font-bold text-xs text-slate-900 mt-0.5">{op.title}</div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{op.subtitle}</p>
                    <a
                      href={op.imageUrl}
                      download
                      className="mt-auto pt-2 text-[11px] font-semibold text-[#1677FF] hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> Download Asset
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 5: BRAND SETTINGS                                             */}
      {/* ================================================================= */}
      {mode === 'poster-brand' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-3xl space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Palette className="w-4 h-4 text-[#1677FF]" />
            Official TECHMAN Brand Settings (Applied to Every Poster)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Name</label>
              <input
                value={brandForm.brandName}
                onChange={(e) => setBrandForm({ ...brandForm, brandName: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Short Name</label>
              <input
                value={brandForm.shortName}
                onChange={(e) => setBrandForm({ ...brandForm, shortName: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Verified Contact Phone
              </label>
              <input
                value={brandForm.contactPhone}
                onChange={(e) => setBrandForm({ ...brandForm, contactPhone: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official Website
              </label>
              <input
                value={brandForm.website}
                onChange={(e) => setBrandForm({ ...brandForm, website: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Official Logo Path / URL
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setBrandForm({ ...brandForm, logoUrl: BRAND_IMAGES.officialLogo })
                  }
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-[11px] font-bold cursor-pointer"
                >
                  Apply Official TECHMAN COLLEGE Logo (2021)
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border border-slate-200 bg-[#0A192F] overflow-hidden shrink-0 flex items-center justify-center p-1">
                  <img
                    src={brandForm.logoUrl || BRAND_IMAGES.officialLogo}
                    alt="Official TECHMAN COLLEGE Logo Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <input
                  value={brandForm.logoUrl}
                  onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Navy Color
              </label>
              <input
                type="color"
                value={brandForm.primaryColor}
                onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-300 p-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Electric Blue Accent
              </label>
              <input
                type="color"
                value={brandForm.accentColor}
                onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-300 p-1"
              />
            </div>
          </div>
          <button
            onClick={handleSaveBrand}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#172A45] text-white text-xs font-bold"
          >
            Save Brand Settings
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 6: AI AUTOMATION WORKFLOWS                                    */}
      {/* ================================================================= */}
      {mode === 'poster-workflows' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeWorkflows.map((wf) => (
            <div
              key={wf.workflowKey}
              className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-[#1677FF]" />
                    <h4 className="font-bold text-slate-900 text-sm">{wf.name}</h4>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{wf.description}</p>
                </div>
                <button
                  onClick={() => handleToggleWorkflow(wf)}
                  disabled={!isSuperAdmin}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    wf.enabled
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {wf.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <div className="text-[11px] text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg font-medium">
                Human Approval Gate: MANDATORY (Auto-publish permanently disabled)
              </div>
              {wf.lastRunSummary && (
                <div className="text-[11px] text-slate-500">
                  Last run: {wf.lastRunSummary}
                </div>
              )}
              {wf.workflowKey === 'course_update_detector' && isSuperAdmin && (
                <button
                  onClick={handleRunCourseChangeScan}
                  disabled={busy}
                  className="mt-auto px-3.5 py-2 rounded-xl bg-[#101D35] text-white text-xs font-bold w-fit flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Run Course Change Detector Now
                </button>
              )}
              {wf.workflowKey === 'free_course_campaign' && (
                <button
                  onClick={() => {
                    setBulkSelectedIds(courses.filter((c) => c.isFree).map((c) => c.id));
                    onNavigateTab('poster-bulk');
                  }}
                  className="mt-auto px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold w-fit"
                >
                  Open 5 FREE Courses in Bulk Generator
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ================================================================= */}
      {/* FULL-RESOLUTION PREVIEW MODAL (DESKTOP + MOBILE CROP INSPECTION)  */}
      {/* ================================================================= */}
      {previewPoster && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {previewPoster.title} · <span className="font-mono text-xs">{previewPoster.id}</span> (v{previewPoster.versionNumber})
                </h3>
                <p className="text-xs text-slate-500">
                  Hash: {previewPoster.contentHash || computePosterContentHash(previewPoster)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewCrop('full')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    previewCrop === 'full' ? 'bg-[#101D35] text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Full Canvas
                </button>
                <button
                  onClick={() => setPreviewCrop('desktop')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    previewCrop === 'desktop' ? 'bg-[#101D35] text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Desktop Feed
                </button>
                <button
                  onClick={() => setPreviewCrop('mobile')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    previewCrop === 'mobile' ? 'bg-[#101D35] text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile Crop
                </button>
                <button
                  onClick={() => setPreviewPoster(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-slate-100 rounded-xl p-4 flex items-center justify-center">
                <div
                  className={
                    previewCrop === 'mobile'
                      ? 'w-[280px] border-8 border-slate-900 rounded-[28px] overflow-hidden bg-slate-900 shadow-xl'
                      : previewCrop === 'desktop'
                        ? 'w-full max-w-[480px] border border-slate-300 rounded-xl overflow-hidden bg-white p-3 shadow'
                        : 'w-full flex justify-center'
                  }
                >
                  <PosterCanvasPreview poster={previewPoster} brand={activeBrand} scale={0.65} />
                </div>
              </div>
              <div className="lg:col-span-5 space-y-4 text-xs">
                {/* Status + Quick Super Admin Review Controls */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                        STATUS_BADGES[previewPoster.status]?.className || ''
                      }`}
                    >
                      {STATUS_BADGES[previewPoster.status]?.label || previewPoster.status}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Creator: <strong>{previewPoster.createdByName}</strong>
                    </span>
                  </div>
                  {previewPoster.approvedByName && (
                    <div className="text-[11px] text-blue-800">
                      Approved v{previewPoster.approvedVersionNumber} by{' '}
                      <strong>{previewPoster.approvedByName}</strong>
                      {previewPoster.approvedAt
                        ? ` · ${new Date(previewPoster.approvedAt).toLocaleString()}`
                        : ''}
                    </div>
                  )}
                  {isSuperAdmin && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(previewPoster.status === 'pending_approval' ||
                        previewPoster.status === 'draft' ||
                        previewPoster.status === 'changes_requested') && (
                        <button
                          onClick={() => {
                            const target = previewPoster;
                            setPreviewPoster(null);
                            void handleApprovePoster(target);
                          }}
                          disabled={busy || !previewPoster.validationPassed}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold"
                        >
                          Approve v{previewPoster.versionNumber}
                        </button>
                      )}
                      {previewPoster.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => {
                              const target = previewPoster;
                              setPreviewPoster(null);
                              setActionModal({ type: 'changes', poster: target, reason: '' });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-orange-600 text-white font-bold"
                          >
                            Request Changes
                          </button>
                          <button
                            onClick={() => {
                              const target = previewPoster;
                              setPreviewPoster(null);
                              setActionModal({ type: 'reject', poster: target, reason: '' });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {(previewPoster.status === 'approved' || previewPoster.status === 'published') && (
                        <button
                          onClick={() => {
                            const target = previewPoster;
                            setPreviewPoster(null);
                            void openPublishGate(target);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white font-bold"
                        >
                          Publish / Export
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Per-Poster Version History */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-[#1677FF]" />
                    Version History ({posterVersions.filter((v) => v.posterId === previewPoster.id).length})
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {posterVersions
                      .filter((v) => v.posterId === previewPoster.id)
                      .sort((a, b) => b.versionNumber - a.versionNumber)
                      .map((v) => (
                        <div key={v.id} className="p-2 rounded bg-white border border-slate-100 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              v{v.versionNumber} · {v.createdByName}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                v.validationPassed
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {v.validationPassed ? 'Valid' : 'Blocked'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">{v.changeNote || v.headline}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {new Date(v.createdAt).toLocaleString()} · {v.contentHash || '—'}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Per-Poster Immutable Approval & Publishing Audit Timeline */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Approval &amp; Publishing Audit Trail
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {approvalLogs
                      .filter((l) => l.posterId === previewPoster.id)
                      .map((l) => (
                        <div key={l.id} className="p-2 rounded bg-white border border-slate-100">
                          <div className="font-semibold text-slate-900">
                            [{l.action.replace(/_/g, ' ').toUpperCase()}] v{l.versionNumber} · {l.performedByName}
                          </div>
                          {l.reason && <div className="text-[11px] text-slate-600">{l.reason}</div>}
                          <div className="text-[10px] text-slate-400">
                            {new Date(l.timestamp).toLocaleString()} ({l.performedByEmail})
                          </div>
                        </div>
                      ))}
                    {publishingLogs
                      .filter((l) => l.posterId === previewPoster.id)
                      .map((l) => (
                        <div key={l.id} className="p-2 rounded bg-emerald-50/70 border border-emerald-100">
                          <div className="font-semibold text-emerald-900">
                            [PUBLISHED → {l.destination}] v{l.versionNumber} · {l.publishedByName}
                          </div>
                          <div className="text-[10px] text-emerald-700">
                            {new Date(l.timestamp).toLocaleString()} ({l.publishedByEmail})
                          </div>
                        </div>
                      ))}
                    {approvalLogs.filter((l) => l.posterId === previewPoster.id).length === 0 &&
                      publishingLogs.filter((l) => l.posterId === previewPoster.id).length === 0 && (
                        <div className="text-[11px] text-slate-400">No approval or publish events logged yet.</div>
                      )}
                  </div>
                </div>

                {previewPoster.socialCaption && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 mb-1">Social Media Caption</div>
                    <pre className="whitespace-pre-wrap font-sans text-slate-700">
                      {previewPoster.socialCaption}
                    </pre>
                    {previewPoster.hashtags && previewPoster.hashtags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {previewPoster.hashtags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {previewPoster.whatsappMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
                    <div className="font-bold text-emerald-900 mb-1">WhatsApp Broadcast Copy</div>
                    <pre className="whitespace-pre-wrap font-sans text-emerald-900">
                      {previewPoster.whatsappMessage}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* REJECT / REQUEST CHANGES MODAL                                    */}
      {/* ================================================================= */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-slate-900 text-base">
              {actionModal.type === 'reject'
                ? `Reject Poster (${actionModal.poster.id})`
                : `Request Changes (${actionModal.poster.id})`}
            </h3>
            <p className="text-xs text-slate-600">
              {actionModal.type === 'reject'
                ? 'Provide a mandatory rejection reason. The rejected version is preserved in the audit log and the creator is notified.'
                : 'Enter correction instructions. Editing will generate a new version requiring fresh Super Admin approval.'}
            </p>
            <textarea
              rows={4}
              value={actionModal.reason}
              onChange={(e) => setActionModal({ ...actionModal, reason: e.target.value })}
              placeholder="Enter clear reason / correction instructions..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejectOrChanges}
                disabled={busy}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold ${
                  actionModal.type === 'reject' ? 'bg-rose-600' : 'bg-orange-600'
                }`}
              >
                Confirm {actionModal.type === 'reject' ? 'Rejection' : 'Change Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SEPARATE MANDATORY PRE-PUBLISH VERIFICATION & CONFIRMATION MODAL  */}
      {/* ================================================================= */}
      {publishModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-[#1677FF]" />
                Final Publishing Confirmation (Super Admin Only)
              </h3>
              <button onClick={() => setPublishModal(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {publishModal.verifyState === 'verifying' && (
              <div className="p-4 rounded-xl bg-blue-50 text-blue-900 text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 animate-spin" />
                Running server-side pre-publish integrity checks (/api/posters/verify-publish)...
              </div>
            )}

            {publishModal.verifyState === 'blocked' && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> Publishing Blocked by Governance Gate
                </div>
                {publishModal.verifyErrors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            {publishModal.verifyState === 'ok' && (
              <>
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> All 5 Pre-Publish Server Checks Verified
                  </div>
                  <div>
                    Exact Version v{publishModal.poster.versionNumber} · Unmodified Content Hash · Active Course Match
                  </div>
                  <div className="font-mono text-[10px] opacity-80">
                    Verification Receipt: {publishModal.receiptSig?.slice(0, 24)}...
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-800">
                    Choose Authorized Publishing / Export Destinations:
                  </div>
                  {(
                    [
                      ['website_marketing_library', 'Publish to Website Marketing Library'],
                      ['public_course_page', 'Publish to Selected Public Course Page'],
                      ['download_png', 'Download High-Res PNG'],
                      ['download_jpg', 'Download High-Res JPG'],
                      ['download_pdf', 'Download Print-Ready PDF'],
                      ['export_whatsapp', 'Copy Formatted WhatsApp Campaign Text'],
                      ['export_social_media', 'Copy Social Media Caption & Hashtags'],
                      ['scheduled_campaign', 'Schedule a Future Campaign Date'],
                    ] as Array<[string, string]>
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(publishModal.destinations[key])}
                        onChange={(e) =>
                          setPublishModal({
                            ...publishModal,
                            destinations: {
                              ...publishModal.destinations,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {publishModal.destinations.scheduled_campaign && (
                    <input
                      type="datetime-local"
                      value={publishModal.scheduledFor}
                      onChange={(e) =>
                        setPublishModal({ ...publishModal, scheduledFor: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    />
                  )}
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(publishModal.confirmFinalPublish)}
                    onChange={(e) =>
                      setPublishModal({
                        ...publishModal,
                        confirmFinalPublish: e.target.checked,
                      })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Final Publishing Confirmation:</strong> I have inspected the full-resolution
                    preview, verified all course details, and explicitly authorize publishing exact
                    approved version <strong>v{publishModal.poster.versionNumber}</strong> to the
                    selected destination(s).
                  </span>
                </label>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setPublishModal(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmPublish}
                    disabled={busy || !publishModal.confirmFinalPublish}
                    className="px-5 py-2 rounded-xl bg-[#1677FF] hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {busy ? 'Publishing...' : 'Authorize & Publish Now'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
