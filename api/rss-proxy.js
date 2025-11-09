export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  const feedUrl = req.query.url;
  if (!feedUrl) return res.status(400).json({ error: "Missing 'url' query parameter" });

  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CryptoNewsProxy/1.0)" },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream fetch failed: ${response.status}` });
    }
    const text = await response.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.status(200).send(text);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Failed to fetch feed", details: String(err) });
  }
}
