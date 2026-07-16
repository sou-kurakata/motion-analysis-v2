// 入力データ品質の警告表示。error があれば指標は表示されない(App 側で抑止)。

import type { QualityReport } from '../analysis/quality';

interface Props {
  report: QualityReport;
}

export function QualityWarning({ report }: Props) {
  if (report.issues.length === 0) return null;

  const blocked = !report.usable;

  return (
    <section
      style={{
        marginTop: 16,
        padding: 12,
        border: `1px solid ${blocked ? '#c00' : '#e0a800'}`,
        borderRadius: 6,
        background: blocked ? '#fff5f5' : '#fffbea',
      }}
    >
      <h2 style={{ fontSize: 16, margin: '0 0 8px', color: blocked ? '#b00' : '#8a6d00' }}>
        {blocked ? '入力データの品質が不十分です(指標は表示しません)' : '精度に関する注意'}
      </h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
        {report.issues.map((issue) => (
          <li key={issue.code} style={{ color: issue.severity === 'error' ? '#b00' : '#8a6d00' }}>
            {issue.message}
          </li>
        ))}
      </ul>
      {blocked && (
        <p style={{ fontSize: 13, color: '#666', margin: '8px 0 0' }}>
          撮影プロトコル(側面固定・全身・スロー再生または60fps以上・明るい場所)を満たす動画で
          撮り直すと改善します。骨格オーバーレイと角度グラフは診断用に表示しています。
        </p>
      )}
    </section>
  );
}
