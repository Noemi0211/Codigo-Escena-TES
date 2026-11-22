import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';

interface CicuScenarioPayload {
  id: string;
  title: string;
  roadLabel: string;
  trafficFlowLabel: string;
  arrivalPhase: 'FIRST_RESPONDER' | 'STANDARD_SECURED';
  isAdvancedDeployment?: boolean;
  speedLimitKmh: number;
  isNight: boolean;
  additionalHazard?: string;
  briefing: string;
  keyObjective: string;
  hasSecondAmbulance?: boolean;
}

interface CicuHistoryItem {
  sender: 'CICU' | 'TES';
  text: string;
}

interface CicuEvaluateRequest {
  scenario: CicuScenarioPayload;
  placementSummary?: string;
  history?: CicuHistoryItem[];
  message: string;
}

const CICU_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    operatorReply: {
      type: Type.STRING,
      description:
        'Respuesta realista y breve del operador/a del CICU por emisora TETRA en español (máximo 3 frases). Confirma lo recibido y, si falta alguna letra crítica de LCANS o dato de seguridad/acceso, pídelo concretamente.',
    },
    lcans: {
      type: Type.OBJECT,
      properties: {
        L: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['COMPLETO', 'PARCIAL', 'OMITIDO'] },
            feedback: { type: Type.STRING },
          },
          required: ['status', 'feedback'],
        },
        C: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['COMPLETO', 'PARCIAL', 'OMITIDO'] },
            feedback: { type: Type.STRING },
          },
          required: ['status', 'feedback'],
        },
        A: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['COMPLETO', 'PARCIAL', 'OMITIDO'] },
            feedback: { type: Type.STRING },
          },
          required: ['status', 'feedback'],
        },
        N: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['COMPLETO', 'PARCIAL', 'OMITIDO'] },
            feedback: { type: Type.STRING },
          },
          required: ['status', 'feedback'],
        },
        S: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['COMPLETO', 'PARCIAL', 'OMITIDO'] },
            feedback: { type: Type.STRING },
          },
          required: ['status', 'feedback'],
        },
      },
      required: ['L', 'C', 'A', 'N', 'S'],
    },
    brevityStatus: {
      type: Type.STRING,
      enum: ['ADECUADA', 'MEJORABLE'],
    },
    brevityFeedback: {
      type: Type.STRING,
      description:
        'Valoración de si la comunicación es breve, precisa y orientada a la toma de decisiones sin rodeos ni interpretaciones personales.',
    },
    inSituCoordinationMentioned: {
      type: Type.BOOLEAN,
      description:
        'True si menciona coordinación in situ con mandos de otros servicios (Policía/Bomberos) o adaptación conjunta, o si da indicaciones claras para las unidades intervinientes.',
    },
    inSituFeedback: {
      type: Type.STRING,
    },
    overallStatus: {
      type: Type.STRING,
      enum: ['APROBADO', 'FALTA_INFO'],
      description:
        'APROBADO si los 5 apartados LCANS están suficientemente cubiertos (sin apartados críticos omitidos) teniendo en cuenta toda la conversación; FALTA_INFO si falta información esencial que el operador debe solicitar.',
    },
    score: {
      type: Type.INTEGER,
      description: 'Puntuación global de 0 a 100 de la comunicación LCANS acumulada.',
    },
    tips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Hasta 2 recomendaciones breves y concretas para mejorar la llamada.',
    },
  },
  required: [
    'operatorReply',
    'lcans',
    'brevityStatus',
    'brevityFeedback',
    'inSituCoordinationMentioned',
    'inSituFeedback',
    'overallStatus',
    'score',
    'tips',
  ],
};

const SYSTEM_INSTRUCTION = `Eres un/a operador/a experto/a del CICU (Centro de Información y Coordinación de Urgencias / 112) y docente de Formación Profesional en el ciclo de Técnico en Emergencias Sanitarias (TES), módulo "Evacuación y Traslado de Pacientes".

Estás simulando una comunicación real por radio/emisora entre una unidad asistencial (el alumnado TES) en escena y el CICU para evaluar si aplica correctamente el método LCANS y los principios de comunicación de la valoración inicial:

CONTENIDO OFICIAL DE LA UNIDAD:
- Tras la inspección visual, la información obtenida debe transmitirse al centro coordinador y al resto de servicios intervinientes para ajustar recursos, anticipar necesidades y coordinar la actuación conjunta.
- La comunicación debe ser BREVE, PRECISA y ORIENTADA A LA TOMA DE DECISIONES, evitando interpretaciones personales, juicios de valor o datos irrelevantes.
- Método LCANS:
  * L - Localización: Confirmación o corrección del punto exacto del accidente (vía, km/cruce/túnel, sentido), incluyendo accesos seguros para las unidades que aún están en camino.
  * C - Condiciones: Descripción del escenario y riesgos detectados (tráfico activo, visibilidad/niebla/lluvia/noche, incendio, vehículos inestables, presencia de mercancías peligrosas ADR, número aproximado de vehículos/afectados).
  * A - Acciones: Medidas que ya se están llevando a cabo en el lugar (estacionamiento de protección/salida operativa, luces de emergencia V-1, señalización del peligro, control inicial de riesgos o atención inicial a víctimas).
  * N - Necesidades: Solicitud de recursos adicionales o especializados según lo observado (Policía/Guardia Civil para corte o regulación, Bomberos para excarcelación/incendio/ADR, otra ambulancia SVA/SVB, mantenimiento/grúa, o confirmación de recursos suficientes si ya están presentes).
  * S - Seguridad: Información sobre zonas seguras de acceso, emplazamiento recomendado de vehículos de emergencia y recomendaciones para evitar nuevos riesgos (distancias mínimas, sentido seguro, barlovento en ADR, no invadir curvas sin visibilidad, separación entre ambulancias).
- Además de la comunicación con el centro coordinador, es fundamental mantener una comunicación fluida in situ entre los mandos de los distintos servicios para consensuar el plan de actuación y adaptar la intervención a la evolución del escenario.

REGLAS DE EVALUACIÓN:
1. Evalúa el mensaje ACTUAL junto con los mensajes previos del alumno en la conversación (si es un segundo turno respondiendo a una petición del CICU, acumula lo que ya comunicó correctamente antes y actualiza los estados de L, C, A, N, S).
2. Sé realista, exigente pero justo y constructivo con estudiantes de Grado Medio TES:
   - Si el alumno omite claramente una letra de LCANS (o un riesgo crítico del escenario como incendio >=75m, ADR >500m, acceso seguro en curva/túnel o solicitud de Policía/Bomberos cuando es primer interviniente), márcalo como OMITIDO o PARCIAL, pon overallStatus = "FALTA_INFO" y haz que operatorReply pida brevemente ese dato concreto por radio.
   - Si el mensaje incluye datos inventados que contradicen el escenario o es excesivamente largo/subjetivo ("creo que fue culpa del conductor"), señálalo en brevityFeedback o en la letra correspondiente.
   - Cuando L, C, A, N y S estén cubiertos de forma clara (aunque alguna letra pueda tener un pequeño matiz mejorable), pon overallStatus = "APROBADO" y confirma el parte desde el CICU recordando brevemente la coordinación in situ con los mandos si aplica.
3. Mantén operatorReply en tono profesional de emisora española ("CICU a unidad, recibido...", "Adelante unidad..."), claro y directo.`;

const TUTOR_ANALYZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    riskAnalysis: {
      type: Type.STRING,
      description:
        'Análisis personalizado en español (2-3 frases) citando los datos reales del intento (distancia exacta, posición antes/después, ángulo, separación entre ambulancias si aplica, luces V-1, señalización y aviso al CICU/CCU) y explicando el riesgo físico concreto que genera esa colocación (o la protección lograda si fue seguro).',
    },
    keyTakeaway: {
      type: Type.STRING,
      description:
        'Una frase breve y directa con la idea operativa clave que debe recordar el alumno en esta vía.',
    },
    socraticQuestion: {
      type: Type.STRING,
      description:
        'Una única pregunta corta de reflexión dirigida al alumno (tutear) para que razone el porqué del riesgo o qué ajuste debe hacer antes de reintentar, sin darle la solución numérica exacta masticada.',
    },
  },
  required: ['riskAnalysis', 'keyTakeaway', 'socraticQuestion'],
};

const TUTOR_REPLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tutorResponse: {
      type: Type.STRING,
      description:
        'Respuesta breve del tutor socrático (1-2 frases en español) validando o matizando la reflexión del alumno antes de reintentar.',
    },
    understood: {
      type: Type.BOOLEAN,
      description:
        'True si el alumno demuestra haber comprendido el criterio de seguridad o el ajuste necesario.',
    },
  },
  required: ['tutorResponse', 'understood'],
};

const TUTOR_SYSTEM_INSTRUCTION = `Eres un tutor socrático experto y docente de Formación Profesional en Técnico en Emergencias Sanitarias (TES), módulo "Evacuación y Traslado de Pacientes".

CRITERIOS OFICIALES DEL PROTOCOLO TES:
- Primer interviniente (sin policía): estacionar ANTES del accidente (~25 m en condiciones normales; >25–50 m con lluvia/niebla; antes de curvas sin visibilidad o túneles), formando un ángulo de 30° a 45° con el frontal hacia la mediana/centro para crear barrera física que proteja la parte trasera y lateral del equipo. Activar todas las señales luminosas (V-1), señalizar peligro visible y avisar al CICU/CCU.
- Estacionamiento estándar (Policía y Bomberos presentes): Bomberos estaciona 5–10 m detrás del accidente a ~30°. La ambulancia estaciona 10–15 m POR DELANTE (con salida operativa, normalmente paralela 0°) o tomando Bomberos como referencia en el despliegue avanzado sin solaparse. Si hay dos ambulancias, mantener >= 2,5 m de separación entre ellas. Policía en doble sentido cubre antes y después; en sentido único solo antes.
- Riesgos adicionales: vehículo incendiado >= 75 m; mercancías peligrosas (ADR) > 500 m (y aviso al CICU esperando instrucciones).

TU ESTILO PEDAGÓGICO:
1. Analiza SIEMPRE los datos numéricos y estados reales del intento (distancia exacta en metros, lado antes/después, ángulo, luces V-1, señalización, CICU, separación entre ambulancias, Bomberos/Policía si es nivel avanzado).
2. Explica la consecuencia física real de esa colocación concreta (p. ej. atrapamiento o proyección del vehículo sobre el equipo si hay impacto trasero por ángulo paralelo, exposición a humo/explosión, colisión por falta de visibilidad en curva, bloqueo de vía de evacuación o solapamiento con Bomberos).
3. Formula UNA pregunta corta de reflexión (método socrático) para que el alumno deduzca la causa o el cambio necesario antes de pulsar "Reintentar", sin regalarle directamente la receta completa.
4. Si la puntuación ya es segura (>= 85 y sin errores críticos), refuerza qué parámetro lo hizo seguro y plantea una pregunta breve de consolidación o contingencia.`;

type GeneratorRoadType =
  | 'HIGHWAY'
  | 'CONVENTIONAL'
  | 'ADVERSE_WEATHER'
  | 'BLIND_CURVE'
  | 'TUNNEL_PORTAL'
  | 'URBAN'
  | 'FIRE_HAZARD'
  | 'ADR_HAZMAT';

interface ScenarioGeneratorRequest {
  prompt?: string;
  roadType?: 'AUTO' | GeneratorRoadType;
  trafficFlowLabel?: 'AUTO' | 'Sentido único' | 'Doble sentido';
  arrivalPhase?: 'AUTO' | 'FIRST_RESPONDER' | 'STANDARD_SECURED' | 'ADVANCED';
  lighting?: 'AUTO' | 'DAY' | 'NIGHT';
  ambulanceCount?: 'AUTO' | '1' | '2';
}

interface AiScenarioBlueprint {
  title: string;
  roadLabel: string;
  roadType: GeneratorRoadType;
  trafficFlowLabel: 'Sentido único' | 'Doble sentido';
  arrivalPhase: 'FIRST_RESPONDER' | 'STANDARD_SECURED';
  isAdvancedDeployment: boolean;
  speedLimitKmh: number;
  isNight: boolean;
  hasAdverseWeather: boolean;
  hasMultiVehicleCrash: boolean;
  additionalHazard: 'NONE' | 'ADVERSE_WEATHER' | 'LIMITED_VISIBILITY' | 'FIRE' | 'HAZMAT';
  hasTwoAmbulances: boolean;
  briefing: string;
  keyObjective: string;
  protocolSummary: string;
  protocolBullets: string[];
}

type AdaptiveSkillId =
  | 'ADR_FIRE_DISTANCE'
  | 'DEFENSIVE_ANGLE'
  | 'OPERATIONAL_EXIT'
  | 'FIRE_POLICE_SPACING'
  | 'TWO_AMBULANCE_GAP'
  | 'VISIBILITY_HAZARD'
  | 'SIGNALING_AND_CCU'
  | 'LANE_DISCIPLINE';

interface AdaptiveScenarioRequest {
  targetSkillId: AdaptiveSkillId;
  failuresCount?: number;
  recentIssues?: string[];
  variantSeed?: number;
}

const SCENARIO_GENERATOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Título breve y realista del escenario (máx. 55 caracteres, p. ej. "Secundaria C-32 · Colisión y Fuga").',
    },
    roadLabel: {
      type: Type.STRING,
      description: 'Etiqueta corta del tipo de vía y entorno (máx. 40 caracteres).',
    },
    roadType: {
      type: Type.STRING,
      enum: [
        'HIGHWAY',
        'CONVENTIONAL',
        'ADVERSE_WEATHER',
        'BLIND_CURVE',
        'TUNNEL_PORTAL',
        'URBAN',
        'FIRE_HAZARD',
        'ADR_HAZMAT',
      ],
    },
    trafficFlowLabel: {
      type: Type.STRING,
      enum: ['Sentido único', 'Doble sentido'],
    },
    arrivalPhase: {
      type: Type.STRING,
      enum: ['FIRST_RESPONDER', 'STANDARD_SECURED'],
    },
    isAdvancedDeployment: {
      type: Type.BOOLEAN,
      description: 'True SOLO si se pide explícitamente despliegue completo donde el alumno coloca Policía, Bomberos y Ambulancia.',
    },
    speedLimitKmh: {
      type: Type.INTEGER,
      description: 'Límite de velocidad realista en km/h (50 urbana, 70-90 secundaria/convencional, 100-120 autovía).',
    },
    isNight: { type: Type.BOOLEAN },
    hasAdverseWeather: {
      type: Type.BOOLEAN,
      description: 'True si hay lluvia fuerte, niebla, nieve, granizo o hielo en el escenario.',
    },
    hasMultiVehicleCrash: {
      type: Type.BOOLEAN,
      description: 'True si intervienen 2 o más vehículos accidentados (colisión frontal, alcance múltiple).',
    },
    additionalHazard: {
      type: Type.STRING,
      enum: ['NONE', 'ADVERSE_WEATHER', 'LIMITED_VISIBILITY', 'FIRE', 'HAZMAT'],
      description: 'Usa FIRE para vehículo incendiado o fuga/derrame de combustible; HAZMAT para mercancías peligrosas ADR; LIMITED_VISIBILITY para curva ciega o túnel; ADVERSE_WEATHER para lluvia/niebla/hielo sin fuego ni ADR.',
    },
    hasTwoAmbulances: {
      type: Type.BOOLEAN,
      description: 'True si el caso implica múltiples víctimas o requiere coordinar 2 ambulancias.',
    },
    briefing: {
      type: Type.STRING,
      description: 'Enunciado operativo en español (2-3 frases claras) describiendo la vía, el accidente, condiciones meteorológicas/visibilidad, riesgos detectados y qué servicios están presentes.',
    },
    keyObjective: {
      type: Type.STRING,
      description: 'Criterio principal de actuación en 1 frase clara conforme al protocolo TES.',
    },
    protocolSummary: {
      type: Type.STRING,
      description: 'Resumen pedagógico de 1-2 frases explicando el criterio de evaluación de este escenario.',
    },
    protocolBullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exactamente 3 o 4 criterios concretos de evaluación para este caso.',
    },
  },
  required: [
    'title',
    'roadLabel',
    'roadType',
    'trafficFlowLabel',
    'arrivalPhase',
    'isAdvancedDeployment',
    'speedLimitKmh',
    'isNight',
    'hasAdverseWeather',
    'hasMultiVehicleCrash',
    'additionalHazard',
    'hasTwoAmbulances',
    'briefing',
    'keyObjective',
    'protocolSummary',
    'protocolBullets',
  ],
};

const SCENARIO_GENERATOR_SYSTEM_INSTRUCTION = `Eres un docente diseñador de simulaciones prácticas para Técnico en Emergencias Sanitarias (TES), módulo "Evacuación y Traslado de Pacientes".

Tu tarea es transformar la descripción o parámetros elegidos por el profesorado en un escenario táctico vial coherente, realista y 100% alineado con los protocolos españoles de estacionamiento asistencial:
1. PRIMER INTERVINIENTE (FIRST_RESPONDER): sin Policía ni Bomberos todavía en el lugar. La ambulancia estaciona ANTES del accidente (~25 m normal; 35–50 m con lluvia/niebla; antes de curva ciega o boca de túnel) formando 30°–45° hacia la mediana/centro, con luces V-1, señalización y aviso al CICU/CCU.
2. ESTACIONAMIENTO ESTÁNDAR (STANDARD_SECURED): ya hay Policía (antes en sentido único; antes y después en doble sentido) y Bomberos (5–10 m detrás del siniestro a 30°). La ambulancia estaciona 10–15 m POR DELANTE en paralelo (0°) con salida operativa (y si hay 2 ambulancias, >= 2,5 m de separación).
3. RIESGOS ESPECIALES:
   - Fuga de combustible o incendio -> additionalHazard="FIRE", roadType="FIRE_HAZARD" (distancia mínima >= 75 metros antes del foco, primer interviniente, aviso al CCU).
   - Mercancías peligrosas / panel naranja ADR -> additionalHazard="HAZMAT", roadType="ADR_HAZMAT" (distancia > 500 metros antes, aviso al CCU).
   - Curva sin visibilidad -> roadType="BLIND_CURVE", additionalHazard="LIMITED_VISIBILITY" (antes del punto conflictivo).
   - Túnel -> roadType="TUNNEL_PORTAL", additionalHazard="LIMITED_VISIBILITY" (antes de la boca del túnel sin bloquear acceso a Bomberos).
   - Lluvia intensa / niebla / hielo sin fuego ni ADR -> roadType="ADVERSE_WEATHER", hasAdverseWeather=true, additionalHazard="ADVERSE_WEATHER". (Si hay lluvia Y fuego/fuga de combustible a la vez, pon roadType="FIRE_HAZARD", additionalHazard="FIRE" y hasAdverseWeather=true).
4. Si no se mencionan Policía ni Bomberos ya presentes ni despliegue avanzado, asume que eres el primer recurso en llegar (FIRST_RESPONDER) y redacta el briefing de forma coherente.`;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`TIMEOUT:${label}:${ms}`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(id);
        resolve(val);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      }
    );
  });
}

async function generateEvaluationFast(ai: GoogleGenAI, contents: string) {
  try {
    return await withTimeout(
      ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: CICU_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      5000,
      MODEL_ID
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      msg.includes('TIMEOUT') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('500') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('fetch');
    if (!shouldFallback) {
      throw err;
    }
    console.warn('[CICU Evaluate Fallback to gemini-3.1-flash-lite]', msg);
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: CICU_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      12000,
      'gemini-3.1-flash-lite'
    );
  }
}

async function generateTutorJsonFast(
  ai: GoogleGenAI,
  contents: string,
  schema: typeof TUTOR_ANALYZE_SCHEMA | typeof TUTOR_REPLY_SCHEMA
) {
  try {
    return await withTimeout(
      ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: TUTOR_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      4500,
      MODEL_ID
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      msg.includes('TIMEOUT') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('500') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('fetch');
    if (!shouldFallback) {
      throw err;
    }
    console.warn('[Tutor Fallback to gemini-3.1-flash-lite]', msg);
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: TUTOR_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      10000,
      'gemini-3.1-flash-lite'
    );
  }
}

async function generateScenarioJsonFast(ai: GoogleGenAI, contents: string) {
  try {
    return await withTimeout(
      ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: SCENARIO_GENERATOR_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: SCENARIO_GENERATOR_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      4500,
      MODEL_ID
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      msg.includes('TIMEOUT') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('500') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('fetch');
    if (!shouldFallback) {
      throw err;
    }
    console.warn('[Scenario Generator Fallback to gemini-3.1-flash-lite]', msg);
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: SCENARIO_GENERATOR_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: SCENARIO_GENERATOR_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      10000,
      'gemini-3.1-flash-lite'
    );
  }
}

interface ProtocolAskRequest {
  question?: string;
  history?: Array<{ role: 'USER' | 'CONSULTANT'; text: string }>;
  scenarioContext?: {
    title?: string;
    roadLabel?: string;
    arrivalPhase?: string;
    isAdvancedDeployment?: boolean;
    additionalHazard?: string;
  } | null;
}

const PROTOCOL_CONSULTANT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    inScope: {
      type: Type.BOOLEAN,
      description:
        'True si la pregunta pertenece al temario de Evacuación y Traslado de Pacientes (estacionamiento asistencial, autoprotección en vía pública, señalización V-1, distancias, visibilidad, coordinación con servicios o comunicación LCANS al CICU). False si es ajena al temario.',
    },
    relatedTopic: {
      type: Type.STRING,
      description:
        'Etiqueta breve del bloque del temario en español (p. ej. "Primer interviniente vs. Estándar", "Luces V-1 y balizamiento", "Túneles y curvas sin visibilidad", "Riesgos especiales (Fuego/ADR)", "Método LCANS / CICU" o "Fuera de temario").',
    },
    answer: {
      type: Type.STRING,
      description:
        'Respuesta clara, directa y práctica en español (máximo 4 frases o puntos breves separados por saltos de línea) basada estrictamente en el protocolo TES.',
    },
    keyRule: {
      type: Type.STRING,
      description:
        'Regla mnemotécnica o resumen operativo en 1 frase corta (cadena vacía "" si inScope es false).',
    },
    followUpSuggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Exactamente 2 preguntas breves de seguimiento en español dentro del temario TES.',
    },
  },
  required: ['inScope', 'relatedTopic', 'answer', 'keyRule', 'followUpSuggestions'],
};

const PROTOCOL_CONSULTANT_SYSTEM_INSTRUCTION = `Eres un consultor teórico rápido especializado exclusivamente en el módulo "Evacuación y Traslado de Pacientes" del ciclo de Técnico en Emergencias Sanitarias (TES), en España.

ALCANCE ESTRICTO (MUY IMPORTANTE):
- SOLO respondes dudas teóricas u operativas sobre:
  1. Estacionamiento seguro del vehículo asistencial: premisas fundamentales (distancia de seguridad, salida operativa, barrera física de protección).
  2. Diferencias entre Primer Interviniente (sin policía: antes del siniestro ~25 m, cuña 30°–45° hacia mediana/centro, V-1 completas + señalizar peligro + avisar al CCU/CICU) y Estacionamiento Estándar con Policía y Bomberos (Bomberos 5–10 m detrás a 30°; Ambulancia 10–15 m por delante en paralelo 0° con salida operativa; separación >= 2,5 m si hay más de una ambulancia; Policía antes y después en doble sentido o solo antes en sentido único).
  3. Adaptación a condiciones de la vía y riesgos adicionales: lluvia/niebla/firme deslizante (ampliar por encima de 25–50 m por mayor distancia de frenado), visibilidad limitada en curvas ciegas, cambios de rasante y túneles (siempre ANTES del punto conflictivo sin bloquear el acceso a Bomberos), incendios o fugas de combustible (mínimo 75 m), mercancías peligrosas ADR (> 500 m, barlovento, aviso urgente al CCU y esperar instrucciones).
  4. Luces de emergencia V-1, balizamiento/señalización visible del peligro, disciplina de carriles, pasos de peatones y bocacalles.
  5. Comunicación de la valoración inicial al CICU/CCU mediante el método LCANS (Localización y accesos seguros, Condiciones y riesgos, Acciones en curso, Necesidades de recursos, Seguridad y zonas seguras), brevedad/precisión sin interpretaciones personales, y comunicación fluida in situ entre mandos de los distintos servicios.
- Si el alumno pregunta sobre CUALQUIER otro tema ajeno a este temario (recetas, matemáticas, política, programación, diagnósticos médicos clínicos sin relación con la escena o traslado, etc.), pon inScope=false, relatedTopic="Fuera de temario", keyRule="" y declina amablemente en 1-2 frases indicando qué dudas del módulo sí puedes resolver.

REGLA ANTI-SPOILER MIENTRAS PRACTICA:
- Si se adjunta contexto del escenario activo, úsalo solo para enfocar la explicación normativa (p. ej., recordar la regla general en túneles o en primera llegada), pero responde de forma teórica y formativa sin chivar directamente coordenadas ni "mueve la ambulancia al punto X".`;

async function generateProtocolAnswerFast(ai: GoogleGenAI, contents: string) {
  try {
    return await withTimeout(
      ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: PROTOCOL_CONSULTANT_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: PROTOCOL_CONSULTANT_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      4500,
      MODEL_ID
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      msg.includes('TIMEOUT') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('500') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('fetch');
    if (!shouldFallback) {
      throw err;
    }
    console.warn('[Protocol Consultant Fallback to gemini-3.1-flash-lite]', msg);
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: PROTOCOL_CONSULTANT_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: PROTOCOL_CONSULTANT_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      10000,
      'gemini-3.1-flash-lite'
    );
  }
}

interface FinalReportRequest {
  campaignLevel?: 'BASIC' | 'ADVANCED';
  avgScore?: number;
  safeCount?: number;
  totalScenarios?: number;
  history?: Array<{
    scenarioId: string;
    title: string;
    roadLabel: string;
    arrivalPhase: string;
    score: number;
    grade: string;
    cicuScore?: number;
    attemptsCount?: number;
    passedCriteria?: string[];
    failedCriteria?: string[];
    initialFailedCriteria?: string[];
  }>;
  skillStats?: Array<{
    label: string;
    attempts: number;
    failures: number;
    criticals: number;
    status: string;
    lastIssueDetail?: string;
  }>;
}

const FINAL_REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: {
      type: Type.STRING,
      description:
        'Valoración global clara (2-3 frases en español) del desempeño tras completar la tanda básica o avanzada, apta tanto para el alumno como para el docente.',
    },
    consolidatedStrengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'De 2 a 4 aciertos o competencias ya consolidadas en la guardia, citando escenarios o criterios concretos superados.',
    },
    repeatedMistakes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Lista de fallos repetidos, reintentos frecuentes o errores de seguridad críticos detectados en la tanda (si no hubo fallos repetidos, 1 punto confirmando ausencia de errores recurrentes).',
    },
    reviewRecommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'De 2 a 4 recomendaciones concretas de repaso o práctica enfocada en el temario TES (distancias, ángulo 30°-45°, salida operativa, Bomberos/Policía, separación 2,5 m, LCANS).',
    },
    studentNote: {
      type: Type.STRING,
      description:
        'Mensaje breve (1-2 frases, tuteo) orientado al alumnado sobre su progresión y siguiente paso recomendado.',
    },
    teacherNote: {
      type: Type.STRING,
      description:
        'Nota técnica breve para el profesorado (1-2 frases en tercera persona) resumiendo madurez competencial, necesidad de refuerzo o estabilidad entre primer intento y reintentos.',
    },
  },
  required: [
    'executiveSummary',
    'consolidatedStrengths',
    'repeatedMistakes',
    'reviewRecommendations',
    'studentNote',
    'teacherNote',
  ],
};

const FINAL_REPORT_SYSTEM_INSTRUCTION = `Eres docente evaluador de Formación Profesional en Técnico en Emergencias Sanitarias (TES), módulo "Evacuación y Traslado de Pacientes".

Al finalizar una tanda completa (Guardia básica de 9 vías o Nivel avanzado de 4 despliegues), redactas un informe pedagógico resumido claro y riguroso útil tanto para el alumnado como para el profesorado.

REGLAS DE REDACCIÓN:
1. Basa cada afirmación exclusivamente en los resultados reales recibidos (puntuaciones por vía, criterios superados/fallados, reintentos, notas LCANS al CICU si existen y perfil acumulado de criterios).
2. Distingue bien entre:
   - Aciertos consolidados (lo que domina de forma consistente).
   - Fallos repetidos o riesgos críticos (incluyendo criterios fallados en un primer intento que luego requirieron reintento).
   - Recomendaciones concretas de repaso accionables (qué vía, qué cifra o qué procedimiento repasar).
3. Sé claro, conciso, sin paja ni adjetivos vacíos, en español profesional de FP sanitaria.`;

async function generateFinalReportFast(ai: GoogleGenAI, contents: string) {
  try {
    return await withTimeout(
      ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: FINAL_REPORT_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: FINAL_REPORT_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      5000,
      MODEL_ID
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      msg.includes('TIMEOUT') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('500') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('fetch');
    if (!shouldFallback) {
      throw err;
    }
    console.warn('[Final Report Fallback to gemini-3.1-flash-lite]', msg);
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: FINAL_REPORT_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: FINAL_REPORT_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      10000,
      'gemini-3.1-flash-lite'
    );
  }
}

function buildPlayableScenarioFromAi(
  ai: AiScenarioBlueprint,
  reqParams: ScenarioGeneratorRequest
) {
  let roadType: GeneratorRoadType =
    reqParams.roadType && reqParams.roadType !== 'AUTO' ? reqParams.roadType : ai.roadType;

  let isAdvanced =
    reqParams.arrivalPhase === 'ADVANCED'
      ? true
      : reqParams.arrivalPhase && reqParams.arrivalPhase !== 'AUTO'
        ? false
        : Boolean(ai.isAdvancedDeployment);

  let arrivalPhase: 'FIRST_RESPONDER' | 'STANDARD_SECURED' =
    isAdvanced
      ? 'STANDARD_SECURED'
      : reqParams.arrivalPhase && reqParams.arrivalPhase !== 'AUTO'
        ? (reqParams.arrivalPhase as 'FIRST_RESPONDER' | 'STANDARD_SECURED')
        : ai.arrivalPhase;

  let trafficFlowLabel: 'Sentido único' | 'Doble sentido' =
    reqParams.trafficFlowLabel && reqParams.trafficFlowLabel !== 'AUTO'
      ? reqParams.trafficFlowLabel
      : ai.trafficFlowLabel;

  const isNight =
    reqParams.lighting === 'NIGHT'
      ? true
      : reqParams.lighting === 'DAY'
        ? false
        : Boolean(ai.isNight);

  const hasTwoAmbulances =
    reqParams.ambulanceCount === '2'
      ? true
      : reqParams.ambulanceCount === '1'
        ? false
        : Boolean(ai.hasTwoAmbulances);

  let additionalHazard = ai.additionalHazard || 'NONE';
  let hasAdverseWeather = Boolean(ai.hasAdverseWeather || roadType === 'ADVERSE_WEATHER' || additionalHazard === 'ADVERSE_WEATHER');

  // Harmonize extreme hazard / road geometry constraints
  if (isAdvanced) {
    if (roadType === 'FIRE_HAZARD' || roadType === 'ADR_HAZMAT' || roadType === 'BLIND_CURVE' || roadType === 'TUNNEL_PORTAL') {
      roadType = hasAdverseWeather ? 'ADVERSE_WEATHER' : trafficFlowLabel === 'Doble sentido' ? 'CONVENTIONAL' : 'HIGHWAY';
    }
    if (additionalHazard === 'FIRE' || additionalHazard === 'HAZMAT' || additionalHazard === 'LIMITED_VISIBILITY') {
      additionalHazard = hasAdverseWeather ? 'ADVERSE_WEATHER' : 'NONE';
    }
  } else {
    if (roadType === 'FIRE_HAZARD' || (additionalHazard === 'FIRE' && roadType !== 'ADR_HAZMAT')) {
      roadType = 'FIRE_HAZARD';
      additionalHazard = 'FIRE';
      arrivalPhase = 'FIRST_RESPONDER';
    } else if (roadType === 'ADR_HAZMAT' || additionalHazard === 'HAZMAT') {
      roadType = 'ADR_HAZMAT';
      additionalHazard = 'HAZMAT';
      arrivalPhase = 'FIRST_RESPONDER';
    } else if (roadType === 'BLIND_CURVE') {
      additionalHazard = 'LIMITED_VISIBILITY';
      trafficFlowLabel = 'Doble sentido';
      arrivalPhase = 'FIRST_RESPONDER';
    } else if (roadType === 'TUNNEL_PORTAL') {
      additionalHazard = 'LIMITED_VISIBILITY';
      arrivalPhase = 'FIRST_RESPONDER';
    } else if (roadType === 'ADVERSE_WEATHER' || hasAdverseWeather) {
      if (roadType !== 'URBAN') roadType = 'ADVERSE_WEATHER';
      if (additionalHazard === 'NONE') additionalHazard = 'ADVERSE_WEATHER';
      hasAdverseWeather = true;
    }
  }

  const isTwoWay = trafficFlowLabel === 'Doble sentido';
  const laneY = isTwoWay ? 455 : 445;
  const speedLimitKmh =
    Number.isFinite(ai.speedLimitKmh) && ai.speedLimitKmh >= 30 && ai.speedLimitKmh <= 130
      ? Math.round(ai.speedLimitKmh)
      : roadType === 'URBAN'
        ? 50
        : roadType === 'HIGHWAY' || roadType === 'ADR_HAZMAT'
          ? 120
          : 90;

  const leftOrOppositeForbidden = isTwoWay
    ? {
        xMin: 110,
        xMax: 1290,
        yMin: 280,
        yMax: 392,
        penaltyReason:
          'No invadas el carril contrario de doble sentido; hay riesgo directo de colisión frontal.',
      }
    : {
        xMin: 110,
        xMax: 1290,
        yMin: 310,
        yMax: 382,
        penaltyReason:
          'Deja el carril izquierdo despejado para la circulación o acceso prioritario de otros servicios.',
      };

  const baseId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const bullets =
    Array.isArray(ai.protocolBullets) && ai.protocolBullets.length > 0
      ? ai.protocolBullets.slice(0, 4)
      : [ai.keyObjective];

  const baseMeta = {
    id: baseId,
    order: 1,
    level: isAdvanced ? ('ADVANCED' as const) : ('BASIC' as const),
    isAdvancedDeployment: isAdvanced || undefined,
    isCustom: true,
    title: ai.title.slice(0, 64),
    roadLabel: ai.roadLabel.slice(0, 48),
    roadType,
    trafficFlowLabel,
    arrivalPhase,
    speedLimitKmh,
    isNight,
    hasAdverseWeather,
    additionalHazard,
    briefing: ai.briefing,
    keyObjective: ai.keyObjective,
    protocolSummary: ai.protocolSummary,
    protocolBullets: bullets,
  };

  // 1. Advanced full deployment (Police + Fire + 1 or 2 Ambulances)
  if (isAdvanced) {
    const isUrban = roadType === 'URBAN';
    const crashPos = isUrban ? { x: 720, y: 455 } : { x: isTwoWay ? 690 : 640, y: laneY };
    const secondaryCrashPos = ai.hasMultiVehicleCrash
      ? { x: crashPos.x + 68, y: laneY + 8 }
      : undefined;
    const crosswalkX: [number, number] | undefined = isUrban ? [330, 385] : undefined;
    const sideStreetX: [number, number] | undefined = isUrban ? [1015, 1135] : undefined;

    const initialPolice = isTwoWay
      ? [
          { x: 150, y: laneY, angleDeg: 0 },
          { x: 1220, y: 345, angleDeg: 180 },
        ]
      : [{ x: 150, y: laneY, angleDeg: 0 }];

    const idealPoliceZones = isTwoWay
      ? [
          { xMin: 150, xMax: isUrban ? 295 : 350, yMin: 415, yMax: 505, label: 'Policía (antes)' },
          { xMin: isUrban ? 1080 : 890, xMax: 1245, yMin: 310, yMax: 392, label: 'Policía (después, otro sentido)' },
        ]
      : [{ xMin: 180, xMax: 380, yMin: 410, yMax: 495, label: 'Policía (antes)' }];

    const fireXMin = crashPos.x - 115;
    const fireXMax = crashPos.x - 50;

    const forbiddenZones = [leftOrOppositeForbidden];
    if (isUrban && crosswalkX && sideStreetX) {
      forbiddenZones.unshift(
        {
          xMin: 310,
          xMax: 410,
          yMin: 280,
          yMax: 525,
          penaltyReason: 'No estaciones sobre el paso de peatones.',
        },
        {
          xMin: 985,
          xMax: 1165,
          yMin: 395,
          yMax: 580,
          penaltyReason: 'No bloquees la bocacalle lateral; otros vehículos necesitan acceso.',
        }
      );
    }

    return {
      ...baseMeta,
      unitsPerMeter: 10,
      crashPos,
      secondaryCrashPos,
      policePositions: [],
      cones: [],
      crosswalkX,
      sideStreetX,
      initialPolice,
      initialFireTruck: { x: 255, y: laneY, angleDeg: 0 },
      initialAmbulance: {
        x: 365,
        y: 350,
        angleDeg: 0,
        lightsAllOn: true,
        hazardMarked: true,
        ccuNotified: true,
      },
      ...(hasTwoAmbulances
        ? {
            initialSecondAmbulance: { x: 475, y: 350, angleDeg: 0 },
            idealZone: {
              xMin: crashPos.x + 100,
              xMax: crashPos.x + 170,
              yMin: 420,
              yMax: 495,
              label: 'Ambulancia 1 (10–15 m delante)',
            },
            idealSecondAmbulanceZone: {
              xMin: crashPos.x + 255,
              xMax: crashPos.x + 335,
              yMin: 420,
              yMax: 495,
              label: 'Ambulancia 2 (≥ 2,5 m sep.)',
            },
            acceptableZone: { xMin: crashPos.x + 80, xMax: crashPos.x + 200, yMin: 405, yMax: 510 },
            minOtherAmbulanceSepMeters: 2.5,
            idealDistanceMeters: [10, 17] as [number, number],
          }
        : {
            idealZone: {
              xMin: fireXMin - 120,
              xMax: fireXMin - 60,
              yMin: 420,
              yMax: 495,
              label: 'Ambulancia (10–15 m de Bomberos)',
            },
            acceptableZone: {
              xMin: fireXMin - 145,
              xMax: fireXMin - 45,
              yMin: 405,
              yMax: 510,
            },
            idealDistanceMeters: [10, 16] as [number, number],
          }),
      idealPoliceZones,
      idealFireZone: {
        xMin: fireXMin,
        xMax: fireXMax,
        yMin: 415,
        yMax: 495,
        label: 'Bomberos (5–10 m detrás · 30°)',
      },
      forbiddenZones,
      idealAngleRange: [-10, 10] as [number, number],
      expectsWedge: false,
    };
  }

  // 2. Fire / Fuel leak (>= 75m)
  if (roadType === 'FIRE_HAZARD') {
    const crashPos = { x: 1160, y: laneY };
    return {
      ...baseMeta,
      unitsPerMeter: 5,
      crashPos,
      secondaryCrashPos: ai.hasMultiVehicleCrash ? { x: 1235, y: laneY + 8 } : undefined,
      policePositions: [],
      cones: [],
      initialAmbulance: {
        x: 920,
        y: laneY,
        angleDeg: 0,
        lightsAllOn: true,
        hazardMarked: false,
        ccuNotified: false,
      },
      ...(hasTwoAmbulances
        ? {
            initialSecondAmbulance: { x: 825, y: laneY, angleDeg: 0 },
            idealSecondAmbulanceZone: {
              xMin: 240,
              xMax: 430,
              yMin: 415,
              yMax: 495,
              label: 'Ambulancia 2 (≥ 75 m y ≥ 2,5 m sep.)',
            },
            minOtherAmbulanceSepMeters: 2.5,
          }
        : {}),
      idealZone: {
        xMin: 460,
        xMax: 780,
        yMin: 415,
        yMax: 495,
        label: 'Perímetro seguro (≥ 75 m antes del riesgo)',
      },
      acceptableZone: { xMin: 220, xMax: 785, yMin: 400, yMax: 510 },
      forbiddenZones: [
        {
          xMin: 790,
          xMax: 1320,
          yMin: 300,
          yMax: 530,
          penaltyReason:
            '¡Riesgo crítico de incendio/explosión por combustible o llamas! Debes mantener al menos 75 metros de distancia.',
        },
        leftOrOppositeForbidden,
      ],
      idealAngleRange: [-45, -30] as [number, number],
      expectsWedge: true,
      idealDistanceMeters: [75, 145] as [number, number],
      minHardDistanceMeters: 75,
    };
  }

  // 3. ADR Hazmat (> 500m)
  if (roadType === 'ADR_HAZMAT') {
    const crashPos = { x: 1220, y: laneY };
    return {
      ...baseMeta,
      unitsPerMeter: 1.5,
      crashPos,
      secondaryCrashPos: ai.hasMultiVehicleCrash ? { x: 1280, y: laneY + 10 } : undefined,
      policePositions: [],
      cones: [],
      initialAmbulance: {
        x: 920,
        y: laneY,
        angleDeg: 0,
        lightsAllOn: true,
        hazardMarked: false,
        ccuNotified: false,
      },
      ...(hasTwoAmbulances
        ? {
            initialSecondAmbulance: { x: 830, y: laneY, angleDeg: 0 },
            idealSecondAmbulanceZone: {
              xMin: 110,
              xMax: 270,
              yMin: 415,
              yMax: 495,
              label: 'Ambulancia 2 (> 500 m y ≥ 2,5 m sep.)',
            },
            minOtherAmbulanceSepMeters: 2.5,
          }
        : {}),
      idealZone: {
        xMin: 160,
        xMax: 465,
        yMin: 415,
        yMax: 495,
        label: 'Zona segura (> 500 m antes del ADR)',
      },
      acceptableZone: { xMin: 100, xMax: 468, yMin: 400, yMax: 510 },
      forbiddenZones: [
        {
          xMin: 472,
          xMax: 1320,
          yMin: 300,
          yMax: 530,
          penaltyReason:
            '¡Peligro químico/ADR! Con mercancías peligrosas implicadas debes alejarte a MÁS DE 500 metros.',
        },
        leftOrOppositeForbidden,
      ],
      idealAngleRange: [-45, -30] as [number, number],
      expectsWedge: true,
      idealDistanceMeters: [501, 740] as [number, number],
      minHardDistanceMeters: 500,
    };
  }

  // 4. Blind curve
  if (roadType === 'BLIND_CURVE') {
    return {
      ...baseMeta,
      unitsPerMeter: 10,
      crashPos: { x: 960, y: 365 },
      secondaryCrashPos: ai.hasMultiVehicleCrash ? { x: 1015, y: 330 } : undefined,
      policePositions: [],
      cones: [],
      sightlineCutoffX: 550,
      initialAmbulance: {
        x: 200,
        y: 455,
        angleDeg: 0,
        lightsAllOn: true,
        hazardMarked: false,
        ccuNotified: false,
      },
      ...(hasTwoAmbulances
        ? {
            initialSecondAmbulance: { x: 115, y: 455, angleDeg: 0 },
            idealSecondAmbulanceZone: {
              xMin: 210,
              xMax: 350,
              yMin: 425,
              yMax: 500,
              label: 'Ambulancia 2 (antes curva, ≥ 2,5 m)',
            },
            minOtherAmbulanceSepMeters: 2.5,
          }
        : {}),
      idealZone: {
        xMin: 330,
        xMax: 525,
        yMin: 425,
        yMax: 500,
        label: 'Antes del punto conflictivo (visible)',
      },
      acceptableZone: { xMin: 250, xMax: 555, yMin: 415, yMax: 515 },
      forbiddenZones: [
        {
          xMin: 580,
          xMax: 915,
          yMin: 240,
          yMax: 505,
          penaltyReason:
            '¡Punto conflictivo! Estacionar dentro de la curva ciega impide que los vehículos entrantes te vean a tiempo.',
        },
        {
          xMin: 920,
          xMax: 1260,
          yMin: 180,
          yMax: 430,
          penaltyReason:
            'Al llegar primero debes situarte antes del punto conflictivo para proteger la entrada a la curva.',
        },
      ],
      idealAngleRange: [-45, -30] as [number, number],
      expectsWedge: true,
      idealDistanceMeters: [42, 68] as [number, number],
    };
  }

  // 5. Tunnel portal
  if (roadType === 'TUNNEL_PORTAL') {
    return {
      ...baseMeta,
      unitsPerMeter: 10,
      crashPos: { x: 890, y: 445 },
      secondaryCrashPos: ai.hasMultiVehicleCrash ? { x: 960, y: 452 } : undefined,
      policePositions: [],
      cones: [],
      tunnelPortalX: 740,
      sightlineCutoffX: 730,
      initialAmbulance: {
        x: 200,
        y: 445,
        angleDeg: 0,
        lightsAllOn: true,
        hazardMarked: false,
        ccuNotified: false,
      },
      ...(hasTwoAmbulances
        ? {
            initialSecondAmbulance: { x: 115, y: 445, angleDeg: 0 },
            idealSecondAmbulanceZone: {
              xMin: 380,
              xMax: 510,
              yMin: 418,
              yMax: 495,
              label: 'Ambulancia 2 (antes túnel, ≥ 2,5 m)',
            },
            minOtherAmbulanceSepMeters: 2.5,
          }
        : {}),
      idealZone: {
        xMin: 530,
        xMax: 695,
        yMin: 418,
        yMax: 495,
        label: 'Antes del punto conflictivo (boca del túnel)',
      },
      acceptableZone: { xMin: 460, xMax: 725, yMin: 405, yMax: 510 },
      forbiddenZones: [
        {
          xMin: 745,
          xMax: 1260,
          yMin: 300,
          yMax: 530,
          penaltyReason:
            'Ante visibilidad limitada como túneles, debes estacionar ANTES del punto conflictivo; entrar dentro complica el acceso de Bomberos.',
        },
        leftOrOppositeForbidden,
      ],
      idealAngleRange: [-45, -30] as [number, number],
      expectsWedge: true,
      idealDistanceMeters: [20, 38] as [number, number],
    };
  }

  // 6. Standard Straight Roads (FIRST_RESPONDER vs STANDARD_SECURED)
  const isUrban = roadType === 'URBAN';
  const crosswalkX: [number, number] | undefined = isUrban ? [420, 475] : undefined;
  const sideStreetX: [number, number] | undefined = isUrban ? [985, 1110] : undefined;

  if (arrivalPhase === 'FIRST_RESPONDER') {
    const isAdverse = hasAdverseWeather;
    const crashPos = { x: isAdverse ? 960 : 920, y: laneY };
    const idealZone = isAdverse
      ? {
          xMin: 460,
          xMax: 625,
          yMin: 425,
          yMax: 500,
          label: 'Distancia ampliada (35–50 m antes)',
        }
      : {
          xMin: 615,
          xMax: 730,
          yMin: 415,
          yMax: 495,
          label: 'Barrera previa (~25 m antes)',
        };

    const forbiddenZones = [
      leftOrOppositeForbidden,
      ...(isAdverse
        ? [
            {
              xMin: 735,
              xMax: 910,
              yMin: 395,
              yMax: 525,
              penaltyReason:
                'Con meteorología adversa la distancia de frenado aumenta mucho: debes ampliar la distancia por encima de 35 m.',
            },
            {
              xMin: 915,
              xMax: 1290,
              yMin: 395,
              yMax: 525,
              penaltyReason:
                'Como primeros intervinientes debéis estacionar ANTES del accidente para proteger el escenario.',
            },
          ]
        : [
            {
              xMin: 830,
              xMax: 1290,
              yMin: 310,
              yMax: 525,
              penaltyReason:
                'Como primer interviniente debes detenerte ANTES del accidente para usar la ambulancia como barrera de protección.',
            },
          ]),
    ];

    if (isUrban && crosswalkX && sideStreetX) {
      forbiddenZones.push({
        xMin: 955,
        xMax: 1135,
        yMin: 395,
        yMax: 580,
        penaltyReason: 'No bloquees la bocacalle lateral.',
      });
    }

    return {
      ...baseMeta,
      unitsPerMeter: 10,
      crashPos,
      secondaryCrashPos: ai.hasMultiVehicleCrash ? { x: crashPos.x + 68, y: laneY + 8 } : undefined,
      policePositions: [],
      cones: [],
      crosswalkX,
      sideStreetX,
      initialAmbulance: {
        x: 240,
        y: laneY,
        angleDeg: 0,
        lightsAllOn: !isAdverse,
        hazardMarked: false,
        ccuNotified: false,
      },
      ...(hasTwoAmbulances
        ? {
            initialSecondAmbulance: { x: 145, y: laneY, angleDeg: 0 },
            idealSecondAmbulanceZone: {
              xMin: idealZone.xMin - 135,
              xMax: idealZone.xMin - 25,
              yMin: 420,
              yMax: 500,
              label: 'Ambulancia 2 (antes, ≥ 2,5 m sep.)',
            },
            minOtherAmbulanceSepMeters: 2.5,
          }
        : {}),
      idealZone,
      acceptableZone: isAdverse
        ? { xMin: 390, xMax: 680, yMin: 410, yMax: 515 }
        : { xMin: 540, xMax: 775, yMin: 400, yMax: 510 },
      forbiddenZones,
      idealAngleRange: [-45, -30] as [number, number],
      expectsWedge: true,
      idealDistanceMeters: (isAdverse ? [34, 52] : [20, 32]) as [number, number],
    };
  }

  // STANDARD_SECURED (Police + Fire already on scene)
  const crashPos = { x: 640, y: laneY };
  const policePositions = isTwoWay
    ? [
        { x: 260, y: laneY, angleDeg: -24 },
        { x: 1140, y: 345, angleDeg: 158 },
      ]
    : [{ x: 300, y: laneY, angleDeg: -32 }];
  const fireTruckPos = { x: 555, y: laneY, angleDeg: -30 };
  const cones = [
    { x: 325, y: 408 },
    { x: 405, y: 406 },
    { x: 495, y: 408 },
  ];

  const forbiddenZones = [
    leftOrOppositeForbidden,
    {
      xMin: 110,
      xMax: 605,
      yMin: 395,
      yMax: 525,
      penaltyReason:
        'Detrás del accidente ya trabajan Bomberos (5–10 m detrás a 30°) y Policía. Estaciona 10–15 m por delante.',
    },
  ];

  if (isUrban && crosswalkX && sideStreetX) {
    forbiddenZones.unshift(
      {
        xMin: 395,
        xMax: 500,
        yMin: 280,
        yMax: 525,
        penaltyReason: 'No estaciones sobre el paso de peatones ni interfieras con la zona previa.',
      },
      {
        xMin: 955,
        xMax: 1135,
        yMin: 395,
        yMax: 580,
        penaltyReason: 'No bloquees bocacalles ni accesos de maniobra de otros servicios.',
      }
    );
  }

  return {
    ...baseMeta,
    unitsPerMeter: 10,
    crashPos,
    secondaryCrashPos: ai.hasMultiVehicleCrash ? { x: crashPos.x + 65, y: laneY + 8 } : undefined,
    policePositions,
    fireTruckPos,
    cones,
    crosswalkX,
    sideStreetX,
    initialAmbulance: {
      x: 175,
      y: 350,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: true,
      ccuNotified: true,
    },
    ...(hasTwoAmbulances
      ? {
          initialSecondAmbulance: { x: 295, y: 350, angleDeg: 0 },
          idealZone: {
            xMin: 740,
            xMax: 810,
            yMin: 420,
            yMax: 495,
            label: 'Ambulancia 1 (10–15 m delante)',
          },
          idealSecondAmbulanceZone: {
            xMin: 895,
            xMax: 975,
            yMin: 420,
            yMax: 495,
            label: 'Ambulancia 2 (≥ 2,5 m sep.)',
          },
          minOtherAmbulanceSepMeters: 2.5,
          idealDistanceMeters: [10, 17] as [number, number],
        }
      : {
          idealZone: {
            xMin: 740,
            xMax: 825,
            yMin: 425,
            yMax: 500,
            label: '10–15 m delante del siniestro',
          },
          idealDistanceMeters: [10, 18] as [number, number],
        }),
    acceptableZone: { xMin: 715, xMax: isUrban ? 935 : 865, yMin: 410, yMax: 515 },
    forbiddenZones,
    idealAngleRange: [-10, 10] as [number, number],
    expectsWedge: false,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/cicu/transcribe', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para transcribir la llamada de voz.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as { audioBase64?: string; mimeType?: string } | undefined;
    if (!body?.audioBase64 || typeof body.audioBase64 !== 'string') {
      res.status(400).json({ error: 'No se recibió ningún audio grabado.' });
      return;
    }

    const cleanMime = (body.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const contents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: body.audioBase64,
            },
          },
          {
            text: 'Transcribe exactamente en español este mensaje hablado por emisora de emergencias sanitarias (TES / CICU). Devuelve únicamente el texto transcrito, sin comillas ni comentarios adicionales.',
          },
        ],
      },
    ];

    try {
      let response;
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents,
          }),
          5000,
          'gemini-3.5-transcribe'
        );
      } catch (primaryErr) {
        const primaryMsg =
          primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        console.warn('[CICU Transcribe Primary Error]', primaryMsg);
        const shouldFallback =
          primaryMsg.includes('TIMEOUT') ||
          primaryMsg.includes('503') ||
          primaryMsg.includes('UNAVAILABLE') ||
          primaryMsg.includes('429') ||
          primaryMsg.includes('RESOURCE_EXHAUSTED') ||
          primaryMsg.includes('404') ||
          primaryMsg.includes('NOT_FOUND') ||
          primaryMsg.includes('400') ||
          primaryMsg.includes('INVALID_ARGUMENT') ||
          primaryMsg.includes('not supported');

        if (!shouldFallback) {
          throw primaryErr;
        }

        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            },
          }),
          11000,
          'gemini-3.1-flash-lite'
        );
      }

      const transcript = (response.text ?? '').trim();
      if (!transcript) {
        res.status(422).json({
          error: 'No se detectó voz clara en la grabación. Acércate al micrófono e inténtalo de nuevo.',
        });
        return;
      }

      res.json({ transcript });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CICU Transcribe Error]', msg);
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        res.status(503).json({
          error:
            'Tu micrófono ha grabado bien, pero el servicio de transcripción tiene alta demanda temporal (503). Reinténtalo en unos segundos o escribe el parte.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Permiso denegado al transcribir el audio. Verifica GEMINI_API_KEY en Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Límite temporal alcanzado al transcribir. Espera unos segundos y reintenta.',
        });
        return;
      }
      if (msg.includes('400') || msg.includes('API_KEY_INVALID')) {
        res.status(400).json({
          error: 'Solicitud de transcripción inválida o clave API no válida.',
        });
        return;
      }
      res.status(500).json({
        error: 'No se pudo transcribir el audio grabado en el servidor. Reinténtalo o escribe el mensaje.',
      });
    }
  });

  app.post('/api/cicu/evaluate', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para conectar con el operador del CICU.',
        code: 'MISSING_API_KEY',
      });
      return;
    }

    const body = req.body as CicuEvaluateRequest | undefined;
    if (!body?.scenario || !body?.message || typeof body.message !== 'string') {
      res.status(400).json({
        error: 'Solicitud incompleta: indica el escenario y el mensaje de radio.',
      });
      return;
    }

    const trimmedMsg = body.message.trim();
    if (trimmedMsg.length < 5) {
      res.status(400).json({
        error: 'Transmisión demasiado breve. Redacta la valoración inicial para el CICU.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const historyText =
      body.history && body.history.length > 0
        ? body.history
            .map((m) => `${m.sender === 'CICU' ? 'CICU' : 'UNIDAD TES'}: ${m.text}`)
            .join('\n')
        : 'Sin transmisiones previas.';

    const sc = body.scenario;
    const prompt = `CONTEXTO DEL ESCENARIO ACTIVO:
- Título: ${sc.title}
- Vía: ${sc.roadLabel} (${sc.trafficFlowLabel}, límite ${sc.speedLimitKmh} km/h, ${sc.isNight ? 'Nocturno' : 'Diurno'})
- Fase de llegada: ${
      sc.isAdvancedDeployment
        ? 'Despliegue completo (Policía, Bomberos y Ambulancia en coordinación)'
        : sc.arrivalPhase === 'FIRST_RESPONDER'
          ? 'Primer interviniente (sin Policía ni Bomberos todavía en el punto)'
          : 'Estacionamiento estándar (Policía y Bomberos presentes/desplegados)'
    }
- Riesgo adicional: ${sc.additionalHazard || 'NONE'}
- Dos ambulancias implicadas: ${sc.hasSecondAmbulance ? 'Sí' : 'No'}
- Enunciado del caso: ${sc.briefing}
- Criterio clave de seguridad de este escenario: ${sc.keyObjective}
- Estado actual de vehículos en el mapa: ${body.placementSummary || 'No especificado'}

HISTORIAL DE RADIO PREVIO:
${historyText}

NUEVA TRANSMISIÓN DE LA UNIDAD TES AL CICU:
"${trimmedMsg}"

Evalúa la transmisión acumulada aplicando el método LCANS, brevedad/precisión y coordinación in situ entre mandos, y genera la respuesta JSON estructurada.`;

    try {
      const response = await generateEvaluationFast(ai, prompt);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'El servicio de IA no devolvió respuesta. Inténtalo de nuevo.',
        });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CICU Evaluate Error]', msg);

      if (msg.includes('TIMEOUT')) {
        res.status(504).json({
          error:
            'El operador del CICU está saturado y tardó demasiado en responder. Pulsa Transmitir al CICU de nuevo.',
          code: 'TIMEOUT',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error:
            'Permiso denegado al consultar Gemini. Revisa tu clave API en Settings > Secrets.',
          code: 'PERMISSION_DENIED',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Se ha alcanzado el límite temporal de solicitudes (429). Espera unos segundos y reintenta.',
          code: 'RESOURCE_EXHAUSTED',
        });
        return;
      }
      if (msg.includes('400') || msg.includes('API_KEY_INVALID')) {
        res.status(400).json({
          error:
            'La clave API configurada no es válida. Verifica GEMINI_API_KEY en Settings > Secrets.',
          code: 'API_KEY_INVALID',
        });
        return;
      }
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        res.status(503).json({
          error:
            'El servicio del operador CICU tiene alta demanda temporal (503). Pulsa de nuevo en unos segundos.',
          code: 'UNAVAILABLE',
        });
        return;
      }
      res.status(500).json({
        error: 'Error al procesar la simulación de llamada al CICU. Reinténtalo en unos segundos.',
      });
    }
  });

  app.post('/api/tutor/analyze', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para activar el tutor socrático.',
      });
      return;
    }

    const body = req.body as {
      scenario?: {
        title?: string;
        roadLabel?: string;
        trafficFlowLabel?: string;
        arrivalPhase?: string;
        isAdvancedDeployment?: boolean;
        speedLimitKmh?: number;
        isNight?: boolean;
        additionalHazard?: string;
        briefing?: string;
        idealDistanceMeters?: [number, number];
        idealAngleRange?: [number, number];
        minHardDistanceMeters?: number;
        minOtherAmbulanceSepMeters?: number;
      };
      telemetry?: {
        distanceMeters: number;
        distanceReferenceLabel: string;
        isBeforeCrash: boolean;
        angleDeg: number;
        lightsAllOn: boolean;
        hazardMarked: boolean;
        ccuNotified: boolean;
        secondAmbulanceGapMeters?: number | null;
        secondAmbulanceDistanceMeters?: number | null;
        secondAmbulanceAngleDeg?: number | null;
        fireTruckDistanceMeters?: number | null;
        fireTruckAngleDeg?: number | null;
        policeSummary?: string | null;
      };
      evaluation?: {
        totalScore: number;
        grade: string;
        headline: string;
        hasSightlineHazard: boolean;
        hasSpacingHazard: boolean;
        hasBlockedAccessHazard: boolean;
        criteria: Array<{
          label: string;
          score: number;
          maxScore: number;
          status: string;
          feedback: string;
        }>;
      };
    };

    if (!body?.scenario || !body?.telemetry || !body?.evaluation) {
      res.status(400).json({ error: 'Faltan datos del intento para analizar.' });
      return;
    }

    const sc = body.scenario;
    const t = body.telemetry;
    const ev = body.evaluation;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `ESCENARIO:
- Título: ${sc.title} (${sc.roadLabel}, ${sc.trafficFlowLabel}, límite ${sc.speedLimitKmh} km/h, ${sc.isNight ? 'nocturno' : 'diurno'})
- Tipo de intervención: ${
      sc.isAdvancedDeployment
        ? 'Nivel avanzado (despliegue Policía + Bomberos + Ambulancia)'
        : sc.arrivalPhase === 'FIRST_RESPONDER'
          ? 'Primer interviniente (sin policía)'
          : 'Estacionamiento estándar (con policía y bomberos)'
    }
- Riesgo adicional: ${sc.additionalHazard || 'NONE'}
- Situación: ${sc.briefing}
- Referencia normativa del escenario: distancia recomendada ${sc.idealDistanceMeters?.join('–') ?? '?'} m, ángulo recomendado ${sc.idealAngleRange?.join('° a ') ?? '?'}°${
      sc.minHardDistanceMeters ? `, distancia mínima obligatoria ${sc.minHardDistanceMeters} m` : ''
    }${sc.minOtherAmbulanceSepMeters ? `, separación mínima entre ambulancias ${sc.minOtherAmbulanceSepMeters} m` : ''}

DATOS REALES DEL INTENTO DEL ALUMNO:
- Distancia medida: ${t.distanceMeters} m respecto a "${t.distanceReferenceLabel}" (situación respecto al siniestro: ${t.isBeforeCrash ? 'ANTES / detrás del accidente' : 'DESPUÉS / delante del accidente'})
- Ángulo de estacionamiento: ${t.angleDeg}° (0° = paralelo al carril; negativo -30° a -45° = frontal inclinado hacia la mediana/centro)
- Luces de emergencia V-1 activadas: ${t.lightsAllOn ? 'Sí' : 'No'}
- Peligro señalizado visiblemente: ${t.hazardMarked ? 'Sí' : 'No'}
- Aviso al CICU/CCU realizado: ${t.ccuNotified ? 'Sí' : 'No'}
${t.secondAmbulanceGapMeters !== undefined && t.secondAmbulanceGapMeters !== null ? `- Separación libre entre ambas ambulancias: ${t.secondAmbulanceGapMeters} m` : ''}
${t.secondAmbulanceDistanceMeters !== undefined && t.secondAmbulanceDistanceMeters !== null ? `- Segunda ambulancia: a ${t.secondAmbulanceDistanceMeters} m con ángulo ${t.secondAmbulanceAngleDeg ?? 0}°` : ''}
${t.fireTruckDistanceMeters !== undefined && t.fireTruckDistanceMeters !== null ? `- Camión de Bomberos colocado por el alumno: a ${t.fireTruckDistanceMeters} m del accidente, ángulo ${t.fireTruckAngleDeg ?? 0}°` : ''}
${t.policeSummary ? `- Patrullas de Policía colocadas por el alumno: ${t.policeSummary}` : ''}

RÚBRICA OBJETIVA OBTENIDA:
- Nota: ${ev.totalScore}/100 (${ev.grade} · ${ev.headline})
- Riesgos detectados: visibilidad limitada=${ev.hasSightlineHazard}, separación insuficiente=${ev.hasSpacingHazard}, bloqueo/invasión carril=${ev.hasBlockedAccessHazard}
- Desglose:
${ev.criteria.map((c) => `  * ${c.label}: ${c.score}/${c.maxScore} (${c.status}) -> ${c.feedback}`).join('\n')}

Genera el análisis socrático personalizado en JSON.`;

    try {
      const response = await generateTutorJsonFast(ai, prompt, TUTOR_ANALYZE_SCHEMA);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'El tutor no devolvió respuesta.' });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Tutor Analyze Error]', msg);
      if (msg.includes('TIMEOUT')) {
        res.status(504).json({ error: 'El tutor tardó demasiado en responder.' });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Permiso denegado. Revisa GEMINI_API_KEY en Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Límite temporal alcanzado al consultar al tutor.',
        });
        return;
      }
      res.status(500).json({
        error: 'No se pudo generar el análisis socrático en este intento.',
      });
    }
  });

  app.post('/api/tutor/reply', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en Settings > Secrets.',
      });
      return;
    }

    const body = req.body as {
      scenarioTitle?: string;
      socraticQuestion?: string;
      riskAnalysis?: string;
      studentAnswer?: string;
    };

    if (!body?.studentAnswer?.trim() || !body?.socraticQuestion) {
      res.status(400).json({ error: 'Escribe una breve respuesta antes de enviar.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `Escenario: ${body.scenarioTitle || 'TES'}
Análisis previo del tutor: ${body.riskAnalysis || ''}
Pregunta planteada al alumno: "${body.socraticQuestion}"
Respuesta del alumno: "${body.studentAnswer.trim()}"

Valora brevemente si su respuesta apunta al criterio correcto antes de que reintente estacionar.`;

    try {
      const response = await generateTutorJsonFast(ai, prompt, TUTOR_REPLY_SCHEMA);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'El tutor no devolvió respuesta.' });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Tutor Reply Error]', msg);
      res.status(500).json({
        error: 'No se pudo validar tu reflexión. Puedes reintentar el escenario directamente.',
      });
    }
  });

  app.post('/api/scenarios/generate', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para generar escenarios con IA.',
      });
      return;
    }

    const body = (req.body || {}) as ScenarioGeneratorRequest;
    const freePrompt = (body.prompt || '').trim();
    const hasCustomParams =
      (body.roadType && body.roadType !== 'AUTO') ||
      (body.trafficFlowLabel && body.trafficFlowLabel !== 'AUTO') ||
      (body.arrivalPhase && body.arrivalPhase !== 'AUTO') ||
      (body.lighting && body.lighting !== 'AUTO') ||
      (body.ambulanceCount && body.ambulanceCount !== 'AUTO');

    if (freePrompt.length < 6 && !hasCustomParams) {
      res.status(400).json({
        error:
          'Describe brevemente la situación o selecciona algún parámetro para generar el escenario.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `SOLICITUD DEL DOCENTE:
- Descripción libre de la situación: "${freePrompt || 'Genera un caso clínico-vial realista según los parámetros indicados'}"
- Parámetros fijados por el docente (si es "AUTO", dedúcelo del texto o elige la opción más didáctica):
  * Tipo de vía: ${body.roadType || 'AUTO'}
  * Sentido de circulación: ${body.trafficFlowLabel || 'AUTO'}
  * Fase / nivel: ${body.arrivalPhase || 'AUTO'}
  * Iluminación: ${body.lighting || 'AUTO'}
  * Número de ambulancias: ${body.ambulanceCount || 'AUTO'}

Genera la ficha pedagógica y clasificación técnica exacta en JSON.`;

    try {
      const response = await generateScenarioJsonFast(ai, prompt);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'La IA no devolvió datos del escenario. Inténtalo de nuevo.',
        });
        return;
      }

      const aiData = JSON.parse(rawText) as AiScenarioBlueprint;
      const scenario = buildPlayableScenarioFromAi(aiData, body);
      res.json({ scenario });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Scenario Generator Error]', msg);
      if (msg.includes('TIMEOUT')) {
        res.status(504).json({
          error: 'La generación tardó demasiado. Pulsa "Generar escenario" de nuevo.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Permiso denegado al consultar Gemini. Revisa GEMINI_API_KEY en Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Límite temporal alcanzado al generar escenario. Espera unos segundos.',
        });
        return;
      }
      res.status(500).json({
        error: 'No se pudo generar el escenario. Prueba de nuevo en unos segundos.',
      });
    }
  });

  app.post('/api/scenarios/adaptive', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para generar práctica adaptativa con IA.',
      });
      return;
    }

    const body = (req.body || {}) as AdaptiveScenarioRequest;
    const skillId = body.targetSkillId;
    if (!skillId) {
      res.status(400).json({ error: 'Indica el criterio a reforzar.' });
      return;
    }

    const seed = Number(body.variantSeed || 0);
    let lockedParams: ScenarioGeneratorRequest = {};
    let skillFocusPrompt = '';

    switch (skillId) {
      case 'ADR_FIRE_DISTANCE': {
        const useAdr = seed % 2 === 1;
        lockedParams = {
          roadType: useAdr ? 'ADR_HAZMAT' : 'FIRE_HAZARD',
          arrivalPhase: 'FIRST_RESPONDER',
          ambulanceCount: '1',
          trafficFlowLabel: useAdr ? 'Sentido único' : 'Doble sentido',
        };
        skillFocusPrompt = useAdr
          ? 'Caso de refuerzo sobre DISTANCIA CRÍTICA EN MERCANCÍAS PELIGROSAS (ADR): diseña un accidente inédito con camión/furgón ADR volcado o fuga química donde haya que retirarse a > 500 m antes del siniestro y avisar al CCU.'
          : 'Caso de refuerzo sobre DISTANCIA MÍNIMA DE SEGURIDAD ANTE INCENDIO/COMBUSTIBLE: diseña un accidente inédito con incendio activo o derrame de combustible en vía de doble sentido donde haya que mantener al menos 75 metros antes del foco y avisar al CCU.';
        break;
      }
      case 'DEFENSIVE_ANGLE': {
        const variants: Array<ScenarioGeneratorRequest> = [
          { roadType: 'HIGHWAY', trafficFlowLabel: 'Sentido único', arrivalPhase: 'FIRST_RESPONDER', lighting: 'NIGHT', ambulanceCount: '1' },
          { roadType: 'CONVENTIONAL', trafficFlowLabel: 'Doble sentido', arrivalPhase: 'FIRST_RESPONDER', lighting: 'DAY', ambulanceCount: '1' },
        ];
        lockedParams = variants[seed % variants.length];
        skillFocusPrompt =
          'Caso de refuerzo sobre ÁNGULO DEFENSIVO (30°–45° hacia la mediana/centro): eres primer interviniente sin policía y el tráfico rápido se aproxima por detrás; debes usar la ambulancia como barrera angulada (~25 m antes) para proteger lateral y trasera del equipo.';
        break;
      }
      case 'FIRE_POLICE_SPACING': {
        const useTwoWay = seed % 2 === 0;
        lockedParams = {
          roadType: useTwoWay ? 'CONVENTIONAL' : 'URBAN',
          trafficFlowLabel: useTwoWay ? 'Doble sentido' : 'Sentido único',
          arrivalPhase: 'ADVANCED',
          ambulanceCount: '1',
        };
        skillFocusPrompt =
          'Caso de refuerzo sobre COORDINACIÓN Y NO BLOQUEO A BOMBEROS Y POLICÍA (despliegue completo): el alumno debe desplegar Policía (antes y después en doble sentido; antes en sentido único), Bomberos (5–10 m detrás del siniestro a ~30°) y su Ambulancia a 10–15 m tomando a Bomberos como referencia sin solaparse.';
        break;
      }
      case 'TWO_AMBULANCE_GAP': {
        const useAdvanced = seed % 2 === 1;
        lockedParams = {
          roadType: 'HIGHWAY',
          trafficFlowLabel: 'Sentido único',
          arrivalPhase: useAdvanced ? 'ADVANCED' : 'STANDARD_SECURED',
          ambulanceCount: '2',
        };
        skillFocusPrompt =
          'Caso de refuerzo sobre SEPARACIÓN MÍNIMA ENTRE DOS AMBULANCIAS (≥ 2,5 m): accidente con múltiples heridos donde intervienen 2 ambulancias que deben estacionar en paralelo (0°) con salida operativa y dejando al menos 2,5 metros libres entre ellas.';
        break;
      }
      case 'VISIBILITY_HAZARD': {
        const variants: Array<ScenarioGeneratorRequest> = [
          { roadType: 'BLIND_CURVE', trafficFlowLabel: 'Doble sentido', arrivalPhase: 'FIRST_RESPONDER', ambulanceCount: '1' },
          { roadType: 'TUNNEL_PORTAL', trafficFlowLabel: 'Sentido único', arrivalPhase: 'FIRST_RESPONDER', lighting: 'NIGHT', ambulanceCount: '1' },
          { roadType: 'ADVERSE_WEATHER', trafficFlowLabel: 'Doble sentido', arrivalPhase: 'FIRST_RESPONDER', lighting: 'NIGHT', ambulanceCount: '1' },
        ];
        lockedParams = variants[seed % variants.length];
        skillFocusPrompt =
          'Caso de refuerzo sobre VISIBILIDAD LIMITADA Y METEOROLOGÍA ADVERSA: el alumno llega primero y debe detenerse ANTES del punto conflictivo visible (antes de entrar en curva ciega/boca de túnel o ampliar a 35–50 m con lluvia/niebla).';
        break;
      }
      case 'OPERATIONAL_EXIT': {
        lockedParams = {
          roadType: seed % 2 === 0 ? 'CONVENTIONAL' : 'URBAN',
          trafficFlowLabel: 'Doble sentido',
          arrivalPhase: 'STANDARD_SECURED',
          ambulanceCount: '1',
        };
        skillFocusPrompt =
          'Caso de refuerzo sobre ESTACIONAMIENTO ESTÁNDAR Y SALIDA OPERATIVA (0°) POR DELANTE: Policía y Bomberos ya protegen detrás; el alumno debe rebasar el accidente y estacionar 10–15 m por delante en paralelo (0°) para evacuar rápido.';
        break;
      }
      case 'LANE_DISCIPLINE': {
        lockedParams = {
          roadType: 'URBAN',
          trafficFlowLabel: 'Doble sentido',
          arrivalPhase: 'STANDARD_SECURED',
          ambulanceCount: '1',
        };
        skillFocusPrompt =
          'Caso de refuerzo sobre DISCIPLINA DE CARRIL, PASOS DE PEATONES Y BOCACALLES: vía urbana de doble sentido asegurada donde hay paso de peatones y bocacalle lateral que no deben bloquearse, ni invadir el sentido contrario.';
        break;
      }
      case 'SIGNALING_AND_CCU':
      default: {
        lockedParams = {
          roadType: seed % 2 === 0 ? 'ADVERSE_WEATHER' : 'HIGHWAY',
          trafficFlowLabel: seed % 2 === 0 ? 'Doble sentido' : 'Sentido único',
          arrivalPhase: 'FIRST_RESPONDER',
          lighting: 'NIGHT',
          ambulanceCount: '1',
        };
        skillFocusPrompt =
          'Caso de refuerzo sobre AUTOPROTECCIÓN ACTIVA (LUCES V-1, BALIZAMIENTO Y AVISO AL CICU/CCU): situación nocturna de primer interviniente donde es crítico activar todas las señales luminosas, señalizar visiblemente el riesgo y avisar al CCU.';
        break;
      }
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const recentNotes =
      Array.isArray(body.recentIssues) && body.recentIssues.length > 0
        ? body.recentIssues.slice(0, 4).join(' | ')
        : 'Sin detalles adicionales';

    const prompt = `SOLICITUD DE PRÁCTICA ADAPTATIVA PERSONALIZADA PARA ALUMNO TES:
- Criterio fallado recurrentemente que queremos entrenar: ${skillId}
- Fallos detectados recientemente en este criterio: ${body.failuresCount ?? 1}
- Ejemplos de errores previos del alumno: ${recentNotes}
- Objetivo del nuevo caso inédito: ${skillFocusPrompt}
- Parámetros fijados (RESPETA EXACTAMENTE estos valores):
  * Tipo de vía: ${lockedParams.roadType || 'AUTO'}
  * Sentido de circulación: ${lockedParams.trafficFlowLabel || 'AUTO'}
  * Fase / nivel: ${lockedParams.arrivalPhase || 'AUTO'}
  * Iluminación: ${lockedParams.lighting || 'AUTO'}
  * Número de ambulancias: ${lockedParams.ambulanceCount || 'AUTO'}

Redacta un escenario realista, distinto de los genéricos, en español y enfocado en reforzar ese fallo.`;

    try {
      const response = await generateScenarioJsonFast(ai, prompt);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'La IA no devolvió el caso adaptativo. Inténtalo de nuevo.',
        });
        return;
      }
      const aiData = JSON.parse(rawText) as AiScenarioBlueprint;
      const scenario = {
        ...buildPlayableScenarioFromAi(aiData, lockedParams),
        adaptiveTargetSkill: skillId,
      };
      res.json({ scenario });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Adaptive Scenario Error]', msg);
      res.status(500).json({
        error: 'No se pudo generar el caso de refuerzo adaptativo con IA en este momento.',
      });
    }
  });

  app.post('/api/protocol/ask', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para usar el consultor de protocolo.',
      });
      return;
    }

    const body = (req.body || {}) as ProtocolAskRequest;
    const question = (body.question || '').trim();
    if (question.length < 3) {
      res.status(400).json({
        error: 'Escribe una duda breve sobre el temario de Evacuación y Traslado de Pacientes.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const historyLines =
      Array.isArray(body.history) && body.history.length > 0
        ? body.history
            .slice(-6)
            .map((h) => `${h.role === 'USER' ? 'ALUMNO' : 'CONSULTOR'}: ${h.text}`)
            .join('\n')
        : 'Sin consultas previas.';

    const sc = body.scenarioContext;
    const contextBlock = sc?.title
      ? `CONTEXTO DE PRÁCTICA ACTUAL (no desveles la solución exacta del mapa; explica la norma teórica):
- Escenario: ${sc.title} (${sc.roadLabel || ''})
- Fase: ${
          sc.isAdvancedDeployment
            ? 'Despliegue avanzado (Policía + Bomberos + Ambulancia)'
            : sc.arrivalPhase === 'FIRST_RESPONDER'
              ? 'Primer interviniente'
              : 'Estacionamiento estándar'
        }
- Riesgo adicional: ${sc.additionalHazard || 'NONE'}`
      : 'CONTEXTO: Consulta general desde el menú o manual.';

    const prompt = `${contextBlock}

HISTORIAL RECIENTE:
${historyLines}

DUDA ACTUAL DEL ALUMNO TES:
"${question}"

Responde de forma clara, precisa y estrictamente acotada al módulo Evacuación y Traslado de Pacientes.`;

    try {
      const response = await generateProtocolAnswerFast(ai, prompt);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'El consultor no devolvió respuesta. Inténtalo de nuevo.',
        });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Protocol Ask Error]', msg);
      if (msg.includes('TIMEOUT')) {
        res.status(504).json({
          error: 'El consultor tardó demasiado en responder. Pulsa enviar de nuevo.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Permiso denegado al consultar Gemini. Revisa GEMINI_API_KEY en Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Límite temporal alcanzado. Espera unos segundos y reintenta.',
        });
        return;
      }
      res.status(500).json({
        error: 'No se pudo consultar el protocolo en este momento. Inténtalo de nuevo.',
      });
    }
  });

  app.post('/api/report/summary', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY en Settings > Secrets para generar el informe pedagógico.',
      });
      return;
    }

    const body = (req.body || {}) as FinalReportRequest;
    const history = Array.isArray(body.history) ? body.history : [];
    if (history.length === 0) {
      res.status(400).json({
        error: 'No hay escenarios evaluados para generar el informe final.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const scenarioLines = history
      .map((item, idx) => {
        const parts = [
          `${idx + 1}. ${item.title} (${item.roadLabel}, ${
            item.arrivalPhase === 'FIRST_RESPONDER'
              ? 'Primer interviniente'
              : 'Estacionamiento estándar'
          }): ${item.score}/100 (${item.grade})`,
        ];
        if (item.attemptsCount && item.attemptsCount > 1) {
          parts.push(`intentos=${item.attemptsCount}`);
        }
        if (item.cicuScore !== undefined) {
          parts.push(`CICU_LCANS=${item.cicuScore}/100`);
        }
        if (item.failedCriteria && item.failedCriteria.length > 0) {
          parts.push(`fallos_finales=[${item.failedCriteria.join(', ')}]`);
        }
        if (item.initialFailedCriteria && item.initialFailedCriteria.length > 0) {
          parts.push(`fallos_en_intentos_previos=[${item.initialFailedCriteria.join(', ')}]`);
        }
        if (item.passedCriteria && item.passedCriteria.length > 0) {
          parts.push(`ok=[${item.passedCriteria.join(', ')}]`);
        }
        return parts.join(' | ');
      })
      .join('\n');

    const skillLines =
      Array.isArray(body.skillStats) && body.skillStats.length > 0
        ? body.skillStats
            .filter((s) => s.attempts > 0)
            .map(
              (s) =>
                `- ${s.label}: ${s.attempts} evaluaciones, ${s.failures} fallos (${s.criticals} críticos), estado=${s.status}${
                  s.lastIssueDetail ? `, último detalle="${s.lastIssueDetail}"` : ''
                }`
            )
            .join('\n')
        : 'Sin métricas acumuladas por criterio.';

    const prompt = `RESUMEN DE TANDA COMPLETADA:
- Modalidad: ${body.campaignLevel === 'ADVANCED' ? 'Nivel Avanzado (Despliegue Policía + Bomberos + Ambulancia)' : 'Guardia Básica (9 escenarios)'}
- Media global: ${body.avgScore ?? 0}/100
- Escenarios en nivel SEGURO: ${body.safeCount ?? 0}/${body.totalScenarios ?? history.length}

RESULTADO POR ESCENARIO EN ESTA TANDA:
${scenarioLines}

PERFIL ACUMULADO DE CRITERIOS TES DEL ALUMNO:
${skillLines}

Genera el informe pedagógico resumido estructurado en JSON para alumnado y profesorado.`;

    try {
      const response = await generateFinalReportFast(ai, prompt);
      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'La IA no devolvió el informe pedagógico. Inténtalo de nuevo.',
        });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Final Report Summary Error]', msg);
      if (msg.includes('TIMEOUT')) {
        res.status(504).json({
          error: 'El informe tardó demasiado en generarse. Pulsa regenerar.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Permiso denegado al consultar Gemini. Revisa GEMINI_API_KEY en Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Límite temporal alcanzado al generar el informe. Espera unos segundos y reintenta.',
        });
        return;
      }
      res.status(500).json({
        error: 'No se pudo generar el informe pedagógico resumido con IA.',
      });
    }
  });

  // Ensure any unmatched or malformed /api/* request always returns JSON rather than HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  app.use(
    (
      err: Error,
      req: Request,
      res: Response,
      next: (e?: unknown) => void
    ) => {
      if (req.path.startsWith('/api')) {
        console.error('[API Middleware Error]', err?.message || err);
        res.status(400).json({
          error: 'No se pudo procesar la petición enviada al servidor.',
        });
        return;
      }
      next(err);
    }
  );

  const distDir = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Código Escena: TES server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
