import type { Pt } from '../../src/engine/types';

const P = (x: number, y: number): Pt => ({ x, y });

export const TV1_GUIDES = { ascenderY: 100, xHeightY: 220, baselineY: 340, descenderY: 420 };
export const TV1_PEN_WIDTH_PX = 16;
export const TV1_S = 2.5;
export const TV1_W = 40;

export const TV1A = {
  raw: [P(130, 100), P(140, 220), P(150, 340)],
  n1: [P(325, 100), P(350, 400), P(375, 700)],
  n4: [P(60, 100), P(85, 400), P(110, 700)],
  bbox: { minX: 40, minY: 80, maxX: 130, maxY: 720 },
  advance: 170,
  slantDeg: -4.763642,
};

export const TV1B = {
  raw: [P(100, 330), P(103, 342), P(98, 360)],
  n1: [P(250, 675), P(257.5, 705), P(245, 750)],
  n3: [P(250, 630), P(257.5, 660), P(245, 705)],
  n4: [P(65, 630), P(72.5, 660), P(60, 705)],
  bbox: { minX: 40, minY: 610, maxX: 92.5, maxY: 725 },
  advance: 132.5,
};

export const TV1C = {
  heights: [300, 306, 312.12, 318.3624, 324.729648, 331.22424096],
  medianHeight: 315.2412,
  meanIndex: 2.5,
  b: 0.01980263,
  k: [1.0507525, 1.0301495, 1.0099505, 0.9901475, 0.9707329, 0.9516989],
  correctedHeight: 315.22575,
};

export const TV2A = {
  points: [P(0, 0), P(100, 0), P(200, 100), P(300, 100)],
  segments: [
    { p0: P(0, 0), p1: P(33.3333, 0), p2: P(66.6667, -16.6667), p3: P(100, 0) },
    { p0: P(100, 0), p1: P(133.3333, 16.6667), p2: P(166.6667, 83.3333), p3: P(200, 100) },
    { p0: P(200, 100), p1: P(233.3333, 116.6667), p2: P(266.6667, 100), p3: P(300, 100) },
  ],
};

export const TV2B = {
  centerline: [P(0, 0), P(50, 0), P(100, 0)],
  half: [10, 15, 10],
  left: [P(0, -10), P(50, -15), P(100, -10)],
  right: [P(0, 10), P(50, 15), P(100, 10)],
  leftCubics: [
    { p1: P(16.6667, -11.6667), p2: P(33.3333, -15), p3: P(50, -15) },
    { p1: P(66.6667, -15), p2: P(83.3333, -11.6667), p3: P(100, -10) },
  ],
  endCap: {
    apex: P(110, 0),
    arc1: { c1: P(105.522847, -10), c2: P(110, -5.522847), end: P(110, 0) },
    arc2: { c1: P(110, 5.522847), c2: P(105.522847, 10), end: P(100, 10) },
  },
};

export const TV2C = {
  W: 40,
  I: 0.6,
  p: 0.5,
  width: 38.157673,
  widthNoPressure: 40,
  synthesizedAtV0: 0.95,
  synthesizedAtV2400: 0.5075156,
};

export const TV4_CIRCLE = {
  radius: 150,
  durationSeconds: 0.6,
};