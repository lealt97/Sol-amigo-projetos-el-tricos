from pathlib import Path

engine_path = Path('src/utils/wallCadEngine.ts')
engine = engine_path.read_text()

if 'export interface WallSelectionBounds' not in engine:
    engine += r'''

export interface WallSelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  center: CadPoint;
}

export const getWallSelectionBounds = (
  walls: FloorPlanWall[],
  wallIds?: Iterable<string>
): WallSelectionBounds | null => {
  const idSet = wallIds ? new Set(wallIds) : null;
  const selected = idSet ? walls.filter((wall) => idSet.has(wall.id)) : walls;
  if (selected.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  selected.forEach((wall) => {
    minX = Math.min(minX, wall.x1Meters, wall.x2Meters);
    minY = Math.min(minY, wall.y1Meters, wall.y2Meters);
    maxX = Math.max(maxX, wall.x1Meters, wall.x2Meters);
    maxY = Math.max(maxY, wall.y1Meters, wall.y2Meters);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
};

/** Translate only the requested wall axes. Internal shared nodes remain bit-identical. */
export const translateWallSelection = (
  walls: FloorPlanWall[],
  wallIds: Iterable<string>,
  dxMeters: number,
  dyMeters: number
): FloorPlanWall[] => {
  const ids = new Set(wallIds);
  if (!Number.isFinite(dxMeters) || !Number.isFinite(dyMeters)) return walls.map((wall) => ({ ...wall }));
  return walls.map((wall) =>
    ids.has(wall.id)
      ? {
          ...wall,
          x1Meters: wall.x1Meters + dxMeters,
          y1Meters: wall.y1Meters + dyMeters,
          x2Meters: wall.x2Meters + dxMeters,
          y2Meters: wall.y2Meters + dyMeters,
        }
      : { ...wall }
  );
};

export const rotatePointAround = (point: CadPoint, pivot: CadPoint, angleDeg: number): CadPoint => {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
};

/** Rotate a selected wall network around an explicit pivot or its bounding-box center. */
export const rotateWallSelection = (
  walls: FloorPlanWall[],
  wallIds: Iterable<string>,
  angleDeg: number,
  pivot?: CadPoint
): FloorPlanWall[] => {
  const ids = new Set(wallIds);
  if (!Number.isFinite(angleDeg) || ids.size === 0) return walls.map((wall) => ({ ...wall }));
  const center = pivot || getWallSelectionBounds(walls, ids)?.center;
  if (!center) return walls.map((wall) => ({ ...wall }));
  return walls.map((wall) => {
    if (!ids.has(wall.id)) return { ...wall };
    const p1 = rotatePointAround(wallStart(wall), center, angleDeg);
    const p2 = rotatePointAround(wallEnd(wall), center, angleDeg);
    return {
      ...wall,
      x1Meters: p1.x,
      y1Meters: p1.y,
      x2Meters: p2.x,
      y2Meters: p2.y,
    };
  });
};

/** Create the centerline geometry of a parallel wall. Positive distance uses the stored left normal. */
export const offsetWallCenterline = (
  wall: FloorPlanWall,
  distanceMeters: number
): FloorPlanWall | null => {
  if (!Number.isFinite(distanceMeters)) return null;
  const direction = normalizeVector({
    x: wall.x2Meters - wall.x1Meters,
    y: wall.y2Meters - wall.y1Meters,
  });
  if (!direction) return null;
  const normal = { x: -direction.y, y: direction.x };
  return {
    ...wall,
    x1Meters: wall.x1Meters + normal.x * distanceMeters,
    y1Meters: wall.y1Meters + normal.y * distanceMeters,
    x2Meters: wall.x2Meters + normal.x * distanceMeters,
    y2Meters: wall.y2Meters + normal.y * distanceMeters,
  };
};

/** Set P2 by exact architectural length/angle while keeping P1 fixed. */
export const setWallEndByLengthAngle = (
  wall: FloorPlanWall,
  lengthMeters: number,
  angleDeg: number
): FloorPlanWall => {
  const constrained = applyWallPrecisionConstraints(
    wallStart(wall),
    wallEnd(wall),
    { lockedLengthMeters: lengthMeters, lockedAngleDeg: angleDeg }
  );
  return {
    ...wall,
    x2Meters: constrained.point.x,
    y2Meters: constrained.point.y,
  };
};
'''
    engine_path.write_text(engine)

reg_path = Path('scripts/wall-cad-regression.ts')
reg = reg_path.read_text()
for name, after in [
    ('getWallSelectionBounds', '  getConnectedWallIds,\n'),
    ('translateWallSelection', '  getWallSelectionBounds,\n'),
    ('rotateWallSelection', '  translateWallSelection,\n'),
    ('offsetWallCenterline', '  rotateWallSelection,\n'),
    ('setWallEndByLengthAngle', '  offsetWallCenterline,\n'),
]:
    if name not in reg:
        reg = reg.replace(after, after + f'  {name},\n', 1)

if '25 cenários críticos' not in reg:
    marker = "console.log('wall-cad-regression: 20 cenários críticos passaram');"
    extra = r'''
// 21) Translação exata preserva comprimentos e nós internos da rede selecionada.
{
  const walls = [wall('a', 0, 0, 2, 0), wall('b', 2, 0, 2, 2)];
  const moved = translateWallSelection(walls, ['a', 'b'], 1.25, -0.5);
  assert.ok(Math.hypot(moved[0].x2Meters - moved[1].x1Meters, moved[0].y2Meters - moved[1].y1Meters) < 1e-9);
  assert.ok(Math.abs(Math.hypot(moved[0].x2Meters - moved[0].x1Meters, moved[0].y2Meters - moved[0].y1Meters) - 2) < 1e-9);
}

// 22) Rotação de 90° de um retângulo preserva área, perímetro e fechamento.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
  ];
  const rotated = rotateWallSelection(walls, walls.map((item) => item.id), 90);
  const loops = findClosedWallPerimeters(rotated);
  assert.equal(loops.length, 1);
  assert.ok(Math.abs(loops[0].areaSquareMeters - 12) < 1e-8);
  assert.ok(Math.abs(loops[0].perimeterMeters - 14) < 1e-8);
}

// 23) Offset mantém comprimento e paralelismo com distância assinada exata.
{
  const source = wall('a', 0, 0, 4, 0);
  const shifted = offsetWallCenterline(source, 0.20)!;
  assert.ok(shifted);
  assert.ok(Math.abs(shifted.y1Meters - 0.20) < 1e-9);
  assert.ok(Math.abs(shifted.y2Meters - 0.20) < 1e-9);
  assert.ok(Math.abs((shifted.x2Meters - shifted.x1Meters) - 4) < 1e-9);
}

// 24) Comprimento/ângulo exatos reposicionam somente P2 de forma determinística.
{
  const edited = setWallEndByLengthAngle(wall('a', 1, 1, 5, 1), 2.5, 90);
  assert.ok(Math.abs(edited.x1Meters - 1) < 1e-9);
  assert.ok(Math.abs(edited.y1Meters - 1) < 1e-9);
  assert.ok(Math.abs(edited.x2Meters - 1) < 1e-9);
  assert.ok(Math.abs(edited.y2Meters + 1.5) < 1e-9);
}

// 25) Bounds da seleção usam todos os endpoints e centro geométrico da caixa.
{
  const walls = [wall('a', -1, 2, 3, 2), wall('b', 3, 2, 3, 6)];
  const bounds = getWallSelectionBounds(walls, ['a', 'b'])!;
  assert.deepEqual(bounds.center, { x: 1, y: 4 });
  assert.equal(bounds.minX, -1);
  assert.equal(bounds.maxY, 6);
}

console.log('wall-cad-regression: 25 cenários críticos passaram');
'''
    if marker not in reg:
        raise SystemExit('20-scenario marker not found')
    reg = reg.replace(marker, extra, 1)
reg_path.write_text(reg)

editor_path = Path('src/components/FloorPlanEditor.tsx')
text = editor_path.read_text()

# Imports.
for name, after in [
    ('getWallSelectionBounds', '  getConnectedWallIds,\n'),
    ('translateWallSelection', '  getWallSelectionBounds,\n'),
    ('rotateWallSelection', '  translateWallSelection,\n'),
    ('offsetWallCenterline', '  rotateWallSelection,\n'),
    ('setWallEndByLengthAngle', '  offsetWallCenterline,\n'),
]:
    if name not in text:
        text = text.replace(after, after + f'  {name},\n', 1)

# State for select/edit panel.
state_anchor = """  const [selectedWallIds, setSelectedWallIds] = useState<string[]>([]);
"""
state_new = state_anchor + """  const [editMoveXInput, setEditMoveXInput] = useState('0');
  const [editMoveYInput, setEditMoveYInput] = useState('0');
  const [editRotateInput, setEditRotateInput] = useState('90');
  const [editOffsetInput, setEditOffsetInput] = useState('0.15');
  const [editWallLengthInput, setEditWallLengthInput] = useState('');
  const [editWallAngleInput, setEditWallAngleInput] = useState('');
"""
if state_anchor not in text:
    raise SystemExit('selection state anchor not found')
text = text.replace(state_anchor, state_new, 1)

# Insert editing command helpers after linked endpoint helper.
helper_anchor = """  // Multi-branch nodes are solved as one topology, not as several independent L corners.
"""
helpers = r'''  const parseSignedCadNumber = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getSelectedConnectedWallIds = (): string[] => {
    const ids = new Set<string>();
    selectedWallIds.forEach((wallId) => {
      const component = getConnectedWallIds(wallGraph, wallId);
      (component.length > 0 ? component : [wallId]).forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  };

  const commitWallGeometryEdit = (walls: FloorPlanWall[], message: string) => {
    const canonical = canonicalizeWallCenterlineTopology(walls, {
      defaultThicknessMeters: wallThicknessMeters,
    });
    const analysis = analyzeWallNetwork(canonical, { defaultThicknessMeters: wallThicknessMeters });
    const hardIssue = analysis.issues.find((issue) => issue.code === 'ZERO_LENGTH' || issue.code === 'DUPLICATE');
    if (hardIssue) {
      setToolStatus(`Edição rejeitada: ${hardIssue.message}`);
      return false;
    }
    onUpdateProjectData({
      ...projectData,
      floorPlan: {
        scalePixelsPerMeter: scalePxPerMeter,
        gridSnapMeters,
        symbols: floorPlanSymbols,
        conduits: floorPlanConduits,
        openings: floorPlanOpenings,
        walls: canonical,
      },
    });
    setToolStatus(message);
    return true;
  };

  const moveSelectedWallNetworkExact = () => {
    const dx = parseSignedCadNumber(editMoveXInput);
    const dy = parseSignedCadNumber(editMoveYInput);
    if (dx === null || dy === null) {
      setToolStatus('Mover exato: informe ΔX e ΔY válidos em metros.');
      return;
    }
    const ids = getSelectedConnectedWallIds();
    if (ids.length === 0) return;
    const moved = translateWallSelection(floorPlanWalls, ids, dx, dy);
    if (commitWallGeometryEdit(moved, `Rede movida exatamente ΔX=${dx.toFixed(3)} m • ΔY=${dy.toFixed(3)} m.`)) {
      setSelectedWallIds(ids);
    }
  };

  const rotateSelectedWallNetworkExact = () => {
    const angle = parseSignedCadNumber(editRotateInput);
    if (angle === null) {
      setToolStatus('Rotação: informe um ângulo válido em graus.');
      return;
    }
    const ids = getSelectedConnectedWallIds();
    if (ids.length === 0) return;
    const bounds = getWallSelectionBounds(floorPlanWalls, ids);
    if (!bounds) return;
    const rotated = rotateWallSelection(floorPlanWalls, ids, angle, bounds.center);
    if (commitWallGeometryEdit(rotated, `Rede girada ${angle.toFixed(2)}° em torno do centro da seleção.`)) {
      setSelectedWallIds(ids);
    }
  };

  const applySelectedWallExactGeometry = () => {
    if (!selectedWallId) return;
    const wall = floorPlanWalls.find((item) => item.id === selectedWallId);
    if (!wall) return;
    const currentDx = wall.x2Meters - wall.x1Meters;
    const currentDy = wall.y2Meters - wall.y1Meters;
    const currentLength = Math.hypot(currentDx, currentDy);
    const currentAngle = ((Math.atan2(-currentDy, currentDx) * 180) / Math.PI + 360) % 360;
    const length = editWallLengthInput.trim() ? parsePositiveCadNumber(editWallLengthInput) : currentLength;
    const angle = editWallAngleInput.trim() ? parseCadAngle(editWallAngleInput) : currentAngle;
    if (length === null || angle === null) {
      setToolStatus('Geometria exata: comprimento/ângulo inválidos.');
      return;
    }
    const editedWall = setWallEndByLengthAngle(wall, length, angle);
    const linked = getLinkedEndpointHandles(wall.id, 'p2');
    const nextPoint = { x: editedWall.x2Meters, y: editedWall.y2Meters };
    const linkedByWall = new Map<string, 'p1' | 'p2'>(linked.map((item) => [item.wallId, item.handle] as const));
    const editedWalls = floorPlanWalls.map((item) => {
      const handle = linkedByWall.get(item.id);
      if (!handle) return item;
      return handle === 'p1'
        ? { ...item, x1Meters: nextPoint.x, y1Meters: nextPoint.y }
        : { ...item, x2Meters: nextPoint.x, y2Meters: nextPoint.y };
    });
    if (commitWallGeometryEdit(
      editedWalls,
      `Parede ajustada para ${length.toFixed(3)} m • ${(((angle % 360) + 360) % 360).toFixed(2)}°. Nó final preservado.`
    )) {
      setSelectedWallIds([wall.id]);
    }
  };

  const setSelectedWallThicknessExact = (thicknessMeters: number) => {
    if (!selectedWallId || !Number.isFinite(thicknessMeters) || thicknessMeters <= 0) return;
    const edited = floorPlanWalls.map((wall) =>
      wall.id === selectedWallId ? { ...wall, thicknessMeters } : wall
    );
    if (commitWallGeometryEdit(edited, `Espessura da parede: ${(thicknessMeters * 100).toFixed(0)} cm.`)) {
      setSelectedWallIds([selectedWallId]);
    }
  };

  const offsetSelectedWall = (side: 1 | -1) => {
    if (!selectedWallId) return;
    const source = floorPlanWalls.find((wall) => wall.id === selectedWallId);
    const distanceMeters = parsePositiveCadNumber(editOffsetInput);
    if (!source || distanceMeters === null) {
      setToolStatus('OFFSET: selecione uma parede e informe uma distância positiva.');
      return;
    }
    const offset = offsetWallCenterline(source, distanceMeters * side);
    if (!offset) return;
    const timestamp = Date.now();
    const newWall: FloorPlanWall = {
      ...offset,
      id: `wall_offset_${timestamp}`,
      roomId: undefined,
      groupId: `wallgrp_wall_offset_${timestamp}`,
      label: `${source.label || 'Parede'} • offset ${distanceMeters.toFixed(3)}m`,
    };
    if (commitWallGeometryEdit(
      [...floorPlanWalls, newWall],
      `OFFSET ${side > 0 ? '+' : '−'}${distanceMeters.toFixed(3)} m criado paralelo à parede.`
    )) {
      setSelectedWallIds([newWall.id]);
    }
  };

  // Multi-branch nodes are solved as one topology, not as several independent L corners.
'''
if helper_anchor not in text:
    raise SystemExit('editing helper anchor not found')
text = text.replace(helper_anchor, helpers, 1)

# Insert Select editing panel before draw_wall panel.
panel_anchor = """        {/* Dynamic Tool Option Panels */}
        {activeTool === 'draw_wall' && (
"""
panel = r'''        {/* Dynamic Tool Option Panels */}
        {activeTool === 'select' && selectedWallId && (() => {
          const wall = floorPlanWalls.find((item) => item.id === selectedWallId);
          if (!wall) return null;
          const dx = wall.x2Meters - wall.x1Meters;
          const dy = wall.y2Meters - wall.y1Meters;
          const length = Math.hypot(dx, dy);
          const angle = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
          const networkIds = getSelectedConnectedWallIds();
          return (
            <div className="border border-[#141414] bg-slate-50 p-2.5 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-black uppercase">Editar CAD:</span>
              <div className="border border-[#141414] bg-white px-2 py-1 font-mono font-bold">
                Segmento {length.toFixed(3)} m • {angle.toFixed(2)}° • {(wall.thicknessMeters || wallThicknessMeters) * 100} cm
              </div>
              <div className="border border-blue-700 bg-blue-50 text-blue-900 px-2 py-1 font-bold">
                Rede conectada: {networkIds.length} parede(s)
              </div>

              <div className="flex items-center gap-1 border-l border-slate-400 pl-3">
                <label className="font-bold">ΔX</label>
                <input value={editMoveXInput} onChange={(e) => setEditMoveXInput(e.target.value)} className="w-16 border border-[#141414] px-1 py-1 font-mono" />
                <label className="font-bold">ΔY</label>
                <input value={editMoveYInput} onChange={(e) => setEditMoveYInput(e.target.value)} className="w-16 border border-[#141414] px-1 py-1 font-mono" />
                <button onClick={moveSelectedWallNetworkExact} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">
                  MOVER REDE
                </button>
              </div>

              <div className="flex items-center gap-1">
                <label className="font-bold">Girar</label>
                <input value={editRotateInput} onChange={(e) => setEditRotateInput(e.target.value)} className="w-16 border border-[#141414] px-1 py-1 font-mono" />
                <span>°</span>
                <button onClick={rotateSelectedWallNetworkExact} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">
                  GIRAR REDE
                </button>
              </div>

              <div className="flex items-center gap-1 border-l border-slate-400 pl-3">
                <label className="font-bold">L</label>
                <input value={editWallLengthInput} onChange={(e) => setEditWallLengthInput(e.target.value)} placeholder={length.toFixed(3)} className="w-20 border border-[#141414] px-1 py-1 font-mono" />
                <span>m</span>
                <label className="font-bold">A</label>
                <input value={editWallAngleInput} onChange={(e) => setEditWallAngleInput(e.target.value)} placeholder={angle.toFixed(2)} className="w-20 border border-[#141414] px-1 py-1 font-mono" />
                <span>°</span>
                <button onClick={applySelectedWallExactGeometry} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">
                  APLICAR SEGMENTO
                </button>
              </div>

              <select
                value={wall.thicknessMeters || wallThicknessMeters}
                onChange={(e) => setSelectedWallThicknessExact(Number(e.target.value))}
                className="border border-[#141414] bg-white px-2 py-1 font-bold"
                title="Espessura do segmento selecionado"
              >
                <option value={0.10}>10 cm</option>
                <option value={0.15}>15 cm</option>
                <option value={0.20}>20 cm</option>
                <option value={0.25}>25 cm</option>
              </select>

              <div className="flex items-center gap-1 border-l border-slate-400 pl-3">
                <label className="font-bold">OFFSET</label>
                <input value={editOffsetInput} onChange={(e) => setEditOffsetInput(e.target.value)} className="w-16 border border-[#141414] px-1 py-1 font-mono" />
                <span>m</span>
                <button onClick={() => offsetSelectedWall(-1)} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">− lado</button>
                <button onClick={() => offsetSelectedWall(1)} className="border border-[#141414] bg-white px-2 py-1 font-black hover:bg-[#141414] hover:text-white">+ lado</button>
              </div>
              <span className="text-[10px] font-bold text-slate-600">
                Mover/Girar transforma a planta conectada inteira. Comprimento/ângulo move o nó final compartilhado. OFFSET cria uma parede paralela independente.
              </span>
            </div>
          );
        })()}
        {activeTool === 'draw_wall' && (
'''
if panel_anchor not in text:
    raise SystemExit('dynamic panel anchor not found')
text = text.replace(panel_anchor, panel, 1)

editor_path.write_text(text)
