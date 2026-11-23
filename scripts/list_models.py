"""List Gemini models your API key can use:  python scripts/list_models.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "agents"))

from google import genai  # noqa: E402

from config import get_settings  # noqa: E402

key = get_settings().gemini_api_key
if not key:
    sys.exit("GEMINI_API_KEY is not set. Add it to .env first.")

client = genai.Client(api_key=key)
for m in client.models.list():
    name = m.name.replace("models/", "")
    actions = getattr(m, "supported_actions", None) or []
    if "gemini" in name and (not actions or "generateContent" in actions):
        print(name)
