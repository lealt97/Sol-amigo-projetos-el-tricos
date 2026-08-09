from pathlib import Path

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()

old_pairs = '''    const candidates: Array<{
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
'''
new_pairs = '''    const candidates: Array<{
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

    // Keep straight-through axes for nodes of any degree (+, *, etc.). Each branch can
    // participate in at most one opposite pair.
    const throughPairs: [EndpointNodeBranch, EndpointNodeBranch][] = [];
    const pairedWallIds = new Set<string>();
    for (const candidate of candidates) {
      if (pairedWallIds.has(candidate.a.wallId) || pairedWallIds.has(candidate.b.wallId)) continue;
      throughPairs.push([candidate.a, candidate.b]);
      pairedWallIds.add(candidate.a.wallId);
      pairedWallIds.add(candidate.b.wallId);
    }

    if (branches.length === 3 && throughPairs.length > 0) {
      const pair = throughPairs[0];
      const stem = branches.find((branch) => branch.wallId !== pair[0].wallId && branch.wallId !== pair[1].wallId);
      if (stem) {
        return {
          point,
          branches,
          kind: 'T',
          throughPairs: [pair],
          stem,
        };
      }
    }

    if (branches.length === 4 && throughPairs.length === 2) {
      return {
        point,
        branches,
        kind: 'X',
        throughPairs,
      };
    }

    return { point, branches, kind: 'multi', throughPairs };
'''
if old_pairs not in text:
    raise SystemExit('topology pair block not found')
text = text.replace(old_pairs, new_pairs, 1)

old_begin = '''  const beginWallFromExactNode = (
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
'''
new_begin = '''  const getEndpointNodeDisplayLabel = (topology: EndpointNodeTopology) => {
    if (topology.kind === 'X') return '+';
    if (topology.kind === 'multi') return topology.branches.length >= 5 ? '*' : 'angular';
    if (topology.kind === 'straight') return 'reta';
    return topology.kind;
  };

  const beginWallFromExactNode = (
    point: { x: number; y: number },
    e: React.MouseEvent<SVGGElement>
  ) => {
    if (activeTool !== 'draw_wall' || isDrawingWall || e.button !== 0) return;
    e.stopPropagation();
    const topology = getEndpointNodeTopology(point);
    const label = topology ? getEndpointNodeDisplayLabel(topology) : 'compartilhado';
    const nextCount = (topology?.branches.length || 0) + 1;
    beginHistoryTransaction();
    setIsDrawingWall(true);
    setWallStartPos({ ...point });
    setWallCurrentPos({ ...point });
    setWallSnapInfo({
      isSnapped: true,
      snapInfo: `⚡ Nó ${label} — nova ramificação`,
      snapTargetPoint: { ...point },
    });
    setToolStatus(
      `Nó ${label} selecionado. Puxe a nova parede; o encontro será recalculado como um único nó com ${nextCount} ramificações.`
    );
  };
'''
if old_begin not in text:
    raise SystemExit('begin node block not found')
text = text.replace(old_begin, new_begin, 1)

old_status = '''        const convertsLToT = startTopologyBefore?.kind === 'L' || endTopologyBefore?.kind === 'L';
'''
new_status = '''        const sourceTopologyBefore = startTopologyBefore || endTopologyBefore;
        const sourceNodeLabel = sourceTopologyBefore
          ? getEndpointNodeDisplayLabel(sourceTopologyBefore)
          : null;
        const sourceNodeBranchCount = sourceTopologyBefore?.branches.length || 0;
'''
if old_status not in text:
    raise SystemExit('creation status prelude not found')
text = text.replace(old_status, new_status, 1)

old_status2 = '''        setToolStatus(
          convertsLToT
            ? 'Junção L convertida em T. A nova parede faz parte do mesmo desenho.'
            : 'Parede criada e conectividade da planta atualizada.'
        );
'''
new_status2 = '''        setToolStatus(
          sourceTopologyBefore
            ? `Ramificação adicionada ao nó ${sourceNodeLabel}. O encontro agora possui ${sourceNodeBranchCount + 1} paredes no mesmo desenho.`
            : 'Parede criada e conectividade da planta atualizada.'
        );
'''
if old_status2 not in text:
    raise SystemExit('creation status block not found')
text = text.replace(old_status2, new_status2, 1)

old_grip = '''              {/* Pull grips for exact L nodes. Selecting the grip is explicit node intent;
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
'''
new_grip = '''              {/* Every shared endpoint node is extensible. Explicit grips let L, T, +, *,
                  Y and angled nodes receive another branch without weakening the strict
                  endpoint-vs-face snap rule used by normal canvas clicks. */}
              {activeTool === 'draw_wall' && !isDrawingWall &&
                getUniqueCustomEndpointNodeTopologies()
                  .map((topology, index) => {
                    const cx = topology.point.x * scalePxPerMeter;
                    const cy = topology.point.y * scalePxPerMeter;
                    const nodeLabel = getEndpointNodeDisplayLabel(topology);
                    const gripColor = topology.kind === 'X'
                      ? '#7c3aed'
                      : topology.kind === 'multi'
                        ? '#d97706'
                        : topology.kind === 'T'
                          ? '#0284c7'
                          : '#16a34a';
                    return (
                      <g
                        key={`node-pull-grip-${index}`}
                        transform={`translate(${cx}, ${cy})`}
                        onMouseDown={(e) => beginWallFromExactNode(topology.point, e)}
                        className="cursor-crosshair"
                      >
                        <circle r="12" fill="transparent" />
                        <circle r="5" fill={gripColor} stroke="white" strokeWidth="2" />
                        <line x1="-8" y1="0" x2="8" y2="0" stroke={gripColor} strokeWidth="1.5" pointerEvents="none" />
                        <line x1="0" y1="-8" x2="0" y2="8" stroke={gripColor} strokeWidth="1.5" pointerEvents="none" />
                        <title>{`Puxar do nó ${nodeLabel} (${topology.branches.length} paredes) para adicionar outra ramificação`}</title>
                      </g>
                    );
                  })}
'''
if old_grip not in text:
    raise SystemExit('L-only grip block not found')
text = text.replace(old_grip, new_grip, 1)

old_tail = '''                    return cuts;
                  }

                  return [];
                })}
'''
new_tail = '''                    return cuts;
                  }

                  if (topology.kind === 'multi' && topology.branches.length >= 3) {
                    const angles = topology.branches
                      .map((branch) => Math.atan2(branch.awayUy, branch.awayUx))
                      .sort((a, b) => a - b);
                    let maxGap = 0;
                    for (let index = 0; index < angles.length; index += 1) {
                      const current = angles[index];
                      const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
                      maxGap = Math.max(maxGap, next - current);
                    }

                    // Dense Y/* nodes surround the center, so a small core cleanup removes
                    // internal seam fragments. Fan/chevron nodes such as > deliberately skip
                    // this overlay to preserve their exact angular miter without a round bulge.
                    if (maxGap <= Math.PI + 0.05) {
                      const hubRadius = Math.max(
                        3,
                        Math.max(...topology.branches.map((branch) => branch.halfMeters)) * scalePxPerMeter + 1
                      );
                      const cx = topology.point.x * scalePxPerMeter;
                      const cy = topology.point.y * scalePxPerMeter;
                      return [
                        <circle
                          key={`endpoint-multi-core-${nodeIndex}`}
                          cx={cx}
                          cy={cy}
                          r={hubRadius}
                          fill="#CBD5E1"
                          stroke="none"
                          pointerEvents="none"
                        />,
                        <circle
                          key={`endpoint-multi-hatch-${nodeIndex}`}
                          cx={cx}
                          cy={cy}
                          r={hubRadius}
                          fill="url(#wallMasonryPattern)"
                          fillOpacity="0.65"
                          stroke="none"
                          pointerEvents="none"
                        />,
                      ];
                    }
                  }

                  return [];
                })}
'''
if old_tail not in text:
    raise SystemExit('shared-node renderer tail not found')
text = text.replace(old_tail, new_tail, 1)

p.write_text(text)
