// ROI クロップ(二段推論)の純粋関数テスト。
// 動機: 全身が画面の一部にしか写らないと、MediaPipe が内部で 256x256 に縮小する際に
// 腕に割かれる実効解像度が激減し、速い局面で腕を見失う(v3/v4 で実測)。
// 前フレームのランドマークから投手を切り出して推論することで実効解像度を上げる。

import { describe, expect, it } from 'vitest';
import type { Landmark } from '../../src/analysis/types';
import { computeRoi, mapLandmarksFromRoi } from '../../src/pose/roi';

const FRAME_W = 960;
const FRAME_H = 540;

function lm(x: number, y: number, visibility = 1): Landmark {
  return { x, y, z: 0, visibility };
}

/** x/y の範囲を持つ最小限のランドマーク列(33点に満たなくても計算は成立する)。 */
function landmarksIn(x0: number, y0: number, x1: number, y1: number): Landmark[] {
  return [lm(x0, y0), lm(x1, y0), lm(x0, y1), lm(x1, y1)];
}

describe('pose/roi', () => {
  describe('computeRoi', () => {
    it('ランドマークの外接矩形をマージン付きの正方形で返す', () => {
      // 画面中央に 0.2 幅 × 0.4 高の人物
      const roi = computeRoi(landmarksIn(0.4, 0.3, 0.6, 0.7), FRAME_W, FRAME_H, {
        marginRatio: 0,
        minSizePx: 0,
        minVisibility: 0.2,
      });

      expect(roi).not.toBeNull();
      // px 換算: x 384–576(幅192)、y 162–378(高216)→ 長辺216の正方形
      expect(roi!.w).toBeCloseTo(216, 0);
      expect(roi!.h).toBeCloseTo(216, 0);
      // 正方形は外接矩形の中心に置かれる
      expect(roi!.x + roi!.w / 2).toBeCloseTo(480, 0);
      expect(roi!.y + roi!.h / 2).toBeCloseTo(270, 0);
    });

    it('マージンで矩形を広げる', () => {
      const noMargin = computeRoi(landmarksIn(0.4, 0.3, 0.6, 0.7), FRAME_W, FRAME_H, {
        marginRatio: 0,
        minSizePx: 0,
        minVisibility: 0.2,
      })!;
      const withMargin = computeRoi(landmarksIn(0.4, 0.3, 0.6, 0.7), FRAME_W, FRAME_H, {
        marginRatio: 0.25,
        minSizePx: 0,
        minVisibility: 0.2,
      })!;

      expect(withMargin.w).toBeCloseTo(noMargin.w * 1.5, 0); // 両側に 25% ずつ
    });

    it('フレーム外にはみ出さない(クランプする)', () => {
      // 左上隅の人物 + 大きなマージン
      const roi = computeRoi(landmarksIn(0.02, 0.02, 0.1, 0.3), FRAME_W, FRAME_H, {
        marginRatio: 1.0,
        minSizePx: 0,
        minVisibility: 0.2,
      })!;

      expect(roi.x).toBeGreaterThanOrEqual(0);
      expect(roi.y).toBeGreaterThanOrEqual(0);
      expect(roi.x + roi.w).toBeLessThanOrEqual(FRAME_W);
      expect(roi.y + roi.h).toBeLessThanOrEqual(FRAME_H);
    });

    it('最小サイズを下回らない', () => {
      const roi = computeRoi(landmarksIn(0.5, 0.5, 0.52, 0.54), FRAME_W, FRAME_H, {
        marginRatio: 0,
        minSizePx: 200,
        minVisibility: 0.2,
      })!;

      expect(roi.w).toBeGreaterThanOrEqual(200);
      expect(roi.h).toBeGreaterThanOrEqual(200);
    });

    it('低 visibility の点は外接矩形に含めない(幻の腕に引っ張られないため)', () => {
      const landmarks = [
        lm(0.4, 0.4, 0.9),
        lm(0.5, 0.6, 0.9),
        lm(0.95, 0.05, 0.1), // 空中に飛んだ幻の点
      ];
      const roi = computeRoi(landmarks, FRAME_W, FRAME_H, {
        marginRatio: 0,
        minSizePx: 0,
        minVisibility: 0.2,
      })!;

      // 幻の点(x=0.95)を含んでいたら右端は 912px 付近になる
      expect(roi.x + roi.w).toBeLessThan(600);
    });

    it('有効な点が無ければ null(全画面推論にフォールバックさせる)', () => {
      const roi = computeRoi([lm(0.5, 0.5, 0.05)], FRAME_W, FRAME_H, {
        marginRatio: 0,
        minSizePx: 0,
        minVisibility: 0.2,
      });
      expect(roi).toBeNull();
    });

    it('ランドマークが空でも null', () => {
      expect(
        computeRoi([], FRAME_W, FRAME_H, { marginRatio: 0.2, minSizePx: 0, minVisibility: 0.2 }),
      ).toBeNull();
    });
  });

  describe('mapLandmarksFromRoi', () => {
    it('クロップ内の正規化座標を全画面の正規化座標へ戻す', () => {
      const roi = { x: 240, y: 108, w: 216, h: 216 };
      // クロップの中心(0.5, 0.5)は全画面では (240+108)/960, (108+108)/540
      const mapped = mapLandmarksFromRoi([lm(0.5, 0.5, 0.9)], roi, FRAME_W, FRAME_H);

      expect(mapped[0]!.x).toBeCloseTo(348 / 960, 5);
      expect(mapped[0]!.y).toBeCloseTo(216 / 540, 5);
      expect(mapped[0]!.visibility).toBe(0.9);
    });

    it('クロップの隅は全画面でも ROI の隅に対応する', () => {
      const roi = { x: 100, y: 50, w: 300, h: 300 };
      const [tl, br] = mapLandmarksFromRoi([lm(0, 0), lm(1, 1)], roi, FRAME_W, FRAME_H);

      expect(tl!.x).toBeCloseTo(100 / 960, 5);
      expect(tl!.y).toBeCloseTo(50 / 540, 5);
      expect(br!.x).toBeCloseTo(400 / 960, 5);
      expect(br!.y).toBeCloseTo(350 / 540, 5);
    });

    it('z はクロップ幅の比率でスケールする(x と同じ正規化基準のため)', () => {
      const roi = { x: 0, y: 0, w: 480, h: 480 };
      const [m] = mapLandmarksFromRoi([{ x: 0.5, y: 0.5, z: 0.4, visibility: 1 }], roi, 960, 540);

      expect(m!.z).toBeCloseTo(0.4 * (480 / 960), 5);
    });

    it('往復変換で元に戻る(ROI 算出 → 逆変換)', () => {
      const original = lm(0.42, 0.63, 0.8);
      const roi = computeRoi(landmarksIn(0.4, 0.3, 0.6, 0.7), FRAME_W, FRAME_H, {
        marginRatio: 0.2,
        minSizePx: 0,
        minVisibility: 0.2,
      })!;

      // 全画面正規化 → クロップ正規化
      const cropX = (original.x * FRAME_W - roi.x) / roi.w;
      const cropY = (original.y * FRAME_H - roi.y) / roi.h;
      const [back] = mapLandmarksFromRoi([lm(cropX, cropY, 0.8)], roi, FRAME_W, FRAME_H);

      expect(back!.x).toBeCloseTo(original.x, 5);
      expect(back!.y).toBeCloseTo(original.y, 5);
    });
  });
});
