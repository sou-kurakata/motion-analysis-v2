// 身長ベースの px→m 換算。純粋関数のみ(src/analysis/ の規約)。
// 座標は正規化(0–1)で受け取り、フレーム寸法(px)を使って実寸へ換算する。
//
// 直立フレームの自動選定(ワインドアップ初期の選択)は、係数を動画へ適用する M4 で扱う。
// 本モジュールは換算コアとサニティチェックに集中する。

import type { FrameData, Point2D } from './types';
import { POSE_LANDMARK } from './types';
import {
  CALIBRATION_FRAME_SEARCH_RATIO,
  HEAD_ABOVE_NOSE_RATIO,
  SHOULDER_WIDTH_MAX_M,
  SHOULDER_WIDTH_MIN_M,
  VISIBILITY_EXCLUDE_THRESHOLD,
} from './constants';

export interface PxPerMeterInput {
  /** 上端(頭頂近似)の正規化 y。 */
  topY: number;
  /** 下端(足首)の正規化 y。 */
  bottomY: number;
  /** フレーム高さ(px)。 */
  frameHeightPx: number;
  /** 被写体の身長(m)。 */
  subjectHeightM: number;
}

/**
 * 縦方向(頭頂〜足首)の px 距離と身長から px/m 係数を求める。
 * px 距離 = |bottomY - topY| × frameHeightPx。
 */
export function pxPerMeter(input: PxPerMeterInput): number {
  const { topY, bottomY, frameHeightPx, subjectHeightM } = input;
  const pxDistance = Math.abs(bottomY - topY) * frameHeightPx;
  return pxDistance / subjectHeightM;
}

/** px を m へ換算。 */
export function convertPxToMeters(px: number, pxPerMeterValue: number): number {
  return px / pxPerMeterValue;
}

/**
 * 両肩ランドマーク(正規化座標)から換算肩幅(m)を求める。
 * 水平 px 距離 = |x差| × frameWidthPx を pxPerMeter で割る。
 */
export function shoulderWidthMeters(
  leftShoulder: Point2D,
  rightShoulder: Point2D,
  frameWidthPx: number,
  pxPerMeterValue: number,
): number {
  const px = Math.abs(leftShoulder.x - rightShoulder.x) * frameWidthPx;
  return convertPxToMeters(px, pxPerMeterValue);
}

/**
 * 換算肩幅が妥当な範囲(30–60cm)かを判定する。
 * 範囲外なら pxPerMeter 係数が誤っている可能性があり、警告に使う(CLAUDE.md 仕様)。
 */
export function isShoulderWidthPlausible(shoulderWidthM: number): boolean {
  return shoulderWidthM >= SHOULDER_WIDTH_MIN_M && shoulderWidthM <= SHOULDER_WIDTH_MAX_M;
}

/**
 * 頭頂の y を近似する。鼻(0)の y から、鼻〜足首の縦距離の一定比ぶん上に取る。
 * @param noseY 鼻の正規化 y
 * @param bottomY 足首(下端)の正規化 y
 */
export function approxHeadTopY(noseY: number, bottomY: number): number {
  return noseY - HEAD_ABOVE_NOSE_RATIO * (bottomY - noseY);
}

/**
 * キャリブレーション用の直立フレームを選ぶ。
 * 動画前方(ワインドアップ初期)の中から、鼻〜足首(下端)の縦スパンが最大=最も直立したフレームを返す。
 * 鼻・両足首の visibility が閾値未満のフレームは除外。該当なしなら 0。
 */
export function selectCalibrationFrame(frames: FrameData[]): number {
  const limit = Math.max(1, Math.floor(frames.length * CALIBRATION_FRAME_SEARCH_RATIO));
  let best = -1;
  let bestSpan = -Infinity;
  for (let f = 0; f < limit; f++) {
    const lms = frames[f]!.landmarks;
    const nose = lms[POSE_LANDMARK.NOSE];
    const la = lms[POSE_LANDMARK.LEFT_ANKLE];
    const ra = lms[POSE_LANDMARK.RIGHT_ANKLE];
    if (!nose || !la || !ra) continue;
    if (
      nose.visibility < VISIBILITY_EXCLUDE_THRESHOLD ||
      la.visibility < VISIBILITY_EXCLUDE_THRESHOLD ||
      ra.visibility < VISIBILITY_EXCLUDE_THRESHOLD
    ) {
      continue;
    }
    const bottom = Math.max(la.y, ra.y);
    const span = bottom - nose.y;
    if (span > bestSpan) {
      bestSpan = span;
      best = f;
    }
  }
  return best >= 0 ? best : 0;
}

export interface CalibrationResult {
  /** 採用したキャリブレーションフレームの添字。 */
  calibrationFrame: number;
  /** px→m 係数。 */
  pxPerMeter: number;
  /** 換算肩幅(m)。サニティチェック用。 */
  shoulderWidthM: number;
  /** 換算肩幅が妥当範囲(30–60cm)か。false なら係数を疑う。 */
  plausible: boolean;
}

/**
 * フレーム列・フレーム寸法・身長から px/m 係数を算出する。
 * 直立フレームを自動選定し、頭頂近似〜足首の px 縦距離と身長から係数を決め、肩幅で妥当性を確認する。
 */
export function computeCalibration(
  frames: FrameData[],
  frameWidthPx: number,
  frameHeightPx: number,
  heightCm: number,
): CalibrationResult {
  const calibrationFrame = selectCalibrationFrame(frames);
  const lms = frames[calibrationFrame]!.landmarks;
  const nose = lms[POSE_LANDMARK.NOSE]!;
  const la = lms[POSE_LANDMARK.LEFT_ANKLE]!;
  const ra = lms[POSE_LANDMARK.RIGHT_ANKLE]!;
  const bottomY = Math.max(la.y, ra.y);
  const topY = approxHeadTopY(nose.y, bottomY);

  const ppm = pxPerMeter({
    topY,
    bottomY,
    frameHeightPx,
    subjectHeightM: heightCm / 100,
  });

  const ls = lms[POSE_LANDMARK.LEFT_SHOULDER]!;
  const rs = lms[POSE_LANDMARK.RIGHT_SHOULDER]!;
  const shoulderWidthM = shoulderWidthMeters(ls, rs, frameWidthPx, ppm);

  return {
    calibrationFrame,
    pxPerMeter: ppm,
    shoulderWidthM,
    plausible: isShoulderWidthPlausible(shoulderWidthM),
  };
}
