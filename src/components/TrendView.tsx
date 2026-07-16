// M5: セッション横断のトレンド。選択した指標(左軸)と実測球速(右軸)を日付で重ね描きする。
// 指標と球速の関係(例: 前膝伸展量が増えた日は球速も出ているか)を目で確認するのが狙い。

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PitchMetrics, Session } from '../analysis/types';
import { useAppStore } from '../store/useAppStore';
import { formatMetric, METRIC_KEYS, METRIC_META } from './metricMeta';

interface Props {
  sessions: Session[];
}

/** 日付ラベル(MM/DD HH:mm)。同日に複数セッションを撮ることがあるため時刻まで出す。 */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TrendView({ sessions }: Props) {
  const removeSession = useAppStore((s) => s.removeSession);
  const [metricKey, setMetricKey] = useState<keyof PitchMetrics>('peakWristSpeed');
  const meta = METRIC_META[metricKey];

  if (sessions.length === 0) {
    return (
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 18 }}>トレンド</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          保存されたセッションがありません。解析後に「セッションとして保存」で記録してください。
        </p>
      </section>
    );
  }

  const data = sessions.map((s) => ({
    date: shortDate(s.date),
    metric: Number.isFinite(s.metrics[metricKey]) ? s.metrics[metricKey] : null,
    // 未入力の日は線を途切れさせる(connectNulls しない)
    velocity: s.measuredVelocityKmh ?? null,
  }));

  const hasVelocity = data.some((d) => d.velocity !== null);

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18 }}>トレンド({sessions.length} セッション)</h2>

      <label style={{ fontSize: 14 }}>
        指標:{' '}
        <select
          value={metricKey}
          onChange={(e) => setMetricKey(e.target.value as keyof PitchMetrics)}
        >
          {METRIC_KEYS.map((k) => (
            <option key={k} value={k}>
              {METRIC_META[k].label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ width: '100%', height: 300, marginTop: 8 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="metric"
              tick={{ fontSize: 12 }}
              label={{ value: meta.unit, angle: -90, position: 'insideLeft', fontSize: 12 }}
            />
            <YAxis
              yAxisId="velocity"
              orientation="right"
              tick={{ fontSize: 12 }}
              label={{ value: 'km/h', angle: 90, position: 'insideRight', fontSize: 12 }}
            />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="metric"
              type="monotone"
              dataKey="metric"
              name={meta.label}
              stroke="#1f77b4"
              connectNulls={false}
              isAnimationActive={false}
            />
            {hasVelocity && (
              <Line
                yAxisId="velocity"
                type="monotone"
                dataKey="velocity"
                name="実測球速"
                stroke="#d62728"
                strokeDasharray="4 2"
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table style={{ borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
            <th style={{ textAlign: 'left', padding: '4px 12px 4px 0' }}>日時</th>
            <th style={{ textAlign: 'right', padding: '4px 12px 4px 0' }}>{meta.label}</th>
            <th style={{ textAlign: 'right', padding: '4px 12px 4px 0' }}>実測球速</th>
            <th style={{ textAlign: 'left', padding: '4px 12px 4px 0' }}>メモ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...sessions].reverse().map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '4px 12px 4px 0' }}>{shortDate(s.date)}</td>
              <td
                style={{
                  padding: '4px 12px 4px 0',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatMetric(s.metrics[metricKey], meta.digits)}
              </td>
              <td
                style={{
                  padding: '4px 12px 4px 0',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.measuredVelocityKmh ?? '—'}
              </td>
              <td style={{ padding: '4px 12px 4px 0', color: '#666' }}>{s.note ?? ''}</td>
              <td>
                <button
                  onClick={() => void removeSession(s.id)}
                  style={{ fontSize: 12 }}
                  aria-label="削除"
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
