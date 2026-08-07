import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Ruler,
  Square,
  Zap,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Grid,
  MousePointer,
  Compass,
  ArrowRight,
  Sparkles,
  DoorOpen,
  Maximize,
  Sliders,
  Check,
  PenTool,
  FileText,
  Printer,
} from 'lucide-react';
import {
  Room,
  SizedCircuit,
  ProjectData,
  ElectricalSymbolType,
  FloorPlanSymbol,
  FloorPlanConduit,
  FloorPlanOpening,
  FloorPlanWall,
  SheetSettings,
  PaperFormat,
} from '../types';
import { SheetOverlaySVG } from './SheetOverlaySVG';
import { SheetExportModal } from './SheetExportModal';

interface FloorPlanEditorProps {
  projectData: ProjectData;
  sizedCircuits: SizedCircuit[];
  onUpdateRooms: (rooms: Room[]) => void;
  onUpdateProjectData: (data: ProjectData) => void;
}

type ToolMode =
  | 'select'
  | 'draw_room'
  | 'draw_wall'
  | 'add_door'
  | 'add_window'
  | 'add_symbol'
  | 'add_conduit'
  | 'measure';

// Palette of architectural room colors
const ROOM_COLORS = [
  '#F4F4F5', // Light neutral
  '#E4E4E7',
  '#D4D4D8',
  '#E2E8F0',
  '#CBD5E1',
  '#FEF3C7', // Subtle amber tint
  '#E0F2FE', // Subtle blue tint
  '#DCFCE7', // Subtle green tint
];

export const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  projectData,
  sizedCircuits,
  onUpdateRooms,
  onUpdateProjectData,
}) => {
  // Scale & Viewport State
  const [scalePxPerMeter, setScalePxPerMeter] = useState<number>(50); // 1 meter = 50px (Scale 1:50)
  const [gridSnapMeters, setGridSnapMeters] = useState<number>(0.25); // 25cm grid snap
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tool Modes & Selections
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedSymbolIds, setSelectedSymbolIds] = useState<string[]>([]);
  const [selectedOpeningIds, setSelectedOpeningIds] = useState<string[]>([]);
  const [selectedWallIds, setSelectedWallIds] = useState<string[]>([]);

  // Click & Drag Box Selection State
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<{ x: number; y: number } | null>(null);

  // Derived single selections for backward compatibility and properties panel
  const selectedRoomId = selectedRoomIds[0] || null;
  const selectedSymbolId = selectedSymbolIds[0] || null;
  const selectedOpeningId = selectedOpeningIds[0] || null;
  const selectedWallId = selectedWallIds[0] || null;

  const totalSelectedCount =
    selectedRoomIds.length +
    selectedSymbolIds.length +
    selectedOpeningIds.length +
    selectedWallIds.length;

  // Drawing Room State
  const [newRoomName, setNewRoomName] = useState('Novo Cômodo');
  const [isDrawingRoom, setIsDrawingRoom] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrentPos, setDragCurrentPos] = useState<{ x: number; y: number } | null>(null);

  // Drawing Custom Wall State
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [wallStartPos, setWallStartPos] = useState<{ x: number; y: number } | null>(null);
  const [wallCurrentPos, setWallCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [wallSnapInfo, setWallSnapInfo] = useState<{
    isSnapped: boolean;
    snapInfo?: string;
    snapTargetPoint?: { x: number; y: number };
  } | null>(null);
  const [draggingWallHandle, setDraggingWallHandle] = useState<{ wallId: string; handle: 'p1' | 'p2' } | null>(null);

  // Architectural Opening Tool State (Portas e Janelas)
  const [doorWidthMeters, setDoorWidthMeters] = useState<number>(0.8); // 80cm standard door
  const [windowWidthMeters, setWindowWidthMeters] = useState<number>(1.2); // 1.20m standard window
  const [openingOrientation, setOpeningOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [wallThicknessMeters, setWallThicknessMeters] = useState<number>(0.15); // Paredes com espessura dupla de 15cm (padrão NBR)

  // Electrical Symbols Tool State
  const [selectedSymbolType, setSelectedSymbolType] = useState<ElectricalSymbolType>('tug_low');
  const [symbolCircuitNum, setSymbolCircuitNum] = useState<number>(1);
  const [symbolCommandLetter, setSymbolCommandLetter] = useState<string>('a');
  const [symbolPowerVA, setSymbolPowerVA] = useState<number>(100);

  // Conduit Connection Tool State
  const [conduitFromId, setConduitFromId] = useState<string | null>(null);
  const [conduitWireTypes, setConduitWireTypes] = useState<('fase' | 'neutro' | 'retorno' | 'terra')[]>([
    'fase',
    'neutro',
    'terra',
  ]);

  // Measurement tool state
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);

  // Layer Toggles
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showElectrical, setShowElectrical] = useState(true);
  const [showConduits, setShowConduits] = useState(true);
  const [showOpenings, setShowOpenings] = useState(true);
  const [showSheetFrame, setShowSheetFrame] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  // Sheet Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const currentSheetSettings: SheetSettings = useMemo(() => {
    return (
      projectData.sheetSettings || {
        format: 'A3',
        orientation: 'landscape',
        showSheetBorder: true,
        showTitleBlock: true,
        sheetTitle: 'PLANTA BAIXA - INSTALAÇÕES ELÉTRICAS NBR 5410',
        sheetNumber: '01/01',
        revision: 'R00',
        sheetScaleText: `1:${Math.round(2500 / scalePxPerMeter)}`,
        sheetXPosMeters: -0.5,
        sheetYPosMeters: -0.5,
      }
    );
  }, [projectData.sheetSettings, scalePxPerMeter]);

  const canvasRef = useRef<SVGSVGElement>(null);

  // Ensure rooms have geometry coordinates in meters
  const roomsWithGeometry = useMemo(() => {
    let currentX = 1;
    let currentY = 1;
    let maxRowHeight = 0;

    return projectData.rooms.map((room, idx) => {
      const w = room.widthMeters || Math.round(Math.sqrt(room.area) * 1.2 * 10) / 10 || 4;
      const h = room.heightMeters || Math.round((room.area / w) * 10) / 10 || 3;
      const posX = room.x ?? currentX;
      const posY = room.y ?? currentY;

      if (room.x === undefined || room.y === undefined) {
        currentX += w + 0.5;
        maxRowHeight = Math.max(maxRowHeight, h);
        if (currentX > 14) {
          currentX = 1;
          currentY += maxRowHeight + 0.5;
          maxRowHeight = 0;
        }
      }

      return {
        ...room,
        x: posX,
        y: posY,
        widthMeters: w,
        heightMeters: h,
        color: room.color || ROOM_COLORS[idx % ROOM_COLORS.length],
      };
    });
  }, [projectData.rooms]);

  const floorPlanSymbols = projectData.floorPlan?.symbols || [];
  const floorPlanConduits = projectData.floorPlan?.conduits || [];
  const floorPlanOpenings = projectData.floorPlan?.openings || [];
  const floorPlanWalls = projectData.floorPlan?.walls || [];

  // Snap meters to current grid
  const snap = (meters: number): number => {
    if (gridSnapMeters <= 0) return Math.round(meters * 100) / 100;
    return Math.round(meters / gridSnapMeters) * gridSnapMeters;
  };

  // Convert SVG event mouse coords to meter coords
  const getMeterCoordsFromEvent = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const canvasX = (clientX - panOffset.x) / zoom;
    const canvasY = (clientY - panOffset.y) / zoom;

    const xMeters = snap(canvasX / scalePxPerMeter);
    const yMeters = snap(canvasY / scalePxPerMeter);

    return { x: Math.max(0, xMeters), y: Math.max(0, yMeters) };
  };

  // Smart Wall Snapping & Orthogonal Lock Helper
  const getSmartWallCoords = (
    rawCoords: { x: number; y: number },
    startPos?: { x: number; y: number } | null,
    isShiftPressed?: boolean,
    ignoreWallId?: string
  ) => {
    let { x, y } = rawCoords;
    let isSnapped = false;
    let snapInfo = '';
    let snapTargetPoint: { x: number; y: number } | undefined;

    // 1. Orthogonal lock if drawing or dragging wall endpoint
    if (startPos) {
      const dx = x - startPos.x;
      const dy = y - startPos.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (isShiftPressed || absDx > absDy * 1.5 || absDy < 0.08) {
        y = startPos.y;
        isSnapped = true;
        snapInfo = '📐 Parede Reta (0°/180°)';
      } else if (absDy > absDx * 1.5 || absDx < 0.08) {
        x = startPos.x;
        isSnapped = true;
        snapInfo = '📐 Parede Reta (90°/270°)';
      }
    }

    const snapRange = 0.35; // 35 cm snap radius
    let minDistance = snapRange;

    // 2. Snap to Room Corners and Room Outer Walls
    for (const r of roomsWithGeometry) {
      if (r.x === undefined || r.y === undefined || !r.widthMeters || !r.heightMeters) continue;
      const corners = [
        { x: r.x, y: r.y },
        { x: r.x + r.widthMeters, y: r.y },
        { x: r.x, y: r.y + r.heightMeters },
        { x: r.x + r.widthMeters, y: r.y + r.heightMeters },
      ];

      for (const c of corners) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < minDistance) {
          minDistance = d;
          x = c.x;
          y = c.y;
          isSnapped = true;
          snapInfo = '⚡ Snap ao Canto do Cômodo';
          snapTargetPoint = { x: c.x, y: c.y };
        }
      }

      if (!snapTargetPoint) {
        if (Math.abs(x - r.x) < minDistance) {
          minDistance = Math.abs(x - r.x);
          x = r.x;
          isSnapped = true;
          snapInfo = '⚡ Snap à Parede Esquerda';
        } else if (Math.abs(x - (r.x + r.widthMeters)) < minDistance) {
          minDistance = Math.abs(x - (r.x + r.widthMeters));
          x = r.x + r.widthMeters;
          isSnapped = true;
          snapInfo = '⚡ Snap à Parede Direita';
        }

        if (Math.abs(y - r.y) < minDistance) {
          minDistance = Math.abs(y - r.y);
          y = r.y;
          isSnapped = true;
          snapInfo = '⚡ Snap à Parede Superior';
        } else if (Math.abs(y - (r.y + r.heightMeters)) < minDistance) {
          minDistance = Math.abs(y - (r.y + r.heightMeters));
          y = r.y + r.heightMeters;
          isSnapped = true;
          snapInfo = '⚡ Snap à Parede Inferior';
        }
      }
    }

    // 3. Snap to Custom Wall Endpoints and Lines
    for (const w of floorPlanWalls) {
      if (w.id === ignoreWallId) continue;
      const endpoints = [
        { x: w.x1Meters, y: w.y1Meters },
        { x: w.x2Meters, y: w.y2Meters },
      ];

      for (const ep of endpoints) {
        const d = Math.hypot(x - ep.x, y - ep.y);
        if (d < minDistance) {
          minDistance = d;
          x = ep.x;
          y = ep.y;
          isSnapped = true;
          snapInfo = '⚡ Snap ao Vértice da Parede';
          snapTargetPoint = { x: ep.x, y: ep.y };
        }
      }

      if (!snapTargetPoint) {
        if (w.x1Meters === w.x2Meters && Math.abs(x - w.x1Meters) < minDistance) {
          x = w.x1Meters;
          isSnapped = true;
          snapInfo = '⚡ Alinhado a Parede Vertical';
        }
        if (w.y1Meters === w.y2Meters && Math.abs(y - w.y1Meters) < minDistance) {
          y = w.y1Meters;
          isSnapped = true;
          snapInfo = '⚡ Alinhado a Parede Horizontal';
        }
      }
    }

    return { x, y, isSnapped, snapInfo, snapTargetPoint };
  };

  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey && activeTool !== 'select')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    const coords = getMeterCoordsFromEvent(e);

    if (activeTool === 'select') {
      setIsBoxSelecting(true);
      setSelectionStart(coords);
      setSelectionCurrent(coords);
      if (!e.shiftKey) {
        setSelectedRoomIds([]);
        setSelectedSymbolIds([]);
        setSelectedOpeningIds([]);
        setSelectedWallIds([]);
      }
    } else if (activeTool === 'draw_room') {
      setIsDrawingRoom(true);
      setDragStartPos(coords);
      setDragCurrentPos(coords);
    } else if (activeTool === 'draw_wall') {
      const snap = getSmartWallCoords(coords, null, e.shiftKey);
      setIsDrawingWall(true);
      setWallStartPos({ x: snap.x, y: snap.y });
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
    } else if (activeTool === 'add_door') {
      // Place door
      const doorCount = floorPlanOpenings.filter((o) => o.type === 'door').length + 1;
      const newDoor: FloorPlanOpening = {
        id: `door_${Date.now()}`,
        type: 'door',
        xMeters: coords.x,
        yMeters: coords.y,
        widthMeters: doorWidthMeters,
        orientation: openingOrientation,
        label: `P${doorCount} (${Math.round(doorWidthMeters * 100)}cm)`,
      };

      onUpdateProjectData({
        ...projectData,
        floorPlan: {
          scalePixelsPerMeter: scalePxPerMeter,
          gridSnapMeters,
          symbols: floorPlanSymbols,
          conduits: floorPlanConduits,
          openings: [...floorPlanOpenings, newDoor],
          walls: floorPlanWalls,
        },
      });
    } else if (activeTool === 'add_window') {
      // Place window
      const windowCount = floorPlanOpenings.filter((o) => o.type === 'window').length + 1;
      const newWindow: FloorPlanOpening = {
        id: `win_${Date.now()}`,
        type: 'window',
        xMeters: coords.x,
        yMeters: coords.y,
        widthMeters: windowWidthMeters,
        orientation: openingOrientation,
        label: `J${windowCount} (${Math.round(windowWidthMeters * 100)}cm)`,
      };

      onUpdateProjectData({
        ...projectData,
        floorPlan: {
          scalePixelsPerMeter: scalePxPerMeter,
          gridSnapMeters,
          symbols: floorPlanSymbols,
          conduits: floorPlanConduits,
          openings: [...floorPlanOpenings, newWindow],
          walls: floorPlanWalls,
        },
      });
    } else if (activeTool === 'add_symbol') {
      // Place electrical symbol
      const newSymbol: FloorPlanSymbol = {
        id: `sym_${Date.now()}`,
        type: selectedSymbolType,
        xMeters: coords.x,
        yMeters: coords.y,
        circuitNumber: symbolCircuitNum,
        commandLetter: symbolCommandLetter,
        powerVA: symbolPowerVA,
        label: `${selectedSymbolType.toUpperCase()} C${symbolCircuitNum}`,
      };

      onUpdateProjectData({
        ...projectData,
        floorPlan: {
          scalePixelsPerMeter: scalePxPerMeter,
          gridSnapMeters,
          symbols: [...floorPlanSymbols, newSymbol],
          conduits: floorPlanConduits,
          openings: floorPlanOpenings,
          walls: floorPlanWalls,
        },
      });
    } else if (activeTool === 'measure') {
      setMeasureStart(coords);
      setMeasureEnd(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    const coords = getMeterCoordsFromEvent(e);

    if (draggingWallHandle) {
      const wall = floorPlanWalls.find((w) => w.id === draggingWallHandle.wallId);
      if (wall) {
        const pivotPos =
          draggingWallHandle.handle === 'p1'
            ? { x: wall.x2Meters, y: wall.y2Meters }
            : { x: wall.x1Meters, y: wall.y1Meters };
        const snap = getSmartWallCoords(coords, pivotPos, e.shiftKey, draggingWallHandle.wallId);

        const updatedWalls = floorPlanWalls.map((w) => {
          if (w.id !== draggingWallHandle.wallId) return w;
          if (draggingWallHandle.handle === 'p1') {
            return { ...w, x1Meters: snap.x, y1Meters: snap.y };
          } else {
            return { ...w, x2Meters: snap.x, y2Meters: snap.y };
          }
        });

        onUpdateProjectData({
          ...projectData,
          floorPlan: {
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: floorPlanSymbols,
            conduits: floorPlanConduits,
            openings: floorPlanOpenings,
            walls: updatedWalls,
          },
        });
      }
    } else if (isBoxSelecting && selectionStart) {
      setSelectionCurrent(coords);
      const minX = Math.min(selectionStart.x, coords.x);
      const maxX = Math.max(selectionStart.x, coords.x);
      const minY = Math.min(selectionStart.y, coords.y);
      const maxY = Math.max(selectionStart.y, coords.y);

      if (Math.abs(maxX - minX) >= 0.05 || Math.abs(maxY - minY) >= 0.05) {
        const selSymbols = floorPlanSymbols
          .filter((s) => s.xMeters >= minX && s.xMeters <= maxX && s.yMeters >= minY && s.yMeters <= maxY)
          .map((s) => s.id);

        const selOpenings = floorPlanOpenings
          .filter((o) => o.xMeters >= minX && o.xMeters <= maxX && o.yMeters >= minY && o.yMeters <= maxY)
          .map((o) => o.id);

        const selWalls = floorPlanWalls
          .filter(
            (w) =>
              Math.min(w.x1Meters, w.x2Meters) <= maxX &&
              Math.max(w.x1Meters, w.x2Meters) >= minX &&
              Math.min(w.y1Meters, w.y2Meters) <= maxY &&
              Math.max(w.y1Meters, w.y2Meters) >= minY
          )
          .map((w) => w.id);

        const selRooms = roomsWithGeometry
          .filter((r) => {
            const rx1 = r.x ?? 0;
            const ry1 = r.y ?? 0;
            const rx2 = rx1 + (r.widthMeters || 4);
            const ry2 = ry1 + (r.heightMeters || 3);
            return rx1 <= maxX && rx2 >= minX && ry1 <= maxY && ry2 >= minY;
          })
          .map((r) => r.id);

        if (e.shiftKey) {
          setSelectedSymbolIds((prev) => Array.from(new Set([...prev, ...selSymbols])));
          setSelectedOpeningIds((prev) => Array.from(new Set([...prev, ...selOpenings])));
          setSelectedWallIds((prev) => Array.from(new Set([...prev, ...selWalls])));
          setSelectedRoomIds((prev) => Array.from(new Set([...prev, ...selRooms])));
        } else {
          setSelectedSymbolIds(selSymbols);
          setSelectedOpeningIds(selOpenings);
          setSelectedWallIds(selWalls);
          setSelectedRoomIds(selRooms);
        }
      }
    } else if (isDrawingRoom) {
      setDragCurrentPos(coords);
    } else if (isDrawingWall && wallStartPos) {
      const snap = getSmartWallCoords(coords, wallStartPos, e.shiftKey);
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
    } else if (activeTool === 'measure' && measureStart) {
      setMeasureEnd(coords);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (draggingWallHandle) {
      setDraggingWallHandle(null);
      return;
    }

    if (isBoxSelecting) {
      setIsBoxSelecting(false);
      setSelectionStart(null);
      setSelectionCurrent(null);
      return;
    }

    if (isDrawingWall && wallStartPos && wallCurrentPos) {
      const dx = wallCurrentPos.x - wallStartPos.x;
      const dy = wallCurrentPos.y - wallStartPos.y;
      const dist = Math.hypot(dx, dy);

      if (dist >= 0.1) {
        const newWall: FloorPlanWall = {
          id: `wall_${Date.now()}`,
          x1Meters: wallStartPos.x,
          y1Meters: wallStartPos.y,
          x2Meters: wallCurrentPos.x,
          y2Meters: wallCurrentPos.y,
          thicknessMeters: wallThicknessMeters,
          label: `Parede ${floorPlanWalls.length + 1} (${dist.toFixed(2)}m)`,
        };

        onUpdateProjectData({
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
      }

      setIsDrawingWall(false);
      setWallStartPos(null);
      setWallCurrentPos(null);
      setWallSnapInfo(null);
    } else if (isDrawingRoom && dragStartPos && dragCurrentPos) {
      const minX = Math.min(dragStartPos.x, dragCurrentPos.x);
      const minY = Math.min(dragStartPos.y, dragCurrentPos.y);
      const w = Math.max(0.5, Math.abs(dragCurrentPos.x - dragStartPos.x));
      const h = Math.max(0.5, Math.abs(dragCurrentPos.y - dragStartPos.y));

      const area = Math.round(w * h * 100) / 100;
      const perimeter = Math.round(2 * (w + h) * 100) / 100;

      const newRoom: Room = {
        id: `r_${Date.now()}`,
        name: newRoomName || `Cômodo ${projectData.rooms.length + 1}`,
        type: 'quarto',
        area,
        perimeter,
        isWet: false,
        x: minX,
        y: minY,
        widthMeters: w,
        heightMeters: h,
        color: ROOM_COLORS[projectData.rooms.length % ROOM_COLORS.length],
      };

      // Auto add default door & window for newly drawn room
      const doorCount = floorPlanOpenings.filter((o) => o.type === 'door').length + 1;
      const windowCount = floorPlanOpenings.filter((o) => o.type === 'window').length + 1;

      const autoDoor: FloorPlanOpening = {
        id: `door_auto_${Date.now()}`,
        type: 'door',
        xMeters: Math.round((minX + 0.3) * 10) / 10,
        yMeters: Math.round((minY + h) * 10) / 10,
        widthMeters: 0.8,
        orientation: 'horizontal',
        roomId: newRoom.id,
        label: `P${doorCount} (80cm)`,
      };

      const autoWindow: FloorPlanOpening = {
        id: `win_auto_${Date.now()}`,
        type: 'window',
        xMeters: Math.round((minX + w / 2 - 0.6) * 10) / 10,
        yMeters: minY,
        widthMeters: 1.2,
        orientation: 'horizontal',
        roomId: newRoom.id,
        label: `J${windowCount} (120cm)`,
      };

      const updatedRooms = [...roomsWithGeometry, newRoom];
      onUpdateRooms(updatedRooms);

      onUpdateProjectData({
        ...projectData,
        rooms: updatedRooms,
        floorPlan: {
          scalePixelsPerMeter: scalePxPerMeter,
          gridSnapMeters,
          symbols: floorPlanSymbols,
          conduits: floorPlanConduits,
          openings: [...floorPlanOpenings, autoDoor, autoWindow],
          walls: floorPlanWalls,
        },
      });

      setIsDrawingRoom(false);
      setDragStartPos(null);
      setDragCurrentPos(null);
      setActiveTool('select');
    }
  };

  // Symbol or Conduit click handlers
  const handleSymbolClick = (symId: string, e?: React.MouseEvent) => {
    if (activeTool === 'add_conduit') {
      if (!conduitFromId) {
        setConduitFromId(symId);
      } else if (conduitFromId !== symId) {
        const newConduit: FloorPlanConduit = {
          id: `cond_${Date.now()}`,
          fromSymbolId: conduitFromId,
          toSymbolId: symId,
          conduitType: 'teto',
          wires: [...conduitWireTypes],
        };

        const updatedConduits = [...floorPlanConduits, newConduit];
        onUpdateProjectData({
          ...projectData,
          floorPlan: {
            scalePixelsPerMeter: scalePxPerMeter,
            gridSnapMeters,
            symbols: floorPlanSymbols,
            conduits: updatedConduits,
            openings: floorPlanOpenings,
          },
        });
        setConduitFromId(null);
      }
    } else {
      if (e?.shiftKey) {
        setSelectedSymbolIds((prev) =>
          prev.includes(symId) ? prev.filter((id) => id !== symId) : [...prev, symId]
        );
      } else {
        setSelectedSymbolIds([symId]);
        setSelectedRoomIds([]);
        setSelectedOpeningIds([]);
        setSelectedWallIds([]);
      }
    }
  };

  // Delete selected elements
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

  // Keyboard shortcut listener for Delete & Backspace keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea or select element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (totalSelectedCount > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    totalSelectedCount,
    selectedSymbolIds,
    selectedOpeningIds,
    selectedWallIds,
    selectedRoomIds,
    floorPlanSymbols,
    floorPlanConduits,
    floorPlanOpenings,
    floorPlanWalls,
    roomsWithGeometry,
    projectData,
    scalePxPerMeter,
    gridSnapMeters,
  ]);

  // Auto-Distribute Mandatory NBR 5410 Electrical Points & Architectural Openings
  const handleAutoDistributeNBR5410 = () => {
    const newSymbols: FloorPlanSymbol[] = [];
    const newConduits: FloorPlanConduit[] = [];
    const newOpenings: FloorPlanOpening[] = [];

    // 1. Place QDC
    const qdcSymbol: FloorPlanSymbol = {
      id: `qdc_main`,
      type: 'qdc',
      xMeters: 0.5,
      yMeters: 0.5,
      label: 'QDC PRINCIPAL',
    };
    newSymbols.push(qdcSymbol);

    roomsWithGeometry.forEach((room, roomIdx) => {
      const cx = room.x! + room.widthMeters! / 2;
      const cy = room.y! + room.heightMeters! / 2;

      // Doors and Windows
      newOpenings.push({
        id: `door_${room.id}`,
        type: 'door',
        xMeters: Math.round((room.x! + 0.3) * 10) / 10,
        yMeters: Math.round((room.y! + room.heightMeters!) * 10) / 10,
        widthMeters: 0.8,
        orientation: 'horizontal',
        roomId: room.id,
        label: `P${roomIdx + 1} (80cm)`,
      });

      newOpenings.push({
        id: `win_${room.id}`,
        type: 'window',
        xMeters: Math.round((room.x! + room.widthMeters! / 2 - 0.6) * 10) / 10,
        yMeters: Math.round((room.y!) * 10) / 10,
        widthMeters: 1.2,
        orientation: 'horizontal',
        roomId: room.id,
        label: `J${roomIdx + 1} (120cm)`,
      });

      // Ceiling Light
      const lightSym: FloorPlanSymbol = {
        id: `sym_light_${room.id}`,
        type: 'light_ceiling',
        xMeters: cx,
        yMeters: cy,
        roomId: room.id,
        circuitNumber: 1,
        commandLetter: String.fromCharCode(97 + (roomIdx % 26)),
        powerVA: 100,
        label: `ILUM (${room.name})`,
      };
      newSymbols.push(lightSym);

      const prevTarget = roomIdx === 0 ? qdcSymbol.id : `sym_light_${roomsWithGeometry[roomIdx - 1].id}`;
      newConduits.push({
        id: `cond_light_${room.id}`,
        fromSymbolId: prevTarget,
        toSymbolId: lightSym.id,
        conduitType: 'teto',
        wires: ['fase', 'neutro', 'terra'],
      });

      // Switch
      const switchSym: FloorPlanSymbol = {
        id: `sym_sw_${room.id}`,
        type: 'switch_1p',
        xMeters: room.x! + 0.3,
        yMeters: room.y! + room.heightMeters! - 0.3,
        roomId: room.id,
        circuitNumber: 1,
        commandLetter: String.fromCharCode(97 + (roomIdx % 26)),
        label: `INT S${String.fromCharCode(97 + (roomIdx % 26))}`,
      };
      newSymbols.push(switchSym);

      newConduits.push({
        id: `cond_sw_${room.id}`,
        fromSymbolId: lightSym.id,
        toSymbolId: switchSym.id,
        conduitType: 'parede',
        wires: ['fase', 'retorno'],
      });

      // TUGs
      const tugCount = Math.max(2, Math.ceil(room.perimeter / 5));
      for (let i = 0; i < tugCount; i++) {
        const side = i % 4;
        let tugX = room.x! + 0.3;
        let tugY = room.y! + 0.3;

        if (side === 0) tugX = room.x! + (room.widthMeters! * (i + 1)) / (tugCount + 1);
        if (side === 1) {
          tugX = room.x! + room.widthMeters! - 0.2;
          tugY = room.y! + (room.heightMeters! * (i + 1)) / (tugCount + 1);
        }
        if (side === 2) {
          tugX = room.x! + (room.widthMeters! * (i + 1)) / (tugCount + 1);
          tugY = room.y! + room.heightMeters! - 0.2;
        }

        const tugSym: FloorPlanSymbol = {
          id: `sym_tug_${room.id}_${i}`,
          type: room.isWet ? 'tug_med' : 'tug_low',
          xMeters: Math.round(tugX * 10) / 10,
          yMeters: Math.round(tugY * 10) / 10,
          roomId: room.id,
          circuitNumber: 2,
          powerVA: room.isWet ? 600 : 100,
          label: `TUG ${room.isWet ? '600VA' : '100VA'}`,
        };
        newSymbols.push(tugSym);

        newConduits.push({
          id: `cond_tug_${room.id}_${i}`,
          fromSymbolId: lightSym.id,
          toSymbolId: tugSym.id,
          conduitType: 'parede',
          wires: ['fase', 'neutro', 'terra'],
        });
      }
    });

    onUpdateProjectData({
      ...projectData,
      floorPlan: {
        scalePixelsPerMeter: scalePxPerMeter,
        gridSnapMeters,
        symbols: newSymbols,
        conduits: newConduits,
        openings: newOpenings,
        walls: floorPlanWalls,
      },
    });
  };

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.hypot(px - projX, py - projY);
}

  // Check if a point connects to any room wall or custom wall
  const isPointConnectedToWall = (
    px: number,
    py: number,
    ignoreWallId?: string
  ): boolean => {
    const threshold = (wallThicknessMeters || 0.15) * 1.5;

    // Check connection with Room outer walls
    for (const room of roomsWithGeometry) {
      if (
        room.x === undefined ||
        room.y === undefined ||
        !room.widthMeters ||
        !room.heightMeters
      )
        continue;

      const rx1 = room.x;
      const ry1 = room.y;
      const rx2 = room.x + room.widthMeters;
      const ry2 = room.y + room.heightMeters;

      const dists = [
        distToSegment(px, py, rx1, ry1, rx2, ry1),
        distToSegment(px, py, rx1, ry2, rx2, ry2),
        distToSegment(px, py, rx1, ry1, rx1, ry2),
        distToSegment(px, py, rx2, ry1, rx2, ry2),
      ];

      if (Math.min(...dists) <= threshold) {
        return true;
      }
    }

    // Check connection with other Custom Walls
    for (const wall of floorPlanWalls) {
      if (wall.id === ignoreWallId) continue;
      const d = distToSegment(
        px,
        py,
        wall.x1Meters,
        wall.y1Meters,
        wall.x2Meters,
        wall.y2Meters
      );
      if (d <= threshold) {
        return true;
      }
    }

    return false;
  };

  const sortedFloorPlanWalls = useMemo(() => {
    const walls = [...floorPlanWalls];
    walls.sort((a, b) => {
      const aConn =
        isPointConnectedToWall(a.x1Meters, a.y1Meters, a.id) ||
        isPointConnectedToWall(a.x2Meters, a.y2Meters, a.id);
      const bConn =
        isPointConnectedToWall(b.x1Meters, b.y1Meters, b.id) ||
        isPointConnectedToWall(b.x2Meters, b.y2Meters, b.id);
      if (aConn && !bConn) return 1;
      if (!aConn && bConn) return -1;
      return 0;
    });
    return walls;
  }, [floorPlanWalls, roomsWithGeometry, wallThicknessMeters]);

  // Architectural Render for Doors & Windows
  const renderArchitecturalOpening = (op: FloorPlanOpening) => {
    const x = op.xMeters * scalePxPerMeter;
    const y = op.yMeters * scalePxPerMeter;
    const w = op.widthMeters * scalePxPerMeter;
    const wallPx = wallThicknessMeters * scalePxPerMeter;
    const isSelected = selectedOpeningIds.includes(op.id);

    const handleOpeningClick = (e: React.MouseEvent) => {
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
    };

    if (op.type === 'door') {
      if (op.orientation === 'horizontal') {
        return (
          <g key={op.id} onClick={handleOpeningClick} className="cursor-pointer">
            {/* Wall Cut box spanning double wall thickness */}
            <rect x={x} y={y - wallPx / 2} width={w} height={wallPx} fill="#FAFAFA" stroke="#141414" strokeWidth="1.5" />
            {/* Door Leaf line pivoted at left */}
            <line x1={x} y1={y + wallPx / 2} x2={x} y2={y + wallPx / 2 - w} stroke="#141414" strokeWidth="2.5" />
            {/* Opening Arc */}
            <path
              d={`M ${x + w} ${y + wallPx / 2} A ${w} ${w} 0 0 0 ${x} ${y + wallPx / 2 - w}`}
              fill="none"
              stroke="#141414"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            {/* Frame endpoints */}
            <line x1={x} y1={y - wallPx / 2 - 2} x2={x} y2={y + wallPx / 2 + 2} stroke="#141414" strokeWidth="2.5" />
            <line x1={x + w} y1={y - wallPx / 2 - 2} x2={x + w} y2={y + wallPx / 2 + 2} stroke="#141414" strokeWidth="2.5" />

            {/* Label */}
            <text x={x + w / 2} y={y + wallPx / 2 + 14} fill="#141414" fontSize="9" fontWeight="black" textAnchor="middle">
              {op.label || 'PORTA'}
            </text>

            {isSelected && (
              <rect x={x - 2} y={y - w - 2} width={w + 4} height={w + 20} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />
            )}
          </g>
        );
      } else {
        // Vertical door
        return (
          <g key={op.id} onClick={handleOpeningClick} className="cursor-pointer">
            <rect x={x - wallPx / 2} y={y} width={wallPx} height={w} fill="#FAFAFA" stroke="#141414" strokeWidth="1.5" />
            <line x1={x + wallPx / 2} y1={y} x2={x + wallPx / 2 + w} y2={y} stroke="#141414" strokeWidth="2.5" />
            <path
              d={`M ${x + wallPx / 2} ${y + w} A ${w} ${w} 0 0 0 ${x + wallPx / 2 + w} ${y}`}
              fill="none"
              stroke="#141414"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            <line x1={x - wallPx / 2 - 2} y1={y} x2={x + wallPx / 2 + 2} y2={y} stroke="#141414" strokeWidth="2.5" />
            <line x1={x - wallPx / 2 - 2} y1={y + w} x2={x + wallPx / 2 + 2} y2={y + w} stroke="#141414" strokeWidth="2.5" />

            <text x={x + wallPx / 2 + 14} y={y + w / 2} fill="#141414" fontSize="9" fontWeight="black" textAnchor="start">
              {op.label || 'PORTA'}
            </text>

            {isSelected && (
              <rect x={x - 10} y={y - 2} width={w + 20} height={w + 4} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />
            )}
          </g>
        );
      }
    } else {
      // Window (Janela)
      if (op.orientation === 'horizontal') {
        return (
          <g key={op.id} onClick={handleOpeningClick} className="cursor-pointer">
            {/* Window Frame Box matching wall thickness */}
            <rect x={x} y={y - wallPx / 2} width={w} height={wallPx} fill="white" stroke="#141414" strokeWidth="2" />
            {/* Double glass panes */}
            <line x1={x} y1={y - wallPx / 4} x2={x + w} y2={y - wallPx / 4} stroke="#141414" strokeWidth="1" />
            <line x1={x} y1={y + wallPx / 4} x2={x + w} y2={y + wallPx / 4} stroke="#141414" strokeWidth="1" />

            <text x={x + w / 2} y={y - wallPx / 2 - 4} fill="#141414" fontSize="9" fontWeight="black" textAnchor="middle">
              {op.label || 'JANELA'}
            </text>

            {isSelected && (
              <rect x={x - 2} y={y - wallPx / 2 - 2} width={w + 4} height={wallPx + 4} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />
            )}
          </g>
        );
      } else {
        // Vertical window
        return (
          <g key={op.id} onClick={handleOpeningClick} className="cursor-pointer">
            <rect x={x - wallPx / 2} y={y} width={wallPx} height={w} fill="white" stroke="#141414" strokeWidth="2" />
            <line x1={x - wallPx / 4} y1={y} x2={x - wallPx / 4} y2={y + w} stroke="#141414" strokeWidth="1" />
            <line x1={x + wallPx / 4} y1={y} x2={x + wallPx / 4} y2={y + w} stroke="#141414" strokeWidth="1" />

            <text x={x - wallPx / 2 - 4} y={y + w / 2} fill="#141414" fontSize="9" fontWeight="black" textAnchor="end">
              {op.label || 'JANELA'}
            </text>

            {isSelected && (
              <rect x={x - wallPx / 2 - 2} y={y - 2} width={wallPx + 4} height={w + 4} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />
            )}
          </g>
        );
      }
    }
  };

  // Render Electrical Symbols
  const renderNBR5444Symbol = (sym: FloorPlanSymbol) => {
    const cx = sym.xMeters * scalePxPerMeter;
    const cy = sym.yMeters * scalePxPerMeter;
    const isSelected = selectedSymbolIds.includes(sym.id);

    const onSymClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleSymbolClick(sym.id, e);
    };

    switch (sym.type) {
      case 'tug_low':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <circle cx="0" cy="0" r="10" fill="none" stroke="#141414" strokeWidth="2" />
            <path d="M -10 0 A 10 10 0 0 0 10 0 Z" fill="#141414" />
            <line x1="0" y1="10" x2="0" y2="16" stroke="#141414" strokeWidth="2" />
            {isSelected && <circle cx="0" cy="0" r="14" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
            <text x="12" y="4" fill="#141414" fontSize="9" fontWeight="bold">
              C{sym.circuitNumber || 1} ({sym.powerVA}VA)
            </text>
          </g>
        );

      case 'tug_med':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <circle cx="0" cy="0" r="10" fill="white" stroke="#141414" strokeWidth="2" />
            <path d="M -10 0 A 10 10 0 0 0 10 0 Z" fill="#141414" />
            <line x1="0" y1="10" x2="0" y2="16" stroke="#141414" strokeWidth="2" />
            {isSelected && <circle cx="0" cy="0" r="14" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
            <text x="12" y="4" fill="#141414" fontSize="9" fontWeight="bold">
              C{sym.circuitNumber || 1} ({sym.powerVA}VA) 1.1m
            </text>
          </g>
        );

      case 'tug_high':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <circle cx="0" cy="0" r="10" fill="#141414" stroke="#141414" strokeWidth="2" />
            <line x1="0" y1="10" x2="0" y2="16" stroke="#141414" strokeWidth="2" />
            {isSelected && <circle cx="0" cy="0" r="14" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
            <text x="12" y="4" fill="#141414" fontSize="9" fontWeight="bold">
              C{sym.circuitNumber || 1} ({sym.powerVA}VA) 2.2m
            </text>
          </g>
        );

      case 'tue':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <rect x="-10" y="-10" width="20" height="20" fill="white" stroke="#141414" strokeWidth="2.5" />
            <path d="M -6 -6 L 6 6 M -6 6 L 6 -6" stroke="#141414" strokeWidth="2" />
            {isSelected && <rect x="-14" y="-14" width="28" height="28" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
            <text x="14" y="4" fill="#141414" fontSize="9" fontWeight="black">
              TUE C{sym.circuitNumber || 3}
            </text>
          </g>
        );

      case 'light_ceiling':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <circle cx="0" cy="0" r="14" fill="white" stroke="#141414" strokeWidth="2" />
            <line x1="-14" y1="0" x2="14" y2="0" stroke="#141414" strokeWidth="1.5" />
            <line x1="0" y1="-14" x2="0" y2="14" stroke="#141414" strokeWidth="1.5" />
            <text x="0" y="-4" fill="#141414" fontSize="9" fontWeight="black" textAnchor="middle">
              C{sym.circuitNumber || 1}
            </text>
            <text x="0" y="10" fill="#141414" fontSize="8" textAnchor="middle">
              {sym.powerVA || 100}VA
            </text>
            <text x="18" y="4" fill="#141414" fontSize="11" fontWeight="bold">
              {sym.commandLetter || 'a'}
            </text>
            {isSelected && <circle cx="0" cy="0" r="18" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
          </g>
        );

      case 'switch_1p':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <circle cx="0" cy="0" r="7" fill="white" stroke="#141414" strokeWidth="2" />
            <text x="10" y="4" fill="#141414" fontSize="10" fontWeight="bold">
              S{sym.commandLetter || 'a'}
            </text>
            {isSelected && <circle cx="0" cy="0" r="11" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
          </g>
        );

      case 'qdc':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <rect x="-18" y="-12" width="36" height="24" fill="#141414" stroke="#141414" strokeWidth="2" />
            <line x1="-18" y1="-12" x2="18" y2="12" stroke="white" strokeWidth="2" />
            <text x="-18" y="-16" fill="#141414" fontSize="10" fontWeight="black">
              QDC GERAL
            </text>
            {isSelected && <rect x="-22" y="-16" width="44" height="32" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
          </g>
        );

      default:
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onClick={onSymClick} className="cursor-pointer">
            <circle cx="0" cy="0" r="8" fill="#141414" />
          </g>
        );
    }
  };

  // Render Conduit Lines
  const renderConduitLine = (c: FloorPlanConduit) => {
    const fromSym = floorPlanSymbols.find((s) => s.id === c.fromSymbolId);
    const toSym = floorPlanSymbols.find((s) => s.id === c.toSymbolId);
    if (!fromSym || !toSym) return null;

    const x1 = fromSym.xMeters * scalePxPerMeter;
    const y1 = fromSym.yMeters * scalePxPerMeter;
    const x2 = toSym.xMeters * scalePxPerMeter;
    const y2 = toSym.yMeters * scalePxPerMeter;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const strokeDash = c.conduitType === 'parede' ? '4,4' : c.conduitType === 'piso' ? '2,4' : 'none';

    return (
      <g key={c.id}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#141414" strokeWidth="2" strokeDasharray={strokeDash} />

        <g transform={`translate(${midX}, ${midY})`}>
          <circle cx="0" cy="0" r="10" fill="white" stroke="#141414" strokeWidth="1" />
          <g transform="translate(-8, 0)">
            {c.wires.map((wire, idx) => {
              const offsetX = idx * 5;
              if (wire === 'fase') {
                return <line key={idx} x1={offsetX} y1="-6" x2={offsetX} y2="6" stroke="#141414" strokeWidth="2" />;
              }
              if (wire === 'neutro') {
                return (
                  <g key={idx}>
                    <line x1={offsetX} y1="-6" x2={offsetX} y2="0" stroke="#141414" strokeWidth="2" />
                    <line x1={offsetX} y1="-6" x2={offsetX + 4} y2="-6" stroke="#141414" strokeWidth="2" />
                  </g>
                );
              }
              if (wire === 'terra') {
                return (
                  <g key={idx}>
                    <line x1={offsetX} y1="-6" x2={offsetX} y2="6" stroke="#141414" strokeWidth="2" />
                    <line x1={offsetX - 3} y1="-6" x2={offsetX + 3} y2="-6" stroke="#141414" strokeWidth="2" />
                  </g>
                );
              }
              if (wire === 'retorno') {
                return <line key={idx} x1={offsetX} y1="-6" x2={offsetX} y2="0" stroke="#141414" strokeWidth="2" />;
              }
              return null;
            })}
          </g>
        </g>
      </g>
    );
  };

  return (
    <div className="space-y-4 font-mono text-[#141414]">
      {/* CAD Toolbar */}
      <div className="border border-[#141414] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#141414] pb-3">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#141414]" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight">
                Planta Baixa Arquitetônica & Elétrica CAD (Com Escala Real)
              </h3>
              <p className="text-xs opacity-70">
                Desenho de cômodos, portas, janelas, fiação e símbolos ABNT NBR 5444 à escala
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {totalSelectedCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-100 border border-amber-400 px-3 py-1.5 text-xs text-amber-900">
                <span className="font-bold">
                  {totalSelectedCount} selecionado(s)
                </span>
                <button
                  onClick={handleDeleteSelected}
                  title="Excluir selecionado(s) (Tecla Delete / Backspace)"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir (Del)</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedSymbolIds([]);
                    setSelectedOpeningIds([]);
                    setSelectedWallIds([]);
                    setSelectedRoomIds([]);
                  }}
                  className="text-stone-700 hover:text-black font-bold text-xs underline cursor-pointer ml-1"
                >
                  Limpar
                </button>
              </div>
            )}
            <button
              onClick={handleAutoDistributeNBR5410}
              className="bg-[#141414] text-[#E4E3E0] hover:bg-black font-mono font-bold uppercase px-3 py-1.5 text-xs flex items-center gap-1.5 border border-[#141414] transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Auto-Distribuir Planta NBR 5410</span>
            </button>
          </div>
        </div>

        {/* CAD Tools Menu */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1 bg-[#E4E3E0]/50 p-1 border border-[#141414]">
            <button
              onClick={() => setActiveTool('select')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'select' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Selecionar por Clique/Arrasto e Mover Objetos"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Selecionar / Mover</span>
            </button>

            <button
              onClick={() => setActiveTool('draw_room')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'draw_room' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Desenhar Cômodo a Escala (Arrastar no Canvas)"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Desenhar Cômodo</span>
            </button>

            <button
              onClick={() => setActiveTool('draw_wall')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'draw_wall' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Desenhar Parede Dupla a Partir de Qualquer Canto ou Ponto"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Desenhar Parede</span>
            </button>

            <button
              onClick={() => setActiveTool('add_door')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_door' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Inserir Porta com Arco de Giro"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>Inserir Porta</span>
            </button>

            <button
              onClick={() => setActiveTool('add_window')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_window' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Inserir Janela com Vidros"
            >
              <Maximize className="w-3.5 h-3.5" />
              <span>Inserir Janela</span>
            </button>

            <button
              onClick={() => setActiveTool('add_symbol')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_symbol' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Inserir Símbolo Elétrico NBR 5444"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Símbolo Elétrico</span>
            </button>

            <button
              onClick={() => setActiveTool('add_conduit')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_conduit' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Ligar Eletroduto"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Eletroduto</span>
            </button>

            <button
              onClick={() => setActiveTool('measure')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'measure' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Régua de Cotas e Medição"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Cotas</span>
            </button>
          </div>

          {/* Scale & Grid & Wall Options */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="font-bold uppercase opacity-80">Parede:</span>
              <select
                value={wallThicknessMeters}
                onChange={(e) => setWallThicknessMeters(Number(e.target.value))}
                className="bg-white border border-[#141414] px-2 py-1 text-xs font-bold cursor-pointer"
              >
                <option value={0.10}>10 cm (Divisória)</option>
                <option value={0.15}>15 cm (Padrão NBR)</option>
                <option value={0.20}>20 cm (Externa)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="font-bold uppercase opacity-80">Escala:</span>
              <select
                value={scalePxPerMeter}
                onChange={(e) => setScalePxPerMeter(Number(e.target.value))}
                className="bg-white border border-[#141414] px-2 py-1 text-xs font-bold cursor-pointer"
              >
                <option value={100}>1:20 (1m = 100px)</option>
                <option value={50}>1:50 (1m = 50px)</option>
                <option value={35}>1:75 (1m = 35px)</option>
                <option value={25}>1:100 (1m = 25px)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="font-bold uppercase opacity-80">Folha:</span>
              <select
                value={currentSheetSettings.format}
                onChange={(e) => {
                  const newFormat = e.target.value as PaperFormat;
                  onUpdateProjectData({
                    ...projectData,
                    sheetSettings: {
                      ...currentSheetSettings,
                      format: newFormat,
                    },
                  });
                }}
                className="bg-amber-100 font-mono text-[#141414] border border-[#141414] px-2 py-1 text-xs font-black cursor-pointer"
              >
                <option value="A0">Folha A0 (1189x841mm)</option>
                <option value="A1">Folha A1 (841x594mm)</option>
                <option value="A2">Folha A2 (594x420mm)</option>
                <option value="A3">Folha A3 (420x297mm)</option>
                <option value="A4">Folha A4 (210x297mm)</option>
              </select>
            </div>

            <button
              onClick={() => {
                const newOrient = currentSheetSettings.orientation === 'landscape' ? 'portrait' : 'landscape';
                onUpdateProjectData({
                  ...projectData,
                  sheetSettings: {
                    ...currentSheetSettings,
                    orientation: newOrient,
                  },
                });
              }}
              className="bg-white border border-[#141414] hover:bg-[#141414] hover:text-white px-2 py-1 text-xs font-bold uppercase transition-colors cursor-pointer"
              title="Alternar Orientação (Paisagem / Retrato)"
            >
              {currentSheetSettings.orientation === 'landscape' ? '🖼️ Paisagem' : '📄 Retrato'}
            </button>

            <button
              onClick={() => setIsExportModalOpen(true)}
              className="bg-[#141414] text-amber-400 hover:bg-amber-400 hover:text-[#141414] border border-[#141414] px-2.5 py-1 text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Configurar Margens e Legenda/Selo NBR 10582"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Selo / Prancha NBR</span>
            </button>

            <button
              onClick={() => setShowLegend(!showLegend)}
              className={`border border-[#141414] px-2.5 py-1 text-xs font-bold uppercase transition-colors cursor-pointer ${
                showLegend ? 'bg-amber-200 text-[#141414]' : 'bg-white text-zinc-600 hover:bg-[#141414] hover:text-white'
              }`}
              title="Exibir ou Ocultar Painel de Legendas"
            >
              {showLegend ? '🏷️ Legenda Visível' : '🏷️ Legenda Oculta'}
            </button>

            <div className="flex items-center gap-1">
              <span className="font-bold uppercase opacity-80">Snap:</span>
              <select
                value={gridSnapMeters}
                onChange={(e) => setGridSnapMeters(Number(e.target.value))}
                className="bg-white border border-[#141414] px-2 py-1 text-xs font-bold cursor-pointer"
              >
                <option value={0.1}>10 cm</option>
                <option value={0.25}>25 cm</option>
                <option value={0.5}>50 cm</option>
                <option value={1.0}>1,0 m</option>
              </select>
            </div>

            {(selectedSymbolId || selectedRoomId || selectedOpeningId || selectedWallId) && (
              <button
                onClick={handleDeleteSelected}
                title="Excluir elemento selecionado (Tecla Delete ou Backspace)"
                className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir (Del)</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Tool Option Panels */}
        {activeTool === 'draw_wall' && (
          <div className="bg-[#E4E3E0]/60 p-2.5 border border-[#141414] flex flex-wrap items-center gap-4 text-xs">
            <span className="font-black uppercase flex items-center gap-1">
              <PenTool className="w-4 h-4" /> Desenhar Parede Individual / Divisória:
            </span>
            <div className="flex items-center gap-1">
              <label className="font-bold">Espessura da Parede:</label>
              <select
                value={wallThicknessMeters}
                onChange={(e) => setWallThicknessMeters(Number(e.target.value))}
                className="bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer"
              >
                <option value={0.10}>10 cm (Divisória)</option>
                <option value={0.15}>15 cm (Padrão NBR)</option>
                <option value={0.20}>20 cm (Externa / Estrutural)</option>
              </select>
            </div>
            <span className="text-[11px] font-bold text-blue-900">
              * Clique em qualquer canto do cômodo ou ponto no canvas e arraste para desenhar uma parede com linhas duplas e hachura!
            </span>
          </div>
        )}
        {activeTool === 'add_door' && (
          <div className="bg-[#E4E3E0]/60 p-2.5 border border-[#141414] flex flex-wrap items-center gap-4 text-xs">
            <span className="font-black uppercase flex items-center gap-1">
              <DoorOpen className="w-4 h-4" /> Configurar Porta:
            </span>
            <div className="flex items-center gap-1">
              <label className="font-bold">Largura:</label>
              <select
                value={doorWidthMeters}
                onChange={(e) => setDoorWidthMeters(Number(e.target.value))}
                className="bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer"
              >
                <option value={0.7}>70 cm (Banheiro / Serviço)</option>
                <option value={0.8}>80 cm (Quartos / Interna)</option>
                <option value={0.9}>90 cm (Entrada Principal)</option>
                <option value={1.0}>100 cm (Larga)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <label className="font-bold">Orientação:</label>
              <select
                value={openingOrientation}
                onChange={(e) => setOpeningOrientation(e.target.value as 'horizontal' | 'vertical')}
                className="bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer"
              >
                <option value="horizontal">Horizontal (Parede Norte/Sul)</option>
                <option value="vertical">Vertical (Parede Leste/Oeste)</option>
              </select>
            </div>

            <span className="text-[10px] font-bold text-emerald-800">
              * Clique em qualquer parede para posicionar a porta com arco de abertura!
            </span>
          </div>
        )}

        {activeTool === 'add_window' && (
          <div className="bg-[#E4E3E0]/60 p-2.5 border border-[#141414] flex flex-wrap items-center gap-4 text-xs">
            <span className="font-black uppercase flex items-center gap-1">
              <Maximize className="w-4 h-4" /> Configurar Janela:
            </span>
            <div className="flex items-center gap-1">
              <label className="font-bold">Largura:</label>
              <select
                value={windowWidthMeters}
                onChange={(e) => setWindowWidthMeters(Number(e.target.value))}
                className="bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer"
              >
                <option value={0.8}>80 cm</option>
                <option value={1.0}>1,00 m</option>
                <option value={1.2}>1,20 m (Padrão Quarto)</option>
                <option value={1.5}>1,50 m (Padrão Sala)</option>
                <option value={2.0}>2,00 m (Larga)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <label className="font-bold">Orientação:</label>
              <select
                value={openingOrientation}
                onChange={(e) => setOpeningOrientation(e.target.value as 'horizontal' | 'vertical')}
                className="bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer"
              >
                <option value="horizontal">Horizontal (Parede Norte/Sul)</option>
                <option value="vertical">Vertical (Parede Leste/Oeste)</option>
              </select>
            </div>

            <span className="text-[10px] font-bold text-emerald-800">
              * Clique na parede para posicionar a janela com esquadria dupla!
            </span>
          </div>
        )}

        {activeTool === 'add_symbol' && (
          <div className="bg-[#E4E3E0]/60 p-2.5 border border-[#141414] flex flex-wrap items-center gap-4 text-xs">
            <span className="font-black uppercase">Símbolo NBR 5444:</span>
            <div className="flex items-center gap-1">
              <label className="font-bold">Tipo:</label>
              <select
                value={selectedSymbolType}
                onChange={(e) => setSelectedSymbolType(e.target.value as ElectricalSymbolType)}
                className="bg-white border border-[#141414] px-2 py-1 font-bold cursor-pointer"
              >
                <option value="tug_low">Tomada Baixa (0,30m)</option>
                <option value="tug_med">Tomada Média (1,10m)</option>
                <option value="tug_high">Tomada Alta (2,20m)</option>
                <option value="tue">TUE (Carga Especial / Chuveiro)</option>
                <option value="light_ceiling">Ponto de Luz no Teto</option>
                <option value="switch_1p">Interruptor Simples</option>
                <option value="qdc">Quadro de Distribuição (QDC)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <label className="font-bold">Circuito:</label>
              <input
                type="number"
                min="1"
                max="20"
                value={symbolCircuitNum}
                onChange={(e) => setSymbolCircuitNum(Number(e.target.value))}
                className="bg-white border border-[#141414] w-14 px-1.5 py-1 text-center font-bold"
              />
            </div>

            <div className="flex items-center gap-1">
              <label className="font-bold">Potência (VA):</label>
              <input
                type="number"
                step="50"
                value={symbolPowerVA}
                onChange={(e) => setSymbolPowerVA(Number(e.target.value))}
                className="bg-white border border-[#141414] w-20 px-1.5 py-1 text-center font-bold"
              />
            </div>
          </div>
        )}

        {activeTool === 'draw_room' && (
          <div className="bg-[#E4E3E0]/60 p-2.5 border border-[#141414] flex flex-wrap items-center gap-4 text-xs">
            <span className="font-black uppercase">Novo Cômodo:</span>
            <div className="flex items-center gap-1">
              <label className="font-bold">Nome:</label>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="bg-white border border-[#141414] px-2 py-1 font-bold"
              />
            </div>
            <span className="text-[10px] font-bold text-blue-900">
              Clique e arraste no canvas para desenhar as paredes à escala real!
            </span>
          </div>
        )}
      </div>

      {/* Main Canvas + Legend Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* SVG Scaled Floor Plan Canvas */}
        <div className={`${showLegend ? 'lg:col-span-3' : 'lg:col-span-4'} border-2 border-[#141414] bg-white p-2 overflow-auto max-h-[720px] relative select-none`}>
          <svg
            ref={canvasRef}
            width={1200}
            height={800}
            className="bg-[#FAFAFA] font-mono cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* SVG Grid Pattern */}
            <defs>
              <pattern
                id="scaleGridPattern"
                width={scalePxPerMeter * gridSnapMeters}
                height={scalePxPerMeter * gridSnapMeters}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${scalePxPerMeter * gridSnapMeters} 0 L 0 0 0 ${scalePxPerMeter * gridSnapMeters}`}
                  fill="none"
                  stroke="#141414"
                  strokeOpacity="0.08"
                  strokeWidth="0.5"
                />
              </pattern>
              <pattern
                id="meterGridPattern"
                width={scalePxPerMeter}
                height={scalePxPerMeter}
                patternUnits="userSpaceOnUse"
              >
                <rect width={scalePxPerMeter} height={scalePxPerMeter} fill="url(#scaleGridPattern)" />
                <path
                  d={`M ${scalePxPerMeter} 0 L 0 0 0 ${scalePxPerMeter}`}
                  fill="none"
                  stroke="#141414"
                  strokeOpacity="0.25"
                  strokeWidth="1"
                />
              </pattern>
              <pattern
                id="wallMasonryPattern"
                width="8"
                height="8"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="8" stroke="#A1A1AA" strokeWidth="1" />
              </pattern>

              {/* Seamless Wall Junction Mask (erases strokes passing through intersecting wall cavities) */}
              <mask id="wall-stroke-mask" maskUnits="userSpaceOnUse">
                <rect x="-5000" y="-5000" width="10000" height="10000" fill="white" />
                <g fill="black" stroke="white" strokeWidth="3" strokeLinejoin="miter">
                  {/* Room Wall Cavities */}
                  {roomsWithGeometry.map((room) => {
                    const rx = room.x! * scalePxPerMeter;
                    const ry = room.y! * scalePxPerMeter;
                    const rw = room.widthMeters! * scalePxPerMeter;
                    const rh = room.heightMeters! * scalePxPerMeter;
                    const wallPx = wallThicknessMeters * scalePxPerMeter;
                    const outerD = `M ${rx} ${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`;
                    const innerD = `M ${rx + wallPx} ${ry + wallPx} V ${ry + rh - wallPx} H ${rx + rw - wallPx} V ${ry + wallPx} Z`;
                    return <path key={`mask-room-${room.id}`} d={`${outerD} ${innerD}`} fillRule="evenodd" />;
                  })}

                  {/* Custom Wall Cavities */}
                  {floorPlanWalls.map((w) => {
                    const x1 = w.x1Meters * scalePxPerMeter;
                    const y1 = w.y1Meters * scalePxPerMeter;
                    const x2 = w.x2Meters * scalePxPerMeter;
                    const y2 = w.y2Meters * scalePxPerMeter;
                    const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const lengthPx = Math.hypot(dx, dy);
                    if (lengthPx < 0.1) return null;
                    const ux = dx / lengthPx;
                    const uy = dy / lengthPx;
                    const nx = -uy;
                    const ny = ux;
                    const h = thick / 2;

                    // Extends into connected walls by h so mask covers the interior cavity intersection completely
                    const p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    const p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    const p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    const p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    return <path key={`mask-wall-${w.id}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`} />;
                  })}
                </g>
              </mask>
            </defs>

            {/* Background Grid */}
            {showGrid && <rect width="100%" height="100%" fill="url(#meterGridPattern)" />}

            {/* Viewport Transform Group */}
            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
              {/* LAYER 0: NBR Sheet Border & Margins Frame (A0, A1, A2, A3, A4) */}
              {showSheetFrame && (
                <SheetOverlaySVG
                  sheetSettings={currentSheetSettings}
                  projectSettings={projectData.settings}
                  scalePxPerMeter={scalePxPerMeter}
                  onUpdateSheetSettings={(updatedSheet) => {
                    onUpdateProjectData({
                      ...projectData,
                      sheetSettings: updatedSheet,
                    });
                  }}
                  onOpenExportModal={() => setIsExportModalOpen(true)}
                />
              )}

              {/* Origin Marker */}
              <g transform="translate(0, 0)">
                <line x1="0" y1="0" x2="40" y2="0" stroke="#141414" strokeWidth="2" />
                <line x1="0" y1="0" x2="0" y2="40" stroke="#141414" strokeWidth="2" />
                <text x="5" y="15" fontSize="10" fontWeight="bold" fill="#141414">
                  0,0 m (Escala 1:{Math.round(2500 / scalePxPerMeter)})
                </text>
              </g>

              {/* LAYER 1: Unified Wall Core Fills & Masonry Hatching (Merged Cavities) */}
              <g id="unified-wall-cores">
                {/* Solid Core Fill */}
                <g fill="#E4E4E7">
                  {roomsWithGeometry.map((room) => {
                    const rx = room.x! * scalePxPerMeter;
                    const ry = room.y! * scalePxPerMeter;
                    const rw = room.widthMeters! * scalePxPerMeter;
                    const rh = room.heightMeters! * scalePxPerMeter;
                    const wallPx = wallThicknessMeters * scalePxPerMeter;
                    const outerD = `M ${rx} ${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`;
                    const innerD = `M ${rx + wallPx} ${ry + wallPx} V ${ry + rh - wallPx} H ${rx + rw - wallPx} V ${ry + wallPx} Z`;
                    return <path key={`fill-room-${room.id}`} d={`${outerD} ${innerD}`} fillRule="evenodd" />;
                  })}

                  {floorPlanWalls.map((w) => {
                    const x1 = w.x1Meters * scalePxPerMeter;
                    const y1 = w.y1Meters * scalePxPerMeter;
                    const x2 = w.x2Meters * scalePxPerMeter;
                    const y2 = w.y2Meters * scalePxPerMeter;
                    const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const lengthPx = Math.hypot(dx, dy);
                    if (lengthPx < 0.1) return null;
                    const ux = dx / lengthPx;
                    const uy = dy / lengthPx;
                    const nx = -uy;
                    const ny = ux;
                    const h = thick / 2;

                    const p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    const p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    const p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    const p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    return <path key={`fill-wall-${w.id}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`} />;
                  })}
                </g>

                {/* Masonry Hatching Pattern */}
                <g fill="url(#wallMasonryPattern)" opacity="0.4">
                  {roomsWithGeometry.map((room) => {
                    const rx = room.x! * scalePxPerMeter;
                    const ry = room.y! * scalePxPerMeter;
                    const rw = room.widthMeters! * scalePxPerMeter;
                    const rh = room.heightMeters! * scalePxPerMeter;
                    const wallPx = wallThicknessMeters * scalePxPerMeter;
                    const outerD = `M ${rx} ${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`;
                    const innerD = `M ${rx + wallPx} ${ry + wallPx} V ${ry + rh - wallPx} H ${rx + rw - wallPx} V ${ry + wallPx} Z`;
                    return <path key={`hatch-room-${room.id}`} d={`${outerD} ${innerD}`} fillRule="evenodd" />;
                  })}

                  {floorPlanWalls.map((w) => {
                    const x1 = w.x1Meters * scalePxPerMeter;
                    const y1 = w.y1Meters * scalePxPerMeter;
                    const x2 = w.x2Meters * scalePxPerMeter;
                    const y2 = w.y2Meters * scalePxPerMeter;
                    const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const lengthPx = Math.hypot(dx, dy);
                    if (lengthPx < 0.1) return null;
                    const ux = dx / lengthPx;
                    const uy = dy / lengthPx;
                    const nx = -uy;
                    const ny = ux;
                    const h = thick / 2;

                    const p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    const p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    const p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    const p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    return <path key={`hatch-wall-${w.id}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`} />;
                  })}
                </g>
              </g>

              {/* LAYER 2: Room Interior Floors */}
              <g id="room-floors">
                {roomsWithGeometry.map((room) => {
                  const rx = room.x! * scalePxPerMeter;
                  const ry = room.y! * scalePxPerMeter;
                  const rw = room.widthMeters! * scalePxPerMeter;
                  const rh = room.heightMeters! * scalePxPerMeter;
                  const wallPx = wallThicknessMeters * scalePxPerMeter;
                  const innerW = Math.max(0, rw - 2 * wallPx);
                  const innerH = Math.max(0, rh - 2 * wallPx);

                  if (innerW <= 0 || innerH <= 0) return null;

                  return (
                    <rect
                      key={`floor-${room.id}`}
                      x={rx + wallPx}
                      y={ry + wallPx}
                      width={innerW}
                      height={innerH}
                      fill={room.color}
                      fillOpacity="0.35"
                    />
                  );
                })}
              </g>

              {/* LAYER 3: Masked Outer Wall Outline Strokes (Seamless Open Junctions) */}
              <g id="masked-wall-strokes" mask="url(#wall-stroke-mask)">
                {/* Room Border Strokes */}
                {roomsWithGeometry.map((room) => {
                  const rx = room.x! * scalePxPerMeter;
                  const ry = room.y! * scalePxPerMeter;
                  const rw = room.widthMeters! * scalePxPerMeter;
                  const rh = room.heightMeters! * scalePxPerMeter;
                  const wallPx = wallThicknessMeters * scalePxPerMeter;
                  const isSelected = selectedRoomIds.includes(room.id);

                  const outerD = `M ${rx} ${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`;
                  const innerD = `M ${rx + wallPx} ${ry + wallPx} V ${ry + rh - wallPx} H ${rx + rw - wallPx} V ${ry + wallPx} Z`;

                  return (
                    <g key={`stroke-room-${room.id}`}>
                      <path d={outerD} fill="none" stroke="#141414" strokeWidth={isSelected ? '3.5' : '2'} />
                      <path d={innerD} fill="none" stroke="#141414" strokeWidth={isSelected ? '3.5' : '2'} />
                    </g>
                  );
                })}

                {/* Custom Wall Border Strokes */}
                {floorPlanWalls.map((w) => {
                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const isSelected = selectedWallIds.includes(w.id);

                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return null;

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const h = thick / 2;

                  const sp1 = { x: x1 + nx * h, y: y1 + ny * h };
                  const sp2 = { x: x2 + nx * h, y: y2 + ny * h };
                  const sp3 = { x: x2 - nx * h, y: y2 - ny * h };
                  const sp4 = { x: x1 - nx * h, y: y1 - ny * h };

                  return (
                    <path
                      key={`stroke-wall-${w.id}`}
                      d={`M ${sp1.x} ${sp1.y} L ${sp2.x} ${sp2.y} L ${sp3.x} ${sp3.y} L ${sp4.x} ${sp4.y} Z`}
                      fill="none"
                      stroke="#141414"
                      strokeWidth={isSelected ? '3.5' : '2'}
                      strokeLinecap="square"
                    />
                  );
                })}
              </g>

              {/* LAYER 4: Interactive Handlers, Selection Overlays, Labels & Cotas */}
              {/* Interactive Rooms */}
              {roomsWithGeometry.map((room) => {
                const rx = room.x! * scalePxPerMeter;
                const ry = room.y! * scalePxPerMeter;
                const rw = room.widthMeters! * scalePxPerMeter;
                const rh = room.heightMeters! * scalePxPerMeter;
                const isSelected = selectedRoomIds.includes(room.id);

                return (
                  <g
                    key={`interactive-room-${room.id}`}
                    onClick={(e) => {
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
                    className="cursor-pointer"
                  >
                    {/* Invisible Hit Area over room floor */}
                    <rect x={rx} y={ry} width={rw} height={rh} fill="transparent" />

                    {/* Selected Room Highlight */}
                    {isSelected && (
                      <rect
                        x={rx - 2}
                        y={ry - 2}
                        width={rw + 4}
                        height={rh + 4}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                    )}

                    {/* Room Name & Area Specs */}
                    <text
                      x={rx + rw / 2}
                      y={ry + rh / 2 - 6}
                      fill="#141414"
                      fontSize="12"
                      fontWeight="black"
                      textAnchor="middle"
                      className="uppercase"
                    >
                      {room.name}
                    </text>

                    <text
                      x={rx + rw / 2}
                      y={ry + rh / 2 + 10}
                      fill="#141414"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {room.area} m² | P: {room.perimeter} m
                    </text>

                    {/* Dimensions / Cotas */}
                    {showDimensions && (
                      <g fontWeight="bold" fill="#141414">
                        <text x={rx + rw / 2} y={ry - 8} fontSize="10" textAnchor="middle">
                          {room.widthMeters!.toFixed(2)} m
                        </text>
                        <text
                          x={rx - 10}
                          y={ry + rh / 2}
                          fontSize="10"
                          textAnchor="middle"
                          transform={`rotate(-90 ${rx - 10} ${ry + rh / 2})`}
                        >
                          {room.heightMeters!.toFixed(2)} m
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Interactive Custom Walls */}
              {floorPlanWalls.map((w) => {
                const x1 = w.x1Meters * scalePxPerMeter;
                const y1 = w.y1Meters * scalePxPerMeter;
                const x2 = w.x2Meters * scalePxPerMeter;
                const y2 = w.y2Meters * scalePxPerMeter;
                const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                const isSelected = selectedWallIds.includes(w.id);

                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthPx = Math.hypot(dx, dy);
                if (lengthPx < 0.1) return null;

                const lengthMeters = (lengthPx / scalePxPerMeter).toFixed(2);
                const ux = dx / lengthPx;
                const uy = dy / lengthPx;
                const nx = -uy;
                const ny = ux;
                const h = thick / 2;

                const sp1 = { x: x1 + nx * h, y: y1 + ny * h };
                const sp2 = { x: x2 + nx * h, y: y2 + ny * h };
                const sp3 = { x: x2 - nx * h, y: y2 - ny * h };
                const sp4 = { x: x1 - nx * h, y: y1 - ny * h };

                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                return (
                  <g
                    key={`interactive-wall-${w.id}`}
                    onClick={(e) => {
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
                    className="cursor-pointer"
                  >
                    {/* Invisible thick click hit area */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={Math.max(16, thick + 8)}
                    />

                    {/* Wall Length Badge */}
                    <text
                      x={midX + nx * (h + 12)}
                      y={midY + ny * (h + 12)}
                      fill="#141414"
                      fontSize="9"
                      fontWeight="black"
                      textAnchor="middle"
                    >
                      {lengthMeters}m
                    </text>

                    {/* Selected Wall Highlight & Drag Handles */}
                    {isSelected && (
                      <g>
                        <path
                          d={`M ${sp1.x} ${sp1.y} L ${sp2.x} ${sp2.y} L ${sp3.x} ${sp3.y} L ${sp4.x} ${sp4.y} Z`}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                        <circle
                          cx={x1}
                          cy={y1}
                          r="7"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="2"
                          className="cursor-crosshair hover:scale-125 transition-transform"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingWallHandle({ wallId: w.id, handle: 'p1' });
                          }}
                        />
                        <circle
                          cx={x2}
                          cy={y2}
                          r="7"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="2"
                          className="cursor-crosshair hover:scale-125 transition-transform"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingWallHandle({ wallId: w.id, handle: 'p2' });
                          }}
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Live Preview when Drawing Custom Wall */}
              {isDrawingWall && wallStartPos && wallCurrentPos && (() => {
                const x1 = wallStartPos.x * scalePxPerMeter;
                const y1 = wallStartPos.y * scalePxPerMeter;
                const x2 = wallCurrentPos.x * scalePxPerMeter;
                const y2 = wallCurrentPos.y * scalePxPerMeter;
                const thick = wallThicknessMeters * scalePxPerMeter;

                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthPx = Math.hypot(dx, dy);
                if (lengthPx < 1) return null;

                const lengthMeters = (lengthPx / scalePxPerMeter).toFixed(2);

                const ux = dx / lengthPx;
                const uy = dy / lengthPx;
                const nx = -uy;
                const ny = ux;
                const h = thick / 2;

                const p1 = { x: x1 + nx * h, y: y1 + ny * h };
                const p2 = { x: x2 + nx * h, y: y2 + ny * h };
                const p3 = { x: x2 - nx * h, y: y2 - ny * h };
                const p4 = { x: x1 - nx * h, y: y1 - ny * h };

                return (
                  <g>
                    <path
                      d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`}
                      fill="#3b82f6"
                      fillOpacity="0.3"
                      stroke="#1d4ed8"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 10}
                      fill="#1d4ed8"
                      fontSize="11"
                      fontWeight="black"
                      textAnchor="middle"
                    >
                      Parede: {lengthMeters} m
                    </text>
                  </g>
                );
              })()}

              {/* 3. Drag Preview when Drawing Room (with double lines preview) */}
              {isDrawingRoom && dragStartPos && dragCurrentPos && (() => {
                const minX = Math.min(dragStartPos.x, dragCurrentPos.x) * scalePxPerMeter;
                const minY = Math.min(dragStartPos.y, dragCurrentPos.y) * scalePxPerMeter;
                const w = Math.abs(dragCurrentPos.x - dragStartPos.x) * scalePxPerMeter;
                const h = Math.abs(dragCurrentPos.y - dragStartPos.y) * scalePxPerMeter;
                const wallPx = wallThicknessMeters * scalePxPerMeter;

                return (
                  <g>
                    <rect
                      x={minX}
                      y={minY}
                      width={w}
                      height={h}
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                    {w > 2 * wallPx && h > 2 * wallPx && (
                      <rect
                        x={minX + wallPx}
                        y={minY + wallPx}
                        width={w - 2 * wallPx}
                        height={h - 2 * wallPx}
                        fill="#3b82f6"
                        fillOpacity="0.15"
                        stroke="#1d4ed8"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                    )}
                    <text
                      x={((dragStartPos.x + dragCurrentPos.x) / 2) * scalePxPerMeter}
                      y={((dragStartPos.y + dragCurrentPos.y) / 2) * scalePxPerMeter}
                      fill="#1d4ed8"
                      fontSize="12"
                      fontWeight="black"
                      textAnchor="middle"
                    >
                      {Math.abs(dragCurrentPos.x - dragStartPos.x).toFixed(2)}m ×{' '}
                      {Math.abs(dragCurrentPos.y - dragStartPos.y).toFixed(2)}m (
                      {(
                        Math.abs(dragCurrentPos.x - dragStartPos.x) *
                        Math.abs(dragCurrentPos.y - dragStartPos.y)
                      ).toFixed(2)}
                      m²)
                    </text>
                  </g>
                );
              })()}

              {/* 2b. Live Wall Drawing Preview & Snap Overlay */}
              {isDrawingWall && wallStartPos && wallCurrentPos && (() => {
                const x1 = wallStartPos.x * scalePxPerMeter;
                const y1 = wallStartPos.y * scalePxPerMeter;
                const x2 = wallCurrentPos.x * scalePxPerMeter;
                const y2 = wallCurrentPos.y * scalePxPerMeter;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const lenPx = Math.hypot(dx, dy);
                const lenMeters = (lenPx / scalePxPerMeter).toFixed(2);

                const thick = wallThicknessMeters * scalePxPerMeter;
                const ux = lenPx > 0 ? dx / lenPx : 0;
                const uy = lenPx > 0 ? dy / lenPx : 0;
                const nx = -uy;
                const ny = ux;
                const h = thick / 2;

                const p1 = { x: x1 + nx * h, y: y1 + ny * h };
                const p2 = { x: x2 + nx * h, y: y2 + ny * h };
                const p3 = { x: x2 - nx * h, y: y2 - ny * h };
                const p4 = { x: x1 - nx * h, y: y1 - ny * h };

                const pathStr = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`;

                return (
                  <g>
                    {/* Orthogonal Reference Line */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#1d4ed8"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />

                    {/* Preview Double Line Wall */}
                    <path d={pathStr} fill="#3b82f6" fillOpacity="0.25" stroke="#1d4ed8" strokeWidth="2" />

                    {/* Start & End Point Dots */}
                    <circle cx={x1} cy={y1} r="5" fill="#1d4ed8" />
                    <circle cx={x2} cy={y2} r="5" fill="#1d4ed8" />

                    {/* Length Badge Overlay */}
                    {lenPx > 10 && (
                      <g transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2 - 14})`}>
                        <rect x="-35" y="-12" width="70" height="22" fill="#1d4ed8" rx="4" />
                        <text x="0" y="3" fill="white" fontSize="11" fontWeight="black" textAnchor="middle">
                          {lenMeters} m
                        </text>
                      </g>
                    )}

                    {/* Snap Info Floating Badge */}
                    {wallSnapInfo?.isSnapped && wallSnapInfo.snapInfo && (
                      <g transform={`translate(${x2 + 15}, ${y2 - 15})`}>
                        <rect x="0" y="-12" width="165" height="22" fill="#15803d" rx="4" />
                        <text x="8" y="3" fill="white" fontSize="10" fontWeight="bold">
                          {wallSnapInfo.snapInfo}
                        </text>
                      </g>
                    )}

                    {/* Target Snap Ring Highlight */}
                    {wallSnapInfo?.snapTargetPoint && (
                      <circle
                        cx={wallSnapInfo.snapTargetPoint.x * scalePxPerMeter}
                        cy={wallSnapInfo.snapTargetPoint.y * scalePxPerMeter}
                        r="12"
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="3"
                        strokeDasharray="3 3"
                      />
                    )}
                  </g>
                );
              })()}

              {/* 3. Architectural Openings (Portas e Janelas) */}
              {showOpenings && floorPlanOpenings.map((op) => renderArchitecturalOpening(op))}

              {/* 4. Conduits */}
              {showConduits && floorPlanConduits.map((c) => renderConduitLine(c))}

              {/* 5. NBR 5444 Electrical Symbols */}
              {showElectrical && floorPlanSymbols.map((sym) => renderNBR5444Symbol(sym))}

              {/* 6. Measurement Line */}
              {measureStart && measureEnd && (
                <g>
                  <line
                    x1={measureStart.x * scalePxPerMeter}
                    y1={measureStart.y * scalePxPerMeter}
                    x2={measureEnd.x * scalePxPerMeter}
                    y2={measureEnd.y * scalePxPerMeter}
                    stroke="#dc2626"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                  />
                  <text
                    x={((measureStart.x + measureEnd.x) / 2) * scalePxPerMeter}
                    y={((measureStart.y + measureEnd.y) / 2) * scalePxPerMeter - 8}
                    fill="#dc2626"
                    fontSize="11"
                    fontWeight="black"
                    textAnchor="middle"
                  >
                    Distância: {Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y).toFixed(2)} m
                  </text>
                </g>
              )}

              {/* 7. Box Selection Marquee */}
              {isBoxSelecting && selectionStart && selectionCurrent && (() => {
                const minX = Math.min(selectionStart.x, selectionCurrent.x) * scalePxPerMeter;
                const minY = Math.min(selectionStart.y, selectionCurrent.y) * scalePxPerMeter;
                const w = Math.abs(selectionCurrent.x - selectionStart.x) * scalePxPerMeter;
                const h = Math.abs(selectionCurrent.y - selectionStart.y) * scalePxPerMeter;

                return (
                  <g>
                    <rect
                      x={minX}
                      y={minY}
                      width={w}
                      height={h}
                      fill="#3b82f6"
                      fillOpacity="0.18"
                      stroke="#1d4ed8"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    {totalSelectedCount > 0 && (
                      <g transform={`translate(${minX}, ${Math.max(0, minY - 22)})`}>
                        <rect
                          x="0"
                          y="0"
                          width={Math.max(150, w)}
                          height="20"
                          fill="#1d4ed8"
                          rx="4"
                        />
                        <text
                          x={Math.max(150, w) / 2}
                          y="14"
                          fill="white"
                          fontSize="10"
                          fontWeight="black"
                          textAnchor="middle"
                        >
                          {totalSelectedCount} elemento(s) selecionado(s)
                        </text>
                      </g>
                    )}
                  </g>
                );
              })()}
            </g>
          </svg>
        </div>

        {/* Legend Sidebar */}
        {showLegend && (
          <div className="space-y-4">
            <div className="border border-[#141414] bg-white p-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wide border-b border-[#141414] pb-2 flex items-center justify-between">
                <span>Legenda Arquitetônica & NBR 5444</span>
              </h4>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-3 border-2 border-[#141414] bg-[#E4E4E7] shrink-0" />
                  <span>Parede Dupla ({Math.round(wallThicknessMeters * 100)}cm)</span>
                </div>
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-[#141414]" />
                  <span>Porta com Arco de Abertura</span>
                </div>
                <div className="flex items-center gap-2">
                  <Maximize className="w-4 h-4 text-[#141414]" />
                  <span>Janela com Esquadria Dupla</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-[#141414] bg-[#141414] shrink-0" />
                  <span>Tomada Alta (2,20m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-[#141414] bg-white shrink-0 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#141414]" />
                  </div>
                  <span>Tomada Média (1,10m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-[#141414] bg-white shrink-0" />
                  <span>Tomada Baixa (0,30m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-[#141414] bg-white shrink-0 flex items-center justify-center font-bold text-[9px]">
                    TUE
                  </div>
                  <span>Tomada Uso Específico</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-[#141414] bg-white shrink-0 flex items-center justify-center font-bold text-[9px]">
                    C1
                  </div>
                  <span>Ponto Iluminação Teto</span>
                </div>
              </div>
            </div>

            <div className="border border-[#141414] bg-white p-4 space-y-2 text-xs font-mono">
              <h4 className="font-bold uppercase border-b border-[#141414] pb-1">
                Resumo da Planta CAD
              </h4>
              <div className="flex justify-between">
                <span className="opacity-70">Área Total:</span>
                <span className="font-bold">
                  {roomsWithGeometry.reduce((acc, r) => acc + r.area, 0).toFixed(1)} m²
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Cômodos:</span>
                <span className="font-bold">{roomsWithGeometry.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Portas:</span>
                <span className="font-bold">{floorPlanOpenings.filter((o) => o.type === 'door').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Janelas:</span>
                <span className="font-bold">{floorPlanOpenings.filter((o) => o.type === 'window').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Pontos Elétricos:</span>
                <span className="font-bold">{floorPlanSymbols.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sheet Export & Title Block Modal */}
      <SheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        projectData={projectData}
        sizedCircuits={sizedCircuits}
        onUpdateSheetSettings={(updatedSheet) => {
          onUpdateProjectData({
            ...projectData,
            sheetSettings: updatedSheet,
          });
        }}
        onUpdateProjectSettings={(updatedSettings) => {
          onUpdateProjectData({
            ...projectData,
            settings: updatedSettings,
          });
        }}
      />
    </div>
  );
};
