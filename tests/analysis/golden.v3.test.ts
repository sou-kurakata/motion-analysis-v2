// v3(スロー再生)の脚側限定ゴールデン回帰テスト。
//
// なぜ「脚側限定」か(2026-07-14 調査):
// v3 は撮影プロトコル違反(グラブ側から撮影。正しくは右投げ=三塁側=投球腕側)で、
// リリース〜フォロースルーで投球腕が体幹の陰に隠れる。
// MediaPipe は見えない腕を推定しようとして frame 514–517 で空中に幻のランドマークを出し、
// リリース(515)はその上に検出されていた(手首が1フレームで正規化 0.235 = 直前の約20倍ジャンプ)。
// したがって リリース側の値(肘角度・体幹前傾・手首ピーク速度・前膝伸展量)は固定しない。
// 脚側(前足足首・膝・股関節)は visibility が高く安定しており、ユーザーの目視確認(±2フレーム)とも一致する。
//
// リリース側のゴールデンは、プロトコル準拠(投球腕側=右投げなら三塁側)で撮り直したクリップで
// 別途作成する(PLAN.md 参照)。
//
// フィクスチャは実際の投球動画から抽出したランドマークと身長を含む個人の計測データのため、
// リポジトリには含めない。tests/fixtures/pitch-v3.fixture.json をローカルに置いた場合のみ実行する。

import { beforeAll, describe, expect, it } from 'vitest';
import { decodeFixture, type FrameFixture } from '../../src/dev/frameFixture';
import { detectEvents, detectHandedness } from '../../src/analysis/events';
import { computeCalibration } from '../../src/analysis/calibration';
import { computeMetrics } from '../../src/analysis/metrics';
import { assessQuality } from '../../src/analysis/quality';

const found = import.meta.glob<FrameFixture>('../fixtures/pitch-v3.fixture.json', {
  eager: true,
  import: 'default',
});
const loaded = found['../fixtures/pitch-v3.fixture.json'];
const fixture = loaded as FrameFixture;
const frames = loaded ? decodeFixture(loaded) : [];
const frameWidthPx = loaded?.frameWidthPx ?? 0;
const frameHeightPx = loaded?.frameHeightPx ?? 0;
const heightCm = loaded?.heightCm ?? 0;

/** ユーザーが app 上で目視確認したフットプラント(14.10s = frame 423 / 30fps)。 */
const GOLDEN_FOOT_PLANT_FRAME = 423;

describe.skipIf(!loaded)('golden(v3・脚側): フットプラント', () => {
  it('利き腕を自動判定できる(右投げ)', () => {
    expect(detectHandedness(frames)).toBe('right');
  });

  it('フットプラントが目視確認値と ±2 フレーム以内で一致する', () => {
    const events = detectEvents(frames, { handedness: fixture.handedness });

    expect(events.footPlantFrame).toBe(fixture.expected.footPlantFrame);
    expect(Math.abs(events.footPlantFrame - GOLDEN_FOOT_PLANT_FRAME)).toBeLessThanOrEqual(2);
    // 14.10s 前後(30fps サンプリング)
    expect(frames[events.footPlantFrame]!.timestampMs / 1000).toBeCloseTo(14.1, 1);
  });
});

describe.skipIf(!loaded)('golden(v3・脚側): キャリブレーションと脚の指標', () => {
  let calibration: ReturnType<typeof computeCalibration>;
  let metrics: ReturnType<typeof computeMetrics>;

  beforeAll(() => {
    const events = detectEvents(frames, { handedness: fixture.handedness });
    calibration = computeCalibration(frames, frameWidthPx, frameHeightPx, heightCm);
    metrics = computeMetrics({
      frames,
      events,
      handedness: events.handedness,
      pxPerMeter: calibration.pxPerMeter,
      frameWidthPx,
      frameHeightPx,
      heightCm,
    });
  });

  it('キャリブレーションが妥当(換算肩幅が許容範囲内)', () => {
    expect(calibration.calibrationFrame).toBe(fixture.expected.calibrationFrame);
    expect(calibration.pxPerMeter).toBeCloseTo(fixture.expected.pxPerMeter, 1);
    expect(calibration.plausible).toBe(true);
  });

  it('ストライド長比が固定値と一致し、投球として妥当な範囲にある', () => {
    expect(metrics.strideLengthRatio).toBeCloseTo(fixture.expected.metrics.strideLengthRatio, 3);
    // 一般に 0.6–1.1 × 身長
    expect(metrics.strideLengthRatio).toBeGreaterThan(0.6);
    expect(metrics.strideLengthRatio).toBeLessThan(1.1);
  });

  it('フットプラント時の前膝角度が固定値と一致する', () => {
    // 許容 0.05°。フィクスチャは座標を4桁に丸めているため完全一致にはならない(実測差 0.006°)。
    expect(metrics.leadKneeAngleAtFootPlant).toBeCloseTo(
      fixture.expected.metrics.leadKneeAngleAtFootPlant,
      1,
    );
  });

  // リリース側(leadKneeAngleAtRelease / leadKneeExtension / trunkForwardTiltAtRelease /
  // elbowAngleAtRelease / peakWristSpeed)は、腕が遮蔽され幻のランドマークに乗るため固定しない。
});

describe.skipIf(!loaded)('golden(v3・脚側): 品質ガードの挙動', () => {
  it('脚側は健全なので指標を出す判定になる(usable)', () => {
    const events = detectEvents(frames, { handedness: fixture.handedness });
    const report = assessQuality(frames, events, events.handedness);

    expect(report.usable).toBe(true);
    // ただし投球腕の肘は 26% 欠損しており、閾値 30% の直下にある(撮影アングル起因)
    expect(report.worstMissingRate).toBeGreaterThan(0.2);
    expect(report.worstMissingRate).toBeLessThan(0.3);
  });

  it('既知の限界: 現在のガードは投球腕の幻ランドマーク(514–517の連続逸脱)を検知できない', () => {
    const events = detectEvents(frames, { handedness: fixture.handedness });
    const report = assessQuality(frames, events, events.handedness);

    // 単発ワープしか見ていないため、4フレーム続く逸脱はグリッチとして拾えない。
    // 撮影プロトコル(右投げ=三塁側=投球腕側)を守ることで入力側から解決する方針。
    // このテストは「現状の限界」を明示的に固定するもの。解決したら期待値を反転させる。
    expect(report.glitchFrames).not.toContain(515);
  });
});
