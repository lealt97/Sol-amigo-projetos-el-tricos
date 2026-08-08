from pathlib import Path

path = Path('src/components/FloorPlanEditor.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    text = text.replace(old, new, 1)
    print(f'{label}: ok')


replace_once(
"""  }, [currentSheetSettings, scalePxPerMeter, showSheetFrame]);

  // Sempre que formato, orientação, escala técnica ou posição da prancha mudar,""",
"""  }, [currentSheetSettings, scalePxPerMeter, showSheetFrame]);

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

  // Sempre que formato, orientação, escala técnica ou posição da prancha mudar,""",
'add centered viewport zoom helper',
)

replace_once(
"""      if (isTyping) return;

      if (e.code === 'Space') {""",
"""      const hasZoomModifier = (e.ctrlKey || e.metaKey) && !e.altKey;
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

      if (e.code === 'Space') {""",
'add ctrl/cmd zoom keyboard shortcuts',
)

replace_once(
"""    scalePxPerMeter,
    gridSnapMeters,
  ]);""",
"""    scalePxPerMeter,
    gridSnapMeters,
    zoomViewport,
    fitSheetToViewport,
  ]);""",
'add zoom callbacks to keyboard effect dependencies',
)

replace_once(
"""            <button
              onClick={() => fitSheetToViewport(true)}
              className="bg-white border border-[#141414] hover:bg-[#141414] hover:text-white px-2.5 py-1 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Enquadrar toda a folha na área visível sem alterar a escala técnica"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Enquadrar folha</span>
            </button>""",
"""            <div className="flex items-center border border-[#141414] bg-white" title="Zoom da visualização — não altera a escala técnica">
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
            </button>""",
'add visible zoom controls',
)

replace_once(
"""          <span className="opacity-80">Arraste elementos com Selecionar • Esc cancela • Espaço + arrastar move a vista • Shift seleciona múltiplos / trava parede • V/R/W/D/J/E/C/M</span>""",
"""          <span className="opacity-80">Ctrl/Cmd +/- zoom • Ctrl/Cmd 0 enquadra • Espaço + arrastar move a vista • Esc cancela • Shift seleciona múltiplos / trava parede • V/R/W/D/J/E/C/M</span>""",
'update CAD shortcut hint',
)

path.write_text(text)
print('Figma-style zoom refactor applied successfully.')
