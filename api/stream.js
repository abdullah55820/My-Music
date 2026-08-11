export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = req.query.id;

  if (!videoId) return res.status(400).json({ error: "Missing video ID" });

  const streamApis = [
    `https://co.wuk.sh/api/json`,
    `https://cobalt.api.scipy.dedyn.io/api/json`
  ];

  for (let apiUrl of streamApis) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          isAudioOnly: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          return res.status(200).json({ success: true, url: data.url });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Backup Invidious working node
  try {
    const invRes = await fetch(`https://invidious.drgns.space/api/v1/videos/${videoId}`);
    if (invRes.ok) {
      const data = await invRes.json();
      if (data.adaptiveFormats) {
        const audio = data.adaptiveFormats.find(f => f.type && f.type.includes("audio/mp4")) || data.adaptiveFormats.find(f => f.type && f.type.includes("audio/"));
        if (audio && audio.url) {
          return res.status(200).json({ success: true, url: audio.url });
        }
      }
    }
  } catch(e) {}

  return res.status(500).json({ success: false, error: "Audio fetch failed" });
}
