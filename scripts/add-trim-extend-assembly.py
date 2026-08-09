from pathlib import Path

engine_path = Path('src/utils/wallCadEngine.ts')
engine = engine_path.read_text()

if 'export const isPointInsidePolygon' not in engine:
    engine += r'''

/** Point-in-polygon with boundary inclusion, used to bind spatial CAD content to wall faces. */
export const isPointInsidePolygon = (
  point: CadPoint,
  polygon: CadPoint[],
  epsilon = 1e-8
): boolean => {
  if (polygon.length < 3) return false;

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const projection = projectPointToSegment(point, a, b);
    if (projection.distance <= epsilon) return true;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      (yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || epsilon) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

export interface WallEndpointEditResult {
  wall: FloorPlanWall;
  point: CadPoint;
  distanceMeters: number;
  targetWallId?: string;
  targetNodeId?: string;
}

/**
 * TRIM: move the requested endpoint to the nearest existing logical node strictly inside
 * the same wall segment. The rest of the drawing is untouched; the selected wall detaches
 * from its old endpoint intentionally, exactly like a CAD trim command.
 */
export const trimWallEndpointToNearestNode = (
  wall: FloorPlanWall,
  handle: 'p1' | 'p2',
  graph: WallGraph,
  epsilonMeters = CAD_NODE_TOLERANCE_M
): WallEndpointEditResult | null => {
  const start = wallStart(wall);
  const end = wallEnd(wall);
  const length = distance(start, end);
  if (length <= CAD_GEOMETRY_EPSILON_M) return null;

  const candidates = graph.nodes
    .filter((node) => node.wallIds.includes(wall.id))
    .map((node) => {
      const projection = projectPointToSegment(node.point, start, end);
      return { node, projection };
    })
    .filter(({ projection }) =>
      projection.distance <= Math.max(epsilonMeters, 0.006) &&
      projection.t > epsilonMeters / length &&
      projection.t < 1 - epsilonMeters / length
    );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) =>
    handle === 'p1'
      ? a.projection.t - b.projection.t
      : b.projection.t - a.projection.t
  );
  const chosen = candidates[0];
  const point = { ...chosen.node.point };
  const edited = handle === 'p1'
    ? { ...wall, x1Meters: point.x, y1Meters: point.y }
    : { ...wall, x2Meters: point.x, y2Meters: point.y };
  const oldEndpoint = handle === 'p1' ? start : end;

  return {
    wall: edited,
    point,
    distanceMeters: distance(oldEndpoint, point),
    targetNodeId: chosen.node.id,
  };
};

const lineIntersectionParameters = (
  a: CadPoint,
  aDirection: CadPoint,
  b: CadPoint,
  bDirection: CadPoint
): { point: CadPoint; tA: number; tB: number } | null => {
  const denominator = cross(aDirection, bDirection);
  if (Math.abs(denominator) <= 1e-9) return null;
  const rel = { x: b.x - a.x, y: b.y - a.y };
  const tA = cross(rel, bDirection) / denominator;
  const tB = cross(rel, aDirection) / denominator;
  return {
    point: { x: a.x + aDirection.x * tA, y: a.y + aDirection.y * tA },
    tA,
    tB,
  };
};

/**
 * EXTEND: extend P1/P2 forward along the wall centerline until the nearest other finite
 * wall segment. Perpendicular/angled and collinear targets are supported.
 */
export const extendWallEndpointToNearestWall = (
  wall: FloorPlanWall,
  handle: 'p1' | 'p2',
  walls: FloorPlanWall[],
  epsilonMeters = 1e-6
): WallEndpointEditResult | null => {
  const start = wallStart(wall);
  const end = wallEnd(wall);
  const endpoint = handle === 'p1' ? start : end;
  const interior = handle === 'p1' ? end : start;
  const direction = normalizeVector({ x: endpoint.x - interior.x, y: endpoint.y - interior.y });
  if (!direction) return null;

  let best: WallEndpointEditResult | null = null;
  const consider = (point: CadPoint, targetWallId: string) => {
    const forward = dot({ x: point.x - endpoint.x, y: point.y - endpoint.y }, direction);
    if (forward <= epsilonMeters) return;
    const lateral = Math.abs(cross({ x: point.x - endpoint.x, y: point.y - endpoint.y }, direction));
    if (lateral > Math.max(0.002, epsilonMeters * 10)) return;
    if (!best || forward < best.distanceMeters) {
      const edited = handle === 'p1'
        ? { ...wall, x1Meters: point.x, y1Meters: point.y }
        : { ...wall, x2Meters: point.x, y2Meters: point.y };
      best = { wall: edited, point: { ...point }, distanceMeters: forward, targetWallId };
    }
  };

  for (const target of walls) {
    if (target.id === wall.id) continue;
    const targetStart = wallStart(target);
    const targetEnd = wallEnd(target);
    const targetDirectionRaw = { x: targetEnd.x - targetStart.x, y: targetEnd.y - targetStart.y };
    const targetLength = Math.hypot(targetDirectionRaw.x, targetDirectionRaw.y);
    if (targetLength <= CAD_GEOMETRY_EPSILON_M) continue;
    const targetDirection = { x: targetDirectionRaw.x / targetLength, y: targetDirectionRaw.y / targetLength };

    const intersection = lineIntersectionParameters(endpoint, direction, targetStart, targetDirection);
    if (intersection) {
      if (
        intersection.tA > epsilonMeters &&
        intersection.tB >= -epsilonMeters &&
        intersection.tB <= targetLength + epsilonMeters
      ) {
        consider(intersection.point, target.id);
      }
      continue;
    }

    // Parallel: if target is collinear, either target endpoint ahead can be the nearest hit.
    const targetOffset = { x: targetStart.x - endpoint.x, y: targetStart.y - endpoint.y };
    if (Math.abs(cross(targetOffset, direction)) <= Math.max(0.002, epsilonMeters * 10)) {
      consider(targetStart, target.id);
      consider(targetEnd, target.id);
    }
  }

  return best;
};
'''
    engine_path.write_text(engine)

reg_path = Path('scripts/wall-cad-regression.ts')
reg = reg_path.read_text()
for name, after in [
    ('isPointInsidePolygon', '  setWallEndByLengthAngle,\n'),
    ('trimWallEndpointToNearestNode', '  isPointInsidePolygon,\n'),
    ('extendWallEndpointToNearestWall', '  trimWallEndpointToNearestNode,\n'),
]:
    if name not in reg:
        reg = reg.replace(after, after + f'  {name},\n', 1)

if '30 cenários críticos' not in reg:
    marker = "console.log('wall-cad-regression: 25 cenários críticos passaram');"
    extra = r'''
// 26) Point-in-polygon inclui interior e borda, rejeita exterior.
{
  const polygon = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  assert.equal(isPointInsidePolygon({ x: 2, y: 1 }, polygon), true);
  assert.equal(isPointInsidePolygon({ x: 4, y: 1 }, polygon), true);
  assert.equal(isPointInsidePolygon({ x: 5, y: 1 }, polygon), false);
}

// 27) TRIM P1 escolhe o primeiro nó interno na direção da parede.
{
  const walls = [
    wall('host', 0, 0, 6, 0),
    wall('cross1', 2, -1, 2, 1),
    wall('cross2', 4, -1, 4, 1),
  ];
  const graph = buildWallGraph(walls);
  const trimmed = trimWallEndpointToNearestNode(walls[0], 'p1', graph)!;
  assert.ok(trimmed);
  assert.ok(Math.abs(trimmed.wall.x1Meters - 2) < 1e-9);
  assert.ok(Math.abs(trimmed.wall.x2Meters - 6) < 1e-9);
}

// 28) TRIM P2 escolhe o primeiro nó interno vindo da extremidade oposta.
{
  const walls = [
    wall('host', 0, 0, 6, 0),
    wall('cross1', 2, -1, 2, 1),
    wall('cross2', 4, -1, 4, 1),
  ];
  const graph = buildWallGraph(walls);
  const trimmed = trimWallEndpointToNearestNode(walls[0], 'p2', graph)!;
  assert.ok(trimmed);
  assert.ok(Math.abs(trimmed.wall.x2Meters - 4) < 1e-9);
}

// 29) EXTEND alcança a parede perpendicular mais próxima à frente do endpoint.
{
  const source = wall('source', 0, 0, 2, 0);
  const targets = [source, wall('far', 5, -2, 5, 2), wall('near', 4, -2, 4, 2)];
  const extended = extendWallEndpointToNearestWall(source, 'p2', targets)!;
  assert.ok(extended);
  assert.equal(extended.targetWallId, 'near');
  assert.ok(Math.abs(extended.wall.x2Meters - 4) < 1e-9);
}

// 30) EXTEND ignora alvos atrás da direção escolhida e aceita continuidade colinear à frente.
{
  const source = wall('source', 0, 0, 2, 0);
  const targets = [source, wall('behind', -3, -1, -3, 1), wall('ahead', 4, 0, 6, 0)];
  const extended = extendWallEndpointToNearestWall(source, 'p2', targets)!;
  assert.ok(extended);
  assert.equal(extended.targetWallId, 'ahead');
  assert.ok(Math.abs(extended.wall.x2Meters - 4) < 1e-9);
}

console.log('wall-cad-regression: 30 cenários críticos passaram');
'''
    if marker not in reg:
        raise SystemExit('25-scenario marker not found')
    reg = reg.replace(marker, extra, 1)
reg_path.write_text(reg)

editor_path = Path('src/components/FloorPlanEditor.tsx')
text = editor_path.read_text()

for name, after in [
    ('rotatePointAround', '  rotateWallSelection,\n'),
    ('isPointInsidePolygon', '  rotatePointAround,\n'),
    ('trimWallEndpointToNearestNode', '  isPointInsidePolygon,\n'),
    ('extendWallEndpointToNearestWall', '  trimWallEndpointToNearestNode,\n'),
]:
    if name not in text:
        text = text.replace(after, after + f'  {name},\n', 1)

# Spatial assembly helpers before edit commit helper.
anchor = '''  const commitWallGeometryEdit = (walls: FloorPlanWall[], message: string) => {
'''
replacement = r'''  const getWallNetworkFaces = (wallIds: Iterable<string>) => {
    const ids = new Set(wallIds);
    return closedWallFaces.filter((face) =>
      face.wallIds.length > 0 && face.wallIds.every((wallId) => ids.has(wallId))
    );
  };

  const getSymbolsInsideWallNetwork = (wallIds: Iterable<string>): FloorPlanSymbol[] => {
    const faces = getWallNetworkFaces(wallIds);
    if (faces.length === 0) return [];
    return floorPlanSymbols.filter((symbol) =>
      faces.some((face) => isPointInsidePolygon(
        { x: symbol.xMeters, y: symbol.yMeters },
        face.axisPoints,
        1e-6
      ))
    );
  };

  const preserveOpeningPositionsForWallChange = (
    nextWalls: FloorPlanWall[],
    changedWallIds: Iterable<string>
  ): FloorPlanOpening[] => {
    const ids = new Set(changedWallIds);
    const previousById = new Map(floorPlanWalls.map((wall) => [wall.id, wall] as const));
    const nextById = new Map(nextWalls.map((wall) => [wall.id, wall] as const));
    return floorPlanOpenings.map((opening) => {
      if (!opening.wallId || !ids.has(opening.wallId)) return opening;
      const previous = previousById.get(opening.wallId);
      const next = nextById.get(opening.wallId);
      if (!previous || !next) return opening;
      const oldRatio = Math.max(0, Math.min(1, opening.wallPositionRatio ?? 0.5));
      const oldCenter = {
        x: previous.x1Meters + (previous.x2Meters - previous.x1Meters) * oldRatio,
        y: previous.y1Meters + (previous.y2Meters - previous.y1Meters) * oldRatio,
      };
      const dx = next.x2Meters - next.x1Meters;
      const dy = next.y2Meters - next.y1Meters;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < 1e-9) return opening;
      const nextRatio = Math.max(0, Math.min(1,
        ((oldCenter.x - next.x1Meters) * dx + (oldCenter.y - next.y1Meters) * dy) / lengthSq
      ));
      return { ...opening, wallPositionRatio: nextRatio };
    });
  };

  const commitWallGeometryEdit = (
    walls: FloorPlanWall[],
    message: string,
    options?: { symbols?: FloorPlanSymbol[]; openings?: FloorPlanOpening[] }
  ) => {
'''
if anchor not in text:
    raise SystemExit('commit edit anchor not found')
text = text.replace(anchor, replacement, 1)

old_commit_arrays = '''        symbols: floorPlanSymbols,
        conduits: floorPlanConduits,
        openings: floorPlanOpenings,
        walls: canonical,
'''
new_commit_arrays = '''        symbols: options?.symbols || floorPlanSymbols,
        conduits: floorPlanConduits,
        openings: options?.openings || floorPlanOpenings,
        walls: canonical,
'''
if old_commit_arrays not in text:
    raise SystemExit('commit arrays not found')
text = text.replace(old_commit_arrays, new_commit_arrays, 1)

# Exact move includes spatial symbols.
old_move_commit = '''    const moved = translateWallSelection(floorPlanWalls, ids, dx, dy);
    if (commitWallGeometryEdit(moved, `Rede movida exatamente ΔX=${dx.toFixed(3)} m • ΔY=${dy.toFixed(3)} m.`)) {
      setSelectedWallIds(ids);
    }
'''
new_move_commit = '''    const moved = translateWallSelection(floorPlanWalls, ids, dx, dy);
    const spatialSymbolIds = new Set(getSymbolsInsideWallNetwork(ids).map((symbol) => symbol.id));
    const movedSymbols = floorPlanSymbols.map((symbol) =>
      spatialSymbolIds.has(symbol.id)
        ? { ...symbol, xMeters: symbol.xMeters + dx, yMeters: symbol.yMeters + dy }
        : symbol
    );
    if (commitWallGeometryEdit(
      moved,
      `Rede movida exatamente ΔX=${dx.toFixed(3)} m • ΔY=${dy.toFixed(3)} m. ${spatialSymbolIds.size} símbolo(s) interno(s) acompanharam.`,
      { symbols: movedSymbols }
    )) {
      setSelectedWallIds(ids);
    }
'''
if old_move_commit not in text:
    raise SystemExit('exact move block not found')
text = text.replace(old_move_commit, new_move_commit, 1)

# Exact rotate includes spatial symbols.
old_rotate_commit = '''    const rotated = rotateWallSelection(floorPlanWalls, ids, angle, bounds.center);
    if (commitWallGeometryEdit(rotated, `Rede girada ${angle.toFixed(2)}° em torno do centro da seleção.`)) {
      setSelectedWallIds(ids);
    }
'''
new_rotate_commit = '''    const rotated = rotateWallSelection(floorPlanWalls, ids, angle, bounds.center);
    const spatialSymbolIds = new Set(getSymbolsInsideWallNetwork(ids).map((symbol) => symbol.id));
    const rotatedSymbols = floorPlanSymbols.map((symbol) => {
      if (!spatialSymbolIds.has(symbol.id)) return symbol;
      const point = rotatePointAround({ x: symbol.xMeters, y: symbol.yMeters }, bounds.center, angle);
      return { ...symbol, xMeters: point.x, yMeters: point.y };
    });
    if (commitWallGeometryEdit(
      rotated,
      `Rede girada ${angle.toFixed(2)}° em torno do centro da seleção. ${spatialSymbolIds.size} símbolo(s) interno(s) acompanharam.`,
      { symbols: rotatedSymbols }
    )) {
      setSelectedWallIds(ids);
    }
'''
if old_rotate_commit not in text:
    raise SystemExit('exact rotate block not found')
text = text.replace(old_rotate_commit, new_rotate_commit, 1)

# Add trim/extend editor commands before thickness helper.
anchor = '''  const setSelectedWallThicknessExact = (thicknessMeters: number) => {
'''
commands = r'''  const trimSelectedWallEndpoint = (handle: 'p1' | 'p2') => {
    if (!selectedWallId) return;
    const wall = floorPlanWalls.find((item) => item.id === selectedWallId);
    if (!wall) return;
    const result = trimWallEndpointToNearestNode(wall, handle, wallGraph);
    if (!result) {
      setToolStatus(`APARAR ${handle.toUpperCase()}: não existe nó/interseção interna nesse segmento.`);
      return;
    }
    const nextWalls = floorPlanWalls.map((item) => item.id === wall.id ? result.wall : item);
    const nextOpenings = preserveOpeningPositionsForWallChange(nextWalls, [wall.id]);
    if (commitWallGeometryEdit(
      nextWalls,
      `APARAR ${handle.toUpperCase()}: ${result.distanceMeters.toFixed(3)} m removidos até o nó mais próximo.`,
      { openings: nextOpenings }
    )) {
      setSelectedWallIds([wall.id]);
    }
  };

  const extendSelectedWallEndpoint = (handle: 'p1' | 'p2') => {
    if (!selectedWallId) return;
    const wall = floorPlanWalls.find((item) => item.id === selectedWallId);
    if (!wall) return;
    const result = extendWallEndpointToNearestWall(wall, handle, floorPlanWalls);
    if (!result) {
      setToolStatus(`ESTENDER ${handle.toUpperCase()}: nenhuma parede foi encontrada à frente do endpoint.`);
      return;
    }
    const nextWalls = floorPlanWalls.map((item) => item.id === wall.id ? result.wall : item);
    const nextOpenings = preserveOpeningPositionsForWallChange(nextWalls, [wall.id]);
    if (commitWallGeometryEdit(
      nextWalls,
      `ESTENDER ${handle.toUpperCase()}: +${result.distanceMeters.toFixed(3)} m até ${result.targetWallId || 'parede alvo'}.`,
      { openings: nextOpenings }
    )) {
      setSelectedWallIds([wall.id]);
    }
  };

  const setSelectedWallThicknessExact = (thicknessMeters: number) => {
'''
if anchor not in text:
    raise SystemExit('thickness anchor not found')
text = text.replace(anchor, commands, 1)

# Wall drag captures spatial symbols.
old_component_openings = '''    const componentOpenings = floorPlanOpenings
      .filter((opening) => Boolean(opening.wallId && componentIdSet.has(opening.wallId)))
      .map((opening) => ({ ...opening }));

    if (!wall.roomId && componentWalls.length > 1) {
'''
new_component_openings = '''    const componentOpenings = floorPlanOpenings
      .filter((opening) => Boolean(opening.wallId && componentIdSet.has(opening.wallId)))
      .map((opening) => ({ ...opening }));
    const componentSymbols = wall.roomId
      ? []
      : getSymbolsInsideWallNetwork(effectiveIds).map((symbol) => ({ ...symbol }));

    if (!wall.roomId && componentWalls.length > 1) {
'''
if old_component_openings not in text:
    raise SystemExit('component opening block not found')
text = text.replace(old_component_openings, new_component_openings, 1)

old_drag_state = '''      wall: { ...wall },
      childWalls: componentWalls,
      childOpenings: componentOpenings,
    });
'''
new_drag_state = '''      wall: { ...wall },
      childWalls: componentWalls,
      childOpenings: componentOpenings,
      childSymbols: componentSymbols,
    });
'''
# specifically first occurrence after standalone wall comment
pos = text.find('// Walls that already belong to a room keep their room editing semantics.')
idx = text.find(old_drag_state, pos)
if idx < 0:
    raise SystemExit('wall drag state block not found')
text = text[:idx] + text[idx:].replace(old_drag_state, new_drag_state, 1)

# Drag update symbols.
old_wall_maps = '''        const openingOrigins = new Map<string, FloorPlanOpening>(
          (elementDrag.childOpenings || []).map((item) => [item.id, item] as const)
        );
'''
new_wall_maps = old_wall_maps + '''        const symbolOrigins = new Map<string, FloorPlanSymbol>(
          (elementDrag.childSymbols || []).map((item) => [item.id, item] as const)
        );
'''
if old_wall_maps not in text:
    raise SystemExit('wall drag maps not found')
text = text.replace(old_wall_maps, new_wall_maps, 1)

old_updated_openings_end = '''        const updatedOpenings = floorPlanOpenings.map((opening) => {
          const original = openingOrigins.get(opening.id);
          return original
            ? {
                ...opening,
                xMeters: original.xMeters + appliedX,
                yMeters: original.yMeters + appliedY,
              }
            : opening;
        });

        onUpdateProjectData({
'''
new_updated_openings_end = '''        const updatedOpenings = floorPlanOpenings.map((opening) => {
          const original = openingOrigins.get(opening.id);
          return original
            ? {
                ...opening,
                xMeters: original.xMeters + appliedX,
                yMeters: original.yMeters + appliedY,
              }
            : opening;
        });
        const updatedSymbols = floorPlanSymbols.map((symbol) => {
          const original = symbolOrigins.get(symbol.id);
          return original
            ? {
                ...symbol,
                xMeters: original.xMeters + appliedX,
                yMeters: original.yMeters + appliedY,
              }
            : symbol;
        });

        onUpdateProjectData({
'''
if old_updated_openings_end not in text:
    raise SystemExit('wall opening update block not found')
text = text.replace(old_updated_openings_end, new_updated_openings_end, 1)

old_wall_commit_symbols = '''            symbols: floorPlanSymbols,
            conduits: floorPlanConduits,
            openings: updatedOpenings,
            walls: updatedWalls,
'''
new_wall_commit_symbols = '''            symbols: updatedSymbols,
            conduits: floorPlanConduits,
            openings: updatedOpenings,
            walls: updatedWalls,
'''
# Find after wall drag branch.
pos = text.find("if (elementDrag.kind === 'wall' && elementDrag.wall)")
idx = text.find(old_wall_commit_symbols, pos)
if idx < 0:
    raise SystemExit('wall drag commit arrays not found')
text = text[:idx] + text[idx:].replace(old_wall_commit_symbols, new_wall_commit_symbols, 1)

# Add buttons to editing panel before thickness select.
panel_anchor = '''              <select
                value={wall.thicknessMeters || wallThicknessMeters}
'''
panel_buttons = r'''              <div className="flex items-center gap-1 border-l border-slate-400 pl-3">
                <span className="font-bold">APARAR</span>
                <button onClick={() => trimSelectedWallEndpoint('p1')} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">P1</button>
                <button onClick={() => trimSelectedWallEndpoint('p2')} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">P2</button>
                <span className="font-bold ml-1">ESTENDER</span>
                <button onClick={() => extendSelectedWallEndpoint('p1')} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">P1</button>
                <button onClick={() => extendSelectedWallEndpoint('p2')} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">P2</button>
              </div>

              <select
                value={wall.thicknessMeters || wallThicknessMeters}
'''
if panel_anchor not in text:
    raise SystemExit('editing panel thickness select not found')
text = text.replace(panel_anchor, panel_buttons, 1)

# Update note.
old_note = '''                Mover/Girar transforma a planta conectada inteira. Comprimento/ângulo move o nó final compartilhado. OFFSET cria uma parede paralela independente.
'''
new_note = '''                Mover/Girar transforma a planta conectada inteira e leva símbolos internos. Comprimento/ângulo preserva o nó final. APARAR usa o nó interno mais próximo; ESTENDER busca a primeira parede à frente. OFFSET cria uma parede paralela independente.
'''
if old_note not in text:
    raise SystemExit('editing note not found')
text = text.replace(old_note, new_note, 1)

editor_path.write_text(text)
