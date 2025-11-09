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
    // 🧠 Rozšířené hlavičky pro přísnější RSS zdroje (Messari, CryptoQuant, TheBlock)
    const response = await fetch(feedUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "Cache-Control": "no-cache",
      },
      redirect: "follow", // 🧭 sleduj přesměrování (např. TheBlock)
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream fetch failed: ${response.status}`,
        feed: feedUrl,
      });
    }

    const text = await response.text();

    // 🌍 Povolení CORS pro všechny
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // 🧾 Vrať čistý XML obsah
    res.status(200).send(text);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Failed to fetch feed", details: String(err) });
  }
}
