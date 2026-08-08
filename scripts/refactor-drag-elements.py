from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    text = text.replace(old, new, 1)


def replace_all(old: str, new: str, label: str, minimum: int = 1):
    global text
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{label}: expected at least {minimum} occurrences, found {count}')
    text = text.replace(old, new)
    print(f'{label}: replaced {count}')

replace_once(
"""type ToolMode =
  | 'select'
  | 'draw_room'
  | 'draw_wall'
  | 'add_door'
  | 'add_window'
  | 'add_symbol'
  | 'add_conduit'
  | 'measure';

const TOOL_META""",
"""type ToolMode =
  | 'select'
  | 'draw_room'
  | 'draw_wall'
  | 'add_door'
  | 'add_window'
  | 'add_symbol'
  | 'add_conduit'
  | 'measure';

type DragElementKind = 'room' | 'symbol' | 'opening' | 'wall';

interface ElementDragState {
  kind: DragElementKind;
  id: string;
  startPointer: { x: number; y: number };
  room?: Room;
  symbol?: FloorPlanSymbol;
  opening?: FloorPlanOpening;
  wall?: FloorPlanWall;
  childSymbols?: FloorPlanSymbol[];
  childOpenings?: FloorPlanOpening[];
  childWalls?: FloorPlanWall[];
}

const TOOL_META""",
'add drag types'
)

text = text.replace("select: { label: 'Selecionar', shortcut: 'V' }", "select: { label: 'Selecionar / Mover', shortcut: 'V' }")

replace_once(
"""  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Tool Modes & Selections""",
"""  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [elementDrag, setElementDrag] = useState<ElementDragState | null>(null);

  // Tool Modes & Selections""",
'add drag state'
)

replace_once(
"""    setDraggingWallHandle(null);
    setIsPanning(false);
    setIsMeasuring(false);
  };""",
"""    setDraggingWallHandle(null);
    setElementDrag(null);
    setIsPanning(false);
    setIsMeasuring(false);
  };""",
'reset drag state'
)

replace_once(
"""  const snap = (meters: number): number => {
    if (gridSnapMeters <= 0) return Math.round(meters * 100) / 100;
    return Math.round(meters / gridSnapMeters) * gridSnapMeters;
  };

  // Convert SVG event mouse coords to meter coords
  const getMeterCoordsFromEvent = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {""",
"""  const snap = (meters: number): number => {
    if (gridSnapMeters <= 0) return Math.round(meters * 100) / 100;
    return Math.round(meters / gridSnapMeters) * gridSnapMeters;
  };

  const snapDelta = (meters: number): number => {
    if (gridSnapMeters <= 0) return Math.round(meters * 100) / 100;
    return Math.round(meters / gridSnapMeters) * gridSnapMeters;
  };

  // Convert SVG event mouse coords to meter coords
  const getMeterCoordsFromEvent = (e: React.MouseEvent<SVGElement>): { x: number; y: number } => {""",
'generalize pointer coordinate helper'
)

anchor = """  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {"""
insert = """  const selectElementForDrag = (kind: DragElementKind, id: string, additive: boolean) => {
    if (additive) {
      if (kind === 'room') {
        setSelectedRoomIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
      } else if (kind === 'symbol') {
        setSelectedSymbolIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
      } else if (kind === 'opening') {
        setSelectedOpeningIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
      } else {
        setSelectedWallIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
      }
      return;
    }

    clearSelections();
    if (kind === 'room') setSelectedRoomIds([id]);
    if (kind === 'symbol') setSelectedSymbolIds([id]);
    if (kind === 'opening') setSelectedOpeningIds([id]);
    if (kind === 'wall') setSelectedWallIds([id]);
  };

  const startElementDrag = (
    kind: DragElementKind,
    id: string,
    e: React.MouseEvent<SVGElement>
  ) => {
    if (activeTool !== 'select' || e.button !== 0 || isSpacePressed) return;

    e.stopPropagation();
    const startPointer = getMeterCoordsFromEvent(e);
    selectElementForDrag(kind, id, e.shiftKey);

    if (e.shiftKey) {
      setToolStatus('Seleção múltipla atualizada. Arraste sem Shift para reposicionar.');
      return;
    }

    if (kind === 'room') {
      const room = roomsWithGeometry.find((item) => item.id === id);
      if (!room) return;
      setElementDrag({
        kind,
        id,
        startPointer,
        room: { ...room },
        childSymbols: floorPlanSymbols.filter((item) => item.roomId === id).map((item) => ({ ...item })),
        childOpenings: floorPlanOpenings.filter((item) => item.roomId === id).map((item) => ({ ...item })),
        childWalls: floorPlanWalls.filter((item) => item.roomId === id).map((item) => ({ ...item })),
      });
      setToolStatus(`Arrastando cômodo: ${room.name}. Elementos vinculados acompanham.`);
      return;
    }

    if (kind === 'symbol') {
      const symbol = floorPlanSymbols.find((item) => item.id === id);
      if (!symbol) return;
      setElementDrag({ kind, id, startPointer, symbol: { ...symbol } });
      setToolStatus('Arrastando símbolo elétrico. Eletrodutos conectados acompanham.');
      return;
    }

    if (kind === 'opening') {
      const opening = floorPlanOpenings.find((item) => item.id === id);
      if (!opening) return;
      setElementDrag({ kind, id, startPointer, opening: { ...opening } });
      setToolStatus(`Arrastando ${opening.type === 'door' ? 'porta' : 'janela'} sobre as paredes.`);
      return;
    }

    const wall = floorPlanWalls.find((item) => item.id === id);
    if (!wall) return;
    setElementDrag({ kind, id, startPointer, wall: { ...wall } });
    setToolStatus('Arrastando parede inteira. Use os pontos azuis para editar apenas uma extremidade.');
  };

  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {"""
replace_once(anchor, insert, 'insert drag selection helpers')

mousemove_anchor = """    const coords = getMeterCoordsFromEvent(e);

    if (draggingWallHandle) {"""
mousemove_insert = """    const coords = getMeterCoordsFromEvent(e);

    if (elementDrag) {
      const deltaX = coords.x - elementDrag.startPointer.x;
      const deltaY = coords.y - elementDrag.startPointer.y;
      const baseFloorPlan = projectData.floorPlan || {
        scalePixelsPerMeter: scalePxPerMeter,
        gridSnapMeters,
        symbols: floorPlanSymbols,
        conduits: floorPlanConduits,
        openings: floorPlanOpenings,
        walls: floorPlanWalls,
      };

      if (elementDrag.kind === 'room' && elementDrag.room) {
        const origin = elementDrag.room;
        const originX = origin.x ?? 0;
        const originY = origin.y ?? 0;
        const nextX = Math.max(0, snap(originX + deltaX));
        const nextY = Math.max(0, snap(originY + deltaY));
        const appliedX = nextX - originX;
        const appliedY = nextY - originY;

        const childSymbols = new Map((elementDrag.childSymbols || []).map((item) => [item.id, item]));
        const childOpenings = new Map((elementDrag.childOpenings || []).map((item) => [item.id, item]));
        const childWalls = new Map((elementDrag.childWalls || []).map((item) => [item.id, item]));

        const updatedRooms = projectData.rooms.map((room) =>
          room.id === elementDrag.id ? { ...room, x: nextX, y: nextY } : room
        );
        const updatedSymbols = floorPlanSymbols.map((symbol) => {
          const original = childSymbols.get(symbol.id);
          return original
            ? { ...symbol, xMeters: original.xMeters + appliedX, yMeters: original.yMeters + appliedY }
            : symbol;
        });
        const updatedOpenings = floorPlanOpenings.map((opening) => {
          const original = childOpenings.get(opening.id);
          return original
            ? { ...opening, xMeters: original.xMeters + appliedX, yMeters: original.yMeters + appliedY }
            : opening;
        });
        const updatedWalls = floorPlanWalls.map((wall) => {
          const original = childWalls.get(wall.id);
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

        onUpdateProjectData({
          ...projectData,
          rooms: updatedRooms,
          floorPlan: {
            ...baseFloorPlan,
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: updatedSymbols,
            conduits: floorPlanConduits,
            openings: updatedOpenings,
            walls: updatedWalls,
          },
        });
        return;
      }

      if (elementDrag.kind === 'symbol' && elementDrag.symbol) {
        const origin = elementDrag.symbol;
        const nextX = Math.max(0, snap(origin.xMeters + deltaX));
        const nextY = Math.max(0, snap(origin.yMeters + deltaY));
        const updatedSymbols = floorPlanSymbols.map((symbol) =>
          symbol.id === elementDrag.id ? { ...symbol, xMeters: nextX, yMeters: nextY } : symbol
        );
        onUpdateProjectData({
          ...projectData,
          floorPlan: {
            ...baseFloorPlan,
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: updatedSymbols,
            conduits: floorPlanConduits,
            openings: floorPlanOpenings,
            walls: floorPlanWalls,
          },
        });
        return;
      }

      if (elementDrag.kind === 'opening' && elementDrag.opening) {
        const origin = elementDrag.opening;
        const desiredX = origin.xMeters + deltaX;
        const desiredY = origin.yMeters + deltaY;
        const desiredCenter = origin.orientation === 'horizontal'
          ? { x: desiredX + origin.widthMeters / 2, y: desiredY }
          : { x: desiredX, y: desiredY + origin.widthMeters / 2 };
        const placement = getOpeningPlacementOnWall(
          desiredCenter,
          origin.widthMeters,
          Math.max(0.75, gridSnapMeters * 3)
        );

        if (placement) {
          const updatedOpenings = floorPlanOpenings.map((opening) =>
            opening.id === elementDrag.id
              ? {
                  ...opening,
                  xMeters: placement.x,
                  yMeters: placement.y,
                  orientation: placement.orientation,
                  roomId: placement.roomId,
                }
              : opening
          );
          onUpdateProjectData({
            ...projectData,
            floorPlan: {
              ...baseFloorPlan,
              scalePixelsPerMeter: scalePxPerMeter,
              gridSnapMeters,
              symbols: floorPlanSymbols,
              conduits: floorPlanConduits,
              openings: updatedOpenings,
              walls: floorPlanWalls,
            },
          });
        }
        return;
      }

      if (elementDrag.kind === 'wall' && elementDrag.wall) {
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
    }

    if (draggingWallHandle) {"""
replace_once(mousemove_anchor, mousemove_insert, 'add drag mousemove behavior')

replace_once(
"""  const handleMouseUp = () => {
    if (isPanning) {""",
"""  const handleMouseUp = () => {
    if (elementDrag) {
      const movedLabel =
        elementDrag.kind === 'room'
          ? 'Cômodo reposicionado.'
          : elementDrag.kind === 'symbol'
            ? 'Símbolo reposicionado; conexões atualizadas.'
            : elementDrag.kind === 'opening'
              ? 'Abertura reposicionada na parede.'
              : 'Parede reposicionada.';
      setElementDrag(null);
      setToolStatus(movedLabel);
      return;
    }

    if (isPanning) {""",
'end element drag on mouseup'
)

old_opening_handler = """    const handleOpeningClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeTool === 'select') {
        if (e.shiftKey) {
          setSelectedOpeningIds((prev) =>
            prev.includes(op.id) ? prev.filter((id) => id !== op.id) : [...prev, op.id]
          );
        } else {
          setSelectedOpeningIds([op.id]);
          setSelectedRoomIds([]);
          setSelectedSymbolIds([]);
          setSelectedWallIds([]);
        }
      }
    };"""
new_opening_handler = """    const handleOpeningMouseDown = (e: React.MouseEvent<SVGGElement>) => {
      if (activeTool === 'select') startElementDrag('opening', op.id, e);
    };"""
replace_once(old_opening_handler, new_opening_handler, 'replace opening selection with drag')
replace_all('onClick={handleOpeningClick} className="cursor-pointer"', 'onMouseDown={handleOpeningMouseDown} className="cursor-grab active:cursor-grabbing"', 'wire opening drag handlers', minimum=4)

old_symbol_handler = """    const onSymClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleSymbolClick(sym.id, e);
    };"""
new_symbol_handler = """    const onSymMouseDown = (e: React.MouseEvent<SVGGElement>) => {
      if (activeTool === 'select') startElementDrag('symbol', sym.id, e);
    };

    const onSymClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeTool === 'add_conduit') handleSymbolClick(sym.id, e);
    };"""
replace_once(old_symbol_handler, new_symbol_handler, 'add symbol drag handler')
replace_all('onClick={onSymClick} className="cursor-pointer"', 'onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing"', 'wire symbol drag handlers', minimum=6)

old_room_click = """                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool === 'select') {
                        if (e.shiftKey) {
                          setSelectedRoomIds((prev) =>
                            prev.includes(room.id) ? prev.filter((id) => id !== room.id) : [...prev, room.id]
                          );
                        } else {
                          setSelectedRoomIds([room.id]);
                          setSelectedSymbolIds([]);
                          setSelectedOpeningIds([]);
                          setSelectedWallIds([]);
                        }
                      }
                    }}
                    className="cursor-pointer""" 
new_room_click = """                    onMouseDown={(e) => startElementDrag('room', room.id, e)}
                    className="cursor-grab active:cursor-grabbing"""
replace_once(old_room_click, new_room_click, 'wire room drag handler')

old_wall_click = """                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool === 'select') {
                        if (e.shiftKey) {
                          setSelectedWallIds((prev) =>
                            prev.includes(w.id) ? prev.filter((id) => id !== w.id) : [...prev, w.id]
                          );
                        } else {
                          setSelectedWallIds([w.id]);
                          setSelectedRoomIds([]);
                          setSelectedSymbolIds([]);
                          setSelectedOpeningIds([]);
                        }
                      }
                    }}
                    className="cursor-pointer"""
new_wall_click = """                    onMouseDown={(e) => startElementDrag('wall', w.id, e)}
                    className="cursor-grab active:cursor-grabbing"""
replace_once(old_wall_click, new_wall_click, 'wire wall drag handler')

replace_once(
"""style={{ cursor: isPanning ? 'grabbing' : isSpacePressed ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair' }}""",
"""style={{ cursor: isPanning || elementDrag ? 'grabbing' : isSpacePressed ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair' }}""",
'update canvas cursor'
)

text = text.replace(
"Esc cancela • Espaço + arrastar move a vista • Shift trava parede • V/R/W/D/J/E/C/M",
"Arraste elementos com Selecionar • Esc cancela • Espaço + arrastar move a vista • Shift seleciona múltiplos / trava parede • V/R/W/D/J/E/C/M"
)

# The toolbar may still contain the old visible label.
text = text.replace('<span>Selecionar</span>', '<span>Selecionar / Mover</span>')

path.write_text(text)
print('FloorPlanEditor draggable element refactor applied successfully.')
