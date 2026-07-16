// ROI クロップ(二段推論)の座標計算。純粋関数のみ(DOM 非依存)。
//
// 背景(2026-07-13): MediaPipe は入力画像を内部で 256x256 程度に縮小してから推論する。
// 投手が画面の一部(v3 は横幅の約 1/4)にしか写らないと、腕に割かれる実効解像度が激減し、
// 速い局面で腕を見失って「空中に幻の腕」を置く。前フレームのランドマークから
// 投手を切り出して推論すれば、同じ動画のままで腕の実効解像度を数倍にできる。

import type { Landmark } from '../analysis/types';

/** フレーム内のピクセル矩形。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoiOptions {
  /** 外接矩形を各辺に広げる比率(0.25 なら両側に 25% ずつ)。 */
  marginRatio: number;
  /** ROI の最小辺長(px)。小さすぎるクロップを避ける。 */
  minSizePx: number;
  /** 外接矩形に含めるランドマークの visibility 下限。幻の点に引っ張られないため。 */
  minVisibility: number;
}

/**
 * ランドマーク(全画面の正規化座標)から次フレーム用の ROI を求める。
 * アスペクト歪みを避けるため**正方形**にする(MediaPipe の入力は正方形にリサイズされるため)。
 * 有効な点が無ければ null(呼び出し側は全画面推論にフォールバックする)。
 */
export function computeRoi(
  landmarks: Landmark[],
  frameWidthPx: number,
  frameHeightPx: number,
  opts: RoiOptions,
): Rect | null {
  const valid = landmarks.filter((lm) => lm.visibility >= opts.minVisibility);
  if (valid.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const lm of valid) {
    minX = Math.min(minX, lm.x * frameWidthPx);
    maxX = Math.max(maxX, lm.x * frameWidthPx);
    minY = Math.min(minY, lm.y * frameHeightPx);
    maxY = Math.max(maxY, lm.y * frameHeightPx);
  }

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 長辺基準の正方形 + マージン。フレームより大きくはしない。
  const side = Math.min(
    Math.max(Math.max(bboxW, bboxH) * (1 + 2 * opts.marginRatio), opts.minSizePx),
    Math.min(frameWidthPx, frameHeightPx),
  );

  // 中心を保ったままフレーム内へクランプ
  const x = Math.min(Math.max(cx - side / 2, 0), frameWidthPx - side);
  const y = Math.min(Math.max(cy - side / 2, 0), frameHeightPx - side);

  return { x, y, w: side, h: side };
}

/**
 * ROI クロップ画像で得た正規化座標を、全画面の正規化座標へ戻す。
 * z は MediaPipe の仕様上 x と同じ基準(画像幅)で正規化されるため、幅の比率でスケールする。
 * (analysis は 2D のみ使うため z は参考値)
 */
export function mapLandmarksFromRoi(
  landmarks: Landmark[],
  roi: Rect,
  frameWidthPx: number,
  frameHeightPx: number,
): Landmark[] {
  const zScale = roi.w / frameWidthPx;
  return landmarks.map((lm) => ({
    x: (roi.x + lm.x * roi.w) / frameWidthPx,
    y: (roi.y + lm.y * roi.h) / frameHeightPx,
    z: lm.z * zScale,
    visibility: lm.visibility,
  }));
}
