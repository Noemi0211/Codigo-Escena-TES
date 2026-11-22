export type ArrivalPhase = 'FIRST_RESPONDER' | 'STANDARD_SECURED';

export type RoadType =
  | 'HIGHWAY'
  | 'CONVENTIONAL'
  | 'ADVERSE_WEATHER'
  | 'BLIND_CURVE'
  | 'TUNNEL_PORTAL'
  | 'URBAN'
  | 'FIRE_HAZARD'
  | 'ADR_HAZMAT';

export type GameState =
  | 'TITLE_MENU'
  | 'TUTORIAL'
  | 'SCENARIO_SELECT'
  | 'PLAYING'
  | 'SIMULATING'
  | 'ROUND_SUMMARY'
  | 'FINAL_REPORT'
  | 'PAUSED';

export interface Point {
  x: number;
  y: number;
}

export interface AmbulancePlacement {
  x: number;
  y: number;
  /** Angle in degrees. 0 = facing right (along primary travel direction). Negative (-30 to -45) = front angled toward median/center of road. */
  angleDeg: number;
  /** All emergency & warning lights activated */
  lightsAllOn: boolean;
  /** Danger visibly marked (V-16 / warning triangles / risk perimeter) */
  hazardMarked: boolean;
  /** Situation & additional risks communicated to Coordination Center (CCU/112) */
  ccuNotified: boolean;
}

export type VehicleSelection =
  | 'AMBULANCE'
  | 'AMBULANCE_2'
  | 'FIRE_TRUCK'
  | 'POLICE_0'
  | 'POLICE_1';

export interface MovableVehicle {
  x: number;
  y: number;
  angleDeg: number;
}

export interface DeploymentPlacement {
  ambulance: AmbulancePlacement;
  ambulance2?: MovableVehicle;
  fireTruck?: MovableVehicle;
  police: MovableVehicle[];
}

export interface ZoneRect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  label?: string;
}

export interface ScenarioSpec {
  id: string;
  order: number;
  level?: 'BASIC' | 'ADVANCED';
  isAdvancedDeployment?: boolean;
  title: string;
  roadLabel: string;
  roadType: RoadType;
  trafficFlowLabel: 'Sentido único' | 'Doble sentido';
  arrivalPhase: ArrivalPhase;
  speedLimitKmh: number;
  isNight: boolean;
  /** World units per meter (default 10; smaller for 75m fire / >500m ADR scales) */
  unitsPerMeter: number;
  /** Additional hazard classification */
  additionalHazard?: 'NONE' | 'ADVERSE_WEATHER' | 'LIMITED_VISIBILITY' | 'FIRE' | 'HAZMAT';
  briefing: string;
  keyObjective: string;
  /** Crash epicenter in canonical 1400x800 world */
  crashPos: Point;
  secondaryCrashPos?: Point;
  /** Fixed police patrol vehicles (used in basic scenarios) */
  policePositions: Array<Point & { angleDeg: number }>;
  /** Fixed fire truck (used in basic scenarios) */
  fireTruckPos?: Point & { angleDeg: number };
  /** Existing first ambulance when practicing >= 2.5m separation */
  otherAmbulancePos?: Point & { angleDeg: number };
  cones: Point[];
  initialAmbulance: AmbulancePlacement;
  /** Second interactive ambulance when scenario involves two ambulances */
  initialSecondAmbulance?: MovableVehicle;
  /** Advanced deployment initial spawns and target zones */
  initialFireTruck?: MovableVehicle;
  initialPolice?: MovableVehicle[];
  idealFireZone?: ZoneRect;
  idealPoliceZones?: ZoneRect[];
  idealZone: ZoneRect;
  idealSecondAmbulanceZone?: ZoneRect;
  acceptableZone: ZoneRect;
  forbiddenZones: Array<ZoneRect & { penaltyReason: string }>;
  /** Recommended angle range [min, max] in degrees */
  idealAngleRange: [number, number];
  expectsWedge: boolean;
  /** Recommended distance range in meters from crashPos */
  idealDistanceMeters: [number, number];
  /** Optional minimum hard distance in meters (e.g. 75m fire, 500m ADR) */
  minHardDistanceMeters?: number;
  /** Minimum separation from other ambulance in meters (2.5m per protocol) */
  minOtherAmbulanceSepMeters?: number;
  sightlineCutoffX?: number;
  crosswalkX?: [number, number];
  sideStreetX?: [number, number];
  tunnelPortalX?: number;
  hasAdverseWeather?: boolean;
  isCustom?: boolean;
  adaptiveTargetSkill?: AdaptiveSkillId;
  protocolSummary: string;
  protocolBullets: string[];
}

export interface CriterionResult {
  id:
    | 'position'
    | 'distance'
    | 'orientation'
    | 'protocol_actions'
    | 'adv_ambulance'
    | 'adv_fire'
    | 'adv_police';
  label: string;
  score: number;
  maxScore: number;
  status: 'SAFE' | 'WARNING' | 'CRITICAL';
  feedback: string;
}

export interface EvaluationResult {
  totalScore: number;
  grade: 'SEGURO' | 'MEJORABLE' | 'RIESGO_CRITICO';
  headline: string;
  criteria: CriterionResult[];
  distanceMeters: number;
  isBeforeCrash: boolean;
  hasSightlineHazard: boolean;
  hasSpacingHazard: boolean;
  hasBlockedAccessHazard: boolean;
  /** Personalized explanation when student makes mistakes telling them exactly how they should have parked */
  correctionExplanation: string;
  /** Actionable numbered steps to fix the placement in this scenario */
  correctionSteps: string[];
}

export type LcansLetterStatus = 'COMPLETO' | 'PARCIAL' | 'OMITIDO';

export interface LcansCriterionFeedback {
  status: LcansLetterStatus;
  feedback: string;
}

export interface CicuEvaluationReport {
  operatorReply: string;
  lcans: {
    L: LcansCriterionFeedback;
    C: LcansCriterionFeedback;
    A: LcansCriterionFeedback;
    N: LcansCriterionFeedback;
    S: LcansCriterionFeedback;
  };
  brevityStatus: 'ADECUADA' | 'MEJORABLE';
  brevityFeedback: string;
  inSituCoordinationMentioned: boolean;
  inSituFeedback: string;
  overallStatus: 'APROBADO' | 'FALTA_INFO';
  score: number;
  tips: string[];
}

export interface CicuTranscriptMessage {
  id: string;
  sender: 'CICU' | 'TES';
  text: string;
  timestamp: string;
}

export interface ScenarioHistoryEntry {
  scenarioId: string;
  title: string;
  roadLabel: string;
  arrivalPhase: ArrivalPhase;
  score: number;
  grade: EvaluationResult['grade'];
  cicuScore?: number;
  attemptsCount?: number;
  passedCriteria?: string[];
  failedCriteria?: string[];
  detectedIssues?: AdaptiveSkillId[];
  initialFailedCriteria?: string[];
}

export interface PedagogicalFinalReport {
  executiveSummary: string;
  consolidatedStrengths: string[];
  repeatedMistakes: string[];
  reviewRecommendations: string[];
  studentNote: string;
  teacherNote: string;
}

export interface SocraticTutorAnalysis {
  riskAnalysis: string;
  keyTakeaway: string;
  socraticQuestion: string;
}

export interface SocraticReplyFeedback {
  tutorResponse: string;
  understood: boolean;
}

export type AdaptiveSkillId =
  | 'ADR_FIRE_DISTANCE'
  | 'DEFENSIVE_ANGLE'
  | 'OPERATIONAL_EXIT'
  | 'FIRE_POLICE_SPACING'
  | 'TWO_AMBULANCE_GAP'
  | 'VISIBILITY_HAZARD'
  | 'SIGNALING_AND_CCU'
  | 'LANE_DISCIPLINE';

export interface AdaptiveSkillStat {
  skillId: AdaptiveSkillId;
  attempts: number;
  failures: number;
  criticals: number;
  weightedMistakes: number;
  recentStreakOk: number;
  lastSeenAt: number;
  lastIssueDetail?: string;
}

export interface AdaptiveProfile {
  totalAttempts: number;
  skills: Record<AdaptiveSkillId, AdaptiveSkillStat>;
  recentIssues: string[];
}

export interface ProtocolConsultMessage {
  id: string;
  role: 'USER' | 'CONSULTANT';
  text: string;
  keyRule?: string;
  relatedTopic?: string;
  inScope?: boolean;
  followUpSuggestions?: string[];
}

export interface MeritMedal {
  id: string;
  earnedAt: number;
  streakLength: number;
  avgScore: number;
  scenarioTitles: string[];
  label: string;
}

export interface MeritSessionState {
  currentStreak: number;
  streakScores: number[];
  streakScenarioTitles: string[];
  pendingMedals: MeritMedal[];
}


