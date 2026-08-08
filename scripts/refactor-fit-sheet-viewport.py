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
    "import React, { useState, useRef, useMemo, useEffect } from 'react';",
    "import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';",
    'add useCallback import',
)

replace_once(
    """  getScalePxPerMeter,
  getSheetScaleDenominator,
  isSupportedDrawingScale,
} from '../utils/nbrSheetEngine';""",
    """  getScalePxPerMeter,
  getSheetScaleDenominator,
  getSheetSpec,
  isSupportedDrawingScale,
  paperMmToCanvasPx,
} from '../utils/nbrSheetEngine';""",
    'add sheet viewport helpers',
)

replace_once(
    """  const canvasRef = useRef<SVGSVGElement>(null);

  const clearSelections = () => {""",
    """  const canvasRef = useRef<SVGSVGElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);

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

  const clearSelections = () => {""",
    'add fit sheet viewport behavior',
)

replace_once(
    """            </button>

            <button
              onClick={() => setIsExportModalOpen(true)}
              className="bg-[#141414] text-amber-400 hover:bg-amber-400 hover:text-[#141414] border border-[#141414] px-2.5 py-1 text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Configurar Margens e Legenda/Selo NBR 10582"
            >""",
    """            </button>

            <button
              onClick={() => fitSheetToViewport(true)}
              className="bg-white border border-[#141414] hover:bg-[#141414] hover:text-white px-2.5 py-1 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Enquadrar toda a folha na área visível sem alterar a escala técnica"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Enquadrar folha</span>
            </button>

            <button
              onClick={() => setIsExportModalOpen(true)}
              className="bg-[#141414] text-amber-400 hover:bg-amber-400 hover:text-[#141414] border border-[#141414] px-2.5 py-1 text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Configurar Margens e Legenda/Selo NBR 10582"
            >""",
    'add fit sheet button',
)

replace_once(
    """        <div className={`${showLegend ? 'lg:col-span-3' : 'lg:col-span-4'} border-2 border-[#141414] bg-white p-2 overflow-auto max-h-[720px] relative select-none`}>
          <svg
            ref={canvasRef}
            width={1200}
            height={800}""",
    """        <div
          ref={canvasViewportRef}
          className={`${showLegend ? 'lg:col-span-3' : 'lg:col-span-4'} border-2 border-[#141414] bg-white p-2 h-[70vh] min-h-[420px] max-h-[720px] overflow-hidden relative select-none`}
        >
          <svg
            ref={canvasRef}
            width="100%"
            height="100%""" ,
    'make CAD canvas a true viewport',
)

path.write_text(text)
print('FloorPlanEditor sheet-fit refactor applied successfully.')
