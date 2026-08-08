import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Ruler } from 'lucide-react';
import { FloorPlanEditor } from './components/FloorPlanEditor';
import { NewProjectWizard } from './components/NewProjectWizard';
import { ProjectHome, ProjectListItem } from './components/ProjectHome';
import { ProjectData } from './types';
import { autoDivideCircuits, sizeAllCircuits } from './utils/nbr5410Engine';
import { createBlankProject, NewProjectInput } from './utils/projectFactory';

const PROJECTS_STORAGE_KEY = 'sol-amigo-projects-v1';

type AppView = 'projects' | 'new-project' | 'editor';

interface StoredProject {
  id: string;
  createdAt: string;
  updatedAt: string;
  data: ProjectData;
}

function createProjectId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadProjects(): StoredProject[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('projects');
  const [projects, setProjects] = useState<StoredProject[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const projectData = activeProject?.data ?? null;

  const sizedCircuits = useMemo(() => {
    if (!projectData) return [];

    const circuits = autoDivideCircuits(
      projectData.rooms,
      projectData.specialLoads,
      projectData.settings
    );

    return sizeAllCircuits(circuits, projectData.settings).sizedCircuits;
  }, [projectData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [projects]);

  const projectListItems = useMemo<ProjectListItem[]>(
    () =>
      projects
        .map((project) => ({
          id: project.id,
          name: project.data.settings.projectName || 'Projeto sem nome',
          type: project.data.settings.projectType ?? 'residencial',
          clientName: project.data.settings.clientName,
          address: project.data.settings.address,
          updatedAt: project.updatedAt,
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [projects]
  );

  const handleCreateProject = (input: NewProjectInput) => {
    const now = new Date().toISOString();
    const record: StoredProject = {
      id: createProjectId(),
      createdAt: now,
      updatedAt: now,
      data: createBlankProject(input),
    };

    setProjects((current) => [record, ...current]);
    setActiveProjectId(record.id);
    setView('editor');
  };

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setView('editor');
  };

  const handleUpdateProjectData = (nextData: ProjectData) => {
    if (!activeProjectId) return;

    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId
          ? {
              ...project,
              updatedAt: new Date().toISOString(),
              data: nextData,
            }
          : project
      )
    );
  };

  const handleUpdateRooms = (rooms: ProjectData['rooms']) => {
    if (!projectData) return;

    handleUpdateProjectData({
      ...projectData,
      rooms,
    });
  };

  const handleBackToProjects = () => {
    setView('projects');
    setActiveProjectId(null);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-[#0E2337] font-sans selection:bg-[#0076DD] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#183956]/15 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBackToProjects}
            className="flex items-center gap-3 text-left"
            aria-label="Ir para Meus Projetos"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0E2337] text-[#FACB5C]">
              <Ruler className="h-5 w-5 stroke-[2.5]" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black uppercase tracking-tight text-[#0E2337]">Sol Amigo</h1>
                <span className="rounded bg-[#EAF5FE] px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wide text-[#0076DD]">
                  Projetos Elétricos
                </span>
              </div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Engenharia e documentação técnica
              </p>
            </div>
          </button>

          {view === 'editor' && projectData && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBackToProjects}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-[#64B0F3] hover:text-[#0076DD]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Projetos
              </button>
              <div className="hidden max-w-sm rounded-lg border border-[#183956]/15 bg-[#F7FAFC] px-3 py-2 sm:block">
                <p className="font-mono text-[9px] font-black uppercase tracking-wide text-slate-400">Projeto atual</p>
                <p className="truncate text-xs font-black text-[#0E2337]">{projectData.settings.projectName}</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {view === 'projects' && (
        <ProjectHome
          projects={projectListItems}
          onNewProject={() => setView('new-project')}
          onOpenProject={handleOpenProject}
        />
      )}

      {view === 'new-project' && (
        <NewProjectWizard
          onCancel={() => setView('projects')}
          onCreate={handleCreateProject}
        />
      )}

      {view === 'editor' && projectData && (
        <main className="p-3 md:p-5">
          <FloorPlanEditor
            projectData={projectData}
            sizedCircuits={sizedCircuits}
            onUpdateRooms={handleUpdateRooms}
            onUpdateProjectData={handleUpdateProjectData}
          />
        </main>
      )}
    </div>
  );
}
