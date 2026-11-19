from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import logging
import re
import yt_dlp

LOG = logging.getLogger("soundflow-playlist")
logging.basicConfig(level=logging.INFO)

DEFAULT_PLAYLIST_ID = "PLbvY05KVYwoo"
MAX_ENTRIES = 1000


def send_json(handler, status, payload):
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


def clean(value, fallback=""):
    return str(value).strip() if value is not None else fallback


def normalize(entry):
    if not isinstance(entry, dict):
        return None

    video_id = clean(entry.get("id") or entry.get("url"))
    if video_id.startswith("https://www.youtube.com/watch?v="):
        video_id = video_id.split("v=", 1)[1].split("&", 1)[0]
    elif video_id.startswith("https://youtu.be/"):
        video_id = video_id.rsplit("/", 1)[-1].split("?", 1)[0]

    if len(video_id) != 11 or not all(
        c.isascii() and (c.isalnum() or c in "_-") for c in video_id
    ):
        return None

    title = clean(entry.get("title"), "Untitled")
    author = clean(
        entry.get("channel") or entry.get("uploader") or entry.get("creator"),
        "YouTube"
    )

    duration = entry.get("duration")
    try:
        duration = max(0, int(float(duration))) if duration is not None else 0
    except (TypeError, ValueError, OverflowError):
        duration = 0

    thumbnail = clean(entry.get("thumbnail"))
    if not thumbnail:
        thumbnail = "https://i.ytimg.com/vi/{}/hqdefault.jpg".format(video_id)

    return {
        "type": "video",
        "videoId": video_id,
        "title": title,
        "author": author,
        "lengthSeconds": duration,
        "thumbnail": thumbnail,
        "videoThumbnails": [{"url": thumbnail, "quality": "high"}],
    }


def fetch_playlist(playlist_id):
    url = "https://www.youtube.com/playlist?list=" + playlist_id
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "ignoreerrors": True,
        "noplaylist": False,
        "playlistend": MAX_ENTRIES,
        "socket_timeout": 20,
        "retries": 1,
        "extractor_retries": 1,
        "cachedir": False,
        "logger": LOG,
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)

    if not isinstance(info, dict):
        return []

    songs = []
    seen = set()
    for entry in info.get("entries") or []:
        song = normalize(entry)
        if song and song["videoId"] not in seen:
            songs.append(song)
            seen.add(song["videoId"])
    return songs


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True})

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        playlist_id = clean((params.get("list") or [DEFAULT_PLAYLIST_ID])[0])

        if not re.fullmatch(r"[A-Za-z0-9_-]{10,80}", playlist_id):
            send_json(self, 400, {"error": "Invalid YouTube playlist ID."})
            return

        try:
            songs = fetch_playlist(playlist_id)
            if not songs:
                send_json(self, 502, {
                    "error": "Playlist is empty, private, or could not be read."
                })
                return
            send_json(self, 200, songs)
        except Exception as exc:
            LOG.exception("SoundFlow playlist fetch failed")
            send_json(self, 502, {
                "error": "YouTube playlist fetch failed.",
                "detail": str(exc)[:500]
            })

    def log_message(self, fmt, *args):
        LOG.info("%s - %s", self.address_string(), fmt % args)
