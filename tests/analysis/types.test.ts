import { describe, it, expect } from 'vitest';
import { POSE_CONNECTIONS, POSE_LANDMARK } from '../../src/analysis/types';

// M0 サンプルテスト: 型・定数の健全性を確認する(vitest 疎通ゲート)。
describe('analysis/types', () => {
  it('主要ランドマーク添字が MediaPipe Pose の定義と一致する', () => {
    expect(POSE_LANDMARK.NOSE).toBe(0);
    expect(POSE_LANDMARK.RIGHT_WRIST).toBe(16);
    expect(POSE_LANDMARK.LEFT_ANKLE).toBe(27);
  });

  it('骨格接続の添字はすべて 0–32 の範囲に収まる', () => {
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(32);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(32);
    }
  });
});
