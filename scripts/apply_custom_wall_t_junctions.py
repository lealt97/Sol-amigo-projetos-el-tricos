from pathlib import Path
import re

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

# 1) Add direction-aware physical-face snapping for custom walls and normalize both room/custom connections.
anchor = "  const normalizeWallRoomConnections = (wall: FloorPlanWall): FloorPlanWall => {"
if anchor not in text:
    raise SystemExit('normalizeWallRoomConnections anchor not found')

helper = r'''  type CustomWallSnapTarget = {
    wallId: string;
    kind: 'segment' | 'endpoint';
    face: 'axis' | 'positive' | 'negative';
    x: number;
    y: number;
    distance: number;
    hostThicknessMeters: number;
    hostUx: number;
    hostUy: number;
    hostNx: number;
    hostNy: number;
  };

  // Resolve a custom-wall junction against the PHYSICAL face of the host wall.
  // Mid-segment hits become true butt/T junctions. Endpoint hits keep the shared
  // center-axis node so L/end-to-end corners continue behaving like a polyline node.
  const getCustomWallSnapTarget = (
    point: { x: number; y: number },
    otherPoint?: { x: number; y: number },
    maxDistance = 0.35,
    ignoreWallId?: string
  ): CustomWallSnapTarget | null => {
    let best: CustomWallSnapTarget | null = null;

    const consider = (candidate: CustomWallSnapTarget) => {
      if (candidate.distance > maxDistance) return;
      if (!best || candidate.distance < best.distance - 1e-6) best = candidate;
    };

    for (const host of floorPlanWalls) {
      if (host.id === ignoreWallId) continue;

      const dx = host.x2Meters - host.x1Meters;
      const dy = host.y2Meters - host.y1Meters;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;

      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy;
      const ny = ux;
      const thickness = host.thicknessMeters || wallThicknessMeters;
      const half = thickness / 2;
      const start = { x: host.x1Meters, y: host.y1Meters };
      const end = { x: host.x2Meters, y: host.y2Meters };

      // True endpoint nodes retain axis semantics. Keep their attraction local so a
      // cursor near the middle of a short wall does not jump to an endpoint.
      const endpointSnapRange = Math.min(maxDistance, Math.max(0.10, half + 0.03));
      const startDistance = Math.hypot(point.x - start.x, point.y - start.y);
      if (startDistance <= endpointSnapRange) {
        consider({
          wallId: host.id,
          kind: 'endpoint',
          face: 'axis',
          x: start.x,
          y: start.y,
          distance: startDistance,
          hostThicknessMeters: thickness,
          hostUx: ux,
          hostUy: uy,
          hostNx: nx,
          hostNy: ny,
        });
      }
      const endDistance = Math.hypot(point.x - end.x, point.y - end.y);
      if (endDistance <= endpointSnapRange) {
        consider({
          wallId: host.id,
          kind: 'endpoint',
          face: 'axis',
          x: end.x,
          y: end.y,
          distance: endDistance,
          hostThicknessMeters: thickness,
          hostUx: ux,
          hostUy: uy,
          hostNx: nx,
          hostNy: ny,
        });
      }

      const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
      const t = Math.max(0, Math.min(1, rawT));
      const endpointBand = Math.min(0.18, Math.max(0.025, (half + 0.025) / length));
      if (t <= endpointBand || t >= 1 - endpointBand) continue;

      let face: CustomWallSnapTarget['face'] = 'axis';
      let targetStart = start;
      let targetEnd = end;

      if (otherPoint) {
        const branchDx = otherPoint.x - point.x;
        const branchDy = otherPoint.y - point.y;
        const branchLength = Math.hypot(branchDx, branchDy);
        const normalRatio =
          branchLength > 1e-9
            ? Math.abs((branchDx / branchLength) * nx + (branchDy / branchLength) * ny)
            : 0;

        // A non-collinear branch terminates on the host face approached by its body.
        if (normalRatio >= 0.2) {
          const axisPoint = {
            x: start.x + ux * length * t,
            y: start.y + uy * length * t,
          };
          const signedSide = (otherPoint.x - axisPoint.x) * nx + (otherPoint.y - axisPoint.y) * ny;
          const side = signedSide >= 0 ? 1 : -1;
          face = side > 0 ? 'positive' : 'negative';
          targetStart = { x: start.x + nx * half * side, y: start.y + ny * half * side };
          targetEnd = { x: end.x + nx * half * side, y: end.y + ny * half * side };
        }
      }

      const projection = projectPointToSegment(point, targetStart, targetEnd);
      consider({
        wallId: host.id,
        kind: 'segment',
        face,
        x: projection.x,
        y: projection.y,
        distance: projection.distance,
        hostThicknessMeters: thickness,
        hostUx: ux,
        hostUy: uy,
        hostNx: nx,
        hostNy: ny,
      });
    }

    return best;
  };

'''
text = text.replace(anchor, helper + anchor, 1)

pattern = re.compile(
    r"  const normalizeWallRoomConnections = \(wall: FloorPlanWall\): FloorPlanWall => \{\n.*?\n  \};\n\n  // Silently migrate walls saved by the previous center-axis implementation\.",
    re.S,
)
replacement = r'''  const normalizeWallConnections = (wall: FloorPlanWall): FloorPlanWall => {
    const maxDistance = Math.max(0.4, wallThicknessMeters * 2.5);
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };

    const resolveEndpoint = (
      point: { x: number; y: number },
      otherPoint: { x: number; y: number }
    ) => {
      const roomTarget = getRoomWallSnapTarget(point, otherPoint, maxDistance);
      const customTarget = getCustomWallSnapTarget(point, otherPoint, maxDistance, wall.id);
      if (!roomTarget) return customTarget;
      if (!customTarget) return roomTarget;
      return customTarget.distance < roomTarget.distance - 1e-6 ? customTarget : roomTarget;
    };

    const startTarget = resolveEndpoint(start, end);
    const endTarget = resolveEndpoint(end, start);

    return {
      ...wall,
      x1Meters: startTarget?.x ?? wall.x1Meters,
      y1Meters: startTarget?.y ?? wall.y1Meters,
      x2Meters: endTarget?.x ?? wall.x2Meters,
      y2Meters: endTarget?.y ?? wall.y2Meters,
    };
  };

  // Silently migrate walls saved by the previous center-axis implementation.'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'normalize function replacement count={count}')
text = text.replace('normalizeWallRoomConnections', 'normalizeWallConnections')
text = text.replace('roomWallMigrationSignatureRef', 'wallJunctionMigrationSignatureRef')

# 2) Replace axis-only/orthogonal custom snapping with exact direction-aware segment snapping.
start_marker = "    // 3. Snap to Custom Wall Endpoints and Lines\n"
end_marker = "\n    return { x, y, isSnapped, snapInfo, snapTargetPoint };"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('custom snap block bounds not found')
new_snap = r'''    // 3. Snap to custom-wall endpoints or the exact physical face of a host segment.
    const customSnap = getCustomWallSnapTarget(
      snapProbe,
      startPos ?? undefined,
      minDistance,
      ignoreWallId
    );
    if (customSnap && customSnap.distance <= minDistance) {
      minDistance = customSnap.distance;
      x = customSnap.x;
      y = customSnap.y;
      isSnapped = true;
      snapInfo =
        customSnap.kind === 'endpoint'
          ? '⚡ Nó compartilhado entre paredes'
          : customSnap.face === 'axis'
            ? '⚡ Eixo da parede desenhada'
            : '⚡ Face da parede desenhada • junção T';
      snapTargetPoint = { x: customSnap.x, y: customSnap.y };
    }
'''
text = text[:start] + new_snap + text[end:]

# 3) Upgrade endpoint connection metadata so rendering knows which physical host face was hit.
pattern = re.compile(
    r"  const getCustomWallEndpointConnection = \(\n    wall: FloorPlanWall,\n    point: \{ x: number; y: number \}\n  \) => \{\n.*?\n  \};\n\n  const isWallEndpointConnected",
    re.S,
)
replacement = r'''  const getCustomWallEndpointConnection = (
    wall: FloorPlanWall,
    point: { x: number; y: number },
    otherPoint: { x: number; y: number }
  ) => {
    const tolerance = Math.max(
      0.08,
      (wall.thicknessMeters || wallThicknessMeters) * 0.8,
      gridSnapMeters * 0.35
    );
    return getCustomWallSnapTarget(point, otherPoint, tolerance, wall.id);
  };

  const isWallEndpointConnected'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'custom endpoint helper replacement count={count}')

# Update known helper call sites with the opposite endpoint, which determines the approached face.
text = text.replace(
    'getCustomWallEndpointConnection(wall, point)\n',
    'getCustomWallEndpointConnection(wall, point, otherPoint)\n'
)
text = text.replace(
    'getCustomWallEndpointConnection(w, startPoint);',
    'getCustomWallEndpointConnection(w, startPoint, endPoint);'
)
text = text.replace(
    'getCustomWallEndpointConnection(w, endPoint);',
    'getCustomWallEndpointConnection(w, endPoint, startPoint);'
)

# 4) Remove the old bridge that extended an incoming custom wall through the host centerline.
bridge_start = text.find("                {/* Custom-to-custom junctions keep a local masonry bridge.")
outline_start = text.find("                {/* Custom walls always draw both faces.", bridge_start)
if bridge_start < 0 or outline_start < 0:
    raise SystemExit('old custom bridge bounds not found')
text = text[:bridge_start] + text[outline_start:]

# 5) In custom outlines, T branches terminate at the physical host face. Axis endpoint/L nodes retain extension.
old = r'''                  const startConnected = Boolean(startRoomConnection || startCustomConnection);
                  const endConnected = Boolean(endRoomConnection || endCustomConnection);

                  // A room junction terminates exactly on the approached physical face.
                  // Only a custom-to-custom junction extends half a thickness through the node.
                  const startExtension = startCustomConnection ? h : 0;
                  const endExtension = endCustomConnection ? h : 0;
                  const p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  const p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  const p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  const p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };
'''
new = r'''                  const startConnected = Boolean(startRoomConnection || startCustomConnection);
                  const endConnected = Boolean(endRoomConnection || endCustomConnection);
                  const startCustomIsT = Boolean(
                    startCustomConnection?.kind === 'segment' && startCustomConnection.face !== 'axis'
                  );
                  const endCustomIsT = Boolean(
                    endCustomConnection?.kind === 'segment' && endCustomConnection.face !== 'axis'
                  );

                  // Room connections and custom T junctions terminate on a physical face.
                  // Only true axis-node custom connections (L/end-to-end) extend through the node.
                  const startExtension = startCustomConnection && !startCustomIsT ? h : 0;
                  const endExtension = endCustomConnection && !endCustomIsT ? h : 0;
                  let p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  let p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  let p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  let p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };

                  // For angled custom T junctions, trim each branch face by an exact line-line
                  // intersection with the host face instead of using a perpendicular end cap.
                  const wallHalfMeters = (w.thicknessMeters || wallThicknessMeters) / 2;
                  const intersectHostFace = (
                    center: { x: number; y: number },
                    normalSign: 1 | -1,
                    connection: CustomWallSnapTarget
                  ) => {
                    const sideOrigin = {
                      x: center.x + nx * wallHalfMeters * normalSign,
                      y: center.y + ny * wallHalfMeters * normalSign,
                    };
                    const cross = ux * connection.hostUy - uy * connection.hostUx;
                    if (Math.abs(cross) < 1e-6) {
                      return { x: sideOrigin.x * scalePxPerMeter, y: sideOrigin.y * scalePxPerMeter };
                    }
                    const relX = connection.x - sideOrigin.x;
                    const relY = connection.y - sideOrigin.y;
                    const t = (relX * connection.hostUy - relY * connection.hostUx) / cross;
                    return {
                      x: (sideOrigin.x + ux * t) * scalePxPerMeter,
                      y: (sideOrigin.y + uy * t) * scalePxPerMeter,
                    };
                  };

                  if (startCustomIsT && startCustomConnection) {
                    p1 = intersectHostFace(startPoint, 1, startCustomConnection);
                    p4 = intersectHostFace(startPoint, -1, startCustomConnection);
                  }
                  if (endCustomIsT && endCustomConnection) {
                    p2 = intersectHostFace(endPoint, 1, endCustomConnection);
                    p3 = intersectHostFace(endPoint, -1, endCustomConnection);
                  }
'''
if old not in text:
    raise SystemExit('custom outline extension block not found')
text = text.replace(old, new, 1)

# 6) After ALL custom outlines, erase only the contacted host face for each T and redraw
# the incoming branch faces last. This prevents the host outline from reappearing on top.
layer4_marker = "              </g>\n\n              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}"
insert_pos = text.find(layer4_marker)
if insert_pos < 0:
    raise SystemExit('layer 4 marker not found')
seam_block = r'''                {/* Custom-wall T junctions: cut only the contacted host face after all
                    custom outlines, then redraw the two incoming branch faces on top. */}
                {floorPlanWalls.flatMap((w) => {
                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return [];

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const thickPx = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const halfMeters = (w.thicknessMeters || wallThicknessMeters) / 2;
                  const strokeWidth = selectedWallIds.includes(w.id) ? 3.5 : 2;

                  const makeCustomSeam = (
                    point: { x: number; y: number },
                    otherPoint: { x: number; y: number },
                    endpointKey: 'start' | 'end'
                  ) => {
                    const connection = getCustomWallEndpointConnection(w, point, otherPoint);
                    if (
                      !connection ||
                      connection.kind !== 'segment' ||
                      connection.face === 'axis'
                    ) {
                      return null;
                    }

                    const normalComponent = Math.abs(
                      ux * connection.hostNx + uy * connection.hostNy
                    );
                    const halfGap = thickPx / (2 * Math.max(0.25, normalComponent));
                    const cx = connection.x * scalePxPerMeter;
                    const cy = connection.y * scalePxPerMeter;
                    const touchLength = Math.min(lengthPx, Math.max(thickPx, 10));
                    const inwardSign = endpointKey === 'start' ? 1 : -1;

                    const branchFaceIntersection = (normalSign: 1 | -1) => {
                      const sideOrigin = {
                        x: point.x + nx * halfMeters * normalSign,
                        y: point.y + ny * halfMeters * normalSign,
                      };
                      const cross = ux * connection.hostUy - uy * connection.hostUx;
                      if (Math.abs(cross) < 1e-6) {
                        return {
                          x: sideOrigin.x * scalePxPerMeter,
                          y: sideOrigin.y * scalePxPerMeter,
                        };
                      }
                      const relX = connection.x - sideOrigin.x;
                      const relY = connection.y - sideOrigin.y;
                      const t = (relX * connection.hostUy - relY * connection.hostUx) / cross;
                      return {
                        x: (sideOrigin.x + ux * t) * scalePxPerMeter,
                        y: (sideOrigin.y + uy * t) * scalePxPerMeter,
                      };
                    };

                    const faceA = branchFaceIntersection(1);
                    const faceB = branchFaceIntersection(-1);

                    return (
                      <g key={`custom-t-seam-${w.id}-${endpointKey}`} pointerEvents="none">
                        <line
                          x1={cx - connection.hostUx * halfGap}
                          y1={cy - connection.hostUy * halfGap}
                          x2={cx + connection.hostUx * halfGap}
                          y2={cy + connection.hostUy * halfGap}
                          stroke="#CBD5E1"
                          strokeWidth="4"
                          strokeLinecap="butt"
                        />
                        <line
                          x1={faceA.x}
                          y1={faceA.y}
                          x2={faceA.x + ux * inwardSign * touchLength}
                          y2={faceA.y + uy * inwardSign * touchLength}
                          stroke="#141414"
                          strokeWidth={strokeWidth}
                          strokeLinecap="square"
                        />
                        <line
                          x1={faceB.x}
                          y1={faceB.y}
                          x2={faceB.x + ux * inwardSign * touchLength}
                          y2={faceB.y + uy * inwardSign * touchLength}
                          stroke="#141414"
                          strokeWidth={strokeWidth}
                          strokeLinecap="square"
                        />
                      </g>
                    );
                  };

                  return [
                    makeCustomSeam(
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters },
                      'start'
                    ),
                    makeCustomSeam(
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters },
                      'end'
                    ),
                  ];
                })}
'''
text = text[:insert_pos] + seam_block + text[insert_pos:]

# 7) Make live preview use the same normalized endpoints as the committed wall.
preview_old = r'''              {isDrawingWall && wallStartPos && wallCurrentPos && (() => {
                const x1 = wallStartPos.x * scalePxPerMeter;
                const y1 = wallStartPos.y * scalePxPerMeter;
                const x2 = wallCurrentPos.x * scalePxPerMeter;
                const y2 = wallCurrentPos.y * scalePxPerMeter;
                const thick = wallThicknessMeters * scalePxPerMeter;
'''
preview_new = r'''              {isDrawingWall && wallStartPos && wallCurrentPos && (() => {
                const previewWall = normalizeWallConnections({
                  id: '__preview_wall__',
                  x1Meters: wallStartPos.x,
                  y1Meters: wallStartPos.y,
                  x2Meters: wallCurrentPos.x,
                  y2Meters: wallCurrentPos.y,
                  thicknessMeters: wallThicknessMeters,
                  label: '',
                });
                const x1 = previewWall.x1Meters * scalePxPerMeter;
                const y1 = previewWall.y1Meters * scalePxPerMeter;
                const x2 = previewWall.x2Meters * scalePxPerMeter;
                const y2 = previewWall.y2Meters * scalePxPerMeter;
                const thick = wallThicknessMeters * scalePxPerMeter;
'''
if preview_old not in text:
    raise SystemExit('live preview anchor not found')
text = text.replace(preview_old, preview_new, 1)

path.write_text(text)
print('custom wall T junction refactor applied')
