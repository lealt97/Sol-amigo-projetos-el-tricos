from pathlib import Path
import re

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)


# 1) Tool metadata
needle = "type ToolMode =\n  | 'select'\n  | 'draw_room'\n  | 'draw_wall'\n  | 'add_door'\n  | 'add_window'\n  | 'add_symbol'\n  | 'add_conduit'\n  | 'measure';\n"
replacement = needle + "\nconst TOOL_META: Record<ToolMode, { label: string; shortcut: string }> = {\n  select: { label: 'Selecionar', shortcut: 'V' },\n  draw_room: { label: 'Cômodo', shortcut: 'R' },\n  draw_wall: { label: 'Parede', shortcut: 'W' },\n  add_door: { label: 'Porta', shortcut: 'D' },\n  add_window: { label: 'Janela', shortcut: 'J' },\n  add_symbol: { label: 'Símbolo elétrico', shortcut: 'E' },\n  add_conduit: { label: 'Eletroduto', shortcut: 'C' },\n  measure: { label: 'Medir / Cota', shortcut: 'M' },\n};\n"
replace_once(needle, replacement, 'tool metadata')

# 2) Space-pan state
replace_once(
    "  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });\n",
    "  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });\n  const [isSpacePressed, setIsSpacePressed] = useState(false);\n",
    'space pan state',
)

# 3) Measurement gesture state
replace_once(
    "  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);\n",
    "  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);\n  const [isMeasuring, setIsMeasuring] = useState(false);\n",
    'measurement gesture state',
)

# 4) Tool status state
replace_once(
    "  const [isExportModalOpen, setIsExportModalOpen] = useState(false);\n",
    "  const [isExportModalOpen, setIsExportModalOpen] = useState(false);\n  const [toolStatus, setToolStatus] = useState('Selecione uma ferramenta para começar.');\n",
    'tool status',
)

# 5) Interaction helpers after canvas ref
replace_once(
    "  const canvasRef = useRef<SVGSVGElement>(null);\n",
    """  const canvasRef = useRef<SVGSVGElement>(null);\n\n  const clearSelections = () => {\n    setSelectedRoomIds([]);\n    setSelectedSymbolIds([]);\n    setSelectedOpeningIds([]);\n    setSelectedWallIds([]);\n  };\n\n  const resetTransientGesture = () => {\n    setIsDrawingRoom(false);\n    setDragStartPos(null);\n    setDragCurrentPos(null);\n    setIsDrawingWall(false);\n    setWallStartPos(null);\n    setWallCurrentPos(null);\n    setWallSnapInfo(null);\n    setIsBoxSelecting(false);\n    setSelectionStart(null);\n    setSelectionCurrent(null);\n    setDraggingWallHandle(null);\n    setIsPanning(false);\n    setIsMeasuring(false);\n  };\n\n  const activateTool = (tool: ToolMode) => {\n    resetTransientGesture();\n    if (tool !== 'add_conduit') setConduitFromId(null);\n    if (tool !== 'measure') {\n      setMeasureStart(null);\n      setMeasureEnd(null);\n    }\n    setActiveTool(tool);\n    setToolStatus(`${TOOL_META[tool].label} ativa • ${TOOL_META[tool].shortcut}`);\n  };\n\n  const cancelCurrentOperation = () => {\n    resetTransientGesture();\n    setConduitFromId(null);\n    setMeasureStart(null);\n    setMeasureEnd(null);\n    setActiveTool('select');\n    setToolStatus('Operação cancelada. Ferramenta Selecionar ativa.');\n  };\n\n  const handleCanvasMouseLeave = () => {\n    if (isDrawingRoom || isDrawingWall || isMeasuring) {\n      setToolStatus('Gesto cancelado porque o cursor saiu da área de desenho.');\n    }\n    resetTransientGesture();\n  };\n""",
    'interaction helpers',
)

# 6) Helper for openings snapped to walls, placed after smart wall helper
marker = "    return { x, y, isSnapped, snapInfo, snapTargetPoint };\n  };\n\n  // Canvas Mouse Down\n"
wall_helper = """    return { x, y, isSnapped, snapInfo, snapTargetPoint };\n  };\n\n  const getOpeningPlacementOnWall = (\n    point: { x: number; y: number },\n    widthMeters: number,\n    maxDistanceMeters = Math.max(0.35, gridSnapMeters * 1.5)\n  ): { x: number; y: number; orientation: 'horizontal' | 'vertical'; roomId?: string } | null => {\n    let best:\n      | {\n          x: number;\n          y: number;\n          orientation: 'horizontal' | 'vertical';\n          roomId?: string;\n          distance: number;\n        }\n      | null = null;\n\n    const considerHorizontal = (\n      wallY: number,\n      startX: number,\n      endX: number,\n      roomId?: string\n    ) => {\n      const minX = Math.min(startX, endX);\n      const maxX = Math.max(startX, endX);\n      if (maxX - minX < widthMeters) return;\n      const openingX = Math.min(\n        Math.max(point.x - widthMeters / 2, minX),\n        maxX - widthMeters\n      );\n      const distance = Math.hypot(point.x - (openingX + widthMeters / 2), point.y - wallY);\n      if (!best || distance < best.distance) {\n        best = { x: openingX, y: wallY, orientation: 'horizontal', roomId, distance };\n      }\n    };\n\n    const considerVertical = (\n      wallX: number,\n      startY: number,\n      endY: number,\n      roomId?: string\n    ) => {\n      const minY = Math.min(startY, endY);\n      const maxY = Math.max(startY, endY);\n      if (maxY - minY < widthMeters) return;\n      const openingY = Math.min(\n        Math.max(point.y - widthMeters / 2, minY),\n        maxY - widthMeters\n      );\n      const distance = Math.hypot(point.x - wallX, point.y - (openingY + widthMeters / 2));\n      if (!best || distance < best.distance) {\n        best = { x: wallX, y: openingY, orientation: 'vertical', roomId, distance };\n      }\n    };\n\n    for (const room of roomsWithGeometry) {\n      if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) continue;\n      considerHorizontal(room.y, room.x, room.x + room.widthMeters, room.id);\n      considerHorizontal(room.y + room.heightMeters, room.x, room.x + room.widthMeters, room.id);\n      considerVertical(room.x, room.y, room.y + room.heightMeters, room.id);\n      considerVertical(room.x + room.widthMeters, room.y, room.y + room.heightMeters, room.id);\n    }\n\n    for (const wall of floorPlanWalls) {\n      const dx = wall.x2Meters - wall.x1Meters;\n      const dy = wall.y2Meters - wall.y1Meters;\n      if (Math.abs(dx) >= Math.abs(dy) * 4) {\n        considerHorizontal((wall.y1Meters + wall.y2Meters) / 2, wall.x1Meters, wall.x2Meters);\n      } else if (Math.abs(dy) >= Math.abs(dx) * 4) {\n        considerVertical((wall.x1Meters + wall.x2Meters) / 2, wall.y1Meters, wall.y2Meters);\n      }\n    }\n\n    if (!best || best.distance > maxDistanceMeters) return null;\n    const { distance: _distance, ...placement } = best;\n    return placement;\n  };\n\n  // Canvas Mouse Down\n"""
replace_once(marker, wall_helper, 'wall opening placement helper')

# 7) Pan: middle mouse or Space+left, no Shift conflict
replace_once(
    "    if (e.button === 1 || (e.button === 0 && e.shiftKey && activeTool !== 'select')) {\n",
    "    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {\n",
    'pan trigger',
)

# 8) Doors snap to nearest wall and orient automatically
old_door = """    } else if (activeTool === 'add_door') {\n      // Place door\n      const doorCount = floorPlanOpenings.filter((o) => o.type === 'door').length + 1;\n      const newDoor: FloorPlanOpening = {\n        id: `door_${Date.now()}`,\n        type: 'door',\n        xMeters: coords.x,\n        yMeters: coords.y,\n        widthMeters: doorWidthMeters,\n        orientation: openingOrientation,\n        label: `P${doorCount} (${Math.round(doorWidthMeters * 100)}cm)`,\n      };\n\n      onUpdateProjectData({\n        ...projectData,\n        floorPlan: {\n          scalePixelsPerMeter: scalePxPerMeter,\n          gridSnapMeters,\n          symbols: floorPlanSymbols,\n          conduits: floorPlanConduits,\n          openings: [...floorPlanOpenings, newDoor],\n          walls: floorPlanWalls,\n        },\n      });\n"""
new_door = """    } else if (activeTool === 'add_door') {\n      const placement = getOpeningPlacementOnWall(coords, doorWidthMeters);\n      if (!placement) {\n        setToolStatus('Porta não inserida: aproxime o cursor de uma parede.');\n        return;\n      }\n\n      const doorCount = floorPlanOpenings.filter((o) => o.type === 'door').length + 1;\n      const newDoor: FloorPlanOpening = {\n        id: `door_${Date.now()}`,\n        type: 'door',\n        xMeters: placement.x,\n        yMeters: placement.y,\n        widthMeters: doorWidthMeters,\n        orientation: placement.orientation,\n        roomId: placement.roomId,\n        label: `P${doorCount} (${Math.round(doorWidthMeters * 100)}cm)`,\n      };\n\n      onUpdateProjectData({\n        ...projectData,\n        floorPlan: {\n          scalePixelsPerMeter: scalePxPerMeter,\n          gridSnapMeters,\n          symbols: floorPlanSymbols,\n          conduits: floorPlanConduits,\n          openings: [...floorPlanOpenings, newDoor],\n          walls: floorPlanWalls,\n        },\n      });\n      setToolStatus(`Porta P${doorCount} inserida e alinhada à parede.`);\n"""
replace_once(old_door, new_door, 'door wall placement')

old_window = """    } else if (activeTool === 'add_window') {\n      // Place window\n      const windowCount = floorPlanOpenings.filter((o) => o.type === 'window').length + 1;\n      const newWindow: FloorPlanOpening = {\n        id: `win_${Date.now()}`,\n        type: 'window',\n        xMeters: coords.x,\n        yMeters: coords.y,\n        widthMeters: windowWidthMeters,\n        orientation: openingOrientation,\n        label: `J${windowCount} (${Math.round(windowWidthMeters * 100)}cm)`,\n      };\n\n      onUpdateProjectData({\n        ...projectData,\n        floorPlan: {\n          scalePixelsPerMeter: scalePxPerMeter,\n          gridSnapMeters,\n          symbols: floorPlanSymbols,\n          conduits: floorPlanConduits,\n          openings: [...floorPlanOpenings, newWindow],\n          walls: floorPlanWalls,\n        },\n      });\n"""
new_window = """    } else if (activeTool === 'add_window') {\n      const placement = getOpeningPlacementOnWall(coords, windowWidthMeters);\n      if (!placement) {\n        setToolStatus('Janela não inserida: aproxime o cursor de uma parede.');\n        return;\n      }\n\n      const windowCount = floorPlanOpenings.filter((o) => o.type === 'window').length + 1;\n      const newWindow: FloorPlanOpening = {\n        id: `win_${Date.now()}`,\n        type: 'window',\n        xMeters: placement.x,\n        yMeters: placement.y,\n        widthMeters: windowWidthMeters,\n        orientation: placement.orientation,\n        roomId: placement.roomId,\n        label: `J${windowCount} (${Math.round(windowWidthMeters * 100)}cm)`,\n      };\n\n      onUpdateProjectData({\n        ...projectData,\n        floorPlan: {\n          scalePixelsPerMeter: scalePxPerMeter,\n          gridSnapMeters,\n          symbols: floorPlanSymbols,\n          conduits: floorPlanConduits,\n          openings: [...floorPlanOpenings, newWindow],\n          walls: floorPlanWalls,\n        },\n      });\n      setToolStatus(`Janela J${windowCount} inserida e alinhada à parede.`);\n"""
replace_once(old_window, new_window, 'window wall placement')

# 9) Measurement behaves as a drag gesture
replace_once(
    "    } else if (activeTool === 'measure') {\n      setMeasureStart(coords);\n      setMeasureEnd(coords);\n    }\n",
    "    } else if (activeTool === 'measure') {\n      setMeasureStart(coords);\n      setMeasureEnd(coords);\n      setIsMeasuring(true);\n      setToolStatus('Arraste até o ponto final da medição.');\n    }\n",
    'measure mouse down',
)
replace_once(
    "    } else if (activeTool === 'measure' && measureStart) {\n      setMeasureEnd(coords);\n    }\n",
    "    } else if (isMeasuring && measureStart) {\n      setMeasureEnd(coords);\n    }\n",
    'measure mouse move',
)
replace_once(
    "    if (isBoxSelecting) {\n      setIsBoxSelecting(false);\n      setSelectionStart(null);\n      setSelectionCurrent(null);\n      return;\n    }\n\n    if (isDrawingWall",
    "    if (isBoxSelecting) {\n      setIsBoxSelecting(false);\n      setSelectionStart(null);\n      setSelectionCurrent(null);\n      return;\n    }\n\n    if (isMeasuring) {\n      setIsMeasuring(false);\n      setToolStatus('Medição concluída. Arraste novamente para medir outra distância.');\n      return;\n    }\n\n    if (isDrawingWall",
    'measure mouse up',
)

# 10) Keyboard: Escape, Space pan, shortcuts, delete
keyboard_pattern = re.compile(
    r"  // Keyboard shortcut listener for Delete & Backspace keys\n  useEffect\(\(\) => \{\n.*?\n  \}, \[\n    totalSelectedCount,.*?\n  \]\);",
    re.S,
)
keyboard_replacement = """  // Keyboard shortcuts and command cancellation\n  useEffect(() => {\n    const handleKeyDown = (e: KeyboardEvent) => {\n      const target = e.target as HTMLElement | null;\n      const isTyping =\n        target &&\n        (target.tagName === 'INPUT' ||\n          target.tagName === 'TEXTAREA' ||\n          target.tagName === 'SELECT' ||\n          target.isContentEditable);\n\n      if (isTyping) return;\n\n      if (e.code === 'Space') {\n        e.preventDefault();\n        setIsSpacePressed(true);\n        return;\n      }\n\n      if (e.key === 'Escape') {\n        e.preventDefault();\n        cancelCurrentOperation();\n        return;\n      }\n\n      if (!e.ctrlKey && !e.metaKey && !e.altKey) {\n        const shortcutMap: Record<string, ToolMode> = {\n          v: 'select',\n          r: 'draw_room',\n          w: 'draw_wall',\n          d: 'add_door',\n          j: 'add_window',\n          e: 'add_symbol',\n          c: 'add_conduit',\n          m: 'measure',\n        };\n        const nextTool = shortcutMap[e.key.toLowerCase()];\n        if (nextTool) {\n          e.preventDefault();\n          activateTool(nextTool);\n          return;\n        }\n      }\n\n      if (e.key === 'Delete' || e.key === 'Backspace') {\n        if (totalSelectedCount > 0) {\n          e.preventDefault();\n          handleDeleteSelected();\n        }\n      }\n    };\n\n    const handleKeyUp = (e: KeyboardEvent) => {\n      if (e.code === 'Space') setIsSpacePressed(false);\n    };\n\n    const handleWindowBlur = () => setIsSpacePressed(false);\n\n    window.addEventListener('keydown', handleKeyDown);\n    window.addEventListener('keyup', handleKeyUp);\n    window.addEventListener('blur', handleWindowBlur);\n    return () => {\n      window.removeEventListener('keydown', handleKeyDown);\n      window.removeEventListener('keyup', handleKeyUp);\n      window.removeEventListener('blur', handleWindowBlur);\n    };\n  }, [\n    totalSelectedCount,\n    selectedSymbolIds,\n    selectedOpeningIds,\n    selectedWallIds,\n    selectedRoomIds,\n    floorPlanSymbols,\n    floorPlanConduits,\n    floorPlanOpenings,\n    floorPlanWalls,\n    roomsWithGeometry,\n    projectData,\n    scalePxPerMeter,\n    gridSnapMeters,\n  ]);"""
text, count = keyboard_pattern.subn(keyboard_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'keyboard effect: expected 1 match, found {count}')

# 11) Activate toolbar through centralized command function
for tool in ['select', 'draw_room', 'draw_wall', 'add_door', 'add_window', 'add_symbol', 'add_conduit', 'measure']:
    text = text.replace(f"onClick={{() => setActiveTool('{tool}')}}", f"onClick={{() => activateTool('{tool}')}}")

text = text.replace('<span>Selecionar / Mover</span>', '<span>Selecionar</span>')
text = text.replace('title="Selecionar por Clique/Arrasto e Mover Objetos"', 'title="Selecionar por clique ou janela • atalho V"')
text = text.replace('title="Desenhar Cômodo a Escala (Arrastar no Canvas)"', 'title="Desenhar cômodo • atalho R"')
text = text.replace('title="Desenhar Parede Dupla a Partir de Qualquer Canto ou Ponto"', 'title="Desenhar parede • atalho W • Shift trava ortogonal"')
text = text.replace('title="Inserir Porta com Arco de Giro"', 'title="Inserir porta sobre uma parede • atalho D"')
text = text.replace('title="Inserir Janela com Vidros"', 'title="Inserir janela sobre uma parede • atalho J"')
text = text.replace('title="Inserir Símbolo Elétrico NBR 5444"', 'title="Inserir símbolo elétrico • atalho E"')
text = text.replace('title="Ligar Eletroduto"', 'title="Ligar eletroduto entre símbolos • atalho C"')
text = text.replace('title="Régua de Cotas e Medição"', 'title="Medir distância • atalho M"')

# 12) Clear button uses helper
text = text.replace(
    "onClick={() => {\n                    setSelectedSymbolIds([]);\n                    setSelectedOpeningIds([]);\n                    setSelectedWallIds([]);\n                    setSelectedRoomIds([]);\n                  }}",
    "onClick={clearSelections}",
    1,
)

# 13) Tool status bar before dynamic panels
status_marker = "        {/* Dynamic Tool Option Panels */}\n"
status_block = """        <div className=\"flex flex-wrap items-center justify-between gap-2 border border-[#141414] bg-[#141414] text-[#E4E3E0] px-3 py-2 text-[10px] font-bold uppercase\">\n          <span>Ferramenta: <strong className=\"text-amber-400\">{TOOL_META[activeTool].label}</strong> — {toolStatus}</span>\n          <span className=\"opacity-80\">Esc cancela • Espaço + arrastar move a vista • Shift trava parede • V/R/W/D/J/E/C/M</span>\n        </div>\n\n        {/* Dynamic Tool Option Panels */}\n"""
replace_once(status_marker, status_block, 'tool status bar')

# 14) Door/window UI says orientation is automatic; remove manual orientation selectors
orientation_block = """            <div className=\"flex items-center gap-1\">\n              <label className=\"font-bold\">Orientação:</label>\n              <select\n                value={openingOrientation}\n                onChange={(e) => setOpeningOrientation(e.target.value as 'horizontal' | 'vertical')}\n                className=\"bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer\"\n              >\n                <option value=\"horizontal\">Horizontal (Parede Norte/Sul)</option>\n                <option value=\"vertical\">Vertical (Parede Leste/Oeste)</option>\n              </select>\n            </div>\n"""
replacement_orientation = """            <div className=\"bg-white border border-[#141414] px-2 py-1 font-bold\">\n              Orientação automática pela parede\n            </div>\n"""
count = text.count(orientation_block)
if count != 2:
    raise SystemExit(f'orientation panels: expected 2 matches, found {count}')
text = text.replace(orientation_block, replacement_orientation)
text = text.replace("  const [openingOrientation, setOpeningOrientation] = useState<'horizontal' | 'vertical'>('horizontal');\n", '')

# 15) Canvas cursor + mouse leave
replace_once(
    '            className="bg-[#FAFAFA] font-mono cursor-crosshair"\n',
    '            className="bg-[#FAFAFA] font-mono"\n            style={{ cursor: isPanning ? \'grabbing\' : isSpacePressed ? \'grab\' : activeTool === \'select\' ? \'default\' : \'crosshair\' }}\n',
    'canvas cursor',
)
replace_once(
    '            onMouseUp={handleMouseUp}\n',
    '            onMouseUp={handleMouseUp}\n            onMouseLeave={handleCanvasMouseLeave}\n',
    'canvas mouse leave',
)

# 16) Remove misleading legacy normative labels in the tool UI
text = text.replace('símbolos ABNT NBR 5444 à escala', 'símbolos elétricos em escala')
text = text.replace('Símbolo NBR 5444:', 'Símbolo elétrico:')
text = text.replace('15 cm (Padrão NBR)', '15 cm (Padrão)')
text = text.replace('15 cm (Padrão NBR)', '15 cm (Padrão)')

path.write_text(text, encoding='utf-8')
