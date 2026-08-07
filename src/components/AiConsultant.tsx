import React, { useState } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  ShieldAlert,
  FileCheck,
  CheckCircle,
  AlertTriangle,
  Award,
  Loader2,
} from 'lucide-react';
import { ProjectData, SizedCircuit, CalculationSummary } from '../types';

interface AiConsultantProps {
  projectData: ProjectData;
  sizedCircuits: SizedCircuit[];
  summary: CalculationSummary;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AiConsultant: React.FC<AiConsultantProps> = ({
  projectData,
  sizedCircuits,
  summary,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Olá! Sou o **ELETRO-BR**, motor de inteligência técnica especializado em engenharia elétrica e conformidade com as normas ABNT (NBR 5410, 5419, 14039, 16690 e NR-10).\n\nComo posso auxiliar no seu projeto elétrico hoje? Posso realizar uma **Auditoria Completa do Projeto Ativo**, tirar dúvidas normativas ou gerar fundamentações técnicas para a Concessionária/CREA.',
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (promptToSend?: string) => {
    const text = promptToSend || inputPrompt;
    if (!text.trim() || loading) return;

    const newMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, newMsg]);
    if (!promptToSend) setInputPrompt('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          projectContext: {
            settings: projectData.settings,
            roomCount: projectData.rooms.length,
            circuitCount: sizedCircuits.length,
            summary: summary,
            sizedCircuits: sizedCircuits.map((c) => ({
              number: c.number,
              name: c.name,
              type: c.type,
              voltage: c.voltage,
              powerVA: c.totalPowerVA,
              ib: c.designCurrentIb,
              section: c.finalSection,
              breaker: `${c.breakerPoles}P ${c.breakerRatingIn}A Curva ${c.breakerCurve}`,
              voltageDrop: `${c.voltageDropPercent}%`,
              drRequired: c.drRequired,
            })),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro na consulta com o motor de IA.');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Erro na Consulta:** ${err.message || 'Não foi possível conectar ao motor ELETRO-BR.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAuditProject = () => {
    const prompt =
      'Realize uma Auditoria Técnica Normativa completa no meu projeto elétrico atual. Verifique se há descumprimentos da NBR 5410 quanto a queda de tensão, condutores mínimos, DR 30mA nas áreas molhadas, coordenação dos disjuntores, limites do padrão da concessionária e proteção DPS.';
    handleSendMessage(prompt);
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner */}
      <div className="border border-[#141414] bg-white p-5 flex flex-wrap items-center justify-between gap-4 text-[#141414]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] text-[#E4E3E0] flex items-center justify-center font-bold">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <span>ELETRO-BR — Inteligência Técnica ABNT</span>
              <span className="text-[10px] bg-[#141414] text-[#E4E3E0] font-bold px-2 py-0.5">
                CREA / NBR 5410
              </span>
            </h3>
            <p className="text-xs opacity-70">
              Consultoria técnica para NBR 5410, 5419, 14039, 16690 e concessionárias
            </p>
          </div>
        </div>

        {/* Audit Button */}
        <button
          onClick={handleAuditProject}
          disabled={loading}
          className="bg-[#141414] text-[#E4E3E0] hover:bg-black font-mono font-bold uppercase px-4 py-2.5 text-xs flex items-center gap-2 border border-[#141414] transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>Auditar Projeto NBR 5410</span>
        </button>
      </div>

      {/* Chat Messages Container */}
      <div className="border border-[#141414] bg-white/80 p-4 sm:p-6 min-h-[420px] max-h-[550px] overflow-y-auto space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${
              m.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-3xl p-4 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#141414] text-[#E4E3E0] font-medium'
                  : 'bg-[#E4E3E0]/40 border border-[#141414] text-[#141414]'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
            <span className="text-[10px] opacity-60 mt-1 font-bold uppercase px-1">
              {m.role === 'user' ? 'Projetista' : 'ELETRO-BR IA'}
            </span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#141414] bg-[#E4E3E0]/60 p-3 border border-[#141414] w-fit font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Consultando norma ABNT NBR 5410...</span>
          </div>
        )}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          placeholder="Pergunte sobre NBR 5410, disjuntores, condutores ou concessionária..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          disabled={loading}
          className="flex-1 bg-white border border-[#141414] px-4 py-3 text-xs text-[#141414] placeholder-zinc-400 focus:outline-none disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={loading || !inputPrompt.trim()}
          className="bg-[#141414] text-[#E4E3E0] hover:bg-black font-mono font-bold uppercase px-5 py-3 text-xs flex items-center gap-2 border border-[#141414] transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </div>
  );
};
