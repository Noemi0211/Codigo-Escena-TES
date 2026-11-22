import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Eye,
  HelpCircle,
  Loader2,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  AdaptiveSkillId,
  CicuEvaluationReport,
  EvaluationResult,
  MeritSessionState,
  ScenarioSpec,
  SocraticReplyFeedback,
  SocraticTutorAnalysis,
} from '../types/game';
import { AdaptiveSkillRanking } from '../engine/adaptiveTracker';
import { MERIT_REQUIRED_STREAK } from '../engine/meritMedals';

interface DebriefModalProps {
  scenario: ScenarioSpec;
  evaluation: EvaluationResult;
  cicuReport?: CicuEvaluationReport | null;
  tutorAnalysis?: SocraticTutorAnalysis | null;
  tutorLoading?: boolean;
  tutorError?: string | null;
  onRetryTutor?: () => void;
  adaptiveTopWeakness?: AdaptiveSkillRanking | null;
  onOpenAdaptivePractice?: (skillId?: AdaptiveSkillId) => void;
  meritSession?: MeritSessionState;
  meritLastOutcome?: {
    wasAdvanced: boolean;
    hadCriticalFailure: boolean;
    unlockedInSession: boolean;
  } | null;
  onFinishSession?: () => void;
  isLastScenario: boolean;
  isCampaign: boolean;
  onRetry: () => void;
  onNext: () => void;
  onBackToMenu: () => void;
  onInspectMap: () => void;
}

export const DebriefModal: React.FC<DebriefModalProps> = ({
  scenario,
  evaluation,
  cicuReport,
  tutorAnalysis,
  tutorLoading = false,
  tutorError = null,
  onRetryTutor,
  adaptiveTopWeakness = null,
  onOpenAdaptivePractice,
  meritSession,
  meritLastOutcome = null,
  onFinishSession,
  isLastScenario,
  isCampaign,
  onRetry,
  onNext,
  onBackToMenu,
  onInspectMap,
}) => {
  const [reflectionInput, setReflectionInput] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyFeedback, setReplyFeedback] = useState<SocraticReplyFeedback | null>(null);

  useEffect(() => {
    setReflectionInput('');
    setReplyError(null);
    setReplyFeedback(null);
  }, [scenario.id, tutorAnalysis?.socraticQuestion]);

  const handleSubmitReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorAnalysis || !reflectionInput.trim() || replyLoading) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setReplyError(
        'Sin cobertura: el tutor IA requiere conexión. Puedes pulsar «Reintentar escenario» para practicar sin conexión.'
      );
      return;
    }
    setReplyLoading(true);
    setReplyError(null);

    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 16000);
    try {
      const resp = await fetch('/api/tutor/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          scenarioTitle: scenario.title,
          socraticQuestion: tutorAnalysis.socraticQuestion,
          riskAnalysis: tutorAnalysis.riskAnalysis,
          studentAnswer: reflectionInput.trim(),
        }),
      });
      const raw = await resp.text();
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('<')) {
        throw new Error('El tutor no pudo responder en este momento.');
      }
      const data = JSON.parse(trimmed) as SocraticReplyFeedback & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo validar tu reflexión.');
      }
      setReplyFeedback(data);
    } catch (err) {
      setReplyError(
        err instanceof Error
          ? err.message
          : 'No se pudo comprobar tu respuesta. Puedes reintentar directamente.'
      );
    } finally {
      window.clearTimeout(tid);
      setReplyLoading(false);
    }
  };
  const gradeConfig = {
    SEGURO: {
      icon: CheckCircle2,
      textColor: 'text-emerald-400',
      label: 'Seguro',
    },
    MEJORABLE: {
      icon: AlertTriangle,
      textColor: 'text-amber-400',
      label: 'Mejorable',
    },
    RIESGO_CRITICO: {
      icon: AlertOctagon,
      textColor: 'text-rose-400',
      label: 'Riesgo crítico',
    },
  }[evaluation.grade];

  const GradeIcon = gradeConfig.icon;
  const hasErrors = evaluation.correctionSteps.length > 0;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-2.5 sm:p-4">
      <div className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3 sm:gap-4 sm:pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-400 sm:gap-2 sm:text-xs">
              <span>{scenario.title}</span>
              <span aria-hidden="true">·</span>
              <span>
                {scenario.isAdvancedDeployment
                  ? 'Nivel avanzado · Despliegue completo'
                  : scenario.arrivalPhase === 'FIRST_RESPONDER'
                    ? 'Primer interviniente'
                    : 'Estacionamiento estándar'}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <GradeIcon className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${gradeConfig.textColor}`} />
              <h3 className="font-display text-lg font-bold text-white sm:text-2xl">
                {evaluation.headline}
              </h3>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400">Puntuación</div>
            <div
              className={`font-mono text-3xl font-bold tabular-nums ${gradeConfig.textColor}`}
            >
              {evaluation.totalScore}
              <span className="text-base text-slate-500">/100</span>
            </div>
          </div>
        </div>

        {/* Merit Medal Progress Banner (Advanced Scenarios) */}
        {(meritLastOutcome?.wasAdvanced || (meritSession?.pendingMedals.length ?? 0) > 0) &&
          meritSession && (
            <div
              className={`mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${
                meritSession.pendingMedals.length > 0
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                  : meritLastOutcome?.hadCriticalFailure
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-sky-500/40 bg-sky-500/10 text-sky-100'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Award
                  className={`h-4 w-4 shrink-0 ${
                    meritSession.pendingMedals.length > 0
                      ? 'text-amber-300'
                      : meritLastOutcome?.hadCriticalFailure
                        ? 'text-rose-400'
                        : 'text-sky-300'
                  }`}
                />
                <span>
                  {meritSession.pendingMedals.length > 0 ? (
                    <>
                      <strong className="font-bold text-amber-300">
                        ¡Medalla al Mérito conseguida!
                      </strong>{' '}
                      Has superado {MERIT_REQUIRED_STREAK} escenarios avanzados seguidos sin
                      fallos críticos. Finaliza tu sesión para recibirla en el menú principal.
                    </>
                  ) : meritLastOutcome?.hadCriticalFailure ? (
                    <>
                      <strong className="font-semibold">Racha reiniciada (0/{MERIT_REQUIRED_STREAK}):</strong>{' '}
                      el fallo crítico interrumpe la serie hacia la Medalla al Mérito.
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold">Medalla al Mérito:</strong> llevas{' '}
                      <span className="font-mono font-bold text-white">
                        {meritSession.currentStreak}/{MERIT_REQUIRED_STREAK}
                      </span>{' '}
                      escenarios avanzados seguidos sin fallos críticos en esta sesión.
                    </>
                  )}
                </span>
              </div>

              {meritSession.pendingMedals.length > 0 && onFinishSession && (
                <button
                  type="button"
                  onClick={onFinishSession}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 whitespace-nowrap shrink-0"
                >
                  <Award className="h-3.5 w-3.5" />
                  Finalizar sesión y recoger Medalla
                </button>
              )}
            </div>
          )}

        {/* Socratic Tutor Personalized Analysis & Reflection Question */}
        <div className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-display text-base font-bold text-indigo-200 sm:text-lg">
              <Sparkles className="h-4 w-4 shrink-0 text-indigo-400" />
              <span>Tutor socrático · Feedback de tu intento</span>
            </div>
            {tutorError && onRetryTutor && (
              <button
                type="button"
                onClick={onRetryTutor}
                className="rounded-md border border-indigo-400/50 bg-indigo-500/20 px-2.5 py-1 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/30"
              >
                Reintentar análisis
              </button>
            )}
          </div>

          {tutorLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-200/90">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              Analizando tu distancia, ángulo, protecciones y riesgos reales del escenario...
            </div>
          )}

          {!tutorLoading && tutorError && (
            <p className="mt-1.5 text-xs text-rose-300">{tutorError}</p>
          )}

          {!tutorLoading && tutorAnalysis && (
            <div className="mt-2 space-y-2.5">
              <p className="text-xs leading-relaxed text-slate-100 sm:text-[13px]">
                {tutorAnalysis.riskAnalysis}
              </p>

              <p className="rounded-lg border border-indigo-500/25 bg-slate-950/50 px-3 py-1.5 text-[11px] font-medium text-indigo-200">
                <strong className="text-indigo-300">Idea clave: </strong>
                {tutorAnalysis.keyTakeaway}
              </p>

              <div className="rounded-lg border border-amber-500/35 bg-slate-950/75 p-2.5 sm:p-3">
                <div className="flex items-start gap-2 text-xs font-semibold text-amber-200">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>Antes de reintentar, reflexiona: {tutorAnalysis.socraticQuestion}</span>
                </div>

                {replyFeedback ? (
                  <div
                    className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${
                      replyFeedback.understood
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                    }`}
                  >
                    <strong className="font-semibold">Tutor: </strong>
                    {replyFeedback.tutorResponse}
                  </div>
                ) : (
                  <form onSubmit={handleSubmitReflection} className="mt-2 flex flex-col gap-1.5 sm:flex-row">
                    <input
                      type="text"
                      value={reflectionInput}
                      onChange={(e) => setReflectionInput(e.target.value)}
                      disabled={replyLoading}
                      placeholder="Escribe tu respuesta breve al tutor (opcional)..."
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={replyLoading || reflectionInput.trim().length < 3}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {replyLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Comprobar respuesta
                    </button>
                  </form>
                )}

                {replyError && (
                  <p className="mt-1.5 text-[11px] text-rose-300">{replyError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Adaptive Recurring-Weakness Suggestion */}
        {adaptiveTopWeakness &&
          onOpenAdaptivePractice &&
          (adaptiveTopWeakness.status === 'RECURRENT_WEAKNESS' ||
            evaluation.grade !== 'SEGURO') && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  <span>
                    {adaptiveTopWeakness.status === 'RECURRENT_WEAKNESS'
                      ? 'Fallo recurrente detectado'
                      : 'Criterio sugerido para reforzar'}
                    : {adaptiveTopWeakness.meta.shortLabel}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-300">
                  {adaptiveTopWeakness.stat.failures} fallo
                  {adaptiveTopWeakness.stat.failures === 1 ? '' : 's'} acumulados en este
                  criterio. Practica un caso nuevo centrado justo en este punto.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenAdaptivePractice(adaptiveTopWeakness.meta.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Reforzar este fallo
              </button>
            </div>
          )}

        {/* Specific Corrective Guidance when the student made mistakes */}
        {hasErrors && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-lg font-bold text-amber-300">
                ¿Cómo deberías haber estacionado aquí?
              </h4>
              <button
                type="button"
                onClick={onInspectMap}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
              >
                <Eye className="h-3.5 w-3.5" />
                Ver posición correcta en el mapa
              </button>
            </div>

            <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
              {evaluation.correctionExplanation}
            </p>

            <ol className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-100">
              {evaluation.correctionSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-mono font-bold text-amber-400 tabular-nums">
                    {idx + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 4-Criteria Evaluation Rubric */}
        <div className="mt-4 space-y-2">
          {evaluation.criteria.map((c) => {
            const statusText =
              c.status === 'SAFE'
                ? 'Correcto'
                : c.status === 'WARNING'
                  ? 'Mejorable'
                  : 'Crítico';
            const statusColor =
              c.status === 'SAFE'
                ? 'text-emerald-400'
                : c.status === 'WARNING'
                  ? 'text-amber-400'
                  : 'text-rose-400';

            return (
              <div
                key={c.id}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span>{c.label}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className={`text-xs font-semibold ${statusColor}`}>
                      {statusText}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-200 tabular-nums">
                    {c.score}/{c.maxScore}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {c.feedback}
                </p>
              </div>
            );
          })}
        </div>

        {/* CICU LCANS Communication Summary */}
        {cicuReport && (
          <div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-200">
                <Radio className="h-4 w-4 text-sky-400" />
                <span>Comunicación al CICU (Método LCANS)</span>
              </div>
              <span className="font-mono text-sm font-bold text-white tabular-nums">
                {cicuReport.score}/100 ·{' '}
                {cicuReport.overallStatus === 'APROBADO' ? 'Validado' : 'Incompleto'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5 text-center text-[11px]">
              {(['L', 'C', 'A', 'N', 'S'] as const).map((letter) => {
                const st = cicuReport.lcans[letter].status;
                const cls =
                  st === 'COMPLETO'
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : st === 'PARCIAL'
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                      : 'border-rose-500/50 bg-rose-500/15 text-rose-300';
                return (
                  <div key={letter} className={`rounded border px-1.5 py-1 font-semibold ${cls}`}>
                    {letter}: {st === 'COMPLETO' ? 'OK' : st === 'PARCIAL' ? 'Parcial' : 'Falta'}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-200">
              {cicuReport.operatorReply}
            </p>
          </div>
        )}

        {/* TES Protocol Reference Box */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-800/40 p-4">
          <h4 className="text-xs font-bold tracking-wide text-amber-400">
            Criterio del protocolo TES para esta vía
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-200">
            {scenario.protocolSummary}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {scenario.protocolBullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-800 pt-3.5 sm:mt-5 sm:gap-3 sm:pt-4">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 sm:w-auto sm:text-sm whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
            Reintentar escenario
          </button>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {!isCampaign && (
              <button
                type="button"
                onClick={onBackToMenu}
                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 sm:flex-initial sm:px-4 sm:text-sm whitespace-nowrap shrink-0"
              >
                Elegir otra vía
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 sm:flex-initial sm:px-5 sm:text-sm whitespace-nowrap shrink-0"
            >
              {isCampaign
                ? isLastScenario
                  ? 'Ver informe final'
                  : 'Siguiente aviso'
                : 'Siguiente escenario'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
