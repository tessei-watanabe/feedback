# 日報フィードバック自動生成システム

## プロジェクト概要

マネージャーがメンバーの日報に対して行っているフィードバックを体系化し、
「誰でも入力すれば、マネージャーと同等のクオリティのフィードバックが受けられる」仕組み。

1/18〜1/29の全11件のフィードバックデータを精査し、**5軸評価モデル**を設計・実装済み。

---

## 5軸評価モデル

| # | 軸名 | 核心の問い |
|---|------|-----------|
| 1 | 報告の質（現状報告 vs 構造的分析） | 「なぜそうなったのか」を構造的に分解できているか？ |
| 2 | アクション設計の具体性 | 「何を・いつ・どのレベルまで」が実行可能な粒度で定義されているか？ |
| 3 | 判断基準のルール化 | 開始・継続・停止の基準がif-then形式で事前定義されているか？ |
| 4 | 検証設計とスケーリング判断 | 小規模検証→傾向確認→拡大の段階的設計ができているか？ |
| 5 | フェーズ認識と原則理解 | 今のフェーズで何を優先すべきか理解しているか？ |

各軸Lv.1〜4で評価 → パターンA/B/Cに分岐 → 2層構造でフィードバック生成。

---

## 技術スタック

- **Next.js 16** + TypeScript + Tailwind CSS + shadcn/ui
- **Claude API** (claude-sonnet-4-5) — 評価(tool_use) + フィードバック生成の2段階
- **Google Sheets API** — 入力データ+結果の永続化
- **GitHub**: https://github.com/senjinshuji/feedback
- **デプロイ先**: Vercel（未完了）

---

## ファイル構成

```
feedback/
├── .env.local                          # APIキー・スプシID（gitignore済み）
├── feedback-487523-c7a1be5a16c7.json   # Google SAクレデンシャル（gitignore済み）
├── january_fb.txt                      # 元データ（1/18〜1/29のFB11件）
├── prompts/
│   ├── system-prompt.md                # システムプロンプト全文
│   └── evaluation-prompt.md            # 評価プロンプトテンプレート
├── src/
│   ├── types/index.ts                  # 型定義（5軸、入力フォーム、結果）
│   ├── lib/
│   │   ├── evaluation/prompts.ts       # プロンプト構築ロジック（P01-P07、AP01-AP05含む）
│   │   ├── sheets.ts                   # Google Sheets連携（ローカル:ファイル / Vercel:環境変数）
│   │   └── utils.ts
│   └── app/
│       ├── page.tsx                    # トップページ
│       ├── report/page.tsx             # 5ステップ入力フォーム
│       ├── result/page.tsx             # 結果表示（レーダーチャート+FB本文）
│       └── api/feedback/route.ts       # APIルート（評価→FB生成→スプシ保存）
```

---

## 環境変数（.env.local）

```
ANTHROPIC_API_KEY=sk-ant-api03-OHgZK6g...（略）
GOOGLE_SPREADSHEET_ID=1LW9IfMTYQtbkAd1GVrm9suKFgAtehqhsmCmP_xOccSA
GOOGLE_CREDENTIALS_PATH=./feedback-487523-c7a1be5a16c7.json
```

---

## Google Sheets連携

- **サービスアカウント**: feedback-sheets@feedback-487523.iam.gserviceaccount.com
- **スプレッドシート**: https://docs.google.com/spreadsheets/d/1LW9IfMTYQtbkAd1GVrm9suKFgAtehqhsmCmP_xOccSA
- サービスアカウントに編集権限付与済み
- 「日報データ」シートにA〜T列（20列）で入力+結果を保存
- U列以降はユーザーが自由に使用可

---

## 現在のステータス

### 完了済み
- [x] 5軸評価モデルの設計（11件のデータ精査に基づく）
- [x] 入力フォーム（5ステップ構造化入力）
- [x] Claude API連携（評価+FB生成）
- [x] 結果表示ページ（レーダーチャート+軸別詳細+FB本文）
- [x] Google Sheets保存連携
- [x] GitHubにプッシュ済み (senjinshuji/feedback)

### 未完了: Vercelデプロイ
1. https://vercel.com → 「Add New Project」→ `senjinshuji/feedback` をImport
2. **Environment Variables** に以下3つを設定:
   - `ANTHROPIC_API_KEY` → .env.localの値をそのままコピペ
   - `GOOGLE_SPREADSHEET_ID` → `1LW9IfMTYQtbkAd1GVrm9suKFgAtehqhsmCmP_xOccSA`
   - `GOOGLE_CREDENTIALS_JSON` → `feedback-487523-c7a1be5a16c7.json` の中身をまるごとコピペ
     （ファイルを開いて `{` から `}` まで全部コピーして、Vercelの値欄に貼り付ける）
3. 「Deploy」をクリック

---

## ローカル開発

```bash
npm install
npm run dev
# http://localhost:3000
```
