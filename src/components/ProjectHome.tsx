import React from 'react';
import {
  ArrowRight,
  Building2,
  Clock3,
  FolderOpen,
  House,
  MapPin,
  Plus,
  UserRound,
} from 'lucide-react';

export interface ProjectListItem {
  id: string;
  name: string;
  type: 'residencial' | 'comercial';
  clientName: string;
  address: string;
  updatedAt: string;
}

interface ProjectHomeProps {
  projects: ProjectListItem[];
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Agora';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const ProjectHome: React.FC<ProjectHomeProps> = ({
  projects,
  onNewProject,
  onOpenProject,
}) => {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <section className="mb-8 flex flex-col gap-5 border-b border-[#183956]/20 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[#0076DD]">
            Workspace técnico
          </p>
          <h2 className="text-3xl font-black tracking-tight text-[#0E2337] md:text-4xl">
            Meus Projetos
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Crie, abra e continue projetos elétricos com planta baixa, dimensionamento e documentação técnica no mesmo fluxo.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewProject}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0076DD] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#005fb4] focus:outline-none focus:ring-4 focus:ring-[#64B0F3]/30"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          Novo Projeto
        </button>
      </section>

      {projects.length === 0 ? (
        <section className="grid min-h-[430px] place-items-center rounded-2xl border border-dashed border-[#183956]/30 bg-white/70 p-8 text-center shadow-sm">
          <div className="max-w-lg">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EAF5FE] text-[#0076DD]">
              <FolderOpen className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-black text-[#0E2337]">Nenhum projeto criado ainda</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              Comece cadastrando os dados básicos da obra. As configurações elétricas, a planta e os cálculos entram nas próximas etapas.
            </p>
            <button
              type="button"
              onClick={onNewProject}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#0076DD] bg-white px-4 py-2.5 text-sm font-black text-[#0076DD] transition hover:bg-[#EAF5FE]"
            >
              <Plus className="h-4 w-4" />
              Criar primeiro projeto
            </button>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const ProjectIcon = project.type === 'comercial' ? Building2 : House;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="group rounded-2xl border border-[#183956]/15 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#64B0F3] hover:shadow-md"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF5FE] text-[#0076DD]">
                    <ProjectIcon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-[#F2F7FB] px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-wide text-[#183956]">
                    {project.type}
                  </span>
                </div>

                <h3 className="line-clamp-2 text-lg font-black leading-tight text-[#0E2337]">
                  {project.name}
                </h3>

                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{project.clientName || 'Cliente não informado'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{project.address || 'Endereço não informado'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span>Atualizado {formatUpdatedAt(project.updatedAt)}</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-black text-[#0076DD]">
                  <span>Abrir projeto</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </section>
      )}
    </main>
  );
};
