import { PaperFormat, PaperOrientation, SheetSettings } from '../types';

/**
 * Núcleo geométrico da prancha técnica.
 *
 * Regra de arquitetura importante:
 * - o modelo da planta é armazenado em metros reais;
 * - a escala da prancha é uma razão (1:n);
 * - o zoom da interface é apenas visual e nunca altera a escala de impressão;
 * - medidas de folha, margens, quadro, legenda e PDF são tratadas em milímetros.
 *
 * A configuração abaixo segue a família ISO-A e os requisitos de apresentação
 * adotados pela ABNT NBR 16752:2020 para folhas de desenho técnico.
 */
export interface SheetSpec {
  format: PaperFormat;
  orientation: PaperOrientation;
  name: string;
  widthMm: number;
  heightMm: number;
  leftMarginMm: number;
  rightMarginMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  frameLineWidthMm: number;
  titleBlockWidthMm: number;
  /** Altura padrão do template Sol Amigo. A legenda pode ter altura variável. */
  titleBlockHeightMm: number;
  /** Distâncias, em mm, medidas a partir da borda direita para guias de dobramento. */
  foldMarksMm: number[];
}

export interface PaperRectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface DrawingSizeOnPaper {
  widthMm: number;
  heightMm: number;
}

export interface SheetFitResult {
  fits: boolean;
  scaleDenominator: number;
  requiredWidthMm: number;
  requiredHeightMm: number;
  availableWidthMm: number;
  availableHeightMm: number;
  widthUtilization: number;
  heightUtilization: number;
}

export interface SheetRecommendation extends SheetFitResult {
  format: PaperFormat;
  orientation: PaperOrientation;
}

/**
 * Escalas de redução disponibilizadas por padrão para plantas arquitetônicas
 * e projetos elétricos no Sol Amigo.
 */
export const SUPPORTED_DRAWING_SCALES = [20, 25, 50, 100, 200] as const;

/**
 * Densidade usada apenas para renderizar a pré-visualização SVG.
 * 1 mm de papel = 2.5 unidades SVG.
 *
 * IMPORTANTE: isto não é zoom. O zoom deve ser aplicado depois, na viewport.
 */
export const PAPER_PREVIEW_PX_PER_MM = 2.5;

const TITLE_BLOCK_WIDTH_MM = 180;

function makeSpec(
  format: PaperFormat,
  orientation: PaperOrientation,
  widthMm: number,
  heightMm: number,
  frameLineWidthMm: number,
  titleBlockHeightMm: number,
  foldMarksMm: number[]
): SheetSpec {
  return {
    format,
    orientation,
    name: `${format} ${orientation === 'landscape' ? 'Paisagem' : 'Retrato'} (${widthMm} x ${heightMm} mm)`,
    widthMm,
    heightMm,
    leftMarginMm: 20,
    rightMarginMm: 10,
    topMarginMm: 10,
    bottomMarginMm: 10,
    frameLineWidthMm,
    titleBlockWidthMm: TITLE_BLOCK_WIDTH_MM,
    titleBlockHeightMm,
    foldMarksMm,
  };
}

export const PAPER_SPECS_NBR: Record<PaperFormat, Record<PaperOrientation, SheetSpec>> = {
  A0: {
    landscape: makeSpec('A0', 'landscape', 1189, 841, 1.0, 80, [210, 395, 580, 765, 950]),
    portrait: makeSpec('A0', 'portrait', 841, 1189, 1.0, 80, [210, 395, 580]),
  },
  A1: {
    landscape: makeSpec('A1', 'landscape', 841, 594, 1.0, 75, [210, 395, 580]),
    portrait: makeSpec('A1', 'portrait', 594, 841, 1.0, 75, [210, 395]),
  },
  A2: {
    landscape: makeSpec('A2', 'landscape', 594, 420, 0.7, 70, [210, 395]),
    portrait: makeSpec('A2', 'portrait', 420, 594, 0.7, 70, [210]),
  },
  A3: {
    landscape: makeSpec('A3', 'landscape', 420, 297, 0.7, 65, [210]),
    portrait: makeSpec('A3', 'portrait', 297, 420, 0.7, 65, [210]),
  },
  A4: {
    landscape: makeSpec('A4', 'landscape', 297, 210, 0.7, 55, []),
    portrait: makeSpec('A4', 'portrait', 210, 297, 0.7, 60, []),
  },
};

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  format: 'A3',
  orientation: 'landscape',
  showSheetBorder: true,
  showTitleBlock: true,
  sheetTitle: 'PLANTA BAIXA - INSTALAÇÕES ELÉTRICAS NBR 5410',
  sheetNumber: '01/01',
  revision: 'R00',
  scaleDenominator: 50,
  sheetScaleText: '1:50',
  sheetXPosMeters: -0.5,
  sheetYPosMeters: -0.5,
};

export function getSheetSpec(format: PaperFormat, orientation: PaperOrientation): SheetSpec {
  return PAPER_SPECS_NBR[format][orientation];
}

/** Retorna o retângulo interno delimitado pelo quadro da folha. */
export function getInnerFrameRectMm(spec: SheetSpec): PaperRectMm {
  return {
    xMm: spec.leftMarginMm,
    yMm: spec.topMarginMm,
    widthMm: spec.widthMm - spec.leftMarginMm - spec.rightMarginMm,
    heightMm: spec.heightMm - spec.topMarginMm - spec.bottomMarginMm,
  };
}

/**
 * Área retangular conservadora para inserção automática da planta.
 * Quando a legenda está ativa, a altura dela é reservada por toda a largura.
 */
export function getSafeDrawingRectMm(spec: SheetSpec, showTitleBlock = true): PaperRectMm {
  const inner = getInnerFrameRectMm(spec);
  const reservedHeightMm = showTitleBlock ? spec.titleBlockHeightMm : 0;

  return {
    ...inner,
    heightMm: Math.max(0, inner.heightMm - reservedHeightMm),
  };
}

/** Converte uma dimensão real em metros para a dimensão física na folha. */
export function metersToPaperMm(meters: number, scaleDenominator: number): number {
  if (!Number.isFinite(meters)) return 0;
  assertValidScale(scaleDenominator);
  return (meters * 1000) / scaleDenominator;
}

/** Converte uma dimensão física da folha para a dimensão real em metros. */
export function paperMmToMeters(paperMm: number, scaleDenominator: number): number {
  if (!Number.isFinite(paperMm)) return 0;
  assertValidScale(scaleDenominator);
  return (paperMm * scaleDenominator) / 1000;
}

/** Converte milímetros de papel para unidades de renderização SVG/canvas. */
export function paperMmToCanvasPx(
  paperMm: number,
  paperPxPerMm = PAPER_PREVIEW_PX_PER_MM
): number {
  if (!Number.isFinite(paperMm) || !Number.isFinite(paperPxPerMm) || paperPxPerMm <= 0) return 0;
  return paperMm * paperPxPerMm;
}

/**
 * Conversão canônica metro real -> canvas, já respeitando a escala da prancha.
 * O zoom da viewport NÃO entra nesta função.
 */
export function metersToCanvasPx(
  meters: number,
  scaleDenominator: number,
  paperPxPerMm = PAPER_PREVIEW_PX_PER_MM
): number {
  return paperMmToCanvasPx(metersToPaperMm(meters, scaleDenominator), paperPxPerMm);
}

/**
 * Retorna quantas unidades de canvas correspondem a 1 metro real para uma escala.
 * Ex.: 1:50 em 2.5 px/mm -> 50 px/m.
 */
export function getScalePxPerMeter(
  scaleDenominator: number,
  paperPxPerMm = PAPER_PREVIEW_PX_PER_MM
): number {
  return metersToCanvasPx(1, scaleDenominator, paperPxPerMm);
}

/** Compatibilidade temporária com o editor legado que ainda armazena px/m. */
export function getScaleDenominatorFromPxPerMeter(
  pxPerMeter: number,
  paperPxPerMm = PAPER_PREVIEW_PX_PER_MM
): number {
  if (!Number.isFinite(pxPerMeter) || pxPerMeter <= 0) return 50;
  if (!Number.isFinite(paperPxPerMm) || paperPxPerMm <= 0) return 50;
  return (paperPxPerMm * 1000) / pxPerMeter;
}

export function formatScale(scaleDenominator: number): string {
  assertValidScale(scaleDenominator);
  return `1:${formatNumber(scaleDenominator)}`;
}

export function parseScaleDenominator(scaleText?: string | null): number | null {
  if (!scaleText) return null;

  const normalized = scaleText.trim().replace(',', '.');
  const match = normalized.match(/(?:1\s*:\s*)?(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const denominator = Number(match[1]);
  return Number.isFinite(denominator) && denominator > 0 ? denominator : null;
}

export function getSheetScaleDenominator(settings: SheetSettings, fallback = 50): number {
  const numericScale = settings.scaleDenominator;

  if (Number.isFinite(numericScale) && (numericScale as number) > 0) {
    return numericScale as number;
  }

  return parseScaleDenominator(settings.sheetScaleText) ?? fallback;
}

export function isSupportedDrawingScale(scaleDenominator: number): boolean {
  return SUPPORTED_DRAWING_SCALES.some((scale) => scale === scaleDenominator);
}

export function getNearestSupportedDrawingScale(scaleDenominator: number): number {
  assertValidScale(scaleDenominator);

  return SUPPORTED_DRAWING_SCALES.reduce((nearest, candidate) => {
    return Math.abs(candidate - scaleDenominator) < Math.abs(nearest - scaleDenominator)
      ? candidate
      : nearest;
  }, SUPPORTED_DRAWING_SCALES[0] as number);
}

export function getDrawingSizeOnPaper(
  widthMeters: number,
  heightMeters: number,
  scaleDenominator: number
): DrawingSizeOnPaper {
  return {
    widthMm: metersToPaperMm(Math.max(0, widthMeters), scaleDenominator),
    heightMm: metersToPaperMm(Math.max(0, heightMeters), scaleDenominator),
  };
}

/**
 * Verifica se o bounding-box da planta cabe com segurança na folha sem invadir
 * margens/legenda. A função trabalha exclusivamente com dimensões físicas.
 */
export function checkDrawingFit(
  widthMeters: number,
  heightMeters: number,
  spec: SheetSpec,
  scaleDenominator: number,
  showTitleBlock = true,
  clearanceMm = 5
): SheetFitResult {
  assertValidScale(scaleDenominator);

  const required = getDrawingSizeOnPaper(widthMeters, heightMeters, scaleDenominator);
  const safeRect = getSafeDrawingRectMm(spec, showTitleBlock);
  const availableWidthMm = Math.max(0, safeRect.widthMm - clearanceMm * 2);
  const availableHeightMm = Math.max(0, safeRect.heightMm - clearanceMm * 2);

  const widthUtilization = availableWidthMm > 0 ? required.widthMm / availableWidthMm : Infinity;
  const heightUtilization = availableHeightMm > 0 ? required.heightMm / availableHeightMm : Infinity;

  return {
    fits: widthUtilization <= 1 && heightUtilization <= 1,
    scaleDenominator,
    requiredWidthMm: required.widthMm,
    requiredHeightMm: required.heightMm,
    availableWidthMm,
    availableHeightMm,
    widthUtilization,
    heightUtilization,
  };
}

/**
 * Retorna combinações folha/orientação que acomodam a planta na escala pedida,
 * da menor folha para a maior. Útil para o recurso "Escolher folha automaticamente".
 */
export function recommendSheetsForDrawing(
  widthMeters: number,
  heightMeters: number,
  scaleDenominator: number,
  showTitleBlock = true,
  clearanceMm = 5
): SheetRecommendation[] {
  assertValidScale(scaleDenominator);

  const formatsSmallToLarge: PaperFormat[] = ['A4', 'A3', 'A2', 'A1', 'A0'];
  const orientations: PaperOrientation[] = ['portrait', 'landscape'];
  const recommendations: SheetRecommendation[] = [];

  for (const format of formatsSmallToLarge) {
    for (const orientation of orientations) {
      const spec = getSheetSpec(format, orientation);
      const fit = checkDrawingFit(
        widthMeters,
        heightMeters,
        spec,
        scaleDenominator,
        showTitleBlock,
        clearanceMm
      );

      if (fit.fits) {
        recommendations.push({
          ...fit,
          format,
          orientation,
        });
      }
    }
  }

  return recommendations.sort((a, b) => {
    const aSpec = getSheetSpec(a.format, a.orientation);
    const bSpec = getSheetSpec(b.format, b.orientation);
    const aArea = aSpec.widthMm * aSpec.heightMm;
    const bArea = bSpec.widthMm * bSpec.heightMm;

    if (aArea !== bArea) return aArea - bArea;

    const aUtilization = Math.max(a.widthUtilization, a.heightUtilization);
    const bUtilization = Math.max(b.widthUtilization, b.heightUtilization);
    return bUtilization - aUtilization;
  });
}

function assertValidScale(scaleDenominator: number): void {
  if (!Number.isFinite(scaleDenominator) || scaleDenominator <= 0) {
    throw new Error(`Escala inválida: 1:${scaleDenominator}. O denominador deve ser maior que zero.`);
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}