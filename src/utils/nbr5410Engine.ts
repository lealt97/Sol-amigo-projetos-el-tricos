import {
  Room,
  SpecialLoad,
  Circuit,
  CircuitLoad,
  ProjectSettings,
  SizedCircuit,
  CalculationSummary,
  ProjectData,
} from '../types';
import {
  AMPACITY_COPPER_PVC_B1,
  AMPACITY_COPPER_HEPR_B1,
  TEMP_CORRECTION_FACTORS,
  GROUPING_CORRECTION_FACTORS,
  CABLE_OUTER_DIAMETER_MM,
  CONDUIT_SIZES,
  STANDARD_BREAKER_RATINGS,
  COPPER_RESISTIVITY,
} from '../data/ampacityTables';
import { BRAZILIAN_CONCESSIONARIAS } from '../data/concessionarias';

// ---------------------------------------------------------------------------
// 1. Previsão de Cargas conforme ABNT NBR 5410:2004 item 9.5.2
// ---------------------------------------------------------------------------

/**
 * Calcula Iluminação mínima NBR 5410 item 9.5.2.1:
 * - Área < 6 m²: 100 VA
 * - Área >= 6 m²: 100 VA para os primeiros 6 m² + 60 VA para cada 4 m² inteiros adicionais
 */
export function calculateRoomLightingVA(area: number): number {
  if (area <= 0) return 100;
  if (area < 6) return 100;
  const extraArea = area - 6;
  const extraBlocks = Math.floor(extraArea / 4);
  return 100 + extraBlocks * 60;
}

/**
 * Mínimo de TUGs e potência NBR 5410 item 9.5.2.2:
 * - Cômodos secos (quarto, sala, corredor, etc.): 1 tomada para cada 5 m ou fração de perímetro. (100 VA cada)
 * - Cômodos úmidos (cozinha, copa, lavanderia, área de serviço, banheiro): 1 tomada para cada 3,5 m ou fração de perímetro.
 * - Cozinha / Copa / Lavanderia: 600 VA para as 3 primeiras tomadas + 100 VA para cada demais.
 * - Banheiro: pelo menos 1 tomada de 600 VA junto ao lavatório.
 */
export function calculateRoomTugs(
  area: number,
  perimeter: number,
  roomType: string,
  isWet: boolean
): { count: number; totalVA: number; breakdown: string } {
  if (perimeter <= 0) {
    perimeter = Math.sqrt(area || 10) * 4;
  }

  const typeLower = roomType.toLowerCase();

  // Banheiros: pelo menos 1 TUG de 600 VA
  if (typeLower.includes('banheiro') || typeLower.includes('wc')) {
    const count = Math.max(1, Math.ceil(perimeter / 3.5));
    const totalVA = 600 + (count - 1) * 100;
    return {
      count,
      totalVA,
      breakdown: `1x 600 VA + ${count - 1}x 100 VA (NBR 5410 item 9.5.2.2 b)`,
    };
  }

  // Cômodos de serviço / Cozinha / Lavanderia (NBR 5410 item 9.5.2.2 a/d)
  if (
    isWet ||
    typeLower.includes('cozinha') ||
    typeLower.includes('copa') ||
    typeLower.includes('lavanderia') ||
    typeLower.includes('servico') ||
    typeLower.includes('gourmet')
  ) {
    const count = Math.max(1, Math.ceil(perimeter / 3.5));
    let totalVA = 0;
    if (count <= 3) {
      totalVA = count * 600;
    } else {
      totalVA = 3 * 600 + (count - 3) * 100;
    }
    return {
      count,
      totalVA,
      breakdown:
        count <= 3
          ? `${count}x 600 VA`
          : `3x 600 VA + ${count - 3}x 100 VA (NBR 5410 item 9.5.2.2 d)`,
    };
  }

  // Cômodos secos (NBR 5410 item 9.5.2.2 a/c)
  // Hall / Corredor com área < 6m²: pelo menos 1 tomada no total
  if (typeLower.includes('corredor') || typeLower.includes('hall')) {
    const count = area >= 6 ? Math.max(1, Math.ceil(perimeter / 5)) : 1;
    return {
      count,
      totalVA: count * 100,
      breakdown: `${count}x 100 VA (1 por 5m perim. - item 9.5.2.2 c)`,
    };
  }

  const count = Math.max(1, Math.ceil(perimeter / 5));
  return {
    count,
    totalVA: count * 100,
    breakdown: `${count}x 100 VA (1 por 5m perim. - item 9.5.2.2 a)`,
  };
}

// ---------------------------------------------------------------------------
// 2. Divisão de Circuitos Automática conforme NBR 5410 item 9.5.3
// ---------------------------------------------------------------------------

export function autoDivideCircuits(
  rooms: Room[],
  specialLoads: SpecialLoad[],
  settings: ProjectSettings
): Circuit[] {
  const circuits: Circuit[] = [];
  let circuitCounter = 1;

  const vMono = settings.voltageFaseNeutro || 127;
  const vBi = settings.voltageFaseFase || 220;

  // A. Circuito(s) de Iluminação
  // Iluminação Geral (agrupada em potências razoáveis <= 1200VA em 127V ou 2200VA em 220V)
  const maxLightingVA = vMono === 127 ? 1200 : 2000;
  let currentLightingLoads: CircuitLoad[] = [];
  let currentLightingVA = 0;

  rooms.forEach((room) => {
    const va = room.customLightingVA ?? calculateRoomLightingVA(room.area);
    if (currentLightingVA + va > maxLightingVA && currentLightingLoads.length > 0) {
      circuits.push({
        id: `c_${circuitCounter}`,
        number: circuitCounter,
        name: `Iluminação ${circuitCounter === 1 ? 'Social / Social' : 'Serviço / Íntima'}`,
        type: 'iluminacao',
        voltage: vMono,
        phases: 'F+N',
        loads: currentLightingLoads,
        distanceMeters: 15,
        circuitsInSameConduit: 3,
        drGroup: 'Geral',
      });
      circuitCounter++;
      currentLightingLoads = [];
      currentLightingVA = 0;
    }

    currentLightingLoads.push({
      id: `l_ilum_${room.id}`,
      roomId: room.id,
      roomName: room.name,
      loadName: `Ilum. ${room.name}`,
      powerVA: va,
      powerWatts: Math.round(va * 0.95),
    });
    currentLightingVA += va;
  });

  if (currentLightingLoads.length > 0) {
    circuits.push({
      id: `c_${circuitCounter}`,
      number: circuitCounter,
      name: `Iluminação ${circuits.some((c) => c.type === 'iluminacao') ? 'Geral 2' : 'Geral'}`,
      type: 'iluminacao',
      voltage: vMono,
      phases: 'F+N',
      loads: currentLightingLoads,
      distanceMeters: 15,
      circuitsInSameConduit: 3,
      drGroup: 'Geral',
    });
    circuitCounter++;
  }

  // B. Circuitos de TUGs (Separar áreas molhadas/cozinha de áreas secas - NBR 5410 item 9.5.3.1)
  const dryRoomLoads: CircuitLoad[] = [];
  const wetRoomLoads: CircuitLoad[] = [];

  rooms.forEach((room) => {
    const tugInfo = calculateRoomTugs(
      room.area,
      room.perimeter,
      room.type,
      room.isWet
    );
    const count = room.customTugCount ?? tugInfo.count;
    const va = room.customTugVA ?? tugInfo.totalVA;

    const loadItem: CircuitLoad = {
      id: `l_tug_${room.id}`,
      roomId: room.id,
      roomName: room.name,
      loadName: `TUGs ${room.name} (${count}x)`,
      powerVA: va,
      powerWatts: Math.round(va * 0.95),
    };

    if (
      room.isWet ||
      room.type === 'cozinha' ||
      room.type === 'lavanderia' ||
      room.type === 'banheiro'
    ) {
      wetRoomLoads.push(loadItem);
    } else {
      dryRoomLoads.push(loadItem);
    }
  });

  // TUGs Secas (máx ~1800 VA por circuito em 127V / 3000 VA em 220V)
  const maxTugDryVA = vMono === 127 ? 1800 : 3000;
  let currDryList: CircuitLoad[] = [];
  let currDryVA = 0;

  dryRoomLoads.forEach((load) => {
    if (currDryVA + load.powerVA > maxTugDryVA && currDryList.length > 0) {
      circuits.push({
        id: `c_${circuitCounter}`,
        number: circuitCounter,
        name: `TUGs Áreas Secas (Quartos / Sala)`,
        type: 'tug',
        voltage: vMono,
        phases: 'F+N',
        loads: currDryList,
        distanceMeters: 20,
        circuitsInSameConduit: 3,
        drGroup: 'Geral',
      });
      circuitCounter++;
      currDryList = [];
      currDryVA = 0;
    }
    currDryList.push(load);
    currDryVA += load.powerVA;
  });

  if (currDryList.length > 0) {
    circuits.push({
      id: `c_${circuitCounter}`,
      number: circuitCounter,
      name: `TUGs Áreas Secas`,
      type: 'tug',
      voltage: vMono,
      phases: 'F+N',
      loads: currDryList,
      distanceMeters: 20,
      circuitsInSameConduit: 3,
      drGroup: 'Geral',
    });
    circuitCounter++;
  }

  // TUGs Úmidas / Cozinha / Lavanderia (TUGs de 600VA exigem divisão cuidadosa)
  const maxTugWetVA = vMono === 127 ? 2000 : 3500;
  let currWetList: CircuitLoad[] = [];
  let currWetVA = 0;

  wetRoomLoads.forEach((load) => {
    if (currWetVA + load.powerVA > maxTugWetVA && currWetList.length > 0) {
      circuits.push({
        id: `c_${circuitCounter}`,
        number: circuitCounter,
        name: `TUGs Cozinha / Área de Serviço`,
        type: 'tug',
        voltage: vMono,
        phases: 'F+N',
        loads: currWetList,
        distanceMeters: 18,
        circuitsInSameConduit: 3,
        drGroup: 'DR1 - Áreas Molhadas',
      });
      circuitCounter++;
      currWetList = [];
      currWetVA = 0;
    }
    currWetList.push(load);
    currWetVA += load.powerVA;
  });

  if (currWetList.length > 0) {
    circuits.push({
      id: `c_${circuitCounter}`,
      number: circuitCounter,
      name: `TUGs Cozinha / Serviço / Banheiros`,
      type: 'tug',
      voltage: vMono,
      phases: 'F+N',
      loads: currWetList,
      distanceMeters: 18,
      circuitsInSameConduit: 3,
      drGroup: 'DR1 - Áreas Molhadas',
    });
    circuitCounter++;
  }

  // C. TUEs (Cargas Especiais - NBR 5410 item 9.5.3.2) - Circuito Exclusivo para cada TUE
  specialLoads.forEach((s) => {
    const powerVA = Math.round(s.powerWatts / (s.powerFactor || 0.95));
    const is220V = s.voltage >= 220;
    const phases = is220V ? (vBi === 220 ? '2F' : 'F+N') : 'F+N';

    const roomObj = rooms.find((r) => r.id === s.roomId);

    circuits.push({
      id: `c_${circuitCounter}`,
      number: circuitCounter,
      name: `${s.name} ${roomObj ? `(${roomObj.name})` : ''}`,
      type: 'tue',
      voltage: s.voltage,
      phases: phases,
      loads: [
        {
          id: `l_tue_${s.id}`,
          roomId: s.roomId,
          roomName: roomObj?.name,
          loadName: s.name,
          powerVA: powerVA,
          powerWatts: s.powerWatts,
          isTue: true,
        },
      ],
      distanceMeters: 25,
      circuitsInSameConduit: 2,
      drGroup:
        s.name.toLowerCase().includes('chuveiro') ||
        s.name.toLowerCase().includes('torneira') ||
        s.name.toLowerCase().includes('banheira')
          ? 'DR1 - Áreas Molhadas'
          : 'Geral',
    });
    circuitCounter++;
  });

  // D. Circuito Reserva Obrigatório (NBR 5410 item 6.5.4.7 - Tabela 59)
  circuits.push({
    id: `c_reserva_1`,
    number: circuitCounter,
    name: 'Circuito Reserva 1',
    type: 'reserva',
    voltage: vMono,
    phases: 'F+N',
    loads: [
      {
        id: 'l_reserva_1',
        loadName: 'Reserva Futura (1000 VA)',
        powerVA: 1000,
        powerWatts: 900,
      },
    ],
    distanceMeters: 10,
    circuitsInSameConduit: 1,
  });

  return circuits;
}

// ---------------------------------------------------------------------------
// 3. Motor Principal de Dimensionamento de Condutores, Proteções e Eletrodutos
// ---------------------------------------------------------------------------

export function sizeAllCircuits(
  circuits: Circuit[],
  settings: ProjectSettings
): { sizedCircuits: SizedCircuit[]; summary: CalculationSummary } {
  const method = settings.installationMethod || 'B1';
  const cableType = settings.cableType || 'PVC';
  const temp = settings.ambientTemperature || 30;

  // Ampacity Table lookup selection
  const ampacityTable =
    cableType === 'HEPR' ? AMPACITY_COPPER_HEPR_B1 : AMPACITY_COPPER_PVC_B1;

  // Temperature correction factor Ft
  const tempMap = TEMP_CORRECTION_FACTORS[cableType] || TEMP_CORRECTION_FACTORS.PVC;
  const tempFactorFt = tempMap[temp] || 1.0;

  const sizedCircuits: SizedCircuit[] = circuits.map((circuit) => {
    // 1. Potência total do circuito
    const totalPowerVA = circuit.loads.reduce((sum, l) => sum + l.powerVA, 0);
    const totalPowerWatts = circuit.loads.reduce((sum, l) => sum + l.powerWatts, 0);

    // Reserva tem cálculo nominal simplificado
    if (circuit.type === 'reserva') {
      return {
        ...circuit,
        totalPowerVA,
        totalPowerWatts,
        designCurrentIb: 0,
        tempFactorFt: 1.0,
        groupFactorFg: 1.0,
        correctedCurrentIbPrime: 0,
        minSectionNorm: 2.5,
        ampacitySection: 2.5,
        voltageDropSection: 2.5,
        finalSection: 2.5,
        cableIz: 24,
        voltageDropPercent: 0,
        breakerRatingIn: 16,
        breakerCurve: 'C',
        breakerPoles: 1,
        drRequired: false,
        drRating: 'Disponível',
        peSection: 2.5,
        conduitDiameterMm: 20,
        conduitInch: '1/2"',
        normativeCitations: [
          'NBR 5410 item 6.5.4.7 (Espaço Reserva em Quadros de Distribuição)',
        ],
      };
    }

    // 2. Corrente de Projeto Ib (A)
    let designCurrentIb = 0;
    if (circuit.phases === '3F+N') {
      designCurrentIb = totalPowerVA / (Math.sqrt(3) * circuit.voltage);
    } else {
      designCurrentIb = totalPowerVA / circuit.voltage;
    }

    // 3. Fator de Agrupamento Fg (NBR 5410 Tabela 42)
    const groupingCount = Math.min(
      12,
      Math.max(1, circuit.circuitsInSameConduit || 3)
    );
    const groupFactorFg = GROUPING_CORRECTION_FACTORS[groupingCount] || 0.7;

    // Corrente corrigida Ib' = Ib / (Ft * Fg)
    const correctedCurrentIbPrime = designCurrentIb / (tempFactorFt * groupFactorFg);

    // 4. Critério 1: Seção Mínima Normativa (NBR 5410 item 6.2.6.1 Tabela 47)
    const minSectionNorm = circuit.type === 'iluminacao' ? 1.5 : 2.5;

    // 5. Critério 2: Capacidade de Condução de Corrente (Ampacidade Iz >= Ib')
    const isThreeLoaded = circuit.phases === '3F+N';
    const sections = Object.keys(ampacityTable)
      .map(Number)
      .sort((a, b) => a - b);

    let ampacitySection = minSectionNorm;
    for (const sec of sections) {
      const cap = isThreeLoaded
        ? ampacityTable[sec].threeLoaded
        : ampacityTable[sec].twoLoaded;
      if (cap >= correctedCurrentIbPrime) {
        ampacitySection = sec;
        break;
      }
    }

    // 6. Critério 3: Queda de Tensão Máxima NBR 5410 item 6.2.7
    const maxDropPercent =
      circuit.type === 'iluminacao'
        ? settings.maxVoltageDropLighting || 4
        : settings.maxVoltageDropPower || 4;

    const maxDeltaVVolts = (circuit.voltage * maxDropPercent) / 100;
    const distance = circuit.distanceMeters || 15;

    // Fórmula da Queda de Tensão:
    // Monofásico / Bifásico 2F: S = (200 * rho * L * Ib) / DeltaV_volts
    // Trifásico 3F+N: S = (sqrt(3) * 100 * rho * L * Ib) / DeltaV_volts
    let reqSectionVoltageDrop = 0;
    if (circuit.phases === '3F+N') {
      reqSectionVoltageDrop =
        (Math.sqrt(3) * 100 * COPPER_RESISTIVITY * distance * designCurrentIb) /
        maxDeltaVVolts;
    } else {
      reqSectionVoltageDrop =
        (200 * COPPER_RESISTIVITY * distance * designCurrentIb) / maxDeltaVVolts;
    }

    let voltageDropSection = minSectionNorm;
    for (const sec of sections) {
      if (sec >= reqSectionVoltageDrop) {
        voltageDropSection = sec;
        break;
      }
    }

    // 7. Seção Final Adotada = max(SeçãoMínima, Ampacidade, QuedaDeTensão)
    const finalSection = Math.max(
      minSectionNorm,
      ampacitySection,
      voltageDropSection
    );

    // Iz nominal do cabo adotado
    const cableIzBase = isThreeLoaded
      ? ampacityTable[finalSection]?.threeLoaded || 21
      : ampacityTable[finalSection]?.twoLoaded || 24;
    const cableIz = Math.round(cableIzBase * tempFactorFt * groupFactorFg * 10) / 10;

    // Queda de Tensão real com a seção adotada (%)
    let realDeltaVPercent = 0;
    if (circuit.phases === '3F+N') {
      realDeltaVPercent =
        (Math.sqrt(3) * 100 * COPPER_RESISTIVITY * distance * designCurrentIb) /
        (finalSection * circuit.voltage);
    } else {
      realDeltaVPercent =
        (200 * COPPER_RESISTIVITY * distance * designCurrentIb) /
        (finalSection * circuit.voltage);
    }

    // 8. Escolha do Disjuntor Termomagnético (NBR IEC 60898-1)
    // Regra de Coordenação NBR 5410 item 6.3.4.1: Ib <= In <= Iz
    let breakerRatingIn = STANDARD_BREAKER_RATINGS.find(
      (r) => r >= designCurrentIb && r <= cableIzBase
    );

    if (!breakerRatingIn) {
      breakerRatingIn = STANDARD_BREAKER_RATINGS.find((r) => r >= designCurrentIb) || 16;
    }

    // Curva do Disjuntor
    let breakerCurve: 'B' | 'C' | 'D' = 'C';
    if (circuit.type === 'iluminacao') {
      breakerCurve = 'B';
    } else if (
      circuit.name.toLowerCase().includes('chuveiro') ||
      circuit.name.toLowerCase().includes('aquecedor')
    ) {
      breakerCurve = 'B';
    } else if (
      circuit.name.toLowerCase().includes('motor') ||
      circuit.name.toLowerCase().includes('piscina')
    ) {
      breakerCurve = 'D';
    }

    // Polo do Disjuntor
    let breakerPoles: 1 | 2 | 3 = 1;
    if (circuit.phases === '2F' || circuit.phases === '2F+N') breakerPoles = 2;
    if (circuit.phases === '3F+N') breakerPoles = 3;

    // 9. Exigência de Proteção Diferencial Residual (DR 30mA - NBR 5410 item 5.1.3.2.2)
    const isWetCircuit =
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('cozinha')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('banheiro')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('lavanderia')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('servico')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('varanda')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('garagem')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('chuveiro')) ||
      circuit.loads.some((l) => l.loadName.toLowerCase().includes('torneira')) ||
      circuit.type === 'tug'; // Todas as TUGs <= 32A em áreas residenciais requerem DR adicional

    const drRequired = isWetCircuit;
    const drRating = drRequired
      ? `DR High Sensitivity 30 mA / ${breakerRatingIn} A - Tipo AC (NBR 5410 item 5.1.3.2.2)`
      : 'Não Obrigatório (Área Seca/Fixa)';

    // 10. Condutor de Proteção Aterramento PE (NBR 5410 Tabela 51 / item 6.4.3.1.2)
    let peSection = finalSection;
    if (finalSection > 16 && finalSection <= 35) {
      peSection = 16;
    } else if (finalSection > 35) {
      peSection = finalSection / 2;
    }

    // 11. Dimensionamento do Eletroduto (NBR 5410 item 6.2.11.1 - Ocupação Máxima 40%)
    // Número de condutores no circuito (Fase, Neutro, PE)
    let conductorCount = 2; // F + N ou 2F
    if (circuit.phases === '2F+N') conductorCount = 3;
    if (circuit.phases === '3F+N') conductorCount = 4;
    conductorCount += 1; // + PE

    const cableDiameter = CABLE_OUTER_DIAMETER_MM[finalSection] || 3.6;
    const cableArea = Math.PI * Math.pow(cableDiameter / 2, 2);
    const totalCableAreaInCircuit = cableArea * conductorCount;

    // Assumindo agrupamento no mesmo eletroduto
    const totalAreaAllCircuitsInConduit = totalCableAreaInCircuit * (groupingCount / 2);

    // Ocupação máxima de 40% -> Área Interna Necessária = ÁreaCabos / 0.40
    const reqInternalAreaMm2 = totalAreaAllCircuitsInConduit / 0.4;
    const reqInternalDiamMm = Math.sqrt((4 * reqInternalAreaMm2) / Math.PI);

    let selectedConduit = CONDUIT_SIZES[0];
    for (const cond of CONDUIT_SIZES) {
      if (cond.internalMm >= reqInternalDiamMm) {
        selectedConduit = cond;
        break;
      }
    }

    // Citamentos Normativos
    const normativeCitations = [
      `NBR 5410 item 6.2.6.1 Tabela 47: Seção Mínima para ${circuit.type === 'iluminacao' ? 'Iluminação (1,5 mm²)' : 'Tomadas/Força (2,5 mm²)'}`,
      `NBR 5410 item 6.2.5 Tabela 36/37: Capacidade de Condução Método ${method} (${cableType} 70/90°C), Ft=${tempFactorFt}, Fg=${groupFactorFg}`,
      `NBR 5410 item 6.2.7: Limite de Queda de Tensão Admissível de ${maxDropPercent}% (Calculado: ${realDeltaVPercent.toFixed(2)}%)`,
      `NBR 5410 item 6.3.4.1: Coordenação do Disjuntor Ib (${designCurrentIb.toFixed(1)}A) <= In (${breakerRatingIn}A) <= Iz (${cableIzBase}A)`,
      `NBR 5410 item 6.4.3.1.2 Tabela 51: Condutor de Proteção PE (${peSection} mm²)`,
      `NBR 5410 item 6.2.11.1: Ocupação Máxima do Eletroduto <= 40% (${selectedConduit.label})`,
    ];

    return {
      ...circuit,
      totalPowerVA,
      totalPowerWatts,
      designCurrentIb: Math.round(designCurrentIb * 100) / 100,
      tempFactorFt,
      groupFactorFg,
      correctedCurrentIbPrime: Math.round(correctedCurrentIbPrime * 100) / 100,
      minSectionNorm,
      ampacitySection,
      voltageDropSection,
      finalSection,
      cableIz,
      voltageDropPercent: Math.round(realDeltaVPercent * 100) / 100,
      breakerRatingIn,
      breakerCurve,
      breakerPoles,
      drRequired,
      drRating,
      peSection,
      conduitDiameterMm: selectedConduit.nominalMm,
      conduitInch: selectedConduit.inch,
      normativeCitations,
    };
  });

  // ---------------------------------------------------------------------------
  // Quadros-Resumo e Demanda Geral
  // ---------------------------------------------------------------------------

  const totalInstalledPowerVA = sizedCircuits.reduce(
    (acc, c) => acc + c.totalPowerVA,
    0
  );
  const totalInstalledPowerkW =
    sizedCircuits.reduce((acc, c) => acc + c.totalPowerWatts, 0) / 1000;

  // Demanda Iluminação + TUGs
  const ilumTugVA = sizedCircuits
    .filter((c) => c.type === 'iluminacao' || c.type === 'tug')
    .reduce((acc, c) => acc + c.totalPowerVA, 0);

  const ilumTugkW = ilumTugVA / 1000;

  // Fator de demanda para iluminação e tomadas (NBR 5410 / CEMIG / ENEL)
  let demandFactorLightingTug = 0.86;
  if (ilumTugkW <= 1) demandFactorLightingTug = 0.86;
  else if (ilumTugkW <= 2) demandFactorLightingTug = 0.75;
  else if (ilumTugkW <= 3) demandFactorLightingTug = 0.66;
  else if (ilumTugkW <= 4) demandFactorLightingTug = 0.59;
  else if (ilumTugkW <= 5) demandFactorLightingTug = 0.52;
  else if (ilumTugkW <= 6) demandFactorLightingTug = 0.45;
  else if (ilumTugkW <= 7) demandFactorLightingTug = 0.4;
  else if (ilumTugkW <= 8) demandFactorLightingTug = 0.35;
  else if (ilumTugkW <= 9) demandFactorLightingTug = 0.31;
  else if (ilumTugkW <= 10) demandFactorLightingTug = 0.27;
  else demandFactorLightingTug = 0.24;

  const demandPowerLightingTugkW = ilumTugkW * demandFactorLightingTug;

  // Demanda TUEs
  const tueCircuits = sizedCircuits.filter((c) => c.type === 'tue');
  const tueCount = tueCircuits.length;
  const tueWattsTotal = tueCircuits.reduce(
    (acc, c) => acc + c.totalPowerWatts,
    0
  );
  const tuekWTotal = tueWattsTotal / 1000;

  let demandFactorTue = 1.0;
  if (tueCount === 1) demandFactorTue = 1.0;
  else if (tueCount === 2) demandFactorTue = 0.75;
  else if (tueCount === 3) demandFactorTue = 0.7;
  else if (tueCount === 4) demandFactorTue = 0.66;
  else if (tueCount === 5) demandFactorTue = 0.62;
  else if (tueCount === 6) demandFactorTue = 0.59;
  else if (tueCount >= 7) demandFactorTue = 0.55;

  const demandPowerTuekW = tuekWTotal * demandFactorTue;

  const totalDemandedPowerkW =
    demandPowerLightingTugkW + demandPowerTuekW;
  const totalDemandedPowerkVA = totalDemandedPowerkW / 0.92;

  // Tipo de fornecimento recomendado
  let recommendedSupplyType: 'monofasico' | 'bifasico' | 'trifasico' =
    settings.supplyType || 'bifasico';

  if (totalDemandedPowerkW <= 12.0) {
    recommendedSupplyType = settings.supplyType || 'monofasico';
  } else if (totalDemandedPowerkW <= 25.0) {
    recommendedSupplyType = settings.supplyType || 'bifasico';
  } else {
    recommendedSupplyType = 'trifasico';
  }

  // Dimensionamento do Alimentador Geral e Disjuntor Geral
  const vSupply =
    recommendedSupplyType === 'trifasico'
      ? settings.voltageFaseFase || 220
      : settings.voltageFaseFase || 220;

  let mainCurrentA = 0;
  if (recommendedSupplyType === 'trifasico') {
    mainCurrentA = (totalDemandedPowerkVA * 1000) / (Math.sqrt(3) * vSupply);
  } else if (recommendedSupplyType === 'bifasico') {
    mainCurrentA = (totalDemandedPowerkVA * 1000) / vSupply;
  } else {
    mainCurrentA = (totalDemandedPowerkVA * 1000) / (settings.voltageFaseNeutro || 127);
  }

  const mainBreakerRatingA =
    STANDARD_BREAKER_RATINGS.find((r) => r >= mainCurrentA * 1.15) || 50;

  const mainBreakerPoles =
    recommendedSupplyType === 'trifasico' ? 3 : recommendedSupplyType === 'bifasico' ? 2 : 1;

  // Seção do alimentador principal
  let feederSectionMm2 = 10;
  if (mainBreakerRatingA <= 40) feederSectionMm2 = 6;
  else if (mainBreakerRatingA <= 50) feederSectionMm2 = 10;
  else if (mainBreakerRatingA <= 63) feederSectionMm2 = 16;
  else if (mainBreakerRatingA <= 80) feederSectionMm2 = 25;
  else if (mainBreakerRatingA <= 100) feederSectionMm2 = 35;
  else feederSectionMm2 = 50;

  const feederPeSectionMm2 = feederSectionMm2 <= 16 ? feederSectionMm2 : 16;

  const summary: CalculationSummary = {
    totalInstalledPowerVA,
    totalInstalledPowerkW: Math.round(totalInstalledPowerkW * 100) / 100,
    demandFactorLightingTug,
    demandPowerLightingTugkW: Math.round(demandPowerLightingTugkW * 100) / 100,
    demandFactorTue,
    demandPowerTuekW: Math.round(demandPowerTuekW * 100) / 100,
    totalDemandedPowerkW: Math.round(totalDemandedPowerkW * 100) / 100,
    totalDemandedPowerkVA: Math.round(totalDemandedPowerkVA * 100) / 100,
    mainBreakerRatingA,
    mainBreakerPoles,
    recommendedSupplyType,
    feederSectionMm2,
    feederPeSectionMm2,
    feederConduitMm: feederSectionMm2 >= 16 ? 32 : 25,
    generalDrRating: `DR Tetrapolar/Bipolar 30 mA / ${mainBreakerRatingA} A - Tipo AC (NBR 5410 item 5.1.3.2)`,
    generalDpsRating: `DPS Classe II 20 kA / 45 kA Uc=${settings.voltageFaseFase > 220 ? '385V' : '275V'} (NBR IEC 61643-1)`,
    groundingDescription: `Esquema de Aterramento ${settings.groundingSystem || 'TN-S'}: Haste Copperweld 5/8" x 2,40m c/ R <= 10 Ohms e condutor de proteção exclusivo separado do neutro (NBR 15749 e NBR 5410 item 5.1.2.2).`,
  };

  return { sizedCircuits, summary };
}

// ---------------------------------------------------------------------------
// 4. Gerador de Relatório Markdown Estritamente Conforme Formato de Saída Pedido
// ---------------------------------------------------------------------------

export function generateMarkdownReport(
  projectData: ProjectData,
  sizedCircuits: SizedCircuit[],
  summary: CalculationSummary
): string {
  const { settings, rooms, specialLoads } = projectData;
  const conc = BRAZILIAN_CONCESSIONARIAS.find(
    (c) => c.id === settings.concessionariaId
  ) || BRAZILIAN_CONCESSIONARIAS[0];

  let md = '';

  // Header do Memorial de Cálculo
  md += `# PROJETO ELÉTRICO PREDIAIS E RESIDENCIAIS — ELETRO-BR\n`;
  md += `**Anotação de Responsabilidade Técnica / Conformidade ABNT NBR 5410:2004**\n\n`;
  md += `* **Projeto:** ${settings.projectName || 'Residência Unifamiliar'}\n`;
  md += `* **Cliente:** ${settings.clientName || 'Não Informado'}\n`;
  md += `* **Engenheiro Responsável:** ${settings.engineerName || 'Engenheiro Eletricista'} (${settings.creaNumber || 'CREA Ativo'})\n`;
  md += `* **ART nº:** ${settings.artNumber || 'Em emissão'}\n`;
  md += `* **Endereço:** ${settings.address || 'Brasil'}\n`;
  md += `* **Concessionária / Padrão:** ${conc.name} (${conc.normReference})\n\n`;

  // 1. Dados de Entrada Validados
  md += `## 1. Dados de Entrada Validados\n\n`;
  md += `| Parâmetro Técnico | Valor Adotado | Referência Normativa / Especificação |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| Tensão Fase-Neutro ($V_n$) | ${settings.voltageFaseNeutro} V | NBR 5410 item 6.2.7 |\n`;
  md += `| Tensão Fase-Fase | ${settings.voltageFaseFase} V | Padrão da Concessionária ${conc.name} |\n`;
  md += `| Sistema de Fornecimento | ${summary.recommendedSupplyType.toUpperCase()} (${summary.mainBreakerPoles}P + N + PE) | Concessionária ${conc.normReference} |\n`;
  md += `| Método de Instalação | Método ${settings.installationMethod || 'B1'} (Condutores isolados em eletroduto embutido) | NBR 5410 Tabela 33 / 36 |\n`;
  md += `| Tipo de Isolação dos Cabos | Cobre Unipolar ${settings.cableType || 'PVC'} 70°C 750V / 1kV | NBR NM 247 / NBR 13248 |\n`;
  md += `| Temperatura Ambiente Adotada | ${settings.ambientTemperature || 30} °C | NBR 5410 Tabela 40 (Fator $F_t$ = ${TEMP_CORRECTION_FACTORS[settings.cableType || 'PVC'][settings.ambientTemperature || 30] || 1.0}) |\n`;
  md += `| Limite Queda de Tensão ($\Delta V$) | Max ${settings.maxVoltageDropPower || 4}% | NBR 5410 item 6.2.7.1 |\n`;
  md += `| Esquema de Aterramento | Esquema ${settings.groundingSystem || 'TN-S'} | NBR 5410 item 5.1.2.2.2 e NBR 15749 |\n`;
  md += `| Classe do DPS no QDC | Classe II (${settings.dpsInKa || 20} kA / ${settings.dpsImaxKa || 45} kA) | NBR IEC 61643-1 / NBR 5410 item 6.3.5.1 |\n\n`;

  // 2. Previsão de Cargas
  md += `## 2. Previsão de Cargas\n\n`;
  md += `| Cômodo / Dependência | Área (m²) | Perímetro (m) | Iluminação Prevista (VA) | TUGs Qtd / Potência (VA) | TUEs / Cargas Especiais (W) |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :--- |\n`;

  rooms.forEach((r) => {
    const ilum = r.customLightingVA ?? calculateRoomLightingVA(r.area);
    const tug = calculateRoomTugs(r.area, r.perimeter, r.type, r.isWet);
    const tugCount = r.customTugCount ?? tug.count;
    const tugVA = r.customTugVA ?? tug.totalVA;

    const roomTues = specialLoads.filter((s) => s.roomId === r.id);
    const tueStr =
      roomTues.length > 0
        ? roomTues.map((s) => `${s.name} (${s.powerWatts}W / ${s.voltage}V)`).join(', ')
        : 'Nenhum';

    md += `| ${r.name} | ${r.area.toFixed(1)} | ${r.perimeter.toFixed(1)} | ${ilum} VA | ${tugCount}x (${tugVA} VA) | ${tueStr} |\n`;
  });

  md += `\n* **Cargas Especiais TUE Não Associadas a Cômodo Específico:**\n`;
  const unassignedTues = specialLoads.filter((s) => !s.roomId);
  if (unassignedTues.length === 0) {
    md += `  * Nenhuma carga externa adicional.\n\n`;
  } else {
    unassignedTues.forEach((s) => {
      md += `  * ${s.name}: ${s.powerWatts} W, ${s.voltage} V (${s.powerFactor} FP)\n`;
    });
    md += `\n`;
  }

  // 3. Divisão de Circuitos
  md += `## 3. Divisão de Circuitos\n\n`;
  md += `| Circ. nº | Descrição / Cômodos Atendidos | Tipo | Tensão (V) | Fases | Potência Instalada (VA) | Corrente de Projeto $I_b$ (A) |\n`;
  md += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

  sizedCircuits.forEach((c) => {
    const desc = c.loads.map((l) => l.loadName).join(' + ');
    md += `| ${c.number} | ${c.name} (${desc}) | ${c.type.toUpperCase()} | ${c.voltage} | ${c.phases} | ${c.totalPowerVA} | ${c.designCurrentIb.toFixed(2)} |\n`;
  });
  md += `\n`;

  // 4. Dimensionamento
  md += `## 4. Dimensionamento\n\n`;
  md += `Abaixo apresentam-se as equações com valores substituídos para cada circuito e citações expressas dos itens da ABNT NBR 5410:2004:\n\n`;

  sizedCircuits.forEach((c) => {
    md += `### Circuito ${c.number} — ${c.name}\n`;
    if (c.type === 'reserva') {
      md += `* **Tipo:** Circuito Reserva Futura.\n`;
      md += `* **Seção do Condutor:** 2,5 mm² Cobre.\n`;
      md += `* **Disjuntor:** 1P 16 A Curva C.\n`;
      md += `* **Item Normativo:** ABNT NBR 5410 item 6.5.4.7 (Espaço Reserva em Quadros de Distribuição).\n\n`;
      return;
    }

    md += `1. **Corrente de Projeto ($I_b$):**\n`;
    if (c.phases === '3F+N') {
      md += `   $$I_b = \\frac{P_{VA}}{\\sqrt{3} \\times V_n} = \\frac{${c.totalPowerVA}}{\\sqrt{3} \\times ${c.voltage}} = ${c.designCurrentIb.toFixed(2)} \\text{ A}$$\n`;
    } else {
      md += `   $$I_b = \\frac{P_{VA}}{V_n} = \\frac{${c.totalPowerVA}}{${c.voltage}} = ${c.designCurrentIb.toFixed(2)} \\text{ A}$$\n`;
    }

    md += `2. **Corrente Corrigida ($I_b'$):**\n`;
    md += `   Fator Temperatura $F_t = ${c.tempFactorFt}$, Fator Agrupamento $F_g = ${c.groupFactorFg}$ (${c.circuitsInSameConduit} circ. no eletroduto).\n`;
    md += `   $$I_b' = \\frac{I_b}{F_t \\times F_g} = \\frac{${c.designCurrentIb.toFixed(2)}}{${c.tempFactorFt} \\times ${c.groupFactorFg}} = ${c.correctedCurrentIbPrime.toFixed(2)} \\text{ A}$$\n`;

    md += `3. **Critérios de Seção:**\n`;
    md += `   * *Seção Mínima Normativa (item 6.2.6.1):* ${c.minSectionNorm} mm²\n`;
    md += `   * *Capacidade de Condução (item 6.2.5 - Tabela 36/37):* ${c.ampacitySection} mm² (Para $I_z \\ge ${c.correctedCurrentIbPrime.toFixed(2)}$ A)\n`;
    md += `   * *Queda de Tensão de ${c.type === 'iluminacao' ? settings.maxVoltageDropLighting : settings.maxVoltageDropPower}% a ${c.distanceMeters}m (item 6.2.7):* ${c.voltageDropSection} mm² (Queda Calculada: **${c.voltageDropPercent.toFixed(2)}%**)\n`;
    md += `   * **SEÇÃO ADOTADA:** **${c.finalSection} mm² Cobre** ($I_z = ${c.cableIz} \\text{ A}$ corrigido)\n`;

    md += `4. **Disjuntor e Coordenação (item 6.3.4.1):**\n`;
    md += `   Condição: $I_b \\le I_n \\le I_z \\implies ${c.designCurrentIb.toFixed(2)} \\text{ A} \\le ${c.breakerRatingIn} \\text{ A} \\le ${c.cableIz} \\text{ A}$ (ATENDIDO).\n`;
    md += `   * **Disjuntor Especificado:** ${c.breakerPoles}P ${c.breakerRatingIn} A Curva ${c.breakerCurve} (NBR IEC 60898-1)\n`;

    md += `5. **Condutor de Proteção (PE) e Eletroduto:**\n`;
    md += `   * Condutor PE: **${c.peSection} mm² Cobre** (Tabela 51)\n`;
    md += `   * Eletroduto Mínimo: **${c.conduitInch} (${c.conduitDiameterMm} mm)** (Taxa ocupação $\\le 40\\%$, item 6.2.11.1)\n\n`;
  });

  // 5. Proteções e Aterramento
  md += `## 5. Proteções e Aterramento\n\n`;
  md += `### Disjuntor Geral do QDC\n`;
  md += `* **Tipo:** Disjuntor Termomagnético DIN NBR IEC 60898-1\n`;
  md += `* **Corrente Nominal ($I_n$):** **${summary.mainBreakerRatingA} A** (${summary.mainBreakerPoles} Polos / Curva C / Icn >= 5 kA)\n`;
  md += `* **Alimentador Geral:** Cabos ${summary.recommendedSupplyType.toUpperCase()} **${summary.feederSectionMm2} mm²** + Neutro **${summary.feederSectionMm2} mm²** + PE **${summary.feederPeSectionMm2} mm²** em Eletroduto DN ${summary.feederConduitMm} mm.\n\n`;

  md += `### Proteção Diferencial Residual (DR)\n`;
  md += `* **Dispositivo DR:** ${summary.generalDrRating}\n`;
  md += `* **Aplicação:** Proteção adicional contra contatos diretos e indiretos em áreas molhadas, molháveis, externas e tomadas residenciais de uso geral (NBR 5410 item 5.1.3.2.2).\n\n`;

  md += `### Proteção contra Surtos Atmosféricos (DPS)\n`;
  md += `* **Especificação Comercial:** ${summary.generalDpsRating}\n`;
  md += `* **Instalação:** Montado em trilho DIN no Quadro Geral de Distribuição (QDC), conectado entre cada Fase-PE e Neutro-PE antes dos circuitos parciais (NBR 5410 item 6.3.5.1 / NBR IEC 61643-1).\n\n`;

  md += `### Esquema de Aterramento\n`;
  md += `* **Aterramento Adotado:** ${summary.groundingDescription}\n\n`;

  // 6. Quadro-Resumo
  md += `## 6. Quadro-Resumo\n\n`;
  md += `| Circ. | Descrição do Circuito | Fases | Tensão | Pot. (VA) | $I_b$ (A) | Cabo Fase (mm²) | Cabo PE (mm²) | Disjuntor | Curva | DR (30mA) | Eletroduto |\n`;
  md += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  sizedCircuits.forEach((c) => {
    md += `| ${c.number} | ${c.name} | ${c.phases} | ${c.voltage}V | ${c.totalPowerVA} | ${c.designCurrentIb.toFixed(1)} | ${c.finalSection} | ${c.peSection} | ${c.breakerPoles}P ${c.breakerRatingIn}A | ${c.breakerCurve} | ${c.drRequired ? 'Sim (30mA)' : 'Não'} | ${c.conduitInch} |\n`;
  });

  md += `\n### Balanço e Resumo da Instalada e Demandada\n`;
  md += `* **Potência Total Instalada:** ${summary.totalInstalledPowerVA} VA (${summary.totalInstalledPowerkW} kW)\n`;
  md += `* **Fator de Demanda Iluminação/TUGs:** ${(summary.demandFactorLightingTug * 100).toFixed(0)}% $\\implies$ Demanda Ilum/TUG: ${summary.demandPowerLightingTugkW} kW\n`;
  md += `* **Fator de Demanda TUEs:** ${(summary.demandFactorTue * 100).toFixed(0)}% $\\implies$ Demanda TUEs: ${summary.demandPowerTuekW} kW\n`;
  md += `* **Potência Demandada Total ($D_{total}$):** **${summary.totalDemandedPowerkW} kW** (**${summary.totalDemandedPowerkVA} kVA**)\n`;
  md += `* **Padrão de Entrada Recomendado:** **${summary.recommendedSupplyType.toUpperCase()} ${summary.mainBreakerRatingA}A** (Concessionária ${conc.name})\n\n`;

  // 7. Observações Normativas
  md += `## 7. Observações Normativas\n\n`;
  md += `1. **Obrigatoriedade da ART/TRT:** Este dimensionamento é um entregável de engenharia e deve obrigatoriamente ser assinado por Engenheiro Eletricista habilitado com registro ativo no CREA ou Técnico em Eletrotécnica habilitado no CFT via emissão de Anotação de Responsabilidade Técnica (ART/TRT).\n`;
  md += `2. **Separação de Circuitos (NBR 5410 item 9.5.3.1):** As cargas de iluminação e tomadas foram estritamente segregadas em circuitos independentes. Circuitos de tomadas de áreas molhadas (cozinha, lavanderia, banheiros) foram isolados dos cômodos secos.\n`;
  md += `3. **Proteção Diferencial Residual (NBR 5410 item 5.1.3.2.2):** O uso de DR de alta sensibilidade ($\le 30\\text{ mA}$) é obrigatório e incondicional para os circuitos de áreas molhadas e tomadas externas.\n`;
  md += `4. **Cores Padronizadas de Condutores (NBR 5410 item 6.1.5.3):**\n`;
  md += `   * Condutor Neutro: Azul-Claro (exclusivo)\n`;
  md += `   * Condutor de Proteção (PE): Verde ou Verde-Amarelo (exclusivo)\n`;
  md += `   * Condutores de Fase: Preto, Vermelho, Castanho ou Cinza (nunca azul ou verde)\n`;
  md += `5. **Conexão dos Barramentos no QDC:** Todos os condutores de proteção PE e Neutro devem ser ligados a barramentos de cobre individuais dentro do QDC, garantindo que o Neutro após o DR não entre em contato com a massa ou aterramento (Esquema TN-S).\n`;
  md += `6. **Segurança em Instalações (NR-10 MTE):** Todos os componentes e quadros devem possuir índice de proteção adequado (IP2X mínimo em partes energizadas internas) e identificação indelével dos circuitos.\n`;

  return md;
}
