import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { AdaptiveProfile, AdaptiveSkillId, ScenarioSpec } from '../types/game';
import {
  ADAPTIVE_SKILL_MAP,
  getAdaptiveRecommendations,
} from '../engine/adaptiveTracker';
import { sfx } from '../audio/sfx';

interface AdaptivePracticeModalProps {
  profile: AdaptiveProfile;
  initialSkillId?: AdaptiveSkillId | null;
  onStartGeneratedAdaptiveScenario: (scenario: ScenarioSpec) => void;
  onStartFallbackScenarioById: (scenarioId: string) => void;
  onResetProfile: () => void;
  onClose: () => void;
}

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

export const AdaptivePracticeModal: React.FC<AdaptivePracticeModalProps> = ({
  profile,
  initialSkillId = null,
  onStartGeneratedAdaptiveScenario,
  onStartFallbackScenarioById,
  onResetProfile,
  onClose,
}) => {
  const { ranked, topTarget, hasRecurringMistake } = useMemo(
    () => getAdaptiveRecommendations(profile),
    [profile]
  );

  const [selectedSkillId, setSelectedSkillId] = useState<AdaptiveSkillId>(
    initialSkillId ?? topTarget?.meta.id ?? 'ADR_FIRE_DISTANCE'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const selectedMeta = ADAPTIVE_SKILL_MAP[selectedSkillId];
  const selectedStat = profile.skills[selectedSkillId];
  const selectedRank = ranked.find((r) => r.meta.id === selectedSkillId);

  const handleGenerateAdaptive = async (skillId: AdaptiveSkillId) => {
    if (loading) return;
    sfx.playClick();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMsg(
        'Modo sin cobertura: la generación de casos nuevos con IA requiere internet, pero puedes abrir directamente la vía oficial recomendada abajo.'
      );
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 18000);

    try {
      const stat = profile.skills[skillId];
      const resp = await fetch('/api/scenarios/adaptive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          targetSkillId: skillId,
          failuresCount: stat?.failures ?? 0,
          recentIssues: stat?.lastIssueDetail
            ? [stat.lastIssueDetail, ...profile.recentIssues]
            : profile.recentIssues,
          variantSeed: (profile.totalAttempts || 0) + (stat?.attempts || 0),
        }),
      });

      const data = await safeParseJsonResponse<{ scenario: ScenarioSpec }>(resp);
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo generar el caso adaptativo.');
      }

      sfx.playDispatch();
      onStartGeneratedAdaptiveScenario(data.scenario);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg(
          'La generación tardó demasiado. Puedes reintentar o abrir la vía oficial recomendada.'
        );
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudo generar el escenario adaptativo con IA.'
        );
      }
    } finally {
      window.clearTimeout(tid);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-emerald-400">
              <TrendingUp className="h-4 w-4 shrink-0" />
              Práctica Adaptativa Personalizada
            </div>
            <h2 className="mt-0.5 font-display text-lg font-bold text-white sm:text-xl">
              Detección de errores recurrentes y refuerzo
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
              Analizamos tus {profile.totalAttempts}{' '}
              {profile.totalAttempts === 1 ? 'intento registrado' : 'intentos registrados'} para
              proponerte casos centrados en lo que más necesitas afianzar.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar práctica adaptativa"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5 sm:px-6 sm:py-4">
          {/* Diagnostic Banner */}
          {topTarget ? (
            <div
              className={`rounded-xl border p-3.5 sm:p-4 ${
                hasRecurringMistake
                  ? 'border-rose-500/45 bg-rose-500/10'
                  : 'border-amber-500/45 bg-amber-500/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                  {hasRecurringMistake ? (
                    <AlertOctagon className="h-4 w-4 text-rose-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  )}
                  <span className={hasRecurringMistake ? 'text-rose-300' : 'text-amber-300'}>
                    {hasRecurringMistake
                      ? 'Fallo recurrente prioritario detectado'
                      : 'Criterio recomendado para reforzar'}
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                  {topTarget.stat.failures} fallo{topTarget.stat.failures === 1 ? '' : 's'} en{' '}
                  {topTarget.stat.attempts} intento{topTarget.stat.attempts === 1 ? '' : 's'}
                </span>
              </div>

              <h3 className="mt-1.5 font-display text-base font-bold text-white sm:text-lg">
                {topTarget.meta.label}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                {topTarget.stat.lastIssueDetail || topTarget.meta.description}
              </p>
            </div>
          ) : profile.totalAttempts > 0 ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 sm:p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Sin fallos recurrentes activos
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                Has superado o corregido los criterios evaluados hasta ahora. Puedes elegir
                cualquier criterio abajo para seguir practicando casos nuevos de alta exigencia.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-3.5 sm:p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-300">
                <Target className="h-4 w-4" />
                Historial en blanco todavía
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                En cuanto completes tus primeros escenarios, detectaremos automáticamente qué
                criterios te cuestan más (ADR/incendios, ángulo 30°–45°, Bomberos o separación de
                2,5 m). También puedes entrenar cualquier criterio directamente ahora.
              </p>
            </div>
          )}

          {/* Selected Target Action Card */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/85 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Objetivo seleccionado para entrenar
              </span>
              {selectedRank && (
                <span className="text-[11px] font-semibold text-slate-400">
                  Evaluaciones: {selectedStat.attempts} · Fallos: {selectedStat.failures}
                </span>
              )}
            </div>

            <h4 className="mt-1 font-display text-base font-bold text-white">
              {selectedMeta.label}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {selectedMeta.description}
            </p>
            <p className="mt-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px] font-medium text-amber-200">
              <strong className="text-amber-400">Regla clave: </strong>
              {selectedMeta.protocolRule}
            </p>

            {errorMsg && (
              <p className="mt-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {errorMsg}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGenerateAdaptive(selectedSkillId)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando caso personalizado...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Practicar nuevo caso enfocado (IA)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  sfx.playDispatch();
                  onStartFallbackScenarioById(selectedMeta.fallbackScenarioId);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 sm:text-sm whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5 fill-current text-emerald-400" />
                Vía oficial relacionada
              </button>
            </div>
          </div>

          {/* 8 Skills Breakdown */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Mapa de criterios evaluados (toca uno para cambiar el enfoque)
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ranked.map(({ meta, stat, status }) => {
                const isSelected = meta.id === selectedSkillId;
                const badge =
                  status === 'RECURRENT_WEAKNESS'
                    ? { text: 'Fallo recurrente', cls: 'text-rose-300 border-rose-500/40 bg-rose-500/15' }
                    : status === 'NEEDS_PRACTICE'
                      ? { text: 'A reforzar', cls: 'text-amber-300 border-amber-500/40 bg-amber-500/15' }
                      : status === 'MASTERED'
                        ? { text: 'Dominado', cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15' }
                        : { text: 'Sin evaluar', cls: 'text-slate-400 border-slate-700 bg-slate-800/80' };

                return (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setSelectedSkillId(meta.id);
                      setErrorMsg(null);
                    }}
                    className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-white">{meta.shortLabel}</span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shrink-0 ${badge.cls}`}
                      >
                        {badge.text}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                      <span>
                        {stat.attempts > 0
                          ? `${stat.attempts - stat.failures}/${stat.attempts} correctos`
                          : 'Aún no practicado'}
                      </span>
                      {stat.failures > 0 && (
                        <span className="text-rose-300">
                          {stat.failures} fallo{stat.failures === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 sm:px-6">
          {profile.totalAttempts > 0 ? (
            confirmReset ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-300">¿Borrar métricas detectadas?</span>
                <button
                  type="button"
                  onClick={() => {
                    onResetProfile();
                    setConfirmReset(false);
                  }}
                  className="rounded-lg bg-rose-500 px-2.5 py-1 font-bold text-white hover:bg-rose-400"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reiniciar historial adaptativo
              </button>
            )
          ) : (
            <span className="text-[11px] text-slate-500">
              Las métricas se guardan automáticamente tras cada intento.
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
