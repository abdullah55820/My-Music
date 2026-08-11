export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  // 1. Try Cobalt API
  try {
    const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isAudioOnly: true,
        filenamePattern: "basic"
      })
    });

    if (cobaltRes.ok) {
      const data = await cobaltRes.json();
      if (data.url) {
        return res.status(200).json({ success: true, url: data.url });
      }
    }
  } catch (e) {
    console.error("Cobalt Error:", e);
  }

  // 2. Fallback Piped / Invidious instances
  const endpoints = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
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

      if (data.audioStreams && data.audioStreams.length > 0) {
        const stream = data.audioStreams.find(s => s.url) || data.audioStreams[0];
        audioUrl = stream.url;
      } else if (data.adaptiveFormats) {
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

  // 3. Final Direct Fallback Stream Proxy
  return res.status(200).json({
    success: true,
    url: `https://invidious.nerdvpn.de/latest/stream?id=${videoId}`
  });
}
