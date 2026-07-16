// メインスレッド ⇄ poseWorker 間のメッセージ型定義。

import type { Landmark } from '../analysis/types';

/** 推論の実行モード。静止画は IMAGE、動画フレーム列は VIDEO(時系列追従)。 */
export type PoseMode = 'IMAGE' | 'VIDEO';

/** メインスレッド → Worker */
export type PoseRequest =
  | { type: 'init'; mode: PoseMode }
  | { type: 'detectImage'; id: number; bitmap: ImageBitmap }
  | { type: 'detectVideo'; id: number; bitmap: ImageBitmap; timestampMs: number };

/** Worker → メインスレッド */
export type PoseResponse =
  | { type: 'ready' }
  | { type: 'progress'; stage: string }
  | {
      type: 'result';
      id: number;
      landmarks: Landmark[];
      worldLandmarks: Landmark[];
    }
  | { type: 'error'; id?: number; message: string };
