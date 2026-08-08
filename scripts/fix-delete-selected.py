from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

old = """  // Delete selected elements
  const handleDeleteSelected = () => {
    if (totalSelectedCount === 0) return;

    const updatedSymbols = floorPlanSymbols.filter((s) => !selectedSymbolIds.includes(s.id));
    const updatedConduits = floorPlanConduits.filter(
      (c) =>
        !selectedSymbolIds.includes(c.fromSymbolId) &&
        !selectedSymbolIds.includes(c.toSymbolId)
    );
    const updatedOpenings = floorPlanOpenings.filter((o) => !selectedOpeningIds.includes(o.id));
    const updatedWalls = floorPlanWalls.filter((w) => !selectedWallIds.includes(w.id));
    const updatedRooms = roomsWithGeometry.filter((r) => !selectedRoomIds.includes(r.id));

    onUpdateProjectData({
      ...projectData,
      floorPlan: {
        scalePixelsPerMeter: scalePxPerMeter,
        gridSnapMeters,
        symbols: updatedSymbols,
        conduits: updatedConduits,
        openings: updatedOpenings,
        walls: updatedWalls,
      },
    });

    onUpdateRooms(updatedRooms);

    setSelectedSymbolIds([]);
    setSelectedOpeningIds([]);
    setSelectedWallIds([]);
    setSelectedRoomIds([]);
  };
"""

new = """  // Delete selected elements atomically. A second room-only update used to restore
  // the old floorPlan immediately after deletion, making Delete appear to do nothing.
  const handleDeleteSelected = () => {
    if (totalSelectedCount === 0) return;

    const roomIdsToDelete = new Set(selectedRoomIds);

    // Deleting a room also removes elements explicitly linked to that room.
    const symbolIdsToDelete = new Set([
      ...selectedSymbolIds,
      ...floorPlanSymbols
        .filter((symbol) => symbol.roomId && roomIdsToDelete.has(symbol.roomId))
        .map((symbol) => symbol.id),
    ]);
    const openingIdsToDelete = new Set([
      ...selectedOpeningIds,
      ...floorPlanOpenings
        .filter((opening) => opening.roomId && roomIdsToDelete.has(opening.roomId))
        .map((opening) => opening.id),
    ]);
    const wallIdsToDelete = new Set([
      ...selectedWallIds,
      ...floorPlanWalls
        .filter((wall) => wall.roomId && roomIdsToDelete.has(wall.roomId))
        .map((wall) => wall.id),
    ]);

    const updatedRooms = projectData.rooms.filter((room) => !roomIdsToDelete.has(room.id));
    const updatedSymbols = floorPlanSymbols.filter((symbol) => !symbolIdsToDelete.has(symbol.id));
    const updatedOpenings = floorPlanOpenings.filter((opening) => !openingIdsToDelete.has(opening.id));
    const updatedWalls = floorPlanWalls.filter((wall) => !wallIdsToDelete.has(wall.id));

    // Any conduit touching a deleted symbol must disappear with it.
    const updatedConduits = floorPlanConduits.filter(
      (conduit) =>
        !symbolIdsToDelete.has(conduit.fromSymbolId) &&
        !symbolIdsToDelete.has(conduit.toSymbolId)
    );

    const removedCount =
      projectData.rooms.length - updatedRooms.length +
      floorPlanSymbols.length - updatedSymbols.length +
      floorPlanOpenings.length - updatedOpenings.length +
      floorPlanWalls.length - updatedWalls.length +
      floorPlanConduits.length - updatedConduits.length;

    const baseFloorPlan = projectData.floorPlan || {
      scalePixelsPerMeter: scalePxPerMeter,
      gridSnapMeters,
      symbols: floorPlanSymbols,
      conduits: floorPlanConduits,
      openings: floorPlanOpenings,
      walls: floorPlanWalls,
    };

    // One single project update prevents stale projectData from restoring deleted items.
    onUpdateProjectData({
      ...projectData,
      rooms: updatedRooms,
      floorPlan: {
        ...baseFloorPlan,
        scalePixelsPerMeter: scalePxPerMeter,
        gridSnapMeters,
        symbols: updatedSymbols,
        conduits: updatedConduits,
        openings: updatedOpenings,
        walls: updatedWalls,
      },
    });

    resetTransientGesture();
    clearSelections();
    setToolStatus(
      removedCount === 1
        ? '1 elemento excluído.'
        : `${removedCount} elementos excluídos.`
    );
  };
"""

if old not in text:
    raise SystemExit('Delete handler pattern not found')

text = text.replace(old, new, 1)
path.write_text(text)
print('Delete selected handler fixed atomically.')
