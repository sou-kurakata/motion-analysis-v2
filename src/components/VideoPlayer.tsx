// <video> に Canvas を重ねて骨格をオーバーレイ表示する。再生・シーク・コマ送りに対応。
// 動画は再エンコードしない(コア設計原則3)。現在時刻に最も近い FrameData の骨格を描画する。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameData, PitchEvents } from '../analysis/types';
import { drawSkeleton } from '../pose/skeleton';

interface Props {
  videoUrl: string;
  frames: FrameData[];
  /** 抽出に用いた fps(コマ送りの1コマ = 1/fps 秒)。 */
  fps: number;
  /** 検出済みイベント(未処理なら null)。 */
  events: PitchEvents | null;
}

/** timestampMs 昇順の frames から、指定時刻(ms)に最も近いフレーム添字を返す。 */
function nearestFrameIndex(frames: FrameData[], timeMs: number): number {
  if (frames.length === 0) return -1;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // frames[mid] は必ず存在(lo <= mid < hi <= length-1)
    if (frames[mid]!.timestampMs < timeMs) lo = mid + 1;
    else hi = mid;
  }
  // lo と lo-1 の近い方を選ぶ
  if (lo > 0) {
    const prev = frames[lo - 1]!;
    const cur = frames[lo]!;
    if (Math.abs(prev.timestampMs - timeMs) <= Math.abs(cur.timestampMs - timeMs)) {
      return lo - 1;
    }
  }
  return lo;
}

export function VideoPlayer({ videoUrl, frames, fps, events }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // 現在時刻に対応するフレームの骨格を Canvas に描画する。
  const drawCurrent = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const idx = nearestFrameIndex(frames, video.currentTime * 1000);
    if (idx < 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawSkeleton(ctx, frames[idx]!.landmarks, canvas.width, canvas.height);
  }, [frames]);

  // 再生中は毎フレーム再描画して骨格を追従させる。
  useEffect(() => {
    if (!playing) return;
    const loop = () => {
      const video = videoRef.current;
      if (video) setCurrentTime(video.currentTime);
      drawCurrent();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, drawCurrent]);

  // frames が変わったら再描画
  useEffect(() => {
    drawCurrent();
  }, [drawCurrent]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const stepFrame = (dir: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPlaying(false);
    const next = Math.max(0, Math.min(duration, video.currentTime + dir / fps));
    video.currentTime = next;
  };

  const jumpToFrame = (idx: number) => {
    const video = videoRef.current;
    if (!video || idx < 0 || idx >= frames.length) return;
    video.pause();
    setPlaying(false);
    video.currentTime = frames[idx]!.timestampMs / 1000;
  };

  const onSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const t = Number(e.target.value);
    video.currentTime = t;
    setCurrentTime(t);
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          style={{ maxWidth: '100%', display: 'block' }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onSeeked={() => {
            const v = videoRef.current;
            if (v) setCurrentTime(v.currentTime);
            drawCurrent();
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <button onClick={() => stepFrame(-1)} title="前のコマ">◀|</button>
        <button onClick={togglePlay}>{playing ? '一時停止' : '再生'}</button>
        <button onClick={() => stepFrame(1)} title="次のコマ">|▶</button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1 / fps}
          value={currentTime}
          onChange={onSeekInput}
          style={{ flex: 1 }}
        />
        <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 96, textAlign: 'right' }}>
          {currentTime.toFixed(2)} / {duration.toFixed(2)}s
        </span>
      </div>
      <p style={{ color: '#666', fontSize: 13 }}>
        抽出フレーム数: {frames.length}({fps}fps サンプリング)
      </p>

      {events && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
          <strong>イベント:</strong>
          <EventButton
            label="フットプラント"
            frame={events.footPlantFrame}
            frames={frames}
            onJump={jumpToFrame}
          />
          <EventButton
            label="リリース"
            frame={events.releaseFrame}
            frames={frames}
            onJump={jumpToFrame}
          />
        </div>
      )}
    </div>
  );
}

interface EventButtonProps {
  label: string;
  frame: number;
  frames: FrameData[];
  onJump: (idx: number) => void;
}

function EventButton({ label, frame, frames, onJump }: EventButtonProps) {
  if (frame < 0 || frame >= frames.length) {
    return (
      <span style={{ color: '#999' }}>
        {label}: 未検出
      </span>
    );
  }
  const timeSec = frames[frame]!.timestampMs / 1000;
  return (
    <button onClick={() => onJump(frame)} title="このフレームへジャンプ">
      {label}: frame {frame}({timeSec.toFixed(2)}s)
    </button>
  );
}
