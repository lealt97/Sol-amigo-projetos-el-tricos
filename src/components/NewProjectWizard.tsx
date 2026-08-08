import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  House,
  MapPin,
  UserRound,
} from 'lucide-react';
import { NewProjectInput } from '../utils/projectFactory';

interface NewProjectWizardProps {
  onCancel: () => void;
  onCreate: (input: NewProjectInput) => void;
}

const FLOW_STEPS = [
  { number: '01', label: 'Dados do projeto', active: true },
  { number: '02', label: 'Entrada elétrica', active: false },
  { number: '03', label: 'Planta e ambientes', active: false },
  { number: '04', label: 'Dimensionamento', active: false },
];

export const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ onCancel, onCreate }) => {
  const [projectType, setProjectType] = useState<'residencial' | 'comercial'>('residencial');
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const canContinue = useMemo(() => projectName.trim().length >= 3, [projectName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);
    if (!canContinue) return;

    onCreate({
      projectName,
      projectType,
      clientName,
      address,
    });
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-7 md:px-6 lg:px-8">
      <button
        type="button"
        onClick={onCancel}
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-[#0076DD]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para projetos
      </button>

      <section className="overflow-hidden rounded-2xl border border-[#183956]/15 bg-white shadow-sm">
        <div className="border-b border-[#183956]/10 bg-[#F7FAFC] px-5 py-5 md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#0076DD]">
                Novo projeto
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0E2337] md:text-3xl">
                Dados iniciais da obra
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Cadastre somente o essencial agora. Os parâmetros elétricos entram na próxima etapa.
              </p>
            </div>
            <div className="rounded-lg border border-[#64B0F3]/40 bg-[#EAF5FE] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wide text-[#0076DD]">
              Etapa 1 de 4
            </div>
          </div>

          <div className="mt-6 grid gap-2 md:grid-cols-4">
            {FLOW_STEPS.map((step) => (
              <div
                key={step.number}
                className={`rounded-lg border px-3 py-2.5 ${
                  step.active
                    ? 'border-[#0076DD] bg-white text-[#0E2337]'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[9px] font-black ${
                      step.active ? 'bg-[#0076DD] text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {step.active ? <Check className="h-3.5 w-3.5" /> : step.number}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wide">{step.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <label className="mb-3 block text-xs font-black uppercase tracking-wide text-[#183956]">
                Tipo de projeto
              </label>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setProjectType('residencial')}
                  className={`rounded-xl border-2 p-4 text-left transition ${
                    projectType === 'residencial'
                      ? 'border-[#0076DD] bg-[#EAF5FE] shadow-sm'
                      : 'border-slate-200 bg-white hover:border-[#64B0F3]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#0076DD] shadow-sm">
                      <House className="h-5 w-5" />
                    </div>
                    {projectType === 'residencial' && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0076DD] text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 font-black text-[#0E2337]">Residencial</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Casas, apartamentos, sobrados e unidades residenciais.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectType('comercial')}
                  className={`rounded-xl border-2 p-4 text-left transition ${
                    projectType === 'comercial'
                      ? 'border-[#0076DD] bg-[#EAF5FE] shadow-sm'
                      : 'border-slate-200 bg-white hover:border-[#64B0F3]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#0076DD] shadow-sm">
                      <Building2 className="h-5 w-5" />
                    </div>
                    {projectType === 'comercial' && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0076DD] text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 font-black text-[#0E2337]">Comercial</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Lojas, escritórios e pequenas instalações comerciais.
                  </p>
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="project-name" className="mb-1.5 block text-xs font-black uppercase tracking-wide text-[#183956]">
                  Nome do projeto <span className="text-red-600">*</span>
                </label>
                <input
                  id="project-name"
                  autoFocus
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ex.: Residência Silva — Projeto elétrico"
                  className={`w-full rounded-lg border bg-white px-3.5 py-3 text-sm text-[#0E2337] outline-none transition focus:ring-4 focus:ring-[#64B0F3]/20 ${
                    showValidation && !canContinue
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-slate-300 focus:border-[#0076DD]'
                  }`}
                />
                {showValidation && !canContinue && (
                  <p className="mt-1.5 text-xs font-bold text-red-600">Informe um nome com pelo menos 3 caracteres.</p>
                )}
              </div>

              <div>
                <label htmlFor="client-name" className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-[#183956]">
                  <UserRound className="h-3.5 w-3.5" />
                  Cliente / proprietário
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-[#0E2337] outline-none transition focus:border-[#0076DD] focus:ring-4 focus:ring-[#64B0F3]/20"
                />
              </div>

              <div>
                <label htmlFor="project-address" className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-[#183956]">
                  <MapPin className="h-3.5 w-3.5" />
                  Endereço da obra
                </label>
                <input
                  id="project-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, número, bairro, cidade / UF"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-[#0E2337] outline-none transition focus:border-[#0076DD] focus:ring-4 focus:ring-[#64B0F3]/20"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Depois usaremos a localização para definir concessionária, tensões e parâmetros regionais.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0076DD] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#005fb4] focus:outline-none focus:ring-4 focus:ring-[#64B0F3]/30"
            >
              Criar projeto e abrir planta
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};
