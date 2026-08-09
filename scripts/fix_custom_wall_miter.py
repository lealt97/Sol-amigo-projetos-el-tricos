from pathlib import Path

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()

anchor = """  const isWallEndpointConnected = (wall: FloorPlanWall, point: { x: number; y: number }) => {
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };
    const isStart = Math.hypot(point.x - start.x, point.y - start.y) <= Math.hypot(point.x - end.x, point.y - end.y);
    const otherPoint = isStart ? end : start;
    return Boolean(
      getRoomWallEndpointConnection(wall, point, otherPoint) ||
      getCustomWallEndpointConnection(wall, point, otherPoint)
    );
  };

"""
helper = """  const isWallEndpointConnected = (wall: FloorPlanWall, point: { x: number; y: number }) => {
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };
    const isStart = Math.hypot(point.x - start.x, point.y - start.y) <= Math.hypot(point.x - end.x, point.y - end.y);
    const otherPoint = isStart ? end : start;
    return Boolean(
      getRoomWallEndpointConnection(wall, point, otherPoint) ||
      getCustomWallEndpointConnection(wall, point, otherPoint)
    );
  };

  // True endpoint-to-endpoint L corners use a geometric miter: the outer face reaches
  // the outer corner and the inner face stops at the inner corner. This removes the
  // square protrusions created by extending both faces by the same half-thickness.
  const getCustomWallEndpointMiter = (
    wall: FloorPlanWall,
    point: { x: number; y: number },
    otherPoint: { x: number; y: number }
  ): { positive: { x: number; y: number }; negative: { x: number; y: number } } | null => {
    const connection = getCustomWallEndpointConnection(wall, point, otherPoint);
    if (!connection || connection.kind !== 'endpoint') return null;

    const host = floorPlanWalls.find((candidate) => candidate.id === connection.wallId);
    if (!host) return null;

    const currentDx = wall.x2Meters - wall.x1Meters;
    const currentDy = wall.y2Meters - wall.y1Meters;
    const currentLength = Math.hypot(currentDx, currentDy);
    const awayDx = otherPoint.x - point.x;
    const awayDy = otherPoint.y - point.y;
    const awayLength = Math.hypot(awayDx, awayDy);
    if (currentLength < 1e-9 || awayLength < 1e-9) return null;

    const currentUx = currentDx / currentLength;
    const currentUy = currentDy / currentLength;
    const currentNx = -currentUy;
    const currentNy = currentUx;
    const awayUx = awayDx / awayLength;
    const awayUy = awayDy / awayLength;
    const currentStoredVsAway = currentUx * awayUx + currentUy * awayUy >= 0 ? 1 : -1;

    const hostStart = { x: host.x1Meters, y: host.y1Meters };
    const hostEnd = { x: host.x2Meters, y: host.y2Meters };
    const hostUsesStart = Math.hypot(point.x - hostStart.x, point.y - hostStart.y) <= 1e-6;
    const hostUsesEnd = Math.hypot(point.x - hostEnd.x, point.y - hostEnd.y) <= 1e-6;
    if (!hostUsesStart && !hostUsesEnd) return null;
    const hostOther = hostUsesStart ? hostEnd : hostStart;
    const hostAwayDx = hostOther.x - point.x;
    const hostAwayDy = hostOther.y - point.y;
    const hostAwayLength = Math.hypot(hostAwayDx, hostAwayDy);
    if (hostAwayLength < 1e-9) return null;
    const hostAwayUx = hostAwayDx / hostAwayLength;
    const hostAwayUy = hostAwayDy / hostAwayLength;
    const hostAwayNx = -hostAwayUy;
    const hostAwayNy = hostAwayUx;

    const centerCross = awayUx * hostAwayUy - awayUy * hostAwayUx;
    if (Math.abs(centerCross) < 1e-4) return null;

    const currentHalf = (wall.thicknessMeters || wallThicknessMeters) / 2;
    const hostHalf = (host.thicknessMeters || wallThicknessMeters) / 2;
    const maxMiterDistance = Math.max(currentHalf, hostHalf) * 8;

    const intersectFace = (renderSign: 1 | -1) => {
      const currentAwaySign = renderSign * currentStoredVsAway;
      const hostAwaySign = -currentAwaySign;
      const a = {
        x: point.x + currentNx * currentHalf * renderSign,
        y: point.y + currentNy * currentHalf * renderSign,
      };
      const b = {
        x: point.x + hostAwayNx * hostHalf * hostAwaySign,
        y: point.y + hostAwayNy * hostHalf * hostAwaySign,
      };
      const cross = awayUx * hostAwayUy - awayUy * hostAwayUx;
      if (Math.abs(cross) < 1e-9) return null;
      const relX = b.x - a.x;
      const relY = b.y - a.y;
      const t = (relX * hostAwayUy - relY * hostAwayUx) / cross;
      const hit = { x: a.x + awayUx * t, y: a.y + awayUy * t };
      if (Math.hypot(hit.x - point.x, hit.y - point.y) > maxMiterDistance) return null;
      return hit;
    };

    const positive = intersectFace(1);
    const negative = intersectFace(-1);
    if (!positive || !negative) return null;
    return { positive, negative };
  };

"""
if anchor not in text:
    raise SystemExit('helper anchor not found')
text = text.replace(anchor, helper, 1)

old_poly = """                    const p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    const p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    const p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    const p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    return <path key={`"""
new_poly = """                    let p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    let p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    let p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    let p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    const startMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters }
                    );
                    if (startMiter) {
                      p1 = { x: startMiter.positive.x * scalePxPerMeter, y: startMiter.positive.y * scalePxPerMeter };
                      p4 = { x: startMiter.negative.x * scalePxPerMeter, y: startMiter.negative.y * scalePxPerMeter };
                    }
                    const endMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (endMiter) {
                      p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                      p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                    }

                    return <path key={`"""
count = text.count(old_poly)
if count != 2:
    raise SystemExit(f'expected 2 fill/hatch polygon blocks, found {count}')
text = text.replace(old_poly, new_poly, 2)

outline_anchor = """                  let p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  let p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  let p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  let p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };

                  // For angled custom T junctions, trim each branch face by an exact line-line
"""
outline_new = """                  let p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  let p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  let p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  let p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };

                  const startMiter = getCustomWallEndpointMiter(w, startPoint, endPoint);
                  if (startMiter) {
                    p1 = { x: startMiter.positive.x * scalePxPerMeter, y: startMiter.positive.y * scalePxPerMeter };
                    p4 = { x: startMiter.negative.x * scalePxPerMeter, y: startMiter.negative.y * scalePxPerMeter };
                  }
                  const endMiter = getCustomWallEndpointMiter(w, endPoint, startPoint);
                  if (endMiter) {
                    p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                    p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                  }

                  // For angled custom T junctions, trim each branch face by an exact line-line
"""
if outline_anchor not in text:
    raise SystemExit('outline anchor not found')
text = text.replace(outline_anchor, outline_new, 1)

p.write_text(text)
