// 開発用: フィクスチャ JSON をブラウザからダウンロードする(DOM 依存のため frameFixture.ts と分離)。

import type { FrameFixture } from './frameFixture';

export function downloadFixture(fixture: FrameFixture, filename: string): void {
  const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
