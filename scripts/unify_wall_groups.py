from pathlib import Path

TYPES = Path('src/types.ts')
EDITOR = Path('src/components/FloorPlanEditor.tsx')

types = TYPES.read_text()
old_type = """export interface FloorPlanWall {
  id: string;
  x1Meters: number;
  y1Meters: number;
  x2Meters: number;
  y2Meters: number;
  thicknessMeters?: number;
  roomId?: string;
  label?: string;
}
"""
new_type = """export interface FloorPlanWall {
  id: string;
  x1Meters: number;
  y1Meters: number;
  x2Meters: number;
  y2Meters: number;
  thicknessMeters?: number;
  roomId?: string;
  // Stable architectural assembly id. Every geometrically connected wall component
  // belongs to one group, even when the drawing was made only with Draw Wall.
  groupId?: string;
  label?: string;
}
"""
if old_type not in types:
    raise SystemExit('FloorPlanWall type anchor not found')
types = types.replace(old_type, new_type, 1)
TYPES.write_text(types)

text = EDITOR.read_text()

# 1. Add an undirected connectivity graph for custom walls. It recognizes both true
# endpoint L nodes and branch endpoints that terminate on a host physical face (T).
room_anchor = """  const getRoomIdAtPoint = (point: { x: number; y: number }, tolerance = 0.03): string | undefined => {
"""
group_helper = """  const getConnectedWallComponentIds = (seedWallId: string): string[] => {
    if (!floorPlanWalls.some((wall) => wall.id === seedWallId)) return [];

    const adjacency = new Map<string, Set<string>>(
      floorPlanWalls.map((wall) => [wall.id, new Set<string>()])
    );
    const connect = (a: string, b: string) => {
      if (a === b) return;
      adjacency.get(a)?.add(b);
      adjacency.get(b)?.add(a);
    };

    // Connectivity is intentionally strict: the endpoint must already lie on the exact
    // endpoint node or physical host face. This avoids grouping walls that are merely near.
    const connectionToleranceMeters = 0.003;
    for (const wall of floorPlanWalls) {
      const start = { x: wall.x1Meters, y: wall.y1Meters };
      const end = { x: wall.x2Meters, y: wall.y2Meters };
      const startConnection = getCustomWallSnapTarget(
        start,
        end,
        connectionToleranceMeters,
        wall.id
      );
      const endConnection = getCustomWallSnapTarget(
        end,
        start,
        connectionToleranceMeters,
        wall.id
      );
      if (startConnection) connect(wall.id, startConnection.wallId);
      if (endConnection) connect(wall.id, endConnection.wallId);
    }

    const visited = new Set<string>();
    const queue = [seedWallId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
    return Array.from(visited);
  };

"""
if room_anchor not in text:
    raise SystemExit('room anchor not found')
text = text.replace(room_anchor, group_helper + room_anchor, 1)

# 2. Persist a deterministic groupId for every connected component. Recomputing from
# topology means groups automatically merge and split when connections change.
old_migration = """    const migratedWalls = floorPlanWalls.map(normalizeWallConnections);
    const changed = migratedWalls.some((wall, index) => {
      const previous = floorPlanWalls[index];
      return (
        wall.roomId !== previous.roomId ||
        Math.abs(wall.x1Meters - previous.x1Meters) > 1e-6 ||
        Math.abs(wall.y1Meters - previous.y1Meters) > 1e-6 ||
        Math.abs(wall.x2Meters - previous.x2Meters) > 1e-6 ||
        Math.abs(wall.y2Meters - previous.y2Meters) > 1e-6
      );
    });
"""
new_migration = """    const groupIdByWall = new Map<string, string>();
    const groupedWallIds = new Set<string>();
    for (const wall of floorPlanWalls) {
      if (groupedWallIds.has(wall.id)) continue;
      const componentIds = getConnectedWallComponentIds(wall.id);
      const stableIds = componentIds.length > 0 ? componentIds : [wall.id];
      const canonicalWallId = [...stableIds].sort()[0];
      const groupId = `wallgrp_${canonicalWallId}`;
      stableIds.forEach((id) => {
        groupedWallIds.add(id);
        groupIdByWall.set(id, groupId);
      });
    }

    const migratedWalls = floorPlanWalls
      .map(normalizeWallConnections)
      .map((wall) => ({
        ...wall,
        groupId: groupIdByWall.get(wall.id) || `wallgrp_${wall.id}`,
      }));
    const changed = migratedWalls.some((wall, index) => {
      const previous = floorPlanWalls[index];
      return (
        wall.roomId !== previous.roomId ||
        wall.groupId !== previous.groupId ||
        Math.abs(wall.x1Meters - previous.x1Meters) > 1e-6 ||
        Math.abs(wall.y1Meters - previous.y1Meters) > 1e-6 ||
        Math.abs(wall.x2Meters - previous.x2Meters) > 1e-6 ||
        Math.abs(wall.y2Meters - previous.y2Meters) > 1e-6
      );
    });
"""
if old_migration not in text:
    raise SystemExit('migration block not found')
text = text.replace(old_migration, new_migration, 1)

old_signature = """      migratedWalls.map((wall) => [wall.id, wall.roomId, wall.x1Meters, wall.y1Meters, wall.x2Meters, wall.y2Meters])
"""
new_signature = """      migratedWalls.map((wall) => [
        wall.id,
        wall.roomId,
        wall.groupId,
        wall.x1Meters,
        wall.y1Meters,
        wall.x2Meters,
        wall.y2Meters,
      ])
"""
if old_signature not in text:
    raise SystemExit('migration signature not found')
text = text.replace(old_signature, new_signature, 1)

# 3. Clicking a standalone custom wall now prepares the entire connected architectural
# component for one drag, and selects the component as one drawing assembly.
old_drag_start = """    const wall = floorPlanWalls.find((item) => item.id === id);
    if (!wall) return;
    setElementDrag({ kind, id, startPointer, wall: { ...wall } });
    setToolStatus('Arrastando parede inteira. Use os pontos azuis para editar apenas uma extremidade.');
"""
new_drag_start = """    const wall = floorPlanWalls.find((item) => item.id === id);
    if (!wall) return;

    // Walls that already belong to a room keep their room editing semantics. A standalone
    // wall network, however, is one architectural drawing and must move as one assembly.
    const componentIds = wall.roomId ? [wall.id] : getConnectedWallComponentIds(wall.id);
    const effectiveIds = componentIds.length > 0 ? componentIds : [wall.id];
    const componentIdSet = new Set(effectiveIds);
    const componentWalls = floorPlanWalls
      .filter((item) => componentIdSet.has(item.id))
      .map((item) => ({ ...item }));
    const componentOpenings = floorPlanOpenings
      .filter((opening) => Boolean(opening.wallId && componentIdSet.has(opening.wallId)))
      .map((opening) => ({ ...opening }));

    if (!wall.roomId && componentWalls.length > 1) {
      setSelectedWallIds(componentWalls.map((item) => item.id));
    }
    setElementDrag({
      kind,
      id,
      startPointer,
      wall: { ...wall },
      childWalls: componentWalls,
      childOpenings: componentOpenings,
    });
    setToolStatus(
      !wall.roomId && componentWalls.length > 1
        ? `Arrastando planta conectada: ${componentWalls.length} paredes como um único desenho.`
        : 'Arrastando parede inteira. Use os pontos azuis para editar apenas uma extremidade.'
    );
"""
if old_drag_start not in text:
    raise SystemExit('wall drag start block not found')
text = text.replace(old_drag_start, new_drag_start, 1)

# 4. Translate the complete component and all hosted openings atomically during drag.
old_wall_move = """      if (elementDrag.kind === 'wall' && elementDrag.wall) {
        const origin = elementDrag.wall;
        const minOriginX = Math.min(origin.x1Meters, origin.x2Meters);
        const minOriginY = Math.min(origin.y1Meters, origin.y2Meters);
        const appliedX = Math.max(-minOriginX, snapDelta(deltaX));
        const appliedY = Math.max(-minOriginY, snapDelta(deltaY));
        const updatedWalls = floorPlanWalls.map((wall) =>
          wall.id === elementDrag.id
            ? {
                ...wall,
                x1Meters: origin.x1Meters + appliedX,
                y1Meters: origin.y1Meters + appliedY,
                x2Meters: origin.x2Meters + appliedX,
                y2Meters: origin.y2Meters + appliedY,
              }
            : wall
        );
        onUpdateProjectData({
          ...projectData,
          floorPlan: {
            ...baseFloorPlan,
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: floorPlanSymbols,
            conduits: floorPlanConduits,
            openings: floorPlanOpenings,
            walls: updatedWalls,
          },
        });
        return;
      }
"""
new_wall_move = """      if (elementDrag.kind === 'wall' && elementDrag.wall) {
        const origin = elementDrag.wall;
        const dragWalls =
          elementDrag.childWalls && elementDrag.childWalls.length > 0
            ? elementDrag.childWalls
            : [origin];
        const wallOrigins = new Map<string, FloorPlanWall>(
          dragWalls.map((item) => [item.id, item] as const)
        );
        const openingOrigins = new Map<string, FloorPlanOpening>(
          (elementDrag.childOpenings || []).map((item) => [item.id, item] as const)
        );
        const minOriginX = Math.min(
          ...dragWalls.flatMap((item) => [item.x1Meters, item.x2Meters])
        );
        const minOriginY = Math.min(
          ...dragWalls.flatMap((item) => [item.y1Meters, item.y2Meters])
        );
        const appliedX = Math.max(-minOriginX, snapDelta(deltaX));
        const appliedY = Math.max(-minOriginY, snapDelta(deltaY));

        const updatedWalls = floorPlanWalls.map((wall) => {
          const original = wallOrigins.get(wall.id);
          return original
            ? {
                ...wall,
                x1Meters: original.x1Meters + appliedX,
                y1Meters: original.y1Meters + appliedY,
                x2Meters: original.x2Meters + appliedX,
                y2Meters: original.y2Meters + appliedY,
              }
            : wall;
        });
        const updatedOpenings = floorPlanOpenings.map((opening) => {
          const original = openingOrigins.get(opening.id);
          return original
            ? {
                ...opening,
                xMeters: original.xMeters + appliedX,
                yMeters: original.yMeters + appliedY,
              }
            : opening;
        });

        onUpdateProjectData({
          ...projectData,
          floorPlan: {
            ...baseFloorPlan,
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: floorPlanSymbols,
            conduits: floorPlanConduits,
            openings: updatedOpenings,
            walls: updatedWalls,
          },
        });
        return;
      }
"""
if old_wall_move not in text:
    raise SystemExit('wall move block not found')
text = text.replace(old_wall_move, new_wall_move, 1)

EDITOR.write_text(text)
