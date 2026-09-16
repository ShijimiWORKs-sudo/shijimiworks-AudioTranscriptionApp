# Prototype版 仕様書 v1.0

## 目的

「実際に音声を読み込ませて、ローカルAIで文字起こしできる」ことを確認するための最小構成。完成度よりも、パイプライン（音声→ローカルASR→結果表示）が実際に動くことを優先する。

## 対象フォーマット

MP3 / WAV / M4A / AAC / FLAC（可能な範囲で追加対応）

## 画面構成

1. **ホーム**: ファイル選択 + 用途選択（議事録/電話内容/打ち合わせ/その他）+「文字起こし開始」
2. **ファイル選択**: 対応フォーマットのバリデーション
3. **処理中**: 経過時間、進捗バー、現在のステップ表示、キャンセルボタン
4. **結果**: 編集可能テキストエリア、コピー/TXT保存/Markdown保存

## 技術要件

- オンラインAPIへ音声を送信しない（faster-whisperをローカル実行）
- `src/core/asr/` にASR Engine抽象化を実装（`ASREngine`インターフェース、`docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md` §3 参照）
- 用途は固定文字列ではなく型で管理:

```ts
type TranscriptionPurpose =
  | "meeting_minutes"
  | "phone_call"
  | "discussion"
  | "other";
```

- テンプレートは最小構成（4種の用途にそれぞれ最小限のMarkdown出力テンプレートを1つずつ用意。カスタムテンプレート機能はPersonal Edition送り）

## Prototypeで実装しないもの

アカウント / クラウド同期 / 有料API / ログイン / 複雑なAI要約 / 高度な話者分離 / 高度な検索 / 複数ユーザー / サブスクリプション / オンラインDB

## 完成条件（チェックリスト）

```text
□ Windowsで起動する
□ 音声ファイルを選択できる
□ MP3を処理できる
□ WAVを処理できる
□ 日本語音声を処理できる
□ ローカルモデルで処理できる
□ 外部APIへ音声を送信しない
□ 処理中の進捗が表示される
□ キャンセルできる
□ 結果を編集できる
□ TXTへ保存できる
□ Markdownへ保存できる
□ エラー時に原因が表示される
□ アプリを再起動しても壊れない
```

## Prototype完了時の成果物

`docs/prototype/PROTOTYPE_RESULT.md` を作成し、以下を記録する:

- 使用モデル / 使用ライブラリ
- 処理速度・CPU使用率・メモリ使用量（音声1分/10分/30分/60分それぞれ）
- 日本語認識結果の評価
- 問題点・改善案

この結果をもって `docs/research/LOCAL_ASR_MODEL_COMPARISON.md` の推奨（faster-whisper採用）を実測で検証し、必要に応じてPersonal Editionでのモデル選定を見直す。
