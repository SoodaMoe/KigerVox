"""
KigerVox TTS Server (Python 3.12)

POST /api/tts       { text, voice, speed }
  -> checks file cache -> calls Tencent Cloud if miss -> transcodes to AAC -> caches -> returns audio

POST /api/proxy-tts  { url, method, headers, body }
  -> forwards to user's custom TTS endpoint -> returns audio (no server cache)

All users share the same cache for /api/tts; proxy requests are never cached server-side.

Setup:
  1. Copy config.example.json to config.json and fill in your credentials
  2. apt install -y ffmpeg
  3. python server.py
  4. Update DEFAULT_SERVER_URL in utils/tts.js
"""

import base64
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

# ═════════════ Load config ═════════════
CONFIG_PATH = Path(__file__).parent / "config.json"
try:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        _config = json.load(f)
    SECRET_ID = _config.get("secret_id", "")
    SECRET_KEY = _config.get("secret_key", "")
except (FileNotFoundError, json.JSONDecodeError) as e:
    print(f"[init] WARNING: config.json not found or invalid ({e}), using placeholders")
    SECRET_ID = "your-secret-id-here"
    SECRET_KEY = "your-secret-key-here"
PORT = int(os.environ.get("PORT", 53824))
CACHE_DIR = Path(__file__).parent / "cache"
MAX_CACHE_SIZE = 5 * 1024 * 1024 * 1024  # 5GB

# Audio encoding
CACHE_EXT = ".m4a"
CONTENT_TYPE = "audio/mp4"
AAC_BITRATE = "32k"  # 32kbps AAC is excellent for speech

# ─── ffmpeg check ────────────────────────────────────────
_FFMPEG = shutil.which("ffmpeg")
if _FFMPEG:
    print(f"[init] ffmpeg found: {_FFMPEG}")
else:
    print("[init] ffmpeg NOT found — will serve raw MP3 without transcoding")

# ═════════════ Ensure cache dir ═════════════
CACHE_DIR.mkdir(exist_ok=True)


def cache_hash(text: str, voice: str, speed: int) -> str:
    """Generate content-addressable cache key."""
    raw = f"tencent|{voice}|{speed}|{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def cache_path(hash_str: str) -> Path:
    return CACHE_DIR / f"{hash_str}{CACHE_EXT}"


def evict_if_needed() -> None:
    """LRU eviction when total cache exceeds MAX_CACHE_SIZE."""
    files = []
    for f in CACHE_DIR.glob(f"*{CACHE_EXT}"):
        try:
            stat = f.stat()
            files.append({"path": f, "time": stat.st_mtime, "size": stat.st_size})
        except OSError:
            pass

    total = sum(f["size"] for f in files)
    if total <= MAX_CACHE_SIZE:
        return

    files.sort(key=lambda x: x["time"])
    for f in files:
        if total <= MAX_CACHE_SIZE:
            break
        try:
            f["path"].unlink()
            total -= f["size"]
        except OSError:
            pass


def transcode_to_aac(mp3_data: bytes) -> bytes:
    """Convert MP3 to AAC via ffmpeg. Falls back to original MP3 if ffmpeg unavailable."""
    if not _FFMPEG:
        return mp3_data

    proc = subprocess.run(
        [_FFMPEG, "-i", "pipe:0", "-c:a", "aac", "-b:a", AAC_BITRATE,
         "-vn", "-f", "adts", "pipe:1"],
        input=mp3_data, capture_output=True, timeout=30
    )
    if proc.returncode == 0 and proc.stdout:
        return proc.stdout
    # Fallback to original MP3 on failure
    print(f"[warn] ffmpeg failed, using original MP3: {proc.stderr[:200]}")
    return mp3_data


def call_tencent_tts(text: str, voice: str, speed: float) -> bytes:
    """Call Tencent Cloud TTS API (TC3-HMAC-SHA256 signing), return AAC bytes."""
    payload = json.dumps({
        "Text": text,
        "SessionId": str(uuid.uuid4()),
        "VoiceType": int(voice),
        "Codec": "mp3",
        "Speed": float(speed),
        "Volume": 5,
    })

    timestamp = str(int(time.time()))
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    endpoint = "tts.tencentcloudapi.com"
    service = "tts"

    # TC3 signing
    hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = "\n".join([
        "POST", "/", "",
        "content-type:application/json",
        f"host:{endpoint}", "",
        "content-type;host",
        hashed_payload,
    ])

    credential_scope = f"{date_str}/{service}/tc3_request"
    hashed_canonical = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = "\n".join([
        "TC3-HMAC-SHA256", timestamp, credential_scope, hashed_canonical,
    ])

    def _hmac(key: bytes, data: str) -> bytes:
        return hmac.new(key, data.encode("utf-8"), hashlib.sha256).digest()

    k_date = _hmac(b"TC3" + SECRET_KEY.encode("utf-8"), date_str)
    k_service = _hmac(k_date, service)
    k_signing = _hmac(k_service, "tc3_request")
    signature = _hmac(k_signing, string_to_sign).hex()

    auth = (
        f"TC3-HMAC-SHA256 Credential={SECRET_ID}/{credential_scope}, "
        f"SignedHeaders=content-type;host, Signature={signature}"
    )

    req = Request(
        f"https://{endpoint}",
        data=payload.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Host": endpoint,
            "X-TC-Action": "TextToVoice",
            "X-TC-Version": "2019-08-23",
            "X-TC-Timestamp": timestamp,
            "Authorization": auth,
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except URLError as e:
        raise RuntimeError(f"Tencent Cloud request failed: {e}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON response: {e}")

    if err := body.get("Response", {}).get("Error"):
        raise RuntimeError(err["Message"])
    if audio := body.get("Response", {}).get("Audio"):
        mp3_data = base64.b64decode(audio)
        return transcode_to_aac(mp3_data)
    raise RuntimeError("No audio in response")


def proxy_custom_tts(payload: dict) -> bytes:
    """Forward request to user's custom TTS endpoint, return raw audio bytes."""
    url = payload.get("url", "")
    method = payload.get("method", "POST").upper()
    headers = payload.get("headers", {})
    body = payload.get("body", "")

    if not url:
        raise RuntimeError("Missing url in proxy request")

    req_headers = {"Content-Type": "application/json"}
    if isinstance(headers, dict):
        req_headers.update({k: str(v) for k, v in headers.items()})

    data = body.encode("utf-8") if method == "POST" and body else None

    print(f"[proxy] {method} {url} body={body[:100]}")

    try:
        req = Request(url, data=data, headers=req_headers, method=method)
        with urlopen(req, timeout=60) as resp:
            audio = resp.read()
            ct = resp.headers.get("Content-Type", "")
            print(f"[proxy] OK {len(audio)} bytes ct={ct[:50]}")
            # If response is JSON with base64 audio field, decode it
            if "json" in ct:
                resp_json = json.loads(audio.decode("utf-8"))
                b64 = resp_json.get("audio") or resp_json.get("Audio") or resp_json.get("data") or resp_json.get("Data") or ""
                if b64:
                    return base64.b64decode(b64)
                raise RuntimeError("No audio field in JSON response (keys: " + str(list(resp_json.keys())[:5]) + ")")
            return audio
    except URLError as e:
        detail = str(e)
        if hasattr(e, 'read'):
            try: detail += " | body: " + e.read().decode("utf-8", errors="replace")[:300]
            except: pass
        print(f"[proxy] FAIL {method} {url}: {detail}")
        raise RuntimeError(f"Proxy request failed: {detail}")


class TTSHandler(BaseHTTPRequestHandler):
    """HTTP request handler for KigerVox TTS server."""

    def _send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_audio(self, status: int, data: bytes, cache_status: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", CONTENT_TYPE)
        self.send_header("X-Cache", cache_status)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        if self.path not in ("/api/tts", "/api/proxy-tts"):
            return self._send_json(404, {"error": "Not found"})

        content_len = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_len)
        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            # WeChat Mini Program may send data in system encoding (e.g. GBK)
            try:
                body = json.loads(raw.decode("gbk", errors="replace"))
            except Exception:
                return self._send_json(400, {"error": "Invalid JSON"})

        # ─── Proxy TTS (no server cache) ───
        if self.path == "/api/proxy-tts":
            url = body.get("url", "")
            if not url:
                return self._send_json(400, {"error": "Missing url"})
            print(f"[proxy] {url[:60]}")
            try:
                audio = proxy_custom_tts(body)
            except RuntimeError as e:
                print(f"[proxy error] {e}")
                return self._send_json(500, {"error": str(e)})
            self._send_audio(200, audio, "PROXY")
            return

        # ─── Standard TTS (with server cache) ───
        text = body.get("text", "")
        if not text:
            return self._send_json(400, {"error": "Missing text"})

        v = str(body.get("voice", "101026"))
        s = float(body.get("speed", 0))
        h = cache_hash(text, v, s)
        cp = cache_path(h)

        if cp.exists():
            print(f"[cache] HIT  {h}  {text[:30]}")
            return self._send_audio(200, cp.read_bytes(), "HIT")

        print(f"[cache] MISS {h}  {text[:30]}")

        try:
            audio = call_tencent_tts(text, v, s)
        except RuntimeError as e:
            print(f"[error] {e}")
            return self._send_json(500, {"error": str(e)})

        cp.write_bytes(audio)
        evict_if_needed()

        size_kb = len(audio) / 1024
        print(f"[cache] STORED {h} ({size_kb:.1f} KB)")
        self._send_audio(200, audio, "MISS")

    def do_GET(self) -> None:
        if self.path == "/api/stats":
            files = list(CACHE_DIR.glob(f"*{CACHE_EXT}"))
            total_size = sum(f.stat().st_size for f in files)
            return self._send_json(200, {
                "cachedFiles": len(files),
                "totalSize": total_size,
                "maxSize": MAX_CACHE_SIZE,
            })
        return self._send_json(404, {"error": "Not found"})

    def log_message(self, format, *args):
        """Suppress default HTTP request logging."""
        pass


if __name__ == "__main__":
    httpd = HTTPServer(("0.0.0.0", PORT), TTSHandler)
    print(f"KigerVox TTS Server running on port {PORT}")
    print(f"Cache dir: {CACHE_DIR}")
    print(f"Max cache: {MAX_CACHE_SIZE / (1024**3):.0f} GB")
    print(f"Audio format: {CACHE_EXT} ({CONTENT_TYPE})")
    if SECRET_ID == "your-secret-id-here":
        print("WARNING: Please configure SECRET_ID and SECRET_KEY in server.py")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        httpd.server_close()
