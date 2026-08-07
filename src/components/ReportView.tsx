import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Printer,
  Download,
  Check,
  Award,
} from 'lucide-react';
import { ProjectData, SizedCircuit, CalculationSummary } from '../types';
import { generateMarkdownReport } from '../utils/nbr5410Engine';

interface ReportViewProps {
  projectData: ProjectData;
  sizedCircuits: SizedCircuit[];
  summary: CalculationSummary;
}

export const ReportView: React.FC<ReportViewProps> = ({
  projectData,
  sizedCircuits,
  summary,
}) => {
  const [copied, setCopied] = useState(false);

  const markdownReport = generateMarkdownReport(
    projectData,
    sizedCircuits,
    summary
  );

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(markdownReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMd = () => {
    const blob = new Blob([markdownReport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Memorial_Calculo_NBR5410_${projectData.settings.projectName.replace(/\s+/g, '_') || 'ELETROBR'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    let csv = 'Circuito;Descricao;Tipo;Tensao_V;Fases;Potencia_VA;Corrente_Ib_A;Cabo_Fase_mm2;Cabo_PE_mm2;Disjuntor;Curva;DR_30mA;Eletroduto\n';
    sizedCircuits.forEach((c) => {
      csv += `${c.number};"${c.name}";${c.type};${c.voltage};${c.phases};${c.totalPowerVA};${c.designCurrentIb.toFixed(2)};${c.finalSection};${c.peSection};"${c.breakerPoles}P ${c.breakerRatingIn}A";${c.breakerCurve};${c.drRequired ? 'Sim' : 'Nao'};${c.conduitInch}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quadro_de_Cargas_${projectData.settings.projectName.replace(/\s+/g, '_') || 'ELETROBR'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:m-0 print:p-0 font-mono">
      {/* Top Action Bar (Hidden when printing) */}
      <div className="border border-[#141414] bg-white p-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-[#141414]" />
          <div>
            <h2 className="text-sm font-black uppercase text-[#141414]">
              Memorial de Cálculo Normativo NBR 5410:2004
            </h2>
            <p className="text-xs opacity-70 text-[#141414]">
              Relatório técnico formatado para emissão de ART/CREA e Concessionária
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 text-xs font-bold uppercase bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] px-3 py-2 border border-[#141414] transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>{copied ? 'Copiado!' : 'Copiar Markdown'}</span>
          </button>

          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 text-xs font-bold uppercase bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] px-3 py-2 border border-[#141414] transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={handleDownloadMd}
            className="flex items-center gap-1.5 text-xs font-bold uppercase bg-white hover:bg-[#141414] hover:text-[#E4E3E0] text-[#141414] px-3 py-2 border border-[#141414] transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Memorial (.md)</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-bold uppercase bg-[#141414] text-[#E4E3E0] hover:bg-black px-4 py-2 border border-[#141414] transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Formatted Markdown Content Document */}
      <div className="border border-[#141414] bg-white p-6 sm:p-10 text-[#141414] print:border-none print:shadow-none print:p-0">
        <div className="max-w-none text-xs leading-relaxed space-y-6">
          <ReportMarkdownFormatter markdown={markdownReport} />
        </div>
      </div>
    </div>
  );
};

// Custom lightweight React markdown renderer to display tables and equations without extra external markdown parser vulnerabilities
function ReportMarkdownFormatter({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');

  let inTable = false;
  let tableRows: string[][] = [];

  const renderElements: React.ReactNode[] = [];

  const flushTable = (key: string) => {
    if (tableRows.length === 0) return;

    const header = tableRows[0];
    const dataRows = tableRows.slice(2); // Skip separator row

    renderElements.push(
      <div key={key} className="overflow-x-auto my-4 border border-[#141414]">
        <table className="w-full text-left text-xs border-collapse font-mono">
          <thead>
            <tr className="bg-[#141414] text-[#E4E3E0] border-b border-[#141414]">
              {header.map((col, idx) => (
                <th key={idx} className="p-2.5 font-bold uppercase border-r border-[#E4E3E0]/20 last:border-r-0">
                  {cleanCell(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="border-b border-[#141414]/20 hover:bg-[#141414]/5"
              >
                {row.map((col, cIdx) => (
                  <td key={cIdx} className="p-2.5 border-r border-[#141414]/20 last:border-r-0">
                    {cleanCell(col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    tableRows = [];
    inTable = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const cols = trimmed.slice(1, -1).split('|');
      tableRows.push(cols);
      return;
    } else if (inTable) {
      flushTable(`table_${index}`);
    }

    if (trimmed.startsWith('# ')) {
      renderElements.push(
        <h1 key={index} className="text-base font-black uppercase text-[#141414] border-b-2 border-[#141414] pb-2 mt-6 mb-3">
          {cleanFormatting(trimmed.substring(2))}
        </h1>
      );
    } else if (trimmed.startsWith('## ')) {
      renderElements.push(
        <h2 key={index} className="text-sm font-bold uppercase text-[#141414] mt-6 mb-2 border-l-4 border-[#141414] pl-3 py-0.5">
          {cleanFormatting(trimmed.substring(3))}
        </h2>
      );
    } else if (trimmed.startsWith('### ')) {
      renderElements.push(
        <h3 key={index} className="text-xs font-bold uppercase text-[#141414] mt-4 mb-1">
          {cleanFormatting(trimmed.substring(4))}
        </h3>
      );
    } else if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
      renderElements.push(
        <div key={index} className="bg-[#E4E3E0]/50 p-3 my-2 border border-[#141414] font-mono text-[#141414] text-center text-xs font-bold">
          {cleanFormatting(trimmed.slice(2, -2))}
        </div>
      );
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      renderElements.push(
        <li key={index} className="ml-4 list-disc text-[#141414] my-0.5 font-mono">
          {cleanFormatting(trimmed.substring(2))}
        </li>
      );
    } else if (trimmed.match(/^\d+\.\s/)) {
      renderElements.push(
        <div key={index} className="text-[#141414] font-bold my-1 font-mono">
          {cleanFormatting(trimmed)}
        </div>
      );
    } else if (trimmed.length > 0) {
      renderElements.push(
        <p key={index} className="text-[#141414] my-1 font-mono">
          {cleanFormatting(trimmed)}
        </p>
      );
    }
  });

  if (inTable) {
    flushTable('table_end');
  }

  return <div>{renderElements}</div>;
}

function cleanCell(cellText: string): string {
  return cellText.trim().replace(/\*\*/g, '').replace(/\\text\{/g, '').replace(/\}/g, '');
}

function cleanFormatting(text: string): React.ReactNode {
  // Simple bold replacer
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-bold text-[#141414]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
