import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import {
  AmbulancePlacement,
  DeploymentPlacement,
  EvaluationResult,
  MovableVehicle,
  ScenarioSpec,
  VehicleSelection,
} from '../types/game';
import {
  computeDistanceMeters,
  computeOtherAmbulanceDistanceMeters,
  computeTwoAmbulanceGapMeters,
  getIdealAdvancedForScenario,
  getIdealPlacementForScenario,
  getIdealSecondAmbulanceForScenario,
} from '../engine/evaluator';

interface RoadCanvasProps {
  scenario: ScenarioSpec;
  placement: AmbulancePlacement;
  onChangePlacement: (next: AmbulancePlacement) => void;
  deployment?: DeploymentPlacement;
  activeVehicle?: VehicleSelection;
  onSelectVehicle?: (v: VehicleSelection) => void;
  onChangeDeployment?: (next: DeploymentPlacement) => void;
  interactive: boolean;
  evaluation: EvaluationResult | null;
  isSimulating: boolean;
  isBackgroundDemo?: boolean;
  showIdealGhost?: boolean;
}

interface TrafficCar {
  x: number;
  y: number;
  lane: 'TOP' | 'BOTTOM';
  speed: number;
  color: string;
  angle: number;
  braking?: boolean;
}

const WORLD_W = 1400;
const WORLD_H = 800;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const RoadCanvas: React.FC<RoadCanvasProps> = ({
  scenario,
  placement,
  onChangePlacement,
  deployment,
  activeVehicle = 'AMBULANCE',
  onSelectVehicle,
  onChangeDeployment,
  interactive,
  evaluation,
  isSimulating,
  isBackgroundDemo = false,
  showIdealGhost = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const scenarioRef = useRef(scenario);
  const placementRef = useRef(placement);
  const deploymentRef = useRef(deployment);
  const activeVehicleRef = useRef(activeVehicle);
  const interactiveRef = useRef(interactive);
  const evaluationRef = useRef(evaluation);
  const isSimulatingRef = useRef(isSimulating);
  const isBgRef = useRef(isBackgroundDemo);
  const showIdealGhostRef = useRef(showIdealGhost);
  const onChangeRef = useRef(onChangePlacement);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  const onChangeDeploymentRef = useRef(onChangeDeployment);

  scenarioRef.current = scenario;
  placementRef.current = placement;
  deploymentRef.current = deployment;
  activeVehicleRef.current = activeVehicle;
  interactiveRef.current = interactive;
  evaluationRef.current = evaluation;
  isSimulatingRef.current = isSimulating;
  isBgRef.current = isBackgroundDemo;
  showIdealGhostRef.current = showIdealGhost;
  onChangeRef.current = onChangePlacement;
  onSelectVehicleRef.current = onSelectVehicle;
  onChangeDeploymentRef.current = onChangeDeployment;

  const dragModeRef = useRef<'NONE' | 'MOVE' | 'ROTATE'>('NONE');
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });
  const keysHeldRef = useRef<Set<string>>(new Set());
  const trafficRef = useRef<TrafficCar[]>([]);

  const [mobileZoom, setMobileZoom] = useState(false);
  const [panX, setPanX] = useState(640);
  const mobileZoomRef = useRef(false);
  const panXRef = useRef(640);
  mobileZoomRef.current = mobileZoom;
  panXRef.current = panX;

  useEffect(() => {
    setMobileZoom(false);
    setPanX(scenario.crashPos.x);
  }, [scenario.id, scenario.crashPos.x]);

  // Initialize traffic cars per scenario
  useEffect(() => {
    const colors = ['#94a3b8', '#64748b', '#cbd5e1', '#475569', '#e2e8f0'];
    const cars: TrafficCar[] = [];
    const isTwoWay = scenario.trafficFlowLabel === 'Doble sentido';

    if (isTwoWay) {
      for (let i = 0; i < 3; i++) {
        cars.push({
          x: 240 + i * 420,
          y: 345,
          lane: 'TOP',
          speed: 145,
          color: colors[(i + 1) % colors.length],
          angle: 180,
        });
      }
      cars.push({
        x: 60,
        y: 455,
        lane: 'BOTTOM',
        speed: 135,
        color: '#e2e8f0',
        angle: 0,
      });
    } else {
      for (let i = 0; i < 4; i++) {
        cars.push({
          x: 120 + i * 330,
          y: 350,
          lane: 'TOP',
          speed: scenario.roadType === 'HIGHWAY' || scenario.roadType === 'ADR_HAZMAT' ? 215 : 165,
          color: colors[i % colors.length],
          angle: 0,
        });
      }
      if (scenario.arrivalPhase === 'FIRST_RESPONDER') {
        cars.push({
          x: 80,
          y: 445,
          lane: 'BOTTOM',
          speed: 180,
          color: '#cbd5e1',
          angle: 0,
        });
      }
    }

    trafficRef.current = cars;
  }, [scenario.id, scenario.trafficFlowLabel, scenario.roadType, scenario.arrivalPhase]);

  const getViewportTransform = (width: number, height: number) => {
    const baseScale = Math.min(width / WORLD_W, height / WORLD_H);
    const isPortraitZoom = mobileZoomRef.current && width < 640 && height > width;
    if (!isPortraitZoom) {
      return {
        scale: baseScale,
        offsetX: (width - WORLD_W * baseScale) / 2,
        offsetY: (height - WORLD_H * baseScale) / 2,
      };
    }
    const scale = baseScale * 1.85;
    const clampedPanX = clamp(panXRef.current, 260, WORLD_W - 260);
    const offsetX = clamp(
      width / 2 - clampedPanX * scale,
      width - WORLD_W * scale,
      0
    );
    const offsetY = height / 2 - 410 * scale;
    return { scale, offsetX, offsetY };
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 700, y: 400, scale: 1 };
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = getViewportTransform(rect.width, rect.height);
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
      scale,
    };
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!interactiveRef.current) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e'].includes(k)) {
        keysHeldRef.current.add(k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.key.toLowerCase());
    };
    const onBlur = () => {
      keysHeldRef.current.clear();
      dragModeRef.current = 'NONE';
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      const timeSec = now / 1000;

      const sc = scenarioRef.current;
      const amb = placementRef.current;

      // Keyboard movement handling for active vehicle
      if (interactiveRef.current && keysHeldRef.current.size > 0) {
        const keys = keysHeldRef.current;
        const moveSpeed = 240;
        const rotSpeed = 95;
        const dep = deploymentRef.current;
        const av = activeVehicleRef.current;
        const hasMulti = Boolean(sc.isAdvancedDeployment || sc.initialSecondAmbulance);

        const getActiveCoords = (): MovableVehicle => {
          if (hasMulti && dep) {
            if (av === 'AMBULANCE_2' && dep.ambulance2) return dep.ambulance2;
            if (sc.isAdvancedDeployment) {
              if (av === 'FIRE_TRUCK' && dep.fireTruck) return dep.fireTruck;
              if (av === 'POLICE_0' && dep.police[0]) return dep.police[0];
              if (av === 'POLICE_1' && dep.police[1]) return dep.police[1];
            }
            return dep.ambulance;
          }
          return amb;
        };

        const cur = getActiveCoords();
        let nx = cur.x;
        let ny = cur.y;
        let na = cur.angleDeg;

        if (keys.has('arrowleft') || keys.has('a')) nx -= moveSpeed * dt;
        if (keys.has('arrowright') || keys.has('d')) nx += moveSpeed * dt;
        if (keys.has('arrowup') || keys.has('w')) ny -= moveSpeed * dt;
        if (keys.has('arrowdown') || keys.has('s')) ny += moveSpeed * dt;
        if (keys.has('q')) na -= rotSpeed * dt;
        if (keys.has('e')) na += rotSpeed * dt;

        nx = clamp(nx, 85, WORLD_W - 85);
        ny = clamp(ny, 130, WORLD_H - 120);
        na = av === 'POLICE_1' ? clamp(na, -180, 180) : clamp(na, -85, 85);

        if (nx !== cur.x || ny !== cur.y || na !== cur.angleDeg) {
          if (hasMulti && dep && onChangeDeploymentRef.current) {
            const nextDep: DeploymentPlacement = {
              ...dep,
              police: [...dep.police],
            };
            if (av === 'AMBULANCE_2' && nextDep.ambulance2) {
              nextDep.ambulance2 = { x: nx, y: ny, angleDeg: Math.round(na) };
            } else if (sc.isAdvancedDeployment && av === 'FIRE_TRUCK' && nextDep.fireTruck) {
              nextDep.fireTruck = { x: nx, y: ny, angleDeg: Math.round(na) };
            } else if (sc.isAdvancedDeployment && av === 'POLICE_0' && nextDep.police[0]) {
              nextDep.police[0] = { x: nx, y: ny, angleDeg: Math.round(na) };
            } else if (sc.isAdvancedDeployment && av === 'POLICE_1' && nextDep.police[1]) {
              nextDep.police[1] = { x: nx, y: ny, angleDeg: Math.round(na) };
            } else {
              nextDep.ambulance = { ...dep.ambulance, x: nx, y: ny, angleDeg: Math.round(na) };
            }
            deploymentRef.current = nextDep;
            onChangeDeploymentRef.current(nextDep);
          } else {
            const updated = { ...amb, x: nx, y: ny, angleDeg: Math.round(na) };
            placementRef.current = updated;
            onChangeRef.current(updated);
          }
        }
      }

      // Update traffic flow
      for (const car of trafficRef.current) {
        if (sc.roadType === 'BLIND_CURVE') {
          if (car.lane === 'TOP') {
            car.x -= car.speed * dt;
            if (car.x < -80) car.x = WORLD_W + 80;
            if (car.x > 540) {
              const t = (car.x - 540) / 520;
              car.y = 345 - t * t * 155;
              car.angle = 180 - t * 28;
            } else {
              car.y = 345;
              car.angle = 180;
            }
          } else {
            const targetStopX = Math.min(amb.x - 105, sc.crashPos.x - 105);
            if (car.x < targetStopX && car.x > 0) {
              car.x += car.speed * dt;
              car.braking = false;
            } else {
              car.braking = true;
              car.x += 12 * dt;
              if (car.x > targetStopX + 18) {
                car.x = 30;
                car.braking = false;
              }
            }
            if (car.x > 540) {
              const t = (car.x - 540) / 520;
              car.y = 455 - t * t * 155;
              car.angle = -t * 28;
            } else {
              car.y = 455;
              car.angle = 0;
            }
          }
        } else {
          if (car.lane === 'TOP') {
            if (car.angle === 180) {
              const frontPolice = sc.policePositions.find((p) => p.y < 400);
              const blocked =
                frontPolice &&
                car.x > frontPolice.x &&
                car.x - frontPolice.x < 140;
              car.braking = Boolean(blocked);
              car.x -= (blocked ? car.speed * 0.2 : car.speed) * dt;
              if (car.x < -90) car.x = WORLD_W + 90;
            } else {
              const blocked =
                Math.abs(amb.y - car.y) < 55 &&
                amb.x > car.x &&
                amb.x - car.x < 170;
              car.braking = blocked;
              car.x += (blocked ? car.speed * 0.15 : car.speed) * dt;
              if (car.x > WORLD_W + 90) car.x = -90;
            }
          } else {
            const stopDist = amb.x < sc.crashPos.x ? amb.x - 105 : sc.crashPos.x - 105;
            if (car.x < stopDist) {
              car.x += car.speed * dt;
              car.braking = car.x > stopDist - 120;
            } else {
              car.braking = true;
              car.x += 12 * dt;
              if (car.x > stopDist + 25) {
                car.x = -80;
                car.braking = false;
              }
            }
          }
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (
          canvas.width !== Math.floor(rect.width * dpr) ||
          canvas.height !== Math.floor(rect.height * dpr)
        ) {
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          ctx.fillStyle = sc.isNight ? '#080d17' : '#0f172a';
          ctx.fillRect(0, 0, rect.width, rect.height);

          const { scale, offsetX, offsetY } = getViewportTransform(rect.width, rect.height);

          ctx.translate(offsetX, offsetY);
          ctx.scale(scale, scale);

          const vehScale =
            sc.unitsPerMeter <= 2 ? 0.68 : sc.unitsPerMeter <= 6 ? 0.82 : 1.0;

          drawEnvironment(ctx, sc, timeSec);

          if (sc.id.startsWith('tutorial_') && sc.idealZone.label) {
            ctx.save();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.fillRect(
              sc.idealZone.xMin,
              sc.idealZone.yMin,
              sc.idealZone.xMax - sc.idealZone.xMin,
              sc.idealZone.yMax - sc.idealZone.yMin
            );
            ctx.strokeRect(
              sc.idealZone.xMin,
              sc.idealZone.yMin,
              sc.idealZone.xMax - sc.idealZone.xMin,
              sc.idealZone.yMax - sc.idealZone.yMin
            );
            ctx.setLineDash([]);
            ctx.fillStyle = '#fbbf24';
            ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(
              sc.idealZone.label,
              (sc.idealZone.xMin + sc.idealZone.xMax) / 2,
              sc.idealZone.yMin - 10
            );
            ctx.restore();
          }

          if (evaluationRef.current && !isBgRef.current) {
            drawEvaluationOverlays(ctx, sc, amb, evaluationRef.current, timeSec);
          }

          const dep = deploymentRef.current;
          const hasMulti = Boolean(sc.isAdvancedDeployment || sc.initialSecondAmbulance);
          const activeAmb = hasMulti && dep ? dep.ambulance : amb;
          const av = activeVehicleRef.current;

          drawPoliceAndCones(
            ctx,
            sc,
            timeSec,
            vehScale,
            sc.isAdvancedDeployment && dep ? dep.police : undefined,
            sc.isAdvancedDeployment && interactiveRef.current ? av : undefined
          );

          const ftPos =
            sc.isAdvancedDeployment && dep?.fireTruck
              ? dep.fireTruck
              : sc.fireTruckPos;
          if (ftPos) {
            drawFireTruck(
              ctx,
              ftPos,
              timeSec,
              vehScale,
              sc.isAdvancedDeployment && interactiveRef.current && av === 'FIRE_TRUCK'
            );
          }

          if (sc.otherAmbulancePos && !dep?.ambulance2) {
            drawStaticAmbulance(ctx, sc.otherAmbulancePos, timeSec, vehScale);
          }

          drawCrashScene(ctx, sc, timeSec, vehScale);

          for (const car of trafficRef.current) {
            drawTrafficCar(ctx, car, sc.isNight, vehScale);
          }

          if (!isBgRef.current) {
            let measureSource: MovableVehicle = activeAmb;
            let measureTarget: { x: number; y: number } = sc.crashPos;
            if (hasMulti && dep) {
              if (sc.isAdvancedDeployment && av === 'FIRE_TRUCK' && dep.fireTruck) {
                measureSource = dep.fireTruck;
                measureTarget = sc.crashPos;
              } else if (sc.isAdvancedDeployment && av === 'POLICE_0' && dep.police[0]) {
                measureSource = dep.police[0];
                measureTarget = sc.crashPos;
              } else if (sc.isAdvancedDeployment && av === 'POLICE_1' && dep.police[1]) {
                measureSource = dep.police[1];
                measureTarget = sc.crashPos;
              } else if (av === 'AMBULANCE_2' && dep.ambulance2) {
                measureSource = dep.ambulance2;
                measureTarget =
                  sc.isAdvancedDeployment && dep.fireTruck ? dep.fireTruck : sc.crashPos;
              } else if (av === 'AMBULANCE') {
                measureSource = activeAmb;
                measureTarget =
                  sc.isAdvancedDeployment && dep.fireTruck ? dep.fireTruck : sc.crashPos;
              }
            }
            drawDistanceMeasurement(
              ctx,
              sc,
              activeAmb,
              measureSource,
              measureTarget,
              dep?.ambulance2
            );
          }

          if (showIdealGhostRef.current && !isBgRef.current) {
            drawIdealGhostAmbulance(ctx, sc, vehScale, timeSec);
          }

          if (hasMulti && dep?.ambulance2) {
            const amb2Placement: AmbulancePlacement = {
              ...activeAmb,
              x: dep.ambulance2.x,
              y: dep.ambulance2.y,
              angleDeg: dep.ambulance2.angleDeg,
              hazardMarked: false,
            };
            drawPlayerAmbulance(
              ctx,
              amb2Placement,
              sc,
              timeSec,
              interactiveRef.current && !isBgRef.current && av === 'AMBULANCE_2',
              vehScale
            );
          }

          drawPlayerAmbulance(
            ctx,
            activeAmb,
            sc,
            timeSec,
            interactiveRef.current && !isBgRef.current && (!hasMulti || av === 'AMBULANCE'),
            vehScale
          );

          if (hasMulti && dep?.ambulance2 && !isBgRef.current) {
            ctx.save();
            ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = av === 'AMBULANCE' ? '#fde68a' : '#e2e8f0';
            ctx.fillText('AMBULANCIA 1', activeAmb.x, activeAmb.y - 32);
            ctx.fillStyle = av === 'AMBULANCE_2' ? '#fde68a' : '#e2e8f0';
            ctx.fillText('AMBULANCIA 2', dep.ambulance2.x, dep.ambulance2.y - 32);
            ctx.restore();
          }

          // Weather overlays (rain & fog)
          if (
            sc.roadType === 'ADVERSE_WEATHER' ||
            sc.additionalHazard === 'ADVERSE_WEATHER' ||
            sc.hasAdverseWeather
          ) {
            drawAdverseWeather(ctx, timeSec);
          }

          if (sc.isNight) {
            const grad = ctx.createRadialGradient(
              amb.x,
              amb.y,
              150,
              WORLD_W / 2,
              WORLD_H / 2,
              960
            );
            grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
            grad.addColorStop(1, 'rgba(2, 6, 23, 0.45)');
            ctx.fillStyle = grad;
            ctx.fillRect(-400, -400, WORLD_W + 800, WORLD_H + 800);
          }

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const getActiveTarget = (): MovableVehicle => {
    const dep = deploymentRef.current;
    const av = activeVehicleRef.current;
    const sc = scenarioRef.current;
    const hasMulti = Boolean(sc.isAdvancedDeployment || sc.initialSecondAmbulance);
    if (hasMulti && dep) {
      if (av === 'AMBULANCE_2' && dep.ambulance2) return dep.ambulance2;
      if (sc.isAdvancedDeployment) {
        if (av === 'FIRE_TRUCK' && dep.fireTruck) return dep.fireTruck;
        if (av === 'POLICE_0' && dep.police[0]) return dep.police[0];
        if (av === 'POLICE_1' && dep.police[1]) return dep.police[1];
      }
      return dep.ambulance;
    }
    return placementRef.current;
  };

  const applyActiveMove = (nx: number, ny: number, na?: number) => {
    const dep = deploymentRef.current;
    const av = activeVehicleRef.current;
    const sc = scenarioRef.current;
    const hasMulti = Boolean(sc.isAdvancedDeployment || sc.initialSecondAmbulance);
    if (hasMulti && dep && onChangeDeploymentRef.current) {
      const nextDep: DeploymentPlacement = { ...dep, police: [...dep.police] };
      if (av === 'AMBULANCE_2' && nextDep.ambulance2) {
        nextDep.ambulance2 = {
          x: nx,
          y: ny,
          angleDeg: na !== undefined ? na : nextDep.ambulance2.angleDeg,
        };
      } else if (sc.isAdvancedDeployment && av === 'FIRE_TRUCK' && nextDep.fireTruck) {
        nextDep.fireTruck = {
          x: nx,
          y: ny,
          angleDeg: na !== undefined ? na : nextDep.fireTruck.angleDeg,
        };
      } else if (sc.isAdvancedDeployment && av === 'POLICE_0' && nextDep.police[0]) {
        nextDep.police[0] = {
          x: nx,
          y: ny,
          angleDeg: na !== undefined ? na : nextDep.police[0].angleDeg,
        };
      } else if (sc.isAdvancedDeployment && av === 'POLICE_1' && nextDep.police[1]) {
        nextDep.police[1] = {
          x: nx,
          y: ny,
          angleDeg: na !== undefined ? na : nextDep.police[1].angleDeg,
        };
      } else {
        nextDep.ambulance = {
          ...dep.ambulance,
          x: nx,
          y: ny,
          angleDeg: na !== undefined ? na : dep.ambulance.angleDeg,
        };
      }
      deploymentRef.current = nextDep;
      onChangeDeploymentRef.current(nextDep);
    } else {
      const amb = placementRef.current;
      onChangeRef.current({
        ...amb,
        x: nx,
        y: ny,
        angleDeg: na !== undefined ? na : amb.angleDeg,
      });
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const pt = clientToWorld(e.clientX, e.clientY);
    const activeTarget = getActiveTarget();
    const rotateRadius = Math.max(28, 28 / pt.scale);
    const vehicleRadius = Math.max(58, 34 / pt.scale);

    const rad = degToRad(activeTarget.angleDeg);
    const handleX = activeTarget.x + Math.cos(rad) * 72;
    const handleY = activeTarget.y + Math.sin(rad) * 72;

    if (Math.hypot(pt.x - handleX, pt.y - handleY) < rotateRadius) {
      dragModeRef.current = 'ROTATE';
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // In Multi-Vehicle scenarios (Advanced Deployment or 2 Ambulances), allow clicking any movable vehicle to select & drag it
    const dep = deploymentRef.current;
    const sc = scenarioRef.current;
    const hasMulti = Boolean(sc.isAdvancedDeployment || sc.initialSecondAmbulance);
    if (hasMulti && dep) {
      const candidates: Array<{ id: VehicleSelection; v: MovableVehicle }> = [
        { id: 'AMBULANCE', v: dep.ambulance },
      ];
      if (dep.ambulance2) candidates.push({ id: 'AMBULANCE_2', v: dep.ambulance2 });
      if (sc.isAdvancedDeployment) {
        if (dep.fireTruck) candidates.push({ id: 'FIRE_TRUCK', v: dep.fireTruck });
        if (dep.police[0]) candidates.push({ id: 'POLICE_0', v: dep.police[0] });
        if (dep.police[1]) candidates.push({ id: 'POLICE_1', v: dep.police[1] });
      }

      for (const c of candidates) {
        if (Math.hypot(pt.x - c.v.x, pt.y - c.v.y) < vehicleRadius) {
          if (onSelectVehicleRef.current && c.id !== activeVehicleRef.current) {
            activeVehicleRef.current = c.id;
            onSelectVehicleRef.current(c.id);
          }
          dragModeRef.current = 'MOVE';
          dragOffsetRef.current = { dx: c.v.x - pt.x, dy: c.v.y - pt.y };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
    } else if (Math.hypot(pt.x - activeTarget.x, pt.y - activeTarget.y) < vehicleRadius) {
      dragModeRef.current = 'MOVE';
      dragOffsetRef.current = { dx: activeTarget.x - pt.x, dy: activeTarget.y - pt.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const nx = clamp(pt.x, 85, WORLD_W - 85);
    const ny = clamp(pt.y, 130, WORLD_H - 120);
    applyActiveMove(nx, ny);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || dragModeRef.current === 'NONE') return;
    const pt = clientToWorld(e.clientX, e.clientY);
    const activeTarget = getActiveTarget();

    if (dragModeRef.current === 'MOVE') {
      const nx = clamp(pt.x + dragOffsetRef.current.dx, 85, WORLD_W - 85);
      const ny = clamp(pt.y + dragOffsetRef.current.dy, 130, WORLD_H - 120);
      applyActiveMove(nx, ny);
    } else if (dragModeRef.current === 'ROTATE') {
      const deg = (Math.atan2(pt.y - activeTarget.y, pt.x - activeTarget.x) * 180) / Math.PI;
      const clampedDeg =
        activeVehicleRef.current === 'POLICE_1'
          ? Math.round(clamp(deg, -180, 180))
          : Math.round(clamp(deg, -85, 85));
      applyActiveMove(activeTarget.x, activeTarget.y, clampedDeg);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragModeRef.current !== 'NONE') {
      dragModeRef.current = 'NONE';
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`block h-full w-full touch-none select-none ${
          interactive ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {interactive && !isBackgroundDemo && (
        <div className="pointer-events-auto absolute right-2 bottom-48 z-20 flex items-center gap-1 rounded-lg border border-slate-700/90 bg-slate-900/90 p-1 shadow-lg sm:hidden">
          {mobileZoom && (
            <>
              <button
                type="button"
                aria-label="Desplazar vista a la izquierda"
                onClick={() => setPanX((prev) => clamp(prev - 180, 260, WORLD_W - 260))}
                className="rounded p-1.5 text-slate-200 hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Desplazar vista a la derecha"
                onClick={() => setPanX((prev) => clamp(prev + 180, 260, WORLD_W - 260))}
                className="rounded p-1.5 text-slate-200 hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (!mobileZoom) {
                setPanX(clamp(getActiveTarget().x, 260, WORLD_W - 260));
              }
              setMobileZoom((v) => !v);
            }}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-slate-800"
          >
            {mobileZoom ? (
              <>
                <ZoomOut className="h-3.5 w-3.5" />
                Vista general
              </>
            ) : (
              <>
                <ZoomIn className="h-3.5 w-3.5" />
                Ampliar
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Canvas Drawing Helpers
// ---------------------------------------------------------------------------

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleDeg: number,
  alpha = 0.28
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(degToRad(angleDeg));
  ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(-20, -4);
  ctx.lineTo(8, -4);
  ctx.lineTo(8, -10);
  ctx.lineTo(24, 0);
  ctx.lineTo(8, 10);
  ctx.lineTo(8, 4);
  ctx.lineTo(-20, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEnvironment(
  ctx: CanvasRenderingContext2D,
  sc: ScenarioSpec,
  timeSec: number
) {
  ctx.fillStyle = sc.isNight ? '#0a111d' : '#131d2e';
  ctx.fillRect(-400, -300, WORLD_W + 800, WORLD_H + 600);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  for (let gx = -200; gx <= WORLD_W + 200; gx += 100) {
    ctx.beginPath();
    ctx.moveTo(gx, -200);
    ctx.lineTo(gx, WORLD_H + 200);
    ctx.stroke();
  }
  for (let gy = -200; gy <= WORLD_H + 200; gy += 100) {
    ctx.beginPath();
    ctx.moveTo(-200, gy);
    ctx.lineTo(WORLD_W + 200, gy);
    ctx.stroke();
  }

  if (sc.roadType === 'BLIND_CURVE') {
    const drawCurvePath = () => {
      ctx.beginPath();
      ctx.moveTo(-200, 405);
      ctx.lineTo(540, 405);
      ctx.quadraticCurveTo(880, 405, 1180, 195);
      ctx.lineTo(1600, -100);
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawCurvePath();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 250;
    ctx.stroke();

    drawCurvePath();
    ctx.strokeStyle = '#243041';
    ctx.lineWidth = 175;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-200, 322);
    ctx.lineTo(540, 322);
    ctx.quadraticCurveTo(835, 322, 1130, 125);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.75)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-200, 488);
    ctx.lineTo(540, 488);
    ctx.quadraticCurveTo(925, 488, 1230, 265);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-200, 405);
    ctx.lineTo(540, 405);
    ctx.quadraticCurveTo(880, 405, 1180, 195);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Sight-blocking rocky cliff inside curve
    ctx.save();
    ctx.fillStyle = '#3b2f26';
    ctx.strokeStyle = '#5c493b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(570, 285);
    ctx.quadraticCurveTo(720, 210, 960, 100);
    ctx.lineTo(540, 100);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(248, 250, 252, 0.78)';
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('TALUD ROCOSO (SIN VISIBILIDAD)', 620, 195);
    ctx.restore();

    drawArrow(ctx, 240, 450, 0, 0.3);
    drawArrow(ctx, 430, 450, 0, 0.3);
    drawArrow(ctx, 360, 358, 180, 0.25);
    return;
  }

  // Straight road variants
  if (sc.roadType === 'URBAN') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(-300, 200, WORLD_W + 600, 100);
    ctx.fillRect(-300, 515, WORLD_W + 600, 130);

    if (sc.sideStreetX) {
      const [sx1, sx2] = sc.sideStreetX;
      ctx.fillStyle = '#243041';
      ctx.fillRect(sx1, 510, sx2 - sx1, 320);
      ctx.strokeStyle = 'rgba(248,250,252,0.5)';
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo((sx1 + sx2) / 2, 535);
      ctx.lineTo((sx1 + sx2) / 2, 780);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BOCACALLE', (sx1 + sx2) / 2, 575);
    }

    ctx.fillStyle = '#64748b';
    ctx.fillRect(-300, 294, WORLD_W + 600, 8);
    ctx.fillRect(-300, 510, sc.sideStreetX ? sc.sideStreetX[0] + 300 : WORLD_W + 600, 8);
    if (sc.sideStreetX) {
      ctx.fillRect(sc.sideStreetX[1], 510, 500, 8);
    }
  } else {
    // Shoulders
    ctx.fillStyle = '#2e3b4e';
    ctx.fillRect(-300, 480, WORLD_W + 600, 55);
    ctx.fillStyle = '#253142';
    ctx.fillRect(-300, 278, WORLD_W + 600, 32);

    ctx.fillStyle = '#64748b';
    ctx.fillRect(-300, 272, WORLD_W + 600, 6);
    ctx.fillRect(-300, 535, WORLD_W + 600, 6);

    ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ARCÉN DERECHO', 65, 514);
  }

  // Asphalt lanes
  ctx.fillStyle = '#243041';
  ctx.fillRect(-300, 302, WORLD_W + 600, sc.roadType === 'URBAN' ? 210 : 185);

  // Outer road edge lines
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-300, 306);
  ctx.lineTo(WORLD_W + 300, 306);
  ctx.moveTo(-300, 480);
  ctx.lineTo(WORLD_W + 300, 480);
  ctx.stroke();

  // Median / center line
  const isTwoWay = sc.trafficFlowLabel === 'Doble sentido';
  ctx.save();
  if (isTwoWay) {
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.setLineDash([28, 20]);
    ctx.beginPath();
    ctx.moveTo(-300, 398);
    ctx.lineTo(WORLD_W + 300, 398);
    ctx.stroke();

    ctx.fillStyle = 'rgba(248, 250, 252, 0.45)';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CENTRO DE LA VÍA (DOBLE SENTIDO)', 65, 294);
  } else {
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.75)';
    ctx.lineWidth = 3;
    ctx.setLineDash([32, 24]);
    ctx.beginPath();
    ctx.moveTo(-300, 398);
    ctx.lineTo(WORLD_W + 300, 398);
    ctx.stroke();

    ctx.fillStyle = 'rgba(248, 250, 252, 0.45)';
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MEDIANA / BARRERA CENTRAL (SENTIDO ÚNICO)', 65, 294);
  }
  ctx.restore();

  // Crosswalk for urban
  if (sc.roadType === 'URBAN' && sc.crosswalkX) {
    const [cx1, cx2] = sc.crosswalkX;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
    for (let sy = 314; sy <= 494; sy += 24) {
      ctx.fillRect(cx1, sy, cx2 - cx1, 13);
    }
  }

  // Tunnel Portal section
  if (sc.roadType === 'TUNNEL_PORTAL' && sc.tunnelPortalX) {
    const px = sc.tunnelPortalX;
    // Tunnel roof / walls starting at px
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(px, 210, WORLD_W - px + 300, 92);
    ctx.fillRect(px, 515, WORLD_W - px + 300, 110);

    // Darker tunnel interior shading
    ctx.fillStyle = 'rgba(2, 6, 23, 0.5)';
    ctx.fillRect(px, 302, WORLD_W - px + 300, 210);

    // Concrete portal arch beam
    ctx.fillStyle = '#475569';
    ctx.fillRect(px - 10, 260, 20, 285);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(px - 10, 298, 20, 8);
    ctx.fillRect(px - 10, 480, 20, 8);

    // Tunnel amber lights
    const pulse = Math.sin(timeSec * 4) > 0 ? 0.75 : 0.25;
    ctx.fillStyle = `rgba(245, 158, 11, ${pulse})`;
    for (let lx = px + 60; lx < WORLD_W; lx += 130) {
      ctx.beginPath();
      ctx.arc(lx, 295, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BOCA DEL TÚNEL', px, 245);
  }

  // Directional lane arrows
  if (isTwoWay) {
    drawArrow(ctx, 180, 442, 0, 0.25);
    drawArrow(ctx, 410, 442, 0, 0.25);
    drawArrow(ctx, 1140, 350, 180, 0.25);
    drawArrow(ctx, 450, 350, 180, 0.25);
  } else {
    drawArrow(ctx, 160, 350, 0, 0.25);
    drawArrow(ctx, 500, 350, 0, 0.25);
    drawArrow(ctx, 1120, 350, 0, 0.25);
    drawArrow(ctx, 160, 442, 0, 0.25);
    drawArrow(ctx, 1120, 442, 0, 0.25);
  }
}

function drawSelectionHandles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleDeg: number,
  vehScale: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, 66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.rotate(degToRad(angleDeg));
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(46 * vehScale, 0);
  ctx.lineTo(66, 0);
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(72, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(72, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPoliceAndCones(
  ctx: CanvasRenderingContext2D,
  sc: ScenarioSpec,
  timeSec: number,
  vehScale: number,
  overridePolice?: MovableVehicle[],
  activeVehicle?: VehicleSelection
) {
  for (const cone of sc.cones) {
    ctx.save();
    ctx.translate(cone.x, cone.y);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const policeList = overridePolice || sc.policePositions;

  policeList.forEach((p, idx) => {
    const isSelected =
      (idx === 0 && activeVehicle === 'POLICE_0') ||
      (idx === 1 && activeVehicle === 'POLICE_1');

    if (isSelected) {
      drawSelectionHandles(ctx, p.x, p.y, p.angleDeg, vehScale);
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(degToRad(p.angleDeg));
    ctx.scale(vehScale, vehScale);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-32, -14, 68, 32);

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(-34, -15, 68, 30, 6);
    ctx.fill();

    ctx.fillStyle = sc.roadType === 'URBAN' ? '#1d4ed8' : '#15803d';
    ctx.fillRect(-34, -15, 18, 30);
    ctx.fillRect(14, -15, 20, 30);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(4, -11, 11, 22);

    const blueOn = Math.floor(timeSec * 8) % 2 === 0;
    ctx.fillStyle = blueOn ? '#3b82f6' : '#1e40af';
    ctx.fillRect(-4, -12, 6, 12);
    ctx.fillStyle = !blueOn ? '#60a5fa' : '#1d4ed8';
    ctx.fillRect(-4, 0, 6, 12);

    ctx.fillStyle = blueOn ? 'rgba(59, 130, 246, 0.28)' : 'rgba(96, 165, 250, 0.2)';
    ctx.beginPath();
    ctx.arc(-1, 0, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = isSelected ? '#fde68a' : 'rgba(147, 197, 253, 0.9)';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const label = overridePolice
      ? policeList.length > 1
        ? `POLICÍA ${idx + 1}`
        : 'POLICÍA'
      : sc.roadType === 'URBAN'
        ? 'POLICÍA LOCAL'
        : 'POLICÍA';
    ctx.fillText(label, p.x, p.y - 30);
  });
}

function drawFireTruck(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number; angleDeg: number },
  timeSec: number,
  vehScale: number,
  isSelected = false
) {
  if (isSelected) {
    drawSelectionHandles(ctx, pos.x, pos.y, pos.angleDeg, vehScale);
  }

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(degToRad(pos.angleDeg));
  ctx.scale(vehScale, vehScale);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.roundRect(-48, -19, 98, 42, 6);
  ctx.fill();

  // Red fire engine chassis
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.roundRect(-48, -19, 96, 38, 6);
  ctx.fill();

  // White stripe & ladder detail
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-42, -16, 62, 4);
  ctx.fillRect(-42, 12, 62, 4);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(-40, -6, 56, 12);

  // Cab windshield
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(28, -15, 13, 30);

  // Blue lightbar
  const flash = Math.floor(timeSec * 8) % 2 === 0;
  ctx.fillStyle = flash ? '#38bdf8' : '#1d4ed8';
  ctx.fillRect(19, -15, 6, 30);

  ctx.restore();

  ctx.fillStyle = isSelected ? '#fde68a' : '#fca5a5';
  ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    isSelected ? 'BOMBEROS (Activo)' : 'BOMBEROS',
    pos.x,
    pos.y - 34
  );
}

function drawStaticAmbulance(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number; angleDeg: number },
  timeSec: number,
  vehScale: number
) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(degToRad(pos.angleDeg));
  ctx.scale(vehScale, vehScale);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(-42, -17, 86, 36, 6);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(-44, -18, 88, 36, 6);
  ctx.fill();

  ctx.fillStyle = '#facc15';
  ctx.fillRect(-44, -18, 56, 5);
  ctx.fillRect(-44, 13, 56, 5);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, -14, 13, 28);

  const flash = Math.floor(timeSec * 7) % 2 === 0;
  ctx.fillStyle = flash ? '#38bdf8' : '#1d4ed8';
  ctx.fillRect(8, -14, 5, 28);

  ctx.restore();

  ctx.fillStyle = '#bae6fd';
  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OTRA AMBULANCIA', pos.x, pos.y - 30);
}

function drawCrashScene(
  ctx: CanvasRenderingContext2D,
  sc: ScenarioSpec,
  timeSec: number,
  vehScale: number
) {
  const drawWreck = (x: number, y: number, rotDeg: number, color: string, isTanker = false) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(degToRad(rotDeg));
    ctx.scale(vehScale, vehScale);

    ctx.fillStyle =
      sc.additionalHazard === 'FIRE'
        ? 'rgba(249, 115, 22, 0.22)'
        : sc.additionalHazard === 'HAZMAT'
          ? 'rgba(163, 230, 53, 0.2)'
          : 'rgba(239, 68, 68, 0.14)';
    ctx.beginPath();
    ctx.arc(0, 0, isTanker ? 72 : 56, 0, Math.PI * 2);
    ctx.fill();

    if (isTanker) {
      // ADR tanker truck
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.roundRect(-55, -18, 85, 36, 12);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(30, -16, 22, 32);
      // Orange ADR panel!
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(-20, -10, 26, 20);
      ctx.strokeRect(-20, -10, 26, 20);
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-34, -16, 68, 32, 6);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(5, -12, 12, 24);
      ctx.fillRect(-24, -11, 9, 22);
      ctx.fillStyle = '#334155';
      ctx.fillRect(26, -13, 8, 26);
    }

    const blink = Math.floor(timeSec * 3.5) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-33, -13, 4, 0, Math.PI * 2);
      ctx.arc(-33, 13, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Animated fire flames for FIRE_HAZARD
    if (sc.additionalHazard === 'FIRE') {
      const flicker = Math.sin(timeSec * 16) * 4;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(10, 0, 20 + flicker * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(12, -2, 11 - flicker * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  drawWreck(
    sc.crashPos.x,
    sc.crashPos.y,
    sc.roadType === 'ADR_HAZMAT' ? 28 : 18,
    '#dc2626',
    sc.roadType === 'ADR_HAZMAT'
  );
  if (sc.secondaryCrashPos) {
    drawWreck(sc.secondaryCrashPos.x, sc.secondaryCrashPos.y, -12, '#64748b', false);
  }

  // Rising smoke or toxic vapor
  for (let i = 0; i < 4; i++) {
    const phase = (timeSec * 0.55 + i * 0.25) % 1;
    ctx.fillStyle =
      sc.additionalHazard === 'HAZMAT'
        ? `rgba(163, 230, 53, ${(1 - phase) * 0.28})`
        : sc.additionalHazard === 'FIRE'
          ? `rgba(71, 85, 105, ${(1 - phase) * 0.45})`
          : `rgba(203, 213, 225, ${(1 - phase) * 0.2})`;
    ctx.beginPath();
    ctx.arc(
      sc.crashPos.x + 15 + phase * 22,
      sc.crashPos.y - phase * 32,
      10 + phase * 18,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.fillStyle =
    sc.additionalHazard === 'FIRE'
      ? '#fdba74'
      : sc.additionalHazard === 'HAZMAT'
        ? '#bef264'
        : '#fca5a5';
  ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    sc.additionalHazard === 'FIRE'
      ? 'VEHÍCULO INCENDIADO'
      : sc.additionalHazard === 'HAZMAT'
        ? 'CISTERNA ADR (MMPP)'
        : 'ACCIDENTE',
    sc.crashPos.x,
    sc.crashPos.y - 38
  );
}

function drawTrafficCar(
  ctx: CanvasRenderingContext2D,
  car: TrafficCar,
  isNight: boolean,
  vehScale: number
) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(degToRad(car.angle));
  ctx.scale(vehScale, vehScale);

  const beamAlpha = isNight ? 0.22 : 0.08;
  const beamGrad = ctx.createLinearGradient(25, 0, 110, 0);
  beamGrad.addColorStop(0, `rgba(254, 249, 195, ${beamAlpha})`);
  beamGrad.addColorStop(1, 'rgba(254, 249, 195, 0)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(26, -11);
  ctx.lineTo(110, -24);
  ctx.lineTo(110, 24);
  ctx.lineTo(26, 11);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-27, -13, 54, 26, 5);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(3, -10, 10, 20);

  if (car.braking) {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-28, -11, 3, 7);
    ctx.fillRect(-28, 4, 3, 7);
  }

  ctx.restore();
}

function drawDistanceMeasurement(
  ctx: CanvasRenderingContext2D,
  sc: ScenarioSpec,
  amb: AmbulancePlacement,
  source?: MovableVehicle,
  target?: { x: number; y: number },
  amb2?: MovableVehicle
) {
  const src = source || amb;
  const tgt = target || sc.crashPos;
  const upm = sc.unitsPerMeter || 10;
  const dist =
    target && target !== sc.crashPos
      ? Math.round((Math.hypot(src.x - tgt.x, src.y - tgt.y) / upm) * 10) / 10
      : source && source !== amb
        ? Math.round((Math.hypot(src.x - sc.crashPos.x, src.y - sc.crashPos.y) / upm) * 10) / 10
        : computeDistanceMeters(amb, sc);
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(src.x, src.y);
  ctx.lineTo(tgt.x, tgt.y);
  ctx.stroke();

  const mx = (src.x + tgt.x) / 2;
  const my = (src.y + tgt.y) / 2 - 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(mx - 38, my - 11, 76, 19);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    sc.unitsPerMeter <= 5 ? `${Math.round(dist)} m` : `${dist.toFixed(1)} m`,
    mx,
    my + 3
  );

  // If there is a second movable ambulance (or static fallback), draw neutral separation indicator
  const secondAmb = amb2 || sc.otherAmbulancePos;
  if (secondAmb) {
    const gap = amb2
      ? computeTwoAmbulanceGapMeters(amb, amb2, upm)
      : computeOtherAmbulanceDistanceMeters(amb, sc);
    if (gap !== null) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
      ctx.beginPath();
      ctx.moveTo(amb.x, amb.y + 26);
      ctx.lineTo(secondAmb.x, secondAmb.y + 26);
      ctx.stroke();

      const gx = (amb.x + secondAmb.x) / 2;
      const gy = (amb.y + secondAmb.y) / 2 + 40;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(gx - 42, gy - 11, 84, 18);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText(`Sep: ${gap.toFixed(1)} m`, gx, gy + 2);
    }
  }
  ctx.restore();
}

function drawPlayerAmbulance(
  ctx: CanvasRenderingContext2D,
  amb: AmbulancePlacement,
  sc: ScenarioSpec,
  timeSec: number,
  showHandles: boolean,
  vehScale: number
) {
  // Draw visible danger markers / triangles if hazardMarked is ON
  if (amb.hazardMarked) {
    ctx.save();
    ctx.translate(amb.x - 75 * vehScale, amb.y);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.lineTo(0, -8);
    ctx.lineTo(8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(75 * vehScale, 0, 74 * vehScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(amb.x, amb.y);

  if (showHandles) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.rotate(degToRad(amb.angleDeg));

  // Protected rear & right-side crew corridor when angled -25 to -50 toward median
  if (amb.angleDeg <= -25 && amb.angleDeg >= -50 && sc.arrivalPhase === 'FIRST_RESPONDER') {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-55 * vehScale, 16 * vehScale, 92 * vehScale, 32 * vehScale, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.scale(vehScale, vehScale);

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(-43, -17, 88, 38, 6);
  ctx.fill();

  // Chassis
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(-44, -18, 88, 36, 6);
  ctx.fill();

  ctx.fillStyle = '#facc15';
  ctx.fillRect(-44, -18, 56, 5);
  ctx.fillRect(-44, 13, 56, 5);

  // Rear doors
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-44, -14, 6, 28);

  // Cab windshield
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(16, -14, 13, 28, 3);
  ctx.fill();

  // Medical cross
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(-16, -3, 14, 6);
  ctx.fillRect(-12, -7, 6, 14);

  // All emergency & warning lights
  if (amb.lightsAllOn) {
    const flash = Math.floor(timeSec * 9) % 2 === 0;
    ctx.fillStyle = flash ? '#38bdf8' : '#1d4ed8';
    ctx.fillRect(8, -14, 5, 12);
    ctx.fillStyle = !flash ? '#38bdf8' : '#1d4ed8';
    ctx.fillRect(8, 2, 5, 12);

    ctx.fillStyle = flash ? 'rgba(56, 189, 248, 0.3)' : 'rgba(37, 99, 235, 0.22)';
    ctx.beginPath();
    ctx.arc(10, 0, 56, 0, Math.PI * 2);
    ctx.fill();

    if (Math.floor(timeSec * 3.5) % 2 === 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-43, -15, 4, 0, Math.PI * 2);
      ctx.arc(-43, 15, 4, 0, Math.PI * 2);
      ctx.arc(43, -15, 4, 0, Math.PI * 2);
      ctx.arc(43, 15, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Rotation handle at nose (unscaled so easy to grab)
  if (showHandles) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(46 * vehScale, 0);
    ctx.lineTo(66, 0);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(72, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(72, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawEvaluationOverlays(
  ctx: CanvasRenderingContext2D,
  sc: ScenarioSpec,
  amb: AmbulancePlacement,
  ev: EvaluationResult,
  timeSec: number
) {
  const iz = sc.idealZone;
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.fillRect(iz.xMin, iz.yMin, iz.xMax - iz.xMin, iz.yMax - iz.yMin);
  ctx.strokeRect(iz.xMin, iz.yMin, iz.xMax - iz.xMin, iz.yMax - iz.yMin);
  ctx.setLineDash([]);

  ctx.fillStyle = '#34d399';
  ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(iz.label || 'ZONA ÓPTIMA', (iz.xMin + iz.xMax) / 2, iz.yMin - 10);

  if (sc.idealSecondAmbulanceZone) {
    const iz2 = sc.idealSecondAmbulanceZone;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.fillRect(iz2.xMin, iz2.yMin, iz2.xMax - iz2.xMin, iz2.yMax - iz2.yMin);
    ctx.strokeRect(iz2.xMin, iz2.yMin, iz2.xMax - iz2.xMin, iz2.yMax - iz2.yMin);
    ctx.setLineDash([]);
    ctx.fillStyle = '#34d399';
    ctx.fillText(iz2.label || 'AMBULANCIA 2', (iz2.xMin + iz2.xMax) / 2, iz2.yMin - 10);
  }

  if (ev.hasSightlineHazard) {
    const pulse = 0.4 + Math.abs(Math.sin(timeSec * 5)) * 0.4;
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(amb.x, amb.y, 70, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAdverseWeather(ctx: CanvasRenderingContext2D, timeSec: number) {
  ctx.save();
  // Fog veil
  ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.fillRect(-200, -200, WORLD_W + 400, WORLD_H + 400);

  // Diagonal rain streaks
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.25)';
  ctx.lineWidth = 1.2;
  const shift = (timeSec * 520) % 120;
  for (let rx = -100; rx < WORLD_W + 150; rx += 55) {
    for (let ry = -50 + shift; ry < WORLD_H + 50; ry += 120) {
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 14, ry + 34);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawIdealGhostAmbulance(
  ctx: CanvasRenderingContext2D,
  sc: ScenarioSpec,
  vehScale: number,
  timeSec: number
) {
  const ideal = getIdealPlacementForScenario(sc);
  const ideal2 = getIdealSecondAmbulanceForScenario(sc);
  const pulse = 0.65 + Math.sin(timeSec * 4) * 0.2;

  const drawGhostBox = (
    x: number,
    y: number,
    angleDeg: number,
    w: number,
    h: number,
    label: string,
    colorHex: string,
    fillRgba: string
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(degToRad(angleDeg));
    ctx.scale(vehScale, vehScale);
    ctx.fillStyle = fillRgba;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 14, -7);
    ctx.lineTo(w / 2 - 2, 0);
    ctx.lineTo(w / 2 - 14, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(x - 86, y - 52, 172, 19);
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 86, y - 52, 172, 19);
    ctx.fillStyle = colorHex;
    ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 39);
    ctx.restore();
  };

  drawGhostBox(
    ideal.x,
    ideal.y,
    ideal.angleDeg,
    88,
    36,
    ideal2 ? `AMBULANCIA 1 IDEAL (${ideal.angleDeg}°)` : `AMBULANCIA IDEAL (${ideal.angleDeg}°)`,
    '#34d399',
    `rgba(16, 185, 129, ${0.28 * pulse})`
  );

  if (ideal2) {
    drawGhostBox(
      ideal2.x,
      ideal2.y,
      ideal2.angleDeg,
      88,
      36,
      `AMBULANCIA 2 IDEAL (${ideal2.angleDeg}°)`,
      '#34d399',
      `rgba(16, 185, 129, ${0.28 * pulse})`
    );
  }

  if (sc.isAdvancedDeployment) {
    const advIdeal = getIdealAdvancedForScenario(sc);
    drawGhostBox(
      advIdeal.fireTruck.x,
      advIdeal.fireTruck.y,
      advIdeal.fireTruck.angleDeg,
      96,
      38,
      'BOMBEROS IDEAL (5–10 m · -30°)',
      '#fb923c',
      `rgba(249, 115, 22, ${0.22 * pulse})`
    );
    advIdeal.police.forEach((p, i) => {
      drawGhostBox(
        p.x,
        p.y,
        p.angleDeg,
        68,
        30,
        advIdeal.police.length > 1 ? `POLICÍA ${i + 1} IDEAL` : 'POLICÍA IDEAL',
        '#60a5fa',
        `rgba(59, 130, 246, ${0.22 * pulse})`
      );
    });
  }
}
