import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Search,
  Upload,
} from 'lucide-react';
import {
  formatLkr,
  submitPublicApplication,
  trackApplicationByNumber,
} from '../../../lib/firestoreService';
import { ApplicationTracker, Branch, Course, SpecialProgramme } from '../../../types/lms';
import { StatusLabel } from '../../common/PlatformWidgets';
import { ProgrammeEnquiryForm } from '../FreeSkillProgrammePage';

const DRAFT_KEY = 'techman_admission_draft_v1';

interface AdmissionDraft {
  step: number;
  fullName: string;
  qualification: string;
  email: string;
  phone: string;
  whatsapp: string;
  referralCode: string;
  courseId: string;
  branchId: string;
  mode: 'Online' | 'Physical' | 'Hybrid';
  docIdName: string;
  docCertName: string;
  docNotes: string;
  acceptedDeclaration: boolean;
}

interface AdmissionWizardProps {
  courses: Course[];
  branches: Branch[];
  specialProgramme: SpecialProgramme;
  preselectedCourseId?: string;
  initialMode?: 'student' | 'host-enquiry';
}

const STEPS = [
  '1. Personal Details',
  '2. Contact Info',
  '3. Course Selection',
  '4. Branch & Mode',
  '5. Documents',
  '6. Review & Submit',
];

export const AdmissionWizard: React.FC<AdmissionWizardProps> = ({
  courses,
  branches,
  specialProgramme,
  preselectedCourseId,
  initialMode = 'student',
}) => {
  const [tab, setTab] = useState<'student' | 'tracker' | 'host-enquiry'>(initialMode);
  const [draft, setDraft] = useState<AdmissionDraft>(() => {
    const refParam = new URLSearchParams(window.location.search).get('ref') || '';
    const defaultCourse = preselectedCourseId || courses[16]?.id || courses[0]?.id || '';
    const defaultBranch = branches[0]?.id || 'branch-colombo-hq';
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AdmissionDraft>;
        return {
          step: parsed.step || 1,
          fullName: parsed.fullName || '',
          qualification: parsed.qualification || '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          whatsapp: parsed.whatsapp || '',
          referralCode: refParam || parsed.referralCode || '',
          courseId: preselectedCourseId || parsed.courseId || defaultCourse,
          branchId: parsed.branchId || defaultBranch,
          mode: parsed.mode || 'Hybrid',
          docIdName: parsed.docIdName || '',
          docCertName: parsed.docCertName || '',
          docNotes: parsed.docNotes || '',
          acceptedDeclaration: false,
        };
      }
    } catch {
      // Ignore storage error
    }
    return {
      step: 1,
      fullName: '',
      qualification: '',
      email: '',
      phone: '',
      whatsapp: '',
      referralCode: refParam,
      courseId: defaultCourse,
      branchId: defaultBranch,
      mode: 'Hybrid',
      docIdName: '',
      docCertName: '',
      docNotes: '',
      acceptedDeclaration: false,
    };
  });

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  // Tracker state
  const [trackCode, setTrackCode] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackResult, setTrackResult] = useState<ApplicationTracker | null | 'not_found'>(null);

  useEffect(() => {
    if (preselectedCourseId) {
      setDraft((prev) => ({ ...prev, courseId: preselectedCourseId }));
    }
  }, [preselectedCourseId]);

  useEffect(() => {
    setTab(initialMode);
  }, [initialMode]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota errors
    }
  }, [draft]);

  const selectedCourse = courses.find((c) => c.id === draft.courseId) || courses[0];
  const selectedBranch = branches.find((b) => b.id === draft.branchId) || branches[0];

  const update = <K extends keyof AdmissionDraft>(key: K, value: AdmissionDraft[K]) => {
    setStepError(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const validateCurrentStep = (): boolean => {
    setStepError(null);
    if (draft.step === 1) {
      if (draft.fullName.trim().length < 3) {
        setStepError('Please enter your full name (at least 3 characters).');
        return false;
      }
      if (!draft.qualification.trim()) {
        setStepError('Please specify your highest educational qualification or current grade.');
        return false;
      }
    }
    if (draft.step === 2) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
        setStepError('Please enter a valid email address.');
        return false;
      }
      if (draft.phone.trim().length < 9) {
        setStepError('Please enter a valid mobile number (e.g., +94 7X XXX XXXX).');
        return false;
      }
    }
    if (draft.step === 3 && !draft.courseId) {
      setStepError('Please choose a course to continue.');
      return false;
    }
    if (draft.step === 4 && !draft.branchId) {
      setStepError('Please select a branch or online campus.');
      return false;
    }
    if (draft.step === 6 && !draft.acceptedDeclaration) {
      setStepError('Please confirm that your submitted details are accurate.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setDraft((prev) => ({ ...prev, step: Math.min(prev.step + 1, 6) }));
  };

  const handleBack = () => {
    setStepError(null);
    setDraft((prev) => ({ ...prev, step: Math.max(prev.step - 1, 1) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCurrentStep() || !selectedCourse) return;
    setSubmitting(true);
    setStepError(null);
    try {
      const combinedNotes = [
        draft.docIdName ? `ID Doc: ${draft.docIdName}` : '',
        draft.docCertName ? `Academic Doc: ${draft.docCertName}` : '',
        draft.docNotes.trim(),
      ]
        .filter(Boolean)
        .join(' | ');

      const submitted = await submitPublicApplication({
        fullName: draft.fullName.trim(),
        email: draft.email.trim().toLowerCase(),
        phone: draft.phone.trim(),
        whatsapp: (draft.whatsapp || draft.phone).trim(),
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        preferredMode: draft.mode,
        branchId: draft.branchId,
        highestQualification: draft.qualification.trim(),
        documentNotes: combinedNotes,
        referralCode: draft.referralCode.trim(),
      });

      setReceiptNumber(submitted.applicationNumber);
      setTrackCode(submitted.applicationNumber);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Ignore
      }
    } catch (err) {
      setStepError(
        err instanceof Error
          ? err.message
          : 'Unable to submit application right now. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = trackCode.trim().toUpperCase();
    if (!cleaned) return;
    setTrackLoading(true);
    setTrackResult(null);
    try {
      const res = await trackApplicationByNumber(cleaned);
      setTrackResult(res || 'not_found');
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <section className="py-12 sm:py-16 bg-[#F5F7FA] dark:bg-[#0A1324]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
              TECHMAN COLLEGE · Intake 2027 Admissions
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#101D35] dark:text-white">
              Online Admission Portal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              Complete your 6-step application securely. Your progress saves automatically on this
              device and generates an instant tracking reference number upon submission.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 self-start">
            {(
              [
                ['student', 'Student Application'],
                ['tracker', 'Track Application'],
                ['host-enquiry', 'Host Free Programme'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  tab === key
                    ? 'bg-[#101D35] dark:bg-[#1677FF] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#101D35] dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: 6-STEP STUDENT ADMISSION WIZARD */}
        {tab === 'student' && (
          <div className="mt-8">
            {receiptNumber ? (
              <div className="max-w-2xl mx-auto rounded-2xl bg-white dark:bg-[#101D35] border border-emerald-200 dark:border-emerald-800 p-8 sm:p-10 text-center shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h2 className="mt-4 text-2xl font-extrabold text-[#101D35] dark:text-white">
                  Application Submitted Successfully
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Your application has been securely recorded in the TECHMAN COLLEGE Admissions
                  registry for review.
                </p>
                <div className="mt-6 inline-block px-6 py-4 rounded-xl bg-[#EAF1FC] dark:bg-[#172A45] border border-[#1677FF]/25">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Application Reference Number
                  </div>
                  <div className="mt-1 text-2xl font-extrabold font-mono text-[#101D35] dark:text-white">
                    {receiptNumber}
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTab('tracker')}
                    className="px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    Track Application Status
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptNumber(null);
                      setDraft((prev) => ({
                        ...prev,
                        step: 1,
                        fullName: '',
                        email: '',
                        phone: '',
                        whatsapp: '',
                        qualification: '',
                        docIdName: '',
                        docCertName: '',
                        docNotes: '',
                        acceptedDeclaration: false,
                      }));
                    }}
                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-slate-200 cursor-pointer"
                  >
                    Submit Another Application
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Step Rail */}
                <aside className="lg:col-span-4 space-y-4">
                  <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-5">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Application Steps
                    </div>
                    <ol className="space-y-2">
                      {STEPS.map((label, idx) => {
                        const num = idx + 1;
                        const active = draft.step === num;
                        const done = draft.step > num;
                        return (
                          <li key={label}>
                            <button
                              type="button"
                              onClick={() => {
                                if (num <= draft.step) setDraft((prev) => ({ ...prev, step: num }));
                              }}
                              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                                active
                                  ? 'bg-[#101D35] dark:bg-[#1677FF] text-white'
                                  : done
                                    ? 'bg-[#EAF1FC] dark:bg-[#172A45] text-[#1677FF] dark:text-sky-300 cursor-pointer'
                                    : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <span>{label}</span>
                              {done && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {selectedCourse && (
                    <div className="rounded-2xl bg-[#101D35] text-white p-5 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                        Selected Programme
                      </div>
                      <div className="text-sm font-bold leading-snug">{selectedCourse.name}</div>
                      <div className="text-xs text-slate-300">
                        {selectedCourse.duration} · {selectedCourse.mode}
                      </div>
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Tuition Fee</span>
                        <span className="font-mono font-bold text-sky-300">
                          {selectedCourse.isFree
                            ? '100% Free'
                            : selectedCourse.feeConfigured === false
                              ? 'Fee on Enquiry'
                              : formatLkr(selectedCourse.courseFeeLkr)}
                        </span>
                      </div>
                    </div>
                  )}
                </aside>

                {/* Right Step Form */}
                <form
                  onSubmit={handleSubmit}
                  className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs flex flex-col justify-between gap-6"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <h2 className="text-lg font-extrabold text-[#101D35] dark:text-white">
                        {STEPS[draft.step - 1]}
                      </h2>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        Step {draft.step} of 6
                      </span>
                    </div>

                    {stepError && (
                      <div className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                        {stepError}
                      </div>
                    )}

                    {/* STEP 1: PERSONAL DETAILS */}
                    {draft.step === 1 && (
                      <div className="mt-6 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Full Name (as on NIC / Certificate) *
                          </label>
                          <input
                            type="text"
                            value={draft.fullName}
                            onChange={(e) => update('fullName', e.target.value)}
                            placeholder="e.g., Amina Farook"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Highest Education / Current Status *
                          </label>
                          <input
                            type="text"
                            value={draft.qualification}
                            onChange={(e) => update('qualification', e.target.value)}
                            placeholder="e.g., G.C.E. A/L Completed, School Student, Undergraduate, Working Professional"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* STEP 2: CONTACT INFORMATION */}
                    {draft.step === 2 && (
                      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Email Address (Used for LMS Google Login) *
                          </label>
                          <input
                            type="email"
                            value={draft.email}
                            onChange={(e) => update('email', e.target.value)}
                            placeholder="student@gmail.com"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Mobile Phone Number *
                          </label>
                          <input
                            type="tel"
                            value={draft.phone}
                            onChange={(e) => update('phone', e.target.value)}
                            placeholder="+94 7X XXX XXXX"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            WhatsApp Number
                          </label>
                          <input
                            type="tel"
                            value={draft.whatsapp}
                            onChange={(e) => update('whatsapp', e.target.value)}
                            placeholder="Same as mobile if left blank"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Affiliate / Referral Code (Optional)
                          </label>
                          <input
                            type="text"
                            value={draft.referralCode}
                            onChange={(e) => update('referralCode', e.target.value)}
                            placeholder="Optional referral code"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* STEP 3: COURSE SELECTION */}
                    {draft.step === 3 && (
                      <div className="mt-6 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Select Academic Programme *
                          </label>
                          <select
                            value={draft.courseId}
                            onChange={(e) => update('courseId', e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          >
                            {courses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.category} · {c.duration} ·{' '}
                                {c.isFree
                                  ? 'FREE'
                                  : c.feeConfigured === false
                                    ? 'Fee on Enquiry'
                                    : formatLkr(c.courseFeeLkr)})
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedCourse && (
                          <div className="rounded-xl bg-[#EAF1FC]/70 dark:bg-[#172A45] border border-[#1677FF]/20 p-4 space-y-2 text-xs">
                            <div className="font-bold text-[#101D35] dark:text-white text-sm">
                              {selectedCourse.name}
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                              {selectedCourse.description}
                            </p>
                            <div className="flex flex-wrap gap-4 pt-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              <span>Code: {selectedCourse.code}</span>
                              <span>Duration: {selectedCourse.duration}</span>
                              <span>Registration Fee: {formatLkr(selectedCourse.registrationFeeLkr)}</span>
                              <span>
                                Tuition:{' '}
                                {selectedCourse.isFree
                                  ? '100% Free'
                                  : selectedCourse.feeConfigured === false
                                    ? 'Fee on Enquiry'
                                    : formatLkr(selectedCourse.courseFeeLkr)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP 4: BRANCH & STUDY MODE */}
                    {draft.step === 4 && (
                      <div className="mt-6 space-y-5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                            Preferred Study Mode *
                          </label>
                          <div className="grid grid-cols-3 gap-3">
                            {(['Online', 'Physical', 'Hybrid'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => update('mode', m)}
                                className={`py-3 px-4 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                                  draft.mode === m
                                    ? 'bg-[#101D35] dark:bg-[#1677FF] text-white border-[#101D35] dark:border-[#1677FF]'
                                    : 'border-slate-200 dark:border-slate-700 text-[#101D35] dark:text-slate-200 hover:border-[#1677FF]'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Preferred Branch / Learning Centre *
                          </label>
                          <select
                            value={draft.branchId}
                            onChange={(e) => update('branchId', e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          >
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} — {b.city}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* STEP 5: DOCUMENTS */}
                    {draft.step === 5 && (
                      <div className="mt-6 space-y-4">
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          Attach supporting document references (NIC / Student ID or latest academic
                          transcript) for admissions verification. Original documents are verified
                          securely inside the LMS Student Portal upon enrollment.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="block rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 hover:border-[#1677FF] transition cursor-pointer bg-[#F5F7FA] dark:bg-[#172A45]/60">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#101D35] dark:text-white">
                              <Upload className="w-4 h-4 text-[#1677FF]" />
                              NIC / Passport Copy (Optional)
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {draft.docIdName || 'Select PDF, JPG, or PNG file'}
                            </div>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) update('docIdName', file.name);
                              }}
                            />
                          </label>

                          <label className="block rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 hover:border-[#1677FF] transition cursor-pointer bg-[#F5F7FA] dark:bg-[#172A45]/60">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#101D35] dark:text-white">
                              <FileText className="w-4 h-4 text-[#1677FF]" />
                              Academic Transcript / Slip (Optional)
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {draft.docCertName || 'Select PDF, JPG, or PNG file'}
                            </div>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) update('docCertName', file.name);
                              }}
                            />
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                            Additional Admissions Notes (Optional)
                          </label>
                          <textarea
                            rows={3}
                            value={draft.docNotes}
                            onChange={(e) => update('docNotes', e.target.value)}
                            placeholder="Mention installment preference, preferred batch timing, or scholarship request..."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* STEP 6: REVIEW & SUBMISSION */}
                    {draft.step === 6 && (
                      <div className="mt-6 space-y-5">
                        <div className="rounded-xl bg-[#F5F7FA] dark:bg-[#172A45] border border-slate-200 dark:border-slate-700 divide-y divide-slate-200/70 dark:divide-slate-700/70 text-xs">
                          {[
                            ['Applicant Name', draft.fullName],
                            ['Qualification', draft.qualification],
                            ['Email', draft.email],
                            ['Mobile / WhatsApp', `${draft.phone} / ${draft.whatsapp || draft.phone}`],
                            ['Selected Course', selectedCourse?.name || ''],
                            ['Branch & Mode', `${selectedBranch?.name || ''} · ${draft.mode}`],
                            [
                              'Attached References',
                              [draft.docIdName, draft.docCertName].filter(Boolean).join(', ') ||
                                'To be submitted during verification',
                            ],
                          ].map(([k, v]) => (
                            <div key={k} className="px-4 py-3 flex items-center justify-between gap-4">
                              <span className="text-slate-500 dark:text-slate-400">{k}</span>
                              <span className="font-semibold text-[#101D35] dark:text-white text-right">
                                {v}
                              </span>
                            </div>
                          ))}
                        </div>

                        <label className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.acceptedDeclaration}
                            onChange={(e) => update('acceptedDeclaration', e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-[#1677FF] focus:ring-[#1677FF]"
                          />
                          <span>
                            I confirm that the details entered above are accurate and consent to
                            TECHMAN COLLEGE processing my admission application securely.
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Step Actions */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    {draft.step > 1 ? (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#101D35] dark:text-slate-200 hover:border-[#1677FF] transition cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Previous
                      </button>
                    ) : (
                      <div />
                    )}

                    {draft.step < 6 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        Continue
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-60"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        {submitting ? 'Submitting Application...' : 'Submit Official Application'}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPLICATION TRACKER */}
        {tab === 'tracker' && (
          <div className="mt-8 max-w-2xl mx-auto rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs">
            <h2 className="text-xl font-extrabold text-[#101D35] dark:text-white">
              Track Your Application Status
            </h2>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
              Enter your TECHMAN COLLEGE reference number (e.g., <span className="font-mono">APP-2027-XXXX</span>) to check live admissions review status.
            </p>
            <form onSubmit={handleTrack} className="mt-5 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={trackCode}
                  onChange={(e) => setTrackCode(e.target.value)}
                  placeholder="APP-2027-..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#172A45] text-sm font-mono uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={trackLoading}
                className="px-5 py-2.5 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                {trackLoading ? 'Checking...' : 'Check Status'}
              </button>
            </form>

            {trackResult === 'not_found' && (
              <div className="mt-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                No application matched that reference number. Please verify your spelling or contact
                admissions on +94 710 108 803.
              </div>
            )}

            {trackResult && trackResult !== 'not_found' && (
              <div className="mt-6 rounded-xl bg-[#F5F7FA] dark:bg-[#172A45] border border-slate-200 dark:border-slate-700 p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono font-bold text-[#101D35] dark:text-white text-sm">
                    {trackResult.applicationNumber}
                  </span>
                  <StatusLabel status={trackResult.status} />
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  Programme: <strong className="text-[#101D35] dark:text-white">{trackResult.courseName}</strong>
                </div>
                {trackResult.assignedStudentId && (
                  <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    Assigned Student ID: <span className="font-mono">{trackResult.assignedStudentId}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HOST FREE SKILL DEVELOPMENT PROGRAMME */}
        {tab === 'host-enquiry' && (
          <div className="mt-8">
            <ProgrammeEnquiryForm programme={specialProgramme} />
          </div>
        )}
      </div>
    </section>
  );
};
