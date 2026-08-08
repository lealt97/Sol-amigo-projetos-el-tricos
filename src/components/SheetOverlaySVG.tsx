import React from 'react';
import { SheetSettings, ProjectSettings } from '../types';
import { getSheetScaleDenominator, getSheetSpec } from '../utils/nbrSheetEngine';

interface SheetOverlaySVGProps {
  sheetSettings: SheetSettings;
  projectSettings: ProjectSettings;
  scalePxPerMeter: number; // e.g. 50
  onUpdateSheetSettings?: (settings: SheetSettings) => void;
  onOpenExportModal?: () => void;
}

export const SheetOverlaySVG: React.FC<SheetOverlaySVGProps> = ({
  sheetSettings,
  projectSettings,
  scalePxPerMeter,
  onUpdateSheetSettings,
  onOpenExportModal,
}) => {
  const spec = getSheetSpec(sheetSettings.format, sheetSettings.orientation);

  // Drawing scale denominator e.g. 50 for 1:50
  const drawingScaleDenom = getSheetScaleDenominator(sheetSettings, 50);

  // Sheet origin in floor plan meters
  const originX = sheetSettings.sheetXPosMeters ?? -0.5;
  const originY = sheetSettings.sheetYPosMeters ?? -0.5;

  // Paper conversion factor: 1 mm in paper space = 2.5 SVG pixels at standard canvas resolution
  // Paper dimensions in SVG canvas pixels
  const paperPxPerMm = 2.5;

  const widthPx = spec.widthMm * paperPxPerMm;
  const heightPx = spec.heightMm * paperPxPerMm;

  const leftMarginPx = spec.leftMarginMm * paperPxPerMm; // 25mm * 2.5 = 62.5px
  const rightMarginPx = spec.rightMarginMm * paperPxPerMm; // 7mm or 10mm * 2.5
  const topMarginPx = spec.topMarginMm * paperPxPerMm;
  const bottomMarginPx = spec.bottomMarginMm * paperPxPerMm;

  // Inner margin rectangle coordinates relative to paper top-left
  const innerLeftPx = leftMarginPx;
  const innerTopPx = topMarginPx;
  const innerWidthPx = widthPx - leftMarginPx - rightMarginPx;
  const innerHeightPx = heightPx - topMarginPx - bottomMarginPx;

  // Title Block (Selo NBR 10582) - 175mm wide
  const titleBlockWidthPx = spec.titleBlockWidthMm * paperPxPerMm; // 175 * 2.5 = 437.5px
  const titleBlockHeightPx = spec.titleBlockHeightMm * paperPxPerMm; // 65 * 2.5 = 162.5px

  const seloX = innerLeftPx + innerWidthPx - titleBlockWidthPx;
  const seloY = innerTopPx + innerHeightPx - titleBlockHeightPx;

  // Position on canvas
  const canvasX = originX * scalePxPerMeter;
  const canvasY = originY * scalePxPerMeter;

  const formattedDate = new Date().toLocaleDateString('pt-BR');

  return (
    <g transform={`translate(${canvasX}, ${canvasY})`} id="nbr-sheet-frame">
      {/* Outer Paper Sheet (Cut Line & Shadow) */}
      <rect
        x="0"
        y="0"
        width={widthPx}
        height={heightPx}
        fill="#FFFFFF"
        fillOpacity="0.85"
        stroke="#71717A"
        strokeWidth="1.5"
        strokeDasharray="6 3"
      />

      {/* Sheet Format Header Label */}
      <g transform="translate(4, -8)">
        <rect
          x="0"
          y="-12"
          width="320"
          height="20"
          fill="#141414"
          rx="2"
        />
        <text
          x="8"
          y="2"
          fill="#FFFFFF"
          fontSize="11"
          fontWeight="bold"
          fontFamily="monospace"
        >
          📄 PRANCHA TÉCNICA: {spec.name.toUpperCase()}
        </text>
      </g>

      {/* Inner Margin Border Line (Quadro interno da prancha) */}
      <rect
        x={innerLeftPx}
        y={innerTopPx}
        width={innerWidthPx}
        height={innerHeightPx}
        fill="none"
        stroke="#141414"
        strokeWidth="3"
      />

      {/* Left margin binding band accent */}
      <rect
        x="0"
        y="0"
        width={leftMarginPx}
        height={heightPx}
        fill="#141414"
        fillOpacity="0.03"
      />

      {/* Folding guide marks along bottom border */}
      {spec.foldMarksMm.map((foldMm, idx) => {
        const foldPx = widthPx - foldMm * paperPxPerMm;
        return (
          <g key={`fold-mark-${idx}`}>
            <line
              x1={foldPx}
              y1={heightPx}
              x2={foldPx}
              y2={heightPx - 10}
              stroke="#A1A1AA"
              strokeWidth="1.5"
            />
          </g>
        );
      })}

      {/* Centering marks */}
      <g stroke="#141414" strokeWidth="2">
        {/* Top Centering Mark */}
        <line x1={widthPx / 2} y1="0" x2={widthPx / 2} y2={topMarginPx + 8} />
        {/* Bottom Centering Mark */}
        <line x1={widthPx / 2} y1={heightPx} x2={widthPx / 2} y2={heightPx - bottomMarginPx - 8} />
        {/* Left Centering Mark */}
        <line x1="0" y1={heightPx / 2} x2={leftMarginPx + 8} y2={heightPx / 2} />
        {/* Right Centering Mark */}
        <line x1={widthPx} y1={heightPx / 2} x2={widthPx - rightMarginPx - 8} y2={heightPx / 2} />
      </g>

      {/* TITLE BLOCK / LEGENDA */}
      {sheetSettings.showTitleBlock && (
        <g transform={`translate(${seloX}, ${seloY})`} id="title-block">
          {/* Main Title Block Background */}
          <rect
            x="0"
            y="0"
            width={titleBlockWidthPx}
            height={titleBlockHeightPx}
            fill="#FFFFFF"
            stroke="#141414"
            strokeWidth="2.5"
          />

          {/* Header Bar */}
          <rect x="0" y="0" width={titleBlockWidthPx} height="28" fill="#141414" />
          <text
            x="12"
            y="18"
            fill="#FFFFFF"
            fontSize="12"
            fontWeight="900"
            fontFamily="sans-serif"
            letterSpacing="0.5"
          >
            PROJETO DE INSTALAÇÕES ELÉTRICAS NBR 5410
          </text>

          {/* Row 1: Project Title */}
          <line x1="0" y1="52" x2={titleBlockWidthPx} y2="52" stroke="#141414" strokeWidth="1.5" />
          <text x="8" y="38" fontSize="8" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            TÍTULO DO PROJETO / MUNICÍPIO:
          </text>
          <text x="8" y="48" fontSize="11" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {(projectSettings.projectName || 'PROJETO ELÉTRICO RESIDENCIAL').toUpperCase()}
          </text>

          {/* Row 2: Client & Address */}
          <line x1="0" y1="84" x2={titleBlockWidthPx} y2="84" stroke="#141414" strokeWidth="1.5" />
          <text x="8" y="62" fontSize="8" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            PROPRIETÁRIO / CLIENTE:
          </text>
          <text x="8" y="72" fontSize="10" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {projectSettings.clientName || 'CLIENTE NÃO INFORMADO'}
          </text>
          <text x="8" y="80" fontSize="8" fill="#52525B" fontFamily="sans-serif">
            {projectSettings.address || 'ENDEREÇO DO IMÓVEL'}
          </text>

          {/* Row 3: Responsável Técnico & CREA / ART */}
          <line x1="0" y1="116" x2={titleBlockWidthPx} y2="116" stroke="#141414" strokeWidth="1.5" />
          <text x="8" y="94" fontSize="8" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            RESPONSÁVEL TÉCNICO / PROJETISTA:
          </text>
          <text x="8" y="104" fontSize="10" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {projectSettings.engineerName || 'ENG. RESPONSÁVEL TÉCNICO'}
          </text>
          <text x="8" y="112" fontSize="8" fill="#52525B" fontFamily="sans-serif">
            CREA/CAU: {projectSettings.creaNumber || '0000000/D'} | ART: {projectSettings.artNumber || '000000'}
          </text>

          {/* Row 4: Sheet Content Description */}
          <line x1="0" y1="138" x2={titleBlockWidthPx} y2="138" stroke="#141414" strokeWidth="1.5" />
          <text x="8" y="125" fontSize="8" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            CONTEÚDO DA PRANCHA:
          </text>
          <text x="8" y="134" fontSize="9.5" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {sheetSettings.sheetTitle || 'PLANTA BAIXA - ARQUITETÔNICO E ILUMINAÇÃO'}
          </text>

          {/* Footer Grid: Escala | Data | Prancha | Formato | Revisão */}
          {/* Vertical dividers in footer */}
          <line x1="85" y1="138" x2="85" y2={titleBlockHeightPx} stroke="#141414" strokeWidth="1.5" />
          <line x1="170" y1="138" x2="170" y2={titleBlockHeightPx} stroke="#141414" strokeWidth="1.5" />
          <line x1="260" y1="138" x2="260" y2={titleBlockHeightPx} stroke="#141414" strokeWidth="1.5" />
          <line x1="350" y1="138" x2="350" y2={titleBlockHeightPx} stroke="#141414" strokeWidth="1.5" />

          {/* Column 1: Escala */}
          <text x="12" y="148" fontSize="7.5" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            ESCALA
          </text>
          <text x="12" y="158" fontSize="11" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {sheetSettings.sheetScaleText || `1:${drawingScaleDenom}`}
          </text>

          {/* Column 2: Data */}
          <text x="92" y="148" fontSize="7.5" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            DATA
          </text>
          <text x="92" y="158" fontSize="10" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {formattedDate}
          </text>

          {/* Column 3: Prancha */}
          <text x="178" y="148" fontSize="7.5" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            PRANCHA
          </text>
          <text x="178" y="158" fontSize="11" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {sheetSettings.sheetNumber || '01/01'}
          </text>

          {/* Column 4: Formato */}
          <text x="268" y="148" fontSize="7.5" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            FORMATO
          </text>
          <text x="268" y="158" fontSize="11" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {sheetSettings.format}
          </text>

          {/* Column 5: Revisão */}
          <text x="358" y="148" fontSize="7.5" fontWeight="bold" fill="#52525B" fontFamily="sans-serif">
            REVISÃO
          </text>
          <text x="358" y="158" fontSize="11" fontWeight="bold" fill="#141414" fontFamily="sans-serif">
            {sheetSettings.revision || 'R00'}
          </text>
        </g>
      )}

      {/* Quick Action Overlay Button on Top Right of Sheet */}
      <g transform={`translate(${widthPx - 180}, 8)`} className="cursor-pointer" onClick={onOpenExportModal}>
        <rect width="172" height="24" fill="#141414" rx="4" />
        <text x="10" y="16" fill="#FFFFFF" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
          ⚙️ CONFIGURAR PRANCHA
        </text>
      </g>
    </g>
  );
};
