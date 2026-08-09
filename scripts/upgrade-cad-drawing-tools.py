from pathlib import Path

engine_path = Path('src/utils/wallCadEngine.ts')
engine = engine_path.read_text()

if 'export interface WallPrecisionOptions' not in engine:
    engine += r'''

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
'''
    engine_path.write_text(engine)

reg_path = Path('scripts/wall-cad-regression.ts')
reg = reg_path.read_text()
reg = reg.replace(
"""  analyzeWallNetwork,
  buildWallGraph,
  findWallNodeNearPoint,
  getConnectedWallIds,
""",
"""  analyzeWallNetwork,
  applyWallPrecisionConstraints,
  buildWallGraph,
  findClosedWallPerimeters,
  findWallNodeNearPoint,
  getConnectedWallIds,
""",
1,
)
if "13 cenários críticos" not in reg:
    marker = "console.log('wall-cad-regression: 9 cenários críticos passaram');"
    extra = r'''
// 10) Comprimento e ângulo exatos são hard constraints, independentes do grid.
{
  const precise = applyWallPrecisionConstraints(
    { x: 1, y: 1 },
    { x: 9, y: 7 },
    { lockedLengthMeters: 2, lockedAngleDeg: 0 }
  );
  assert.ok(Math.abs(precise.point.x - 3) < 1e-9);
  assert.ok(Math.abs(precise.point.y - 1) < 1e-9);
  assert.equal(precise.lengthMeters, 2);
  assert.equal(precise.angleDeg, 0);
}

// 11) Rastreamento polar quantiza o ângulo sem alterar o comprimento livre.
{
  const precise = applyWallPrecisionConstraints(
    { x: 0, y: 0 },
    { x: 2, y: -1.8 },
    { polarIncrementDeg: 45 }
  );
  assert.equal(precise.angleDeg, 45);
  assert.ok(Math.abs(precise.lengthMeters - Math.hypot(2, 1.8)) < 1e-9);
}

// 12) Perímetro simples fechado calcula área e perímetro reais.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
  ];
  const loops = findClosedWallPerimeters(walls);
  assert.equal(loops.length, 1);
  assert.ok(Math.abs(loops[0].areaSquareMeters - 12) < 1e-9);
  assert.ok(Math.abs(loops[0].perimeterMeters - 14) < 1e-9);
}

// 13) Rede aberta nunca é anunciada como perímetro fechado.
{
  const walls = [wall('a', 0, 0, 3, 0), wall('b', 3, 0, 3, 2)];
  assert.equal(findClosedWallPerimeters(walls).length, 0);
}

console.log('wall-cad-regression: 13 cenários críticos passaram');
'''
    if marker not in reg:
        raise SystemExit('regression marker not found')
    reg = reg.replace(marker, extra, 1)
reg_path.write_text(reg)

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'{label}: pattern not found')
    text = text.replace(old, new, 1)

replace_once(
"""  analyzeWallNetwork,
  findWallNodeNearPoint,
  getConnectedWallIds,
""",
"""  analyzeWallNetwork,
  applyWallPrecisionConstraints,
  findClosedWallPerimeters,
  findWallNodeNearPoint,
  getConnectedWallIds,
""",
'engine imports'
)

replace_once(
"""  const [wallSnapInfo, setWallSnapInfo] = useState<{
    isSnapped: boolean;
    snapInfo?: string;
    snapTargetPoint?: { x: number; y: number };
  } | null>(null);
""",
"""  const [wallSnapInfo, setWallSnapInfo] = useState<{
    isSnapped: boolean;
    snapInfo?: string;
    snapTargetPoint?: { x: number; y: number };
  } | null>(null);
  const [wallDrawMode, setWallDrawMode] = useState<'continuous' | 'drag'>('continuous');
  const [wallLockedLengthInput, setWallLockedLengthInput] = useState('');
  const [wallLockedAngleInput, setWallLockedAngleInput] = useState('');
  const [wallPolarIncrementDeg, setWallPolarIncrementDeg] = useState(0);
  const [showWallOsnapPoints, setShowWallOsnapPoints] = useState(true);
""",
'precision state'
)

replace_once(
"""  const wallGraph = wallCadAnalysis.graph;

  // A room is stored by its architectural outer rectangle, while the rendered masonry
""",
"""  const wallGraph = wallCadAnalysis.graph;
  const closedWallPerimeters = useMemo(
    () => findClosedWallPerimeters(floorPlanWalls, { defaultThicknessMeters: wallThicknessMeters }),
    [floorPlanWalls, wallThicknessMeters]
  );

  // A room is stored by its architectural outer rectangle, while the rendered masonry
""",
'closed perimeter memo'
)

# Precision helper after smart snap.
replace_once(
"""    return { x, y, isSnapped, snapInfo, snapTargetPoint };
  };

  const getOpeningPlacementOnSegment = (
""",
"""    return { x, y, isSnapped, snapInfo, snapTargetPoint };
  };

  const parsePositiveCadNumber = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const parseCadAngle = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getWallDrawingTarget = (
    rawCoords: { x: number; y: number },
    startPos: { x: number; y: number },
    isShiftPressed = false
  ) => {
    const snapped = getSmartWallCoords(rawCoords, startPos, isShiftPressed);
    const lockedLengthMeters = parsePositiveCadNumber(wallLockedLengthInput);
    const lockedAngleDeg = parseCadAngle(wallLockedAngleInput);
    const hasHardConstraint = lockedLengthMeters !== null || lockedAngleDeg !== null;
    const polarIncrementDeg = !hasHardConstraint && !snapped.snapTargetPoint
      ? wallPolarIncrementDeg
      : 0;

    if (!hasHardConstraint && polarIncrementDeg <= 0) return snapped;

    const precision = applyWallPrecisionConstraints(
      startPos,
      { x: snapped.x, y: snapped.y },
      { lockedLengthMeters, lockedAngleDeg, polarIncrementDeg }
    );
    const details = [
      precision.constrainedLength ? `L=${precision.lengthMeters.toFixed(3)}m` : null,
      precision.constrainedAngle ? `A=${precision.angleDeg.toFixed(1)}°` : null,
    ].filter(Boolean).join(' • ');

    return {
      ...snapped,
      x: precision.point.x,
      y: precision.point.y,
      isSnapped: true,
      snapInfo: details ? `📐 ${details}` : snapped.snapInfo,
      snapTargetPoint: hasHardConstraint ? undefined : snapped.snapTargetPoint,
    };
  };

  const getOpeningPlacementOnSegment = (
""",
'precision target helper'
)

# Continuous drawing should finish, not switch tools, on Esc.
replace_once(
"""  const cancelCurrentOperation = () => {
    rollbackHistoryTransaction();
    resetTransientGesture();
    setConduitFromId(null);
    setMeasureStart(null);
    setMeasureEnd(null);
    setActiveTool('select');
    setToolStatus('Operação cancelada. Ferramenta Selecionar ativa.');
  };
""",
"""  const cancelCurrentOperation = () => {
    if (activeTool === 'draw_wall' && wallDrawMode === 'continuous' && isDrawingWall) {
      setIsDrawingWall(false);
      setWallStartPos(null);
      setWallCurrentPos(null);
      setWallSnapInfo(null);
      setToolStatus('Traçado contínuo finalizado. Clique para iniciar outro trecho.');
      return;
    }
    rollbackHistoryTransaction();
    resetTransientGesture();
    setConduitFromId(null);
    setMeasureStart(null);
    setMeasureEnd(null);
    setActiveTool('select');
    setToolStatus('Operação cancelada. Ferramenta Selecionar ativa.');
  };
""",
'escape continuous behavior'
)

replace_once(
"""  const handleCanvasMouseLeave = () => {
    if (isDrawingRoom || isDrawingWall || isMeasuring) {
      setToolStatus('Gesto cancelado porque o cursor saiu da área de desenho.');
    }
    rollbackHistoryTransaction();
    resetTransientGesture();
  };
""",
"""  const handleCanvasMouseLeave = () => {
    if (isDrawingWall && wallDrawMode === 'continuous') {
      setToolStatus('Traçado contínuo preservado. Volte ao canvas para continuar ou pressione Esc/Enter para finalizar.');
      return;
    }
    if (isDrawingRoom || isDrawingWall || isMeasuring) {
      setToolStatus('Gesto cancelado porque o cursor saiu da área de desenho.');
    }
    rollbackHistoryTransaction();
    resetTransientGesture();
  };
""",
'mouseleave continuous'
)

# Exact grip handler: support both starting and committing a continuous segment.
old_begin = """  const beginWallFromExactNode = (
    point: { x: number; y: number },
    e: React.MouseEvent<SVGGElement>
  ) => {
    if (activeTool !== 'draw_wall' || isDrawingWall || e.button !== 0) return;
    e.stopPropagation();
    const topology = getEndpointNodeTopology(point);
    const label = topology ? getEndpointNodeDisplayLabel(topology) : 'compartilhado';
    const nextCount = (topology?.branches.length || 0) + 1;
    beginHistoryTransaction();
    setIsDrawingWall(true);
    setWallStartPos({ ...point });
    setWallCurrentPos({ ...point });
    setWallSnapInfo({
      isSnapped: true,
      snapInfo: `⚡ Nó ${label} — nova ramificação`,
      snapTargetPoint: { ...point },
    });
    setToolStatus(
      `Nó ${label} selecionado. Puxe a nova parede; o encontro será recalculado como um único nó com ${nextCount} ramificações.`
    );
  };
"""
new_begin = """  const beginWallFromExactNode = (
    point: { x: number; y: number },
    e: React.MouseEvent<SVGGElement>,
    explicitLabel?: string
  ) => {
    if (activeTool !== 'draw_wall' || e.button !== 0) return;
    e.stopPropagation();
    const topology = getEndpointNodeTopology(point);
    const label = explicitLabel || (topology ? getEndpointNodeDisplayLabel(topology) : 'OSNAP');
    const nextCount = (topology?.branches.length || 0) + 1;

    if (wallDrawMode === 'continuous' && isDrawingWall && wallStartPos) {
      const result = commitCustomWallSegment(wallStartPos, point);
      if (result.created) {
        setWallStartPos(result.endPoint);
        setWallCurrentPos(result.endPoint);
        setWallSnapInfo({ isSnapped: true, snapInfo: `⚡ ${label}`, snapTargetPoint: result.endPoint });
        setToolStatus(`Trecho criado por OSNAP ${label}. Clique no próximo ponto ou Esc/Enter para finalizar.`);
      }
      return;
    }

    if (isDrawingWall) return;
    if (wallDrawMode === 'drag') beginHistoryTransaction();
    setIsDrawingWall(true);
    setWallStartPos({ ...point });
    setWallCurrentPos({ ...point });
    setWallSnapInfo({
      isSnapped: true,
      snapInfo: `⚡ ${label} — ponto exato`,
      snapTargetPoint: { ...point },
    });
    setToolStatus(
      wallDrawMode === 'continuous'
        ? `OSNAP ${label} selecionado. Clique no próximo ponto para criar o trecho.`
        : `OSNAP ${label} selecionado. Arraste para criar a parede${topology ? ` com ${nextCount} ramificações no nó` : ''}.`
    );
  };
"""
replace_once(old_begin, new_begin, 'exact node handler')

# Insert reusable wall commit before Canvas Mouse Down.
anchor = """  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
"""
helper = r'''  const commitCustomWallSegment = (
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number }
  ): { created: boolean; endPoint: { x: number; y: number } } => {
    const draftWall: FloorPlanWall = {
      id: `wall_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      x1Meters: startPoint.x,
      y1Meters: startPoint.y,
      x2Meters: endPoint.x,
      y2Meters: endPoint.y,
      thicknessMeters: wallThicknessMeters,
      label: '',
    };
    const normalizedWall = normalizeWallConnections(draftWall);
    const dx = normalizedWall.x2Meters - normalizedWall.x1Meters;
    const dy = normalizedWall.y2Meters - normalizedWall.y1Meters;
    const dist = Math.hypot(dx, dy);
    const normalizedEnd = { x: normalizedWall.x2Meters, y: normalizedWall.y2Meters };

    if (dist < 0.1) {
      setToolStatus('Trecho ignorado: comprimento mínimo de parede é 0,10 m.');
      return { created: false, endPoint: normalizedEnd };
    }

    const startTopologyBefore = getEndpointNodeTopology({
      x: normalizedWall.x1Meters,
      y: normalizedWall.y1Meters,
    });
    const endTopologyBefore = getEndpointNodeTopology(normalizedEnd);
    const inheritedGroupId = [startTopologyBefore, endTopologyBefore]
      .flatMap((topology) => topology?.branches || [])
      .map((branch) => branch.wall.groupId)
      .find((groupId): groupId is string => Boolean(groupId));
    const sourceTopologyBefore = startTopologyBefore || endTopologyBefore;
    const sourceNodeLabel = sourceTopologyBefore
      ? getEndpointNodeDisplayLabel(sourceTopologyBefore)
      : null;
    const sourceNodeBranchCount = sourceTopologyBefore?.branches.length || 0;

    const newWall: FloorPlanWall = {
      ...normalizedWall,
      groupId: inheritedGroupId || normalizedWall.groupId || `wallgrp_${normalizedWall.id}`,
      label: `Parede ${floorPlanWalls.length + 1} (${dist.toFixed(2)}m)`,
    };
    const nextWalls = [...floorPlanWalls, newWall];
    const nextCadAnalysis = analyzeWallNetwork(nextWalls, {
      defaultThicknessMeters: wallThicknessMeters,
    });
    const duplicateIssue = nextCadAnalysis.issues.find(
      (issue) => issue.code === 'DUPLICATE' && issue.wallIds.includes(newWall.id)
    );

    if (duplicateIssue) {
      setToolStatus('Parede não criada: já existe uma parede exatamente sobre esse segmento.');
      return { created: false, endPoint: normalizedEnd };
    }

    onUpdateProjectData({
      ...projectData,
      floorPlan: {
        scalePixelsPerMeter: scalePxPerMeter,
        gridSnapMeters,
        symbols: floorPlanSymbols,
        conduits: floorPlanConduits,
        openings: floorPlanOpenings,
        walls: nextWalls,
      },
    });
    setToolStatus(
      sourceTopologyBefore
        ? `Ramificação adicionada ao nó ${sourceNodeLabel}. O encontro agora possui ${sourceNodeBranchCount + 1} paredes no mesmo desenho.`
        : nextCadAnalysis.issues.length > 0
          ? `Parede criada. CAD detectou ${nextCadAnalysis.issues.length} ponto(s) para revisão.`
          : 'Parede criada e rede geométrica íntegra.'
    );
    return { created: true, endPoint: normalizedEnd };
  };

  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
'''
replace_once(anchor, helper, 'wall commit helper')

# draw_wall mouse down semantics.
replace_once(
"""    } else if (activeTool === 'draw_wall') {
      beginHistoryTransaction();
      const snap = getSmartWallCoords(coords, null, e.shiftKey);
      setIsDrawingWall(true);
      setWallStartPos({ x: snap.x, y: snap.y });
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
""",
"""    } else if (activeTool === 'draw_wall') {
      if (wallDrawMode === 'continuous') {
        if (!isDrawingWall || !wallStartPos) {
          const startSnap = getSmartWallCoords(coords, null, e.shiftKey);
          const startPoint = { x: startSnap.x, y: startSnap.y };
          setIsDrawingWall(true);
          setWallStartPos(startPoint);
          setWallCurrentPos(startPoint);
          setWallSnapInfo(startSnap);
          setToolStatus('Traçado contínuo iniciado. Clique nos próximos pontos; Esc ou Enter finaliza.');
        } else {
          const target = getWallDrawingTarget(coords, wallStartPos, e.shiftKey);
          const result = commitCustomWallSegment(wallStartPos, { x: target.x, y: target.y });
          if (result.created) {
            setWallStartPos(result.endPoint);
            setWallCurrentPos(result.endPoint);
            setWallSnapInfo(target);
            setToolStatus('Trecho criado. Continue clicando ou pressione Esc/Enter para finalizar.');
          }
        }
      } else {
        beginHistoryTransaction();
        const startSnap = getSmartWallCoords(coords, null, e.shiftKey);
        setIsDrawingWall(true);
        setWallStartPos({ x: startSnap.x, y: startSnap.y });
        setWallCurrentPos({ x: startSnap.x, y: startSnap.y });
        setWallSnapInfo(startSnap);
      }
""",
'draw wall mousedown'
)

# Mouse move precision.
replace_once(
"""    } else if (isDrawingWall && wallStartPos) {
      const snap = getSmartWallCoords(coords, wallStartPos, e.shiftKey);
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
""",
"""    } else if (isDrawingWall && wallStartPos) {
      const target = getWallDrawingTarget(coords, wallStartPos, e.shiftKey);
      setWallCurrentPos({ x: target.x, y: target.y });
      setWallSnapInfo(target);
""",
'drawing mousemove precision'
)

# Replace giant wall commit block in mouseup with helper and continuous skip.
start_marker = """    if (isDrawingWall && wallStartPos && wallCurrentPos) {
      const draftWall: FloorPlanWall = {
"""
end_marker = """    } else if (isDrawingRoom && dragStartPos && dragCurrentPos) {
"""
start_idx = text.find(start_marker)
end_idx = text.find(end_marker, start_idx)
if start_idx < 0 or end_idx < 0:
    raise SystemExit('mouseup wall block not found')
new_block = """    if (isDrawingWall && wallDrawMode === 'continuous') {
      return;
    }

    if (isDrawingWall && wallStartPos && wallCurrentPos) {
      commitCustomWallSegment(wallStartPos, wallCurrentPos);
      finishHistoryTransaction();
      setIsDrawingWall(false);
      setWallStartPos(null);
      setWallCurrentPos(null);
      setWallSnapInfo(null);
    } else if (isDrawingRoom && dragStartPos && dragCurrentPos) {
"""
text = text[:start_idx] + new_block + text[end_idx + len(end_marker):]

# Enter finishes a continuous chain.
replace_once(
"""      if (e.key === 'Escape') {
        e.preventDefault();
        cancelCurrentOperation();
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
""",
"""      if (e.key === 'Escape') {
        e.preventDefault();
        cancelCurrentOperation();
        return;
      }

      if (e.key === 'Enter' && activeTool === 'draw_wall' && wallDrawMode === 'continuous' && isDrawingWall) {
        e.preventDefault();
        setIsDrawingWall(false);
        setWallStartPos(null);
        setWallCurrentPos(null);
        setWallSnapInfo(null);
        setToolStatus('Traçado contínuo finalizado. Clique para iniciar outro trecho.');
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
""",
'enter finishes continuous'
)

# Hook deps for keyboard.
replace_once(
"""    fitSheetToViewport,
  ]);
""",
"""    fitSheetToViewport,
    wallDrawMode,
    isDrawingWall,
  ]);
""",
'keyboard dependencies'
)

# Rich wall tool controls.
old_panel = """            <div className=\"flex items-center gap-1\">
              <label className=\"font-bold\">Espessura da Parede:</label>
              <select
                value={wallThicknessMeters}
                onChange={(e) => setWallThicknessMeters(Number(e.target.value))}
                className=\"bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer\"
              >
                <option value={0.10}>10 cm (Divisória)</option>
                <option value={0.15}>15 cm (Padrão)</option>
                <option value={0.20}>20 cm (Externa / Estrutural)</option>
              </select>
            </div>
"""
new_panel = old_panel + """            <div className=\"flex items-center gap-1\">
              <label className=\"font-bold\">Modo:</label>
              <select
                value={wallDrawMode}
                onChange={(e) => {
                  setWallDrawMode(e.target.value as 'continuous' | 'drag');
                  setIsDrawingWall(false);
                  setWallStartPos(null);
                  setWallCurrentPos(null);
                  setWallSnapInfo(null);
                }}
                className=\"bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer\"
              >
                <option value=\"continuous\">Contínuo (clique-clique)</option>
                <option value=\"drag\">Arrastar (legado)</option>
              </select>
            </div>
            <div className=\"flex items-center gap-1\">
              <label className=\"font-bold\">Comprimento:</label>
              <input
                value={wallLockedLengthInput}
                onChange={(e) => setWallLockedLengthInput(e.target.value)}
                inputMode=\"decimal\"
                placeholder=\"livre\"
                className=\"w-20 bg-white border border-[#141414] px-2 py-1 font-bold\"
                title=\"Comprimento exato em metros. Deixe vazio para livre.\"
              />
              <span>m</span>
            </div>
            <div className=\"flex items-center gap-1\">
              <label className=\"font-bold\">Ângulo:</label>
              <input
                value={wallLockedAngleInput}
                onChange={(e) => setWallLockedAngleInput(e.target.value)}
                inputMode=\"decimal\"
                placeholder=\"livre\"
                className=\"w-20 bg-white border border-[#141414] px-2 py-1 font-bold\"
                title=\"0° direita, 90° cima, 180° esquerda, 270° baixo.\"
              />
              <span>°</span>
            </div>
            <div className=\"flex items-center gap-1\">
              <label className=\"font-bold\">Polar:</label>
              <select
                value={wallPolarIncrementDeg}
                onChange={(e) => setWallPolarIncrementDeg(Number(e.target.value))}
                className=\"bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer\"
              >
                <option value={0}>Livre</option>
                <option value={15}>15°</option>
                <option value={30}>30°</option>
                <option value={45}>45°</option>
                <option value={90}>Orto 90°</option>
              </select>
            </div>
            <label className=\"flex items-center gap-1 font-bold cursor-pointer\">
              <input
                type=\"checkbox\"
                checked={showWallOsnapPoints}
                onChange={(e) => setShowWallOsnapPoints(e.target.checked)}
              />
              OSNAP visível
            </label>
"""
replace_once(old_panel, new_panel, 'wall controls')

# Enrich health badge with closed perimeters and area.
replace_once(
"""              CAD: {wallGraph.nodes.filter((node) => node.wallIds.length >= 2).length} nós •{' '}
              {wallCadAnalysis.componentCount} rede(s) •{' '}
              {wallCadAnalysis.issues.length === 0 ? 'íntegro' : `${wallCadAnalysis.issues.length} alerta(s)`}
""",
"""              CAD: {wallGraph.nodes.filter((node) => node.wallIds.length >= 2).length} nós •{' '}
              {wallCadAnalysis.componentCount} rede(s) • {closedWallPerimeters.length} perímetro(s) fechado(s) •{' '}
              {closedWallPerimeters.length > 0
                ? `${closedWallPerimeters.reduce((sum, perimeter) => sum + perimeter.areaSquareMeters, 0).toFixed(2)} m² • `
                : ''}
              {wallCadAnalysis.issues.length === 0 ? 'íntegro' : `${wallCadAnalysis.issues.length} alerta(s)`}
""",
'health badge perimeters'
)

replace_once(
"""              * Clique em qualquer canto do cômodo ou ponto no canvas e arraste para desenhar uma parede com linhas duplas e hachura!
""",
"""              * Contínuo: clique ponto a ponto; Esc/Enter finaliza. Use os grips OSNAP para nó/interseção/meio exatos. Comprimento e ângulo preenchidos são restrições rígidas.
""",
'wall hint'
)

# Node grips honor visibility and add midpoint OSNAP immediately after them.
replace_once(
"""              {activeTool === 'draw_wall' && !isDrawingWall &&
                getUniqueCustomEndpointNodeTopologies()
""",
"""              {showWallOsnapPoints && activeTool === 'draw_wall' &&
                getUniqueCustomEndpointNodeTopologies()
""",
'node grip visibility'
)

node_block_end = """                  })}

              {/* Interactive Custom Walls */}
"""
midpoint_block = """                  })}

              {/* Explicit midpoint OSNAP. Clicking the diamond bypasses grid rounding and creates an exact T anchor. */}
              {showWallOsnapPoints && activeTool === 'draw_wall' && floorPlanWalls.map((wall) => {
                const mx = ((wall.x1Meters + wall.x2Meters) / 2) * scalePxPerMeter;
                const my = ((wall.y1Meters + wall.y2Meters) / 2) * scalePxPerMeter;
                const point = {
                  x: (wall.x1Meters + wall.x2Meters) / 2,
                  y: (wall.y1Meters + wall.y2Meters) / 2,
                };
                return (
                  <g
                    key={`wall-mid-osnap-${wall.id}`}
                    transform={`translate(${mx}, ${my})`}
                    onMouseDown={(e) => beginWallFromExactNode(point, e, 'MEIO')}
                    className=\"cursor-crosshair\"
                  >
                    <circle r=\"10\" fill=\"transparent\" />
                    <path d=\"M 0 -5 L 5 0 L 0 5 L -5 0 Z\" fill=\"#0891b2\" stroke=\"white\" strokeWidth=\"1.5\" />
                    <title>OSNAP MEIO — ponto médio exato da parede</title>
                  </g>
                );
              })}

              {/* Interactive Custom Walls */}
"""
replace_once(node_block_end, midpoint_block, 'midpoint osnap block')

# Preview badge shows length + engineering angle.
replace_once(
"""                const lengthMeters = (lengthPx / scalePxPerMeter).toFixed(2);

                const ux = dx / lengthPx;
""",
"""                const lengthMeters = (lengthPx / scalePxPerMeter).toFixed(3);
                const angleDeg = ((Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI + 360) % 360;

                const ux = dx / lengthPx;
""",
'preview angle variable'
)
replace_once(
"""                      Parede: {lengthMeters} m
""",
"""                      Parede: {lengthMeters} m • {angleDeg.toFixed(1)}°
""",
'preview angle label'
)

# Closed perimeter labels on canvas before openings.
perimeter_anchor = """              {/* 3. Architectural Openings (Portas e Janelas) */}
"""
perimeter_render = """              {/* Closed wall-only perimeters detected by the CAD graph. */}
              {showDimensions && closedWallPerimeters.map((perimeter) => {
                const cx = perimeter.centroid.x * scalePxPerMeter;
                const cy = perimeter.centroid.y * scalePxPerMeter;
                return (
                  <g key={perimeter.id} transform={`translate(${cx}, ${cy})`} pointerEvents=\"none\">
                    <rect x=\"-62\" y=\"-13\" width=\"124\" height=\"26\" fill=\"white\" fillOpacity=\"0.9\" stroke=\"#0f766e\" strokeWidth=\"1\" />
                    <text x=\"0\" y=\"-1\" textAnchor=\"middle\" fill=\"#115e59\" fontSize=\"9\" fontWeight=\"black\">
                      PERÍMETRO FECHADO
                    </text>
                    <text x=\"0\" y=\"9\" textAnchor=\"middle\" fill=\"#115e59\" fontSize=\"9\" fontWeight=\"bold\">
                      {perimeter.areaSquareMeters.toFixed(2)} m² • P {perimeter.perimeterMeters.toFixed(2)} m
                    </text>
                  </g>
                );
              })}

              {/* 3. Architectural Openings (Portas e Janelas) */}
"""
replace_once(perimeter_anchor, perimeter_render, 'closed perimeter labels')

p.write_text(text)
