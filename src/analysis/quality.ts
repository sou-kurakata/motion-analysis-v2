// 入力データ(ランドマーク時系列)の品質を評価し、指標を出してよいかを判定する。
// 動機(2026-07-13): 通常速度クリップ(v4)でポーズ推定が破綻していても、
// 指標は「もっともらしい数値」を返してしまう。壊れた入力から出た数字を
// セッションに保存させないための門番。

import {
  QUALITY_GLITCH_JUMP_NORM,
  QUALITY_MIN_EVENT_GAP_FRAMES,
  QUALITY_MISSING_RATE_MAX,
  VISIBILITY_EXCLUDE_THRESHOLD,
} from './constants';
import type { FrameData, Handedness, PitchEvents } from './types';
import { POSE_LANDMARK } from './types';

export type QualitySeverity = 'error' | 'warn';

export type QualityCode =
  | 'LOW_VISIBILITY'
  | 'EVENT_FRAME_GLITCH'
  | 'GLITCH_ELSEWHERE'
  | 'EVENT_GAP_TOO_SHORT';

export interface QualityIssue {
  severity: QualitySeverity;
  code: QualityCode;
  /** UI にそのまま出せる日本語メッセージ。 */
  message: string;
}

export interface QualityReport {
  /** 指標を表示・保存してよいか(error が1件も無ければ true)。 */
  usable: boolean;
  issues: QualityIssue[];
  /** 主要ランドマークの最大欠損率(0–1)。 */
  worstMissingRate: number;
  /** 最大欠損率だったランドマークの名前。 */
  worstLandmarkName: string;
  /** ワープ(1フレームだけ飛んで戻る)が起きたフレーム番号。 */
  glitchFrames: number[];
}

/** 指標計算に使う主要ランドマーク(利き腕依存)。名前は UI 表示用。 */
function requiredLandmarks(handedness: Handedness): Array<{ index: number; name: string }> {
  const rh = handedness === 'right';
  return [
    { index: POSE_LANDMARK.NOSE, name: '鼻(キャリブレーション)' },
    { index: POSE_LANDMARK.LEFT_SHOULDER, name: '左肩' },
    { index: POSE_LANDMARK.RIGHT_SHOULDER, name: '右肩' },
    { index: POSE_LANDMARK.LEFT_HIP, name: '左股関節' },
    { index: POSE_LANDMARK.RIGHT_HIP, name: '右股関節' },
    { index: POSE_LANDMARK.LEFT_ANKLE, name: '左足首' },
    { index: POSE_LANDMARK.RIGHT_ANKLE, name: '右足首' },
    {
      index: rh ? POSE_LANDMARK.RIGHT_ELBOW : POSE_LANDMARK.LEFT_ELBOW,
      name: '投球腕の肘',
    },
    {
      index: rh ? POSE_LANDMARK.RIGHT_WRIST : POSE_LANDMARK.LEFT_WRIST,
      name: '投球腕の手首',
    },
    {
      index: rh ? POSE_LANDMARK.LEFT_KNEE : POSE_LANDMARK.RIGHT_KNEE,
      name: '前足の膝',
    },
  ];
}

/** グリッチ検出に使うランドマーク(イベント判定を狂わせる部位)。 */
function glitchWatchLandmarks(handedness: Handedness): number[] {
  const rh = handedness === 'right';
  return [
    POSE_LANDMARK.LEFT_ANKLE,
    POSE_LANDMARK.RIGHT_ANKLE,
    rh ? POSE_LANDMARK.RIGHT_WRIST : POSE_LANDMARK.LEFT_WRIST,
    rh ? POSE_LANDMARK.RIGHT_ELBOW : POSE_LANDMARK.LEFT_ELBOW,
    rh ? POSE_LANDMARK.LEFT_KNEE : POSE_LANDMARK.RIGHT_KNEE,
  ];
}

/**
 * frame i が「飛んで戻る」動きか。
 * 前後への変位がともに大きく、i-1 と i+1 は近い(=往復)ならワープとみなす。
 */
function isGlitchAt(frames: FrameData[], index: number, i: number): boolean {
  const prev = frames[i - 1]?.landmarks[index];
  const cur = frames[i]?.landmarks[index];
  const next = frames[i + 1]?.landmarks[index];
  if (!prev || !cur || !next) return false;

  const dPrev = Math.hypot(cur.x - prev.x, cur.y - prev.y);
  const dNext = Math.hypot(next.x - cur.x, next.y - cur.y);
  const dSpan = Math.hypot(next.x - prev.x, next.y - prev.y);

  return (
    dPrev > QUALITY_GLITCH_JUMP_NORM &&
    dNext > QUALITY_GLITCH_JUMP_NORM &&
    dSpan < QUALITY_GLITCH_JUMP_NORM / 2
  );
}

export function assessQuality(
  frames: FrameData[],
  events: PitchEvents,
  handedness: Handedness,
): QualityReport {
  const n = frames.length;
  const issues: QualityIssue[] = [];

  // 1. 欠損率(visibility < 0.5 のフレーム割合)
  let worstMissingRate = 0;
  let worstLandmarkName = '';
  for (const { index, name } of requiredLandmarks(handedness)) {
    let missing = 0;
    for (const f of frames) {
      const lm = f.landmarks[index];
      if (!lm || lm.visibility < VISIBILITY_EXCLUDE_THRESHOLD) missing++;
    }
    const rate = n > 0 ? missing / n : 0;
    if (rate > worstMissingRate) {
      worstMissingRate = rate;
      worstLandmarkName = name;
    }
  }
  if (worstMissingRate > QUALITY_MISSING_RATE_MAX) {
    issues.push({
      severity: 'error',
      code: 'LOW_VISIBILITY',
      message:
        `${worstLandmarkName}が全フレームの ${Math.round(worstMissingRate * 100)}% で検出できていません` +
        `(許容 ${Math.round(QUALITY_MISSING_RATE_MAX * 100)}%)。` +
        `モーションブラーや被写体の小ささが原因のことが多いため、` +
        `スロー再生・高fps・明るい場所での撮り直しを推奨します。`,
    });
  }

  // 2. グリッチ(1フレームだけワープして戻る)
  const glitchSet = new Set<number>();
  const watch = glitchWatchLandmarks(handedness);
  for (let i = 1; i < n - 1; i++) {
    if (watch.some((index) => isGlitchAt(frames, index, i))) glitchSet.add(i);
  }
  const glitchFrames = [...glitchSet].sort((a, b) => a - b);

  const eventFrames = [events.footPlantFrame, events.releaseFrame].filter((f) => f >= 0);
  const glitchedEvents = eventFrames.filter((f) => glitchSet.has(f));
  if (glitchedEvents.length > 0) {
    issues.push({
      severity: 'error',
      code: 'EVENT_FRAME_GLITCH',
      message:
        `検出したイベント(frame ${glitchedEvents.join(', ')})が、骨格が1フレームだけ飛んで戻る` +
        `不正なフレームに乗っています。イベント位置と指標値は信頼できません。`,
    });
  } else if (glitchFrames.length > 0) {
    issues.push({
      severity: 'warn',
      code: 'GLITCH_ELSEWHERE',
      message: `骨格が飛ぶフレームが ${glitchFrames.length} 件あります(frame ${glitchFrames
        .slice(0, 5)
        .join(', ')}${glitchFrames.length > 5 ? ' …' : ''})。イベント位置は外れていますが、精度に注意してください。`,
    });
  }

  // 3. 接地→リリースの間隔
  const { footPlantFrame: fp, releaseFrame: rel } = events;
  if (fp >= 0 && rel >= 0 && rel - fp < QUALITY_MIN_EVENT_GAP_FRAMES) {
    issues.push({
      severity: 'warn',
      code: 'EVENT_GAP_TOO_SHORT',
      message:
        `接地(frame ${fp})からリリース(frame ${rel})までが ${rel - fp} フレームしかありません。` +
        `実際の投球では 0.12–0.15 秒(30fps で 4–5 フレーム)あるはずで、` +
        `サンプリング fps 不足かイベント誤検出の疑いがあります。前膝伸展量は特に信頼できません。`,
    });
  }

  return {
    usable: !issues.some((i) => i.severity === 'error'),
    issues,
    worstMissingRate,
    worstLandmarkName,
    glitchFrames,
  };
}
