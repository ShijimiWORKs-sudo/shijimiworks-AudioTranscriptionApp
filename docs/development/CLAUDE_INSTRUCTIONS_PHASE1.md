# Claudeへの指示（Phase 1: Prototype UI 着手用）

以下は、次にこのリポジトリで作業するClaude（Claude Code等）セッションへそのまま渡せる指示文です。Phase 0（リポジトリ調査・技術調査・アーキテクチャ設計）は完了済みのため、この指示はPhase 1から着手する前提で書かれています。

---

```text
C:\制作データ\19_AudioTranscriptionApp

で作業してください。

GitHub:
https://github.com/ShijimiWORKs-sudo/shijimiworks-AudioTranscriptionApp

このリポジトリは現在空です。Phase 0（リポジトリ調査・技術調査・アーキテクチャ設計）は完了しており、
以下のドキュメントが docs/ 配下に作成済みです。作業前に必ず読んでください。

  AGENTS.md                                          ← プロジェクト共通ルール（毎回厳守）
  docs/architecture/AudioTranscriptionApp_ARCHITECTURE_v1.0.md
  docs/research/LOCAL_ASR_MODEL_COMPARISON.md
  docs/specs/PROTOTYPE_SPEC_v1.0.md
  docs/specs/PERSONAL_SPEC_v1.0.md
  docs/specs/TEMPLATE_SPEC_v1.0.md
  docs/specs/DATA_MODEL_SPEC_v1.0.md
  docs/development/ROADMAP_v1.0.md

今回のタスクは docs/development/ROADMAP_v1.0.md の Phase 1「Prototype UI」のみです。
Phase 2以降には進まないでください。

Phase 1のゴール（docs/specs/PROTOTYPE_SPEC_v1.0.md §画面構成 に準拠）:

  1. ホーム画面（ファイル選択 + 用途選択[議事録/電話内容/打ち合わせ/その他] + 文字起こし開始ボタン）
  2. ファイル選択画面（MP3/WAV/M4A/AAC/FLACのバリデーション）
  3. 処理中画面（経過時間・進捗・現在のステップ・キャンセルボタン。この時点ではASRは未接続でよく、
     ダミーの進捗表示でよい。実際のローカルASR接続はPhase 2で行う）
  4. 結果画面（編集可能テキストエリア、コピー/TXT保存/Markdown保存）

技術スタック（docs/architecture 参照、変更しないこと）:
  - Electron + TypeScript + React + Vite
  - ASR Engineは src/core/asr/ASREngine インターフェースとして抽象化のみ先に用意する
    （実装はPhase 2、Phase 1ではモック実装で可）
  - 用途は文字列ではなく型（TranscriptionPurpose）で管理する

守るべき方針（AGENTS.md より）:
  ・指定されたPhaseだけ実装する。勝手に次Phaseへ進まない
  ・不要なリファクタリングをしない
  ・依存パッケージ追加は必要性を確認する
  ・TypeScriptエラーを残さない
  ・テストを書き、関連テストを実行する
  ・音声データを外部送信しない設計を最初から崩さない

作業手順:
  1. AGENTS.md と docs/ 配下のドキュメントを読む
  2. mainへ直接変更せず、専用ブランチ（例: codex/phase-1-prototype-ui）を作成する
  3. Electron + React + TypeScriptのプロジェクト雛形を作成する
  4. 上記4画面を実装する（ASRはモック、画面遷移とUIの完成を優先）
  5. 関連テストを書いて実行する
  6. 変更をcommit → push → Draft PR まで行う

最後に、以下を報告してください:
  1. 作成したプロジェクト構成
  2. 実装した画面と動作確認結果
  3. Phase 2（Local ASR接続）に向けて必要な準備・懸念点
```

---

## この指示の前提となった調査・設計の要約

- **リポジトリ状態**: GitHub / ローカルフォルダともに空。新規プロジェクトとして設計した。
- **推奨技術構成**: Electron + React + TypeScript（Tauriとの比較検討の結果、個人開発での実装速度とPython連携の容易さを優先）。ASRはPythonサイドカープロセス（faster-whisper既定）。
- **ASRモデル候補比較**: faster-whisper / whisper.cpp / Kotoba-Whisper / ReazonSpeech / Parakeet-TDTを比較。日本語精度はベンチマーク情報源により順位が割れるため、Phase 3の実測で最終判断する方針とした（詳細: `docs/research/LOCAL_ASR_MODEL_COMPARISON.md`）。
- **Prototype構成**: 4画面（ホーム/ファイル選択/処理中/結果）、TXT/Markdown保存まで。
- **Personal Edition構成**: 履歴・DB(SQLite)・話者分離・タイムスタンプ編集・音声同期・再処理・検索・バックアップ・モデル管理・Windows EXE化。
- **データ構造**: `AudioFile` / `TranscriptionJob` / `Transcript` / `TranscriptSegment` / `FormattedDocument` / `SpeakerMapping` に分離し、音声ファイル実体とDBを分離（詳細: `docs/specs/DATA_MODEL_SPEC_v1.0.md`）。
- **Template Engine構成**: JSON管理、ASRと分離、用途別4テンプレート+カスタム対応（詳細: `docs/specs/TEMPLATE_SPEC_v1.0.md`）。
- **開発Phase**: 0〜12の12段階（詳細: `docs/development/ROADMAP_v1.0.md`）。
- **想定される問題**: (1) ASRモデルの日本語精度評価が情報源により大きく異なるため実測が必須、(2) 話者分離(pyannote.audio)は初回のみHugging Faceのモデル利用規約同意とトークンが必要、(3) Electronパッケージング時のPythonサイドカー同梱でインストーラサイズが大きくなる可能性、(4) ローカルLLMによる要約機能はPersonal Edition後半までスコープ外とし過度な先行実装をしないこと。
- **次に実行すべきPhase**: Phase 1「Prototype UI」。
