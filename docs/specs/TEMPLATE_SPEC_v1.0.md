# Template Engine 仕様書 v1.0

## 設計方針

テンプレートはコードへ直接埋め込まず、JSON（Markdownベースの出力テンプレートを内包）で管理する。テンプレート自体をAIモデルへ直接依存させず、`Normalized Transcript`（正規化済み文字起こし）のみを入力とする。

```text
ASR結果 { segments: [...] }
   ↓
Normalized Transcript
   ↓
Template Renderer
   ↓
議事録 / 電話メモ / 打ち合わせ記録 / 自由形式
```

## ディレクトリ構成

```text
templates/
├── meeting_minutes/
├── phone_call/
├── discussion/
└── other/
```

## テンプレートのフィールド

```ts
interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  purpose: TranscriptionPurpose;
  version: string;
  fields: TemplateField[];
  output_format: "markdown" | "txt" | "json";
}

interface TemplateField {
  key: string;
  label: string;
  required: boolean;
  // 音声から確認できない場合の既定表示
  fallback: "[不明]" | "[推定]";
}
```

## 用途別の基本テンプレート

### 議事録 (meeting_minutes)

タイトル / 日時 / 参加者 / 議題 / 要約 / 主な発言 / 決定事項 / 未決事項 / TODO / 担当者 / 期限 / 補足

### 電話内容 (phone_call)

通話日時 / 相手 / 要件 / 相手の発言 / 自分の発言 / 重要事項 / 依頼事項 / 確認事項 / 次の対応 / メモ

話者が確実に判断できない場合は「話者A」「話者B」等の仮ラベルを使用する。

### 打ち合わせ (discussion)

タイトル / 日時 / 参加者 / 目的 / 議題 / 発言者別内容 / 論点 / 意見 / 合意事項 / 未決事項 / TODO / 次回予定

### その他 (other)

テンプレートを指定せず「タイトル」「全文文字起こし」のみ。ユーザーが独自テンプレートを指定できる。

## 事実生成の禁止

音声から確認できない情報を勝手に生成しない。不明な情報は `[不明]`、推定情報は `[推定]` と明示する（Personal Edition §12「AIによる要約」と同一方針）。

## テンプレート取得（ネット/ユーザー取り込み）

2種類に分ける:

1. **テンプレート取得**: 公開ライセンス／自作テンプレート／ユーザー指定ファイル／URLから取得した公開データを対象とする。外部サイトの内容を無断転載しない。取得したテンプレートはローカルへ保存する。
2. **ユーザー取り込み**: JSON / Markdown / TXTでユーザー自身がテンプレートを取り込める。取り込み時は不正なJSON構造・パストラバーサルを検証する（`docs/specs/PERSONAL_SPEC_v1.0.md` §セキュリティ参照）。

## Prototype版での扱い

Prototypeでは4用途それぞれに最小限の固定テンプレートを1つずつ用意し、テンプレートエンジンの抽象化（JSON読み込み・Markdownレンダリング）のみを実装する。カスタムテンプレートのインポート・ネット取得はPersonal Edition（Phase 4以降）で実装する。
