// テスト用の合成ランドマーク軌道ジェネレータ。
// 既知のフットプラント/リリースフレームを持つ理想的な投球軌道を生成する。

import type { FrameData, Handedness, Landmark } from '../../src/analysis/types';
import { POSE_LANDMARK } from '../../src/analysis/types';

function lm(x: number, y: number, visibility = 1): Landmark {
  return { x, y, z: 0, visibility };
}

/** smootherstep(6t^5-15t^4+10t^3)。微分は t=0.5 で最大 → 速度ピークを中央に作れる。 */
function smootherstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export interface PitchParams {
  nFrames: number;
  fps?: number;
  footPlantFrame: number;
  releaseFrame: number;
  handedness?: Handedness;
}

/**
 * 理想的な投球軌道を生成する。
 * - 前足足首: フットプラントまで前進(ストライド)→ 以降静止(接地)
 * - 前足かかと y: 一定(安定)
 * - 投球腕手首: リリース中心の smootherstep で掃引(速度がリリースで最大)
 * - 肘角度: 掃引に伴いリリース近傍で 150° を超える
 */
export function makePitchTrajectory(p: PitchParams): FrameData[] {
  const { nFrames, footPlantFrame, releaseFrame, handedness = 'right' } = p;
  const fps = p.fps ?? 30;
  const rh = handedness === 'right';

  const A = rh ? POSE_LANDMARK.LEFT_ANKLE : POSE_LANDMARK.RIGHT_ANKLE;
  const H = rh ? POSE_LANDMARK.LEFT_HEEL : POSE_LANDMARK.RIGHT_HEEL;
  const S = rh ? POSE_LANDMARK.RIGHT_SHOULDER : POSE_LANDMARK.LEFT_SHOULDER;
  const E = rh ? POSE_LANDMARK.RIGHT_ELBOW : POSE_LANDMARK.LEFT_ELBOW;
  const W = rh ? POSE_LANDMARK.RIGHT_WRIST : POSE_LANDMARK.LEFT_WRIST;

  const hw = 6; // リリース掃引の半幅(フレーム)
  const wStart = { x: 0.6, y: 0.35 };
  const wEnd = { x: 0.5, y: 0.7 };

  const frames: FrameData[] = [];
  for (let f = 0; f < nFrames; f++) {
    const landmarks: Landmark[] = new Array<Landmark>(33);
    for (let i = 0; i < 33; i++) landmarks[i] = lm(0.5, 0.5, 1);

    // 前足足首: ワインドアップ(静止)→ ストライド(前進)→ 接地(静止)
    const windup = Math.min(8, Math.max(0, Math.floor(footPlantFrame / 2)));
    let ax: number;
    if (f < windup) ax = 0.65;
    else if (f < footPlantFrame) ax = 0.65 - 0.25 * ((f - windup) / (footPlantFrame - windup));
    else ax = 0.4;
    landmarks[A] = lm(ax, 0.9, 1);
    landmarks[H] = lm(ax - 0.02, 0.95, 1);

    // 投球腕(肩・肘は固定、手首を掃引)
    landmarks[S] = lm(0.5, 0.3, 1);
    landmarks[E] = lm(0.5, 0.45, 1);
    const pr = smootherstep((f - (releaseFrame - hw)) / (2 * hw));
    landmarks[W] = lm(
      wStart.x + pr * (wEnd.x - wStart.x),
      wStart.y + pr * (wEnd.y - wStart.y),
      1,
    );

    frames.push({
      timestampMs: Math.round((f * 1000) / fps),
      landmarks,
      worldLandmarks: landmarks,
    });
  }
  return frames;
}

/** 静止(投球なし)軌道。全フレーム同一。イベントが検出されないことの確認用。 */
export function makeStaticTrajectory(nFrames: number, fps = 30): FrameData[] {
  const frames: FrameData[] = [];
  for (let f = 0; f < nFrames; f++) {
    const landmarks: Landmark[] = new Array<Landmark>(33);
    for (let i = 0; i < 33; i++) landmarks[i] = lm(0.5, 0.5, 1);
    landmarks[POSE_LANDMARK.LEFT_ANKLE] = lm(0.4, 0.9, 1);
    landmarks[POSE_LANDMARK.LEFT_HEEL] = lm(0.38, 0.95, 1);
    landmarks[POSE_LANDMARK.RIGHT_SHOULDER] = lm(0.5, 0.3, 1);
    landmarks[POSE_LANDMARK.RIGHT_ELBOW] = lm(0.5, 0.45, 1);
    landmarks[POSE_LANDMARK.RIGHT_WRIST] = lm(0.6, 0.4, 1);
    frames.push({
      timestampMs: Math.round((f * 1000) / fps),
      landmarks,
      worldLandmarks: landmarks,
    });
  }
  return frames;
}
