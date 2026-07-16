// analysis 層のマジックナンバー(閾値・既定値)を集約する。根拠をコメントで残すこと(CLAUDE.md 規約)。

/**
 * 動画からフレーム抽出する際の既定サンプリング fps。
 * CLAUDE.md 撮影プロトコル: 推奨 60fps / 最低 30fps。
 * HTMLVideoElement は実 fps を公開しないため、M1 では抽出間隔の基準として本値で seek サンプリングする。
 */
export const DEFAULT_SAMPLING_FPS = 30;

/**
 * 指標計算からランドマークを除外する visibility 閾値(CLAUDE.md 仕様)。
 * 描画用の閾値(skeleton.ts)とは別物。こちらは解析用。
 */
export const VISIBILITY_EXCLUDE_THRESHOLD = 0.5;

/** 角度・位置系の移動平均の既定窓(CLAUDE.md: 5フレーム目安)。 */
export const MOVING_AVERAGE_WINDOW = 5;

/**
 * One Euro Filter の既定パラメータ(速度系の平滑化に使用)。
 * minCutoff: 低速時のカットオフ(小さいほど強く平滑化)。
 * beta: 速度に応じてカットオフを上げる係数(大きいほど速い動きでラグ減)。
 * dCutoff: 微分項のカットオフ。
 * 初期値は原論文の推奨に準拠。実動画で調整予定(閾値調整メモ)。
 */
export const ONE_EURO_DEFAULT = {
  minCutoff: 1.0,
  beta: 0.0,
  dCutoff: 1.0,
} as const;

/** 身長キャリブレーションのサニティチェック: 換算肩幅の許容範囲(m)。範囲外なら警告。 */
export const SHOULDER_WIDTH_MIN_M = 0.3;
export const SHOULDER_WIDTH_MAX_M = 0.6;

/**
 * 頭頂近似: 鼻(0)から頭頂までの距離を「鼻〜足首の縦距離」に対する比で近似する。
 * 解剖学的に鼻〜頭頂 ≈ 身長の 8% 程度。キャリブレーションの縦距離補正に使用。
 */
export const HEAD_ABOVE_NOSE_RATIO = 0.08;

/** キャリブレーション用の直立フレームを探索する範囲(動画前方の割合)。ワインドアップ初期を想定。 */
export const CALIBRATION_FRAME_SEARCH_RATIO = 0.35;

// --- イベント検出(events.ts)の閾値。初期値。実動画で調整し閾値調整メモに記録すること。 ---

/** フットプラント: 前足足首の水平速度が、ストライド中ピーク速度のこの比率未満に落ちたら接地とみなす。 */
export const FOOTPLANT_SPEED_PEAK_RATIO = 0.1;

/** リリース: 肘角度がこの値(度)を超えていること。 */
export const RELEASE_ELBOW_ANGLE_DEG = 150;

/** リリース: 手首合成速度ピークの近傍探索幅(±フレーム)。 */
export const RELEASE_WRIST_PEAK_SEARCH_FRAMES = 3;

/** フットプラント: 前足かかと y が「安定」とみなす前後差の上限(正規化)。バウンド誤検出防止。 */
export const HEEL_STABILITY_EPS = 0.03;

/** イベント検出で「動きあり」とみなす1フレームあたり速度の下限(正規化)。ノイズ床。 */
export const MIN_EVENT_SPEED_PER_FRAME = 0.003;

// --- ROI クロップ二段推論(pose/roi.ts, videoProcessor.ts)。2026-07-13 追加。 ---

/**
 * ROI の外接矩形マージン(各辺に対する比率)。
 * ストライドやフォロースルーで手足が前フレームの矩形外へ出るため、余裕を持たせる。
 */
export const ROI_MARGIN_RATIO = 0.35;

/** ROI の最小辺長(px)。小さすぎるクロップ(誤検出時)を避ける。 */
export const ROI_MIN_SIZE_PX = 192;

/** ROI の外接矩形に含めるランドマークの visibility 下限。幻の点で矩形が暴れるのを防ぐ。 */
export const ROI_MIN_VISIBILITY = 0.3;

/**
 * ROI 追従を諦めて全画面推論に戻す条件: 主要ランドマークの平均 visibility がこの値未満。
 * クロップが被写体を外していると全ランドマークの信頼度が落ちるため、それを検知して復帰する。
 * (roiMode='perFrame' のときのみ使用)
 */
export const ROI_RESET_MEAN_VISIBILITY = 0.3;

/**
 * 固定 ROI を決める事前スキャンのサンプル数。
 * 動作範囲(ワインドアップ〜フォロースルー)を覆えれば十分なので粗くてよい。
 * 全フレームの数%の追加コストで済む。
 */
export const ROI_SCAN_SAMPLES = 24;

// --- 入力データ品質ガード(quality.ts)。2026-07-13 の v4 検証で必要性が判明。 ---

/**
 * 指標計算に使う主要ランドマークの欠損率(visibility < 0.5 のフレーム割合)の上限。
 * これを超えたら指標を出さない。
 * 根拠: v4(通常速度クリップ)では投球腕手首が 56/108 = 52% 欠損し、
 * 位置も往復する破綻状態のまま、もっともらしい指標値が出てしまった。
 * 一方 v3(スロー再生・準拠クリップ)は追従良好で目視±2一致。両者を分けられる水準として 30% を採る。
 */
export const QUALITY_MISSING_RATE_MAX = 0.3;

/**
 * グリッチ(1フレームだけ大きく飛んで次で戻る)と判定する正規化変位のしきい値。
 * 根拠: v4 の frame 48 で両足首・両手首が同時に 0.2–0.3 飛んで次フレームで戻り、
 * 「足首が止まった」ように見えてフットプラントが誤検出された。
 * 通常の投球動作の1フレーム変位(30fps)は概ね 0.05 以下。
 */
export const QUALITY_GLITCH_JUMP_NORM = 0.08;

/**
 * 接地→リリースの最小フレーム間隔。これ未満なら警告(サンプリング fps 不足か誤検出)。
 * 根拠: 実際の接地→リリースは 0.12–0.15 秒 ≈ 30fps で 4–5 フレーム。
 * v4 は 1 フレーム差(=グリッチ由来)だった。2 フレーム未満を異常とみなす。
 */
export const QUALITY_MIN_EVENT_GAP_FRAMES = 2;
