from pathlib import Path
import re

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'{label}: pattern not found')
    text = text.replace(old, new, 1)

# 1) Pure CAD kernel import.
replace_once(
"""} from '../utils/nbrSheetEngine';
""",
"""} from '../utils/nbrSheetEngine';
import {
  analyzeWallNetwork,
  findWallNodeNearPoint,
  getConnectedWallIds,
  type WallGraphNode,
  type WallNodeBranch,
} from '../utils/wallCadEngine';
""",
'import wallCadEngine'
)

# 2) One memoized topology/diagnostic source for the whole editor.
replace_once(
"""  const floorPlanWalls = projectData.floorPlan?.walls || [];

  // A room is stored by its architectural outer rectangle, while the rendered masonry
""",
"""  const floorPlanWalls = projectData.floorPlan?.walls || [];

  // Single source of truth for custom-wall topology. The graph understands exact shared
  // endpoints, physical-face T contacts and center-axis crossings, so grouping, grips,
  // diagnostics and junction rendering no longer disagree about what is connected.
  const wallCadAnalysis = useMemo(
    () => analyzeWallNetwork(floorPlanWalls, { defaultThicknessMeters: wallThicknessMeters }),
    [floorPlanWalls, wallThicknessMeters]
  );
  const wallGraph = wallCadAnalysis.graph;

  // A room is stored by its architectural outer rectangle, while the rendered masonry
""",
'wallCadAnalysis memo'
)

# 3) Replace ad-hoc BFS connectivity with the tested graph.
pattern = re.compile(
    r"  const getConnectedWallComponentIds = \(seedWallId: string\): string\[\] => \{.*?\n  \};\n\n  const getRoomIdAtPoint",
    re.S,
)
replacement = """  const getConnectedWallComponentIds = (seedWallId: string): string[] =>
    getConnectedWallIds(wallGraph, seedWallId);

  const getRoomIdAtPoint"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('replace connected component: pattern not found')

# 4) Existing render adapter can now represent angled/Y logical nodes too.
replace_once(
"""    kind: 'single' | 'straight' | 'L' | 'T' | 'X' | 'multi';
""",
"""    kind: 'single' | 'straight' | 'L' | 'corner' | 'T' | 'Y' | 'X' | 'multi';
""",
'endpoint topology union'
)

# 5) Replace exact-endpoint-only topology with an adapter over the robust CAD graph.
topo_pattern = re.compile(
    r"  const getEndpointNodeTopology = \(.*?\n  const getUniqueCustomEndpointNodeTopologies = \(\): EndpointNodeTopology\[\] => \{.*?\n  \};\n",
    re.S,
)
topo_replacement = r"""  const adaptCadNodeToEndpointTopology = (cadNode: WallGraphNode): EndpointNodeTopology | null => {
    const branchMap = new Map<WallNodeBranch, EndpointNodeBranch>();
    const branches: EndpointNodeBranch[] = [];

    for (const cadBranch of cadNode.branches) {
      const wall = floorPlanWalls.find((item) => item.id === cadBranch.wallId);
      if (!wall) continue;
      const dx = wall.x2Meters - wall.x1Meters;
      const dy = wall.y2Meters - wall.y1Meters;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;
      const storedUx = dx / length;
      const storedUy = dy / length;
      const usesStart =
        cadBranch.role === 'start'
          ? true
          : cadBranch.role === 'end'
            ? false
            : Math.hypot(cadBranch.anchor.x - wall.x1Meters, cadBranch.anchor.y - wall.y1Meters) <=
              Math.hypot(cadBranch.anchor.x - wall.x2Meters, cadBranch.anchor.y - wall.y2Meters);
      const adapted: EndpointNodeBranch = {
        wall,
        wallId: wall.id,
        usesStart,
        awayUx: cadBranch.direction.x,
        awayUy: cadBranch.direction.y,
        storedUx,
        storedUy,
        storedNx: -storedUy,
        storedNy: storedUx,
        halfMeters: (wall.thicknessMeters || wallThicknessMeters) / 2,
      };
      branchMap.set(cadBranch, adapted);
      branches.push(adapted);
    }

    if (branches.length === 0) return null;
    const throughPairs = cadNode.throughPairs
      .map(([a, b]) => {
        const aa = branchMap.get(a);
        const bb = branchMap.get(b);
        return aa && bb ? ([aa, bb] as [EndpointNodeBranch, EndpointNodeBranch]) : null;
      })
      .filter((pair): pair is [EndpointNodeBranch, EndpointNodeBranch] => Boolean(pair));

    const mappedKind: EndpointNodeTopology['kind'] =
      cadNode.kind === 'end'
        ? 'single'
        : cadNode.kind;
    let stem: EndpointNodeBranch | undefined;
    if (mappedKind === 'T' && throughPairs[0]) {
      const [a, b] = throughPairs[0];
      stem = branches.find((branch) => branch !== a && branch !== b);
    }

    return {
      point: { ...cadNode.point },
      branches,
      kind: mappedKind,
      throughPairs,
      stem,
    };
  };

  const getEndpointNodeTopology = (
    point: { x: number; y: number },
    epsilon = 0.004
  ): EndpointNodeTopology | null => {
    const direct = findWallNodeNearPoint(wallGraph, point, epsilon);
    const cadNode = direct || wallGraph.nodes.find((node) =>
      node.branches.some((branch) =>
        Math.hypot(branch.anchor.x - point.x, branch.anchor.y - point.y) <= epsilon
      )
    ) || null;
    return cadNode ? adaptCadNodeToEndpointTopology(cadNode) : null;
  };

  const getUniqueCustomEndpointNodeTopologies = (): EndpointNodeTopology[] =>
    wallGraph.nodes
      .filter((node) => node.wallIds.length >= 2)
      .map(adaptCadNodeToEndpointTopology)
      .filter((topology): topology is EndpointNodeTopology => Boolean(topology));
"""
text, count = topo_pattern.subn(topo_replacement, text, count=1)
if count != 1:
    raise SystemExit('replace endpoint topology: pattern not found')

# 6) Multi-node face math must use the logical node (host axis), not a legacy face anchor.
block_start = text.find('  const getMultiNodeEndpointFacePoints = (')
block_end = text.find('  const getEndpointNodeDisplayLabel', block_start)
if block_start < 0 or block_end < 0:
    raise SystemExit('multi node block bounds not found')
block = text[block_start:block_end]
for old, new in [
    ('x: point.x + branch.storedNx', 'x: topology.point.x + branch.storedNx'),
    ('y: point.y + branch.storedNy', 'y: topology.point.y + branch.storedNy'),
    ('x: point.x - branch.storedNx', 'x: topology.point.x - branch.storedNx'),
    ('y: point.y - branch.storedNy', 'y: topology.point.y - branch.storedNy'),
    ('x: point.x + hostNx', 'x: topology.point.x + hostNx'),
    ('y: point.y + hostNy', 'y: topology.point.y + hostNy'),
]:
    block = block.replace(old, new)
text = text[:block_start] + block + text[block_end:]

# 7) Reject exact duplicate wall segments at command commit time.
old_commit = """        onUpdateProjectData({
          ...projectData,
          floorPlan: {
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: floorPlanSymbols,
            conduits: floorPlanConduits,
            openings: floorPlanOpenings,
            walls: [...floorPlanWalls, newWall],
          },
        });
        setToolStatus(
          sourceTopologyBefore
            ? `Ramificação adicionada ao nó ${sourceNodeLabel}. O encontro agora possui ${sourceNodeBranchCount + 1} paredes no mesmo desenho.`
            : 'Parede criada e conectividade da planta atualizada.'
        );
"""
new_commit = """        const nextWalls = [...floorPlanWalls, newWall];
        const nextCadAnalysis = analyzeWallNetwork(nextWalls, {
          defaultThicknessMeters: wallThicknessMeters,
        });
        const duplicateIssue = nextCadAnalysis.issues.find(
          (issue) => issue.code === 'DUPLICATE' && issue.wallIds.includes(newWall.id)
        );

        if (duplicateIssue) {
          setToolStatus('Parede não criada: já existe uma parede exatamente sobre esse segmento.');
        } else {
          onUpdateProjectData({
            ...projectData,
            floorPlan: {
              scalePixelsPerMeter: scalePxPerMeter,
              gridSnapMeters,
              symbols: floorPlanSymbols,
              conduits: floorPlanConduits,
              openings: floorPlanOpenings,
              walls: nextWalls,
            },
          });
          setToolStatus(
            sourceTopologyBefore
              ? `Ramificação adicionada ao nó ${sourceNodeLabel}. O encontro agora possui ${sourceNodeBranchCount + 1} paredes no mesmo desenho.`
              : nextCadAnalysis.issues.length > 0
                ? `Parede criada. CAD detectou ${nextCadAnalysis.issues.length} ponto(s) para revisão.`
                : 'Parede criada e rede geométrica íntegra.'
          );
        }
"""
replace_once(old_commit, new_commit, 'wall commit validation')

# 8) CAD health badge in wall tool options.
needle = """            <span className=\"text-[11px] font-bold text-blue-900\">\n              * Clique em qualquer canto do cômodo ou ponto no canvas e arraste para desenhar uma parede com linhas duplas e hachura!\n            </span>\n"""
replacement = """            <div
              className={`border px-2 py-1 font-black ${
                wallCadAnalysis.issues.length === 0
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                  : 'border-amber-600 bg-amber-50 text-amber-900'
              }`}
              title={
                wallCadAnalysis.issues.length === 0
                  ? 'A rede de paredes não possui erros geométricos detectados.'
                  : wallCadAnalysis.issues.map((issue) => issue.message).join(' • ')
              }
            >
              CAD: {wallGraph.nodes.filter((node) => node.wallIds.length >= 2).length} nós •{' '}
              {wallCadAnalysis.componentCount} rede(s) •{' '}
              {wallCadAnalysis.issues.length === 0 ? 'íntegro' : `${wallCadAnalysis.issues.length} alerta(s)`}
            </div>
            <span className=\"text-[11px] font-bold text-blue-900\">\n              * Clique em qualquer canto do cômodo ou ponto no canvas e arraste para desenhar uma parede com linhas duplas e hachura!\n            </span>\n"""
replace_once(needle, replacement, 'CAD health badge')

# 9) Visual diagnostics: a near-miss/duplicate is visible instead of silently corrupting the drawing.
needle = """              {/* Interactive Custom Walls */}\n"""
replacement = """              {/* CAD geometry diagnostics. These markers are editor-only and never alter model dimensions. */}
              {activeTool === 'draw_wall' && wallCadAnalysis.issues.map((issue, index) => {
                if (!issue.point) return null;
                const cx = issue.point.x * scalePxPerMeter;
                const cy = issue.point.y * scalePxPerMeter;
                return (
                  <g key={`cad-issue-${issue.code}-${index}`} pointerEvents=\"none\">
                    <circle
                      cx={cx}
                      cy={cy}
                      r=\"9\"
                      fill=\"#fef3c7\"
                      stroke=\"#d97706\"
                      strokeWidth=\"2\"
                      strokeDasharray=\"3 2\"
                    />
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor=\"middle\"
                      fontSize=\"9\"
                      fontWeight=\"black\"
                      fill=\"#92400e\"
                    >
                      !
                    </text>
                    <title>{issue.message}</title>
                  </g>
                );
              })}

              {/* Interactive Custom Walls */}\n"""
replace_once(needle, replacement, 'diagnostic overlay')

p.write_text(text)
