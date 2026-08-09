import assert from 'node:assert/strict';
import type { FloorPlanWall } from '../src/types';
import {
  analyzeWallNetwork,
  buildWallGraph,
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

console.log('wall-cad-regression: 9 cenários críticos passaram');
