module.exports = async function handler(req, res) {
  const segments = [].concat(req.query.path || []);
  const qs = req.url.split("?")[1] || "";

  try {
    const upstream = await fetch(
      `https://results.raceroster.com/v2/api/${segments.join("/")}${qs ? "?" + qs : ""}`,
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } }
    );
    res.status(upstream.status).setHeader("Content-Type", "application/json");
    res.send(await upstream.text());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
