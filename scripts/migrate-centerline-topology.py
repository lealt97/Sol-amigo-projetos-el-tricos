from pathlib import Path

engine_path = Path('src/utils/wallCadEngine.ts')
engine = engine_path.read_text()

if 'canonicalizeWallCenterlineTopology' not in engine:
    engine += r'''

/**
 * Converts legacy custom-wall contacts stored on a host's physical face into one
 * canonical centerline topology. Rendering owns thickness/face trims; persisted wall
 * geometry owns only logical axes and nodes.
 *
 * This is intentionally iterative because migrating one endpoint can expose a second
 * exact connection in the same network. The operation is deterministic and idempotent.
 */
export const canonicalizeWallCenterlineTopology = (
  walls: FloorPlanWall[],
  options: WallGraphOptions = {}
): FloorPlanWall[] => {
  const nodeToleranceMeters = options.nodeToleranceMeters ?? CAD_NODE_TOLERANCE_M;
  let current = walls.map((wall) => ({ ...wall }));

  for (let pass = 0; pass < 4; pass += 1) {
    const graph = buildWallGraph(current, options);
    const endpointTargets = new Map<string, CadPoint>();

    for (const node of graph.nodes) {
      if (node.wallIds.length < 2) continue;
      for (const branch of node.branches) {
        if (branch.role !== 'start' && branch.role !== 'end') continue;
        const key = `${branch.wallId}:${branch.role}`;
        // The graph already proved this endpoint belongs to the node (including legacy
        // face contacts). Never move through-branches or free endpoints here.
        endpointTargets.set(key, { ...node.point });
      }
    }

    let changed = false;
    const next = current.map((wall) => {
      const startTarget = endpointTargets.get(`${wall.id}:start`);
      const endTarget = endpointTargets.get(`${wall.id}:end`);
      const nextStart = startTarget || wallStart(wall);
      const nextEnd = endTarget || wallEnd(wall);
      if (
        distance(nextStart, wallStart(wall)) > nodeToleranceMeters / 20 ||
        distance(nextEnd, wallEnd(wall)) > nodeToleranceMeters / 20
      ) {
        changed = true;
      }
      return {
        ...wall,
        x1Meters: nextStart.x,
        y1Meters: nextStart.y,
        x2Meters: nextEnd.x,
        y2Meters: nextEnd.y,
      };
    });

    current = next;
    if (!changed) break;
  }

  return current;
};
'''
    engine_path.write_text(engine)

reg_path = Path('scripts/wall-cad-regression.ts')
reg = reg_path.read_text()
if 'canonicalizeWallCenterlineTopology' not in reg:
    reg = reg.replace(
        '  analyzeWallNetwork,\n',
        '  analyzeWallNetwork,\n  canonicalizeWallCenterlineTopology,\n',
        1,
    )
if '20 cenários críticos' not in reg:
    marker = "console.log('wall-cad-regression: 17 cenários críticos passaram');"
    extra = r'''
// 18) T legado salvo na face física é migrado para o eixo lógico da hospedeira.
{
  const walls = [
    wall('host', 0, 0, 4, 0, 0.20),
    wall('stem', 2, 0.10, 2, 2, 0.10),
  ];
  const canonical = canonicalizeWallCenterlineTopology(walls);
  const stem = canonical.find((item) => item.id === 'stem')!;
  assert.ok(Math.abs(stem.x1Meters - 2) < 1e-9);
  assert.ok(Math.abs(stem.y1Meters - 0) < 1e-9);
  const node = findWallNodeNearPoint(buildWallGraph(canonical), { x: 2, y: 0 }, 0.004);
  assert.equal(node?.kind, 'T');
}

// 19) Nó compartilhado ligeiramente desalinhado dentro da tolerância converge para um ponto único.
{
  const walls = [
    wall('a', 0, 0, 2, 0),
    wall('b', 2.001, 0.001, 2.001, 2),
  ];
  const canonical = canonicalizeWallCenterlineTopology(walls);
  const a = canonical.find((item) => item.id === 'a')!;
  const b = canonical.find((item) => item.id === 'b')!;
  assert.ok(Math.hypot(a.x2Meters - b.x1Meters, a.y2Meters - b.y1Meters) < 1e-9);
}

// 20) Canonização é idempotente e não altera uma topologia já canônica.
{
  const walls = [
    wall('host', 0, 0, 4, 0),
    wall('stem', 2, 0, 2, 2),
  ];
  const once = canonicalizeWallCenterlineTopology(walls);
  const twice = canonicalizeWallCenterlineTopology(once);
  assert.deepEqual(twice, once);
}

console.log('wall-cad-regression: 20 cenários críticos passaram');
'''
    if marker not in reg:
        raise SystemExit('17-scenario marker not found')
    reg = reg.replace(marker, extra, 1)
reg_path.write_text(reg)

editor_path = Path('src/components/FloorPlanEditor.tsx')
text = editor_path.read_text()

if 'canonicalizeWallCenterlineTopology,' not in text:
    text = text.replace(
        '  analyzeWallNetwork,\n',
        '  analyzeWallNetwork,\n  canonicalizeWallCenterlineTopology,\n',
        1,
    )

# Custom-to-custom snap: always persist the logical center axis. Face choice belongs only
# to render trimming. Exact endpoint rule for L remains unchanged.
old_comment = '''  // Resolve a custom-wall junction against the PHYSICAL face of the host wall.
  // Mid-segment hits become true butt/T junctions. Endpoint hits keep the shared
  // center-axis node so L/end-to-end corners continue behaving like a polyline node.
'''
new_comment = '''  // Resolve custom-wall topology on CENTER AXES only. Thickness and physical-face
  // termination are derived at render time. Exact endpoint hits stay exact L/nodes;
  // every non-zero position along the segment remains a T candidate.
'''
if old_comment not in text:
    raise SystemExit('custom snap comment not found')
text = text.replace(old_comment, new_comment, 1)

old_face_block = '''      let face: CustomWallSnapTarget['face'] = 'axis';
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
'''
new_face_block = '''      // Do not store a face point for custom walls. The logical node is always the
      // orthogonal projection on the host centerline; getMultiNodeEndpointFacePoints()
      // later trims the visible stem to the correct physical face.
      const projection = projectPointToSegment(point, start, end);
      consider({
        wallId: host.id,
        kind: 'segment',
        face: 'axis',
'''
if old_face_block not in text:
    raise SystemExit('physical custom face block not found')
text = text.replace(old_face_block, new_face_block, 1)

# Remove now-unused half local but keep nx/ny/thickness in returned metadata.
text = text.replace('      const half = thickness / 2;\n', '', 1)

# Migration: first resolve room/custom targets, then canonicalize all custom contacts.
old_migration = '''    const migratedWalls = floorPlanWalls
      .map(normalizeWallConnections)
      .map((wall) => ({
        ...wall,
        groupId: groupIdByWall.get(wall.id) || `wallgrp_${wall.id}`,
      }));
'''
new_migration = '''    const normalizedWalls = floorPlanWalls.map(normalizeWallConnections);
    const centerlineWalls = canonicalizeWallCenterlineTopology(normalizedWalls, {
      defaultThicknessMeters: wallThicknessMeters,
    });
    const migratedWalls = centerlineWalls.map((wall) => ({
      ...wall,
      groupId: groupIdByWall.get(wall.id) || `wallgrp_${wall.id}`,
    }));
'''
if old_migration not in text:
    raise SystemExit('migration wall block not found')
text = text.replace(old_migration, new_migration, 1)

# Preserve door/window absolute location when a host wall endpoint moves during migration.
old_changed = '''    const changed = migratedWalls.some((wall, index) => {
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
    if (!changed) return;
'''
new_changed = '''    const migratedWallById = new Map(migratedWalls.map((wall) => [wall.id, wall] as const));
    const previousWallById = new Map(floorPlanWalls.map((wall) => [wall.id, wall] as const));
    const migratedOpenings = floorPlanOpenings.map((opening) => {
      if (!opening.wallId) return opening;
      const previousWall = previousWallById.get(opening.wallId);
      const nextWall = migratedWallById.get(opening.wallId);
      if (!previousWall || !nextWall) return opening;
      const previousDx = previousWall.x2Meters - previousWall.x1Meters;
      const previousDy = previousWall.y2Meters - previousWall.y1Meters;
      const oldRatio = Math.max(0, Math.min(1, opening.wallPositionRatio ?? 0.5));
      const oldCenter = {
        x: previousWall.x1Meters + previousDx * oldRatio,
        y: previousWall.y1Meters + previousDy * oldRatio,
      };
      const nextDx = nextWall.x2Meters - nextWall.x1Meters;
      const nextDy = nextWall.y2Meters - nextWall.y1Meters;
      const nextLengthSq = nextDx * nextDx + nextDy * nextDy;
      if (nextLengthSq < 1e-9) return opening;
      const nextRatio = Math.max(0, Math.min(1,
        ((oldCenter.x - nextWall.x1Meters) * nextDx + (oldCenter.y - nextWall.y1Meters) * nextDy) / nextLengthSq
      ));
      return Math.abs(nextRatio - oldRatio) <= 1e-9
        ? opening
        : { ...opening, wallPositionRatio: nextRatio };
    });

    const wallsChanged = migratedWalls.some((wall, index) => {
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
    const openingsChanged = migratedOpenings.some((opening, index) =>
      Math.abs((opening.wallPositionRatio ?? 0.5) - (floorPlanOpenings[index]?.wallPositionRatio ?? 0.5)) > 1e-9
    );
    if (!wallsChanged && !openingsChanged) return;
'''
if old_changed not in text:
    raise SystemExit('migration changed block not found')
text = text.replace(old_changed, new_changed, 1)

old_signature = '''        wall.y2Meters,
      ])
    );
'''
new_signature = '''        wall.y2Meters,
      ]).concat(migratedOpenings.map((opening) => [opening.id, opening.wallId, opening.wallPositionRatio]))
    );
'''
if old_signature not in text:
    raise SystemExit('migration signature block not found')
text = text.replace(old_signature, new_signature, 1)

old_commit = '''        walls: migratedWalls,
      },
    });
'''
new_commit = '''        walls: migratedWalls,
        openings: migratedOpenings,
      },
    });
'''
# Only replace first occurrence after signature / migration area.
migration_pos = text.find('wallJunctionMigrationSignatureRef.current = signature;')
commit_pos = text.find(old_commit, migration_pos)
if commit_pos < 0:
    raise SystemExit('migration commit block not found')
text = text[:commit_pos] + text[commit_pos:].replace(old_commit, new_commit, 1)

editor_path.write_text(text)
