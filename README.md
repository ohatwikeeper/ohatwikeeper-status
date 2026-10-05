# status.ohatwikeeper.com

おはツイKeeper のステータスページ。Hono(API + 稼働チェッカー) + React(Vite) の単一サービス。

- 3分ごとに `server/services.json` の各URLをチェックし、`service_checks` に INSERT する。**履歴は削除しない**(DELETE/DDL なし)
- 障害は `service_checks` の連続した異常から都度導出する(専用テーブルなし)
- 本番の `service_checks` は既存テーブルを引き継ぐ。`scripts/dev-seed.sql` はローカル開発専用

## 開発
`cp .env.example .env` → `npm run dev:server` と `npm run dev:web`(5180)。`DISABLE_CHECKER=1` でチェック停止。

## 本番
`npm run build` → `dist/` と `dist-server/` を配置し `npm ci --omit=dev`、`npm start`(ポート 3120)。
