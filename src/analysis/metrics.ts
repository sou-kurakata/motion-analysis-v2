// 球速相関指標の算出。純粋関数のみ(src/analysis/ の規約)。
// 角度・距離はアスペクト比の影響を除くため px 空間(正規化座標 × フレーム寸法)で計算する。
// 利き腕に応じて前足・投球腕の添字を選ぶ(右投げ正規化: 前足=左, 投球腕=右)。

import type { FrameData, Handedness, PitchEvents, PitchMetrics, Point2D } from './types';
import { POSE_LANDMARK } from './types';
import { angleDeg, distance, horizontalDistance, midpoint, tiltFromVerticalDeg } from './geometry';

export interface MetricsInput {
  frames: FrameData[];
  events: PitchEvents;
  handedness: Handedness;
  /** px→m 係数(calibration より)。 */
  pxPerMeter: number;
  frameWidthPx: number;
  frameHeightPx: number;
  /** 被写体の身長(cm)。ストライド長比の分母。 */
  heightCm: number;
}

interface Joints {
  frontHip: number;
  frontKnee: number;
  frontAnkle: number;
  shoulder: number;
  elbow: number;
  wrist: number;
}

function jointsFor(handedness: Handedness): Joints {
  if (handedness === 'right') {
    return {
      frontHip: POSE_LANDMARK.LEFT_HIP,
      frontKnee: POSE_LANDMARK.LEFT_KNEE,
      frontAnkle: POSE_LANDMARK.LEFT_ANKLE,
      shoulder: POSE_LANDMARK.RIGHT_SHOULDER,
      elbow: POSE_LANDMARK.RIGHT_ELBOW,
      wrist: POSE_LANDMARK.RIGHT_WRIST,
    };
  }
  return {
    frontHip: POSE_LANDMARK.RIGHT_HIP,
    frontKnee: POSE_LANDMARK.RIGHT_KNEE,
    frontAnkle: POSE_LANDMARK.RIGHT_ANKLE,
    shoulder: POSE_LANDMARK.LEFT_SHOULDER,
    elbow: POSE_LANDMARK.LEFT_ELBOW,
    wrist: POSE_LANDMARK.LEFT_WRIST,
  };
}

/** リリース近傍で手首ピーク速度を探索する窓(±フレーム)。 */
const WRIST_SPEED_WINDOW = 6;

export interface AngleSeriesPoint {
  frame: number;
  /** 前足の膝角度(deg)。欠損は null(グラフで途切れる)。 */
  kneeAngle: number | null;
  /** 投球腕の肘角度(deg)。 */
  elbowAngle: number | null;
}

/**
 * 全フレームの膝角度(前足)・肘角度(投球腕)の時系列を返す(AngleChart 用)。
 * px 空間で角度を計算。ランドマーク欠損フレームは null。
 */
export function computeAngleSeries(
  frames: FrameData[],
  handedness: Handedness,
  frameWidthPx: number,
  frameHeightPx: number,
): AngleSeriesPoint[] {
  const J = jointsFor(handedness);
  const px = (f: number, idx: number): Point2D | null => {
    const lm = frames[f]?.landmarks[idx];
    if (!lm) return null;
    return { x: lm.x * frameWidthPx, y: lm.y * frameHeightPx };
  };
  return frames.map((_, f) => {
    const h = px(f, J.frontHip);
    const k = px(f, J.frontKnee);
    const a = px(f, J.frontAnkle);
    const s = px(f, J.shoulder);
    const e = px(f, J.elbow);
    const w = px(f, J.wrist);
    return {
      frame: f,
      kneeAngle: h && k && a ? angleDeg(h, k, a) : null,
      elbowAngle: s && e && w ? angleDeg(s, e, w) : null,
    };
  });
}

/**
 * 全指標を算出する。イベント(フットプラント/リリース)が未検出(-1)の場合、
 * それに依存する指標は NaN を返す。
 */
export function computeMetrics(input: MetricsInput): PitchMetrics {
  const { frames, events, handedness, pxPerMeter, frameWidthPx, frameHeightPx, heightCm } = input;
  const J = jointsFor(handedness);
  const { footPlantFrame: fp, releaseFrame: rel } = events;
  const n = frames.length;

  /** 指定フレーム・添字の px 座標を返す。 */
  const px = (f: number, idx: number): Point2D | null => {
    const lm = frames[f]?.landmarks[idx];
    if (!lm) return null;
    return { x: lm.x * frameWidthPx, y: lm.y * frameHeightPx };
  };

  const valid = (f: number): boolean => f >= 0 && f < n;

  // 膝角度 = angle(hip, knee, ankle)
  const kneeAngle = (f: number): number => {
    const h = px(f, J.frontHip);
    const k = px(f, J.frontKnee);
    const a = px(f, J.frontAnkle);
    if (!h || !k || !a) return NaN;
    return angleDeg(h, k, a);
  };

  // ストライド長比 = フットプラント時の両足首水平距離(m) ÷ 身長(m)
  let strideLengthRatio = NaN;
  if (valid(fp)) {
    const la = px(fp, POSE_LANDMARK.LEFT_ANKLE);
    const ra = px(fp, POSE_LANDMARK.RIGHT_ANKLE);
    if (la && ra) {
      const strideM = horizontalDistance(la, ra) / pxPerMeter;
      strideLengthRatio = strideM / (heightCm / 100);
    }
  }

  const leadKneeAngleAtFootPlant = valid(fp) ? kneeAngle(fp) : NaN;
  const leadKneeAngleAtRelease = valid(rel) ? kneeAngle(rel) : NaN;
  const leadKneeExtension = leadKneeAngleAtRelease - leadKneeAngleAtFootPlant;

  // 体幹前傾角 = リリース時、肩中点→股関節中点の線の垂直からの傾き
  let trunkForwardTiltAtRelease = NaN;
  if (valid(rel)) {
    const ls = px(rel, POSE_LANDMARK.LEFT_SHOULDER);
    const rs = px(rel, POSE_LANDMARK.RIGHT_SHOULDER);
    const lh = px(rel, POSE_LANDMARK.LEFT_HIP);
    const rh = px(rel, POSE_LANDMARK.RIGHT_HIP);
    if (ls && rs && lh && rh) {
      const shoulderMid = midpoint(ls, rs);
      const hipMid = midpoint(lh, rh);
      trunkForwardTiltAtRelease = tiltFromVerticalDeg(shoulderMid, hipMid);
    }
  }

  // リリース時肘角度 = angle(shoulder, elbow, wrist)
  let elbowAngleAtRelease = NaN;
  if (valid(rel)) {
    const s = px(rel, J.shoulder);
    const e = px(rel, J.elbow);
    const w = px(rel, J.wrist);
    if (s && e && w) elbowAngleAtRelease = angleDeg(s, e, w);
  }

  // 手首ピーク速度(m/s) = リリース近傍の手首合成速度の最大値
  let peakWristSpeed = NaN;
  if (valid(rel)) {
    const lo = Math.max(1, rel - WRIST_SPEED_WINDOW);
    const hi = Math.min(n - 1, rel + WRIST_SPEED_WINDOW);
    let maxSpeed = 0;
    for (let f = lo; f <= hi; f++) {
      const prev = px(f - 1, J.wrist);
      const cur = px(f, J.wrist);
      if (!prev || !cur) continue;
      const dtSec = (frames[f]!.timestampMs - frames[f - 1]!.timestampMs) / 1000;
      if (dtSec <= 0) continue;
      const speedPxPerSec = distance(prev, cur) / dtSec;
      maxSpeed = Math.max(maxSpeed, speedPxPerSec / pxPerMeter);
    }
    peakWristSpeed = maxSpeed;
  }

  return {
    strideLengthRatio,
    leadKneeAngleAtFootPlant,
    leadKneeAngleAtRelease,
    leadKneeExtension,
    trunkForwardTiltAtRelease,
    elbowAngleAtRelease,
    peakWristSpeed,
  };
}
