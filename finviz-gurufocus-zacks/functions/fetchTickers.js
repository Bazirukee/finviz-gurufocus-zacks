import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    const url = "https://elite.finviz.com/screener.ashx?v=111&f=cap_small,fa_debteq_u0.5,fa_div_pos,fa_estltgrowth_o5,fa_pb_low,fa_pe_u15&ft=4&o=-volume";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0" // Finviz blocks non-browser user agents
      }
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

    const uniqueTickers = Array.from(new Set(matches)).filter(t => /^[A-Z]{1,6}$/.test(t));

    return {
      statusCode: 200,
      body: JSON.stringify({ tickers: uniqueTickers })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unknown error" })
    };
  }
}
