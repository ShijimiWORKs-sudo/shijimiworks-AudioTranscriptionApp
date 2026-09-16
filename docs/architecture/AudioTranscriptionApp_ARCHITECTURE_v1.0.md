# AudioTranscriptionApp アーキテクチャ設計 v1.0

## 0. リポジトリ調査結果（Phase 0）

- GitHub: `ShijimiWORKs-sudo/shijimiworks-AudioTranscriptionApp` は空リポジトリ（コミット無し）。
- ローカル作業フォルダ `C:\制作データ\19_AudioTranscriptionApp` も空。
- ⇒ 既存実装は無く、完全新規（グリーンフィールド）プロジェクトとして設計する。既存コードとの互換性を考慮する必要はない。

---

## 1. 技術構成の推奨

| レイヤー | 推奨技術 | 理由 |
|---|---|---|
| デスクトップシェル | **Electron** + TypeScript | 最終的にWindows EXE化が必須要件。Electronは実績が豊富で、Node.js経由のローカルプロセス起動（Pythonサイドカー等）が容易。electron-builderでインストーラ/ポータブルEXEを生成可能。 |
| UI | **React** + TypeScript + Vite | Prototype→Personalへ段階的に機能追加するため、コンポーネント分割がしやすいReactを採用。Viteで開発体験を高速化。 |
| ASRエンジン実行 | **Pythonサイドカープロセス**（faster-whisper） | ローカルAIモデル資産（PyTorch/CTranslate2）はPythonエコシステムが最も成熟。Electron本体とはlocalhost限定のHTTP、またはstdin/stdout JSON-RPCで通信し、外部ネットワークには一切出さない。配布時は PyInstaller 等でスタンドアロンEXE化し、エンドユーザーにPython環境構築を要求しない。 |
| ローカルDB（Personal Edition） | **SQLite**（better-sqlite3 経由） | 履歴・テンプレート・設定を保存。ファイル実体（音声）とは分離。 |
| テンプレート形式 | **JSON**（Markdown出力テンプレートを内包） | 構造検証がしやすく、ユーザーが取り込みやすい。 |

### 1.1 Electron vs Tauri の検討

| 観点 | Electron | Tauri |
|---|---|---|
| バイナリサイズ/メモリ | 大きい | 小さい |
| Python連携（子プロセス起動、IPC） | Node.js標準機能で容易 | Rust側での実装が必要、学習コスト高 |
| 開発速度（個人開発） | 速い、資料豊富 | やや遅い、情報が少ない |
| 将来のローカルLLM追加 | サイドカー方式で拡張しやすい | 同上だが実装コストが高い |

⇒ 個人開発でPhase 1から順次機能を積み上げる本プロジェクトの性質上、**Electronを採用**する。将来的にバイナリサイズが問題になった場合はTauri移行を再検討する（ASR EngineインターフェースをUI層から分離しておくことで移行コストを抑える）。

---

## 2. レイヤードアーキテクチャ

```text
┌─────────────────────────────────────────────┐
│  Electron Renderer (React UI)                │
│  ホーム / ファイル選択 / 用途選択 / 処理中 / 結果編集  │
└───────────────┬───────────────────────────────┘
                │ IPC (contextBridge)
┌───────────────▼───────────────────────────────┐
│  Electron Main Process                        │
│  - ファイルシステムアクセス                       │
│  - ASR Service 呼び出し（子プロセス管理）           │
│  - SQLite アクセス（Personal Edition）            │
└───────────────┬───────────────────────────────┘
                │ localhost限定 HTTP / stdio JSON-RPC
┌───────────────▼───────────────────────────────┐
│  ASR Sidecar Process (Python, PyInstaller化)   │
│  ASR Engine Interface                          │
│   ├─ Engine: faster-whisper (既定)              │
│   ├─ Engine: Kotoba-Whisper                    │
│   └─ Engine: ReazonSpeech (将来)                 │
└───────────────┬───────────────────────────────┘
                │
┌───────────────▼───────────────────────────────┐
│  Normalized Transcript                         │
│  { segments: [{startMs, endMs, text, speaker?}] } │
└───────────────┬───────────────────────────────┘
                │
┌───────────────▼───────────────────────────────┐
│  Template Renderer                             │
│  用途別テンプレート(JSON) → 構造化文書              │
└───────────────┬───────────────────────────────┘
                │
┌───────────────▼───────────────────────────────┐
│  Editor / Export (TXT / Markdown / JSON / DOCX) │
└─────────────────────────────────────────────┘
```

重要な設計原則（指示書 §9 と同一方針）:

> **音声認識（ASR）と文章整形（Template Rendering）を分離する。**
> ASRエンジンを交換しても、テンプレート・履歴・編集機能を作り直す必要がないようにする。

---

## 3. ASR Engine 抽象化

```ts
// src/core/asr/ASREngine.ts
export interface TranscriptionOptions {
  language?: "ja" | "en" | "auto";
  modelId: string;              // 使用するモデルの識別子
  enableDiarization?: boolean;  // 話者分離（Personal Editionのみ）
  enableTimestamps?: boolean;
}

export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;      // 話者分離結果（仮ラベル: 話者A/B/C）
  confidence?: number;
}

export interface Transcript {
  segments: TranscriptSegment[];
  language: string;
  modelId: string;
  durationMs: number;
}

export interface ASREngine {
  id: string;
  name: string;
  transcribe(
    audioPath: string,
    options?: TranscriptionOptions
  ): Promise<Transcript>;
  cancel?(jobId: string): Promise<void>;
}
```

- `ASREngine` の実装（`FasterWhisperEngine`, `KotobaWhisperEngine` 等）は `src/core/asr/engines/` 配下に配置し、Application層は `ASREngine` インターフェースにのみ依存する。
- モデル管理（ダウンロード済みモデル一覧、追加/削除）は `ASRService` が仲介し、UIの「モデル管理」画面（Personal Edition, §28）から操作する。

---

## 4. データフロー（テンプレートとAI処理の分離）

```text
ASR結果 (raw segments)
   ↓
Normalized Transcript（話者ラベル正規化、タイムスタンプ整形）
   ↓
Template Renderer（用途別テンプレートを適用）
   ↓
Formatted Document（議事録 / 電話メモ / 打ち合わせ記録 / 自由形式）
```

Template Rendererは`Normalized Transcript`のみに依存し、ASRエンジンの内部実装を知らない。これにより将来のASRモデル交換・要約LLM追加時もテンプレート層は無改修で済む。

---

## 5. プライバシー・セキュリティ設計

- 既定では音声ファイル・文字起こし結果ともにローカルファイルシステム／ローカルSQLiteにのみ保存する。
- Electron Main ProcessからASR Sidecarへの通信は `127.0.0.1` の動的ポート、またはstdioに限定し、外部向けリスナーを作らない。
- テンプレートのネット取得・アプリ更新など、明示的にネットワークへアクセスする機能は、ユーザーの操作をトリガーとした個別APIとして実装し、既定ではOFFにする。
- 不正なテンプレートJSON、パストラバーサル、巨大ファイル、不正な音声形式への対策をPersonal Edition Phase 10で実装する（詳細は `PERSONAL_SPEC_v1.0.md` §セキュリティ）。

---

## 6. Prototype版と Personal Edition の境界

| 機能 | Prototype | Personal Edition |
|---|---|---|
| 音声選択・文字起こし・結果表示 | ✅ | ✅ |
| 用途選択（議事録/電話/打ち合わせ/その他） | ✅（テンプレートは最小構成） | ✅（フル構成、カスタムテンプレート対応） |
| TXT/Markdown保存 | ✅ | ✅（JSON/DOCX/PDF/CSVも対応） |
| 履歴・DB | ❌ | ✅ SQLite |
| 話者分離・タイムスタンプ編集 | ❌ | ✅ |
| 音声プレイヤー同期 | ❌ | ✅ |
| モデル管理画面 | ❌（固定モデル1種のみ） | ✅ |
| 再処理・検索・バックアップ | ❌ | ✅ |
| Windows EXE配布 | 開発ビルドのみ | electron-builderで正式パッケージング |

詳細は `docs/specs/PROTOTYPE_SPEC_v1.0.md` および `docs/specs/PERSONAL_SPEC_v1.0.md` を参照。
