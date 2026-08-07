import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Printer,
  Zap,
  Info,
} from 'lucide-react';
import { ProjectData, SizedCircuit, CalculationSummary } from '../types';

interface SingleLineDiagramProps {
  projectData: ProjectData;
  sizedCircuits: SizedCircuit[];
  summary: CalculationSummary;
}

export const SingleLineDiagram: React.FC<SingleLineDiagramProps> = ({
  projectData,
  sizedCircuits,
  summary,
}) => {
  const [zoom, setZoom] = useState(1.0);

  const handleZoomIn = () => setZoom((z) => Math.min(2.0, z + 0.15));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, z - 0.15));
  const handleResetZoom = () => setZoom(1.0);

  const svgWidth = Math.max(1000, sizedCircuits.length * 150 + 250);
  const svgHeight = 650;

  return (
    <div className="space-y-4 font-mono">
      {/* Top Banner and Controls */}
      <div className="border border-[#141414] bg-white p-4 flex flex-wrap items-center justify-between gap-4 text-[#141414]">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#141414]" />
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight">
              Diagrama Unifilar Esquemático (ABNT NBR 5444)
            </h3>
            <p className="text-xs opacity-70">
              Barramentos R/S/T, Neutro, PE, Disjuntor Geral, DPS Classe II, DR & Circuitos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1.5 bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] border border-[#141414] cursor-pointer transition-colors"
            title="Reduzir Zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-[#141414] w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] border border-[#141414] cursor-pointer transition-colors"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] border border-[#141414] cursor-pointer transition-colors"
            title="Resetar Zoom"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div className="border border-[#141414] bg-white p-4 overflow-auto max-h-[700px] flex justify-center">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            transition: 'transform 0.15s ease-out',
          }}
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            className="font-mono text-xs select-none bg-white"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Grid background */}
            <defs>
              <pattern
                id="gridPattern"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#141414"
                  strokeOpacity="0.1"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gridPattern)" />

            {/* Title Block */}
            <g transform="translate(20, 20)">
              <text x="0" y="15" fill="#141414" fontWeight="900" fontSize="13">
                DIAGRAMA UNIFILAR ESQUEMÁTICO — QDC GERAL
              </text>
              <text x="0" y="32" fill="#141414" fontSize="10" opacity="0.8">
                {projectData.settings.projectName || 'Residência Unifamiliar'} |
                Alimentador: {summary.feederSectionMm2} mm² | Disj. Geral:{' '}
                {summary.mainBreakerRatingA}A ({summary.recommendedSupplyType.toUpperCase()})
              </text>
            </g>

            {/* 1. Feed Input from Utility */}
            <g transform="translate(100, 80)">
              {/* Utility symbol */}
              <circle cx="0" cy="0" r="16" fill="#141414" stroke="#141414" strokeWidth="2" />
              <text x="-12" y="4" fill="#E4E3E0" fontSize="9" fontWeight="bold">
                CONC
              </text>

              {/* Feeder line to Main Breaker */}
              <line x1="0" y1="16" x2="0" y2="70" stroke="#141414" strokeWidth="3" />
              <text x="10" y="45" fill="#141414" fontSize="10" fontWeight="bold">
                Alimentador Geral {summary.feederSectionMm2}mm²
              </text>

              {/* Main Breaker Box */}
              <rect
                x="-35"
                y="70"
                width="70"
                height="45"
                fill="#141414"
                stroke="#141414"
                strokeWidth="2"
              />
              <text x="-25" y="88" fill="#E4E3E0" fontWeight="bold" fontSize="10">
                DJ-GERAL
              </text>
              <text x="-28" y="104" fill="#E4E3E0" fontSize="10">
                {summary.mainBreakerPoles}P {summary.mainBreakerRatingA}A
              </text>

              {/* Line from Main Breaker to DPS & Busbar */}
              <line x1="0" y1="115" x2="0" y2="160" stroke="#141414" strokeWidth="3" />
            </g>

            {/* 2. DPS Protection Block */}
            <g transform="translate(240, 150)">
              <rect
                x="0"
                y="0"
                width="95"
                height="45"
                fill="#white"
                stroke="#141414"
                strokeWidth="2"
              />
              <text x="8" y="18" fill="#141414" fontWeight="bold" fontSize="10">
                DPS CLASSE II
              </text>
              <text x="8" y="32" fill="#141414" fontSize="9">
                {summary.generalDpsRating.substring(0, 18)}
              </text>
              {/* Connect line to main line */}
              <line x1="-140" y1="45" x2="0" y2="22" stroke="#141414" strokeWidth="1.5" strokeDasharray="3,3" />
            </g>

            {/* 3. Main DR Block */}
            <g transform="translate(100, 240)">
              <rect
                x="-40"
                y="0"
                width="80"
                height="45"
                fill="#141414"
                stroke="#141414"
                strokeWidth="2"
              />
              <text x="-28" y="18" fill="#E4E3E0" fontWeight="bold" fontSize="11">
                DR GERAL
              </text>
              <text x="-30" y="34" fill="#E4E3E0" fontSize="10">
                30mA / {summary.mainBreakerRatingA}A
              </text>

              {/* Line to Busbar */}
              <line x1="0" y1="-40" x2="0" y2="0" stroke="#141414" strokeWidth="3" />
              <line x1="0" y1="45" x2="0" y2="80" stroke="#141414" strokeWidth="3" />
            </g>

            {/* 4. Main Phase Busbar */}
            <g transform="translate(80, 320)">
              {/* Heavy Busbar Line */}
              <line
                x1="0"
                y1="0"
                x2={sizedCircuits.length * 150 + 20}
                y2="0"
                stroke="#141414"
                strokeWidth="6"
                strokeLinecap="square"
              />
              <text x="-60" y="4" fill="#141414" fontWeight="bold" fontSize="10">
                BARRAMENTO
              </text>

              {/* Neutral & Earth Busbars */}
              <line
                x1="0"
                y1="30"
                x2={sizedCircuits.length * 150 + 20}
                y2="30"
                stroke="#141414"
                strokeWidth="3"
                strokeDasharray="6,4"
              />
              <text x="-60" y="34" fill="#141414" fontWeight="bold" fontSize="10">
                BARRA NEUTRO
              </text>

              <line
                x1="0"
                y1="50"
                x2={sizedCircuits.length * 150 + 20}
                y2="50"
                stroke="#141414"
                strokeWidth="3"
              />
              <text x="-60" y="54" fill="#141414" fontWeight="bold" fontSize="10">
                BARRA PE
              </text>
            </g>

            {/* 5. Branch Circuits Vertical Drops */}
            {sizedCircuits.map((c, index) => {
              const xPos = 120 + index * 150;

              return (
                <g key={c.id} transform={`translate(${xPos}, 320)`}>
                  {/* Tap from Phase Busbar */}
                  <line x1="0" y1="0" x2="0" y2="50" stroke="#141414" strokeWidth="2.5" />
                  <circle cx="0" cy="0" r="4" fill="#141414" />

                  {/* Branch Breaker Box */}
                  <rect
                    x="-35"
                    y="50"
                    width="70"
                    height="50"
                    fill="#white"
                    stroke="#141414"
                    strokeWidth="2"
                  />
                  <text x="-25" y="68" fill="#141414" fontWeight="bold" fontSize="11">
                    C{c.number} ({c.breakerPoles}P)
                  </text>
                  <text x="-28" y="84" fill="#141414" fontSize="10" fontWeight="bold">
                    {c.breakerRatingIn}A Curva {c.breakerCurve}
                  </text>

                  {/* Line down to load */}
                  <line x1="0" y1="100" x2="0" y2="170" stroke="#141414" strokeWidth="2" />

                  {/* NBR 5444 Cable symbols (ticks) */}
                  <g transform="translate(0, 130)">
                    {/* Phase tick */}
                    <line x1="-8" y1="-8" x2="8" y2="8" stroke="#141414" strokeWidth="2" />
                    {/* Neutral tick (L shape) */}
                    <line x1="-8" y1="-12" x2="0" y2="-4" stroke="#141414" strokeWidth="2" />
                    <line x1="0" y1="-4" x2="4" y2="-4" stroke="#141414" strokeWidth="2" />
                    {/* Earth tick (T shape) */}
                    <line x1="2" y1="4" x2="10" y2="12" stroke="#141414" strokeWidth="2" />
                    <line x1="6" y1="4" x2="14" y2="12" stroke="#141414" strokeWidth="2" />
                  </g>

                  {/* Cable Annotation */}
                  <text x="12" y="125" fill="#141414" fontSize="10" fontWeight="bold">
                    {c.finalSection}mm²
                  </text>
                  <text x="12" y="140" fill="#141414" fontSize="9" opacity="0.7">
                    ({c.conduitInch})
                  </text>

                  {/* Load Box End */}
                  <rect
                    x="-50"
                    y="170"
                    width="100"
                    height="45"
                    fill="#141414"
                    stroke="#141414"
                    strokeWidth="1"
                  />
                  <text x="-42" y="188" fill="#E4E3E0" fontWeight="bold" fontSize="10">
                    {c.name.length > 14 ? c.name.substring(0, 14) + '...' : c.name}
                  </text>
                  <text x="-42" y="202" fill="#E4E3E0" fontSize="9" opacity="0.8">
                    {c.totalPowerVA} VA ({c.voltage}V)
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
