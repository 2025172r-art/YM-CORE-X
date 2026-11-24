from __future__ import annotations

import getpass
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"


def main() -> None:
    if ENV_FILE.exists():
        answer = input(".env がすでにあります。上書きしますか？ [y/N]: ").strip().lower()
        if answer != "y":
            print("変更せず終了しました。")
            return

    print("\nYM-CORE X 初期セットアップ")
    print("このパスワードはローカルのワークスペースにログインするために使います。")
    while True:
        password = getpass.getpass("ログインパスワード (12文字以上): ")
        if len(password) < 12:
            print("安全のため12文字以上にしてください。")
            continue
        confirm = getpass.getpass("パスワードを再入力: ")
        if password != confirm:
            print("一致しません。もう一度入力してください。")
            continue
        break

    lines = [
        "APP_NAME=YM-CORE X",
        "AI_PROVIDER=demo",
        f"APP_PASSWORD={password}",
        f"SESSION_SECRET={secrets.token_urlsafe(48)}",
        "POLLINATIONS_API_KEY=",
        "DATABASE_PATH=./data/ym-core.db",
        "HOST=127.0.0.1",
        "PORT=8000",
        "SECURE_COOKIES=false",
        "",
    ]
    ENV_FILE.write_text("\n".join(lines), encoding="utf-8")
    print("\n.env を作成しました。")
    print("ローカルデモモードを設定しました。APIキーは不要です。")
    print("次のコマンドで起動できます: python -m pip install -r requirements.txt && python app.py")


if __name__ == "__main__":
    main()
