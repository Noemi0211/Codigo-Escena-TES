import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Loader2,
  Moon,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { RoadType, ScenarioSpec } from '../types/game';
import { sfx } from '../audio/sfx';

interface ScenarioGeneratorModalProps {
  onScenarioReady: (scenario: ScenarioSpec) => void;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  'Colisión frontal en carretera secundaria de noche, lluvia fuerte y un turismo con fuga de combustible',
  'Accidente múltiple en avenida urbana de doble sentido con paso de peatones: despliegue completo de Policía, Bomberos y 2 ambulancias',
  'Alcance dentro de la boca de un túnel en autovía de sentido único; somos el primer recurso en llegar',
  'Camión cisterna ADR volcado en autovía con fuga de vapor tóxico',
];

async function safeParseJsonResponse<T>(resp: Response): Promise<T & { error?: string }> {
  const raw = await resp.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Respuesta vacía del servidor (HTTP ${resp.status}).`);
  }
  if (trimmed.startsWith('<')) {
    throw new Error(
      'El servidor tardó demasiado en responder al generar el escenario. Inténtalo de nuevo.'
    );
  }
  try {
    return JSON.parse(trimmed) as T & { error?: string };
  } catch {
    throw new Error('La respuesta del servidor no tenía un formato JSON válido.');
  }
}

export const ScenarioGeneratorModal: React.FC<ScenarioGeneratorModalProps> = ({
  onScenarioReady,
  onClose,
}) => {
  const [prompt, setPrompt] = useState<string>('');
  const [roadType, setRoadType] = useState<'AUTO' | RoadType>('AUTO');
  const [trafficFlowLabel, setTrafficFlowLabel] = useState<
    'AUTO' | 'Sentido único' | 'Doble sentido'
  >('AUTO');
  const [arrivalPhase, setArrivalPhase] = useState<
    'AUTO' | 'FIRST_RESPONDER' | 'STANDARD_SECURED' | 'ADVANCED'
  >('AUTO');
  const [lighting, setLighting] = useState<'AUTO' | 'DAY' | 'NIGHT'>('AUTO');
  const [ambulanceCount, setAmbulanceCount] = useState<'AUTO' | '1' | '2'>('AUTO');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generated, setGenerated] = useState<ScenarioSpec | null>(null);

  const handleGenerate = async () => {
    if (loading) return;
    sfx.playClick();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMsg(
        'Sin cobertura: el generador docente con IA necesita conexión a internet para crear casos nuevos.'
      );
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 18000);

    try {
      const resp = await fetch('/api/scenarios/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: prompt.trim(),
          roadType,
          trafficFlowLabel,
          arrivalPhase,
          lighting,
          ambulanceCount,
        }),
      });

      const data = await safeParseJsonResponse<{ scenario: ScenarioSpec }>(resp);
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo generar el escenario.');
      }

      setGenerated(data.scenario);
      sfx.playConfirmLock();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg(
          'La generación superó el tiempo de espera. Pulsa de nuevo para reintentar.'
        );
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Error al generar el escenario con IA.'
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-amber-400">
              <Sparkles className="h-4 w-4 shrink-0" />
              Modo Docente · Generador de Escenarios
            </div>
            <h2 className="mt-0.5 font-display text-lg font-bold text-white sm:text-xl">
              Crear escenario a la carta con IA
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
              Describe una situación libre o fija parámetros y se generará la calzada, vehículos,
              riesgos y rúbrica de evaluación jugable.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar generador"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5 sm:px-6 sm:py-4">
          {/* Prompt input */}
          <div>
            <label
              htmlFor="teacher-scenario-prompt"
              className="mb-1.5 block text-xs font-semibold text-slate-200"
            >
              Descripción de la situación clínica y vial:
            </label>
            <textarea
              id="teacher-scenario-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej.: Colisión frontal en carretera secundaria de noche, lluvia fuerte y un turismo con fuga de combustible"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />

            <div className="mt-2">
              <p className="mb-1.5 text-[11px] font-medium text-slate-400">
                Ejemplos rápidos para probar:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setPrompt(ex);
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-left text-[11px] text-slate-300 transition-colors hover:border-amber-500/60 hover:text-white"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter selectors */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400" />
              Parámetros opcionales (en «Automático» la IA los deduce de tu texto)
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label
                  htmlFor="gen-road-type"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Tipo de vía / entorno
                </label>
                <select
                  id="gen-road-type"
                  value={roadType}
                  onChange={(e) => setRoadType(e.target.value as 'AUTO' | RoadType)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="AUTO">Automático según descripción</option>
                  <option value="HIGHWAY">Autovía / Autopista</option>
                  <option value="CONVENTIONAL">Carretera convencional / secundaria</option>
                  <option value="ADVERSE_WEATHER">Lluvia intensa / Niebla</option>
                  <option value="BLIND_CURVE">Curva sin visibilidad</option>
                  <option value="TUNNEL_PORTAL">Boca de túnel</option>
                  <option value="URBAN">Vía urbana (paso cebra y bocacalle)</option>
                  <option value="FIRE_HAZARD">Incendio / fuga combustible (≥ 75 m)</option>
                  <option value="ADR_HAZMAT">Mercancías peligrosas ADR (&gt; 500 m)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="gen-flow"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Sentido de circulación
                </label>
                <select
                  id="gen-flow"
                  value={trafficFlowLabel}
                  onChange={(e) =>
                    setTrafficFlowLabel(
                      e.target.value as 'AUTO' | 'Sentido único' | 'Doble sentido'
                    )
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="AUTO">Automático según descripción</option>
                  <option value="Sentido único">Sentido único</option>
                  <option value="Doble sentido">Doble sentido</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="gen-phase"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Fase / nivel de despliegue
                </label>
                <select
                  id="gen-phase"
                  value={arrivalPhase}
                  onChange={(e) =>
                    setArrivalPhase(
                      e.target.value as
                        | 'AUTO'
                        | 'FIRST_RESPONDER'
                        | 'STANDARD_SECURED'
                        | 'ADVANCED'
                    )
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="AUTO">Automático según descripción</option>
                  <option value="FIRST_RESPONDER">Primer interviniente (sin policía)</option>
                  <option value="STANDARD_SECURED">Estándar (Policía y Bomberos ya presentes)</option>
                  <option value="ADVANCED">Avanzado (colocar Policía + Bomberos + Amb.)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="gen-lighting"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Visibilidad / horario
                </label>
                <select
                  id="gen-lighting"
                  value={lighting}
                  onChange={(e) =>
                    setLighting(e.target.value as 'AUTO' | 'DAY' | 'NIGHT')
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="AUTO">Automático según descripción</option>
                  <option value="DAY">Diurno</option>
                  <option value="NIGHT">Nocturno</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="gen-ambs"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Ambulancias a posicionar
                </label>
                <select
                  id="gen-ambs"
                  value={ambulanceCount}
                  onChange={(e) =>
                    setAmbulanceCount(e.target.value as 'AUTO' | '1' | '2')
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="AUTO">Automático según descripción</option>
                  <option value="1">1 ambulancia</option>
                  <option value="2">2 ambulancias (separación ≥ 2,5 m)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Generate CTA */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGenerate()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Diseñando escenario jugable...
                </>
              ) : generated ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Generar otro escenario
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generar escenario jugable
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Generated Preview */}
          {generated && (
            <div className="rounded-xl border border-emerald-500/50 bg-slate-950/90 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Escenario generado y listo para simular
                </span>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-200">
                    {generated.roadLabel}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                    {generated.trafficFlowLabel} · {generated.speedLimitKmh} km/h
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-200">
                    {generated.isNight ? (
                      <>
                        <Moon className="h-3 w-3 text-sky-400" /> Nocturno
                      </>
                    ) : (
                      <>
                        <Sun className="h-3 w-3 text-amber-400" /> Diurno
                      </>
                    )}
                  </span>
                  {generated.minHardDistanceMeters && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-orange-300">
                      <Flame className="h-3 w-3" /> Mín. {generated.minHardDistanceMeters} m
                    </span>
                  )}
                  {generated.initialSecondAmbulance && (
                    <span className="rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-sky-300">
                      2 ambulancias
                    </span>
                  )}
                </div>
              </div>

              <h3 className="mt-2 font-display text-base font-bold text-white sm:text-lg">
                {generated.title}
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">
                {generated.briefing}
              </p>

              <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-100">
                <strong className="font-semibold text-amber-300">Objetivo táctico: </strong>
                {generated.keyObjective}
              </div>

              <div className="mt-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Criterios de evaluación generados
                </p>
                <ul className="mt-1 space-y-1">
                  {generated.protocolBullets.map((b, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-slate-300"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    sfx.playDispatch();
                    onScenarioReady(generated);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 sm:w-auto"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Jugar escenario ahora
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
