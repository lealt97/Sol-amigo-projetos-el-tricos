import { ProjectData } from '../types';
import { DEFAULT_SHEET_SETTINGS, getScalePxPerMeter } from './nbrSheetEngine';

export interface NewProjectInput {
  projectName: string;
  projectType: 'residencial' | 'comercial';
  clientName: string;
  address: string;
}

export function createBlankProject(input: NewProjectInput): ProjectData {
  const scaleDenominator = DEFAULT_SHEET_SETTINGS.scaleDenominator ?? 50;

  return {
    settings: {
      projectName: input.projectName.trim(),
      projectType: input.projectType,
      clientName: input.clientName.trim(),
      engineerName: '',
      creaNumber: '',
      artNumber: '',
      address: input.address.trim(),
      concessionariaId: '',
      supplyType: 'bifasico',
      voltageFaseNeutro: 127,
      voltageFaseFase: 220,
      installationMethod: 'B1',
      cableType: 'PVC',
      ambientTemperature: 30,
      maxVoltageDropLighting: 4,
      maxVoltageDropPower: 4,
      groundingSystem: 'TN-S',
      dpsClass: 'II',
      dpsInKa: 20,
      dpsImaxKa: 45,
    },
    rooms: [],
    specialLoads: [],
    circuits: [],
    floorPlan: {
      scalePixelsPerMeter: getScalePxPerMeter(scaleDenominator),
      gridSnapMeters: 0.25,
      symbols: [],
      conduits: [],
      openings: [],
      walls: [],
    },
    sheetSettings: {
      ...DEFAULT_SHEET_SETTINGS,
      scaleDenominator,
    },
  };
}
