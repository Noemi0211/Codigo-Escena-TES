import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  GraduationCap,
  Layers,
  Map,
  MessageCircleQuestion,
  Play,
  Radio,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AdaptiveProfile, AdaptiveSkillId, MeritMedal, ScenarioSpec } from '../types/game';
import { getAdaptiveRecommendations } from '../engine/adaptiveTracker';
import { MERIT_REQUIRED_STREAK } from '../engine/meritMedals';
import { PWAInstallButton } from './PWAInstallControls';

interface TitleScreenProps {
  scenarios: ScenarioSpec[];
  tutorialCompleted: boolean;
  adaptiveProfile: AdaptiveProfile;
  meritMedals: MeritMedal[];
  justAwardedMedals?: MeritMedal[];
  onStartTutorial: () => void;
  onStartCampaign: () => void;
  onStartAdvanced: () => void;
  onSelectSingleScenario: (scenario: ScenarioSpec) => void;
  onOpenScenarioSelect: () => void;
  onOpenGuide: () => void;
  onOpenProtocolConsultant: () => void;
  onOpenCicuSimulator: () => void;
  onOpenScenarioGenerator: () => void;
  onOpenAdaptivePractice: (skillId?: AdaptiveSkillId) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  scenarios,
  tutorialCompleted,
  adaptiveProfile,
  meritMedals,
  justAwardedMedals = [],
  onStartTutorial,
  onStartCampaign,
  onStartAdvanced,
  onSelectSingleScenario,
  onOpenScenarioSelect,
  onOpenGuide,
  onOpenProtocolConsultant,
  onOpenCicuSimulator,
  onOpenScenarioGenerator,
  onOpenAdaptivePractice,
}) => {
  const [selectedDestination, setSelectedDestination] = useState<string>('basic_campaign');

  const customScenarios = scenarios.filter((s) => s.isCustom);
  const basicScenarios = scenarios.filter((s) => !s.isCustom && s.level !== 'ADVANCED');
  const advancedScenarios = scenarios.filter((s) => !s.isCustom && s.level === 'ADVANCED');

  const { topTarget, hasRecurringMistake } = getAdaptiveRecommendations(adaptiveProfile);

  const handleGoToDestination = () => {
    if (selectedDestination === 'tutorial') {
      onStartTutorial();
    } else if (selectedDestination === 'basic_campaign') {
      onStartCampaign();
    } else if (selectedDestination === 'advanced_campaign') {
      onStartAdvanced();
    } else if (selectedDestination === 'cicu_simulator') {
      onOpenCicuSimulator();
    } else if (selectedDestination === 'scenario_generator') {
      onOpenScenarioGenerator();
    } else if (selectedDestination === 'adaptive_practice') {
      onOpenAdaptivePractice(topTarget?.meta.id);
    } else if (selectedDestination === 'protocol_consultant') {
      onOpenProtocolConsultant();
    } else {
      const target = scenarios.find((s) => s.id === selectedDestination);
      if (target) {
        onSelectSingleScenario(target);
      }
    }
  };

  return (
    <div className="relative z-10 flex min-h-full flex-col justify-between px-4 py-4 pb-6 sm:p-8 md:p-12 md:pb-16">
      {/* Contrast scrim on the left side leaving the right side of the live highway open */}
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/85 to-slate-950/75 md:bg-gradient-to-r md:from-slate-950/95 md:via-slate-950/80 md:to-slate-950/35"
        aria-hidden="true"
      />

      {/* Top quiet header strip */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400 sm:text-xs">
          <span>Ciclo Grado Medio · Técnico en Emergencias Sanitarias</span>
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span>Evacuación y Traslado de Pacientes</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onOpenProtocolConsultant}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:border-sky-400 hover:bg-sky-500/25 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0 sm:px-3.5 sm:py-2"
          >
            <MessageCircleQuestion className="h-4 w-4 text-sky-400" />
            Consultor rápido TES (IA)
          </button>

          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap shrink-0 sm:px-4 sm:py-2"
          >
            <BookOpen className="h-4 w-4 text-amber-400" />
            Manual de protocolo
          </button>
        </div>
      </div>

      {/* Center-Left Hero Lockup */}
      <div className="relative z-10 my-6 max-w-2xl md:my-auto">
        <div className="mb-3 flex items-center gap-3 sm:mb-4 sm:gap-3.5">
          <svg
            width="46"
            height="46"
            viewBox="0 0 52 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0 sm:h-[52px] sm:w-[52px]"
          >
            <rect
              x="2"
              y="2"
              width="48"
              height="48"
              rx="10"
              fill="#0F172A"
              stroke="#F59E0B"
              strokeWidth="2.5"
            />
            <path
              d="M11 39L20 13M41 39L32 13"
              stroke="#475569"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <g transform="translate(26 27) rotate(-32)">
              <rect x="-12" y="-6" width="24" height="12" rx="3" fill="#F8FAFC" />
              <rect x="-12" y="-6" width="5" height="12" rx="1" fill="#EF4444" />
              <rect x="3" y="-4" width="4" height="8" rx="1" fill="#38BDF8" />
            </g>
            <path
              d="M26 11V17M23 14H29"
              stroke="#F59E0B"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>

          <div>
            <p className="text-xs font-semibold tracking-wide text-amber-400">
              Simulador Táctico Vial
            </p>
            <h1
              className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl"
              style={{ textWrap: 'balance' }}
            >
              Código Escena: TES
            </h1>
          </div>
        </div>

        <p className="mb-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:mb-5 sm:text-base">
          Decide <strong className="font-semibold text-white">dónde</strong> y{' '}
          <strong className="font-semibold text-white">cómo</strong> estacionar la ambulancia
          en accidentes de tráfico aplicando los criterios de{' '}
          <strong className="font-semibold text-white">primer interviniente</strong> y de{' '}
          <strong className="font-semibold text-white">estacionamiento estándar</strong> en
          todo tipo de vías, además del{' '}
          <strong className="font-semibold text-white">nivel avanzado</strong> desplegando
          Policía, Bomberos y Ambulancia.
        </p>

        {/* Direct Destination Selector (<select>) */}
        <div className="mb-4 rounded-xl border border-slate-700/90 bg-slate-900/90 p-3.5 shadow-lg sm:mb-5 sm:p-4">
          <label
            htmlFor="destination-select"
            className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300"
          >
            <Compass className="h-4 w-4 shrink-0" />
            Elige directamente a dónde ir:
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              id="destination-select"
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value)}
              className="w-full min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-medium text-white focus:border-amber-400 focus:outline-none"
            >
              <option value="tutorial">
                Tutorial guiado · 3 premisas (Distancia, Salida, Barrera)
              </option>
              <option value="basic_campaign">
                Guardia básica completa · 9 escenarios
              </option>
              <option value="advanced_campaign">
                Nivel avanzado completo · 4 despliegues (Policía + Bomberos + Amb.)
              </option>
              <option value="adaptive_practice">
                {topTarget
                  ? `Práctica adaptativa · Reforzar: ${topTarget.meta.shortLabel}`
                  : 'Práctica adaptativa · Diagnóstico y refuerzo (IA)'}
              </option>
              <option value="cicu_simulator">
                Simulador de llamada al CICU · Método LCANS (IA)
              </option>
              <option value="scenario_generator">
                Generador docente con IA · Escenarios a la carta
              </option>
              <option value="protocol_consultant">
                Consultor de protocolo TES · Dudas rápidas del temario (IA)
              </option>
              {customScenarios.length > 0 && (
                <optgroup label="Escenarios personalizados / adaptativos">
                  {customScenarios.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      ★ {sc.title} ({sc.roadLabel})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Escenario concreto · Guardia básica (9 vías)">
                {basicScenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {String(sc.order).padStart(2, '0')}. {sc.title} ({sc.roadLabel})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Escenario concreto · Nivel avanzado (4 despliegues)">
                {advancedScenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    Avanzado {sc.order}. {sc.title}
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              type="button"
              onClick={handleGoToDestination}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-transform duration-150 hover:bg-amber-400 active:scale-[0.98] sm:w-auto whitespace-nowrap shrink-0"
            >
              Ir al seleccionado
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {tutorialCompleted && (
              <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Tutorial completado en esta sesión
              </p>
            )}
            {topTarget && (
              <button
                type="button"
                onClick={() => onOpenAdaptivePractice(topTarget.meta.id)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold underline-offset-2 hover:underline ${
                  hasRecurringMistake ? 'text-rose-300' : 'text-amber-300'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                {hasRecurringMistake ? 'Fallo recurrente detectado' : 'Punto a reforzar'}:{' '}
                {topTarget.meta.shortLabel} ({topTarget.stat.failures} fallo
                {topTarget.stat.failures === 1 ? '' : 's'})
              </button>
            )}
          </div>
        </div>

        {/* Unlocked Direct Quick-Action Buttons */}
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
          <button
            type="button"
            onClick={onStartTutorial}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/25 sm:text-sm whitespace-nowrap shrink-0"
          >
            <GraduationCap className="h-4 w-4 text-amber-400" />
            Tutorial guiado (3 premisas)
          </button>

          <button
            type="button"
            onClick={onStartCampaign}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 sm:text-sm whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4 fill-current text-emerald-400" />
            Guardia básica (9 vías)
          </button>

          <button
            type="button"
            onClick={onStartAdvanced}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/15 px-4 py-2.5 text-xs font-bold text-sky-200 transition-colors hover:border-sky-400 hover:bg-sky-500/25 sm:text-sm whitespace-nowrap shrink-0"
          >
            <Layers className="h-4 w-4 text-sky-400" />
            Nivel avanzado (4)
          </button>

          <button
            type="button"
            onClick={() => onOpenAdaptivePractice(topTarget?.meta.id)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold transition-colors sm:text-sm whitespace-nowrap shrink-0 ${
              hasRecurringMistake
                ? 'border-rose-400/60 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30'
                : 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
            }`}
          >
            <TrendingUp
              className={`h-4 w-4 ${hasRecurringMistake ? 'text-rose-300' : 'text-emerald-300'}`}
            />
            {topTarget ? `Reforzar: ${topTarget.meta.shortLabel}` : 'Práctica adaptativa'}
          </button>

          <button
            type="button"
            onClick={onOpenCicuSimulator}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/60 bg-sky-500/20 px-4 py-2.5 text-xs font-bold text-sky-100 transition-colors hover:bg-sky-500/30 sm:text-sm whitespace-nowrap shrink-0"
          >
            <Radio className="h-4 w-4 text-sky-300" />
            Llamada al CICU (LCANS)
          </button>

          <button
            type="button"
            onClick={onOpenScenarioGenerator}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500/20 px-4 py-2.5 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/30 sm:text-sm whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            Generador docente (IA)
          </button>

          <button
            type="button"
            onClick={onOpenScenarioSelect}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:border-slate-400 hover:bg-slate-800 sm:text-sm whitespace-nowrap shrink-0"
          >
            <Map className="h-4 w-4 text-emerald-400" />
            Catálogo visual
          </button>
        </div>

        {/* Medallas al Mérito Showcase in Main Menu */}
        <section
          aria-label="Medallas al Mérito"
          className={`mt-4 rounded-xl border p-3.5 shadow-lg sm:mt-5 sm:p-4 ${
            justAwardedMedals.length > 0
              ? 'border-amber-400/80 bg-amber-500/15'
              : 'border-slate-700/80 bg-slate-900/85'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-amber-400"
              >
                <path
                  d="M7 2H17L15 8H9L7 2Z"
                  fill="#F59E0B"
                  fillOpacity="0.25"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle
                  cx="12"
                  cy="15"
                  r="6"
                  fill="#F59E0B"
                  fillOpacity="0.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 12.2L12.8 13.9L14.7 14.1L13.3 15.4L13.7 17.3L12 16.4L10.3 17.3L10.7 15.4L9.3 14.1L11.2 13.9L12 12.2Z"
                  fill="currentColor"
                />
              </svg>
              <h2 className="font-display text-sm font-bold text-white sm:text-base">
                Medallas al Mérito TES
              </h2>
            </div>

            <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">
              {meritMedals.length === 0
                ? '0 conseguidas'
                : `${meritMedals.length} ${meritMedals.length === 1 ? 'medalla' : 'medallas'}`}
            </span>
          </div>

          {justAwardedMedals.length > 0 && (
            <p className="mt-1.5 rounded-lg border border-amber-400/50 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-amber-200">
              ¡Sesión completada con éxito! Se ha asignado{' '}
              {justAwardedMedals.length === 1
                ? 'una nueva Medalla al Mérito'
                : `${justAwardedMedals.length} nuevas Medallas al Mérito`}{' '}
              a tu expediente.
            </p>
          )}

          {meritMedals.length === 0 ? (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              Se asigna automáticamente al finalizar una sesión tras superar{' '}
              <strong className="font-semibold text-amber-300">
                {MERIT_REQUIRED_STREAK} escenarios avanzados seguidos sin fallos críticos
              </strong>
              .
            </p>
          ) : (
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {meritMedals.slice(0, 4).map((medal) => {
                const isNew = justAwardedMedals.some((j) => j.id === medal.id);
                const dateLabel = new Date(medal.earnedAt).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <div
                    key={medal.id}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      isNew
                        ? 'border-amber-400/70 bg-slate-950/85'
                        : 'border-slate-700/80 bg-slate-950/65'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-amber-300">{medal.label}</span>
                      <span className="font-mono text-[11px] font-bold text-emerald-300 tabular-nums shrink-0">
                        {medal.avgScore}/100
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {medal.streakLength} avanzados seguidos sin fallos críticos · {dateLabel}
                    </p>
                    {medal.scenarioTitles.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                        {medal.scenarioTitles.join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Single flat control-hint line */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-[11px] text-slate-400 sm:text-xs">
        <span>
          Toca o arrastra vehículos en la calzada · Tirador frontal o botones para el ángulo
        </span>
        <span className="tabular-nums text-slate-500">
          9 escenarios básicos + 4 despliegues avanzados
        </span>
      </div>
    </div>
  );
};
