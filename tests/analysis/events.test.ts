import { describe, it, expect } from 'vitest';
import {
  detectEvents,
  detectHandedness,
  selectReleaseFrame,
} from '../../src/analysis/events';
import { makePitchTrajectory, makeStaticTrajectory } from './trajectory';

const TOL = 2; // 受け入れ基準に合わせ ±2 フレーム許容

describe('events.detectEvents(右投げ合成軌道)', () => {
  const frames = makePitchTrajectory({
    nFrames: 60,
    footPlantFrame: 20,
    releaseFrame: 35,
    handedness: 'right',
  });
  const result = detectEvents(frames, { handedness: 'right' });

  it('フットプラントを ±2 フレームで検出', () => {
    expect(result.footPlantFrame).toBeGreaterThanOrEqual(0);
    expect(Math.abs(result.footPlantFrame - 20)).toBeLessThanOrEqual(TOL);
  });

  it('リリースを ±2 フレームで検出', () => {
    expect(result.releaseFrame).toBeGreaterThanOrEqual(0);
    expect(Math.abs(result.releaseFrame - 35)).toBeLessThanOrEqual(TOL);
  });

  it('フットプラントはリリースより前', () => {
    expect(result.footPlantFrame).toBeLessThan(result.releaseFrame);
  });

  it('状態タイムラインが整合する', () => {
    expect(result.states).toHaveLength(60);
    expect(result.states[0]).toBe('WINDUP');
    expect(result.states[result.footPlantFrame]).toBe('ARM_COCKING');
    expect(result.states[result.releaseFrame]).toBe('RELEASE_DETECTED');
    expect(result.states[59]).toBe('FOLLOW_THROUGH');
  });
});

describe('events.detectEvents(左投げ合成軌道)', () => {
  const frames = makePitchTrajectory({
    nFrames: 60,
    footPlantFrame: 22,
    releaseFrame: 38,
    handedness: 'left',
  });
  const result = detectEvents(frames, { handedness: 'left' });

  it('左投げでもフットプラント/リリースを ±2 で検出', () => {
    expect(Math.abs(result.footPlantFrame - 22)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(result.releaseFrame - 38)).toBeLessThanOrEqual(TOL);
    expect(result.footPlantFrame).toBeLessThan(result.releaseFrame);
  });
});

describe('events.detectHandedness(自動判定)', () => {
  it('右投げ軌道は right と判定', () => {
    const frames = makePitchTrajectory({
      nFrames: 60,
      footPlantFrame: 20,
      releaseFrame: 35,
      handedness: 'right',
    });
    expect(detectHandedness(frames)).toBe('right');
  });

  it('左投げ軌道は left と判定', () => {
    const frames = makePitchTrajectory({
      nFrames: 60,
      footPlantFrame: 22,
      releaseFrame: 38,
      handedness: 'left',
    });
    expect(detectHandedness(frames)).toBe('left');
  });

  it('handedness 未指定なら自動判定して検出する', () => {
    const frames = makePitchTrajectory({
      nFrames: 60,
      footPlantFrame: 22,
      releaseFrame: 38,
      handedness: 'left',
    });
    const result = detectEvents(frames); // config 無し → 自動判定
    expect(result.handedness).toBe('left');
    expect(Math.abs(result.releaseFrame - 38)).toBeLessThanOrEqual(TOL);
  });
});

describe('events.selectReleaseFrame(新定義: ピーク最近傍)', () => {
  // 長さ15、既定100°(<150)。>150 のフレームだけ立てる。
  const angles = (highs: Record<number, number>): number[] =>
    Array.from({ length: 15 }, (_, i) => highs[i] ?? 100);

  it('窓内に早いフレームとピーク近傍がある場合、ピークに最も近い方を採る(「最初」ではない)', () => {
    // 手首ピーク=10、窓[7,13]。>150 は frame 7(遠い)と 10(ピーク)。
    const el = angles({ 7: 160, 10: 170 });
    expect(selectReleaseFrame(10, 0.05, el, 0)).toBe(10); // 「最初」なら 7 になるはず
  });

  it('ピーク近傍に無く早いフレームだけ >150 ならそれを採る', () => {
    const el = angles({ 8: 160 }); // 窓[7,13] 内は 8 のみ
    expect(selectReleaseFrame(10, 0.05, el, 0)).toBe(8);
  });

  it('フットプラント以前のフレームは採らない', () => {
    // 窓[8,14]、>150 は 8 と 12。footPlant=9 で 8 は除外 → 12。
    const el = angles({ 8: 160, 12: 170 });
    expect(selectReleaseFrame(11, 0.05, el, 9)).toBe(12);
  });

  it('手首ピーク速度がノイズ床未満なら -1', () => {
    const el = angles({ 10: 170 });
    expect(selectReleaseFrame(10, 0.001, el, 0)).toBe(-1);
  });

  it('窓内に >150 が無ければ -1', () => {
    expect(selectReleaseFrame(10, 0.05, angles({}), 0)).toBe(-1);
  });
});

describe('events.detectEvents(異常系)', () => {
  it('静止軌道ではイベント未検出(-1)', () => {
    const frames = makeStaticTrajectory(40);
    const result = detectEvents(frames, { handedness: 'right' });
    expect(result.footPlantFrame).toBe(-1);
    expect(result.releaseFrame).toBe(-1);
  });

  it('フレーム数が少なすぎる場合は -1', () => {
    const frames = makePitchTrajectory({ nFrames: 3, footPlantFrame: 1, releaseFrame: 2 });
    const result = detectEvents(frames);
    expect(result.footPlantFrame).toBe(-1);
    expect(result.releaseFrame).toBe(-1);
  });
});
