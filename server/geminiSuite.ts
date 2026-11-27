import type express from 'express';
import type http from 'http';
import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

export interface VerifiedCaller {
  uid: string;
  email: string;
  token: string;
}

interface MountGeminiSuiteDeps {
  app: express.Application;
  httpServer: http.Server;
  getGenAI: () => GoogleGenAI;
  aiRateLimit: express.RequestHandler;
  requireVerifiedUser: (
    req: express.Request,
    res: express.Response
  ) => Promise<VerifiedCaller | null>;
  verifyRawToken: (token: string) => Promise<VerifiedCaller | null>;
}

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
]);

const ALLOWED_LIVE_VOICES = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir']);

const PERSONA_INSTRUCTIONS: Record<string, string> = {
  course_advisor:
    'You are the official TECHMAN AI INSTITUTE & ACADEMY (TECHMAN COLLEGE ONLINE, Est. 2021, Sri Lanka) 2027 Course & Admissions Advisor. Help students compare Certificate and Diploma pathways, explain study modes, and answer questions clearly without fabricating course fees, durations, or unverified accreditations.',
  ai_tutor:
    'You are the TECHMAN COLLEGE 24/7 Academic AI Tutor. Teach step-by-step with clear examples, concise takeaways, and practical exercises across IT, AI, Graphic Design, Digital Marketing, Business, Psychology, and Arabic & Islamic Studies. Never write plagiarizable graded assignments verbatim.',
  exam_coach:
    'You are the TECHMAN COLLEGE Exam & Revision Coach. Quiz the learner interactively, explain incorrect answers clearly, and highlight key exam concepts concisely.',
  ceo_strategist:
    'You are the TECHMAN COLLEGE Strategy & Curriculum Advisor. Provide structured institutional, marketing, and curriculum planning insights tailored to Sri Lanka and online learners.',
};

function sanitizeStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function normalizeAudioMime(raw: string): string {
  const base = raw.split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp3') return 'audio/mpeg';
  if (base === 'audio/x-wav') return 'audio/wav';
  if (base === 'audio/m4a' || base === 'audio/x-m4a') return 'audio/mp4';
  return base;
}

export function mountGeminiMultimodalSuite({
  app,
  httpServer,
  getGenAI,
  aiRateLimit,
  requireVerifiedUser,
  verifyRawToken,
}: MountGeminiSuiteDeps): void {
  // 1. Multi-Turn Gemini Chatbot + Google Search Grounding + Google Maps Grounding
  app.post('/api/gemini/chat', aiRateLimit, async (req, res) => {
    const caller = await requireVerifiedUser(req, res);
    if (!caller) return;

    try {
      const message = sanitizeStr(req.body?.message, 4000);
      if (!message) {
        return res.status(400).json({ error: 'Please enter a message to send to Gemini.' });
      }

      const personaKey = sanitizeStr(req.body?.persona, 40) || 'course_advisor';
      const customContext = sanitizeStr(req.body?.courseContext, 600);
      const requestedModel = sanitizeStr(req.body?.model, 48) || 'gemini-4-hydrogen';
      const groundingMode = ['none', 'googleSearch', 'googleMaps'].includes(req.body?.groundingMode)
        ? (req.body.groundingMode as 'none' | 'googleSearch' | 'googleMaps')
        : 'none';
      const thinkingPref = sanitizeStr(req.body?.thinkingLevel, 16).toUpperCase();

      // Strictly use active free-tier models (gemini-4-hydrogen & gemini-3.1-flash-lite).
      // Grounding modes always use gemini-4-hydrogen.
      const modelUsed =
        groundingMode !== 'none'
          ? 'gemini-4-hydrogen'
          : requestedModel === 'gemini-3.1-flash-lite'
            ? 'gemini-3.1-flash-lite'
            : 'gemini-4-hydrogen';

      const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-16) : [];
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const turn of rawHistory) {
        if (!turn || typeof turn !== 'object') continue;
        const role = (turn as { role?: string }).role === 'model' ? 'model' : 'user';
        const text = sanitizeStr((turn as { text?: string }).text, 3000);
        if (text) {
          contents.push({ role, parts: [{ text }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });

      const basePersona =
        PERSONA_INSTRUCTIONS[personaKey] || PERSONA_INSTRUCTIONS.course_advisor;
      const systemInstruction = customContext
        ? `${basePersona}\n\nActive Context:\n${customContext}`
        : basePersona;

      // Never pass deprecated sampling params (temperature/topP/topK/candidateCount) or thinkingBudget to Gemini 4
      const config: Record<string, unknown> = {
        systemInstruction,
      };

      if (groundingMode === 'googleSearch') {
        config.tools = [{ googleSearch: {} }];
      } else if (groundingMode === 'googleMaps') {
        // Never combine googleMaps with googleSearch or responseMimeType/responseSchema
        config.tools = [{ googleMaps: {} }];
        const lat = Number(req.body?.latLng?.latitude);
        const lng = Number(req.body?.latLng?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          config.toolConfig = {
            retrievalConfig: {
              latLng: { latitude: lat, longitude: lng },
            },
          };
        }
      } else if (modelUsed === 'gemini-4-hydrogen') {
        if (thinkingPref === 'LOW') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        } else if (thinkingPref === 'MEDIUM') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
        } else if (thinkingPref === 'HIGH') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        }
      }

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: modelUsed,
        contents,
        config,
      });

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata as
        | {
            groundingChunks?: Array<{
              web?: { uri?: string; title?: string };
              maps?: {
                uri?: string;
                title?: string;
                placeId?: string;
                placeAnswerSources?: {
                  reviewSnippets?: Array<{
                    uri?: string;
                    title?: string;
                    text?: string;
                    author?: string;
                  }>;
                };
              };
            }>;
          }
        | undefined;

      const webSources: Array<{ uri: string; title: string }> = [];
      const mapsSources: Array<{
        uri: string;
        title: string;
        placeId?: string;
        reviewSnippets: Array<{ uri?: string; title?: string; text?: string }>;
      }> = [];

      const seenWeb = new Set<string>();
      const seenMaps = new Set<string>();

      for (const chunk of groundingMetadata?.groundingChunks || []) {
        if (chunk.web?.uri && !seenWeb.has(chunk.web.uri)) {
          seenWeb.add(chunk.web.uri);
          webSources.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri,
          });
        }
        if (chunk.maps?.uri && !seenMaps.has(chunk.maps.uri)) {
          seenMaps.add(chunk.maps.uri);
          const snippets = Array.isArray(chunk.maps.placeAnswerSources?.reviewSnippets)
            ? chunk.maps.placeAnswerSources.reviewSnippets
                .slice(0, 3)
                .map((s) => ({ uri: s.uri, title: s.title, text: s.text }))
            : [];
          mapsSources.push({
            uri: chunk.maps.uri,
            title: chunk.maps.title || 'View on Google Maps',
            placeId: chunk.maps.placeId,
            reviewSnippets: snippets,
          });
        }
      }

      return res.json({
        reply: response.text || 'No response text was returned by Gemini.',
        modelUsed,
        groundingMode,
        webSources,
        mapsSources,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gemini chat request failed.';
      console.error('[Gemini Chat Error]', msg);
      const statusCode = /RESOURCE_EXHAUSTED|429/i.test(msg)
        ? 429
        : /PERMISSION_DENIED|API_KEY_INVALID|403/i.test(msg)
          ? 403
          : 500;
      return res.status(statusCode).json({ error: msg });
    }
  });

  // 2. Audio Transcription (gemini-3.5-transcribe)
  app.post('/api/gemini/transcribe', aiRateLimit, async (req, res) => {
    const caller = await requireVerifiedUser(req, res);
    if (!caller) return;

    try {
      const rawAudio = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64 : '';
      const rawMime = sanitizeStr(req.body?.mimeType, 80) || 'audio/webm';
      const language = ['Auto', 'English', 'Tamil', 'Sinhala'].includes(req.body?.language)
        ? String(req.body.language)
        : 'Auto';

      if (!rawAudio) {
        return res.status(400).json({ error: 'Audio recording data is required for transcription.' });
      }

      const cleanMime = normalizeAudioMime(rawMime);
      if (!ALLOWED_AUDIO_MIMES.has(cleanMime)) {
        return res.status(400).json({
          error: `Unsupported audio format (${cleanMime}). Use WebM, WAV, MP3, OGG, or M4A/MP4.`,
        });
      }

      const cleanedB64 = rawAudio.includes(',') ? rawAudio.split(',')[1] : rawAudio;
      if (cleanedB64.length > 18 * 1024 * 1024) {
        return res.status(400).json({ error: 'Audio clip is too large (max ~12 MB encoded).' });
      }

      const prompt =
        language === 'Auto'
          ? 'Transcribe this spoken audio accurately into clean, punctuated text. Preserve technical terms and course names accurately.'
          : `Transcribe this spoken audio accurately in ${language} into clean, punctuated text. Preserve technical terms and course names accurately.`;

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: cleanedB64,
              },
            },
            { text: prompt },
          ],
        },
      });

      return res.json({
        transcript: response.text || '',
        modelUsed: 'gemini-3.5-transcribe',
        language,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Audio transcription failed.';
      console.error('[Gemini Transcribe Error]', msg);
      return res.status(500).json({ error: msg });
    }
  });

  // 3. Real-Time Voice Conversations WebSocket Bridge (gemini-3.8-live)
  // Mounted with noServer: true on /api/live-voice so Vite dev middleware is completely unaffected.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (parsedUrl.pathname !== '/api/live-voice') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosing = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
        liveSession = null;
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          token?: string;
          voiceName?: string;
          persona?: string;
          data?: string;
          text?: string;
        };

        if (msg.type === 'start') {
          if (liveSession) return;
          const token = sanitizeStr(msg.token, 4096);
          const caller = await verifyRawToken(token);
          if (!caller) {
            safeSend({ type: 'error', message: 'Authentication required to start Live Voice.' });
            clientWs.close(4001, 'Unauthorized');
            return;
          }

          const voiceName = ALLOWED_LIVE_VOICES.has(String(msg.voiceName || ''))
            ? String(msg.voiceName)
            : 'Zephyr';
          const personaKey = sanitizeStr(msg.persona, 40) || 'ai_tutor';
          const personaText =
            PERSONA_INSTRUCTIONS[personaKey] || PERSONA_INSTRUCTIONS.ai_tutor;

          const ai = getGenAI();
          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: `${personaText} Keep spoken replies warm, concise, and natural for live voice conversation.`,
            },
            callbacks: {
              onopen: () => {
                safeSend({ type: 'ready', model: 'gemini-3.8-live', voiceName });
              },
              onmessage: (serverMsg) => {
                const sc = serverMsg.serverContent;
                if (!sc) return;
                if (sc.interrupted) {
                  safeSend({ type: 'interrupted' });
                }
                if (sc.inputTranscription?.text) {
                  safeSend({ type: 'input_transcript', text: sc.inputTranscription.text });
                }
                if (sc.outputTranscription?.text) {
                  safeSend({ type: 'output_transcript', text: sc.outputTranscription.text });
                }
                const parts = sc.modelTurn?.parts || [];
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    safeSend({ type: 'audio', data: part.inlineData.data });
                  }
                }
                if (sc.turnComplete) {
                  safeSend({ type: 'turn_complete' });
                }
              },
              onerror: (err: unknown) => {
                const message =
                  err instanceof Error
                    ? err.message
                    : typeof err === 'object' && err && 'message' in err
                      ? String((err as { message?: unknown }).message)
                      : 'Gemini Live session error.';
                safeSend({ type: 'error', message });
              },
              onclose: () => {
                safeSend({ type: 'closed' });
                liveSession = null;
              },
            },
          });
          return;
        }

        if (msg.type === 'audio' && liveSession && typeof msg.data === 'string' && msg.data.length > 0) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
          return;
        }

        if (msg.type === 'text' && liveSession && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text.trim().slice(0, 1000) }] }],
            turnComplete: true,
          });
          return;
        }

        if (msg.type === 'stop') {
          cleanup();
          safeSend({ type: 'closed' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Live voice message handling error.';
        safeSend({ type: 'error', message });
      }
    });

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });
}
