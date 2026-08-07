import React, { useState } from 'react';
import {
  X,
  Printer,
  FileText,
  Check,
  Maximize2,
  Sliders,
  Sparkles,
  Download,
  Info,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { PaperFormat, PaperOrientation, SheetSettings, ProjectData, Room } from '../types';
import { getSheetSpec, PAPER_SPECS_NBR } from '../utils/nbrSheetEngine';

interface SheetExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectData: ProjectData;
  sizedCircuits?: any[];
  onUpdateSheetSettings: (settings: SheetSettings) => void;
  onUpdateProjectSettings: (settings: any) => void;
}

export const SheetExportModal: React.FC<SheetExportModalProps> = ({
  isOpen,
  onClose,
  projectData,
  onUpdateSheetSettings,
  onUpdateProjectSettings,
}) => {
  if (!isOpen) return null;

  const currentSheet = projectData.sheetSettings || {
    format: 'A3' as PaperFormat,
    orientation: 'landscape' as PaperOrientation,
    showSheetBorder: true,
    showTitleBlock: true,
    sheetTitle: 'PLANTA BAIXA - INSTALAÇÕES ELÉTRICAS NBR 5410',
    sheetNumber: '01/01',
    revision: 'R00',
    sheetScaleText: '1:50',
  };

  const currentProject = projectData.settings;

  // Local state for editing
  const [format, setFormat] = useState<PaperFormat>(currentSheet.format || 'A3');
  const [orientation, setOrientation] = useState<PaperOrientation>(currentSheet.orientation || 'landscape');
  const [showTitleBlock, setShowTitleBlock] = useState<boolean>(currentSheet.showTitleBlock ?? true);
  const [sheetTitle, setSheetTitle] = useState<string>(currentSheet.sheetTitle || 'PLANTA BAIXA - ARQUITETÔNICO E ILUMINAÇÃO');
  const [sheetNumber, setSheetNumber] = useState<string>(currentSheet.sheetNumber || '01/01');
  const [revision, setRevision] = useState<string>(currentSheet.revision || 'R00');
  const [sheetScaleText, setSheetScaleText] = useState<string>(currentSheet.sheetScaleText || '1:50');

  // Project Settings form fields
  const [projectName, setProjectName] = useState<string>(currentProject.projectName || 'PROJETO ELÉTRICO RESIDENCIAL');
  const [clientName, setClientName] = useState<string>(currentProject.clientName || 'NOME DO CLIENTE');
  const [address, setAddress] = useState<string>(currentProject.address || 'RUA DAS FLORES, 123 - SÃO PAULO/SP');
  const [engineerName, setEngineerName] = useState<string>(currentProject.engineerName || 'ENG. RESPONSÁVEL TÉCNICO');
  const [creaNumber, setCreaNumber] = useState<string>(currentProject.creaNumber || '1234567/D-SP');
  const [artNumber, setArtNumber] = useState<string>(currentProject.artNumber || '987654321');

  const spec = getSheetSpec(format, orientation);

  const handleApplyAndSave = () => {
    const updatedSheet: SheetSettings = {
      ...currentSheet,
      format,
      orientation,
      showTitleBlock,
      sheetTitle,
      sheetNumber,
      revision,
      sheetScaleText,
    };

    const updatedProject = {
      ...currentProject,
      projectName,
      clientName,
      address,
      engineerName,
      creaNumber,
      artNumber,
    };

    onUpdateSheetSettings(updatedSheet);
    onUpdateProjectSettings(updatedProject);
    onClose();
  };

  const handlePrintSheet = () => {
    handleApplyAndSave();
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/80 p-4 overflow-y-auto backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-[#E4E3E0] border-4 border-[#141414] shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#141414] text-[#E4E3E0] px-6 py-4 flex items-center justify-between border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-amber-400 stroke-[2.5]" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                <span>CONFIGURADOR DE PRANCHA NORMATIZADA</span>
                <span className="text-[10px] bg-amber-400 text-[#141414] px-2 py-0.5 font-mono font-bold">
                  NBR 10068 / NBR 10582
                </span>
              </h2>
              <p className="text-xs opacity-80 font-mono">
                Selecione o formato de folha (A0 a A4), margens e preencha a Legenda/Selo técnico
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 transition-colors text-[#E4E3E0] cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto p-6 gap-6">
          {/* Left Column: Sheet & Title Block Settings */}
          <div className="lg:col-span-5 space-y-5 bg-white p-5 border-2 border-[#141414] overflow-y-auto">
            {/* Section 1: Paper Format & Orientation */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase text-[#141414] tracking-wider border-b border-[#141414] pb-1 flex items-center gap-2">
                <span>1. Formato da Folha (NBR 10068)</span>
              </h3>

              <div className="grid grid-cols-5 gap-1.5">
                {(['A0', 'A1', 'A2', 'A3', 'A4'] as PaperFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`py-2 px-1 text-center font-mono text-xs font-black border-2 transition-all cursor-pointer ${
                      format === f
                        ? 'bg-[#141414] text-white border-[#141414]'
                        : 'bg-white text-[#141414] border-[#141414]/30 hover:border-[#141414]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Orientation Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setOrientation('landscape')}
                  className={`py-1.5 px-3 text-xs font-mono font-bold uppercase border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-[#141414] text-white border-[#141414]'
                      : 'bg-white text-[#141414] border-[#141414]/30'
                  }`}
                >
                  <span>🖼️ Paisagem</span>
                </button>

                <button
                  onClick={() => setOrientation('portrait')}
                  className={`py-1.5 px-3 text-xs font-mono font-bold uppercase border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    orientation === 'portrait'
                      ? 'bg-[#141414] text-white border-[#141414]'
                      : 'bg-white text-[#141414] border-[#141414]/30'
                  }`}
                >
                  <span>📄 Retrato</span>
                </button>
              </div>

              {/* Specs Readout */}
              <div className="bg-[#E4E3E0]/50 p-2.5 border border-[#141414] text-[11px] font-mono space-y-1">
                <div className="font-bold text-[#141414]">
                  DIMENSÕES: {spec.widthMm} x {spec.heightMm} mm
                </div>
                <div className="text-[#52525B]">
                  • Margem Esquerda: <strong className="text-[#141414]">25 mm</strong> (Encadernação)
                </div>
                <div className="text-[#52525B]">
                  • Margens Superior/Direita/Inferior:{' '}
                  <strong className="text-[#141414]">{spec.rightMarginMm} mm</strong>
                </div>
                <div className="text-[#52525B]">
                  • Largura Padrão da Legenda/Selo:{' '}
                  <strong className="text-[#141414]">175 mm</strong> (NBR 10582)
                </div>
              </div>
            </div>

            {/* Section 2: Legenda / Selo Fields (NBR 10582) */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black uppercase text-[#141414] tracking-wider border-b border-[#141414] pb-1 flex items-center justify-between">
                <span>2. Dados da Legenda / Selo (NBR 10582)</span>
                <label className="flex items-center gap-1 text-[10px] font-mono lowercase cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTitleBlock}
                    onChange={(e) => setShowTitleBlock(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span>exibir selo</span>
                </label>
              </h3>

              {showTitleBlock && (
                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <label className="block font-bold mb-0.5">Título do Projeto:</label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold mb-0.5">Conteúdo da Prancha:</label>
                    <input
                      type="text"
                      value={sheetTitle}
                      onChange={(e) => setSheetTitle(e.target.value)}
                      className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold mb-0.5">Cliente / Proprietário:</label>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5"
                      />
                    </div>

                    <div>
                      <label className="block font-bold mb-0.5">Endereço:</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold mb-0.5">Responsável Técnico / Projetista:</label>
                    <input
                      type="text"
                      value={engineerName}
                      onChange={(e) => setEngineerName(e.target.value)}
                      className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold mb-0.5">CREA / CAU:</label>
                      <input
                        type="text"
                        value={creaNumber}
                        onChange={(e) => setCreaNumber(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5"
                      />
                    </div>

                    <div>
                      <label className="block font-bold mb-0.5">ART / RRT:</label>
                      <input
                        type="text"
                        value={artNumber}
                        onChange={(e) => setArtNumber(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-bold mb-0.5">Escala:</label>
                      <input
                        type="text"
                        value={sheetScaleText}
                        onChange={(e) => setSheetScaleText(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5 text-center font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-bold mb-0.5">Prancha N°:</label>
                      <input
                        type="text"
                        value={sheetNumber}
                        onChange={(e) => setSheetNumber(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5 text-center font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-bold mb-0.5">Revisão:</label>
                      <input
                        type="text"
                        value={revision}
                        onChange={(e) => setRevision(e.target.value)}
                        className="w-full bg-[#E4E3E0]/30 border border-[#141414] p-1.5 text-center font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sheet Realtime Preview & Print Layout */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="flex-1 bg-zinc-800 p-4 border-2 border-[#141414] flex flex-col items-center justify-center relative min-h-[380px] overflow-hidden">
              <div className="text-[#E4E3E0] text-[10px] font-mono mb-2 uppercase tracking-widest self-start flex items-center justify-between w-full">
                <span>PRÉ-VISUALIZAÇÃO DA FOLHA {spec.name}</span>
                <span className="text-amber-400">MARGENS E LEGENDA SEGUNDO ABNT</span>
              </div>

              {/* Scaled Preview Box */}
              <div
                className="bg-white border-2 border-black relative shadow-2xl transition-all duration-300 flex flex-col justify-between select-none"
                style={{
                  aspectRatio: `${spec.widthMm} / ${spec.heightMm}`,
                  width: '94%',
                  maxHeight: '440px',
                  padding: `${(spec.topMarginMm / spec.heightMm) * 100}% ${(spec.rightMarginMm / spec.widthMm) * 100}% ${(spec.bottomMarginMm / spec.heightMm) * 100}% ${(spec.leftMarginMm / spec.widthMm) * 100}%`,
                }}
              >
                {/* 25mm Left Margin Highlight */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-amber-400/10 border-r border-amber-500/30 flex items-center justify-center pointer-events-none"
                  style={{ width: `${(spec.leftMarginMm / spec.widthMm) * 100}%` }}
                >
                  <span className="text-[8px] font-mono text-amber-700 font-bold transform -rotate-90 whitespace-nowrap">
                    25mm Encadernação
                  </span>
                </div>

                {/* Inner Border Frame Line (Quadro de Margem) */}
                <div className="w-full h-full border-2 border-black relative flex flex-col justify-between p-2">
                  {/* Drawing Content Symbol Graphic Placeholder / Thumbnail */}
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-300 bg-zinc-50/50">
                    <div className="text-xs font-mono font-bold text-zinc-700">
                      [ PLANTA BAIXA ARQUITETÔNICA E ELÉTRICA ]
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1">
                      {projectData.rooms.length} cômodos | Escala {sheetScaleText} | Simbologia NBR 5444
                    </div>
                  </div>

                  {/* Title Block (Legenda / Selo 175mm) at Bottom Right */}
                  {showTitleBlock && (
                    <div
                      className="self-end border-2 border-black bg-white text-black font-sans text-[7px] leading-tight overflow-hidden mt-1"
                      style={{
                        width: `${Math.min(100, (spec.titleBlockWidthMm / (spec.widthMm - spec.leftMarginMm - spec.rightMarginMm)) * 100)}%`,
                      }}
                    >
                      <div className="bg-black text-white font-bold p-1 text-[8px] uppercase tracking-wider">
                        PROJETO ELÉTRICO NBR 5410
                      </div>
                      <div className="p-1 border-b border-black">
                        <div className="font-bold text-zinc-600">TÍTULO:</div>
                        <div className="font-bold uppercase text-[8px] truncate">{projectName}</div>
                      </div>
                      <div className="p-1 border-b border-black grid grid-cols-2">
                        <div>
                          <div className="text-zinc-600">CLIENTE:</div>
                          <div className="font-bold truncate">{clientName}</div>
                        </div>
                        <div>
                          <div className="text-zinc-600">PROJETISTA:</div>
                          <div className="font-bold truncate">{engineerName}</div>
                        </div>
                      </div>
                      <div className="p-1 bg-zinc-100 flex justify-between font-mono font-bold text-[7.5px]">
                        <span>ESC: {sheetScaleText}</span>
                        <span>PRANCHA: {sheetNumber}</span>
                        <span>FORMATO: {format}</span>
                        <span>REV: {revision}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Explanatory Technical Note */}
            <div className="bg-[#E4E3E0] p-3 border border-[#141414] text-[11px] font-mono text-[#141414] flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
              <span>
                <strong>Emissão em conformidade com as normas ABNT:</strong> NBR 10068 (Leiaute e dimensões de folhas), NBR 10582 (Apresentação e Legenda/Selo de 175mm) e NBR 13142 (Dobramento).
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div className="bg-[#141414] text-[#E4E3E0] px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#141414]">
          <div className="text-xs font-mono">
            FORMATO SELECIONADO: <span className="font-bold text-amber-400">{spec.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#E4E3E0]/30 hover:border-[#E4E3E0] text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              onClick={handleApplyAndSave}
              className="px-4 py-2 bg-white text-[#141414] hover:bg-amber-400 font-mono text-xs font-black uppercase border border-[#141414] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Aplicar à Planta</span>
            </button>

            <button
              onClick={handlePrintSheet}
              className="px-5 py-2 bg-amber-400 hover:bg-amber-500 text-[#141414] font-mono text-xs font-black uppercase border border-[#141414] transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
