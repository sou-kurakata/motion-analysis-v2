// M5: セッション(指標+実測球速)の永続化。IndexedDB(idb ラッパー)。
// 動画そのものは保存しない(端末外に出さない方針とストレージ量の両面から、指標のみ蓄積する)。

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PitchMetrics, Session } from '../analysis/types';

const DB_NAME = 'pitch-analyzer';
const DB_VERSION = 1;
const STORE = 'sessions';
/** 日付でのソート・範囲取得のためのインデックス。 */
const DATE_INDEX = 'by-date';

interface PitchAnalyzerDB extends DBSchema {
  [STORE]: {
    key: string;
    value: Session;
    indexes: { [DATE_INDEX]: string };
  };
}

/** 保存時の入力。id は採番、date は既定で保存時刻。 */
export interface SessionInput {
  metrics: PitchMetrics;
  /** ISO 8601 文字列。省略時は保存時刻。 */
  date?: string;
  measuredVelocityKmh?: number;
  note?: string;
}

/** 後から編集できる項目(実測球速はスピードガンの値を後で入れることがある)。 */
export interface SessionPatch {
  measuredVelocityKmh?: number;
  note?: string;
}

let dbPromise: Promise<IDBPDatabase<PitchAnalyzerDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PitchAnalyzerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PitchAnalyzerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(DATE_INDEX, 'date');
      },
    });
  }
  return dbPromise;
}

/** id 採番。crypto.randomUUID が無い環境(古いブラウザ・一部テスト環境)にフォールバックする。 */
function newId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveSession(input: SessionInput): Promise<Session> {
  const session: Session = {
    id: newId(),
    date: input.date ?? new Date().toISOString(),
    metrics: input.metrics,
    ...(input.measuredVelocityKmh !== undefined
      ? { measuredVelocityKmh: input.measuredVelocityKmh }
      : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  const db = await getDb();
  await db.put(STORE, session);
  return session;
}

/** 日付昇順(古い→新しい)で全件返す。トレンドグラフがそのまま時系列に使えるため。 */
export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE, DATE_INDEX);
}

/** 実測球速・メモの後追い入力。存在しない id は例外。 */
export async function updateSession(id: string, patch: SessionPatch): Promise<Session> {
  const db = await getDb();
  const current = await db.get(STORE, id);
  if (!current) throw new Error(`セッションが見つかりません: ${id}`);
  const updated: Session = { ...current, ...patch };
  await db.put(STORE, updated);
  return updated;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function clearSessions(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
