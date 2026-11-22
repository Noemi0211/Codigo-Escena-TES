import {
  EvaluationResult,
  MeritMedal,
  MeritSessionState,
  ScenarioSpec,
} from '../types/game';

const MEDALS_STORAGE_KEY = 'tes_merit_medals_v1';
export const MERIT_REQUIRED_STREAK = 5;

export function createInitialMeritSession(): MeritSessionState {
  return {
    currentStreak: 0,
    streakScores: [],
    streakScenarioTitles: [],
    pendingMedals: [],
  };
}

export function loadMeritMedals(): MeritMedal[] {
  try {
    const raw = window.localStorage.getItem(MEDALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is MeritMedal =>
        Boolean(m) &&
        typeof m.id === 'string' &&
        typeof m.earnedAt === 'number' &&
        typeof m.avgScore === 'number' &&
        typeof m.label === 'string'
    );
  } catch {
    return [];
  }
}

export function saveMeritMedals(medals: MeritMedal[]): void {
  try {
    window.localStorage.setItem(MEDALS_STORAGE_KEY, JSON.stringify(medals));
  } catch {
    // Ignore storage quota errors
  }
}

export function isScenarioAdvanced(scenario: ScenarioSpec): boolean {
  return scenario.level === 'ADVANCED' || Boolean(scenario.isAdvancedDeployment);
}

export function hasCriticalEvaluationFailure(evaluation: EvaluationResult): boolean {
  return (
    evaluation.grade === 'RIESGO_CRITICO' ||
    evaluation.criteria.some((c) => c.status === 'CRITICAL')
  );
}

export function evaluateAttemptForMerit(
  prevSession: MeritSessionState,
  scenario: ScenarioSpec,
  evaluation: EvaluationResult
): {
  nextSession: MeritSessionState;
  wasAdvanced: boolean;
  hadCriticalFailure: boolean;
  unlockedInSession: MeritMedal | null;
} {
  const wasAdvanced = isScenarioAdvanced(scenario);

  if (!wasAdvanced) {
    return {
      nextSession: {
        ...prevSession,
        currentStreak: 0,
        streakScores: [],
        streakScenarioTitles: [],
      },
      wasAdvanced: false,
      hadCriticalFailure: false,
      unlockedInSession: null,
    };
  }

  const hadCriticalFailure = hasCriticalEvaluationFailure(evaluation);
  if (hadCriticalFailure) {
    return {
      nextSession: {
        ...prevSession,
        currentStreak: 0,
        streakScores: [],
        streakScenarioTitles: [],
      },
      wasAdvanced: true,
      hadCriticalFailure: true,
      unlockedInSession: null,
    };
  }

  const nextStreak = prevSession.currentStreak + 1;
  const nextScores = [...prevSession.streakScores, evaluation.totalScore];
  const nextTitles = [...prevSession.streakScenarioTitles, scenario.title];

  if (nextStreak >= MERIT_REQUIRED_STREAK) {
    const avgScore = Math.round(
      nextScores.reduce((acc, s) => acc + s, 0) / nextScores.length
    );
    const medal: MeritMedal = {
      id: `medal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      earnedAt: Date.now(),
      streakLength: MERIT_REQUIRED_STREAK,
      avgScore,
      scenarioTitles: nextTitles.slice(0, MERIT_REQUIRED_STREAK),
      label:
        avgScore >= 90
          ? 'Medalla al Mérito · Excelencia Táctica TES'
          : 'Medalla al Mérito · Despliegue Avanzado TES',
    };

    return {
      nextSession: {
        currentStreak: 0,
        streakScores: [],
        streakScenarioTitles: [],
        pendingMedals: [...prevSession.pendingMedals, medal],
      },
      wasAdvanced: true,
      hadCriticalFailure: false,
      unlockedInSession: medal,
    };
  }

  return {
    nextSession: {
      ...prevSession,
      currentStreak: nextStreak,
      streakScores: nextScores,
      streakScenarioTitles: nextTitles,
    },
    wasAdvanced: true,
    hadCriticalFailure: false,
    unlockedInSession: null,
  };
}

export function finalizeSessionMedals(
  existingMedals: MeritMedal[],
  session: MeritSessionState,
  resetStreak = true
): {
  nextMedals: MeritMedal[];
  newlyAssigned: MeritMedal[];
  nextSession: MeritSessionState;
} {
  const newlyAssigned = session.pendingMedals;
  if (newlyAssigned.length === 0) {
    return {
      nextMedals: existingMedals,
      newlyAssigned: [],
      nextSession: resetStreak ? createInitialMeritSession() : session,
    };
  }

  const nextMedals = [...newlyAssigned.slice().reverse(), ...existingMedals].slice(0, 24);
  saveMeritMedals(nextMedals);

  return {
    nextMedals,
    newlyAssigned,
    nextSession: resetStreak
      ? createInitialMeritSession()
      : { ...session, pendingMedals: [] },
  };
}
