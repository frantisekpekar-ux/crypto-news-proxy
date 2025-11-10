// api/rss-proxy.js

export default async function handler(req, res) {
  // --- CORS preflight (OPTIONS) ---
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  const feedUrl = req.query.url;
  if (!feedUrl) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  // helper funkce pro CORS
  const setCors = () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  // helper: escapování XML znaků
  const escapeXml = (s) => {
    return String(s || "").replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<": return "&lt;";
        case ">": return "&gt;";
        case "&": return "&amp;";
        case "'": return "&apos;";
        case '"': return "&quot;";
        default: return c;
      }
    });
  };

  try {
    // 🧠 1️⃣ Speciální režim pro Messari (převod JSON → RSS)
    if (feedUrl.includes("messari.io")) {
      console.log("Fetching Messari JSON feed...");
      const response = await fetch("https://data.messari.io/api/v1/news");

      if (!response.ok) {
        throw new Error(`Messari API error: ${response.status}`);
      }

      const json = await response.json();
      const items = (json.data || []).slice(0, 15);

      // Vytvoříme RSS z JSON dat
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Messari Research</title>
            ${items
              .map(
                (it) => `
              <item>
                <title>${escapeXml(it.title || "Untitled")}</title>
                <link>${escapeXml(it.url)}</link>
                <description><![CDATA[${it.content?.slice(0, 500) || ""}]]></description>
                <pubDate>${it.published_at}</pubDate>
              </item>`
              )
              .join("")}
          </channel>
        </rss>`;

      setCors();
      res.setHeader("Content-Type", "text/xml; charset=utf-8");
      return res.status(200).send(xml);
    }

    // 🧠 2️⃣ Běžné RSS feedy
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
      redirect: "follow",
    });

    // 🧩 fallback – pokud upstream selže
    if (!response.ok) {
      console.warn(`Primary fetch failed: ${feedUrl} (${response.status})`);

      // rss2json fallback
      const rss2json = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
      const backup = await fetch(rss2json);
      if (backup.ok) {
        const json = await backup.json();
        const items = json.items || [];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <title>${escapeXml(json.feed?.title || "Fallback Feed")}</title>
              ${items
                .map(
                  (it) => `
                <item>
                  <title>${escapeXml(it.title)}</title>
                  <link>${escapeXml(it.link)}</link>
                  <description><![CDATA[${it.description || ""}]]></description>
                  <pubDate>${escapeXml(it.pubDate || "")}</pubDate>
                </item>`
                )
                .join("")}
            </channel>
          </rss>`;
        setCors();
        res.setHeader("Content-Type", "text/xml; charset=utf-8");
        return res.status(200).send(xml);
      } else {
        throw new Error(`Backup fetch failed: ${backup.status}`);
      }
    }

    // 🧾 Pokud vše OK – vrať původní RSS
    const text = await response.text();
    setCors();
    res.setHeader("Content-Type", "text/xml; charset=utf-8");
    res.status(200).send(text);
  } catch (err) {
    console.error("Proxy error:", err.message);
    setCors();
    res.status(500).json({ error: "Failed to fetch feed", details: String(err) });
  }
}
