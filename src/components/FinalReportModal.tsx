import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  Map,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import {
  AdaptiveProfile,
  AdaptiveSkillId,
  MeritMedal,
  MeritSessionState,
  PedagogicalFinalReport,
  ScenarioHistoryEntry,
} from '../types/game';
import { getAdaptiveRecommendations } from '../engine/adaptiveTracker';
import { MERIT_REQUIRED_STREAK } from '../engine/meritMedals';
import { sfx } from '../audio/sfx';

interface FinalReportModalProps {
  history: ScenarioHistoryEntry[];
  campaignLevel: 'BASIC' | 'ADVANCED';
  adaptiveProfile?: AdaptiveProfile;
  meritSession?: MeritSessionState;
  sessionAwardedMedals?: MeritMedal[];
  onContinueFifthAdvanced?: () => void;
  onOpenAdaptivePractice?: (skillId?: AdaptiveSkillId) => void;
  onRestartCampaign: () => void;
  onStartAdvanced?: () => void;
  onOpenScenarioSelect: () => void;
  onBackToTitle: () => void;
}

async function safeParseJsonResponse<T>(resp: Response): Promise<T & { error?: string }> {
  const raw = await resp.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Respuesta vacía del servidor (HTTP ${resp.status}).`);
  }
  if (trimmed.startsWith('<')) {
    throw new Error('El servidor tardó demasiado en responder. Pulsa regenerar.');
  }
  try {
    return JSON.parse(trimmed) as T & { error?: string };
  } catch {
    throw new Error('Respuesta no válida del servidor.');
  }
}

export const FinalReportModal: React.FC<FinalReportModalProps> = ({
  history,
  campaignLevel,
  adaptiveProfile,
  meritSession,
  sessionAwardedMedals = [],
  onContinueFifthAdvanced,
  onOpenAdaptivePractice,
  onRestartCampaign,
  onStartAdvanced,
  onOpenScenarioSelect,
  onBackToTitle,
}) => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'DETAILS'>('SUMMARY');
  const [aiReport, setAiReport] = useState<PedagogicalFinalReport | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const reqIdRef = useRef(0);

  const avgScore =
    history.length > 0
      ? Math.round(
          history.reduce((sum, item) => sum + item.score, 0) / history.length
        )
      : 0;

  const safeCount = history.filter((h) => h.grade === 'SEGURO').length;
  const cicuDoneCount = history.filter((h) => h.cicuScore !== undefined).length;
  const totalAttemptsInRound = history.reduce(
    (sum, item) => sum + (item.attemptsCount ?? 1),
    0
  );

  const adaptiveRec = useMemo(
    () => (adaptiveProfile ? getAdaptiveRecommendations(adaptiveProfile) : null),
    [adaptiveProfile]
  );
  const topWeakness = adaptiveRec?.topTarget ?? null;

  const localInsights = useMemo(() => {
    const passedCounts = new globalThis.Map<string, number>();
    const failedCounts = new globalThis.Map<string, number>();

    for (const item of history) {
      for (const label of item.passedCriteria ?? []) {
        passedCounts.set(label, (passedCounts.get(label) ?? 0) + 1);
      }
      for (const label of item.failedCriteria ?? []) {
        failedCounts.set(label, (failedCounts.get(label) ?? 0) + 1);
      }
      for (const label of item.initialFailedCriteria ?? []) {
        failedCounts.set(label, (failedCounts.get(label) ?? 0) + 1);
      }
    }

    const strengths = Array.from(passedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => `${label} superado correctamente en ${count} escenario(s).`);

    const mistakes = Array.from(failedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => `${label}: incidencias detectadas en ${count} ocasión(es).`);

    if (adaptiveRec) {
      for (const r of adaptiveRec.ranked) {
        if (r.status === 'MASTERED' && strengths.length < 4) {
          strengths.push(`${r.meta.shortLabel} consolidado.`);
        }
        if (r.status === 'RECURRENT_WEAKNESS' && mistakes.length < 4) {
          mistakes.push(
            r.stat.lastIssueDetail || `${r.meta.label} (${r.stat.failures} fallos acumulados).`
          );
        }
      }
    }

    return {
      strengths:
        strengths.length > 0
          ? strengths
          : [`${safeCount} de ${history.length} escenarios completados en nivel seguro.`],
      mistakes:
        mistakes.length > 0
          ? mistakes
          : ['No se han detectado fallos repetidos críticos durante esta guardia.'],
    };
  }, [history, adaptiveRec, safeCount]);

  const fetchPedagogicalSummary = useCallback(async () => {
    if (history.length === 0) return;
    reqIdRef.current += 1;
    const myReqId = reqIdRef.current;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoadingReport(false);
      setReportError(
        'Modo sin cobertura: mostrando el resumen pedagógico local automático (la redacción ampliada con IA requiere conexión).'
      );
      return;
    }
    setLoadingReport(true);
    setReportError(null);

    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 18000);

    try {
      const skillStats = adaptiveRec
        ? adaptiveRec.ranked.map((r) => ({
            label: r.meta.label,
            attempts: r.stat.attempts,
            failures: r.stat.failures,
            criticals: r.stat.criticals,
            status: r.status,
            lastIssueDetail: r.stat.lastIssueDetail,
          }))
        : [];

      const resp = await fetch('/api/report/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          campaignLevel,
          avgScore,
          safeCount,
          totalScenarios: history.length,
          history,
          skillStats,
        }),
      });

      const data = await safeParseJsonResponse<PedagogicalFinalReport>(resp);
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo generar el informe pedagógico.');
      }

      if (reqIdRef.current === myReqId) {
        setAiReport(data);
      }
    } catch (err) {
      if (reqIdRef.current === myReqId) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setReportError('El informe tardó demasiado en responder. Puedes regenerarlo o revisar el resumen automático.');
        } else {
          setReportError(
            err instanceof Error
              ? err.message
              : 'No se pudo generar el informe pedagógico resumido con IA.'
          );
        }
      }
    } finally {
      window.clearTimeout(tid);
      if (reqIdRef.current === myReqId) {
        setLoadingReport(false);
      }
    }
  }, [history, campaignLevel, avgScore, safeCount, adaptiveRec]);

  useEffect(() => {
    void fetchPedagogicalSummary();
  }, [fetchPedagogicalSummary]);

  const rankLabel =
    avgScore >= 85
      ? campaignLevel === 'ADVANCED'
        ? 'Coordinación Completa de Escena TES'
        : 'Técnico Especialista en Autoprotección Vial'
      : avgScore >= 65
        ? 'Apto · Posicionamiento Operativo Correcto'
        : 'Necesita reforzar criterios de seguridad vial';

  const handleCopyReport = async () => {
    sfx.playClick();
    const titleLine =
      campaignLevel === 'ADVANCED'
        ? `INFORME FINAL NIVEL AVANZADO TES (${history.length} despliegues)`
        : `INFORME FINAL GUARDIA BÁSICA TES (${history.length} escenarios)`;
    const lines = [
      titleLine,
      `Calificación media: ${avgScore}/100 · Escenarios seguros: ${safeCount}/${history.length} · Nivel: ${rankLabel}`,
      '',
    ];

    if (aiReport) {
      lines.push(`RESUMEN GLOBAL: ${aiReport.executiveSummary}`, '');
      lines.push('ACIERTOS CONSOLIDADOS:');
      aiReport.consolidatedStrengths.forEach((s) => lines.push(`- ${s}`));
      lines.push('', 'FALLOS REPETIDOS / RIESGOS:');
      aiReport.repeatedMistakes.forEach((m) => lines.push(`- ${m}`));
      lines.push('', 'RECOMENDACIONES DE REPASO:');
      aiReport.reviewRecommendations.forEach((r) => lines.push(`- ${r}`));
      lines.push('', `ALUMNADO: ${aiReport.studentNote}`);
      lines.push(`PROFESORADO: ${aiReport.teacherNote}`, '');
    } else {
      lines.push('ACIERTOS DETECTADOS:');
      localInsights.strengths.forEach((s) => lines.push(`- ${s}`));
      lines.push('', 'INCIDENCIAS DETECTADAS:');
      localInsights.mistakes.forEach((m) => lines.push(`- ${m}`));
      lines.push('');
    }

    lines.push('DESGLOSE POR VÍA:');
    history.forEach((h, i) => {
      lines.push(
        `${i + 1}. ${h.title} (${h.roadLabel}) -> ${h.score}/100 [${h.grade}]${
          h.attemptsCount && h.attemptsCount > 1 ? ` · ${h.attemptsCount} intentos` : ''
        }${h.cicuScore !== undefined ? ` · CICU LCANS ${h.cicuScore}/100` : ''}`
      );
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked in restricted context; silently ignore
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4">
      <div className="flex max-h-[91dvh] w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 sm:gap-4 sm:pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-400 sm:h-12 sm:w-12">
              <Award className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 sm:text-xs">
                {campaignLevel === 'ADVANCED'
                  ? `Informe de nivel avanzado · ${history.length} despliegues completos evaluados`
                  : `Informe de guardia básica · ${history.length} vías evaluadas`}
              </p>
              <h2 className="font-display text-lg font-bold text-white sm:text-2xl">
                {rankLabel}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void handleCopyReport()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-sky-400" />
                  Copiar informe
                </>
              )}
            </button>

            <div className="text-right">
              <div className="text-xs text-slate-400">Media global</div>
              <div className="font-mono text-2xl font-bold text-amber-400 tabular-nums sm:text-3xl">
                {avgScore}
                <span className="text-sm text-slate-500 sm:text-base">/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Metrics & Tabs */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <span>
              {campaignLevel === 'ADVANCED'
                ? 'Despliegues seguros:'
                : 'Estacionamientos seguros:'}{' '}
              <strong className="font-mono text-emerald-400 tabular-nums">
                {safeCount}/{history.length}
              </strong>
            </span>
            <span>
              Intentos totales:{' '}
              <strong className="font-mono text-white tabular-nums">
                {totalAttemptsInRound}
              </strong>
            </span>
            {cicuDoneCount > 0 && (
              <span>
                Partes CICU (LCANS):{' '}
                <strong className="font-mono text-sky-300 tabular-nums">
                  {cicuDoneCount}/{history.length}
                </strong>
              </span>
            )}
          </div>

          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                setActiveTab('SUMMARY');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                activeTab === 'SUMMARY'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Informe pedagógico
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                setActiveTab('DETAILS');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                activeTab === 'DETAILS'
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Detalle por vía ({history.length})
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
          {activeTab === 'SUMMARY' ? (
            <>
              {/* AI Summary Banner / Loading / Error */}
              <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-300">
                    <Sparkles className="h-4 w-4 text-sky-400" />
                    Resumen pedagógico de la guardia (Alumnado y Profesorado)
                  </div>
                  <button
                    type="button"
                    disabled={loadingReport}
                    onClick={() => void fetchPedagogicalSummary()}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingReport ? 'animate-spin' : ''}`} />
                    Regenerar
                  </button>
                </div>

                {loadingReport && !aiReport ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                    Analizando aciertos consolidados, fallos repetidos y recomendaciones de repaso...
                  </div>
                ) : aiReport ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-100 sm:text-sm">
                    {aiReport.executiveSummary}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                    {reportError ||
                      'Resumen automático basado en las métricas de tu guardia.'}
                  </p>
                )}
              </div>

              {/* 3 Pedagogical Cards: Strengths, Repeated Mistakes, Recommendations */}
              <div className="grid gap-3 md:grid-cols-3">
                {/* 1. Aciertos consolidados */}
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Aciertos consolidados
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-200">
                    {(aiReport?.consolidatedStrengths ?? localInsights.strengths).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Fallos repetidos */}
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Fallos repetidos
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-200">
                    {(aiReport?.repeatedMistakes ?? localInsights.mistakes).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. Recomendaciones concretas de repaso */}
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-300">
                    <TrendingUp className="h-4 w-4 shrink-0" />
                    Recomendaciones de repaso
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-200">
                    {(
                      aiReport?.reviewRecommendations ?? [
                        topWeakness
                          ? `Reforzar "${topWeakness.meta.label}": ${topWeakness.meta.protocolRule}`
                          : 'Consolidar la coordinación entre luces V-1, señalización y comunicación LCANS al CICU.',
                        'Repasar las vías con menor puntuación desde "Repasar vía concreta".',
                      ]
                    ).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Dual Audience Notes (Alumnado & Profesorado) */}
              {aiReport && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-700 bg-slate-950/75 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <GraduationCap className="h-4 w-4" />
                      Orientación para el alumnado
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                      {aiReport.studentNote}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-950/75 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                      <UserCheck className="h-4 w-4" />
                      Observación para el profesorado
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                      {aiReport.teacherNote}
                    </p>
                  </div>
                </div>
              )}

              {/* Merit Medal Earned or 4/5 Challenge Banner */}
              {sessionAwardedMedals.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3.5 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <Award className="h-4 w-4 shrink-0" />
                      <span>
                        ¡Medalla al Mérito asignada al finalizar la sesión! (
                        {sessionAwardedMedals[0].label})
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-amber-100">
                      Superaste {MERIT_REQUIRED_STREAK} escenarios avanzados seguidos sin fallos
                      críticos. Ya aparece en el menú principal.
                    </p>
                  </div>
                </div>
              ) : (
                campaignLevel === 'ADVANCED' &&
                meritSession &&
                meritSession.currentStreak >= 1 &&
                meritSession.currentStreak < MERIT_REQUIRED_STREAK && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2.5 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                        <Award className="h-4 w-4 shrink-0" />
                        <span>
                          Racha avanzada actual: {meritSession.currentStreak}/
                          {MERIT_REQUIRED_STREAK} sin fallos críticos
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-200">
                        Completa {MERIT_REQUIRED_STREAK - meritSession.currentStreak} escenario(s)
                        avanzado(s) más en esta sesión sin fallos críticos para obtener la Medalla al
                        Mérito.
                      </p>
                    </div>
                    {onContinueFifthAdvanced && (
                      <button
                        type="button"
                        onClick={onContinueFifthAdvanced}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-sky-300 whitespace-nowrap shrink-0"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Continuar con 5.º escenario avanzado
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Adaptive Recommendation Box */}
              {topWeakness && onOpenAdaptivePractice && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                      <TrendingUp className="h-4 w-4 shrink-0" />
                      <span>
                        Práctica adaptativa recomendada: {topWeakness.meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-200">
                      {topWeakness.stat.lastIssueDetail || topWeakness.meta.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAdaptivePractice(topWeakness.meta.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Entrenar punto débil
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Per-scenario Breakdown Table */
            <div className="space-y-2">
              {history.map((item, idx) => {
                const gradeText =
                  item.grade === 'SEGURO'
                    ? 'Seguro'
                    : item.grade === 'MEJORABLE'
                      ? 'Mejorable'
                      : 'Riesgo crítico';
                const gradeColor =
                  item.grade === 'SEGURO'
                    ? 'text-emerald-400'
                    : item.grade === 'MEJORABLE'
                      ? 'text-amber-400'
                      : 'text-rose-400';

                return (
                  <div
                    key={`${item.scenarioId}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{item.title}</span>
                        {item.attemptsCount && item.attemptsCount > 1 && (
                          <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                            {item.attemptsCount} intentos
                          </span>
                        )}
                        {item.cicuScore !== undefined && (
                          <span className="rounded border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                            CICU LCANS {item.cicuScore}/100
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {item.roadLabel} ·{' '}
                        {item.arrivalPhase === 'FIRST_RESPONDER'
                          ? 'Primer interviniente'
                          : 'Estacionamiento estándar'}
                      </div>
                      {item.failedCriteria && item.failedCriteria.length > 0 && (
                        <div className="mt-1 text-[11px] text-rose-300">
                          A mejorar: {item.failedCriteria.join(' · ')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-semibold ${gradeColor}`}>
                        {gradeText}
                      </span>
                      <span className="font-mono text-sm font-bold text-white tabular-nums">
                        {item.score}/100
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3.5">
          <button
            type="button"
            onClick={onBackToTitle}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Volver al inicio
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenScenarioSelect}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Map className="h-4 w-4 text-sky-400" />
              Repasar vía concreta
            </button>
            <button
              type="button"
              onClick={onRestartCampaign}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              {campaignLevel === 'ADVANCED' ? 'Repetir nivel avanzado' : 'Repetir guardia básica'}
            </button>
            {campaignLevel === 'BASIC' && onStartAdvanced && (
              <button
                type="button"
                onClick={onStartAdvanced}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 whitespace-nowrap shrink-0"
              >
                <Layers className="h-4 w-4" />
                Pasar al Nivel Avanzado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
