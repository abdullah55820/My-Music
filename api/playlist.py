from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import logging
import re
import yt_dlp

LOG = logging.getLogger("soundflow-playlist")
logging.basicConfig(level=logging.INFO)
PLAYLIST_ID = "PLbvY05KVYwoo"
MAX_ITEMS = 500


def respond(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store, max-age=0")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def normalize(entry):
    if not isinstance(entry, dict):
        return None
    video_id = str(entry.get("id") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return None
    duration = entry.get("duration")
    try:
        duration = max(0, int(float(duration))) if duration is not None else 0
    except (TypeError, ValueError, OverflowError):
        duration = 0
    return {
        "type": "video",
        "videoId": video_id,
        "title": str(entry.get("title") or "Untitled").strip(),
        "author": str(entry.get("channel") or entry.get("uploader") or "YouTube").strip(),
        "lengthSeconds": duration,
    }


def get_playlist(list_id):
    url = "https://www.youtube.com/playlist?list=" + list_id
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "ignoreerrors": True,
        "noplaylist": False,
        "playlistend": MAX_ITEMS,
        "socket_timeout": 20,
        "retries": 1,
        "extractor_retries": 1,
        "cachedir": False,
        "logger": LOG,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
    entries = info.get("entries", []) if isinstance(info, dict) else []
    results, seen = [], set()
    for entry in entries or []:
        song = normalize(entry)
        if song and song["videoId"] not in seen:
            seen.add(song["videoId"])
            results.append(song)
    return results


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        respond(self, 200, {"ok": True})

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        list_id = (params.get("list") or [PLAYLIST_ID])[0].strip()
        if list_id != PLAYLIST_ID:
            respond(self, 400, {"error": "Unsupported playlist."})
            return
        try:
            songs = get_playlist(list_id)
            if not songs:
                respond(self, 502, {"error": "No public playlist videos could be read."})
                return
            respond(self, 200, songs)
        except Exception as exc:
            LOG.exception("SoundFlow playlist extraction failed")
            respond(self, 502, {"error": "YouTube playlist loading failed.", "detail": str(exc)[:500]})

    def log_message(self, fmt, *args):
        LOG.info("%s - %s", self.address_string(), fmt % args)
