// 算出した PitchMetrics を一覧表示する。キャリブレーション警告も出す。

import type { PitchMetrics } from '../analysis/types';
import { formatMetric as fmt, METRIC_KEYS, METRIC_META } from './metricMeta';

interface Props {
  metrics: PitchMetrics;
  /** キャリブレーションの肩幅サニティが妥当か。false なら警告表示。 */
  calibrationPlausible: boolean;
  shoulderWidthM: number;
}

export function MetricsDashboard({ metrics, calibrationPlausible, shoulderWidthM }: Props) {
  const rows = METRIC_KEYS.map((key) => ({ ...METRIC_META[key], value: metrics[key] }));

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18 }}>指標</h2>
      {!calibrationPlausible && (
        <p style={{ color: '#b00', fontSize: 13 }}>
          キャリブレーション注意: 換算肩幅 {shoulderWidthM.toFixed(2)}m が妥当範囲(0.30–0.60m)外です。
          身長入力・撮影アングルを確認してください(実寸系の指標=ストライド長比・手首速度が不正確な可能性)。
        </p>
      )}
      <table style={{ borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 12px 6px 0', color: '#333' }}>
                {r.label}
                {r.hint && <span style={{ color: '#999', fontSize: 12 }}>({r.hint})</span>}
              </td>
              <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {fmt(r.value, r.digits)}
                <span style={{ color: '#888', fontWeight: 400, marginLeft: 4 }}>{r.unit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
