from pathlib import Path
import re

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

# 1) Remove the global mask. It was clipping valid wall borders along with junction seams.
text, count = re.subn(
    r'\n\s*\{\/\* Seamless Wall Junction Mask \(erases strokes passing through intersecting wall cavities\) \*\/\}\n\s*<mask id="wall-stroke-mask"[\s\S]*?<\/mask>',
    '',
    text,
    count=1,
)
if count != 1:
    raise SystemExit('wall-stroke-mask block not found')

# 2) Add a geometry helper so custom wall end caps are hidden only at real connections.
marker = '  // Render Conduit Lines\n'
helper = r'''  const isWallEndpointConnected = useCallback(
    (wall: FloorPlanWall, point: { x: number; y: number }) => {
      const tolerance = Math.max(0.04, gridSnapMeters * 0.25);

      const distanceToSegment = (
        p: { x: number; y: number },
        a: { x: number; y: number },
        b: { x: number; y: number }
      ) => {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const lengthSq = vx * vx + vy * vy;
        if (lengthSq <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSq));
        const px = a.x + vx * t;
        const py = a.y + vy * t;
        return Math.hypot(p.x - px, p.y - py);
      };

      const touchesCustomWall = floorPlanWalls.some((other) => {
        if (other.id === wall.id) return false;
        return (
          distanceToSegment(
            point,
            { x: other.x1Meters, y: other.y1Meters },
            { x: other.x2Meters, y: other.y2Meters }
          ) <= tolerance
        );
      });
      if (touchesCustomWall) return true;

      return roomsWithGeometry.some((room) => {
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
  );

'''
if marker not in text:
    raise SystemExit('Render Conduit marker not found')
text = text.replace(marker, helper + marker, 1)

# 3) Replace the masked outline layer with explicit continuous outlines.
pattern = re.compile(
    r'\n\s*\{\/\* LAYER 3: Masked Outer Wall Outline Strokes \(Seamless Open Junctions\) \*\/\}[\s\S]*?\n\s*<\/g>\n\n\s*\{\/\* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas \*\/\}',
    re.M,
)
replacement = r'''
              {/* LAYER 3: Continuous Technical Wall Outlines */}
              <g id="continuous-wall-outlines" fill="none" stroke="#141414" strokeLinejoin="miter">
                {/* Room walls keep complete outer and inner black contours. */}
                {roomsWithGeometry.map((room) => {
                  const rx = room.x! * scalePxPerMeter;
                  const ry = room.y! * scalePxPerMeter;
                  const rw = room.widthMeters! * scalePxPerMeter;
                  const rh = room.heightMeters! * scalePxPerMeter;
                  const wallPx = wallThicknessMeters * scalePxPerMeter;
                  const isSelected = selectedRoomIds.includes(room.id);
                  const strokeWidth = isSelected ? 3.5 : 2;

                  return (
                    <g key={`outline-room-${room.id}`} strokeWidth={strokeWidth}>
                      <rect x={rx} y={ry} width={rw} height={rh} />
                      {rw > wallPx * 2 && rh > wallPx * 2 && (
                        <rect
                          x={rx + wallPx}
                          y={ry + wallPx}
                          width={rw - wallPx * 2}
                          height={rh - wallPx * 2}
                        />
                      )}
                    </g>
                  );
                })}

                {/* Custom walls always draw both faces. End caps disappear only at real wall connections. */}
                {floorPlanWalls.map((w) => {
                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const isSelected = selectedWallIds.includes(w.id);
                  const strokeWidth = isSelected ? 3.5 : 2;

                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return null;

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const h = thick / 2;

                  const p1 = { x: x1 + nx * h, y: y1 + ny * h };
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

                  return (
                    <g key={`outline-wall-${w.id}`} strokeWidth={strokeWidth} strokeLinecap="square">
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
                      <line x1={p4.x} y1={p4.y} x2={p3.x} y2={p3.y} />
                      {!startConnected && <line x1={p1.x} y1={p1.y} x2={p4.x} y2={p4.y} />}
                      {!endConnected && <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} />}
                    </g>
                  );
                })}
              </g>

              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('masked wall outline layer not found')

path.write_text(text)
print('Continuous wall outlines applied.')
