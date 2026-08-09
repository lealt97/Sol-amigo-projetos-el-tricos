from pathlib import Path

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'{label}: pattern not found')
    text = text.replace(old, new, 1)

replace_once(
"""  const [draggingWallHandle, setDraggingWallHandle] = useState<{ wallId: string; handle: 'p1' | 'p2' } | null>(null);
""",
"""  const [draggingWallHandle, setDraggingWallHandle] = useState<{
    wallId: string;
    handle: 'p1' | 'p2';
    linkedEndpoints?: { wallId: string; handle: 'p1' | 'p2' }[];
  } | null>(null);
""",
'drag handle state'
)

# The robust graph contains single ends and logical crossings too. Renderers ignore node
# kinds they do not need, while the drawing tool gains precise grips for every CAD node.
replace_once(
"""  const getUniqueCustomEndpointNodeTopologies = (): EndpointNodeTopology[] =>
    wallGraph.nodes
      .filter((node) => node.wallIds.length >= 2)
      .map(adaptCadNodeToEndpointTopology)
      .filter((topology): topology is EndpointNodeTopology => Boolean(topology));
""",
"""  const getUniqueCustomEndpointNodeTopologies = (): EndpointNodeTopology[] =>
    wallGraph.nodes
      .map(adaptCadNodeToEndpointTopology)
      .filter((topology): topology is EndpointNodeTopology => Boolean(topology));

  const getLinkedEndpointHandles = (
    wallId: string,
    handle: 'p1' | 'p2'
  ): { wallId: string; handle: 'p1' | 'p2' }[] => {
    const wall = floorPlanWalls.find((item) => item.id === wallId);
    if (!wall) return [{ wallId, handle }];
    const point = handle === 'p1'
      ? { x: wall.x1Meters, y: wall.y1Meters }
      : { x: wall.x2Meters, y: wall.y2Meters };
    const cadNode = wallGraph.nodes.find((node) =>
      Math.hypot(node.point.x - point.x, node.point.y - point.y) <= 0.004 ||
      node.branches.some((branch) =>
        branch.wallId === wallId &&
        Math.hypot(branch.anchor.x - point.x, branch.anchor.y - point.y) <= 0.004
      )
    );
    if (!cadNode) return [{ wallId, handle }];

    const linked: { wallId: string; handle: 'p1' | 'p2' }[] = cadNode.branches.flatMap((branch) => {
      if (branch.role === 'start') return [{ wallId: branch.wallId, handle: 'p1' as const }];
      if (branch.role === 'end') return [{ wallId: branch.wallId, handle: 'p2' as const }];
      return [];
    });
    const unique = new Map<string, { wallId: string; handle: 'p1' | 'p2' }>();
    linked.forEach((item) => unique.set(`${item.wallId}:${item.handle}`, item));
    return unique.size > 0 ? Array.from(unique.values()) : [{ wallId, handle }];
  };
""",
'node grip topology source'
)

old_move = """        const snap = getSmartWallCoords(coords, pivotPos, e.shiftKey, draggingWallHandle.wallId);

        const updatedWalls = floorPlanWalls.map((w) => {
          if (w.id !== draggingWallHandle.wallId) return w;
          if (draggingWallHandle.handle === 'p1') {
            return { ...w, x1Meters: snap.x, y1Meters: snap.y };
          } else {
            return { ...w, x2Meters: snap.x, y2Meters: snap.y };
          }
        });
"""
new_move = """        const linkedEndpoints = draggingWallHandle.linkedEndpoints || [
          { wallId: draggingWallHandle.wallId, handle: draggingWallHandle.handle },
        ];
        let nextPoint = coords;
        if (linkedEndpoints.length <= 1) {
          const snap = getSmartWallCoords(coords, pivotPos, e.shiftKey, draggingWallHandle.wallId);
          nextPoint = { x: snap.x, y: snap.y };
        } else if (e.shiftKey) {
          const dx = coords.x - pivotPos.x;
          const dy = coords.y - pivotPos.y;
          nextPoint = Math.abs(dx) >= Math.abs(dy)
            ? { x: coords.x, y: pivotPos.y }
            : { x: pivotPos.x, y: coords.y };
        }

        const linkedByWall = new Map<string, 'p1' | 'p2'>(
          linkedEndpoints.map((item) => [item.wallId, item.handle] as const)
        );
        const updatedWalls = floorPlanWalls.map((w) => {
          const linkedHandle = linkedByWall.get(w.id);
          if (!linkedHandle) return w;
          if (linkedHandle === 'p1') {
            return { ...w, x1Meters: nextPoint.x, y1Meters: nextPoint.y };
          }
          return { ...w, x2Meters: nextPoint.x, y2Meters: nextPoint.y };
        });
"""
replace_once(old_move, new_move, 'shared node move')

# Two endpoint handle mouse-down blocks.
old_p1 = """                            setDraggingWallHandle({ wallId: w.id, handle: 'p1' });
"""
new_p1 = """                            const linkedEndpoints = getLinkedEndpointHandles(w.id, 'p1');
                            setDraggingWallHandle({ wallId: w.id, handle: 'p1', linkedEndpoints });
                            if (linkedEndpoints.length > 1) {
                              setToolStatus(`Editando nó compartilhado: ${linkedEndpoints.length} extremidades permanecem conectadas.`);
                            }
"""
replace_once(old_p1, new_p1, 'p1 linked node capture')

old_p2 = """                            setDraggingWallHandle({ wallId: w.id, handle: 'p2' });
"""
new_p2 = """                            const linkedEndpoints = getLinkedEndpointHandles(w.id, 'p2');
                            setDraggingWallHandle({ wallId: w.id, handle: 'p2', linkedEndpoints });
                            if (linkedEndpoints.length > 1) {
                              setToolStatus(`Editando nó compartilhado: ${linkedEndpoints.length} extremidades permanecem conectadas.`);
                            }
"""
replace_once(old_p2, new_p2, 'p2 linked node capture')

# Make single endpoint grips visually distinct but still explicit.
replace_once(
"""                    const gripColor = topology.kind === 'X'
                      ? '#7c3aed'
                      : topology.kind === 'multi'
                        ? '#d97706'
                        : topology.kind === 'T'
                          ? '#0284c7'
                          : '#16a34a';
""",
"""                    const gripColor = topology.kind === 'X'
                      ? '#7c3aed'
                      : topology.kind === 'multi' || topology.kind === 'Y'
                        ? '#d97706'
                        : topology.kind === 'T'
                          ? '#0284c7'
                          : topology.kind === 'single'
                            ? '#64748b'
                            : '#16a34a';
""",
'node grip colors'
)

p.write_text(text)
