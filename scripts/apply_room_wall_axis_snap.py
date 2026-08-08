from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

anchor = """  const floorPlanSymbols = projectData.floorPlan?.symbols || [];
  const floorPlanConduits = projectData.floorPlan?.conduits || [];
  const floorPlanOpenings = projectData.floorPlan?.openings || [];
  const floorPlanWalls = projectData.floorPlan?.walls || [];

  // Snap meters to current grid
"""
insert = """  const floorPlanSymbols = projectData.floorPlan?.symbols || [];
  const floorPlanConduits = projectData.floorPlan?.conduits || [];
  const floorPlanOpenings = projectData.floorPlan?.openings || [];
  const floorPlanWalls = projectData.floorPlan?.walls || [];

  // A room is stored by its architectural outer rectangle, while the rendered masonry
  // grows inward. These segments are therefore the real center axes of each room wall.
  // Custom walls must snap to these axes (not to the outer rectangle) so both faces align.
  const roomWallAxisSegments = useMemo(() => {
    const half = wallThicknessMeters / 2;

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

      if (axisRight < axisLeft || axisBottom < axisTop) return [];

      return [
        {
          roomId: room.id,
          side: 'top' as const,
          start: { x: axisLeft, y: axisTop },
          end: { x: axisRight, y: axisTop },
        },
        {
          roomId: room.id,
          side: 'bottom' as const,
          start: { x: axisLeft, y: axisBottom },
          end: { x: axisRight, y: axisBottom },
        },
        {
          roomId: room.id,
          side: 'left' as const,
          start: { x: axisLeft, y: axisTop },
          end: { x: axisLeft, y: axisBottom },
        },
        {
          roomId: room.id,
          side: 'right' as const,
          start: { x: axisRight, y: axisTop },
          end: { x: axisRight, y: axisBottom },
        },
      ];
    });
  }, [roomsWithGeometry, wallThicknessMeters]);

  // Snap meters to current grid
"""
if anchor not in text:
    raise SystemExit('floor plan arrays anchor not found')
text = text.replace(anchor, insert, 1)

start_marker = """    // 2. Snap to Room Corners and Room Outer Walls
"""
end_marker = """    // 3. Snap to Custom Wall Endpoints and Lines
"""
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('room snap block markers not found')
new_snap = """    // 2. Snap to the real center axes of room masonry.
    // Room coordinates describe the OUTER rectangle, but its wall thickness is rendered
    // inward. Snapping to the old outer edge caused a half-thickness offset.
    const projectToSegment = (
      point: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number }
    ) => {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const lengthSq = vx * vx + vy * vy;
      if (lengthSq <= 1e-9) {
        return { x: a.x, y: a.y, distance: Math.hypot(point.x - a.x, point.y - a.y) };
      }
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / lengthSq));
      const projected = { x: a.x + vx * t, y: a.y + vy * t };
      return {
        ...projected,
        distance: Math.hypot(point.x - projected.x, point.y - projected.y),
      };
    };

    // Prefer the center-axis corner when the pointer is near a room corner.
    for (const segment of roomWallAxisSegments) {
      for (const corner of [segment.start, segment.end]) {
        const d = Math.hypot(x - corner.x, y - corner.y);
        if (d < minDistance) {
          minDistance = d;
          x = corner.x;
          y = corner.y;
          isSnapped = true;
          snapInfo = '⚡ Nó central da parede do cômodo';
          snapTargetPoint = { x: corner.x, y: corner.y };
        }
      }
    }

    // Then project exactly onto the nearest wall center axis, including the middle of a side.
    for (const segment of roomWallAxisSegments) {
      const projection = projectToSegment(
        { x, y },
        segment.start,
        segment.end
      );
      if (projection.distance < minDistance) {
        minDistance = projection.distance;
        x = projection.x;
        y = projection.y;
        isSnapped = true;
        snapInfo = `⚡ Eixo da parede do cômodo (${segment.side})`;
        snapTargetPoint = { x: projection.x, y: projection.y };
      }
    }

"""
text = text[:start] + new_snap + text[end:]

old_room_connection = """      return roomsWithGeometry.some((room) => {
        const left = room.x ?? 0;
        const top = room.y ?? 0;
        const right = left + (room.widthMeters ?? 0);
        const bottom = top + (room.heightMeters ?? 0);

        const withinX = point.x >= left - tolerance && point.x <= right + tolerance;
        const withinY = point.y >= top - tolerance && point.y <= bottom + tolerance;

        return (
          (withinX && (Math.abs(point.y - top) <= tolerance || Math.abs(point.y - bottom) <= tolerance)) ||
          (withinY && (Math.abs(point.x - left) <= tolerance || Math.abs(point.x - right) <= tolerance))
        );
      });
    },
    [floorPlanWalls, roomsWithGeometry, gridSnapMeters]
"""
new_room_connection = """      return roomWallAxisSegments.some(
        (segment) =>
          distanceToSegment(
            point,
            segment.start,
            segment.end
          ) <= tolerance
      );
    },
    [floorPlanWalls, roomWallAxisSegments, gridSnapMeters]
"""
if old_room_connection not in text:
    raise SystemExit('room connection block not found')
text = text.replace(old_room_connection, new_room_connection, 1)

outline_anchor = """                {/* Custom walls always draw both faces. End caps disappear only at real wall connections. */}
                {floorPlanWalls.map((w) => {
"""
junction_cleanup = """                {/* Merge a custom wall into room/custom masonry before drawing its technical faces.
                    This overlay hides the host-wall seam inside a true junction while preserving
                    the same masonry fill/hatch, so L/T connections read as one continuous wall. */}
                {floorPlanWalls.map((w) => {
                  const startConnected = isWallEndpointConnected(w, {
                    x: w.x1Meters,
                    y: w.y1Meters,
                  });
                  const endConnected = isWallEndpointConnected(w, {
                    x: w.x2Meters,
                    y: w.y2Meters,
                  });
                  if (!startConnected && !endConnected) return null;

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
                  const startExtension = startConnected ? h + 1 : 0;
                  const endExtension = endConnected ? h + 1 : 0;

                  const p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  const p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  const p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  const p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };
                  const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;

                  return (
                    <g key={`junction-fill-${w.id}`} stroke="none">
                      <path d={d} fill="#CBD5E1" />
                      <path d={d} fill="url(#wallMasonryPattern)" opacity="0.65" />
                    </g>
                  );
                })}

                {/* Custom walls always draw both faces. End caps disappear only at real wall connections. */}
                {floorPlanWalls.map((w) => {
"""
if outline_anchor not in text:
    raise SystemExit('outline anchor not found')
text = text.replace(outline_anchor, junction_cleanup, 1)

old_outline_points = """                  const p1 = { x: x1 + nx * h, y: y1 + ny * h };
                  const p2 = { x: x2 + nx * h, y: y2 + ny * h };
                  const p3 = { x: x2 - nx * h, y: y2 - ny * h };
                  const p4 = { x: x1 - nx * h, y: y1 - ny * h };

                  const startConnected = isWallEndpointConnected(w, {
                    x: w.x1Meters,
                    y: w.y1Meters,
                  });
                  const endConnected = isWallEndpointConnected(w, {
                    x: w.x2Meters,
                    y: w.y2Meters,
                  });
"""
new_outline_points = """                  const startConnected = isWallEndpointConnected(w, {
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
                  const endExtension = endConnected ? h : 0;
                  const p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  const p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  const p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  const p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };
"""
if old_outline_points not in text:
    raise SystemExit('custom wall outline point block not found')
text = text.replace(old_outline_points, new_outline_points, 1)

path.write_text(text)
print('Applied room wall axis snap and junction merge refactor')
