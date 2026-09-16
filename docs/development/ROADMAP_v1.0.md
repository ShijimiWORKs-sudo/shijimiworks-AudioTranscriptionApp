# 開発ロードマップ v1.0

Phaseごとに専用ブランチを切り、mainへ直接変更しない。各Phase終了後は commit → push → Draft PR まで行う（ブランチ命名: `codex/phase-N-xxx` または `claude/phase-N-xxx`）。

| Phase | 内容 | 完了条件（概要） |
|---|---|---|
| 0 | 既存リポジトリ調査（本ドキュメント一式） | 変更なし。調査・設計完了（本Phaseで完了） |
| 1 | Prototype UI（ホーム→音声選択→用途選択→結果） | 画面遷移が一通り動作する |
| 2 | Local ASR接続（faster-whisper） | 実際のMP3/WAVを処理できる |
| 3 | Prototype QA（1分/10分/30分/60分の実音声テスト） | `docs/prototype/PROTOTYPE_RESULT.md` 作成 |
| 4 | Template Engine（議事録/電話/打ち合わせ/その他） | 4用途のテンプレートが適用される |
| 5 | Personal DB（SQLite導入） | 履歴・設定・テンプレートが永続化される |
| 6 | 編集・タイムスタンプ・話者分離 | セグメント単位で編集・話者名変更ができる |
| 7 | 音声同期（プレイヤー連動） | 文字クリックで該当時刻を再生できる |
| 8 | Export（TXT/Markdown/JSON/DOCX/PDF） | 各形式で出力できる |
| 9 | Model Manager | モデル追加・削除・切り替えができる |
| 10 | Advanced Personal Features（検索/履歴/再処理/バックアップ/話者管理/テンプレート管理） | それぞれ動作確認済み |
| 11 | Desktop Packaging（Windows EXE化） | electron-builderでEXE/インストーラ生成 |
| 12 | 最終QA（Chrome/Edge/Windows Desktop） | 全完成条件チェックリストを満たす |

## 各Phase共通ルール（`AGENTS.md`より抜粋）

- 指定されたPhaseだけ実装する。勝手に次Phaseへ進まない。
- 不要なリファクタリングをしない。既存機能を壊さない。
- 依存パッケージ追加は必要性を確認する。
- TypeScriptエラーを残さない。テストを書き、関連テストを実行する。
- 実装結果を報告する。

## 次に実行すべきPhase

現時点（本ドキュメント作成時点）でPhase 0（調査・設計）が完了。次はPhase 1「Prototype UI」に進む。
