// 動画ファイル選択UI。選択された File を親へ渡すだけの薄いコンポーネント。

interface Props {
  disabled?: boolean;
  onSelect: (file: File) => void;
}

export function VideoUpload({ disabled, onSelect }: Props) {
  return (
    <div style={{ margin: '12px 0' }}>
      <input
        type="file"
        accept="video/*"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
    </div>
  );
}
