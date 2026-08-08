from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()

replacements = [
    ('<line x1="0" y1="0" x2="0" y2="8" stroke="#A1A1AA" strokeWidth="1" />',
     '<line x1="0" y1="0" x2="0" y2="8" stroke="#64748B" strokeWidth="1.2" />',
     'darken masonry hatch'),
    ('<g fill="#E4E4E7">', '<g fill="#CBD5E1">', 'darken wall core fill'),
    ('<g fill="url(#wallMasonryPattern)" opacity="0.4">',
     '<g fill="url(#wallMasonryPattern)" opacity="0.65">',
     'increase wall hatch opacity'),
    ('fillOpacity="0.35"', 'fillOpacity="0.22"', 'lighten room interior fill'),
]

for old, new, label in replacements:
    if old not in text:
        raise SystemExit(f'Pattern not found: {label}')
    text = text.replace(old, new, 1)
    print(f'{label}: ok')

path.write_text(text)
print('Wall contrast refactor applied.')
