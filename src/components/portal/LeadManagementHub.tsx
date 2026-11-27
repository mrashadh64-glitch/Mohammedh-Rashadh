import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import {
  autoMapLeadColumns,
  computeLeadBatchFingerprint,
  downloadLeadCsvTemplate,
  downloadLeadSampleTemplate,
  DuplicateAction,
  exportLeadErrorReport,
  exportLeadsToSpreadsheet,
  formatWhatsAppUrl,
  generateLeadCode,
  LEAD_FIELD_DEFS,
  LEAD_PRIORITY_OPTIONS,
  LEAD_SOURCES,
  LEAD_STATUS_OPTIONS,
  LeadImportFieldKey,
  mergeLeadFields,
  normalizeEmail,
  normalizeGoogleSheetsCsvUrl,
  normalizePhone,
  ParsedLeadSpreadsheet,
  parseLeadSpreadsheet,
  PreviewLeadRow,
  validateAndPreviewLeadRows,
} from '../../lib/leadImportEngine';
import { stripUndefined } from '../../lib/syllabusEngine';
import { INSTITUTE_INFO } from '../../data/catalogSeed';
import {
  Application,
  Branch,
  Course,
  LeadActivity,
  LeadImportBatch,
  LeadPriority,
  LeadRecord,
  LeadStatus,
  MigratedStudentRecord,
  UserProfile,
} from '../../types/lms';
import { EmptyState } from '../common/PlatformWidgets';

export type LeadMode =
  | 'lead-dashboard'
  | 'lead-all'
  | 'lead-import'
  | 'lead-calendar'
  | 'lead-assignments'
  | 'lead-reports';

interface LeadManagementHubProps {
  mode: LeadMode;
  profile: UserProfile;
  userEmail: string;
  isOwner: boolean;
  leads: LeadRecord[];
  leadActivities: LeadActivity[];
  leadImportBatches: LeadImportBatch[];
  courses: Course[];
  branches: Branch[];
  usersList: UserProfile[];
  applications: Application[];
  migratedStudents: MigratedStudentRecord[];
  onNavigateTab: (tab: string) => void;
  onRefreshData: () => Promise<void>;
}

const STATUS_BADGE_STYLES: Record<LeadStatus, string> = {
  'New Lead': 'bg-[#EAF1FC] text-[#1677FF] dark:bg-blue-950/60 dark:text-blue-300',
  Contacted: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Follow-up Required': 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  Interested: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
  'Application Started': 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  'Converted to Student': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'Not Interested': 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  Lost: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  'Invalid Contact': 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
};

const CHART_PALETTE = ['#1677FF', '#101D35', '#16A34A', '#D97706', '#6366F1', '#DC2626', '#64748B'];

function LeadStatusTag({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
        STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES['New Lead']
      }`}
    >
      {status}
    </span>
  );
}

export const LeadManagementHub: React.FC<LeadManagementHubProps> = ({
  mode,
  profile,
  userEmail,
  isOwner,
  leads,
  leadActivities,
  leadImportBatches,
  courses,
  branches,
  usersList,
  applications,
  migratedStudents,
  onNavigateTab,
  onRefreshData,
}) => {
  const isFullAdmin = isOwner || ['SUPER_ADMIN', 'ADMIN'].includes(profile.role);
  const isBranchAdmin = profile.role === 'BRANCH_MANAGER';
  const canImportExport = isFullAdmin;
  const canAssignStaff = isFullAdmin || isBranchAdmin;
  const canDeleteLead = isFullAdmin;
  const canAccessLeads =
    isFullAdmin ||
    isBranchAdmin ||
    ['ADMISSION_OFFICER', 'COORDINATOR'].includes(profile.role);

  // Scoped leads according to RBAC
  const scopedLeads = useMemo(() => {
    if (isFullAdmin) return leads;
    if (isBranchAdmin) {
      return leads.filter(
        (l) => !profile.branchId || l.preferredBranchId === profile.branchId || l.assignedToUid === profile.uid
      );
    }
    return leads.filter((l) => l.assignedToUid === profile.uid || l.createdByUid === profile.uid);
  }, [leads, isFullAdmin, isBranchAdmin, profile.branchId, profile.uid]);

  // Assignable staff list
  const assignableStaff = useMemo(() => {
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'ADMISSION_OFFICER', 'COORDINATOR'];
    const filtered = usersList.filter((u) => {
      if (!allowedRoles.includes(u.role)) return false;
      if (isBranchAdmin && profile.branchId && u.branchId && u.branchId !== profile.branchId) {
        return false;
      }
      return true;
    });
    if (!filtered.some((u) => u.uid === profile.uid)) {
      filtered.unshift(profile);
    }
    return filtered;
  }, [usersList, isBranchAdmin, profile]);

  // Shared Filter State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [courseFilter, setCourseFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStaffUid, setBulkStaffUid] = useState<string>('');
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string>('');
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals & Profile Drawer
  const [editingLead, setEditingLead] = useState<Partial<LeadRecord> | null>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [activeLead, setActiveLead] = useState<LeadRecord | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteNextDate, setNewNoteNextDate] = useState('');
  const [confirmDeleteLead, setConfirmDeleteLead] = useState<LeadRecord | null>(null);

  // Lead-to-Student Conversion Modal State
  const [convertingLead, setConvertingLead] = useState<LeadRecord | null>(null);
  const [convForm, setConvForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    whatsapp: '',
    courseId: '',
    preferredMode: 'Hybrid' as 'Online' | 'Physical' | 'Hybrid',
    branchId: '',
    batchName: '2027 Intake — Batch 01',
    highestQualification: '',
    studentId: '',
    sendStudentInvite: true,
  });
  const [convertingBusy, setConvertingBusy] = useState(false);

  // Bulk Import Wizard State
  const [parsedSheet, setParsedSheet] = useState<ParsedLeadSpreadsheet | null>(null);
  const [rawWorkbookBuffer, setRawWorkbookBuffer] = useState<ArrayBuffer | null>(null);
  const [colMapping, setColMapping] = useState<Record<LeadImportFieldKey, string>>(
    {} as Record<LeadImportFieldKey, string>
  );
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [previewRows, setPreviewRows] = useState<PreviewLeadRow[]>([]);
  const [globalDupAction, setGlobalDupAction] = useState<DuplicateAction>('skip');
  const [backupExported, setBackupExported] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    mergedCount: number;
    skippedDuplicates: number;
    errorCount: number;
  } | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 5000);
  };

  // Apply active filters
  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedLeads.filter((l) => {
      if (!showArchived && l.archived) return false;
      if (statusFilter !== 'All' && l.status !== statusFilter) return false;
      if (branchFilter !== 'All' && l.preferredBranchId !== branchFilter && l.preferredBranchName !== branchFilter)
        return false;
      if (courseFilter !== 'All' && l.interestedCourseId !== courseFilter && l.interestedCourseName !== courseFilter)
        return false;
      if (sourceFilter !== 'All' && (l.leadSource || 'Unspecified') !== sourceFilter) return false;
      const leadDate = (l.enquiryDate || l.createdAt || '').slice(0, 10);
      if (dateFrom && leadDate && leadDate < dateFrom) return false;
      if (dateTo && leadDate && leadDate > dateTo) return false;
      if (!q) return true;
      return (
        l.fullName.toLowerCase().includes(q) ||
        l.mobile.toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        l.leadId.toLowerCase().includes(q) ||
        (l.interestedCourseName || '').toLowerCase().includes(q)
      );
    });
  }, [
    scopedLeads,
    showArchived,
    statusFilter,
    branchFilter,
    courseFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  // 9 Core Lead Dashboard KPIs
  const kpis = useMemo(() => {
    const active = filteredLeads.filter((l) => !l.archived);
    const countOf = (st: LeadStatus) => active.filter((l) => l.status === st).length;
    return {
      total: active.length,
      newLeads: countOf('New Lead'),
      contacted: countOf('Contacted'),
      followUpRequired: countOf('Follow-up Required'),
      interested: countOf('Interested'),
      appStarted: countOf('Application Started'),
      converted: countOf('Converted to Student'),
      notInterested: countOf('Not Interested'),
      lost: countOf('Lost') + countOf('Invalid Contact'),
    };
  }, [filteredLeads]);

  const distinctSources = useMemo(() => {
    const s = new Set<string>(LEAD_SOURCES);
    scopedLeads.forEach((l) => {
      if (l.leadSource) s.add(l.leadSource);
    });
    return Array.from(s);
  }, [scopedLeads]);

  const appendLeadActivity = async (params: {
    leadId: string;
    leadCode?: string;
    actionType: LeadActivity['actionType'];
    previousStatus?: string;
    newStatus?: string;
    note: string;
    branchId?: string;
  }) => {
    const actId = makeSafeId('LACT');
    await setDoc(
      doc(db, 'leadActivities', actId),
      stripUndefined({
        leadId: params.leadId,
        leadCode: params.leadCode,
        actionType: params.actionType,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        note: params.note.slice(0, 1000),
        actorUid: profile.uid,
        actorName: profile.displayName.slice(0, 120),
        actorRole: profile.role,
        branchId: params.branchId,
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: new Date().toISOString(),
      })
    );
  };

  // Save manual Create / Edit Lead
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLead) return;
    const fullName = (editingLead.fullName || '').trim();
    const mobile = (editingLead.mobile || '').trim();
    if (!fullName || !mobile) {
      notify('error', 'Full Name and Mobile Number are required.');
      return;
    }

    setSavingLead(true);
    try {
      const now = new Date().toISOString();
      const isNew = !editingLead.id;
      const docId = editingLead.id || makeSafeId('LD');
      const leadCode = editingLead.leadId || generateLeadCode(leads.length + 1);
      const matchedCourse = courses.find((c) => c.id === editingLead.interestedCourseId);
      const matchedBranch = branches.find((b) => b.id === editingLead.preferredBranchId);
      const matchedStaff = assignableStaff.find((s) => s.uid === editingLead.assignedToUid);

      const payload = stripUndefined({
        leadId: leadCode.slice(0, 48),
        fullName: fullName.slice(0, 140),
        mobile: mobile.slice(0, 32),
        normalizedMobile: normalizePhone(mobile).slice(0, 32),
        whatsapp: (editingLead.whatsapp || '').trim().slice(0, 32) || undefined,
        email: normalizeEmail(editingLead.email).slice(0, 160) || undefined,
        dateOfBirth: (editingLead.dateOfBirth || '').trim().slice(0, 24) || undefined,
        gender: (editingLead.gender || '').trim().slice(0, 32) || undefined,
        address: (editingLead.address || '').trim().slice(0, 300) || undefined,
        city: (editingLead.city || '').trim().slice(0, 80) || undefined,
        district: (editingLead.district || '').trim().slice(0, 80) || undefined,
        interestedCourseId: matchedCourse?.id || editingLead.interestedCourseId || undefined,
        interestedCourseName:
          (matchedCourse?.name || editingLead.interestedCourseName || '').slice(0, 160) || undefined,
        courseCategory: (matchedCourse?.category || editingLead.courseCategory || '').slice(0, 64) || undefined,
        preferredBranchId: matchedBranch?.id || editingLead.preferredBranchId || undefined,
        preferredBranchName:
          (matchedBranch?.name || editingLead.preferredBranchName || '').slice(0, 120) || undefined,
        preferredStudyMode: editingLead.preferredStudyMode || undefined,
        educationQualification:
          (editingLead.educationQualification || '').trim().slice(0, 160) || undefined,
        academicYear: (editingLead.academicYear || '2027').trim().slice(0, 16),
        leadSource: (editingLead.leadSource || 'Website Enquiry').trim().slice(0, 80),
        campaignName: (editingLead.campaignName || '').trim().slice(0, 120) || undefined,
        adReference: (editingLead.adReference || '').trim().slice(0, 120) || undefined,
        socialMediaPlatform: (editingLead.socialMediaPlatform || '').trim().slice(0, 64) || undefined,
        referralName: (editingLead.referralName || '').trim().slice(0, 120) || undefined,
        enquiryDate: (editingLead.enquiryDate || now.slice(0, 10)).slice(0, 32),
        status: (editingLead.status || 'New Lead') as LeadStatus,
        assignedToUid:
          matchedStaff?.uid || editingLead.assignedToUid || (isNew ? profile.uid : undefined),
        assignedToName:
          (matchedStaff?.displayName || editingLead.assignedToName || (isNew ? profile.displayName : '')).slice(
            0,
            120
          ) || undefined,
        lastContactDate: editingLead.lastContactDate || undefined,
        nextFollowUpDate: (editingLead.nextFollowUpDate || '').trim().slice(0, 32) || undefined,
        followUpNotes: (editingLead.followUpNotes || '').trim().slice(0, 2000) || undefined,
        priority: (editingLead.priority || 'Medium') as LeadPriority,
        notInterestedReason: (editingLead.notInterestedReason || '').trim().slice(0, 300) || undefined,
        archived: Boolean(editingLead.archived),
        createdByUid: editingLead.createdByUid || profile.uid,
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: editingLead.createdAt || now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'leads', docId), payload, { merge: true });
      await appendLeadActivity({
        leadId: docId,
        leadCode,
        actionType: isNew ? 'created' : 'edited',
        newStatus: payload.status,
        note: isNew
          ? `Lead ${leadCode} created manually by ${profile.displayName}.`
          : `Lead profile details updated by ${profile.displayName}.`,
        branchId: payload.preferredBranchId,
      });

      setEditingLead(null);
      notify('success', isNew ? `Lead ${leadCode} added successfully.` : `Lead ${leadCode} updated.`);
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save lead.');
    } finally {
      setSavingLead(false);
    }
  };

  // Status Transition with automatic activity log
  const handleStatusChange = async (lead: LeadRecord, nextStatus: LeadStatus) => {
    if (lead.status === nextStatus) return;
    if (nextStatus === 'Converted to Student') {
      openConvertModal(lead);
      return;
    }
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'leads', lead.id), {
        status: nextStatus,
        lastContactDate: now.slice(0, 10),
        updatedAt: now,
      });
      await appendLeadActivity({
        leadId: lead.id,
        leadCode: lead.leadId,
        actionType: 'status_change',
        previousStatus: lead.status,
        newStatus: nextStatus,
        note: `Status updated from "${lead.status}" to "${nextStatus}".`,
        branchId: lead.preferredBranchId,
      });
      if (activeLead?.id === lead.id) {
        setActiveLead({ ...lead, status: nextStatus, lastContactDate: now.slice(0, 10), updatedAt: now });
      }
      notify('success', `${lead.leadId} moved to ${nextStatus}.`);
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update status.');
    }
  };

  // Add Follow-up Note / Reschedule
  const handleAddFollowUpNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || !newNoteText.trim()) return;
    try {
      const now = new Date().toISOString();
      const combinedNotes = activeLead.followUpNotes
        ? `[${now.slice(0, 10)} ${profile.displayName}] ${newNoteText.trim()}\n${activeLead.followUpNotes}`
        : `[${now.slice(0, 10)} ${profile.displayName}] ${newNoteText.trim()}`;
      const patch: Record<string, string> = {
        followUpNotes: combinedNotes.slice(0, 2000),
        lastContactDate: now.slice(0, 10),
        updatedAt: now,
      };
      if (newNoteNextDate) patch.nextFollowUpDate = newNoteNextDate;

      await updateDoc(doc(db, 'leads', activeLead.id), patch);
      await appendLeadActivity({
        leadId: activeLead.id,
        leadCode: activeLead.leadId,
        actionType: 'note_added',
        note: `${newNoteText.trim()}${newNoteNextDate ? ` (Next follow-up: ${newNoteNextDate})` : ''}`,
        branchId: activeLead.preferredBranchId,
      });

      setActiveLead({ ...activeLead, ...patch });
      setNewNoteText('');
      setNewNoteNextDate('');
      notify('success', 'Follow-up note recorded.');
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to add note.');
    }
  };

  const handleLogOutreach = async (lead: LeadRecord, channel: 'call_logged' | 'whatsapp_opened') => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'leads', lead.id), {
        lastContactDate: now.slice(0, 10),
        updatedAt: now,
      });
      await appendLeadActivity({
        leadId: lead.id,
        leadCode: lead.leadId,
        actionType: channel,
        note:
          channel === 'call_logged'
            ? `Outbound call initiated to ${lead.mobile}.`
            : `WhatsApp follow-up conversation opened for ${lead.whatsapp || lead.mobile}.`,
        branchId: lead.preferredBranchId,
      });
      await onRefreshData();
    } catch {
      // Non-blocking audit log for direct call/WhatsApp
    }
  };

  // Single or Bulk Staff Assignment
  const handleAssignLeads = async (targetIds: string[], staffUid: string) => {
    if (!canAssignStaff || targetIds.length === 0 || !staffUid) return;
    const staff = assignableStaff.find((u) => u.uid === staffUid);
    if (!staff) return;
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      for (const id of targetIds) {
        batch.update(doc(db, 'leads', id), {
          assignedToUid: staff.uid,
          assignedToName: staff.displayName.slice(0, 120),
          updatedAt: now,
        });
      }
      await batch.commit();
      // Log assignment on first 10 to stay light on write budget
      for (const id of targetIds.slice(0, 10)) {
        const l = scopedLeads.find((x) => x.id === id);
        await appendLeadActivity({
          leadId: id,
          leadCode: l?.leadId,
          actionType: 'assigned',
          note: `Assigned to ${staff.displayName} (${staff.role.replace(/_/g, ' ')}) by ${profile.displayName}.`,
          branchId: l?.preferredBranchId,
        });
      }
      setSelectedIds(new Set());
      notify('success', `Assigned ${targetIds.length} lead(s) to ${staff.displayName}.`);
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Assignment failed.');
    }
  };

  // Bulk Status Update for Selected Leads
  const handleBulkStatusUpdate = async (targetIds: string[], nextStatus: LeadStatus) => {
    if (targetIds.length === 0 || !nextStatus) return;
    if (nextStatus === 'Converted to Student') {
      notify('error', 'Please convert leads individually so Admission Applications & Student IDs are validated.');
      return;
    }
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      for (const id of targetIds) {
        batch.update(doc(db, 'leads', id), {
          status: nextStatus,
          lastContactDate: now.slice(0, 10),
          updatedAt: now,
        });
      }
      await batch.commit();
      for (const id of targetIds.slice(0, 10)) {
        const l = scopedLeads.find((x) => x.id === id);
        await appendLeadActivity({
          leadId: id,
          leadCode: l?.leadId,
          actionType: 'status_change',
          previousStatus: l?.status,
          newStatus: nextStatus,
          note: `Bulk status updated to "${nextStatus}" by ${profile.displayName}.`,
          branchId: l?.preferredBranchId,
        });
      }
      setSelectedIds(new Set());
      setBulkStatus('');
      notify('success', `Updated status of ${targetIds.length} lead(s) to "${nextStatus}".`);
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Bulk status update failed.');
    }
  };

  // Google Sheets Published CSV Import
  const handleGoogleSheetsImport = async () => {
    const csvUrl = normalizeGoogleSheetsCsvUrl(googleSheetsUrl);
    if (!csvUrl) {
      notify('error', 'Enter a valid Google Sheets URL (https://docs.google.com/spreadsheets/...).');
      return;
    }
    setFetchingSheet(true);
    try {
      const resp = await fetch(csvUrl);
      if (!resp.ok) {
        throw new Error('Unable to access sheet. Ensure the Google Sheet is published to the web or shared as "Anyone with link can view".');
      }
      const csvText = await resp.text();
      const buf = new TextEncoder().encode(csvText).buffer;
      const parsed = parseLeadSpreadsheet(buf, 'Google_Sheets_Import.csv');
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        notify('error', 'The Google Sheet returned no readable rows.');
        return;
      }
      setRawWorkbookBuffer(buf);
      setParsedSheet(parsed);
      setColMapping(autoMapLeadColumns(parsed.headers));
      setImportResult(null);
      setImportStep('map');
      notify('success', `Loaded ${parsed.rows.length} rows from Google Sheets for column mapping.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Google Sheets import failed.');
    } finally {
      setFetchingSheet(false);
    }
  };

  // Archive or Delete Lead
  const handleArchiveOrDelete = async (lead: LeadRecord, hardDelete: boolean) => {
    try {
      const now = new Date().toISOString();
      if (hardDelete && canDeleteLead) {
        await deleteDoc(doc(db, 'leads', lead.id));
        await logAuditEvent({
          actorUid: profile.uid,
          actorEmail: userEmail,
          actorRole: profile.role,
          action: 'DELETE_LEAD',
          targetType: 'leads',
          targetId: lead.id,
          details: `Permanently deleted lead ${lead.leadId} (${lead.fullName}).`,
        });
        notify('success', `Lead ${lead.leadId} deleted.`);
      } else {
        await updateDoc(doc(db, 'leads', lead.id), {
          archived: !lead.archived,
          updatedAt: now,
        });
        await appendLeadActivity({
          leadId: lead.id,
          leadCode: lead.leadId,
          actionType: 'archived',
          note: lead.archived ? 'Lead restored from archive.' : 'Lead archived.',
          branchId: lead.preferredBranchId,
        });
        notify('success', lead.archived ? `Restored ${lead.leadId}.` : `Archived ${lead.leadId}.`);
      }
      setConfirmDeleteLead(null);
      if (activeLead?.id === lead.id) setActiveLead(null);
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update lead.');
    }
  };

  // Open Pre-filled Conversion Modal
  const openConvertModal = (lead: LeadRecord) => {
    const matchedCourse =
      courses.find((c) => c.id === lead.interestedCourseId) ||
      courses.find((c) =>
        lead.interestedCourseName
          ? c.name.toLowerCase().includes(lead.interestedCourseName.toLowerCase())
          : false
      ) ||
      courses[0];
    const matchedBranch =
      branches.find((b) => b.id === lead.preferredBranchId) || branches[0];
    const generatedStuId = `TM27-${Math.floor(1000 + Math.random() * 9000)}`;

    setConvForm({
      fullName: lead.fullName,
      email: lead.email || '',
      phone: lead.mobile,
      whatsapp: lead.whatsapp || lead.mobile,
      courseId: matchedCourse?.id || '',
      preferredMode: (lead.preferredStudyMode as 'Online' | 'Physical' | 'Hybrid') || 'Hybrid',
      branchId: matchedBranch?.id || 'branch-colombo-hq',
      batchName: matchedCourse?.batchName || '2027 Intake — Batch 01',
      highestQualification: lead.educationQualification || '',
      studentId: lead.convertedStudentId || generatedStuId,
      sendStudentInvite: Boolean(lead.email),
    });
    setConvertingLead(lead);
  };

  // Execute Lead-to-Student Conversion (Pre-fill Admission Application + Optional Secure Student Invite)
  const handleConfirmConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingLead) return;

    const cleanEmail = normalizeEmail(convForm.email);
    const cleanPhone = normalizePhone(convForm.phone);
    if (!convForm.fullName.trim() || !cleanEmail || !convForm.phone.trim() || !convForm.courseId) {
      notify('error', 'Full Name, Email, Mobile Number, and Course are required to convert.');
      return;
    }

    // Duplicate student / application guard
    const dupApp = applications.find(
      (a) =>
        a.courseId === convForm.courseId &&
        (normalizeEmail(a.email) === cleanEmail || normalizePhone(a.phone) === cleanPhone)
    );
    if (dupApp) {
      notify(
        'error',
        `Duplicate prevented: Application ${dupApp.applicationNumber} already exists for this student and course.`
      );
      return;
    }

    setConvertingBusy(true);
    try {
      const now = new Date().toISOString();
      const selectedCourse = courses.find((c) => c.id === convForm.courseId);
      const appNumber = `TM-2027-${Math.floor(1000 + Math.random() * 9000)}`;
      const studentId = convForm.studentId.trim().toUpperCase().slice(0, 40);

      // 1. Create pre-filled Admission Application linked to original leadId
      await setDoc(doc(db, 'applications', appNumber), {
        applicationNumber: appNumber,
        fullName: convForm.fullName.trim().slice(0, 120),
        email: cleanEmail.slice(0, 160),
        phone: convForm.phone.trim().slice(0, 32),
        whatsapp: (convForm.whatsapp || convForm.phone).trim().slice(0, 32),
        courseId: convForm.courseId,
        courseName: (selectedCourse?.name || convertingLead.interestedCourseName || 'Course').slice(0, 160),
        preferredMode: convForm.preferredMode,
        branchId: convForm.branchId || 'branch-colombo-hq',
        batchName: convForm.batchName.slice(0, 80),
        highestQualification: convForm.highestQualification.slice(0, 160),
        documentNotes: `Converted from Lead ${convertingLead.leadId} by ${profile.displayName}.`,
        status: 'Submitted',
        assignedStudentId: studentId,
        leadId: convertingLead.id,
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Public Application Tracker projection (PII-free)
      const initials = convForm.fullName
        .trim()
        .split(/\s+/)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 6);
      await setDoc(doc(db, 'applicationTrackers', appNumber), {
        applicationNumber: appNumber,
        applicantInitials: initials,
        courseName: (selectedCourse?.name || convertingLead.interestedCourseName || 'Course').slice(0, 160),
        status: 'Submitted',
        assignedStudentId: studentId,
        updatedAt: now,
      });

      // 3. Optional secure account activation invitation (NEVER auto-generates insecure passwords)
      if (convForm.sendStudentInvite && cleanEmail) {
        const invId = makeSafeId('INV');
        await setDoc(doc(db, 'roleInvitations', invId), {
          email: cleanEmail.slice(0, 160),
          fullName: convForm.fullName.trim().slice(0, 120),
          role: 'STUDENT',
          branchId: convForm.branchId || 'branch-colombo-hq',
          studentId,
          status: 'pending',
          invitedBy: profile.uid,
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: now,
        });
      }

      // 4. Update Lead status to Converted to Student & link application/student ID
      await updateDoc(doc(db, 'leads', convertingLead.id), {
        status: 'Converted to Student',
        convertedApplicationId: appNumber,
        convertedStudentId: studentId,
        convertedAt: now,
        convertedByUid: profile.uid,
        convertedByName: profile.displayName.slice(0, 120),
        lastContactDate: now.slice(0, 10),
        updatedAt: now,
      });

      await appendLeadActivity({
        leadId: convertingLead.id,
        leadCode: convertingLead.leadId,
        actionType: 'converted',
        previousStatus: convertingLead.status,
        newStatus: 'Converted to Student',
        note: `Converted to Student Admission ${appNumber} (Student ID: ${studentId})${
          convForm.sendStudentInvite ? ' + secure student activation invite issued.' : '.'
        }`,
        branchId: convForm.branchId,
      });

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'CONVERT_LEAD_TO_STUDENT',
        targetType: 'leads',
        targetId: convertingLead.id,
        details: `Lead ${convertingLead.leadId} converted to Application ${appNumber} / Student ID ${studentId}.`,
      });

      setConvertingLead(null);
      setActiveLead(null);
      notify(
        'success',
        `Lead converted! Admission ${appNumber} & Student ID ${studentId} created.`
      );
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Conversion failed.');
    } finally {
      setConvertingBusy(false);
    }
  };

  // Bulk Import Handlers
  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      notify('error', 'Unsupported file type. Please upload .xlsx, .xls, or .csv.');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseLeadSpreadsheet(buf, file.name);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        notify('error', 'The uploaded file contains no readable rows.');
        return;
      }
      setRawWorkbookBuffer(buf);
      setParsedSheet(parsed);
      setColMapping(autoMapLeadColumns(parsed.headers));
      setImportResult(null);
      setImportStep('map');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to parse spreadsheet.');
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!rawWorkbookBuffer || !parsedSheet) return;
    const parsed = parseLeadSpreadsheet(rawWorkbookBuffer, parsedSheet.fileName, sheetName);
    setParsedSheet(parsed);
    setColMapping(autoMapLeadColumns(parsed.headers));
  };

  const handleBuildPreview = () => {
    if (!parsedSheet) return;
    if (!colMapping.fullName || !colMapping.mobile) {
      notify('error', 'Please map both Full Name and Mobile Number before previewing.');
      return;
    }
    const preview = validateAndPreviewLeadRows({
      rows: parsedSheet.rows,
      mapping: colMapping,
      existingLeads: leads,
      existingApplications: applications,
      existingMigratedStudents: migratedStudents,
      courses,
      branches,
      defaultDuplicateAction: globalDupAction,
    });
    setPreviewRows(preview);
    setImportStep('preview');
  };

  const handleToggleAllDuplicateActions = (action: DuplicateAction) => {
    setGlobalDupAction(action);
    setPreviewRows((prev) =>
      prev.map((row) =>
        row.status === 'duplicate' && row.matchedLeadId
          ? { ...row, duplicateAction: action }
          : row
      )
    );
  };

  const handleCommitLeadImport = async () => {
    if (!parsedSheet || !canImportExport) return;
    setCommittingImport(true);
    try {
      const now = new Date().toISOString();
      const batchId = makeSafeId('LIMP');
      let importedCount = 0;
      let mergedCount = 0;
      let skippedDuplicates = 0;
      let errorCount = 0;

      const ops: Array<() => void> = [];
      let seq = leads.length + 1;

      const existingLeadMap = new Map(leads.map((l) => [l.id, l]));

      // Firestore writeBatch supports up to 500 ops per commit — chunk safely at 400
      let batch = writeBatch(db);
      let opCount = 0;
      const flushIfNeeded = async (force = false) => {
        if ((opCount >= 400 || force) && opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      for (const row of previewRows) {
        if (row.status === 'error') {
          errorCount += 1;
          continue;
        }
        if (row.status === 'duplicate') {
          if (row.duplicateAction === 'merge' && row.matchedLeadId) {
            const existing = existingLeadMap.get(row.matchedLeadId);
            if (existing) {
              const mergedPatch = mergeLeadFields(existing, row.payload);
              if (Object.keys(mergedPatch).length > 0) {
                batch.update(
                  doc(db, 'leads', existing.id),
                  stripUndefined({ ...mergedPatch, updatedAt: now })
                );
                opCount += 1;
                mergedCount += 1;
                await flushIfNeeded();
              } else {
                skippedDuplicates += 1;
              }
            } else {
              skippedDuplicates += 1;
            }
          } else {
            skippedDuplicates += 1;
          }
          continue;
        }

        const docId = makeSafeId('LD');
        const leadCode = generateLeadCode(seq++);
        const cleanDoc = stripUndefined({
          ...row.payload,
          leadId: leadCode,
          status: (row.payload.status || 'New Lead') as LeadStatus,
          leadSource: row.payload.leadSource || 'Bulk Excel Import',
          enquiryDate: row.payload.enquiryDate || now.slice(0, 10),
          importBatchId: batchId,
          archived: false,
          createdByUid: profile.uid,
          institutionId: INSTITUTE_INFO.institutionId,
          createdAt: now,
          updatedAt: now,
        });
        batch.set(doc(db, 'leads', docId), cleanDoc);
        opCount += 1;
        importedCount += 1;
        await flushIfNeeded();
      }
      await flushIfNeeded(true);
      void ops;

      // Idempotent batch fingerprint check
      const batchFingerprint = computeLeadBatchFingerprint(parsedSheet.fileName, parsedSheet.rows);
      const duplicateBatch = leadImportBatches.find((b) => b.batchFingerprint === batchFingerprint);
      if (duplicateBatch && importedCount === 0 && mergedCount === 0) {
        notify('error', `This exact spreadsheet batch was already imported on ${duplicateBatch.createdAt.slice(0, 10)}.`);
        return;
      }

      // Record immutable Import Batch History
      await setDoc(doc(db, 'leadImportBatches', batchId), {
        fileName: parsedSheet.fileName.slice(0, 200),
        sheetName: parsedSheet.activeSheet.slice(0, 120),
        batchFingerprint,
        totalRows: previewRows.length,
        importedCount,
        mergedCount,
        skippedDuplicates,
        errorCount,
        backupExported,
        importedByUid: profile.uid,
        importedByEmail: userEmail.slice(0, 160),
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: now,
      });

      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'BULK_IMPORT_LEADS',
        targetType: 'leadImportBatches',
        targetId: batchId,
        details: `Imported ${importedCount} new leads, merged ${mergedCount}, skipped ${skippedDuplicates} duplicates, ${errorCount} errors from ${parsedSheet.fileName}.`,
      });

      setImportResult({ importedCount, mergedCount, skippedDuplicates, errorCount });
      setImportStep('done');
      notify('success', `Bulk import complete: ${importedCount} added, ${mergedCount} merged.`);
      await onRefreshData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setCommittingImport(false);
    }
  };

  if (!canAccessLeads) {
    return (
      <EmptyState
        title="Lead CRM Access Restricted"
        description="Lead Management records are strictly restricted to authorized Super Admins, Branch Admins, and Admission Coordinators."
      />
    );
  }

  // Filter Bar Component (shared across Dashboard, All Leads, Reports)
  const renderFilterBar = () => (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Filter className="w-3.5 h-3.5 text-[#1677FF]" />
        Filters:
      </div>
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        aria-label="From date"
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
      />
      <span className="text-xs text-slate-400">to</span>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        aria-label="To date"
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
      />
      <select
        value={branchFilter}
        onChange={(e) => setBranchFilter(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
      >
        <option value="All">All Branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <select
        value={courseFilter}
        onChange={(e) => setCourseFilter(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs max-w-[200px]"
      >
        <option value="All">All Courses</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>
      <select
        value={sourceFilter}
        onChange={(e) => setSourceFilter(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
      >
        <option value="All">All Lead Sources</option>
        {distinctSources.map((src) => (
          <option key={src} value={src}>
            {src}
          </option>
        ))}
      </select>
      {(dateFrom || dateTo || branchFilter !== 'All' || courseFilter !== 'All' || sourceFilter !== 'All' || statusFilter !== 'All') && (
        <button
          onClick={() => {
            setDateFrom('');
            setDateTo('');
            setBranchFilter('All');
            setCourseFilter('All');
            setSourceFilter('All');
            setStatusFilter('All');
          }}
          className="text-xs text-[#1677FF] hover:underline font-medium cursor-pointer ml-auto"
        >
          Reset Filters
        </button>
      )}
    </div>
  );

  // Chart Datasets
  const statusChartData = LEAD_STATUS_OPTIONS.map((st) => ({
    name: st,
    count: filteredLeads.filter((l) => !l.archived && l.status === st).length,
  })).filter((d) => d.count > 0 || d.name === 'New Lead' || d.name === 'Converted to Student');

  const sourceChartData = useMemo(() => {
    const counts = new Map<string, number>();
    filteredLeads
      .filter((l) => !l.archived)
      .forEach((l) => {
        const s = l.leadSource || 'Unspecified';
        counts.set(s, (counts.get(s) || 0) + 1);
      });
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredLeads]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAheadStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const overdueFollowUps = useMemo(
    () =>
      scopedLeads.filter(
        (l) =>
          !l.archived &&
          l.nextFollowUpDate &&
          l.nextFollowUpDate < todayStr &&
          !['Converted to Student', 'Lost', 'Not Interested', 'Invalid Contact'].includes(l.status)
      ),
    [scopedLeads, todayStr]
  );

  const todayFollowUps = useMemo(
    () =>
      scopedLeads.filter(
        (l) =>
          !l.archived &&
          l.nextFollowUpDate === todayStr &&
          !['Converted to Student', 'Lost', 'Not Interested', 'Invalid Contact'].includes(l.status)
      ),
    [scopedLeads, todayStr]
  );

  const upcomingFollowUps = useMemo(
    () =>
      scopedLeads.filter(
        (l) =>
          !l.archived &&
          l.nextFollowUpDate &&
          l.nextFollowUpDate > todayStr &&
          l.nextFollowUpDate <= weekAheadStr &&
          !['Converted to Student', 'Lost', 'Not Interested', 'Invalid Contact'].includes(l.status)
      ),
    [scopedLeads, todayStr, weekAheadStr]
  );

  const activeLeadHistory = useMemo(
    () =>
      activeLead
        ? leadActivities
            .filter((a) => a.leadId === activeLead.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [activeLead, leadActivities]
  );

  const openNewLeadForm = () => {
    setEditingLead({
      fullName: '',
      mobile: '',
      whatsapp: '',
      email: '',
      city: '',
      district: '',
      interestedCourseId: courses[0]?.id || '',
      preferredBranchId: profile.branchId || branches[0]?.id || '',
      preferredStudyMode: 'Hybrid',
      academicYear: '2027',
      leadSource: 'Website Enquiry',
      status: 'New Lead',
      priority: 'Medium',
      assignedToUid: profile.uid,
      enquiryDate: todayStr,
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Banner */}
      {toast && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300'
          }`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 1: LEAD DASHBOARD */}
      {/* ============================================================ */}
      {mode === 'lead-dashboard' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#101D35] dark:text-white tracking-tight">
                Lead Management Dashboard
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Live admissions pipeline, follow-up velocity, and conversion tracking for TECHMAN COLLEGE.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canImportExport && (
                <button
                  onClick={() => onNavigateTab('lead-import')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-[#1677FF]" />
                  Bulk Import
                </button>
              )}
              <button
                onClick={openNewLeadForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Lead
              </button>
            </div>
          </div>

          {renderFilterBar()}

          {/* 9 Required Lead KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {[
              { label: 'Total Leads', value: kpis.total, filter: 'All', tone: 'text-[#101D35] dark:text-white' },
              { label: 'New Leads', value: kpis.newLeads, filter: 'New Lead', tone: 'text-[#1677FF]' },
              { label: 'Contacted Leads', value: kpis.contacted, filter: 'Contacted', tone: 'text-slate-700 dark:text-slate-200' },
              { label: 'Follow-up Required', value: kpis.followUpRequired, filter: 'Follow-up Required', tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Interested Leads', value: kpis.interested, filter: 'Interested', tone: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Application Started', value: kpis.appStarted, filter: 'Application Started', tone: 'text-sky-600 dark:text-sky-400' },
              { label: 'Converted Students', value: kpis.converted, filter: 'Converted to Student', tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Not Interested', value: kpis.notInterested, filter: 'Not Interested', tone: 'text-slate-500 dark:text-slate-400' },
              { label: 'Lost / Invalid Leads', value: kpis.lost, filter: 'Lost', tone: 'text-red-600 dark:text-red-400' },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setStatusFilter(item.filter);
                  onNavigateTab('lead-all');
                }}
                className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#1677FF] transition cursor-pointer"
              >
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {item.label}
                </div>
                <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${item.tone}`}>
                  {item.value}
                </div>
              </button>
            ))}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#101D35] text-white">
              <div className="text-[11px] font-medium text-blue-200">Conversion Rate</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums">
                {kpis.total > 0 ? `${Math.round((kpis.converted / kpis.total) * 100)}%` : '0%'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-300 font-mono tabular-nums">
                {overdueFollowUps.length} overdue follow-ups
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h2 className="text-sm font-bold text-[#101D35] dark:text-white mb-4">
                Lead Pipeline Stage Distribution
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData} margin={{ top: 8, right: 12, left: -16, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-18} textAnchor="end" interval={0} height={52} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Leads" fill="#1677FF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-[#101D35] dark:text-white">
                    Urgent Follow-ups
                  </h2>
                  <button
                    onClick={() => onNavigateTab('lead-calendar')}
                    className="text-xs text-[#1677FF] font-medium hover:underline cursor-pointer"
                  >
                    Open Calendar →
                  </button>
                </div>
                {overdueFollowUps.length === 0 && todayFollowUps.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    No overdue or due-today follow-ups. Schedule next follow-up dates inside All Leads.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                    {[...overdueFollowUps, ...todayFollowUps].slice(0, 6).map((l) => {
                      const isOverdue = (l.nextFollowUpDate || '') < todayStr;
                      return (
                        <button
                          key={l.id}
                          onClick={() => setActiveLead(l)}
                          className="w-full py-2.5 text-left flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {l.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {l.interestedCourseName || l.mobile}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded shrink-0 ${
                              isOverdue
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                            }`}
                          >
                            {l.nextFollowUpDate}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: ALL LEADS (TABLE, SEARCH, FILTERS, DRAWER, EXPORT) */}
      {/* ============================================================ */}
      {mode === 'lead-all' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#101D35] dark:text-white tracking-tight">
                All Leads ({filteredLeads.length})
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Search, qualify, log follow-ups, call or WhatsApp prospects, and convert qualified leads to students.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canImportExport && (
                <button
                  onClick={() =>
                    exportLeadsToSpreadsheet(
                      selectedIds.size > 0
                        ? filteredLeads.filter((l) => selectedIds.has(l.id))
                        : filteredLeads,
                      `TECHMAN_COLLEGE_Leads_${todayStr}`,
                      'xlsx'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export {selectedIds.size > 0 ? `Selected (${selectedIds.size})` : 'Excel'}
                </button>
              )}
              <button
                onClick={openNewLeadForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Lead
              </button>
            </div>
          </div>

          {renderFilterBar()}

          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, mobile, email, Lead ID, or course..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="All">All Statuses</option>
                {LEAD_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show Archived
              </label>

              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-700">
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="">Set Status ({selectedIds.size})...</option>
                    {LEAD_STATUS_OPTIONS.filter((s) => s !== 'Converted to Student').map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!bulkStatus}
                    onClick={() => void handleBulkStatusUpdate(Array.from(selectedIds), bulkStatus as LeadStatus)}
                    className="px-3 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Update
                  </button>
                  {canAssignStaff && (
                    <>
                      <select
                        value={bulkStaffUid}
                        onChange={(e) => setBulkStaffUid(e.target.value)}
                        className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      >
                        <option value="">Assign {selectedIds.size} to...</option>
                        {assignableStaff.map((s) => (
                          <option key={s.uid} value={s.uid}>
                            {s.displayName}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!bulkStaffUid}
                        onClick={() => void handleAssignLeads(Array.from(selectedIds), bulkStaffUid)}
                        className="px-3 py-2 rounded-lg bg-[#101D35] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Assign
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <EmptyState
              title="No Leads Match Current Filters"
              description="Add a prospective student enquiry manually or upload an Excel/CSV lead sheet using Bulk Import."
              actionLabel="Add First Lead"
              onAction={openNewLeadForm}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={
                            filteredLeads.length > 0 && selectedIds.size === filteredLeads.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="py-2.5 px-3 font-medium">Lead ID</th>
                      <th className="py-2.5 px-3 font-medium">Prospect &amp; Contact</th>
                      <th className="py-2.5 px-3 font-medium">Interested Course &amp; Branch</th>
                      <th className="py-2.5 px-3 font-medium">Source</th>
                      <th className="py-2.5 px-3 font-medium">Status</th>
                      <th className="py-2.5 px-3 font-medium">Assigned / Next Follow-up</th>
                      <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredLeads.map((lead) => {
                      const isOverdue =
                        Boolean(lead.nextFollowUpDate) &&
                        (lead.nextFollowUpDate || '') < todayStr &&
                        lead.status !== 'Converted to Student';
                      return (
                        <tr
                          key={lead.id}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                            lead.archived ? 'opacity-60' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(lead.id)}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(lead.id);
                                else next.delete(lead.id);
                                setSelectedIds(next);
                              }}
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            <button
                              onClick={() => setActiveLead(lead)}
                              className="text-[#1677FF] font-semibold hover:underline cursor-pointer"
                            >
                              {lead.leadId}
                            </button>
                            {lead.priority === 'Urgent' || lead.priority === 'High' ? (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                {lead.priority} Priority
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              onClick={() => setActiveLead(lead)}
                              className="font-semibold text-slate-900 dark:text-white hover:text-[#1677FF] cursor-pointer text-left"
                            >
                              {lead.fullName}
                            </button>
                            <div className="text-[11px] font-mono text-slate-500">
                              {lead.mobile}
                              {lead.email ? ` · ${lead.email}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-[220px]">
                            <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {lead.interestedCourseName || 'Unspecified Course'}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {lead.preferredBranchName || 'Branch TBD'}
                              {lead.preferredStudyMode ? ` · ${lead.preferredStudyMode}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            <div>{lead.leadSource || 'Direct'}</div>
                            {lead.campaignName && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                {lead.campaignName}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={lead.status}
                              onChange={(e) =>
                                void handleStatusChange(lead, e.target.value as LeadStatus)
                              }
                              aria-label={`Status for ${lead.fullName}`}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium cursor-pointer"
                            >
                              {LEAD_STATUS_OPTIONS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                            {lead.convertedStudentId && (
                              <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                                ID: {lead.convertedStudentId}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="text-slate-700 dark:text-slate-300">
                              {lead.assignedToName || 'Unassigned'}
                            </div>
                            {lead.nextFollowUpDate && (
                              <div
                                className={`text-[10px] font-mono ${
                                  isOverdue
                                    ? 'text-red-600 dark:text-red-400 font-semibold'
                                    : 'text-slate-500'
                                }`}
                              >
                                Next: {lead.nextFollowUpDate}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <a
                                href={`tel:${lead.mobile}`}
                                onClick={() => void handleLogOutreach(lead, 'call_logged')}
                                title="Call prospect"
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#1677FF]"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={formatWhatsAppUrl(
                                  lead.whatsapp || lead.mobile,
                                  lead.fullName,
                                  lead.interestedCourseName
                                )}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => void handleLogOutreach(lead, 'whatsapp_opened')}
                                title="WhatsApp click-to-chat"
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                              {lead.status !== 'Converted to Student' && (
                                <button
                                  onClick={() => openConvertModal(lead)}
                                  title="Convert to Student"
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  Convert
                                </button>
                              )}
                              <button
                                onClick={() => setEditingLead(lead)}
                                title="Edit Lead"
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* VIEW 3: BULK LEAD IMPORT WIZARD (.xlsx, .xls, .csv) */}
      {/* ============================================================ */}
      {mode === 'lead-import' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#101D35] dark:text-white tracking-tight">
                Bulk Lead Import (.xlsx · .xls · .csv)
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Upload spreadsheets with auto-column mapping, duplicate skip/merge detection, and row-level validation before saving.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadLeadSampleTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Excel Template (.xlsx)
              </button>
              <button
                onClick={downloadLeadCsvTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#1677FF]" />
                CSV Template (.csv)
              </button>
              <button
                onClick={() => {
                  exportLeadsToSpreadsheet(leads, `TECHMAN_Leads_PreImport_Backup_${todayStr}`, 'xlsx');
                  setBackupExported(true);
                  notify('success', 'Pre-import lead backup exported.');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#101D35] text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {backupExported ? 'Backup Exported ✓' : 'Export Pre-Import Backup'}
              </button>
            </div>
          </div>

          {!canImportExport ? (
            <EmptyState
              title="Bulk Import Requires Admin Permission"
              description="Only Super Admins and Administrators can run bulk lead imports."
            />
          ) : (
            <div className="space-y-6">
              {/* Stepper */}
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { id: 'upload', label: '1. Upload / Sheets' },
                  { id: 'map', label: '2. Map Columns' },
                  { id: 'preview', label: '3. Validate & Confirm' },
                  { id: 'done', label: '4. Import Summary' },
                ].map((s) => (
                  <div
                    key={s.id}
                    className={`px-3 py-2 rounded-lg border font-semibold text-center ${
                      importStep === s.id
                        ? 'bg-[#EAF1FC] border-[#1677FF] text-[#1677FF] dark:bg-blue-950/50 dark:text-blue-300'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    {s.label}
                  </div>
                ))}
              </div>

              {importStep === 'upload' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center space-y-4">
                    <Upload className="w-10 h-10 text-[#1677FF] mx-auto" />
                    <div>
                      <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                        Upload Excel (.xlsx, .xls) or CSV (.csv)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                        Only columns present in your file will be imported—missing fields are never invented. Every row is checked against existing leads and TECHMAN student records.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer">
                      <FileSpreadsheet className="w-4 h-4" />
                      Choose Spreadsheet File
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFileUpload(f);
                        }}
                      />
                    </label>
                  </div>

                  <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        <FileSpreadsheet className="w-4 h-4" />
                        Google Sheets Direct Import
                      </div>
                      <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                        Import From Published Google Sheet
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Paste a Google Sheets link (shared as view-only or published as CSV). Rows flow through the exact same column mapping, validation, and duplicate skip/merge preview.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <input
                        type="url"
                        value={googleSheetsUrl}
                        onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="button"
                        disabled={fetchingSheet || !googleSheetsUrl.trim()}
                        onClick={() => void handleGoogleSheetsImport()}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        {fetchingSheet ? 'Loading Google Sheet...' : 'Fetch & Map Google Sheet'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {importStep === 'map' && parsedSheet && (
                <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-[#101D35] dark:text-white">
                        Column Mapping — {parsedSheet.fileName}
                      </h2>
                      <p className="text-xs text-slate-500 font-mono">
                        {parsedSheet.rows.length} non-empty rows · {parsedSheet.headers.length} columns detected
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {parsedSheet.sheetNames.length > 1 && (
                        <select
                          value={parsedSheet.activeSheet}
                          onChange={(e) => handleSheetChange(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800"
                        >
                          {parsedSheet.sheetNames.map((sn) => (
                            <option key={sn} value={sn}>
                              Sheet: {sn}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => setImportStep('upload')}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                      >
                        Change File
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {LEAD_FIELD_DEFS.map((field) => (
                      <div
                        key={field.key}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                      >
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {field.label}
                          {field.required && <span className="text-red-600 ml-1">*</span>}
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                            ({field.group})
                          </span>
                        </label>
                        <select
                          value={colMapping[field.key] || ''}
                          onChange={(e) =>
                            setColMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        >
                          <option value="">— Do Not Import —</option>
                          {parsedSheet.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500">
                      Only mapped columns will be written. Unmapped fields stay blank.
                    </p>
                    <button
                      onClick={handleBuildPreview}
                      className="px-5 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Validate &amp; Preview Rows →
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && parsedSheet && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="text-[11px] text-slate-500">Total Rows</div>
                      <div className="text-xl font-bold font-mono tabular-nums mt-1">
                        {previewRows.length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30">
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300">Valid New Leads</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                        {previewRows.filter((r) => r.status === 'valid').length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30">
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">Duplicates Found</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-1">
                        {previewRows.filter((r) => r.status === 'duplicate').length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30">
                      <div className="text-[11px] text-red-700 dark:text-red-300">Rows With Errors</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-red-700 dark:text-red-300 mt-1">
                        {previewRows.filter((r) => r.status === 'error').length}
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Strategy Bar */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        Duplicate Handling (Existing Leads):
                      </span>
                      <button
                        onClick={() => handleToggleAllDuplicateActions('skip')}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                          globalDupAction === 'skip'
                            ? 'bg-[#101D35] text-white border-[#101D35]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        Skip Duplicates (Default)
                      </button>
                      <button
                        onClick={() => handleToggleAllDuplicateActions('merge')}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                          globalDupAction === 'merge'
                            ? 'bg-[#1677FF] text-white border-[#1677FF]'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        Merge Non-Empty Fields Into Existing
                      </button>
                    </div>
                    {previewRows.some((r) => r.status !== 'valid') && (
                      <button
                        onClick={() => exportLeadErrorReport(previewRows, parsedSheet.fileName)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-semibold hover:bg-red-50 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Error &amp; Duplicate Report
                      </button>
                    )}
                  </div>

                  {/* Preview Table */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] text-slate-500">
                          <tr>
                            <th className="py-2.5 px-3">Excel Row #</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Full Name</th>
                            <th className="py-2.5 px-3">Mobile / Email</th>
                            <th className="py-2.5 px-3">Course / Source</th>
                            <th className="py-2.5 px-3">Validation / Duplicate Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {previewRows.slice(0, 150).map((row) => (
                            <tr key={row.rowNumber}>
                              <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                                Row {row.rowNumber}
                              </td>
                              <td className="py-2 px-3">
                                {row.status === 'valid' && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                                    VALID
                                  </span>
                                )}
                                {row.status === 'duplicate' && (
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold text-[10px]">
                                    DUPLICATE
                                  </span>
                                )}
                                {row.status === 'error' && (
                                  <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-semibold text-[10px]">
                                    ERROR
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                                {row.payload.fullName || '—'}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px]">
                                {row.payload.mobile || '—'}
                                {row.payload.email ? ` · ${row.payload.email}` : ''}
                              </td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                                {row.payload.interestedCourseName || '—'} · {row.payload.leadSource || 'Import'}
                              </td>
                              <td className="py-2 px-3">
                                {row.status === 'error' && (
                                  <span className="text-red-600 dark:text-red-400">
                                    {row.errors.join('; ')}
                                  </span>
                                )}
                                {row.status === 'duplicate' && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-amber-700 dark:text-amber-300 text-[11px]">
                                      {row.duplicateReason}
                                    </span>
                                    {row.matchedLeadId && (
                                      <select
                                        value={row.duplicateAction}
                                        onChange={(e) => {
                                          const val = e.target.value as DuplicateAction;
                                          setPreviewRows((prev) =>
                                            prev.map((r) =>
                                              r.rowNumber === row.rowNumber
                                                ? { ...r, duplicateAction: val }
                                                : r
                                            )
                                          );
                                        }}
                                        className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] bg-white dark:bg-slate-900"
                                      >
                                        <option value="skip">Skip</option>
                                        <option value="merge">Merge</option>
                                      </select>
                                    )}
                                  </div>
                                )}
                                {row.status === 'valid' && (
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    Ready to import
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setImportStep('map')}
                      className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      ← Back to Column Mapping
                    </button>
                    <button
                      disabled={
                        committingImport ||
                        previewRows.every(
                          (r) =>
                            r.status === 'error' ||
                            (r.status === 'duplicate' && r.duplicateAction === 'skip')
                        )
                      }
                      onClick={() => void handleCommitLeadImport()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {committingImport ? 'Importing Leads...' : 'Confirm & Commit Lead Import'}
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'done' && importResult && (
                <div className="p-6 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-4">
                  <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-6 h-6" />
                    <h2 className="text-lg font-bold">Bulk Lead Import Completed</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">New Leads Added</div>
                      <div className="text-xl font-bold font-mono text-emerald-600">
                        {importResult.importedCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Existing Merged</div>
                      <div className="text-xl font-bold font-mono text-[#1677FF]">
                        {importResult.mergedCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Duplicates Skipped</div>
                      <div className="text-xl font-bold font-mono text-amber-600">
                        {importResult.skippedDuplicates}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Skipped Error Rows</div>
                      <div className="text-xl font-bold font-mono text-red-600">
                        {importResult.errorCount}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onNavigateTab('lead-all')}
                      className="px-4 py-2 rounded-lg bg-[#101D35] text-white text-xs font-semibold cursor-pointer"
                    >
                      View Imported Leads →
                    </button>
                    <button
                      onClick={() => {
                        setParsedSheet(null);
                        setPreviewRows([]);
                        setImportStep('upload');
                      }}
                      className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      Import Another File
                    </button>
                  </div>
                </div>
              )}

              {/* Import History Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#101D35] dark:text-white">
                    Lead Import History ({leadImportBatches.length})
                  </h3>
                </div>
                {leadImportBatches.length === 0 ? (
                  <p className="p-5 text-xs text-slate-500">No bulk lead imports recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                          <th className="py-2.5 px-4">File</th>
                          <th className="py-2.5 px-4 text-right">Rows</th>
                          <th className="py-2.5 px-4 text-right">Imported</th>
                          <th className="py-2.5 px-4 text-right">Merged</th>
                          <th className="py-2.5 px-4 text-right">Skipped</th>
                          <th className="py-2.5 px-4 text-right">Errors</th>
                          <th className="py-2.5 px-4">Imported By</th>
                          <th className="py-2.5 px-4">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {leadImportBatches.map((b) => (
                          <tr key={b.id}>
                            <td className="py-2.5 px-4 font-medium">{b.fileName}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums">{b.totalRows}</td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600 font-semibold">
                              {b.importedCount}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#1677FF]">
                              {b.mergedCount}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-600">
                              {b.skippedDuplicates}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">
                              {b.errorCount}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">{b.importedByEmail}</td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                              {b.createdAt.slice(0, 16).replace('T', ' ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* VIEW 4: FOLLOW-UP CALENDAR & REMINDERS */}
      {/* ============================================================ */}
      {mode === 'lead-calendar' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#101D35] dark:text-white tracking-tight">
                Follow-up Calendar &amp; Reminders
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Prioritized daily follow-up schedule with overdue alerts and direct call/WhatsApp outreach.
              </p>
            </div>
            <button
              onClick={openNewLeadForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1677FF] text-white text-xs font-semibold cursor-pointer self-start"
            >
              <Plus className="w-4 h-4" />
              New Lead
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[
              {
                title: 'Overdue Follow-ups',
                badge: 'text-red-700 bg-red-50 dark:bg-red-950/50 dark:text-red-300',
                icon: AlertTriangle,
                items: overdueFollowUps,
                emptyText: 'Zero overdue follow-ups. Great pace!',
              },
              {
                title: 'Due Today',
                badge: 'text-amber-700 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300',
                icon: Clock,
                items: todayFollowUps,
                emptyText: 'No follow-ups scheduled for today.',
              },
              {
                title: 'Upcoming (Next 7 Days)',
                badge: 'text-[#1677FF] bg-[#EAF1FC] dark:bg-blue-950/50 dark:text-blue-300',
                icon: Calendar,
                items: upcomingFollowUps,
                emptyText: 'No follow-ups scheduled in the next 7 days.',
              },
            ].map((bucket) => {
              const Icon = bucket.icon;
              return (
                <div
                  key={bucket.title}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
                >
                  <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#101D35] dark:text-white">
                      <Icon className="w-4 h-4 text-[#1677FF]" />
                      {bucket.title}
                    </div>
                    <span className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${bucket.badge}`}>
                      {bucket.items.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-1">
                    {bucket.items.length === 0 ? (
                      <p className="p-6 text-xs text-slate-500 text-center">{bucket.emptyText}</p>
                    ) : (
                      bucket.items.map((l) => (
                        <div key={l.id} className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <button
                                onClick={() => setActiveLead(l)}
                                className="text-xs font-bold text-slate-900 dark:text-white hover:text-[#1677FF] cursor-pointer text-left"
                              >
                                {l.fullName}
                              </button>
                              <div className="text-[11px] text-slate-500">
                                {l.interestedCourseName || 'Course TBD'} · {l.assignedToName || 'Unassigned'}
                              </div>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {l.nextFollowUpDate}
                            </span>
                          </div>
                          {l.followUpNotes && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                              {l.followUpNotes}
                            </p>
                          )}
                          <div className="flex items-center justify-between pt-1">
                            <LeadStatusTag status={l.status} />
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`tel:${l.mobile}`}
                                onClick={() => void handleLogOutreach(l, 'call_logged')}
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] inline-flex items-center gap-1 hover:text-[#1677FF]"
                              >
                                <Phone className="w-3 h-3" /> Call
                              </a>
                              <a
                                href={formatWhatsAppUrl(l.whatsapp || l.mobile, l.fullName, l.interestedCourseName)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => void handleLogOutreach(l, 'whatsapp_opened')}
                                className="px-2 py-1 rounded border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] inline-flex items-center gap-1"
                              >
                                <MessageCircle className="w-3 h-3" /> WhatsApp
                              </a>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* VIEW 5: LEAD ASSIGNMENTS (SINGLE & BULK STAFF DISTRIBUTION) */}
      {/* ============================================================ */}
      {mode === 'lead-assignments' && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-[#101D35] dark:text-white tracking-tight">
              Lead Assignments &amp; Staff Workload
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Distribute unassigned or branch leads to Admission Coordinators and monitor conversion performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignableStaff.map((staff) => {
              const staffLeads = scopedLeads.filter((l) => !l.archived && l.assignedToUid === staff.uid);
              const converted = staffLeads.filter((l) => l.status === 'Converted to Student').length;
              const pending = staffLeads.filter((l) =>
                ['New Lead', 'Contacted', 'Follow-up Required', 'Interested'].includes(l.status)
              ).length;
              return (
                <div
                  key={staff.uid}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {staff.displayName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {staff.role.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <Users className="w-4 h-4 text-[#1677FF]" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500">Assigned</div>
                      <div className="font-mono font-bold text-sm tabular-nums">{staffLeads.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Active</div>
                      <div className="font-mono font-bold text-sm tabular-nums text-amber-600">{pending}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Converted</div>
                      <div className="font-mono font-bold text-sm tabular-nums text-emerald-600">
                        {converted}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[#101D35] dark:text-white">
                Quick Staff Assignment Queue
              </h2>
              {canAssignStaff && selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={bulkStaffUid}
                    onChange={(e) => setBulkStaffUid(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="">Select Staff for {selectedIds.size} Leads...</option>
                    {assignableStaff.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.displayName} ({s.role.replace(/_/g, ' ')})
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!bulkStaffUid}
                    onClick={() => void handleAssignLeads(Array.from(selectedIds), bulkStaffUid)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Assign Selected
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                    <th className="py-2.5 px-3 w-8" />
                    <th className="py-2.5 px-3">Lead</th>
                    <th className="py-2.5 px-3">Course / Branch</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Assigned Staff Member</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {scopedLeads
                    .filter((l) => !l.archived)
                    .map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(l.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(l.id);
                              else next.delete(l.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{l.fullName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {l.leadId} · {l.mobile}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                          {l.interestedCourseName || 'TBD'} · {l.preferredBranchName || 'Branch TBD'}
                        </td>
                        <td className="py-2.5 px-3">
                          <LeadStatusTag status={l.status} />
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            disabled={!canAssignStaff}
                            value={l.assignedToUid || ''}
                            onChange={(e) => void handleAssignLeads([l.id], e.target.value)}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs disabled:opacity-60"
                          >
                            <option value="">Unassigned</option>
                            {assignableStaff.map((s) => (
                              <option key={s.uid} value={s.uid}>
                                {s.displayName}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* VIEW 6: LEAD REPORTS & ANALYTICS */}
      {/* ============================================================ */}
      {mode === 'lead-reports' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#101D35] dark:text-white tracking-tight">
                Lead Reports &amp; Attribution Analytics
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Evaluate campaign ROI, source performance, and conversion funnels across TECHMAN COLLEGE branches.
              </p>
            </div>
            {canImportExport && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    exportLeadsToSpreadsheet(filteredLeads, `TECHMAN_Lead_Report_${todayStr}`, 'xlsx')
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#101D35] text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel (.xlsx)
                </button>
                <button
                  onClick={() =>
                    exportLeadsToSpreadsheet(filteredLeads, `TECHMAN_Lead_Report_${todayStr}`, 'csv')
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            )}
          </div>

          {renderFilterBar()}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h2 className="text-sm font-bold text-[#101D35] dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#1677FF]" />
                Leads by Marketing Source
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceChartData.length > 0 ? sourceChartData : [{ name: 'No Data', value: 1 }]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={84}
                      paddingAngle={3}
                    >
                      {(sourceChartData.length > 0 ? sourceChartData : [{ name: 'No Data', value: 1 }]).map(
                        (_, i) => (
                          <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        )
                      )}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {sourceChartData.slice(0, 6).map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 truncate text-slate-600 dark:text-slate-300">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-mono font-bold tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h2 className="text-sm font-bold text-[#101D35] dark:text-white mb-4">
                Branch Performance &amp; Conversion Summary
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <th className="py-2 px-3">Branch</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-3 text-right">Interested</th>
                      <th className="py-2 px-3 text-right">Converted</th>
                      <th className="py-2 px-3 text-right">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {branches.map((b) => {
                      const bLeads = filteredLeads.filter(
                        (l) => !l.archived && (l.preferredBranchId === b.id || l.preferredBranchName === b.name)
                      );
                      const bInt = bLeads.filter((l) => l.status === 'Interested').length;
                      const bConv = bLeads.filter((l) => l.status === 'Converted to Student').length;
                      const rate = bLeads.length > 0 ? Math.round((bConv / bLeads.length) * 100) : 0;
                      return (
                        <tr key={b.id}>
                          <td className="py-2.5 px-3 font-semibold">{b.name}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{bLeads.length}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{bInt}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-600 font-semibold">
                            {bConv}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                            {rate}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* LEAD PROFILE & ACTIVITY TIMELINE DRAWER */}
      {/* ============================================================ */}
      {activeLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#1677FF]">{activeLead.leadId}</span>
                  <LeadStatusTag status={activeLead.status} />
                </div>
                <h2 className="text-lg font-bold text-[#101D35] dark:text-white mt-1">
                  {activeLead.fullName}
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  {activeLead.mobile} {activeLead.email ? `· ${activeLead.email}` : ''}
                </p>
              </div>
              <button
                onClick={() => setActiveLead(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Strip */}
            <div className="flex flex-wrap gap-2">
              <a
                href={`tel:${activeLead.mobile}`}
                onClick={() => void handleLogOutreach(activeLead, 'call_logged')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                <Phone className="w-3.5 h-3.5 text-[#1677FF]" /> Call
              </a>
              <a
                href={formatWhatsAppUrl(
                  activeLead.whatsapp || activeLead.mobile,
                  activeLead.fullName,
                  activeLead.interestedCourseName
                )}
                target="_blank"
                rel="noreferrer"
                onClick={() => void handleLogOutreach(activeLead, 'whatsapp_opened')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              {activeLead.status !== 'Converted to Student' && (
                <button
                  onClick={() => openConvertModal(activeLead)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Convert to Student
                </button>
              )}
              <button
                onClick={() => setEditingLead(activeLead)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => setConfirmDeleteLead(activeLead)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-xs font-semibold cursor-pointer ml-auto"
              >
                {canDeleteLead ? <Trash2 className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {canDeleteLead ? 'Archive / Delete' : 'Archive'}
              </button>
            </div>

            {/* Structured Profile Details */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Interested Course</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeLead.interestedCourseName || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Preferred Branch &amp; Mode</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeLead.preferredBranchName || '—'} · {activeLead.preferredStudyMode || 'TBD'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Qualification / Intake</span>
                <span>
                  {activeLead.educationQualification || '—'} ({activeLead.academicYear || '2027'})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Marketing Source</span>
                <span>
                  {activeLead.leadSource || '—'}
                  {activeLead.campaignName ? ` · ${activeLead.campaignName}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Location</span>
                <span>
                  {[activeLead.city, activeLead.district].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Assigned Staff &amp; Next Follow-up</span>
                <span className="font-mono">
                  {activeLead.assignedToName || 'Unassigned'} · {activeLead.nextFollowUpDate || 'Unscheduled'}
                </span>
              </div>
              {activeLead.convertedStudentId && (
                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 font-semibold">
                  Converted Student ID: <span className="font-mono">{activeLead.convertedStudentId}</span> ·
                  Application: <span className="font-mono">{activeLead.convertedApplicationId}</span>
                </div>
              )}
            </div>

            {/* Add Follow-up Note Form */}
            <form onSubmit={handleAddFollowUpNote} className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Log Follow-up Note &amp; Next Reminder
              </label>
              <textarea
                rows={3}
                required
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Summarize call outcome, fee questions, or next action..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Next Follow-up:</span>
                  <input
                    type="date"
                    value={newNoteNextDate}
                    onChange={(e) => setNewNoteNextDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </form>

            {/* Activity Timeline */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Activity History ({activeLeadHistory.length})
              </h3>
              {activeLeadHistory.length === 0 ? (
                <p className="text-xs text-slate-500">No recorded activities yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {activeLeadHistory.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {act.actorName} · {act.actionType.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono">
                          {act.createdAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700 dark:text-slate-300">{act.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ADD / EDIT LEAD MODAL */}
      {/* ============================================================ */}
      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveLead}
            className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 my-8 max-h-[90vh] overflow-y-auto space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-[#101D35] dark:text-white">
                {editingLead.id ? `Edit Lead — ${editingLead.leadId}` : 'Add New Prospective Student Lead'}
              </h2>
              <button type="button" onClick={() => setEditingLead(null)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editingLead.fullName || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={editingLead.mobile || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, mobile: e.target.value })}
                  placeholder="0771234567"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">WhatsApp Number</label>
                <input
                  type="text"
                  value={editingLead.whatsapp || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, whatsapp: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  value={editingLead.email || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">City</label>
                <input
                  type="text"
                  value={editingLead.city || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">District</label>
                <input
                  type="text"
                  value={editingLead.district || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, district: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {/* Academic Details */}
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Interested Course</label>
                <select
                  value={editingLead.interestedCourseId || ''}
                  onChange={(e) => {
                    const c = courses.find((x) => x.id === e.target.value);
                    setEditingLead({
                      ...editingLead,
                      interestedCourseId: e.target.value,
                      interestedCourseName: c?.name || '',
                      courseCategory: c?.category || '',
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="">Select Course...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Preferred Study Mode</label>
                <select
                  value={editingLead.preferredStudyMode || ''}
                  onChange={(e) =>
                    setEditingLead({
                      ...editingLead,
                      preferredStudyMode: e.target.value as 'Online' | 'Physical' | 'Hybrid' | '',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="">Not Specified</option>
                  <option value="Online">Online</option>
                  <option value="Physical">Physical</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Preferred Branch</label>
                <select
                  value={editingLead.preferredBranchId || ''}
                  onChange={(e) => {
                    const b = branches.find((x) => x.id === e.target.value);
                    setEditingLead({
                      ...editingLead,
                      preferredBranchId: e.target.value,
                      preferredBranchName: b?.name || '',
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="">Select Branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Education Qualification</label>
                <input
                  type="text"
                  value={editingLead.educationQualification || ''}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, educationQualification: e.target.value })
                  }
                  placeholder="G.C.E. A/L, O/L, Undergraduate..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Academic Year</label>
                <input
                  type="text"
                  value={editingLead.academicYear || '2027'}
                  onChange={(e) => setEditingLead({ ...editingLead, academicYear: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>

              {/* Marketing & Follow-up */}
              <div>
                <label className="block font-semibold mb-1">Lead Source</label>
                <select
                  value={editingLead.leadSource || 'Website Enquiry'}
                  onChange={(e) => setEditingLead({ ...editingLead, leadSource: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={editingLead.campaignName || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, campaignName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Referral Name</label>
                <input
                  type="text"
                  value={editingLead.referralName || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, referralName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Lead Status</label>
                <select
                  value={editingLead.status || 'New Lead'}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, status: e.target.value as LeadStatus })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {LEAD_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Priority</label>
                <select
                  value={editingLead.priority || 'Medium'}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, priority: e.target.value as LeadPriority })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {LEAD_PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Next Follow-up Date</label>
                <input
                  type="date"
                  value={editingLead.nextFollowUpDate || ''}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, nextFollowUpDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              {canAssignStaff && (
                <div>
                  <label className="block font-semibold mb-1">Assigned Staff</label>
                  <select
                    value={editingLead.assignedToUid || ''}
                    onChange={(e) => {
                      const s = assignableStaff.find((u) => u.uid === e.target.value);
                      setEditingLead({
                        ...editingLead,
                        assignedToUid: e.target.value,
                        assignedToName: s?.displayName || '',
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="">Unassigned</option>
                    {assignableStaff.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-3">
                <label className="block font-semibold mb-1">Follow-up Notes</label>
                <textarea
                  rows={2}
                  value={editingLead.followUpNotes || ''}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, followUpNotes: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingLead(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingLead}
                className="px-5 py-2 rounded-lg bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                {savingLead ? 'Saving...' : 'Save Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* LEAD-TO-STUDENT CONVERSION MODAL (PRE-FILLED ADMISSION + INVITE) */}
      {/* ============================================================ */}
      {convertingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmConversion}
            className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 my-8 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-[#101D35] dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                  Convert Lead to Student Admission
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-filled from <span className="font-mono font-semibold">{convertingLead.leadId}</span>. Creates a linked Admission Application and optional secure activation invite.
                </p>
              </div>
              <button type="button" onClick={() => setConvertingLead(null)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={convForm.fullName}
                  onChange={(e) => setConvForm({ ...convForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={convForm.email}
                  onChange={(e) => setConvForm({ ...convForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={convForm.phone}
                  onChange={(e) => setConvForm({ ...convForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Assigned Student ID *</label>
                <input
                  type="text"
                  required
                  value={convForm.studentId}
                  onChange={(e) => setConvForm({ ...convForm, studentId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-semibold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Course / Programme *</label>
                <select
                  required
                  value={convForm.courseId}
                  onChange={(e) => setConvForm({ ...convForm, courseId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Branch</label>
                <select
                  value={convForm.branchId}
                  onChange={(e) => setConvForm({ ...convForm, branchId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Study Mode</label>
                <select
                  value={convForm.preferredMode}
                  onChange={(e) =>
                    setConvForm({
                      ...convForm,
                      preferredMode: e.target.value as 'Online' | 'Physical' | 'Hybrid',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="Online">Online</option>
                  <option value="Physical">Physical</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={convForm.sendStudentInvite}
                    onChange={(e) =>
                      setConvForm({ ...convForm, sendStudentInvite: e.target.checked })
                    }
                  />
                  Issue secure Student Portal activation invitation (activates automatically on verified Google sign-in — no plaintext passwords generated)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConvertingLead(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={convertingBusy}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                {convertingBusy ? 'Converting...' : 'Confirm Lead Conversion'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Archive / Delete Confirmation Modal */}
      {confirmDeleteLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-[#101D35] dark:text-white">
              {confirmDeleteLead.archived ? 'Restore or Delete Lead?' : 'Archive or Delete Lead?'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Lead <span className="font-mono font-semibold">{confirmDeleteLead.leadId}</span> ({confirmDeleteLead.fullName}). Archiving preserves full CRM history safely; permanent deletion removes the lead document.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteLead(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleArchiveOrDelete(confirmDeleteLead, false)}
                className="px-3.5 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold cursor-pointer"
              >
                {confirmDeleteLead.archived ? 'Restore Lead' : 'Archive Lead'}
              </button>
              {canDeleteLead && (
                <button
                  onClick={() => void handleArchiveOrDelete(confirmDeleteLead, true)}
                  className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Delete Permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
