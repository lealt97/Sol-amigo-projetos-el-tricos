import assert from 'node:assert/strict';
import type { FloorPlanWall } from '../src/types';
import {
  analyzeWallNetwork,
  canonicalizeWallCenterlineTopology,
  applyWallPrecisionConstraints,
  buildWallGraph,
  findClosedWallPerimeters,
  findClosedWallFaces,
  findWallNodeNearPoint,
  getConnectedWallIds,
} from '../src/utils/wallCadEngine';

const wall = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thicknessMeters = 0.15
): FloorPlanWall => ({
  id,
  x1Meters: x1,
  y1Meters: y1,
  x2Meters: x2,
  y2Meters: y2,
  thicknessMeters,
});

const nodeAt = (walls: FloorPlanWall[], x: number, y: number, radius = 0.004) => {
  const graph = buildWallGraph(walls);
  const node = findWallNodeNearPoint(graph, { x, y }, radius);
  assert.ok(node, `Nó esperado em (${x}, ${y})`);
  return { graph, node };
};

// 1) Perímetro fechado feito apenas com Desenhar Parede: uma única planta, 4 cantos L.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
  ];
  const analysis = analyzeWallNetwork(walls);
  assert.equal(analysis.componentCount, 1, 'retângulo fechado deve ser uma única rede');
  assert.equal(analysis.graph.nodes.filter((node) => node.kind === 'L').length, 4, 'retângulo deve ter 4 L');
  assert.deepEqual(new Set(getConnectedWallIds(analysis.graph, 'top')), new Set(['top', 'right', 'bottom', 'left']));
}

// 2) L + terceira parede no mesmo nó = T, sem depender de ordem de criação.
{
  const walls = [
    wall('left', 0, 0, 0, 2),
    wall('right', 0, 0, 2, 0),
    wall('extension', 0, 0, -2, 0),
  ];
  const { node } = nodeAt(walls, 0, 0);
  assert.equal(node.kind, 'T');
  assert.equal(node.branches.length, 3);
  assert.equal(node.throughPairs.length, 1);
}

// 3) T armazenado como contato na FACE física da parede ainda é um único nó lógico.
{
  const walls = [
    wall('host', 0, 0, 4, 0, 0.2),
    // Extremidade no y=+0,10 m (face do host), exatamente como desenhos legados.
    wall('stem', 2, 0.1, 2, 2, 0.1),
  ];
  const graph = buildWallGraph(walls, { defaultThicknessMeters: 0.15 });
  const node = findWallNodeNearPoint(graph, { x: 2, y: 0 }, 0.004);
  assert.ok(node, 'T legado deve gerar nó lógico no eixo da hospedeira');
  assert.equal(node.kind, 'T');
  assert.deepEqual(new Set(getConnectedWallIds(graph, 'host')), new Set(['host', 'stem']));
}

// 4) Duas paredes cruzando no meio = + (X topológico), mesmo sem split persistido.
{
  const walls = [
    wall('horizontal', -2, 0, 2, 0),
    wall('vertical', 0, -2, 0, 2),
  ];
  const { node } = nodeAt(walls, 0, 0);
  assert.equal(node.kind, 'X');
  assert.equal(node.branches.length, 4);
  assert.equal(node.throughPairs.length, 2);
}

// 5) Asterisco: três eixos passantes no mesmo nó, 6 ramificações e 3 pares opostos.
{
  const walls = [
    wall('h', -2, 0, 2, 0),
    wall('v', 0, -2, 0, 2),
    wall('d', -2, -2, 2, 2),
  ];
  const { node } = nodeAt(walls, 0, 0);
  assert.equal(node.kind, 'multi');
  assert.equal(node.branches.length, 6);
  assert.equal(node.throughPairs.length, 3);
}

// 6) Encontro tipo > / angular não pode ser confundido com L ortogonal.
{
  const walls = [
    wall('a', 0, 0, 2, 1),
    wall('b', 0, 0, 2, -1),
  ];
  const { node } = nodeAt(walls, 0, 0);
  assert.equal(node.kind, 'corner');
}

// 7) Y verdadeiro: 3 direções sem par colinear.
{
  const walls = [
    wall('a', 0, 0, 2, 0),
    wall('b', 0, 0, -1, 1.732),
    wall('c', 0, 0, -1, -1.732),
  ];
  const { node } = nodeAt(walls, 0, 0);
  assert.equal(node.kind, 'Y');
}

// 8) Diagnóstico de parede duplicada.
{
  const walls = [wall('a', 0, 0, 2, 0), wall('b', 2, 0, 0, 0)];
  const analysis = analyzeWallNetwork(walls);
  assert.ok(analysis.issues.some((issue) => issue.code === 'DUPLICATE'));
}

// 9) Uma extremidade quase encostada, mas fora do corpo físico, deve ser denunciada.
{
  const walls = [
    wall('host', 0, 0, 4, 0, 0.15),
    wall('near', 2, 0.09, 2, 1.5, 0.10),
  ];
  const analysis = analyzeWallNetwork(walls, { contactToleranceMeters: 0.004 });
  assert.ok(analysis.issues.some((issue) => issue.code === 'NEAR_MISS'));
}


// 10) Comprimento e ângulo exatos são hard constraints, independentes do grid.
{
  const precise = applyWallPrecisionConstraints(
    { x: 1, y: 1 },
    { x: 9, y: 7 },
    { lockedLengthMeters: 2, lockedAngleDeg: 0 }
  );
  assert.ok(Math.abs(precise.point.x - 3) < 1e-9);
  assert.ok(Math.abs(precise.point.y - 1) < 1e-9);
  assert.equal(precise.lengthMeters, 2);
  assert.equal(precise.angleDeg, 0);
}

// 11) Rastreamento polar quantiza o ângulo sem alterar o comprimento livre.
{
  const precise = applyWallPrecisionConstraints(
    { x: 0, y: 0 },
    { x: 2, y: -1.8 },
    { polarIncrementDeg: 45 }
  );
  assert.equal(precise.angleDeg, 45);
  assert.ok(Math.abs(precise.lengthMeters - Math.hypot(2, 1.8)) < 1e-9);
}

// 12) Perímetro simples fechado calcula área e perímetro reais.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
  ];
  const loops = findClosedWallPerimeters(walls);
  assert.equal(loops.length, 1);
  assert.ok(Math.abs(loops[0].areaSquareMeters - 12) < 1e-9);
  assert.ok(Math.abs(loops[0].perimeterMeters - 14) < 1e-9);
}

// 13) Rede aberta nunca é anunciada como perímetro fechado.
{
  const walls = [wall('a', 0, 0, 3, 0), wall('b', 3, 0, 3, 2)];
  assert.equal(findClosedWallPerimeters(walls).length, 0);
}


// 14) Uma divisória interna transforma um perímetro em duas faces, sem perder os ambientes.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
    wall('partition', 2, 0, 2, 3),
  ];
  const faces = findClosedWallFaces(walls);
  assert.equal(faces.length, 2);
  assert.ok(faces.every((face) => Math.abs(face.axisAreaSquareMeters - 6) < 1e-8));
  assert.ok(faces.every((face) => face.clearAreaSquareMeters > 5 && face.clearAreaSquareMeters < 6));
}

// 15) Divisória armazenada nas faces físicas superior/inferior ainda fecha duas faces lógicas.
{
  const walls = [
    wall('top', 0, 0, 4, 0, 0.15),
    wall('right', 4, 0, 4, 3, 0.15),
    wall('bottom', 4, 3, 0, 3, 0.15),
    wall('left', 0, 3, 0, 0, 0.15),
    wall('partition', 2, 0.075, 2, 2.925, 0.15),
  ];
  const faces = findClosedWallFaces(walls);
  assert.equal(faces.length, 2);
  assert.ok(Math.abs(faces.reduce((sum, face) => sum + face.axisAreaSquareMeters, 0) - 12) < 1e-8);
}

// 16) Cruz de duas divisórias dentro do retângulo gera quatro ambientes fechados.
{
  const walls = [
    wall('top', 0, 0, 4, 0),
    wall('right', 4, 0, 4, 3),
    wall('bottom', 4, 3, 0, 3),
    wall('left', 0, 3, 0, 0),
    wall('vertical', 2, 0, 2, 3),
    wall('horizontal', 0, 1.5, 4, 1.5),
  ];
  const faces = findClosedWallFaces(walls);
  assert.equal(faces.length, 4);
  assert.ok(faces.every((face) => Math.abs(face.axisAreaSquareMeters - 3) < 1e-8));
}

// 17) Rede aberta não produz faces falsas.
{
  const walls = [
    wall('a', 0, 0, 3, 0),
    wall('b', 3, 0, 3, 2),
    wall('c', 3, 2, 1, 2),
  ];
  assert.equal(findClosedWallFaces(walls).length, 0);
}


// 18) T legado salvo na face física é migrado para o eixo lógico da hospedeira.
{
  const walls = [
    wall('host', 0, 0, 4, 0, 0.20),
    wall('stem', 2, 0.10, 2, 2, 0.10),
  ];
  const canonical = canonicalizeWallCenterlineTopology(walls);
  const stem = canonical.find((item) => item.id === 'stem')!;
  assert.ok(Math.abs(stem.x1Meters - 2) < 1e-9);
  assert.ok(Math.abs(stem.y1Meters - 0) < 1e-9);
  const node = findWallNodeNearPoint(buildWallGraph(canonical), { x: 2, y: 0 }, 0.004);
  assert.equal(node?.kind, 'T');
}

// 19) Nó compartilhado ligeiramente desalinhado dentro da tolerância converge para um ponto único.
{
  const walls = [
    wall('a', 0, 0, 2, 0),
    wall('b', 2.001, 0.001, 2.001, 2),
  ];
  const canonical = canonicalizeWallCenterlineTopology(walls);
  const a = canonical.find((item) => item.id === 'a')!;
  const b = canonical.find((item) => item.id === 'b')!;
  assert.ok(Math.hypot(a.x2Meters - b.x1Meters, a.y2Meters - b.y1Meters) < 1e-9);
}

// 20) Canonização é idempotente e não altera uma topologia já canônica.
{
  const walls = [
    wall('host', 0, 0, 4, 0),
    wall('stem', 2, 0, 2, 2),
  ];
  const once = canonicalizeWallCenterlineTopology(walls);
  const twice = canonicalizeWallCenterlineTopology(once);
  assert.deepEqual(twice, once);
}

console.log('wall-cad-regression: 20 cenários críticos passaram');



