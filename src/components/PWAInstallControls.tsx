import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { sfx } from '../audio/sfx';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isOfflineReady, install } =
    usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Suppress install prompt when already running in standalone installed PWA mode
  if (isInstalled) {
    return null;
  }

  const handleTrigger = async () => {
    sfx.playClick();
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleTrigger()}
        title="Descargar aplicación en el móvil para jugar sin cobertura"
        className={
          compact
            ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-400 hover:bg-emerald-500/25 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 whitespace-nowrap shrink-0 sm:px-3.5 sm:py-2'
            : 'inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/70 bg-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-100 transition-colors hover:border-emerald-300 hover:bg-emerald-500/30 sm:text-sm whitespace-nowrap shrink-0'
        }
      >
        <Download className="h-4 w-4 text-emerald-300 shrink-0" />
        <span>{isInstallable ? 'Descargar app (Offline)' : 'Jugar sin cobertura'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-emerald-400">
                  <Smartphone className="h-4 w-4 shrink-0" />
                  Aplicación Instalable (PWA)
                </div>
                <h3
                  id="pwa-install-title"
                  className="mt-0.5 font-display text-lg font-bold text-white sm:text-xl"
                >
                  Descargar en el móvil y jugar sin cobertura
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Cerrar guía de instalación"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4 text-xs leading-relaxed text-slate-200 sm:px-6 sm:text-sm">
              {/* Service Worker Cache Status */}
              <div
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${
                  isOfflineReady
                    ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {isOfflineReady
                    ? 'Caché sin conexión lista: los escenarios, el manual y la evaluación local ya están guardados en este dispositivo.'
                    : 'Preparando caché local: abre esta página con internet unos segundos antes de salir a zona sin cobertura.'}
                </span>
              </div>

              {/* Direct prompt button if available */}
              {isInstallable && (
                <button
                  type="button"
                  onClick={() => void handleTrigger()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  <Download className="h-4 w-4" />
                  Instalar «Escena TES» ahora en este dispositivo
                </button>
              )}

              {/* Platform instructions */}
              <div className="space-y-2.5">
                <div
                  className={`rounded-xl border p-3.5 ${
                    isIOS
                      ? 'border-sky-500/60 bg-sky-500/10'
                      : 'border-slate-700/80 bg-slate-950/60'
                  }`}
                >
                  <p className="flex items-center gap-2 font-bold text-white">
                    <Share className="h-4 w-4 text-sky-400 shrink-0" />
                    iPhone / iPad (Safari)
                  </p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-300">
                    <li>
                      Abre la web directamente en <strong className="text-white">Safari</strong>.
                    </li>
                    <li>
                      Pulsa el botón <strong className="text-white">Compartir</strong> (cuadrado con
                      flecha arriba en la barra inferior).
                    </li>
                    <li>
                      Desliza hacia abajo y selecciona{' '}
                      <strong className="text-white">«Añadir a pantalla de inicio»</strong>.
                    </li>
                  </ol>
                </div>

                <div
                  className={`rounded-xl border p-3.5 ${
                    isAndroid
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-slate-700/80 bg-slate-950/60'
                  }`}
                >
                  <p className="flex items-center gap-2 font-bold text-white">
                    <Smartphone className="h-4 w-4 text-emerald-400 shrink-0" />
                    Android (Chrome / Edge / Samsung Internet)
                  </p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-300">
                    <li>
                      Si aparece el botón verde superior, pulsa{' '}
                      <strong className="text-white">«Instalar»</strong> para descarga directa.
                    </li>
                    <li>
                      Si navegas desde una vista previa o no sale el aviso, abre el menú{' '}
                      <strong className="text-white">⋮</strong> arriba a la derecha y elige{' '}
                      <strong className="text-white">
                        «Instalar aplicación»
                      </strong>{' '}
                      o <strong className="text-white">«Añadir a pantalla de inicio»</strong>.
                    </li>
                  </ol>
                </div>
              </div>

              {/* Offline vs Online breakdown */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/75 p-3.5">
                <p className="font-bold text-amber-300">Qué funciona 100% sin cobertura:</p>
                <ul className="mt-1.5 space-y-1 text-slate-300">
                  <li>
                    • <strong className="text-white">Simulador completo:</strong> Tutorial (3
                    premisas), Guardia básica (9 vías), Nivel avanzado (4 despliegues) y
                    escenarios ya guardados.
                  </li>
                  <li>
                    • <strong className="text-white">Evaluación y progreso local:</strong>{' '}
                    corrección táctica de distancias y ángulos, Medallas al Mérito, registro de
                    errores adaptativo, resumen local y Manual de protocolo.
                  </li>
                </ul>
                <p className="mt-2 text-[11px] text-slate-400">
                  * Las funciones con etiqueta <strong className="text-slate-200">(IA)</strong>{' '}
                  (Emisora CICU, Tutor socrático ampliado, Consultor IA y Generador docente) se
                  reactivan automáticamente cuando recuperes datos o Wi‑Fi.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-700"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-lg border border-amber-400/60 bg-slate-900/95 px-3 py-1.5 text-[11px] font-semibold text-amber-200 shadow-lg backdrop-blur-sm sm:text-xs"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span className="truncate">
        Sin cobertura · Modo offline activo (simulador y evaluación local disponibles)
      </span>
    </div>
  );
};
