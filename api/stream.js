export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

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
      if (data.status === "redirect" || data.status === "stream") {
        return res.status(200).json({ success: true, url: data.url });
      }
    }
  } catch (e) {
    console.error("Cobalt Error:", e);
  }

  // Fallback to Piped API
  const pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.privacy.com.de",
    "https://pipedapi.drgns.space"
  ];

  for (let instance of pipedInstances) {
    try {
      const response = await fetch(`${instance}/streams/${videoId}`);
      if (!response.ok) continue;

      const data = await response.json();
      if (data.audioStreams && data.audioStreams.length > 0) {
        const audio = data.audioStreams.find(s => s.mimeType && s.mimeType.includes("audio/mp4")) || data.audioStreams[0];
        if (audio && audio.url) {
          return res.status(200).json({ success: true, url: audio.url });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  return res.status(500).json({ success: false, error: "Audio stream failed" });
}
