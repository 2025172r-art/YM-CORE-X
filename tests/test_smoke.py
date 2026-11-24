"""Minimal server smoke tests. Run with: python -m unittest discover -s tests"""
import os
import tempfile
import unittest
from pathlib import Path

# Set configuration before importing the app module.
_temp = tempfile.TemporaryDirectory()
os.environ["APP_PASSWORD"] = "unit-test-password-123"
os.environ["SESSION_SECRET"] = "unit-test-session-secret-long-enough-for-tests-123456"
os.environ["POLLINATIONS_API_KEY"] = ""
os.environ["DATABASE_PATH"] = str(Path(_temp.name) / "test.db")

from fastapi.testclient import TestClient  # noqa: E402
from app import app, build_system_prompt, ChatRequest  # noqa: E402


class ServerSmokeTests(unittest.TestCase):
    def setUp(self):
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        bootstrap = self.client.get("/api/bootstrap")
        self.csrf = bootstrap.json()["csrf"]

    def tearDown(self):
        self.client_context.__exit__(None, None, None)

    def headers(self):
        return {"X-CSRF-Token": self.csrf}

    def test_login_and_chat_lifecycle(self):
        bad = self.client.post("/api/login", json={"password": "wrong"}, headers=self.headers())
        self.assertEqual(bad.status_code, 401)

        good = self.client.post("/api/login", json={"password": os.environ["APP_PASSWORD"]}, headers=self.headers())
        self.assertEqual(good.status_code, 200)
        self.csrf = good.json()["csrf"]

        created = self.client.post("/api/chats", json={"title": "smoke test"}, headers=self.headers())
        self.assertEqual(created.status_code, 200)
        chat_id = created.json()["id"]

        listed = self.client.get("/api/chats")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["title"], "smoke test")

        renamed = self.client.patch(f"/api/chats/{chat_id}", json={"title": "renamed"}, headers=self.headers())
        self.assertEqual(renamed.status_code, 200)

        no_key = self.client.post(f"/api/chats/{chat_id}/stream", json={"content": "hello"}, headers=self.headers())
        self.assertEqual(no_key.status_code, 503)

        deleted = self.client.delete(f"/api/chats/{chat_id}", headers=self.headers())
        self.assertEqual(deleted.status_code, 200)

    def test_csrf_is_required_for_mutations(self):
        good = self.client.post("/api/login", json={"password": os.environ["APP_PASSWORD"]}, headers=self.headers())
        self.assertEqual(good.status_code, 200)
        self.csrf = good.json()["csrf"]
        bad = self.client.post("/api/chats", json={"title": "x"})
        self.assertEqual(bad.status_code, 403)

    def test_security_headers(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")
        self.assertIn("frame-ancestors 'none'", response.headers.get("Content-Security-Policy", ""))

    def test_game_dev_brain_health(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["version"], "2.1.0")
        self.assertTrue(health.json()["game_dev_brain"])


    def test_game_dev_brain_injects_engine_and_project_context(self):
        prompt = build_system_prompt(ChatRequest(
            assistant_mode="game_dev",
            game_engine="unity",
            game_task="optimization",
            project_context="Unity 6 / 3D action / 60 FPS",
            system_prompt="回答は日本語で",
        ))
        self.assertIn("ゲーム開発ナレッジパック", prompt)
        self.assertIn("Unity", prompt)
        self.assertIn("60 FPS", prompt)
        self.assertIn("最適化", prompt)
        self.assertIn("上記の正確性・安全性", prompt)

    def test_general_mode_keeps_baseline_without_game_knowledge(self):
        prompt = build_system_prompt(ChatRequest(assistant_mode="general"))
        self.assertIn("あなたはYM-CORE X", prompt)
        self.assertNotIn("ゲーム開発ナレッジパック", prompt)

    def test_default_read_aloud_is_off(self):
        html = (Path(__file__).resolve().parents[1] / "static" / "index.html").read_text(encoding="utf-8")
        js = (Path(__file__).resolve().parents[1] / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="autoRead" type="checkbox"', html)
        self.assertIn("autoRead: false", js)
        self.assertIn("getSettings().autoRead", js)
        self.assertIn("model: 'openai/gpt-6.2-astra'", js)
        self.assertIn("multiple accept=", html)
        self.assertIn("function handleFiles(fileList)", js)
        self.assertIn("saved.model === 'openai/gpt-5.4-nano'", js)


if __name__ == "__main__":
    unittest.main()
