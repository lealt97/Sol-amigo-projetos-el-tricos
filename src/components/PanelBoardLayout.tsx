import React, { useState } from 'react';
import {
  Grid,
  Zap,
  Shield,
  Info,
  Layers,
  Cpu,
} from 'lucide-react';
import { SizedCircuit, CalculationSummary, ProjectData } from '../types';

interface PanelBoardLayoutProps {
  sizedCircuits: SizedCircuit[];
  summary: CalculationSummary;
  projectData: ProjectData;
}

export const PanelBoardLayout: React.FC<PanelBoardLayoutProps> = ({
  sizedCircuits,
  summary,
  projectData,
}) => {
  const [panelCapacity, setPanelCapacity] = useState<number>(24); // 12, 18, 24, 36 DIN

  // Calculate used DIN modules:
  // Main Breaker = summary.mainBreakerPoles (1, 2, or 3 DIN)
  // DPS = 3 or 4 DIN
  // DR = 2 or 4 DIN
  // Branch breakers = sum of c.breakerPoles
  const mainBreakerDin = summary.mainBreakerPoles;
  const dpsDin = summary.recommendedSupplyType === 'trifasico' ? 4 : 3;
  const drDin = summary.recommendedSupplyType === 'trifasico' ? 4 : 2;
  const branchBreakersDin = sizedCircuits.reduce(
    (acc, c) => acc + c.breakerPoles,
    0
  );

  const totalUsedDin = mainBreakerDin + dpsDin + drDin + branchBreakersDin;
  const isOverfilled = totalUsedDin > panelCapacity;

  return (
    <div className="space-y-6 font-mono">
      {/* Top Controls Banner */}
      <div className="border border-[#141414] bg-white p-4 flex flex-wrap items-center justify-between gap-4 text-[#141414]">
        <div className="flex items-center gap-2">
          <Grid className="w-5 h-5 text-[#141414]" />
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight">
              Quadro de Distribuição de Circuitos (QDC) — Layout Físico DIN
            </h3>
            <p className="text-xs opacity-70">
              Arranjo físico de módulos nos trilhos DIN 35mm
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="font-bold uppercase opacity-80">
            Capacidade QDC:
          </label>
          <select
            value={panelCapacity}
            onChange={(e) => setPanelCapacity(Number(e.target.value))}
            className="bg-white border border-[#141414] px-3 py-1.5 text-xs text-[#141414] focus:outline-none cursor-pointer font-bold"
          >
            <option value={12}>12 Módulos DIN</option>
            <option value={18}>18 Módulos DIN</option>
            <option value={24}>24 Módulos DIN (Padrão)</option>
            <option value={36}>36 Módulos DIN (Sobrado / Comercial)</option>
            <option value={48}>48 Módulos DIN</option>
          </select>
        </div>
      </div>

      {/* Occupancy Progress Bar */}
      <div className="border border-[#141414] bg-white p-4 space-y-2 text-[#141414]">
        <div className="flex justify-between text-xs font-bold uppercase">
          <span>
            Ocupação QDC: {totalUsedDin} / {panelCapacity} Módulos DIN
          </span>
          <span
            className={
              isOverfilled
                ? 'text-red-600 font-black'
                : 'text-emerald-700 font-black'
            }
          >
            {Math.round((totalUsedDin / panelCapacity) * 100)}% Ocupado
          </span>
        </div>

        <div className="w-full bg-[#E4E3E0] h-3 overflow-hidden border border-[#141414]">
          <div
            className={`h-full transition-all duration-300 ${
              isOverfilled ? 'bg-red-600' : 'bg-[#141414]'
            }`}
            style={{
              width: `${Math.min(100, (totalUsedDin / panelCapacity) * 100)}%`,
            }}
          />
        </div>

        {isOverfilled && (
          <p className="text-xs text-red-600 font-bold uppercase pt-1">
            ⚠️ Ocupação excede a capacidade. Selecione um quadro de 36 ou 48 Módulos.
          </p>
        )}
      </div>

      {/* Realistic DIN Rail Breaker Box View */}
      <div className="border-2 border-[#141414] bg-white p-6 space-y-6">
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-[#141414] pb-3 text-[#141414] text-xs font-bold">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#141414]" />
            <span className="font-black uppercase tracking-tight">QDC PRINCIPAL — TRILHO DIN</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-[#141414] inline-block" /> Iluminação
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-zinc-600 inline-block" /> TUGs
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-red-600 inline-block" /> TUEs
            </span>
          </div>
        </div>

        {/* Physical Rail Row */}
        <div className="border border-[#141414] bg-[#E4E3E0]/40 p-4 relative min-h-[160px] flex items-center overflow-x-auto">
          {/* Metal DIN Rail Bar in Background */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-8 bg-[#141414]/20 border-y border-[#141414]/40 z-0" />

          {/* Mounted Modules Container */}
          <div className="relative z-10 flex items-center gap-1.5 mx-auto">
            {/* 1. Main Breaker (DJ Geral) */}
            <div
              className="bg-[#141414] text-[#E4E3E0] border-2 border-[#141414] p-2 flex flex-col items-center justify-between h-32"
              style={{ width: `${mainBreakerDin * 32}px` }}
            >
              <span className="text-[10px] font-black uppercase tracking-tighter">
                DJ-GERAL
              </span>
              <div className="w-full bg-white text-[#141414] h-8 border border-[#141414] flex items-center justify-center font-black text-xs">
                {summary.mainBreakerRatingA}A
              </div>
              <span className="text-[9px] opacity-80">{summary.mainBreakerPoles}P Curva C</span>
            </div>

            {/* 2. DPS Protection Module */}
            <div
              className="bg-white text-[#141414] border-2 border-[#141414] p-2 flex flex-col items-center justify-between h-32"
              style={{ width: `${dpsDin * 28}px` }}
            >
              <span className="text-[10px] font-black uppercase tracking-tighter">
                DPS CL. II
              </span>
              <div className="w-full bg-[#141414] text-[#E4E3E0] h-8 flex items-center justify-center font-bold text-xs">
                {summary.generalDpsRating.includes('20') ? '20kA' : '30kA'}
              </div>
              <span className="text-[9px] opacity-70">275V Uc</span>
            </div>

            {/* 3. DR Differential Residual Module */}
            <div
              className="bg-[#141414] text-[#E4E3E0] border-2 border-[#141414] p-2 flex flex-col items-center justify-between h-32"
              style={{ width: `${drDin * 30}px` }}
            >
              <span className="text-[10px] font-black uppercase tracking-tighter">
                DR 30mA
              </span>
              <div className="w-full bg-white text-[#141414] h-8 flex items-center justify-center font-bold text-xs">
                DR Geral
              </div>
              <span className="text-[9px] opacity-80">{summary.mainBreakerRatingA}A AC</span>
            </div>

            {/* Separator spacing */}
            <div className="w-2" />

            {/* 4. Branch Breakers (Disjuntores Parciais) */}
            {sizedCircuits.map((c) => {
              const moduleWidth = c.breakerPoles * 28;
              return (
                <div
                  key={c.id}
                  className="bg-white border-2 border-[#141414] p-1.5 flex flex-col items-center justify-between h-32 text-[#141414]"
                  style={{ width: `${moduleWidth}px` }}
                  title={`${c.name} - ${c.breakerRatingIn}A Curva ${c.breakerCurve}`}
                >
                  <span className="text-[10px] font-black tracking-tight">
                    C{c.number}
                  </span>
                  <div className="w-full bg-[#141414] text-[#E4E3E0] h-7 flex items-center justify-center font-black text-[11px]">
                    {c.breakerRatingIn}A
                  </div>
                  <span className="text-[8px] opacity-80 truncate w-full text-center font-bold">
                    Crv {c.breakerCurve} ({c.finalSection}mm²)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel Footer */}
        <div className="text-[11px] text-[#141414] border border-[#141414] bg-white p-3 space-y-1">
          <div className="font-black uppercase">
            Observações de Montagem do Quadro (NBR 5410 item 6.5.4):
          </div>
          <div>
            • O quadro deve possuir identificação indelével dos circuitos na porta frontal.
          </div>
          <div>
            • Manter barramento de Neutro isolado da carcaça metálica após o dispositivo DR.
          </div>
          <div>
            • Barramento de Proteção PE obrigatoriamente aterrado na haste de aterramento.
          </div>
        </div>
      </div>
    </div>
  );
};
