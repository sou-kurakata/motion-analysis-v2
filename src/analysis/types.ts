// src/analysis/ は純粋関数・型のみ。DOM / MediaPipe / React への依存は禁止。

/** 2次元の点。geometry など座標計算の汎用入力(Landmark も構造的に代入可能)。 */
export interface Point2D {
  x: number;
  y: number;
}

/** MediaPipe Pose の1ランドマーク。座標は 0–1 の正規化値。 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** 推定信頼度 0–1。0.5 未満は欠損扱いにする(CLAUDE.md 仕様)。 */
  visibility: number;
}

/** 1フレーム分のポーズ推定結果。 */
export interface FrameData {
  timestampMs: number;
  /** 33点, 正規化座標 (x, y, z, visibility)。 */
  landmarks: Landmark[];
  /** メートル単位の擬似3D。参考値として保持。 */
  worldLandmarks: Landmark[];
}

/** 利き腕(投球腕)。 */
export type Handedness = 'right' | 'left';

/** 投球イベントのフレーム番号。未検出は -1。 */
export interface PitchEvents {
  footPlantFrame: number; // 前足接地
  releaseFrame: number; // リリース
}

/** イベント検出の状態機械の状態。 */
export type PitchState =
  | 'WINDUP'
  | 'STRIDE'
  | 'ARM_COCKING'
  | 'RELEASE_DETECTED'
  | 'FOLLOW_THROUGH';

/** 球速相関指標。未算出の項目は NaN。 */
export interface PitchMetrics {
  strideLengthRatio: number; // ストライド長 / 身長
  leadKneeAngleAtFootPlant: number;
  leadKneeAngleAtRelease: number;
  leadKneeExtension: number; // release - footPlant(伸展量、正が良)
  trunkForwardTiltAtRelease: number; // 体幹前傾角(垂直基準, deg)
  elbowAngleAtRelease: number;
  peakWristSpeed: number; // m/s(キャリブレーション済み)
}

/** セッション(指標+実測球速)。M5 の永続化で使用。 */
export interface Session {
  id: string;
  date: string;
  metrics: PitchMetrics;
  measuredVelocityKmh?: number; // スピードガン実測値(任意入力)
  note?: string;
}

/** MediaPipe Pose の33点における主要ランドマークの添字。 */
export const POSE_LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
} as const;

/**
 * MediaPipe Pose の骨格接続(描画用)。
 * 添字ペアの配列。左右の主要な連結のみを収録。
 */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // 顔・肩
  [11, 12],
  // 左腕
  [11, 13],
  [13, 15],
  // 右腕
  [12, 14],
  [14, 16],
  // 体幹
  [11, 23],
  [12, 24],
  [23, 24],
  // 左脚
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  // 右脚
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
];
