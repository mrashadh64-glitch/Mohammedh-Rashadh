import React, { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { DEFAULT_FREE_SKILL_PROGRAMME, INSTITUTE_INFO } from '../../data/catalogSeed';
import { db } from '../../lib/firebase';
import {
  ensureSpecialProgrammeExists,
  logAuditEvent,
  saveSpecialProgramme,
} from '../../lib/firestoreService';
import {
  ProgrammeEnquiry,
  SpecialProgramme,
  SpecialProgrammeModule,
  UserProfile,
} from '../../types/lms';

const ICON_OPTIONS = [
  { value: 'cpu', label: 'AI / CPU' },
  { value: 'megaphone', label: 'Marketing / Megaphone' },
  { value: 'palette', label: 'Graphic Design / Palette' },
  { value: 'code', label: 'Web Dev / Code' },
  { value: 'bot', label: 'Robotics / Bot' },
  { value: 'brain', label: 'Psychology / Brain' },
  { value: 'trending-up', label: 'Motivation / Growth' },
  { value: 'briefcase', label: 'Career / Briefcase' },
  { value: 'mic', label: 'Public Speaking / Mic' },
  { value: 'message-square', label: 'Communication / Chat' },
  { value: 'lightbulb', label: 'Entrepreneurship / Idea' },
  { value: 'laptop', label: 'Freelancing / Laptop' },
];

const ENQUIRY_STATUSES: ProgrammeEnquiry['status'][] = [
  'new',
  'reviewed',
  'scheduled',
  'completed',
  'declined',
];

const STATUS_BADGE_MAP: Record<ProgrammeEnquiry['status'], string> = {
  new: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  reviewed:
    'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  scheduled:
    'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  completed:
    'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  declined:
    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

interface SpecialProgrammeAdminProps {
  profile: UserProfile;
  userEmail: string;
  programme: SpecialProgramme;
  enquiries: ProgrammeEnquiry[];
  canEditContent: boolean;
  canManageEnquiries: boolean;
  onRefresh: () => Promise<void>;
  onOpenPublicProgramme?: () => void;
}

export const SpecialProgrammeAdmin: React.FC<SpecialProgrammeAdminProps> = ({
  profile,
  userEmail,
  programme,
  enquiries,
  canEditContent,
  canManageEnquiries,
  onRefresh,
  onOpenPublicProgramme,
}) => {
  const [subTab, setSubTab] = useState<'enquiries' | 'editor'>(
    canManageEnquiries ? 'enquiries' : 'editor'
  );
  const [draft, setDraft] = useState<SpecialProgramme>(programme || DEFAULT_FREE_SKILL_PROGRAMME);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Enquiry management state
  const [statusFilter, setStatusFilter] = useState<'All' | ProgrammeEnquiry['status']>('All');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(programme || DEFAULT_FREE_SKILL_PROGRAMME);
  }, [programme]);

  const sortedEnquiries = useMemo(() => {
    const filtered =
      statusFilter === 'All'
        ? enquiries
        : enquiries.filter((item) => item.status === statusFilter);
    return [...filtered].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [enquiries, statusFilter]);

  const newEnquiryCount = useMemo(
    () => enquiries.filter((e) => e.status === 'new').length,
    [enquiries]
  );

  const handleSaveProgramme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContent) return;
    setSaving(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      await saveSpecialProgramme(draft, profile.uid, userEmail);
      await onRefresh();
      setStatusMessage('Programme content saved and synced live to the TECHMAN COLLEGE website.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save programme changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleInitializeIfMissing = async () => {
    setSaving(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const created = await ensureSpecialProgrammeExists(profile.uid, userEmail);
      await onRefresh();
      setStatusMessage(
        created
          ? 'Initialized TECHMAN FREE SKILL DEVELOPMENT PROGRAMME in Firestore.'
          : 'Programme record already exists in Firestore (no duplicate created).'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Initialization check failed.');
    } finally {
      setSaving(false);
    }
  };

  const updateModule = (idx: number, patch: Partial<SpecialProgrammeModule>) => {
    setDraft((prev) => {
      const next = [...prev.modules];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, modules: next };
    });
  };

  const addModule = () => {
    setDraft((prev) => ({
      ...prev,
      modules: [
        ...prev.modules,
        {
          number: String(prev.modules.length + 1).padStart(2, '0'),
          title: 'New Skill Module',
          shortDescription: 'Practical workshop topic',
          iconKey: 'cpu',
          details: '',
          relatedDomain: 'Information Technology',
        },
      ],
    }));
  };

  const removeModule = (idx: number) => {
    setDraft((prev) => ({
      ...prev,
      modules: prev.modules
        .filter((_, i) => i !== idx)
        .map((m, i) => ({ ...m, number: String(i + 1).padStart(2, '0') })),
    }));
  };

  const handleUpdateEnquiry = async (
    enquiry: ProgrammeEnquiry,
    newStatus: ProgrammeEnquiry['status'],
    notesOverride?: string
  ) => {
    if (!canManageEnquiries) return;
    setUpdatingId(enquiry.id);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const nextNotes =
        notesOverride !== undefined ? notesOverride : notesDraft[enquiry.id] ?? enquiry.adminNotes ?? '';
      await updateDoc(doc(db, 'programmeEnquiries', enquiry.id), {
        status: newStatus,
        adminNotes: nextNotes.slice(0, 1000),
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'UPDATE_PROGRAMME_ENQUIRY',
        targetType: 'programmeEnquiries',
        targetId: enquiry.id,
        details: `Updated host enquiry for ${enquiry.institutionName} to ${newStatus}.`,
      });
      await onRefresh();
      setStatusMessage(`Updated enquiry ${enquiry.id} (${enquiry.institutionName}) to "${newStatus}".`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update enquiry.');
    } finally {
      setUpdatingId(null);
    }
  };

  const buildHostWhatsAppLink = (enquiry: ProgrammeEnquiry) => {
    const cleaned = enquiry.mobileNumber.replace(/\D/g, '');
    const waDigits = cleaned.startsWith('0') ? `94${cleaned.slice(1)}` : cleaned;
    const msg = `Hello ${enquiry.contactPerson}, thank you for submitting enquiry ${enquiry.id} from ${enquiry.institutionName} for the TECHMAN FREE SKILL DEVELOPMENT PROGRAMME (${enquiry.preferredDate}). We are reaching out from TECHMAN COLLEGE (${INSTITUTE_INFO.phone}) to coordinate your weekend schedule.`;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0F172A] via-[#172554] to-[#3B0764] text-white p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <Sparkles className="w-4 h-4" />
              SPECIAL OUTREACH MANAGEMENT · /programmes/free-skill-development
            </div>
            <h2 className="mt-1.5 text-2xl font-bold">{draft.title}</h2>
            <p className="mt-1 text-sm text-slate-300">
              Manage live programme details, trainer profile, 12 modules, publication status, and
              islandwide host institution booking enquiries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canEditContent && (
              <button
                type="button"
                onClick={handleInitializeIfMissing}
                disabled={saving}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition cursor-pointer"
              >
                Verify / Sync DB Record
              </button>
            )}
            {onOpenPublicProgramme && (
              <button
                type="button"
                onClick={onOpenPublicProgramme}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#0F172A] hover:bg-sky-50 text-xs font-bold transition cursor-pointer"
              >
                Preview Public Page
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {canManageEnquiries && (
            <button
              type="button"
              onClick={() => setSubTab('enquiries')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                subTab === 'enquiries'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <Inbox className="w-4 h-4" />
              Host Institution Enquiries ({enquiries.length})
              {newEnquiryCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-mono tabular-nums">
                  {newEnquiryCount} new
                </span>
              )}
            </button>
          )}
          {canEditContent && (
            <button
              type="button"
              onClick={() => setSubTab('editor')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                subTab === 'editor'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Programme Content &amp; 12 Modules Editor
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {errorMessage}
        </div>
      )}

      {/* TAB 1: HOST INSTITUTION ENQUIRIES */}
      {subTab === 'enquiries' && canManageEnquiries && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', ...ENQUIRY_STATUSES] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                    statusFilter === status
                      ? 'bg-blue-700 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Showing {sortedEnquiries.length} of {enquiries.length} enquiries
            </div>
          </div>

          {sortedEnquiries.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
              <Inbox className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No host institution enquiries in this view yet.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enquiries submitted on /programmes/free-skill-development or the Admissions page
                appear here immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedEnquiries.map((enq) => {
                const currentNotes =
                  notesDraft[enq.id] !== undefined ? notesDraft[enq.id] : enq.adminNotes || '';
                return (
                  <div
                    key={enq.id}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                            {enq.id}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE_MAP[enq.status]}`}
                          >
                            {enq.status}
                          </span>
                          {enq.createdAt && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Submitted {new Date(enq.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                          {enq.institutionName}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {enq.contactPerson} ·{' '}
                            <strong className="font-mono tabular-nums">
                              {enq.expectedParticipants}
                            </strong>{' '}
                            participants
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            Preferred Date: <strong>{enq.preferredDate}</strong>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {enq.district}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {enq.mobileNumber}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {enq.email}
                          </span>
                          <span>Address: {enq.institutionAddress}</span>
                        </div>
                        {enq.additionalMessage && (
                          <p className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong className="text-slate-900 dark:text-white">Message: </strong>
                            {enq.additionalMessage}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={buildHostWhatsAppLink(enq)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp Host
                        </a>
                        <select
                          value={enq.status}
                          disabled={updatingId === enq.id}
                          onChange={(e) =>
                            void handleUpdateEnquiry(
                              enq,
                              e.target.value as ProgrammeEnquiry['status']
                            )
                          }
                          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-white"
                        >
                          {ENQUIRY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              Status: {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <input
                        type="text"
                        value={currentNotes}
                        onChange={(e) =>
                          setNotesDraft((prev) => ({ ...prev, [enq.id]: e.target.value }))
                        }
                        placeholder="Add internal transport/accommodation coordination notes..."
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        disabled={updatingId === enq.id}
                        onClick={() => void handleUpdateEnquiry(enq, enq.status, currentNotes)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 hover:opacity-90 text-white text-xs font-semibold transition cursor-pointer shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save Notes
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROGRAMME CONTENT EDITOR */}
      {subTab === 'editor' && canEditContent && (
        <form onSubmit={handleSaveProgramme} className="space-y-6">
          {/* Core Metadata */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                1. Programme Title, Theme, Schedule &amp; Publication Status
              </h3>
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    status: e.target.value as 'published' | 'draft',
                  }))
                }
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-white"
              >
                <option value="published">Status: Published (Visible Publicly)</option>
                <option value="draft">Status: Draft (Hidden from Public)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Programme Title
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Fee Banner Heading
                </label>
                <input
                  type="text"
                  value={draft.feeBadge}
                  onChange={(e) => setDraft((p) => ({ ...p, feeBadge: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Programme Theme
                </label>
                <input
                  type="text"
                  value={draft.theme}
                  onChange={(e) => setDraft((p) => ({ ...p, theme: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Fee Policy &amp; Host Responsibility Text
                </label>
                <textarea
                  rows={2}
                  value={draft.feeSummary}
                  onChange={(e) => setDraft((p) => ({ ...p, feeSummary: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Programme Description
                </label>
                <textarea
                  rows={3}
                  value={draft.description || ''}
                  onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Schedule
                </label>
                <input
                  type="text"
                  value={draft.schedule}
                  onChange={(e) => setDraft((p) => ({ ...p, schedule: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Availability
                </label>
                <input
                  type="text"
                  value={draft.availability}
                  onChange={(e) => setDraft((p) => ({ ...p, availability: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Programme Type
                </label>
                <input
                  type="text"
                  value={draft.programmeType}
                  onChange={(e) => setDraft((p) => ({ ...p, programmeType: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Delivery Location
                </label>
                <input
                  type="text"
                  value={draft.deliveryLocation}
                  onChange={(e) => setDraft((p) => ({ ...p, deliveryLocation: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Trainer Details & Media */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
              2. Featured Speaker &amp; Chief Trainer + Official Media
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Trainer Name
                </label>
                <input
                  type="text"
                  value={draft.trainerName}
                  onChange={(e) => setDraft((p) => ({ ...p, trainerName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Position
                </label>
                <input
                  type="text"
                  value={draft.trainerPosition}
                  onChange={(e) => setDraft((p) => ({ ...p, trainerPosition: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Professional Title
                </label>
                <input
                  type="text"
                  value={draft.trainerTitle}
                  onChange={(e) => setDraft((p) => ({ ...p, trainerTitle: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Trainer Portrait URL
                </label>
                <input
                  type="text"
                  value={draft.trainerPhotoUrl || ''}
                  onChange={(e) => setDraft((p) => ({ ...p, trainerPhotoUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Trainer Biography
                </label>
                <textarea
                  rows={2}
                  value={draft.trainerBio || ''}
                  onChange={(e) => setDraft((p) => ({ ...p, trainerBio: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Official Poster Image URL
                </label>
                <input
                  type="text"
                  value={draft.posterUrl || ''}
                  onChange={(e) => setDraft((p) => ({ ...p, posterUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Gallery Image URLs (one per line)
                </label>
                <textarea
                  rows={3}
                  value={(draft.galleryUrls || []).join('\n')}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      galleryUrls: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* 12 Modules Editor */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                3. Programme Modules ({draft.modules.length})
              </h3>
              <button
                type="button"
                onClick={addModule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Module
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {draft.modules.map((mod, idx) => (
                <div
                  key={`${idx}-${mod.number}`}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/50 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                      Module {mod.number}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeModule(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      aria-label={`Remove ${mod.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={mod.title}
                      onChange={(e) => updateModule(idx, { title: e.target.value })}
                      placeholder="Module Title"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
                    />
                    <select
                      value={mod.iconKey}
                      onChange={(e) => updateModule(idx, { iconKey: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-white"
                    >
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          Icon: {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={mod.shortDescription}
                    onChange={(e) => updateModule(idx, { shortDescription: e.target.value })}
                    placeholder="Short Description"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                  />
                  <textarea
                    rows={2}
                    value={mod.details || ''}
                    onChange={(e) => updateModule(idx, { details: e.target.value })}
                    placeholder="Detailed session overview shown when user clicks Learn More"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Benefits List */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
            <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
              4. What Students Will Gain (one benefit per line)
            </h3>
            <textarea
              rows={6}
              value={draft.benefits.join('\n')}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  benefits: e.target.value.split('\n'),
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold shadow-md transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving to Firestore...' : 'Save Programme Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
