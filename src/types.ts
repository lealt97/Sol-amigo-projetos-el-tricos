export type RoomType =
  | 'quarto'
  | 'sala'
  | 'cozinha'
  | 'banheiro'
  | 'lavanderia'
  | 'corredor'
  | 'varanda'
  | 'garagem'
  | 'escritorio'
  | 'outro';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  area: number; // m²
  perimeter: number; // m
  isWet: boolean; // Área molhada/sujeita a lavagem (NBR 5410 exige DR 30mA)
  customLightingVA?: number;
  customTugCount?: number;
  customTugVA?: number;
  x?: number; // scale x position in meters
  y?: number; // scale y position in meters
  widthMeters?: number; // scale width in meters
  heightMeters?: number; // scale height in meters
  color?: string;
}

export type ElectricalSymbolType =
  | 'tug_low' // Tomada baixa (0,30m)
  | 'tug_med' // Tomada média (1,10m)
  | 'tug_high' // Tomada alta (2,20m)
  | 'tug_double' // Tomada dupla
  | 'tue' // Tomada Uso Específico (Chuveiro, Ar, etc)
  | 'light_ceiling' // Ponto de Iluminação Teto
  | 'light_wall' // Arandela Parede
  | 'switch_1p' // Interruptor Simples
  | 'switch_2p' // Interruptor Duplo
  | 'switch_3way' // Interruptor Paralelo (Three-Way)
  | 'switch_4way' // Interruptor Intermediário (Four-Way)
  | 'qdc'; // Quadro de Distribuição

export interface FloorPlanSymbol {
  id: string;
  type: ElectricalSymbolType;
  xMeters: number; // coordinate in meters
  yMeters: number; // coordinate in meters
  roomId?: string;
  circuitNumber?: number; // e.g. Circuit 1, Circuit 2
  commandLetter?: string; // e.g. "a", "b", "c"
  powerVA?: number; // e.g. 100, 600, 7500
  label?: string; // e.g. "Chuveiro 7.5kW"
  mountingHeight?: 'baixa' | 'media' | 'alta';
}

export interface FloorPlanConduit {
  id: string;
  fromSymbolId: string;
  toSymbolId: string;
  conduitType: 'teto' | 'parede' | 'piso';
  wires: ('fase' | 'neutro' | 'retorno' | 'terra')[];
  circuitNumbers?: number[];
}

export interface FloorPlanOpening {
  id: string;
  type: 'door' | 'window';
  // Start point of the opening on the host wall axis, in model meters.
  xMeters: number;
  yMeters: number;
  widthMeters: number; // e.g. 0.8m for door, 1.2m for window
  // Kept for backward compatibility and quick axis hints.
  orientation: 'horizontal' | 'vertical';
  // Exact host-wall geometry. Older saved projects may omit these fields.
  angleDeg?: number;
  wallId?: string;
  wallThicknessMeters?: number;
  wallPositionRatio?: number; // opening center position along a custom wall, 0..1
  roomId?: string;
  label?: string; // e.g. "P1 - 80x210cm", "J1 - 120x100cm"
}

export interface FloorPlanWall {
  id: string;
  x1Meters: number;
  y1Meters: number;
  x2Meters: number;
  y2Meters: number;
  thicknessMeters?: number;
  roomId?: string;
  // Stable architectural assembly id. Every geometrically connected wall component
  // belongs to one group, even when the drawing was made only with Draw Wall.
  groupId?: string;
  label?: string;
}

export interface FloorPlanData {
  scalePixelsPerMeter: number; // e.g. 50 px = 1 meter
  gridSnapMeters: number; // e.g. 0.25m or 0.5m
  symbols: FloorPlanSymbol[];
  conduits: FloorPlanConduit[];
  openings?: FloorPlanOpening[];
  walls?: FloorPlanWall[];
}

export interface SpecialLoad {
  id: string;
  roomId?: string;
  name: string;
  powerWatts: number;
  voltage: number; // 127, 220, 380
  powerFactor: number; // default 0.95 or 1.0
  quantity: number;
  notes?: string;
}

export type CircuitType = 'iluminacao' | 'tug' | 'tue' | 'reserva';

export interface CircuitLoad {
  id: string;
  roomId?: string;
  roomName?: string;
  loadName: string;
  powerVA: number;
  powerWatts: number;
  isTue?: boolean;
}

export interface Circuit {
  id: string;
  number: number;
  name: string;
  type: CircuitType;
  voltage: number; // 127, 220, 380
  phases: 'F+N' | '2F' | '2F+N' | '3F+N';
  loads: CircuitLoad[];
  distanceMeters: number; // distância do QDC à carga
  circuitsInSameConduit: number; // agrupamento no eletroduto
  drGroup?: string; // ex: "Geral", "DR1 - Áreas Molhadas", "DR2 - Cozinha"
}

export interface Concessionaria {
  id: string;
  name: string;
  state: string;
  defaultPhaseSystem: 'monofasico' | 'bifasico' | 'trifasico';
  defaultVoltageMono: number; // 127 or 220
  defaultVoltageBi: number; // 220 or 380
  defaultVoltageTri: number; // 220 or 380
  maxDemandMonoKw: number;
  maxDemandBiKw: number;
  normReference: string;
}

export type InstallationMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D';
export type CableType = 'PVC' | 'HEPR' | 'LSZH';
export type GroundingSystem = 'TN-S' | 'TN-C' | 'TT' | 'IT';

export type PaperFormat = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
export type PaperOrientation = 'landscape' | 'portrait';

export interface SheetSettings {
  format: PaperFormat;
  orientation: PaperOrientation;
  showSheetBorder: boolean;
  showTitleBlock: boolean;
  sheetTitle: string; // e.g. "PLANTA BAIXA - INSTALAÇÕES ELÉTRICAS NBR 5410"
  sheetNumber: string; // e.g. "01/01"
  revision: string; // e.g. "R00"
  scaleDenominator?: number; // fonte de verdade da escala técnica: 50 => 1:50
  sheetScaleText?: string; // e.g. "1:50" or "INDICADA"
  sheetXPosMeters?: number; // Position offset of the sheet frame on the floor plan
  sheetYPosMeters?: number;
}

export interface ProjectSettings {
  projectName: string;
  projectType?: 'residencial' | 'comercial';
  clientName: string;
  engineerName: string;
  creaNumber: string;
  artNumber: string;
  address: string;
  concessionariaId: string;
  supplyType: 'monofasico' | 'bifasico' | 'trifasico';
  voltageFaseNeutro: number; // 127V ou 220V
  voltageFaseFase: number; // 220V ou 380V
  installationMethod: InstallationMethod;
  cableType: CableType;
  ambientTemperature: number; // default 30°C
  maxVoltageDropLighting: number; // 4% default
  maxVoltageDropPower: number; // 4% default
  groundingSystem: GroundingSystem;
  dpsClass: 'II' | 'I+II';
  dpsInKa: number; // e.g. 20 kA
  dpsImaxKa: number; // e.g. 45 kA
}

export interface SizedCircuit extends Circuit {
  totalPowerVA: number;
  totalPowerWatts: number;
  designCurrentIb: number; // A
  tempFactorFt: number;
  groupFactorFg: number;
  correctedCurrentIbPrime: number; // A (Ib / (Ft * Fg))
  minSectionNorm: number; // mm²
  ampacitySection: number; // mm²
  voltageDropSection: number; // mm²
  finalSection: number; // mm²
  cableIz: number; // A (capacidade de condução da seção escolhida)
  voltageDropPercent: number; // %
  breakerRatingIn: number; // A
  breakerCurve: 'B' | 'C' | 'D';
  breakerPoles: 1 | 2 | 3;
  drRequired: boolean;
  drRating: string;
  peSection: number; // mm²
  conduitDiameterMm: number; // DN em mm (ex: 20, 25, 32)
  conduitInch: string; // e.g., '1/2"', '3/4"', '1"'
  normativeCitations: string[];
}

export interface CalculationSummary {
  totalInstalledPowerVA: number;
  totalInstalledPowerkW: number;
  demandFactorLightingTug: number;
  demandPowerLightingTugkW: number;
  demandFactorTue: number;
  demandPowerTuekW: number;
  totalDemandedPowerkW: number;
  totalDemandedPowerkVA: number;
  mainBreakerRatingA: number;
  mainBreakerPoles: 1 | 2 | 3;
  recommendedSupplyType: 'monofasico' | 'bifasico' | 'trifasico';
  feederSectionMm2: number;
  feederPeSectionMm2: number;
  feederConduitMm: number;
  generalDrRating: string;
  generalDpsRating: string;
  groundingDescription: string;
}

export interface ProjectData {
  settings: ProjectSettings;
  rooms: Room[];
  specialLoads: SpecialLoad[];
  circuits: Circuit[];
  floorPlan?: FloorPlanData;
  sheetSettings?: SheetSettings;
}
