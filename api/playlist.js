export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const playlistId = req.query.id || "PLbvY05KVYwoo";

  try {
    const response = await fetch(`https://api.cobalt.tools/api/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/playlist?list=${playlistId}`
      })
    });

    // Fallback using direct HTML scrape if API limits hit
    const ytRes = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`);
    const html = await ytRes.text();

    const videoIds = [];
    const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (!videoIds.includes(match[1])) {
        videoIds.push(match[1]);
      }
    }

    const titles = [];
    const titleRegex = /"title":{"runs":\[{"text":"(.*?)"}\]/g;
    let tMatch;
    while ((tMatch = titleRegex.exec(html)) !== null) {
      if (tMatch[1] && !tMatch[1].includes("Play all")) {
        titles.push(tMatch[1]);
      }
    }

    const videos = videoIds.map((id, index) => ({
      videoId: id,
      title: titles[index] || "YouTube Track",
      artist: "Music",
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    }));

    if (videos.length > 0) {
      return res.status(200).json({ success: true, videos });
    }
  } catch (e) {
    console.error(e);
  }

  return res.status(500).json({ success: false, error: "Failed to fetch full playlist" });
}
