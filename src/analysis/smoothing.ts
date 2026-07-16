// 平滑化フィルタ。純粋関数のみ(src/analysis/ の規約)。
// 数値列に対して作用する。ランドマーク座標への適用は呼び出し側で各成分ごとに行う。

import { ONE_EURO_DEFAULT } from './constants';

/**
 * 中央寄せの移動平均。端は縮小窓(利用可能な範囲だけで平均)で扱う。
 * 角度・位置系のノイズ除去に使用(CLAUDE.md: 窓5フレーム目安)。
 * @param values 入力数値列
 * @param window 窓幅(サンプル数)。奇数を想定(偶数でも動くが左右非対称になる)。
 */
export function movingAverage(values: readonly number[], window: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const half = Math.floor(window / 2);
  const out: number[] = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j]!;
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

export interface OneEuroConfig {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

/** 1次ローパス: alpha*x + (1-alpha)*prev。 */
function lowpass(alpha: number, x: number, prev: number): number {
  return alpha * x + (1 - alpha) * prev;
}

/** カットオフ周波数と時間刻み(秒)から平滑化係数 alpha を求める。 */
function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/**
 * One Euro Filter。速度系(手首・足首速度など)のノイズ除去に使用。
 * 状態を関数内に閉じた純粋実装(入力を変更せず、外部依存もない)。
 * @param values 入力数値列
 * @param timestampsMs 各サンプルのタイムスタンプ(ms、昇順)。values と同長。
 * @param config フィルタパラメータ(既定は ONE_EURO_DEFAULT)
 */
export function oneEuroFilter(
  values: readonly number[],
  timestampsMs: readonly number[],
  config: OneEuroConfig = ONE_EURO_DEFAULT,
): number[] {
  const n = values.length;
  if (n === 0) return [];

  const { minCutoff, beta, dCutoff } = config;
  const out: number[] = new Array<number>(n);
  out[0] = values[0]!;
  let xPrev = values[0]!;
  let dxPrev = 0;

  for (let i = 1; i < n; i++) {
    const dtSec = (timestampsMs[i]! - timestampsMs[i - 1]!) / 1000;
    if (dtSec <= 0) {
      // 時間が進んでいない(重複タイムスタンプ等)。ゼロ除算を避けて値を通す。
      out[i] = values[i]!;
      xPrev = values[i]!;
      continue;
    }
    // 微分(速度)を推定し、低域通過
    const dx = (values[i]! - xPrev) / dtSec;
    const aD = smoothingFactor(dCutoff, dtSec);
    const dxHat = lowpass(aD, dx, dxPrev);

    // 動きの速さに応じてカットオフを上げる(速い動きはラグを減らす)
    const cutoff = minCutoff + beta * Math.abs(dxHat);
    const aX = smoothingFactor(cutoff, dtSec);
    const xHat = lowpass(aX, values[i]!, xPrev);

    out[i] = xHat;
    xPrev = xHat;
    dxPrev = dxHat;
  }

  return out;
}
