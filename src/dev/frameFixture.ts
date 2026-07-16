// 開発用: 実動画の解析結果を回帰テスト用フィクスチャとして書き出し/読み戻しする。
// analysis/ からは参照しない(純粋関数レイヤの依存を増やさないため)。
// 目的: 受け入れ確認済みクリップの検出結果をゴールデン値として固定し、閾値調整で壊れたら検知する。

import type { FrameData, Handedness, Landmark, PitchMetrics } from '../analysis/types';
import type { CalibrationResult } from '../analysis/calibration';
import type { EventDetectionResult } from '../analysis/events';

/** ランドマーク1点の圧縮表現。[x, y, z, visibility]。 */
type PackedLandmark = [number, number, number, number];
/** 1フレームの圧縮表現。[timestampMs, landmarks]。 */
type PackedFrame = [number, PackedLandmark[]];

export interface FrameFixture {
  version: 1;
  /** 元動画のファイル名(再現用)。 */
  source: string;
  frameWidthPx: number;
  frameHeightPx: number;
  fps: number;
  heightCm: number;
  /** 解析に使った利き腕(auto の場合は判定結果)。 */
  handedness: Handedness;
  /** 解析範囲(秒)。null = 未指定(全体)。 */
  startSec: number | null;
  endSec: number | null;
  /** 受け入れ確認時に app が表示していた値。回帰テストの期待値。 */
  expected: {
    footPlantFrame: number;
    releaseFrame: number;
    calibrationFrame: number;
    pxPerMeter: number;
    shoulderWidthM: number;
    metrics: PitchMetrics;
  };
  /**
   * ランドマーク時系列。worldLandmarks は analysis で未使用のため含めない。
   * 座標は 4桁、z/visibility は 3桁に丸める(1080px 幅でも 0.1px 未満の誤差)。
   */
  frames: PackedFrame[];
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function packLandmark(lm: Landmark): PackedLandmark {
  return [round(lm.x, 4), round(lm.y, 4), round(lm.z, 3), round(lm.visibility, 3)];
}

export interface EncodeFixtureInput {
  source: string;
  frames: FrameData[];
  frameWidthPx: number;
  frameHeightPx: number;
  fps: number;
  heightCm: number;
  startSec: number | null;
  endSec: number | null;
  events: EventDetectionResult;
  calibration: CalibrationResult;
  metrics: PitchMetrics;
}

export function encodeFixture(input: EncodeFixtureInput): FrameFixture {
  return {
    version: 1,
    source: input.source,
    frameWidthPx: input.frameWidthPx,
    frameHeightPx: input.frameHeightPx,
    fps: input.fps,
    heightCm: input.heightCm,
    handedness: input.events.handedness,
    startSec: input.startSec,
    endSec: input.endSec,
    expected: {
      footPlantFrame: input.events.footPlantFrame,
      releaseFrame: input.events.releaseFrame,
      calibrationFrame: input.calibration.calibrationFrame,
      pxPerMeter: input.calibration.pxPerMeter,
      shoulderWidthM: input.calibration.shoulderWidthM,
      metrics: input.metrics,
    },
    frames: input.frames.map((f) => [
      round(f.timestampMs, 1),
      f.landmarks.map(packLandmark),
    ]),
  };
}

/** フィクスチャを FrameData[] に戻す。worldLandmarks は空(analysis は参照しない)。 */
export function decodeFixture(fixture: FrameFixture): FrameData[] {
  return fixture.frames.map(([timestampMs, landmarks]) => ({
    timestampMs,
    landmarks: landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
    worldLandmarks: [],
  }));
}
