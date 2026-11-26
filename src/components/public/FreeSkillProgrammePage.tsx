import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Bot,
  Brain,
  Briefcase,
  Building2,
  Bus,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  GraduationCap,
  Laptop,
  Lightbulb,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Mic,
  Palette,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  BRAND_IMAGES,
  INSTITUTE_INFO,
  SRI_LANKA_DISTRICTS,
} from '../../data/catalogSeed';
import { submitProgrammeEnquiry } from '../../lib/firestoreService';
import { Course, SpecialProgramme, SpecialProgrammeModule } from '../../types/lms';

export const ProgrammeModuleIcon: React.FC<{ iconKey: string; className?: string }> = ({
  iconKey,
  className = 'w-5 h-5',
}) => {
  switch (iconKey) {
    case 'cpu':
      return <Cpu className={className} />;
    case 'megaphone':
      return <Megaphone className={className} />;
    case 'palette':
      return <Palette className={className} />;
    case 'code':
      return <Code2 className={className} />;
    case 'bot':
      return <Bot className={className} />;
    case 'brain':
      return <Brain className={className} />;
    case 'trending-up':
      return <TrendingUp className={className} />;
    case 'briefcase':
      return <Briefcase className={className} />;
    case 'mic':
      return <Mic className={className} />;
    case 'message-square':
      return <MessageSquare className={className} />;
    case 'lightbulb':
      return <Lightbulb className={className} />;
    case 'laptop':
      return <Laptop className={className} />;
    default:
      return <Sparkles className={className} />;
  }
};

const MODULE_ACCENTS = [
  'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
  'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
  'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
  'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
  'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
  'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
];

export const TrainerProfileSection: React.FC<{
  programme: SpecialProgramme;
  compact?: boolean;
  onExploreProgramme?: () => void;
}> = ({ programme, compact = false, onExploreProgramme }) => {
  const trainerPhoto = programme.trainerPhotoUrl || BRAND_IMAGES.trainerMohammedRashadh;

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-900/[0.04] dark:shadow-black/30 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
        <div className="lg:col-span-4 bg-gradient-to-br from-[#0F172A] via-[#172554] to-[#2E1065] p-6 sm:p-8 flex flex-col items-center justify-center text-center">
          <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden border-2 border-white/25 shadow-2xl bg-slate-900">
            <img
              src={trainerPhoto}
              alt={`${programme.trainerName} — ${programme.trainerPosition}`}
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">
            Featured Speaker &amp; Chief Trainer
          </div>
        </div>

        <div className={`lg:col-span-8 ${compact ? 'p-6 sm:p-7' : 'p-6 sm:p-10'}`}>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400">
            <span className="w-5 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            LEADERSHIP &amp; CHIEF TRAINER
          </div>
          <h3 className="mt-2.5 text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-white">
            {programme.trainerName}
          </h3>
          <p className="mt-1 text-base font-semibold text-blue-700 dark:text-blue-400">
            {programme.trainerPosition}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/60 border border-violet-200/80 dark:border-violet-800/70 text-xs font-bold tracking-wider uppercase text-violet-800 dark:text-violet-300">
            <Sparkles className="w-3.5 h-3.5" />
            {programme.trainerTitle}
          </div>

          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            {programme.trainerBio ||
              `Founder & CEO of TECHMAN COLLEGE (${INSTITUTE_INFO.establishedLabel}), leading islandwide technology, creativity, and personal development training across Sri Lanka.`}
          </p>

          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                {INSTITUTE_INFO.officialName} ({INSTITUTE_INFO.establishedLabel})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-violet-700 dark:text-violet-400" />
                {programme.availability}
              </span>
            </div>
            {onExploreProgramme && (
              <button
                onClick={onExploreProgramme}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                View Free Skill Programme
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProgrammeModulesGrid: React.FC<{
  modules: SpecialProgrammeModule[];
  courses: Course[];
  onOpenCourseDetail: (course: Course) => void;
  onSelectDomainCourses?: (domain: string) => void;
  onRequestHost?: () => void;
  heading?: string;
  subheading?: string;
}> = ({
  modules,
  courses,
  onOpenCourseDetail,
  onSelectDomainCourses,
  onRequestHost,
  heading = '12 Practical Learning Modules',
  subheading = 'Structured interactive sessions covering Artificial Intelligence, digital creativity, STEM, leadership, entrepreneurship, and freelancing.',
}) => {
  const [selectedModule, setSelectedModule] = useState<SpecialProgrammeModule | null>(null);

  const relatedCourseForSelected = useMemo(() => {
    if (!selectedModule) return null;
    if (selectedModule.relatedCourseId) {
      const exact = courses.find((c) => c.id === selectedModule.relatedCourseId);
      if (exact) return exact;
    }
    if (selectedModule.relatedDomain) {
      return courses.find((c) => c.domain === selectedModule.relatedDomain) || null;
    }
    return null;
  }, [selectedModule, courses]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400 mb-2">
            <span className="w-5 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            PROGRAMME CURRICULUM · {modules.length} MODULES
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-white">
            {heading}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            {subheading}
          </p>
        </div>
        {onRequestHost && (
          <button
            onClick={onRequestHost}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-sm transition cursor-pointer whitespace-nowrap self-start md:self-auto"
          >
            Request Programme for Your Institution
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {modules.map((mod, idx) => {
          const accent = MODULE_ACCENTS[idx % MODULE_ACCENTS.length];
          return (
            <article
              key={`${mod.number}-${mod.title}`}
              className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
                    <ProgrammeModuleIcon iconKey={mod.iconKey} className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono font-bold tabular-nums text-slate-400 dark:text-slate-500">
                    {mod.number}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug">
                  {mod.title}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {mod.shortDescription}
                </p>
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {mod.relatedDomain || 'Core Skill Module'}
                </span>
                <button
                  onClick={() => setSelectedModule(mod)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                >
                  Learn More
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Module Details Modal */}
      {selectedModule && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedModule(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-[#4C1D95] text-white flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white shrink-0">
                  <ProgrammeModuleIcon iconKey={selectedModule.iconKey} className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] font-mono font-semibold uppercase tracking-widest text-sky-300">
                    Module {selectedModule.number} · TECHMAN FREE SKILL PROGRAMME
                  </div>
                  <h3 className="text-xl font-bold mt-0.5">{selectedModule.title}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedModule(null)}
                aria-label="Close module details"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Focus Area
                </div>
                <p className="mt-1 text-sm font-semibold text-[#0F172A] dark:text-white">
                  {selectedModule.shortDescription}
                </p>
              </div>

              {selectedModule.details && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Session Overview
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {selectedModule.details}
                  </p>
                </div>
              )}

              {relatedCourseForSelected && (
                <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    Continue Learning at TECHMAN COLLEGE
                  </div>
                  <div className="mt-1 text-sm font-bold text-[#0F172A] dark:text-white">
                    {relatedCourseForSelected.name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {relatedCourseForSelected.code} · {relatedCourseForSelected.duration} ·{' '}
                    {relatedCourseForSelected.mode}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const target = relatedCourseForSelected;
                        setSelectedModule(null);
                        onOpenCourseDetail(target);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      View Related LMS Course
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    {selectedModule.relatedDomain && onSelectDomainCourses && (
                      <button
                        onClick={() => {
                          const domain = selectedModule.relatedDomain!;
                          setSelectedModule(null);
                          onSelectDomainCourses(domain);
                        }}
                        className="px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-900 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        Browse {selectedModule.relatedDomain}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
                {onRequestHost && (
                  <button
                    onClick={() => {
                      setSelectedModule(null);
                      onRequestHost();
                    }}
                    className="px-4 py-2 rounded-lg bg-[#0F172A] dark:bg-violet-700 hover:opacity-90 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    Host This Programme
                  </button>
                )}
                <button
                  onClick={() => setSelectedModule(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProgrammeEnquiryForm: React.FC<{
  programme: SpecialProgramme;
}> = ({ programme }) => {
  const [institutionName, setInstitutionName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [institutionAddress, setInstitutionAddress] = useState('');
  const [district, setDistrict] = useState('Colombo');
  const [expectedParticipants, setExpectedParticipants] = useState('100');
  const [preferredDate, setPreferredDate] = useState('');
  const [additionalMessage, setAdditionalMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const buildWhatsAppUrl = (refId?: string | null) => {
    const lines = [
      `Hello TECHMAN COLLEGE,`,
      `We would like to request the *${programme.title}* (${programme.schedule}, ${programme.availability}).`,
      institutionName ? `Institution: ${institutionName}` : '',
      contactPerson ? `Contact Person: ${contactPerson}` : '',
      district ? `District: ${district}` : '',
      expectedParticipants ? `Expected Participants: ${expectedParticipants}` : '',
      preferredDate ? `Preferred Date: ${preferredDate}` : '',
      refId ? `Online Enquiry Ref: ${refId}` : '',
    ].filter(Boolean);
    return `https://wa.me/${INSTITUTE_INFO.whatsappDigits}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (
      !institutionName.trim() ||
      !contactPerson.trim() ||
      !mobileNumber.trim() ||
      !email.trim() ||
      !institutionAddress.trim() ||
      !district.trim() ||
      !preferredDate.trim()
    ) {
      setError('Please complete all required fields before submitting your institutional enquiry.');
      return;
    }

    const participantCount = Number(expectedParticipants);
    if (!Number.isFinite(participantCount) || participantCount < 1) {
      setError('Please enter a valid expected number of participants.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitProgrammeEnquiry({
        programmeSlug: programme.slug,
        programmeTitle: programme.title,
        institutionName,
        contactPerson,
        mobileNumber,
        email,
        institutionAddress,
        district,
        expectedParticipants: participantCount,
        preferredDate,
        additionalMessage,
      });
      setSubmittedRef(result.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit enquiry right now. Please try again or contact us on WhatsApp.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedRef) {
    return (
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/70 p-8 shadow-lg text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="mt-4 text-2xl font-bold text-[#0F172A] dark:text-white">
          Institutional Enquiry Received
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
          Thank you, <strong>{contactPerson}</strong>. Your request to host the{' '}
          <strong>{programme.title}</strong> at <strong>{institutionName}</strong> has been saved
          and our Super Admin outreach coordination team has been notified.
        </p>

        <div className="mt-5 inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-4 px-5 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Reference Number
          </span>
          <span className="font-mono font-bold text-base text-blue-700 dark:text-blue-400">
            {submittedRef}
          </span>
        </div>

        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Reminder: {programme.feeSummary}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={buildWhatsAppUrl(submittedRef)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition"
          >
            <MessageCircle className="w-4 h-4" />
            Send Confirmation on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => {
              setSubmittedRef(null);
              setInstitutionName('');
              setContactPerson('');
              setMobileNumber('');
              setEmail('');
              setInstitutionAddress('');
              setPreferredDate('');
              setAdditionalMessage('');
            }}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Submit Another Enquiry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/[0.05] dark:shadow-black/30 overflow-hidden">
      <div className="p-6 sm:p-8 bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-[#4C1D95] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              HOST INSTITUTION BOOKING · {programme.schedule.toUpperCase()}
            </div>
            <h3 className="mt-1.5 text-xl sm:text-2xl font-bold">
              Request This Programme for Your Institution
            </h3>
            <p className="mt-1.5 text-sm text-slate-200 max-w-2xl">
              {programme.feeBadge} {programme.feeSummary}
            </p>
          </div>
          <a
            href={buildWhatsAppUrl(null)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-semibold transition whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp Enquiry
          </a>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
        {error && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3.5 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Institution Name *
            </label>
            <input
              type="text"
              required
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="School, College, Institute, or Youth Organization"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Contact Person *
            </label>
            <input
              type="text"
              required
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Principal, Coordinator, or Authorized Representative"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Mobile Number *
            </label>
            <input
              type="tel"
              required
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="+94 7X XXX XXXX"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="official@institution.lk"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Institution Address *
            </label>
            <input
              type="text"
              required
              value={institutionAddress}
              onChange={(e) => setInstitutionAddress(e.target.value)}
              placeholder="Full physical address where the programme will be conducted"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              District (Sri Lanka) *
            </label>
            <select
              required
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {SRI_LANKA_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Expected Number of Participants *
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              required
              value={expectedParticipants}
              onChange={(e) => setExpectedParticipants(e.target.value)}
              placeholder="e.g., 120"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Preferred Programme Date (Saturday or Sunday) *
            </label>
            <input
              type="date"
              required
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-end">
            <div className="w-full rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 px-3.5 py-2.5 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
              <strong className="font-semibold">Host Responsibility:</strong> No programme fee. Host
              institutions arrange only required transport &amp; accommodation for the visiting team.
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Additional Message (Optional)
            </label>
            <textarea
              rows={3}
              value={additionalMessage}
              onChange={(e) => setAdditionalMessage(e.target.value)}
              placeholder="Share participant age group, preferred modules, venue facilities, or transport/accommodation coordination notes..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Submitted directly to TECHMAN COLLEGE Outreach Administration ({INSTITUTE_INFO.phone}).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={buildWhatsAppUrl(null)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold transition"
            >
              <MessageCircle className="w-4 h-4" />
              Enquire via WhatsApp
            </a>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold shadow-md shadow-blue-700/20 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting Enquiry...' : 'Submit Host Enquiry'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

interface FreeSkillProgrammePageProps {
  programme: SpecialProgramme;
  courses: Course[];
  onOpenCourseDetail: (course: Course) => void;
  onSelectDomainCourses: (domain: string) => void;
  onNavigateCourses: () => void;
}

export const FreeSkillProgrammePage: React.FC<FreeSkillProgrammePageProps> = ({
  programme,
  courses,
  onOpenCourseDetail,
  onSelectDomainCourses,
  onNavigateCourses,
}) => {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const scrollToEnquiry = () => {
    const el = document.getElementById('host-enquiry-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const whatsappDirectUrl = `https://wa.me/${INSTITUTE_INFO.whatsappDigits}?text=${encodeURIComponent(
    `Hello TECHMAN COLLEGE, we would like to enquire about hosting the ${programme.title} (${programme.schedule}, ${programme.availability}).`
  )}`;

  const galleryImages =
    programme.galleryUrls && programme.galleryUrls.length > 0
      ? programme.galleryUrls
      : [BRAND_IMAGES.posterFreeSkillDev, BRAND_IMAGES.campusLectureHall, BRAND_IMAGES.campusComputerLab];

  return (
    <div className="bg-white dark:bg-[#0B1120]">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#172554] to-[#2E1065] text-white border-b border-slate-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-12 w-80 h-80 rounded-full bg-violet-500/20 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                <span className="w-6 h-0.5 bg-sky-400 rounded-full" />
                {INSTITUTE_INFO.officialName} ({INSTITUTE_INFO.establishedLabel}) PRESENTS
              </div>

              <h1
                className="mt-4 font-bold tracking-tight text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.1rem, 4.2vw, 3.5rem)', textWrap: 'balance' }}
              >
                {programme.title}
              </h1>

              <p className="mt-4 text-lg sm:text-xl font-medium text-sky-200 leading-relaxed max-w-2xl">
                &ldquo;{programme.theme}&rdquo;
              </p>

              {programme.description && (
                <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                  {programme.description}
                </p>
              )}

              {/* Programme Meta Row */}
              <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3">
                  <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold uppercase tracking-wider">
                    <Calendar className="w-4 h-4 shrink-0" />
                    Schedule
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">{programme.schedule}</div>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3">
                  <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold uppercase tracking-wider">
                    <MapPin className="w-4 h-4 shrink-0" />
                    Availability
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">{programme.availability}</div>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3">
                  <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold uppercase tracking-wider">
                    <Users className="w-4 h-4 shrink-0" />
                    Format
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">{programme.programmeType}</div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <button
                  onClick={scrollToEnquiry}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-[#0F172A] hover:bg-sky-50 text-sm font-bold shadow-lg transition cursor-pointer"
                >
                  Request for Your Institution
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href={whatsappDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/25 text-white text-sm font-semibold transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp {INSTITUTE_INFO.phone}
                </a>
              </div>
            </div>

            {/* Right Framed Trainer & Programme Overview Card */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 p-6 shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/30 bg-slate-900 shrink-0">
                    <img
                      src={programme.trainerPhotoUrl || BRAND_IMAGES.trainerMohammedRashadh}
                      alt={programme.trainerName}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-sky-300">
                      Featured Speaker &amp; Chief Trainer
                    </div>
                    <div className="text-lg font-bold text-white mt-0.5">{programme.trainerName}</div>
                    <div className="text-xs text-slate-200">{programme.trainerPosition}</div>
                    <div className="text-[11px] font-semibold text-violet-200 mt-0.5">
                      {programme.trainerTitle}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-white/15 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Programme Fee</span>
                    <span className="font-bold text-emerald-300">{programme.feeBadge}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Learning Modules</span>
                    <span className="font-mono font-bold tabular-nums text-white">
                      {programme.modules.length} Practical Sessions
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Delivery Location</span>
                    <span className="font-medium text-white text-right">
                      {programme.deliveryLocation}
                    </span>
                  </div>
                </div>

                <div className="mt-5 rounded-xl bg-slate-950/50 border border-white/10 p-3.5 text-xs text-slate-200 leading-relaxed">
                  {programme.feeSummary}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PROMINENT 100% FREE OF CHARGE BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 text-white p-6 sm:p-7 shadow-xl shadow-blue-900/20 border border-white/15 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Bus className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold tracking-tight">
                {programme.feeBadge}
              </div>
              <p className="mt-1 text-sm text-blue-100 leading-relaxed max-w-3xl">
                {programme.feeSummary}
              </p>
            </div>
          </div>
          <button
            onClick={scrollToEnquiry}
            className="px-5 py-3 rounded-xl bg-white text-[#0F172A] hover:bg-blue-50 text-xs font-bold shadow-sm transition cursor-pointer whitespace-nowrap self-start lg:self-center shrink-0"
          >
            Book Weekend Date
          </button>
        </div>
      </section>

      {/* 3. FEATURED SPEAKER & CHIEF TRAINER SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <TrainerProfileSection programme={programme} />
      </section>

      {/* 4. 12 LEARNING MODULES SECTION */}
      <section className="bg-[#F4F8FF] dark:bg-slate-900/45 border-y border-blue-100/80 dark:border-slate-800/80 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProgrammeModulesGrid
            modules={programme.modules}
            courses={courses}
            onOpenCourseDetail={onOpenCourseDetail}
            onSelectDomainCourses={onSelectDomainCourses}
            onRequestHost={scrollToEnquiry}
          />
        </div>
      </section>

      {/* 5. WHAT STUDENTS WILL GAIN + SCHEDULE & HOST INSTITUTION PARTICIPATION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* What Students Will Gain */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400 mb-2.5">
              <span className="w-5 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
              STUDENT OUTCOMES
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A] dark:text-white">
              What Students Will Gain
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Practical exposure across modern technology, creative skills, leadership, and personal
              growth—delivered in an accessible physical workshop format.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {programme.benefits.map((benefit, index) => (
                <div
                  key={`${index}-${benefit}`}
                  className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm flex items-start gap-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {benefit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule & Host Institution Participation */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-[#0F172A] text-white p-7 sm:p-8 shadow-xl border border-slate-800">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                <Award className="w-4 h-4" />
                SCHEDULE &amp; HOST PARTICIPATION
              </div>
              <h3 className="mt-2.5 text-xl font-bold text-white">
                How Institutions Can Host This Programme
              </h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Schools, colleges, training centers, and community organizations anywhere in Sri
                Lanka can invite the TECHMAN COLLEGE visiting team to deliver this physical
                programme on-site.
              </p>

              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3.5 rounded-xl bg-white/5 border border-white/10 p-3.5">
                  <Calendar className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                      Programme Days
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">{programme.schedule}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-xl bg-white/5 border border-white/10 p-3.5">
                  <MapPin className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                      Geographic Reach
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      Available {programme.availability}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-xl bg-white/5 border border-white/10 p-3.5">
                  <Building2 className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                      Delivery Mode &amp; Venue
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {programme.programmeType} — {programme.deliveryLocation}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 rounded-xl bg-violet-500/15 border border-violet-400/25 p-3.5">
                  <Bus className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-violet-200">
                      {programme.feeBadge}
                    </div>
                    <div className="text-xs text-slate-200 mt-1 leading-relaxed">
                      {programme.feeSummary}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center gap-3">
                <button
                  onClick={scrollToEnquiry}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Open Host Enquiry Form
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onNavigateCourses}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  Explore 32 Courses
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. OFFICIAL PROGRAMME POSTER & CAMPUS PHOTOGRAPHS */}
      <section className="bg-[#F4F8FF] dark:bg-slate-900/45 border-y border-blue-100/80 dark:border-slate-800/80 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400 mb-2">
              <span className="w-5 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
              OFFICIAL MEDIA &amp; GALLERY
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] dark:text-white">
              Programme Announcement &amp; Learning Environment
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {galleryImages.map((imgUrl, idx) => (
              <button
                key={`${idx}-${imgUrl}`}
                type="button"
                onClick={() => setLightboxImage(imgUrl)}
                className="group rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl transition cursor-pointer text-left"
              >
                <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={imgUrl}
                    alt={
                      idx === 0
                        ? `${programme.title} official announcement poster`
                        : `TECHMAN COLLEGE training and campus environment ${idx}`
                    }
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {idx === 0 ? 'Official Programme Poster' : `TECHMAN COLLEGE Campus & Training #${idx}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 7. HOST INSTITUTION ENQUIRY FORM */}
      <section id="host-enquiry-form" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <ProgrammeEnquiryForm programme={programme} />
      </section>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              onClick={() => setLightboxImage(null)}
              aria-label="Close image preview"
              className="self-end mb-3 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="Programme visual preview"
              className="max-h-[80vh] w-auto rounded-2xl shadow-2xl border border-white/15 object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
