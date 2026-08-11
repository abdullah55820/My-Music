export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const playlistId = req.query.id || "PLbvY05KVYwoo";

  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    const response = await fetch(rssUrl);
    
    if (response.ok) {
      const xmlText = await response.text();
      const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
      const entries = xmlText.match(entryRegex) || [];

      const videos = entries.map(entry => {
        const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
        const titleMatch = entry.match(/<title>(.*?)<\/title>/);
        const nameMatch = entry.match(/<name>(.*?)<\/name>/);

        const videoId = videoIdMatch ? videoIdMatch[1] : "";
        return {
          videoId: videoId,
          title: titleMatch ? titleMatch[1].replace("<![CDATA[", "").replace("]]>", "") : "Unknown Title",
          artist: nameMatch ? nameMatch[1] : "YouTube Artist",
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
      }).filter(v => v.videoId !== "");

      if (videos.length > 0) {
        return res.status(200).json({ success: true, videos });
      }
    }
  } catch (e) {
    console.error("RSS Fetch Error:", e);
  }

  return res.status(500).json({ success: false, error: "Unable to load playlist" });
}
