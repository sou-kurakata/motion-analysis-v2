import { describe, it, expect } from 'vitest';
import { movingAverage, oneEuroFilter } from '../../src/analysis/smoothing';

describe('smoothing.movingAverage', () => {
  it('窓3・端は縮小窓で平均(手計算)', () => {
    // [1,2,3,4,5], window=3 → [1.5, 2, 3, 4, 4.5]
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
  });
  it('窓1 は元の配列のまま', () => {
    expect(movingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
  it('定数列は定数のまま', () => {
    expect(movingAverage([5, 5, 5], 5)).toEqual([5, 5, 5]);
  });
  it('空配列は空', () => {
    expect(movingAverage([], 5)).toEqual([]);
  });
});

describe('smoothing.oneEuroFilter', () => {
  const ts = (n: number, stepMs = 10) =>
    Array.from({ length: n }, (_, i) => i * stepMs);

  it('定数入力は定数出力(微分0でカットオフ最小)', () => {
    const out = oneEuroFilter([7, 7, 7, 7], ts(4));
    for (const v of out) expect(v).toBeCloseTo(7, 10);
  });

  it('最初の出力は最初の入力そのもの(初期化)', () => {
    const out = oneEuroFilter([3, 9, 1, 8], ts(4));
    expect(out[0]).toBe(3);
  });

  it('長さを保持し、空配列は空', () => {
    expect(oneEuroFilter([], [])).toEqual([]);
    expect(oneEuroFilter([1, 2, 3], ts(3))).toHaveLength(3);
  });

  it('ステップ入力: 出力は入力範囲内で単調に追従', () => {
    const input = [0, 0, 0, 1, 1, 1];
    const out = oneEuroFilter(input, ts(6));
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]!);
    }
    // ラグがあるため、ステップ直後は完全には 1 に到達しない
    expect(out[3]!).toBeLessThan(1);
  });

  it('dt が 0 のサンプルはゼロ除算せず値を通す', () => {
    const out = oneEuroFilter([0, 5, 5], [0, 0, 10]);
    expect(out).toHaveLength(3);
    expect(Number.isFinite(out[1]!)).toBe(true);
  });
});
