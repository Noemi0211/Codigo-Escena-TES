import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  GraduationCap,
  Radio,
  X,
} from 'lucide-react';
import { AmbulancePlacement } from '../types/game';
import { TUTORIAL_STEPS } from '../data/tutorial';
import { sfx } from '../audio/sfx';

interface TutorialOverlayProps {
  stepIndex: number;
  placement: AmbulancePlacement;
  onChangePlacement: (next: AmbulancePlacement) => void;
  onNextStep: () => void;
  onExitTutorial: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  stepIndex,
  placement,
  onChangePlacement,
  onNextStep,
  onExitTutorial,
}) => {
  const [expanded, setExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight >= 520 : true
  );
  const step = TUTORIAL_STEPS[stepIndex];
  const evaluation = step.checkCompleted(placement);
  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;

  const setAngle = (deg: number) => {
    sfx.playSnap();
    onChangePlacement({ ...placement, angleDeg: deg });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-1.5 sm:p-2 md:p-2.5">
      {/* Compact Horizontal Top Strip — stays strictly above the road area */}
      <div className="pointer-events-auto mx-auto w-full max-w-6xl rounded-xl border border-amber-500/40 bg-slate-900/95 px-2.5 py-1.5 shadow-xl sm:px-4 sm:py-2.5">
        {/* Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 sm:gap-1.5 sm:text-xs">
              <GraduationCap className="h-4 w-4 shrink-0" />
              Tutorial {step.stepNumber}/3
            </span>
            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>
            <h2 className="font-display text-base font-bold tracking-tight text-white sm:text-lg md:text-xl">
              {step.premiseTitle}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 text-xs font-medium text-slate-400 md:flex">
              {TUTORIAL_STEPS.map((s, idx) => (
                <React.Fragment key={s.id}>
                  <span
                    className={
                      idx === stepIndex
                        ? 'font-semibold text-amber-400'
                        : idx < stepIndex
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                    }
                  >
                    {idx + 1}.{' '}
                    {s.id === 'distance'
                      ? 'Distancia'
                      : s.id === 'exit'
                        ? 'Salida'
                        : 'Barrera'}
                  </span>
                  {idx < TUTORIAL_STEPS.length - 1 && (
                    <span aria-hidden="true" className="text-slate-700">
                      ·
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Minimizar explicación' : 'Ver explicación'}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white"
            >
              {expanded ? (
                <>
                  Ocultar texto
                  <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Ver texto
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onExitTutorial}
              title="Salir del tutorial"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Compact 2-column body (never drops down onto the highway) */}
        {expanded && (
          <div className="mt-2 grid gap-3 border-t border-slate-800 pt-2 md:grid-cols-12">
            <div className="md:col-span-6">
              <p className="text-xs leading-snug text-slate-300">
                {step.premiseDescription}
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-300">
                Objetivo: {step.taskInstruction}
              </p>
            </div>

            <ul className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 md:col-span-6">
              {evaluation.checks.map((c, idx) => (
                <li
                  key={idx}
                  className={`flex items-center gap-1.5 text-xs ${
                    c.ok ? 'font-semibold text-emerald-300' : 'text-slate-400'
                  }`}
                >
                  {c.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  )}
                  <span className="leading-tight">{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bottom Interactive Dock */}
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/95 bg-slate-900 px-2.5 py-2 shadow-2xl sm:gap-3 sm:px-4 sm:py-2.5">
        {step.stepNumber >= 2 ? (
          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Compass className="h-3.5 w-3.5 text-amber-400" />
                Orientación
              </span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {placement.angleDeg > 0
                  ? `+${placement.angleDeg}°`
                  : `${placement.angleDeg}°`}
              </span>
            </div>
            <div className="grid grid-cols-2 items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={() => setAngle(-38)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  placement.angleDeg <= -30 && placement.angleDeg >= -45
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Hacia mediana (-38°)
              </button>
              <button
                type="button"
                onClick={() => setAngle(0)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  Math.abs(placement.angleDeg) <= 10
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Paralela salida (0°)
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-300 sm:text-xs">
            Toca o arrastra la ambulancia en la carretera (o usa flechas / WASD).
          </div>
        )}

        {step.stepNumber === 3 && (
          <div className="grid w-full grid-cols-3 items-center gap-1 sm:flex sm:w-auto sm:flex-wrap sm:gap-1.5">
            <button
              type="button"
              onClick={() => {
                sfx.playSnap();
                onChangePlacement({
                  ...placement,
                  lightsAllOn: !placement.lightsAllOn,
                });
              }}
              className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0 ${
                placement.lightsAllOn
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Luces (V-1)
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.playSnap();
                onChangePlacement({
                  ...placement,
                  hazardMarked: !placement.hazardMarked,
                });
              }}
              className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0 ${
                placement.hazardMarked
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Señalizar peligro</span>
              <span className="sm:hidden">Peligro</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.playSnap();
                onChangePlacement({
                  ...placement,
                  ccuNotified: !placement.ccuNotified,
                });
              }}
              className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors sm:gap-1.5 sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0 ${
                placement.ccuNotified
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Avisar al Centro Coordinador</span>
              <span className="sm:hidden">CCU</span>
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={!evaluation.done}
          onClick={() => {
            sfx.playResult('SEGURO');
            onNextStep();
          }}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all sm:w-auto sm:px-5 sm:text-sm whitespace-nowrap shrink-0 ${
            evaluation.done
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : 'cursor-not-allowed bg-slate-800 text-slate-500'
          }`}
        >
          {isLastStep ? 'Completar tutorial y comenzar' : 'Siguiente premisa'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
