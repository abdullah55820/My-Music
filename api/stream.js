export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  const streamEndpoints = [
    `https://yt.drgns.space/latest/stream?id=${videoId}`,
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.vicr.dev/streams/${videoId}`
  ];

  for (let url of streamEndpoints) {
    try {
      if (url.includes("drgns.space")) {
        return res.status(200).json({ success: true, url: url });
      }

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      if (data.audioStreams && data.audioStreams.length > 0) {
        const audio = data.audioStreams.find(s => s.mimeType && s.mimeType.includes("audio/mp4")) || data.audioStreams[0];
        return res.status(200).json({ success: true, url: audio.url });
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Final Direct Audio Proxy Fallback
  return res.status(200).json({ 
    success: true, 
    url: `https://invidious.as208631.net/latest/stream?id=${videoId}` 
  });
}
