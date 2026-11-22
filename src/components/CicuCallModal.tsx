import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  Mic,
  Radio,
  RotateCcw,
  Send,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  CicuEvaluationReport,
  CicuTranscriptMessage,
  LcansLetterStatus,
  ScenarioSpec,
} from '../types/game';
import { sfx } from '../audio/sfx';

interface CicuCallModalProps {
  scenario: ScenarioSpec;
  allScenarios?: ScenarioSpec[];
  standalone?: boolean;
  placementSummary?: string;
  initialReport?: CicuEvaluationReport | null;
  initialTranscript?: CicuTranscriptMessage[];
  onScenarioChange?: (sc: ScenarioSpec) => void;
  onReportUpdate?: (
    scenarioId: string,
    report: CicuEvaluationReport,
    transcript: CicuTranscriptMessage[]
  ) => void;
  onClose: () => void;
}

const LCANS_META: Array<{
  key: 'L' | 'C' | 'A' | 'N' | 'S';
  title: string;
  desc: string;
  placeholder: string;
}> = [
  {
    key: 'L',
    title: 'Localización',
    desc: 'Confirmación o corrección del punto exacto del accidente y accesos seguros para unidades en camino.',
    placeholder: 'Ej. Autovía A-6 km 18 sentido salida, acceso seguro por arcén derecho sin cruzar mediana...',
  },
  {
    key: 'C',
    title: 'Condiciones',
    desc: 'Descripción del escenario y riesgos detectados (tráfico activo, incendio, vehículos inestables, MMPP/ADR...).',
    placeholder: 'Ej. Alcance entre dos turismos en carril derecho, tráfico activo, lluvia intensa y baja visibilidad...',
  },
  {
    key: 'A',
    title: 'Acciones',
    desc: 'Medidas ya en marcha en el lugar (señalización, luces V-1, protección, control de riesgos, atención inicial).',
    placeholder: 'Ej. Ambulancia estacionada en barrera a 25 m antes, V-1 y señalización activas, valoración inicial...',
  },
  {
    key: 'N',
    title: 'Necesidades',
    desc: 'Solicitud de recursos adicionales o especializados según la situación observada.',
    placeholder: 'Ej. Solicitamos Guardia Civil de Tráfico para regulación/corte y Bomberos por posible atrapamiento...',
  },
  {
    key: 'S',
    title: 'Seguridad',
    desc: 'Zonas seguras de acceso, emplazamiento de vehículos de emergencia, prevención de nuevos riesgos y coordinación in situ.',
    placeholder: 'Ej. Unidades entrantes permanezcan antes de la curva/arcén; coordinaremos in situ con mandos...',
  },
];

function nowLabel(): string {
  const d = new Date();
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function createInitialMessages(sc: ScenarioSpec): CicuTranscriptMessage[] {
  return [
    {
      id: 'cicu-init',
      sender: 'CICU',
      timestamp: nowLabel(),
      text: `CICU a la escucha. Unidad en aproximación/escena en ${sc.title} (${sc.roadLabel}). Adelante con la valoración inicial por método LCANS.`,
    },
  ];
}

function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Error al leer el audio grabado.'));
        return;
      }
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo procesar el audio grabado.'));
    reader.readAsDataURL(blob);
  });
}

async function safeParseJsonResponse(resp: Response): Promise<Record<string, unknown>> {
  const raw = await resp.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      `El servidor devolvió una respuesta vacía (código ${resp.status}). Reinténtalo en unos segundos.`
    );
  }
  if (trimmed.startsWith('<')) {
    throw new Error(
      `El servidor tardó demasiado o no pudo alcanzar la ruta de IA (HTTP ${resp.status}). Reintenta en unos segundos; si estás usando el enlace compartido, asegúrate de volver a publicar la última versión.`
    );
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Respuesta inesperada del servidor (HTTP ${resp.status}). Reinténtalo en unos segundos.`
    );
  }
}

export const CicuCallModal: React.FC<CicuCallModalProps> = ({
  scenario,
  allScenarios,
  standalone = false,
  placementSummary,
  initialReport = null,
  initialTranscript,
  onScenarioChange,
  onReportUpdate,
  onClose,
}) => {
  const [guideOpen, setGuideOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'FREE' | 'GUIDED'>('FREE');
  const [freeText, setFreeText] = useState('');
  const [guidedFields, setGuidedFields] = useState({
    L: '',
    C: '',
    A: '',
    N: '',
    S: '',
  });
  const [transcript, setTranscript] = useState<CicuTranscriptMessage[]>(() =>
    initialTranscript && initialTranscript.length > 0
      ? initialTranscript
      : createInitialMessages(scenario)
  );
  const [report, setReport] = useState<CicuEvaluationReport | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const micSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    setTranscript(
      initialTranscript && initialTranscript.length > 0
        ? initialTranscript
        : createInitialMessages(scenario)
    );
    setReport(initialReport);
    setErrorMsg(null);
    setFreeText('');
    setGuidedFields({ L: '', C: '', A: '', N: '', S: '' });
  }, [scenario.id]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, loading, transcribing]);

  const stopTracks = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      stopTracks();
    };
  }, []);

  const handleToggleRecording = async () => {
    if (transcribing || loading) return;

    if (isRecording) {
      sfx.playClick();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    if (!micSupported) {
      setErrorMsg(
        'Tu navegador no permite grabar audio desde esta vista. Puedes redactar el parte directamente en el cuadro de texto.'
      );
      return;
    }

    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickSupportedAudioMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stopTracks();
        setIsRecording(false);
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        audioChunksRef.current = [];

        if (blob.size < 400) {
          setErrorMsg(
            'La grabación fue demasiado corta o no captó sonido. Pulsa grabar, habla con claridad y vuelve a pulsar para detener.'
          );
          return;
        }

        setTranscribing(true);
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 25000);
        try {
          const audioBase64 = await blobToBase64(blob);
          const resp = await fetch('/api/cicu/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              audioBase64,
              mimeType: finalMime,
            }),
          });
          const data = await safeParseJsonResponse(resp);
          if (!resp.ok) {
            throw new Error(
              typeof data.error === 'string'
                ? data.error
                : 'No se pudo transcribir la grabación.'
            );
          }
          const spokenText = String(data?.transcript || '').trim();
          if (spokenText) {
            setInputMode('FREE');
            setFreeText((prev) => (prev ? `${prev.trim()} ${spokenText}` : spokenText));
            sfx.playSnap();
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setErrorMsg(
              'La transcripción tardó demasiado en responder. Tu micrófono funciona bien; reinténtalo o escribe el parte.'
            );
          } else {
            setErrorMsg(
              err instanceof Error
                ? err.message
                : 'Error al transcribir el audio grabado.'
            );
          }
        } finally {
          window.clearTimeout(timeoutId);
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      setRecordSeconds(0);
      setIsRecording(true);
      sfx.playClick();
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      stopTracks();
      setIsRecording(false);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMsg(
          'Permiso de micrófono denegado. Permite el acceso al micrófono en tu navegador (icono del candado junto a la URL) o escribe el parte manualmente.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setErrorMsg(
          'No se detectó ningún micrófono conectado en este dispositivo. Puedes escribir tu parte en el cuadro de texto.'
        );
      } else {
        setErrorMsg(
          'No se pudo iniciar el micrófono en este dispositivo o vista previa. Puedes escribir tu parte directamente.'
        );
      }
    }
  };

  const speakReply = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  };

  const composeTransmission = (): string => {
    if (inputMode === 'FREE') {
      return freeText.trim();
    }
    const parts = LCANS_META.map((m) => {
      const val = guidedFields[m.key].trim();
      return val ? `${m.key} (${m.title}): ${val}` : '';
    }).filter(Boolean);
    return parts.join(' | ');
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const message = composeTransmission();
    if (!message || loading || transcribing || isRecording) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMsg(
        'Sin cobertura: la emisora CICU con evaluación IA requiere conexión a internet.'
      );
      return;
    }

    sfx.playClick();
    setErrorMsg(null);
    const userMsg: CicuTranscriptMessage = {
      id: `tes-${Date.now()}`,
      sender: 'TES',
      text: message,
      timestamp: nowLabel(),
    };
    const nextTranscript = [...transcript, userMsg];
    setTranscript(nextTranscript);
    setLoading(true);

    const evalController = new AbortController();
    const evalTimeout = window.setTimeout(() => evalController.abort(), 30000);
    try {
      const resp = await fetch('/api/cicu/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: evalController.signal,
        body: JSON.stringify({
          scenario: {
            id: scenario.id,
            title: scenario.title,
            roadLabel: scenario.roadLabel,
            trafficFlowLabel: scenario.trafficFlowLabel,
            arrivalPhase: scenario.arrivalPhase,
            isAdvancedDeployment: scenario.isAdvancedDeployment,
            speedLimitKmh: scenario.speedLimitKmh,
            isNight: scenario.isNight,
            additionalHazard: scenario.additionalHazard,
            briefing: scenario.briefing,
            keyObjective: scenario.keyObjective,
            hasSecondAmbulance: Boolean(
              scenario.initialSecondAmbulance || scenario.otherAmbulancePos
            ),
          },
          placementSummary,
          history: transcript.map((m) => ({ sender: m.sender, text: m.text })),
          message,
        }),
      });

      const data = await safeParseJsonResponse(resp);
      if (!resp.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'No se pudo completar la comunicación con el CICU.'
        );
      }

      const evalData = data as unknown as CicuEvaluationReport;
      const cicuMsg: CicuTranscriptMessage = {
        id: `cicu-${Date.now()}`,
        sender: 'CICU',
        text: evalData.operatorReply,
        timestamp: nowLabel(),
      };
      const updatedTranscript = [...nextTranscript, cicuMsg];

      setTranscript(updatedTranscript);
      setReport(evalData);
      setFreeText('');
      if (inputMode === 'GUIDED') {
        setGuidedFields({ L: '', C: '', A: '', N: '', S: '' });
      }
      sfx.playResult(evalData.overallStatus === 'APROBADO' ? 'SEGURO' : 'MEJORABLE');
      onReportUpdate?.(scenario.id, evalData, updatedTranscript);
    } catch (err) {
      const errText =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'El operador del CICU tardó demasiado en responder. Pulsa Transmitir al CICU de nuevo.'
          : err instanceof Error
            ? err.message
            : 'Error de conexión con la emisora del CICU.';
      setErrorMsg(errText);
    } finally {
      window.clearTimeout(evalTimeout);
      setLoading(false);
    }
  };

  const handleResetCall = () => {
    sfx.playClick();
    const fresh = createInitialMessages(scenario);
    setTranscript(fresh);
    setReport(null);
    setErrorMsg(null);
    setFreeText('');
    setGuidedFields({ L: '', C: '', A: '', N: '', S: '' });
  };

  const getStatusBadgeStyle = (status?: LcansLetterStatus) => {
    if (status === 'COMPLETO') {
      return 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300';
    }
    if (status === 'PARCIAL') {
      return 'border-amber-500/60 bg-amber-500/20 text-amber-300';
    }
    if (status === 'OMITIDO') {
      return 'border-rose-500/60 bg-rose-500/20 text-rose-300';
    }
    return 'border-slate-700 bg-slate-800/80 text-slate-400';
  };

  const getStatusLabel = (status?: LcansLetterStatus) => {
    if (status === 'COMPLETO') return 'Completo';
    if (status === 'PARCIAL') return 'Parcial';
    if (status === 'OMITIDO') return 'Falta';
    return 'Pendiente';
  };

  const canSubmit =
    composeTransmission().length >= 5 && !loading && !transcribing && !isRecording;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-2 sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Top Radio Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/60 px-3.5 py-2.5 sm:px-5 sm:py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                EMISORA TETRA · CICU / 112
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                Método LCANS
              </span>
            </div>

            {standalone && allScenarios && onScenarioChange ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <label
                  htmlFor="cicu-scenario-select"
                  className="text-xs font-semibold text-slate-300"
                >
                  Escenario:
                </label>
                <select
                  id="cicu-scenario-select"
                  value={scenario.id}
                  onChange={(e) => {
                    const next = allScenarios.find((s) => s.id === e.target.value);
                    if (next) onScenarioChange(next);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none sm:max-w-md"
                >
                  {allScenarios.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.level === 'ADVANCED' ? `Avanzado ${sc.order}` : `Vía ${sc.order}`} ·{' '}
                      {sc.title} ({sc.roadLabel})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <h2 className="mt-1 truncate font-display text-base font-bold text-white sm:text-lg">
                {scenario.title} · <span className="text-slate-400">{scenario.roadLabel}</span>
              </h2>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                setGuideOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                guideOpen
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-amber-400" />
              {guideOpen ? 'Ocultar guía' : 'Guía LCANS'}
            </button>

            <button
              type="button"
              onClick={handleResetCall}
              title="Reiniciar llamada al CICU"
              className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                onClose();
              }}
              aria-label="Cerrar emisora CICU"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {/* Scenario Context Banner */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px] leading-relaxed text-slate-300 sm:text-xs">
            <strong className="font-semibold text-amber-300">Inspección visual de la escena: </strong>
            {scenario.briefing}
            {placementSummary && (
              <span className="mt-1 block text-[11px] text-slate-400">
                <strong className="text-slate-300">Tu despliegue actual: </strong>
                {placementSummary}
              </span>
            )}
          </div>

          {/* Collapsible LCANS Reference */}
          {guideOpen && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-slate-200">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-amber-300">
                  Estructura de comunicación LCANS
                </span>
                <span className="text-[11px] text-amber-200/80">
                  Breve, precisa y orientada a la toma de decisiones (sin datos irrelevantes)
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
                {LCANS_META.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-amber-500/25 bg-slate-950/70 p-2"
                  >
                    <div className="font-bold text-amber-300">
                      {item.key} · {item.title}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-300">
                <strong className="text-white">Coordinación in situ: </strong>
                Además de informar al CICU, es fundamental mantener comunicación fluida en el lugar entre los mandos de los distintos servicios para consensuar el plan y adaptarlo a la evolución del escenario.
              </p>
            </div>
          )}

          {/* Live LCANS Letter Progress Bar */}
          <div className="grid grid-cols-5 gap-1.5">
            {LCANS_META.map((item) => {
              const criterion = report?.lcans[item.key];
              return (
                <div
                  key={item.key}
                  title={criterion?.feedback || item.desc}
                  className={`rounded-lg border px-2 py-1.5 text-center transition-colors ${getStatusBadgeStyle(
                    criterion?.status
                  )}`}
                >
                  <div className="font-mono text-xs font-bold sm:text-sm">{item.key}</div>
                  <div className="truncate text-[10px] font-semibold">{item.title}</div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wide opacity-90">
                    {getStatusLabel(criterion?.status)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Radio Transcript */}
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
            {transcript.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'TES' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed sm:max-w-[85%] sm:text-sm ${
                    msg.sender === 'TES'
                      ? 'border border-amber-500/40 bg-amber-500/15 text-slate-100'
                      : 'border border-sky-500/35 bg-slate-900 text-slate-200'
                  }`}
                >
                  <div className="mb-0.5 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider">
                    <span
                      className={
                        msg.sender === 'TES' ? 'text-amber-300' : 'text-sky-400'
                      }
                    >
                      {msg.sender === 'TES' ? 'Unidad TES (Tú)' : 'Operador CICU'}
                    </span>
                    <span className="font-mono font-normal text-slate-500">
                      {msg.timestamp}
                    </span>
                  </div>
                  <p>{msg.text}</p>
                  {msg.sender === 'CICU' &&
                    typeof window !== 'undefined' &&
                    'speechSynthesis' in window && (
                      <button
                        type="button"
                        onClick={() => speakReply(msg.text)}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 hover:text-sky-300"
                      >
                        <Volume2 className="h-3 w-3" />
                        Escuchar audio
                      </button>
                    )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-sky-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                CICU recibiendo parte y analizando estructura LCANS...
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Detailed Evaluation Report from Latest Turn */}
          {report && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                report.overallStatus === 'APROBADO'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-display text-sm font-bold text-white sm:text-base">
                  {report.overallStatus === 'APROBADO' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-300">
                        Comunicación LCANS validada por el CICU
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span className="text-amber-300">
                        El CICU requiere completar datos del parte
                      </span>
                    </>
                  )}
                </div>
                <span className="font-mono text-sm font-bold text-white tabular-nums">
                  {report.score}/100
                </span>
              </div>

              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-2.5 py-1.5">
                  <span className="font-semibold text-slate-200">
                    Brevedad y precisión:{' '}
                  </span>
                  <span
                    className={
                      report.brevityStatus === 'ADECUADA'
                        ? 'font-semibold text-emerald-400'
                        : 'font-semibold text-amber-400'
                    }
                  >
                    {report.brevityStatus === 'ADECUADA' ? 'Adecuada' : 'Mejorable'}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    {report.brevityFeedback}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-2.5 py-1.5">
                  <span className="font-semibold text-slate-200">
                    Coordinación in situ:{' '}
                  </span>
                  <span
                    className={
                      report.inSituCoordinationMentioned
                        ? 'font-semibold text-emerald-400'
                        : 'font-semibold text-amber-400'
                    }
                  >
                    {report.inSituCoordinationMentioned ? 'Incluida' : 'Recordar mencionar'}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    {report.inSituFeedback}
                  </p>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {LCANS_META.map((m) => {
                  const item = report.lcans[m.key];
                  const dotColor =
                    item.status === 'COMPLETO'
                      ? 'text-emerald-400'
                      : item.status === 'PARCIAL'
                        ? 'text-amber-400'
                        : 'text-rose-400';
                  return (
                    <div
                      key={m.key}
                      className="rounded border border-slate-800/60 bg-slate-950/50 px-2.5 py-1 text-[11px]"
                    >
                      <strong className={`font-bold ${dotColor}`}>
                        {m.key} ({m.title}):
                      </strong>{' '}
                      <span className="text-slate-200">{item.feedback}</span>
                    </div>
                  );
                })}
              </div>

              {report.tips && report.tips.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-200">
                  {report.tips.map((tip, i) => (
                    <li key={i}>• {tip}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Transmission Input Area */}
          <form onSubmit={handleSend} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setInputMode('FREE')}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    inputMode === 'FREE'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Transmisión libre (Radio)
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('GUIDED')}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    inputMode === 'GUIDED'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Plantilla guiada L·C·A·N·S
                </button>
              </div>

              <button
                type="button"
                disabled={loading || transcribing}
                onClick={handleToggleRecording}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  isRecording
                    ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                    : transcribing
                      ? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
                      : 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
              >
                {transcribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />
                    Transcribiendo voz...
                  </>
                ) : isRecording ? (
                  <>
                    <Square className="h-3 w-3 fill-current text-rose-400" />
                    Detener y transcribir ({recordSeconds}s)
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-amber-400" />
                    Grabar llamada por voz
                  </>
                )}
              </button>
            </div>

            {inputMode === 'FREE' ? (
              <textarea
                rows={3}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                disabled={loading || transcribing}
                placeholder={
                  report?.overallStatus === 'FALTA_INFO'
                    ? 'Responde al operador del CICU completando los datos solicitados...'
                    : 'Graba tu voz o redacta tu llamada al CICU breve y precisa siguiendo L-C-A-N-S (Localización, Condiciones, Acciones, Necesidades, Seguridad)...'
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none sm:text-sm"
              />
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {LCANS_META.map((m) => (
                  <div
                    key={m.key}
                    className={m.key === 'S' ? 'sm:col-span-2' : undefined}
                  >
                    <label
                      htmlFor={`lcans-${m.key}`}
                      className="mb-0.5 block text-[11px] font-semibold text-amber-300"
                    >
                      {m.key} · {m.title}
                    </label>
                    <input
                      id={`lcans-${m.key}`}
                      type="text"
                      value={guidedFields[m.key]}
                      disabled={loading || transcribing}
                      onChange={(e) =>
                        setGuidedFields((prev) => ({
                          ...prev,
                          [m.key]: e.target.value,
                        }))
                      }
                      placeholder={m.placeholder}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  onClose();
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 sm:text-sm"
              >
                {report?.overallStatus === 'APROBADO'
                  ? 'Confirmar aviso y volver'
                  : 'Volver a la escena'}
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Transmitir al CICU
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
