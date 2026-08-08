from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'Pattern not found: {label}')
    text = text.replace(old, new, 1)
    print(f'{label}: ok')

old = """    // 3. Snap to Custom Wall Endpoints and Lines
    for (const w of floorPlanWalls) {
      if (w.id === ignoreWallId) continue;
      const endpoints = [
        { x: w.x1Meters, y: w.y1Meters },
        { x: w.x2Meters, y: w.y2Meters },
      ];

      for (const ep of endpoints) {
        const d = Math.hypot(x - ep.x, y - ep.y);
        if (d < minDistance) {
          minDistance = d;
          x = ep.x;
          y = ep.y;
          isSnapped = true;
          snapInfo = '⚡ Snap ao Vértice da Parede';
          snapTargetPoint = { x: ep.x, y: ep.y };
        }
      }

      if (!snapTargetPoint) {
        if (w.x1Meters === w.x2Meters && Math.abs(x - w.x1Meters) < minDistance) {
          x = w.x1Meters;
          isSnapped = true;
          snapInfo = '⚡ Alinhado a Parede Vertical';
        }
        if (w.y1Meters === w.y2Meters && Math.abs(y - w.y1Meters) < minDistance) {
          y = w.y1Meters;
          isSnapped = true;
          snapInfo = '⚡ Alinhado a Parede Horizontal';
        }
      }
    }

    return { x, y, isSnapped, snapInfo, snapTargetPoint };
  };
"""
new = """    // 3. Snap to Custom Wall Endpoints and the exact projected point on any wall segment.
    // Endpoint priority gives true shared vertices; segment projection creates precise T-junctions,
    // including inclined walls instead of only perfectly horizontal/vertical ones.
    for (const w of floorPlanWalls) {
      if (w.id === ignoreWallId) continue;

      const endpoints = [
        { x: w.x1Meters, y: w.y1Meters },
        { x: w.x2Meters, y: w.y2Meters },
      ];

      for (const ep of endpoints) {
        const d = Math.hypot(x - ep.x, y - ep.y);
        if (d < minDistance) {
          minDistance = d;
          x = ep.x;
          y = ep.y;
          isSnapped = true;
          snapInfo = '⚡ Nó compartilhado da parede';
          snapTargetPoint = { x: ep.x, y: ep.y };
        }
      }

      if (snapTargetPoint) continue;

      const vx = w.x2Meters - w.x1Meters;
      const vy = w.y2Meters - w.y1Meters;
      const lengthSq = vx * vx + vy * vy;
      if (lengthSq < 1e-8) continue;

      const tRaw = ((x - w.x1Meters) * vx + (y - w.y1Meters) * vy) / lengthSq;
      const t = Math.max(0, Math.min(1, tRaw));
      const projected = {
        x: w.x1Meters + vx * t,
        y: w.y1Meters + vy * t,
      };
      const d = Math.hypot(x - projected.x, y - projected.y);

      if (d < minDistance) {
        minDistance = d;
        x = projected.x;
        y = projected.y;
        isSnapped = true;
        snapInfo = t > 0.001 && t < 0.999
          ? '⚡ Junção T na parede'
          : '⚡ Nó compartilhado da parede';
        snapTargetPoint = { ...projected };
      }
    }

    return { x, y, isSnapped, snapInfo, snapTargetPoint };
  };
"""
replace_once(old, new, 'upgrade custom wall snapping')

old = """                  {floorPlanWalls.map((w) => {
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

                    const p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    const p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    const p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    const p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    return <path key={`fill-wall-${w.id}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`} />;
                  })}
"""
new = """                  {floorPlanWalls.map((w) => {
                    const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                    return (
                      <line
                        key={`fill-wall-${w.id}`}
                        x1={w.x1Meters * scalePxPerMeter}
                        y1={w.y1Meters * scalePxPerMeter}
                        x2={w.x2Meters * scalePxPerMeter}
                        y2={w.y2Meters * scalePxPerMeter}
                        stroke="#E4E4E7"
                        strokeWidth={thick}
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                      />
                    );
                  })}
"""
replace_once(old, new, 'merge wall core fill strokes')

old = """                  {floorPlanWalls.map((w) => {
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

                    const p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    const p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    const p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    const p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    return <path key={`hatch-wall-${w.id}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`} />;
                  })}
"""
new = """                  {floorPlanWalls.map((w) => {
                    const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                    return (
                      <line
                        key={`hatch-wall-${w.id}`}
                        x1={w.x1Meters * scalePxPerMeter}
                        y1={w.y1Meters * scalePxPerMeter}
                        x2={w.x2Meters * scalePxPerMeter}
                        y2={w.y2Meters * scalePxPerMeter}
                        stroke="url(#wallMasonryPattern)"
                        strokeWidth={thick}
                        strokeLinecap="square"
                      />
                    );
                  })}
"""
replace_once(old, new, 'merge wall hatch strokes')

old = """                {/* Custom Wall Border Strokes */}
                {floorPlanWalls.map((w) => {
                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const isSelected = selectedWallIds.includes(w.id);

                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return null;

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const h = thick / 2;

                  const sp1 = { x: x1 + nx * h, y: y1 + ny * h };
                  const sp2 = { x: x2 + nx * h, y: y2 + ny * h };
                  const sp3 = { x: x2 - nx * h, y: y2 - ny * h };
                  const sp4 = { x: x1 - nx * h, y: y1 - ny * h };

                  return (
                    <path
                      key={`stroke-wall-${w.id}`}
                      d={`M ${sp1.x} ${sp1.y} L ${sp2.x} ${sp2.y} L ${sp3.x} ${sp3.y} L ${sp4.x} ${sp4.y} Z`}
                      fill="none"
                      stroke="#141414"
                      strokeWidth={isSelected ? '3.5' : '2'}
                      strokeLinecap="square"
                    />
                  );
                })}
"""
new = """                {/* Custom Wall Border Strokes: draw every outline first. */}
                {floorPlanWalls.map((w) => {
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const isSelected = selectedWallIds.includes(w.id);
                  return (
                    <line
                      key={`stroke-wall-${w.id}`}
                      x1={w.x1Meters * scalePxPerMeter}
                      y1={w.y1Meters * scalePxPerMeter}
                      x2={w.x2Meters * scalePxPerMeter}
                      y2={w.y2Meters * scalePxPerMeter}
                      stroke="#141414"
                      strokeWidth={thick + (isSelected ? 5 : 4)}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                  );
                })}
              </g>

              {/* LAYER 3B: Paint every custom-wall core after all outlines.
                  This removes internal seams at L, T and X junctions. */}
              <g id="merged-custom-wall-cores" pointerEvents="none">
                {floorPlanWalls.map((w) => {
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  return (
                    <g key={`merged-core-${w.id}`}>
                      <line
                        x1={w.x1Meters * scalePxPerMeter}
                        y1={w.y1Meters * scalePxPerMeter}
                        x2={w.x2Meters * scalePxPerMeter}
                        y2={w.y2Meters * scalePxPerMeter}
                        stroke="#E4E4E7"
                        strokeWidth={thick}
                        strokeLinecap="square"
                      />
                      <line
                        x1={w.x1Meters * scalePxPerMeter}
                        y1={w.y1Meters * scalePxPerMeter}
                        x2={w.x2Meters * scalePxPerMeter}
                        y2={w.y2Meters * scalePxPerMeter}
                        stroke="url(#wallMasonryPattern)"
                        strokeOpacity="0.4"
                        strokeWidth={thick}
                        strokeLinecap="square"
                      />
                    </g>
                  );
                })}
"""
replace_once(old, new, 'paint merged custom wall outlines and cores')

replace_once(
    """              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}
""",
    """              </g>

              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}
""",
    'close merged wall core layer',
)

replace_once(
    """    } else if (isDrawingWall && wallStartPos) {
      const snap = getSmartWallCoords(coords, wallStartPos, e.shiftKey);
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
""",
    """    } else if (isDrawingWall && wallStartPos) {
      const snap = getSmartWallCoords(coords, wallStartPos, e.shiftKey);
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
      if (snap.snapInfo) setToolStatus(snap.snapInfo);
""",
    'surface junction snap feedback',
)

path.write_text(text)
print('Wall junction refactor applied successfully.')
