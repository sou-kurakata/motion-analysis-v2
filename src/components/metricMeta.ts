// 指標の表示メタ情報(ラベル・単位・桁数)。MetricsDashboard と TrendView で共有する。

import type { PitchMetrics } from '../analysis/types';

export interface MetricMeta {
  label: string;
  unit: string;
  digits: number;
  hint?: string;
}

export const METRIC_META: Record<keyof PitchMetrics, MetricMeta> = {
  strideLengthRatio: { label: 'ストライド長比', unit: '× 身長', digits: 2 },
  leadKneeAngleAtFootPlant: { label: 'フットプラント時 前膝角度', unit: '°', digits: 0 },
  leadKneeAngleAtRelease: { label: 'リリース時 前膝角度', unit: '°', digits: 0 },
  leadKneeExtension: {
    label: '前膝伸展量',
    unit: '°',
    digits: 0,
    hint: '正が大きいほどブレーキ動作が効いている',
  },
  trunkForwardTiltAtRelease: { label: '体幹前傾角(リリース)', unit: '°', digits: 0 },
  elbowAngleAtRelease: { label: 'リリース時 肘角度', unit: '°', digits: 0 },
  peakWristSpeed: { label: '手首ピーク速度', unit: 'm/s', digits: 2, hint: '推定球速のプロキシ' },
};

/** 表示順(ダッシュボードの行順・トレンドのセレクタ順)。 */
export const METRIC_KEYS = Object.keys(METRIC_META) as Array<keyof PitchMetrics>;

export function formatMetric(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}
