# データモデル設計 v1.0

## 設計方針

音声ファイル実体とDB（メタデータ・文字起こし結果）を分離する。これにより「別テンプレート／別モデルでの再処理」が音声ファイルの再登録なしに実現できる。

## エンティティ

### AudioFile（音声ファイルメタデータ）

```ts
interface AudioFile {
  id: string;
  filePath: string;       // ユーザー指定のローカル保存場所への参照
  fileName: string;
  fileSizeBytes: number;
  durationMs: number;
  recordedAt?: string;    // 録音日時（取得できる場合）
  importedAt: string;
  format: "mp3" | "wav" | "m4a" | "aac" | "flac";
}
```

### TranscriptionJob（1回の文字起こし処理）

```ts
interface TranscriptionJob {
  id: string;
  audioFileId: string;
  purpose: TranscriptionPurpose;
  templateId: string;
  modelId: string;
  languageSetting: string;
  diarizationEnabled: boolean;
  status: "queued" | "processing" | "completed" | "failed" | "canceled";
  createdAt: string;
  completedAt?: string;
  errorDetail?: string;
}
```

### Transcript / TranscriptSegment（正規化済み文字起こし）

```ts
interface Transcript {
  id: string;
  jobId: string;
  segments: TranscriptSegment[];
  language: string;
  modelId: string;
}

interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;      // 話者A/B/C、後でユーザーが実名へ変更可
  confidence?: number;
}
```

### FormattedDocument（テンプレート適用後の構造化文書）

```ts
interface FormattedDocument {
  id: string;
  jobId: string;
  templateId: string;
  content: string;        // Markdown等の出力
  fields: Record<string, string>; // テンプレートフィールドごとの値（[不明]/[推定]含む）
  exportedFormats: ("txt" | "markdown" | "json" | "docx" | "pdf" | "csv")[];
}
```

### SpeakerMapping（話者ラベルとユーザー定義名の対応）

```ts
interface SpeakerMapping {
  id: string;
  transcriptId: string;
  rawLabel: string;   // 話者A / 話者B ...
  displayName?: string; // ユーザーが割り当てた名前（例: 自分, 田中さん）
}
```

### Template（テンプレート定義。`TEMPLATE_SPEC_v1.0.md`参照）

## 関係

```text
AudioFile (1) ── (N) TranscriptionJob ── (1) Transcript ── (1) FormattedDocument
                                     └── (N) SpeakerMapping
```

1つの `AudioFile` に対して複数の `TranscriptionJob`（再処理）を作成できる。これにより「同じ音声を議事録形式→簡易要約形式で再処理」（指示書§18）が実現される。

## ストレージ方針

- **音声ファイル実体**: ユーザー指定のローカルフォルダ（DBには参照パスのみ保存）
- **DB**: SQLite（`better-sqlite3`）。`AudioFile` / `TranscriptionJob` / `Transcript` / `TranscriptSegment` / `FormattedDocument` / `SpeakerMapping` / `Template` の各テーブルを想定。
- **バックアップ対象**: DBファイル、テンプレート、設定、文字起こし履歴（音声ファイル実体は既定で対象外、`PERSONAL_SPEC_v1.0.md` §14参照）。

## Prototype版での簡略化

Prototypeでは DB を使用せず、`TranscriptionJob` 〜 `FormattedDocument` はメモリ上のみで保持し、結果はTXT/Markdownとしてファイル出力するだけに留める。型定義自体はPersonal Editionと共通化しておき、後からSQLite永続化層を追加するだけで済むようにする。
