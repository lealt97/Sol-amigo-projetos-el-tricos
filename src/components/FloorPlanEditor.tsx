import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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
import {
  DEFAULT_SHEET_SETTINGS,
  SUPPORTED_DRAWING_SCALES,
  formatScale,
  getScalePxPerMeter,
  getSheetScaleDenominator,
  getSheetSpec,
  isSupportedDrawingScale,
  paperMmToCanvasPx,
} from '../utils/nbrSheetEngine';

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

interface OpeningPlacement {
  x: number;
  y: number;
  orientation: 'horizontal' | 'vertical';
  angleDeg: number;
  wallThicknessMeters: number;
  wallPositionRatio: number;
  roomId?: string;
  wallId?: string;
}

const TOOL_META: Record<ToolMode, { label: string; shortcut: string }> = {
  select: { label: 'Selecionar / Mover', shortcut: 'V' },
  draw_room: { label: 'Cômodo', shortcut: 'R' },
  draw_wall: { label: 'Parede', shortcut: 'W' },
  add_door: { label: 'Porta', shortcut: 'D' },
  add_window: { label: 'Janela', shortcut: 'J' },
  add_symbol: { label: 'Símbolo elétrico', shortcut: 'E' },
  add_conduit: { label: 'Eletroduto', shortcut: 'C' },
  measure: { label: 'Medir / Cota', shortcut: 'M' },
};

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
  onUpdateProjectData: commitProjectData,
}) => {
  // Scale & Viewport State
  const [gridSnapMeters, setGridSnapMeters] = useState<number>(0.25); // 25cm grid snap
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [elementDrag, setElementDrag] = useState<ElementDragState | null>(null);

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
  const [isMeasuring, setIsMeasuring] = useState(false);

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
  const [toolStatus, setToolStatus] = useState('Selecione uma ferramenta para começar.');

  const currentSheetSettings: SheetSettings = useMemo(
    () => ({
      ...DEFAULT_SHEET_SETTINGS,
      ...projectData.sheetSettings,
    }),
    [projectData.sheetSettings]
  );

  const scaleDenominator = useMemo(
    () => getSheetScaleDenominator(currentSheetSettings, 50),
    [currentSheetSettings]
  );

  const scalePxPerMeter = useMemo(
    () => getScalePxPerMeter(scaleDenominator),
    [scaleDenominator]
  );

  const canvasRef = useRef<SVGSVGElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

  // CAD action history. Project snapshots are intentionally stored in refs so
  // transient pointer movement does not trigger extra renders.
  const undoStackRef = useRef<ProjectData[]>([]);
  const redoStackRef = useRef<ProjectData[]>([]);
  const historyTransactionRef = useRef<ProjectData | null>(null);
  const historyTransactionDirtyRef = useRef(false);
  const HISTORY_LIMIT = 100;

  const cloneProjectSnapshot = (data: ProjectData): ProjectData =>
    JSON.parse(JSON.stringify(data)) as ProjectData;

  const snapshotsMatch = (a: ProjectData, b: ProjectData) =>
    JSON.stringify(a) === JSON.stringify(b);

  const pushUndoSnapshot = (snapshot: ProjectData) => {
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    if (last && snapshotsMatch(last, snapshot)) return;
    undoStackRef.current = [...stack, cloneProjectSnapshot(snapshot)].slice(-HISTORY_LIMIT);
  };

  const beginHistoryTransaction = () => {
    if (historyTransactionRef.current) return;
    historyTransactionRef.current = cloneProjectSnapshot(projectData);
    historyTransactionDirtyRef.current = false;
  };

  const finishHistoryTransaction = () => {
    const snapshot = historyTransactionRef.current;
    if (snapshot && historyTransactionDirtyRef.current) {
      pushUndoSnapshot(snapshot);
    }
    historyTransactionRef.current = null;
    historyTransactionDirtyRef.current = false;
  };

  const rollbackHistoryTransaction = () => {
    const snapshot = historyTransactionRef.current;
    const wasDirty = historyTransactionDirtyRef.current;
    historyTransactionRef.current = null;
    historyTransactionDirtyRef.current = false;
    if (snapshot && wasDirty) {
      commitProjectData(cloneProjectSnapshot(snapshot));
    }
  };

  // Existing mutations continue calling onUpdateProjectData, but now each
  // atomic command records one undo point. Continuous drags are grouped by the
  // transaction helpers and therefore become a single Ctrl+Z action.
  const onUpdateProjectData = (nextData: ProjectData) => {
    if (snapshotsMatch(projectData, nextData)) {
      commitProjectData(nextData);
      return;
    }

    if (historyTransactionRef.current) {
      historyTransactionDirtyRef.current = true;
      redoStackRef.current = [];
      commitProjectData(nextData);
      return;
    }

    pushUndoSnapshot(projectData);
    redoStackRef.current = [];
    commitProjectData(nextData);
  };


  const fitSheetToViewport = useCallback((announce = false) => {
    const viewport = canvasViewportRef.current;
    const svg = canvasRef.current;
    if (!viewport || !svg || !showSheetFrame) return;

    const spec = getSheetSpec(
      currentSheetSettings.format,
      currentSheetSettings.orientation
    );

    const sheetWidthPx = paperMmToCanvasPx(spec.widthMm);
    const sheetHeightPx = paperMmToCanvasPx(spec.heightMm);
    const sheetX = (currentSheetSettings.sheetXPosMeters ?? -0.5) * scalePxPerMeter;
    const sheetY = (currentSheetSettings.sheetYPosMeters ?? -0.5) * scalePxPerMeter;

    const viewportWidth = svg.clientWidth || viewport.clientWidth;
    const viewportHeight = svg.clientHeight || viewport.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0 || sheetWidthPx <= 0 || sheetHeightPx <= 0) return;

    // Reserva visual para que todo o perímetro da folha permaneça visível,
    // inclusive a identificação que fica logo acima da borda superior.
    const padding = 32;
    const availableWidth = Math.max(1, viewportWidth - padding * 2);
    const availableHeight = Math.max(1, viewportHeight - padding * 2);
    const fitZoom = Math.min(availableWidth / sheetWidthPx, availableHeight / sheetHeightPx);
    const nextZoom = Math.min(2, Math.max(0.05, fitZoom));

    const renderedWidth = sheetWidthPx * nextZoom;
    const renderedHeight = sheetHeightPx * nextZoom;

    setZoom(nextZoom);
    setPanOffset({
      x: (viewportWidth - renderedWidth) / 2 - sheetX * nextZoom,
      y: (viewportHeight - renderedHeight) / 2 - sheetY * nextZoom,
    });

    if (announce) {
      setToolStatus(
        `Folha ${currentSheetSettings.format} ${
          currentSheetSettings.orientation === 'landscape' ? 'paisagem' : 'retrato'
        } enquadrada em ${Math.round(nextZoom * 100)}%.`
      );
    }
  }, [currentSheetSettings, scalePxPerMeter, showSheetFrame]);

  const zoomViewport = useCallback((factor: number) => {
    const svg = canvasRef.current;
    if (!svg || !Number.isFinite(factor) || factor <= 0) return;

    const viewportWidth = svg.clientWidth;
    const viewportHeight = svg.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0 || zoom <= 0) return;

    const nextZoom = Math.min(8, Math.max(0.05, zoom * factor));
    if (Math.abs(nextZoom - zoom) < 0.0001) return;

    // Mantém o mesmo ponto do desenho sob o centro da viewport durante o zoom,
    // reproduzindo a sensação de zoom de ferramentas como o Figma.
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const worldCenterX = (centerX - panOffset.x) / zoom;
    const worldCenterY = (centerY - panOffset.y) / zoom;

    setZoom(nextZoom);
    setPanOffset({
      x: centerX - worldCenterX * nextZoom,
      y: centerY - worldCenterY * nextZoom,
    });
    setToolStatus(
      `Zoom da visualização: ${Math.round(nextZoom * 100)}%. Escala técnica ${formatScale(scaleDenominator)} preservada.`
    );
  }, [zoom, panOffset, scaleDenominator]);

  // Sempre que formato, orientação, escala técnica ou posição da prancha mudar,
  // reenquadra somente a viewport. A escala técnica do projeto não é alterada.
  useEffect(() => {
    if (!showSheetFrame) return;
    const frame = window.requestAnimationFrame(() => fitSheetToViewport(false));
    return () => window.cancelAnimationFrame(frame);
  }, [fitSheetToViewport, showSheetFrame, showLegend]);

  // Mantém o perímetro completo visível quando a área do editor muda de tamanho
  // (janela, sidebar/legenda ou layout responsivo).
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fitSheetToViewport(false));
    });

    observer.observe(viewport);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [fitSheetToViewport]);

  const clearSelections = () => {
    setSelectedRoomIds([]);
    setSelectedSymbolIds([]);
    setSelectedOpeningIds([]);
    setSelectedWallIds([]);
  };

  const resetTransientGesture = () => {
    setIsDrawingRoom(false);
    setDragStartPos(null);
    setDragCurrentPos(null);
    setIsDrawingWall(false);
    setWallStartPos(null);
    setWallCurrentPos(null);
    setWallSnapInfo(null);
    setIsBoxSelecting(false);
    setSelectionStart(null);
    setSelectionCurrent(null);
    setDraggingWallHandle(null);
    setElementDrag(null);
    setIsPanning(false);
    setIsMeasuring(false);
  };

  const activateTool = (tool: ToolMode) => {
    rollbackHistoryTransaction();
    resetTransientGesture();
    if (tool !== 'add_conduit') setConduitFromId(null);
    if (tool !== 'measure') {
      setMeasureStart(null);
      setMeasureEnd(null);
    }
    setActiveTool(tool);
    setToolStatus(`${TOOL_META[tool].label} ativa • ${TOOL_META[tool].shortcut}`);
  };

  const cancelCurrentOperation = () => {
    rollbackHistoryTransaction();
    resetTransientGesture();
    setConduitFromId(null);
    setMeasureStart(null);
    setMeasureEnd(null);
    setActiveTool('select');
    setToolStatus('Operação cancelada. Ferramenta Selecionar ativa.');
  };

  const handleCanvasMouseLeave = () => {
    if (isDrawingRoom || isDrawingWall || isMeasuring) {
      setToolStatus('Gesto cancelado porque o cursor saiu da área de desenho.');
    }
    rollbackHistoryTransaction();
    resetTransientGesture();
  };

  const undoProjectAction = () => {
    if (historyTransactionRef.current) {
      rollbackHistoryTransaction();
      resetTransientGesture();
      clearSelections();
      setToolStatus('Ação atual cancelada e restaurada.');
      return;
    }

    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previous) {
      setToolStatus('Nada para desfazer.');
      return;
    }

    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, cloneProjectSnapshot(projectData)].slice(-HISTORY_LIMIT);
    commitProjectData(cloneProjectSnapshot(previous));
    resetTransientGesture();
    clearSelections();
    setToolStatus('Ação desfeita • Ctrl/Cmd + Z');
  };

  const redoProjectAction = () => {
    if (historyTransactionRef.current) {
      setToolStatus('Finalize ou cancele a ação atual antes de refazer.');
      return;
    }

    const next = redoStackRef.current[redoStackRef.current.length - 1];
    if (!next) {
      setToolStatus('Nada para refazer.');
      return;
    }

    redoStackRef.current = redoStackRef.current.slice(0, -1);
    pushUndoSnapshot(projectData);
    commitProjectData(cloneProjectSnapshot(next));
    resetTransientGesture();
    clearSelections();
    setToolStatus('Ação refeita • Ctrl/Cmd + Shift + Z / Ctrl + Y');
  };

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

  // A room is stored by its architectural outer rectangle, while the rendered masonry
  // grows inward. Keep axis + both physical faces so a custom wall can make a true
  // architectural butt/T connection instead of piercing through the host wall.
  const roomWallAxisSegments = useMemo(() => {
    const thickness = wallThicknessMeters;
    const half = thickness / 2;

    return roomsWithGeometry.flatMap((room) => {
      if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) {
        return [];
      }

      const left = room.x;
      const top = room.y;
      const right = room.x + room.widthMeters;
      const bottom = room.y + room.heightMeters;
      const axisLeft = left + half;
      const axisRight = right - half;
      const axisTop = top + half;
      const axisBottom = bottom - half;
      const innerLeft = left + thickness;
      const innerRight = right - thickness;
      const innerTop = top + thickness;
      const innerBottom = bottom - thickness;

      if (axisRight < axisLeft || axisBottom < axisTop) return [];

      return [
        {
          roomId: room.id,
          side: 'top' as const,
          start: { x: axisLeft, y: axisTop },
          end: { x: axisRight, y: axisTop },
          outerStart: { x: left, y: top },
          outerEnd: { x: right, y: top },
          innerStart: { x: innerLeft, y: innerTop },
          innerEnd: { x: innerRight, y: innerTop },
        },
        {
          roomId: room.id,
          side: 'bottom' as const,
          start: { x: axisLeft, y: axisBottom },
          end: { x: axisRight, y: axisBottom },
          outerStart: { x: left, y: bottom },
          outerEnd: { x: right, y: bottom },
          innerStart: { x: innerLeft, y: innerBottom },
          innerEnd: { x: innerRight, y: innerBottom },
        },
        {
          roomId: room.id,
          side: 'left' as const,
          start: { x: axisLeft, y: axisTop },
          end: { x: axisLeft, y: axisBottom },
          outerStart: { x: left, y: top },
          outerEnd: { x: left, y: bottom },
          innerStart: { x: innerLeft, y: innerTop },
          innerEnd: { x: innerLeft, y: innerBottom },
        },
        {
          roomId: room.id,
          side: 'right' as const,
          start: { x: axisRight, y: axisTop },
          end: { x: axisRight, y: axisBottom },
          outerStart: { x: right, y: top },
          outerEnd: { x: right, y: bottom },
          innerStart: { x: innerRight, y: innerTop },
          innerEnd: { x: innerRight, y: innerBottom },
        },
      ];
    });
  }, [roomsWithGeometry, wallThicknessMeters]);

  type RoomWallSnapTarget = {
    roomId: string;
    side: 'top' | 'bottom' | 'left' | 'right';
    face: 'axis' | 'inner' | 'outer';
    x: number;
    y: number;
    distance: number;
  };

  const projectPointToSegment = (
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSq = vx * vx + vy * vy;
    if (lengthSq <= 1e-9) {
      return {
        x: start.x,
        y: start.y,
        distance: Math.hypot(point.x - start.x, point.y - start.y),
      };
    }
    const t = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSq)
    );
    const x = start.x + vx * t;
    const y = start.y + vy * t;
    return { x, y, distance: Math.hypot(point.x - x, point.y - y) };
  };

  // When the direction of the custom wall is known, snap to the physical host face
  // approached by that wall. Only a near-collinear extension stays on the center axis.
  const getRoomWallSnapTarget = (
    point: { x: number; y: number },
    otherPoint?: { x: number; y: number },
    maxDistance = 0.35
  ): RoomWallSnapTarget | null => {
    let best: RoomWallSnapTarget | null = null;

    for (const segment of roomWallAxisSegments) {
      let face: RoomWallSnapTarget['face'] = 'axis';
      let targetStart = segment.start;
      let targetEnd = segment.end;

      if (otherPoint) {
        const wallDx = otherPoint.x - point.x;
        const wallDy = otherPoint.y - point.y;
        const wallLength = Math.hypot(wallDx, wallDy);
        const normalMagnitude =
          segment.side === 'top' || segment.side === 'bottom'
            ? Math.abs(wallDy)
            : Math.abs(wallDx);
        const normalRatio = wallLength > 1e-9 ? normalMagnitude / wallLength : 0;

        // A real junction at more than ~12 degrees to the host uses the approached face.
        // Near-collinear walls still join by their shared axis.
        if (normalRatio >= 0.2) {
          let useInnerFace = false;
          if (segment.side === 'top') useInnerFace = otherPoint.y >= segment.start.y;
          if (segment.side === 'bottom') useInnerFace = otherPoint.y <= segment.start.y;
          if (segment.side === 'left') useInnerFace = otherPoint.x >= segment.start.x;
          if (segment.side === 'right') useInnerFace = otherPoint.x <= segment.start.x;

          face = useInnerFace ? 'inner' : 'outer';
          targetStart = useInnerFace ? segment.innerStart : segment.outerStart;
          targetEnd = useInnerFace ? segment.innerEnd : segment.outerEnd;
        }
      }

      const projection = projectPointToSegment(point, targetStart, targetEnd);
      if (
        projection.distance <= maxDistance &&
        (!best || projection.distance < best.distance - 1e-6)
      ) {
        best = {
          roomId: segment.roomId,
          side: segment.side,
          face,
          x: projection.x,
          y: projection.y,
          distance: projection.distance,
        };
      }
    }

    return best;
  };

  type CustomWallSnapTarget = {
    wallId: string;
    kind: 'segment' | 'endpoint';
    face: 'axis' | 'positive' | 'negative';
    x: number;
    y: number;
    distance: number;
    hostThicknessMeters: number;
    hostUx: number;
    hostUy: number;
    hostNx: number;
    hostNy: number;
  };

  // Resolve a custom-wall junction against the PHYSICAL face of the host wall.
  // Mid-segment hits become true butt/T junctions. Endpoint hits keep the shared
  // center-axis node so L/end-to-end corners continue behaving like a polyline node.
  const getCustomWallSnapTarget = (
    point: { x: number; y: number },
    otherPoint?: { x: number; y: number },
    maxDistance = 0.35,
    ignoreWallId?: string
  ): CustomWallSnapTarget | null => {
    let best: CustomWallSnapTarget | null = null;

    const consider = (candidate: CustomWallSnapTarget) => {
      if (candidate.distance > maxDistance) return;
      if (!best || candidate.distance < best.distance - 1e-6) best = candidate;
    };

    for (const host of floorPlanWalls) {
      if (host.id === ignoreWallId) continue;

      const dx = host.x2Meters - host.x1Meters;
      const dy = host.y2Meters - host.y1Meters;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;

      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy;
      const ny = ux;
      const thickness = host.thicknessMeters || wallThicknessMeters;
      const half = thickness / 2;
      const start = { x: host.x1Meters, y: host.y1Meters };
      const end = { x: host.x2Meters, y: host.y2Meters };

      // L is allowed only at the exact endpoint node. There is intentionally no
      // endpoint attraction radius: any non-zero distance from the corner must remain
      // eligible for a physical-face T junction. The epsilon only absorbs floating-point noise.
      const endpointNodeEpsilon = 1e-6;
      const startDistance = Math.hypot(point.x - start.x, point.y - start.y);
      if (startDistance <= endpointNodeEpsilon) {
        consider({
          wallId: host.id,
          kind: 'endpoint',
          face: 'axis',
          x: start.x,
          y: start.y,
          distance: startDistance,
          hostThicknessMeters: thickness,
          hostUx: ux,
          hostUy: uy,
          hostNx: nx,
          hostNy: ny,
        });
      }
      const endDistance = Math.hypot(point.x - end.x, point.y - end.y);
      if (endDistance <= endpointNodeEpsilon) {
        consider({
          wallId: host.id,
          kind: 'endpoint',
          face: 'axis',
          x: end.x,
          y: end.y,
          distance: endDistance,
          hostThicknessMeters: thickness,
          hostUx: ux,
          hostUy: uy,
          hostNx: nx,
          hostNy: ny,
        });
      }

      const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
      const t = Math.max(0, Math.min(1, rawT));
      // Do not reserve a near-corner band for L. Only the mathematical endpoint itself
      // is excluded from segment/T classification because it was handled above.
      if (t <= endpointNodeEpsilon || t >= 1 - endpointNodeEpsilon) continue;

      let face: CustomWallSnapTarget['face'] = 'axis';
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
        x: projection.x,
        y: projection.y,
        distance: projection.distance,
        hostThicknessMeters: thickness,
        hostUx: ux,
        hostUy: uy,
        hostNx: nx,
        hostNy: ny,
      });
    }

    return best;
  };

  const getConnectedWallComponentIds = (seedWallId: string): string[] => {
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

  const getRoomIdAtPoint = (point: { x: number; y: number }, tolerance = 0.03): string | undefined => {
    const candidates = roomsWithGeometry
      .filter((room) => {
        if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) return false;
        return (
          point.x >= room.x - tolerance &&
          point.x <= room.x + room.widthMeters + tolerance &&
          point.y >= room.y - tolerance &&
          point.y <= room.y + room.heightMeters + tolerance
        );
      })
      .sort((a, b) =>
        (a.widthMeters || 0) * (a.heightMeters || 0) -
        (b.widthMeters || 0) * (b.heightMeters || 0)
      );

    return candidates[0]?.id;
  };

  const normalizeWallConnections = (wall: FloorPlanWall): FloorPlanWall => {
    const maxDistance = Math.max(0.4, wallThicknessMeters * 2.5);
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };

    const resolveEndpoint = (
      point: { x: number; y: number },
      otherPoint: { x: number; y: number }
    ) => {
      const roomTarget = getRoomWallSnapTarget(point, otherPoint, maxDistance);
      const customTarget = getCustomWallSnapTarget(point, otherPoint, maxDistance, wall.id);
      if (!roomTarget) return customTarget;
      if (!customTarget) return roomTarget;
      return customTarget.distance < roomTarget.distance - 1e-6 ? customTarget : roomTarget;
    };

    const startTarget = resolveEndpoint(start, end);
    const endTarget = resolveEndpoint(end, start);
    const normalizedStart = {
      x: startTarget?.x ?? wall.x1Meters,
      y: startTarget?.y ?? wall.y1Meters,
    };
    const normalizedEnd = {
      x: endTarget?.x ?? wall.x2Meters,
      y: endTarget?.y ?? wall.y2Meters,
    };

    // A custom wall is part of the architectural room/planta it is drawn inside or
    // attached to. This ownership makes room dragging a true grouped architectural move.
    const existingRoomId = wall.roomId && roomsWithGeometry.some((room) => room.id === wall.roomId)
      ? wall.roomId
      : undefined;
    const midpointRoomId = getRoomIdAtPoint({
      x: (normalizedStart.x + normalizedEnd.x) / 2,
      y: (normalizedStart.y + normalizedEnd.y) / 2,
    });

    const connectedRoomIds = [startTarget, endTarget]
      .flatMap((target) => {
        if (!target) return [];
        if ('roomId' in target) return [target.roomId];
        if ('wallId' in target) {
          const host = floorPlanWalls.find((item) => item.id === target.wallId);
          return host?.roomId ? [host.roomId] : [];
        }
        return [];
      })
      .filter((roomId): roomId is string => Boolean(roomId));
    const uniqueConnectedRoomIds = Array.from(new Set(connectedRoomIds));
    const inferredRoomId =
      existingRoomId ||
      midpointRoomId ||
      (uniqueConnectedRoomIds.length === 1 ? uniqueConnectedRoomIds[0] : undefined);

    return {
      ...wall,
      roomId: inferredRoomId,
      x1Meters: normalizedStart.x,
      y1Meters: normalizedStart.y,
      x2Meters: normalizedEnd.x,
      y2Meters: normalizedEnd.y,
    };
  };

  // Silently migrate walls saved by the previous center-axis implementation. This fixes
  // existing drawings as soon as they reopen, without adding a fake Ctrl+Z history entry.
  const wallJunctionMigrationSignatureRef = useRef('');
  useEffect(() => {
    if (elementDrag || draggingWallHandle || isDrawingWall || floorPlanWalls.length === 0) return;

    const groupIdByWall = new Map<string, string>();
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
    if (!changed) return;

    const signature = JSON.stringify(
      migratedWalls.map((wall) => [
        wall.id,
        wall.roomId,
        wall.groupId,
        wall.x1Meters,
        wall.y1Meters,
        wall.x2Meters,
        wall.y2Meters,
      ])
    );
    if (wallJunctionMigrationSignatureRef.current === signature) return;
    wallJunctionMigrationSignatureRef.current = signature;

    commitProjectData({
      ...projectData,
      floorPlan: {
        ...(projectData.floorPlan || {
          scalePixelsPerMeter: scalePxPerMeter,
          gridSnapMeters,
          symbols: floorPlanSymbols,
          conduits: floorPlanConduits,
          openings: floorPlanOpenings,
        }),
        walls: migratedWalls,
      },
    });
  }, [
    floorPlanWalls,
    roomsWithGeometry,
    wallThicknessMeters,
    elementDrag,
    draggingWallHandle,
    isDrawingWall,
  ]);

  // Snap meters to current grid
  const snap = (meters: number): number => {
    if (gridSnapMeters <= 0) return Math.round(meters * 100) / 100;
    return Math.round(meters / gridSnapMeters) * gridSnapMeters;
  };

  const snapDelta = (meters: number): number => {
    if (gridSnapMeters <= 0) return Math.round(meters * 100) / 100;
    return Math.round(meters / gridSnapMeters) * gridSnapMeters;
  };

  // Convert SVG event mouse coords to meter coords
  const getMeterCoordsFromEvent = (e: React.MouseEvent<SVGElement>): { x: number; y: number } => {
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
    // Compare every candidate against one stable cursor probe. x/y are mutated when
    // a candidate wins, so reusing them would bias subsequent candidates near corners.
    const snapProbe = { x, y };

    // 2. Snap to the physical face of room masonry approached by the custom wall.
    // On initial mouse-down (no direction yet), keep the center axis as a neutral anchor;
    // the final wall is normalized to the correct face on commit.
    const roomSnap = getRoomWallSnapTarget(snapProbe, startPos ?? undefined, minDistance);
    if (roomSnap && roomSnap.distance <= minDistance) {
      minDistance = roomSnap.distance;
      x = roomSnap.x;
      y = roomSnap.y;
      isSnapped = true;
      snapInfo =
        roomSnap.face === 'axis'
          ? `⚡ Eixo da parede do cômodo (${roomSnap.side})`
          : `⚡ Face ${roomSnap.face === 'inner' ? 'interna' : 'externa'} da parede (${roomSnap.side})`;
      snapTargetPoint = { x: roomSnap.x, y: roomSnap.y };
    }

    // 3. Snap to custom-wall endpoints or the exact physical face of a host segment.
    const customSnap = getCustomWallSnapTarget(
      snapProbe,
      startPos ?? undefined,
      minDistance,
      ignoreWallId
    );
    if (customSnap && customSnap.distance <= minDistance) {
      minDistance = customSnap.distance;
      x = customSnap.x;
      y = customSnap.y;
      isSnapped = true;
      snapInfo =
        customSnap.kind === 'endpoint'
          ? '⚡ Nó compartilhado entre paredes'
          : customSnap.face === 'axis'
            ? '⚡ Eixo da parede desenhada'
            : '⚡ Face da parede desenhada • junção T';
      snapTargetPoint = { x: customSnap.x, y: customSnap.y };
    }

    return { x, y, isSnapped, snapInfo, snapTargetPoint };
  };

  const getOpeningPlacementOnSegment = (
    point: { x: number; y: number },
    widthMeters: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    thicknessMeters: number,
    metadata: { roomId?: string; wallId?: string } = {}
  ): (OpeningPlacement & { distance: number }) | null => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < widthMeters || length < 1e-6) return null;

    const ux = dx / length;
    const uy = dy / length;
    const rawAlong = (point.x - start.x) * ux + (point.y - start.y) * uy;
    const projectedAlong = Math.max(0, Math.min(length, rawAlong));
    const projectedX = start.x + ux * projectedAlong;
    const projectedY = start.y + uy * projectedAlong;

    const halfWidth = widthMeters / 2;
    const centerAlong = Math.max(halfWidth, Math.min(length - halfWidth, rawAlong));
    const centerX = start.x + ux * centerAlong;
    const centerY = start.y + uy * centerAlong;
    const openingStartX = centerX - ux * halfWidth;
    const openingStartY = centerY - uy * halfWidth;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    return {
      x: openingStartX,
      y: openingStartY,
      orientation: Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical',
      angleDeg,
      wallThicknessMeters: thicknessMeters,
      wallPositionRatio: length > 0 ? centerAlong / length : 0.5,
      ...metadata,
      distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    };
  };

  const getOpeningPlacementOnWall = (
    point: { x: number; y: number },
    widthMeters: number,
    maxDistanceMeters = Math.max(0.35, gridSnapMeters * 1.5)
  ): OpeningPlacement | null => {
    let best: (OpeningPlacement & { distance: number }) | null = null;
    const consider = (candidate: (OpeningPlacement & { distance: number }) | null) => {
      if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
    };

    // Room walls are drawn inward from the architectural outer rectangle, so openings
    // must sit on the centerline of that wall thickness rather than on the outer edge.
    for (const room of roomsWithGeometry) {
      if (room.x === undefined || room.y === undefined || !room.widthMeters || !room.heightMeters) continue;
      const left = room.x;
      const top = room.y;
      const right = room.x + room.widthMeters;
      const bottom = room.y + room.heightMeters;
      const h = wallThicknessMeters / 2;

      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: left, y: top + h },
        { x: right, y: top + h },
        wallThicknessMeters,
        { roomId: room.id }
      ));
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: left, y: bottom - h },
        { x: right, y: bottom - h },
        wallThicknessMeters,
        { roomId: room.id }
      ));
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: left + h, y: top },
        { x: left + h, y: bottom },
        wallThicknessMeters,
        { roomId: room.id }
      ));
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: right - h, y: top },
        { x: right - h, y: bottom },
        wallThicknessMeters,
        { roomId: room.id }
      ));
    }

    // Custom walls support any angle and use their own stored thickness.
    for (const wall of floorPlanWalls) {
      consider(getOpeningPlacementOnSegment(
        point,
        widthMeters,
        { x: wall.x1Meters, y: wall.y1Meters },
        { x: wall.x2Meters, y: wall.y2Meters },
        wall.thicknessMeters || wallThicknessMeters,
        { wallId: wall.id, roomId: wall.roomId }
      ));
    }

    if (!best || best.distance > maxDistanceMeters) return null;
    const { distance: _distance, ...placement } = best;
    return placement;
  };

  const getResolvedOpeningPlacement = (opening: FloorPlanOpening): OpeningPlacement => {
    // A custom-wall opening remains attached even when that wall is moved, rotated or resized.
    if (opening.wallId) {
      const wall = floorPlanWalls.find((item) => item.id === opening.wallId);
      if (wall) {
        const dx = wall.x2Meters - wall.x1Meters;
        const dy = wall.y2Meters - wall.y1Meters;
        const ratio = Math.max(0, Math.min(1, opening.wallPositionRatio ?? 0.5));
        const targetCenter = {
          x: wall.x1Meters + dx * ratio,
          y: wall.y1Meters + dy * ratio,
        };
        const anchored = getOpeningPlacementOnSegment(
          targetCenter,
          opening.widthMeters,
          { x: wall.x1Meters, y: wall.y1Meters },
          { x: wall.x2Meters, y: wall.y2Meters },
          wall.thicknessMeters || wallThicknessMeters,
          { wallId: wall.id, roomId: wall.roomId }
        );
        if (anchored) {
          const { distance: _distance, ...placement } = anchored;
          return placement;
        }
      }
    }

    // New openings already store exact axis/angle data.
    if (Number.isFinite(opening.angleDeg)) {
      return {
        x: opening.xMeters,
        y: opening.yMeters,
        orientation: opening.orientation,
        angleDeg: opening.angleDeg ?? (opening.orientation === 'horizontal' ? 0 : 90),
        wallThicknessMeters: opening.roomId
          ? wallThicknessMeters
          : (opening.wallThicknessMeters || wallThicknessMeters),
        wallPositionRatio: opening.wallPositionRatio ?? 0.5,
        roomId: opening.roomId,
        wallId: opening.wallId,
      };
    }

    // Legacy saved projects stored room openings on the outer wall edge. Resolve them to
    // the nearest real wall centerline at render time so old drawings are fixed too.
    const legacyCenter = opening.orientation === 'horizontal'
      ? { x: opening.xMeters + opening.widthMeters / 2, y: opening.yMeters }
      : { x: opening.xMeters, y: opening.yMeters + opening.widthMeters / 2 };
    const migrated = getOpeningPlacementOnWall(
      legacyCenter,
      opening.widthMeters,
      Math.max(0.8, gridSnapMeters * 3)
    );
    if (migrated) return migrated;

    return {
      x: opening.xMeters,
      y: opening.yMeters,
      orientation: opening.orientation,
      angleDeg: opening.orientation === 'horizontal' ? 0 : 90,
      wallThicknessMeters: wallThicknessMeters,
      wallPositionRatio: 0.5,
      roomId: opening.roomId,
      wallId: opening.wallId,
    };
  };

  const selectElementForDrag = (kind: DragElementKind, id: string, additive: boolean) => {
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

    beginHistoryTransaction();

    if (kind === 'room') {
      const room = roomsWithGeometry.find((item) => item.id === id);
      if (!room) return;

      const roomWalls = floorPlanWalls
        .filter((item) => {
          if (item.roomId === id) return true;
          const midpoint = {
            x: (item.x1Meters + item.x2Meters) / 2,
            y: (item.y1Meters + item.y2Meters) / 2,
          };
          return getRoomIdAtPoint(midpoint) === id;
        })
        .map((item) => ({ ...item }));
      const roomWallIds = new Set(roomWalls.map((item) => item.id));
      const pointInsideDraggedRoom = (x: number, y: number) =>
        room.x !== undefined &&
        room.y !== undefined &&
        Boolean(room.widthMeters) &&
        Boolean(room.heightMeters) &&
        x >= room.x - 0.03 &&
        x <= room.x + (room.widthMeters || 0) + 0.03 &&
        y >= room.y - 0.03 &&
        y <= room.y + (room.heightMeters || 0) + 0.03;

      const roomSymbols = floorPlanSymbols
        .filter((item) => item.roomId === id || (!item.roomId && pointInsideDraggedRoom(item.xMeters, item.yMeters)))
        .map((item) => ({ ...item, roomId: item.roomId || id }));
      const roomOpenings = floorPlanOpenings
        .filter((item) =>
          item.roomId === id ||
          Boolean(item.wallId && roomWallIds.has(item.wallId))
        )
        .map((item) => ({ ...item, roomId: item.roomId || id }));

      setElementDrag({
        kind,
        id,
        startPointer,
        room: { ...room },
        childSymbols: roomSymbols,
        childOpenings: roomOpenings,
        childWalls: roomWalls,
      });
      setToolStatus(`Arrastando cômodo: ${room.name}. Paredes e elementos da planta acompanham.`);
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
      const resolved = getResolvedOpeningPlacement(opening);
      setElementDrag({
        kind,
        id,
        startPointer,
        opening: { ...opening, ...resolved },
      });
      setToolStatus(`Arrastando ${opening.type === 'door' ? 'porta' : 'janela'} sobre as paredes.`);
      return;
    }

    const wall = floorPlanWalls.find((item) => item.id === id);
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
  };

  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
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
      beginHistoryTransaction();
      setIsDrawingRoom(true);
      setDragStartPos(coords);
      setDragCurrentPos(coords);
    } else if (activeTool === 'draw_wall') {
      beginHistoryTransaction();
      const snap = getSmartWallCoords(coords, null, e.shiftKey);
      setIsDrawingWall(true);
      setWallStartPos({ x: snap.x, y: snap.y });
      setWallCurrentPos({ x: snap.x, y: snap.y });
      setWallSnapInfo(snap);
    } else if (activeTool === 'add_door') {
      const placement = getOpeningPlacementOnWall(coords, doorWidthMeters);
      if (!placement) {
        setToolStatus('Porta não inserida: aproxime o cursor de uma parede.');
        return;
      }

      const doorCount = floorPlanOpenings.filter((o) => o.type === 'door').length + 1;
      const newDoor: FloorPlanOpening = {
        id: `door_${Date.now()}`,
        type: 'door',
        xMeters: placement.x,
        yMeters: placement.y,
        widthMeters: doorWidthMeters,
        orientation: placement.orientation,
        angleDeg: placement.angleDeg,
        wallId: placement.wallId,
        wallThicknessMeters: placement.wallThicknessMeters,
        wallPositionRatio: placement.wallPositionRatio,
        roomId: placement.roomId,
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
      setToolStatus(`Porta P${doorCount} inserida e alinhada à parede.`);
    } else if (activeTool === 'add_window') {
      const placement = getOpeningPlacementOnWall(coords, windowWidthMeters);
      if (!placement) {
        setToolStatus('Janela não inserida: aproxime o cursor de uma parede.');
        return;
      }

      const windowCount = floorPlanOpenings.filter((o) => o.type === 'window').length + 1;
      const newWindow: FloorPlanOpening = {
        id: `win_${Date.now()}`,
        type: 'window',
        xMeters: placement.x,
        yMeters: placement.y,
        widthMeters: windowWidthMeters,
        orientation: placement.orientation,
        angleDeg: placement.angleDeg,
        wallId: placement.wallId,
        wallThicknessMeters: placement.wallThicknessMeters,
        wallPositionRatio: placement.wallPositionRatio,
        roomId: placement.roomId,
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
      setToolStatus(`Janela J${windowCount} inserida e alinhada à parede.`);
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
        roomId: getRoomIdAtPoint(coords),
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
      setIsMeasuring(true);
      setToolStatus('Arraste até o ponto final da medição.');
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

        const childSymbols = new Map<string, FloorPlanSymbol>((elementDrag.childSymbols || []).map((item) => [item.id, item] as const));
        const childOpenings = new Map<string, FloorPlanOpening>((elementDrag.childOpenings || []).map((item) => [item.id, item] as const));
        const childWalls = new Map<string, FloorPlanWall>((elementDrag.childWalls || []).map((item) => [item.id, item] as const));

        const updatedRooms = projectData.rooms.map((room) =>
          room.id === elementDrag.id ? { ...room, x: nextX, y: nextY } : room
        );
        const updatedSymbols = floorPlanSymbols.map((symbol) => {
          const original = childSymbols.get(symbol.id);
          return original
            ? {
                ...symbol,
                roomId: original.roomId || elementDrag.id,
                xMeters: original.xMeters + appliedX,
                yMeters: original.yMeters + appliedY,
              }
            : symbol;
        });
        const updatedOpenings = floorPlanOpenings.map((opening) => {
          const original = childOpenings.get(opening.id);
          return original
            ? {
                ...opening,
                roomId: original.roomId || elementDrag.id,
                xMeters: original.xMeters + appliedX,
                yMeters: original.yMeters + appliedY,
              }
            : opening;
        });
        const updatedWalls = floorPlanWalls.map((wall) => {
          const original = childWalls.get(wall.id);
          return original
            ? {
                ...wall,
                roomId: original.roomId || elementDrag.id,
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
        const angleDeg = origin.angleDeg ?? (origin.orientation === 'horizontal' ? 0 : 90);
        const angleRad = (angleDeg * Math.PI) / 180;
        const desiredCenter = {
          x: origin.xMeters + Math.cos(angleRad) * origin.widthMeters / 2 + deltaX,
          y: origin.yMeters + Math.sin(angleRad) * origin.widthMeters / 2 + deltaY,
        };
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
                  angleDeg: placement.angleDeg,
                  wallId: placement.wallId,
                  wallThicknessMeters: placement.wallThicknessMeters,
                  wallPositionRatio: placement.wallPositionRatio,
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
    }

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
    } else if (isMeasuring && measureStart) {
      setMeasureEnd(coords);
    }
  };

  const handleMouseUp = () => {
    if (elementDrag) {
      finishHistoryTransaction();
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

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (draggingWallHandle) {
      finishHistoryTransaction();
      setDraggingWallHandle(null);
      return;
    }

    if (isBoxSelecting) {
      setIsBoxSelecting(false);
      setSelectionStart(null);
      setSelectionCurrent(null);
      return;
    }

    if (isMeasuring) {
      setIsMeasuring(false);
      setToolStatus('Medição concluída. Arraste novamente para medir outra distância.');
      return;
    }

    if (isDrawingWall && wallStartPos && wallCurrentPos) {
      const draftWall: FloorPlanWall = {
        id: `wall_${Date.now()}`,
        x1Meters: wallStartPos.x,
        y1Meters: wallStartPos.y,
        x2Meters: wallCurrentPos.x,
        y2Meters: wallCurrentPos.y,
        thicknessMeters: wallThicknessMeters,
        label: '',
      };
      const normalizedWall = normalizeWallConnections(draftWall);
      const dx = normalizedWall.x2Meters - normalizedWall.x1Meters;
      const dy = normalizedWall.y2Meters - normalizedWall.y1Meters;
      const dist = Math.hypot(dx, dy);

      if (dist >= 0.1) {
        const startTopologyBefore = getEndpointNodeTopology({
          x: normalizedWall.x1Meters,
          y: normalizedWall.y1Meters,
        });
        const endTopologyBefore = getEndpointNodeTopology({
          x: normalizedWall.x2Meters,
          y: normalizedWall.y2Meters,
        });
        const inheritedGroupId = [startTopologyBefore, endTopologyBefore]
          .flatMap((topology) => topology?.branches || [])
          .map((branch) => branch.wall.groupId)
          .find((groupId): groupId is string => Boolean(groupId));
        const convertsLToT = startTopologyBefore?.kind === 'L' || endTopologyBefore?.kind === 'L';

        const newWall: FloorPlanWall = {
          ...normalizedWall,
          groupId: inheritedGroupId || normalizedWall.groupId || `wallgrp_${normalizedWall.id}`,
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
        setToolStatus(
          convertsLToT
            ? 'Junção L convertida em T. A nova parede faz parte do mesmo desenho.'
            : 'Parede criada e conectividade da planta atualizada.'
        );
      }

      finishHistoryTransaction();
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

      finishHistoryTransaction();
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

  // Delete selected elements atomically. A second room-only update used to restore
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

  // Keyboard shortcuts and command cancellation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const hasZoomModifier = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (hasZoomModifier) {
        const isZoomIn = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
        const isZoomOut = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract';
        const isFitSheet = e.key === '0' || e.code === 'Numpad0';

        if (isZoomIn) {
          e.preventDefault();
          zoomViewport(1.15);
          return;
        }
        if (isZoomOut) {
          e.preventDefault();
          zoomViewport(1 / 1.15);
          return;
        }
        if (isFitSheet) {
          e.preventDefault();
          fitSheetToViewport(true);
          return;
        }
      }

      if (isTyping) return;

      const hasHistoryModifier = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (hasHistoryModifier) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoProjectAction();
          else undoProjectAction();
          return;
        }
        if (key === 'y' && !e.shiftKey) {
          e.preventDefault();
          redoProjectAction();
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        cancelCurrentOperation();
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const shortcutMap: Record<string, ToolMode> = {
          v: 'select',
          r: 'draw_room',
          w: 'draw_wall',
          d: 'add_door',
          j: 'add_window',
          e: 'add_symbol',
          c: 'add_conduit',
          m: 'measure',
        };
        const nextTool = shortcutMap[e.key.toLowerCase()];
        if (nextTool) {
          e.preventDefault();
          activateTool(nextTool);
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (totalSelectedCount > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };

    const handleWindowBlur = () => setIsSpacePressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
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
    zoomViewport,
    fitSheetToViewport,
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
    const resolved = getResolvedOpeningPlacement(op);
    const x = resolved.x * scalePxPerMeter;
    const y = resolved.y * scalePxPerMeter;
    const w = op.widthMeters * scalePxPerMeter;
    const wallPx = resolved.wallThicknessMeters * scalePxPerMeter;
    const angleDeg = resolved.angleDeg;
    const halfWall = wallPx / 2;
    const isSelected = selectedOpeningIds.includes(op.id);

    const handleOpeningMouseDown = (e: React.MouseEvent<SVGGElement>) => {
      if (activeTool === 'select') startElementDrag('opening', op.id, e);
    };

    const cutWall = (
      <rect
        x="0"
        y={-halfWall - 2.5}
        width={w}
        height={wallPx + 5}
        fill="#FAFAFA"
        stroke="none"
        pointerEvents="none"
      />
    );

    if (op.type === 'door') {
      return (
        <g
          key={op.id}
          transform={`translate(${x}, ${y}) rotate(${angleDeg})`}
          onMouseDown={handleOpeningMouseDown}
          className="cursor-grab active:cursor-grabbing"
        >
          {/* Exact wall cut: removes both wall-face strokes only inside the opening span. */}
          {cutWall}

          {/* Jambs reconnect precisely to the two black wall faces. */}
          <line x1="0" y1={-halfWall} x2="0" y2={halfWall} stroke="#141414" strokeWidth="2.5" />
          <line x1={w} y1={-halfWall} x2={w} y2={halfWall} stroke="#141414" strokeWidth="2.5" />

          {/* Door leaf and swing arc use the same host-wall axis, including angled walls. */}
          <line x1="0" y1={halfWall} x2="0" y2={halfWall - w} stroke="#141414" strokeWidth="2.5" />
          <path
            d={`M ${w} ${halfWall} A ${w} ${w} 0 0 0 0 ${halfWall - w}`}
            fill="none"
            stroke="#141414"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />

          <text
            x={w / 2}
            y={halfWall + 14}
            fill="#141414"
            fontSize="9"
            fontWeight="black"
            textAnchor="middle"
          >
            {op.label || 'PORTA'}
          </text>

          {isSelected && (
            <rect
              x="-3"
              y={halfWall - w - 4}
              width={w + 6}
              height={w + wallPx + 21}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
          )}
        </g>
      );
    }

    return (
      <g
        key={op.id}
        transform={`translate(${x}, ${y}) rotate(${angleDeg})`}
        onMouseDown={handleOpeningMouseDown}
        className="cursor-grab active:cursor-grabbing"
      >
        {/* Window replaces the wall section instead of being drawn over an uncut wall. */}
        {cutWall}
        <line x1="0" y1={-halfWall} x2="0" y2={halfWall} stroke="#141414" strokeWidth="2" />
        <line x1={w} y1={-halfWall} x2={w} y2={halfWall} stroke="#141414" strokeWidth="2" />
        <line x1="0" y1={-wallPx / 4} x2={w} y2={-wallPx / 4} stroke="#141414" strokeWidth="1.2" />
        <line x1="0" y1={wallPx / 4} x2={w} y2={wallPx / 4} stroke="#141414" strokeWidth="1.2" />

        <text
          x={w / 2}
          y={-halfWall - 5}
          fill="#141414"
          fontSize="9"
          fontWeight="black"
          textAnchor="middle"
        >
          {op.label || 'JANELA'}
        </text>

        {isSelected && (
          <rect
            x="-3"
            y={-halfWall - 3}
            width={w + 6}
            height={wallPx + 6}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        )}
      </g>
    );
  };

  // Render Electrical Symbols
  const renderNBR5444Symbol = (sym: FloorPlanSymbol) => {
    const cx = sym.xMeters * scalePxPerMeter;
    const cy = sym.yMeters * scalePxPerMeter;
    const isSelected = selectedSymbolIds.includes(sym.id);

    const onSymMouseDown = (e: React.MouseEvent<SVGGElement>) => {
      if (activeTool === 'select') startElementDrag('symbol', sym.id, e);
    };

    const onSymClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeTool === 'add_conduit') handleSymbolClick(sym.id, e);
    };

    switch (sym.type) {
      case 'tug_low':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
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
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
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
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
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
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
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
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
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
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
            <circle cx="0" cy="0" r="7" fill="white" stroke="#141414" strokeWidth="2" />
            <text x="10" y="4" fill="#141414" fontSize="10" fontWeight="bold">
              S{sym.commandLetter || 'a'}
            </text>
            {isSelected && <circle cx="0" cy="0" r="11" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />}
          </g>
        );

      case 'qdc':
        return (
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
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
          <g key={sym.id} transform={`translate(${cx}, ${cy})`} onMouseDown={onSymMouseDown} onClick={onSymClick} className="cursor-grab active:cursor-grabbing">
            <circle cx="0" cy="0" r="8" fill="#141414" />
          </g>
        );
    }
  };

  const getRoomWallEndpointConnection = (
    wall: FloorPlanWall,
    point: { x: number; y: number },
    otherPoint: { x: number; y: number }
  ) => {
    const tolerance = Math.max(0.08, wallThicknessMeters * 0.8, gridSnapMeters * 0.35);
    return getRoomWallSnapTarget(point, otherPoint, tolerance);
  };

  const getCustomWallEndpointConnection = (
    wall: FloorPlanWall,
    point: { x: number; y: number },
    otherPoint: { x: number; y: number }
  ) => {
    const tolerance = Math.max(
      0.08,
      (wall.thicknessMeters || wallThicknessMeters) * 0.8,
      gridSnapMeters * 0.35
    );
    return getCustomWallSnapTarget(point, otherPoint, tolerance, wall.id);
  };

  const isWallEndpointConnected = (wall: FloorPlanWall, point: { x: number; y: number }) => {
    const start = { x: wall.x1Meters, y: wall.y1Meters };
    const end = { x: wall.x2Meters, y: wall.y2Meters };
    const isStart = Math.hypot(point.x - start.x, point.y - start.y) <= Math.hypot(point.x - end.x, point.y - end.y);
    const otherPoint = isStart ? end : start;
    return Boolean(
      getRoomWallEndpointConnection(wall, point, otherPoint) ||
      getCustomWallEndpointConnection(wall, point, otherPoint)
    );
  };

  type EndpointNodeBranch = {
    wall: FloorPlanWall;
    wallId: string;
    usesStart: boolean;
    awayUx: number;
    awayUy: number;
    storedUx: number;
    storedUy: number;
    storedNx: number;
    storedNy: number;
    halfMeters: number;
  };

  type EndpointNodeTopology = {
    point: { x: number; y: number };
    branches: EndpointNodeBranch[];
    kind: 'single' | 'straight' | 'L' | 'T' | 'X' | 'multi';
    throughPairs: [EndpointNodeBranch, EndpointNodeBranch][];
    stem?: EndpointNodeBranch;
  };

  const getEndpointNodeTopology = (
    point: { x: number; y: number },
    epsilon = 1e-6
  ): EndpointNodeTopology | null => {
    const branches: EndpointNodeBranch[] = [];

    for (const wall of floorPlanWalls) {
      const startDistance = Math.hypot(point.x - wall.x1Meters, point.y - wall.y1Meters);
      const endDistance = Math.hypot(point.x - wall.x2Meters, point.y - wall.y2Meters);
      if (startDistance > epsilon && endDistance > epsilon) continue;

      const dx = wall.x2Meters - wall.x1Meters;
      const dy = wall.y2Meters - wall.y1Meters;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;

      const storedUx = dx / length;
      const storedUy = dy / length;
      const usesStart = startDistance <= endDistance;
      const otherPoint = usesStart
        ? { x: wall.x2Meters, y: wall.y2Meters }
        : { x: wall.x1Meters, y: wall.y1Meters };
      const awayDx = otherPoint.x - point.x;
      const awayDy = otherPoint.y - point.y;
      const awayLength = Math.hypot(awayDx, awayDy);
      if (awayLength < 1e-9) continue;

      branches.push({
        wall,
        wallId: wall.id,
        usesStart,
        awayUx: awayDx / awayLength,
        awayUy: awayDy / awayLength,
        storedUx,
        storedUy,
        storedNx: -storedUy,
        storedNy: storedUx,
        halfMeters: (wall.thicknessMeters || wallThicknessMeters) / 2,
      });
    }

    if (branches.length === 0) return null;

    const dot = (a: EndpointNodeBranch, b: EndpointNodeBranch) =>
      a.awayUx * b.awayUx + a.awayUy * b.awayUy;
    const opposite = (a: EndpointNodeBranch, b: EndpointNodeBranch) => dot(a, b) <= -0.98;

    if (branches.length === 1) {
      return { point, branches, kind: 'single', throughPairs: [] };
    }

    if (branches.length === 2) {
      return {
        point,
        branches,
        kind: opposite(branches[0], branches[1]) ? 'straight' : 'L',
        throughPairs: opposite(branches[0], branches[1]) ? [[branches[0], branches[1]]] : [],
      };
    }

    const candidates: Array<{
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
  };

  const getUniqueCustomEndpointNodeTopologies = (): EndpointNodeTopology[] => {
    const points: { x: number; y: number }[] = [];
    const epsilon = 1e-6;
    for (const wall of floorPlanWalls) {
      for (const point of [
        { x: wall.x1Meters, y: wall.y1Meters },
        { x: wall.x2Meters, y: wall.y2Meters },
      ]) {
        if (!points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= epsilon)) {
          points.push(point);
        }
      }
    }
    return points
      .map((point) => getEndpointNodeTopology(point, epsilon))
      .filter((topology): topology is EndpointNodeTopology => Boolean(topology && topology.branches.length >= 2));
  };

  // Multi-branch nodes are solved as one topology, not as several independent L corners.
  // At a T, the straight pair is the host and the third branch terminates exactly on the
  // contacted host face. At an X, every branch stops at the shared center node and seam
  // cuts expose the correct union outline.
  const getMultiNodeEndpointFacePoints = (
    wall: FloorPlanWall,
    point: { x: number; y: number }
  ): { positive: { x: number; y: number }; negative: { x: number; y: number } } | null => {
    const topology = getEndpointNodeTopology(point);
    if (!topology || topology.branches.length < 3) return null;

    const branch = topology.branches.find((candidate) => candidate.wallId === wall.id);
    if (!branch) return null;

    const basePoints = {
      positive: {
        x: point.x + branch.storedNx * branch.halfMeters,
        y: point.y + branch.storedNy * branch.halfMeters,
      },
      negative: {
        x: point.x - branch.storedNx * branch.halfMeters,
        y: point.y - branch.storedNy * branch.halfMeters,
      },
    };

    if (topology.kind !== 'T' || !topology.stem || topology.stem.wallId !== wall.id) {
      return basePoints;
    }

    const hostPair = topology.throughPairs[0];
    if (!hostPair) return basePoints;
    const hostUx = hostPair[0].awayUx;
    const hostUy = hostPair[0].awayUy;
    const hostNx = -hostUy;
    const hostNy = hostUx;
    const hostHalf = Math.max(hostPair[0].halfMeters, hostPair[1].halfMeters);
    const side = topology.stem.awayUx * hostNx + topology.stem.awayUy * hostNy >= 0 ? 1 : -1;
    const hostFacePoint = {
      x: point.x + hostNx * hostHalf * side,
      y: point.y + hostNy * hostHalf * side,
    };

    const intersectStoredFace = (normalSign: 1 | -1) => {
      const sideOrigin = {
        x: point.x + branch.storedNx * branch.halfMeters * normalSign,
        y: point.y + branch.storedNy * branch.halfMeters * normalSign,
      };
      const cross = branch.storedUx * hostUy - branch.storedUy * hostUx;
      if (Math.abs(cross) < 1e-8) return normalSign === 1 ? basePoints.positive : basePoints.negative;
      const relX = hostFacePoint.x - sideOrigin.x;
      const relY = hostFacePoint.y - sideOrigin.y;
      const t = (relX * hostUy - relY * hostUx) / cross;
      return {
        x: sideOrigin.x + branch.storedUx * t,
        y: sideOrigin.y + branch.storedUy * t,
      };
    };

    return {
      positive: intersectStoredFace(1),
      negative: intersectStoredFace(-1),
    };
  };

  const beginWallFromExactNode = (
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

  // True endpoint-to-endpoint L corners use a geometric miter: the outer face reaches
  // the outer corner and the inner face stops at the inner corner. This removes the
  // square protrusions created by extending both faces by the same half-thickness.
  const getCustomWallEndpointMiter = (
    wall: FloorPlanWall,
    point: { x: number; y: number },
    otherPoint: { x: number; y: number }
  ): { positive: { x: number; y: number }; negative: { x: number; y: number } } | null => {
    const topology = getEndpointNodeTopology(point);
    if (topology && topology.branches.length >= 3) return null;

    const connection = getCustomWallEndpointConnection(wall, point, otherPoint);
    if (!connection || connection.kind !== 'endpoint') return null;

    const host = floorPlanWalls.find((candidate) => candidate.id === connection.wallId);
    if (!host) return null;

    const currentDx = wall.x2Meters - wall.x1Meters;
    const currentDy = wall.y2Meters - wall.y1Meters;
    const currentLength = Math.hypot(currentDx, currentDy);
    const awayDx = otherPoint.x - point.x;
    const awayDy = otherPoint.y - point.y;
    const awayLength = Math.hypot(awayDx, awayDy);
    if (currentLength < 1e-9 || awayLength < 1e-9) return null;

    const currentUx = currentDx / currentLength;
    const currentUy = currentDy / currentLength;
    const currentNx = -currentUy;
    const currentNy = currentUx;
    const awayUx = awayDx / awayLength;
    const awayUy = awayDy / awayLength;
    const currentStoredVsAway = currentUx * awayUx + currentUy * awayUy >= 0 ? 1 : -1;

    const hostStart = { x: host.x1Meters, y: host.y1Meters };
    const hostEnd = { x: host.x2Meters, y: host.y2Meters };
    const hostUsesStart = Math.hypot(point.x - hostStart.x, point.y - hostStart.y) <= 1e-6;
    const hostUsesEnd = Math.hypot(point.x - hostEnd.x, point.y - hostEnd.y) <= 1e-6;
    if (!hostUsesStart && !hostUsesEnd) return null;
    const hostOther = hostUsesStart ? hostEnd : hostStart;
    const hostAwayDx = hostOther.x - point.x;
    const hostAwayDy = hostOther.y - point.y;
    const hostAwayLength = Math.hypot(hostAwayDx, hostAwayDy);
    if (hostAwayLength < 1e-9) return null;
    const hostAwayUx = hostAwayDx / hostAwayLength;
    const hostAwayUy = hostAwayDy / hostAwayLength;
    const hostAwayNx = -hostAwayUy;
    const hostAwayNy = hostAwayUx;

    const centerCross = awayUx * hostAwayUy - awayUy * hostAwayUx;
    if (Math.abs(centerCross) < 1e-4) return null;

    const currentHalf = (wall.thicknessMeters || wallThicknessMeters) / 2;
    const hostHalf = (host.thicknessMeters || wallThicknessMeters) / 2;
    const maxMiterDistance = Math.max(currentHalf, hostHalf) * 8;

    const intersectFace = (renderSign: 1 | -1) => {
      const currentAwaySign = renderSign * currentStoredVsAway;
      const hostAwaySign = -currentAwaySign;
      const a = {
        x: point.x + currentNx * currentHalf * renderSign,
        y: point.y + currentNy * currentHalf * renderSign,
      };
      const b = {
        x: point.x + hostAwayNx * hostHalf * hostAwaySign,
        y: point.y + hostAwayNy * hostHalf * hostAwaySign,
      };
      const cross = awayUx * hostAwayUy - awayUy * hostAwayUx;
      if (Math.abs(cross) < 1e-9) return null;
      const relX = b.x - a.x;
      const relY = b.y - a.y;
      const t = (relX * hostAwayUy - relY * hostAwayUx) / cross;
      const hit = { x: a.x + awayUx * t, y: a.y + awayUy * t };
      if (Math.hypot(hit.x - point.x, hit.y - point.y) > maxMiterDistance) return null;
      return hit;
    };

    const positive = intersectFace(1);
    const negative = intersectFace(-1);
    if (!positive || !negative) return null;
    return { positive, negative };
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
                Desenho de cômodos, portas, janelas, fiação e símbolos elétricos em escala
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
                  onClick={clearSelections}
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
              onClick={() => activateTool('select')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'select' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Selecionar por clique ou janela • atalho V"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Selecionar / Mover</span>
            </button>

            <button
              onClick={() => activateTool('draw_room')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'draw_room' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Desenhar cômodo • atalho R"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Desenhar Cômodo</span>
            </button>

            <button
              onClick={() => activateTool('draw_wall')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'draw_wall' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Desenhar parede • atalho W • Shift trava ortogonal"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Desenhar Parede</span>
            </button>

            <button
              onClick={() => activateTool('add_door')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_door' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Inserir porta sobre uma parede • atalho D"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>Inserir Porta</span>
            </button>

            <button
              onClick={() => activateTool('add_window')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_window' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Inserir janela sobre uma parede • atalho J"
            >
              <Maximize className="w-3.5 h-3.5" />
              <span>Inserir Janela</span>
            </button>

            <button
              onClick={() => activateTool('add_symbol')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_symbol' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Inserir símbolo elétrico • atalho E"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Símbolo Elétrico</span>
            </button>

            <button
              onClick={() => activateTool('add_conduit')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'add_conduit' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Ligar eletroduto entre símbolos • atalho C"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Eletroduto</span>
            </button>

            <button
              onClick={() => activateTool('measure')}
              className={`px-3 py-1 font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer ${
                activeTool === 'measure' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-white'
              }`}
              title="Medir distância • atalho M"
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
                <option value={0.15}>15 cm (Padrão)</option>
                <option value={0.20}>20 cm (Externa)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="font-bold uppercase opacity-80">Escala:</span>
              <select
                value={scaleDenominator}
                onChange={(e) => {
                  const nextScale = Number(e.target.value);
                  onUpdateProjectData({
                    ...projectData,
                    sheetSettings: {
                      ...currentSheetSettings,
                      scaleDenominator: nextScale,
                      sheetScaleText: formatScale(nextScale),
                    },
                  });
                }}
                className="bg-white border border-[#141414] px-2 py-1 text-xs font-bold cursor-pointer"
              >
                {!isSupportedDrawingScale(scaleDenominator) && (
                  <option value={scaleDenominator}>{formatScale(scaleDenominator)} (legado)</option>
                )}
                {SUPPORTED_DRAWING_SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    {formatScale(scale)}
                  </option>
                ))}
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

            <div className="flex items-center border border-[#141414] bg-white" title="Zoom da visualização — não altera a escala técnica">
              <button
                onClick={() => zoomViewport(1 / 1.15)}
                className="px-2 py-1 hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
                title="Diminuir zoom (Ctrl/Cmd -)"
                aria-label="Diminuir zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[52px] border-x border-[#141414] px-2 py-1 text-center text-xs font-black tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => zoomViewport(1.15)}
                className="px-2 py-1 hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
                title="Aumentar zoom (Ctrl/Cmd +)"
                aria-label="Aumentar zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => fitSheetToViewport(true)}
              className="bg-white border border-[#141414] hover:bg-[#141414] hover:text-white px-2.5 py-1 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Enquadrar toda a folha na área visível sem alterar a escala técnica (Ctrl/Cmd 0)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Enquadrar folha</span>
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

        <div className="flex flex-wrap items-center justify-between gap-2 border border-[#141414] bg-[#141414] text-[#E4E3E0] px-3 py-2 text-[10px] font-bold uppercase">
          <span>Ferramenta: <strong className="text-amber-400">{TOOL_META[activeTool].label}</strong> — {toolStatus}</span>
          <span className="opacity-80">Ctrl/Cmd +/- zoom • Ctrl/Cmd 0 enquadra • Espaço + arrastar move a vista • Esc cancela • Shift seleciona múltiplos / trava parede • V/R/W/D/J/E/C/M</span>
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
                <option value={0.15}>15 cm (Padrão)</option>
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

            <div className="bg-white border border-[#141414] px-2 py-1 font-bold">
              Orientação automática pela parede
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

            <div className="bg-white border border-[#141414] px-2 py-1 font-bold">
              Orientação automática pela parede
            </div>

            <span className="text-[10px] font-bold text-emerald-800">
              * Clique na parede para posicionar a janela com esquadria dupla!
            </span>
          </div>
        )}

        {activeTool === 'add_symbol' && (
          <div className="bg-[#E4E3E0]/60 p-2.5 border border-[#141414] flex flex-wrap items-center gap-4 text-xs">
            <span className="font-black uppercase">Símbolo elétrico:</span>
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
        <div
          ref={canvasViewportRef}
          className={`${showLegend ? 'lg:col-span-3' : 'lg:col-span-4'} border-2 border-[#141414] bg-white p-2 h-[70vh] min-h-[420px] max-h-[720px] overflow-hidden relative select-none`}
        >
          <svg
            ref={canvasRef}
            width="100%"
            height="100%"
            className="bg-[#FAFAFA] font-mono"
            style={{ cursor: isPanning || elementDrag ? 'grabbing' : isSpacePressed ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
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
                <line x1="0" y1="0" x2="0" y2="8" stroke="#64748B" strokeWidth="1.2" />
              </pattern>
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
                  0,0 m (Escala {formatScale(scaleDenominator)})
                </text>
              </g>

              {/* LAYER 1: Unified Wall Core Fills & Masonry Hatching (Merged Cavities) */}
              <g id="unified-wall-cores">
                {/* Solid Core Fill */}
                <g fill="#CBD5E1">
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

                    let p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    let p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    let p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    let p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    const startMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters }
                    );
                    if (startMiter) {
                      p1 = { x: startMiter.positive.x * scalePxPerMeter, y: startMiter.positive.y * scalePxPerMeter };
                      p4 = { x: startMiter.negative.x * scalePxPerMeter, y: startMiter.negative.y * scalePxPerMeter };
                    }
                    const endMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (endMiter) {
                      p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                      p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                    }

                    const startNodeFaces = getMultiNodeEndpointFacePoints(
                      w,
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (startNodeFaces) {
                      p1 = { x: startNodeFaces.positive.x * scalePxPerMeter, y: startNodeFaces.positive.y * scalePxPerMeter };
                      p4 = { x: startNodeFaces.negative.x * scalePxPerMeter, y: startNodeFaces.negative.y * scalePxPerMeter };
                    }
                    const endNodeFaces = getMultiNodeEndpointFacePoints(
                      w,
                      { x: w.x2Meters, y: w.y2Meters }
                    );
                    if (endNodeFaces) {
                      p2 = { x: endNodeFaces.positive.x * scalePxPerMeter, y: endNodeFaces.positive.y * scalePxPerMeter };
                      p3 = { x: endNodeFaces.negative.x * scalePxPerMeter, y: endNodeFaces.negative.y * scalePxPerMeter };
                    }

                    return <path key={`fill-wall-${w.id}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`} />;
                  })}
                </g>

                {/* Masonry Hatching Pattern */}
                <g fill="url(#wallMasonryPattern)" opacity="0.65">
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

                    let p1 = { x: x1 - ux * h + nx * h, y: y1 - uy * h + ny * h };
                    let p2 = { x: x2 + ux * h + nx * h, y: y2 + uy * h + ny * h };
                    let p3 = { x: x2 + ux * h - nx * h, y: y2 + uy * h - ny * h };
                    let p4 = { x: x1 - ux * h - nx * h, y: y1 - uy * h - ny * h };

                    const startMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters }
                    );
                    if (startMiter) {
                      p1 = { x: startMiter.positive.x * scalePxPerMeter, y: startMiter.positive.y * scalePxPerMeter };
                      p4 = { x: startMiter.negative.x * scalePxPerMeter, y: startMiter.negative.y * scalePxPerMeter };
                    }
                    const endMiter = getCustomWallEndpointMiter(
                      w,
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (endMiter) {
                      p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                      p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                    }

                    const startNodeFaces = getMultiNodeEndpointFacePoints(
                      w,
                      { x: w.x1Meters, y: w.y1Meters }
                    );
                    if (startNodeFaces) {
                      p1 = { x: startNodeFaces.positive.x * scalePxPerMeter, y: startNodeFaces.positive.y * scalePxPerMeter };
                      p4 = { x: startNodeFaces.negative.x * scalePxPerMeter, y: startNodeFaces.negative.y * scalePxPerMeter };
                    }
                    const endNodeFaces = getMultiNodeEndpointFacePoints(
                      w,
                      { x: w.x2Meters, y: w.y2Meters }
                    );
                    if (endNodeFaces) {
                      p2 = { x: endNodeFaces.positive.x * scalePxPerMeter, y: endNodeFaces.positive.y * scalePxPerMeter };
                      p3 = { x: endNodeFaces.negative.x * scalePxPerMeter, y: endNodeFaces.negative.y * scalePxPerMeter };
                    }

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
                      fillOpacity="0.22"
                    />
                  );
                })}
              </g>
              {/* LAYER 3: Continuous Technical Wall Outlines */}
              <g id="continuous-wall-outlines" fill="none" stroke="#141414" strokeLinejoin="miter">
                {/* Room walls keep complete outer and inner black contours. */}
                {roomsWithGeometry.map((room) => {
                  const rx = room.x! * scalePxPerMeter;
                  const ry = room.y! * scalePxPerMeter;
                  const rw = room.widthMeters! * scalePxPerMeter;
                  const rh = room.heightMeters! * scalePxPerMeter;
                  const wallPx = wallThicknessMeters * scalePxPerMeter;
                  const isSelected = selectedRoomIds.includes(room.id);
                  const strokeWidth = isSelected ? 3.5 : 2;

                  return (
                    <g key={`outline-room-${room.id}`} strokeWidth={strokeWidth}>
                      <rect x={rx} y={ry} width={rw} height={rh} />
                      {rw > wallPx * 2 && rh > wallPx * 2 && (
                        <rect
                          x={rx + wallPx}
                          y={ry + wallPx}
                          width={rw - wallPx * 2}
                          height={rh - wallPx * 2}
                        />
                      )}
                    </g>
                  );
                })}
                {/* Architectural T/L junctions with room walls: erase ONLY the contacted host
                    face in the exact projected width of the incoming wall. The opposite host
                    face stays continuous, matching conventional floor-plan drafting. */}
                {floorPlanWalls.flatMap((w) => {
                  const thickPx = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const wallDx = w.x2Meters - w.x1Meters;
                  const wallDy = w.y2Meters - w.y1Meters;
                  const wallLength = Math.hypot(wallDx, wallDy);
                  if (wallLength < 1e-9) return [];

                  const makeSeamCut = (
                    point: { x: number; y: number },
                    otherPoint: { x: number; y: number },
                    endpointKey: string
                  ) => {
                    const connection = getRoomWallEndpointConnection(w, point, otherPoint);
                    if (!connection || connection.face === 'axis') return null;

                    const ux = wallDx / wallLength;
                    const uy = wallDy / wallLength;
                    const normalComponent =
                      connection.side === 'top' || connection.side === 'bottom'
                        ? Math.abs(uy)
                        : Math.abs(ux);
                    const halfGap = thickPx / (2 * Math.max(0.25, normalComponent));
                    const tx = connection.side === 'top' || connection.side === 'bottom' ? 1 : 0;
                    const ty = connection.side === 'left' || connection.side === 'right' ? 1 : 0;
                    const cx = connection.x * scalePxPerMeter;
                    const cy = connection.y * scalePxPerMeter;

                    return (
                      <g key={`room-junction-cut-${w.id}-${endpointKey}`} strokeLinecap="butt" pointerEvents="none">
                        <line
                          x1={cx - tx * halfGap}
                          y1={cy - ty * halfGap}
                          x2={cx + tx * halfGap}
                          y2={cy + ty * halfGap}
                          stroke="#CBD5E1"
                          strokeWidth="4"
                        />
                      </g>
                    );
                  };

                  return [
                    makeSeamCut(
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters },
                      'start'
                    ),
                    makeSeamCut(
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters },
                      'end'
                    ),
                  ];
                })}

                {/* Custom walls always draw both faces. End caps disappear only at real wall connections. */}
                {floorPlanWalls.map((w) => {
                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const thick = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const isSelected = selectedWallIds.includes(w.id);
                  const strokeWidth = isSelected ? 3.5 : 2;

                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return null;

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const h = thick / 2;

                  const startPoint = { x: w.x1Meters, y: w.y1Meters };
                  const endPoint = { x: w.x2Meters, y: w.y2Meters };
                  const startRoomConnection = getRoomWallEndpointConnection(w, startPoint, endPoint);
                  const endRoomConnection = getRoomWallEndpointConnection(w, endPoint, startPoint);
                  const startCustomConnection = startRoomConnection
                    ? null
                    : getCustomWallEndpointConnection(w, startPoint, endPoint);
                  const endCustomConnection = endRoomConnection
                    ? null
                    : getCustomWallEndpointConnection(w, endPoint, startPoint);
                  const startConnected = Boolean(startRoomConnection || startCustomConnection);
                  const endConnected = Boolean(endRoomConnection || endCustomConnection);
                  const startCustomIsT = Boolean(
                    startCustomConnection?.kind === 'segment' && startCustomConnection.face !== 'axis'
                  );
                  const endCustomIsT = Boolean(
                    endCustomConnection?.kind === 'segment' && endCustomConnection.face !== 'axis'
                  );

                  const startNodeTopology = getEndpointNodeTopology(startPoint);
                  const endNodeTopology = getEndpointNodeTopology(endPoint);
                  const startIsMultiNode = Boolean(startNodeTopology && startNodeTopology.branches.length >= 3);
                  const endIsMultiNode = Boolean(endNodeTopology && endNodeTopology.branches.length >= 3);

                  // Room connections and custom T junctions terminate on a physical face.
                  // A multi-branch endpoint is solved by node topology below; only a true
                  // two-branch axis node keeps the legacy half-thickness extension/miter path.
                  const startExtension = startCustomConnection && !startCustomIsT && !startIsMultiNode ? h : 0;
                  const endExtension = endCustomConnection && !endCustomIsT && !endIsMultiNode ? h : 0;
                  let p1 = { x: x1 - ux * startExtension + nx * h, y: y1 - uy * startExtension + ny * h };
                  let p2 = { x: x2 + ux * endExtension + nx * h, y: y2 + uy * endExtension + ny * h };
                  let p3 = { x: x2 + ux * endExtension - nx * h, y: y2 + uy * endExtension - ny * h };
                  let p4 = { x: x1 - ux * startExtension - nx * h, y: y1 - uy * startExtension - ny * h };

                  const startMiter = getCustomWallEndpointMiter(w, startPoint, endPoint);
                  if (startMiter) {
                    p1 = { x: startMiter.positive.x * scalePxPerMeter, y: startMiter.positive.y * scalePxPerMeter };
                    p4 = { x: startMiter.negative.x * scalePxPerMeter, y: startMiter.negative.y * scalePxPerMeter };
                  }
                  const endMiter = getCustomWallEndpointMiter(w, endPoint, startPoint);
                  if (endMiter) {
                    p2 = { x: endMiter.positive.x * scalePxPerMeter, y: endMiter.positive.y * scalePxPerMeter };
                    p3 = { x: endMiter.negative.x * scalePxPerMeter, y: endMiter.negative.y * scalePxPerMeter };
                  }

                  const startNodeFaces = getMultiNodeEndpointFacePoints(w, startPoint);
                  if (startNodeFaces) {
                    p1 = { x: startNodeFaces.positive.x * scalePxPerMeter, y: startNodeFaces.positive.y * scalePxPerMeter };
                    p4 = { x: startNodeFaces.negative.x * scalePxPerMeter, y: startNodeFaces.negative.y * scalePxPerMeter };
                  }
                  const endNodeFaces = getMultiNodeEndpointFacePoints(w, endPoint);
                  if (endNodeFaces) {
                    p2 = { x: endNodeFaces.positive.x * scalePxPerMeter, y: endNodeFaces.positive.y * scalePxPerMeter };
                    p3 = { x: endNodeFaces.negative.x * scalePxPerMeter, y: endNodeFaces.negative.y * scalePxPerMeter };
                  }

                  // For angled custom T junctions, trim each branch face by an exact line-line
                  // intersection with the host face instead of using a perpendicular end cap.
                  const wallHalfMeters = (w.thicknessMeters || wallThicknessMeters) / 2;
                  const intersectHostFace = (
                    center: { x: number; y: number },
                    normalSign: 1 | -1,
                    connection: CustomWallSnapTarget
                  ) => {
                    const sideOrigin = {
                      x: center.x + nx * wallHalfMeters * normalSign,
                      y: center.y + ny * wallHalfMeters * normalSign,
                    };
                    const cross = ux * connection.hostUy - uy * connection.hostUx;
                    if (Math.abs(cross) < 1e-6) {
                      return { x: sideOrigin.x * scalePxPerMeter, y: sideOrigin.y * scalePxPerMeter };
                    }
                    const relX = connection.x - sideOrigin.x;
                    const relY = connection.y - sideOrigin.y;
                    const t = (relX * connection.hostUy - relY * connection.hostUx) / cross;
                    return {
                      x: (sideOrigin.x + ux * t) * scalePxPerMeter,
                      y: (sideOrigin.y + uy * t) * scalePxPerMeter,
                    };
                  };

                  if (startCustomIsT && startCustomConnection) {
                    p1 = intersectHostFace(startPoint, 1, startCustomConnection);
                    p4 = intersectHostFace(startPoint, -1, startCustomConnection);
                  }
                  if (endCustomIsT && endCustomConnection) {
                    p2 = intersectHostFace(endPoint, 1, endCustomConnection);
                    p3 = intersectHostFace(endPoint, -1, endCustomConnection);
                  }

                  return (
                    <g key={`outline-wall-${w.id}`} strokeWidth={strokeWidth} strokeLinecap="square">
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
                      <line x1={p4.x} y1={p4.y} x2={p3.x} y2={p3.y} />
                      {!startConnected && <line x1={p1.x} y1={p1.y} x2={p4.x} y2={p4.y} />}
                      {!endConnected && <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} />}
                    </g>
                  );
                })}
                {/* Custom-wall T junctions: cut only the contacted host face after all
                    custom outlines, then redraw the two incoming branch faces on top. */}
                {floorPlanWalls.flatMap((w) => {
                  const x1 = w.x1Meters * scalePxPerMeter;
                  const y1 = w.y1Meters * scalePxPerMeter;
                  const x2 = w.x2Meters * scalePxPerMeter;
                  const y2 = w.y2Meters * scalePxPerMeter;
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const lengthPx = Math.hypot(dx, dy);
                  if (lengthPx < 0.1) return [];

                  const ux = dx / lengthPx;
                  const uy = dy / lengthPx;
                  const nx = -uy;
                  const ny = ux;
                  const thickPx = (w.thicknessMeters || wallThicknessMeters) * scalePxPerMeter;
                  const halfMeters = (w.thicknessMeters || wallThicknessMeters) / 2;
                  const strokeWidth = selectedWallIds.includes(w.id) ? 3.5 : 2;

                  const makeCustomSeam = (
                    point: { x: number; y: number },
                    otherPoint: { x: number; y: number },
                    endpointKey: 'start' | 'end'
                  ) => {
                    const connection = getCustomWallEndpointConnection(w, point, otherPoint);
                    if (
                      !connection ||
                      connection.kind !== 'segment' ||
                      connection.face === 'axis'
                    ) {
                      return null;
                    }

                    const normalComponent = Math.abs(
                      ux * connection.hostNx + uy * connection.hostNy
                    );
                    const halfGap = thickPx / (2 * Math.max(0.25, normalComponent));
                    const cx = connection.x * scalePxPerMeter;
                    const cy = connection.y * scalePxPerMeter;
                    const touchLength = Math.min(lengthPx, Math.max(thickPx, 10));
                    const inwardSign = endpointKey === 'start' ? 1 : -1;

                    const branchFaceIntersection = (normalSign: 1 | -1) => {
                      const sideOrigin = {
                        x: point.x + nx * halfMeters * normalSign,
                        y: point.y + ny * halfMeters * normalSign,
                      };
                      const cross = ux * connection.hostUy - uy * connection.hostUx;
                      if (Math.abs(cross) < 1e-6) {
                        return {
                          x: sideOrigin.x * scalePxPerMeter,
                          y: sideOrigin.y * scalePxPerMeter,
                        };
                      }
                      const relX = connection.x - sideOrigin.x;
                      const relY = connection.y - sideOrigin.y;
                      const t = (relX * connection.hostUy - relY * connection.hostUx) / cross;
                      return {
                        x: (sideOrigin.x + ux * t) * scalePxPerMeter,
                        y: (sideOrigin.y + uy * t) * scalePxPerMeter,
                      };
                    };

                    const faceA = branchFaceIntersection(1);
                    const faceB = branchFaceIntersection(-1);

                    return (
                      <g key={`custom-t-seam-${w.id}-${endpointKey}`} pointerEvents="none">
                        <line
                          x1={cx - connection.hostUx * halfGap}
                          y1={cy - connection.hostUy * halfGap}
                          x2={cx + connection.hostUx * halfGap}
                          y2={cy + connection.hostUy * halfGap}
                          stroke="#CBD5E1"
                          strokeWidth="4"
                          strokeLinecap="butt"
                        />
                        <line
                          x1={faceA.x}
                          y1={faceA.y}
                          x2={faceA.x + ux * inwardSign * touchLength}
                          y2={faceA.y + uy * inwardSign * touchLength}
                          stroke="#141414"
                          strokeWidth={strokeWidth}
                          strokeLinecap="square"
                        />
                        <line
                          x1={faceB.x}
                          y1={faceB.y}
                          x2={faceB.x + ux * inwardSign * touchLength}
                          y2={faceB.y + uy * inwardSign * touchLength}
                          stroke="#141414"
                          strokeWidth={strokeWidth}
                          strokeLinecap="square"
                        />
                      </g>
                    );
                  };

                  return [
                    makeCustomSeam(
                      { x: w.x1Meters, y: w.y1Meters },
                      { x: w.x2Meters, y: w.y2Meters },
                      'start'
                    ),
                    makeCustomSeam(
                      { x: w.x2Meters, y: w.y2Meters },
                      { x: w.x1Meters, y: w.y1Meters },
                      'end'
                    ),
                  ];
                })}

                {/* Shared endpoint nodes: one topology owns the final visible junction.
                    This is what allows a two-branch L to become a clean three-branch T
                    simply by pulling a third wall from the same exact node. */}
                {getUniqueCustomEndpointNodeTopologies().flatMap((topology, nodeIndex) => {
                  if (topology.kind === 'T' && topology.stem && topology.throughPairs[0]) {
                    const hostPair = topology.throughPairs[0];
                    const hostUx = hostPair[0].awayUx;
                    const hostUy = hostPair[0].awayUy;
                    const hostNx = -hostUy;
                    const hostNy = hostUx;
                    const hostHalfMeters = Math.max(hostPair[0].halfMeters, hostPair[1].halfMeters);
                    const stem = topology.stem;
                    const stemSide = stem.awayUx * hostNx + stem.awayUy * hostNy >= 0 ? 1 : -1;
                    const cx = (topology.point.x + hostNx * hostHalfMeters * stemSide) * scalePxPerMeter;
                    const cy = (topology.point.y + hostNy * hostHalfMeters * stemSide) * scalePxPerMeter;
                    const normalComponent = Math.abs(stem.awayUx * hostNx + stem.awayUy * hostNy);
                    const halfGap = stem.halfMeters * scalePxPerMeter / Math.max(0.25, normalComponent);
                    const stemFaces = getMultiNodeEndpointFacePoints(stem.wall, topology.point);
                    const touchLength = Math.max(10, stem.halfMeters * 2 * scalePxPerMeter);
                    const strokeWidth = selectedWallIds.includes(stem.wallId) ? 3.5 : 2;

                    const result: React.ReactNode[] = [
                      <line
                        key={`endpoint-t-cut-${nodeIndex}`}
                        x1={cx - hostUx * halfGap}
                        y1={cy - hostUy * halfGap}
                        x2={cx + hostUx * halfGap}
                        y2={cy + hostUy * halfGap}
                        stroke="#CBD5E1"
                        strokeWidth="4"
                        strokeLinecap="butt"
                        pointerEvents="none"
                      />,
                    ];

                    if (stemFaces) {
                      for (const [faceKey, face] of [
                        ['positive', stemFaces.positive],
                        ['negative', stemFaces.negative],
                      ] as const) {
                        result.push(
                          <line
                            key={`endpoint-t-stem-${nodeIndex}-${faceKey}`}
                            x1={face.x * scalePxPerMeter}
                            y1={face.y * scalePxPerMeter}
                            x2={(face.x + stem.awayUx * (touchLength / scalePxPerMeter)) * scalePxPerMeter}
                            y2={(face.y + stem.awayUy * (touchLength / scalePxPerMeter)) * scalePxPerMeter}
                            stroke="#141414"
                            strokeWidth={strokeWidth}
                            strokeLinecap="square"
                            pointerEvents="none"
                          />
                        );
                      }
                    }
                    return result;
                  }

                  if (topology.kind === 'X' && topology.throughPairs.length === 2) {
                    const cuts: React.ReactNode[] = [];
                    topology.throughPairs.forEach((hostPair, pairIndex) => {
                      const otherPair = topology.throughPairs[1 - pairIndex];
                      const hostUx = hostPair[0].awayUx;
                      const hostUy = hostPair[0].awayUy;
                      const hostNx = -hostUy;
                      const hostNy = hostUx;
                      const hostHalf = Math.max(hostPair[0].halfMeters, hostPair[1].halfMeters);
                      const crossingHalf = Math.max(otherPair[0].halfMeters, otherPair[1].halfMeters);
                      const crossingUx = otherPair[0].awayUx;
                      const crossingUy = otherPair[0].awayUy;
                      const normalComponent = Math.abs(crossingUx * hostNx + crossingUy * hostNy);
                      const halfGap = crossingHalf * scalePxPerMeter / Math.max(0.25, normalComponent);

                      for (const side of [-1, 1] as const) {
                        const cx = (topology.point.x + hostNx * hostHalf * side) * scalePxPerMeter;
                        const cy = (topology.point.y + hostNy * hostHalf * side) * scalePxPerMeter;
                        cuts.push(
                          <line
                            key={`endpoint-x-cut-${nodeIndex}-${pairIndex}-${side}`}
                            x1={cx - hostUx * halfGap}
                            y1={cy - hostUy * halfGap}
                            x2={cx + hostUx * halfGap}
                            y2={cy + hostUy * halfGap}
                            stroke="#CBD5E1"
                            strokeWidth="4"
                            strokeLinecap="butt"
                            pointerEvents="none"
                          />
                        );
                      }
                    });
                    return cuts;
                  }

                  return [];
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
                    onMouseDown={(e) => startElementDrag('room', room.id, e)}
                    className="cursor-grab active:cursor-grabbing"
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

              {/* Pull grips for exact L nodes. Selecting the grip is explicit node intent;
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
                    onMouseDown={(e) => startElementDrag('wall', w.id, e)}
                    className="cursor-grab active:cursor-grabbing"
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
                            beginHistoryTransaction();
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
                            beginHistoryTransaction();
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
                const previewWall = normalizeWallConnections({
                  id: '__preview_wall__',
                  x1Meters: wallStartPos.x,
                  y1Meters: wallStartPos.y,
                  x2Meters: wallCurrentPos.x,
                  y2Meters: wallCurrentPos.y,
                  thicknessMeters: wallThicknessMeters,
                  label: '',
                });
                const x1 = previewWall.x1Meters * scalePxPerMeter;
                const y1 = previewWall.y1Meters * scalePxPerMeter;
                const x2 = previewWall.x2Meters * scalePxPerMeter;
                const y2 = previewWall.y2Meters * scalePxPerMeter;
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
