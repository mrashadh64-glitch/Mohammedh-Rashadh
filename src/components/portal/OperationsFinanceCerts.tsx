import React, { useEffect, useState } from 'react';
import {
  Award,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Plus,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatLkr, logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import { INSTITUTE_INFO } from '../../data/catalogSeed';
import {
  Assignment,
  AttendanceRecord,
  Certificate,
  Course,
  Examination,
  ExamQuestion,
  ExamResult,
  Expense,
  Payment,
  Submission,
  UserProfile,
} from '../../types/lms';
import { ConfirmModal, EmptyState, StatusLabel } from '../common/PlatformWidgets';

interface OpsProps {
  mode: 'attendance' | 'assessments' | 'finance' | 'certificates';
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  courses: Course[];
  usersList: UserProfile[];
  attendance: AttendanceRecord[];
  assignments: Assignment[];
  submissions: Submission[];
  examinations: Examination[];
  examResults: ExamResult[];
  payments: Payment[];
  expenses: Expense[];
  certificates: Certificate[];
  onRefreshData: () => Promise<void>;
}

export const OperationsFinanceCerts: React.FC<OpsProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  courses,
  usersList,
  attendance,
  assignments,
  submissions,
  examinations,
  examResults,
  payments,
  expenses,
  certificates,
  onRefreshData,
}) => {
  const isStaffEducator =
    isOwner || ['ADMIN', 'ACADEMIC_MANAGER', 'LECTURER', 'EXAMINER'].includes(profile.role);
  const isFinanceRole = isOwner || ['ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'].includes(profile.role);
  const isCertIssuer = isOwner || ['ADMIN', 'ACADEMIC_MANAGER', 'EXAMINER'].includes(profile.role);

  const [notice, setNotice] = useState<string | null>(null);

  // ATTENDANCE STATE
  const [attCourseId, setAttCourseId] = useState(courses[0]?.id || '');
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attStudentUid, setAttStudentUid] = useState(usersList[0]?.uid || profile.uid);
  const [attMode, setAttMode] = useState<'Online' | 'Physical' | 'QR'>('Online');
  const [attStatus, setAttStatus] = useState<'Present' | 'Late' | 'Absent' | 'Excused'>('Present');
  const [attReason, setAttReason] = useState('');

  // ASSIGNMENTS & EXAMS STATE
  const [assessTab, setAssessTab] = useState<'assignments' | 'exams'>('assignments');
  const [asgTitle, setAsgTitle] = useState('');
  const [asgCourseId, setAsgCourseId] = useState(courses[0]?.id || '');
  const [asgDue, setAsgDue] = useState('2027-03-15');
  const [asgMaxMarks, setAsgMaxMarks] = useState(100);
  const [asgInstructions, setAsgInstructions] = useState('');

  // Student submission modal
  const [submittingAsg, setSubmittingAsg] = useState<Assignment | null>(null);
  const [subUrl, setSubUrl] = useState('');
  const [subNotes, setSubNotes] = useState('');

  // AI Exam Generator state
  const [aiExamTopic, setAiExamTopic] = useState('');
  const [aiExamDifficulty, setAiExamDifficulty] = useState('Intermediate');
  const [aiExamLoading, setAiExamLoading] = useState(false);
  const [draftExamTitle, setDraftExamTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<ExamQuestion[]>([]);

  // Active Timed Exam Runner (Student)
  const [takingExam, setTakingExam] = useState<Examination | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // FINANCE STATE
  const [payCourseName, setPayCourseName] = useState(courses[0]?.name || 'International Diploma in Artificial Intelligence');
  const [payFeeType, setPayFeeType] = useState<Payment['feeType']>('Installment');
  const [payAmount, setPayAmount] = useState(15000);
  const [payMethod, setPayMethod] = useState<Payment['method']>('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Expense form
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState('Operations');
  const [expAmount, setExpAmount] = useState(5000);

  // CERTIFICATES STATE
  const [certStudentName, setCertStudentName] = useState('');
  const [certStudentId, setCertStudentId] = useState('TM27-1001');
  const [certCourseId, setCertCourseId] = useState(courses[0]?.id || '');
  const [certSignatory, setCertSignatory] = useState('CEO / Academic Director, TECHMAN COLLEGE');
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<Certificate | null>(null);

  useEffect(() => {
    if (!takingExam || secondsLeft <= 0) return;
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [takingExam, secondsLeft]);

  // 1. MARK ATTENDANCE (Duplicate-Proof Composite ID)
  const handleMarkAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const course = courses.find((c) => c.id === attCourseId) || courses[0];
    const student = usersList.find((u) => u.uid === attStudentUid) || profile;
    const compositeId = `${course.id}_${attDate}_${student.uid}`.replace(/[^a-zA-Z0-9_-]/g, '');

    await setDoc(
      doc(db, 'attendance', compositeId),
      {
        courseId: course.id,
        courseName: course.name,
        batchName: course.batchName || '2027 Intake — Batch 01',
        branchId: student.branchId || 'branch-colombo-hq',
        date: attDate,
        userId: student.uid,
        studentId: student.studentId || `TM27-${student.uid.slice(0, 5).toUpperCase()}`,
        studentName: student.displayName,
        mode: attMode,
        status: attStatus,
        markedBy: profile.uid,
        correctionReason: attReason.trim().slice(0, 240),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    if (attReason.trim()) {
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'ATTENDANCE_CORRECTION',
        targetType: 'attendance',
        targetId: compositeId,
        details: `Updated ${student.displayName} (${attDate}) to ${attStatus}. Reason: ${attReason}`,
      });
    }
    setAttReason('');
    setNotice(`Attendance recorded for ${student.displayName} (${attDate} — ${attStatus}). Duplicate records prevented.`);
    await onRefreshData();
  };

  // 2. ASSIGNMENTS & EXAMS HANDLERS
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asgTitle.trim()) return;
    const course = courses.find((c) => c.id === asgCourseId) || courses[0];
    const id = makeSafeId('ASG');
    await setDoc(doc(db, 'assignments', id), {
      courseId: course.id,
      courseName: course.name,
      title: asgTitle.trim().slice(0, 160),
      instructions: asgInstructions.trim().slice(0, 2000),
      dueDate: asgDue,
      maxMarks: Number(asgMaxMarks) || 100,
      createdBy: profile.uid,
      createdAt: new Date().toISOString(),
    });
    setAsgTitle('');
    setAsgInstructions('');
    setNotice('Assignment published to course cohort.');
    await onRefreshData();
  };

  const handleStudentSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingAsg) return;
    const id = `${submittingAsg.id}_${profile.uid}`.replace(/[^a-zA-Z0-9_-]/g, '');
    await setDoc(
      doc(db, 'submissions', id),
      {
        assignmentId: submittingAsg.id,
        assignmentTitle: submittingAsg.title,
        courseId: submittingAsg.courseId,
        userId: profile.uid,
        studentName: profile.displayName,
        submissionUrl: subUrl.trim().slice(0, 500),
        notes: subNotes.trim().slice(0, 1200),
        status: 'Submitted',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    setSubmittingAsg(null);
    setSubUrl('');
    setSubNotes('');
    setNotice('Assignment submitted for lecturer evaluation.');
    await onRefreshData();
  };

  const handleEvaluateSubmission = async (sub: Submission, marks: number, fb: string) => {
    await updateDoc(doc(db, 'submissions', sub.id), {
      marks,
      feedback: fb.slice(0, 1200),
      status: 'Evaluated',
      evaluatedBy: profile.uid,
      updatedAt: new Date().toISOString(),
    });
    setNotice(`Evaluated ${sub.studentName}'s submission (${marks} marks).`);
    await onRefreshData();
  };

  const handleGenerateAiMcq = async () => {
    const course = courses.find((c) => c.id === asgCourseId) || courses[0];
    if (!aiExamTopic.trim()) return;
    setAiExamLoading(true);
    setNotice(null);
    try {
      const res = await fetch('/api/ai/exam-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_mcq',
          courseName: course.name,
          topic: aiExamTopic,
          difficulty: aiExamDifficulty,
          count: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Exam Generator failed.');
      setDraftExamTitle(`${course.code} — ${aiExamTopic} Assessment`);
      setDraftQuestions(data.questions || []);
      setNotice(data.notice || 'AI draft ready. Review and approve before publishing.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to generate AI exam questions.');
    } finally {
      setAiExamLoading(false);
    }
  };

  const handleSaveExam = async (approvalStatus: 'draft' | 'approved') => {
    if (!draftExamTitle.trim() || draftQuestions.length === 0) return;
    const course = courses.find((c) => c.id === asgCourseId) || courses[0];
    const id = makeSafeId('EXM');
    await setDoc(doc(db, 'examinations', id), {
      courseId: course.id,
      courseName: course.name,
      title: draftExamTitle.trim().slice(0, 160),
      durationMinutes: 20,
      passPercent: 60,
      questions: draftQuestions,
      approvalStatus,
      aiAssisted: true,
      createdBy: profile.uid,
      approvedBy: approvalStatus === 'approved' ? profile.uid : '',
      updatedAt: new Date().toISOString(),
    });
    setDraftExamTitle('');
    setDraftQuestions([]);
    setAiExamTopic('');
    setNotice(
      approvalStatus === 'approved'
        ? 'Examination approved and published to students.'
        : 'Examination saved as draft awaiting examiner approval.'
    );
    await onRefreshData();
  };

  const handleSubmitExamAttempt = async () => {
    if (!takingExam) return;
    const qs = takingExam.questions || [];
    let correct = 0;
    qs.forEach((q, idx) => {
      if (examAnswers[idx] === q.correctIndex) correct += 1;
    });
    const autoPct = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0;
    const id = makeSafeId('RES');
    await setDoc(doc(db, 'examResults', id), {
      examId: takingExam.id,
      examTitle: takingExam.title,
      courseId: takingExam.courseId,
      userId: profile.uid,
      studentName: profile.displayName,
      autoScorePercent: autoPct,
      resultStatus: 'pending_approval',
      submittedAt: new Date().toISOString(),
    });
    setTakingExam(null);
    setExamAnswers({});
    setNotice(`Exam submitted! Provisional MCQ score: ${autoPct}%. Final grade awaits Lecturer / Examiner approval.`);
    await onRefreshData();
  };

  const handleApproveExamResult = async (res: ExamResult) => {
    const pct = res.autoScorePercent;
    const grade = pct >= 85 ? 'A+' : pct >= 75 ? 'A' : pct >= 65 ? 'B' : pct >= 50 ? 'C' : 'F';
    await updateDoc(doc(db, 'examResults', res.id), {
      finalScorePercent: pct,
      grade,
      passed: pct >= 50,
      resultStatus: 'published',
      approvedBy: profile.uid,
    });
    setNotice(`Published verified exam grade (${grade}) for ${res.studentName}.`);
    await onRefreshData();
  };

  // 3. FINANCE HANDLERS (Verification-First)
  const handleSubmitPaymentProof = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = makeSafeId('PAY');
    const now = new Date().toISOString();
    await setDoc(doc(db, 'payments', id), {
      userId: profile.uid,
      studentId: profile.studentId || `TM27-${profile.uid.slice(0, 5).toUpperCase()}`,
      studentName: profile.displayName,
      courseName: payCourseName.slice(0, 160),
      branchId: profile.branchId || 'branch-colombo-hq',
      feeType: payFeeType,
      amountLkr: Math.max(1, Number(payAmount) || 0),
      method: payMethod,
      referenceNo: payRef.trim().slice(0, 80),
      proofNotes: payNotes.trim().slice(0, 400),
      status: 'Pending Verification',
      institutionId: INSTITUTE_INFO.institutionId,
      createdAt: now,
      updatedAt: now,
    });
    setPayRef('');
    setPayNotes('');
    setNotice('Payment proof submitted. Status is "Pending Verification" until confirmed by Accounts.');
    await onRefreshData();
  };

  const handleVerifyPayment = async (p: Payment, decision: 'Verified' | 'Rejected') => {
    const now = new Date().toISOString();
    const receiptNo = decision === 'Verified' ? `RCP-2027-${Math.floor(10000 + Math.random() * 89999)}` : '';
    await updateDoc(doc(db, 'payments', p.id), {
      status: decision,
      receiptNumber: receiptNo,
      verifiedBy: profile.uid,
      rejectionReason: decision === 'Rejected' ? 'Proof could not be reconciled with bank statement.' : '',
      updatedAt: now,
    });
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: decision === 'Verified' ? 'VERIFY_PAYMENT_RECEIPT' : 'REJECT_PAYMENT',
      targetType: 'payments',
      targetId: p.id,
      details: `${decision} LKR ${p.amountLkr} for ${p.studentName}${receiptNo ? ` (Receipt: ${receiptNo})` : ''}`,
    });
    setNotice(
      decision === 'Verified'
        ? `Payment verified and locked. Receipt ${receiptNo} issued.`
        : `Payment marked as Rejected.`
    );
    await onRefreshData();
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim()) return;
    const id = makeSafeId('EXP');
    await setDoc(doc(db, 'expenses', id), {
      title: expTitle.trim().slice(0, 140),
      category: expCategory,
      branchId: profile.branchId || 'branch-colombo-hq',
      amountLkr: Math.max(1, Number(expAmount) || 0),
      date: new Date().toISOString().slice(0, 10),
      recordedBy: profile.uid,
      institutionId: INSTITUTE_INFO.institutionId,
    });
    setExpTitle('');
    setNotice('Operational expense recorded.');
    await onRefreshData();
  };

  // 4. CERTIFICATES HANDLERS
  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certStudentName.trim()) return;
    const course = courses.find((c) => c.id === certCourseId) || courses[0];
    const certNumber = `TM-CERT-2027-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().slice(0, 10);
    const certDoc: Certificate = {
      certificateNumber: certNumber,
      studentId: certStudentId.trim().slice(0, 40),
      studentName: certStudentName.trim().slice(0, 120),
      courseId: course.id,
      courseName: course.name,
      category: course.category,
      completionDate: today,
      issueDate: today,
      issuingInstitution: INSTITUTE_INFO.officialName,
      signatoryName: certSignatory.trim().slice(0, 120),
      status: 'Issued',
      issuedBy: profile.uid,
      institutionId: INSTITUTE_INFO.institutionId,
    };
    await setDoc(doc(db, 'certificates', certNumber), certDoc);
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: 'ISSUE_CERTIFICATE',
      targetType: 'certificates',
      targetId: certNumber,
      details: `Issued ${certNumber} to ${certDoc.studentName} for ${certDoc.courseName}`,
    });
    setCertStudentName('');
    setPreviewCert(certDoc);
    setNotice(`Issued official certificate ${certNumber}. Public QR verification is now active.`);
    await onRefreshData();
  };

  const handleRevokeCertificate = async (cert: Certificate) => {
    await updateDoc(doc(db, 'certificates', cert.certificateNumber), {
      status: 'Revoked',
      revocationReason: 'Revoked by Authorized Administration',
    });
    await logAuditEvent({
      actorUid: profile.uid,
      actorEmail: userEmail,
      actorRole: profile.role,
      action: 'REVOKE_CERTIFICATE',
      targetType: 'certificates',
      targetId: cert.certificateNumber,
      details: `Revoked certificate ${cert.certificateNumber} (${cert.studentName})`,
    });
    setConfirmRevoke(null);
    setNotice(`Certificate ${cert.certificateNumber} has been revoked.`);
    await onRefreshData();
  };

  // RENDER: ATTENDANCE
  if (mode === 'attendance') {
    const visibleAttendance = isStaffEducator
      ? attendance
      : attendance.filter((a) => a.userId === profile.uid);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
            Attendance Management (Online · Physical · QR)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Duplicate-proof daily attendance ledger with authorized correction audit trail.
          </p>
        </div>

        {notice && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {notice}
          </div>
        )}

        {isStaffEducator && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleMarkAttendance}
              className="lg:col-span-8 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="sm:col-span-2 text-sm font-bold text-[#0F172A] dark:text-white">
                Mark or Correct Session Attendance
              </div>
              <select
                value={attCourseId}
                onChange={(e) => setAttCourseId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
              />
              <select
                value={attStudentUid}
                onChange={(e) => setAttStudentUid(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {usersList.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.role})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={attMode}
                  onChange={(e) => setAttMode(e.target.value as AttendanceRecord['mode'])}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="Online">Online</option>
                  <option value="Physical">Physical</option>
                  <option value="QR">QR Check-in</option>
                </select>
                <select
                  value={attStatus}
                  onChange={(e) => setAttStatus(e.target.value as AttendanceRecord['status'])}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                  <option value="Excused">Excused</option>
                </select>
              </div>
              <input
                type="text"
                value={attReason}
                onChange={(e) => setAttReason(e.target.value)}
                placeholder="Correction reason (required if amending prior entry)"
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
                >
                  <CalendarCheck className="w-4 h-4" />
                  Save Attendance Record
                </button>
              </div>
            </form>

            <div className="lg:col-span-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
              <div className="text-xs font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-violet-600" />
                Live Classroom QR Check-In
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <QRCodeSVG value={`TECHMAN-ATT:${attCourseId}:${attDate}`} size={116} />
              </div>
              <div className="mt-2.5 text-[11px] font-mono text-slate-500">
                Session: {attDate} · {attMode}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Student</th>
                  <th className="py-3 px-4 font-medium">Course</th>
                  <th className="py-3 px-4 font-medium">Mode</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      No attendance records logged yet.
                    </td>
                  </tr>
                ) : (
                  visibleAttendance.map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-3 px-4 font-mono text-xs">{rec.date}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        {rec.studentName}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {rec.courseName || rec.courseId}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {rec.mode}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={rec.status} />
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
  }

  // RENDER: ASSIGNMENTS & EXAMINATIONS (WITH AI ASSISTANT)
  if (mode === 'assessments') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              Assignments, Timed Exams &amp; AI Assessment Assistant
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Manage practical submissions, AI-drafted MCQ exams, and examiner-approved final grades.
            </p>
          </div>
          <div className="inline-flex p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
            <button
              onClick={() => setAssessTab('assignments')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                assessTab === 'assignments'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Assignments ({assignments.length})
            </button>
            <button
              onClick={() => setAssessTab('exams')}
              className={`px-4 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                assessTab === 'exams'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Exams &amp; AI Generator ({examinations.length})
            </button>
          </div>
        </div>

        {notice && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {notice}
          </div>
        )}

        {assessTab === 'assignments' && (
          <div className="space-y-6">
            {isStaffEducator && (
              <form
                onSubmit={handleCreateAssignment}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-4 gap-3"
              >
                <div className="sm:col-span-4 text-sm font-bold text-[#0F172A] dark:text-white">
                  Create Practical Assignment
                </div>
                <select
                  value={asgCourseId}
                  onChange={(e) => setAsgCourseId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={asgTitle}
                  onChange={(e) => setAsgTitle(e.target.value)}
                  placeholder="Assignment Title *"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
                <input
                  type="date"
                  value={asgDue}
                  onChange={(e) => setAsgDue(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                />
                <input
                  type="number"
                  min={10}
                  max={1000}
                  value={asgMaxMarks}
                  onChange={(e) => setAsgMaxMarks(Number(e.target.value))}
                  placeholder="Max Marks"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                />
                <input
                  type="text"
                  value={asgInstructions}
                  onChange={(e) => setAsgInstructions(e.target.value)}
                  placeholder="Submission brief & rubric guidelines..."
                  className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
                >
                  Publish Assignment
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map((asg) => (
                <div
                  key={asg.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs text-slate-500 font-mono">
                      Due: {asg.dueDate} · Max {asg.maxMarks} marks
                    </div>
                    <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                      {asg.title}
                    </h3>
                    <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5">
                      {asg.courseName}
                    </p>
                    {asg.instructions && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {asg.instructions}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button
                      onClick={() => setSubmittingAsg(asg)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#0F172A] dark:bg-violet-600 text-white text-xs font-medium cursor-pointer"
                    >
                      Submit Work
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {submissions.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
                  Student Submissions ({submissions.length})
                </h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {submissions.map((sub) => (
                    <div key={sub.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {sub.studentName} — {sub.assignmentTitle || sub.assignmentId}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {sub.notes || 'Project link attached'} {sub.marks !== undefined ? `· Marks: ${sub.marks}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusLabel status={sub.status} />
                        {isStaffEducator && sub.status !== 'Evaluated' && (
                          <button
                            onClick={() => void handleEvaluateSubmission(sub, 88, 'Well-structured submission verified by lecturer.')}
                            className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                          >
                            Approve Grade (88)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {assessTab === 'exams' && (
          <div className="space-y-6">
            {isStaffEducator && (
              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-700 dark:text-violet-400" />
                  <div>
                    <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">
                      AI MCQ &amp; Examination Generator (Lecturer Approval Required)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Generate structured MCQs with explanations. Exams remain in Draft until explicitly approved.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <select
                    value={asgCourseId}
                    onChange={(e) => setAsgCourseId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={aiExamTopic}
                    onChange={(e) => setAiExamTopic(e.target.value)}
                    placeholder="Exam Topic (e.g., Prompt Engineering Fundamentals)"
                    className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                  <button
                    type="button"
                    disabled={aiExamLoading}
                    onClick={() => void handleGenerateAiMcq()}
                    className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
                  >
                    {aiExamLoading ? 'Generating...' : 'Generate 5 MCQs'}
                  </button>
                </div>

                {draftQuestions.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <input
                      type="text"
                      value={draftExamTitle}
                      onChange={(e) => setDraftExamTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                    />
                    <div className="space-y-2.5 max-h-64 overflow-y-auto">
                      {draftQuestions.map((q, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            Q{idx + 1}. {q.question}
                          </div>
                          <div className="mt-1 text-slate-600 dark:text-slate-300">
                            Answer: <strong>{q.options[q.correctIndex]}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveExam('draft')}
                        className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                      >
                        Save as Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveExam('approved')}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                      >
                        Approve &amp; Publish Exam
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Available Exams */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {examinations.map((ex) => (
                <div
                  key={ex.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-slate-500">
                        {ex.durationMinutes} mins · Pass {ex.passPercent}%
                      </span>
                      <StatusLabel status={ex.approvalStatus} />
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                      {ex.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ex.courseName} · {(ex.questions || []).length} questions
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                    {ex.approvalStatus === 'approved' && (
                      <button
                        onClick={() => {
                          setTakingExam(ex);
                          setExamAnswers({});
                          setSecondsLeft(ex.durationMinutes * 60);
                        }}
                        className="px-4 py-1.5 rounded-lg bg-violet-700 text-white text-xs font-medium cursor-pointer"
                      >
                        Start Timed Exam
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Exam Results Approval Queue */}
            {examResults.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-3">
                  Examination Results &amp; Examiner Approval Queue
                </h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {examResults.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {r.studentName} — {r.examTitle || r.examId}
                        </div>
                        <div className="font-mono text-slate-500 mt-0.5">
                          MCQ Score: {r.autoScorePercent}% {r.grade ? `· Final Grade: ${r.grade}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusLabel status={r.resultStatus} />
                        {isStaffEducator && r.resultStatus === 'pending_approval' && (
                          <button
                            onClick={() => void handleApproveExamResult(r)}
                            className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                          >
                            Approve &amp; Publish
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submit Assignment Modal */}
        {submittingAsg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <form
              onSubmit={handleStudentSubmitAssignment}
              className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Submit: {submittingAsg.title}
                </h3>
                <button type="button" onClick={() => setSubmittingAsg(null)} className="cursor-pointer">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <input
                type="url"
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
                placeholder="Portfolio / Drive / GitHub Submission URL"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <textarea
                rows={4}
                required
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                placeholder="Describe your practical work and deliverables..."
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSubmittingAsg(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-violet-700 text-white text-sm font-medium cursor-pointer"
                >
                  Submit Assignment
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Timed Exam Runner Modal */}
        {takingExam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto">
            <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 my-8 space-y-5 max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                    {takingExam.title}
                  </h3>
                  <p className="text-xs text-slate-500">{takingExam.courseName}</p>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-amber-700 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                </div>
              </div>

              <div className="space-y-5">
                {(takingExam.questions || []).map((q, qIdx) => (
                  <div key={qIdx} className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {qIdx + 1}. {q.question}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => setExamAnswers({ ...examAnswers, [qIdx]: optIdx })}
                          className={`text-left px-3.5 py-2.5 rounded-lg border text-xs transition cursor-pointer ${
                            examAnswers[qIdx] === optIdx
                              ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/50 text-violet-900 dark:text-violet-200 font-medium'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setTakingExam(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitExamAttempt()}
                  className="px-5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
                >
                  Submit Exam
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // RENDER: FEE & FINANCIAL MANAGEMENT (LKR)
  if (mode === 'finance') {
    const verifiedTotal = payments
      .filter((p) => p.status === 'Verified')
      .reduce((a, b) => a + b.amountLkr, 0);
    const pendingTotal = payments
      .filter((p) => p.status === 'Pending Verification')
      .reduce((a, b) => a + b.amountLkr, 0);
    const expenseTotal = expenses.reduce((a, b) => a + b.amountLkr, 0);

    const exportFinanceCsv = () => {
      const header = ['ID', 'Student', 'Course', 'FeeType', 'AmountLKR', 'Method', 'Status', 'Receipt'];
      const rows = payments.map((p) => [
        p.id,
        p.studentName,
        p.courseName,
        p.feeType,
        p.amountLkr,
        p.method,
        p.status,
        p.receiptNumber || '',
      ]);
      const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'techman-college-lkr-finance-2027.csv';
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              LKR Fee &amp; Financial Management
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Verification-first payment workflow: uploaded proofs remain Pending until confirmed by Accounts and locked with an official receipt.
            </p>
          </div>
          {isFinanceRole && (
            <button
              onClick={exportFinanceCsv}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export Ledger CSV
            </button>
          )}
        </div>

        {notice && (
          <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500">Verified Income</div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatLkr(verifiedTotal)}
            </div>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500">Pending Verification</div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {formatLkr(pendingTotal)}
            </div>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500">Recorded Expenses</div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatLkr(expenseTotal)}
            </div>
          </div>
        </div>

        {/* Submit Payment Proof Form */}
        <form
          onSubmit={handleSubmitPaymentProof}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <div className="sm:col-span-3 text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-violet-600" />
            Submit Fee Payment Proof (LKR)
          </div>
          <select
            value={payCourseName}
            onChange={(e) => setPayCourseName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={payFeeType}
            onChange={(e) => setPayFeeType(e.target.value as Payment['feeType'])}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            <option value="Registration">Registration Fee</option>
            <option value="Course Fee">Full Course Fee</option>
            <option value="Installment">Monthly Installment</option>
            <option value="Certificate Fee">Certificate Fee</option>
          </select>
          <input
            type="number"
            min={500}
            required
            value={payAmount}
            onChange={(e) => setPayAmount(Number(e.target.value))}
            placeholder="Amount in LKR"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
          />
          <select
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as Payment['method'])}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="QR Payment">LankaQR Payment</option>
            <option value="Card">Card</option>
            <option value="Cash">Cash (Branch Counter)</option>
            <option value="Online Gateway">Online Gateway</option>
          </select>
          <input
            type="text"
            required
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            placeholder="Bank Slip / Transfer Reference No. *"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
          >
            Submit for Verification
          </button>
        </form>

        {/* Payments Ledger */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Student &amp; Course</th>
                  <th className="py-3 px-4 font-medium">Type · Method</th>
                  <th className="py-3 px-4 font-medium">Ref / Receipt</th>
                  <th className="py-3 px-4 font-medium text-right">Amount (LKR)</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {isFinanceRole && <th className="py-3 px-4 font-medium text-right">Accounts Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No payment records yet.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{p.studentName}</div>
                        <div className="text-xs text-slate-500">{p.courseName}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {p.feeType} · {p.method}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        <div>{p.referenceNo || '—'}</div>
                        {p.receiptNumber && (
                          <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {p.receiptNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right font-semibold">
                        {formatLkr(p.amountLkr)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={p.status} />
                      </td>
                      {isFinanceRole && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {p.status === 'Pending Verification' ? (
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => void handleVerifyPayment(p, 'Verified')}
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                              >
                                Verify &amp; Receipt
                              </button>
                              <button
                                onClick={() => void handleVerifyPayment(p, 'Rejected')}
                                className="px-2.5 py-1 rounded border border-red-300 text-red-600 text-xs font-medium cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Locked</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expense Recorder for Accountants/Owners */}
        {isFinanceRole && (
          <form
            onSubmit={handleRecordExpense}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <div className="sm:col-span-4 text-sm font-bold text-[#0F172A] dark:text-white">
              Record College Expense (LKR)
            </div>
            <input
              type="text"
              required
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder="Expense Description *"
              className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <input
              type="number"
              min={100}
              value={expAmount}
              onChange={(e) => setExpAmount(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0F172A] dark:bg-violet-600 text-white text-sm font-medium cursor-pointer"
            >
              Add Expense
            </button>
          </form>
        )}
      </div>
    );
  }

  // RENDER: CERTIFICATES & DIGITAL QR VERIFICATION ISSUANCE
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
          Digital Certificates &amp; QR Registry
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Issue verified TECHMAN COLLEGE certificates with embedded QR verification codes and revocation controls.
        </p>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {isCertIssuer && (
        <form
          onSubmit={handleIssueCertificate}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-4 gap-3"
        >
          <div className="sm:col-span-4 text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-violet-600" />
            Issue Official 2027 Certificate
          </div>
          <input
            type="text"
            required
            value={certStudentName}
            onChange={(e) => setCertStudentName(e.target.value)}
            placeholder="Graduate Full Name *"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
          <input
            type="text"
            value={certStudentId}
            onChange={(e) => setCertStudentId(e.target.value)}
            placeholder="Student ID (TM27-XXXX)"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
          />
          <select
            value={certCourseId}
            onChange={(e) => setCertCourseId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium cursor-pointer"
          >
            Issue &amp; Generate QR
          </button>
        </form>
      )}

      {certificates.length === 0 ? (
        <EmptyState
          title="No Certificates Issued Yet"
          description="Approved student credentials issued by TECHMAN COLLEGE Administration will appear here with printable previews and public QR verification links."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certificates.map((cert) => (
            <div
              key={cert.certificateNumber}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="text-xs font-mono text-violet-700 dark:text-violet-400 font-semibold">
                  {cert.certificateNumber}
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {cert.studentName}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{cert.courseName}</div>
                <div className="text-xs text-slate-500 font-mono">
                  Issued: {cert.issueDate}
                </div>
                <div className="pt-1 flex items-center gap-3">
                  <StatusLabel status={cert.status} />
                  <button
                    onClick={() => setPreviewCert(cert)}
                    className="text-xs font-medium text-violet-700 dark:text-violet-400 hover:underline cursor-pointer"
                  >
                    Preview &amp; Print
                  </button>
                  {isCertIssuer && cert.status !== 'Revoked' && (
                    <button
                      onClick={() => setConfirmRevoke(cert)}
                      className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200 shrink-0">
                <QRCodeSVG
                  value={`${window.location.origin}/?verify=${encodeURIComponent(
                    cert.certificateNumber
                  )}`}
                  size={84}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Certificate Printable Preview Modal */}
      {previewCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white text-slate-900 border-4 border-[#0F172A] p-8 relative">
            <button
              onClick={() => setPreviewCert(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center border border-slate-200 p-8 rounded-lg space-y-4">
              <div>
                <div className="text-sm font-bold tracking-widest text-violet-700">
                  {previewCert.issuingInstitution &&
                  /academy|institute/i.test(previewCert.issuingInstitution)
                    ? INSTITUTE_INFO.officialName
                    : previewCert.issuingInstitution || INSTITUTE_INFO.officialName}
                </div>
                <div className="text-[11px] font-medium tracking-wider text-slate-500 uppercase mt-0.5">
                  {INSTITUTE_INFO.establishedLabel} · Sri Lanka
                </div>
              </div>
              <h2 className="text-2xl font-bold text-[#0F172A]">
                OFFICIAL ACADEMIC CREDENTIAL
              </h2>
              <p className="text-xs text-slate-500">This certifies that</p>
              <div className="text-2xl font-bold text-[#0F172A]">{previewCert.studentName}</div>
              <p className="text-xs text-slate-500">has successfully completed the programme</p>
              <div className="text-lg font-semibold text-violet-800">{previewCert.courseName}</div>
              <div className="pt-6 flex items-center justify-between text-xs border-t border-slate-200 mt-6">
                <div className="text-left">
                  <div className="font-semibold">
                    {(previewCert.signatoryName || 'CEO / Academic Director, TECHMAN COLLEGE').replace(
                      /TECHMAN AI(?! COLLEGE)/gi,
                      'TECHMAN COLLEGE'
                    )}
                  </div>
                  <div className="text-slate-500">Authorized Signatory · {INSTITUTE_INFO.officialName}</div>
                  <div className="font-mono mt-1">Date: {previewCert.issueDate}</div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <div className="font-mono font-bold">{previewCert.certificateNumber}</div>
                    <div className="text-slate-500">Scan QR to Verify Online</div>
                  </div>
                  <QRCodeSVG
                    value={`${window.location.origin}/?verify=${encodeURIComponent(
                      previewCert.certificateNumber
                    )}`}
                    size={72}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-medium cursor-pointer"
              >
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmRevoke)}
        title="Revoke Digital Certificate?"
        description={`Revoking ${confirmRevoke?.certificateNumber} (${confirmRevoke?.studentName}) will immediately display a Revoked notice on the public QR verification portal and log an immutable audit entry.`}
        confirmLabel="Revoke Certificate"
        destructive
        onConfirm={() => confirmRevoke && void handleRevokeCertificate(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
};
