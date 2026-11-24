# GitHub → Render 公開手順

1. ZIPを展開し、**このフォルダーの中身**をGitHubリポジトリのルートへアップロードします。
2. `.env` とAPIキー、実パスワードが含まれていないことを確認します。
3. GitHubでコミットして `main` へPushします。
4. Render Dashboardで **New → Blueprint** を選び、対象リポジトリを接続します。
5. Renderが `render.yaml` を読み込んだら作成します。
6. 初回プロンプトで `APP_PASSWORD`（12文字以上）と `POLLINATIONS_API_KEY` を入力します。`SESSION_SECRET` は自動生成されます。
7. デプロイ後に `onrender.com` のURLへアクセスし、APP_PASSWORDでログインします。

## デプロイ設定

- Runtime: Python
- Region: Singapore
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app:app --host 0.0.0.0 --port $PORT --proxy-headers`
- Health check: `/api/health`
- Auto deploy: GitHub Actionsのテスト成功後

## データ保存について

初期BlueprintはRender Freeです。SQLiteを `/tmp/ym-core.db` に置くため、会話履歴は再起動や再デプロイで失われる可能性があります。

履歴の永続化が必要な場合は、有料Web ServiceにPersistent Diskを追加し、Mount Pathを `/var/data`、環境変数 `DATABASE_PATH` を `/var/data/ym-core.db` に設定します。料金はRenderの最新料金ページを確認してください。無料Postgresは30日で期限切れになるため長期保存には使わないでください。


## 2.1.0 追加機能

- 初期モードは Game Dev Brain（Unity / Unreal / Godot / Roblox / Web対応）
- `knowledge/game-dev-playbook-ja.md` をサーバーから毎回のゲーム制作依頼へ注入
- 初期モデル `openai/gpt-6.2-astra`（モデル一覧APIから選択可能）
- 自動読み上げは初期状態OFF
- 最大12個のソースコード/テキストファイルをまとめて添付可能

既存リポジトリを更新する場合は、プロジェクト直下の既存ファイルに上書きしてコミットし、GitHub Actionsのテスト成功後にRenderへデプロイしてください。`knowledge/` フォルダーも必ずGitHubへPushしてください。
