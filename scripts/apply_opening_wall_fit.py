from pathlib import Path
import re

editor_path = Path('src/components/FloorPlanEditor.tsx')
types_path = Path('src/types.ts')
editor = editor_path.read_text(encoding='utf-8')
types = types_path.read_text(encoding='utf-8')

# 1) Backward-compatible opening anchor metadata.
old_types = """export interface FloorPlanOpening {
  id: string;
  type: 'door' | 'window';
  xMeters: number;
  yMeters: number;
  widthMeters: number; // e.g. 0.8m for door, 1.2m for window
  orientation: 'horizontal' | 'vertical';
  roomId?: string;
  label?: string; // e.g. \"P1 - 80x210cm\", \"J1 - 120x100cm\"
}
"""
new_types = """export interface FloorPlanOpening {
  id: string;
  type: 'door' | 'window';
  // Start point of the opening on the host wall axis, in model meters.
  xMeters: number;
  yMeters: number;
  widthMeters: number; // e.g. 0.8m for door, 1.2m for window
  // Kept for backward compatibility and quick axis hints.
  orientation: 'horizontal' | 'vertical';
  // Exact host-wall geometry. Older saved projects may omit these fields.
  angleDeg?: number;
  wallId?: string;
  wallThicknessMeters?: number;
  wallPositionRatio?: number; // opening center position along a custom wall, 0..1
  roomId?: string;
  label?: string; // e.g. \"P1 - 80x210cm\", \"J1 - 120x100cm\"
}
"""
if old_types not in types:
    raise SystemExit('FloorPlanOpening interface anchor not found')
types = types.replace(old_types, new_types, 1)

# 2) Local placement type.
anchor = """interface ElementDragState {
  kind: DragElementKind;
  id: string;
  startPointer: { x: number; y: number };
  room?: Room;
  symbol?: FloorPlanSymbol;
  opening?: FloorPlanOpening;
  wall?: FloorPlanWall;
  childSymbols?: FloorPlanSymbol[];
  childOpenings?: FloorPlanOpening[];
  childWalls?: FloorPlanWall[];
}

"""
placement_type = """interface OpeningPlacement {
  x: number;
  y: number;
  orientation: 'horizontal' | 'vertical';
  angleDeg: number;
  wallThicknessMeters: number;
  wallPositionRatio: number;
  roomId?: string;
  wallId?: string;
}

"""
if anchor not in editor:
    raise SystemExit('ElementDragState anchor not found')
editor = editor.replace(anchor, anchor + placement_type, 1)

# 3) Replace axis-only opening snapping with true segment projection on wall centerlines.
pattern = re.compile(r"  const getOpeningPlacementOnWall = \(.*?\n  const selectElementForDrag", re.S)
replacement = r'''  const getOpeningPlacementOnSegment = (
    point: { x: number; y: number },
    widthMeters: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    thicknessMeters: number,
    metadata: { roomId?: string; wallId?: string } = {}
  ): (OpeningPlacement & { distance: number }) | null => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < widthMeters || length < 1e-6) return null;

    const ux = dx / length;
    const uy = dy / length;
    const rawAlong = (point.x - start.x) * ux + (point.y - start.y) * uy;
    const projectedAlong = Math.max(0, Math.min(length, rawAlong));
    const projectedX = start.x + ux * projectedAlong;
    const projectedY = start.y + uy * projectedAlong;

    const halfWidth = widthMeters / 2;
    const centerAlong = Math.max(halfWidth, Math.min(length - halfWidth, rawAlong));
    const centerX = start.x + ux * centerAlong;
    const centerY = start.y + uy * centerAlong;
    const openingStartX = centerX - ux * halfWidth;
    const openingStartY = centerY - uy * halfWidth;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    return {
      x: openingStartX,
      y: openingStartY,
      orientation: Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical',
      angleDeg,
      wallThicknessMeters: thicknessMeters,
      wallPositionRatio: length > 0 ? centerAlong / length : 0.5,
      ...metadata,
      distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    };
  };

  const getOpeningPlacementOnWall = (
    point: { x: number; y: number },
    widthMeters: number,
    maxDistanceMeters = Math.max(0.35, gridSnapMeters * 1.5)
  ): OpeningPlacement | null => {
    let best: (OpeningPlacement & { distance: number }) | null = null;
    const consider = (candidate: (OpeningPlacement & { distance: number }) | null) => {
      if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
    };

    // Room walls are drawn inward from the architectural outer rectangle, so openings
    // must sit on the centerline of that wall thickness rather than on the outer edge.
    for (const room of roomsWithGeometry) {
      if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) continue;
      const left = room.x;
      const top = room.y;
      const right = room.x + room.widthMeters;
      const bottom = room.y + room.heightMeters;
      const h = wallThicknessMeters / 2;

      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: left, y: top + h },
        { x: right, y: top + h },
        wallThicknessMeters,
        { roomId: room.id }
      ));
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: left, y: bottom - h },
        { x: right, y: bottom - h },
        wallThicknessMeters,
        { roomId: room.id }
      ));
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: left + h, y: top },
        { x: left + h, y: bottom },
        wallThicknessMeters,
        { roomId: room.id }
      ));
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: right - h, y: top },
        { x: right - h, y: bottom },
        wallThicknessMeters,
        { roomId: room.id }
      ));
    }

    // Custom walls support any angle and use their own stored thickness.
    for (const wall of floorPlanWalls) {
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: wall.x1Meters, y: wall.y1Meters },
        { x: wall.x2Meters, y: wall.y2Meters },
        wall.thicknessMeters || wallThicknessMeters,
        { wallId: wall.id }
      ));
    }

    if (!best || best.distance > maxDistanceMeters) return null;
    const { distance: _distance, ...placement } = best;
    return placement;
  };

  const getResolvedOpeningPlacement = (opening: FloorPlanOpening): OpeningPlacement => {
    // A custom-wall opening remains attached even when that wall is moved, rotated or resized.
    if (opening.wallId) {
      const wall = floorPlanWalls.find((item) => item.id === opening.wallId);
      if (wall) {
        const dx = wall.x2Meters - wall.x1Meters;
        const dy = wall.y2Meters - wall.y1Meters;
        const ratio = Math.max(0, Math.min(1, opening.wallPositionRatio ?? 0.5));
        const targetCenter = {
          x: wall.x1Meters + dx * ratio,
          y: wall.y1Meters + dy * ratio,
        };
        const anchored = getOpeningPlacementOnSegment(
          targetCenter,
          opening.widthMeters,
          { x: wall.x1Meters, y: wall.y1Meters },
          { x: wall.x2Meters, y: wall.y2Meters },
          wall.thicknessMeters || wallThicknessMeters,
          { wallId: wall.id }
        );
        if (anchored) {
          const { distance: _distance, ...placement } = anchored;
          return placement;
        }
      }
    }

    // New openings already store exact axis/angle data.
    if (Number.isFinite(opening.angleDeg)) {
      return {
        x: opening.xMeters,
        y: opening.yMeters,
        orientation: opening.orientation,
        angleDeg: opening.angleDeg ?? (opening.orientation === 'horizontal' ? 0 : 90),
        wallThicknessMeters: opening.roomId
          ? wallThicknessMeters
          : (opening.wallThicknessMeters || wallThicknessMeters),
        wallPositionRatio: opening.wallPositionRatio ?? 0.5,
        roomId: opening.roomId,
        wallId: opening.wallId,
      };
    }

    // Legacy saved projects stored room openings on the outer wall edge. Resolve them to
    // the nearest real wall centerline at render time so old drawings are fixed too.
    const legacyCenter = opening.orientation === 'horizontal'
      ? { x: opening.xMeters + opening.widthMeters / 2, y: opening.yMeters }
      : { x: opening.xMeters, y: opening.yMeters + opening.widthMeters / 2 };
    const migrated = getOpeningPlacementOnWall(
      legacyCenter,
      opening.widthMeters,
      Math.max(0.8, gridSnapMeters * 3)
    );
    if (migrated) return migrated;

    return {
      x: opening.xMeters,
      y: opening.yMeters,
      orientation: opening.orientation,
      angleDeg: opening.orientation === 'horizontal' ? 0 : 90,
      wallThicknessMeters: wallThicknessMeters,
      wallPositionRatio: 0.5,
      roomId: opening.roomId,
      wallId: opening.wallId,
    };
  };

  const selectElementForDrag'''
editor, count = pattern.subn(replacement, editor, count=1)
if count != 1:
    raise SystemExit(f'opening placement block replacement count={count}')

# 4) Start dragging from the resolved/anchored geometry, not stale legacy coordinates.
old_drag_start = """    if (kind === 'opening') {
      const opening = floorPlanOpenings.find((item) => item.id === id);
      if (!opening) return;
      setElementDrag({ kind, id, startPointer, opening: { ...opening } });
      setToolStatus(`Arrastando ${opening.type === 'door' ? 'porta' : 'janela'} sobre as paredes.`);
      return;
    }
"""
new_drag_start = """    if (kind === 'opening') {
      const opening = floorPlanOpenings.find((item) => item.id === id);
      if (!opening) return;
      const resolved = getResolvedOpeningPlacement(opening);
      setElementDrag({
        kind,
        id,
        startPointer,
        opening: { ...opening, ...resolved },
      });
      setToolStatus(`Arrastando ${opening.type === 'door' ? 'porta' : 'janela'} sobre as paredes.`);
      return;
    }
"""
if old_drag_start not in editor:
    raise SystemExit('opening drag start anchor not found')
editor = editor.replace(old_drag_start, new_drag_start, 1)

# 5) Drag center supports arbitrary wall angles.
old_center = """        const desiredX = origin.xMeters + deltaX;
        const desiredY = origin.yMeters + deltaY;
        const desiredCenter = origin.orientation === 'horizontal'
          ? { x: desiredX + origin.widthMeters / 2, y: desiredY }
          : { x: desiredX, y: desiredY + origin.widthMeters / 2 };
"""
new_center = """        const angleDeg = origin.angleDeg ?? (origin.orientation === 'horizontal' ? 0 : 90);
        const angleRad = (angleDeg * Math.PI) / 180;
        const desiredCenter = {
          x: origin.xMeters + Math.cos(angleRad) * origin.widthMeters / 2 + deltaX,
          y: origin.yMeters + Math.sin(angleRad) * origin.widthMeters / 2 + deltaY,
        };
"""
if old_center not in editor:
    raise SystemExit('opening drag center anchor not found')
editor = editor.replace(old_center, new_center, 1)

# 6) Whenever placement metadata is persisted, store exact angle/host/thickness/ratio as well.
placement_anchor = re.compile(r"(orientation: placement\.orientation,\n)(\s*)(roomId: placement\.roomId,)")
def enrich(match):
    indent = match.group(2)
    return (
        match.group(1)
        + f"{indent}angleDeg: placement.angleDeg,\n"
        + f"{indent}wallId: placement.wallId,\n"
        + f"{indent}wallThicknessMeters: placement.wallThicknessMeters,\n"
        + f"{indent}wallPositionRatio: placement.wallPositionRatio,\n"
        + indent + match.group(3)
    )
editor, enrich_count = placement_anchor.subn(enrich, editor)
if enrich_count < 3:
    raise SystemExit(f'expected at least 3 placement persistence sites, found {enrich_count}')

# 7) Replace door/window rendering with a single wall-axis transform. The white cut erases
# both black wall faces exactly across the opening width; jambs restore only the end edges.
render_pattern = re.compile(
    r"  // Architectural Render for Doors & Windows\n  const renderArchitecturalOpening = \(op: FloorPlanOpening\) => \{.*?\n  \};\n\n  // Render Electrical Symbols",
    re.S,
)
render_replacement = r'''  // Architectural Render for Doors & Windows
  const renderArchitecturalOpening = (op: FloorPlanOpening) => {
    const resolved = getResolvedOpeningPlacement(op);
    const x = resolved.x * scalePxPerMeter;
    const y = resolved.y * scalePxPerMeter;
    const w = op.widthMeters * scalePxPerMeter;
    const wallPx = resolved.wallThicknessMeters * scalePxPerMeter;
    const angleDeg = resolved.angleDeg;
    const halfWall = wallPx / 2;
    const isSelected = selectedOpeningIds.includes(op.id);

    const handleOpeningMouseDown = (e: React.MouseEvent<SVGGElement>) => {
      if (activeTool === 'select') startElementDrag('opening', op.id, e);
    };

    const cutWall = (
      <rect
        x="0"
        y={-halfWall - 2.5}
        width={w}
        height={wallPx + 5}
        fill="#FAFAFA"
        stroke="none"
        pointerEvents="none"
      />
    );

    if (op.type === 'door') {
      return (
        <g
          key={op.id}
          transform={`translate(${x}, ${y}) rotate(${angleDeg})`}
          onMouseDown={handleOpeningMouseDown}
          className="cursor-grab active:cursor-grabbing"
        >
          {/* Exact wall cut: removes both wall-face strokes only inside the opening span. */}
          {cutWall}

          {/* Jambs reconnect precisely to the two black wall faces. */}
          <line x1="0" y1={-halfWall} x2="0" y2={halfWall} stroke="#141414" strokeWidth="2.5" />
          <line x1={w} y1={-halfWall} x2={w} y2={halfWall} stroke="#141414" strokeWidth="2.5" />

          {/* Door leaf and swing arc use the same host-wall axis, including angled walls. */}
          <line x1="0" y1={halfWall} x2="0" y2={halfWall - w} stroke="#141414" strokeWidth="2.5" />
          <path
            d={`M ${w} ${halfWall} A ${w} ${w} 0 0 0 0 ${halfWall - w}`}
            fill="none"
            stroke="#141414"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />

          <text
            x={w / 2}
            y={halfWall + 14}
            fill="#141414"
            fontSize="9"
            fontWeight="black"
            textAnchor="middle"
          >
            {op.label || 'PORTA'}
          </text>

          {isSelected && (
            <rect
              x="-3"
              y={halfWall - w - 4}
              width={w + 6}
              height={w + wallPx + 21}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
          )}
        </g>
      );
    }

    return (
      <g
        key={op.id}
        transform={`translate(${x}, ${y}) rotate(${angleDeg})`}
        onMouseDown={handleOpeningMouseDown}
        className="cursor-grab active:cursor-grabbing"
      >
        {/* Window replaces the wall section instead of being drawn over an uncut wall. */}
        {cutWall}
        <line x1="0" y1={-halfWall} x2="0" y2={halfWall} stroke="#141414" strokeWidth="2" />
        <line x1={w} y1={-halfWall} x2={w} y2={halfWall} stroke="#141414" strokeWidth="2" />
        <line x1="0" y1={-wallPx / 4} x2={w} y2={-wallPx / 4} stroke="#141414" strokeWidth="1.2" />
        <line x1="0" y1={wallPx / 4} x2={w} y2={wallPx / 4} stroke="#141414" strokeWidth="1.2" />

        <text
          x={w / 2}
          y={-halfWall - 5}
          fill="#141414"
          fontSize="9"
          fontWeight="black"
          textAnchor="middle"
        >
          {op.label || 'JANELA'}
        </text>

        {isSelected && (
          <rect
            x="-3"
            y={-halfWall - 3}
            width={w + 6}
            height={wallPx + 6}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        )}
      </g>
    );
  };

  // Render Electrical Symbols'''
editor, render_count = render_pattern.subn(render_replacement, editor, count=1)
if render_count != 1:
    raise SystemExit(f'architectural render replacement count={render_count}')

editor_path.write_text(editor, encoding='utf-8')
types_path.write_text(types, encoding='utf-8')
print(f'updated opening placement/render; enriched {enrich_count} persistence sites')
