import {
  AmbulancePlacement,
  CriterionResult,
  DeploymentPlacement,
  EvaluationResult,
  MovableVehicle,
  ScenarioSpec,
  ZoneRect,
} from '../types/game';

function inRect(x: number, y: number, r: ZoneRect): boolean {
  return x >= r.xMin && x <= r.xMax && y >= r.yMin && y <= r.yMax;
}

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

export function getIdealPlacementForScenario(scenario: ScenarioSpec): {
  x: number;
  y: number;
  angleDeg: number;
} {
  const x = Math.round((scenario.idealZone.xMin + scenario.idealZone.xMax) / 2);
  const y = Math.round((scenario.idealZone.yMin + scenario.idealZone.yMax) / 2);
  const angleDeg = Math.round(
    (scenario.idealAngleRange[0] + scenario.idealAngleRange[1]) / 2
  );
  return { x, y, angleDeg };
}

export function getIdealSecondAmbulanceForScenario(
  scenario: ScenarioSpec
): MovableVehicle | null {
  if (!scenario.idealSecondAmbulanceZone) return null;
  const z = scenario.idealSecondAmbulanceZone;
  const x = Math.round((z.xMin + z.xMax) / 2);
  const y = Math.round((z.yMin + z.yMax) / 2);
  const angleDeg = Math.round(
    (scenario.idealAngleRange[0] + scenario.idealAngleRange[1]) / 2
  );
  return { x, y, angleDeg };
}

export function computeDistanceMeters(
  placement: Pick<AmbulancePlacement, 'x' | 'y'>,
  scenario: ScenarioSpec
): number {
  const dx = placement.x - scenario.crashPos.x;
  const dy = placement.y - scenario.crashPos.y;
  const upm = scenario.unitsPerMeter || 10;
  return Math.round((Math.hypot(dx, dy) / upm) * 10) / 10;
}

export function computeTwoAmbulanceGapMeters(
  a1: Pick<MovableVehicle, 'x' | 'y'>,
  a2: Pick<MovableVehicle, 'x' | 'y'>,
  upm = 10
): number {
  const dx = Math.abs(a1.x - a2.x);
  const dy = Math.abs(a1.y - a2.y);
  let gapPx = 0;
  if (dy < 32) {
    gapPx = Math.max(0, dx - 8.8 * upm);
  } else if (dx < 60) {
    gapPx = Math.max(0, dy - 3.6 * upm);
  } else {
    gapPx = Math.max(0, Math.hypot(dx, dy) - 8.8 * upm);
  }
  return Math.round((gapPx / upm) * 10) / 10;
}

export function computeOtherAmbulanceDistanceMeters(
  placement: AmbulancePlacement,
  scenario: ScenarioSpec
): number | null {
  if (!scenario.otherAmbulancePos) return null;
  return computeTwoAmbulanceGapMeters(
    placement,
    scenario.otherAmbulancePos,
    scenario.unitsPerMeter || 10
  );
}

export function isAmbulanceBeforeCrash(
  placement: AmbulancePlacement,
  scenario: ScenarioSpec
): boolean {
  return placement.x < scenario.crashPos.x;
}

export function evaluatePlacement(
  placement: AmbulancePlacement,
  scenario: ScenarioSpec
): EvaluationResult {
  const distanceMeters = computeDistanceMeters(placement, scenario);
  const isBeforeCrash = isAmbulanceBeforeCrash(placement, scenario);
  const angle = normalizeAngle(placement.angleDeg);
  const otherAmbGap = computeOtherAmbulanceDistanceMeters(placement, scenario);

  let hasSightlineHazard = false;
  let hasSpacingHazard = false;
  let hasBlockedAccessHazard = false;

  const crashedIntoScene = distanceMeters < 5.5;

  // 1. POSITION EVALUATION (max 40 pts)
  let posScore = 0;
  let posStatus: CriterionResult['status'] = 'CRITICAL';
  let posFeedback = '';

  const hitForbidden = scenario.forbiddenZones.find((fz) =>
    inRect(placement.x, placement.y, fz)
  );

  if (crashedIntoScene) {
    posScore = 0;
    posStatus = 'CRITICAL';
    posFeedback =
      'Estacionaste encima de la zona del siniestro (< 5,5 m). Riesgo extremo por incendio, explosión o desplazamiento de vehículos.';
  } else if (
    scenario.minOtherAmbulanceSepMeters !== undefined &&
    otherAmbGap !== null &&
    otherAmbGap < scenario.minOtherAmbulanceSepMeters
  ) {
    posScore = 15;
    posStatus = 'WARNING';
    hasSpacingHazard = true;
    posFeedback = `Separación insuficiente respecto a la otra ambulancia (${otherAmbGap.toFixed(1)} m libres). Cuando hay más de una ambulancia, debe dejarse al menos 2,5 metros entre ellas.`;
  } else if (hitForbidden) {
    posScore = 6;
    posStatus = 'CRITICAL';
    posFeedback = hitForbidden.penaltyReason;
    if (
      (scenario.roadType === 'BLIND_CURVE' || scenario.roadType === 'TUNNEL_PORTAL') &&
      scenario.sightlineCutoffX &&
      placement.x > scenario.sightlineCutoffX
    ) {
      hasSightlineHazard = true;
    }
    if (placement.y < 385) {
      hasBlockedAccessHazard = true;
    }
  } else if (inRect(placement.x, placement.y, scenario.idealZone)) {
    posScore = 40;
    posStatus = 'SAFE';
    posFeedback =
      scenario.arrivalPhase === 'FIRST_RESPONDER'
        ? 'Ubicación óptima como primer interviniente: utilizas la ambulancia como barrera de protección antes del siniestro/punto conflictivo.'
        : 'Ubicación estándar óptima: respetas la zona de policía y bomberos (5–10 m detrás) y quedas por delante con salida operativa.';
  } else if (inRect(placement.x, placement.y, scenario.acceptableZone)) {
    posScore = 30;
    posStatus = 'WARNING';
    posFeedback =
      'Ubicación aceptable, aunque conviene ajustar ligeramente el punto dentro del carril para optimizar protección o salida operativa.';
  } else {
    const expectedBefore = scenario.arrivalPhase === 'FIRST_RESPONDER';
    if (isBeforeCrash === expectedBefore) {
      posScore = 20;
      posStatus = 'WARNING';
      posFeedback = expectedBefore
        ? 'Estás antes del siniestro, pero fuera de la franja recomendada respecto al carril o punto conflictivo.'
        : 'Estás por delante del siniestro, pero fuera del tramo ideal de 10–15 metros.';
    } else {
      posScore = 5;
      posStatus = 'CRITICAL';
      posFeedback = expectedBefore
        ? 'Como primer interviniente debes detenerte ANTES del accidente para proteger la zona.'
        : 'En estacionamiento estándar con policía y bomberos presentes debes situarte por DELANTE del accidente (10–15 m).';
    }
  }

  if (
    (scenario.roadType === 'BLIND_CURVE' || scenario.roadType === 'TUNNEL_PORTAL') &&
    scenario.sightlineCutoffX &&
    placement.x > scenario.sightlineCutoffX + 10
  ) {
    hasSightlineHazard = true;
  }

  // 2. DISTANCE EVALUATION (max 20 pts)
  let distScore = 0;
  let distStatus: CriterionResult['status'] = 'CRITICAL';
  let distFeedback = '';
  const [minD, maxD] = scenario.idealDistanceMeters;

  if (scenario.minHardDistanceMeters !== undefined) {
    const hardMin = scenario.minHardDistanceMeters;
    const ok =
      scenario.roadType === 'ADR_HAZMAT'
        ? distanceMeters > hardMin
        : distanceMeters >= hardMin;

    if (ok) {
      distScore = 20;
      distStatus = 'SAFE';
      distFeedback =
        scenario.roadType === 'ADR_HAZMAT'
          ? `Distancia de seguridad correcta (${Math.round(distanceMeters)} m > 500 m exigidos para mercancías peligrosas).`
          : `Distancia de seguridad correcta (${Math.round(distanceMeters)} m ≥ 75 m exigidos ante vehículo incendiado).`;
    } else if (distanceMeters >= hardMin * 0.75) {
      distScore = 8;
      distStatus = 'CRITICAL';
      distFeedback =
        scenario.roadType === 'ADR_HAZMAT'
          ? `Distancia insuficiente (${Math.round(distanceMeters)} m). Con mercancías peligrosas debe superarse los 500 metros.`
          : `Distancia insuficiente (${Math.round(distanceMeters)} m). Ante vehículo incendiado se requieren al menos 75 metros.`;
    } else {
      distScore = 0;
      distStatus = 'CRITICAL';
      distFeedback =
        scenario.roadType === 'ADR_HAZMAT'
          ? `¡Riesgo extremo! Estás a ${Math.round(distanceMeters)} m de mercancías peligrosas; debes alejarte a más de 500 m.`
          : `¡Riesgo extremo de explosión! Estás a ${Math.round(distanceMeters)} m; ante incendio debes alejarte al menos 75 m.`;
    }
  } else if (crashedIntoScene) {
    distScore = 0;
    distStatus = 'CRITICAL';
    distFeedback = `Distancia crítica (${distanceMeters.toFixed(1)} m). Demasiado cerca de los vehículos implicados.`;
  } else if (distanceMeters >= minD && distanceMeters <= maxD) {
    distScore = 20;
    distStatus = 'SAFE';
    if (scenario.arrivalPhase === 'STANDARD_SECURED') {
      distFeedback = `Distancia estándar correcta (${distanceMeters.toFixed(1)} m por delante del accidente; pauta 10–15 m).`;
    } else if (scenario.additionalHazard === 'ADVERSE_WEATHER') {
      distFeedback = `Distancia ampliada adecuada para lluvia/niebla (${distanceMeters.toFixed(1)} m antes del accidente).`;
    } else {
      distFeedback = `Distancia de seguridad adecuada (${distanceMeters.toFixed(1)} m; referencia ~25 m).`;
    }
  } else if (distanceMeters >= minD - 6 && distanceMeters <= maxD + 12) {
    distScore = 13;
    distStatus = 'WARNING';
    distFeedback =
      distanceMeters < minD
        ? `Distancia algo justa (${distanceMeters.toFixed(1)} m). Recomendado entre ${minD} y ${maxD} m.`
        : `Algo alejada (${distanceMeters.toFixed(1)} m). Rango recomendado: ${minD}–${maxD} m.`;
  } else {
    distScore = 5;
    distStatus = 'CRITICAL';
    distFeedback =
      distanceMeters < minD
        ? `Distancia insuficiente (${distanceMeters.toFixed(1)} m): exposición ante desplazamiento, fuego o frenada del tráfico.`
        : `Distancia excesiva (${distanceMeters.toFixed(1)} m): dificulta la asistencia rápida y el traslado.`;
  }

  // 3. ORIENTATION EVALUATION (max 25 pts)
  let orientScore = 0;
  let orientStatus: CriterionResult['status'] = 'CRITICAL';
  let orientFeedback = '';
  const [minA, maxA] = scenario.idealAngleRange;
  const inIdealAngle = angle >= minA && angle <= maxA;

  if (scenario.expectsWedge) {
    if (inIdealAngle) {
      orientScore = 25;
      orientStatus = 'SAFE';
      orientFeedback = `Orientación correcta (${Math.round(angle)}° hacia la mediana/centro): mantiene protegida la zona trasera y lateral por donde transita el equipo.`;
    } else if (angle <= -18 && angle >= -55) {
      orientScore = 18;
      orientStatus = 'WARNING';
      orientFeedback = `Orientada hacia el centro (${Math.round(angle)}°), pero el ángulo óptimo indicado es de 30° a 45° hacia la mediana/centro.`;
    } else if (angle > -18 && angle <= 12) {
      orientScore = 10;
      orientStatus = 'WARNING';
      orientFeedback =
        'En primera llegada no basta con aparcar paralelo (0°): gira la parte delantera 30°–45° hacia la mediana o centro de la vía para proteger lateral y trasera.';
    } else {
      orientScore = 4;
      orientStatus = 'CRITICAL';
      orientFeedback =
        'Has orientado el frontal hacia el arcén exterior (+°), dejando la zona lateral/trasera de trabajo expuesta hacia el flujo de tráfico.';
    }
  } else {
    if (inIdealAngle) {
      orientScore = 25;
      orientStatus = 'SAFE';
      orientFeedback = `Orientación paralela óptima (${Math.round(angle)}°): garantiza salida operativa rápida y segura al tráfico en la evacuación.`;
    } else if (Math.abs(angle) <= 22) {
      orientScore = 15;
      orientStatus = 'WARNING';
      orientFeedback =
        'Alinea más paralela al eje de la vía (0°) para facilitar la reincorporación rápida al evacuar.';
    } else {
      orientScore = 6;
      orientStatus = 'CRITICAL';
      orientFeedback =
        'En estacionamiento estándar por delante del siniestro debes quedar paralelo (0°) con salida operativa, no cruzado en cuña.';
    }
  }

  // 4. PROTOCOL ACTIONS (max 15 pts)
  let protoScore = 0;
  let protoStatus: CriterionResult['status'] = 'SAFE';
  const missing: string[] = [];

  if (placement.lightsAllOn) {
    protoScore += 5;
  } else {
    missing.push('activar todas las señales luminosas');
  }

  if (placement.hazardMarked) {
    protoScore += 5;
  } else {
    missing.push('señalizar el peligro de forma visible / zona de riesgo');
  }

  const requiresCcuCritical =
    scenario.arrivalPhase === 'FIRST_RESPONDER' ||
    scenario.additionalHazard === 'FIRE' ||
    scenario.additionalHazard === 'HAZMAT';

  if (placement.ccuNotified) {
    protoScore += 5;
  } else if (requiresCcuCritical) {
    missing.push(
      scenario.additionalHazard === 'FIRE' || scenario.additionalHazard === 'HAZMAT'
        ? 'advertir al Centro Coordinador del riesgo adicional y esperar instrucciones especializadas'
        : 'comunicar inmediatamente la situación al Centro Coordinador'
    );
  } else {
    protoScore += 5;
  }

  if (missing.length === 0) {
    protoStatus = 'SAFE';
  } else if (missing.length === 1 && !requiresCcuCritical) {
    protoStatus = 'WARNING';
  } else if (
    (scenario.additionalHazard === 'FIRE' || scenario.additionalHazard === 'HAZMAT') &&
    !placement.ccuNotified
  ) {
    protoStatus = 'CRITICAL';
  } else {
    protoStatus = missing.length >= 2 ? 'CRITICAL' : 'WARNING';
  }

  const protoFeedback =
    missing.length === 0
      ? 'Medidas de señalización, delimitación de riesgo y comunicación al Centro Coordinador completadas.'
      : `Falta: ${missing.join('; ')}.`;

  const totalScore = Math.max(0, Math.min(100, posScore + distScore + orientScore + protoScore));

  let grade: EvaluationResult['grade'] = 'RIESGO_CRITICO';
  let headline = 'Estacionamiento con riesgo crítico';

  if (
    totalScore >= 82 &&
    posStatus !== 'CRITICAL' &&
    distStatus !== 'CRITICAL' &&
    orientStatus !== 'CRITICAL' &&
    protoStatus !== 'CRITICAL'
  ) {
    grade = 'SEGURO';
    headline = 'Estacionamiento seguro conforme al protocolo';
  } else if (
    totalScore >= 55 &&
    posStatus !== 'CRITICAL' &&
    distStatus !== 'CRITICAL'
  ) {
    grade = 'MEJORABLE';
    headline = 'Estacionamiento aceptable con puntos a mejorar';
  }

  // Build exact, student-friendly corrective explanation & actionable steps
  const correctionSteps: string[] = [];
  if (posStatus !== 'SAFE' || distStatus !== 'SAFE') {
    if (scenario.arrivalPhase === 'FIRST_RESPONDER') {
      if (scenario.roadType === 'ADR_HAZMAT') {
        correctionSteps.push(
          `Coloca la ambulancia ANTES del accidente alejada a más de 500 metros en el carril derecho (tú la dejaste a ${Math.round(distanceMeters)} m ${isBeforeCrash ? 'antes' : 'delante'}).`
        );
      } else if (scenario.roadType === 'FIRE_HAZARD') {
        correctionSteps.push(
          `Retrocede y sitúa la ambulancia ANTES del incendio dejando al menos 75 metros de distancia de seguridad (tú estabas a ${Math.round(distanceMeters)} m ${isBeforeCrash ? 'antes' : 'delante'}).`
        );
      } else if (scenario.roadType === 'BLIND_CURVE') {
        correctionSteps.push(
          'Sitúa la ambulancia en el carril derecho ANTES de entrar en la curva sin visibilidad, donde los coches que llegan puedan ver tus rotativos desde la recta.'
        );
      } else if (scenario.roadType === 'TUNNEL_PORTAL') {
        correctionSteps.push(
          'Detén la ambulancia en el carril derecho ANTES de la boca del túnel (~25–35 m antes del siniestro), dejando libre el carril izquierdo para Bomberos.'
        );
      } else if (scenario.roadType === 'ADVERSE_WEATHER') {
        correctionSteps.push(
          `Amplía la distancia por lluvia/niebla situándote entre 35 y 50 metros ANTES del accidente en tu carril (la dejaste a ${distanceMeters.toFixed(1)} m ${isBeforeCrash ? 'antes' : 'delante'}).`
        );
      } else {
        correctionSteps.push(
          `Coloca la ambulancia en el carril afectado ANTES del accidente a unos 25 metros de distancia (la dejaste a ${distanceMeters.toFixed(1)} m ${isBeforeCrash ? 'antes' : 'delante'}).`
        );
      }
    } else {
      if (scenario.minOtherAmbulanceSepMeters && otherAmbGap !== null && otherAmbGap < 2.5) {
        correctionSteps.push(
          `Sitúa la ambulancia entre 10 y 15 metros por DELANTE del accidente, pero separada al menos 2,5 metros de la otra ambulancia (dejaste ${otherAmbGap.toFixed(1)} m).`
        );
      } else if (scenario.roadType === 'URBAN') {
        correctionSteps.push(
          'Sobrepasa la zona cubierta por Policía Local y Bomberos y estaciona entre 10 y 15 metros por DELANTE del siniestro, sin pisar el paso de peatones ni bloquear la bocacalle.'
        );
      } else {
        correctionSteps.push(
          `Al haber Policía y Bomberos en la escena, sobrepasa el siniestro y aparca entre 10 y 15 metros por DELANTE en tu carril (ahora estabas a ${distanceMeters.toFixed(1)} m ${isBeforeCrash ? 'antes' : 'delante'}).`
        );
      }
    }
  }

  if (orientStatus !== 'SAFE') {
    if (scenario.expectsWedge) {
      correctionSteps.push(
        `Gira el vehículo entre -30° y -45° con el frontal apuntando hacia la mediana o centro de la vía (estabas a ${Math.round(angle)}°). Así proteges la zona trasera y lateral donde trabajas.`
      );
    } else {
      correctionSteps.push(
        `Alinea la ambulancia paralela al eje de la vía (0°, ahora estabas a ${Math.round(angle)}°) mirando hacia delante para tener salida operativa inmediata.`
      );
    }
  }

  if (protoStatus !== 'SAFE') {
    correctionSteps.push(
      `Completa las medidas obligatorias de la barra inferior antes de validar: ${missing.join(', ')}.`
    );
  }

  let correctionExplanation = '';
  if (correctionSteps.length === 0) {
    correctionExplanation =
      'Has aplicado correctamente la ubicación, la distancia de seguridad, la orientación y las medidas de señalización y aviso.';
  } else if (scenario.arrivalPhase === 'FIRST_RESPONDER') {
    correctionExplanation = `En este escenario eres el primer recurso en llegar (${scenario.roadLabel}). Tu ambulancia debe actuar como escudo protector antes del peligro y alertar al tráfico y al Centro Coordinador.`;
  } else {
    correctionExplanation = `En este escenario ya hay Policía y Bomberos (${scenario.roadLabel}). No debes quedarte detrás ni estorbar sus maniobras: tu sitio está 10–15 m por delante con salida operativa rápida.`;
  }

  return {
    totalScore,
    grade,
    headline,
    distanceMeters,
    isBeforeCrash,
    hasSightlineHazard,
    hasSpacingHazard,
    hasBlockedAccessHazard,
    correctionExplanation,
    correctionSteps,
    criteria: [
      {
        id: 'position',
        label: 'Ubicación y no interferencia',
        score: posScore,
        maxScore: 40,
        status: posStatus,
        feedback: posFeedback,
      },
      {
        id: 'distance',
        label: 'Distancia de seguridad',
        score: distScore,
        maxScore: 20,
        status: distStatus,
        feedback: distFeedback,
      },
      {
        id: 'orientation',
        label: 'Orientación y protección / salida',
        score: orientScore,
        maxScore: 25,
        status: orientStatus,
        feedback: orientFeedback,
      },
      {
        id: 'protocol_actions',
        label: 'Luces, balizamiento y aviso al CCU',
        score: protoScore,
        maxScore: 15,
        status: protoStatus,
        feedback: protoFeedback,
      },
    ],
  };
}

export function evaluateTwoAmbulancesPlacement(
  deployment: DeploymentPlacement,
  scenario: ScenarioSpec
): EvaluationResult {
  const upm = scenario.unitsPerMeter || 10;
  const amb1 = deployment.ambulance;
  const amb2 = deployment.ambulance2;
  if (!amb2) {
    return evaluatePlacement(amb1, scenario);
  }

  const d1 = computeDistanceMeters(amb1, scenario);
  const d2 = computeDistanceMeters(amb2, scenario);
  const closerDist = Math.min(d1, d2);
  const furtherDist = Math.max(d1, d2);
  const gapMeters = computeTwoAmbulanceGapMeters(amb1, amb2, upm);
  const minRequiredSep = scenario.minOtherAmbulanceSepMeters ?? 2.5;

  const angle1 = normalizeAngle(amb1.angleDeg);
  const angle2 = normalizeAngle(amb2.angleDeg);

  let hasSpacingHazard = false;
  let hasBlockedAccessHazard = false;

  const crashed1 = d1 < 5.5;
  const crashed2 = d2 < 5.5;
  const hitForbidden1 = scenario.forbiddenZones.find((fz) => inRect(amb1.x, amb1.y, fz));
  const hitForbidden2 = scenario.forbiddenZones.find((fz) => inRect(amb2.x, amb2.y, fz));
  const overlappingEachOther =
    Math.abs(amb1.x - amb2.x) < 88 && Math.abs(amb1.y - amb2.y) < 36;

  const isFirstResponder = scenario.arrivalPhase === 'FIRST_RESPONDER';
  const sideMatched = isFirstResponder
    ? amb1.x < scenario.crashPos.x && amb2.x < scenario.crashPos.x
    : amb1.x > scenario.crashPos.x && amb2.x > scenario.crashPos.x;
  const bothInRightLane =
    amb1.y >= 400 && amb1.y <= 515 && amb2.y >= 400 && amb2.y <= 515;
  const [minIdealDist, maxIdealDist] = scenario.idealDistanceMeters;
  const hardMin = scenario.minHardDistanceMeters;
  const distRangeOk =
    hardMin !== undefined
      ? scenario.roadType === 'ADR_HAZMAT'
        ? closerDist > hardMin
        : closerDist >= hardMin
      : closerDist >= minIdealDist - 1.5 && closerDist <= maxIdealDist + 2 && furtherDist <= maxIdealDist + 32;
  const distAcceptOk =
    hardMin !== undefined
      ? closerDist >= hardMin * 0.8
      : closerDist >= Math.max(6, minIdealDist - 4) && furtherDist <= maxIdealDist + 42;

  // 1. POSITION & NON-INTERFERENCE (max 40 pts)
  let posScore = 0;
  let posStatus: CriterionResult['status'] = 'CRITICAL';
  let posFeedback = '';

  if (crashed1 || crashed2) {
    posScore = 0;
    posStatus = 'CRITICAL';
    posFeedback = `Una de las ambulancias (${crashed1 && crashed2 ? 'ambas' : crashed1 ? 'Ambulancia 1' : 'Ambulancia 2'}) está encima de la zona del siniestro (< 5,5 m).`;
  } else if (overlappingEachOther) {
    posScore = 8;
    posStatus = 'CRITICAL';
    hasSpacingHazard = true;
    posFeedback =
      'Las dos ambulancias se solapan entre sí. Deben quedar separadas al menos 2,5 metros para trabajar y evacuar con seguridad.';
  } else if (hitForbidden1 || hitForbidden2) {
    const culprit = hitForbidden1 && hitForbidden2 ? 'Ambas ambulancias' : hitForbidden1 ? 'Ambulancia 1' : 'Ambulancia 2';
    const hit = hitForbidden1 || hitForbidden2!;
    posScore = 8;
    posStatus = 'CRITICAL';
    if (amb1.y < 385 || amb2.y < 385) hasBlockedAccessHazard = true;
    posFeedback = `${culprit}: ${hit.penaltyReason}`;
  } else if (!bothInRightLane) {
    posScore = 14;
    posStatus = 'CRITICAL';
    hasBlockedAccessHazard = true;
    posFeedback =
      'Sitúa ambas ambulancias en el carril derecho protegido, dejando libre el carril de circulación o acceso.';
  } else if (!sideMatched) {
    posScore = 6;
    posStatus = 'CRITICAL';
    posFeedback = isFirstResponder
      ? 'Como primeros intervinientes sin policía, ambas ambulancias deben estacionarse ANTES del accidente protegiendo la escena.'
      : 'En estacionamiento estándar con Policía y Bomberos presentes, ambas ambulancias deben situarse por DELANTE del accidente.';
  } else if (gapMeters < minRequiredSep) {
    posScore = 18;
    posStatus = 'WARNING';
    hasSpacingHazard = true;
    posFeedback = `Separación insuficiente entre Ambulancia 1 y Ambulancia 2 (${gapMeters.toFixed(1)} m libres). Debe dejarse al menos 2,5 metros entre ellas.`;
  } else if (distRangeOk) {
    posScore = 40;
    posStatus = 'SAFE';
    posFeedback = isFirstResponder
      ? `Ubicación óptima de ambas ambulancias antes del siniestro y separadas ${gapMeters.toFixed(1)} m entre sí (≥ 2,5 m).`
      : `Ubicación óptima de ambas ambulancias por delante del accidente y separadas ${gapMeters.toFixed(1)} m entre sí (≥ 2,5 m).`;
  } else if (distAcceptOk) {
    posScore = 30;
    posStatus = 'WARNING';
    posFeedback = isFirstResponder
      ? `Ambas ambulancias protegen antes del accidente y mantienen ${gapMeters.toFixed(1)} m de separación, aunque conviene ajustar la primera entre ${minIdealDist} y ${maxIdealDist} m.`
      : 'Ambas ambulancias están bien alineadas y separadas, aunque conviene ajustar la primera entre 10 y 15 m por delante del accidente.';
  } else {
    posScore = 20;
    posStatus = 'WARNING';
    posFeedback = isFirstResponder
      ? `Ambas ambulancias están antes del siniestro, pero fuera de la franja recomendada (${minIdealDist}–${maxIdealDist} m).`
      : 'Ambas ambulancias están por delante del siniestro, pero fuera del tramo recomendado de 10–15 m para iniciar la fila.';
  }

  // 2. DISTANCE & SEPARATION EVALUATION (max 20 pts)
  let distScore = 0;
  let distStatus: CriterionResult['status'] = 'CRITICAL';
  let distFeedback = '';

  if (crashed1 || crashed2) {
    distScore = 0;
    distStatus = 'CRITICAL';
    distFeedback = `Distancia crítica (${closerDist.toFixed(1)} m). Demasiado cerca del accidente.`;
  } else if (gapMeters < minRequiredSep) {
    distScore = overlappingEachOther ? 0 : 8;
    distStatus = overlappingEachOther ? 'CRITICAL' : 'WARNING';
    hasSpacingHazard = true;
    distFeedback = `Separación entre ambulancias insuficiente (${gapMeters.toFixed(1)} m). El protocolo exige mínimo 2,5 metros entre ambas.`;
  } else if (!sideMatched) {
    distScore = 4;
    distStatus = 'CRITICAL';
    distFeedback = isFirstResponder
      ? 'Ambas ambulancias deben detenerse ANTES del accidente para proteger la intervención.'
      : 'Ambas ambulancias deben rebasar el siniestro para estacionar 10–15 m por delante.';
  } else if (distRangeOk) {
    distScore = 20;
    distStatus = 'SAFE';
    distFeedback = isFirstResponder
      ? `Distancias correctas: primera ambulancia a ${closerDist.toFixed(1)} m antes del accidente y ${gapMeters.toFixed(1)} m de separación entre ambas.`
      : `Distancias correctas: primera ambulancia a ${closerDist.toFixed(1)} m delante del accidente y ${gapMeters.toFixed(1)} m de separación entre ambas.`;
  } else if (distAcceptOk) {
    distScore = 14;
    distStatus = 'WARNING';
    distFeedback = `Separación entre ambulancias correcta (${gapMeters.toFixed(1)} m), pero la más cercana queda a ${closerDist.toFixed(1)} m (recomendado ${minIdealDist}–${maxIdealDist} m).`;
  } else {
    distScore = 6;
    distStatus = 'CRITICAL';
    distFeedback =
      closerDist < minIdealDist
        ? `Demasiado cerca del accidente (${closerDist.toFixed(1)} m). Mantén ${hardMin ? `≥ ${hardMin}` : `${minIdealDist}–${maxIdealDist}`} m.`
        : `Demasiado alejadas del accidente (${closerDist.toFixed(1)} m). Dificulta la asistencia rápida.`;
  }

  // 3. ORIENTATION EVALUATION (max 25 pts)
  let orientScore = 0;
  let orientStatus: CriterionResult['status'] = 'CRITICAL';
  let orientFeedback = '';
  const [minA, maxA] = scenario.idealAngleRange;
  const ok1 = angle1 >= minA && angle1 <= maxA;
  const ok2 = angle2 >= minA && angle2 <= maxA;

  if (scenario.expectsWedge) {
    if (ok1 && ok2) {
      orientScore = 25;
      orientStatus = 'SAFE';
      orientFeedback = `Ambas ambulancias en protección en cuña (${Math.round(angle1)}° y ${Math.round(angle2)}° hacia la mediana/centro).`;
    } else if (angle1 <= -18 && angle1 >= -55 && angle2 <= -18 && angle2 >= -55) {
      orientScore = 17;
      orientStatus = 'WARNING';
      orientFeedback = `Ambas orientadas hacia el centro (${Math.round(angle1)}° y ${Math.round(angle2)}°), ajusta entre 30° y 45° (-45° a -30°).`;
    } else {
      orientScore = 6;
      orientStatus = 'CRITICAL';
      orientFeedback = `En primera llegada las ambulancias deben formar ángulo de protección 30°–45° hacia la mediana/centro (${Math.round(angle1)}° y ${Math.round(angle2)}°).`;
    }
  } else if (ok1 && ok2) {
    orientScore = 25;
    orientStatus = 'SAFE';
    orientFeedback = `Ambas ambulancias alineadas en paralelo (${Math.round(angle1)}° y ${Math.round(angle2)}°): salida operativa rápida y segura.`;
  } else if (Math.abs(angle1) <= 22 && Math.abs(angle2) <= 22) {
    orientScore = 15;
    orientStatus = 'WARNING';
    orientFeedback = `Alinea ambas ambulancias paralelas al eje de la vía (0°). Ahora están a ${Math.round(angle1)}° y ${Math.round(angle2)}°.`;
  } else {
    orientScore = 6;
    orientStatus = 'CRITICAL';
    orientFeedback = `Orientación incorrecta (${Math.round(angle1)}° y ${Math.round(angle2)}°): por delante del siniestro deben quedar paralelas (0°) para salida operativa.`;
  }

  // 4. PROTOCOL ACTIONS (max 15 pts)
  let protoScore = 0;
  let protoStatus: CriterionResult['status'] = 'SAFE';
  const missing: string[] = [];

  if (amb1.lightsAllOn) protoScore += 5;
  else missing.push('activar todas las señales luminosas');

  if (amb1.hazardMarked) protoScore += 5;
  else missing.push('señalizar el peligro de forma visible / zona de riesgo');

  const requiresCcuCritical =
    isFirstResponder ||
    scenario.additionalHazard === 'FIRE' ||
    scenario.additionalHazard === 'HAZMAT';

  if (amb1.ccuNotified) {
    protoScore += 5;
  } else if (requiresCcuCritical) {
    missing.push('comunicar la situación y riesgos al Centro Coordinador');
  } else {
    protoScore += 5;
  }

  if (missing.length === 0) protoStatus = 'SAFE';
  else if (requiresCcuCritical && !amb1.ccuNotified) protoStatus = 'CRITICAL';
  else protoStatus = missing.length >= 2 ? 'CRITICAL' : 'WARNING';

  const protoFeedback =
    missing.length === 0
      ? 'Medidas de señalización, delimitación de riesgo y aviso completadas.'
      : `Falta: ${missing.join('; ')}.`;

  const totalScore = Math.max(0, Math.min(100, posScore + distScore + orientScore + protoScore));
  let grade: EvaluationResult['grade'] = 'RIESGO_CRITICO';
  let headline = 'Estacionamiento con riesgo crítico';

  if (
    totalScore >= 82 &&
    posStatus !== 'CRITICAL' &&
    distStatus !== 'CRITICAL' &&
    orientStatus !== 'CRITICAL' &&
    protoStatus !== 'CRITICAL'
  ) {
    grade = 'SEGURO';
    headline = 'Estacionamiento seguro de ambas ambulancias';
  } else if (totalScore >= 55 && posStatus !== 'CRITICAL' && distStatus !== 'CRITICAL') {
    grade = 'MEJORABLE';
    headline = 'Estacionamiento aceptable con puntos a mejorar';
  }

  const correctionSteps: string[] = [];
  if (posStatus !== 'SAFE' || distStatus !== 'SAFE') {
    if (!sideMatched || !bothInRightLane || hitForbidden1 || hitForbidden2) {
      correctionSteps.push(
        isFirstResponder
          ? `Sitúa ambas ambulancias en el carril derecho ANTES del accidente (primera a ${hardMin ? `≥ ${hardMin}` : `${minIdealDist}–${maxIdealDist}`} m), sin invadir el carril contrario/izquierdo.`
          : 'Sitúa tanto la Ambulancia 1 como la Ambulancia 2 en el carril derecho por DELANTE del accidente (10–15 m la primera), sin invadir el carril izquierdo.'
      );
    }
    if (overlappingEachOther || gapMeters < minRequiredSep) {
      correctionSteps.push(
        `Deja al menos 2,5 metros libres entre Ambulancia 1 y Ambulancia 2 (ahora hay ${gapMeters.toFixed(1)} m).`
      );
    } else if (!distRangeOk) {
      correctionSteps.push(
        isFirstResponder
          ? `Ajusta la primera ambulancia antes del siniestro (${hardMin ? `≥ ${hardMin}` : `${minIdealDist}–${maxIdealDist}`} m; está a ${closerDist.toFixed(1)} m) y la segunda detrás guardando ≥ 2,5 m.`
          : `Ajusta la primera ambulancia entre 10 y 15 metros por DELANTE del siniestro (está a ${closerDist.toFixed(1)} m) y la segunda por delante guardando ≥ 2,5 m.`
      );
    }
  }
  if (orientStatus !== 'SAFE') {
    correctionSteps.push(
      scenario.expectsWedge
        ? `Orienta ambas ambulancias entre -30° y -45° hacia la mediana/centro (ahora están a ${Math.round(angle1)}° y ${Math.round(angle2)}°) para proteger lateral y trasera.`
        : `Alinea ambas ambulancias paralelas a la calzada (0°; ahora están a ${Math.round(angle1)}° y ${Math.round(angle2)}°) para garantizar salida operativa.`
    );
  }
  if (protoStatus !== 'SAFE') {
    correctionSteps.push(
      `Completa las medidas obligatorias de la barra inferior antes de validar: ${missing.join(', ')}.`
    );
  }

  const correctionExplanation =
    correctionSteps.length === 0
      ? isFirstResponder
        ? 'Has estacionado correctamente ambas ambulancias antes del siniestro en ángulo de protección y con ≥ 2,5 m de separación.'
        : 'Has estacionado correctamente ambas ambulancias por delante del siniestro, en paralelo (0°), con salida operativa y manteniendo ≥ 2,5 m de separación entre ellas.'
      : isFirstResponder
        ? `Como primeros intervinientes (${scenario.roadLabel}), ambas ambulancias protegen ANTES del siniestro (${hardMin ? `≥ ${hardMin}` : `${minIdealDist}–${maxIdealDist}`} m) en cuña 30°–45° y guardando ≥ 2,5 m entre sí.`
        : `En escenarios con dos ambulancias y presencia de Policía y Bomberos (${scenario.roadLabel}), ambas deben colocarse por delante del siniestro (10–15 m la primera), paralelas (0°) y separadas al menos 2,5 m entre sí.`;

  return {
    totalScore,
    grade,
    headline,
    distanceMeters: closerDist,
    isBeforeCrash: amb1.x < scenario.crashPos.x || amb2.x < scenario.crashPos.x,
    hasSightlineHazard: false,
    hasSpacingHazard,
    hasBlockedAccessHazard,
    correctionExplanation,
    correctionSteps,
    criteria: [
      {
        id: 'position',
        label: 'Ubicación de ambas ambulancias',
        score: posScore,
        maxScore: 40,
        status: posStatus,
        feedback: posFeedback,
      },
      {
        id: 'distance',
        label: 'Distancias y separación mínima (≥ 2,5 m)',
        score: distScore,
        maxScore: 20,
        status: distStatus,
        feedback: distFeedback,
      },
      {
        id: 'orientation',
        label: 'Orientación paralela / salida operativa',
        score: orientScore,
        maxScore: 25,
        status: orientStatus,
        feedback: orientFeedback,
      },
      {
        id: 'protocol_actions',
        label: 'Luces, balizamiento y aviso al CCU',
        score: protoScore,
        maxScore: 15,
        status: protoStatus,
        feedback: protoFeedback,
      },
    ],
  };
}

export function getIdealAdvancedForScenario(scenario: ScenarioSpec): {
  ambulance: MovableVehicle;
  ambulance2?: MovableVehicle;
  fireTruck: MovableVehicle;
  police: MovableVehicle[];
} {
  const amb = getIdealPlacementForScenario(scenario);
  const amb2 = getIdealSecondAmbulanceForScenario(scenario) ?? undefined;
  const fz = scenario.idealFireZone;
  const fireTruck: MovableVehicle = fz
    ? {
        x: Math.round((fz.xMin + fz.xMax) / 2),
        y: Math.round((fz.yMin + fz.yMax) / 2),
        angleDeg: -30,
      }
    : {
        x: scenario.crashPos.x - 85,
        y: scenario.crashPos.y,
        angleDeg: -30,
      };

  const police: MovableVehicle[] = (scenario.idealPoliceZones || []).map((pz, idx) => ({
    x: Math.round((pz.xMin + pz.xMax) / 2),
    y: Math.round((pz.yMin + pz.yMax) / 2),
    angleDeg: idx === 1 ? 155 : -28,
  }));

  return { ambulance: amb, ambulance2: amb2, fireTruck, police };
}

export function evaluateAdvancedDeployment(
  deployment: DeploymentPlacement,
  scenario: ScenarioSpec
): EvaluationResult {
  const upm = scenario.unitsPerMeter || 10;
  const amb = deployment.ambulance;
  const amb2 = deployment.ambulance2;
  const hasTwoAmbs = Boolean(amb2);
  const ft = deployment.fireTruck;
  const policeList = deployment.police;

  let hasSpacingHazard = false;
  let hasBlockedAccessHazard = false;

  // Helper to evaluate a single ambulance relative to Fire Truck / Crash / Police / Zones
  const evalSingleAmb = (a: MovableVehicle, label: string) => {
    const aAngle = normalizeAngle(a.angleDeg);
    const distCrash = computeDistanceMeters(a, scenario);
    const distFire = ft
      ? Math.round((Math.hypot(a.x - ft.x, a.y - ft.y) / upm) * 10) / 10
      : distCrash;
    const hitForb = scenario.forbiddenZones.find((fz) => inRect(a.x, a.y, fz));
    const overCrash = distCrash < 5.5;
    const overFire = Boolean(ft && Math.abs(a.x - ft.x) < 92 && Math.abs(a.y - ft.y) < 36);
    const overPolice = policeList.some(
      (p) => Math.abs(a.x - p.x) < 78 && Math.abs(a.y - p.y) < 32
    );
    const inRight = a.y >= 400 && a.y <= 515;
    const behindFire = Boolean(ft && a.x < ft.x);
    const aheadCrash = a.x > scenario.crashPos.x;

    let pos = 0;
    let dist = 0;
    let orient = 0;
    let fb = '';
    const steps: string[] = [];

    if (overCrash) {
      fb = `${label}: estacionada encima de la zona del accidente (< 5,5 m).`;
      steps.push(`Aleja ${label} de la zona del impacto.`);
    } else if (overFire) {
      pos = 6;
      dist = 2;
      hasSpacingHazard = true;
      fb = `${label} se solapa o queda demasiado pegada a Bomberos (${distFire.toFixed(1)} m). Toma Bomberos como referencia y deja 10–15 m.`;
      steps.push(
        `Evita solapar ${label} con Bomberos: toma Bomberos como referencia (10–15 m) o pasa por delante del siniestro.`
      );
    } else if (overPolice) {
      pos = 10;
      dist = 6;
      hasSpacingHazard = true;
      fb = `${label} se solapa con un vehículo policial o bloquea su maniobra.`;
      steps.push(`Deja espacio libre entre ${label} y Policía.`);
    } else if (hitForb) {
      pos = 6;
      dist = 6;
      if (a.y < 392) hasBlockedAccessHazard = true;
      fb = `${label}: ${hitForb.penaltyReason}`;
      steps.push(`${label}: ${hitForb.penaltyReason}`);
    } else if (!inRight) {
      pos = 12;
      dist = 8;
      hasBlockedAccessHazard = true;
      fb = `${label} debe situarse en el carril derecho protegido.`;
      steps.push(`Coloca ${label} dentro del carril derecho o arcén protegido.`);
    } else if (behindFire) {
      if (distFire >= 9.5 && distFire <= 16.5) {
        pos = 40;
        dist = 20;
        fb = `${label} óptima a ${distFire.toFixed(1)} m detrás de Bomberos.`;
      } else if (distFire >= 8.0 && distFire <= 21.0) {
        pos = 30;
        dist = 13;
        fb = `${label} detrás de Bomberos aceptable (${distFire.toFixed(1)} m respecto a Bomberos; pauta 10–15 m).`;
        steps.push(`Ajusta ${label} entre 10 y 15 m respecto al camión de bomberos.`);
      } else {
        pos = 18;
        dist = 6;
        fb =
          distFire < 8.0
            ? `${label} demasiado cerca de Bomberos (${distFire.toFixed(1)} m).`
            : `${label} algo alejada de Bomberos (${distFire.toFixed(1)} m).`;
        steps.push(`Coloca ${label} a 10–15 m tomando como referencia a Bomberos.`);
      }
    } else if (aheadCrash) {
      if (distCrash >= 9.5 && distCrash <= 17.5) {
        pos = 40;
        dist = 20;
        fb = `${label} óptima por delante del siniestro (${distCrash.toFixed(1)} m).`;
      } else if (distCrash >= 7.5 && distCrash <= 22.0) {
        pos = 30;
        dist = 13;
        fb = `${label} por delante del accidente (${distCrash.toFixed(1)} m), ligeramente fuera de 10–15 m.`;
        steps.push(`Ajusta ${label} a 10–15 m por delante del accidente.`);
      } else {
        pos = 18;
        dist = 6;
        fb = `${label} a distancia inadecuada por delante (${distCrash.toFixed(1)} m).`;
        steps.push(`Coloca ${label} entre 10 y 15 m por delante del accidente.`);
      }
    } else {
      pos = 12;
      dist = 6;
      fb = `${label} está entre Bomberos y el accidente. Sitúala a 10–15 m detrás de Bomberos o por delante del siniestro.`;
      steps.push(`No metas ${label} entre Bomberos y el accidente.`);
    }

    if (Math.abs(aAngle) <= 12) {
      orient = 20;
    } else if (aAngle >= -45 && aAngle <= 20) {
      orient = 12;
      steps.push(`Alinea ${label} paralela al eje de la vía (0°) para garantizar salida operativa.`);
    } else {
      orient = 4;
      steps.push(`Evita orientar ${label} hacia el arcén exterior; alinéala paralela (0°).`);
    }

    return {
      distCrash,
      distFire,
      behindFire,
      aheadCrash,
      inRight,
      overCrash,
      overFire,
      overPolice,
      hitForb,
      pos,
      dist,
      orient,
      fb,
      steps,
    };
  };

  let ambPosScore = 0;
  let ambDistScore = 0;
  let ambOrientScore = 0;
  const ambSteps: string[] = [];
  let ambFeedback = '';
  let primaryDistMeters = computeDistanceMeters(amb, scenario);

  if (!hasTwoAmbs) {
    const r = evalSingleAmb(amb, 'Ambulancia');
    primaryDistMeters = ft ? r.distFire : r.distCrash;
    ambPosScore = r.pos;
    ambDistScore = r.dist;
    ambOrientScore = r.orient;
    ambFeedback = r.fb;
    ambSteps.push(...r.steps);
  } else if (amb2) {
    const r1 = evalSingleAmb(amb, 'Ambulancia 1');
    const r2 = evalSingleAmb(amb2, 'Ambulancia 2');
    const gapMeters = computeTwoAmbulanceGapMeters(amb, amb2, upm);
    const minRequiredSep = scenario.minOtherAmbulanceSepMeters ?? 2.5;
    const overlapTwo = Math.abs(amb.x - amb2.x) < 88 && Math.abs(amb.y - amb2.y) < 36;

    // Note: when both ambulances are on the same side (both ahead of crash OR both behind fire),
    // the second ambulance naturally sits further from the anchor by >= 2.5m + vehicle length!
    const bothAhead = r1.aheadCrash && r2.aheadCrash && r1.inRight && r2.inRight;
    const bothBehind = r1.behindFire && r2.behindFire && r1.inRight && r2.inRight;
    const anyFatal1 = r1.overCrash || r1.overFire || r1.overPolice || Boolean(r1.hitForb) || !r1.inRight;
    const anyFatal2 = r2.overCrash || r2.overFire || r2.overPolice || Boolean(r2.hitForb) || !r2.inRight;

    primaryDistMeters = Math.min(
      ft && r1.behindFire ? r1.distFire : r1.distCrash,
      ft && r2.behindFire ? r2.distFire : r2.distCrash
    );

    if (overlapTwo) {
      ambPosScore = 8;
      ambDistScore = 2;
      hasSpacingHazard = true;
      ambFeedback = 'Ambulancia 1 y Ambulancia 2 se solapan entre sí. Deben mantener ≥ 2,5 m de separación libre.';
      ambSteps.push('Separa Ambulancia 1 y Ambulancia 2 dejando al menos 2,5 m entre ellas.');
    } else if (anyFatal1 || anyFatal2) {
      ambPosScore = Math.min(r1.pos, r2.pos);
      ambDistScore = Math.min(r1.dist, r2.dist);
      ambFeedback = anyFatal1 ? r1.fb : r2.fb;
      ambSteps.push(...(anyFatal1 ? r1.steps : r2.steps));
    } else if (gapMeters < minRequiredSep) {
      ambPosScore = 18;
      ambDistScore = 8;
      hasSpacingHazard = true;
      ambFeedback = `Separación insuficiente entre Ambulancia 1 y Ambulancia 2 (${gapMeters.toFixed(1)} m libres). Debe dejarse al menos 2,5 m entre ellas.`;
      ambSteps.push(`Aumenta la distancia entre ambas ambulancias hasta superar 2,5 m (actual: ${gapMeters.toFixed(1)} m).`);
    } else if (bothAhead) {
      const closerCrash = Math.min(r1.distCrash, r2.distCrash);
      const furtherCrash = Math.max(r1.distCrash, r2.distCrash);
      primaryDistMeters = closerCrash;
      if (closerCrash >= 9.5 && closerCrash <= 17.5 && furtherCrash <= 44) {
        ambPosScore = 40;
        ambDistScore = 20;
        ambFeedback = `Ambas ambulancias bien situadas por delante del siniestro (primera a ${closerCrash.toFixed(1)} m y ${gapMeters.toFixed(1)} m de separación entre ellas).`;
      } else if (closerCrash >= 7.5 && furtherCrash <= 52) {
        ambPosScore = 30;
        ambDistScore = 13;
        ambFeedback = `Ambas ambulancias separadas (${gapMeters.toFixed(1)} m), pero la primera está a ${closerCrash.toFixed(1)} m del siniestro (pauta 10–15 m).`;
        ambSteps.push('Sitúa la primera ambulancia a 10–15 m por delante del accidente y la segunda más adelante con ≥ 2,5 m de separación.');
      } else {
        ambPosScore = 18;
        ambDistScore = 6;
        ambFeedback = `Distancia inadecuada respecto al siniestro (${closerCrash.toFixed(1)} m).`;
        ambSteps.push('Ajusta la primera ambulancia a 10–15 m por delante del siniestro.');
      }
    } else if (bothBehind) {
      const closerFire = Math.min(r1.distFire, r2.distFire);
      const furtherFire = Math.max(r1.distFire, r2.distFire);
      primaryDistMeters = closerFire;
      if (closerFire >= 9.5 && closerFire <= 17.5 && furtherFire <= 44) {
        ambPosScore = 40;
        ambDistScore = 20;
        ambFeedback = `Ambas ambulancias bien situadas detrás de Bomberos (a ${closerFire.toFixed(1)} m de Bomberos y ${gapMeters.toFixed(1)} m entre sí).`;
      } else if (closerFire >= 8.0 && furtherFire <= 52) {
        ambPosScore = 30;
        ambDistScore = 13;
        ambFeedback = `Separación entre ambulancias correcta (${gapMeters.toFixed(1)} m), pero la más próxima a Bomberos queda a ${closerFire.toFixed(1)} m (pauta 10–15 m).`;
        ambSteps.push('Ajusta la ambulancia más cercana a 10–15 m respecto a Bomberos.');
      } else {
        ambPosScore = 18;
        ambDistScore = 6;
        ambFeedback = `Distancia inadecuada respecto a Bomberos (${closerFire.toFixed(1)} m).`;
        ambSteps.push('Coloca la primera ambulancia a 10–15 m de Bomberos y la segunda detrás dejando ≥ 2,5 m.');
      }
    } else {
      // Split placement (e.g. one ahead, one behind fire) or trapped between fire & crash
      ambPosScore = Math.min(r1.pos, r2.pos);
      ambDistScore = Math.min(r1.dist, r2.dist);
      if (ambPosScore === 40 && ambDistScore === 20) {
        ambFeedback = `Ambas ambulancias bien situadas sin solaparse y con ${gapMeters.toFixed(1)} m de separación.`;
      } else {
        ambFeedback = r1.pos < r2.pos ? r1.fb : r2.fb;
        ambSteps.push(...r1.steps, ...r2.steps);
      }
    }

    ambOrientScore = Math.min(r1.orient, r2.orient);
    if (r1.orient < 20) ambSteps.push(...r1.steps.filter((s) => s.includes('Alinea') || s.includes('arcén')));
    if (r2.orient < 20) ambSteps.push(...r2.steps.filter((s) => s.includes('Alinea') || s.includes('arcén')));
  }

  if (!amb.lightsAllOn) {
    ambSteps.push('Mantén todas las luces de emergencia (V-1) activadas.');
  }

  const uniqueAmbSteps = Array.from(new Set(ambSteps));

  const ambRaw = ambPosScore + ambDistScore + ambOrientScore; // max 80
  const ambScore = Math.round((ambRaw / 80) * 60) + (amb.lightsAllOn ? 5 : 0);

  let ambStatus: CriterionResult['status'] = 'SAFE';
  if (ambPosScore <= 15 || ambDistScore <= 6 || ambOrientScore <= 4) {
    ambStatus = 'CRITICAL';
  } else if (ambPosScore < 40 || ambDistScore < 20 || ambOrientScore < 20 || !amb.lightsAllOn) {
    ambStatus = 'WARNING';
  }

  // 2. FIRE TRUCK (20 pts max: 5–10m behind crash & ~30° angle)
  let fireScore = 0;
  let fireStatus: CriterionResult['status'] = 'CRITICAL';
  let fireFeedback = '';

  if (ft) {
    const fireDist = Math.hypot(ft.x - scenario.crashPos.x, ft.y - scenario.crashPos.y) / upm;
    const fireBefore = ft.x < scenario.crashPos.x;
    const fireInLane = ft.y >= 400 && ft.y <= 515;
    const fireAngle = Math.abs(normalizeAngle(ft.angleDeg));
    const distOk = fireBefore && fireInLane && fireDist >= 4.5 && fireDist <= 11.5;
    const angleOk = fireAngle >= 20 && fireAngle <= 42;

    if (distOk) fireScore += 12;
    else if (fireBefore && fireInLane && fireDist >= 3 && fireDist <= 16) fireScore += 6;

    if (angleOk) fireScore += 8;
    else if (fireAngle >= 10 && fireAngle <= 50) fireScore += 4;

    if (distOk && angleOk) {
      fireStatus = 'SAFE';
      fireFeedback = `Camión de Bomberos bien situado a ${fireDist.toFixed(1)} m detrás del accidente y a ~30° (${Math.round(ft.angleDeg)}°).`;
    } else if (fireScore >= 10) {
      fireStatus = 'WARNING';
      fireFeedback = `Bomberos está ${fireBefore ? `${fireDist.toFixed(1)} m detrás` : 'delante'} a ${Math.round(ft.angleDeg)}°. Debe colocarse 5–10 m detrás del accidente en ángulo de ~30°.`;
    } else {
      fireStatus = 'CRITICAL';
      fireFeedback = `Posición incorrecta de Bomberos (${fireBefore ? `${fireDist.toFixed(1)} m detrás` : 'por delante'}, ${Math.round(ft.angleDeg)}°). El protocolo marca 5–10 m detrás del siniestro formando ~30°.`;
    }
  }

  // 3. POLICE (15 pts max: before only for one-way; before + after for two-way)
  let policeScore = 0;
  let policeStatus: CriterionResult['status'] = 'CRITICAL';
  let policeFeedback = '';
  const isTwoWay = scenario.trafficFlowLabel === 'Doble sentido';
  const leftMostAmbX = amb2 ? Math.min(amb.x, amb2.x) : amb.x;
  const upstreamAnchorX =
    ft && leftMostAmbX < ft.x ? Math.min(ft.x, leftMostAmbX) : ft ? ft.x : scenario.crashPos.x;

  if (!isTwoWay) {
    const p0 = policeList[0];
    const ok =
      p0 &&
      p0.x < upstreamAnchorX - 45 &&
      p0.y >= 395 &&
      p0.y <= 515;
    if (ok) {
      policeScore = 15;
      policeStatus = 'SAFE';
      policeFeedback =
        'Policía situada correctamente antes de todo el dispositivo (en sentido único solo necesita cubrir la aproximación previa).';
    } else if (p0 && p0.x < scenario.crashPos.x) {
      policeScore = 9;
      policeStatus = 'WARNING';
      policeFeedback =
        'La patrulla está antes del accidente, pero debe situarse por detrás de Bomberos y Ambulancia para advertir al tráfico con antelación.';
    } else {
      policeScore = 2;
      policeStatus = 'CRITICAL';
      policeFeedback =
        'En vía de sentido único la policía debe situarse ANTES del accidente y del resto de vehículos para advertir al tráfico que se aproxima.';
    }
  } else {
    const hasBefore = policeList.some(
      (p: MovableVehicle) =>
        p.x < upstreamAnchorX - 40 &&
        p.y >= 395 &&
        p.y <= 515 &&
        (!scenario.crosswalkX || p.x < scenario.crosswalkX[0] - 10 || p.x > scenario.crosswalkX[1] + 10)
    );
    const hasAfter = policeList.some(
      (p: MovableVehicle) => p.x > scenario.crashPos.x + 12 * upm && p.y >= 300 && p.y <= 398
    );

    if (hasBefore && hasAfter) {
      policeScore = 15;
      policeStatus = 'SAFE';
      policeFeedback =
        'Despliegue policial correcto en doble sentido: patrulla antes del dispositivo y patrulla después regulando el sentido contrario.';
    } else if (hasBefore || hasAfter) {
      policeScore = 8;
      policeStatus = 'WARNING';
      policeFeedback =
        'En vías de doble sentido deben situarse vehículos policiales tanto ANTES (previo al dispositivo en tu sentido) como DESPUÉS del accidente (sentido contrario).';
    } else {
      policeScore = 2;
      policeStatus = 'CRITICAL';
      policeFeedback =
        'Falta cubrir ambos sentidos: en doble sentido la policía debe colocarse antes y después del accidente.';
    }
  }

  const totalScore = Math.max(0, Math.min(100, ambScore + fireScore + policeScore));

  let grade: EvaluationResult['grade'] = 'RIESGO_CRITICO';
  let headline = 'Despliegue con errores críticos';
  if (totalScore >= 82 && ambStatus !== 'CRITICAL') {
    grade = 'SEGURO';
    headline = 'Despliegue completo seguro';
  } else if (totalScore >= 55 && ambStatus !== 'CRITICAL') {
    grade = 'MEJORABLE';
    headline = 'Despliegue válido con ajustes necesarios';
  }

  const correctionSteps: string[] = [...uniqueAmbSteps];
  if (fireStatus !== 'SAFE') {
    correctionSteps.push(
      'Camión de Bomberos: colócalo entre 5 y 10 metros detrás del accidente formando un ángulo de unos 30° (-30° hacia la mediana/centro).'
    );
  }
  if (policeStatus !== 'SAFE') {
    correctionSteps.push(
      isTwoWay
        ? 'Policía (doble sentido): sitúa un vehículo policial antes de todo el dispositivo (en tu carril) y otro después del accidente (regulando el carril contrario).'
        : 'Policía (sentido único): sitúa el vehículo policial antes de Bomberos y Ambulancia advirtiendo al tráfico entrante.'
    );
  }

  const correctionExplanation =
    correctionSteps.length === 0
      ? hasTwoAmbs
        ? 'Has coordinado correctamente todo el despliegue: Policía protegiendo antes, Bomberos a 5–10 m del accidente a 30°, y ambas ambulancias paralelas (0°) sin solaparse y manteniendo ≥ 2,5 m entre sí.'
        : 'Has coordinado correctamente todo el despliegue sin solapamientos: Policía protegiendo antes, Bomberos a 5–10 m del accidente a 30° y Ambulancia a 10–15 m tomando Bomberos como referencia.'
      : hasTwoAmbs
        ? 'Recuerda situar Policía antes, Bomberos 5–10 m detrás del siniestro a ~30°, y colocar ambas ambulancias paralelas (0°) sin solaparse con Bomberos y guardando ≥ 2,5 m entre ellas.'
        : `Recuerda tomar el camión de bomberos como referencia para la ambulancia (10–15 m sin solaparse), situar Bomberos 5–10 m detrás del siniestro a ~30°, y Policía ${isTwoWay ? 'antes y después' : 'antes del dispositivo'}.`;

  return {
    totalScore,
    grade,
    headline,
    distanceMeters: primaryDistMeters,
    isBeforeCrash: amb.x < scenario.crashPos.x,
    hasSightlineHazard: false,
    hasSpacingHazard,
    hasBlockedAccessHazard,
    correctionExplanation,
    correctionSteps,
    criteria: [
      {
        id: 'adv_ambulance',
        label: hasTwoAmbs
          ? 'Ambulancias 1 y 2 (sin solapar · sep. ≥ 2,5 m · 0°)'
          : 'Ambulancia (10–15 m respecto a Bomberos · sin solapar)',
        score: ambScore,
        maxScore: 65,
        status: ambStatus,
        feedback: ambFeedback,
      },
      {
        id: 'adv_fire',
        label: 'Bomberos (5–10 m detrás del accidente · ángulo ~30°)',
        score: fireScore,
        maxScore: 20,
        status: fireStatus,
        feedback: fireFeedback,
      },
      {
        id: 'adv_police',
        label: isTwoWay
          ? 'Policía (antes y después en doble sentido)'
          : 'Policía (antes en sentido único)',
        score: policeScore,
        maxScore: 15,
        status: policeStatus,
        feedback: policeFeedback,
      },
    ],
  };
}

