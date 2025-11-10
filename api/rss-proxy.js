// api/rss-proxy.js
export default async function handler(req, res) {
  // OPTIONS pro CORS preflight
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

  // helper: nastavíme CORS vždy před návratem
  const setCors = () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  };

  // helper: vytvoří jednoduché RSS XML z odpovědi rss2json
  const jsonToRssXml = (json) => {
    const channelTitle = (json.feed && json.feed.title) || json.title || "Feed";
    const items = (json.items || []).map((it) => {
      const title = it.title ? escapeXml(it.title) : "";
      const link = it.link ? escapeXml(it.link) : "";
      const description = it.description ? escapeXml(it.description) : "";
      const pubDate = it.pubDate ? escapeXml(it.pubDate) : "";
      return `<item><title>${title}</title><link>${link}</link><description><![CDATA[${it.description || ""}]]></description><pubDate>${pubDate}</pubDate></item>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(channelTitle)}</title>${items}</channel></rss>`;
  };

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
    // primární fetch s rozumnými hlavičkami (imitujeme běžný prohlížeč)
    const response = await fetch(feedUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "Cache-Control": "no-cache"
      },
      redirect: "follow",
    });

    // pokud upstream OK a vrací text (typicky XML), pošleme to rovnou klientovi
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();

      setCors();
      // cache na CDN/Vercel (s-maxage) - snížíme počet volání upstream
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      // pokud upstream poslal XML-like content, zachováme text/xml typ
      if (contentType.includes("xml") || contentType.includes("rss") || contentType.includes("html") || text.trim().startsWith("<")) {
        res.setHeader("Content-Type", "text/xml; charset=utf-8");
        return res.status(200).send(text);
      } else {
        // jinak vrátíme surový text s content-type text/plain
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(200).send(text);
      }
    }

    // pokud upstream vrátil chybu (403/404/429 apod.), zkusíme fallback přes rss2json
    // lognutí pro debugging
    console.warn("Primary fetch failed", feedUrl, response.status);

    // fallback: rss2json (vrací JSON)
    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
    const backupResp = await fetch(rss2jsonUrl, { method: "GET", redirect: "follow" });

    if (backupResp.ok) {
      const json = await backupResp.json();
      const xml = jsonToRssXml(json);

      setCors();
      res.setHeader("Content-Type", "text/xml; charset=utf-8");
      res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300"); // kratší cache pro fallback
      return res.status(200).send(xml);
    }

    // pokud backup taky selže, vrátíme původní status z upstream
    setCors();
    return res.status(response.status).json({
      error: "Upstream fetch failed and backup failed",
      upstreamStatus: response.status,
      backupStatus: backupResp ? backupResp.status : null,
    });
  } catch (err) {
    console.error("Proxy error:", err && err.message ? err.message : err);
    setCors();
    return res.status(500).json({ error: "Failed to fetch feed", details: String(err) });
  }
}
