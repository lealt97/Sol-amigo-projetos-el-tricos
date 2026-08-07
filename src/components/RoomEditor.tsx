import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Zap,
  Info,
  Building,
  Flame,
} from 'lucide-react';
import { Room, RoomType, SpecialLoad } from '../types';
import {
  calculateRoomLightingVA,
  calculateRoomTugs,
} from '../utils/nbr5410Engine';

interface RoomEditorProps {
  rooms: Room[];
  specialLoads: SpecialLoad[];
  onAddRoom: (room: Room) => void;
  onUpdateRoom: (room: Room) => void;
  onDeleteRoom: (roomId: string) => void;
  onAddSpecialLoad: (load: SpecialLoad) => void;
  onUpdateSpecialLoad: (load: SpecialLoad) => void;
  onDeleteSpecialLoad: (loadId: string) => void;
}

const ROOM_TYPE_OPTIONS: { value: RoomType; label: string; isWetDefault: boolean }[] = [
  { value: 'quarto', label: 'Quarto / Dormitório', isWetDefault: false },
  { value: 'sala', label: 'Sala de Estar / Jantar', isWetDefault: false },
  { value: 'cozinha', label: 'Cozinha / Copa', isWetDefault: true },
  { value: 'banheiro', label: 'Banheiro / Lavabo', isWetDefault: true },
  { value: 'lavanderia', label: 'Lavanderia / Área de Serviço', isWetDefault: true },
  { value: 'corredor', label: 'Corredor / Hall', isWetDefault: false },
  { value: 'varanda', label: 'Varanda / Sacada', isWetDefault: true },
  { value: 'garagem', label: 'Garagem / Depósito', isWetDefault: true },
  { value: 'escritorio', label: 'Escritório / Home Office', isWetDefault: false },
  { value: 'outro', label: 'Outro Cômodo', isWetDefault: false },
];

export const RoomEditor: React.FC<RoomEditorProps> = ({
  rooms,
  specialLoads,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom,
  onAddSpecialLoad,
  onUpdateSpecialLoad,
  onDeleteSpecialLoad,
}) => {
  // New Room Form State
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType>('quarto');
  const [newRoomArea, setNewRoomArea] = useState<number>(12);
  const [newRoomPerimeter, setNewRoomPerimeter] = useState<number>(14);
  const [newRoomIsWet, setNewRoomIsWet] = useState<boolean>(false);

  // New TUE Form State
  const [newTueName, setNewTueName] = useState('');
  const [newTueWatts, setNewTueWatts] = useState<number>(5500);
  const [newTueVoltage, setNewTueVoltage] = useState<number>(220);
  const [newTueRoomId, setNewTueRoomId] = useState<string>('');
  const [newTuePowerFactor, setNewTuePowerFactor] = useState<number>(1.0);

  // Quick TUE Preset buttons
  const quickTuePresets = [
    { name: 'Chuveiro Elétrico', watts: 7500, voltage: 220, pf: 1.0 },
    { name: 'Ar-Condicionado 9.000 BTU', watts: 900, voltage: 220, pf: 0.85 },
    { name: 'Ar-Condicionado 12.000 BTU', watts: 1200, voltage: 220, pf: 0.85 },
    { name: 'Torneira Elétrica Cozinha', watts: 5000, voltage: 220, pf: 1.0 },
    { name: 'Cooktop Indução 4 Bocas', watts: 7200, voltage: 220, pf: 1.0 },
    { name: 'Forno Elétrico Embutir', watts: 3000, voltage: 220, pf: 1.0 },
    { name: 'Secadora de Roupas', watts: 2500, voltage: 220, pf: 1.0 },
    { name: 'Carregador Veículo Elétrico (EV)', watts: 7400, voltage: 220, pf: 0.98 },
  ];

  const handleTypeChange = (type: RoomType) => {
    setNewRoomType(type);
    const opt = ROOM_TYPE_OPTIONS.find((o) => o.value === type);
    if (opt) setNewRoomIsWet(opt.isWetDefault);
  };

  const handleAreaChange = (val: number) => {
    setNewRoomArea(val);
    // Auto estimate perimeter if area changes: ~ sqrt(area)*4
    if (val > 0) {
      setNewRoomPerimeter(Math.round(Math.sqrt(val) * 4 * 10) / 10);
    }
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    const room: Room = {
      id: `r_${Date.now()}`,
      name: newRoomName.trim(),
      type: newRoomType,
      area: Number(newRoomArea) || 10,
      perimeter: Number(newRoomPerimeter) || 13,
      isWet: newRoomIsWet,
    };

    onAddRoom(room);
    setNewRoomName('');
  };

  const handleCreateTue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTueName.trim()) return;

    const tue: SpecialLoad = {
      id: `tue_${Date.now()}`,
      name: newTueName.trim(),
      powerWatts: Number(newTueWatts) || 2000,
      voltage: Number(newTueVoltage) || 220,
      roomId: newTueRoomId || undefined,
      powerFactor: Number(newTuePowerFactor) || 1.0,
      quantity: 1,
    };

    onAddSpecialLoad(tue);
    setNewTueName('');
  };

  return (
    <div className="space-y-6">
      {/* Informative Banner */}
      <div className="border border-[#141414] bg-white p-4 flex items-start gap-3 text-[#141414]">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-[#141414]" />
        <div className="text-xs font-mono space-y-1">
          <p className="font-bold uppercase tracking-wide">
            Seção 1.0 — Previsão de Cargas (ABNT NBR 5410:2004 Item 9.5.2)
          </p>
          <p className="opacity-80 leading-relaxed">
            <strong>Iluminação (9.5.2.1):</strong> 100 VA (primeiros 6 m²) + 60 VA para cada 4 m² inteiros adicionais. | <strong>TUGs (9.5.2.2):</strong> Áreas secas: 1 tomada a cada 5m de perímetro (100 VA). Cozinha/Serviço: 1 a cada 3,5m (600 VA para 3 primeiras + 100 VA demais). Banheiro: 1 tomada 600 VA.
          </p>
        </div>
      </div>

      {/* Grid: Form + List of Rooms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form to Add Room */}
        <div className="border border-[#141414] bg-white/80 p-5 space-y-4">
          <div className="flex items-center gap-2 font-black text-sm uppercase tracking-tight border-b border-[#141414] pb-3">
            <Building className="w-4 h-4 text-[#141414]" />
            <span>Adicionar Novo Cômodo</span>
          </div>

          <form onSubmit={handleCreateRoom} className="space-y-3 font-mono">
            <div>
              <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                Nome do Cômodo
              </label>
              <input
                type="text"
                placeholder="Ex: Cozinha, Suíte Principal, Banheiro"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                required
                className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                Tipo de Dependência
              </label>
              <select
                value={newRoomType}
                onChange={(e) => handleTypeChange(e.target.value as RoomType)}
                className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
              >
                {ROOM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                  Área (m²)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={newRoomArea}
                  onChange={(e) => handleAreaChange(parseFloat(e.target.value))}
                  required
                  className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                  Perímetro (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={newRoomPerimeter}
                  onChange={(e) => setNewRoomPerimeter(parseFloat(e.target.value))}
                  required
                  className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isWetCheck"
                checked={newRoomIsWet}
                onChange={(e) => setNewRoomIsWet(e.target.checked)}
                className="w-4 h-4 border-[#141414] text-[#141414] focus:ring-0 cursor-pointer"
              />
              <label htmlFor="isWetCheck" className="text-xs text-[#141414] font-sans cursor-pointer font-medium">
                Área molhada / sujeita a lavagem (Exige DR 30mA)
              </label>
            </div>

            {/* Calculated Preview box */}
            <div className="border border-[#141414] bg-white p-3 text-[11px] font-mono space-y-1">
              <div className="font-bold uppercase mb-1">
                Cálculo NBR 5410 Estimado:
              </div>
              <div>
                • Iluminação: <strong>{calculateRoomLightingVA(newRoomArea)} VA</strong>
              </div>
              <div>
                • TUGs: <strong>{calculateRoomTugs(newRoomArea, newRoomPerimeter, newRoomType, newRoomIsWet).breakdown}</strong>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#141414] text-[#E4E3E0] hover:bg-black font-mono font-bold uppercase py-2 text-xs flex items-center justify-center gap-2 border border-[#141414] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Cômodo</span>
            </button>
          </form>
        </div>

        {/* Right Column: List of Existing Rooms */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-[#141414] pb-2">
            <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <span>Cômodos Cadastrados</span>
              <span className="text-xs bg-[#141414] text-[#E4E3E0] font-mono font-bold px-2 py-0.5">
                {rooms.length}
              </span>
            </h3>
          </div>

          {rooms.length === 0 ? (
            <div className="border border-[#141414] bg-white/50 p-8 text-center text-xs font-mono opacity-60">
              Nenhum cômodo cadastrado. Preencha o formulário acima ou selecione um modelo no menu superior.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rooms.map((room) => {
                const ilum = calculateRoomLightingVA(room.area);
                const tugs = calculateRoomTugs(room.area, room.perimeter, room.type, room.isWet);

                return (
                  <div
                    key={room.id}
                    className="border border-[#141414] bg-white p-4 space-y-3 hover:bg-[#141414]/5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-tight">
                          {room.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] font-mono opacity-70 mt-0.5">
                          <span>{room.area} m²</span>
                          <span>•</span>
                          <span>{room.perimeter} m perím.</span>
                          {room.isWet && (
                            <span className="bg-red-600 text-white font-bold px-1.5 py-0.2 text-[9px] uppercase">
                              DR MENSAGEM
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteRoom(room.id)}
                        className="text-[#141414] hover:text-red-600 p-1 transition-colors cursor-pointer"
                        title="Excluir cômodo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Load Specifications */}
                    <div className="border border-[#141414]/30 bg-[#E4E3E0]/50 p-2.5 font-mono text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="opacity-70">ILUMINAÇÃO:</span>
                        <span className="font-bold">{ilum} VA</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="opacity-70">TUGS USO GERAL:</span>
                        <span className="font-bold text-[11px]">{tugs.breakdown}</span>
                      </div>
                      <div className="flex justify-between text-[11px] pt-1 border-t border-[#141414]/20 font-bold">
                        <span>TOTAL TUGS VA:</span>
                        <span>{tugs.totalVA} VA</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Special Loads (TUEs - Tomadas de Uso Específico) */}
      <div className="border border-[#141414] bg-white/80 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#141414] pb-3">
          <div className="flex items-center gap-2 font-black text-sm uppercase">
            <Flame className="w-4 h-4 text-[#141414]" />
            <span>Cargas Especiais & TUEs (Chuveiro, Ar-Condicionado, Cooktop)</span>
          </div>
          <span className="text-[11px] font-mono opacity-70">
            NBR 5410 item 9.5.3.2: Circuito exclusivo obrigatório para TUE &gt; 10A
          </span>
        </div>

        {/* Quick Presets for TUEs */}
        <div>
          <label className="block text-xs font-mono font-bold uppercase opacity-70 mb-2">
            Modelos de Carga Rápida TUE:
          </label>
          <div className="flex flex-wrap gap-2">
            {quickTuePresets.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setNewTueName(preset.name);
                  setNewTueWatts(preset.watts);
                  setNewTueVoltage(preset.voltage);
                  setNewTuePowerFactor(preset.pf);
                }}
                className="bg-white hover:bg-[#141414] hover:text-[#E4E3E0] border border-[#141414] text-[#141414] text-xs font-mono px-2.5 py-1 transition-colors cursor-pointer"
              >
                + {preset.name} ({preset.watts}W)
              </button>
            ))}
          </div>
        </div>

        {/* Form to Add Special Load */}
        <form onSubmit={handleCreateTue} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end font-mono">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Nome do Equipamento / TUE
            </label>
            <input
              type="text"
              placeholder="Ex: Chuveiro Suíte, Ar Condicionado"
              value={newTueName}
              onChange={(e) => setNewTueName(e.target.value)}
              required
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] placeholder-zinc-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Potência (W)
            </label>
            <input
              type="number"
              step="50"
              value={newTueWatts}
              onChange={(e) => setNewTueWatts(parseFloat(e.target.value))}
              required
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase opacity-70 mb-1">
              Tensão (V)
            </label>
            <select
              value={newTueVoltage}
              onChange={(e) => setNewTueVoltage(Number(e.target.value))}
              className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
            >
              <option value={127}>127 V (F+N)</option>
              <option value={220}>220 V (2F / F+N)</option>
              <option value={380}>380 V (3F)</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              className="w-full bg-[#141414] text-[#E4E3E0] hover:bg-black font-mono font-bold uppercase py-2 text-xs flex items-center justify-center gap-1.5 border border-[#141414] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar TUE</span>
            </button>
          </div>
        </form>

        {/* List of Special Loads */}
        <div className="space-y-2">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider opacity-70">
            TUEs Cadastradas ({specialLoads.length})
          </h4>

          {specialLoads.length === 0 ? (
            <div className="text-xs font-mono opacity-60 p-3 border border-[#141414] bg-white">
              Nenhuma carga especial/TUE cadastrada no momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 font-mono">
              {specialLoads.map((load) => {
                const roomObj = rooms.find((r) => r.id === load.roomId);
                const currentAmps = (load.powerWatts / (load.powerFactor || 1.0)) / load.voltage;

                return (
                  <div
                    key={load.id}
                    className="border border-[#141414] bg-white p-3 space-y-2 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase">
                          {load.name}
                        </div>
                        <div className="text-[11px] opacity-70">
                          {roomObj ? roomObj.name : 'Geral'}
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteSpecialLoad(load.id)}
                        className="text-[#141414] hover:text-red-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#141414]/20 font-bold">
                      <span>{load.powerWatts} W ({load.voltage}V)</span>
                      <span className="opacity-70 text-[11px]">~{currentAmps.toFixed(1)} A</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
