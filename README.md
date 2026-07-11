# Pitch Velocity Analyzer (motion-analysis-v2)

投球フォームの動画をブラウザ上で解析し、球速に相関するバイオメカニクス指標を自動抽出する個人開発アプリ。
動画は端末外に送信されず、すべての処理(ポーズ推定・指標算出・保存)がローカルで完結する。

- 仕様・設計方針: [CLAUDE.md](./CLAUDE.md)
- 進捗・作業ログ: [PLAN.md](./PLAN.md)

## 主な機能(予定)

- MediaPipe PoseLandmarker(WASM/WebGPU)によるブラウザ内ポーズ推定
- フットプラント / リリースの自動検出
- 球速相関指標の算出: ストライド長比・前膝伸展量・体幹前傾角・リリース時肘角度・手首ピーク速度
- 実測球速(スピードガン)の記録と指標トレンドの可視化
- ローカルLLM(Ollama)によるコーチングコメント生成

## セットアップ

### 必要環境

- Node.js 20+
- モダンブラウザ(WebGPU 対応推奨。Chrome / Edge 最新版)
- (任意)Ollama — コーチングコメント生成に使用。なくてもルールベースのコメントで動作する

### 起動

```bash
npm install
npm run dev
```

### テスト

```bash
npm test          # vitest
npm run lint
```

### Ollama を使う場合

ブラウザから Ollama API(localhost:11434)を叩くため、CORS の許可設定が必要。

```bash
# 例: 開発サーバーのオリジンを許可
OLLAMA_ORIGINS="http://localhost:5173" ollama serve

# モデルの取得(デフォルト想定モデル)
ollama pull qwen2.5:7b
```

Windows の場合は環境変数 `OLLAMA_ORIGINS` をシステム環境変数に設定して Ollama を再起動する。

## 撮影プロトコル

解析精度は撮影条件に依存する。以下を守ること:

- 側面固定アングル(右投げ: 三塁側 / 左投げ: 一塁側)。カメラは三脚で固定
- 投手の全身(頭〜足元)が常にフレーム内
- 60fps 以上推奨(最低 30fps)
- 1動画1投球(ワインドアップ前〜フォロースルーまで)
- アプリに身長(cm)を入力する(実寸換算に使用)

## 開発について

Claude Code を使ったマイルストーン駆動で開発している。
権限設定は `.claude/settings.json`(プロジェクト共有)を参照。
マイルストーンの受け入れ条件と進捗は PLAN.md を参照。