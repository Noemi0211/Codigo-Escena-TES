import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Lightbulb,
  MessageCircleQuestion,
  Pause,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AmbulancePlacement,
  CicuEvaluationReport,
  DeploymentPlacement,
  MeritSessionState,
  MovableVehicle,
  ScenarioSpec,
  VehicleSelection,
} from '../types/game';
import { MERIT_REQUIRED_STREAK } from '../engine/meritMedals';
import { sfx } from '../audio/sfx';
import {
  computeDistanceMeters,
  isAmbulanceBeforeCrash,
} from '../engine/evaluator';

interface GameHUDProps {
  scenario: ScenarioSpec;
  scenarioIndex: number;
  totalScenarios: number;
  isCampaign: boolean;
  totalScore: number;
  placement: AmbulancePlacement;
  onChangePlacement: (next: AmbulancePlacement) => void;
  deployment?: DeploymentPlacement;
  activeVehicle?: VehicleSelection;
  onSelectVehicle?: (v: VehicleSelection) => void;
  onChangeDeployment?: (next: DeploymentPlacement) => void;
  onConfirm: () => void;
  onResetPosition: () => void;
  onOpenGuide: () => void;
  onOpenConsultant: () => void;
  onPause: () => void;
  onOpenCicuCall: () => void;
  cicuReport?: CicuEvaluationReport | null;
  meritSession?: MeritSessionState;
  muted: boolean;
  onToggleMute: () => void;
  disabled: boolean;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  scenario,
  scenarioIndex,
  totalScenarios,
  isCampaign,
  totalScore,
  placement,
  onChangePlacement,
  deployment,
  activeVehicle = 'AMBULANCE',
  onSelectVehicle,
  onChangeDeployment,
  onConfirm,
  onResetPosition,
  onOpenGuide,
  onOpenConsultant,
  onPause,
  onOpenCicuCall,
  cicuReport,
  meritSession,
  muted,
  onToggleMute,
  disabled,
}) => {
  const [briefingOpen, setBriefingOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight >= 520 : true
  );
  const [objectiveVisible, setObjectiveVisible] = useState(false);

  // Reset objective visibility whenever the scenario changes so students try from memory first
  useEffect(() => {
    setObjectiveVisible(false);
    if (typeof window !== 'undefined' && window.innerHeight < 520) {
      setBriefingOpen(false);
    }
  }, [scenario.id]);

  const isAdvanced = Boolean(scenario.isAdvancedDeployment);
  const hasTwoAmbs = Boolean(deployment?.ambulance2);
  const hasMultiVehicles = Boolean(
    (isAdvanced || hasTwoAmbs) && deployment && onSelectVehicle && onChangeDeployment
  );

  const getActiveMovable = (): MovableVehicle => {
    if (!hasMultiVehicles || !deployment) return placement;
    if (activeVehicle === 'AMBULANCE_2' && deployment.ambulance2) return deployment.ambulance2;
    if (isAdvanced && activeVehicle === 'POLICE_0' && deployment.police[0]) return deployment.police[0];
    if (isAdvanced && activeVehicle === 'POLICE_1' && deployment.police[1]) return deployment.police[1];
    if (isAdvanced && activeVehicle === 'FIRE_TRUCK' && deployment.fireTruck) return deployment.fireTruck;
    return deployment.ambulance;
  };

  const activeMovable = getActiveMovable();
  const activeAsPlacement: AmbulancePlacement = {
    ...placement,
    x: activeMovable.x,
    y: activeMovable.y,
    angleDeg: activeMovable.angleDeg,
  };

  const measuringToFireTruck = Boolean(
    isAdvanced &&
      (activeVehicle === 'AMBULANCE' || activeVehicle === 'AMBULANCE_2') &&
      deployment?.fireTruck
  );
  const upm = scenario.unitsPerMeter || 10;
  const distMeters =
    measuringToFireTruck && deployment?.fireTruck
      ? Math.round(
          (Math.hypot(
            activeMovable.x - deployment.fireTruck.x,
            activeMovable.y - deployment.fireTruck.y
          ) /
            upm) *
            10
        ) / 10
      : computeDistanceMeters(activeAsPlacement, scenario);
  const isBefore =
    measuringToFireTruck && deployment?.fireTruck
      ? activeMovable.x < deployment.fireTruck.x
      : isAmbulanceBeforeCrash(activeAsPlacement, scenario);
  const isFirstResponder = scenario.arrivalPhase === 'FIRST_RESPONDER';

  const activeVehicleLabel = !hasMultiVehicles
    ? 'Ambulancia'
    : activeVehicle === 'POLICE_0'
      ? 'Policía 1'
      : activeVehicle === 'POLICE_1'
        ? 'Policía 2'
        : activeVehicle === 'FIRE_TRUCK'
          ? 'Bomberos'
          : activeVehicle === 'AMBULANCE_2'
            ? 'Ambulancia 2'
            : hasTwoAmbs
              ? 'Ambulancia 1'
              : 'Ambulancia';

  const activeAngle = activeMovable.angleDeg;
  const activeAmbData = hasMultiVehicles && deployment ? deployment.ambulance : placement;

  const setAngle = (deg: number) => {
    sfx.playSnap();
    if (hasMultiVehicles && deployment && onChangeDeployment) {
      if (activeVehicle === 'AMBULANCE_2' && deployment.ambulance2) {
        onChangeDeployment({
          ...deployment,
          ambulance2: { ...deployment.ambulance2, angleDeg: deg },
        });
      } else if (activeVehicle === 'AMBULANCE') {
        onChangeDeployment({
          ...deployment,
          ambulance: { ...deployment.ambulance, angleDeg: deg },
        });
      } else if (isAdvanced && activeVehicle === 'FIRE_TRUCK' && deployment.fireTruck) {
        onChangeDeployment({
          ...deployment,
          fireTruck: { ...deployment.fireTruck, angleDeg: deg },
        });
      } else if (isAdvanced && activeVehicle === 'POLICE_0' && deployment.police[0]) {
        const nextPolice = [...deployment.police];
        nextPolice[0] = { ...nextPolice[0], angleDeg: deg };
        onChangeDeployment({ ...deployment, police: nextPolice });
      } else if (isAdvanced && activeVehicle === 'POLICE_1' && deployment.police[1]) {
        const nextPolice = [...deployment.police];
        nextPolice[1] = { ...nextPolice[1], angleDeg: deg };
        onChangeDeployment({ ...deployment, police: nextPolice });
      }
    } else {
      onChangePlacement({ ...placement, angleDeg: deg });
    }
  };

  const updateAmbProtocol = (patch: Partial<AmbulancePlacement>) => {
    sfx.playSnap();
    if (hasMultiVehicles && deployment && onChangeDeployment) {
      onChangeDeployment({
        ...deployment,
        ambulance: { ...deployment.ambulance, ...patch },
      });
    } else {
      onChangePlacement({ ...placement, ...patch });
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-1.5 sm:p-2 md:p-2.5">
      {/* Compact Horizontal Top Strip (2-column briefing + telemetry/utilities) */}
      <div className="pointer-events-auto mx-auto w-full max-w-6xl rounded-xl border border-slate-700/90 bg-slate-900/95 px-2.5 py-1.5 shadow-xl sm:px-4 sm:py-2">
        {/* Top Row: Scenario Title, Phase & Telemetry/Utility Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold text-amber-400 tabular-nums sm:text-xs">
              {scenario.adaptiveTargetSkill
                ? 'Práctica adaptativa (IA)'
                : scenario.isCustom
                  ? 'Escenario docente (IA)'
                  : isAdvanced
                    ? `Avanzado ${scenarioIndex + 1}/${totalScenarios}`
                    : isCampaign
                      ? `Aviso ${scenarioIndex + 1}/${totalScenarios}`
                      : `Escenario ${scenario.order}`}
            </span>
            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>
            <h2 className="font-display text-base font-bold tracking-tight text-white sm:text-lg md:text-xl">
              {scenario.title}
            </h2>
            <span aria-hidden="true" className="hidden text-slate-700 sm:inline">
              ·
            </span>
            <span className="hidden text-xs font-medium text-slate-400 sm:inline">
              {scenario.roadLabel} · {scenario.trafficFlowLabel}
            </span>
            <span aria-hidden="true" className="hidden text-slate-700 md:inline">
              ·
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold sm:text-xs ${
                isAdvanced
                  ? 'text-sky-300'
                  : isFirstResponder
                    ? 'text-amber-300'
                    : 'text-emerald-300'
              }`}
            >
              {isFirstResponder ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isAdvanced
                  ? 'Despliegue completo (Policía · Bomberos · Ambulancia)'
                  : isFirstResponder
                    ? 'Primer interviniente (sin policía)'
                    : 'Estacionamiento estándar (policía y bomberos)'}
              </span>
              <span className="sm:hidden">
                {isAdvanced
                  ? 'Despliegue completo'
                  : isFirstResponder
                    ? 'Primer interviniente'
                    : 'Estándar'}
              </span>
            </span>
          </div>

          {/* Right inline Telemetry + Action Buttons */}
          <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end sm:gap-1.5">
            <div className="flex items-center gap-2 lg:hidden">
              {isCampaign && (
                <span className="font-mono text-[11px] font-semibold text-white tabular-nums">
                  {totalScore} pts
                </span>
              )}
              <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-100 tabular-nums">
                {scenario.unitsPerMeter <= 5
                  ? `${Math.round(distMeters)} m`
                  : `${distMeters.toFixed(1)} m`}{' '}
                · {isBefore ? 'Detrás' : 'Delante'}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              {(isAdvanced || (meritSession?.pendingMedals.length ?? 0) > 0) && meritSession && (
                <div className="mr-1 hidden border-r border-slate-800 pr-2.5 text-right lg:block">
                  <span className="mr-1.5 text-[11px] text-amber-300">Mérito</span>
                  <span className="font-mono text-xs font-semibold text-white tabular-nums">
                    {meritSession.pendingMedals.length > 0
                      ? `${meritSession.pendingMedals.length} lista`
                      : `${meritSession.currentStreak}/${MERIT_REQUIRED_STREAK}`}
                  </span>
                </div>
              )}

              {isCampaign && (
                <div className="mr-1 hidden border-r border-slate-800 pr-2.5 text-right lg:block">
                  <span className="mr-1.5 text-[11px] text-slate-400">Puntos</span>
                  <span className="font-mono text-xs font-semibold text-white tabular-nums">
                    {totalScore}
                  </span>
                </div>
              )}

              <div className="mr-1 hidden border-r border-slate-800 pr-2.5 text-right lg:block">
                <span className="mr-1.5 text-[11px] text-slate-400">
                  {measuringToFireTruck
                    ? `Dist. (${activeVehicleLabel} → Bomberos)`
                    : hasMultiVehicles
                      ? `Dist. (${activeVehicleLabel})`
                      : 'Distancia'}
                </span>
                <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
                  {scenario.unitsPerMeter <= 5
                    ? `${Math.round(distMeters)} m`
                    : `${distMeters.toFixed(1)} m`}{' '}
                  · {isBefore ? 'Detrás' : 'Delante'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setBriefingOpen((v) => !v)}
                aria-label={briefingOpen ? 'Ocultar enunciado' : 'Ver enunciado'}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 text-[11px] font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0 sm:h-8"
              >
                {briefingOpen ? (
                  <>
                    <span className="hidden sm:inline">Ocultar enunciado</span>
                    <span className="sm:hidden">Ocultar</span>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Ver enunciado</span>
                    <span className="sm:hidden">Enunciado</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onResetPosition}
                disabled={disabled}
                title="Restablecer posición inicial"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-40 sm:h-8 sm:w-8"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onOpenGuide}
                title="Manual rápido de estacionamiento"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-amber-300 sm:h-8 sm:w-8"
              >
                <BookOpen className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onOpenConsultant}
                title="Consultor rápido de protocolo TES (dudas del temario)"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-sky-500/45 bg-sky-500/15 px-2 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-sky-500/25 whitespace-nowrap shrink-0 sm:h-8"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5 text-sky-300" />
                <span className="hidden md:inline">Dudas TES</span>
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                title={muted ? 'Activar sonido' : 'Silenciar'}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-white sm:h-8 sm:w-8"
              >
                {muted ? (
                  <VolumeX className="h-4 w-4 text-slate-500" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={onPause}
                title="Pausa / Menú"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 sm:h-8 sm:px-2.5"
              >
                <Pause className="h-3.5 w-3.5" />
                Menú
              </button>
            </div>
          </div>
        </div>

        {/* Two-Column Compact Briefing Strip */}
        {briefingOpen && (
          <div className="mt-1.5 grid items-center gap-2 border-t border-slate-800 pt-1.5 sm:mt-2 sm:gap-3 sm:pt-2 md:grid-cols-12">
            <div className="md:col-span-6">
              <p className="text-[11px] leading-snug text-slate-300 sm:text-xs">
                <strong className="font-semibold text-slate-100">Situación: </strong>
                {scenario.briefing}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-6">
              {objectiveVisible ? (
                <div className="flex w-full items-start justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 sm:px-3">
                  <p className="text-[11px] leading-snug font-medium text-amber-200 sm:text-xs">
                    <strong className="font-semibold text-amber-300">Cómo estacionar: </strong>
                    {scenario.keyObjective}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setObjectiveVisible(false);
                    }}
                    title="Ocultar pista"
                    className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 whitespace-nowrap"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Ocultar
                  </button>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 sm:gap-3 sm:px-3 sm:py-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 sm:text-xs">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="hidden sm:inline">
                      Aplica el protocolo aprendido para decidir dónde y cómo estacionar.
                    </span>
                    <span className="sm:hidden">Aplica el protocolo aprendido.</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setObjectiveVisible(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 sm:px-2.5 sm:text-xs whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver cómo estacionar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tactical Control Dock */}
      <div className="pointer-events-auto mx-auto w-full max-w-6xl rounded-xl border border-slate-700/95 bg-slate-900 px-2.5 py-1.5 shadow-2xl sm:px-3.5 sm:py-2">
        {/* Vehicle Selector Bar for Multi-Vehicle Scenarios (Advanced or 2 Ambulances) */}
        {hasMultiVehicles && deployment && onSelectVehicle && (
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <div className="flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
              <span className="mr-1 shrink-0 text-[11px] font-semibold text-slate-400">
                Vehículo:
              </span>

              {isAdvanced &&
                deployment.police.map((_, idx) => {
                  const key: VehicleSelection = idx === 0 ? 'POLICE_0' : 'POLICE_1';
                  const selected = activeVehicle === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        sfx.playClick();
                        onSelectVehicle(key);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        selected
                          ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden="true" />
                      {deployment.police.length > 1
                        ? idx === 0
                          ? 'Policía 1 (antes)'
                          : 'Policía 2 (después)'
                        : 'Policía'}
                    </button>
                  );
                })}

              {isAdvanced && deployment.fireTruck && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    sfx.playClick();
                    onSelectVehicle('FIRE_TRUCK');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeVehicle === 'FIRE_TRUCK'
                      ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                  Bomberos
                </button>
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  sfx.playClick();
                  onSelectVehicle('AMBULANCE');
                }}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeVehicle === 'AMBULANCE'
                    ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                {hasTwoAmbs ? 'Ambulancia 1' : 'Ambulancia (Principal)'}
              </button>

              {hasTwoAmbs && deployment.ambulance2 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    sfx.playClick();
                    onSelectVehicle('AMBULANCE_2');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeVehicle === 'AMBULANCE_2'
                      ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                  Ambulancia 2
                </button>
              )}
            </div>

            <span className="hidden text-[11px] text-slate-400 xl:inline">
              {isAdvanced
                ? 'Haz clic o arrastra en la calzada · Mayor peso en Ambulancia (65%)'
                : 'Haz clic o arrastra ambas ambulancias · Separación mínima ≥ 2,5 m'}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 1. Angle Orientation Controls */}
          <div className="flex w-full flex-col gap-0.5 sm:w-auto">
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Compass className="h-3 w-3 text-amber-400" />
                {hasMultiVehicles
                  ? `Orientación · ${activeVehicleLabel}`
                  : 'Orientación del vehículo'}
              </span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {activeAngle > 0 ? `+${Math.round(activeAngle)}°` : `${Math.round(activeAngle)}°`}
              </span>
            </div>
            <div className="grid grid-cols-3 items-center gap-1 sm:flex">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setAngle(activeVehicle === 'FIRE_TRUCK' ? -30 : -38)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeAngle <= -20 && activeAngle >= -60
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {activeVehicle === 'FIRE_TRUCK'
                  ? '30° (-30°)'
                  : 'Mediana (-38°)'}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setAngle(0)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  Math.abs(activeAngle) <= 10
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Paralela (0°)
              </button>
              {activeVehicle === 'POLICE_1' ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setAngle(180)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    Math.abs(activeAngle) >= 150
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Contrario (180°)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setAngle(35)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeAngle >= 20 && activeAngle <= 60
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Arcén (+35°)
                </button>
              )}
              <input
                type="range"
                min={activeVehicle === 'POLICE_1' ? -180 : -60}
                max={activeVehicle === 'POLICE_1' ? 180 : 60}
                step={2}
                disabled={disabled}
                value={activeAngle}
                onChange={(e) => setAngle(Number(e.target.value))}
                aria-label="Ajuste fino de ángulo"
                className="ml-1 hidden w-16 accent-amber-500 lg:block"
              />
            </div>
          </div>

          {/* 2. Essential Safety & Coordination Protocol Actions */}
          <div className="flex w-full flex-col gap-0.5 sm:w-auto">
            <div className="hidden text-[11px] font-medium text-slate-400 sm:block">
              Medidas de protección y coordinación (Ambulancia)
            </div>
            <div className="grid grid-cols-3 items-center gap-1 sm:flex sm:flex-wrap">
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  updateAmbProtocol({ lightsAllOn: !activeAmbData.lightsAllOn })
                }
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeAmbData.lightsAllOn
                    ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Luces (V-1)
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  updateAmbProtocol({ hazardMarked: !activeAmbData.hazardMarked })
                }
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeAmbData.hazardMarked
                    ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="hidden sm:inline">Señalizar peligro</span>
                <span className="sm:hidden">Peligro</span>
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  sfx.playClick();
                  onOpenCicuCall();
                }}
                title="Simular llamada al CICU siguiendo el método LCANS"
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeAmbData.ccuNotified
                    ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                    : cicuReport?.overallStatus === 'FALTA_INFO'
                      ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                      : 'border-sky-500/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                }`}
              >
                <Radio className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">
                  {activeAmbData.ccuNotified
                    ? `CICU · LCANS (${cicuReport?.score ?? 100})`
                    : cicuReport?.overallStatus === 'FALTA_INFO'
                      ? 'CICU (Completar)'
                      : 'Llamar al CICU'}
                </span>
                <span className="sm:hidden">
                  {activeAmbData.ccuNotified
                    ? `CICU (${cicuReport?.score ?? 100})`
                    : 'CICU'}
                </span>
              </button>
            </div>
          </div>

          {/* 3. Primary Confirm Action */}
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition-transform duration-150 hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm whitespace-nowrap shrink-0"
          >
            {disabled ? (
              <>
                <AlertTriangle className="h-4 w-4 animate-pulse" />
                Validando escena...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {isAdvanced ? 'Validar despliegue' : 'Estacionar y Validar'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
