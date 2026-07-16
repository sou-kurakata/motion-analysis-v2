import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../../src/analysis/metrics';
import type { FrameData, Landmark } from '../../src/analysis/types';
import { POSE_LANDMARK as P } from '../../src/analysis/types';

function lm(x: number, y: number): Landmark {
  return { x, y, z: 0, visibility: 1 };
}

/** 33点を (0.5,0.5) で初期化し、overrides を上書きしたフレームを作る。 */
function makeFrame(timestampMs: number, overrides: Record<number, [number, number]>): FrameData {
  const landmarks: Landmark[] = new Array<Landmark>(33);
  for (let i = 0; i < 33; i++) landmarks[i] = lm(0.5, 0.5);
  for (const [k, [x, y]] of Object.entries(overrides)) landmarks[Number(k)] = lm(x, y);
  return { timestampMs, landmarks, worldLandmarks: landmarks };
}

describe('metrics.computeMetrics(右投げ・正方フレーム 1000x1000・身長2.0m・px/m=500)', () => {
  // 手首(16)の軌道: frame5 で y 0.6→0.7 に 0.1 移動(他は静止)。10fps(100ms刻み)。
  const wristY = (f: number): number => (f >= 5 ? 0.7 : 0.6);
  const frames: FrameData[] = [];
  for (let f = 0; f < 8; f++) {
    const ov: Record<number, [number, number]> = { [P.RIGHT_WRIST]: [0.4, wristY(f)] };
    if (f === 2) {
      // フットプラント: 両足首(ストライド)+ 前足(左)膝を 90°
      ov[P.LEFT_ANKLE] = [0.7, 0.7];
      ov[P.RIGHT_ANKLE] = [0.3, 0.9];
      ov[P.LEFT_HIP] = [0.5, 0.5];
      ov[P.LEFT_KNEE] = [0.5, 0.7];
    }
    if (f === 5) {
      // リリース: 前足膝 180°、体幹前傾 45°、肘 180°
      ov[P.LEFT_HIP] = [0.5, 0.5];
      ov[P.LEFT_KNEE] = [0.5, 0.7];
      ov[P.LEFT_ANKLE] = [0.5, 0.9];
      ov[P.RIGHT_HIP] = [0.5, 0.5];
      ov[P.LEFT_SHOULDER] = [0.2, 0.3];
      ov[P.RIGHT_SHOULDER] = [0.4, 0.3];
      ov[P.RIGHT_ELBOW] = [0.4, 0.5];
      ov[P.RIGHT_WRIST] = [0.4, 0.7];
    }
    frames.push(makeFrame(f * 100, ov));
  }

  const m = computeMetrics({
    frames,
    events: { footPlantFrame: 2, releaseFrame: 5 },
    handedness: 'right',
    pxPerMeter: 500,
    frameWidthPx: 1000,
    frameHeightPx: 1000,
    heightCm: 200,
  });

  it('ストライド長比 = 0.4', () => {
    expect(m.strideLengthRatio).toBeCloseTo(0.4, 6);
  });
  it('フットプラント時 前膝角度 = 90°', () => {
    expect(m.leadKneeAngleAtFootPlant).toBeCloseTo(90, 4);
  });
  it('リリース時 前膝角度 = 180°', () => {
    expect(m.leadKneeAngleAtRelease).toBeCloseTo(180, 4);
  });
  it('前膝伸展量 = 90°', () => {
    expect(m.leadKneeExtension).toBeCloseTo(90, 4);
  });
  it('体幹前傾角 = 45°', () => {
    expect(m.trunkForwardTiltAtRelease).toBeCloseTo(45, 4);
  });
  it('リリース時 肘角度 = 180°', () => {
    expect(m.elbowAngleAtRelease).toBeCloseTo(180, 4);
  });
  it('手首ピーク速度 = 2 m/s(100px/0.1s /500)', () => {
    expect(m.peakWristSpeed).toBeCloseTo(2, 6);
  });
});

describe('metrics.computeMetrics(イベント未検出)', () => {
  const frames = [makeFrame(0, {}), makeFrame(100, {}), makeFrame(200, {})];
  const m = computeMetrics({
    frames,
    events: { footPlantFrame: -1, releaseFrame: -1 },
    handedness: 'right',
    pxPerMeter: 500,
    frameWidthPx: 1000,
    frameHeightPx: 1000,
    heightCm: 200,
  });
  it('依存指標は NaN', () => {
    expect(Number.isNaN(m.strideLengthRatio)).toBe(true);
    expect(Number.isNaN(m.leadKneeAngleAtRelease)).toBe(true);
    expect(Number.isNaN(m.peakWristSpeed)).toBe(true);
  });
});
