export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const playlistId = req.query.id || "PLbvY05KVYwoo";

  // Invidious / Piped API Instances
  const instances = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://pipedapi.mha.fi"
  ];

  for (let instance of instances) {
    try {
      let endpoint = instance.includes("piped") 
        ? `${instance}/playlists/${playlistId}` 
        : `${instance}/api/v1/playlists/${playlistId}`;

      const response = await fetch(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) continue;

      const data = await response.json();
      let videos = [];

      if (data.relatedStreams) {
        videos = data.relatedStreams.map(v => ({
          videoId: v.url.includes("v=") ? v.url.split("v=")[1] : v.url.split("/").pop(),
          title: v.title,
          artist: v.uploaderName || "Unknown Artist",
          thumbnail: v.thumbnail
        }));
      } else if (data.videos) {
        videos = data.videos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          artist: v.author || "Unknown Artist",
          thumbnail: v.videoThumbnails ? v.videoThumbnails[0].url : `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
        }));
      }

      if (videos.length > 0) {
        return res.status(200).json({ success: true, videos });
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Backup Invidious API
  try {
    const backupRes = await fetch(`https://invidious.drgns.space/api/v1/playlists/${playlistId}`);
    if (backupRes.ok) {
      const backupData = await backupRes.json();
      if (backupData.videos && backupData.videos.length > 0) {
        const videos = backupData.videos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          artist: v.author || "Unknown Artist",
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
        }));
        return res.status(200).json({ success: true, videos });
      }
    }
  } catch (err) {
    console.error("Backup failed", err);
  }

  return res.status(500).json({ success: false, error: "Failed to fetch playlist" });
}
