import React from 'react';
import {
  Settings,
  Shield,
  Zap,
  Building2,
  Thermometer,
  Percent,
} from 'lucide-react';
import { ProjectSettings, InstallationMethod, CableType, GroundingSystem } from '../types';
import { BRAZILIAN_CONCESSIONARIAS } from '../data/concessionarias';

interface ParametersFormProps {
  settings: ProjectSettings;
  onUpdateSettings: (settings: ProjectSettings) => void;
}

export const ParametersForm: React.FC<ParametersFormProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const handleChange = (field: keyof ProjectSettings, value: any) => {
    onUpdateSettings({
      ...settings,
      [field]: value,
    });
  };

  const handleConcessionariaChange = (concId: string) => {
    const conc = BRAZILIAN_CONCESSIONARIAS.find((c) => c.id === concId);
    if (!conc) return;

    onUpdateSettings({
      ...settings,
      concessionariaId: concId,
      supplyType: conc.defaultPhaseSystem,
      voltageFaseNeutro: conc.defaultVoltageMono,
      voltageFaseFase: conc.defaultVoltageBi,
    });
  };

  return (
    <div className="space-y-6 font-mono">
      {/* 1. Identification & CREA ART Metadata */}
      <div className="border border-[#141414] bg-white/80 p-5 space-y-4">
        <div className="flex items-center gap-2 font-black text-sm uppercase tracking-tight border-b border-[#141414] pb-3 text-[#141414]">
          <Building2 className="w-4 h-4 text-[#141414]" />
          <span>Identificação do Projeto & Dados do Responsável Técnico (CREA)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Nome do Projeto
            </label>
            <input
              type="text"
              value={settings.projectName}
              onChange={(e) => handleChange('projectName', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Cliente / Proprietário
            </label>
            <input
              type="text"
              value={settings.clientName}
              onChange={(e) => handleChange('clientName', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Engenheiro Responsável (RT)
            </label>
            <input
              type="text"
              value={settings.engineerName}
              onChange={(e) => handleChange('engineerName', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Registro CREA / CFT
            </label>
            <input
              type="text"
              value={settings.creaNumber}
              onChange={(e) => handleChange('creaNumber', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Número da ART / TRT
            </label>
            <input
              type="text"
              value={settings.artNumber}
              onChange={(e) => handleChange('artNumber', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Endereço da Obra
            </label>
            <input
              type="text"
              value={settings.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 2. Utility & Grid Voltage Standards */}
      <div className="border border-[#141414] bg-white/80 p-5 space-y-4">
        <div className="flex items-center gap-2 font-black text-sm uppercase tracking-tight border-b border-[#141414] pb-3 text-[#141414]">
          <Zap className="w-4 h-4 text-[#141414]" />
          <span>Padrão Concessionária de Energia & Tensão de Rede</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Concessionária Local
            </label>
            <select
              value={settings.concessionariaId}
              onChange={(e) => handleConcessionariaChange(e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              {BRAZILIAN_CONCESSIONARIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.state})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Sistema Fornecimento
            </label>
            <select
              value={settings.supplyType}
              onChange={(e) => handleChange('supplyType', e.target.value)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value="monofasico">Monofásico (1F + N)</option>
              <option value="bifasico">Bifásico (2F + N)</option>
              <option value="trifasico">Trifásico (3F + N)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Tensão Fase-Neutro (Vn)
            </label>
            <select
              value={settings.voltageFaseNeutro}
              onChange={(e) => handleChange('voltageFaseNeutro', Number(e.target.value))}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={127}>127 V (SP, RJ, MG, PR, CPFL, CEMIG, LIGHT)</option>
              <option value={220}>220 V (NE, GO, DF, Coelba, Celpe, Equatorial)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Tensão Fase-Fase (Vff)
            </label>
            <select
              value={settings.voltageFaseFase}
              onChange={(e) => handleChange('voltageFaseFase', Number(e.target.value))}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={220}>220 V (F-N = 127V)</option>
              <option value={380}>380 V (F-N = 220V)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. NBR 5410 Installation Parameters */}
      <div className="border border-[#141414] bg-white/80 p-5 space-y-4">
        <div className="flex items-center gap-2 font-black text-sm uppercase tracking-tight border-b border-[#141414] pb-3 text-[#141414]">
          <Settings className="w-4 h-4 text-[#141414]" />
          <span>Parâmetros Ambientais & Métodos de Instalação (NBR 5410)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Método Instalação (Tab 33)
            </label>
            <select
              value={settings.installationMethod}
              onChange={(e) => handleChange('installationMethod', e.target.value as InstallationMethod)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value="B1">B1 (Condutores isolados em alvenaria)</option>
              <option value="B2">B2 (Cabo multipolar sobre parede)</option>
              <option value="A1">A1 (Eletroduto em parede isolante)</option>
              <option value="C">C (Cabos sobre parede)</option>
              <option value="D">D (Eletroduto enterrado)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Isolação do Cabo
            </label>
            <select
              value={settings.cableType}
              onChange={(e) => handleChange('cableType', e.target.value as CableType)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value="PVC">Cobre PVC 70°C 750V (NBR NM 247)</option>
              <option value="HEPR">Cobre HEPR / XLPE 90°C 1kV (NBR 7286)</option>
              <option value="LSZH">Cobre LSZH Halogênios 70°C (NBR 13248)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Temp Ambiente (°C)
            </label>
            <select
              value={settings.ambientTemperature}
              onChange={(e) => handleChange('ambientTemperature', Number(e.target.value))}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={20}>20 °C (Ft = 1.12)</option>
              <option value={25}>25 °C (Ft = 1.06)</option>
              <option value={30}>30 °C (Padrão Ft = 1.00)</option>
              <option value={35}>35 °C (Ft = 0.94)</option>
              <option value={40}>40 °C (Ft = 0.87)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Limite Queda Tensão (ΔV)
            </label>
            <select
              value={settings.maxVoltageDropPower}
              onChange={(e) => {
                const val = Number(e.target.value);
                handleChange('maxVoltageDropLighting', val);
                handleChange('maxVoltageDropPower', val);
              }}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={4}>4 % (Padrão NBR 5410 item 6.2.7)</option>
              <option value={3}>3 % (Exigência circuitos longos)</option>
              <option value={2}>2 % (Aplicações especiais)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Protection & Grounding Scheme */}
      <div className="border border-[#141414] bg-white/80 p-5 space-y-4">
        <div className="flex items-center gap-2 font-black text-sm uppercase tracking-tight border-b border-[#141414] pb-3 text-[#141414]">
          <Shield className="w-4 h-4 text-[#141414]" />
          <span>Aterramento & Proteções DPS e DR (NBR 5410)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Esquema Aterramento
            </label>
            <select
              value={settings.groundingSystem}
              onChange={(e) => handleChange('groundingSystem', e.target.value as GroundingSystem)}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value="TN-S">TN-S (Neutro e PE separados em toda instalação)</option>
              <option value="TN-C">TN-C (PEN combinado &gt;= 10mm²)</option>
              <option value="TT">TT (Eletrodo aterramento independente)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Corrente Nominal DPS (In)
            </label>
            <select
              value={settings.dpsInKa}
              onChange={(e) => handleChange('dpsInKa', Number(e.target.value))}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={15}>15 kA (Zona urbana c/ poucas descargas)</option>
              <option value={20}>20 kA (Recomendado NBR 5410)</option>
              <option value={30}>30 kA (Alta densidade de raios)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Corrente Máxima DPS (Imax)
            </label>
            <select
              value={settings.dpsImaxKa}
              onChange={(e) => handleChange('dpsImaxKa', Number(e.target.value))}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={40}>40 kA (Onda 8/20 µs)</option>
              <option value={45}>45 kA (Padrão QDC)</option>
              <option value={60}>60 kA (Alta capacidade)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
