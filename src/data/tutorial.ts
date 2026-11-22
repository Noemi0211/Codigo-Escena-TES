import { AmbulancePlacement, ScenarioSpec } from '../types/game';
import { computeDistanceMeters } from '../engine/evaluator';

export interface TutorialStep {
  id: 'distance' | 'exit' | 'barrier';
  stepNumber: number;
  premiseTitle: string;
  premiseDescription: string;
  taskInstruction: string;
  scenario: ScenarioSpec;
  checkCompleted: (placement: AmbulancePlacement) => {
    done: boolean;
    checks: Array<{ label: string; ok: boolean }>;
  };
}

const STEP_1_SCENARIO: ScenarioSpec = {
  id: 'tutorial_distancia',
  order: 0,
  title: 'Tutorial · Premisa 1: Distancia de seguridad',
  roadLabel: 'Autovía (Práctica guiada)',
  roadType: 'HIGHWAY',
  trafficFlowLabel: 'Sentido único',
  arrivalPhase: 'FIRST_RESPONDER',
  speedLimitKmh: 120,
  isNight: false,
  unitsPerMeter: 10,
  additionalHazard: 'NONE',
  briefing:
    'La ambulancia está demasiado pegada al accidente. Un posible incendio o desplazamiento del vehículo siniestrado pondría en peligro al equipo.',
  keyObjective:
    'Arrastra la ambulancia hacia atrás (izquierda) en el carril derecho hasta situarla entre 20 y 32 metros antes del accidente (~25 m).',
  crashPos: { x: 930, y: 445 },
  policePositions: [],
  cones: [],
  initialAmbulance: {
    x: 845,
    y: 445,
    angleDeg: 0,
    lightsAllOn: true,
    hazardMarked: false,
    ccuNotified: false,
  },
  idealZone: { xMin: 610, xMax: 730, yMin: 415, yMax: 495, label: 'Distancia segura (~25 m)' },
  acceptableZone: { xMin: 580, xMax: 745, yMin: 405, yMax: 505 },
  forbiddenZones: [],
  idealAngleRange: [-45, -30],
  expectsWedge: true,
  idealDistanceMeters: [20, 32],
  protocolSummary: '',
  protocolBullets: [],
};

const STEP_2_SCENARIO: ScenarioSpec = {
  id: 'tutorial_salida',
  order: 0,
  title: 'Tutorial · Premisa 2: Salida operativa',
  roadLabel: 'Carretera asegurada (Práctica guiada)',
  roadType: 'HIGHWAY',
  trafficFlowLabel: 'Sentido único',
  arrivalPhase: 'STANDARD_SECURED',
  speedLimitKmh: 100,
  isNight: false,
  unitsPerMeter: 10,
  additionalHazard: 'NONE',
  briefing:
    'Policía y Bomberos (5–10 m detrás a 30°) ya aseguran la escena. Ahora debes colocarte para poder evacuar rápido al hospital sin dar marcha atrás.',
  keyObjective:
    'Coloca la ambulancia entre 10 y 16 metros por DELANTE (derecha) del accidente y alinéala paralela (0°) al carril.',
  crashPos: { x: 640, y: 445 },
  policePositions: [{ x: 300, y: 445, angleDeg: -32 }],
  fireTruckPos: { x: 555, y: 445, angleDeg: -30 },
  cones: [
    { x: 350, y: 405 },
    { x: 430, y: 402 },
    { x: 510, y: 402 },
  ],
  initialAmbulance: {
    x: 420,
    y: 355,
    angleDeg: -35,
    lightsAllOn: true,
    hazardMarked: true,
    ccuNotified: true,
  },
  idealZone: { xMin: 740, xMax: 805, yMin: 415, yMax: 495, label: 'Salida operativa (10–15 m delante)' },
  acceptableZone: { xMin: 725, xMax: 825, yMin: 405, yMax: 505 },
  forbiddenZones: [],
  idealAngleRange: [-10, 10],
  expectsWedge: false,
  idealDistanceMeters: [10, 16],
  protocolSummary: '',
  protocolBullets: [],
};

const STEP_3_SCENARIO: ScenarioSpec = {
  id: 'tutorial_barrera',
  order: 0,
  title: 'Tutorial · Premisa 3: Barrera de protección',
  roadLabel: 'Primer interviniente (Práctica guiada)',
  roadType: 'HIGHWAY',
  trafficFlowLabel: 'Sentido único',
  arrivalPhase: 'FIRST_RESPONDER',
  speedLimitKmh: 120,
  isNight: false,
  unitsPerMeter: 10,
  additionalHazard: 'NONE',
  briefing:
    'Ya estás a ~25 m antes del siniestro como primer recurso. Ahora debes convertir la ambulancia en escudo físico y activar las medidas de protección.',
  keyObjective:
    'Gira el frontal hacia la mediana (-30° a -45°), activa todas las luces, señaliza el peligro y avisa al Centro Coordinador.',
  crashPos: { x: 930, y: 445 },
  policePositions: [],
  cones: [],
  initialAmbulance: {
    x: 680,
    y: 445,
    angleDeg: 0,
    lightsAllOn: false,
    hazardMarked: false,
    ccuNotified: false,
  },
  idealZone: { xMin: 610, xMax: 745, yMin: 415, yMax: 495 },
  acceptableZone: { xMin: 580, xMax: 760, yMin: 405, yMax: 505 },
  forbiddenZones: [],
  idealAngleRange: [-45, -30],
  expectsWedge: true,
  idealDistanceMeters: [20, 32],
  protocolSummary: '',
  protocolBullets: [],
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'distance',
    stepNumber: 1,
    premiseTitle: '1. Distancia de seguridad',
    premiseDescription:
      'El vehículo asistencial debe situarse a una distancia prudente del accidente para prevenir riesgos de incendio, explosión o desplazamiento inesperado de los vehículos implicados (~25 m como primer interviniente; ≥ 75 m en incendios; > 500 m en mercancías peligrosas).',
    taskInstruction:
      'Mueve la ambulancia en el carril derecho hasta situarla entre 20 y 32 metros ANTES del accidente.',
    scenario: STEP_1_SCENARIO,
    checkCompleted: (p) => {
      const dist = computeDistanceMeters(p, STEP_1_SCENARIO);
      const isBefore = p.x < STEP_1_SCENARIO.crashPos.x;
      const inLane = p.y >= 400 && p.y <= 505;
      const distOk = dist >= 20 && dist <= 32;
      return {
        done: isBefore && inLane && distOk,
        checks: [
          { label: 'Situada antes del accidente (izquierda)', ok: isBefore },
          { label: 'Dentro del carril derecho o arcén', ok: inLane },
          { label: `Distancia entre 20 y 32 m (actual: ${dist.toFixed(1)} m)`, ok: distOk },
        ],
      };
    },
  },
  {
    id: 'exit',
    stepNumber: 2,
    premiseTitle: '2. Salida operativa',
    premiseDescription:
      'La ambulancia debe quedar orientada de manera que facilite una reincorporación rápida y segura al tráfico cuando sea necesario evacuar a la víctima. Cuando ya hay policía y bomberos, se sitúa 10–15 m por delante.',
    taskInstruction:
      'Coloca la ambulancia 10–16 m por DELANTE del accidente en el carril derecho y alinéala paralela (0°).',
    scenario: STEP_2_SCENARIO,
    checkCompleted: (p) => {
      const dist = computeDistanceMeters(p, STEP_2_SCENARIO);
      const isAhead = p.x > STEP_2_SCENARIO.crashPos.x;
      const inLane = p.y >= 400 && p.y <= 505;
      const distOk = dist >= 10 && dist <= 16;
      const angleOk = Math.abs(p.angleDeg) <= 10;
      return {
        done: isAhead && inLane && distOk && angleOk,
        checks: [
          { label: 'Situada por delante del accidente (derecha)', ok: isAhead },
          { label: 'En el carril derecho protegido', ok: inLane },
          { label: `Distancia entre 10 y 16 m (actual: ${dist.toFixed(1)} m)`, ok: distOk },
          { label: `Orientación paralela -10° a +10° (actual: ${p.angleDeg}°)`, ok: angleOk },
        ],
      };
    },
  },
  {
    id: 'barrier',
    stepNumber: 3,
    premiseTitle: '3. Barrera de protección',
    premiseDescription:
      'Siempre que sea posible como primer interviniente, la ambulancia sirve de barrera física entre el tráfico y la zona de intervención. Se gira 30°–45° con el frontal hacia la mediana o centro de la vía para proteger la zona trasera y lateral de trabajo.',
    taskInstruction:
      'Gira el frontal hacia la mediana (-30° a -45°), activa todas las luces, señaliza el peligro y avisa al Centro Coordinador.',
    scenario: STEP_3_SCENARIO,
    checkCompleted: (p) => {
      const angleOk = p.angleDeg <= -30 && p.angleDeg >= -45;
      const beforeOk = p.x < STEP_3_SCENARIO.crashPos.x - 150;
      return {
        done: angleOk && beforeOk && p.lightsAllOn && p.hazardMarked && p.ccuNotified,
        checks: [
          { label: `Frontal hacia la mediana entre -30° y -45° (actual: ${p.angleDeg}°)`, ok: angleOk },
          { label: 'Todas las señales luminosas activadas (V-1)', ok: p.lightsAllOn },
          { label: 'Peligro señalizado de forma visible', ok: p.hazardMarked },
          { label: 'Aviso comunicado al Centro Coordinador', ok: p.ccuNotified },
        ],
      };
    },
  },
];
