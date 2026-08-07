import { PaperFormat, PaperOrientation, SheetSettings, ProjectSettings } from '../types';

export interface SheetSpec {
  format: PaperFormat;
  orientation: PaperOrientation;
  name: string;
  widthMm: number;
  heightMm: number;
  leftMarginMm: number; // Always 25mm (NBR 10068 / NBR 16752)
  rightMarginMm: number; // 10mm for A0/A1, 7mm for A2/A3/A4
  topMarginMm: number; // 10mm for A0/A1, 7mm for A2/A3/A4
  bottomMarginMm: number; // 10mm for A0/A1, 7mm for A2/A3/A4
  titleBlockWidthMm: number; // Standard 175mm (NBR 10582)
  titleBlockHeightMm: number; // Standard 60mm to 80mm
  foldMarksMm: number[]; // Distances from right edge for folding ticks (NBR 13142)
}

export const PAPER_SPECS_NBR: Record<PaperFormat, Record<PaperOrientation, SheetSpec>> = {
  A0: {
    landscape: {
      format: 'A0',
      orientation: 'landscape',
      name: 'A0 Paisagem (1189 x 841 mm)',
      widthMm: 1189,
      heightMm: 841,
      leftMarginMm: 25,
      rightMarginMm: 10,
      topMarginMm: 10,
      bottomMarginMm: 10,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 80,
      foldMarksMm: [210, 395, 580, 765, 950],
    },
    portrait: {
      format: 'A0',
      orientation: 'portrait',
      name: 'A0 Retrato (841 x 1189 mm)',
      widthMm: 841,
      heightMm: 1189,
      leftMarginMm: 25,
      rightMarginMm: 10,
      topMarginMm: 10,
      bottomMarginMm: 10,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 80,
      foldMarksMm: [210, 395, 580],
    },
  },
  A1: {
    landscape: {
      format: 'A1',
      orientation: 'landscape',
      name: 'A1 Paisagem (841 x 594 mm)',
      widthMm: 841,
      heightMm: 594,
      leftMarginMm: 25,
      rightMarginMm: 10,
      topMarginMm: 10,
      bottomMarginMm: 10,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 75,
      foldMarksMm: [210, 395, 580],
    },
    portrait: {
      format: 'A1',
      orientation: 'portrait',
      name: 'A1 Retrato (594 x 841 mm)',
      widthMm: 594,
      heightMm: 841,
      leftMarginMm: 25,
      rightMarginMm: 10,
      topMarginMm: 10,
      bottomMarginMm: 10,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 75,
      foldMarksMm: [210, 395],
    },
  },
  A2: {
    landscape: {
      format: 'A2',
      orientation: 'landscape',
      name: 'A2 Paisagem (594 x 420 mm)',
      widthMm: 594,
      heightMm: 420,
      leftMarginMm: 25,
      rightMarginMm: 7,
      topMarginMm: 7,
      bottomMarginMm: 7,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 70,
      foldMarksMm: [210, 395],
    },
    portrait: {
      format: 'A2',
      orientation: 'portrait',
      name: 'A2 Retrato (420 x 594 mm)',
      widthMm: 420,
      heightMm: 594,
      leftMarginMm: 25,
      rightMarginMm: 7,
      topMarginMm: 7,
      bottomMarginMm: 7,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 70,
      foldMarksMm: [210],
    },
  },
  A3: {
    landscape: {
      format: 'A3',
      orientation: 'landscape',
      name: 'A3 Paisagem (420 x 297 mm)',
      widthMm: 420,
      heightMm: 297,
      leftMarginMm: 25,
      rightMarginMm: 7,
      topMarginMm: 7,
      bottomMarginMm: 7,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 65,
      foldMarksMm: [185],
    },
    portrait: {
      format: 'A3',
      orientation: 'portrait',
      name: 'A3 Retrato (297 x 420 mm)',
      widthMm: 297,
      heightMm: 420,
      leftMarginMm: 25,
      rightMarginMm: 7,
      topMarginMm: 7,
      bottomMarginMm: 7,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 65,
      foldMarksMm: [185],
    },
  },
  A4: {
    portrait: {
      format: 'A4',
      orientation: 'portrait',
      name: 'A4 Retrato (210 x 297 mm)',
      widthMm: 210,
      heightMm: 297,
      leftMarginMm: 25,
      rightMarginMm: 7,
      topMarginMm: 7,
      bottomMarginMm: 7,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 60,
      foldMarksMm: [],
    },
    landscape: {
      format: 'A4',
      orientation: 'landscape',
      name: 'A4 Paisagem (297 x 210 mm)',
      widthMm: 297,
      heightMm: 210,
      leftMarginMm: 25,
      rightMarginMm: 7,
      topMarginMm: 7,
      bottomMarginMm: 7,
      titleBlockWidthMm: 175,
      titleBlockHeightMm: 55,
      foldMarksMm: [],
    },
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
  sheetScaleText: '1:50',
  sheetXPosMeters: -0.5,
  sheetYPosMeters: -0.5,
};

export function getSheetSpec(format: PaperFormat, orientation: PaperOrientation): SheetSpec {
  const formatGroup = PAPER_SPECS_NBR[format] || PAPER_SPECS_NBR.A3;
  return formatGroup[orientation] || formatGroup.landscape;
}
