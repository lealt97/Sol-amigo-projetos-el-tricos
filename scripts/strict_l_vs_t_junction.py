from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

old = """      // True endpoint nodes retain axis semantics. Keep their attraction local so a
      // cursor near the middle of a short wall does not jump to an endpoint.
      const endpointSnapRange = Math.min(maxDistance, Math.max(0.10, half + 0.03));
      const startDistance = Math.hypot(point.x - start.x, point.y - start.y);
      if (startDistance <= endpointSnapRange) {
"""
new = """      // L is allowed only at the exact endpoint node. There is intentionally no
      // endpoint attraction radius: any non-zero distance from the corner must remain
      // eligible for a physical-face T junction. The epsilon only absorbs floating-point noise.
      const endpointNodeEpsilon = 1e-6;
      const startDistance = Math.hypot(point.x - start.x, point.y - start.y);
      if (startDistance <= endpointNodeEpsilon) {
"""
if old not in text:
    raise SystemExit('start endpoint block not found')
text = text.replace(old, new, 1)

old = """      const endDistance = Math.hypot(point.x - end.x, point.y - end.y);
      if (endDistance <= endpointSnapRange) {
"""
new = """      const endDistance = Math.hypot(point.x - end.x, point.y - end.y);
      if (endDistance <= endpointNodeEpsilon) {
"""
if old not in text:
    raise SystemExit('end endpoint block not found')
text = text.replace(old, new, 1)

old = """      const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
      const t = Math.max(0, Math.min(1, rawT));
      const endpointBand = Math.min(0.18, Math.max(0.025, (half + 0.025) / length));
      if (t <= endpointBand || t >= 1 - endpointBand) continue;
"""
new = """      const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
      const t = Math.max(0, Math.min(1, rawT));
      // Do not reserve a near-corner band for L. Only the mathematical endpoint itself
      // is excluded from segment/T classification because it was handled above.
      if (t <= endpointNodeEpsilon || t >= 1 - endpointNodeEpsilon) continue;
"""
if old not in text:
    raise SystemExit('endpoint band block not found')
text = text.replace(old, new, 1)

path.write_text(text)
