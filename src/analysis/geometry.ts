// 角度・距離・速度の基礎計算。純粋関数のみ(src/analysis/ の規約)。
// 座標は正規化(0–1)でも px でもよい。単位は呼び出し側が一貫させる。

import type { Point2D } from './types';

/** 2点間のユークリッド距離。 */
export function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** x 成分の絶対差(水平距離)。ストライド長などで使用。 */
export function horizontalDistance(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x);
}

/**
 * 3点 a-b-c について、頂点 b でなす角を度で返す(0–180)。
 * 膝角度 angle(hip, knee, ankle) や肘角度 angle(shoulder, elbow, wrist) に使用。
 */
export function angleDeg(a: Point2D, b: Point2D, c: Point2D): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  // 浮動小数誤差で |cos| がわずかに 1 を超えるのを防ぐ
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 2点の中点。肩中点・股関節中点などで使用。 */
export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 連続する2点間の合成速度(単位/秒)。座標単位そのままの速度を返す。
 * dtMs が 0 以下ならゼロ除算を避けて 0 を返す。
 */
export function speed(prev: Point2D, cur: Point2D, dtMs: number): number {
  if (dtMs <= 0) return 0;
  return distance(prev, cur) / (dtMs / 1000);
}

/**
 * 2点(上→下)を結ぶ線分の、垂直方向からの傾きを度で返す(0–90、常に非負)。
 * 体幹前傾角(肩中点→股関節中点)などで使用。垂直(真下)= 0°、水平 = 90°。
 */
export function tiltFromVerticalDeg(top: Point2D, bottom: Point2D): number {
  const dx = bottom.x - top.x;
  const dy = bottom.y - top.y;
  // 垂直軸(y方向)からの角度。atan2(|水平成分|, |鉛直成分|)。
  return (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
}
