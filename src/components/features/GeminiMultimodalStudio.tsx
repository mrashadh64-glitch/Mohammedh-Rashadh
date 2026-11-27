import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Compass,
  Copy,
  ExternalLink,
  FileAudio,
  Globe,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { Course, UserProfile } from '../../types/lms';

interface GeminiMultimodalStudioProps {
  profile: UserProfile;
  courses: Course[];
}

type StudioTab = 'chat' | 'live-voice' | 'transcribe';
type GroundingMode = 'none' | 'googleSearch' | 'googleMaps';
type ChatModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
type ThinkingPref = 'LOW' | 'MEDIUM' | 'HIGH';

interface WebSource {
  uri: string;
  title: string;
}

interface MapSource {
  uri: string;
  title: string;
  placeId?: string;
  reviewSnippets: Array<{ uri?: string; title?: string; text?: string }>;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  groundingMode?: GroundingMode;
  webSources?: WebSource[];
  mapsSources?: MapSource[];
  timestamp: string;
}

interface VoiceTranscriptItem {
  id: string;
  speaker: 'you' | 'ai';
  text: string;
}

function downsampleTo16kPcmBase64(inputFloat32: Float32Array, inputSampleRate: number): string {
  const targetRate = 16000;
  let outputSamples: Float32Array;
  if (inputSampleRate === targetRate) {
    outputSamples = inputFloat32;
  } else {
    const ratio = inputSampleRate / targetRate;
    const newLength = Math.max(1, Math.round(inputFloat32.length / ratio));
    outputSamples = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.min(
        inputFloat32.length,
        Math.round((offsetResult + 1) * ratio)
      );
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
        accum += inputFloat32[i];
        count++;
      }
      outputSamples[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
  }

  const pcm16 = new Int16Array(outputSamples.length);
  for (let i = 0; i < outputSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, outputSamples[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodePcm24kBase64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(new ArrayBuffer(int16.length * 4));
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const GeminiMultimodalStudio: React.FC<GeminiMultimodalStudioProps> = ({
  profile,
  courses,
}) => {
  const { getBearerToken } = useAuth();
  const [activeTab, setActiveTab] = useState<StudioTab>('chat');

  // --- TAB 1: Multi-Turn Chat + Google Search & Maps Grounding ---
  const [persona, setPersona] = useState<string>('course_advisor');
  const [modelId, setModelId] = useState<ChatModelId>('gemini-4-hydrogen');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingPref>('MEDIUM');
  const [groundingMode, setGroundingMode] = useState<GroundingMode>('none');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // --- TAB 2: Live Real-Time Voice (gemini-3.8-live) ---
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<'Zephyr' | 'Puck' | 'Kore' | 'Fenrir'>('Zephyr');
  const [voicePersona, setVoicePersona] = useState<string>('ai_tutor');
  const [voiceTranscripts, setVoiceTranscripts] = useState<VoiceTranscriptItem[]>([]);
  const [liveQuickText, setLiveQuickText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // --- TAB 3: Audio Transcription (gemini-3.5-transcribe) ---
  const [transcribeLang, setTranscribeLang] = useState<'Auto' | 'English' | 'Tamil' | 'Sinhala'>(
    'Auto'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribeBusy, setTranscribeBusy] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, chatBusy]);

  const stopLiveVoice = () => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => undefined);
      captureCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current.clear();
    if (playbackCtxRef.current) {
      void playbackCtxRef.current.close().catch(() => undefined);
      playbackCtxRef.current = null;
    }
    nextStartTimeRef.current = 0;

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
        }
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    setVoiceStatus('idle');
  };

  useEffect(() => {
    return () => {
      stopLiveVoice();
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  // --- Chat Handler ---
  const handleLocateForMapsGrounding = () => {
    if (!navigator.geolocation) {
      setChatError('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setChatError(null);
      },
      () => {
        setChatError(
          'Location access denied. Google Maps Grounding will still answer using Sri Lanka context.'
        );
      },
      { timeout: 8000 }
    );
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: message,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...turns, userTurn];
    setTurns(nextHistory);
    setChatInput('');
    setChatBusy(true);
    setChatError(null);

    try {
      const token = await getBearerToken();
      if (!token) {
        throw new Error('Please sign in again to use the Gemini Multimodal Studio.');
      }
      const activeCourse = courses.find((c) => c.id === selectedCourseId);
      const courseContext = activeCourse
        ? `Selected Course: ${activeCourse.name} (${activeCourse.category}, ${activeCourse.domain}, ${activeCourse.isFree ? 'FREE' : activeCourse.feeConfigured ? `LKR ${activeCourse.courseFeeLkr}` : 'Fee pending admin setup'}, Mode: ${activeCourse.mode}).`
        : `User Role: ${profile.role}. Institute: TECHMAN AI INSTITUTE & ACADEMY (2027 Catalogue: ${courses.length} published courses).`;

      const resp = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          history: turns.slice(-14).map((t) => ({ role: t.role, text: t.text })),
          persona,
          courseContext,
          model: modelId,
          thinkingLevel,
          groundingMode,
          latLng: groundingMode === 'googleMaps' ? userCoords || { latitude: 6.9271, longitude: 79.8612 } : undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || `Gemini request failed (${resp.status})`);
      }

      setTurns((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: data.reply || '',
          modelUsed: data.modelUsed,
          groundingMode: data.groundingMode,
          webSources: Array.isArray(data.webSources) ? data.webSources : [],
          mapsSources: Array.isArray(data.mapsSources) ? data.mapsSources : [],
          timestamp: data.timestamp || new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to reach Gemini API.');
    } finally {
      setChatBusy(false);
    }
  };

  // --- Live Voice (gemini-3.8-live) Handler ---
  const play24kPcmChunk = (base64Pcm: string) => {
    let ctx = playbackCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 24000 });
      playbackCtxRef.current = ctx;
      nextStartTimeRef.current = ctx.currentTime;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const float32 = decodePcm24kBase64ToFloat32(base64Pcm);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const handleStartLiveVoice = async () => {
    if (voiceStatus === 'connecting' || voiceStatus === 'live') return;
    setVoiceError(null);
    setVoiceStatus('connecting');

    try {
      const token = await getBearerToken();
      if (!token) {
        throw new Error('Authentication required to start a Live Voice session.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const playbackCtx = new AudioContext({ sampleRate: 24000 });
      playbackCtxRef.current = playbackCtx;
      nextStartTimeRef.current = playbackCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            token,
            voiceName,
            persona: voicePersona,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            setVoiceStatus('live');
            const captureCtx = new AudioContext();
            captureCtxRef.current = captureCtx;
            const source = captureCtx.createMediaStreamSource(stream);
            const processor = captureCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              const b64 = downsampleTo16kPcmBase64(input, captureCtx.sampleRate);
              wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }));
            };

            source.connect(processor);
            processor.connect(captureCtx.destination);
            return;
          }

          if (msg.type === 'audio' && msg.data) {
            play24kPcmChunk(msg.data);
            return;
          }

          if (msg.type === 'interrupted') {
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {
                // ignore
              }
            });
            activeSourcesRef.current.clear();
            if (playbackCtxRef.current) {
              nextStartTimeRef.current = playbackCtxRef.current.currentTime;
            }
            return;
          }

          if (msg.type === 'input_transcript' && msg.text) {
            setVoiceTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'you') {
                return [...prev.slice(0, -1), { ...last, text: `${last.text}${msg.text}` }];
              }
              return [...prev, { id: `vt_u_${Date.now()}`, speaker: 'you', text: msg.text! }];
            });
            return;
          }

          if (msg.type === 'output_transcript' && msg.text) {
            setVoiceTranscripts((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'ai') {
                return [...prev.slice(0, -1), { ...last, text: `${last.text}${msg.text}` }];
              }
              return [...prev, { id: `vt_a_${Date.now()}`, speaker: 'ai', text: msg.text! }];
            });
            return;
          }

          if (msg.type === 'error') {
            setVoiceError(msg.message || 'Live voice session encountered an error.');
            stopLiveVoice();
            setVoiceStatus('error');
            return;
          }

          if (msg.type === 'closed') {
            stopLiveVoice();
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        setVoiceError('WebSocket connection to Live Voice failed.');
        stopLiveVoice();
        setVoiceStatus('error');
      };

      ws.onclose = () => {
        if (voiceStatus !== 'idle') {
          stopLiveVoice();
        }
      };
    } catch (err) {
      setVoiceError(
        err instanceof Error ? err.message : 'Unable to access microphone or start Live Voice.'
      );
      stopLiveVoice();
      setVoiceStatus('error');
    }
  };

  const handleSendLiveQuickText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveQuickText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    const text = liveQuickText.trim();
    wsRef.current.send(JSON.stringify({ type: 'text', text }));
    setVoiceTranscripts((prev) => [...prev, { id: `vt_t_${Date.now()}`, speaker: 'you', text }]);
    setLiveQuickText('');
  };

  // --- Audio Transcription (gemini-3.5-transcribe) ---
  const sendAudioBlobForTranscription = async (blob: Blob, mimeType: string) => {
    setTranscribeBusy(true);
    setTranscribeError(null);
    try {
      const token = await getBearerToken();
      if (!token) throw new Error('Please sign in again to transcribe audio.');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read audio recording.'));
        reader.readAsDataURL(blob);
      });

      const resp = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audioBase64: dataUrl,
          mimeType: mimeType || blob.type || 'audio/webm',
          language: transcribeLang,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || `Transcription failed (${resp.status})`);
      }
      setTranscriptText(data.transcript || '');
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Audio transcription failed.');
    } finally {
      setTranscribeBusy(false);
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }

    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      recordChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: preferredMime });
        if (blob.size > 0) {
          void sendAudioBlobForTranscription(blob, preferredMime);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setTranscribeError(
        err instanceof Error ? err.message : 'Microphone permission is required to record audio.'
      );
    }
  };

  const handleUploadAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void sendAudioBlobForTranscription(file, file.type || 'audio/mpeg');
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            TECHMAN AI Multimodal Lab
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
            Gemini Chat, Search &amp; Maps Grounding, Live Voice &amp; Audio Transcription
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Server-side Gemini integration for interactive study conversations, real-time spoken
            tutoring, live web &amp; Google Maps grounding, and lecture audio transcription.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'chat', label: 'AI Chat & Grounding', icon: MessageSquare },
              { id: 'live-voice', label: 'Live Voice', icon: AudioLines },
              { id: 'transcribe', label: 'Audio Transcribe', icon: FileAudio },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-[#1677FF] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: Multi-Turn Chat + Search Grounding + Maps Grounding */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Configuration Rail */}
          <div className="lg:col-span-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 h-fit">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Assistant Configuration
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Persona / Role
              </label>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              >
                <option value="course_advisor">2027 Course &amp; Admissions Advisor</option>
                <option value="ai_tutor">Academic AI Tutor</option>
                <option value="exam_coach">Exam &amp; Revision Coach</option>
                <option value="ceo_strategist">Institutional Strategy Advisor</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Course Context (Optional)
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              >
                <option value="">All 40 Published 2027 Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Grounding Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'Standard', icon: Sparkles },
                    { id: 'googleSearch', label: 'Web Search', icon: Globe },
                    { id: 'googleMaps', label: 'Maps', icon: MapPin },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = groundingMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setGroundingMode(m.id)}
                      className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-[#1677FF] text-[#1677FF] dark:text-sky-400'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {groundingMode === 'googleMaps' && (
                <button
                  type="button"
                  onClick={handleLocateForMapsGrounding}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-[#1677FF]" />
                  {userCoords
                    ? `GPS Locked (${userCoords.latitude.toFixed(3)}, ${userCoords.longitude.toFixed(3)})`
                    : 'Share My Location for Nearby Places'}
                </button>
              )}
            </div>

            {groundingMode === 'none' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Gemini Model
                  </label>
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value as ChatModelId)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="gemini-4-hydrogen">Gemini 4 Hydrogen</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                  </select>
                </div>

                {modelId === 'gemini-4-hydrogen' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Reasoning Depth
                    </label>
                    <select
                      value={thinkingLevel}
                      onChange={(e) => setThinkingLevel(e.target.value as ThinkingPref)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="LOW">Fast (Low)</option>
                      <option value="MEDIUM">Balanced (Medium)</option>
                      <option value="HIGH">Deep (High)</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setChatError(null);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Conversation
            </button>
          </div>

          {/* Multi-Turn Conversation Feed */}
          <div className="lg:col-span-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col h-[560px] overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {turns.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <Sparkles className="w-9 h-9 text-[#1677FF]" />
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    Start a Multi-Turn Gemini Conversation
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md">
                    Switch between Standard reasoning, live Google Search citations, or Google Maps
                    local grounding for Sri Lanka campuses and nearby study facilities.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    {[
                      'Compare the FREE Certificate in AI & Graphic Design pathways for beginners',
                      'What are the top AI Automation tools employers look for in 2027?',
                      'Find libraries and quiet study cafes near Colombo or Panadura',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setChatInput(prompt)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm space-y-2.5 ${
                        turn.role === 'user'
                          ? 'bg-[#1677FF] text-white'
                          : 'bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                        {turn.text}
                      </div>

                      {/* Google Search Grounding Sources */}
                      {turn.webSources && turn.webSources.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-[#1677FF]" />
                            Google Search Sources
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {turn.webSources.map((src) => (
                              <a
                                key={src.uri}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-[#1677FF] dark:text-sky-400 hover:underline"
                              >
                                <span className="max-w-[200px] truncate">{src.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Google Maps Grounding Places & Review Snippets */}
                      {turn.mapsSources && turn.mapsSources.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            Google Maps Verified Places
                          </div>
                          <div className="space-y-2">
                            {turn.mapsSources.map((m) => (
                              <div
                                key={m.uri}
                                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 space-y-1"
                              >
                                <a
                                  href={m.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-bold text-[#1677FF] dark:text-sky-400 hover:underline"
                                >
                                  {m.title}
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                                {m.reviewSnippets.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    {m.reviewSnippets.map((rs, idx) => (
                                      <div
                                        key={`${m.uri}_rs_${idx}`}
                                        className="text-[11px] text-slate-600 dark:text-slate-400"
                                      >
                                        {rs.text && <span>“{rs.text}” </span>}
                                        {rs.uri && (
                                          <a
                                            href={rs.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#1677FF] hover:underline font-semibold"
                                          >
                                            {rs.title || 'View review'}
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {turn.role === 'model' && turn.modelUsed && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {turn.modelUsed}
                          {turn.groundingMode && turn.groundingMode !== 'none'
                            ? ` · ${turn.groundingMode === 'googleSearch' ? 'Google Search Grounded' : 'Google Maps Grounded'}`
                            : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {chatBusy && (
                <div className="flex items-center gap-2 text-xs text-[#1677FF] font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Gemini response…
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {chatError && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {chatError}
              </div>
            )}

            <form
              onSubmit={handleSendChat}
              className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2 bg-slate-50 dark:bg-slate-950/60"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  groundingMode === 'googleSearch'
                    ? 'Ask anything requiring live web search…'
                    : groundingMode === 'googleMaps'
                      ? 'Ask about places, study hubs, or routes in Sri Lanka…'
                      : 'Ask a study question, course comparison, or exam prompt…'
                }
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1677FF]"
              />
              <button
                type="submit"
                disabled={chatBusy || !chatInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: Real-Time Voice Conversation (gemini-3.8-live) */}
      {activeTab === 'live-voice' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#1677FF]">
                Gemini 3.8 Live API · Real-Time Voice
              </div>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
                Two-Way Spoken Tutor &amp; Admissions Desk
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Streams 16 kHz microphone audio to Gemini Live over a server-side WebSocket bridge
                and plays back gapless 24 kHz voice responses with natural barge-in interruption.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Voice Persona
                </label>
                <select
                  value={voiceName}
                  disabled={voiceStatus === 'live' || voiceStatus === 'connecting'}
                  onChange={(e) =>
                    setVoiceName(e.target.value as 'Zephyr' | 'Puck' | 'Kore' | 'Fenrir')
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white disabled:opacity-60"
                >
                  <option value="Zephyr">Zephyr (Warm Mentor)</option>
                  <option value="Puck">Puck (Energetic)</option>
                  <option value="Kore">Kore (Clear Academic)</option>
                  <option value="Fenrir">Fenrir (Deep Studio)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Coaching Role
                </label>
                <select
                  value={voicePersona}
                  disabled={voiceStatus === 'live' || voiceStatus === 'connecting'}
                  onChange={(e) => setVoicePersona(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white disabled:opacity-60"
                >
                  <option value="ai_tutor">Academic AI Tutor</option>
                  <option value="course_advisor">2027 Course Advisor</option>
                  <option value="exam_coach">Oral Exam Coach</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex flex-col items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  voiceStatus === 'live'
                    ? 'bg-emerald-600 text-white'
                    : voiceStatus === 'connecting'
                      ? 'bg-amber-500 text-white'
                      : 'bg-[#1677FF] text-white'
                }`}
              >
                {voiceStatus === 'connecting' ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : voiceStatus === 'live' ? (
                  <Volume2 className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </div>

              <div className="text-center">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {voiceStatus === 'live'
                    ? 'Live Voice Session Active — Speak Naturally'
                    : voiceStatus === 'connecting'
                      ? 'Connecting Microphone & Gemini Live…'
                      : 'Ready for Real-Time Voice Conversation'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  16 kHz PCM input · 24 kHz PCM playback · Auto barge-in
                </div>
              </div>

              {voiceStatus === 'live' || voiceStatus === 'connecting' ? (
                <button
                  type="button"
                  onClick={stopLiveVoice}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  <MicOff className="w-4 h-4" />
                  End Live Session
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartLiveVoice}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  Start Live Voice Conversation
                </button>
              )}
            </div>

            {voiceError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300">
                {voiceError}
              </div>
            )}
          </div>

          {/* Live Transcript Panel */}
          <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col h-[480px] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Live Voice Transcript
              </div>
              <button
                type="button"
                onClick={() => setVoiceTranscripts([])}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {voiceTranscripts.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 text-center">
                  Start the session and speak into your microphone. Both your speech and Gemini’s
                  spoken replies will appear here in real time.
                </div>
              ) : (
                voiceTranscripts.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl px-4 py-2.5 text-xs sm:text-sm ${
                      item.speaker === 'you'
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-slate-900 dark:text-white ml-8'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 mr-8'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      {item.speaker === 'you' ? 'You' : `TECHMAN Live (${voiceName})`}
                    </div>
                    {item.text}
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={handleSendLiveQuickText}
              className="p-3.5 border-t border-slate-200 dark:border-slate-800 flex gap-2 bg-slate-50 dark:bg-slate-950/60"
            >
              <input
                type="text"
                value={liveQuickText}
                disabled={voiceStatus !== 'live'}
                onChange={(e) => setLiveQuickText(e.target.value)}
                placeholder={
                  voiceStatus === 'live'
                    ? 'Optionally type a follow-up while in live voice call…'
                    : 'Start Live Voice session to enable live conversation'
                }
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={voiceStatus !== 'live' || !liveQuickText.trim()}
                className="px-3.5 py-2 rounded-xl bg-[#1677FF] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: Audio Transcription (gemini-3.5-transcribe) */}
      {activeTab === 'transcribe' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#1677FF]">
                Gemini 3.5 Transcribe
              </div>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
                Lecture Notes &amp; Voice Memo Transcription
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Record directly from your microphone or upload an audio clip (WebM, MP3, WAV, M4A,
                OGG) to generate clean punctuated transcripts in English, Tamil, or Sinhala.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Transcription Language
              </label>
              <select
                value={transcribeLang}
                onChange={(e) =>
                  setTranscribeLang(e.target.value as 'Auto' | 'English' | 'Tamil' | 'Sinhala')
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              >
                <option value="Auto">Auto-Detect Language</option>
                <option value="English">English</option>
                <option value="Tamil">Tamil</option>
                <option value="Sinhala">Sinhala</option>
              </select>
            </div>

            <div className="flex flex-col gap-3 pt-1">
              <button
                type="button"
                onClick={handleToggleRecording}
                disabled={transcribeBusy}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50 ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#1677FF] hover:bg-blue-700'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4 fill-white" />
                    Stop Recording &amp; Transcribe ({recordSeconds}s)
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    Record Microphone Audio
                  </>
                )}
              </button>

              <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <Upload className="w-4 h-4 text-[#1677FF]" />
                Upload Audio File (.mp3, .wav, .m4a, .webm)
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleUploadAudioFile}
                  className="hidden"
                  disabled={transcribeBusy || isRecording}
                />
              </label>
            </div>

            {transcribeBusy && (
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1677FF]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Transcribing audio with gemini-3.5-transcribe…
              </div>
            )}

            {transcribeError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300">
                {transcribeError}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Transcribed Output
              </div>
              <div className="flex items-center gap-2">
                {transcriptText && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(transcriptText);
                        setCopiedTranscript(true);
                        window.setTimeout(() => setCopiedTranscript(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedTranscript ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChatInput(`Summarize and extract key study points from this transcript:\n\n${transcriptText}`);
                        setActiveTab('chat');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1677FF] text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Send to AI Chat
                    </button>
                  </>
                )}
              </div>
            </div>
            <textarea
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              rows={13}
              placeholder="Your transcribed lecture notes, meeting summaries, or voice questions will appear here…"
              className="flex-1 w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1677FF]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
