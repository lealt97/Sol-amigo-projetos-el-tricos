import { InstallationMethod, CableType } from '../types';

// NBR 5410 Tabela 36 e 37 - Capacidade de condução de corrente (A) para condutores de cobre
// Método B1 (Condutores isolados em eletroduto de seção circular embutido em alvenaria)
export const AMPACITY_COPPER_PVC_B1: Record<number, { twoLoaded: number; threeLoaded: number }> = {
  1.5: { twoLoaded: 17.5, threeLoaded: 15.5 },
  2.5: { twoLoaded: 24, threeLoaded: 21 },
  4.0: { twoLoaded: 32, threeLoaded: 28 },
  6.0: { twoLoaded: 41, threeLoaded: 36 },
  10.0: { twoLoaded: 57, threeLoaded: 50 },
  16.0: { twoLoaded: 76, threeLoaded: 68 },
  25.0: { twoLoaded: 101, threeLoaded: 89 },
  35.0: { twoLoaded: 125, threeLoaded: 110 },
  50.0: { twoLoaded: 151, threeLoaded: 134 },
  70.0: { twoLoaded: 192, threeLoaded: 171 },
  95.0: { twoLoaded: 232, threeLoaded: 207 },
  120.0: { twoLoaded: 269, threeLoaded: 239 },
};

export const AMPACITY_COPPER_HEPR_B1: Record<number, { twoLoaded: number; threeLoaded: number }> = {
  1.5: { twoLoaded: 21, threeLoaded: 18.5 },
  2.5: { twoLoaded: 29, threeLoaded: 25 },
  4.0: { twoLoaded: 38, threeLoaded: 34 },
  6.0: { twoLoaded: 49, threeLoaded: 43 },
  10.0: { twoLoaded: 68, threeLoaded: 60 },
  16.0: { twoLoaded: 91, threeLoaded: 80 },
  25.0: { twoLoaded: 121, threeLoaded: 106 },
  35.0: { twoLoaded: 150, threeLoaded: 131 },
  50.0: { twoLoaded: 181, threeLoaded: 159 },
  70.0: { twoLoaded: 230, threeLoaded: 202 },
  95.0: { twoLoaded: 279, threeLoaded: 244 },
  120.0: { twoLoaded: 323, threeLoaded: 282 },
};

// Fator de correção de temperatura (NBR 5410 Tabela 40)
export const TEMP_CORRECTION_FACTORS: Record<CableType, Record<number, number>> = {
  PVC: {
    10: 1.22,
    15: 1.17,
    20: 1.12,
    25: 1.06,
    30: 1.0,
    35: 0.94,
    40: 0.87,
    45: 0.79,
    50: 0.71,
    55: 0.61,
    60: 0.5,
  },
  HEPR: {
    10: 1.15,
    15: 1.12,
    20: 1.08,
    25: 1.04,
    30: 1.0,
    35: 0.96,
    40: 0.91,
    45: 0.87,
    50: 0.82,
    55: 0.76,
    60: 0.71,
  },
  LSZH: {
    10: 1.22,
    15: 1.17,
    20: 1.12,
    25: 1.06,
    30: 1.0,
    35: 0.94,
    40: 0.87,
    45: 0.79,
    50: 0.71,
    55: 0.61,
    60: 0.5,
  },
};

// Fator de correção de agrupamento para circuitos no mesmo eletroduto (NBR 5410 Tabela 42)
export const GROUPING_CORRECTION_FACTORS: Record<number, number> = {
  1: 1.0,
  2: 0.8,
  3: 0.7,
  4: 0.65,
  5: 0.6,
  6: 0.57,
  7: 0.54,
  8: 0.52,
  9: 0.5,
  10: 0.48,
  11: 0.46,
  12: 0.45,
};

// Diâmetro externo aproximado dos condutores unipolares 750V (mm)
export const CABLE_OUTER_DIAMETER_MM: Record<number, number> = {
  1.5: 3.0,
  2.5: 3.6,
  4.0: 4.2,
  6.0: 4.8,
  10.0: 6.0,
  16.0: 7.2,
  25.0: 8.8,
  35.0: 10.1,
  50.0: 11.8,
  70.0: 13.8,
  95.0: 15.9,
  120.0: 17.6,
};

// Eletrodutos flexíveis sanfonados PVC / rígidos - diâmetro interno útil (mm) e denominação
export const CONDUIT_SIZES = [
  { internalMm: 16, nominalMm: 20, inch: '1/2"', label: 'DN 20mm (1/2")' },
  { internalMm: 21, nominalMm: 25, inch: '3/4"', label: 'DN 25mm (3/4")' },
  { internalMm: 27, nominalMm: 32, inch: '1"', label: 'DN 32mm (1")' },
  { internalMm: 36, nominalMm: 40, inch: '1.1/4"', label: 'DN 40mm (1 1/4")' },
  { internalMm: 42, nominalMm: 50, inch: '1.1/2"', label: 'DN 50mm (1 1/2")' },
  { internalMm: 53, nominalMm: 60, inch: '2"', label: 'DN 60mm (2")' },
];

// Valores nominais padronizados de disjuntores DIN (A) NBR IEC 60898-1
export const STANDARD_BREAKER_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125];

// Resistividade do cobre em T20°C em Ohm.mm²/m
export const COPPER_RESISTIVITY = 0.0178; // Ω.mm²/m (a 20°C) ou ~0.021 Ω.mm²/m a 70°C
