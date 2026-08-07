import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Zap,
  Info,
  RefreshCw,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { Circuit, CircuitType, Room, SpecialLoad, ProjectSettings } from '../types';
import { autoDivideCircuits } from '../utils/nbr5410Engine';

interface CircuitEditorProps {
  circuits: Circuit[];
  rooms: Room[];
  specialLoads: SpecialLoad[];
  settings: ProjectSettings;
  onSetCircuits: (circuits: Circuit[]) => void;
  onUpdateCircuit: (circuit: Circuit) => void;
  onDeleteCircuit: (circuitId: string) => void;
}

export const CircuitEditor: React.FC<CircuitEditorProps> = ({
  circuits,
  rooms,
  specialLoads,
  settings,
  onSetCircuits,
  onUpdateCircuit,
  onDeleteCircuit,
}) => {
  const [newCircuitName, setNewCircuitName] = useState('');
  const [newCircuitType, setNewCircuitType] = useState<CircuitType>('tug');
  const [newCircuitVoltage, setNewCircuitVoltage] = useState<number>(127);
  const [newCircuitPhases, setNewCircuitPhases] = useState<'F+N' | '2F' | '2F+N' | '3F+N'>('F+N');
  const [newCircuitDistance, setNewCircuitDistance] = useState<number>(20);

  const handleAutoDivide = () => {
    const divided = autoDivideCircuits(rooms, specialLoads, settings);
    onSetCircuits(divided);
  };

  const handleAddCircuit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCircuitName.trim()) return;

    const nextNumber = circuits.length + 1;
    const newCircuit: Circuit = {
      id: `c_${Date.now()}`,
      number: nextNumber,
      name: newCircuitName.trim(),
      type: newCircuitType,
      voltage: newCircuitVoltage,
      phases: newCircuitPhases,
      loads: [
        {
          id: `l_${Date.now()}`,
          loadName: `Carga do Circuito ${nextNumber}`,
          powerVA: 1000,
          powerWatts: 900,
        },
      ],
      distanceMeters: newCircuitDistance,
      circuitsInSameConduit: 3,
      drGroup: newCircuitType === 'tug' || newCircuitType === 'tue' ? 'DR1 - Áreas Molhadas' : 'Geral',
    };

    onSetCircuits([...circuits, newCircuit]);
    setNewCircuitName('');
  };

  return (
    <div className="space-y-6">
      {/* Informative Banner */}
      <div className="border border-[#141414] bg-white p-4 flex flex-wrap items-center justify-between gap-4 text-[#141414]">
        <div className="flex items-start gap-3 max-w-3xl text-xs font-mono">
          <Info className="w-5 h-5 shrink-0 mt-0.5 text-[#141414]" />
          <div className="space-y-1">
            <p className="font-bold uppercase tracking-wide">
              Seção 2.0 — Regras de Divisão de Circuitos (ABNT NBR 5410 Item 9.5.3)
            </p>
            <p className="opacity-80 leading-relaxed">
              1. Iluminação independente de tomadas (9.5.3.1) | 2. Tomadas de cozinha/serviço separadas das áreas secas | 3. TUEs &gt; 10A em circuitos exclusivos (9.5.3.2).
            </p>
          </div>
        </div>

        <button
          onClick={handleAutoDivide}
          className="bg-[#141414] text-[#E4E3E0] hover:bg-black font-mono font-bold uppercase px-4 py-2.5 text-xs flex items-center gap-2 border border-[#141414] transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Auto-Dividir (Norma NBR 5410)</span>
        </button>
      </div>

      {/* Grid: Form to Add Manual Circuit + List of Circuits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form */}
        <div className="border border-[#141414] bg-white/80 p-5 space-y-4">
          <div className="flex items-center gap-2 font-black text-sm uppercase tracking-tight border-b border-[#141414] pb-3">
            <Plus className="w-4 h-4 text-[#141414]" />
            <span>Adicionar Circuito Manual</span>
          </div>

          <form onSubmit={handleAddCircuit} className="space-y-3 font-mono">
            <div>
              <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                Nome / Descrição do Circuito
              </label>
              <input
                type="text"
                placeholder="Ex: TUGs Varanda, Iluminação Garagem"
                value={newCircuitName}
                onChange={(e) => setNewCircuitName(e.target.value)}
                required
                className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] placeholder-zinc-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                  Tipo
                </label>
                <select
                  value={newCircuitType}
                  onChange={(e) => setNewCircuitType(e.target.value as CircuitType)}
                  className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
                >
                  <option value="iluminacao">Iluminação</option>
                  <option value="tug">TUG (Uso Geral)</option>
                  <option value="tue">TUE (Especial)</option>
                  <option value="reserva">Reserva</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                  Tensão (V)
                </label>
                <select
                  value={newCircuitVoltage}
                  onChange={(e) => setNewCircuitVoltage(Number(e.target.value))}
                  className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
                >
                  <option value={127}>127 V</option>
                  <option value={220}>220 V</option>
                  <option value={380}>380 V</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                  Fases
                </label>
                <select
                  value={newCircuitPhases}
                  onChange={(e) => setNewCircuitPhases(e.target.value as any)}
                  className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none cursor-pointer"
                >
                  <option value="F+N">F+N (Monofásico)</option>
                  <option value="2F">2F (Bifásico)</option>
                  <option value="2F+N">2F+N (Bifásico+N)</option>
                  <option value="3F+N">3F+N (Trifásico)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase opacity-70 mb-1">
                  Distância ao QDC (m)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={newCircuitDistance}
                  onChange={(e) => setNewCircuitDistance(Number(e.target.value))}
                  required
                  className="w-full bg-white border border-[#141414] px-3 py-2 text-xs text-[#141414] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] font-mono font-bold uppercase py-2 text-xs flex items-center justify-center gap-1.5 border border-[#141414] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Circuito Customizado</span>
            </button>
          </form>
        </div>

        {/* Right List of Circuits */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-[#141414] pb-2">
            <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <span>Quadro de Circuitos Definidos</span>
              <span className="text-xs bg-[#141414] text-[#E4E3E0] font-mono font-bold px-2 py-0.5">
                {circuits.length}
              </span>
            </h3>
          </div>

          {circuits.length === 0 ? (
            <div className="border border-[#141414] bg-white/50 p-8 text-center text-xs font-mono opacity-60">
              Nenhum circuito definido. Clique em &quot;Auto-Dividir (Norma NBR 5410)&quot; acima para gerar automaticamente.
            </div>
          ) : (
            <div className="space-y-3 font-mono">
              {circuits.map((c) => {
                const totalVA = c.loads.reduce((acc, l) => acc + l.powerVA, 0);
                const currentIb = totalVA / c.voltage;

                return (
                  <div
                    key={c.id}
                    className="border border-[#141414] bg-white p-4 space-y-3 hover:bg-[#141414]/5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#141414] text-[#E4E3E0] font-black flex items-center justify-center text-xs">
                          C{c.number}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold uppercase">
                              {c.name}
                            </h4>
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 bg-[#141414] text-[#E4E3E0]">
                              {c.type}
                            </span>
                          </div>
                          <div className="text-xs opacity-70 flex items-center gap-2 mt-0.5">
                            <span>{c.voltage} V</span>
                            <span>•</span>
                            <span>{c.phases}</span>
                            <span>•</span>
                            <span className="font-bold">
                              {totalVA} VA (~{currentIb.toFixed(1)} A)
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteCircuit(c.id)}
                        className="text-[#141414] hover:text-red-600 p-1 cursor-pointer"
                        title="Excluir circuito"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Loads inside this circuit */}
                    <div className="border border-[#141414]/30 bg-[#E4E3E0]/50 p-2.5 text-xs space-y-1">
                      <div className="text-[10px] font-bold uppercase opacity-60 mb-1">
                        Cargas Conectadas ao Circuito:
                      </div>
                      {c.loads.map((l, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-0.5 border-b border-[#141414]/10 last:border-0"
                        >
                          <span>{l.loadName}</span>
                          <span className="font-bold text-[11px]">
                            {l.powerVA} VA ({l.powerWatts} W)
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Circuit parameters inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                          Comprimento (m)
                        </label>
                        <input
                          type="number"
                          value={c.distanceMeters || 15}
                          onChange={(e) =>
                            onUpdateCircuit({
                              ...c,
                              distanceMeters: Number(e.target.value),
                            })
                          }
                          className="w-full bg-white border border-[#141414] px-2 py-1 text-xs text-[#141414]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                          Circ. no Eletroduto
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={c.circuitsInSameConduit || 3}
                          onChange={(e) =>
                            onUpdateCircuit({
                              ...c,
                              circuitsInSameConduit: Number(e.target.value),
                            })
                          }
                          className="w-full bg-white border border-[#141414] px-2 py-1 text-xs text-[#141414]"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                          Grupo DR
                        </label>
                        <select
                          value={c.drGroup || 'Geral'}
                          onChange={(e) =>
                            onUpdateCircuit({
                              ...c,
                              drGroup: e.target.value,
                            })
                          }
                          className="w-full bg-white border border-[#141414] px-2 py-1 text-xs text-[#141414] cursor-pointer"
                        >
                          <option value="Geral">Geral (Geral)</option>
                          <option value="DR1 - Áreas Molhadas">
                            DR1 - Áreas Molhadas
                          </option>
                          <option value="DR2 - Cozinha">DR2 - Cozinha</option>
                        </select>
                      </div>
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
