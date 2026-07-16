import { describe, it, expect } from 'vitest';
import {
  distance,
  horizontalDistance,
  angleDeg,
  midpoint,
  speed,
  tiltFromVerticalDeg,
} from '../../src/analysis/geometry';

describe('geometry.distance', () => {
  it('3-4-5 の直角三角形で 5', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10);
  });
  it('同一点は 0', () => {
    expect(distance({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(0);
  });
});

describe('geometry.horizontalDistance', () => {
  it('x 成分の絶対差(y は無視)', () => {
    expect(horizontalDistance({ x: 0.2, y: 0.9 }, { x: 0.8, y: 0.1 })).toBeCloseTo(0.6, 10);
  });
});

describe('geometry.angleDeg', () => {
  it('直角: (0,1)-(0,0)-(1,0) は 90°', () => {
    expect(angleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 6);
  });
  it('直線(伸展): (1,0)-(0,0)-(-1,0) は 180°', () => {
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 6);
  });
  it('0°: 同じ向き (1,0)-(0,0)-(2,0)', () => {
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0, 6);
  });
  it('45°: (1,1)-(0,0)-(1,0)', () => {
    expect(angleDeg({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(45, 6);
  });
});

describe('geometry.midpoint', () => {
  it('中点', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 2, y: 4 })).toEqual({ x: 1, y: 2 });
  });
});

describe('geometry.speed', () => {
  it('距離 5 を 100ms で移動 → 50 単位/秒', () => {
    expect(speed({ x: 0, y: 0 }, { x: 3, y: 4 }, 100)).toBeCloseTo(50, 10);
  });
  it('dt が 0 以下なら 0(ゼロ除算回避)', () => {
    expect(speed({ x: 0, y: 0 }, { x: 3, y: 4 }, 0)).toBe(0);
  });
});

describe('geometry.tiltFromVerticalDeg', () => {
  it('真下に伸びる線は垂直から 0°', () => {
    expect(tiltFromVerticalDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0, 6);
  });
  it('45° 傾き', () => {
    expect(tiltFromVerticalDeg({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45, 6);
  });
  it('水平線は 90°', () => {
    expect(tiltFromVerticalDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 6);
  });
  it('左右どちらの傾きでも正の角度', () => {
    expect(tiltFromVerticalDeg({ x: 0, y: 0 }, { x: -1, y: 1 })).toBeCloseTo(45, 6);
  });
});
