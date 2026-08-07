import React from 'react';
import {
  Home,
  Sliders,
  Settings,
  FileText,
  GitCommit,
  Grid,
  Bot,
  Compass,
} from 'lucide-react';

export type ActiveStep =
  | 'rooms'
  | 'plan'
  | 'circuits'
  | 'params'
  | 'report'
  | 'diagram'
  | 'panel'
  | 'ai';

interface StepNavigationProps {
  activeStep: ActiveStep;
  onStepChange: (step: ActiveStep) => void;
  roomCount: number;
  circuitCount: number;
}

export const StepNavigation: React.FC<StepNavigationProps> = ({
  activeStep,
  onStepChange,
  roomCount,
  circuitCount,
}) => {
  const steps: { id: ActiveStep; num: string; label: string; icon: React.ElementType; badge?: string }[] = [
    {
      id: 'rooms',
      num: '01',
      label: 'CÔMODOS & CARGAS',
      icon: Home,
      badge: `${roomCount}`,
    },
    {
      id: 'plan',
      num: '02',
      label: 'PLANTA CAD COM ESCALA',
      icon: Compass,
    },
    {
      id: 'circuits',
      num: '03',
      label: 'DIVISÃO CIRCUITOS',
      icon: Sliders,
      badge: `${circuitCount}`,
    },
    {
      id: 'params',
      num: '04',
      label: 'PARÂMETROS & NORMA',
      icon: Settings,
    },
    {
      id: 'report',
      num: '05',
      label: 'MEMORIAL CÁLCULO',
      icon: FileText,
    },
    {
      id: 'diagram',
      num: '06',
      label: 'DIAGRAMA UNIFILAR',
      icon: GitCommit,
    },
    {
      id: 'panel',
      num: '07',
      label: 'QDC TRILHO DIN',
      icon: Grid,
    },
    {
      id: 'ai',
      num: '08',
      label: 'CONSULTOR IA',
      icon: Bot,
    },
  ];

  return (
    <nav className="bg-[#E4E3E0] border-b border-[#141414] px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex overflow-x-auto gap-2 no-scrollbar">
        {steps.map((step) => {
          const Icon = step.icon;
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => onStepChange(step.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border border-[#141414] whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#141414] text-[#E4E3E0]'
                  : 'bg-white/60 text-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0]'
              }`}
            >
              <span className="opacity-50">{step.num}</span>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{step.label}</span>
              {step.badge && (
                <span
                  className={`ml-1 text-[9px] px-1.5 py-0.2 border border-[#141414] font-mono font-black ${
                    isActive
                      ? 'bg-[#E4E3E0] text-[#141414]'
                      : 'bg-[#141414] text-[#E4E3E0]'
                  }`}
                >
                  {step.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
