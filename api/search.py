from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import logging
import yt_dlp

try:
    from ytmusicapi import YTMusic
except Exception:
    YTMusic = None

LOG = logging.getLogger("soundflow-search")
logging.basicConfig(level=logging.INFO)

MAX_QUERY_LENGTH = 200
MAX_PAGE = 20
RESULTS_PER_PAGE = 20

_YTMUSIC = None
_YTMUSIC_DISABLED = False


def json_response(handler, status, payload):
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


def clean_text(value, fallback=""):
    if value is None:
        return fallback
    return str(value).strip()


def normalize_entry(entry):
    if not isinstance(entry, dict):
        return None

    video_id = clean_text(entry.get("id") or entry.get("url"))
    if video_id.startswith("https://www.youtube.com/watch?v="):
        video_id = video_id.split("v=", 1)[1].split("&", 1)[0]
    elif video_id.startswith("https://youtu.be/"):
        video_id = video_id.rsplit("/", 1)[-1].split("?", 1)[0]

    # YouTube video IDs are exactly 11 URL-safe characters.
    if len(video_id) != 11 or not all(
        c.isascii() and (c.isalnum() or c in "_-") for c in video_id
    ):
        return None

    title = clean_text(entry.get("title"), "Untitled")
    author = clean_text(
        entry.get("channel") or entry.get("uploader") or entry.get("creator"),
        "YouTube"
    )

    duration = entry.get("duration")
    try:
        duration = max(0, int(float(duration))) if duration is not None else 0
    except (TypeError, ValueError, OverflowError):
        duration = 0

    timestamp = entry.get("release_timestamp") or entry.get("timestamp")
    try:
        published = int(timestamp) if timestamp is not None else None
    except (TypeError, ValueError, OverflowError):
        published = None

    result = {
        "type": "video",
        "videoId": video_id,
        "title": title,
        "author": author,
        "lengthSeconds": duration,
    }
    if published is not None:
        result["published"] = published

    # Preserve normal YouTube artwork as a fallback.
    thumbnails = entry.get("thumbnails") or []
    if thumbnails:
        result["videoThumbnails"] = [
            {"quality": "maxres" if i == len(thumbnails) - 1 else "high", "url": t.get("url")}
            for i, t in enumerate(thumbnails) if isinstance(t, dict) and t.get("url")
        ]

    return result


def search_youtube(query, page):
    start = (page - 1) * RESULTS_PER_PAGE + 1
    search_term = "ytsearch{}:{}".format(RESULTS_PER_PAGE, query)

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "ignoreerrors": True,
        "noplaylist": False,
        "playliststart": start,
        "playlistend": start + RESULTS_PER_PAGE - 1,
        "socket_timeout": 15,
        "retries": 1,
        "extractor_retries": 1,
        "cachedir": False,
        "logger": LOG,
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(search_term, download=False)

    if not info:
        return []

    entries = info.get("entries") if isinstance(info, dict) else None
    if entries is None:
        entries = [info]

    results = []
    for entry in entries:
        normalized = normalize_entry(entry)
        if normalized:
            results.append(normalized)

    # Add YouTube Music album artwork when its song result has the same video ID.
    # If YT Music is temporarily unavailable, keep the regular yt-dlp results.
    add_youtube_music_artwork(query, results, page)
    return results


def add_youtube_music_artwork(query, results, page):
    global _YTMUSIC, _YTMUSIC_DISABLED
    if not results or page != 1 or YTMusic is None or _YTMUSIC_DISABLED:
        return

    try:
        if _YTMUSIC is None:
            _YTMUSIC = YTMusic()

        songs = _YTMUSIC.search(query, filter="songs", limit=RESULTS_PER_PAGE)
        artwork_by_id = {}
        for song in songs or []:
            if not isinstance(song, dict):
                continue
            video_id = clean_text(song.get("videoId"))
            thumbs = song.get("thumbnails") or []
            urls = [t.get("url") for t in thumbs if isinstance(t, dict) and t.get("url")]
            if video_id and urls:
                artwork_by_id[video_id] = [
                    {"quality": "high", "url": urls[0]},
                    {"quality": "maxres", "url": urls[-1]},
                ]

        for result in results:
            music_art = artwork_by_id.get(result.get("videoId"))
            if music_art:
                result["videoThumbnails"] = music_art
                result["artworkSource"] = "youtube-music"
    except Exception:
        LOG.warning("YouTube Music artwork lookup failed; using YouTube thumbnails", exc_info=True)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        query = clean_text((params.get("q") or [""])[0])
        raw_page = clean_text((params.get("page") or ["1"])[0], "1")

        if not query:
            json_response(self, 400, {"error": "Missing search query. Use ?q=Song+name"})
            return

        if len(query) > MAX_QUERY_LENGTH:
            json_response(self, 400, {"error": "Search query is too long."})
            return

        try:
            page = int(raw_page)
        except (TypeError, ValueError):
            page = 1

        page = max(1, min(page, MAX_PAGE))

        try:
            results = search_youtube(query, page)
            json_response(self, 200, results)
        except Exception as exc:
            # Keep the response useful while logging the full traceback in Vercel.
            LOG.exception("SoundFlow YouTube search failed")
            json_response(self, 502, {
                "error": "YouTube search failed.",
                "detail": str(exc)[:500]
            })

    def log_message(self, fmt, *args):
        LOG.info("%s - %s", self.address_string(), fmt % args)
