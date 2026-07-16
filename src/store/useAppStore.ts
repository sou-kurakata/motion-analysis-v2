// M5 で導入(M1/M4 は React state で代替していた)。
// 動画解析の状態と、永続化されたセッション一覧を集約する。
// 派生値(events / calibration / metrics)は純粋関数で App 側の useMemo で計算し、ストアには持たない
// (二重管理を避け、analysis/ を単一の真実の源にするため)。

import { create } from 'zustand';
import type { FrameData, Handedness, Session } from '../analysis/types';
import {
  deleteSession as deleteSessionDb,
  listSessions,
  saveSession,
  type SessionInput,
} from '../storage/sessions';

export type Phase = 'idle' | 'processing' | 'done' | 'error';

export interface FrameDims {
  w: number;
  h: number;
}

interface AppState {
  // --- 動画・解析 ---
  phase: Phase;
  progress: number;
  message: string;
  videoUrl: string | null;
  fileName: string;
  frames: FrameData[];
  frameDims: FrameDims | null;

  // --- 解析設定(入力欄の生値。数値変換は利用側) ---
  handedness: Handedness | 'auto';
  startSec: string;
  endSec: string;
  heightCm: string;

  // --- セッション ---
  sessions: Session[];

  setHandedness: (h: Handedness | 'auto') => void;
  setStartSec: (s: string) => void;
  setEndSec: (s: string) => void;
  setHeightCm: (s: string) => void;

  startProcessing: (videoUrl: string, fileName: string) => void;
  setProgress: (progress: number) => void;
  setFrameDims: (dims: FrameDims) => void;
  setMessage: (message: string) => void;
  finishProcessing: (frames: FrameData[]) => void;
  failProcessing: (message: string) => void;

  loadSessions: () => Promise<void>;
  addSession: (input: SessionInput) => Promise<Session>;
  removeSession: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  phase: 'idle',
  progress: 0,
  message: '',
  videoUrl: null,
  fileName: '',
  frames: [],
  frameDims: null,

  handedness: 'auto',
  startSec: '',
  endSec: '',
  heightCm: '170',

  sessions: [],

  setHandedness: (handedness) => set({ handedness }),
  setStartSec: (startSec) => set({ startSec }),
  setEndSec: (endSec) => set({ endSec }),
  setHeightCm: (heightCm) => set({ heightCm }),

  startProcessing: (videoUrl, fileName) =>
    set({
      videoUrl,
      fileName,
      frames: [],
      progress: 0,
      phase: 'processing',
      message: '動画を読み込み中…',
    }),
  setProgress: (progress) => set({ progress }),
  setFrameDims: (frameDims) => set({ frameDims }),
  setMessage: (message) => set({ message }),
  finishProcessing: (frames) =>
    set({ frames, phase: 'done', message: `完了: ${frames.length} フレームを解析しました` }),
  failProcessing: (message) => set({ phase: 'error', message }),

  loadSessions: async () => {
    set({ sessions: await listSessions() });
  },
  addSession: async (input) => {
    const session = await saveSession(input);
    // 日付昇順を保つ(listSessions と同じ順序)
    set({
      sessions: [...get().sessions, session].sort((a, b) => a.date.localeCompare(b.date)),
    });
    return session;
  },
  removeSession: async (id) => {
    await deleteSessionDb(id);
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
  },
}));

