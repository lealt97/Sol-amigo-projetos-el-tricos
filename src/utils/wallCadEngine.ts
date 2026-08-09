import type { FloorPlanWall } from '../types';

export interface CadPoint {
  x: number;
  y: number;
}

export type WallNodeKind =
  | 'end'
  | 'straight'
  | 'L'
  | 'corner'
  | 'T'
  | 'Y'
  | 'X'
  | 'multi';

export type WallBranchRole = 'start' | 'end' | 'through-forward' | 'through-backward';

export interface WallNodeBranch {
  wallId: string;
  role: WallBranchRole;
  anchor: CadPoint;
  direction: CadPoint;
  thicknessMeters: number;
}

export interface WallGraphNode {
  id: string;
  point: CadPoint;
  kind: WallNodeKind;
  branches: WallNodeBranch[];
  wallIds: string[];
  throughPairs: [WallNodeBranch, WallNodeBranch][];
}

export interface WallGraph {
  nodes: WallGraphNode[];
  adjacency: Map<string, Set<string>>;
  componentByWallId: Map<string, string[]>;
}

export interface WallNetworkIssue {
  code: 'ZERO_LENGTH' | 'DUPLICATE' | 'NEAR_MISS';
  wallIds: string[];
  message: string;
  point?: CadPoint;
}

export interface WallNetworkAnalysis {
  graph: WallGraph;
  componentCount: number;
  issues: WallNetworkIssue[];
}

export interface WallGraphOptions {
  defaultThicknessMeters?: number;
  nodeToleranceMeters?: number;
  contactToleranceMeters?: number;
  angularToleranceDeg?: number;
}

export const CAD_GEOMETRY_EPSILON_M = 1e-8;
export const CAD_NODE_TOLERANCE_M = 0.003; // 3 mm: topology, not cursor snap.
export const CAD_CONTACT_TOLERANCE_M = 0.004;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export const dot = (a: CadPoint, b: CadPoint) => a.x * b.x + a.y * b.y;
export const cross = (a: CadPoint, b: CadPoint) => a.x * b.y - a.y * b.x;

export const normalizeVector = (vector: CadPoint): CadPoint | null => {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= CAD_GEOMETRY_EPSILON_M) return null;
  return { x: vector.x / length, y: vector.y / length };
};

export interface SegmentProjection {
  point: CadPoint;
  t: number;
  distance: number;
}

export const projectPointToSegment = (
  point: CadPoint,
  start: CadPoint,
  end: CadPoint
): SegmentProjection => {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq <= CAD_GEOMETRY_EPSILON_M) {
    return { point: { ...start }, t: 0, distance: distance(point, start) };
  }
  const t = clamp(((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSq, 0, 1);
  const projected = { x: start.x + vx * t, y: start.y + vy * t };
  return { point: projected, t, distance: distance(point, projected) };
};

export interface SegmentIntersection {
  point: CadPoint;
  tA: number;
  tB: number;
}

/**
 * Robust finite-segment intersection. Collinear overlaps are intentionally resolved
 * through endpoint-on-segment contacts by buildWallGraph so there is never an arbitrary
 * "middle" intersection point for an overlapping pair.
 */
export const intersectSegments = (
  a1: CadPoint,
  a2: CadPoint,
  b1: CadPoint,
  b2: CadPoint,
  epsilon = CAD_GEOMETRY_EPSILON_M
): SegmentIntersection | null => {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y };
  const s = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denominator = cross(r, s);
  const qmp = { x: b1.x - a1.x, y: b1.y - a1.y };

  if (Math.abs(denominator) <= epsilon) return null;

  const tA = cross(qmp, s) / denominator;
  const tB = cross(qmp, r) / denominator;
  if (tA < -epsilon || tA > 1 + epsilon || tB < -epsilon || tB > 1 + epsilon) return null;

  const ta = clamp(tA, 0, 1);
  const tb = clamp(tB, 0, 1);
  return {
    point: { x: a1.x + r.x * ta, y: a1.y + r.y * ta },
    tA: ta,
    tB: tb,
  };
};

type CandidateParticipant = {
  wall: FloorPlanWall;
  role: 'start' | 'end' | 'through';
  anchor?: CadPoint;
};

type CandidateNode = {
  point: CadPoint;
  priority: number;
  participants: CandidateParticipant[];
};

const endpointKey = (wallId: string, role: 'start' | 'end') => `${wallId}:${role}`;

const wallStart = (wall: FloorPlanWall): CadPoint => ({ x: wall.x1Meters, y: wall.y1Meters });
const wallEnd = (wall: FloorPlanWall): CadPoint => ({ x: wall.x2Meters, y: wall.y2Meters });

const wallThickness = (wall: FloorPlanWall, fallback: number) =>
  Math.max(0.001, wall.thicknessMeters || fallback);

const participantKey = (participant: CandidateParticipant) => `${participant.wall.id}:${participant.role}`;

const mergeCandidate = (
  clusters: CandidateNode[],
  candidate: CandidateNode,
  tolerance: number
) => {
  const existing = clusters.find((item) => distance(item.point, candidate.point) <= tolerance);
  if (!existing) {
    clusters.push({
      point: { ...candidate.point },
      priority: candidate.priority,
      participants: [...candidate.participants],
    });
    return;
  }

  if (candidate.priority > existing.priority) {
    existing.point = { ...candidate.point };
    existing.priority = candidate.priority;
  }

  const keys = new Set(existing.participants.map(participantKey));
  for (const participant of candidate.participants) {
    const key = participantKey(participant);
    if (!keys.has(key)) {
      keys.add(key);
      existing.participants.push(participant);
    }
  }
};

const addEndpointContact = (
  candidates: CandidateNode[],
  connectedEndpoints: Set<string>,
  endpointWall: FloorPlanWall,
  endpointRole: 'start' | 'end',
  hostWall: FloorPlanWall,
  options: Required<Pick<WallGraphOptions, 'defaultThicknessMeters' | 'nodeToleranceMeters' | 'contactToleranceMeters'>>
) => {
  const point = endpointRole === 'start' ? wallStart(endpointWall) : wallEnd(endpointWall);
  const hostStart = wallStart(hostWall);
  const hostEnd = wallEnd(hostWall);
  const projection = projectPointToSegment(point, hostStart, hostEnd);

  // Endpoint-to-endpoint is handled separately. Here the host must genuinely continue
  // through the contact, which is what produces a T/fan node.
  if (projection.t <= options.nodeToleranceMeters || projection.t >= 1 - options.nodeToleranceMeters) return;

  const hostHalf = wallThickness(hostWall, options.defaultThicknessMeters) / 2;
  if (projection.distance > hostHalf + options.contactToleranceMeters) return;

  connectedEndpoints.add(endpointKey(endpointWall.id, endpointRole));
  candidates.push({
    // The logical topology node lives on the host center axis even when the rendered
    // branch endpoint is stored on a physical wall face.
    point: projection.point,
    priority: 30,
    participants: [
      { wall: endpointWall, role: endpointRole, anchor: point },
      { wall: hostWall, role: 'through', anchor: projection.point },
    ],
  });
};

const branchDirectionKey = (branch: WallNodeBranch) => {
  const angle = Math.atan2(branch.direction.y, branch.direction.x);
  return `${branch.wallId}:${Math.round(angle * 1e6)}`;
};

const classifyNode = (
  branches: WallNodeBranch[],
  angularToleranceDeg: number
): Pick<WallGraphNode, 'kind' | 'throughPairs'> => {
  if (branches.length <= 1) return { kind: 'end', throughPairs: [] };

  const angularTolerance = (angularToleranceDeg * Math.PI) / 180;
  const perpendicularTolerance = (8 * Math.PI) / 180;
  const oppositeThreshold = -Math.cos(angularTolerance);

  const throughCandidates: Array<{
    a: WallNodeBranch;
    b: WallNodeBranch;
    score: number;
  }> = [];

  for (let i = 0; i < branches.length; i += 1) {
    for (let j = i + 1; j < branches.length; j += 1) {
      const score = dot(branches[i].direction, branches[j].direction);
      if (score <= oppositeThreshold) {
        throughCandidates.push({ a: branches[i], b: branches[j], score });
      }
    }
  }
  throughCandidates.sort((a, b) => a.score - b.score);

  const pairedBranchKeys = new Set<string>();
  const throughPairs: [WallNodeBranch, WallNodeBranch][] = [];
  for (const candidate of throughCandidates) {
    const aKey = branchDirectionKey(candidate.a);
    const bKey = branchDirectionKey(candidate.b);
    if (pairedBranchKeys.has(aKey) || pairedBranchKeys.has(bKey)) continue;
    pairedBranchKeys.add(aKey);
    pairedBranchKeys.add(bKey);
    throughPairs.push([candidate.a, candidate.b]);
  }

  if (branches.length === 2) {
    if (throughPairs.length === 1) return { kind: 'straight', throughPairs };
    const absDot = Math.abs(dot(branches[0].direction, branches[1].direction));
    return {
      kind: absDot <= Math.sin(perpendicularTolerance) ? 'L' : 'corner',
      throughPairs: [],
    };
  }

  if (branches.length === 3) {
    return throughPairs.length >= 1
      ? { kind: 'T', throughPairs: [throughPairs[0]] }
      : { kind: 'Y', throughPairs: [] };
  }

  if (branches.length === 4 && throughPairs.length === 2) {
    return { kind: 'X', throughPairs };
  }

  return { kind: 'multi', throughPairs };
};

const createBranches = (
  node: CandidateNode,
  fallbackThickness: number,
  angularToleranceDeg: number
): WallGraphNode => {
  const branches: WallNodeBranch[] = [];

  for (const participant of node.participants) {
    const wall = participant.wall;
    const start = wallStart(wall);
    const end = wallEnd(wall);
    const thicknessMeters = wallThickness(wall, fallbackThickness);
    const wallVector = normalizeVector({ x: end.x - start.x, y: end.y - start.y });
    if (!wallVector) continue;

    if (participant.role === 'start' || participant.role === 'end') {
      const anchor = participant.anchor || (participant.role === 'start' ? start : end);
      const other = participant.role === 'start' ? end : start;
      const away = normalizeVector({ x: other.x - anchor.x, y: other.y - anchor.y });
      if (!away) continue;
      branches.push({
        wallId: wall.id,
        role: participant.role,
        anchor: { ...anchor },
        direction: away,
        thicknessMeters,
      });
      continue;
    }

    branches.push({
      wallId: wall.id,
      role: 'through-forward',
      anchor: { ...node.point },
      direction: wallVector,
      thicknessMeters,
    });
    branches.push({
      wallId: wall.id,
      role: 'through-backward',
      anchor: { ...node.point },
      direction: { x: -wallVector.x, y: -wallVector.y },
      thicknessMeters,
    });
  }

  // A pair can be discovered through both segment intersection and endpoint projection.
  // Collapse only truly duplicate wall+direction branches, never different walls.
  const deduped: WallNodeBranch[] = [];
  for (const branch of branches) {
    const duplicate = deduped.some((item) => {
      if (item.wallId !== branch.wallId) return false;
      return dot(item.direction, branch.direction) >= 1 - 1e-7;
    });
    if (!duplicate) deduped.push(branch);
  }

  const classified = classifyNode(deduped, angularToleranceDeg);
  const wallIds = Array.from(new Set(deduped.map((branch) => branch.wallId))).sort();
  const keyX = Math.round(node.point.x * 1e6);
  const keyY = Math.round(node.point.y * 1e6);

  return {
    id: `wallnode_${keyX}_${keyY}`,
    point: { ...node.point },
    kind: classified.kind,
    branches: deduped,
    wallIds,
    throughPairs: classified.throughPairs,
  };
};

export const buildWallGraph = (
  walls: FloorPlanWall[],
  options: WallGraphOptions = {}
): WallGraph => {
  const defaultThicknessMeters = options.defaultThicknessMeters ?? 0.15;
  const nodeToleranceMeters = options.nodeToleranceMeters ?? CAD_NODE_TOLERANCE_M;
  const contactToleranceMeters = options.contactToleranceMeters ?? CAD_CONTACT_TOLERANCE_M;
  const angularToleranceDeg = options.angularToleranceDeg ?? 3;

  const candidates: CandidateNode[] = [];
  const connectedEndpoints = new Set<string>();

  for (let i = 0; i < walls.length; i += 1) {
    const a = walls[i];
    const aStart = wallStart(a);
    const aEnd = wallEnd(a);
    for (let j = i + 1; j < walls.length; j += 1) {
      const b = walls[j];
      const bStart = wallStart(b);
      const bEnd = wallEnd(b);

      // Exact/shared endpoint nodes.
      for (const [aRole, aPoint] of [
        ['start', aStart],
        ['end', aEnd],
      ] as const) {
        for (const [bRole, bPoint] of [
          ['start', bStart],
          ['end', bEnd],
        ] as const) {
          if (distance(aPoint, bPoint) <= nodeToleranceMeters) {
            connectedEndpoints.add(endpointKey(a.id, aRole));
            connectedEndpoints.add(endpointKey(b.id, bRole));
            candidates.push({
              point: {
                x: (aPoint.x + bPoint.x) / 2,
                y: (aPoint.y + bPoint.y) / 2,
              },
              priority: 40,
              participants: [
                { wall: a, role: aRole, anchor: aPoint },
                { wall: b, role: bRole, anchor: bPoint },
              ],
            });
          }
        }
      }

      addEndpointContact(
        candidates,
        connectedEndpoints,
        a,
        'start',
        b,
        { defaultThicknessMeters, nodeToleranceMeters, contactToleranceMeters }
      );
      addEndpointContact(
        candidates,
        connectedEndpoints,
        a,
        'end',
        b,
        { defaultThicknessMeters, nodeToleranceMeters, contactToleranceMeters }
      );
      addEndpointContact(
        candidates,
        connectedEndpoints,
        b,
        'start',
        a,
        { defaultThicknessMeters, nodeToleranceMeters, contactToleranceMeters }
      );
      addEndpointContact(
        candidates,
        connectedEndpoints,
        b,
        'end',
        a,
        { defaultThicknessMeters, nodeToleranceMeters, contactToleranceMeters }
      );

      // Center-axis crossing. This covers +, X and diagonal crossings even if neither
      // segment has an endpoint at the junction.
      const intersection = intersectSegments(aStart, aEnd, bStart, bEnd);
      if (intersection) {
        const roleFor = (t: number): 'start' | 'end' | 'through' => {
          if (t <= nodeToleranceMeters) return 'start';
          if (t >= 1 - nodeToleranceMeters) return 'end';
          return 'through';
        };
        const aRole = roleFor(intersection.tA);
        const bRole = roleFor(intersection.tB);
        if (aRole !== 'through') connectedEndpoints.add(endpointKey(a.id, aRole));
        if (bRole !== 'through') connectedEndpoints.add(endpointKey(b.id, bRole));
        candidates.push({
          point: intersection.point,
          priority: 50,
          participants: [
            { wall: a, role: aRole, anchor: intersection.point },
            { wall: b, role: bRole, anchor: intersection.point },
          ],
        });
      }
    }
  }

  // Every unconnected endpoint remains a first-class node. This is useful for future
  // trim/extend operations, diagnostics and explicit node grips.
  for (const wall of walls) {
    for (const [role, point] of [
      ['start', wallStart(wall)],
      ['end', wallEnd(wall)],
    ] as const) {
      if (connectedEndpoints.has(endpointKey(wall.id, role))) continue;
      candidates.push({
        point,
        priority: 10,
        participants: [{ wall, role, anchor: point }],
      });
    }
  }

  const clusters: CandidateNode[] = [];
  for (const candidate of candidates) mergeCandidate(clusters, candidate, nodeToleranceMeters);

  const nodes = clusters.map((cluster) =>
    createBranches(cluster, defaultThicknessMeters, angularToleranceDeg)
  );

  const adjacency = new Map<string, Set<string>>(walls.map((wall) => [wall.id, new Set<string>()]));
  for (const node of nodes) {
    if (node.wallIds.length < 2) continue;
    for (let i = 0; i < node.wallIds.length; i += 1) {
      for (let j = i + 1; j < node.wallIds.length; j += 1) {
        adjacency.get(node.wallIds[i])?.add(node.wallIds[j]);
        adjacency.get(node.wallIds[j])?.add(node.wallIds[i]);
      }
    }
  }

  const componentByWallId = new Map<string, string[]>();
  const globallyVisited = new Set<string>();
  for (const wall of walls) {
    if (globallyVisited.has(wall.id)) continue;
    const queue = [wall.id];
    const component = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (component.has(current)) continue;
      component.add(current);
      globallyVisited.add(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (!component.has(neighbor)) queue.push(neighbor);
      });
    }
    const ids = Array.from(component).sort();
    ids.forEach((id) => componentByWallId.set(id, ids));
  }

  return { nodes, adjacency, componentByWallId };
};

export const getConnectedWallIds = (graph: WallGraph, seedWallId: string): string[] =>
  graph.componentByWallId.get(seedWallId) || [];

export const findWallNodeNearPoint = (
  graph: WallGraph,
  point: CadPoint,
  maxDistanceMeters = CAD_NODE_TOLERANCE_M
): WallGraphNode | null => {
  let best: WallGraphNode | null = null;
  let bestDistance = maxDistanceMeters;
  for (const node of graph.nodes) {
    const d = distance(node.point, point);
    if (d <= bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
};

export const analyzeWallNetwork = (
  walls: FloorPlanWall[],
  options: WallGraphOptions = {}
): WallNetworkAnalysis => {
  const graph = buildWallGraph(walls, options);
  const issues: WallNetworkIssue[] = [];
  const tolerance = options.nodeToleranceMeters ?? CAD_NODE_TOLERANCE_M;
  const fallbackThickness = options.defaultThicknessMeters ?? 0.15;

  for (const wall of walls) {
    if (distance(wallStart(wall), wallEnd(wall)) <= tolerance) {
      issues.push({
        code: 'ZERO_LENGTH',
        wallIds: [wall.id],
        message: 'Parede com comprimento nulo ou abaixo da tolerância CAD.',
        point: wallStart(wall),
      });
    }
  }

  for (let i = 0; i < walls.length; i += 1) {
    const a = walls[i];
    for (let j = i + 1; j < walls.length; j += 1) {
      const b = walls[j];
      const sameDirection =
        distance(wallStart(a), wallStart(b)) <= tolerance &&
        distance(wallEnd(a), wallEnd(b)) <= tolerance;
      const reverseDirection =
        distance(wallStart(a), wallEnd(b)) <= tolerance &&
        distance(wallEnd(a), wallStart(b)) <= tolerance;
      if (sameDirection || reverseDirection) {
        issues.push({
          code: 'DUPLICATE',
          wallIds: [a.id, b.id],
          message: 'Paredes duplicadas ocupam o mesmo segmento.',
          point: {
            x: (a.x1Meters + a.x2Meters) / 2,
            y: (a.y1Meters + a.y2Meters) / 2,
          },
        });
      }
    }
  }

  // Detect endpoint near-misses outside the physical host body. These are visually easy
  // to miss and are a common source of "almost connected" CAD drawings.
  const nearMissRadius = Math.max(0.02, tolerance * 4);
  for (const wall of walls) {
    for (const [role, point] of [
      ['start', wallStart(wall)],
      ['end', wallEnd(wall)],
    ] as const) {
      const alreadyConnected = graph.nodes.some(
        (node) => node.wallIds.length > 1 && node.branches.some((branch) => branch.wallId === wall.id && branch.role === role)
      );
      if (alreadyConnected) continue;

      for (const host of walls) {
        if (host.id === wall.id) continue;
        const projection = projectPointToSegment(point, wallStart(host), wallEnd(host));
        const hostHalf = wallThickness(host, fallbackThickness) / 2;
        if (
          projection.t > tolerance &&
          projection.t < 1 - tolerance &&
          projection.distance > hostHalf + (options.contactToleranceMeters ?? CAD_CONTACT_TOLERANCE_M) &&
          projection.distance <= hostHalf + nearMissRadius
        ) {
          issues.push({
            code: 'NEAR_MISS',
            wallIds: [wall.id, host.id],
            message: 'Extremidade muito próxima de outra parede, mas sem contato geométrico.',
            point,
          });
          break;
        }
      }
    }
  }

  const componentKeys = new Set<string>();
  graph.componentByWallId.forEach((ids) => componentKeys.add(ids.join('|')));

  return {
    graph,
    componentCount: componentKeys.size,
    issues,
  };
};

export const wallNodeLabel = (node: WallGraphNode): string => {
  switch (node.kind) {
    case 'end':
      return 'ponta';
    case 'straight':
      return 'reta';
    case 'L':
      return 'L';
    case 'corner':
      return 'angular';
    case 'T':
      return 'T';
    case 'Y':
      return 'Y';
    case 'X':
      return '+';
    case 'multi':
      return node.branches.length >= 5 ? '*' : 'multi';
  }
};


export interface WallPrecisionOptions {
  lockedLengthMeters?: number | null;
  lockedAngleDeg?: number | null;
  polarIncrementDeg?: number | null;
}

export interface WallPrecisionResult {
  point: CadPoint;
  lengthMeters: number;
  angleDeg: number;
  constrainedLength: boolean;
  constrainedAngle: boolean;
}

const normalizeAngleDeg = (angleDeg: number) => {
  const normalized = angleDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

/**
 * Applies CAD-style hard length/angle constraints. Angles follow the conventional
 * architectural coordinate system: 0° = right, 90° = up, 180° = left, 270° = down.
 */
export const applyWallPrecisionConstraints = (
  start: CadPoint,
  rawPoint: CadPoint,
  options: WallPrecisionOptions = {}
): WallPrecisionResult => {
  const dx = rawPoint.x - start.x;
  const dy = rawPoint.y - start.y;
  const rawLength = Math.hypot(dx, dy);
  const rawAngle = normalizeAngleDeg((Math.atan2(-dy, dx) * 180) / Math.PI);

  const hasLockedAngle =
    Number.isFinite(options.lockedAngleDeg) && options.lockedAngleDeg !== null;
  const polarIncrement =
    Number.isFinite(options.polarIncrementDeg) && (options.polarIncrementDeg || 0) > 0
      ? Math.abs(options.polarIncrementDeg as number)
      : 0;
  const angleDeg = hasLockedAngle
    ? normalizeAngleDeg(options.lockedAngleDeg as number)
    : polarIncrement > 0
      ? normalizeAngleDeg(Math.round(rawAngle / polarIncrement) * polarIncrement)
      : rawAngle;

  const hasLockedLength =
    Number.isFinite(options.lockedLengthMeters) && (options.lockedLengthMeters || 0) > 0;
  const lengthMeters = hasLockedLength
    ? Math.abs(options.lockedLengthMeters as number)
    : rawLength;
  const angleRad = (angleDeg * Math.PI) / 180;

  return {
    point: {
      x: start.x + Math.cos(angleRad) * lengthMeters,
      y: start.y - Math.sin(angleRad) * lengthMeters,
    },
    lengthMeters,
    angleDeg,
    constrainedLength: hasLockedLength,
    constrainedAngle: hasLockedAngle || polarIncrement > 0,
  };
};

export interface ClosedWallPerimeter {
  id: string;
  wallIds: string[];
  points: CadPoint[];
  areaSquareMeters: number;
  perimeterMeters: number;
  centroid: CadPoint;
}

const polygonAreaAndCentroid = (points: CadPoint[]) => {
  let twiceArea = 0;
  let centroidXTimes6Area = 0;
  let centroidYTimes6Area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const term = current.x * next.y - next.x * current.y;
    twiceArea += term;
    centroidXTimes6Area += (current.x + next.x) * term;
    centroidYTimes6Area += (current.y + next.y) * term;
  }
  const signedArea = twiceArea / 2;
  if (Math.abs(signedArea) <= CAD_GEOMETRY_EPSILON_M) {
    return {
      area: 0,
      centroid: {
        x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
        y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
      },
    };
  }
  return {
    area: Math.abs(signedArea),
    centroid: {
      x: centroidXTimes6Area / (6 * signedArea),
      y: centroidYTimes6Area / (6 * signedArea),
    },
  };
};

/**
 * Detects simple closed wall-only components (polygons where every node has degree 2).
 * It deliberately does not invent room faces inside branched/T networks; those require
 * a later planar-face solver. The result is therefore deterministic and safe.
 */
export const findClosedWallPerimeters = (
  walls: FloorPlanWall[],
  options: WallGraphOptions = {}
): ClosedWallPerimeter[] => {
  const graph = buildWallGraph(walls, options);
  const wallById = new Map(walls.map((wall) => [wall.id, wall] as const));
  const nodeByEndpoint = new Map<string, WallGraphNode>();

  for (const node of graph.nodes) {
    for (const branch of node.branches) {
      if (branch.role === 'start' || branch.role === 'end') {
        nodeByEndpoint.set(`${branch.wallId}:${branch.role}`, node);
      }
    }
  }

  const seenComponents = new Set<string>();
  const result: ClosedWallPerimeter[] = [];

  graph.componentByWallId.forEach((wallIds) => {
    const key = wallIds.join('|');
    if (seenComponents.has(key)) return;
    seenComponents.add(key);
    if (wallIds.length < 3) return;

    type Edge = { wallId: string; a: string; b: string };
    const edges: Edge[] = [];
    const nodeMap = new Map<string, WallGraphNode>();
    for (const wallId of wallIds) {
      const startNode = nodeByEndpoint.get(`${wallId}:start`);
      const endNode = nodeByEndpoint.get(`${wallId}:end`);
      if (!startNode || !endNode || startNode.id === endNode.id) return;
      edges.push({ wallId, a: startNode.id, b: endNode.id });
      nodeMap.set(startNode.id, startNode);
      nodeMap.set(endNode.id, endNode);
    }
    if (edges.length !== wallIds.length) return;

    const incident = new Map<string, Edge[]>();
    edges.forEach((edge) => {
      incident.set(edge.a, [...(incident.get(edge.a) || []), edge]);
      incident.set(edge.b, [...(incident.get(edge.b) || []), edge]);
    });
    if (Array.from(incident.values()).some((items) => items.length !== 2)) return;
    if (incident.size !== edges.length) return;

    const firstEdge = edges[0];
    const startNodeId = firstEdge.a;
    let currentNodeId = startNodeId;
    let previousWallId: string | null = null;
    const usedWalls = new Set<string>();
    const orderedPoints: CadPoint[] = [];

    for (let guard = 0; guard <= edges.length; guard += 1) {
      const node = nodeMap.get(currentNodeId);
      if (!node) return;
      orderedPoints.push({ ...node.point });
      const choices = incident.get(currentNodeId) || [];
      const nextEdge = choices.find((edge) => edge.wallId !== previousWallId && !usedWalls.has(edge.wallId));
      if (!nextEdge) break;
      usedWalls.add(nextEdge.wallId);
      previousWallId = nextEdge.wallId;
      currentNodeId = nextEdge.a === currentNodeId ? nextEdge.b : nextEdge.a;
      if (currentNodeId === startNodeId) break;
    }

    if (currentNodeId !== startNodeId || usedWalls.size !== edges.length) return;
    if (orderedPoints.length < 3) return;

    const { area, centroid } = polygonAreaAndCentroid(orderedPoints);
    if (area <= CAD_GEOMETRY_EPSILON_M) return;
    const perimeterMeters = wallIds.reduce((sum, wallId) => {
      const wall = wallById.get(wallId);
      return wall
        ? sum + Math.hypot(wall.x2Meters - wall.x1Meters, wall.y2Meters - wall.y1Meters)
        : sum;
    }, 0);

    result.push({
      id: `perimeter_${wallIds.join('_')}`,
      wallIds: [...wallIds],
      points: orderedPoints,
      areaSquareMeters: area,
      perimeterMeters,
      centroid,
    });
  });

  return result.sort((a, b) => b.areaSquareMeters - a.areaSquareMeters);
};
