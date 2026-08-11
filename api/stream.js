export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  const proxyUrls = [
    `https://invidious.privacyredirect.com/api/v1/videos/${videoId}`,
    `https://inv.tux.pizza/api/v1/videos/${videoId}`,
    `https://vid.priv.au/api/v1/videos/${videoId}`,
    `https://invidious.perennialte.ch/api/v1/videos/${videoId}`
  ];

  for (let endpoint of proxyUrls) {
    try {
      const response = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!response.ok) continue;

      const data = await response.json();
      let audioUrl = "";

      if (data.adaptiveFormats) {
        const bestAudio = data.adaptiveFormats.find(f => f.type && f.type.includes("audio/mp4") && f.url);
        if (bestAudio) audioUrl = bestAudio.url;
      }

      if (!audioUrl && data.audioStreams) {
        const bestStream = data.audioStreams.find(s => s.url);
        if (bestStream) audioUrl = bestStream.url;
      }

      if (audioUrl) {
        return res.status(200).json({ success: true, url: audioUrl });
      }
    } catch (e) {
      console.error(e);
    }
  }

  return res.status(500).json({ success: false, error: "Audio fetch failed" });
}
