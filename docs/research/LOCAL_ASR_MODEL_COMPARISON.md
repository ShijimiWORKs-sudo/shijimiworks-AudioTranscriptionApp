# ローカルASRモデル比較調査（2026年9月時点）

対象プロジェクト: AudioTranscriptionApp
調査目的: 「音声データを外部送信せず、PC上で無制限に文字起こしできる個人用アプリ」のASRエンジンを選定するための比較資料。

> 注記: 音声認識モデルのベンチマーク数値は評価データセット・前処理方法によって情報源ごとに大きくばらつく（下記「参考情報源」参照）。本ドキュメントの数値は目安であり、Phase 3 (Prototype QA) で自分の実際の音声（議事録・電話・打ち合わせ）を使って再検証することを前提とする。

---

## 1. 比較対象

| モデル/実装 | 位置づけ |
|---|---|
| faster-whisper (CTranslate2) | Whisper系の高速化推論エンジン。モデル重みはOpenAI Whisperや後述の日本語特化モデルを差し替え可能 |
| whisper.cpp | Whisperのllama.cpp系C++実装。GPU無し環境・軽量配布に強い |
| Kotoba-Whisper v2.0 | Whisper large-v3から蒸留した日本語特化モデル（kotoba-tech, Apache 2.0） |
| ReazonSpeech (espnet-v2 / NeMo版) | 日本語35,000時間コーパスで学習された純国産ASR（レアゾン・ホールディングス, Apache 2.0） |
| NVIDIA Parakeet-TDT | 超高速ASR（RTF最小水準）。多言語版はあるが日本語特化ではない |
| WhisperX + pyannote.audio | Whisper系の出力に単語レベルタイムスタンプと話者分離を付加するラッパー構成 |

---

## 2. 比較表

| 項目 | faster-whisper | whisper.cpp | Kotoba-Whisper v2.0 | ReazonSpeech v2 | Parakeet-TDT |
|---|---|---|---|---|---|
| 日本語認識精度 | ベース（large-v3相当） | ベースと同等（重み次第） | 情報源により評価が割れる（後述） | 日本語では最高水準との評価が複数 | 多言語版はあるが日本語特化ではなく現時点で未検証 |
| CPU性能 | int8量子化でCPUでも実用的（例: 13分音声を約2分で処理という報告あり） | CPU最適化が本来の強み。GPU無しでも動作 | faster-whisper/whisper.cpp経由でCPU実行可 | NeMo/ESPnet実行はGPU前提の実装が主流、CPUは低速 | GPU前提 |
| GPU対応 | NVIDIA CUDA（int8/fp16） | CUDA / ROCm / Vulkan / Apple Metal 等、幅広く対応 | 同上（重みをctranslate2形式に変換して利用） | NVIDIA GPU推奨 | NVIDIA GPU推奨 |
| メモリ使用量 | large-v3相当でVRAM 約2.9GB（int8時） | large-v3相当でRAM 約3.9GB | 0.8Bパラメータと軽量 | モデルにより数GB、長時間音声でVRAM不足の報告あり | 比較的軽量（0.6B〜1.1B） |
| モデル容量 | large-v3で約1.5GB前後（量子化で圧縮可） | 同上（ggufフォーマット） | 中量級（0.8Bパラメータ） | モデルにより異なる | 0.6B/1.1B系で数百MB〜 |
| 処理速度 | 参照実装比で最大4倍程度高速との報告 | Apple Siliconで「CPU比3倍」等の報告 | 「large-v3同等精度で6.3倍高速」を開発元が主張 | 実測で2分35秒の音声を約10秒程度という報告 | RTF=0.002クラスの報告（最速級） |
| オフライン動作 | 可（モデルダウンロード後） | 可 | 可 | 可 | 可 |
| ライセンス | MIT | MIT | Apache 2.0 | Apache 2.0 | 個別モデルカード要確認（NVIDIA Open Model License系が多い） |
| 話者分離 | 非対応（別途pyannote等が必要） | 非対応（同左） | 非対応（同左） | 非対応（同左） | 非対応（同左） |
| タイムスタンプ | セグメント単位で対応。単語単位はWhisperXで拡張可 | セグメント単位で対応 | Whisper系と同様 | モデルにより句読点無しの出力など癖あり | 対応 |
| モデル交換 | 容易（CTranslate2形式に変換すれば重み差し替え可能） | 容易（ggufファイル差し替え） | faster-whisper/whisper.cppへの変換が前提 | 独自実装（ESPnet/NeMo）のため差し替えはやや手間 | 独自実装 |
| Windows対応 | 対応（pipインストール、CUDA有無どちらも可） | 対応（ビルド済みバイナリ配布あり） | 対応（faster-whisper経由） | 対応だがPython環境構築がやや重い | 対応（NeMoツールキット経由、環境構築はやや重い） |

---

## 3. 精度に関する複数情報源の比較（参考）

情報源によって順位が異なるため、両論併記する。

**情報源A（ベンダー公称値・Kotoba-Whisper公式）**
- Kotoba-Whisper v2.0: CommonVoice8日本語でCER 9.2% / WER 58.8%、ReazonSpeechテストセットでCER 11.6% / WER 55.6%。large-v3と同程度の精度を6.3倍速で達成、と主張。

**情報源B（第三者ベンチマーク記事、2026年2月）**
- Whisper-large-v3-turbo: WER 0.218 / CER 0.184（上位）
- ReazonSpeech-espnet-v2: WER 0.234 / CER 0.215
- Kotoba-Whisper-v2.0: WER 0.534 / CER 0.495（下位、情報源Aと大きく乖離）

**情報源C（個人検証note記事）**
- ReazonSpeech v2: WER 0.055（自然発話コーパスで最高精度）
- Whisper large v3: WER 0.066（処理速度は最速）
- nue-asr: WER 0.194（句読点は付くが精度は劣る）

このように評価データセットや発話スタイル（会議/電話/フリートーク等）によって結果が大きく変わるため、**Phase 3のPrototype QAで実際の自分の音声（議事録・電話・打ち合わせの3パターン）を使い、faster-whisper(large-v3系) と Kotoba-Whisper / ReazonSpeech を実測比較する**ことを推奨する。

---

## 4. 話者分離・タイムスタンプの補完構成

上記のASRモデル単体では話者分離に対応していないため、Personal Edition（Phase 6以降）では以下を追加レイヤーとして検討する。

- **pyannote.audio**: コードはMITライセンスだが、`speaker-diarization-3.1` 等のモデルはHugging Face上でgated（利用規約への同意とトークン取得が初回のみ必要）。ダウンロード後は完全オフラインで動作する。
- 精度の目安: AMIコーパスでDER 12–14%、VoxConverseで9–11%。クリーンな2話者音声では95%以上の実用精度、複数話者になると75–85%程度に低下するとの報告あり。GPU推奨（T4クラスで1時間の音声を6〜12分で処理、CPUでは概ね等倍〜1.5倍の時間）。
- この「初回モデルダウンロード」は指示書の「オフライン動作の例外（モデル初回ダウンロード/テンプレート取得/アプリ更新）」に該当するため、プライバシー方針と矛盾しない。

---

## 5. 推奨方針

1. **ASR Engine抽象化**（`src/core/asr/ASREngine`インターフェース）を必ず経由し、特定モデルにアプリ全体を依存させない。
2. **Prototype版の初期実装**は `faster-whisper` を採用する。理由: Windows/CPU/GPU双方に対応し、Pythonエコシステムが成熟しており、モデル重みの差し替え（Whisper large-v3 ⇔ Kotoba-Whisper ⇔ ReazonSpeech変換版）が比較的容易なため。
3. **日本語精度の最終判断はPhase 3の実測後に行う**。ReazonSpeechが会議・自然発話に強いという複数の報告があるため、Personal Editionではモデル選択肢としてReazonSpeechの追加も検討する。
4. **話者分離・単語単位タイムスタンプ**はASR本体と分離し、Personal Edition（Phase 6）でpyannote.audio/WhisperX相当の後処理レイヤーとして追加する。ASRの生セグメントと話者分離結果は別データとして保持し、後から組み合わせる設計にする（本文書 §9 「テンプレートとAI処理を分離する」の思想に準拠）。

---

## 参考情報源

- [faster-whisper vs whisper.cpp vs OpenAI Whisper (2026)](https://codersera.com/blog/faster-whisper-vs-whisper-cpp-speech-to-text-2026/)
- [kotoba-tech/kotoba-whisper-v2.0 · Hugging Face](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0)
- [【2026年最新】日本語音声認識（ASR / STT）モデル比較 | Neosophie Blog](https://neosophie.com/ja/blog/20260226-japanese-asr-benchmark)
- [ReazonSpeech v2, whisper-large v3, nue-asrを比較してみた｜松note](https://note.com/eurekachan/n/nb41f7bf315af)
- [ReazonSpeech - Reazon Human Interaction Lab](https://research.reazon.jp/projects/ReazonSpeech/index.html)
- [nvidia/parakeet-tdt-0.6b-v3 · Hugging Face](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [pyannote.audio Guide — Open-Source Speaker Diarization Pipeline 2026 | VexaScribe](https://vexascribe.com/pyannote-audio)
- [WhisperX Deep-Dive — Diarization And Word-Level Timestamps](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/whisperx-diarization-word-level-timestamps)
