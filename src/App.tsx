import React, { useState } from 'react';
import { Ruler, Grid, ChevronRight } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'settings'>('workspace');

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans border-[12px] border-[#141414] selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header Bar */}
      <header className="flex flex-wrap items-center justify-between px-6 py-4 border-b-2 border-[#141414] bg-[#E4E3E0] text-[#141414]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#141414] text-[#E4E3E0] flex items-center justify-center font-black">
            <Ruler className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter leading-none uppercase flex items-center gap-2">
              <span>SISTEMA CAD</span>
              <span className="text-[10px] font-mono font-normal tracking-normal bg-[#141414] text-[#E4E3E0] px-1.5 py-0.5">
                ESTRUTURA DE LAYOUT
              </span>
            </h1>
            <p className="text-[10px] uppercase font-bold opacity-70 tracking-wider mt-0.5">
              Ambiente de Desenvolvimento de Fluxo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-2 border border-[#141414] transition-colors cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-[#141414] text-[#E4E3E0]'
                : 'bg-white text-[#141414] hover:bg-zinc-200'
            }`}
          >
            Área de Trabalho
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 border border-[#141414] transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#141414] text-[#E4E3E0]'
                : 'bg-white text-[#141414] hover:bg-zinc-200'
            }`}
          >
            Configurações
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {activeTab === 'workspace' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[600px]">
            {/* Left Navigation / Tool Sidebar Shell */}
            <aside className="lg:col-span-3 border-2 border-[#141414] bg-white p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b-2 border-[#141414] pb-2">
                  <h2 className="text-xs font-black uppercase font-mono tracking-wider text-[#141414]">
                    PAINEL LATERAL
                  </h2>
                  <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                    Estrutura para ferramentas e parâmetros
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 bg-[#E4E3E0]/50 border border-[#141414] text-xs font-mono font-bold flex items-center justify-between">
                    <span>ETAPA 01</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                  <div className="p-3 bg-[#E4E3E0]/50 border border-[#141414] text-xs font-mono font-bold flex items-center justify-between">
                    <span>ETAPA 02</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                  <div className="p-3 bg-[#E4E3E0]/50 border border-[#141414] text-xs font-mono font-bold flex items-center justify-between">
                    <span>ETAPA 03</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#141414]/20 text-[10px] font-mono text-zinc-500">
                LAYOUT PRONTO PARA O NOVO FLUXO
              </div>
            </aside>

            {/* Main Workspace Canvas Shell */}
            <section className="lg:col-span-9 border-2 border-[#141414] bg-white p-6 flex flex-col items-center justify-center relative min-h-[500px]">
              {/* SVG Background Grid Pattern */}
              <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#141414_1px,transparent_1px)] [background-size:16px_16px]" />

              <div className="relative z-10 text-center max-w-md p-8 border-2 border-[#141414] bg-[#E4E3E0] shadow-[6px_6px_0px_0px_#141414]">
                <div className="w-12 h-12 bg-[#141414] text-amber-400 mx-auto flex items-center justify-center font-black mb-4">
                  <Grid className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black uppercase font-mono tracking-tight text-[#141414]">
                  LAYOUT LIMPO E PRONTO
                </h3>
                <p className="text-xs font-mono text-zinc-700 mt-2 leading-relaxed">
                  O conteúdo anterior foi removido e o estilo de layout técnico foi preservado. Você pode definir o novo fluxo quando desejar.
                </p>
                <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 bg-[#141414] text-white font-mono text-[11px] font-bold uppercase">
                  <span>AGUARDANDO DEFINIÇÃO DE FLUXO</span>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="border-2 border-[#141414] bg-white p-8 space-y-4">
            <h2 className="text-lg font-black uppercase font-mono border-b-2 border-[#141414] pb-2">
              Configurações Gerais
            </h2>
            <p className="text-xs font-mono text-zinc-600">
              Painel de configurações preparado para a integração do seu novo fluxo.
            </p>
          </div>
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="h-10 bg-[#141414] text-[#E4E3E0] flex items-center justify-between px-6 font-mono text-[10px] uppercase border-t border-[#141414]">
        <div>
          STATUS: <span className="text-amber-400 font-bold">ESTRUTURA DE LAYOUT PRONTA</span>
        </div>
        <div className="hidden sm:flex gap-6 text-zinc-400">
          <span>SISTEMA DE DESIGN ATIVO</span>
          <span>© LAYOUT SHELL</span>
        </div>
      </footer>
    </div>
  );
}

