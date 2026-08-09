from pathlib import Path

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()

# 1. Add node topology helpers before the existing endpoint miter helper.
anchor = """  // True endpoint-to-endpoint L corners use a geometric miter: the outer face reaches
  // the outer corner and the inner face stops at the inner corner. This removes the
  // square protrusions created by extending both faces by the same half-thickness.
  const getCustomWallEndpointMiter = (
"""
helpers = r"""  type EndpointNodeBranch = {
    wall: FloorPlanWall;
    wallId: string;
    usesStart: boolean;
    awayUx: number;
    awayUy: number;
    storedUx: number;
    storedUy: number;
    storedNx: number;
    storedNy: number;
    halfMeters: number;
  };

  type EndpointNodeTopology = {
    point: { x: number; y: number };
    branches: EndpointNodeBranch[];
    kind: 'single' | 'straight' | 'L' | 'T' | 'X' | 'multi';
    throughPairs: [EndpointNodeBranch, EndpointNodeBranch][];
    stem?: EndpointNodeBranch;
  };

  const getEndpointNodeTopology = (
    point: { x: number; y: number },
    epsilon = 1e-6
  ): EndpointNodeTopology | null => {
    const branches: EndpointNodeBranch[] = [];

    for (const wall of floorPlanWalls) {
      const startDistance = Math.hypot(point.x - wall.x1Meters, point.y - wall.y1Meters);
      const endDistance = Math.hypot(point.x - wall.x2Meters, point.y - wall.y2Meters);
      if (startDistance > epsilon && endDistance > epsilon) continue;

      const dx = wall.x2Meters - wall.x1Meters;
      const dy = wall.y2Meters - wall.y1Meters;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;

      const storedUx = dx / length;
      const storedUy = dy / length;
      const usesStart = startDistance <= endDistance;
      const otherPoint = usesStart
        ? { x: wall.x2Meters, y: wall.y2Meters }
        : { x: wall.x1Meters, y: wall.y1Meters };
      const awayDx = otherPoint.x - point.x;
      const awayDy = otherPoint.y - point.y;
      const awayLength = Math.hypot(awayDx, awayDy);
      if (awayLength < 1e-9) continue;

      branches.push({
        wall,
        wallId: wall.id,
        usesStart,
        awayUx: awayDx / awayLength,
        awayUy: awayDy / awayLength,
        storedUx,
        storedUy,
        storedNx: -storedUy,
        storedNy: storedUx,
        halfMeters: (wall.thicknessMeters || wallThicknessMeters) / 2,
      });
    }

    if (branches.length === 0) return null;

    const dot = (a: EndpointNodeBranch, b: EndpointNodeBranch) =>
      a.awayUx * b.awayUx + a.awayUy * b.awayUy;
    const opposite = (a: EndpointNodeBranch, b: EndpointNodeBranch) => dot(a, b) <= -0.98;

    if (branches.length === 1) {
      return { point, branches, kind: 'single', throughPairs: [] };
    }

    if (branches.length === 2) {
      return {
        point,
        branches,
        kind: opposite(branches[0], branches[1]) ? 'straight' : 'L',
        throughPairs: opposite(branches[0], branches[1]) ? [[branches[0], branches[1]]] : [],
      };
    }

    const candidates: Array<{
      a: EndpointNodeBranch;
      b: EndpointNodeBranch;
      score: number;
    }> = [];
    for (let i = 0; i < branches.length; i += 1) {
      for (let j = i + 1; j < branches.length; j += 1) {
        if (!opposite(branches[i], branches[j])) continue;
        candidates.push({ a: branches[i], b: branches[j], score: dot(branches[i], branches[j]) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);

    if (branches.length === 3 && candidates.length > 0) {
      const pair = candidates[0];
      const stem = branches.find((branch) => branch.wallId !== pair.a.wallId && branch.wallId !== pair.b.wallId);
      if (stem) {
        return {
          point,
          branches,
          kind: 'T',
          throughPairs: [[pair.a, pair.b]],
          stem,
        };
      }
    }

    if (branches.length === 4) {
      for (const first of candidates) {
        const remaining = branches.filter(
          (branch) => branch.wallId !== first.a.wallId && branch.wallId !== first.b.wallId
        );
        if (remaining.length === 2 && opposite(remaining[0], remaining[1])) {
          return {
            point,
            branches,
            kind: 'X',
            throughPairs: [[first.a, first.b], [remaining[0], remaining[1]]],
          };
        }
      }
    }

    return { point, branches, kind: 'multi', throughPairs: [] };
  };

  const getUniqueCustomEndpointNodeTopologies = (): EndpointNodeTopology[] => {
    const points: { x: number; y: number }[] = [];
    const epsilon = 1e-6;
    for (const wall of floorPlanWalls) {
      for (const point of [
        { x: wall.x1Meters, y: wall.y1Meters },
        { x: wall.x2Meters, y: wall.y2Meters },
      ]) {
        if (!points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= epsilon)) {
          points.push(point);
        }
      }
    }
    return points
      .map((point) => getEndpointNodeTopology(point, epsilon))
      .filter((topology): topology is EndpointNodeTopology => Boolean(topology && topology.branches.length >= 2));
  };

  // Multi-branch nodes are solved as one topology, not as several independent L corners.
  // At a T, the straight pair is the host and the third branch terminates exactly on the
  // contacted host face. At an X, every branch stops at the shared center node and seam
  // cuts expose the correct union outline.
  const getMultiNodeEndpointFacePoints = (
    wall: FloorPlanWall,
    point: { x: number; y: number }
  ): { positive: { x: number; y: number }; negative: { x: number; y: number } } | null => {
    const topology = getEndpointNodeTopology(point);
    if (!topology || topology.branches.length < 3) return null;

    const branch = topology.branches.find((candidate) => candidate.wallId === wall.id);
    if (!branch) return null;

    const basePoints = {
      positive: {
        x: point.x + branch.storedNx * branch.halfMeters,
        y: point.y + branch.storedNy * branch.halfMeters,
      },
      negative: {
        x: point.x - branch.storedNx * branch.halfMeters,
        y: point.y - branch.storedNy * branch.halfMeters,
      },
    };

    if (topology.kind !== 'T' || !topology.stem || topology.stem.wallId !== wall.id) {
      return basePoints;
    }

    const hostPair = topology.throughPairs[0];
    if (!hostPair) return basePoints;
    const hostUx = hostPair[0].awayUx;
    const hostUy = hostPair[0].awayUy;
    const hostNx = -hostUy;
    const hostNy = hostUx;
    const hostHalf = Math.max(hostPair[0].halfMeters, hostPair[1].halfMeters);
    const side = topology.stem.awayUx * hostNx + topology.stem.awayUy * hostNy >= 0 ? 1 : -1;
    const hostFacePoint = {
      x: point.x + hostNx * hostHalf * side,
      y: point.y + hostNy * hostHalf * side,
    };

    const intersectStoredFace = (normalSign: 1 | -1) => {
      const sideOrigin = {
        x: point.x + branch.storedNx * branch.halfMeters * normalSign,
        y: point.y + branch.storedNy * branch.halfMeters * normalSign,
      };
      const cross = branch.storedUx * hostUy - branch.storedUy * hostUx;
      if (Math.abs(cross) < 1e-8) return normalSign === 1 ? basePoints.positive : basePoints.negative;
      const relX = hostFacePoint.x - sideOrigin.x;
      const relY = hostFacePoint.y - sideOrigin.y;
      const t = (relX * hostUy - relY * hostUx) / cross;
      return {
        x: sideOrigin.x + branch.storedUx * t,
        y: sideOrigin.y + branch.storedUy * t,
      };
    };

    return {
      positive: intersectStoredFace(1),
      negative: intersectStoredFace(-1),
    };
  };

  const beginWallFromExactNode = (
    point: { x: number; y: number },
    e: React.MouseEvent<SVGGElement>
  ) => {
    if (activeTool !== 'draw_wall' || isDrawingWall || e.button !== 0) return;
    e.stopPropagation();
    beginHistoryTransaction();
    setIsDrawingWall(true);
    setWallStartPos({ ...point });
    setWallCurrentPos({ ...point });
    setWallSnapInfo({
      isSnapped: true,
      snapInfo: '⚡ Nó L — puxe para criar T',
      snapTargetPoint: { ...point },
    });
    setToolStatus('Nó L selecionado. Arraste a terceira parede para transformar a junção em T.');
  };

  // True endpoint-to-endpoint L corners use a geometric miter: the outer face reaches
  // the outer corner and the inner face stops at the inner corner. This removes the
  // square protrusions created by extending both faces by the same half-thickness.
  const getCustomWallEndpointMiter = (
"""
if anchor not in text:
    raise SystemExit('miter anchor not found')
text = text.replace(anchor, helpers, 1)

# 2. Pairwise L miter must never run on a node that already has 3+ branches.
needle = """  ): { positive: { x: number; y: number }; negative: { x: number; y: number } } | null => {
    const connection = getCustomWallEndpointConnection(wall, point, otherPoint);
"""
replacement = """  ): { positive: { x: number; y: number }; negative: { x: number; y: number } } | null => {
    const topology = getEndpointNodeTopology(point);
    if (topology && topology.branches.length >= 3) return null;

    const connection = getCustomWallEndpointConnection(wall, point, otherPoint);
"""
if needle not in text:
    raise SystemExit('miter body anchor not found')
text = text.replace(needle, replacement, 1)

# 3. Apply topology endpoints after the existing L miter in both fill and hatch polygons.
poly_tail = """                    const endMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (endMiter) {
                      p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                      p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                    }

                    return <path key={`"""
poly_new = """                    const endMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (endMiter) {
                      p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                      p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                    }

                    const startNodeFaces = getMultiNodeEndpointFacePoints(
                      w,
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (startNodeFaces) {
                      p1 = { x: startNodeFaces.positive.x * scalePxPerMeter, y: startNodeFaces.positive.y * scalePxPerMeter };
                      p4 = { x: startNodeFaces.negative.x * scalePxPerMeter, y: startNodeFaces.negative.y * scalePxPerMeter };
                    }
                    const endNodeFaces = getMultiNodeEndpointFacePoints(
                      w,
                      { x: w.x2Meters, y: w.y2Meters }
                    );
                    if (endNodeFaces) {
                      p2 = { x: endNodeFaces.positive.x * scalePxPerMeter, y: endNodeFaces.positive.y * scalePxPerMeter };
                      p3 = { x: endNodeFaces.negative.x * scalePxPerMeter, y: endNodeFaces.negative.y * scalePxPerMeter };
                    }

                    return <path key={`"""
count = text.count(poly_tail)
if count != 2:
    raise SystemExit(f'expected fill+hatch polygon tails twice, found {count}')
text = text.replace(poly_tail, poly_new, 2)

# 4. Multi-node endpoint should not get the old half-thickness axis extension in outlines.
old_extension = """                  // Room connections and custom T junctions terminate on a physical face.
                  // Only true axis-node custom connections (L/end-to-end) extend through the node.
                  const startExtension = startCustomConnection && !startCustomIsT ? h : 0;
                  const endExtension = endCustomConnection && !endCustomIsT ? h : 0;
"""
new_extension = """                  const startNodeTopology = getEndpointNodeTopology(startPoint);
                  const endNodeTopology = getEndpointNodeTopology(endPoint);
                  const startIsMultiNode = Boolean(startNodeTopology && startNodeTopology.branches.length >= 3);
                  const endIsMultiNode = Boolean(endNodeTopology && endNodeTopology.branches.length >= 3);

                  // Room connections and custom T junctions terminate on a physical face.
                  // A multi-branch endpoint is solved by node topology below; only a true
                  // two-branch axis node keeps the legacy half-thickness extension/miter path.
                  const startExtension = startCustomConnection && !startCustomIsT && !startIsMultiNode ? h : 0;
                  const endExtension = endCustomConnection && !endCustomIsT && !endIsMultiNode ? h : 0;
"""
if old_extension not in text:
    raise SystemExit('outline extension block not found')
text = text.replace(old_extension, new_extension, 1)

# 5. Apply topology endpoint face points in outline before legacy mid-segment T trimming.
outline_anchor = """                  const endMiter = getCustomWallEndpointMiter(w, endPoint, startPoint);
                  if (endMiter) {
                    p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                    p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                  }

                  // For angled custom T junctions, trim each branch face by an exact line-line
"""
outline_new = """                  const endMiter = getCustomWallEndpointMiter(w, endPoint, startPoint);
                  if (endMiter) {
                    p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                    p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                  }

                  const startNodeFaces = getMultiNodeEndpointFacePoints(w, startPoint);
                  if (startNodeFaces) {
                    p1 = { x: startNodeFaces.positive.x * scalePxPerMeter, y: startNodeFaces.positive.y * scalePxPerMeter };
                    p4 = { x: startNodeFaces.negative.x * scalePxPerMeter, y: startNodeFaces.negative.y * scalePxPerMeter };
                  }
                  const endNodeFaces = getMultiNodeEndpointFacePoints(w, endPoint);
                  if (endNodeFaces) {
                    p2 = { x: endNodeFaces.positive.x * scalePxPerMeter, y: endNodeFaces.positive.y * scalePxPerMeter };
                    p3 = { x: endNodeFaces.negative.x * scalePxPerMeter, y: endNodeFaces.negative.y * scalePxPerMeter };
                  }

                  // For angled custom T junctions, trim each branch face by an exact line-line
"""
if outline_anchor not in text:
    raise SystemExit('outline miter tail not found')
text = text.replace(outline_anchor, outline_new, 1)

# 6. Add endpoint-node T/X seam solving after the existing mid-segment T seams.
layer4_anchor = """                })}
              </g>

              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}
"""
node_seams = r"""                })}

                {/* Shared endpoint nodes: one topology owns the final visible junction.
                    This is what allows a two-branch L to become a clean three-branch T
                    simply by pulling a third wall from the same exact node. */}
                {getUniqueCustomEndpointNodeTopologies().flatMap((topology, nodeIndex) => {
                  if (topology.kind === 'T' && topology.stem && topology.throughPairs[0]) {
                    const hostPair = topology.throughPairs[0];
                    const hostUx = hostPair[0].awayUx;
                    const hostUy = hostPair[0].awayUy;
                    const hostNx = -hostUy;
                    const hostNy = hostUx;
                    const hostHalfMeters = Math.max(hostPair[0].halfMeters, hostPair[1].halfMeters);
                    const stem = topology.stem;
                    const stemSide = stem.awayUx * hostNx + stem.awayUy * hostNy >= 0 ? 1 : -1;
                    const cx = (topology.point.x + hostNx * hostHalfMeters * stemSide) * scalePxPerMeter;
                    const cy = (topology.point.y + hostNy * hostHalfMeters * stemSide) * scalePxPerMeter;
                    const normalComponent = Math.abs(stem.awayUx * hostNx + stem.awayUy * hostNy);
                    const halfGap = stem.halfMeters * scalePxPerMeter / Math.max(0.25, normalComponent);
                    const stemFaces = getMultiNodeEndpointFacePoints(stem.wall, topology.point);
                    const touchLength = Math.max(10, stem.halfMeters * 2 * scalePxPerMeter);
                    const strokeWidth = selectedWallIds.includes(stem.wallId) ? 3.5 : 2;

                    const result: React.ReactNode[] = [
                      <line
                        key={`endpoint-t-cut-${nodeIndex}`}
                        x1={cx - hostUx * halfGap}
                        y1={cy - hostUy * halfGap}
                        x2={cx + hostUx * halfGap}
                        y2={cy + hostUy * halfGap}
                        stroke="#CBD5E1"
                        strokeWidth="4"
                        strokeLinecap="butt"
                        pointerEvents="none"
                      />,
                    ];

                    if (stemFaces) {
                      for (const [faceKey, face] of [
                        ['positive', stemFaces.positive],
                        ['negative', stemFaces.negative],
                      ] as const) {
                        result.push(
                          <line
                            key={`endpoint-t-stem-${nodeIndex}-${faceKey}`}
                            x1={face.x * scalePxPerMeter}
                            y1={face.y * scalePxPerMeter}
                            x2={(face.x + stem.awayUx * (touchLength / scalePxPerMeter)) * scalePxPerMeter}
                            y2={(face.y + stem.awayUy * (touchLength / scalePxPerMeter)) * scalePxPerMeter}
                            stroke="#141414"
                            strokeWidth={strokeWidth}
                            strokeLinecap="square"
                            pointerEvents="none"
                          />
                        );
                      }
                    }
                    return result;
                  }

                  if (topology.kind === 'X' && topology.throughPairs.length === 2) {
                    const cuts: React.ReactNode[] = [];
                    topology.throughPairs.forEach((hostPair, pairIndex) => {
                      const otherPair = topology.throughPairs[1 - pairIndex];
                      const hostUx = hostPair[0].awayUx;
                      const hostUy = hostPair[0].awayUy;
                      const hostNx = -hostUy;
                      const hostNy = hostUx;
                      const hostHalf = Math.max(hostPair[0].halfMeters, hostPair[1].halfMeters);
                      const crossingHalf = Math.max(otherPair[0].halfMeters, otherPair[1].halfMeters);
                      const crossingUx = otherPair[0].awayUx;
                      const crossingUy = otherPair[0].awayUy;
                      const normalComponent = Math.abs(crossingUx * hostNx + crossingUy * hostNy);
                      const halfGap = crossingHalf * scalePxPerMeter / Math.max(0.25, normalComponent);

                      for (const side of [-1, 1] as const) {
                        const cx = (topology.point.x + hostNx * hostHalf * side) * scalePxPerMeter;
                        const cy = (topology.point.y + hostNy * hostHalf * side) * scalePxPerMeter;
                        cuts.push(
                          <line
                            key={`endpoint-x-cut-${nodeIndex}-${pairIndex}-${side}`}
                            x1={cx - hostUx * halfGap}
                            y1={cy - hostUy * halfGap}
                            x2={cx + hostUx * halfGap}
                            y2={cy + hostUy * halfGap}
                            stroke="#CBD5E1"
                            strokeWidth="4"
                            strokeLinecap="butt"
                            pointerEvents="none"
                          />
                        );
                      }
                    });
                    return cuts;
                  }

                  return [];
                })}
              </g>

              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}
"""
if layer4_anchor not in text:
    raise SystemExit('layer 4 anchor not found')
text = text.replace(layer4_anchor, node_seams, 1)

# 7. Show an explicit L-node grip while Draw Wall is active. Clicking this grip means
# exact-node topology intent and therefore preserves the strict 0-distance L/T rule.
interactive_anchor = """              {/* Interactive Custom Walls */}
              {floorPlanWalls.map((w) => {
"""
grips = r"""              {/* Pull grips for exact L nodes. Selecting the grip is explicit node intent;
                  free clicks beside the corner still obey the strict non-zero-distance => T rule. */}
              {activeTool === 'draw_wall' && !isDrawingWall &&
                getUniqueCustomEndpointNodeTopologies()
                  .filter((topology) => topology.kind === 'L')
                  .map((topology, index) => {
                    const cx = topology.point.x * scalePxPerMeter;
                    const cy = topology.point.y * scalePxPerMeter;
                    return (
                      <g
                        key={`l-pull-grip-${index}`}
                        transform={`translate(${cx}, ${cy})`}
                        onMouseDown={(e) => beginWallFromExactNode(topology.point, e)}
                        className="cursor-crosshair"
                      >
                        <circle r="11" fill="transparent" />
                        <circle r="5" fill="#16a34a" stroke="white" strokeWidth="2" />
                        <line x1="-8" y1="0" x2="8" y2="0" stroke="#15803d" strokeWidth="1.5" pointerEvents="none" />
                        <line x1="0" y1="-8" x2="0" y2="8" stroke="#15803d" strokeWidth="1.5" pointerEvents="none" />
                        <title>Puxar deste nó L para criar uma junção T</title>
                      </g>
                    );
                  })}

              {/* Interactive Custom Walls */}
              {floorPlanWalls.map((w) => {
"""
if interactive_anchor not in text:
    raise SystemExit('interactive wall anchor not found')
text = text.replace(interactive_anchor, grips, 1)

# 8. New wall immediately inherits the connected component group and reports L -> T conversion.
commit_anchor = """      if (dist >= 0.1) {
        const newWall: FloorPlanWall = {
          ...normalizedWall,
          label: `Parede ${floorPlanWalls.length + 1} (${dist.toFixed(2)}m)`,
        };

        onUpdateProjectData({
"""
commit_new = """      if (dist >= 0.1) {
        const startTopologyBefore = getEndpointNodeTopology({
          x: normalizedWall.x1Meters,
          y: normalizedWall.y1Meters,
        });
        const endTopologyBefore = getEndpointNodeTopology({
          x: normalizedWall.x2Meters,
          y: normalizedWall.y2Meters,
        });
        const inheritedGroupId = [startTopologyBefore, endTopologyBefore]
          .flatMap((topology) => topology?.branches || [])
          .map((branch) => branch.wall.groupId)
          .find((groupId): groupId is string => Boolean(groupId));
        const convertsLToT = startTopologyBefore?.kind === 'L' || endTopologyBefore?.kind === 'L';

        const newWall: FloorPlanWall = {
          ...normalizedWall,
          groupId: inheritedGroupId || normalizedWall.groupId || `wallgrp_${normalizedWall.id}`,
          label: `Parede ${floorPlanWalls.length + 1} (${dist.toFixed(2)}m)`,
        };

        onUpdateProjectData({
"""
if commit_anchor not in text:
    raise SystemExit('wall commit anchor not found')
text = text.replace(commit_anchor, commit_new, 1)

post_update_anchor = """            walls: [...floorPlanWalls, newWall],
          },
        });
      }

      finishHistoryTransaction();
"""
post_update_new = """            walls: [...floorPlanWalls, newWall],
          },
        });
        setToolStatus(
          convertsLToT
            ? 'Junção L convertida em T. A nova parede faz parte do mesmo desenho.'
            : 'Parede criada e conectividade da planta atualizada.'
        );
      }

      finishHistoryTransaction();
"""
if post_update_anchor not in text:
    raise SystemExit('post wall update anchor not found')
text = text.replace(post_update_anchor, post_update_new, 1)

p.write_text(text)
