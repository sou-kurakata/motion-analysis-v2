import { describe, it, expect } from 'vitest';
import {
  pxPerMeter,
  convertPxToMeters,
  shoulderWidthMeters,
  isShoulderWidthPlausible,
  approxHeadTopY,
  selectCalibrationFrame,
  computeCalibration,
} from '../../src/analysis/calibration';
import type { FrameData, Landmark } from '../../src/analysis/types';
import { POSE_LANDMARK } from '../../src/analysis/types';

function lm(x: number, y: number, visibility = 1): Landmark {
  return { x, y, z: 0, visibility };
}

/** nose と両足首だけ指定した簡易フレームを作る。 */
function frameWith(nose: number, ankleY: number, extras: Record<number, Landmark> = {}): FrameData {
  const landmarks: Landmark[] = new Array<Landmark>(33);
  for (let i = 0; i < 33; i++) landmarks[i] = lm(0.5, 0.5, 1);
  landmarks[POSE_LANDMARK.NOSE] = lm(0.5, nose, 1);
  landmarks[POSE_LANDMARK.LEFT_ANKLE] = lm(0.48, ankleY, 1);
  landmarks[POSE_LANDMARK.RIGHT_ANKLE] = lm(0.52, ankleY, 1);
  for (const [k, v] of Object.entries(extras)) landmarks[Number(k)] = v;
  return { timestampMs: 0, landmarks, worldLandmarks: landmarks };
}

describe('calibration.pxPerMeter', () => {
  it('頭頂 y=0.0 〜 足首 y=1.0、フレーム高1000px、身長2.0m → 500 px/m', () => {
    expect(
      pxPerMeter({ topY: 0.0, bottomY: 1.0, frameHeightPx: 1000, subjectHeightM: 2.0 }),
    ).toBeCloseTo(500, 10);
  });
  it('身長1.7m、y差0.85、フレーム高1080 → (0.85*1080)/1.7', () => {
    expect(
      pxPerMeter({ topY: 0.05, bottomY: 0.9, frameHeightPx: 1080, subjectHeightM: 1.7 }),
    ).toBeCloseTo((0.85 * 1080) / 1.7, 6);
  });
});

describe('calibration.convertPxToMeters', () => {
  it('500px を 500px/m で割ると 1m', () => {
    expect(convertPxToMeters(500, 500)).toBeCloseTo(1, 10);
  });
});

describe('calibration.shoulderWidthMeters', () => {
  it('肩幅 x差0.2 × フレーム幅1000px = 200px、500px/m → 0.4m', () => {
    const w = shoulderWidthMeters(
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.3 },
      1000,
      500,
    );
    expect(w).toBeCloseTo(0.4, 10);
  });
});

describe('calibration.isShoulderWidthPlausible', () => {
  it('0.40m は妥当(30–60cm)', () => {
    expect(isShoulderWidthPlausible(0.4)).toBe(true);
  });
  it('0.20m は範囲外', () => {
    expect(isShoulderWidthPlausible(0.2)).toBe(false);
  });
  it('0.70m は範囲外', () => {
    expect(isShoulderWidthPlausible(0.7)).toBe(false);
  });
  it('境界値 0.30 / 0.60 は妥当', () => {
    expect(isShoulderWidthPlausible(0.3)).toBe(true);
    expect(isShoulderWidthPlausible(0.6)).toBe(true);
  });
});

describe('calibration.approxHeadTopY', () => {
  it('鼻から縦距離の8%ぶん上を頭頂近似とする', () => {
    // noseY=0.2, bottomY=0.9 → 0.2 - 0.08*(0.9-0.2) = 0.144
    expect(approxHeadTopY(0.2, 0.9)).toBeCloseTo(0.144, 6);
  });
});

describe('calibration.selectCalibrationFrame', () => {
  it('探索範囲(前方35%)内で鼻〜足首の縦距離が最大のフレームを選ぶ', () => {
    // 10フレーム。探索範囲は前方 floor(10*0.35)=3 フレーム(0,1,2)。frame2 が最大スパン。
    const frames = [
      frameWith(0.3, 0.9), // span 0.6
      frameWith(0.25, 0.9), // span 0.65
      frameWith(0.1, 0.95), // span 0.85 ← 探索範囲内で最大
      frameWith(0.05, 0.98), // span 0.93 だが探索範囲外(f=3)
      ...Array.from({ length: 6 }, () => frameWith(0.4, 0.9)),
    ];
    expect(selectCalibrationFrame(frames)).toBe(2);
  });
});

describe('calibration.computeCalibration', () => {
  it('直立フレームから px/m 係数と肩幅妥当性を算出', () => {
    // 正方フレーム 1000x1000、身長2.0m。nose 0.1 / ankle 0.9。
    // 頭頂 = 0.1 - 0.08*(0.9-0.1) = 0.036。縦px = (0.9-0.036)*1000 = 864。px/m = 864/2.0 = 432。
    const shoulders = {
      [POSE_LANDMARK.LEFT_SHOULDER]: lm(0.4, 0.3, 1),
      [POSE_LANDMARK.RIGHT_SHOULDER]: lm(0.6, 0.3, 1),
    };
    const frames = [frameWith(0.1, 0.9, shoulders)];
    const cal = computeCalibration(frames, 1000, 1000, 200);
    expect(cal.calibrationFrame).toBe(0);
    expect(cal.pxPerMeter).toBeCloseTo(432, 3);
    // 肩幅 = |0.6-0.4|*1000 / 432 = 200/432 = 0.463m → 妥当
    expect(cal.shoulderWidthM).toBeCloseTo(200 / 432, 6);
    expect(cal.plausible).toBe(true);
  });
});
