// M5: 解析結果を実測球速つきでセッションとして保存する。
// 実測球速は任意入力(スピードガンが無い日もあるため)。動画は保存しない(指標のみ)。

import { useState } from 'react';
import type { PitchMetrics } from '../analysis/types';
import { useAppStore } from '../store/useAppStore';

interface Props {
  metrics: PitchMetrics;
}

export function SessionSaveForm({ metrics }: Props) {
  const addSession = useAppStore((s) => s.addSession);
  const [velocity, setVelocity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const v = Number(velocity);
      await addSession({
        metrics,
        ...(velocity.trim() !== '' && Number.isFinite(v) ? { measuredVelocityKmh: v } : {}),
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
      });
      setSaved(true);
      setVelocity('');
      setNote('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18 }}>セッションとして保存</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label>
          実測球速:{' '}
          <input
            type="number"
            step="1"
            placeholder="任意"
            value={velocity}
            onChange={(e) => {
              setVelocity(e.target.value);
              setSaved(false);
            }}
            style={{ width: 80 }}
          />{' '}
          km/h
        </label>
        <label>
          メモ:{' '}
          <input
            type="text"
            placeholder="任意(ブルペン / 試合 など)"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            style={{ width: 220 }}
          />
        </label>
        <button onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        {saved && <span style={{ color: '#080', fontSize: 13 }}>保存しました</span>}
      </div>
    </section>
  );
}
