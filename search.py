from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json
import re
import yt_dlp

MAX_QUERY = 160
MAX_PAGE = 5
PAGE_SIZE = 20


def clean_text(value, limit=300):
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        query = clean_text((params.get("q") or [""])[0], MAX_QUERY)
        try:
            page = int((params.get("page") or ["1"])[0])
        except (TypeError, ValueError):
            page = 1
        page = max(1, min(page, MAX_PAGE))

        if not query:
            return self._send(400, {"error": "Missing search query", "items": []})
        if len(query) < 2:
            return self._send(200, [])
        if re.search(r"[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]", query):
            return self._send(400, {"error": "Invalid query", "items": []})

        # yt-dlp searches YouTube directly; no Invidious instance or API key.
        # Ask for enough entries to reach the requested page, then return 20.
        count = page * PAGE_SIZE
        options = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": "in_playlist",
            "ignoreerrors": True,
            "socket_timeout": 12,
            "playlistend": count,
            "noplaylist": False,
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                result = ydl.extract_info(f"ytsearch{count}:{query}", download=False)
            entries = (result or {}).get("entries") or []
            start = (page - 1) * PAGE_SIZE
            output = []
            for item in entries[start:start + PAGE_SIZE]:
                if not item:
                    continue
                video_id = item.get("id")
                if not video_id:
                    url = item.get("url") or ""
                    match = re.search(r"(?:v=|youtu\\.be/)([A-Za-z0-9_-]{11})", url)
                    video_id = match.group(1) if match else None
                if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", str(video_id)):
                    continue
                timestamp = item.get("timestamp")
                if timestamp is None:
                    upload_date = item.get("upload_date")
                    if upload_date and len(str(upload_date)) == 8:
                        try:
                            from datetime import datetime
                            timestamp = int(datetime.strptime(str(upload_date), "%Y%m%d").timestamp())
                        except ValueError:
                            timestamp = None
                output.append({
                    "type": "video",
                    "videoId": video_id,
                    "title": clean_text(item.get("title"), 500) or "Untitled",
                    "author": clean_text(item.get("uploader") or item.get("channel") or item.get("channel_id"), 200) or "YouTube",
                    "lengthSeconds": int(item.get("duration") or 0),
                    "published": int(timestamp) if timestamp else None,
                    "videoThumbnails": [],
                })
            return self._send(200, output)
        except Exception as exc:
            # Do not expose internal paths or full exception details to browsers.
            print("yt-dlp search failed:", repr(exc))
            return self._send(502, {"error": "YouTube search is temporarily unavailable. Please try again."})

    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
