import { useCallback, useEffect, useRef, useState } from 'react';
import { SCENARIOS } from './data/scenarios';
import { ADVANCED_SCENARIOS } from './data/advancedScenarios';
import { TUTORIAL_STEPS } from './data/tutorial';
import {
  computeDistanceMeters,
  computeOtherAmbulanceDistanceMeters,
  computeTwoAmbulanceGapMeters,
  evaluateAdvancedDeployment,
  evaluatePlacement,
  evaluateTwoAmbulancesPlacement,
  isAmbulanceBeforeCrash,
} from './engine/evaluator';
import { sfx } from './audio/sfx';
import {
  AdaptiveProfile,
  AdaptiveSkillId,
  AmbulancePlacement,
  CicuEvaluationReport,
  CicuTranscriptMessage,
  DeploymentPlacement,
  EvaluationResult,
  GameState,
  MeritMedal,
  MeritSessionState,
  ProtocolConsultMessage,
  ScenarioHistoryEntry,
  ScenarioSpec,
  SocraticTutorAnalysis,
  VehicleSelection,
} from './types/game';
import {
  getAdaptiveRecommendations,
  loadAdaptiveProfile,
  recordAttemptInAdaptiveProfile,
  resetAdaptiveProfile,
} from './engine/adaptiveTracker';
import {
  createInitialMeritSession,
  evaluateAttemptForMerit,
  finalizeSessionMedals,
  loadMeritMedals,
} from './engine/meritMedals';
import { RoadCanvas } from './components/RoadCanvas';
import { TitleScreen } from './components/TitleScreen';
import { TutorialOverlay } from './components/TutorialOverlay';
import { GameHUD } from './components/GameHUD';
import { DebriefModal } from './components/DebriefModal';
import { ScenarioSelectModal } from './components/ScenarioSelectModal';
import { ProtocolGuideModal } from './components/ProtocolGuideModal';
import { FinalReportModal } from './components/FinalReportModal';
import { CicuCallModal } from './components/CicuCallModal';
import { ScenarioGeneratorModal } from './components/ScenarioGeneratorModal';
import { AdaptivePracticeModal } from './components/AdaptivePracticeModal';
import { OfflineIndicator } from './components/PWAInstallControls';

function createInitialDeployment(sc: ScenarioSpec): DeploymentPlacement {
  return {
    ambulance: { ...sc.initialAmbulance },
    ambulance2: sc.initialSecondAmbulance ? { ...sc.initialSecondAmbulance } : undefined,
    fireTruck: sc.initialFireTruck ? { ...sc.initialFireTruck } : undefined,
    police: sc.initialPolice ? sc.initialPolice.map((p) => ({ ...p })) : [],
  };
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [returnState, setReturnState] = useState<GameState>('TITLE_MENU');
  const [tutorialCompleted, setTutorialCompleted] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('tes_tutorial_done') === '1';
    } catch {
      return false;
    }
  });
  const [tutorialStepIdx, setTutorialStepIdx] = useState<number>(0);
  const [tutorialPlacement, setTutorialPlacement] = useState<AmbulancePlacement>(
    TUTORIAL_STEPS[0].scenario.initialAmbulance
  );

  const [campaignLevel, setCampaignLevel] = useState<'BASIC' | 'ADVANCED'>('BASIC');
  const [isCampaign, setIsCampaign] = useState<boolean>(true);
  const [scenarioIdx, setScenarioIdx] = useState<number>(1);
  const [placement, setPlacement] = useState<AmbulancePlacement>(
    SCENARIOS[1].initialAmbulance
  );
  const [deployment, setDeployment] = useState<DeploymentPlacement>(
    createInitialDeployment(ADVANCED_SCENARIOS[0])
  );
  const [activeVehicle, setActiveVehicle] = useState<VehicleSelection>('POLICE_0');

  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [history, setHistory] = useState<ScenarioHistoryEntry[]>([]);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [guideTab, setGuideTab] = useState<'GUIDE' | 'CONSULTANT'>('GUIDE');
  const [consultantMessages, setConsultantMessages] = useState<ProtocolConsultMessage[]>([]);
  const [cicuModalOpen, setCicuModalOpen] = useState<boolean>(false);
  const [cicuStandalone, setCicuStandalone] = useState<boolean>(false);
  const [cicuStandaloneScenario, setCicuStandaloneScenario] = useState<ScenarioSpec>(
    SCENARIOS[0]
  );
  const [cicuReports, setCicuReports] = useState<Record<string, CicuEvaluationReport>>({});
  const [cicuTranscripts, setCicuTranscripts] = useState<
    Record<string, CicuTranscriptMessage[]>
  >({});
  const [tutorAnalysis, setTutorAnalysis] = useState<SocraticTutorAnalysis | null>(null);
  const [tutorLoading, setTutorLoading] = useState<boolean>(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const tutorReqIdRef = useRef<number>(0);
  const [customScenarios, setCustomScenarios] = useState<ScenarioSpec[]>(() => {
    try {
      const saved = window.localStorage.getItem('tes_custom_scenarios');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? (parsed as ScenarioSpec[]) : [];
    } catch {
      return [];
    }
  });
  const [activeCustomScenario, setActiveCustomScenario] = useState<ScenarioSpec | null>(null);
  const [generatorModalOpen, setGeneratorModalOpen] = useState<boolean>(false);
  const [adaptiveProfile, setAdaptiveProfile] = useState<AdaptiveProfile>(() =>
    loadAdaptiveProfile()
  );
  const [adaptiveModalOpen, setAdaptiveModalOpen] = useState<boolean>(false);
  const [adaptiveInitialSkill, setAdaptiveInitialSkill] = useState<AdaptiveSkillId | null>(
    null
  );
  const [meritMedals, setMeritMedals] = useState<MeritMedal[]>(() => loadMeritMedals());
  const [meritSession, setMeritSession] = useState<MeritSessionState>(() =>
    createInitialMeritSession()
  );
  const [meritLastOutcome, setMeritLastOutcome] = useState<{
    wasAdvanced: boolean;
    hadCriticalFailure: boolean;
    unlockedInSession: boolean;
  } | null>(null);
  const [sessionAwardedMedals, setSessionAwardedMedals] = useState<MeritMedal[]>([]);
  const [justAwardedMedals, setJustAwardedMedals] = useState<MeritMedal[]>([]);
  const [inspectingMap, setInspectingMap] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);

  const activeScenarioList =
    campaignLevel === 'ADVANCED' ? ADVANCED_SCENARIOS : SCENARIOS;
  const currentScenario =
    activeCustomScenario ?? activeScenarioList[scenarioIdx] ?? activeScenarioList[0];
  const currentTutorialStep = TUTORIAL_STEPS[tutorialStepIdx];

  useEffect(() => {
    try {
      window.localStorage.setItem('tes_custom_scenarios', JSON.stringify(customScenarios));
    } catch {
      // Ignore storage quota errors
    }
  }, [customScenarios]);

  const loadScenario = useCallback(
    (index: number, level: 'BASIC' | 'ADVANCED' = campaignLevel) => {
      const list = level === 'ADVANCED' ? ADVANCED_SCENARIOS : SCENARIOS;
      const target = list[index] ?? list[0];
      setActiveCustomScenario(null);
      setCampaignLevel(level);
      setScenarioIdx(index);
      setPlacement({ ...target.initialAmbulance });
      setDeployment(createInitialDeployment(target));
      setActiveVehicle(target.isAdvancedDeployment ? 'POLICE_0' : 'AMBULANCE');
      setEvaluation(null);
      setMeritLastOutcome(null);
      setJustAwardedMedals([]);
      tutorReqIdRef.current += 1;
      setTutorAnalysis(null);
      setTutorLoading(false);
      setTutorError(null);
      setInspectingMap(false);
      setGameState('PLAYING');
      sfx.playDispatch();
    },
    [campaignLevel]
  );

  const launchCustomScenario = useCallback((sc: ScenarioSpec) => {
    setCampaignLevel(sc.level === 'ADVANCED' ? 'ADVANCED' : 'BASIC');
    setActiveCustomScenario(sc);
    setIsCampaign(false);
    setHistory([]);
    setPlacement({ ...sc.initialAmbulance });
    setDeployment(createInitialDeployment(sc));
    setActiveVehicle(sc.isAdvancedDeployment ? 'POLICE_0' : 'AMBULANCE');
    setEvaluation(null);
    setMeritLastOutcome(null);
    setJustAwardedMedals([]);
    tutorReqIdRef.current += 1;
    setTutorAnalysis(null);
    setTutorLoading(false);
    setTutorError(null);
    setInspectingMap(false);
    setGameState('PLAYING');
    sfx.playDispatch();
  }, []);

  const handleGeneratedScenarioReady = useCallback(
    (sc: ScenarioSpec) => {
      setCustomScenarios((prev) => [sc, ...prev.filter((item) => item.id !== sc.id)].slice(0, 15));
      setGeneratorModalOpen(false);
      launchCustomScenario(sc);
    },
    [launchCustomScenario]
  );

  const handleDeleteCustomScenario = useCallback((id: string) => {
    sfx.playClick();
    setCustomScenarios((prev) => prev.filter((item) => item.id !== id));
    setActiveCustomScenario((prev) => (prev?.id === id ? null : prev));
  }, []);

  const handleStartTutorial = useCallback(() => {
    sfx.playDispatch();
    setActiveCustomScenario(null);
    setTutorialStepIdx(0);
    setTutorialPlacement({ ...TUTORIAL_STEPS[0].scenario.initialAmbulance });
    setGameState('TUTORIAL');
  }, []);

  const handleAdvanceTutorial = useCallback(() => {
    if (tutorialStepIdx + 1 < TUTORIAL_STEPS.length) {
      const nextIdx = tutorialStepIdx + 1;
      setTutorialStepIdx(nextIdx);
      setTutorialPlacement({ ...TUTORIAL_STEPS[nextIdx].scenario.initialAmbulance });
    } else {
      setTutorialCompleted(true);
      try {
        window.localStorage.setItem('tes_tutorial_done', '1');
      } catch {
        // Ignore storage errors
      }
      setIsCampaign(true);
      setHistory([]);
      loadScenario(0, 'BASIC');
    }
  }, [tutorialStepIdx, loadScenario]);

  const handleStartCampaign = useCallback(() => {
    setIsCampaign(true);
    setHistory([]);
    setSessionAwardedMedals([]);
    loadScenario(0, 'BASIC');
  }, [loadScenario]);

  const handleStartAdvanced = useCallback(() => {
    setIsCampaign(true);
    setHistory([]);
    setSessionAwardedMedals([]);
    loadScenario(0, 'ADVANCED');
  }, [loadScenario]);

  const handleSelectSingleScenario = useCallback(
    (sc: ScenarioSpec) => {
      if (sc.isCustom) {
        launchCustomScenario(sc);
        return;
      }
      const isAdv = sc.level === 'ADVANCED';
      const list = isAdv ? ADVANCED_SCENARIOS : SCENARIOS;
      const idx = Math.max(
        0,
        list.findIndex((item) => item.id === sc.id)
      );
      setIsCampaign(false);
      setHistory([]);
      loadScenario(idx, isAdv ? 'ADVANCED' : 'BASIC');
    },
    [loadScenario, launchCustomScenario]
  );

  const requestTutorAnalysis = useCallback(
    async (
      sc: ScenarioSpec,
      ev: EvaluationResult,
      ambPlacement: AmbulancePlacement,
      depPlacement: DeploymentPlacement
    ) => {
      tutorReqIdRef.current += 1;
      const myReqId = tutorReqIdRef.current;
      setTutorAnalysis(null);
      setTutorError(null);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setTutorLoading(false);
        setTutorError(
          'Modo sin cobertura: el tutor con IA requiere conexión. La evaluación técnica y los criterios locales arriba están completos.'
        );
        return;
      }

      setTutorLoading(true);

      const isMulti = Boolean(sc.isAdvancedDeployment || sc.initialSecondAmbulance);
      const activeAmb = isMulti ? depPlacement.ambulance : ambPlacement;
      const upm = sc.unitsPerMeter || 10;

      const secondAmbGap =
        isMulti && depPlacement.ambulance2
          ? computeTwoAmbulanceGapMeters(activeAmb, depPlacement.ambulance2, upm)
          : computeOtherAmbulanceDistanceMeters(activeAmb, sc);

      const secondAmbDist =
        isMulti && depPlacement.ambulance2
          ? computeDistanceMeters(depPlacement.ambulance2, sc)
          : null;

      const fireDist =
        sc.isAdvancedDeployment && depPlacement.fireTruck
          ? computeDistanceMeters(depPlacement.fireTruck, sc)
          : null;

      const policeSummary =
        sc.isAdvancedDeployment && depPlacement.police.length > 0
          ? depPlacement.police
              .map((p, i) => {
                const d = computeDistanceMeters(p, sc);
                const side = p.x < sc.crashPos.x ? 'antes' : 'después';
                return `Policía ${i + 1}: ${d} m ${side}, ${Math.round(p.angleDeg)}°`;
              })
              .join('; ')
          : null;

      const controller = new AbortController();
      const tid = window.setTimeout(() => controller.abort(), 16000);
      try {
        const resp = await fetch('/api/tutor/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            scenario: {
              title: sc.title,
              roadLabel: sc.roadLabel,
              trafficFlowLabel: sc.trafficFlowLabel,
              arrivalPhase: sc.arrivalPhase,
              isAdvancedDeployment: sc.isAdvancedDeployment,
              speedLimitKmh: sc.speedLimitKmh,
              isNight: sc.isNight,
              additionalHazard: sc.additionalHazard,
              briefing: sc.briefing,
              idealDistanceMeters: sc.idealDistanceMeters,
              idealAngleRange: sc.idealAngleRange,
              minHardDistanceMeters: sc.minHardDistanceMeters,
              minOtherAmbulanceSepMeters: sc.minOtherAmbulanceSepMeters,
            },
            telemetry: {
              distanceMeters: ev.distanceMeters,
              distanceReferenceLabel: sc.isAdvancedDeployment
                ? 'Camión de Bomberos'
                : 'Zona del accidente',
              isBeforeCrash: ev.isBeforeCrash,
              angleDeg: Math.round(activeAmb.angleDeg),
              lightsAllOn: activeAmb.lightsAllOn,
              hazardMarked: activeAmb.hazardMarked,
              ccuNotified: activeAmb.ccuNotified,
              secondAmbulanceGapMeters: secondAmbGap,
              secondAmbulanceDistanceMeters: secondAmbDist,
              secondAmbulanceAngleDeg: depPlacement.ambulance2
                ? Math.round(depPlacement.ambulance2.angleDeg)
                : null,
              fireTruckDistanceMeters: fireDist,
              fireTruckAngleDeg: depPlacement.fireTruck
                ? Math.round(depPlacement.fireTruck.angleDeg)
                : null,
              policeSummary,
            },
            evaluation: {
              totalScore: ev.totalScore,
              grade: ev.grade,
              headline: ev.headline,
              hasSightlineHazard: ev.hasSightlineHazard,
              hasSpacingHazard: ev.hasSpacingHazard,
              hasBlockedAccessHazard: ev.hasBlockedAccessHazard,
              criteria: ev.criteria.map((c) => ({
                label: c.label,
                score: c.score,
                maxScore: c.maxScore,
                status: c.status,
                feedback: c.feedback,
              })),
            },
          }),
        });
        const raw = await resp.text();
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('<')) {
          throw new Error('El tutor tardó demasiado en responder.');
        }
        const data = JSON.parse(trimmed) as SocraticTutorAnalysis & { error?: string };
        if (!resp.ok) {
          throw new Error(data.error || 'No se pudo obtener el análisis del tutor.');
        }
        if (tutorReqIdRef.current === myReqId) {
          setTutorAnalysis(data);
        }
      } catch (err) {
        if (tutorReqIdRef.current === myReqId) {
          setTutorError(
            err instanceof Error
              ? err.message
              : 'No se pudo generar el análisis socrático.'
          );
        }
      } finally {
        window.clearTimeout(tid);
        if (tutorReqIdRef.current === myReqId) {
          setTutorLoading(false);
        }
      }
    },
    []
  );

  const handleConfirmPlacement = useCallback(() => {
    if (gameState !== 'PLAYING') return;
    sfx.playConfirmLock();
    setInspectingMap(false);
    setGameState('SIMULATING');

    const result = currentScenario.isAdvancedDeployment
      ? evaluateAdvancedDeployment(deployment, currentScenario)
      : currentScenario.initialSecondAmbulance
        ? evaluateTwoAmbulancesPlacement(deployment, currentScenario)
        : evaluatePlacement(placement, currentScenario);
    setEvaluation(result);
    const adaptiveUpdate = recordAttemptInAdaptiveProfile(
      adaptiveProfile,
      currentScenario,
      result,
      placement,
      deployment
    );
    setAdaptiveProfile(adaptiveUpdate.nextProfile);
    const meritUpdate = evaluateAttemptForMerit(meritSession, currentScenario, result);
    setMeritSession(meritUpdate.nextSession);
    setMeritLastOutcome({
      wasAdvanced: meritUpdate.wasAdvanced,
      hadCriticalFailure: meritUpdate.hadCriticalFailure,
      unlockedInSession: Boolean(meritUpdate.unlockedInSession),
    });
    void requestTutorAnalysis(currentScenario, result, placement, deployment);

    const passedCriteria = result.criteria
      .filter((c) => c.status === 'SAFE')
      .map((c) => c.label);
    const failedCriteria = result.criteria
      .filter((c) => c.status !== 'SAFE')
      .map((c) => c.label);

    window.setTimeout(() => {
      sfx.playResult(result.grade);
      setHistory((prev) => {
        const existing = prev.find((item) => item.scenarioId === currentScenario.id);
        const prevFailedSet = new Set([
          ...(existing?.initialFailedCriteria ?? []),
          ...(existing?.failedCriteria ?? []),
        ]);
        const entry: ScenarioHistoryEntry = {
          scenarioId: currentScenario.id,
          title: currentScenario.title,
          roadLabel: currentScenario.roadLabel,
          arrivalPhase: currentScenario.arrivalPhase,
          score: result.totalScore,
          grade: result.grade,
          cicuScore: cicuReports[currentScenario.id]?.score,
          attemptsCount: (existing?.attemptsCount ?? 0) + 1,
          passedCriteria,
          failedCriteria,
          initialFailedCriteria: Array.from(prevFailedSet),
          detectedIssues: adaptiveUpdate.detectedIssuesThisAttempt,
        };
        const filtered = prev.filter((item) => item.scenarioId !== currentScenario.id);
        return [...filtered, entry];
      });
      setGameState('ROUND_SUMMARY');
    }, 1150);
  }, [
    gameState,
    placement,
    deployment,
    currentScenario,
    cicuReports,
    adaptiveProfile,
    meritSession,
    requestTutorAnalysis,
  ]);

  const handleRetryScenario = useCallback(() => {
    sfx.playClick();
    tutorReqIdRef.current += 1;
    setEvaluation(null);
    setMeritLastOutcome(null);
    setTutorAnalysis(null);
    setTutorLoading(false);
    setTutorError(null);
    setInspectingMap(false);
    setGameState('PLAYING');
  }, []);

  const handleEndSessionToTitle = useCallback(() => {
    sfx.playClick();
    const { nextMedals, newlyAssigned, nextSession } = finalizeSessionMedals(
      meritMedals,
      meritSession,
      true
    );
    const totalHighlighted = [...newlyAssigned, ...sessionAwardedMedals];
    if (newlyAssigned.length > 0) {
      setMeritMedals(nextMedals);
      sfx.playResult('SEGURO');
    }
    setMeritSession(nextSession);
    setMeritLastOutcome(null);
    setSessionAwardedMedals([]);
    setJustAwardedMedals(totalHighlighted);
    setCampaignLevel('BASIC');
    setScenarioIdx(1);
    setActiveCustomScenario(null);
    setGameState('TITLE_MENU');
  }, [meritMedals, meritSession, sessionAwardedMedals]);

  const handleNextScenario = useCallback(() => {
    sfx.playClick();
    setInspectingMap(false);
    if (isCampaign) {
      if (scenarioIdx + 1 < activeScenarioList.length) {
        loadScenario(scenarioIdx + 1, campaignLevel);
      } else {
        if (meritSession.pendingMedals.length > 0) {
          const { nextMedals, newlyAssigned, nextSession } = finalizeSessionMedals(
            meritMedals,
            meritSession,
            false
          );
          if (newlyAssigned.length > 0) {
            setMeritMedals(nextMedals);
            setSessionAwardedMedals((prev) => [...newlyAssigned, ...prev]);
          }
          setMeritSession(nextSession);
        }
        setGameState('FINAL_REPORT');
      }
    } else {
      const nextIdx = (scenarioIdx + 1) % activeScenarioList.length;
      loadScenario(nextIdx, campaignLevel);
    }
  }, [
    isCampaign,
    scenarioIdx,
    activeScenarioList.length,
    campaignLevel,
    loadScenario,
    meritMedals,
    meritSession,
  ]);

  const handleResetPosition = useCallback(() => {
    sfx.playClick();
    setPlacement({ ...currentScenario.initialAmbulance });
    setDeployment(createInitialDeployment(currentScenario));
    setActiveVehicle(currentScenario.isAdvancedDeployment ? 'POLICE_0' : 'AMBULANCE');
  }, [currentScenario]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
  }, [muted]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      if (adaptiveModalOpen) {
        if (e.key === 'Escape') setAdaptiveModalOpen(false);
        return;
      }

      if (generatorModalOpen) {
        if (e.key === 'Escape') setGeneratorModalOpen(false);
        return;
      }

      if (cicuModalOpen) {
        if (e.key === 'Escape') setCicuModalOpen(false);
        return;
      }

      if (showGuide) {
        if (e.key === 'Escape') setShowGuide(false);
        return;
      }

      if (gameState === 'TITLE_MENU') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartCampaign();
        }
        return;
      }

      if (gameState === 'TUTORIAL') {
        if (e.key === 'Escape') {
          setGameState('TITLE_MENU');
        }
        return;
      }

      if (gameState === 'PLAYING') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleConfirmPlacement();
        } else if (e.key === 'Escape') {
          setGameState('PAUSED');
        }
        return;
      }

      if (gameState === 'PAUSED' && e.key === 'Escape') {
        setGameState('PLAYING');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState,
    showGuide,
    cicuModalOpen,
    generatorModalOpen,
    adaptiveModalOpen,
    handleStartCampaign,
    handleConfirmPlacement,
  ]);

  const cumulativeScore = history.reduce((acc, item) => acc + item.score, 0);

  const demoPlacement: AmbulancePlacement = {
    x: 785,
    y: 445,
    angleDeg: 0,
    lightsAllOn: true,
    hazardMarked: true,
    ccuNotified: true,
  };

  const isMultiVehicleScenario = Boolean(
    currentScenario.isAdvancedDeployment || currentScenario.initialSecondAmbulance
  );

  const activeCanvasScenario =
    gameState === 'TUTORIAL'
      ? currentTutorialStep.scenario
      : gameState === 'TITLE_MENU'
        ? SCENARIOS[1]
        : currentScenario;

  const activeCanvasPlacement =
    gameState === 'TITLE_MENU'
      ? demoPlacement
      : gameState === 'TUTORIAL'
        ? tutorialPlacement
        : isMultiVehicleScenario
          ? deployment.ambulance
          : placement;

  const allScenarios = [...customScenarios, ...SCENARIOS, ...ADVANCED_SCENARIOS];

  const activePlacementSummary = (() => {
    const activeAmb = isMultiVehicleScenario ? deployment.ambulance : placement;
    const dist = computeDistanceMeters(activeAmb, currentScenario);
    const side = isAmbulanceBeforeCrash(activeAmb, currentScenario)
      ? 'antes (detrás)'
      : 'después (delante)';
    const parts = [
      `Ambulancia principal a ${dist.toFixed(1)} m ${side} del accidente`,
      `ángulo ${Math.round(activeAmb.angleDeg)}°`,
      activeAmb.lightsAllOn ? 'luces V-1 activadas' : 'luces V-1 apagadas',
      activeAmb.hazardMarked ? 'peligro señalizado' : 'sin señalización de peligro marcada',
    ];
    if (deployment.ambulance2 && isMultiVehicleScenario) {
      const dist2 = computeDistanceMeters(deployment.ambulance2, currentScenario);
      parts.push(`Ambulancia 2 a ${dist2.toFixed(1)} m`);
    }
    return parts.join(', ');
  })();

  const handleCicuReportUpdate = (
    scenarioId: string,
    nextReport: CicuEvaluationReport,
    nextTranscript: CicuTranscriptMessage[]
  ) => {
    setCicuReports((prev) => ({ ...prev, [scenarioId]: nextReport }));
    setCicuTranscripts((prev) => ({ ...prev, [scenarioId]: nextTranscript }));
    if (!cicuStandalone && nextReport.overallStatus === 'APROBADO') {
      if (isMultiVehicleScenario) {
        setDeployment((prev) => ({
          ...prev,
          ambulance: { ...prev.ambulance, ccuNotified: true },
        }));
      } else {
        setPlacement((prev) => ({ ...prev, ccuNotified: true }));
      }
    }
  };

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-slate-950 select-none">
      <div className="relative h-full w-full overflow-hidden">
        {/* Live 60fps 2D Tactical Road Canvas */}
      <RoadCanvas
        scenario={activeCanvasScenario}
        placement={activeCanvasPlacement}
        onChangePlacement={(next) => {
          if (gameState === 'TUTORIAL') {
            setTutorialPlacement(next);
          } else if (gameState === 'PLAYING') {
            setPlacement(next);
          }
        }}
        deployment={
          gameState !== 'TITLE_MENU' &&
          gameState !== 'TUTORIAL' &&
          isMultiVehicleScenario
            ? deployment
            : undefined
        }
        activeVehicle={activeVehicle}
        onSelectVehicle={setActiveVehicle}
        onChangeDeployment={setDeployment}
        interactive={gameState === 'PLAYING' || gameState === 'TUTORIAL'}
        evaluation={
          gameState === 'SIMULATING' || gameState === 'ROUND_SUMMARY'
            ? evaluation
            : null
        }
        isSimulating={gameState === 'SIMULATING'}
        isBackgroundDemo={gameState === 'TITLE_MENU'}
        showIdealGhost={gameState === 'ROUND_SUMMARY' && inspectingMap}
      />

      {/* Title Screen (scrollable on mobile with footer below content so nothing overlaps) */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto">
          <div className="flex-1">
            <TitleScreen
              scenarios={allScenarios}
              tutorialCompleted={tutorialCompleted}
              adaptiveProfile={adaptiveProfile}
              meritMedals={meritMedals}
              justAwardedMedals={justAwardedMedals}
              onStartTutorial={handleStartTutorial}
              onStartCampaign={handleStartCampaign}
              onStartAdvanced={handleStartAdvanced}
              onSelectSingleScenario={handleSelectSingleScenario}
              onOpenScenarioSelect={() => {
                sfx.playClick();
                setReturnState('TITLE_MENU');
                setGameState('SCENARIO_SELECT');
              }}
              onOpenGuide={() => {
                sfx.playClick();
                setGuideTab('GUIDE');
                setShowGuide(true);
              }}
              onOpenProtocolConsultant={() => {
                sfx.playClick();
                setGuideTab('CONSULTANT');
                setShowGuide(true);
              }}
              onOpenCicuSimulator={() => {
                sfx.playClick();
                setCicuStandalone(true);
                setCicuModalOpen(true);
              }}
              onOpenScenarioGenerator={() => {
                sfx.playClick();
                setGeneratorModalOpen(true);
              }}
              onOpenAdaptivePractice={(skillId) => {
                sfx.playClick();
                setAdaptiveInitialSkill(skillId ?? null);
                setAdaptiveModalOpen(true);
              }}
            />
          </div>
          <footer className="relative z-10 shrink-0 border-t border-slate-800/60 bg-slate-950/95 px-4 py-2 text-center text-[10px] leading-snug text-slate-500">
            <div className="mx-auto max-w-5xl">
              <p>
                Material didáctico para el aula de Técnico en Emergencias Sanitarias (TES). © 2026
                Noemí Celaya Mingot.
              </p>
              <p className="mt-0.5 text-slate-600">
                Esta aplicación educativa ha sido desarrollada por la autora con apoyo de herramientas
                de inteligencia artificial generativa (Google Gemini 4 Hydrogen) para tareas de
                programación, diseño y generación de contenidos. Los contenidos, actividades,
                criterios de evaluación y validación técnico pedagógica han sido revisados, adaptados
                y aprobados por la autora, quien asume la responsabilidad académica del material.
                Licencia: Creative Commons Reconocimiento-No Comercial-Sin Obra Derivada 4.0
                Internacional (CC BY-NC-ND 4.0).
              </p>
            </div>
          </footer>
        </div>
      )}

      {/* Interactive 3-Premise Guided Tutorial */}
      {gameState === 'TUTORIAL' && (
        <TutorialOverlay
          stepIndex={tutorialStepIdx}
          placement={tutorialPlacement}
          onChangePlacement={setTutorialPlacement}
          onNextStep={handleAdvanceTutorial}
          onExitTutorial={() => {
            sfx.playClick();
            setGameState('TITLE_MENU');
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {(gameState === 'PLAYING' || gameState === 'SIMULATING') && (
        <GameHUD
          scenario={currentScenario}
          scenarioIndex={scenarioIdx}
          totalScenarios={activeScenarioList.length}
          isCampaign={isCampaign}
          totalScore={cumulativeScore}
          placement={placement}
          onChangePlacement={(next) => setPlacement(next)}
          deployment={isMultiVehicleScenario ? deployment : undefined}
          activeVehicle={activeVehicle}
          onSelectVehicle={setActiveVehicle}
          onChangeDeployment={setDeployment}
          onConfirm={handleConfirmPlacement}
          onResetPosition={handleResetPosition}
          onOpenGuide={() => {
            sfx.playClick();
            setGuideTab('GUIDE');
            setShowGuide(true);
          }}
          onOpenConsultant={() => {
            sfx.playClick();
            setGuideTab('CONSULTANT');
            setShowGuide(true);
          }}
          onPause={() => {
            sfx.playClick();
            setGameState('PAUSED');
          }}
          onOpenCicuCall={() => {
            setCicuStandalone(false);
            setCicuModalOpen(true);
          }}
          cicuReport={cicuReports[currentScenario.id] ?? null}
          meritSession={meritSession}
          muted={muted}
          onToggleMute={handleToggleMute}
          disabled={gameState === 'SIMULATING'}
        />
      )}

      {/* Map Comparison Top Floating Bar when inspecting correct solution */}
      {gameState === 'ROUND_SUMMARY' && inspectingMap && evaluation && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-2 sm:top-4 sm:px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/50 bg-slate-900/95 px-3 py-2 shadow-2xl sm:gap-4 sm:px-5 sm:py-3">
            <div className="text-[11px] leading-snug text-slate-200 sm:text-xs">
              <strong className="font-semibold text-emerald-400">
                Silueta verde:{' '}
                {currentScenario.isAdvancedDeployment
                  ? 'despliegue recomendado'
                  : currentScenario.initialSecondAmbulance
                    ? 'posiciones recomendadas'
                    : 'posición recomendada'}
              </strong>
              <span className="mx-1.5 text-slate-600 sm:mx-2">·</span>
              <span>
                {currentScenario.isAdvancedDeployment
                  ? 'Vehículos sólidos: tu despliegue actual'
                  : currentScenario.initialSecondAmbulance
                    ? 'Ambulancias blancas: tu intento actual'
                    : 'Ambulancia blanca: tu intento actual'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setInspectingMap(false);
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0 sm:px-3.5"
              >
                Volver a la explicación
              </button>
              <button
                type="button"
                onClick={handleRetryScenario}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 whitespace-nowrap shrink-0 sm:px-3.5"
              >
                Reintentar escenario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Menu Modal */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4">
          <div className="max-h-[88dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-6">
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
              Simulación en pausa
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {currentScenario.title} · {currentScenario.roadLabel}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setGameState('PLAYING');
                }}
                className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
              >
                Reanudar escenario
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setReturnState('PAUSED');
                  setGameState('SCENARIO_SELECT');
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                Cambiar escenario
              </button>
              <button
                type="button"
                onClick={handleEndSessionToTitle}
                className="w-full rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Salir al menú principal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round Debrief Modal */}
      {gameState === 'ROUND_SUMMARY' && evaluation && !inspectingMap && (
        <DebriefModal
          scenario={currentScenario}
          evaluation={evaluation}
          cicuReport={cicuReports[currentScenario.id] ?? null}
          tutorAnalysis={tutorAnalysis}
          tutorLoading={tutorLoading}
          tutorError={tutorError}
          onRetryTutor={() =>
            void requestTutorAnalysis(currentScenario, evaluation, placement, deployment)
          }
          adaptiveTopWeakness={getAdaptiveRecommendations(adaptiveProfile).topTarget}
          onOpenAdaptivePractice={(skillId) => {
            sfx.playClick();
            setAdaptiveInitialSkill(skillId ?? null);
            setAdaptiveModalOpen(true);
          }}
          meritSession={meritSession}
          meritLastOutcome={meritLastOutcome}
          onFinishSession={handleEndSessionToTitle}
          isLastScenario={scenarioIdx === activeScenarioList.length - 1}
          isCampaign={isCampaign}
          onRetry={handleRetryScenario}
          onNext={handleNextScenario}
          onInspectMap={() => {
            sfx.playClick();
            setInspectingMap(true);
          }}
          onBackToMenu={() => {
            sfx.playClick();
            setReturnState('ROUND_SUMMARY');
            setGameState('SCENARIO_SELECT');
          }}
        />
      )}

      {/* Scenario Selector Modal */}
      {gameState === 'SCENARIO_SELECT' && (
        <ScenarioSelectModal
          scenarios={allScenarios}
          onSelectScenario={handleSelectSingleScenario}
          onOpenGenerator={() => {
            sfx.playClick();
            setGeneratorModalOpen(true);
          }}
          onDeleteCustomScenario={handleDeleteCustomScenario}
          onClose={() => {
            sfx.playClick();
            setGameState(returnState);
          }}
        />
      )}

      {/* Final Campaign Report Modal */}
      {gameState === 'FINAL_REPORT' && (
        <FinalReportModal
          history={history}
          campaignLevel={campaignLevel}
          adaptiveProfile={adaptiveProfile}
          meritSession={meritSession}
          sessionAwardedMedals={sessionAwardedMedals}
          onContinueFifthAdvanced={() => {
            sfx.playClick();
            setIsCampaign(false);
            loadScenario(0, 'ADVANCED');
          }}
          onOpenAdaptivePractice={(skillId) => {
            sfx.playClick();
            setAdaptiveInitialSkill(skillId ?? null);
            setAdaptiveModalOpen(true);
          }}
          onRestartCampaign={
            campaignLevel === 'ADVANCED' ? handleStartAdvanced : handleStartCampaign
          }
          onStartAdvanced={handleStartAdvanced}
          onOpenScenarioSelect={() => {
            sfx.playClick();
            setReturnState('FINAL_REPORT');
            setGameState('SCENARIO_SELECT');
          }}
          onBackToTitle={handleEndSessionToTitle}
        />
      )}

      {/* Quick Protocol Guide & Fast Consultant Modal */}
      {showGuide && (
        <ProtocolGuideModal
          initialTab={guideTab}
          messages={consultantMessages}
          onUpdateMessages={setConsultantMessages}
          activeScenario={
            gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'ROUND_SUMMARY'
              ? currentScenario
              : null
          }
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* CICU Radio Call Simulator (LCANS Method) */}
      {cicuModalOpen && (
        <CicuCallModal
          scenario={cicuStandalone ? cicuStandaloneScenario : currentScenario}
          allScenarios={allScenarios}
          standalone={cicuStandalone}
          placementSummary={cicuStandalone ? undefined : activePlacementSummary}
          initialReport={
            cicuReports[
              (cicuStandalone ? cicuStandaloneScenario : currentScenario).id
            ] ?? null
          }
          initialTranscript={
            cicuTranscripts[
              (cicuStandalone ? cicuStandaloneScenario : currentScenario).id
            ]
          }
          onScenarioChange={(sc) => setCicuStandaloneScenario(sc)}
          onReportUpdate={handleCicuReportUpdate}
          onClose={() => setCicuModalOpen(false)}
        />
      )}

      {/* Teacher Custom AI Scenario Generator Modal */}
      {generatorModalOpen && (
        <ScenarioGeneratorModal
          onScenarioReady={handleGeneratedScenarioReady}
          onClose={() => setGeneratorModalOpen(false)}
        />
      )}

      {/* Adaptive Practice & Recurring Mistakes Trainer Modal */}
      {adaptiveModalOpen && (
        <AdaptivePracticeModal
          profile={adaptiveProfile}
          initialSkillId={adaptiveInitialSkill}
          onStartGeneratedAdaptiveScenario={(sc) => {
            setAdaptiveModalOpen(false);
            handleGeneratedScenarioReady(sc);
          }}
          onStartFallbackScenarioById={(id) => {
            const target = [...SCENARIOS, ...ADVANCED_SCENARIOS].find((s) => s.id === id);
            setAdaptiveModalOpen(false);
            if (target) {
              handleSelectSingleScenario(target);
            }
          }}
          onResetProfile={() => {
            sfx.playClick();
            setAdaptiveProfile(resetAdaptiveProfile());
          }}
          onClose={() => setAdaptiveModalOpen(false)}
        />
      )}
      </div>

      {/* Discrete Footer Visible on Other Screens (covered by active HUD dock if vertical space is tight) */}
      {gameState !== 'TITLE_MENU' && (
        <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-slate-800/60 bg-slate-950/90 px-3 py-1.5 text-center text-[9px] leading-snug text-slate-500 sm:px-4 sm:text-[10px]">
          <div className="mx-auto max-w-5xl">
            <p>
              Material didáctico para el aula de Técnico en Emergencias Sanitarias (TES). © 2026
              Noemí Celaya Mingot.
            </p>
            <p className="mt-0.5 text-slate-600">
              Esta aplicación educativa ha sido desarrollada por la autora con apoyo de herramientas
              de inteligencia artificial generativa (Google Gemini 4 Hydrogen) para tareas de
              programación, diseño y generación de contenidos. Los contenidos, actividades,
              criterios de evaluación y validación técnico pedagógica han sido revisados, adaptados y
              aprobados por la autora, quien asume la responsabilidad académica del material.
              Licencia: Creative Commons Reconocimiento-No Comercial-Sin Obra Derivada 4.0
              Internacional (CC BY-NC-ND 4.0).
            </p>
          </div>
        </footer>
      )}
      {/* Offline Status Indicator */}
      <OfflineIndicator />
    </main>
  );
}
