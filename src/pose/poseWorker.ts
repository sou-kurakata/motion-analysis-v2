// PoseLandmarker を Web Worker 上で動かす。メインスレッドをブロックしない(コア設計原則2)。
// init の mode に応じて IMAGE(静止画)/ VIDEO(動画フレーム列, 時系列追従)を切り替える。

import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../analysis/types';
import type { PoseMode, PoseRequest, PoseResponse } from './poseMessages';

// MediaPipe の WASM とモデル重みの取得元。
// M0 疎通では CDN から取得する(重みのみ。ユーザー動画は端末外に出ない原則は維持)。
// 後続で public/ へのローカル同梱に切替可能。決定ログ参照。
// 重要: WASM のバージョンは npm パッケージ(JS グルー)と厳密に一致させること。
// 不一致だと "ModuleFactory not set." で初期化に失敗する。package.json で 0.10.35 に固定。
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';

let landmarker: PoseLandmarker | null = null;
let currentMode: PoseMode = 'IMAGE';

function post(msg: PoseResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

async function init(mode: PoseMode): Promise<void> {
  currentMode = mode;
  post({ type: 'progress', stage: 'モデル生成中' });
  // FilesetResolver.forVisionTasks は classic 版グルー(vision_wasm_internal.js)を選ぶが、
  // module worker では import() でロードされ top-level var が self に載らず ModuleFactory 未設定になる。
  // module 版グルー(globalThis.ModuleFactory を設定する ESM)を明示指定する。
  const fileset = {
    wasmLoaderPath: `${WASM_BASE}/vision_wasm_module_internal.js`,
    wasmBinaryPath: `${WASM_BASE}/vision_wasm_module_internal.wasm`,
  };
  // CPU delegate を使う。Worker 内での GPU(WebGL)初期化はハングする環境があるため。
  landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    runningMode: mode,
    numPoses: 1,
  });
  post({ type: 'ready' });
}

function detectImage(id: number, bitmap: ImageBitmap): void {
  if (!landmarker || currentMode !== 'IMAGE') {
    post({ type: 'error', id, message: 'IMAGE モードで未初期化' });
    bitmap.close();
    return;
  }
  const result = landmarker.detect(bitmap);
  emitResult(id, result, bitmap);
}

function detectVideo(id: number, bitmap: ImageBitmap, timestampMs: number): void {
  if (!landmarker || currentMode !== 'VIDEO') {
    post({ type: 'error', id, message: 'VIDEO モードで未初期化' });
    bitmap.close();
    return;
  }
  // detectForVideo は単調増加のタイムスタンプ(ms)を要求する。
  const result = landmarker.detectForVideo(bitmap, timestampMs);
  emitResult(id, result, bitmap);
}

function emitResult(
  id: number,
  result: { landmarks: Landmark[][]; worldLandmarks: Landmark[][] },
  bitmap: ImageBitmap,
): void {
  const landmarks = (result.landmarks[0] ?? []) as Landmark[];
  const worldLandmarks = (result.worldLandmarks[0] ?? []) as Landmark[];
  bitmap.close();
  post({ type: 'result', id, landmarks, worldLandmarks });
}

self.onmessage = (ev: MessageEvent<PoseRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init':
        void init(msg.mode).catch((e) =>
          post({ type: 'error', message: `init 失敗: ${String(e)}` }),
        );
        break;
      case 'detectImage':
        detectImage(msg.id, msg.bitmap);
        break;
      case 'detectVideo':
        detectVideo(msg.id, msg.bitmap, msg.timestampMs);
        break;
    }
  } catch (e) {
    post({ type: 'error', message: String(e) });
  }
};
