from pathlib import Path
import re

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

# 1) Enrich room wall geometry with outer/inner faces and add direction-aware snapping.
pattern = re.compile(
    r"  // A room is stored by its architectural outer rectangle, while the rendered masonry\n"
    r".*?"
    r"  \}, \[roomsWithGeometry, wallThicknessMeters\]\);\n",
    re.S,
)
replacement = r'''  // A room is stored by its architectural outer rectangle, while the rendered masonry
  // grows inward. Keep axis + both physical faces so a custom wall can make a true
  // architectural butt/T connection instead of piercing through the host wall.
  const roomWallAxisSegments = useMemo(() => {
    const thickness = wallThicknessMeters;
    const half = thickness / 2;

    return roomsWithGeometry.flatMap((room) => {
      if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) {
        return [];
      }

      const left = room.x;
      const top = room.y;
      const right = room.x + room.widthMeters;
      const bottom = room.y + room.heightMeters;
      const axisLeft = left + half;
      const axisRight = right - half;
      const axisTop = top + half;
      const axisBottom = bottom - half;
      const innerLeft = left + thickness;
      const innerRight = right - thickness;
      const innerTop = top + thickness;
      const innerBottom = bottom - thickness;

      if (axisRight < axisLeft || axisBottom < axisTop) return [];

      return [
        {
          roomId: room.id,
          side: 'top' as const,
          start: { x: axisLeft, y: axisTop },
          end: { x: axisRight, y: axisTop },
          outerStart: { x: left, y: top },
          outerEnd: { x: right, y: top },
          innerStart: { x: innerLeft, y: innerTop },
          innerEnd: { x: innerRight, y: innerTop },
        },
        {
          roomId: room.id,
          side: 'bottom' as const,
          start: { x: axisLeft, y: axisBottom },
          end: { x: axisRight, y: axisBottom },
          outerStart: { x: left, y: bottom },
          outerEnd: { x: right, y: bottom },
          innerStart: { x: innerLeft, y: innerBottom },
          innerEnd: { x: innerRight, y: innerBottom },
        },
        {
          roomId: room.id,
          side: 'left' as const,
          start: { x: axisLeft, y: axisTop },
          end: { x: axisLeft, y: axisBottom },
          outerStart: { x: left, y: top },
          outerEnd: { x: left, y: bottom },
          innerStart: { x: innerLeft, y: innerTop },
          innerEnd: { x: innerLeft, y: innerBottom },
        },
        {
          roomId: room.id,
          side: 'right' as const,
          start: { x: axisRight, y: axisTop },
          end: { x: axisRight, y: axisBottom },
          outerStart: { x: right, y: top },
          outerEnd: { x: right, y: bottom },
          innerStart: { x: innerRight, y: innerTop },
          innerEnd: { x: innerRight, y: innerBottom },
        },
      ];
    });
  }, [roomsWithGeometry, wallThicknessMeters]);

  type RoomWallSnapTarget = {
    roomId: string;
    side: 'top' | 'bottom' | 'left' | 'right';
    face: 'axis' | 'inner' | 'outer';
    x: number;
    y: number;
    distance: number;
  };

  const projectPointToSegment = (
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSq = vx * vx + vy * vy;
    if (lengthSq <= 1e-9) {
      return {
        x: start.x,
        y: start.y,
        distance: Math.hypot(point.x - start.x, point.y - start.y),
      };
    }
    const t = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSq)
    );
    const x = start.x + vx * t;
    const y = start.y + vy * t;
    return { x, y, distance: Math.hypot(point.x - x, point.y - y) };
  };

  // When the direction of the custom wall is known, snap to the physical host face
  // approached by that wall. Only a near-collinear extension stays on the center axis.
  const getRoomWallSnapTarget = (
    point: { x: number; y: number },
    otherPoint?: { x: number; y: number },
    maxDistance = 0.35
  ): RoomWallSnapTarget | null => {
    let best: RoomWallSnapTarget | null = null;

    for (const segment of roomWallAxisSegments) {
      let face: RoomWallSnapTarget['face'] = 'axis';
      let targetStart = segment.start;
      let targetEnd = segment.end;

      if (otherPoint) {
        const wallDx = otherPoint.x - point.x;
        const wallDy = otherPoint.y - point.y;
        const wallLength = Math.hypot(wallDx, wallDy);
        const normalMagnitude =
          segment.side === 'top' || segment.side === 'bottom'
            ? Math.abs(wallDy)
            : Math.abs(wallDx);
        const normalRatio = wallLength > 1e-9 ? normalMagnitude / wallLength : 0;

        // A real junction at more than ~12 degrees to the host uses the approached face.
        // Near-collinear walls still join by their shared axis.
        if (normalRatio >= 0.2) {
          let useInnerFace = false;
          if (segment.side === 'top') useInnerFace = otherPoint.y >= segment.start.y;
          if (segment.side === 'bottom') useInnerFace = otherPoint.y <= segment.start.y;
          if (segment.side === 'left') useInnerFace = otherPoint.x >= segment.start.x;
          if (segment.side === 'right') useInnerFace = otherPoint.x <= segment.start.x;

          face = useInnerFace ? 'inner' : 'outer';
          targetStart = useInnerFace ? segment.innerStart : segment.outerStart;
          targetEnd = useInnerFace ? segment.innerEnd : segment.outerEnd;
        }
      }

      const projection = projectPointToSegment(point, targetStart, targetEnd);
      if (
        projection.distance <= maxDistance &&
        (!best || projection.distance < best.distance - 1e-6)
      ) {
        best = {
          roomId: segment.roomId,
          side: segment.side,
          face,
          x: projection.x,
          y: projection.y,
          distance: projection.distance,
        };
      }
    }

    return best;
  };

  const normalizeWallRoomConnections = (wall: FloorPlanWall): FloorPlanWall => {
    const maxDistance = Math.max(0.4, wallThicknessMeters * 2.5);
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };
    const startTarget = getRoomWallSnapTarget(start, end, maxDistance);
    const endTarget = getRoomWallSnapTarget(end, start, maxDistance);

    return {
      ...wall,
      x1Meters: startTarget?.x ?? wall.x1Meters,
      y1Meters: startTarget?.y ?? wall.y1Meters,
      x2Meters: endTarget?.x ?? wall.x2Meters,
      y2Meters: endTarget?.y ?? wall.y2Meters,
    };
  };

  // Silently migrate walls saved by the previous center-axis implementation. This fixes
  // existing drawings as soon as they reopen, without adding a fake Ctrl+Z history entry.
  const roomWallMigrationSignatureRef = useRef('');
  useEffect(() => {
    if (elementDrag || draggingWallHandle || isDrawingWall || floorPlanWalls.length === 0) return;

    const migratedWalls = floorPlanWalls.map(normalizeWallRoomConnections);
    const changed = migratedWalls.some((wall, index) => {
      const previous = floorPlanWalls[index];
      return (
        Math.abs(wall.x1Meters - previous.x1Meters) > 1e-6 ||
        Math.abs(wall.y1Meters - previous.y1Meters) > 1e-6 ||
        Math.abs(wall.x2Meters - previous.x2Meters) > 1e-6 ||
        Math.abs(wall.y2Meters - previous.y2Meters) > 1e-6
      );
    });
    if (!changed) return;

    const signature = JSON.stringify(
      migratedWalls.map((wall) => [wall.id, wall.x1Meters, wall.y1Meters, wall.x2Meters, wall.y2Meters])
    );
    if (roomWallMigrationSignatureRef.current === signature) return;
    roomWallMigrationSignatureRef.current = signature;

    commitProjectData({
      ...projectData,
      floorPlan: {
        ...(projectData.floorPlan || {
          scalePixelsPerMeter: scalePxPerMeter,
          gridSnapMeters,
          symbols: floorPlanSymbols,
          conduits: floorPlanConduits,
          openings: floorPlanOpenings,
        }),
        walls: migratedWalls,
      },
    });
  }, [
    floorPlanWalls,
    roomsWithGeometry,
    wallThicknessMeters,
    elementDrag,
    draggingWallHandle,
    isDrawingWall,
  ]);
'''
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'room wall geometry replacement count={count}'

# 2) Replace old center-axis room snapping with approached-face snapping.
pattern = re.compile(
    r"    // 2\. Snap to the real center axes of room masonry\.\n"
    r".*?"
    r"    // 3\. Snap to Custom Wall Endpoints and Lines\n",
    re.S,
)
replacement = r'''    // 2. Snap to the physical face of room masonry approached by the custom wall.
    // On initial mouse-down (no direction yet), keep the center axis as a neutral anchor;
    // the final wall is normalized to the correct face on commit.
    const roomSnap = getRoomWallSnapTarget(snapProbe, startPos ?? undefined, minDistance);
    if (roomSnap && roomSnap.distance <= minDistance) {
      minDistance = roomSnap.distance;
      x = roomSnap.x;
      y = roomSnap.y;
      isSnapped = true;
      snapInfo =
        roomSnap.face === 'axis'
          ? `⚡ Eixo da parede do cômodo (${roomSnap.side})`
          : `⚡ Face ${roomSnap.face === 'inner' ? 'interna' : 'externa'} da parede (${roomSnap.side})`;
      snapTargetPoint = { x: roomSnap.x, y: roomSnap.y };
    }

    // 3. Snap to Custom Wall Endpoints and Lines
'''
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'smart snap replacement count={count}'

# 3) Normalize both endpoints to the approached room face before persisting a new wall.
pattern = re.compile(
    r"    if \(isDrawingWall && wallStartPos && wallCurrentPos\) \{\n"
    r"      const dx = wallCurrentPos\.x - wallStartPos\.x;\n"
    r"      const dy = wallCurrentPos\.y - wallStartPos\.y;\n"
    r"      const dist = Math\.hypot\(dx, dy\);\n\n"
    r"      if \(dist >= 0\.1\) \{\n"
    r"        const newWall: FloorPlanWall = \{\n"
    r"          id: `wall_\$\{Date\.now\(\)\}`,\n"
    r"          x1Meters: wallStartPos\.x,\n"
    r"          y1Meters: wallStartPos\.y,\n"
    r"          x2Meters: wallCurrentPos\.x,\n"
    r"          y2Meters: wallCurrentPos\.y,\n"
    r"          thicknessMeters: wallThicknessMeters,\n"
    r"          label: `Parede \$\{floorPlanWalls\.length \+ 1\} \(\$\{dist\.toFixed\(2\)\}m\)`,\n"
    r"        \};\n\n"
    r"        onUpdateProjectData\(\{",
    re.S,
)
replacement = r'''    if (isDrawingWall && wallStartPos && wallCurrentPos) {
      const draftWall: FloorPlanWall = {
        id: `wall_${Date.now()}`,
        x1Meters: wallStartPos.x,
        y1Meters: wallStartPos.y,
        x2Meters: wallCurrentPos.x,
        y2Meters: wallCurrentPos.y,
        thicknessMeters: wallThicknessMeters,
        label: '',
      };
      const normalizedWall = normalizeWallRoomConnections(draftWall);
      const dx = normalizedWall.x2Meters - normalizedWall.x1Meters;
      const dy = normalizedWall.y2Meters - normalizedWall.y1Meters;
      const dist = Math.hypot(dx, dy);

      if (dist >= 0.1) {
        const newWall: FloorPlanWall = {
          ...normalizedWall,
          label: `Parede ${floorPlanWalls.length + 1} (${dist.toFixed(2)}m)`,
        };

        onUpdateProjectData({'''
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'wall commit replacement count={count}'

# 4) Replace boolean-only endpoint detection with typed room/custom junction detection.
pattern = re.compile(
    r"  const isWallEndpointConnected = useCallback\(\n"
    r".*?"
    r"  \);\n\n  // Render Conduit Lines",
    re.S,
)
replacement = r'''  const getRoomWallEndpointConnection = (
    wall: FloorPlanWall,
    point: { x: number; y: number },
    otherPoint: { x: number; y: number }
  ) => {
    const tolerance = Math.max(0.08, wallThicknessMeters * 0.8, gridSnapMeters * 0.35);
    return getRoomWallSnapTarget(point, otherPoint, tolerance);
  };

  const getCustomWallEndpointConnection = (
    wall: FloorPlanWall,
    point: { x: number; y: number }
  ) => {
    const tolerance = Math.max(0.04, gridSnapMeters * 0.25);
    let best: { wallId: string; distance: number } | null = null;

    for (const other of floorPlanWalls) {
      if (other.id === wall.id) continue;
      const distance = distToSegment(
        point.x,
        point.y,
        other.x1Meters,
        other.y1Meters,
        other.x2Meters,
        other.y2Meters
      );
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { wallId: other.id, distance };
      }
    }

    return best;
  };

  const isWallEndpointConnected = (wall: FloorPlanWall, point: { x: number; y: number }) => {
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };
    const isStart = Math.hypot(point.x - start.x, point.y - start.y) <= Math.hypot(point.x - end.x, point.y - end.y);
    const otherPoint = isStart ? end : start;
    return Boolean(
      getRoomWallEndpointConnection(wall, point, otherPoint) ||
      getCustomWallEndpointConnection(wall, point)
    );
  };

  // Render Conduit Lines'''
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'endpoint connection replacement count={count}'

# 5) Replace the broad room-wall overlay (which pierced the host) with a face-only seam cut.
pattern = re.compile(
    r"\n\s*\{/\* Merge a custom wall into room/custom masonry before drawing its technical faces\."
    r".*?"
    r"\n\s*\{/\* Custom walls always draw both faces\. End caps disappear only at real wall connections\. \*/\}",
    re.S,
)
replacement = r'''
                {/* Architectural T/L junctions with room walls: erase ONLY the contacted host
                    face in the exact projected width of the incoming wall. The opposite host
                    face stays continuous, matching conventional floor-plan drafting. */}
                {floorPlanWalls.flatMap((w) => {
                  const thickPx = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const wallDx = w.x2Meters - w.x1Meters;
                  const wallDy = w.y2Meters - w.y1Meters;
                  const wallLength = Math.hypot(wallDx, wallDy);
                  if (wallLength < 1e-9) return [];

                  const makeSeamCut = (
                    point: { x: number; y: number },
                    otherPoint: { x: number; y: number },
                    endpointKey: string
                  ) => {
                    const connection = getRoomWallEndpointConnection(w, point, otherPoint);
                    if (!connection || connection.face === 'axis') return null;

                    const ux = wallDx / wallLength;
                    const uy = wallDy / wallLength;
                    const normalComponent =
                      connection.side === 'top' || connection.side === 'bottom'
                        ? Math.abs(uy)
                        : Math.abs(ux);
                    const halfGap = thickPx / (2 * Math.max(0.25, normalComponent)) + 2.5;
                    const tx = connection.side === 'top' || connection.side === 'bottom' ? 1 : 0;
                    const ty = connection.side === 'left' || connection.side === 'right' ? 1 : 0;
                    const cx = connection.x * scalePxPerMeter;
                    const cy = connection.y * scalePxPerMeter;

                    return (
                      <g key={`room-junction-cut-${w.id}-${endpointKey}`} strokeLinecap="square" pointerEvents="none">
                        <line
                          x1={cx - tx * halfGap}
                          y1={cy - ty * halfGap}
                          x2={cx + tx * halfGap}
                          y2={cy + ty * halfGap}
                          stroke="#CBD5E1"
                          strokeWidth="6"
                        />
                        <line
                          x1={cx - tx * halfGap}
                          y1={cy - ty * halfGap}
                          x2={cx + tx * halfGap}
                          y2={cy + ty * halfGap}
                          stroke="url(#wallMasonryPattern)"
                          strokeWidth="4"
                          opacity="0.65"
                        />
                      </g>
                    );
                  };

                  return [
                    makeSeamCut(
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters },
                      'start'
                    ),
                    makeSeamCut(
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters },
                      'end'
                    ),
                  ];
                })}

                {/* Custom-to-custom junctions keep a local masonry bridge. Room connections
                    are intentionally excluded here so the incoming wall never paints through
                    the entire thickness of the room wall. */}
                {floorPlanWalls.map((w) => {
                  const startPoint = { x: w.x1Meters, y: w.y1Meters };
                  const endPoint = { x: w.x2Meters, y: w.y2Meters };
                  const startRoom = getRoomWallEndpointConnection(w, startPoint, endPoint);
                  const endRoom = getRoomWallEndpointConnection(w, endPoint, startPoint);
                  const startCustom = startRoom ? null : getCustomWallEndpointConnection(w, startPoint);
                  const endCustom = endRoom ? null : getCustomWallEndpointConnection(w, endPoint);
                  if (!startCustom && !endCustom) return null;

                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return null;

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const h = thick / 2;
                  const startExtension = startCustom ? h + 1 : 0;
                  const endExtension = endCustom ? h + 1 : 0;
                  const p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  const p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  const p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  const p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };
                  const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;

                  return (
                    <g key={`custom-junction-fill-${w.id}`} stroke="none" pointerEvents="none">
                      <path d={d} fill="#CBD5E1" />
                      <path d={d} fill="url(#wallMasonryPattern)" opacity="0.65" />
                    </g>
                  );
                })}

                {/* Custom walls always draw both faces. End caps disappear only at real wall connections. */}'''
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'junction overlay replacement count={count}'

# 6) Room-hosted endpoints stop at the contacted face; only custom-to-custom junctions extend through.
old = r'''                  const startConnected = isWallEndpointConnected(w, {
                    x: w.x1Meters,
                    y: w.y1Meters,
                  });
                  const endConnected = isWallEndpointConnected(w, {
                    x: w.x2Meters,
                    y: w.y2Meters,
                  });

                  // Connected faces run through the host wall centerline up to its far face.
                  // This removes the small visual notch that remained even after snapping axes.
                  const startExtension = startConnected ? h : 0;
                  const endExtension = endConnected ? h : 0;'''
new = r'''                  const startPoint = { x: w.x1Meters, y: w.y1Meters };
                  const endPoint = { x: w.x2Meters, y: w.y2Meters };
                  const startRoomConnection = getRoomWallEndpointConnection(w, startPoint, endPoint);
                  const endRoomConnection = getRoomWallEndpointConnection(w, endPoint, startPoint);
                  const startCustomConnection = startRoomConnection
                    ? null
                    : getCustomWallEndpointConnection(w, startPoint);
                  const endCustomConnection = endRoomConnection
                    ? null
                    : getCustomWallEndpointConnection(w, endPoint);
                  const startConnected = Boolean(startRoomConnection || startCustomConnection);
                  const endConnected = Boolean(endRoomConnection || endCustomConnection);

                  // A room junction terminates exactly on the approached physical face.
                  // Only a custom-to-custom junction extends half a thickness through the node.
                  const startExtension = startCustomConnection ? h : 0;
                  const endExtension = endCustomConnection ? h : 0;'''
if old not in text:
    raise AssertionError('custom outline connection block not found')
text = text.replace(old, new, 1)

path.write_text(text)
print('architectural room junction refactor applied')
