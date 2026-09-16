# AGENTS.md — AudioTranscriptionApp プロジェクト共通ルール

このファイルはプロジェクト共通ルールを記載する。以後、毎回の指示書へ同じルールを大量に記載しない。Claude/Codex等、このリポジトリで作業するすべてのエージェントは以下を守る。

## プロジェクトの目的

MP3/WAV/M4A等の音声ファイルをローカルAIで文字起こしし、議事録・電話内容・打ち合わせ・その他の用途別テンプレートで構造化できる、Windows向けの個人用文字起こしアプリを開発する。時間課金型のWeb文字起こしサービスを使わず、ローカルで無制限に使用できることが目的。

## 絶対に守る方針

- 音声データを原則として外部サーバーへ送信しない
- API従量課金を使用しない
- ローカルAIモデルで文字起こしする
- 特定ASRモデルへアプリ全体を依存させない（`ASREngine`インターフェース経由）
- ASRと文章整形（テンプレート適用）を分離する
- テンプレートをコードへ直接埋め込まない（JSON管理）
- ユーザーの明示的操作なしに外部通信しない
- 不明な情報をAIが勝手に事実として生成しない（`[不明]`/`[推定]`で明示）

## 開発の進め方

- **Prototype版**（音声選択→用途選択→ローカル文字起こし→結果表示→TXT/Markdown保存）と、**Personal Edition**（履歴/テンプレート/話者/タイムスタンプ/音声同期/再処理/検索/バックアップ/モデル管理/Windows EXE）を必ず2段階に分けて開発する。いきなり完成版を実装しない。
- 開発フェーズと完了条件は `docs/development/ROADMAP_v1.0.md` を参照する。
- アーキテクチャ・データモデル・テンプレート仕様は `docs/architecture/` `docs/specs/` を参照する。

## 毎回のルール

```text
・指定されたPhaseだけ実装する
・勝手に次Phaseへ進まない
・不要なリファクタリングをしない
・既存機能を壊さない
・依存パッケージ追加は必要性を確認する
・TypeScriptエラーを残さない
・テストを書く
・関連テストを実行する
・実装結果を報告する
```

## Git運用

- Phaseごとに専用ブランチを切る（例: `codex/phase-1-prototype-ui`）
- mainへ直接変更しない
- 各Phase終了後: commit → push → Draft PR

## 技術スタック（確定事項、`docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md`参照）

- デスクトップシェル: Electron + TypeScript
- UI: React + Vite
- ASR: Pythonサイドカープロセス（既定エンジン: faster-whisper）
- Personal EditionのDB: SQLite（better-sqlite3）
- テンプレート: JSON

## 参照ドキュメント一覧

```text
docs/
├── architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md
├── research/LOCAL_ASR_MODEL_COMPARISON.md
├── specs/PROTOTYPE_SPEC_v1.0.md
├── specs/PERSONAL_SPEC_v1.0.md
├── specs/TEMPLATE_SPEC_v1.0.md
├── specs/DATA_MODEL_SPEC_v1.0.md
└── development/ROADMAP_v1.0.md
```
