// メインフロー。
// 動画選択 → フレーム抽出+ポーズ推定(進捗バー)→ <video>+骨格オーバーレイ再生
// → 指標ダッシュボード/角度グラフ → セッション保存(M5)→ トレンド(M5)。
// 状態は zustand(store/useAppStore)に集約。派生値(events/calibration/metrics)は
// 純粋関数なのでここで useMemo 計算する(ストアに二重で持たない)。

import { useCallback, useEffect, useMemo } from 'react';
import { DEFAULT_SAMPLING_FPS } from './analysis/constants';
import { detectEvents } from './analysis/events';
import { computeCalibration } from './analysis/calibration';
import { computeMetrics } from './analysis/metrics';
import { assessQuality } from './analysis/quality';
import { processVideo } from './pose/videoProcessor';
import { VideoUpload } from './components/VideoUpload';
import { VideoPlayer } from './components/VideoPlayer';
import { MetricsDashboard } from './components/MetricsDashboard';
import { AngleChart } from './components/AngleChart';
import { SessionSaveForm } from './components/SessionSaveForm';
import { TrendView } from './components/TrendView';
import { QualityWarning } from './components/QualityWarning';
import { useAppStore } from './store/useAppStore';
import { encodeFixture } from './dev/frameFixture';
import { downloadFixture } from './dev/downloadFixture';

/** File を読み込んで loadeddata 済みの video 要素を得る。 */
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = url;
    const onLoaded = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      resolve(video);
    };
    const onError = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      reject(new Error('動画の読み込みに失敗しました'));
    };
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

/** 入力欄の秒(空欄可)を数値へ。空欄・不正値は null。 */
function parseSec(s: string): number | null {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
}

export function App() {
  const phase = useAppStore((s) => s.phase);
  const progress = useAppStore((s) => s.progress);
  const message = useAppStore((s) => s.message);
  const videoUrl = useAppStore((s) => s.videoUrl);
  const fileName = useAppStore((s) => s.fileName);
  const frames = useAppStore((s) => s.frames);
  const frameDims = useAppStore((s) => s.frameDims);
  const handedness = useAppStore((s) => s.handedness);
  const startSec = useAppStore((s) => s.startSec);
  const endSec = useAppStore((s) => s.endSec);
  const heightCm = useAppStore((s) => s.heightCm);
  const sessions = useAppStore((s) => s.sessions);
  const loadSessions = useAppStore((s) => s.loadSessions);

  const fps = DEFAULT_SAMPLING_FPS;

  // 保存済みセッションを起動時に読み込む(リロードしてもトレンドが残ることの担保)。
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // イベント検出は純粋関数なので、利き腕変更時は再処理せず再計算のみ。
  const events = useMemo(
    () =>
      frames.length > 0
        ? detectEvents(frames, handedness === 'auto' ? {} : { handedness })
        : null,
    [frames, handedness],
  );

  const heightNum = Number(heightCm) > 0 ? Number(heightCm) : 170;

  // キャリブレーション(px→m 係数)。フレーム寸法と身長から算出。
  const calibration = useMemo(
    () =>
      frames.length > 0 && frameDims
        ? computeCalibration(frames, frameDims.w, frameDims.h, heightNum)
        : null,
    [frames, frameDims, heightNum],
  );

  // 入力データの品質。error があれば指標を出さない(壊れた入力から出た数字を保存させない)。
  const quality = useMemo(
    () => (events && frames.length > 0 ? assessQuality(frames, events, events.handedness) : null),
    [frames, events],
  );

  // 指標算出。イベント・キャリブレーション・利き腕が揃ったら計算。
  const metrics = useMemo(
    () =>
      events && calibration && frameDims
        ? computeMetrics({
            frames,
            events,
            handedness: events.handedness,
            pxPerMeter: calibration.pxPerMeter,
            frameWidthPx: frameDims.w,
            frameHeightPx: frameDims.h,
            heightCm: heightNum,
          })
        : null,
    [frames, events, calibration, frameDims, heightNum],
  );

  const handleSelect = useCallback(
    async (file: File) => {
      const store = useAppStore.getState();
      // 前回の ObjectURL を後始末
      if (store.videoUrl) URL.revokeObjectURL(store.videoUrl);

      const url = URL.createObjectURL(file);
      store.startProcessing(url, file.name);

      try {
        const video = await loadVideo(url);
        store.setFrameDims({ w: video.videoWidth, h: video.videoHeight });
        store.setMessage('フレームを抽出してポーズ推定中…');
        const result = await processVideo(video, {
          fps,
          onProgress: (r) => useAppStore.getState().setProgress(r),
          ...(parseSec(store.startSec) !== null ? { startSec: parseSec(store.startSec)! } : {}),
          ...(parseSec(store.endSec) !== null ? { endSec: parseSec(store.endSec)! } : {}),
        });
        useAppStore.getState().finishProcessing(result);
      } catch (e) {
        useAppStore.getState().failProcessing(`エラー: ${String(e)}`);
      }
    },
    [fps],
  );

  // 開発用: 受け入れ確認済みの解析結果を回帰テスト用フィクスチャとして書き出す。
  const handleExportFixture = useCallback(() => {
    if (!events || !calibration || !metrics || !frameDims) return;
    const fixture = encodeFixture({
      source: fileName,
      frames,
      frameWidthPx: frameDims.w,
      frameHeightPx: frameDims.h,
      fps,
      heightCm: heightNum,
      startSec: parseSec(startSec),
      endSec: parseSec(endSec),
      events,
      calibration,
      metrics,
    });
    const base = fileName.replace(/\.[^.]+$/, '') || 'fixture';
    downloadFixture(fixture, `${base}.fixture.json`);
  }, [events, calibration, metrics, frameDims, frames, fileName, fps, heightNum, startSec, endSec]);

  const setHandedness = useAppStore((s) => s.setHandedness);
  const setStartSec = useAppStore((s) => s.setStartSec);
  const setEndSec = useAppStore((s) => s.setEndSec);
  const setHeightCm = useAppStore((s) => s.setHeightCm);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 900 }}>
      <h1>Pitch Velocity Analyzer</h1>

      <div style={{ margin: '8px 0' }}>
        <label>
          利き腕:{' '}
          <select value={handedness} onChange={(e) => setHandedness(e.target.value as typeof handedness)}>
            <option value="auto">自動判定</option>
            <option value="right">右投げ</option>
            <option value="left">左投げ</option>
          </select>
        </label>
        {events && handedness === 'auto' && (
          <span style={{ marginLeft: 8, color: '#555' }}>
            (判定: {events.handedness === 'right' ? '右投げ' : '左投げ'})
          </span>
        )}
        <span style={{ marginLeft: 16 }}>
          解析範囲(秒):{' '}
          <input
            type="number"
            step="0.1"
            placeholder="開始"
            value={startSec}
            onChange={(e) => setStartSec(e.target.value)}
            style={{ width: 64 }}
          />{' '}
          –{' '}
          <input
            type="number"
            step="0.1"
            placeholder="終了"
            value={endSec}
            onChange={(e) => setEndSec(e.target.value)}
            style={{ width: 64 }}
          />{' '}
          <span style={{ color: '#888', fontSize: 12 }}>(空欄=全体)</span>
        </span>
        <span style={{ marginLeft: 16 }}>
          身長:{' '}
          <input
            type="number"
            step="1"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            style={{ width: 64 }}
          />{' '}
          cm
        </span>
      </div>

      <VideoUpload disabled={phase === 'processing'} onSelect={handleSelect} />

      {phase === 'processing' && (
        <div style={{ margin: '12px 0' }}>
          <p>{message}</p>
          <div
            style={{
              width: '100%',
              height: 12,
              background: '#eee',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                background: '#00b8d4',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
          <p style={{ color: '#666', fontSize: 13 }}>{Math.round(progress * 100)}%</p>
        </div>
      )}

      {phase === 'error' && <p style={{ color: '#c00' }}>{message}</p>}

      {phase === 'done' && <p style={{ color: '#080' }}>{message}</p>}

      {videoUrl && frames.length > 0 && phase !== 'processing' && (
        <VideoPlayer videoUrl={videoUrl} frames={frames} fps={fps} events={events} />
      )}

      {quality && <QualityWarning report={quality} />}

      {metrics && calibration && quality?.usable && (
        <MetricsDashboard
          metrics={metrics}
          calibrationPlausible={calibration.plausible}
          shoulderWidthM={calibration.shoulderWidthM}
        />
      )}

      {metrics && quality?.usable && <SessionSaveForm metrics={metrics} />}

      {import.meta.env.DEV && metrics && calibration && events && quality?.usable && (
        <div style={{ margin: '8px 0' }}>
          <button onClick={handleExportFixture}>
            回帰テスト用フィクスチャをエクスポート(開発用)
          </button>
          <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>
            表示中の指標値を期待値として JSON に保存します
          </span>
        </div>
      )}

      {events && frameDims && frames.length > 0 && phase !== 'processing' && (
        <AngleChart
          frames={frames}
          events={events}
          handedness={events.handedness}
          frameWidthPx={frameDims.w}
          frameHeightPx={frameDims.h}
        />
      )}

      <TrendView sessions={sessions} />
    </main>
  );
}
