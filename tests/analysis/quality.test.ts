// 入力データ品質ガードのテスト。
// 動機: v4(通常速度クリップ)で両腕の visibility が半数のフレームで 0.5 未満、
// さらに全身が1フレームだけワープするグリッチフレームにイベントが乗り、
// 「もっともらしいが入力が支えていない指標値」が出てしまった(2026-07-13)。

import { describe, expect, it } from 'vitest';
import type { FrameData } from '../../src/analysis/types';
import { POSE_LANDMARK } from '../../src/analysis/types';
import { assessQuality } from '../../src/analysis/quality';
import { makePitchTrajectory } from './trajectory';

const FOOT_PLANT = 20;
const RELEASE = 32;

function baseFrames(): FrameData[] {
  return makePitchTrajectory({ nFrames: 60, footPlantFrame: FOOT_PLANT, releaseFrame: RELEASE });
}

const events = { footPlantFrame: FOOT_PLANT, releaseFrame: RELEASE };

/** 指定ランドマークの visibility を、指定した割合のフレームで欠損レベルに落とす。 */
function degradeVisibility(frames: FrameData[], index: number, rate: number): FrameData[] {
  const limit = Math.round(frames.length * rate);
  return frames.map((f, i) => {
    if (i >= limit) return f;
    const landmarks = f.landmarks.map((lm, k) => (k === index ? { ...lm, visibility: 0.3 } : lm));
    return { ...f, landmarks };
  });
}

/** 指定フレームで指定ランドマークをワープさせ、次フレームで戻す(v4 で観測したグリッチの再現)。 */
function injectGlitch(frames: FrameData[], index: number, frame: number, jump = 0.25): FrameData[] {
  return frames.map((f, i) => {
    if (i !== frame) return f;
    const landmarks = f.landmarks.map((lm, k) =>
      k === index ? { ...lm, x: lm.x + jump, y: lm.y + jump } : lm,
    );
    return { ...f, landmarks };
  });
}

describe('analysis/quality', () => {
  it('理想的な軌道では問題なしと判定する', () => {
    const report = assessQuality(baseFrames(), events, 'right');
    expect(report.usable).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.worstMissingRate).toBe(0);
    expect(report.glitchFrames).toEqual([]);
  });

  it('主要ランドマークの欠損率が閾値超なら error(指標を出さない)', () => {
    // 投球腕の手首を半数のフレームで visibility 0.3 に(v4 実測は 56/108 = 52%)
    const frames = degradeVisibility(baseFrames(), POSE_LANDMARK.RIGHT_WRIST, 0.5);
    const report = assessQuality(frames, events, 'right');

    expect(report.usable).toBe(false);
    expect(report.issues.some((i) => i.code === 'LOW_VISIBILITY' && i.severity === 'error')).toBe(
      true,
    );
    expect(report.worstMissingRate).toBeCloseTo(0.5, 2);
    expect(report.worstLandmarkName).toContain('手首');
  });

  it('欠損率が閾値未満なら許容する', () => {
    const frames = degradeVisibility(baseFrames(), POSE_LANDMARK.RIGHT_WRIST, 0.2);
    const report = assessQuality(frames, events, 'right');

    expect(report.usable).toBe(true);
    expect(report.worstMissingRate).toBeCloseTo(0.2, 2);
  });

  it('イベントフレームがグリッチ(1フレームだけワープして戻る)なら error', () => {
    const frames = injectGlitch(baseFrames(), POSE_LANDMARK.LEFT_ANKLE, FOOT_PLANT);
    const report = assessQuality(frames, events, 'right');

    expect(report.glitchFrames).toContain(FOOT_PLANT);
    expect(report.usable).toBe(false);
    expect(
      report.issues.some((i) => i.code === 'EVENT_FRAME_GLITCH' && i.severity === 'error'),
    ).toBe(true);
  });

  it('イベント外のグリッチは警告どまり(指標は出す)', () => {
    const frames = injectGlitch(baseFrames(), POSE_LANDMARK.LEFT_ANKLE, 5);
    const report = assessQuality(frames, events, 'right');

    expect(report.glitchFrames).toContain(5);
    expect(report.usable).toBe(true);
    expect(report.issues.some((i) => i.severity === 'warn')).toBe(true);
  });

  it('接地→リリースが短すぎる場合は警告(サンプリングfps不足の疑い)', () => {
    // v4 では footplant 48 / release 49 の1フレーム差だった
    const frames = baseFrames();
    const report = assessQuality(frames, { footPlantFrame: 48, releaseFrame: 49 }, 'right');

    expect(report.issues.some((i) => i.code === 'EVENT_GAP_TOO_SHORT')).toBe(true);
  });

  it('イベント未検出(-1)でもクラッシュせず欠損率だけ評価する', () => {
    const report = assessQuality(baseFrames(), { footPlantFrame: -1, releaseFrame: -1 }, 'right');
    expect(report.usable).toBe(true);
    expect(report.issues.some((i) => i.code === 'EVENT_FRAME_GLITCH')).toBe(false);
  });

  it('左投げでは左腕・右足を主要ランドマークとして評価する', () => {
    const frames = degradeVisibility(baseFrames(), POSE_LANDMARK.LEFT_WRIST, 0.5);

    // 左投げなら左手首は投球腕 → error
    expect(assessQuality(frames, events, 'left').usable).toBe(false);
    // 右投げなら左手首はグラブ腕(指標に使わない) → 影響なし
    expect(assessQuality(frames, events, 'right').usable).toBe(true);
  });
});
