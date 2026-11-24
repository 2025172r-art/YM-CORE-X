# YM-CORE X — GitHub / Render Edition

日本語UIのプライベートワークスペースです。標準はAPIキー不要のローカルデモモードで、外部AIサービスへ接続せずチャット画面・履歴・ストリーミングをテストできます。

## 主な機能

### Game Dev Brain（ゲーム制作特化モード）

- 初期モードは **Game Dev Brain**。汎用モードにも切り替え可能
- Unity / Unreal Engine / Godot / Roblox / Webゲームのエンジン別ガイド
- 企画、アーキテクチャ、実装、デバッグ、最適化、コードレビュー、リリース準備の重点タスク切り替え
- `knowledge/game-dev-playbook-ja.md` をサーバー側の専門ナレッジとしてシステム指示へ注入
- プロジェクト共通知識（エンジン版、命名規則、性能目標、ゲーム仕様）を設定に保存し、毎回の依頼に付与
- 最大12個のテキスト/ソースコードファイルを同時添付（1ファイル1MB、合計3MB、モデルに渡す本文は最大160,000文字）
- 標準の応答モードは `demo/local-rules`。デモでは外部AIモデルを呼び出しません。
- 自動読み上げは初期設定OFF。必要な回答だけ個別の読み上げボタンで再生可能


- FastAPIバックエンドとSQLiteによる会話保存
- パスワードログイン、署名付きHttpOnlyセッション、SameSite Cookie、CSRFトークン
- 12文字以上のワークスペースパスワード検証、ログイン試行制限
- 標準のデモモードはサーバー内の定型応答のみで動作し、APIキー・外部AI通信は不要
- 既存のPollinations接続コードは、サーバー設定で明示的に有効化された場合だけ使用
- Server-Sent Eventsによる逐次生成、生成停止、最後の回答の再生成
- 会話の新規作成、検索、名前変更、削除、Markdown/JSONエクスポート
- Markdown表示、サニタイズ、コードブロックコピー
- ソースコードを含む複数テキストファイル添付、音声入力（ブラウザ対応時）、手動音声読み上げ
- ダーク/ライトテーマ、スマートフォン対応
- Docker / Docker Compose / Render Blueprint 対応
- GitHub Actionsによるテスト実行。Render側はテスト成功後に自動デプロイ

## RenderへGitHub経由で公開する（おすすめ）

このリポジトリには `render.yaml` を含めています。Render Blueprintとして読み込むと、Web Serviceの基本設定が自動で入ります。アプリのバージョンは2.2.0です。既定の接続モードは `AI_PROVIDER=demo` です。

### 1. GitHubにリポジトリを作る

1. GitHubで新しいリポジトリを作ります。最初は **Private** にしておくと管理しやすいです。
2. このZIPを展開します。
3. ZIP内のファイルとフォルダー（`app.py`、`render.yaml`、`requirements.txt`、`static/`、`.github/` など）を、GitHubリポジトリの**直下**に置きます。
4. すべてのファイルをコミットして `main` ブランチへPushします。

**重要:** `.env`、APIキー、実際のパスワードをGitHubへアップロードしないでください。`.gitignore` は `.env` を除外します。Renderの環境変数画面だけに秘密情報を設定します。

### 2. RenderでBlueprintを作成

1. Render Dashboardで **New → Blueprint** を選びます。
2. GitHubアカウントを接続し、いま作ったリポジトリを選びます。
3. `render.yaml` が検出されたら内容を確認して作成します。
4. 初回セットアップで次の秘密値を入力します。
   - `APP_PASSWORD`: 12文字以上の、他のサービスと使い回さないパスワード
   - `SESSION_SECRET`: Blueprintで自動生成されます。手動で上書きする必要はありません。
5. デプロイ完了後、Renderが表示する `https://....onrender.com` のURLを開き、`APP_PASSWORD` でログインします。

Renderは `render.yaml` の設定でSingaporeリージョン、Pythonランタイム、ヘルスチェック `/api/health`、`$PORT` を使う起動コマンドを設定します。GitHub Actionsのテストが成功した後に自動デプロイする設定です。

### 3. 無料プランの注意点（必ず確認）

初期設定はRenderの **Free Web Service** です。無料で公開を試せますが、無料Web Serviceは一定時間アクセスがないとスリープし、次のアクセスで起動に時間がかかる場合があります。

さらに、無料Web Serviceのファイルシステムは永続化されません。この設定ではSQLiteを `/tmp/ym-core.db` に保存するため、再起動・再デプロイなどで会話履歴が消える可能性があります。**無料プランのまま、会話履歴がずっと残るとは考えないでください。**

### 4. 会話履歴を残したい場合

SQLiteの履歴をデプロイや再起動後も保存するには、Renderの有料Web ServiceにPersistent Diskを追加します。

1. Render Dashboardで対象Web Serviceを開き、Disk設定からディスクを追加します。
2. Mount Pathを `/var/data` にします。
3. Environmentで `DATABASE_PATH` を `/var/data/ym-core.db` に変更します。
4. 保存して再デプロイします。

ディスクの費用とWeb Serviceの料金はRenderの最新料金ページで必ず確認してください。Persistent Diskを使うサービスは複数インスタンスへの水平スケールに制限があります。無料Postgresは作成後30日で期限切れになるため、長期保存用の無料DBとしてはおすすめしません。

## GitHubへの更新と自動デプロイ

通常はソースを変更してGitHubの `main` ブランチへPushするだけです。GitHub Actionsのテストが成功すると、Renderが新しいバージョンを自動デプロイします。Render DashboardのDeploysとLogsで結果を確認できます。

## ローカルで起動（Windows）

1. Python 3.11以上をインストールします。
2. ターミナルでプロジェクトフォルダーを開きます。

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python setup.py
python app.py
```

PowerShellで仮想環境の有効化が制限される場合は、`.venv\Scripts\python.exe` を使ってpip、setup.py、app.pyを実行してください。

## ローカルで起動（macOS / Linux）

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python setup.py
python app.py
```

ブラウザで `http://127.0.0.1:8000` を開きます。初回セットアップで入力したワークスペース用パスワードは `.env` に保存されます。標準のデモモードではAPIキーを入力する必要はありません。

## Dockerで起動

```bash
python setup.py
docker compose up --build -d
```

ブラウザで `http://127.0.0.1:8000` を開きます。停止は `docker compose down`、ログ確認は `docker compose logs -f` です。データはDocker volume `ym_core_data` に残ります。

## Game Dev Brain の使い方

1. 設定を開き、AIモードを「Game Dev Brain」にします（初期設定済み）。
2. Unity / Unreal / Godot / Roblox / Web など、対象エンジンを選びます。未定なら自動判定のままで構いません。
3. 重点タスクを選ぶか、自動判定にします。
4. 「プロジェクトの共通知識」にエンジンのバージョン、対象プラットフォーム、ゲームジャンル、現在の設計、命名規則、目標FPSなどを入力します。
5. 関連する `.cs`、`.gd`、`.cpp`、`.h`、`.lua`、`.ts`、`.js`、`.json`、`.tscn`、`.prefab` などのテキストファイルを複数添付すると、コード構造に合わせた回答を得やすくなります。

プロジェクト共通知識とモデル設定はブラウザのlocalStorageに保存されます。同じブラウザ/端末で使う場合に設定が引き継がれます。添付ファイルの内容は会話メッセージに含まれてサーバーへ送信され、チャット履歴に保存されます。標準のデモモードでは外部AIサービスへ送信されません。

### できることと現在の限界

Game Dev Brainは専門ナレッジと作業手順を強化したチャット支援です。現在のデモモードは定型応答のみで、実AIによる解析・提案は行いません。実AIプロバイダーを利用する構成に切り替えた場合でも、Cursor AgentのようにGitHubリポジトリを自動走査してファイルを書き換えたり、Render上からUnity/Unrealのビルドやテストコマンドを実行する機能はありません。

## APIエンドポイント

- `GET /api/bootstrap` — 初期状態・CSRFトークン
- `POST /api/login`, `POST /api/logout` — ログイン/ログアウト
- `GET /api/health` — サーバー状態・Renderヘルスチェック
- `GET /api/models` — デモモードではローカルのモデル項目を返し、外部APIには接続しません
- `GET /api/chats`, `POST /api/chats` — 会話一覧/作成
- `GET /api/chats/{id}/messages` — 会話履歴
- `PATCH /api/chats/{id}` — タイトル変更
- `DELETE /api/chats/{id}` — 会話削除
- `POST /api/chats/{id}/stream` — AIストリーミング生成

## スモークテスト

```bash
python -m unittest discover -s tests -v
```

テストはログイン、チャットCRUD、CSRF保護、APIキー不要のデモ応答、ローカルモデル一覧、基本的なセキュリティヘッダーを確認します。外部AIサービスへの通信はテストに含めていません。

## ローカル構成の要件

- Python 3.11以上
- デモモードの実行にはAPIキー不要
- SQLiteはローカルでは `data/ym-core.db`、Renderの初期無料構成では `/tmp/ym-core.db` に保存

音声入力はブラウザのWeb Speech API対応状況に依存します。添付できるのは最大1MBのテキスト系ファイルです。ファイル本文は会話内容としてAIサービスへ送信されます。

この版は単一のプライベートワークスペース用です。複数ユーザーごとの独立アカウント、メール認証、パスワード再設定、管理者ダッシュボードは含めていません。
