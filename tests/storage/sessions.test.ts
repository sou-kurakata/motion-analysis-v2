// M5: セッション永続化(IndexedDB)のテスト。
// jsdom には IndexedDB 実装がないため fake-indexeddb でグローバルを差し替える。
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import type { PitchMetrics } from '../../src/analysis/types';
import {
  clearSessions,
  deleteSession,
  listSessions,
  saveSession,
  updateSession,
} from '../../src/storage/sessions';

function metrics(overrides: Partial<PitchMetrics> = {}): PitchMetrics {
  return {
    strideLengthRatio: 0.85,
    leadKneeAngleAtFootPlant: 140,
    leadKneeAngleAtRelease: 165,
    leadKneeExtension: 25,
    trunkForwardTiltAtRelease: 30,
    elbowAngleAtRelease: 160,
    peakWristSpeed: 18,
    ...overrides,
  };
}

describe('storage/sessions', () => {
  beforeEach(async () => {
    await clearSessions();
  });

  it('空のDBでは空配列を返す', async () => {
    expect(await listSessions()).toEqual([]);
  });

  it('保存したセッションを取得できる(往復)', async () => {
    const saved = await saveSession({
      date: '2026-07-13T10:00:00.000Z',
      metrics: metrics(),
      measuredVelocityKmh: 128,
      note: 'ブルペン',
    });

    const all = await listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(saved);
    expect(all[0]!.metrics.strideLengthRatio).toBeCloseTo(0.85);
    expect(all[0]!.measuredVelocityKmh).toBe(128);
    expect(all[0]!.note).toBe('ブルペン');
  });

  it('id は自動採番され、セッションごとに一意', async () => {
    const a = await saveSession({ metrics: metrics() });
    const b = await saveSession({ metrics: metrics() });
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('date 未指定なら保存時刻(ISO文字列)が入る', async () => {
    const before = Date.now();
    const saved = await saveSession({ metrics: metrics() });
    const t = Date.parse(saved.date);
    expect(Number.isNaN(t)).toBe(false);
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('listSessions は日付昇順(古い→新しい)で返す', async () => {
    // 保存順をわざとばらけさせる
    await saveSession({ date: '2026-07-10T00:00:00.000Z', metrics: metrics() });
    await saveSession({ date: '2026-07-01T00:00:00.000Z', metrics: metrics() });
    await saveSession({ date: '2026-07-05T00:00:00.000Z', metrics: metrics() });

    const dates = (await listSessions()).map((s) => s.date);
    expect(dates).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-05T00:00:00.000Z',
      '2026-07-10T00:00:00.000Z',
    ]);
  });

  it('measuredVelocityKmh / note は省略できる', async () => {
    const saved = await saveSession({ metrics: metrics() });
    expect(saved.measuredVelocityKmh).toBeUndefined();
    expect(saved.note).toBeUndefined();

    const [loaded] = await listSessions();
    expect(loaded!.measuredVelocityKmh).toBeUndefined();
  });

  it('updateSession で実測球速を後から入力できる', async () => {
    const saved = await saveSession({ metrics: metrics() });
    await updateSession(saved.id, { measuredVelocityKmh: 132, note: '追記' });

    const [loaded] = await listSessions();
    expect(loaded!.id).toBe(saved.id);
    expect(loaded!.measuredVelocityKmh).toBe(132);
    expect(loaded!.note).toBe('追記');
    // 指標は保持されたまま
    expect(loaded!.metrics.peakWristSpeed).toBeCloseTo(18);
  });

  it('存在しない id の更新は例外', async () => {
    await expect(updateSession('nope', { measuredVelocityKmh: 100 })).rejects.toThrow();
  });

  it('deleteSession で1件だけ消える', async () => {
    const a = await saveSession({ date: '2026-07-01T00:00:00.000Z', metrics: metrics() });
    const b = await saveSession({ date: '2026-07-02T00:00:00.000Z', metrics: metrics() });

    await deleteSession(a.id);

    const all = await listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(b.id);
  });

  it('clearSessions で全消去', async () => {
    await saveSession({ metrics: metrics() });
    await saveSession({ metrics: metrics() });
    await clearSessions();
    expect(await listSessions()).toEqual([]);
  });
});
