// 動画 → フレーム抽出 → Worker 逐次推論 → FrameData[] を得る。
// seek ベースで一定 fps のフレームを取り出し、VIDEO モードの Worker に順次投入する。

import type { FrameData, Landmark } from '../analysis/types';
import {
  ROI_MARGIN_RATIO,
  ROI_MIN_SIZE_PX,
  ROI_MIN_VISIBILITY,
  ROI_RESET_MEAN_VISIBILITY,
  ROI_SCAN_SAMPLES,
} from '../analysis/constants';
import type { PoseMode, PoseRequest, PoseResponse } from './poseMessages';
import { computeRoi, mapLandmarksFromRoi, type Rect } from './roi';

export interface ProcessOptions {
  /** 抽出サンプリング fps。 */
  fps: number;
  /** 進捗コールバック(0–1)。 */
  onProgress?: (ratio: number) => void;
  /** 解析開始秒(省略時 0)。長尺・多投球クリップから1投球を切り出す用途。 */
  startSec?: number;
  /** 解析終了秒(省略時 動画長)。 */
  endSec?: number;
  /**
   * ROI クロップの方式(既定 'none')。
   *
   * v3 の腕の局面(16.0–17.9s / 57フレーム)での実測(2026-07-13):
   * | mode | 投球腕手首の平均vis | vis<0.5 | ありえないジャンプ |
   * |---|---|---|---|
   * | none | 0.733 | 5 | 4 |
   * | perFrame | 0.807 | 0 | **8**(悪化) |
   * | static | 0.261 | 48 | 6 |
   *
   * → **どの方式でも腕の軌道は安定しない**。クロップ画像自体は投手を正しく大きく捉えており、
   * 実効解像度の問題ではないことが分かった(根本原因は別。PLAN.md 参照)。
   * 既定は 'none'。オプションは今後の検証用に残す。
   */
  roiMode?: RoiMode;
}

export type RoiMode = 'none' | 'static' | 'perFrame';

/** video を指定時刻へ seek し、完了を待つ。 */
function seek(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('動画の seek に失敗しました'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = timeSec;
  });
}

/** Worker に1フレーム投げて結果を待つ(id で対応付け)。 */
function detectFrame(
  worker: Worker,
  id: number,
  bitmap: ImageBitmap,
  timestampMs: number,
): Promise<{ landmarks: FrameData['landmarks']; worldLandmarks: FrameData['worldLandmarks'] }> {
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<PoseResponse>) => {
      const msg = ev.data;
      if (msg.type === 'result' && msg.id === id) {
        worker.removeEventListener('message', onMessage);
        resolve({ landmarks: msg.landmarks, worldLandmarks: msg.worldLandmarks });
      } else if (msg.type === 'error' && msg.id === id) {
        worker.removeEventListener('message', onMessage);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener('message', onMessage);
    const req: PoseRequest = { type: 'detectVideo', id, bitmap, timestampMs };
    worker.postMessage(req, [bitmap]);
  });
}

/** Worker の init 完了(ready)を待つ。 */
function initWorker(worker: Worker, mode: PoseMode = 'VIDEO'): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<PoseResponse>) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        worker.removeEventListener('message', onMessage);
        resolve();
      } else if (msg.type === 'error') {
        worker.removeEventListener('message', onMessage);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener('message', onMessage);
    const req: PoseRequest = { type: 'init', mode };
    worker.postMessage(req);
  });
}

/** IMAGE モード Worker に1フレーム投げて結果を待つ(事前スキャン用)。 */
function detectImageFrame(
  worker: Worker,
  id: number,
  bitmap: ImageBitmap,
): Promise<{ landmarks: Landmark[]; worldLandmarks: Landmark[] }> {
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<PoseResponse>) => {
      const msg = ev.data;
      if (msg.type === 'result' && msg.id === id) {
        worker.removeEventListener('message', onMessage);
        resolve({ landmarks: msg.landmarks, worldLandmarks: msg.worldLandmarks });
      } else if (msg.type === 'error' && msg.id === id) {
        worker.removeEventListener('message', onMessage);
        reject(new Error(msg.message));
      }
    };
    worker.addEventListener('message', onMessage);
    const req: PoseRequest = { type: 'detectImage', id, bitmap };
    worker.postMessage(req, [bitmap]);
  });
}

/** ランドマーク列の平均 visibility。ROI が被写体を外していないかの判定に使う。 */
function meanVisibility(landmarks: Landmark[]): number {
  if (landmarks.length === 0) return 0;
  let sum = 0;
  for (const lm of landmarks) sum += lm.visibility;
  return sum / landmarks.length;
}

/**
 * 事前スキャン: 区間内を粗くサンプリングして全画面推論し、
 * 投手の**動作範囲全体**を覆う固定 ROI を求める(カメラ固定前提)。
 * VIDEO モードのタイムスタンプ単調増加を壊さないよう、専用の IMAGE モード Worker で行う。
 */
async function scanStaticRoi(
  video: HTMLVideoElement,
  start: number,
  end: number,
  frameWidthPx: number,
  frameHeightPx: number,
): Promise<Rect | null> {
  const worker = new Worker(new URL('./poseWorker.ts', import.meta.url), { type: 'module' });
  try {
    await initWorker(worker, 'IMAGE');

    const step = Math.max((end - start) / ROI_SCAN_SAMPLES, 1e-3);
    const collected: Landmark[] = [];
    let id = 0;

    for (let t = start; t < end - 1e-6; t += step) {
      await seek(video, Math.min(t, video.duration));
      const bitmap = await createImageBitmap(video);
      const res = await detectImageFrame(worker, ++id, bitmap);
      // 動作範囲の和集合を取りたいので、有効な点をすべて溜める
      for (const lm of res.landmarks) {
        if (lm.visibility >= ROI_MIN_VISIBILITY) collected.push(lm);
      }
    }

    return computeRoi(collected, frameWidthPx, frameHeightPx, {
      marginRatio: ROI_MARGIN_RATIO,
      minSizePx: ROI_MIN_SIZE_PX,
      minVisibility: ROI_MIN_VISIBILITY,
    });
  } finally {
    worker.terminate();
  }
}

/**
 * 読み込み済みの video 要素から全フレームを抽出し、ポーズ推定して FrameData[] を返す。
 * video は事前に loadeddata 済み(duration/videoWidth が有効)であること。
 *
 * ROI クロップは既定 OFF('none')。実測で腕の追従が改善しなかったため(ProcessOptions のコメント参照)。
 * 'static' / 'perFrame' は検証用に残してある。ROI 推論時の座標は全画面の正規化座標へ戻す。
 */
export async function processVideo(
  video: HTMLVideoElement,
  opts: ProcessOptions,
): Promise<FrameData[]> {
  const duration = video.duration;
  const frameWidthPx = video.videoWidth;
  const frameHeightPx = video.videoHeight;
  // 実測で改善が確認できなかったため既定は 'none'(ProcessOptions のコメント参照)
  const roiMode: RoiMode = opts.roiMode ?? 'none';
  const start = Math.max(0, opts.startSec ?? 0);
  const end = Math.min(duration, opts.endSec ?? duration);
  const span = Math.max(1e-6, end - start);
  const dt = 1 / opts.fps;

  // 固定 ROI は本処理の前に決める(事前スキャン)
  const staticRoi =
    roiMode === 'static'
      ? await scanStaticRoi(video, start, end, frameWidthPx, frameHeightPx)
      : null;

  const worker = new Worker(new URL('./poseWorker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    await initWorker(worker, 'VIDEO');

    const frames: FrameData[] = [];
    let id = 0;
    /** このフレームの推論に使う ROI。null なら全画面推論。 */
    let roi: Rect | null = staticRoi;

    // 浮動小数の誤差で最終フレームを取りこぼさないよう、微小マージンを許容する。
    for (let t = start; t < end - 1e-6; t += dt) {
      const clamped = Math.min(t, duration);
      await seek(video, clamped);
      const timestampMs = Math.round(clamped * 1000);

      const bitmap =
        roi === null
          ? await createImageBitmap(video)
          : await createImageBitmap(video, roi.x, roi.y, roi.w, roi.h);

      const res = await detectFrame(worker, ++id, bitmap, timestampMs);

      // ROI 推論の座標はクロップ基準なので全画面基準へ戻す
      const landmarks: Landmark[] =
        roi === null
          ? res.landmarks
          : mapLandmarksFromRoi(res.landmarks, roi, frameWidthPx, frameHeightPx);

      frames.push({
        timestampMs,
        landmarks,
        // worldLandmarks は人物中心のメートル座標でクロップの影響を受けない
        worldLandmarks: res.worldLandmarks,
      });

      if (roiMode === 'perFrame') {
        // 検出が破綻していたら全画面推論に戻して立て直す
        roi =
          meanVisibility(landmarks) < ROI_RESET_MEAN_VISIBILITY
            ? null
            : computeRoi(landmarks, frameWidthPx, frameHeightPx, {
                marginRatio: ROI_MARGIN_RATIO,
                minSizePx: ROI_MIN_SIZE_PX,
                minVisibility: ROI_MIN_VISIBILITY,
              });
      }

      opts.onProgress?.(Math.min(1, (t + dt - start) / span));
    }

    opts.onProgress?.(1);
    return frames;
  } finally {
    worker.terminate();
  }
}
