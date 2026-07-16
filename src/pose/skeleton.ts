// Canvas に骨格を重畳描画する。正規化座標(0–1)を Canvas ピクセルへ変換して描く。

import type { Landmark } from '../analysis/types';
import { POSE_CONNECTIONS } from '../analysis/types';

// 描画用の2段階しきい値。
// - 高信頼(>= HIGH): 通常表示
// - 低信頼(LOW–HIGH): 淡色で表示(モデルの推定は見せつつ不確かさを示す)
// - 極低(< LOW): 非表示(位置自体が信頼できないため)
// 注意: 指標計算での除外しきい値(CLAUDE.md: visibility < 0.5)とは別物。ここは可視化専用。
const VISIBILITY_HIGH = 0.5;
const VISIBILITY_LOW = 0.3;

/** ランドマークの描画区分。 */
type DrawTier = 'high' | 'low' | 'hidden';

function tierOf(visibility: number): DrawTier {
  if (visibility >= VISIBILITY_HIGH) return 'high';
  if (visibility >= VISIBILITY_LOW) return 'low';
  return 'hidden';
}

export interface DrawSkeletonOptions {
  pointRadius?: number;
  lineWidth?: number;
  pointColor?: string;
  lineColor?: string;
  /** 低信頼(淡色)描画時の不透明度。 */
  lowAlpha?: number;
}

/**
 * Canvas に骨格を描画する。既存の内容はクリアしてから描く。
 * visibility に応じて通常/淡色/非表示を切り替える。
 * @param ctx 描画先コンテキスト
 * @param landmarks 33点の正規化ランドマーク
 * @param width 描画領域の幅(px)
 * @param height 描画領域の高さ(px)
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Landmark[],
  width: number,
  height: number,
  options: DrawSkeletonOptions = {},
): void {
  const {
    pointRadius = 4,
    lineWidth = 2,
    pointColor = '#00e5ff',
    lineColor = '#ffffff',
    lowAlpha = 0.35,
  } = options;

  ctx.clearRect(0, 0, width, height);

  // 接続線: 両端の tier のうち低い方に合わせて描画する。
  ctx.lineWidth = lineWidth;
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    const ta = tierOf(la.visibility);
    const tb = tierOf(lb.visibility);
    if (ta === 'hidden' || tb === 'hidden') continue;
    const dimmed = ta === 'low' || tb === 'low';

    ctx.globalAlpha = dimmed ? lowAlpha : 1;
    ctx.strokeStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(la.x * width, la.y * height);
    ctx.lineTo(lb.x * width, lb.y * height);
    ctx.stroke();
  }

  // 関節点
  for (const lm of landmarks) {
    const tier = tierOf(lm.visibility);
    if (tier === 'hidden') continue;
    ctx.globalAlpha = tier === 'low' ? lowAlpha : 1;
    ctx.fillStyle = pointColor;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
