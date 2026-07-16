// イベント検出(状態機械)。純粋関数のみ(src/analysis/ の規約)。
// 録画済み FrameData[] をオフラインで解析するため、ラグのない中央寄せ平滑化+中央差分で
// フットプラント/リリースのフレームを推定する(リアルタイム用の One Euro は速度指標側で使用)。

import type {
  FrameData,
  Handedness,
  Landmark,
  PitchEvents,
  PitchState,
  Point2D,
} from './types';
import { POSE_LANDMARK } from './types';
import { angleDeg } from './geometry';
import { movingAverage } from './smoothing';
import {
  FOOTPLANT_SPEED_PEAK_RATIO,
  HEEL_STABILITY_EPS,
  MIN_EVENT_SPEED_PER_FRAME,
  MOVING_AVERAGE_WINDOW,
  RELEASE_ELBOW_ANGLE_DEG,
  RELEASE_WRIST_PEAK_SEARCH_FRAMES,
  VISIBILITY_EXCLUDE_THRESHOLD,
} from './constants';

export interface DetectEventsConfig {
  /** 利き腕。未指定なら手首速度ピークから自動判定する。 */
  handedness: Handedness;
}

/** 片腕(肩・肘・手首)の投球腕らしさの指標。 */
interface ArmScore {
  /** 手首合成速度のピーク値。 */
  peakSpeed: number;
  /** 手首速度ピーク近傍で肘が伸展(>150°)するか。投球腕はリリースで伸展する。 */
  extendsNearPeak: boolean;
}

function scoreArm(
  frames: FrameData[],
  shoulderIdx: number,
  elbowIdx: number,
  wristIdx: number,
): ArmScore {
  const win = MOVING_AVERAGE_WINDOW;
  const wx = movingAverage(coordSeries(frames, wristIdx, 'x'), win);
  const wy = movingAverage(coordSeries(frames, wristIdx, 'y'), win);
  const dx = centeredDiff(wx);
  const dy = centeredDiff(wy);
  const speed = dx.map((v, f) => Math.hypot(v, dy[f]!));
  const peakIdx = argmax(speed);
  const peakSpeed = peakIdx >= 0 ? speed[peakIdx]! : 0;

  const sx = movingAverage(coordSeries(frames, shoulderIdx, 'x'), win);
  const sy = movingAverage(coordSeries(frames, shoulderIdx, 'y'), win);
  const ex = movingAverage(coordSeries(frames, elbowIdx, 'x'), win);
  const ey = movingAverage(coordSeries(frames, elbowIdx, 'y'), win);
  let maxAngle = 0;
  const lo = Math.max(0, peakIdx - RELEASE_WRIST_PEAK_SEARCH_FRAMES);
  const hi = Math.min(frames.length - 1, peakIdx + RELEASE_WRIST_PEAK_SEARCH_FRAMES);
  for (let f = lo; f <= hi; f++) {
    const a = angleDeg(
      { x: sx[f]!, y: sy[f]! },
      { x: ex[f]!, y: ey[f]! },
      { x: wx[f]!, y: wy[f]! },
    );
    maxAngle = Math.max(maxAngle, a);
  }
  return { peakSpeed, extendsNearPeak: maxAngle > RELEASE_ELBOW_ANGLE_DEG };
}

/**
 * 投球腕(利き腕)を自動判定する。
 * 投球腕は「手首速度ピーク近傍で肘が伸展する(リリース)」腕。まずこの伸展条件で判定し、
 * 両腕とも/どちらも伸展しない場合は手首速度ピークが大きい方を採る(グラブ腕の偽ピーク対策)。
 */
export function detectHandedness(frames: FrameData[]): Handedness {
  if (frames.length < 2) return 'right';
  const right = scoreArm(
    frames,
    POSE_LANDMARK.RIGHT_SHOULDER,
    POSE_LANDMARK.RIGHT_ELBOW,
    POSE_LANDMARK.RIGHT_WRIST,
  );
  const left = scoreArm(
    frames,
    POSE_LANDMARK.LEFT_SHOULDER,
    POSE_LANDMARK.LEFT_ELBOW,
    POSE_LANDMARK.LEFT_WRIST,
  );
  if (left.extendsNearPeak !== right.extendsNearPeak) {
    return left.extendsNearPeak ? 'left' : 'right';
  }
  return left.peakSpeed > right.peakSpeed ? 'left' : 'right';
}

export interface EventDetectionResult extends PitchEvents {
  /** 各フレームの状態(状態機械のタイムライン)。 */
  states: PitchState[];
  /** 実際に使用した利き腕(自動判定した場合はその結果)。 */
  handedness: Handedness;
}

/** 利き腕に応じた対象ランドマーク添字。 */
interface JointIndices {
  frontAnkle: number;
  frontHeel: number;
  shoulder: number;
  elbow: number;
  wrist: number;
}

function jointIndicesFor(handedness: Handedness): JointIndices {
  // 右投げ: 前足=左(踏み込み足)、投球腕=右。左投げはその逆。
  if (handedness === 'right') {
    return {
      frontAnkle: POSE_LANDMARK.LEFT_ANKLE,
      frontHeel: POSE_LANDMARK.LEFT_HEEL,
      shoulder: POSE_LANDMARK.RIGHT_SHOULDER,
      elbow: POSE_LANDMARK.RIGHT_ELBOW,
      wrist: POSE_LANDMARK.RIGHT_WRIST,
    };
  }
  return {
    frontAnkle: POSE_LANDMARK.RIGHT_ANKLE,
    frontHeel: POSE_LANDMARK.RIGHT_HEEL,
    shoulder: POSE_LANDMARK.LEFT_SHOULDER,
    elbow: POSE_LANDMARK.LEFT_ELBOW,
    wrist: POSE_LANDMARK.LEFT_WRIST,
  };
}

/**
 * 指定ランドマークの座標系列を取り出す。visibility が低いフレームは直前値を保持(carry-forward)し、
 * 欠損由来のスパイクを防ぐ。
 */
function coordSeries(frames: FrameData[], index: number, axis: 'x' | 'y'): number[] {
  const out: number[] = new Array<number>(frames.length);
  let last = 0.5;
  let hasLast = false;
  for (let f = 0; f < frames.length; f++) {
    const lm: Landmark | undefined = frames[f]!.landmarks[index];
    if (lm && lm.visibility >= VISIBILITY_EXCLUDE_THRESHOLD) {
      last = lm[axis];
      hasLast = true;
    }
    out[f] = hasLast ? last : lm?.[axis] ?? 0.5;
  }
  return out;
}

/** 中央差分(1フレームあたりの変化量)。端は片側差分。 */
function centeredDiff(series: readonly number[]): number[] {
  const n = series.length;
  const d: number[] = new Array<number>(n).fill(0);
  if (n < 2) return d;
  for (let f = 1; f < n - 1; f++) d[f] = (series[f + 1]! - series[f - 1]!) / 2;
  d[0] = series[1]! - series[0]!;
  d[n - 1] = series[n - 1]! - series[n - 2]!;
  return d;
}

function argmax(values: readonly number[], from = 0, to = values.length): number {
  let best = -1;
  let bestVal = -Infinity;
  for (let i = Math.max(0, from); i < Math.min(values.length, to); i++) {
    if (values[i]! > bestVal) {
      bestVal = values[i]!;
      best = i;
    }
  }
  return best;
}

const MIN_FRAMES = 5;

/**
 * リリースフレームを選ぶ。手首速度ピーク近傍(±探索幅)で肘角度が閾値を超えるフレームのうち、
 * **手首速度ピークに最も近い**フレームを採る(フットプラントより後、が制約)。
 * 「窓内の最初」ではなく「ピーク最近傍」を採るのは、肘がリリース数フレーム前から伸展し始め、
 * 「最初に150°を超える瞬間」がリリースより早い側へバイアスするため。物理的リリース=手首速度ピーク
 * にアンカーする(CLAUDE.md 更新済み、2026-07-13 実動画検証)。
 * @param elbowAngle 平滑化済み肘角度系列
 */
export function selectReleaseFrame(
  wristPeakIdx: number,
  wristPeak: number,
  elbowAngle: readonly number[],
  footPlantFrame: number,
): number {
  if (wristPeakIdx < 0 || wristPeak < MIN_EVENT_SPEED_PER_FRAME) return -1;
  const lo = Math.max(0, wristPeakIdx - RELEASE_WRIST_PEAK_SEARCH_FRAMES);
  const hi = Math.min(elbowAngle.length - 1, wristPeakIdx + RELEASE_WRIST_PEAK_SEARCH_FRAMES);
  let best = -1;
  let bestDist = Infinity;
  for (let f = lo; f <= hi; f++) {
    if (f > footPlantFrame && elbowAngle[f]! > RELEASE_ELBOW_ANGLE_DEG) {
      const dist = Math.abs(f - wristPeakIdx);
      if (dist < bestDist) {
        bestDist = dist;
        best = f;
      }
    }
  }
  return best;
}

/**
 * FrameData[] からフットプラント/リリースのフレームを検出する。
 * 未検出は -1。状態タイムラインも返す。
 */
export function detectEvents(
  frames: FrameData[],
  config: Partial<DetectEventsConfig> = {},
): EventDetectionResult {
  const handedness: Handedness = config.handedness ?? detectHandedness(frames);
  const n = frames.length;
  const emptyStates = (): PitchState[] => new Array<PitchState>(n).fill('WINDUP');

  if (n < MIN_FRAMES) {
    return { footPlantFrame: -1, releaseFrame: -1, states: emptyStates(), handedness };
  }

  const J = jointIndicesFor(handedness);
  const win = MOVING_AVERAGE_WINDOW;

  // 平滑化済み座標系列
  const ankleX = movingAverage(coordSeries(frames, J.frontAnkle, 'x'), win);
  const heelY = movingAverage(coordSeries(frames, J.frontHeel, 'y'), win);
  const wristX = movingAverage(coordSeries(frames, J.wrist, 'x'), win);
  const wristY = movingAverage(coordSeries(frames, J.wrist, 'y'), win);
  const shoulderX = movingAverage(coordSeries(frames, J.shoulder, 'x'), win);
  const shoulderY = movingAverage(coordSeries(frames, J.shoulder, 'y'), win);
  const elbowX = movingAverage(coordSeries(frames, J.elbow, 'x'), win);
  const elbowY = movingAverage(coordSeries(frames, J.elbow, 'y'), win);

  // 速度(1フレームあたり)。閾値は比率/最大値なので dt 換算は不要。
  const ankleHSpeed = centeredDiff(ankleX).map(Math.abs);
  const dwx = centeredDiff(wristX);
  const dwy = centeredDiff(wristY);
  const wristSpeed = dwx.map((v, i) => Math.hypot(v, dwy[i]!));
  const heelDiff = centeredDiff(heelY);

  // 肘角度系列。ランドマーク由来のノイズ(特にモーションブラー時)を抑えるため軽く平滑化する。
  const elbowAngleRaw: number[] = new Array<number>(n);
  for (let f = 0; f < n; f++) {
    const s: Point2D = { x: shoulderX[f]!, y: shoulderY[f]! };
    const e: Point2D = { x: elbowX[f]!, y: elbowY[f]! };
    const w: Point2D = { x: wristX[f]!, y: wristY[f]! };
    elbowAngleRaw[f] = angleDeg(s, e, w);
  }
  const elbowAngle = movingAverage(elbowAngleRaw, 3);

  // 投球腕手首の合成速度ピーク(クリップ全体)= リリース近傍。
  // 手首は前足と違いフォロースルーで再加速しないため、全体ピークがリリースに対応する。
  const wristPeakIdx = argmax(wristSpeed);
  const wristPeak = wristPeakIdx >= 0 ? wristSpeed[wristPeakIdx]! : 0;

  // --- フットプラント検出 ---
  // 前足はフォロースルーで再加速するため、ストライドのピークはリリース(手首ピーク)より前で探す。
  let footPlantFrame = -1;
  let stridePeak = 0;
  if (wristPeakIdx > 0) {
    const stridePeakIdx = argmax(ankleHSpeed, 0, wristPeakIdx + 1);
    stridePeak = stridePeakIdx >= 0 ? ankleHSpeed[stridePeakIdx]! : 0;
    if (stridePeak >= MIN_EVENT_SPEED_PER_FRAME) {
      const threshold = FOOTPLANT_SPEED_PEAK_RATIO * stridePeak;
      let fallback = -1;
      // ストライドピーク後〜リリースまでで、速度が閾値割れした最初のフレーム
      for (let f = stridePeakIdx + 1; f <= wristPeakIdx; f++) {
        if (ankleHSpeed[f]! < threshold) {
          if (fallback < 0) fallback = f;
          // かかと y が前後で安定していること(バウンド誤検出防止)
          if (Math.abs(heelDiff[f]!) < HEEL_STABILITY_EPS) {
            footPlantFrame = f;
            break;
          }
        }
      }
      if (footPlantFrame < 0) footPlantFrame = fallback;
    }
  }

  // --- リリース検出 ---
  const releaseFrame = selectReleaseFrame(
    wristPeakIdx,
    wristPeak,
    elbowAngle,
    footPlantFrame,
  );

  // --- 状態タイムライン ---
  const states = buildStates(n, ankleHSpeed, stridePeak, footPlantFrame, releaseFrame);

  return { footPlantFrame, releaseFrame, states, handedness };
}

/** 状態機械のタイムラインを構築する(可視化・デバッグ用)。 */
function buildStates(
  n: number,
  ankleHSpeed: readonly number[],
  stridePeak: number,
  footPlantFrame: number,
  releaseFrame: number,
): PitchState[] {
  const states: PitchState[] = new Array<PitchState>(n).fill('WINDUP');

  // ストライド開始 = ピークの20%を超える最初のフレーム
  let strideStart = -1;
  if (stridePeak >= MIN_EVENT_SPEED_PER_FRAME) {
    const rise = 0.2 * stridePeak;
    for (let f = 0; f < n; f++) {
      if (ankleHSpeed[f]! > rise) {
        strideStart = f;
        break;
      }
    }
  }

  for (let f = 0; f < n; f++) {
    if (releaseFrame >= 0 && f > releaseFrame) states[f] = 'FOLLOW_THROUGH';
    else if (releaseFrame >= 0 && f === releaseFrame) states[f] = 'RELEASE_DETECTED';
    else if (footPlantFrame >= 0 && f >= footPlantFrame) states[f] = 'ARM_COCKING';
    else if (strideStart >= 0 && f >= strideStart) states[f] = 'STRIDE';
    else states[f] = 'WINDUP';
  }
  return states;
}
