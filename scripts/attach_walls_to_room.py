from pathlib import Path

p = Path('src/components/FloorPlanEditor.tsx')
text = p.read_text()

anchor = """  const normalizeWallConnections = (wall: FloorPlanWall): FloorPlanWall => {\n"""
insert = """  const getRoomIdAtPoint = (point: { x: number; y: number }, tolerance = 0.03): string | undefined => {\n    const candidates = roomsWithGeometry\n      .filter((room) => {\n        if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) return false;\n        return (\n          point.x >= room.x - tolerance &&\n          point.x <= room.x + room.widthMeters + tolerance &&\n          point.y >= room.y - tolerance &&\n          point.y <= room.y + room.heightMeters + tolerance\n        );\n      })\n      .sort((a, b) =>\n        (a.widthMeters || 0) * (a.heightMeters || 0) -\n        (b.widthMeters || 0) * (b.heightMeters || 0)\n      );\n\n    return candidates[0]?.id;\n  };\n\n"""
if anchor not in text:
    raise SystemExit('normalizeWallConnections anchor not found')
text = text.replace(anchor, insert + anchor, 1)

old = """    const startTarget = resolveEndpoint(start, end);\n    const endTarget = resolveEndpoint(end, start);\n\n    return {\n      ...wall,\n      x1Meters: startTarget?.x ?? wall.x1Meters,\n      y1Meters: startTarget?.y ?? wall.y1Meters,\n      x2Meters: endTarget?.x ?? wall.x2Meters,\n      y2Meters: endTarget?.y ?? wall.y2Meters,\n    };\n  };\n"""
new = """    const startTarget = resolveEndpoint(start, end);\n    const endTarget = resolveEndpoint(end, start);\n    const normalizedStart = {\n      x: startTarget?.x ?? wall.x1Meters,\n      y: startTarget?.y ?? wall.y1Meters,\n    };\n    const normalizedEnd = {\n      x: endTarget?.x ?? wall.x2Meters,\n      y: endTarget?.y ?? wall.y2Meters,\n    };\n\n    // A custom wall is part of the architectural room/planta it is drawn inside or\n    // attached to. This ownership makes room dragging a true grouped architectural move.\n    const existingRoomId = wall.roomId && roomsWithGeometry.some((room) => room.id === wall.roomId)\n      ? wall.roomId\n      : undefined;\n    const midpointRoomId = getRoomIdAtPoint({\n      x: (normalizedStart.x + normalizedEnd.x) / 2,\n      y: (normalizedStart.y + normalizedEnd.y) / 2,\n    });\n\n    const connectedRoomIds = [startTarget, endTarget]\n      .flatMap((target) => {\n        if (!target) return [];\n        if ('roomId' in target) return [target.roomId];\n        if ('wallId' in target) {\n          const host = floorPlanWalls.find((item) => item.id === target.wallId);\n          return host?.roomId ? [host.roomId] : [];\n        }\n        return [];\n      })\n      .filter((roomId): roomId is string => Boolean(roomId));\n    const uniqueConnectedRoomIds = Array.from(new Set(connectedRoomIds));\n    const inferredRoomId =\n      existingRoomId ||\n      midpointRoomId ||\n      (uniqueConnectedRoomIds.length === 1 ? uniqueConnectedRoomIds[0] : undefined);\n\n    return {\n      ...wall,\n      roomId: inferredRoomId,\n      x1Meters: normalizedStart.x,\n      y1Meters: normalizedStart.y,\n      x2Meters: normalizedEnd.x,\n      y2Meters: normalizedEnd.y,\n    };\n  };\n"""
if old not in text:
    raise SystemExit('normalizeWallConnections body anchor not found')
text = text.replace(old, new, 1)

old = """        Math.abs(wall.x1Meters - previous.x1Meters) > 1e-6 ||\n        Math.abs(wall.y1Meters - previous.y1Meters) > 1e-6 ||\n        Math.abs(wall.x2Meters - previous.x2Meters) > 1e-6 ||\n        Math.abs(wall.y2Meters - previous.y2Meters) > 1e-6\n"""
new = """        wall.roomId !== previous.roomId ||\n        Math.abs(wall.x1Meters - previous.x1Meters) > 1e-6 ||\n        Math.abs(wall.y1Meters - previous.y1Meters) > 1e-6 ||\n        Math.abs(wall.x2Meters - previous.x2Meters) > 1e-6 ||\n        Math.abs(wall.y2Meters - previous.y2Meters) > 1e-6\n"""
if old not in text:
    raise SystemExit('migration changed-check anchor not found')
text = text.replace(old, new, 1)
old = """      migratedWalls.map((wall) => [wall.id, wall.x1Meters, wall.y1Meters, wall.x2Meters, wall.y2Meters])\n"""
new = """      migratedWalls.map((wall) => [wall.id, wall.roomId, wall.x1Meters, wall.y1Meters, wall.x2Meters, wall.y2Meters])\n"""
if old not in text:
    raise SystemExit('migration signature anchor not found')
text = text.replace(old, new, 1)

old = """        { wallId: wall.id }\n      ));\n"""
new = """        { wallId: wall.id, roomId: wall.roomId }\n      ));\n"""
if old not in text:
    raise SystemExit('opening custom-wall metadata anchor not found')
text = text.replace(old, new, 1)

old = """          { wallId: wall.id }\n        );\n"""
new = """          { wallId: wall.id, roomId: wall.roomId }\n        );\n"""
if old not in text:
    raise SystemExit('resolved opening wall metadata anchor not found')
text = text.replace(old, new, 1)

old = """    if (kind === 'room') {\n      const room = roomsWithGeometry.find((item) => item.id === id);\n      if (!room) return;\n      setElementDrag({\n        kind,\n        id,\n        startPointer,\n        room: { ...room },\n        childSymbols: floorPlanSymbols.filter((item) => item.roomId === id).map((item) => ({ ...item })),\n        childOpenings: floorPlanOpenings.filter((item) => item.roomId === id).map((item) => ({ ...item })),\n        childWalls: floorPlanWalls.filter((item) => item.roomId === id).map((item) => ({ ...item })),\n      });\n      setToolStatus(`Arrastando cômodo: ${room.name}. Elementos vinculados acompanham.`);\n      return;\n    }\n"""
new = """    if (kind === 'room') {\n      const room = roomsWithGeometry.find((item) => item.id === id);\n      if (!room) return;\n\n      const roomWalls = floorPlanWalls\n        .filter((item) => {\n          if (item.roomId === id) return true;\n          const midpoint = {\n            x: (item.x1Meters + item.x2Meters) / 2,\n            y: (item.y1Meters + item.y2Meters) / 2,\n          };\n          return getRoomIdAtPoint(midpoint) === id;\n        })\n        .map((item) => ({ ...item }));\n      const roomWallIds = new Set(roomWalls.map((item) => item.id));\n      const pointInsideDraggedRoom = (x: number, y: number) =>\n        room.x !== undefined &&\n        room.y !== undefined &&\n        Boolean(room.widthMeters) &&\n        Boolean(room.heightMeters) &&\n        x >= room.x - 0.03 &&\n        x <= room.x + (room.widthMeters || 0) + 0.03 &&\n        y >= room.y - 0.03 &&\n        y <= room.y + (room.heightMeters || 0) + 0.03;\n\n      const roomSymbols = floorPlanSymbols\n        .filter((item) => item.roomId === id || (!item.roomId && pointInsideDraggedRoom(item.xMeters, item.yMeters)))\n        .map((item) => ({ ...item, roomId: item.roomId || id }));\n      const roomOpenings = floorPlanOpenings\n        .filter((item) =>\n          item.roomId === id ||\n          Boolean(item.wallId && roomWallIds.has(item.wallId))\n        )\n        .map((item) => ({ ...item, roomId: item.roomId || id }));\n\n      setElementDrag({\n        kind,\n        id,\n        startPointer,\n        room: { ...room },\n        childSymbols: roomSymbols,\n        childOpenings: roomOpenings,\n        childWalls: roomWalls,\n      });\n      setToolStatus(`Arrastando cômodo: ${room.name}. Paredes e elementos da planta acompanham.`);\n      return;\n    }\n"""
if old not in text:
    raise SystemExit('room drag ownership block not found')
text = text.replace(old, new, 1)

old = """        const updatedSymbols = floorPlanSymbols.map((symbol) => {\n          const original = childSymbols.get(symbol.id);\n          return original\n            ? { ...symbol, xMeters: original.xMeters + appliedX, yMeters: original.yMeters + appliedY }\n            : symbol;\n        });\n        const updatedOpenings = floorPlanOpenings.map((opening) => {\n          const original = childOpenings.get(opening.id);\n          return original\n            ? { ...opening, xMeters: original.xMeters + appliedX, yMeters: original.yMeters + appliedY }\n            : opening;\n        });\n        const updatedWalls = floorPlanWalls.map((wall) => {\n          const original = childWalls.get(wall.id);\n          return original\n            ? {\n                ...wall,\n                x1Meters: original.x1Meters + appliedX,\n                y1Meters: original.y1Meters + appliedY,\n                x2Meters: original.x2Meters + appliedX,\n                y2Meters: original.y2Meters + appliedY,\n              }\n            : wall;\n        });\n"""
new = """        const updatedSymbols = floorPlanSymbols.map((symbol) => {\n          const original = childSymbols.get(symbol.id);\n          return original\n            ? {\n                ...symbol,\n                roomId: original.roomId || elementDrag.id,\n                xMeters: original.xMeters + appliedX,\n                yMeters: original.yMeters + appliedY,\n              }\n            : symbol;\n        });\n        const updatedOpenings = floorPlanOpenings.map((opening) => {\n          const original = childOpenings.get(opening.id);\n          return original\n            ? {\n                ...opening,\n                roomId: original.roomId || elementDrag.id,\n                xMeters: original.xMeters + appliedX,\n                yMeters: original.yMeters + appliedY,\n              }\n            : opening;\n        });\n        const updatedWalls = floorPlanWalls.map((wall) => {\n          const original = childWalls.get(wall.id);\n          return original\n            ? {\n                ...wall,\n                roomId: original.roomId || elementDrag.id,\n                x1Meters: original.x1Meters + appliedX,\n                y1Meters: original.y1Meters + appliedY,\n                x2Meters: original.x2Meters + appliedX,\n                y2Meters: original.y2Meters + appliedY,\n              }\n            : wall;\n        });\n"""
if old not in text:
    raise SystemExit('room drag persistence block not found')
text = text.replace(old, new, 1)

old = """        powerVA: symbolPowerVA,\n        label: `${selectedSymbolType.toUpperCase()} C${symbolCircuitNum}`,\n"""
new = """        powerVA: symbolPowerVA,\n        roomId: getRoomIdAtPoint(coords),\n        label: `${selectedSymbolType.toUpperCase()} C${symbolCircuitNum}`,\n"""
if old not in text:
    raise SystemExit('new symbol ownership anchor not found')
text = text.replace(old, new, 1)

p.write_text(text)
print('wall ownership/group movement patch applied')
