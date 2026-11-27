import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Globe,
  KeyRound,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { logAuditEvent, makeSafeId } from '../../lib/firestoreService';
import {
  ApifyRunRecord,
  Course,
  IntegrationConfig,
  IntegrationLog,
  IntegrationProviderId,
  PosterLanguage,
  UserProfile,
} from '../../types/lms';
import { DEFAULT_INTEGRATION_CONFIGS, INSTITUTE_INFO } from '../../data/catalogSeed';

interface IntegrationsCenterProps {
  profile: UserProfile;
  userEmail: string;
  isSuperAdmin: boolean;
  courses: Course[];
  integrations: IntegrationConfig[];
  integrationLogs: IntegrationLog[];
  apifyRuns: ApifyRunRecord[];
  onRefresh: () => Promise<void>;
}

interface EnvStatusResponse {
  checkedAt: string;
  providers: {
    openai: { envConfigured: boolean; envVarName: string };
    gemini_ai: { envConfigured: boolean; envVarName: string; model?: string };
    apify: { envConfigured: boolean; envVarName: string };
    firebase: { envConfigured: boolean; projectId?: string };
  };
}

export const IntegrationsCenter: React.FC<IntegrationsCenterProps> = ({
  profile,
  userEmail,
  isSuperAdmin,
  courses,
  integrations,
  integrationLogs,
  apifyRuns,
  onRefresh,
}) => {
  const [envStatus, setEnvStatus] = useState<EnvStatusResponse | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // OpenAI Settings
  const openaiConfig =
    integrations.find((i) => i.provider === 'openai') ||
    DEFAULT_INTEGRATION_CONFIGS.find((i) => i.provider === 'openai')!;
  const [openaiModel, setOpenaiModel] = useState(openaiConfig.defaultModel || 'gpt-4o-mini');
  const [openaiTemp, setOpenaiTemp] = useState(openaiConfig.temperature ?? 0.4);
  const [openaiMaxTokens, setOpenaiMaxTokens] = useState(openaiConfig.maxTokens ?? 1200);
  const [openaiBudget, setOpenaiBudget] = useState(openaiConfig.monthlyBudgetUsd ?? 25);

  // AI Content Studio Quick Test
  const [contentTask, setContentTask] = useState<
    'course_description' | 'syllabus_draft' | 'faq' | 'translation'
  >('course_description');
  const [contentCourseId, setContentCourseId] = useState(courses[0]?.id || '');
  const [contentLang, setContentLang] = useState<PosterLanguage>('English');
  const [contentOutput, setContentOutput] = useState('');
  const [contentProvider, setContentProvider] = useState('');
  const [contentBusy, setContentBusy] = useState(false);

  // Apify Research Runner
  const [apifyActorId, setApifyActorId] = useState('apify/website-content-crawler');
  const [apifyPurpose, setApifyPurpose] = useState('Public educational trend & curriculum benchmark');
  const [apifyInputJson, setApifyInputJson] = useState(
    '{\n  "startUrls": [{ "url": "https://techmemai.lk" }],\n  "maxCrawlPages": 3\n}'
  );
  const [apifyBusy, setApifyBusy] = useState(false);

  const mergedConfigs: IntegrationConfig[] = DEFAULT_INTEGRATION_CONFIGS.map((def) => {
    const saved = integrations.find((i) => i.provider === def.provider);
    return saved ? { ...def, ...saved } : def;
  });

  const fetchServerEnvStatus = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const resp = await fetch('/api/integrations/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        setEnvStatus(await resp.json());
      }
    } catch {
      // Ignore transient status fetch failure
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchServerEnvStatus();
    }
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center">
        <KeyRound className="w-10 h-10 text-rose-500 mx-auto mb-2" />
        <h3 className="font-bold text-slate-900">Super Admin Access Only</h3>
        <p className="text-xs text-slate-600 mt-1">
          Centralized AI &amp; external integrations can only be viewed and tested by authorized Super Admin Owners.
        </p>
      </div>
    );
  }

  const recordLog = async (
    provider: IntegrationProviderId,
    action: string,
    status: 'success' | 'error' | 'not_configured',
    summary: string,
    modelOrActor?: string,
    durationMs?: number
  ) => {
    const logId = makeSafeId('ILOG');
    await setDoc(doc(db, 'integrationLogs', logId), {
      provider,
      action: action.slice(0, 80),
      status,
      modelOrActor: (modelOrActor || '').slice(0, 120),
      durationMs: Math.max(0, Math.round(durationMs || 0)),
      summary: summary.slice(0, 500),
      actorUid: profile.uid,
      actorEmail: userEmail.slice(0, 160),
      institutionId: INSTITUTE_INFO.institutionId,
      createdAt: new Date().toISOString(),
    });
  };

  const saveIntegrationConfig = async (cfg: IntegrationConfig) => {
    const payload: Omit<IntegrationConfig, 'id'> = {
      provider: cfg.provider,
      label: cfg.label.slice(0, 120),
      category: cfg.category,
      enabled: cfg.enabled,
      defaultModel: (cfg.defaultModel || '').slice(0, 80),
      temperature: Number(cfg.temperature ?? 0.4),
      maxTokens: Number(cfg.maxTokens ?? 1200),
      monthlyBudgetUsd: Number(cfg.monthlyBudgetUsd ?? 25),
      allowedFeatures: (cfg.allowedFeatures || []).slice(0, 20),
      defaultActorId: (cfg.defaultActorId || '').slice(0, 120),
      connectionStatus: cfg.connectionStatus,
      lastTestedAt: (cfg.lastTestedAt || '').slice(0, 40),
      lastError: (cfg.lastError || '').slice(0, 400),
      notes: (cfg.notes || '').slice(0, 600),
      updatedByUid: profile.uid,
      institutionId: INSTITUTE_INFO.institutionId,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'integrations', cfg.provider), payload);
  };

  const handleTestProvider = async (cfg: IntegrationConfig) => {
    if (cfg.provider !== 'openai' && cfg.provider !== 'apify') return;
    setTestingId(cfg.provider);
    setBanner(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const endpoint =
        cfg.provider === 'openai'
          ? '/api/integrations/openai/test'
          : '/api/integrations/apify/test';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await resp.json();
      const status: IntegrationConfig['connectionStatus'] =
        data.status === 'connected'
          ? 'connected'
          : data.status === 'not_configured'
            ? 'not_configured'
            : 'error';
      const summary = data.message || data.error || `Status: ${status}`;

      await saveIntegrationConfig({
        ...cfg,
        enabled: status === 'connected',
        connectionStatus: status,
        lastTestedAt: new Date().toISOString(),
        lastError: status === 'error' ? summary : '',
      });
      await recordLog(
        cfg.provider,
        'connection_test',
        status === 'connected' ? 'success' : status === 'not_configured' ? 'not_configured' : 'error',
        summary,
        cfg.defaultModel || cfg.defaultActorId,
        data.durationMs
      );
      await onRefresh();
      await fetchServerEnvStatus();
      setBanner({
        type: status === 'connected' ? 'ok' : 'err',
        text: `${cfg.label}: ${summary}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `integrations/${cfg.provider}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveOpenAISettings = async () => {
    try {
      await saveIntegrationConfig({
        ...openaiConfig,
        defaultModel: openaiModel,
        temperature: openaiTemp,
        maxTokens: openaiMaxTokens,
        monthlyBudgetUsd: openaiBudget,
      });
      await logAuditEvent({
        actorUid: profile.uid,
        actorEmail: userEmail,
        actorRole: profile.role,
        action: 'INTEGRATION_CONFIG_UPDATED',
        targetType: 'integration',
        targetId: 'openai',
        details: `Model=${openaiModel}, temp=${openaiTemp}, budget=$${openaiBudget}`,
      });
      await onRefresh();
      setBanner({ type: 'ok', text: 'OpenAI model and budget settings saved.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'integrations/openai');
    }
  };

  const handleRunAIContentTool = async () => {
    const course = courses.find((c) => c.id === contentCourseId);
    if (!course) return;
    setContentBusy(true);
    setBanner(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/integrations/openai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          task: contentTask,
          provider: 'auto',
          language: contentLang,
          model: openaiModel,
          course,
          customPrompt: `Generate a structured ${contentTask.replace('_', ' ')} for ${course.name} in ${contentLang}.`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Content generation failed.');
      setContentOutput(data.text || '');
      setContentProvider(data.providerUsed || 'AI Engine');
      await recordLog(
        data.providerUsed?.startsWith('OpenAI') ? 'openai' : 'gemini_ai',
        `generate_${contentTask}`,
        'success',
        `Generated ${contentTask} for ${course.name} (${contentLang})`,
        data.providerUsed
      );
      await onRefresh();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to generate AI content.',
      });
    } finally {
      setContentBusy(false);
    }
  };

  const handleTriggerApifyActor = async () => {
    setApifyBusy(true);
    setBanner(null);
    try {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(apifyInputJson);
      } catch {
        throw new Error('Apify actor input must be valid JSON.');
      }
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/integrations/apify/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ actorId: apifyActorId, input: parsedInput }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Apify actor run failed.');

      const recordId = makeSafeId('APF');
      const now = new Date().toISOString();
      await setDoc(doc(db, 'apifyRuns', recordId), {
        actorId: apifyActorId.slice(0, 120),
        runId: String(data.runId || recordId).slice(0, 120),
        datasetId: String(data.datasetId || '').slice(0, 120),
        purpose: apifyPurpose.slice(0, 200),
        status: (['RUNNING', 'SUCCEEDED', 'FAILED', 'ABORTED', 'QUEUED'].includes(data.status)
          ? data.status
          : 'RUNNING') as ApifyRunRecord['status'],
        itemCount: 0,
        previewJson: '',
        startedByUid: profile.uid,
        startedByEmail: userEmail.slice(0, 160),
        institutionId: INSTITUTE_INFO.institutionId,
        createdAt: now,
        updatedAt: now,
      });
      await recordLog('apify', 'actor_run', 'success', `Started ${apifyActorId} (${data.runId})`, apifyActorId);
      await onRefresh();
      setBanner({ type: 'ok', text: `Apify actor run started (${data.runId}).` });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to start Apify actor.',
      });
    } finally {
      setApifyBusy(false);
    }
  };

  const handleRefreshApifyRun = async (run: ApifyRunRecord) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch(`/api/integrations/apify/runs/${encodeURIComponent(run.runId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Run lookup failed.');

      let previewJson = run.previewJson || '';
      let itemCount = run.itemCount || 0;
      if (data.status === 'SUCCEEDED' && (data.datasetId || run.datasetId)) {
        const dsId = data.datasetId || run.datasetId;
        const dsResp = await fetch(`/api/integrations/apify/datasets/${encodeURIComponent(dsId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (dsResp.ok) {
          const dsData = await dsResp.json();
          const items = Array.isArray(dsData.items) ? dsData.items : [];
          itemCount = items.length;
          previewJson = JSON.stringify(items.slice(0, 5), null, 2).slice(0, 11000);
        }
      }

      const updated: Omit<ApifyRunRecord, 'id'> = {
        actorId: run.actorId,
        runId: run.runId,
        datasetId: data.datasetId || run.datasetId || '',
        purpose: run.purpose,
        status: data.status || run.status,
        itemCount,
        previewJson,
        startedByUid: run.startedByUid,
        startedByEmail: run.startedByEmail,
        institutionId: run.institutionId,
        createdAt: run.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'apifyRuns', run.id), updated);
      await onRefresh();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to refresh Apify run.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-[#101D35] text-white p-5 border border-[#1677FF]/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#60A5FA]">
            <ShieldCheck className="w-4 h-4" />
            Super Admin Centralized AI &amp; Integrations Hub
          </div>
          <h2 className="text-xl font-extrabold mt-1">
            Secure Server-Side Integrations &amp; Automation Control
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            API secrets (<code className="text-blue-200">OPENAI_API_KEY</code>,{' '}
            <code className="text-blue-200">APIFY_API_TOKEN</code>,{' '}
            <code className="text-blue-200">GEMINI_API_KEY</code>) are read strictly from server environment secrets — never stored in the browser or Firestore.
          </p>
        </div>
        <button
          onClick={fetchServerEnvStatus}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 self-start md:self-center"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Server Env Status
        </button>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between gap-2 ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span>{banner.text}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 8 Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {mergedConfigs.map((cfg) => {
          const serverEnvKnown =
            cfg.provider === 'openai'
              ? envStatus?.providers.openai.envConfigured
              : cfg.provider === 'apify'
                ? envStatus?.providers.apify.envConfigured
                : cfg.provider === 'gemini_ai'
                  ? envStatus?.providers.gemini_ai.envConfigured
                  : cfg.provider === 'firebase'
                    ? envStatus?.providers.firebase.envConfigured
                    : undefined;

          // Honest status: never claim connected unless verified!
          const effectiveStatus =
            cfg.provider === 'openai' || cfg.provider === 'apify'
              ? serverEnvKnown === false
                ? 'not_configured'
                : cfg.connectionStatus
              : cfg.connectionStatus;

          const statusChip =
            effectiveStatus === 'connected'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : effectiveStatus === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-slate-100 text-slate-600 border-slate-200';

          return (
            <div
              key={cfg.provider}
              className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#1677FF]">
                    {cfg.category}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm">{cfg.label}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusChip}`}>
                  {effectiveStatus === 'connected'
                    ? 'Connected'
                    : effectiveStatus === 'error'
                      ? 'Error'
                      : 'Not Configured'}
                </span>
              </div>

              <p className="text-xs text-slate-600 flex-1">{cfg.notes}</p>

              {(cfg.provider === 'openai' || cfg.provider === 'apify') && (
                <div className="text-[11px] font-mono bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-slate-700">
                  Env: {cfg.provider === 'openai' ? 'OPENAI_API_KEY' : 'APIFY_API_TOKEN'} —{' '}
                  <span className={serverEnvKnown ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    {serverEnvKnown === undefined
                      ? 'checking...'
                      : serverEnvKnown
                        ? 'Present on Server'
                        : 'Missing in Server Secrets'}
                  </span>
                </div>
              )}

              {cfg.lastError && (
                <div className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg">
                  {cfg.lastError}
                </div>
              )}

              {(cfg.provider === 'openai' || cfg.provider === 'apify') && (
                <button
                  onClick={() => handleTestProvider(cfg)}
                  disabled={testingId === cfg.provider}
                  className="mt-1 px-3 py-1.5 rounded-xl bg-[#101D35] hover:bg-[#172A45] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Activity className="w-3.5 h-3.5" />
                  {testingId === cfg.provider ? 'Testing Live API...' : 'Test Live Connection'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* OpenAI Settings + AI Content Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#1677FF]" />
            OpenAI Model &amp; Governance Settings
          </h3>
          <p className="text-xs text-slate-500">
            Configure the server-side <code className="font-mono">OPENAI_API_KEY</code> in Settings → Secrets. When unset, AI Poster Copy &amp; Content Studio automatically route through verified Gemini (<code className="font-mono">gemini-4-hydrogen</code>).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Model</label>
              <select
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Fast / Cost-Effective)</option>
                <option value="gpt-4o">gpt-4o (Flagship)</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Budget Alert (USD)
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={openaiBudget}
                onChange={(e) => setOpenaiBudget(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Temperature ({openaiTemp})
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={openaiTemp}
                onChange={(e) => setOpenaiTemp(Number(e.target.value))}
                className="w-full mt-2"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Tokens</label>
              <input
                type="number"
                min={256}
                max={4096}
                value={openaiMaxTokens}
                onChange={(e) => setOpenaiMaxTokens(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
          </div>
          <button
            onClick={handleSaveOpenAISettings}
            className="px-4 py-2 rounded-xl bg-[#1677FF] text-white text-xs font-bold"
          >
            Save OpenAI Preferences
          </button>
        </div>

        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1677FF]" />
            AI Academic &amp; Marketing Content Studio (Drafts Only)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={contentTask}
              onChange={(e) =>
                setContentTask(
                  e.target.value as 'course_description' | 'syllabus_draft' | 'faq' | 'translation'
                )
              }
              className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
            >
              <option value="course_description">Course Description</option>
              <option value="syllabus_draft">Syllabus Outline Draft</option>
              <option value="faq">Course FAQ Generator</option>
              <option value="translation">Multi-Language Translation</option>
            </select>
            <select
              value={contentCourseId}
              onChange={(e) => setContentCourseId(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={contentLang}
              onChange={(e) => setContentLang(e.target.value as PosterLanguage)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
            >
              {(['English', 'Tamil', 'Sinhala', 'Arabic'] as PosterLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRunAIContentTool}
            disabled={contentBusy}
            className="px-4 py-2 rounded-xl bg-[#101D35] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5" />
            {contentBusy ? 'Generating Verified Draft...' : 'Generate Draft'}
          </button>
          {contentOutput && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="text-[11px] font-semibold text-[#1677FF]">
                Generated by {contentProvider} — Review before publishing
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 max-h-56 overflow-y-auto">
                {contentOutput}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Apify Public Research Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#1677FF]" />
            Apify Public Research Workflow Runner (No Auto-CRM Import)
          </h3>
          <p className="text-xs text-slate-500">
            Strictly limited to lawful public educational trend monitoring and website content auditing. Results are stored for manual review only.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Public Actor ID
              </label>
              <input
                value={apifyActorId}
                onChange={(e) => setApifyActorId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Research Purpose
              </label>
              <input
                value={apifyPurpose}
                onChange={(e) => setApifyPurpose(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Actor JSON Input
            </label>
            <textarea
              rows={4}
              value={apifyInputJson}
              onChange={(e) => setApifyInputJson(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
            />
          </div>
          <button
            onClick={handleTriggerApifyActor}
            disabled={apifyBusy}
            className="px-4 py-2 rounded-xl bg-[#101D35] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            {apifyBusy ? 'Starting Actor...' : 'Trigger Public Research Run'}
          </button>

          {apifyRuns.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-800">Recent Apify Runs</div>
              {apifyRuns.slice(0, 6).map((r) => (
                <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold">{r.actorId}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                        {r.status}
                      </span>
                      <button
                        onClick={() => handleRefreshApifyRun(r)}
                        className="text-[11px] text-[#1677FF] underline"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                  <div className="text-slate-500 mt-0.5">{r.purpose}</div>
                  {r.previewJson && (
                    <pre className="mt-2 p-2 rounded bg-white border text-[10px] max-h-32 overflow-auto">
                      {r.previewJson}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Integration Audit Logs */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#1677FF]" />
            Integration Execution &amp; Test Logs ({integrationLogs.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {integrationLogs.slice(0, 25).map((l) => (
              <div
                key={l.id}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    {l.provider.toUpperCase()} · {l.action}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      l.status === 'success'
                        ? 'bg-emerald-100 text-emerald-800'
                        : l.status === 'error'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {l.status}
                  </span>
                </div>
                <div className="text-slate-600 mt-0.5">{l.summary}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {l.actorEmail} · {new Date(l.createdAt).toLocaleString()}
                  {l.durationMs ? ` · ${l.durationMs}ms` : ''}
                </div>
              </div>
            ))}
            {integrationLogs.length === 0 && (
              <p className="text-xs text-slate-400">
                Click "Test Live Connection" on OpenAI or Apify to log verified test results.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
