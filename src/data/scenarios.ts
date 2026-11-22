import { ScenarioSpec } from '../types/game';

/**
 * Canonical 1400 x 800 world coordinates.
 * Primary direction of travel: Left -> Right (increasing X).
 * Top of primary lane = Mediana / Centro de la vía (negative angleDeg points nose toward center/median).
 * Bottom of primary lane = Arcén derecho / Bordillo.
 */
export const SCENARIOS: ScenarioSpec[] = [
  {
    id: 'autovia_primero',
    order: 1,
    title: 'Autovía A-2 · Km 44',
    roadLabel: 'Autovía',
    roadType: 'HIGHWAY',
    trafficFlowLabel: 'Sentido único',
    arrivalPhase: 'FIRST_RESPONDER',
    speedLimitKmh: 120,
    isNight: false,
    unitsPerMeter: 10,
    additionalHazard: 'NONE',
    briefing:
      'Eres el primer recurso sanitario en llegar a un alcance en el carril derecho. No hay policía ni bomberos todavía.',
    keyObjective:
      'Detente ANTES del accidente (~25 m), gira el frontal hacia la mediana (30°–45°), activa señales luminosas, baliza el peligro y avisa al Centro Coordinador.',
    crashPos: { x: 920, y: 445 },
    secondaryCrashPos: { x: 990, y: 455 },
    policePositions: [],
    cones: [],
    initialAmbulance: {
      x: 260,
      y: 445,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: false,
      ccuNotified: false,
    },
    idealZone: {
      xMin: 615,
      xMax: 730,
      yMin: 415,
      yMax: 490,
      label: 'Barrera previa (~25 m antes)',
    },
    acceptableZone: { xMin: 540, xMax: 775, yMin: 400, yMax: 510 },
    forbiddenZones: [
      {
        xMin: 830,
        xMax: 1290,
        yMin: 310,
        yMax: 525,
        penaltyReason:
          'Como primer interviniente debes detenerte ANTES del accidente para usar la ambulancia como barrera de protección entre el tráfico y las víctimas.',
      },
      {
        xMin: 110,
        xMax: 1290,
        yMin: 310,
        yMax: 382,
        penaltyReason:
          'No ocupes el carril izquierdo rápido; protege el carril derecho afectado sin bloquear el flujo libre.',
      },
    ],
    idealAngleRange: [-45, -30],
    expectsWedge: true,
    idealDistanceMeters: [20, 32],
    protocolSummary:
      'Como primer interviniente, el equipo asume provisionalmente la protección del escenario situando la ambulancia ~25 m antes del siniestro y girada 30°–45° hacia la mediana.',
    protocolBullets: [
      'Detenerse antes del punto del accidente aproximadamente a 25 metros.',
      'Girar ligeramente el vehículo con la parte delantera hacia la mediana o centro de la vía (30° a 45°): protege la zona trasera y lateral por donde transita el equipo.',
      'Activar todas las señales luminosas, señalizar el peligro de forma visible y establecer la zona de riesgo.',
      'Comunicar inmediatamente la situación al Centro Coordinador (CCU / 112).',
    ],
  },
  {
    id: 'autovia_estandar',
    order: 2,
    title: 'Autovía A-6 · Km 18',
    roadLabel: 'Autovía (Estacionamiento estándar)',
    roadType: 'HIGHWAY',
    trafficFlowLabel: 'Sentido único',
    arrivalPhase: 'STANDARD_SECURED',
    speedLimitKmh: 120,
    isNight: false,
    unitsPerMeter: 10,
    additionalHazard: 'NONE',
    briefing:
      'Vía de sentido único ya asegurada: la Guardia Civil protege antes del siniestro y Bomberos está a 5–10 m detrás a 30°. Llegan dos ambulancias: debes estacionar ambas correctamente.',
    keyObjective:
      'Estaciona ambas ambulancias por DELANTE del accidente (la primera a 10–15 m) en paralelo (0°) con salida operativa libre y dejando al menos 2,5 m de separación entre ellas.',
    crashPos: { x: 640, y: 445 },
    policePositions: [{ x: 300, y: 445, angleDeg: -32 }],
    fireTruckPos: { x: 555, y: 445, angleDeg: -30 },
    cones: [
      { x: 350, y: 405 },
      { x: 425, y: 402 },
      { x: 500, y: 402 },
      { x: 580, y: 405 },
    ],
    initialAmbulance: {
      x: 185,
      y: 355,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: true,
      ccuNotified: true,
    },
    initialSecondAmbulance: {
      x: 315,
      y: 355,
      angleDeg: 0,
    },
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
    acceptableZone: { xMin: 720, xMax: 845, yMin: 405, yMax: 510 },
    forbiddenZones: [
      {
        xMin: 120,
        xMax: 605,
        yMin: 395,
        yMax: 525,
        penaltyReason:
          'Detrás del accidente ya trabajan Bomberos (5–10 m detrás a 30°) y Policía. Estaciona por delante del siniestro según el protocolo estándar.',
      },
      {
        xMin: 110,
        xMax: 1290,
        yMin: 310,
        yMax: 382,
        penaltyReason:
          'Evita invadir el carril izquierdo abierto al tráfico.',
      },
    ],
    idealAngleRange: [-10, 10],
    expectsWedge: false,
    idealDistanceMeters: [10, 17],
    minOtherAmbulanceSepMeters: 2.5,
    protocolSummary:
      'En vías de sentido único con policía y bomberos presentes, la policía solo necesita situarse antes del accidente, bomberos a 5–10 m detrás a 30° y la ambulancia 10–15 m por delante.',
    protocolBullets: [
      'Seguir las indicaciones de policía y bomberos sin bloquear sus maniobras.',
      'Estacionar a 10–15 metros por delante del accidente con salida operativa rápida hacia el tráfico.',
      'Si hay más de una ambulancia en el lugar, dejar entre ellas una distancia mínima de 2,5 metros.',
    ],
  },
  {
    id: 'convencional_estandar',
    order: 3,
    title: 'Nacional N-340 · Tramo Recto',
    roadLabel: 'Carretera convencional',
    roadType: 'CONVENTIONAL',
    trafficFlowLabel: 'Doble sentido',
    arrivalPhase: 'STANDARD_SECURED',
    speedLimitKmh: 90,
    isNight: false,
    unitsPerMeter: 10,
    additionalHazard: 'NONE',
    briefing:
      'Vía de doble sentido ya señalizada: hay policía ANTES y DESPUÉS del accidente para advertir a ambos sentidos, y Bomberos está a 5–10 m detrás a 30°.',
    keyObjective:
      'Sitúa la ambulancia entre 10 y 15 m por DELANTE del accidente, en tu carril y orientada con salida operativa libre sin estorbar a la patrulla delantera.',
    crashPos: { x: 640, y: 455 },
    policePositions: [
      { x: 290, y: 455, angleDeg: -28 },
      { x: 1080, y: 345, angleDeg: 155 },
    ],
    fireTruckPos: { x: 555, y: 455, angleDeg: -30 },
    cones: [
      { x: 350, y: 412 },
      { x: 430, y: 410 },
      { x: 505, y: 410 },
    ],
    initialAmbulance: {
      x: 180,
      y: 455,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: true,
      ccuNotified: true,
    },
    idealZone: {
      xMin: 740,
      xMax: 815,
      yMin: 425,
      yMax: 500,
      label: '10–15 m delante del siniestro',
    },
    acceptableZone: { xMin: 715, xMax: 865, yMin: 415, yMax: 515 },
    forbiddenZones: [
      {
        xMin: 110,
        xMax: 1290,
        yMin: 280,
        yMax: 392,
        penaltyReason:
          'No invadas el carril contrario de doble sentido; las patrullas ya regulan ambos extremos.',
      },
      {
        xMin: 110,
        xMax: 605,
        yMin: 395,
        yMax: 525,
        penaltyReason:
          'Estacionar detrás bloquea la zona de maniobra de Bomberos (5–10 m detrás a 30°). Colócate 10–15 m por delante.',
      },
    ],
    idealAngleRange: [-10, 10],
    expectsWedge: false,
    idealDistanceMeters: [10, 16],
    protocolSummary:
      'En vías de doble sentido con intervención estándar, la policía sitúa vehículos antes y después del accidente, bomberos queda a 5–10 m detrás a 30° y la ambulancia 10–15 m delante.',
    protocolBullets: [
      'Comprobar que la policía cubre ambos sentidos (antes y después del siniestro).',
      'Posicionar la ambulancia 10–15 metros por delante del accidente en el sentido de la evacuación.',
      'Mantener la salida operativa despejada para reincorporarse al tráfico con seguridad.',
    ],
  },
  {
    id: 'lluvia_niebla_primero',
    order: 4,
    title: 'Comarcal C-55 · Lluvia y Niebla',
    roadLabel: 'Carretera con meteorología adversa',
    roadType: 'ADVERSE_WEATHER',
    trafficFlowLabel: 'Doble sentido',
    arrivalPhase: 'FIRST_RESPONDER',
    speedLimitKmh: 90,
    isNight: true,
    unitsPerMeter: 10,
    additionalHazard: 'ADVERSE_WEATHER',
    briefing:
      'Lluvia intensa y niebla densa nocturna: la visibilidad cae y la distancia de frenado del tráfico aumenta. Eres el primer recurso en llegar.',
    keyObjective:
      'AUMENTA la distancia de seguridad respecto a los 25 m habituales (35–50 m antes), gira el frontal hacia el centro (30°–45°), señaliza y avisa al CCU.',
    crashPos: { x: 960, y: 455 },
    policePositions: [],
    cones: [],
    initialAmbulance: {
      x: 200,
      y: 455,
      angleDeg: 0,
      lightsAllOn: false,
      hazardMarked: false,
      ccuNotified: false,
    },
    idealZone: {
      xMin: 460,
      xMax: 625,
      yMin: 425,
      yMax: 500,
      label: 'Distancia ampliada (35–50 m antes)',
    },
    acceptableZone: { xMin: 390, xMax: 680, yMin: 410, yMax: 515 },
    forbiddenZones: [
      {
        xMin: 110,
        xMax: 1290,
        yMin: 280,
        yMax: 392,
        penaltyReason:
          'Con niebla en carretera de doble sentido, invadir el carril contrario multiplica el riesgo de choque frontal.',
      },
      {
        xMin: 735,
        xMax: 910,
        yMin: 395,
        yMax: 525,
        penaltyReason:
          'Con lluvia/niebla la distancia de frenado aumenta mucho: 15–25 m son insuficientes; debes ampliar la distancia de seguridad por encima de 35 m.',
      },
      {
        xMin: 915,
        xMax: 1290,
        yMin: 395,
        yMax: 525,
        penaltyReason:
          'Como primeros intervinientes debéis estacionar ANTES del accidente para proteger el escenario.',
      },
    ],
    idealAngleRange: [-45, -30],
    expectsWedge: true,
    idealDistanceMeters: [34, 52],
    protocolSummary:
      'Ante condiciones meteorológicas adversas (lluvia, niebla, hielo), la menor adherencia y visibilidad exigen aumentar la distancia de seguridad por encima de los 25 m estándar.',
    protocolBullets: [
      'Aumentar la distancia de seguridad respecto al accidente (35–50 m antes en lugar de 25 m).',
      'Orientar el vehículo 30°–45° con el frontal hacia el centro de la vía para proteger el lateral y la trasera.',
      'Activar TODAS las señales luminosas, balizar el peligro visiblemente y avisar al Centro Coordinador.',
    ],
  },
  {
    id: 'curva_ciega_primero',
    order: 5,
    title: 'Carretera C-14 · Curva Sin Visibilidad',
    roadLabel: 'Curva de visibilidad limitada',
    roadType: 'BLIND_CURVE',
    trafficFlowLabel: 'Doble sentido',
    arrivalPhase: 'FIRST_RESPONDER',
    speedLimitKmh: 70,
    isNight: false,
    unitsPerMeter: 10,
    additionalHazard: 'LIMITED_VISIBILITY',
    briefing:
      'El coche accidentado está dentro de una curva ciega con talud rocoso. Todavía no han llegado ni policía ni bomberos.',
    keyObjective:
      'Estaciona ANTES del punto conflictivo (antes de entrar en la curva), con ángulo 30°–45° hacia el centro, señales luminosas, balizamiento y aviso al CCU.',
    crashPos: { x: 960, y: 365 },
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
    idealAngleRange: [-45, -30],
    expectsWedge: true,
    idealDistanceMeters: [42, 68],
    protocolSummary:
      'En zonas de visibilidad limitada (curvas, cambios de rasante), el vehículo asistencial debe estacionarse ANTES del punto conflictivo respetando la distancia de seguridad.',
    protocolBullets: [
      'Detener la ambulancia antes de iniciar la curva ciega, donde el tráfico que se aproxima tiene visibilidad directa.',
      'Formar ángulo de 30°–45° con el frontal hacia el centro de la vía para proteger el área de trabajo trasera y lateral.',
      'Activar señales luminosas, señalizar el peligro y comunicar la incidencia al Centro Coordinador.',
    ],
  },
  {
    id: 'tunel_visibilidad_primero',
    order: 6,
    title: 'Túnel de Guadarrama · Boca Sur',
    roadLabel: 'Túnel (visibilidad limitada)',
    roadType: 'TUNNEL_PORTAL',
    trafficFlowLabel: 'Sentido único',
    arrivalPhase: 'FIRST_RESPONDER',
    speedLimitKmh: 80,
    isNight: true,
    unitsPerMeter: 10,
    additionalHazard: 'LIMITED_VISIBILITY',
    briefing:
      'Accidente justo en el interior de la boca del túnel (zona de visibilidad limitada). Eres el primer recurso y Bomberos se dirige al lugar.',
    keyObjective:
      'Estaciona ANTES del punto conflictivo (antes de la boca del túnel, ~25–35 m antes del siniestro) en ángulo 30°–45° hacia la mediana sin bloquear el carril izquierdo de acceso.',
    crashPos: { x: 890, y: 445 },
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
          'Ante visibilidad limitada como túneles, debes estacionar ANTES del punto conflictivo; entrar dentro reduce la visibilidad y complica el acceso de Bomberos.',
      },
      {
        xMin: 110,
        xMax: 1290,
        yMin: 310,
        yMax: 382,
        penaltyReason:
          'No bloquees el carril izquierdo: otros servicios de emergencia (Bomberos, Policía) necesitan acceso libre al túnel.',
      },
    ],
    idealAngleRange: [-45, -30],
    expectsWedge: true,
    idealDistanceMeters: [20, 38],
    protocolSummary:
      'En túneles y puntos de visibilidad limitada, estacionar antes del punto conflictivo protege al equipo, advierte antes de entrar en la galería y deja acceso libre a Bomberos.',
    protocolBullets: [
      'Situarse antes de la boca del túnel respetando la distancia de seguridad (~25 m del siniestro).',
      'Ángulo de 30°–45° con el frontal hacia el centro/mediana sin invadir el carril de acceso para otros servicios.',
      'Activar todas las señales luminosas, señalizar el peligro y comunicar inmediatamente al Centro Coordinador.',
    ],
  },
  {
    id: 'urbana_estandar',
    order: 7,
    title: 'Avenida de la Constitución · Urbano',
    roadLabel: 'Vía urbana (Doble sentido)',
    roadType: 'URBAN',
    trafficFlowLabel: 'Doble sentido',
    arrivalPhase: 'STANDARD_SECURED',
    speedLimitKmh: 50,
    isNight: false,
    unitsPerMeter: 10,
    additionalHazard: 'NONE',
    briefing:
      'Vía urbana de doble sentido asegurada: Policía Local cubre antes y después, y Bomberos está a 5–10 m detrás a 30°. Hay un paso de peatones y una bocacalle.',
    keyObjective:
      'Estaciona 10–15 m por DELANTE del accidente en paralelo (salida operativa libre), sin pisar el paso de peatones ni bloquear la bocacalle.',
    crashPos: { x: 640, y: 455 },
    policePositions: [
      { x: 260, y: 455, angleDeg: -22 },
      { x: 1150, y: 345, angleDeg: 160 },
    ],
    fireTruckPos: { x: 555, y: 455, angleDeg: -30 },
    cones: [
      { x: 320, y: 410 },
      { x: 390, y: 410 },
      { x: 495, y: 410 },
    ],
    crosswalkX: [420, 475],
    sideStreetX: [985, 1110],
    initialAmbulance: {
      x: 165,
      y: 350,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: true,
      ccuNotified: true,
    },
    idealZone: {
      xMin: 745,
      xMax: 830,
      yMin: 430,
      yMax: 500,
      label: '10–15 m delante (sin bloquear bocacalle)',
    },
    acceptableZone: { xMin: 715, xMax: 935, yMin: 415, yMax: 515 },
    forbiddenZones: [
      {
        xMin: 395,
        xMax: 500,
        yMin: 280,
        yMax: 525,
        penaltyReason:
          'No estaciones sobre el paso de peatones ni interfieras con la zona previa.',
      },
      {
        xMin: 955,
        xMax: 1135,
        yMin: 395,
        yMax: 580,
        penaltyReason:
          'No debes bloquear bocacalles ni accesos de maniobra de otros servicios de emergencia.',
      },
      {
        xMin: 110,
        xMax: 600,
        yMin: 395,
        yMax: 525,
        penaltyReason:
          'Detrás trabajan Bomberos y Policía Local; sigue la pauta estándar colocándote 10–15 m por delante.',
      },
    ],
    idealAngleRange: [-10, 10],
    expectsWedge: false,
    idealDistanceMeters: [10, 20],
    protocolSummary:
      'En vía urbana asegurada, la ambulancia mantiene la distancia estándar de 10–15 m por delante del accidente con salida operativa, respetando cruces y maniobras de otros vehículos de emergencia.',
    protocolBullets: [
      'Respetar siempre la presencia de policía (antes y después en doble sentido) y bomberos (5–10 m detrás a 30°).',
      'Estacionar 10–15 m por delante del siniestro en paralelo con salida operativa expedita.',
      'No bloquear bocacalles, pasos de peatones ni accesos necesarios para otros equipos.',
    ],
  },
  {
    id: 'incendio_primero',
    order: 8,
    title: 'Ronda Exterior · Vehículo Incendiado',
    roadLabel: 'Riesgo adicional: Incendio',
    roadType: 'FIRE_HAZARD',
    trafficFlowLabel: 'Sentido único',
    arrivalPhase: 'FIRST_RESPONDER',
    speedLimitKmh: 100,
    isNight: false,
    unitsPerMeter: 5, // 1400 units = 280 meters!
    additionalHazard: 'FIRE',
    briefing:
      'Vehículo en llamas con riesgo de explosión y fuga de combustible. Eres el primer recurso en llegar. Escala ampliada (280 m de vía).',
    keyObjective:
      'Mantén una distancia mínima de al menos 75 METROS antes del incendio, orienta 30°–45° hacia la mediana, baliza el peligro y AVISA al Centro Coordinador esperando instrucciones especializadas.',
    crashPos: { x: 1160, y: 445 },
    policePositions: [],
    cones: [],
    initialAmbulance: {
      x: 920,
      y: 445,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: false,
      ccuNotified: false,
    },
    idealZone: {
      xMin: 460,
      xMax: 780,
      yMin: 415,
      yMax: 495,
      label: 'Perímetro seguro (≥ 75 m antes del fuego)',
    },
    acceptableZone: { xMin: 220, xMax: 785, yMin: 400, yMax: 510 },
    forbiddenZones: [
      {
        xMin: 790,
        xMax: 1320,
        yMin: 300,
        yMax: 530,
        penaltyReason:
          '¡Riesgo crítico de explosión e incendio! En vehículos incendiados la distancia mínima de seguridad es de al menos 75 metros.',
      },
      {
        xMin: 100,
        xMax: 1320,
        yMin: 310,
        yMax: 382,
        penaltyReason:
          'Deja el carril izquierdo despejado para la llegada urgente de los camiones de Bomberos.',
      },
    ],
    idealAngleRange: [-45, -30],
    expectsWedge: true,
    idealDistanceMeters: [75, 145],
    minHardDistanceMeters: 75,
    protocolSummary:
      'Cuando hay riesgos adicionales como vehículos incendiados o derrames de combustible, es obligatorio ampliar la distancia de seguridad al menos a 75 metros, avisar al CCU y esperar instrucciones del personal especializado.',
    protocolBullets: [
      'Estacionar antes del siniestro a una distancia mínima de al menos 75 metros.',
      'Orientar el frontal hacia la mediana (30°–45°), activar todas las señales luminosas y señalizar el peligro.',
      'Advertir inmediatamente al Centro Coordinador del riesgo de incendio/explosión y esperar instrucciones de Bomberos.',
    ],
  },
  {
    id: 'mercancias_peligrosas',
    order: 9,
    title: 'Autovía A-4 · Mercancías Peligrosas (ADR)',
    roadLabel: 'Riesgo adicional: Mercancías peligrosas',
    roadType: 'ADR_HAZMAT',
    trafficFlowLabel: 'Sentido único',
    arrivalPhase: 'FIRST_RESPONDER',
    speedLimitKmh: 120,
    isNight: false,
    unitsPerMeter: 1.5, // 1400 units = 933 meters! Allows > 500 m positioning!
    additionalHazard: 'HAZMAT',
    briefing:
      'Cisterna volcada con panel naranja ADR y nube tóxica/derrame en la calzada. Escala táctica de gran alcance (~930 m visibles).',
    keyObjective:
      'Retírate a MÁS DE 500 METROS antes del siniestro, activa señales luminosas, baliza la zona de riesgo y AVISA al Centro Coordinador esperando al equipo especializado.',
    crashPos: { x: 1220, y: 445 },
    policePositions: [],
    cones: [],
    initialAmbulance: {
      x: 920,
      y: 445,
      angleDeg: 0,
      lightsAllOn: true,
      hazardMarked: false,
      ccuNotified: false,
    },
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
          '¡Peligro químico/ADR! Con mercancías peligrosas implicadas debes estacionar a MÁS DE 500 metros de distancia.',
      },
      {
        xMin: 100,
        xMax: 1320,
        yMin: 310,
        yMax: 382,
        penaltyReason:
          'Mantén despejado el carril izquierdo para la entrada de equipos NBQ/Bomberos especializados.',
      },
    ],
    idealAngleRange: [-45, -30],
    expectsWedge: true,
    idealDistanceMeters: [501, 740],
    minHardDistanceMeters: 500,
    protocolSummary:
      'Ante accidentes con mercancías peligrosas (paneles ADR, fugas, nubes tóxicas), la distancia mínima supera los 500 metros y jamás se interviene sin autorización del personal especializado.',
    protocolBullets: [
      'Estacionar a MÁS DE 500 metros antes del accidente (en zona segura y preferiblemente barlovento).',
      'Activar todas las señales luminosas, balizar el corte de la vía y orientar el vehículo en protección (30°–45° hacia mediana).',
      'Advertir inmediatamente al Centro Coordinador y esperar instrucciones del personal especializado.',
    ],
  },
];
