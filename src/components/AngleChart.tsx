// 膝角度(前足)・肘角度(投球腕)の時系列グラフ。イベント位置に縦線マーカーを引く。

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FrameData, Handedness, PitchEvents } from '../analysis/types';
import { computeAngleSeries } from '../analysis/metrics';

interface Props {
  frames: FrameData[];
  events: PitchEvents;
  handedness: Handedness;
  frameWidthPx: number;
  frameHeightPx: number;
}

export function AngleChart({ frames, events, handedness, frameWidthPx, frameHeightPx }: Props) {
  const data = computeAngleSeries(frames, handedness, frameWidthPx, frameHeightPx);

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18 }}>角度の時系列</h2>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis
              dataKey="frame"
              tick={{ fontSize: 12 }}
              label={{ value: 'フレーム', position: 'insideBottom', offset: -4, fontSize: 12 }}
            />
            <YAxis
              domain={[0, 180]}
              ticks={[0, 45, 90, 135, 180]}
              tick={{ fontSize: 12 }}
              label={{ value: '角度(°)', angle: -90, position: 'insideLeft', fontSize: 12 }}
            />
            <Tooltip
              formatter={(v) => (typeof v === 'number' ? `${v.toFixed(0)}°` : '—')}
              labelFormatter={(f) => `frame ${f}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="kneeAngle"
              name="前膝角度"
              stroke="#1f77b4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="elbowAngle"
              name="肘角度(投球腕)"
              stroke="#ff7f0e"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {events.footPlantFrame >= 0 && (
              <ReferenceLine
                x={events.footPlantFrame}
                stroke="#2ca02c"
                strokeDasharray="4 2"
                label={{ value: '接地', position: 'top', fontSize: 11, fill: '#2ca02c' }}
              />
            )}
            {events.releaseFrame >= 0 && (
              <ReferenceLine
                x={events.releaseFrame}
                stroke="#d62728"
                strokeDasharray="4 2"
                label={{ value: 'リリース', position: 'top', fontSize: 11, fill: '#d62728' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
