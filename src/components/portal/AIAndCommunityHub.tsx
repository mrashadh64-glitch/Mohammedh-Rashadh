import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Database,
  Download,
  Flag,
  Image as ImageIcon,
  MessageSquare,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  Trophy,
  Upload,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { formatLkr, logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import { INSTITUTE_INFO } from '../../data/catalogSeed';
import {
  AffiliateRecord,
  AIConversation,
  AuditLog,
  CmsItem,
  CommunityPost,
  Course,
  SystemSettings,
  UserProfile,
} from '../../types/lms';
import { EmptyState, StatusLabel } from '../common/PlatformWidgets';

interface HubProps {
  mode: 'ai-tutor' | 'career' | 'community' | 'affiliates' | 'cms' | 'security';
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  communityPosts: CommunityPost[];
  affiliates: AffiliateRecord[];
  cmsItems: CmsItem[];
  auditLogs: AuditLog[];
  usersList: UserProfile[];
  settings: SystemSettings;
  onRefreshData: () => Promise<void>;
}

const CAREER_OPPORTUNITIES = [
  {
    id: 'opp-1',
    title: 'Junior AI Automation Engineer',
    company: 'Colombo Digital Labs (Sri Lanka / Hybrid)',
    type: 'Internship',
    skills: 'Prompt Engineering · Gemini · Workflow Automation',
  },
  {
    id: 'opp-2',
    title: 'React & Firebase Web Developer',
    company: 'LankaTech Global Remote',
    type: 'Full-Time Remote',
    skills: 'React · TypeScript · Firebase · Tailwind CSS',
  },
  {
    id: 'opp-3',
    title: 'Brand Identity & Social Media Designer',
    company: 'Kandy Creative Collective',
    type: 'Freelance Contract',
    skills: 'Canva AI · Illustrator · Photoshop · Reels',
  },
];

export const AIAndCommunityHub: React.FC<HubProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  courses,
  communityPosts,
  affiliates,
  cmsItems,
  auditLogs,
  usersList,
  settings,
  onRefreshData,
}) => {
  const { getBearerToken, authMode } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);

  // 1. TECHMAN AI TUTOR STATE (Private per-user history)
  const [tutorCourseId, setTutorCourseId] = useState(courses[0]?.id || '');
  const [tutorLang, setTutorLang] = useState<'English' | 'Tamil' | 'Sinhala'>('English');
  const [tutorMode, setTutorMode] = useState('tutor');
  const [tutorPrompt, setTutorPrompt] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);

  // 2. AI CAREER CENTER STATE
  const [careerTool, setCareerTool] = useState<'advisor' | 'resume' | 'interview' | 'skill_gap'>('advisor');
  const [targetRole, setTargetRole] = useState('AI Automation & Web Developer');
  const [skillsText, setSkillsText] = useState('Prompt Engineering, React, Canva AI, Digital Marketing');
  const [careerNotes, setCareerNotes] = useState('');
  const [careerOutput, setCareerOutput] = useState('');
  const [careerLoading, setCareerLoading] = useState(false);

  // 3. COMMUNITY STATE
  const [postType, setPostType] = useState<CommunityPost['postType']>('Discussion');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postUrl, setPostUrl] = useState('');

  // 4. CMS & AI MEDIA ORGANIZER STATE
  const [mediaHint, setMediaHint] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [mediaMime, setMediaMime] = useState<string>('image/jpeg');
  const [aiMediaLoading, setAiMediaLoading] = useState(false);
  const [cmsDraft, setCmsDraft] = useState<{
    itemType: CmsItem['itemType'];
    title: string;
    category: string;
    summary: string;
    tags: string[];
  } | null>(null);

  // 5. SETTINGS STATE
  const [cfgCommission, setCfgCommission] = useState(settings.defaultAffiliateCommissionPercent ?? 10);
  const [cfgXpLesson, setCfgXpLesson] = useState(settings.xpPerLesson ?? 50);
  const [cfgPublicTenant, setCfgPublicTenant] = useState(Boolean(settings.publicTenantRegistrationEnabled));

  useEffect(() => {
    if (mode !== 'ai-tutor') return;
    const loadHistory = async () => {
      try {
        const q = query(collection(db, 'aiConversations'), where('userId', '==', profile.uid));
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AIConversation, 'id'>) }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setConversations(list);
      } catch (err) {
        console.warn('AI history load warning:', err);
      }
    };
    void loadHistory();
  }, [mode, profile.uid]);

  // HANDLER: TECHMAN AI TUTOR
  const handleAskTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorPrompt.trim()) return;
    const course = courses.find((c) => c.id === tutorCourseId) || courses[0];
    setTutorLoading(true);
    setNotice(null);
    try {
      const idToken = await getBearerToken();
      if (!idToken) throw new Error('Please sign in again to use TECHMAN AI Tutor.');
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt: tutorPrompt,
          courseName: course?.name || 'General Programme',
          syllabusTopics: course?.syllabusTopics || [],
          language: tutorLang,
          mode: tutorMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Tutor failed.');

      const convId = makeSafeId('AIC');
      const convDoc: AIConversation = {
        id: convId,
        userId: profile.uid,
        courseId: course?.id || '',
        language: tutorLang,
        prompt: tutorPrompt.trim().slice(0, 2000),
        response: String(data.answer || '').slice(0, 8000),
        createdAt: new Date().toISOString(),
      };
      if (authMode === 'firebase') {
        await setDoc(doc(db, 'aiConversations', convId), convDoc);
      }
      setConversations((prev) => [convDoc, ...prev]);
      setTutorPrompt('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to reach TECHMAN COLLEGE AI Tutor.');
    } finally {
      setTutorLoading(false);
    }
  };

  // HANDLER: AI CAREER CENTER
  const handleRunCareerTool = async (e: React.FormEvent) => {
    e.preventDefault();
    setCareerLoading(true);
    setNotice(null);
    try {
      const idToken = await getBearerToken();
      if (!idToken) throw new Error('Please sign in again to use AI Career Center.');
      const res = await fetch('/api/ai/career', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          tool: careerTool,
          studentName: profile.displayName,
          enrolledCourses: courses.slice(0, 3).map((c) => c.name).join(', '),
          targetRole,
          skills: skillsText,
          notes: careerNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Career Center request failed.');
      setCareerOutput(data.result || '');
      if (authMode === 'firebase') {
        await setDoc(
          doc(db, 'careerProfiles', profile.uid),
          {
            userId: profile.uid,
            headline: targetRole.slice(0, 160),
            targetRole: targetRole.slice(0, 120),
            skills: skillsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 25),
            aiResumeDraft: String(data.result || '').slice(0, 8000),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Career AI failed.');
    } finally {
      setCareerLoading(false);
    }
  };

  // HANDLER: COMMUNITY POST
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postBody.trim()) return;
    const id = makeSafeId('PST');
    await setDoc(doc(db, 'communityPosts', id), {
      userId: profile.uid,
      authorName: profile.displayName,
      authorRole: profile.role,
      postType,
      title: postTitle.trim().slice(0, 160),
      body: postBody.trim().slice(0, 2400),
      projectUrl: postUrl.trim().slice(0, 400),
      moderatedStatus: 'active',
      likesCount: 0,
      createdAt: new Date().toISOString(),
    });
    setPostTitle('');
    setPostBody('');
    setPostUrl('');
    setNotice('Published to TECHMAN COLLEGE Student Community.');
    await onRefreshData();
  };

  // HANDLER: AFFILIATE ACTIVATION
  const handleJoinAffiliate = async () => {
    const code = `TM-${profile.displayName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'PART'}-${Math.floor(10 + Math.random() * 89)}`;
    await setDoc(doc(db, 'affiliates', profile.uid), {
      userId: profile.uid,
      partnerName: profile.displayName,
      referralCode: code,
      commissionRatePercent: settings.defaultAffiliateCommissionPercent ?? 10,
      leadsCount: 0,
      conversionsCount: 0,
      pendingCommissionLkr: 0,
      approvedCommissionLkr: 0,
      withdrawalRequestedLkr: 0,
      status: isOwner ? 'active' : 'pending_review',
      updatedAt: new Date().toISOString(),
    });
    setNotice(`Affiliate referral code ${code} created! Owner approval activates commission payouts.`);
    await onRefreshData();
  };

  // HANDLER: AI MEDIA ORGANIZER
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setNotice('Image must be under 4 MB.');
      return;
    }
    setMediaMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleAnalyzeMedia = async () => {
    if (!mediaPreview && !mediaHint.trim()) {
      setNotice('Upload a poster/image or provide brief notes for AI Media Organizer.');
      return;
    }
    setAiMediaLoading(true);
    setNotice(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Please sign in again to use AI Media Organizer.');
      const res = await fetch('/api/ai/media-organize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          imageBase64: mediaPreview,
          mimeType: mediaMime,
          hintText: mediaHint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Media Organizer failed.');
      const s = data.suggestion || {};
      const validTypes: CmsItem['itemType'][] = ['News', 'Event', 'Story', 'FAQ', 'Poster', 'Banner'];
      setCmsDraft({
        itemType: validTypes.includes(s.suggestedItemType) ? s.suggestedItemType : 'Poster',
        title: s.title || 'Untitled College Media',
        category: s.category || 'Announcements',
        summary: `${s.description || ''}${s.extractedText ? `\n\nExtracted Text: ${s.extractedText}` : ''}`,
        tags: Array.isArray(s.tags) ? s.tags.slice(0, 10) : [],
      });
      setNotice(data.notice || 'AI suggestion ready for Admin review before publishing.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to analyze media.');
    } finally {
      setAiMediaLoading(false);
    }
  };

  const handleSaveCmsDraft = async (publishNow: boolean) => {
    if (!cmsDraft) return;
    const id = makeSafeId('CMS');
    await setDoc(doc(db, 'cmsItems', id), {
      itemType: cmsDraft.itemType,
      title: cmsDraft.title.slice(0, 180),
      summary: cmsDraft.summary.slice(0, 1600),
      category: cmsDraft.category.slice(0, 64),
      aiSuggestedTags: cmsDraft.tags,
      status: publishNow ? 'published' : 'draft',
      createdBy: profile.uid,
      institutionId: INSTITUTE_INFO.institutionId,
      updatedAt: new Date().toISOString(),
    });
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: publishNow ? 'PUBLISH_CMS_ITEM' : 'SAVE_CMS_DRAFT',
      targetType: 'cmsItems',
      targetId: id,
      details: `${publishNow ? 'Approved and published' : 'Saved draft'} CMS item "${cmsDraft.title}"`,
    });
    setCmsDraft(null);
    setMediaHint('');
    setMediaPreview('');
    setNotice(publishNow ? 'Approved and published to public website.' : 'Saved as unpublished draft.');
    await onRefreshData();
  };

  // HANDLER: BACKUP EXPORT & SETTINGS
  const handleExportBackupJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      institutionId: INSTITUTE_INFO.institutionId,
      collegeName: INSTITUTE_INFO.officialName,
      establishedYear: INSTITUTE_INFO.establishedYear,
      counts: {
        courses: courses.length,
        users: usersList.length,
        cmsItems: cmsItems.length,
        auditLogs: auditLogs.length,
      },
      courses,
      cmsItems,
      auditLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techman-college-lms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await setDoc(
      doc(db, 'systemSettings', INSTITUTE_INFO.institutionId),
      {
        ...settings,
        instituteName: INSTITUTE_INFO.officialName,
        platformName: INSTITUTE_INFO.platformName,
        defaultAffiliateCommissionPercent: Number(cfgCommission) || 10,
        xpPerLesson: Number(cfgXpLesson) || 50,
        publicTenantRegistrationEnabled: cfgPublicTenant,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: 'UPDATE_SYSTEM_SETTINGS',
      targetType: 'systemSettings',
      targetId: INSTITUTE_INFO.institutionId,
      details: `Updated college=${INSTITUTE_INFO.officialName}, commission=${cfgCommission}%, xpPerLesson=${cfgXpLesson}, publicTenantRegistration=${cfgPublicTenant}`,
    });
    setNotice('TECHMAN COLLEGE & Multi-Campus SaaS settings saved.');
    await onRefreshData();
  };

  // RENDER 1: TECHMAN AI TUTOR
  if (mode === 'ai-tutor') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            TECHMAN COLLEGE AI Tutor (24/7 Learning Assistant)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            English-primary AI tutor with Tamil &amp; Sinhala support, grounded in your course syllabus. Conversations are private to your account.
          </p>
        </div>

        {notice && (
          <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
            {notice}
          </div>
        )}

        <form
          onSubmit={handleAskTutor}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={tutorCourseId}
              onChange={(e) => setTutorCourseId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Course: {c.name}
                </option>
              ))}
            </select>
            <select
              value={tutorMode}
              onChange={(e) => setTutorMode(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="tutor">Concept Explanation</option>
              <option value="study_notes">Generate Study Notes</option>
              <option value="lesson_summary">Lesson Summary</option>
              <option value="practice_questions">Practice Questions</option>
              <option value="revision_plan">7-Day Revision Planner</option>
              <option value="assignment_guidance">Assignment Step-by-Step Guidance</option>
            </select>
            <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
              {(['English', 'Tamil', 'Sinhala'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setTutorLang(lang)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                    tutorLang === lang
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              required
              value={tutorPrompt}
              onChange={(e) => setTutorPrompt(e.target.value)}
              placeholder="Ask a course question, paste a concept, or request revision notes..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <button
              type="submit"
              disabled={tutorLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              {tutorLoading ? 'Thinking...' : 'Ask Tutor'}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {conversations.length === 0 ? (
            <EmptyState
              title="Start Your First Study Session"
              description="Ask TECHMAN COLLEGE AI Tutor any question about your enrolled programme. Responses distinguish verified course syllabus points from general explanations."
            />
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
              >
                <div className="text-xs font-mono text-slate-500 flex items-center justify-between">
                  <span>Language: {c.language}</span>
                  <span>{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span>
                </div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-white">
                  Q: {c.prompt}
                </div>
                <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed pt-3 border-t border-slate-100 dark:border-slate-800">
                  {c.response}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // RENDER 2: AI CAREER DEVELOPMENT CENTER
  if (mode === 'career') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            AI Career Development Center
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Build ATS-ready resumes, practice technical interviews, assess skill gaps, and explore Sri Lankan &amp; remote career paths.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleRunCareerTool}
            className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
          >
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['advisor', 'AI Career Advisor'],
                  ['resume', 'AI Resume / CV Builder'],
                  ['interview', 'AI Interview Coach'],
                  ['skill_gap', 'AI Skill Assessment'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCareerTool(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    careerTool === key
                      ? 'bg-violet-700 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Target Role</label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Verified Skills (comma-separated)</label>
                <input
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
            </div>

            <textarea
              rows={3}
              value={careerNotes}
              onChange={(e) => setCareerNotes(e.target.value)}
              placeholder="Optional: Add project links, career goals, or interview focus..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />

            <button
              type="submit"
              disabled={careerLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0F172A] dark:bg-violet-600 text-white text-sm font-medium cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {careerLoading ? 'Generating Career Output...' : 'Run Career AI Tool'}
            </button>

            {careerOutput && (
              <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200 leading-relaxed max-h-96 overflow-y-auto">
                {careerOutput}
              </div>
            )}
          </form>

          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-violet-600" />
                2027 Job, Internship &amp; Freelance Board
              </h2>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {CAREER_OPPORTUNITIES.map((opp) => (
                  <div key={opp.id} className="py-3.5">
                    <div className="text-xs text-violet-700 dark:text-violet-400 font-medium">
                      {opp.type}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                      {opp.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{opp.company}</div>
                    <div className="text-[11px] font-mono text-slate-500 mt-1">{opp.skills}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER 3: COMMUNITY & GAMIFICATION
  if (mode === 'community') {
    const leaderboard = [...usersList]
      .sort((a, b) => (b.xpPoints ?? 0) - (a.xpPoints ?? 0))
      .slice(0, 6);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            Student Community, Project Showcase &amp; Gamification
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Peer discussions, Lecturer Q&amp;A, practical project gallery, and verified XP leaderboards.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-5">
            <form
              onSubmit={handleCreatePost}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={postType}
                  onChange={(e) => setPostType(e.target.value as CommunityPost['postType'])}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="Discussion">Discussion</option>
                  <option value="Lecturer Q&A">Lecturer Q&amp;A</option>
                  <option value="Project Showcase">Project Showcase</option>
                  <option value="Announcement">Announcement</option>
                </select>
                <input
                  type="text"
                  required
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Post Title *"
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>
              <textarea
                rows={3}
                required
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                placeholder="Share a question, study insight, or practical project summary..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="url"
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="Optional Showcase Link (https://...)"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 text-white text-xs font-medium cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Post to Community
                </button>
              </div>
            </form>

            {communityPosts.length === 0 ? (
              <EmptyState
                title="Community Feed Ready"
                description="Post the first study question or Student Project Showcase entry to kick off 2027 peer learning."
              />
            ) : (
              communityPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      <strong className="text-slate-900 dark:text-white">{post.authorName}</strong> ·{' '}
                      {post.postType}
                    </span>
                    <StatusLabel status={post.moderatedStatus} />
                  </div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">{post.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {post.body}
                  </p>
                  <div className="pt-2 flex items-center gap-4 text-xs text-slate-500">
                    <button
                      onClick={async () => {
                        await updateDoc(doc(db, 'communityPosts', post.id), {
                          likesCount: (post.likesCount || 0) + 1,
                        });
                        await onRefreshData();
                      }}
                      className="inline-flex items-center gap-1 hover:text-violet-700 cursor-pointer"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {post.likesCount || 0} Helpful
                    </button>
                    <button
                      onClick={async () => {
                        await updateDoc(doc(db, 'communityPosts', post.id), {
                          moderatedStatus: 'reported',
                        });
                        await onRefreshData();
                      }}
                      className="inline-flex items-center gap-1 hover:text-red-600 cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Report
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* XP Gamification Leaderboard */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-500" />
                Verified Learning Leaderboard
              </h2>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {leaderboard.map((u, idx) => (
                  <div key={u.uid} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-slate-400">#{idx + 1}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {u.displayName}
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-violet-700 dark:text-violet-400 tabular-nums">
                      {u.xpPoints ?? 0} XP · Lv {u.level ?? 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER 4: AFFILIATE & REFERRAL MANAGEMENT
  if (mode === 'affiliates') {
    const myAff = affiliates.find((a) => a.userId === profile.uid);
    const refLink = myAff ? `${window.location.origin}/?ref=${myAff.referralCode}` : '';

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              Affiliate &amp; Referral Programme
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Referral links, scannable QR codes, conversion tracking, and Owner-approved LKR commission payouts.
            </p>
          </div>
          {!myAff && (
            <button
              onClick={() => void handleJoinAffiliate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-700 text-white text-sm font-medium cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Activate My Referral Code
            </button>
          )}
        </div>

        {notice && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {notice}
          </div>
        )}

        {myAff && (
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-8 space-y-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-bold text-violet-700 dark:text-violet-400">
                  {myAff.referralCode}
                </span>
                <StatusLabel status={myAff.status} />
              </div>
              <div className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg break-all">
                {refLink}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Commission Rate</span>
                  <span className="font-mono font-bold text-sm">{myAff.commissionRatePercent}%</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Pending LKR</span>
                  <span className="font-mono font-bold text-sm">
                    {formatLkr(myAff.pendingCommissionLkr)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Approved LKR</span>
                  <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400">
                    {formatLkr(myAff.approvedCommissionLkr)}
                  </span>
                </div>
              </div>
            </div>
            <div className="md:col-span-4 flex flex-col items-center">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <QRCodeSVG value={refLink} size={108} />
              </div>
              <span className="mt-2 text-[11px] font-mono text-slate-500">Referral QR Code</span>
            </div>
          </div>
        )}

        {isOwner && affiliates.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
              Owner Affiliate Approval Queue ({affiliates.length})
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {affiliates.map((aff) => (
                <div key={aff.userId} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {aff.partnerName}
                    </span>{' '}
                    · <span className="font-mono">{aff.referralCode}</span> · Rate: {aff.commissionRatePercent}%
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusLabel status={aff.status} />
                    {aff.status !== 'active' && (
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'affiliates', aff.userId), {
                            status: 'active',
                            updatedAt: new Date().toISOString(),
                          });
                          await onRefreshData();
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                      >
                        Approve Partner
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // RENDER 5: WEBSITE CMS & AI MEDIA ORGANIZER
  if (mode === 'cms') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            Website CMS &amp; AI Media Organizer
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Upload college posters or banners for AI categorization, text extraction, and tagging—strictly requiring Admin review before publication.
          </p>
        </div>

        {notice && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-violet-600" />
            AI Media Organizer (Review-Before-Publish Workflow)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col items-center justify-center p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer hover:border-violet-500 transition">
              <Upload className="w-5 h-5 text-violet-600 mb-2" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {mediaPreview ? 'Image Loaded — Click to Replace' : 'Upload Poster / Event Banner (PNG, JPG, WebP)'}
              </span>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
            <div className="flex flex-col justify-between gap-3">
              <textarea
                rows={3}
                value={mediaHint}
                onChange={(e) => setMediaHint(e.target.value)}
                placeholder="Optional admin notes or announcement text for AI Media Organizer..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <button
                type="button"
                disabled={aiMediaLoading}
                onClick={() => void handleAnalyzeMedia()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {aiMediaLoading ? 'Analyzing Asset...' : 'Analyze with AI Media Organizer'}
              </button>
            </div>
          </div>

          {cmsDraft && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Unpublished AI Draft — Review &amp; Approve Below
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={cmsDraft.itemType}
                  onChange={(e) =>
                    setCmsDraft({ ...cmsDraft, itemType: e.target.value as CmsItem['itemType'] })
                  }
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="Poster">Poster</option>
                  <option value="Banner">Banner</option>
                  <option value="News">News</option>
                  <option value="Event">Event</option>
                  <option value="Story">Story</option>
                  <option value="FAQ">FAQ</option>
                </select>
                <input
                  type="text"
                  value={cmsDraft.title}
                  onChange={(e) => setCmsDraft({ ...cmsDraft, title: e.target.value })}
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
              <textarea
                rows={3}
                value={cmsDraft.summary}
                onChange={(e) => setCmsDraft({ ...cmsDraft, summary: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <div className="text-xs font-mono text-slate-500">
                Suggested Tags: {cmsDraft.tags.join(' · ')}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveCmsDraft(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveCmsDraft(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                >
                  Approve &amp; Publish to Website
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
            Managed Website Content ({cmsItems.length})
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {cmsItems.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono text-violet-700 dark:text-violet-400">{item.itemType}</span> ·{' '}
                  <strong className="text-slate-900 dark:text-white">{item.title}</strong>
                </div>
                <div className="flex items-center gap-3">
                  <StatusLabel status={item.status} />
                  <button
                    onClick={async () => {
                      await updateDoc(doc(db, 'cmsItems', item.id), {
                        status: item.status === 'published' ? 'draft' : 'published',
                        updatedAt: new Date().toISOString(),
                      });
                      await onRefreshData();
                    }}
                    className="text-violet-700 dark:text-violet-400 hover:underline cursor-pointer"
                  >
                    {item.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // RENDER 6: SECURITY, AUDIT LOGS, BACKUP & MULTI-CAMPUS SAAS SETTINGS
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            Security Audit Trail, Backups &amp; College SaaS Settings
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Immutable administrative logs, Firestore snapshot export, and Owner-controlled platform governance.
          </p>
        </div>
        <button
          onClick={handleExportBackupJson}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F172A] dark:bg-violet-600 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          Export JSON Backup
        </button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {isOwner && (
        <form
          onSubmit={handleSaveSettings}
          className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-violet-600" />
            Owner Governance, Gamification &amp; Multi-Campus College Controls
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium mb-1">Default Affiliate Commission (%)</label>
              <input
                type="number"
                min={0}
                max={50}
                value={cfgCommission}
                onChange={(e) => setCfgCommission(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Verified XP per Completed Lesson</label>
              <input
                type="number"
                min={5}
                max={500}
                value={cfgXpLesson}
                onChange={(e) => setCfgXpLesson(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 pb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgPublicTenant}
                  onChange={(e) => setCfgPublicTenant(e.target.checked)}
                  className="rounded"
                />
                Enable Public Multi-College Tenant Registration (Locked Off by Default)
              </label>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Official College: <strong>{INSTITUTE_INFO.officialName}</strong> ({INSTITUTE_INFO.establishedLabel}) · ID: <strong className="font-mono">{INSTITUTE_INFO.institutionId}</strong> · Protected Owners: <span className="font-mono">techmanfgoc@gmail.com</span> &amp; <span className="font-mono">mrashadh64@gmail.com</span>
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium cursor-pointer"
          >
            Save Platform Settings
          </button>
        </form>
      )}

      {/* Immutable Audit Log Stream */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-violet-600" />
            Append-Only Security &amp; Financial Audit Trail ({auditLogs.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                <th className="py-2.5 px-4 font-medium">Timestamp</th>
                <th className="py-2.5 px-4 font-medium">Actor</th>
                <th className="py-2.5 px-4 font-medium">Action</th>
                <th className="py-2.5 px-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No audit events logged yet. Critical administrative, financial, and role actions appear here automatically.
                  </td>
                </tr>
              ) : (
                auditLogs.slice(0, 40).map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {log.actorEmail}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-violet-700 dark:text-violet-400 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
