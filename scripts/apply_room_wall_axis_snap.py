from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

old = """    const snapRange = 0.35; // 35 cm snap radius
    let minDistance = snapRange;

    // 2. Snap to the real center axes of room masonry.
"""
new = """    const snapRange = 0.35; // 35 cm snap radius
    let minDistance = snapRange;
    // Compare every candidate against one stable cursor probe. x/y are mutated when
    // a candidate wins, so reusing them would bias subsequent candidates near corners.
    const snapProbe = { x, y };

    // 2. Snap to the real center axes of room masonry.
"""
if old not in text:
    raise SystemExit('snap probe anchor not found')
text = text.replace(old, new, 1)

text = text.replace(
    "const d = Math.hypot(x - corner.x, y - corner.y);",
    "const d = Math.hypot(snapProbe.x - corner.x, snapProbe.y - corner.y);",
    1,
)
text = text.replace(
    """      const projection = projectToSegment(
        { x, y },
        segment.start,
        segment.end
      );""",
    """      const projection = projectToSegment(
        snapProbe,
        segment.start,
        segment.end
      );""",
    1,
)
text = text.replace(
    "const d = Math.hypot(x - ep.x, y - ep.y);",
    "const d = Math.hypot(snapProbe.x - ep.x, snapProbe.y - ep.y);",
    1,
)
text = text.replace(
    "Math.abs(x - w.x1Meters) < minDistance",
    "Math.abs(snapProbe.x - w.x1Meters) < minDistance",
    1,
)
text = text.replace(
    "Math.abs(y - w.y1Meters) < minDistance",
    "Math.abs(snapProbe.y - w.y1Meters) < minDistance",
    1,
)

path.write_text(text)
print('Stabilized competing wall snap candidates')
