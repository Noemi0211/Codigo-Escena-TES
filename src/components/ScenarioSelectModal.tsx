import React, { useState } from 'react';
import { Layers, Play, ShieldAlert, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { ArrivalPhase, ScenarioSpec } from '../types/game';

interface ScenarioSelectModalProps {
  scenarios: ScenarioSpec[];
  onSelectScenario: (scenario: ScenarioSpec) => void;
  onOpenGenerator?: () => void;
  onDeleteCustomScenario?: (id: string) => void;
  onClose: () => void;
}

export const ScenarioSelectModal: React.FC<ScenarioSelectModalProps> = ({
  scenarios,
  onSelectScenario,
  onOpenGenerator,
  onDeleteCustomScenario,
  onClose,
}) => {
  const [filter, setFilter] = useState<'ALL' | ArrivalPhase | 'ADVANCED' | 'CUSTOM'>('ALL');

  const advancedCount = scenarios.filter((s) => !s.isCustom && s.level === 'ADVANCED').length;
  const customCount = scenarios.filter((s) => s.isCustom).length;

  const filtered = scenarios.filter((sc) => {
    if (filter === 'ALL') return true;
    if (filter === 'CUSTOM') return Boolean(sc.isCustom);
    if (filter === 'ADVANCED') return !sc.isCustom && sc.level === 'ADVANCED';
    return !sc.isCustom && sc.level !== 'ADVANCED' && sc.arrivalPhase === filter;
  });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-2.5 sm:p-4">
      <div className="flex max-h-[88dvh] w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white sm:text-2xl">
              Selector de escenarios por tipo de vía y nivel
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
              Practica escenarios básicos, el nivel avanzado o crea casos a la carta con el
              generador docente.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white sm:p-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-800/80 p-1">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap shrink-0 ${
                filter === 'ALL'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Todos ({scenarios.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('FIRST_RESPONDER')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap shrink-0 ${
                filter === 'FIRST_RESPONDER'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Primer interviniente
            </button>
            <button
              type="button"
              onClick={() => setFilter('STANDARD_SECURED')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap shrink-0 ${
                filter === 'STANDARD_SECURED'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Estacionamiento estándar
            </button>
            <button
              type="button"
              onClick={() => setFilter('ADVANCED')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap shrink-0 ${
                filter === 'ADVANCED'
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-sky-300 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Nivel avanzado ({advancedCount})
            </button>
            {customCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter('CUSTOM')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs whitespace-nowrap shrink-0 ${
                  filter === 'CUSTOM'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-amber-300 hover:text-white'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Docente ({customCount})
              </button>
            )}
          </div>

          {onOpenGenerator && (
            <button
              type="button"
              onClick={onOpenGenerator}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/30 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Crear con IA
            </button>
          )}
        </div>

        <div className="grid gap-2.5 overflow-y-auto p-3.5 sm:grid-cols-2 sm:gap-3 sm:p-6 lg:grid-cols-3">
          {filtered.map((sc) => {
            const isAdv = sc.level === 'ADVANCED';
            const isFirst = sc.arrivalPhase === 'FIRST_RESPONDER';
            return (
              <div
                key={sc.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectScenario(sc)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectScenario(sc);
                  }
                }}
                className={`group flex cursor-pointer flex-col justify-between rounded-xl border bg-slate-950/60 p-4 text-left transition-colors hover:bg-slate-800/60 ${
                  sc.isCustom
                    ? 'border-amber-500/45 hover:border-amber-400'
                    : isAdv
                      ? 'border-sky-800/60 hover:border-sky-400/70'
                      : 'border-slate-800 hover:border-amber-500/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span
                      className={`tabular-nums font-semibold ${
                        sc.isCustom
                          ? 'text-amber-300'
                          : isAdv
                            ? 'text-sky-400'
                            : 'text-amber-400'
                      }`}
                    >
                      {sc.isCustom
                        ? `Docente IA · ${sc.roadLabel}`
                        : isAdv
                          ? `Avanzado ${sc.order}. ${sc.roadLabel}`
                          : `${String(sc.order).padStart(2, '0')}. ${sc.roadLabel}`}
                    </span>

                    {sc.isCustom && onDeleteCustomScenario && (
                      <button
                        type="button"
                        aria-label={`Eliminar escenario ${sc.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCustomScenario(sc.id);
                        }}
                        className="rounded p-1 text-slate-500 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <h3 className="mt-1 font-display text-lg font-bold text-white group-hover:text-amber-300">
                    {sc.title}
                  </h3>

                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-300">
                    {sc.briefing}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs">
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold ${
                      isAdv
                        ? 'text-sky-300'
                        : isFirst
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                    }`}
                  >
                    {isAdv ? (
                      <Layers className="h-3.5 w-3.5" />
                    ) : isFirst ? (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    {isAdv
                      ? 'Policía + Bomberos + Amb.'
                      : isFirst
                        ? 'Primer interviniente'
                        : 'Estándar'}
                  </span>

                  <span className="inline-flex items-center gap-1 font-semibold text-slate-300 group-hover:text-white">
                    Practicar
                    <Play className="h-3 w-3 fill-current" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
