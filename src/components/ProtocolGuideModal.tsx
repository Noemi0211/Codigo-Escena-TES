import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageCircleQuestion,
  Radio,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { ProtocolConsultMessage, ScenarioSpec } from '../types/game';
import { sfx } from '../audio/sfx';

interface ProtocolGuideModalProps {
  initialTab?: 'GUIDE' | 'CONSULTANT';
  messages: ProtocolConsultMessage[];
  onUpdateMessages: (next: ProtocolConsultMessage[]) => void;
  activeScenario?: ScenarioSpec | null;
  onClose: () => void;
}

interface ProtocolAskApiResponse {
  inScope: boolean;
  relatedTopic: string;
  answer: string;
  keyRule: string;
  followUpSuggestions: string[];
}

const STARTER_QUESTIONS = [
  '¿Qué diferencias hay entre primer interviniente y estacionamiento estándar?',
  '¿Cuándo y cómo se usan las luces V-1 y la señalización de peligro?',
  '¿Cuál es el criterio en túneles y curvas sin visibilidad?',
  '¿Qué distancias obligatorias hay en incendios y mercancías peligrosas (ADR)?',
  '¿Qué separación mínima debe haber entre dos ambulancias y con Bomberos?',
  '¿Qué debe incluir cada letra del método LCANS al llamar al CICU?',
];

async function safeParseJsonResponse<T>(resp: Response): Promise<T & { error?: string }> {
  const raw = await resp.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Respuesta vacía del servidor (HTTP ${resp.status}).`);
  }
  if (trimmed.startsWith('<')) {
    throw new Error('El servidor tardó demasiado en responder. Inténtalo de nuevo.');
  }
  try {
    return JSON.parse(trimmed) as T & { error?: string };
  } catch {
    throw new Error('Respuesta no válida del servidor.');
  }
}

export const ProtocolGuideModal: React.FC<ProtocolGuideModalProps> = ({
  initialTab = 'GUIDE',
  messages,
  onUpdateMessages,
  activeScenario = null,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'GUIDE' | 'CONSULTANT'>(initialTab);
  const [questionInput, setQuestionInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'CONSULTANT' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, activeTab]);

  const askQuestion = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || loading) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMsg(
        'Sin cobertura: el consultor IA requiere conexión. Puedes consultar el «Manual rápido» en la pestaña anterior sin necesidad de internet.'
      );
      return;
    }

    sfx.playClick();
    setErrorMsg(null);
    setQuestionInput('');

    const userMsg: ProtocolConsultMessage = {
      id: `u_${Date.now()}`,
      role: 'USER',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    onUpdateMessages(nextHistory);
    setLoading(true);

    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 16000);

    try {
      const resp = await fetch('/api/protocol/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: trimmed,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            text: m.text,
          })),
          scenarioContext: activeScenario
            ? {
                title: activeScenario.title,
                roadLabel: activeScenario.roadLabel,
                arrivalPhase: activeScenario.arrivalPhase,
                isAdvancedDeployment: activeScenario.isAdvancedDeployment,
                additionalHazard: activeScenario.additionalHazard,
              }
            : null,
        }),
      });

      const data = await safeParseJsonResponse<ProtocolAskApiResponse>(resp);
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo consultar el protocolo TES.');
      }

      const botMsg: ProtocolConsultMessage = {
        id: `c_${Date.now()}`,
        role: 'CONSULTANT',
        text: data.answer,
        keyRule: data.keyRule || undefined,
        relatedTopic: data.relatedTopic || 'Protocolo TES',
        inScope: data.inScope,
        followUpSuggestions: Array.isArray(data.followUpSuggestions)
          ? data.followUpSuggestions.slice(0, 2)
          : [],
      };
      onUpdateMessages([...nextHistory, botMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('La consulta tardó demasiado. Pulsa enviar de nuevo.');
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudo obtener respuesta del consultor de protocolo.'
        );
      }
    } finally {
      window.clearTimeout(tid);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header + Tabs */}
        <div className="border-b border-slate-800 px-4 pt-3 pb-2.5 sm:px-6 sm:pt-4 sm:pb-3">
          <div className="flex items-start justify-between gap-3 sm:items-center">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-white sm:text-2xl">
                Protocolo TES · Evacuación y Traslado de Pacientes
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
                Manual de estacionamiento seguro y consultor teórico rápido mientras practicas.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar manual y consultor"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white sm:p-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setActiveTab('GUIDE');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === 'GUIDE'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Manual rápido
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setActiveTab('CONSULTANT');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeTab === 'CONSULTANT'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-sky-200 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <MessageCircleQuestion className="h-3.5 w-3.5" />
                Consultor de dudas (IA)
              </button>
            </div>

            {activeTab === 'CONSULTANT' && messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  onUpdateMessages([]);
                  setErrorMsg(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" />
                Nueva consulta
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: Manual Visual */}
        {activeTab === 'GUIDE' && (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm text-slate-200 sm:space-y-4 sm:p-6">
              {/* Two main operational modes */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2 font-display text-lg font-bold text-amber-300">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    Estacionamiento como primer interviniente
                  </div>
                  <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-300">
                    <li>
                      <strong className="text-white">Dónde:</strong> Detener la ambulancia{' '}
                      <strong className="text-amber-300">antes del accidente</strong>, aproximadamente a{' '}
                      <strong className="text-white">25 metros</strong>.
                    </li>
                    <li>
                      <strong className="text-white">Orientación (30°–45°):</strong> Girar el vehículo con la{' '}
                      <strong className="text-white">parte delantera dirigida hacia la mediana o el centro de la vía</strong>. Así protegemos la zona trasera y lateral por donde transitamos.
                    </li>
                    <li>
                      <strong className="text-white">Actuación inicial imprescindible:</strong> Activar todas las señales luminosas, señalizar el peligro de forma visible, establecer visualmente la zona de riesgo y comunicar inmediatamente al Centro Coordinador.
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2 font-display text-lg font-bold text-emerald-300">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    Estacionamiento estándar (Policía y Bomberos)
                  </div>
                  <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-300">
                    <li>
                      <strong className="text-white">Bomberos:</strong> Estacionan habitualmente a{' '}
                      <strong className="text-white">5–10 m detrás</strong> del accidente formando un ángulo de unos <strong className="text-white">30°</strong>.
                    </li>
                    <li>
                      <strong className="text-white">Ambulancia:</strong> A unos{' '}
                      <strong className="text-emerald-300">10–15 m por delante</strong> del accidente, orientada con salida operativa. Si hay más de una ambulancia, dejar al menos{' '}
                      <strong className="text-white">2,5 m entre ellas</strong>.
                    </li>
                    <li>
                      <strong className="text-white">Policía:</strong> En vías de <strong className="text-white">doble sentido</strong> se sitúa antes y después del accidente; en vías de <strong className="text-white">sentido único</strong>, solo antes. Seguir siempre sus indicaciones sin bloquear maniobras.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Special situations and distances */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold text-white">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  Adaptación según escenario y riesgos adicionales
                </div>
                <div className="mt-3 grid gap-3 text-xs leading-relaxed text-slate-300 sm:grid-cols-3">
                  <div>
                    <p className="font-semibold text-amber-300">Meteorología adversa</p>
                    <p className="mt-0.5">
                      Lluvia, niebla o menor adherencia reducen la visibilidad y aumentan la distancia de frenado: aumentar la distancia de seguridad por encima de 25 m.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-300">Visibilidad limitada</p>
                    <p className="mt-0.5">
                      En curvas, cambios de rasante o túneles, estacionar siempre{' '}
                      <strong className="text-white">antes del punto conflictivo</strong>, respetando las distancias de seguridad.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-300">Riesgos adicionales</p>
                    <p className="mt-0.5">
                      Vehículo incendiado: mínimo <strong className="text-white">75 metros</strong>. Mercancías peligrosas: más de <strong className="text-white">500 metros</strong>. Advertir al Centro Coordinador y esperar instrucciones especializadas.
                    </p>
                  </div>
                </div>
              </div>

              {/* CICU Communication & LCANS Method */}
              <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold text-sky-200">
                  <Radio className="h-5 w-5 text-sky-400" />
                  Comunicación de la valoración al CICU (Método LCANS)
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  Tras la inspección visual, transmite la información de forma{' '}
                  <strong className="text-white">breve, precisa y orientada a la toma de decisiones</strong>, evitando interpretaciones personales o datos irrelevantes:
                </p>
                <ul className="mt-2.5 grid gap-2 text-xs leading-relaxed text-slate-200 sm:grid-cols-2">
                  <li>
                    <strong className="text-sky-300">L · Localización:</strong> Confirmación o corrección del punto exacto y accesos seguros para unidades en camino.
                  </li>
                  <li>
                    <strong className="text-sky-300">C · Condiciones:</strong> Descripción del escenario y riesgos detectados (tráfico activo, incendio, vehículos inestables o MMPP).
                  </li>
                  <li>
                    <strong className="text-sky-300">A · Acciones:</strong> Medidas ya iniciadas en el lugar (señalización, control de riesgos o atención inicial a víctimas).
                  </li>
                  <li>
                    <strong className="text-sky-300">N · Necesidades:</strong> Solicitud de recursos adicionales o especializados según la situación observada.
                  </li>
                  <li className="sm:col-span-2">
                    <strong className="text-sky-300">S · Seguridad:</strong> Zonas seguras de acceso, emplazamiento de vehículos y recomendaciones para evitar nuevos riesgos. Además, mantén{' '}
                    <strong className="text-white">comunicación fluida in situ entre mandos</strong> de los distintos servicios para consensuar y adaptar el plan.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setActiveTab('CONSULTANT');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/45 bg-sky-500/15 px-3.5 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
              >
                <MessageCircleQuestion className="h-4 w-4 text-sky-400" />
                ¿Tienes una duda? Pregunta al consultor TES
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 whitespace-nowrap shrink-0"
              >
                Entendido
              </button>
            </div>
          </>
        )}

        {/* TAB 2: Consultor rápido de protocolo TES */}
        {activeTab === 'CONSULTANT' && (
          <>
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 sm:px-6 sm:py-4"
            >
              {/* Scope info bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/35 bg-sky-500/10 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-sky-200">
                  <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
                  <span>
                    <strong className="font-semibold text-white">Consultor acotado al temario:</strong>{' '}
                    Evacuación y Traslado de Pacientes (estacionamiento, V-1, distancias, túneles/curvas y LCANS).
                  </span>
                </div>
                {activeScenario && (
                  <span className="rounded border border-slate-700 bg-slate-900/90 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                    Escenario activo: {activeScenario.title}
                  </span>
                )}
              </div>

              {/* Starter Questions when empty */}
              {messages.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold text-slate-300">
                    Preguntas frecuentes del módulo (toca una para consultarla al instante o escribe la tuya abajo):
                  </p>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    {STARTER_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={loading}
                        onClick={() => void askQuestion(q)}
                        className="rounded-lg border border-slate-700/90 bg-slate-900/90 px-3 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:border-sky-400/60 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Thread */}
              {messages.map((msg) => {
                if (msg.role === 'USER') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-amber-500/40 bg-amber-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100 sm:text-sm">
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                const outOfScope = msg.inScope === false;
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div
                      className={`max-w-[92%] rounded-2xl rounded-bl-sm border p-3.5 sm:p-4 ${
                        outOfScope
                          ? 'border-amber-500/40 bg-amber-500/10'
                          : 'border-slate-700 bg-slate-950/90'
                      }`}
                    >
                      {msg.relatedTopic && (
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                          {outOfScope ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
                          )}
                          <span className={outOfScope ? 'text-amber-300' : 'text-sky-300'}>
                            {msg.relatedTopic}
                          </span>
                        </div>
                      )}

                      <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200 sm:text-sm">
                        {msg.text}
                      </p>

                      {msg.keyRule && (
                        <p className="mt-2.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
                          <strong className="text-emerald-300">Regla operativa: </strong>
                          {msg.keyRule}
                        </p>
                      )}

                      {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {msg.followUpSuggestions.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              disabled={loading}
                              onClick={() => void askQuestion(sug)}
                              className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-sky-200 transition-colors hover:border-sky-400/60 hover:bg-slate-800 disabled:opacity-50"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-xs text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                  Consultando el protocolo TES...
                </div>
              )}

              {errorMsg && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200">
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Bottom Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askQuestion(questionInput);
              }}
              className="flex flex-col gap-2 border-t border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:px-6"
            >
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                disabled={loading}
                placeholder="Ej.: ¿Por qué se angula 30°–45° al llegar primero o qué hacer en un túnel?"
                className="w-full flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none sm:text-sm"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="submit"
                  disabled={loading || questionInput.trim().length < 3}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:text-sm"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Consultar
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 sm:text-sm"
                >
                  Volver
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
