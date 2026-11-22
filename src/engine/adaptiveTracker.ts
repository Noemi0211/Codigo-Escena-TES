import {
  AdaptiveProfile,
  AdaptiveSkillId,
  AdaptiveSkillStat,
  AmbulancePlacement,
  DeploymentPlacement,
  EvaluationResult,
  ScenarioSpec,
} from '../types/game';
import { computeOtherAmbulanceDistanceMeters, computeTwoAmbulanceGapMeters } from './evaluator';

const STORAGE_KEY = 'tes_adaptive_profile_v1';

export interface AdaptiveSkillMeta {
  id: AdaptiveSkillId;
  label: string;
  shortLabel: string;
  description: string;
  protocolRule: string;
  fallbackScenarioId: string;
}

export const ADAPTIVE_SKILL_LIST: AdaptiveSkillMeta[] = [
  {
    id: 'ADR_FIRE_DISTANCE',
    label: 'Distancias críticas en incendios y ADR',
    shortLabel: 'Distancias ADR / Fuego',
    description:
      'Respetar al menos 75 m ante vehículos incendiados o fugas de combustible y > 500 m ante mercancías peligrosas (ADR).',
    protocolRule: '≥ 75 m en incendios/fugas de combustible · > 500 m en ADR · aviso urgente al CCU.',
    fallbackScenarioId: 'incendio_primero',
  },
  {
    id: 'DEFENSIVE_ANGLE',
    label: 'Ángulo defensivo de 30°–45° en primera llegada',
    shortLabel: 'Ángulo defensivo 30°–45°',
    description:
      'Orientar el frontal de la ambulancia entre 30° y 45° hacia la mediana o centro de la vía para proteger la zona trasera y lateral del equipo.',
    protocolRule: 'Giro -30° a -45° hacia la mediana cuando actuamos como primer interviniente.',
    fallbackScenarioId: 'autovia_primero',
  },
  {
    id: 'FIRE_POLICE_SPACING',
    label: 'No bloquear a Bomberos y coordinar Policía',
    shortLabel: 'Espacio Bomberos / Policía',
    description:
      'En vías ya aseguradas, respetar la zona de Bomberos (5–10 m detrás a ~30°), no solaparse con ellos y cubrir con Policía antes (y después en doble sentido).',
    protocolRule: 'Bomberos 5–10 m detrás a 30° · Ambulancia 10–15 m respecto a Bomberos o por delante.',
    fallbackScenarioId: 'avanzado_convencional_doble',
  },
  {
    id: 'TWO_AMBULANCE_GAP',
    label: 'Separación mínima entre dos ambulancias (≥ 2,5 m)',
    shortLabel: 'Separación ≥ 2,5 m',
    description:
      'Cuando intervienen dos o más ambulancias, dejar al menos 2,5 metros libres entre vehículos para permitir apertura de puertas, camilla y evacuación.',
    protocolRule: 'Mantener ≥ 2,5 m de separación libre entre ambulancias sin solapamientos.',
    fallbackScenarioId: 'autovia_estandar',
  },
  {
    id: 'VISIBILITY_HAZARD',
    label: 'Visibilidad limitada, curvas, túneles y lluvia/niebla',
    shortLabel: 'Visibilidad y meteorología',
    description:
      'Detenerse ANTES de curvas ciegas o bocas de túnel y ampliar la distancia de seguridad (35–50 m) bajo lluvia intensa o niebla.',
    protocolRule: 'Estacionar antes del punto conflictivo visible y ampliar distancia con firme deslizante.',
    fallbackScenarioId: 'curva_ciega_primero',
  },
  {
    id: 'OPERATIONAL_EXIT',
    label: 'Salida operativa en paralelo (0°) por delante',
    shortLabel: 'Salida operativa (0°)',
    description:
      'En estacionamiento estándar por delante del siniestro, alinear la ambulancia paralela (0°) a 10–15 m para reincorporarse al tráfico sin maniobras.',
    protocolRule: '10–15 m por delante del accidente, paralela (0°) y con salida expedita.',
    fallbackScenarioId: 'convencional_estandar',
  },
  {
    id: 'LANE_DISCIPLINE',
    label: 'Respeto de carriles, pasos de peatones y bocacalles',
    shortLabel: 'Carriles y accesos',
    description:
      'No invadir el carril contrario ni bloquear el carril izquierdo de acceso prioritario, pasos de peatones o bocacalles laterales.',
    protocolRule: 'Dejar libre el carril contrario/izquierdo y despejar pasos de cebra y cruces.',
    fallbackScenarioId: 'urbana_estandar',
  },
  {
    id: 'SIGNALING_AND_CCU',
    label: 'Luces V-1, balizamiento y aviso al CICU/CCU',
    shortLabel: 'V-1, balizas y CICU',
    description:
      'Activar todas las señales luminosas, señalizar el peligro de forma visible y comunicar la valoración e incidentes al Centro Coordinador.',
    protocolRule: 'Activar V-1 completas, balizar el peligro y avisar inmediatamente al CICU/CCU.',
    fallbackScenarioId: 'lluvia_niebla_primero',
  },
];

export const ADAPTIVE_SKILL_MAP: Record<AdaptiveSkillId, AdaptiveSkillMeta> =
  ADAPTIVE_SKILL_LIST.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<AdaptiveSkillId, AdaptiveSkillMeta>
  );

export function createInitialAdaptiveProfile(): AdaptiveProfile {
  const skills = {} as Record<AdaptiveSkillId, AdaptiveSkillStat>;
  for (const item of ADAPTIVE_SKILL_LIST) {
    skills[item.id] = {
      skillId: item.id,
      attempts: 0,
      failures: 0,
      criticals: 0,
      weightedMistakes: 0,
      recentStreakOk: 0,
      lastSeenAt: 0,
    };
  }
  return {
    totalAttempts: 0,
    skills,
    recentIssues: [],
  };
}

export function loadAdaptiveProfile(): AdaptiveProfile {
  const base = createInitialAdaptiveProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AdaptiveProfile>;
    if (!parsed || typeof parsed !== 'object') return base;
    const mergedSkills = { ...base.skills };
    if (parsed.skills && typeof parsed.skills === 'object') {
      for (const item of ADAPTIVE_SKILL_LIST) {
        const s = (parsed.skills as Record<string, Partial<AdaptiveSkillStat>>)[item.id];
        if (s && typeof s === 'object') {
          mergedSkills[item.id] = {
            skillId: item.id,
            attempts: Number(s.attempts) || 0,
            failures: Number(s.failures) || 0,
            criticals: Number(s.criticals) || 0,
            weightedMistakes: Number(s.weightedMistakes) || 0,
            recentStreakOk: Number(s.recentStreakOk) || 0,
            lastSeenAt: Number(s.lastSeenAt) || 0,
            lastIssueDetail: typeof s.lastIssueDetail === 'string' ? s.lastIssueDetail : undefined,
          };
        }
      }
    }
    return {
      totalAttempts: Number(parsed.totalAttempts) || 0,
      skills: mergedSkills,
      recentIssues: Array.isArray(parsed.recentIssues)
        ? parsed.recentIssues.filter((x): x is string => typeof x === 'string').slice(0, 15)
        : [],
    };
  } catch {
    return base;
  }
}

export function saveAdaptiveProfile(profile: AdaptiveProfile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors
  }
}

export function resetAdaptiveProfile(): AdaptiveProfile {
  const fresh = createInitialAdaptiveProfile();
  saveAdaptiveProfile(fresh);
  return fresh;
}

export function recordAttemptInAdaptiveProfile(
  prev: AdaptiveProfile,
  scenario: ScenarioSpec,
  evaluation: EvaluationResult,
  placement: AmbulancePlacement,
  deployment: DeploymentPlacement
): { nextProfile: AdaptiveProfile; detectedIssuesThisAttempt: AdaptiveSkillId[] } {
  const nextSkills: Record<AdaptiveSkillId, AdaptiveSkillStat> = { ...prev.skills };
  const now = Date.now();
  const isMulti = Boolean(scenario.isAdvancedDeployment || scenario.initialSecondAmbulance);
  const activeAmb = isMulti ? deployment.ambulance : placement;
  const upm = scenario.unitsPerMeter || 10;

  const findCrit = (id: string) => evaluation.criteria.find((c) => c.id === id);
  const posCrit = findCrit('position');
  const distCrit = findCrit('distance');
  const orientCrit = findCrit('orientation');
  const protoCrit = findCrit('protocol_actions');
  const advAmbCrit = findCrit('adv_ambulance');
  const advFireCrit = findCrit('adv_fire');
  const advPoliceCrit = findCrit('adv_police');

  const outcomes: Array<{
    skillId: AdaptiveSkillId;
    tested: boolean;
    failed: boolean;
    critical: boolean;
    detail?: string;
  }> = [];

  // 1. ADR / Fire distance
  const isFireOrAdr = Boolean(
    scenario.minHardDistanceMeters !== undefined ||
      scenario.additionalHazard === 'FIRE' ||
      scenario.additionalHazard === 'HAZMAT' ||
      scenario.roadType === 'FIRE_HAZARD' ||
      scenario.roadType === 'ADR_HAZMAT'
  );
  const adrFireFailed =
    isFireOrAdr &&
    ((distCrit && distCrit.status !== 'SAFE') ||
      (posCrit && posCrit.status !== 'SAFE') ||
      !activeAmb.ccuNotified);
  outcomes.push({
    skillId: 'ADR_FIRE_DISTANCE',
    tested: isFireOrAdr,
    failed: Boolean(adrFireFailed),
    critical: Boolean(
      isFireOrAdr &&
        (distCrit?.status === 'CRITICAL' || posCrit?.status === 'CRITICAL' || !activeAmb.ccuNotified)
    ),
    detail: adrFireFailed
      ? `${scenario.title}: distancia registrada ${Math.round(evaluation.distanceMeters)} m (mín. ${scenario.minHardDistanceMeters ?? 75} m)`
      : undefined,
  });

  // 2. Defensive angle 30-45 deg
  const wedgeTested = Boolean(scenario.expectsWedge);
  const wedgeFailed = wedgeTested && Boolean(orientCrit && orientCrit.status !== 'SAFE');
  outcomes.push({
    skillId: 'DEFENSIVE_ANGLE',
    tested: wedgeTested,
    failed: wedgeFailed,
    critical: Boolean(wedgeTested && orientCrit?.status === 'CRITICAL'),
    detail: wedgeFailed
      ? `${scenario.title}: ángulo ${Math.round(activeAmb.angleDeg)}° en lugar de cuña -30° a -45°`
      : undefined,
  });

  // 3. Operational parallel exit (0 deg)
  const exitTested = !scenario.expectsWedge;
  const exitFailed =
    exitTested &&
    Boolean(
      (orientCrit && orientCrit.status !== 'SAFE') ||
        (advAmbCrit && advAmbCrit.status !== 'SAFE' && Math.abs(activeAmb.angleDeg) > 12)
    );
  outcomes.push({
    skillId: 'OPERATIONAL_EXIT',
    tested: exitTested,
    failed: exitFailed,
    critical: Boolean(
      exitTested &&
        (orientCrit?.status === 'CRITICAL' ||
          (advAmbCrit?.status === 'CRITICAL' && Math.abs(activeAmb.angleDeg) > 22))
    ),
    detail: exitFailed
      ? `${scenario.title}: orientación ${Math.round(activeAmb.angleDeg)}° en lugar de paralelo (0°)`
      : undefined,
  });

  // 4. Fire / Police spacing & coordination
  const firePoliceTested = Boolean(
    scenario.isAdvancedDeployment ||
      scenario.arrivalPhase === 'STANDARD_SECURED' ||
      scenario.fireTruckPos ||
      scenario.policePositions.length > 0
  );
  const advFirePoliceFail = Boolean(
    scenario.isAdvancedDeployment &&
      ((advFireCrit && advFireCrit.status !== 'SAFE') ||
        (advPoliceCrit && advPoliceCrit.status !== 'SAFE') ||
        (advAmbCrit &&
          advAmbCrit.feedback.toLowerCase().includes('bomberos') &&
          advAmbCrit.status !== 'SAFE'))
  );
  const stdBehindFail = Boolean(
    !scenario.isAdvancedDeployment &&
      scenario.arrivalPhase === 'STANDARD_SECURED' &&
      posCrit &&
      posCrit.status !== 'SAFE' &&
      evaluation.isBeforeCrash
  );
  const firePoliceFailed = firePoliceTested && (advFirePoliceFail || stdBehindFail);
  outcomes.push({
    skillId: 'FIRE_POLICE_SPACING',
    tested: firePoliceTested,
    failed: firePoliceFailed,
    critical: Boolean(
      firePoliceTested &&
        (advFireCrit?.status === 'CRITICAL' ||
          advPoliceCrit?.status === 'CRITICAL' ||
          stdBehindFail)
    ),
    detail: firePoliceFailed
      ? `${scenario.title}: interferencia con zona de Bomberos o despliegue policial`
      : undefined,
  });

  // 5. Minimum 2.5m gap between 2 ambulances
  const twoAmbTested = Boolean(
    scenario.initialSecondAmbulance ||
      scenario.minOtherAmbulanceSepMeters !== undefined ||
      scenario.otherAmbulancePos
  );
  let gapMeters: number | null = null;
  if (twoAmbTested) {
    if (deployment.ambulance2) {
      gapMeters = computeTwoAmbulanceGapMeters(activeAmb, deployment.ambulance2, upm);
    } else {
      gapMeters = computeOtherAmbulanceDistanceMeters(activeAmb, scenario);
    }
  }
  const gapFailed = Boolean(
    twoAmbTested && ((gapMeters !== null && gapMeters < 2.5) || evaluation.hasSpacingHazard)
  );
  outcomes.push({
    skillId: 'TWO_AMBULANCE_GAP',
    tested: twoAmbTested,
    failed: gapFailed,
    critical: Boolean(gapFailed && gapMeters !== null && gapMeters < 1.5),
    detail: gapFailed
      ? `${scenario.title}: separación entre ambulancias ${gapMeters !== null ? `${gapMeters.toFixed(1)} m` : 'insuficiente'} (< 2,5 m)`
      : undefined,
  });

  // 6. Limited visibility & adverse weather
  const visTested = Boolean(
    scenario.roadType === 'BLIND_CURVE' ||
      scenario.roadType === 'TUNNEL_PORTAL' ||
      scenario.roadType === 'ADVERSE_WEATHER' ||
      scenario.hasAdverseWeather ||
      scenario.additionalHazard === 'LIMITED_VISIBILITY' ||
      scenario.additionalHazard === 'ADVERSE_WEATHER'
  );
  const visFailed = Boolean(
    visTested &&
      (evaluation.hasSightlineHazard ||
        (!isFireOrAdr &&
          ((posCrit && posCrit.status !== 'SAFE') || (distCrit && distCrit.status !== 'SAFE'))))
  );
  outcomes.push({
    skillId: 'VISIBILITY_HAZARD',
    tested: visTested,
    failed: visFailed,
    critical: Boolean(
      visTested &&
        (evaluation.hasSightlineHazard ||
          posCrit?.status === 'CRITICAL' ||
          distCrit?.status === 'CRITICAL')
    ),
    detail: visFailed
      ? `${scenario.title}: exposición por baja visibilidad / curva / túnel / meteorología`
      : undefined,
  });

  // 7. Signaling & CCU
  const protoTested = true;
  const protoFailed = Boolean(
    (protoCrit && protoCrit.status !== 'SAFE') ||
      !activeAmb.lightsAllOn ||
      (!scenario.isAdvancedDeployment && !activeAmb.hazardMarked) ||
      ((scenario.arrivalPhase === 'FIRST_RESPONDER' || isFireOrAdr) && !activeAmb.ccuNotified)
  );
  outcomes.push({
    skillId: 'SIGNALING_AND_CCU',
    tested: protoTested,
    failed: protoFailed,
    critical: Boolean(
      protoCrit?.status === 'CRITICAL' ||
        ((scenario.arrivalPhase === 'FIRST_RESPONDER' || isFireOrAdr) && !activeAmb.ccuNotified)
    ),
    detail: protoFailed
      ? `${scenario.title}: faltó completar luces V-1, señalización o aviso al CICU/CCU`
      : undefined,
  });

  // 8. Lane & access discipline
  const laneFailed = Boolean(evaluation.hasBlockedAccessHazard);
  outcomes.push({
    skillId: 'LANE_DISCIPLINE',
    tested: true,
    failed: laneFailed,
    critical: laneFailed,
    detail: laneFailed
      ? `${scenario.title}: invasión de carril contrario/izquierdo o bloqueo de paso/bocacalle`
      : undefined,
  });

  const detectedIssuesThisAttempt: AdaptiveSkillId[] = [];
  const newIssueLogs: string[] = [];

  for (const out of outcomes) {
    if (!out.tested) continue;
    const prevStat = nextSkills[out.skillId];
    if (out.failed) {
      detectedIssuesThisAttempt.push(out.skillId);
      if (out.detail) newIssueLogs.push(out.detail);
      nextSkills[out.skillId] = {
        ...prevStat,
        attempts: prevStat.attempts + 1,
        failures: prevStat.failures + 1,
        criticals: prevStat.criticals + (out.critical ? 1 : 0),
        weightedMistakes: prevStat.weightedMistakes + (out.critical ? 2 : 1),
        recentStreakOk: 0,
        lastSeenAt: now,
        lastIssueDetail: out.detail || prevStat.lastIssueDetail,
      };
    } else {
      nextSkills[out.skillId] = {
        ...prevStat,
        attempts: prevStat.attempts + 1,
        recentStreakOk: prevStat.recentStreakOk + 1,
        lastSeenAt: now,
      };
    }
  }

  const nextProfile: AdaptiveProfile = {
    totalAttempts: prev.totalAttempts + 1,
    skills: nextSkills,
    recentIssues: [...newIssueLogs, ...prev.recentIssues].slice(0, 15),
  };

  saveAdaptiveProfile(nextProfile);
  return { nextProfile, detectedIssuesThisAttempt };
}

export interface AdaptiveSkillRanking {
  meta: AdaptiveSkillMeta;
  stat: AdaptiveSkillStat;
  priorityScore: number;
  status: 'RECURRENT_WEAKNESS' | 'NEEDS_PRACTICE' | 'MASTERED' | 'NOT_TESTED';
}

export function getAdaptiveRecommendations(profile: AdaptiveProfile): {
  ranked: AdaptiveSkillRanking[];
  topTarget: AdaptiveSkillRanking | null;
  hasRecurringMistake: boolean;
} {
  const ranked: AdaptiveSkillRanking[] = ADAPTIVE_SKILL_LIST.map((meta) => {
    const stat = profile.skills[meta.id];
    const effectiveDebt = Math.max(0, stat.weightedMistakes - stat.recentStreakOk * 1.5);
    const isMastered = stat.attempts > 0 && (stat.failures === 0 || stat.recentStreakOk >= 2);
    const isRecurrent =
      !isMastered && (stat.failures >= 2 || (stat.failures === 1 && stat.criticals >= 1));

    const status: AdaptiveSkillRanking['status'] =
      stat.attempts === 0
        ? 'NOT_TESTED'
        : isMastered
          ? 'MASTERED'
          : isRecurrent
            ? 'RECURRENT_WEAKNESS'
            : 'NEEDS_PRACTICE';

    const priorityScore =
      status === 'RECURRENT_WEAKNESS'
        ? effectiveDebt + 5
        : status === 'NEEDS_PRACTICE'
          ? effectiveDebt + 1
          : 0;

    return {
      meta,
      stat,
      priorityScore,
      status,
    };
  }).sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.stat.failures !== a.stat.failures) return b.stat.failures - a.stat.failures;
    return b.stat.lastSeenAt - a.stat.lastSeenAt;
  });

  const topTarget = ranked.find((r) => r.priorityScore > 0) ?? null;
  const hasRecurringMistake = ranked.some((r) => r.status === 'RECURRENT_WEAKNESS');

  return {
    ranked,
    topTarget,
    hasRecurringMistake,
  };
}
