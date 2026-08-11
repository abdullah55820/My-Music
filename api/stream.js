export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  const instances = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://pipedapi.mha.fi"
  ];

  for (let instance of instances) {
    try {
      let endpoint = instance.includes("piped")
        ? `${instance}/streams/${videoId}`
        : `${instance}/api/v1/videos/${videoId}`;

      const response = await fetch(endpoint);
      if (!response.ok) continue;

      const data = await response.json();
      let audioUrl = "";

      if (data.audioStreams) {
        const best = data.audioStreams.find(s => s.codec && s.codec.includes('mp4a')) || data.audioStreams[0];
        audioUrl = best.url;
      } else if (data.adaptiveFormats) {
        const best = data.adaptiveFormats.find(f => f.type && f.type.includes("audio/mp4")) || data.adaptiveFormats.find(f => f.type && f.type.includes("audio/"));
        audioUrl = best ? best.url : "";
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
