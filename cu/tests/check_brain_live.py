"""cu/tests/check_brain_live.py — LIVE check ya cuBrain (Awamu A verification).

Inaendesha brain halisi (HTTP server kwenye thread) kwa keys HALISI za Gemini kutoka
.env.local, kisha inapiga calls 3 kwa lugha ya Anthropic Messages API:
  1) stream + mafupi (flash)     → SSE events + usage record
  2) non-stream + tool           → tool_use block au text
  3) stream flash-lite           → SSE + usage record (lane tofauti)

Run: python3 cu/tests/check_brain_live.py   (HAIENDESHIWI na unittest — jina si test*)
Haitumiki kwenye CI bila keys.
"""
import json
import os
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import brain  # noqa: E402

PORT = 4109


def read_env(path=".env.local"):
    env = {}
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def build_cfg(env):
    return {
        "gemini": {
            "keys": {"gemini-1": env["GEMINI_API_KEY_1"], "gemini-2": env["GEMINI_API_KEY_2"]},
            "flashModels": (env.get("GEMINI_FLASH_MODELS") or "gemini-3.8-flash,gemini-3.5-flash").split(","),
            "liteModels": (env.get("GEMINI_LITE_MODELS") or "gemini-3.5-flash-lite").split(","),
            "flashRpd": int(env.get("GEMINI_FLASH_RPD") or 20),
            "liteRpd": int(env.get("GEMINI_LITE_RPD") or 500),
            "flashRpm": int(env.get("GEMINI_FLASH_RPM") or 5),
            "liteRpm": int(env.get("GEMINI_LITE_RPM") or 15),
        },
        "emergency": [],  # live check ya dharura ni ya Awamu B/C (sandbox) — hapa Gemini tu
    }


def parse_sse(raw: str):
    events = []
    for block in raw.split("\n\n"):
        for line in block.split("\n"):
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except ValueError:
                    pass
    return events


def post(path, body, timeout=120):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "x-api-key": "sk-xmd-local",
                                          "anthropic-version": "2023-06-01"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8")
    return raw, time.time() - t0


def main():
    env = read_env(os.path.join(os.path.dirname(HERE), "..", ".env.local"))
    os.environ["CU_USAGE_OUT"] = "/tmp/brain-usage-live.jsonl"
    if os.path.exists("/tmp/brain-usage-live.jsonl"):
        os.remove("/tmp/brain-usage-live.jsonl")
    os.environ["CU_PORT"] = str(PORT)
    cfg = build_cfg(env)
    threading.Thread(target=lambda: brain.serve(cfg), daemon=True).start()
    time.sleep(0.7)

    # health
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=5) as r:
        print("HEALTH:", r.read().decode())

    # ---- 1) stream + flash
    body = {"model": "xmd-computer", "max_tokens": 300, "stream": True,
            "system": "Wewe ni mhandisi. Jibu kwa Kiswahili sanifu, sentensi 1.",
            "messages": [{"role": "user", "content": "Eleza kwa neno moja tu: nini maana ya API?"}]}
    raw, dt = post("/v1/messages", body)
    events = parse_sse(raw)
    types = [e["type"] for e in events]
    text = "".join(e.get("delta", {}).get("text", "") for e in events if e["type"] == "content_block_delta")
    if not events:
        print("RAW (kosa?):", raw[:500])
    assert types and types[0] == "message_start" and types[-1] == "message_stop", types
    assert text.strip(), "hakuna text"
    print(f"[1] STREAM flash ✓  ({dt:.1f}s) — events {len(types)} · text: {text[:70]!r}")

    # ---- 2) non-stream + tool
    body = {"model": "xmd-computer", "max_tokens": 400, "stream": False,
            "system": "You are an agent. Use tools when asked to perform actions.",
            "messages": [{"role": "user", "content": "Pitia hatua: tengeneza faili /tmp/ripoti.txt lenye maandishi 'XMD Computer'. Tumia zana."}],
            "tools": [{"name": "Write", "description": "Andika faili",
                       "input_schema": {"type": "object", "properties": {"file_path": {"type": "string"}, "content": {"type": "string"}},
                                        "required": ["file_path", "content"]}}]}
    raw, dt = post("/v1/messages", body)
    msg = json.loads(raw)
    assert msg["type"] == "message" and msg["content"], raw[:200]
    kinds = [b["type"] for b in msg["content"]]
    print(f"[2] NON-STREAM + tool ✓  ({dt:.1f}s) — blocks: {kinds} · stop: {msg['stop_reason']} · usage: {msg['usage']}")
    if "tool_use" in kinds:
        tu = [b for b in msg["content"] if b["type"] == "tool_use"][0]
        assert tu["name"] == "Write" and tu["input"].get("file_path")
        print(f"    tool_use ✓ → {tu['name']} {json.dumps(tu['input'], ensure_ascii=False)[:90]}")

    # ---- 3) stream flash-lite (lane ya pili)
    body = {"model": "xmd-computer", "max_tokens": 200, "stream": True,
            "messages": [{"role": "user", "content": "Sema 'Sawa' tu."}]}
    raw, dt = post("/v1/messages", body)
    events = parse_sse(raw)
    text = "".join(e.get("delta", {}).get("text", "") for e in events if e["type"] == "content_block_delta")
    if not events:
        print("RAW (kosa?):", raw[:500])
    assert text.strip()
    print(f"[3] STREAM (lite route) ✓  ({dt:.1f}s) — text: {text[:50]!r}")

    # ---- usage records
    with open("/tmp/brain-usage-live.jsonl", "r", encoding="utf-8") as fh:
        recs = [json.loads(l) for l in fh if l.strip()]
    print(f"USAGE records: {len(recs)}")
    for r0 in recs:
        print(f"    {r0['lane']:<38} ok={r0['ok']} prompt={r0['prompt']:<6} completion={r0['completion']:<5} ms={r0['ms']}")
    assert all(r0["ok"] for r0 in recs) and len(recs) >= 3
    print("\\n✅ LIVE CHECK YA cuBrain IMEPITA — routing + SSE + tools + usage zote halisi.")


if __name__ == "__main__":
    main()
