import React, { useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import { FloorPlanEditor } from './components/FloorPlanEditor';
import { PRESET_RESIDENCIAL_PADRAO } from './data/presets';
import { ProjectData } from './types';
import { autoDivideCircuits, sizeAllCircuits } from './utils/nbr5410Engine';

function createInitialProject(): ProjectData {
  return JSON.parse(JSON.stringify(PRESET_RESIDENCIAL_PADRAO)) as ProjectData;
}

export default function App() {
  const [projectData, setProjectData] = useState<ProjectData>(createInitialProject);

  const sizedCircuits = useMemo(() => {
    const circuits = autoDivideCircuits(
      projectData.rooms,
      projectData.specialLoads,
      projectData.settings
    );

    return sizeAllCircuits(circuits, projectData.settings).sizedCircuits;
  }, [projectData.rooms, projectData.specialLoads, projectData.settings]);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141414] bg-[#E4E3E0] px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-[#141414] text-amber-400">
            <Ruler className="h-6 w-6 stroke-[2.5]" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black uppercase tracking-tight">Sol Amigo</h1>
              <span className="bg-[#141414] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#E4E3E0]">
                Projetos Elétricos
              </span>
            </div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Editor CAD de planta baixa e instalações elétricas
            </p>
          </div>
        </div>

        <div className="border border-[#141414] bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase">
          Projeto: {projectData.settings.projectName}
        </div>
      </header>

      <main className="p-3 md:p-5">
        <FloorPlanEditor
          projectData={projectData}
          sizedCircuits={sizedCircuits}
          onUpdateRooms={(rooms) =>
            setProjectData((current) => ({
              ...current,
              rooms,
            }))
          }
          onUpdateProjectData={setProjectData}
        />
      </main>
    </div>
  );
}
