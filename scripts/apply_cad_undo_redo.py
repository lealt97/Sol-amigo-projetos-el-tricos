from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f'Could not find {label}')
    text = text.replace(old, new, 1)

# Keep the external project writer separate so every existing editor mutation can
# transparently pass through the local history-aware wrapper below.
replace_once(
"""  onUpdateRooms,\n  onUpdateProjectData,\n}) => {""",
"""  onUpdateRooms,\n  onUpdateProjectData: commitProjectData,\n}) => {""",
'project updater destructuring',
)

history_block = r'''

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
'''

replace_once(
"""  const canvasRef = useRef<SVGSVGElement>(null);\n  const canvasViewportRef = useRef<HTMLDivElement>(null);""",
"""  const canvasRef = useRef<SVGSVGElement>(null);\n  const canvasViewportRef = useRef<HTMLDivElement>(null);""" + history_block,
'history insertion point',
)

# Tool switches/cancellation should roll back a half-finished drag instead of
# leaving an untracked intermediate state.
replace_once(
"""  const activateTool = (tool: ToolMode) => {\n    resetTransientGesture();""",
"""  const activateTool = (tool: ToolMode) => {\n    rollbackHistoryTransaction();\n    resetTransientGesture();""",
'activate tool rollback',
)
replace_once(
"""  const cancelCurrentOperation = () => {\n    resetTransientGesture();""",
"""  const cancelCurrentOperation = () => {\n    rollbackHistoryTransaction();\n    resetTransientGesture();""",
'cancel rollback',
)
replace_once(
"""    resetTransientGesture();\n  };\n\n  // Ensure rooms have geometry coordinates in meters""",
"""    rollbackHistoryTransaction();\n    resetTransientGesture();\n  };\n\n  const undoProjectAction = () => {\n    if (historyTransactionRef.current) {\n      rollbackHistoryTransaction();\n      resetTransientGesture();\n      clearSelections();\n      setToolStatus('Ação atual cancelada e restaurada.');\n      return;\n    }\n\n    const previous = undoStackRef.current[undoStackRef.current.length - 1];\n    if (!previous) {\n      setToolStatus('Nada para desfazer.');\n      return;\n    }\n\n    undoStackRef.current = undoStackRef.current.slice(0, -1);\n    redoStackRef.current = [...redoStackRef.current, cloneProjectSnapshot(projectData)].slice(-HISTORY_LIMIT);\n    commitProjectData(cloneProjectSnapshot(previous));\n    resetTransientGesture();\n    clearSelections();\n    setToolStatus('Ação desfeita • Ctrl/Cmd + Z');\n  };\n\n  const redoProjectAction = () => {\n    if (historyTransactionRef.current) {\n      setToolStatus('Finalize ou cancele a ação atual antes de refazer.');\n      return;\n    }\n\n    const next = redoStackRef.current[redoStackRef.current.length - 1];\n    if (!next) {\n      setToolStatus('Nada para refazer.');\n      return;\n    }\n\n    redoStackRef.current = redoStackRef.current.slice(0, -1);\n    pushUndoSnapshot(projectData);\n    commitProjectData(cloneProjectSnapshot(next));\n    resetTransientGesture();\n    clearSelections();\n    setToolStatus('Ação refeita • Ctrl/Cmd + Shift + Z / Ctrl + Y');\n  };\n\n  // Ensure rooms have geometry coordinates in meters""",
'mouse leave rollback and undo handlers',
)

# Start one history transaction only after Shift multi-selection has been handled.
replace_once(
"""    if (e.shiftKey) {\n      setToolStatus('Seleção múltipla atualizada. Arraste sem Shift para reposicionar.');\n      return;\n    }\n\n    if (kind === 'room') {""",
"""    if (e.shiftKey) {\n      setToolStatus('Seleção múltipla atualizada. Arraste sem Shift para reposicionar.');\n      return;\n    }\n\n    beginHistoryTransaction();\n\n    if (kind === 'room') {""",
'element drag transaction',
)

# Drawing a room or wall is also one user action from mouse-down to mouse-up.
replace_once(
"""    } else if (activeTool === 'draw_room') {\n      setIsDrawingRoom(true);""",
"""    } else if (activeTool === 'draw_room') {\n      beginHistoryTransaction();\n      setIsDrawingRoom(true);""",
'room draw transaction',
)
replace_once(
"""    } else if (activeTool === 'draw_wall') {\n      const snap = getSmartWallCoords(coords, null, e.shiftKey);""",
"""    } else if (activeTool === 'draw_wall') {\n      beginHistoryTransaction();\n      const snap = getSmartWallCoords(coords, null, e.shiftKey);""",
'wall draw transaction',
)

# Wall endpoint handles are continuous edits too. There are exactly two handle setters.
handle_count = text.count("setDraggingWallHandle({ wallId: w.id, handle: 'p1' });") + text.count("setDraggingWallHandle({ wallId: w.id, handle: 'p2' });")
if handle_count != 2:
    raise SystemExit(f'Expected two wall handle setters, found {handle_count}')
text = text.replace(
"setDraggingWallHandle({ wallId: w.id, handle: 'p1' });",
"beginHistoryTransaction();\n                            setDraggingWallHandle({ wallId: w.id, handle: 'p1' });",
)
text = text.replace(
"setDraggingWallHandle({ wallId: w.id, handle: 'p2' });",
"beginHistoryTransaction();\n                            setDraggingWallHandle({ wallId: w.id, handle: 'p2' });",
)

# Finish continuous transactions exactly once in handleMouseUp.
start = text.find('  const handleMouseUp = () => {')
end = text.find('  // Symbol or Conduit click handlers', start)
if start < 0 or end < 0:
    raise SystemExit('Could not isolate handleMouseUp')
segment = text[start:end]
segment = segment.replace(
"""    if (elementDrag) {\n      const movedLabel =""",
"""    if (elementDrag) {\n      finishHistoryTransaction();\n      const movedLabel =""",
1,
)
segment = segment.replace(
"""    if (draggingWallHandle) {\n      setDraggingWallHandle(null);""",
"""    if (draggingWallHandle) {\n      finishHistoryTransaction();\n      setDraggingWallHandle(null);""",
1,
)
# These setters occur once each inside their final drawing branches in this segment.
segment = segment.replace('      setIsDrawingWall(false);', '      finishHistoryTransaction();\n      setIsDrawingWall(false);', 1)
segment = segment.replace('      setIsDrawingRoom(false);', '      finishHistoryTransaction();\n      setIsDrawingRoom(false);', 1)
text = text[:start] + segment + text[end:]

# Ctrl/Cmd+Z should not steal native undo from text fields. Redo follows common
# Figma/desktop conventions as a useful counterpart.
replace_once(
"""      if (isTyping) return;\n\n      if (e.code === 'Space') {""",
"""      if (isTyping) return;\n\n      const hasHistoryModifier = (e.ctrlKey || e.metaKey) && !e.altKey;\n      if (hasHistoryModifier) {\n        const key = e.key.toLowerCase();\n        if (key === 'z') {\n          e.preventDefault();\n          if (e.shiftKey) redoProjectAction();\n          else undoProjectAction();\n          return;\n        }\n        if (key === 'y' && !e.shiftKey) {\n          e.preventDefault();\n          redoProjectAction();\n          return;\n        }\n      }\n\n      if (e.code === 'Space') {""",
'keyboard undo redo shortcuts',
)

path.write_text(text)
print('CAD undo/redo patch applied')
