export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  const endpoints = [
    `https://piped-api.garudalinux.org/streams/${videoId}`,
    `https://vid.priv.au/api/v1/videos/${videoId}`,
    `https://invidious.projectsegfau.lt/api/v1/videos/${videoId}`
  ];

  for (let url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!response.ok) continue;

      const data = await response.json();
      let audioUrl = "";

      // Check Piped format
      if (data.audioStreams && data.audioStreams.length > 0) {
        const stream = data.audioStreams.find(s => s.url) || data.audioStreams[0];
        audioUrl = stream.url;
      } 
      // Check Invidious format
      else if (data.adaptiveFormats) {
        const audio = data.adaptiveFormats.find(f => f.type && f.type.includes("audio/") && f.url);
        if (audio) audioUrl = audio.url;
      }

      if (audioUrl) {
        return res.status(200).json({ success: true, url: audioUrl });
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Fallback stream proxy endpoint
  return res.status(200).json({
    success: true,
    url: `https://invidious.nerdvpn.de/latest/stream?id=${videoId}`
  });
}
