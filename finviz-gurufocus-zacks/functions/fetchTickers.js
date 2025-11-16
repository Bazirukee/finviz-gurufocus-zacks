exports.handler = async function (event, context) {
  try {
    const inputUrl = event.queryStringParameters.url;

    if (!inputUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing ?url= parameter" })
      };
    }

    const fetch = (await import("node-fetch")).default;

    // Fetch Finviz HTML
    const res = await fetch(inputUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const html = await res.text();

    // Extract tickers
    const regexes = [
      /(?:ticker|quote)\.ashx\?t=([A-Z]{1,6})(?:[&#"])?/g,
      /\bdata-ticker=\"([A-Z]{1,6})\"/g
    ];

    let matches = [];
    regexes.forEach(r => {
      for (const m of html.matchAll(r)) {
        if (m[1]) matches.push(m[1]);
      }
    });

    const uniqueTickers = Array.from(new Set(matches)).filter(t =>
      /^[A-Z]{1,6}$/.test(t)
    );

    const results = [];

    // Helper: fetch GuruFocus data
    async function getGuruFocusData(ticker) {
      const url = `https://www.gurufocus.com/dcf-calculator?ticker=${ticker}`;
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const html = await res.text();

        // Predictability
        const predMatch = html.match(/aria-valuenow="([0-9.]+)"/);
        const predictability = predMatch ? parseFloat(predMatch[1]) : NaN;

        // Fair value (iv_dcEarning)
        const ivMatch = html.match(/isin:".*?",iv_dcEarning:([0-9.]+),/);
        const iv_dcEarning = ivMatch ? parseFloat(ivMatch[1]) : NaN;

        // Price
        const priceMatch = html.match(/pretax_margain:[^,]+,price:([0-9.]+),/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : NaN;

        // Margin of Safety
        const marginOfSafety = (iv_dcEarning && price) ? ((iv_dcEarning - price)/iv_dcEarning)*100 : NaN;

        return {
          predictability,
          iv_dcEarning,
          price,
          marginOfSafety: marginOfSafety ? Number(marginOfSafety.toFixed(2)) : NaN
        };

      } catch (err) {
        console.error(`GuruFocus fetch failed for ${ticker}:`, err);
        return null;
      }
    }

    // Fetch Zacks rank for each ticker and filter
    for (const t of uniqueTickers) {
      const zacksUrl = `https://www.zacks.com/defer/premium_research_v2.php?premium_string=0&ticker_string=${t}&logged_string=0`;

      try {
        const zRes = await fetch(zacksUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const zHtml = await zRes.text();

        const match = zHtml.match(/<span[^>]*class="[^"]*rank_chip[^"]*"[^>]*>(\d)<\/span>/);
        const rankNum = match ? Number(match[1]) : null;

        if (rankNum === 1 || rankNum === 2) {
          // Fetch GuruFocus data
          const gfData = await getGuruFocusData(t);

          if (!gfData) continue;
          if (isNaN(gfData.predictability) || isNaN(gfData.marginOfSafety)) continue;
          if (gfData.predictability <= 1) continue;
          if (gfData.marginOfSafety < 25) continue;

          results.push({
            ticker: t,
            rank: rankNum,
            ...gfData
          });
        }

      } catch (err) {
        // ignore individual errors
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        filtered: results,
        count: results.length
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
