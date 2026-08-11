export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const playlistId = req.query.id || "PLbvY05KVYwoo";

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

      const response = await fetch(endpoint);
      if (!response.ok) continue;

      const data = await response.json();
      let videos = [];

      if (data.relatedStreams) {
        videos = data.relatedStreams.map(v => ({
          videoId: v.url.includes("v=") ? v.url.split("v=")[1] : v.url.split("/").pop(),
          title: v.title,
          artist: v.uploaderName,
          thumbnail: v.thumbnail
        }));
      } else if (data.videos) {
        videos = data.videos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          artist: v.author,
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

  return res.status(500).json({ success: false, error: "Failed to fetch playlist" });
}
