from pathlib import Path

engine_path = Path('src/utils/wallCadEngine.ts')
engine = engine_path.read_text()

if 'export interface ClosedWallFace' not in engine:
    engine += r'''

export interface ClosedWallFace {
  id: string;
  wallIds: string[];
  axisPoints: CadPoint[];
  clearPoints: CadPoint[];
  axisAreaSquareMeters: number;
  clearAreaSquareMeters: number;
  axisPerimeterMeters: number;
  clearPerimeterMeters: number;
  centroid: CadPoint;
}

type PlanarAtomicEdge = {
  id: string;
  a: string;
  b: string;
  wallId: string;
  thicknessMeters: number;
};

const signedPolygonArea = (points: CadPoint[]) => {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
};

const polygonPerimeter = (points: CadPoint[]) =>
  points.reduce(
    (sum, point, index) => sum + distance(point, points[(index + 1) % points.length]),
    0
  );

const intersectInfiniteLines = (
  a: CadPoint,
  aDir: CadPoint,
  b: CadPoint,
  bDir: CadPoint
): CadPoint | null => {
  const denominator = cross(aDir, bDir);
  if (Math.abs(denominator) <= 1e-9) return null;
  const rel = { x: b.x - a.x, y: b.y - a.y };
  const t = cross(rel, bDir) / denominator;
  return { x: a.x + aDir.x * t, y: a.y + aDir.y * t };
};

const clearPolygonFromBoundary = (
  points: CadPoint[],
  edgeThicknesses: number[]
): CadPoint[] => {
  if (points.length < 3 || edgeThicknesses.length !== points.length) return [];

  const offsetLines = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const direction = normalizeVector({ x: next.x - point.x, y: next.y - point.y });
    if (!direction) return null;
    // Positive face cycles run clockwise in screen coordinates (Y down), therefore the
    // interior lies on the visual right side: right normal = (-uy, ux).
    const rightNormal = { x: -direction.y, y: direction.x };
    const offset = Math.max(0.001, edgeThicknesses[index]) / 2;
    return {
      origin: {
        x: point.x + rightNormal.x * offset,
        y: point.y + rightNormal.y * offset,
      },
      direction,
      rightNormal,
      offset,
    };
  });
  if (offsetLines.some((line) => !line)) return [];

  const clearPoints: CadPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = offsetLines[(index - 1 + points.length) % points.length]!;
    const current = offsetLines[index]!;
    const intersection = intersectInfiniteLines(
      previous.origin,
      previous.direction,
      current.origin,
      current.direction
    );
    if (intersection) {
      // Refuse pathological long miters at nearly parallel/re-entrant edges.
      const maxOffset = Math.max(previous.offset, current.offset);
      if (distance(intersection, points[index]) <= Math.max(1, maxOffset * 12)) {
        clearPoints.push(intersection);
        continue;
      }
    }
    clearPoints.push({
      x: points[index].x + (previous.rightNormal.x * previous.offset + current.rightNormal.x * current.offset) / 2,
      y: points[index].y + (previous.rightNormal.y * previous.offset + current.rightNormal.y * current.offset) / 2,
    });
  }
  return clearPoints;
};

/**
 * Extracts bounded faces from the custom-wall planar graph. Unlike the simple-perimeter
 * helper, this keeps working after internal partitions, T junctions and center crossings.
 * Every wall is virtually split at logical graph nodes for topology only; persisted wall
 * objects remain untouched.
 */
export const findClosedWallFaces = (
  walls: FloorPlanWall[],
  options: WallGraphOptions = {}
): ClosedWallFace[] => {
  if (walls.length < 3) return [];
  const graph = buildWallGraph(walls, options);
  const defaultThicknessMeters = options.defaultThicknessMeters ?? 0.15;
  const nodeToleranceMeters = options.nodeToleranceMeters ?? CAD_NODE_TOLERANCE_M;
  const vertexTolerance = Math.max(1e-6, nodeToleranceMeters / 10);

  const vertices = new Map<string, CadPoint>();
  const vertexKey = (point: CadPoint) => {
    const key = `${Math.round(point.x / vertexTolerance)}:${Math.round(point.y / vertexTolerance)}`;
    if (!vertices.has(key)) vertices.set(key, { ...point });
    return key;
  };

  const atomicEdges: PlanarAtomicEdge[] = [];
  const edgeKeySet = new Set<string>();

  for (const wall of walls) {
    const start = wallStart(wall);
    const end = wallEnd(wall);
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSq = vx * vx + vy * vy;
    const length = Math.sqrt(lengthSq);
    if (length <= CAD_GEOMETRY_EPSILON_M) continue;

    const half = wallThickness(wall, defaultThicknessMeters) / 2;
    const extensionT = (half + (options.contactToleranceMeters ?? CAD_CONTACT_TOLERANCE_M) + 0.01) / length;
    const splitTs = [0, 1];
    for (const node of graph.nodes) {
      if (!node.wallIds.includes(wall.id)) continue;
      const t = ((node.point.x - start.x) * vx + (node.point.y - start.y) * vy) / lengthSq;
      const projected = { x: start.x + vx * t, y: start.y + vy * t };
      if (distance(projected, node.point) > Math.max(0.006, nodeToleranceMeters * 2)) continue;
      if (t >= -extensionT && t <= 1 + extensionT) splitTs.push(t);
    }

    splitTs.sort((a, b) => a - b);
    const uniqueTs = splitTs.filter((value, index) =>
      index === 0 || Math.abs(value - splitTs[index - 1]) * length > vertexTolerance
    );

    for (let index = 0; index < uniqueTs.length - 1; index += 1) {
      const t1 = uniqueTs[index];
      const t2 = uniqueTs[index + 1];
      if ((t2 - t1) * length <= vertexTolerance) continue;
      const p1 = { x: start.x + vx * t1, y: start.y + vy * t1 };
      const p2 = { x: start.x + vx * t2, y: start.y + vy * t2 };
      const a = vertexKey(p1);
      const b = vertexKey(p2);
      if (a === b) continue;
      const undirected = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edgeKeySet.has(undirected)) continue;
      edgeKeySet.add(undirected);
      atomicEdges.push({
        id: `edge_${atomicEdges.length}`,
        a,
        b,
        wallId: wall.id,
        thicknessMeters: wallThickness(wall, defaultThicknessMeters),
      });
    }
  }

  const adjacency = new Map<string, PlanarAtomicEdge[]>();
  atomicEdges.forEach((edge) => {
    adjacency.set(edge.a, [...(adjacency.get(edge.a) || []), edge]);
    adjacency.set(edge.b, [...(adjacency.get(edge.b) || []), edge]);
  });

  const sortedNeighbors = new Map<string, string[]>();
  adjacency.forEach((edges, key) => {
    const point = vertices.get(key)!;
    const neighbors = Array.from(new Set(edges.map((edge) => edge.a === key ? edge.b : edge.a)));
    neighbors.sort((leftKey, rightKey) => {
      const left = vertices.get(leftKey)!;
      const right = vertices.get(rightKey)!;
      const leftAngle = Math.atan2(left.y - point.y, left.x - point.x);
      const rightAngle = Math.atan2(right.y - point.y, right.x - point.x);
      return leftAngle - rightAngle;
    });
    sortedNeighbors.set(key, neighbors);
  });

  const edgeByPair = new Map<string, PlanarAtomicEdge>();
  atomicEdges.forEach((edge) => {
    edgeByPair.set(`${edge.a}>${edge.b}`, edge);
    edgeByPair.set(`${edge.b}>${edge.a}`, edge);
  });

  const visitedDirected = new Set<string>();
  const rawFaces: Array<{
    vertexKeys: string[];
    edges: PlanarAtomicEdge[];
  }> = [];

  for (const edge of atomicEdges) {
    for (const [startA, startB] of [[edge.a, edge.b], [edge.b, edge.a]] as const) {
      const startDirected = `${startA}>${startB}`;
      if (visitedDirected.has(startDirected)) continue;

      const vertexKeys: string[] = [];
      const faceEdges: PlanarAtomicEdge[] = [];
      let u = startA;
      let v = startB;
      let closed = False as unknown as boolean;

      for (let guard = 0; guard < atomicEdges.length * 4 + 8; guard += 1) {
        const directed = `${u}>${v}`;
        if (visitedDirected.has(directed) && directed !== startDirected) break;
        visitedDirected.add(directed);
        vertexKeys.push(u);
        const currentEdge = edgeByPair.get(directed);
        if (!currentEdge) break;
        faceEdges.push(currentEdge);

        const neighbors = sortedNeighbors.get(v) || [];
        const reverseIndex = neighbors.indexOf(u);
        if (reverseIndex < 0 || neighbors.length < 2) break;
        const next = neighbors[(reverseIndex - 1 + neighbors.length) % neighbors.length];
        u = v;
        v = next;
        if (u === startA && v === startB) {
          closed = true;
          break;
        }
      }

      if (closed && vertexKeys.length >= 3 && faceEdges.length === vertexKeys.length) {
        rawFaces.push({ vertexKeys, edges: faceEdges });
      }
    }
  }

  const faces: ClosedWallFace[] = [];
  const canonicalFaces = new Set<string>();
  for (const rawFace of rawFaces) {
    const axisPoints = rawFace.vertexKeys.map((key) => vertices.get(key)!).filter(Boolean);
    const signedArea = signedPolygonArea(axisPoints);
    // With screen-style coordinates (Y grows down) and the right-face walker above,
    // bounded interior faces are clockwise and therefore positive. The exterior is negative.
    if (signedArea <= 0.005) continue;

    const canonical = [...rawFace.vertexKeys].sort().join('|');
    if (canonicalFaces.has(canonical)) continue;
    canonicalFaces.add(canonical);

    const edgeThicknesses = rawFace.edges.map((edge) => edge.thicknessMeters);
    const clearPoints = clearPolygonFromBoundary(axisPoints, edgeThicknesses);
    const clearGeometry = clearPoints.length >= 3
      ? polygonAreaAndCentroid(clearPoints)
      : { area: 0, centroid: polygonAreaAndCentroid(axisPoints).centroid };
    const axisGeometry = polygonAreaAndCentroid(axisPoints);
    const wallIds = Array.from(new Set(rawFace.edges.map((edge) => edge.wallId))).sort();

    faces.push({
      id: `wallface_${faces.length}_${wallIds.join('_')}`,
      wallIds,
      axisPoints: axisPoints.map((point) => ({ ...point })),
      clearPoints: clearPoints.map((point) => ({ ...point })),
      axisAreaSquareMeters: axisGeometry.area,
      clearAreaSquareMeters: clearGeometry.area,
      axisPerimeterMeters: polygonPerimeter(axisPoints),
      clearPerimeterMeters: clearPoints.length >= 3 ? polygonPerimeter(clearPoints) : 0,
      centroid: clearGeometry.centroid,
    });
  }

  return faces.sort((a, b) => {
    if (Math.abs(b.clearAreaSquareMeters - a.clearAreaSquareMeters) > 1e-9) {
      return b.clearAreaSquareMeters - a.clearAreaSquareMeters;
    }
    return a.id.localeCompare(b.id);
  });
};
'''.replace('False as unknown as boolean', 'false')
    engine_path.write_text(engine)

reg_path = Path('scripts/wall-cad-regression.ts')
reg = reg_path.read_text()
if 'findClosedWallFaces' not in reg:
    reg = reg.replace(
        '  findClosedWallPerimeters,\n',
        '  findClosedWallPerimeters,\n  findClosedWallFaces,\n',
        1,
    )
if '17 cenários críticos' not in reg:
    marker = "console.log('wall-cad-regression: 13 cenários críticos passaram');"
    extra = r'''
// 14) Uma divisória interna transforma um perímetro em duas faces, sem perder os ambientes.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
    wall('partition', 2, 0, 2, 3),
  ];
  const faces = findClosedWallFaces(walls);
  assert.equal(faces.length, 2);
  assert.ok(faces.every((face) => Math.abs(face.axisAreaSquareMeters - 6) < 1e-8));
  assert.ok(faces.every((face) => face.clearAreaSquareMeters > 5 && face.clearAreaSquareMeters < 6));
}

// 15) Divisória armazenada nas faces físicas superior/inferior ainda fecha duas faces lógicas.
{
  const walls = [
    wall('top', 0, 0, 4, 0, 0.15),
    wall('right', 4, 0, 4, 3, 0.15),
    wall('bottom', 4, 3, 0, 3, 0.15),
    wall('left', 0, 3, 0, 0, 0.15),
    wall('partition', 2, 0.075, 2, 2.925, 0.15),
  ];
  const faces = findClosedWallFaces(walls);
  assert.equal(faces.length, 2);
  assert.ok(Math.abs(faces.reduce((sum, face) => sum + face.axisAreaSquareMeters, 0) - 12) < 1e-8);
}

// 16) Cruz de duas divisórias dentro do retângulo gera quatro ambientes fechados.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
    wall('vertical', 2, 0, 2, 3),
    wall('horizontal', 0, 1.5, 4, 1.5),
  ];
  const faces = findClosedWallFaces(walls);
  assert.equal(faces.length, 4);
  assert.ok(faces.every((face) => Math.abs(face.axisAreaSquareMeters - 3) < 1e-8));
}

// 17) Rede aberta não produz faces falsas.
{
  const walls = [
    wall('a', 0, 0, 3, 0),
    wall('b', 3, 0, 3, 2),
    wall('c', 3, 2, 1, 2),
  ];
  assert.equal(findClosedWallFaces(walls).length, 0);
}

console.log('wall-cad-regression: 17 cenários críticos passaram');
'''
    if marker not in reg:
        raise SystemExit('13-scenario regression marker not found')
    reg = reg.replace(marker, extra, 1)
reg_path.write_text(reg)

editor_path = Path('src/components/FloorPlanEditor.tsx')
text = editor_path.read_text()

if 'findClosedWallFaces,' not in text:
    text = text.replace(
        '  findClosedWallPerimeters,\n',
        '  findClosedWallPerimeters,\n  findClosedWallFaces,\n',
        1,
    )

old_memo = '''  const closedWallPerimeters = useMemo(
    () => findClosedWallPerimeters(floorPlanWalls, { defaultThicknessMeters: wallThicknessMeters }),
    [floorPlanWalls, wallThicknessMeters]
  );
'''
new_memo = old_memo + '''  const closedWallFaces = useMemo(
    () => findClosedWallFaces(floorPlanWalls, { defaultThicknessMeters: wallThicknessMeters }),
    [floorPlanWalls, wallThicknessMeters]
  );
'''
if old_memo not in text:
    raise SystemExit('closed perimeter memo not found')
text = text.replace(old_memo, new_memo, 1)

old_badge = '''              CAD: {wallGraph.nodes.filter((node) => node.wallIds.length >= 2).length} nós •{' '}
              {wallCadAnalysis.componentCount} rede(s) • {closedWallPerimeters.length} perímetro(s) fechado(s) •{' '}
              {closedWallPerimeters.length > 0
                ? `${closedWallPerimeters.reduce((sum, perimeter) => sum + perimeter.areaSquareMeters, 0).toFixed(2)} m² • `
                : ''}
              {wallCadAnalysis.issues.length === 0 ? 'íntegro' : `${wallCadAnalysis.issues.length} alerta(s)`}
'''
new_badge = '''              CAD: {wallGraph.nodes.filter((node) => node.wallIds.length >= 2).length} nós •{' '}
              {wallCadAnalysis.componentCount} rede(s) • {closedWallFaces.length} ambiente(s) fechado(s) •{' '}
              {closedWallFaces.length > 0
                ? `${closedWallFaces.reduce((sum, face) => sum + face.clearAreaSquareMeters, 0).toFixed(2)} m² livres • `
                : closedWallPerimeters.length > 0
                  ? `${closedWallPerimeters.length} perímetro(s) simples • `
                  : ''}
              {wallCadAnalysis.issues.length === 0 ? 'íntegro' : `${wallCadAnalysis.issues.length} alerta(s)`}
'''
if old_badge not in text:
    raise SystemExit('CAD badge not found')
text = text.replace(old_badge, new_badge, 1)

old_render_start = '''              {/* Closed wall-only perimeters detected by the CAD graph. */}
              {showDimensions && closedWallPerimeters.map((perimeter) => {
                const cx = perimeter.centroid.x * scalePxPerMeter;
                const cy = perimeter.centroid.y * scalePxPerMeter;
                return (
                  <g key={perimeter.id} transform={`translate(${cx}, ${cy})`} pointerEvents="none">
                    <rect x="-62" y="-13" width="124" height="26" fill="white" fillOpacity="0.9" stroke="#0f766e" strokeWidth="1" />
                    <text x="0" y="-1" textAnchor="middle" fill="#115e59" fontSize="9" fontWeight="black">
                      PERÍMETRO FECHADO
                    </text>
                    <text x="0" y="9" textAnchor="middle" fill="#115e59" fontSize="9" fontWeight="bold">
                      {perimeter.areaSquareMeters.toFixed(2)} m² • P {perimeter.perimeterMeters.toFixed(2)} m
                    </text>
                  </g>
                );
              })}
'''
new_render = '''              {/* Bounded planar faces: internal partitions remain measurable as individual rooms. */}
              {showDimensions && closedWallFaces.map((face, faceIndex) => {
                const cx = face.centroid.x * scalePxPerMeter;
                const cy = face.centroid.y * scalePxPerMeter;
                return (
                  <g key={face.id} transform={`translate(${cx}, ${cy})`} pointerEvents="none">
                    <rect x="-70" y="-17" width="140" height="34" fill="white" fillOpacity="0.92" stroke="#0f766e" strokeWidth="1" />
                    <text x="0" y="-5" textAnchor="middle" fill="#115e59" fontSize="9" fontWeight="black">
                      AMBIENTE {faceIndex + 1}
                    </text>
                    <text x="0" y="6" textAnchor="middle" fill="#115e59" fontSize="9" fontWeight="bold">
                      LIVRE {face.clearAreaSquareMeters.toFixed(2)} m²
                    </text>
                    <text x="0" y="15" textAnchor="middle" fill="#475569" fontSize="7.5" fontWeight="bold">
                      EIXOS {face.axisAreaSquareMeters.toFixed(2)} m²
                    </text>
                  </g>
                );
              })}
'''
if old_render_start not in text:
    raise SystemExit('simple perimeter render block not found')
text = text.replace(old_render_start, new_render, 1)

editor_path.write_text(text)
