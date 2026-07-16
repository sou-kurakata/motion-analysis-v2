// 実動画 v4(通常速度クリップ)の実データに対する品質ガードの回帰テスト。
// v4 は「推定が破綻しているのに、もっともらしい指標値が出てしまった」クリップ(2026-07-13)。
// 正例(良質クリップ)のゴールデンではなく、弾かれるべき入力の負例として固定する。
//
// フィクスチャは実際の投球動画から抽出したランドマークと身長を含む個人の計測データのため、
// リポジトリには含めない。tests/fixtures/pitch-v4.fixture.json をローカルに置いた場合のみ実行する。

import { describe, expect, it } from 'vitest';
import { decodeFixture, type FrameFixture } from '../../src/dev/frameFixture';
import { assessQuality } from '../../src/analysis/quality';
import { detectEvents } from '../../src/analysis/events';

const found = import.meta.glob<FrameFixture>('../fixtures/pitch-v4.fixture.json', {
  eager: true,
  import: 'default',
});
const loaded = found['../fixtures/pitch-v4.fixture.json'];
const fixture = loaded as FrameFixture;
const frames = loaded ? decodeFixture(loaded) : [];

describe.skipIf(!loaded)('quality: v4(破綻クリップ)を弾く', () => {
  it('フィクスチャが読み込める', () => {
    expect(frames).toHaveLength(108);
    expect(frames[0]!.landmarks).toHaveLength(33);
  });

  it('イベント検出はエクスポート時と同じ結果を再現する(decode の健全性)', () => {
    const events = detectEvents(frames, { handedness: fixture.handedness });
    expect(events.footPlantFrame).toBe(fixture.expected.footPlantFrame);
    expect(events.releaseFrame).toBe(fixture.expected.releaseFrame);
  });

  it('品質ガードが error を出し、指標を出さない判定になる', () => {
    const events = detectEvents(frames, { handedness: fixture.handedness });
    const report = assessQuality(frames, events, events.handedness);

    expect(report.usable).toBe(false);

    // 投球腕の手首が半数近いフレームで欠損している(実測 52%)
    expect(report.worstMissingRate).toBeGreaterThan(0.3);
    expect(report.issues.some((i) => i.code === 'LOW_VISIBILITY' && i.severity === 'error')).toBe(
      true,
    );

    // 接地(48)→リリース(49)が1フレーム差 = 実際の投球ではありえない
    expect(fixture.expected.releaseFrame - fixture.expected.footPlantFrame).toBe(1);
    expect(report.issues.some((i) => i.code === 'EVENT_GAP_TOO_SHORT')).toBe(true);
  });
});
