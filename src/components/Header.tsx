import React from 'react';
import {
  Maximize,
  Download,
  Upload,
  RefreshCw,
  Ruler,
  Layers,
} from 'lucide-react';
import { ProjectData } from '../types';
import {
  PRESET_RESIDENCIAL_PADRAO,
  PRESET_APARTAMENTO_URBANO,
  PRESET_SOBRADO_TRIFASICO,
} from '../data/presets';

interface HeaderProps {
  projectData: ProjectData;
  onLoadPreset: (preset: ProjectData) => void;
  onResetProject: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectData,
  onLoadPreset,
  onResetProject,
  onExportJson,
  onImportJson,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <header className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-[#141414] bg-[#E4E3E0] text-[#141414] sticky top-0 z-30">
      {/* Brand & Identity */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-[#141414] text-[#E4E3E0] flex items-center justify-center font-black">
          <Ruler className="w-6 h-6 stroke-[2.5]" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-2xl font-black tracking-tighter leading-none uppercase flex items-center gap-2">
            <span>PLANTA CAD</span>
            <span className="text-[10px] font-mono font-normal tracking-normal align-top bg-[#141414] text-[#E4E3E0] px-1.5 py-0.5">
              ESCALA MÉTRICA
            </span>
          </h1>
          <p className="text-[10px] uppercase font-bold opacity-70 tracking-wider mt-0.5">
            Editor Interativo de Desenho Arquitetônico e Elétrico
          </p>
        </div>
      </div>

      {/* Technical Readout Metadata */}
      <div className="hidden lg:flex gap-6 text-[11px] font-mono">
        <div className="flex flex-col border-l border-[#141414]/30 pl-4">
          <span className="font-bold">PROJETO: {projectData.settings.projectName || 'NOVA_PLANTA'}</span>
          <span className="opacity-70">ESCALA: {projectData.floorPlan?.scalePixelsPerMeter || 50}px = 1.0m</span>
        </div>
        <div className="flex flex-col border-l border-[#141414]/30 pl-4">
          <span className="text-amber-800 font-bold">
            PRANCHA: FOLHA {projectData.sheetSettings?.format || 'A3'} ({projectData.sheetSettings?.orientation === 'portrait' ? 'RETRATO' : 'PAISAGEM'})
          </span>
          <span className="opacity-70">MARGENS ABNT 25mm / SELO NBR 10582 (175mm)</span>
        </div>
      </div>

      {/* Actions & Presets */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Preset Selector */}
        <div className="relative inline-block">
          <select
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'res_padrao') onLoadPreset(PRESET_RESIDENCIAL_PADRAO);
              if (val === 'ape_urbano') onLoadPreset(PRESET_APARTAMENTO_URBANO);
              if (val === 'sobrado_tri') onLoadPreset(PRESET_SOBRADO_TRIFASICO);
              e.target.value = '';
            }}
            defaultValue=""
            className="bg-white text-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] text-xs font-mono font-bold uppercase px-3 py-1.5 border border-[#141414] focus:outline-none transition-colors cursor-pointer"
          >
            <option value="" disabled>
              [ CARREGAR PLANTA MODELO ]
            </option>
            <option value="res_padrao">
              01. Casa Residencial (110m²)
            </option>
            <option value="ape_urbano">
              02. Apartamento (75m²)
            </option>
            <option value="sobrado_tri">
              03. Sobrado Alto Padrão (220m²)
            </option>
          </select>
        </div>

        {/* Import JSON */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] px-3 py-1.5 border border-[#141414] transition-colors cursor-pointer"
          title="Importar planta salva em arquivo JSON"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Importar</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={onImportJson}
          className="hidden"
        />

        {/* Export JSON */}
        <button
          onClick={onExportJson}
          className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase bg-[#141414] text-[#E4E3E0] hover:bg-black px-3 py-1.5 border border-[#141414] transition-colors cursor-pointer"
          title="Salvar planta em arquivo JSON"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Salvar</span>
        </button>

        {/* Reset Project */}
        <button
          onClick={onResetProject}
          className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase bg-white hover:bg-red-600 hover:text-white text-[#141414] px-2.5 py-1.5 border border-[#141414] transition-colors cursor-pointer"
          title="Nova planta limpa"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Nova</span>
        </button>
      </div>
    </header>
  );
};
