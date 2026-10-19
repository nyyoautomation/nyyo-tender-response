/** Minimal BM25 for in-browser RAG over JSON chunks. No API keys. */
(function (global) {
  const STOP = new Set([
    "a","an","the","is","are","was","were","be","been","being","do","does","did",
    "how","what","when","where","why","which","who","whom","your","you","my","our",
    "i","me","we","they","them","it","its","of","in","on","at","to","for","from",
    "with","by","about","into","over","after","before","and","or","but","if","than",
    "then","so","as","this","that","these","those","can","could","would","should",
    "will","just","only","also","very","more","most","any","all","each","every",
  ]);

  function stem(tok) {
    if (tok.length <= 3) return tok;
    if (tok.endsWith("ies") && tok.length > 4) return tok.slice(0, -3) + "y";
    if (tok.endsWith("ing") && tok.length > 5) return tok.slice(0, -3);
    if (tok.endsWith("ers") && tok.length > 5) return tok.slice(0, -1);
    if (tok.endsWith("ies")) return tok.slice(0, -3) + "y";
    if (tok.endsWith("es") && tok.length > 4) {
      const base = tok.slice(0, -2);
      if (base.endsWith("s") || base.endsWith("sh") || base.endsWith("ch") || base.endsWith("x")) return base;
      // hours -> hour, takes kept via "es" removal carefully
      if (tok.endsWith("ses") || tok.endsWith("zes")) return tok.slice(0, -2);
      return base;
    }
    if (tok.endsWith("s") && !tok.endsWith("ss") && tok.length > 3) return tok.slice(0, -1);
    return tok;
  }


  function fold(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function tokenize(text) {
    return fold(text)
      .replace(/[^a-z0-9\s-]/gi, " ")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map(stem);
  }

  function contentTokens(text) {
    return tokenize(text).filter((t) => !STOP.has(t) && t.length > 1);
  }

  /** Expand query with domain synonyms so chips hit the right doc. */
  function expandQuery(query) {
    const q = fold(query);
    const extra = [];
    if (/heat|recovery|ahu|hvac|plant/.test(q)) extra.push("hvac", "heat", "recovery", "ahu", "riverside");
    if (/glaz|facade|envelope|uw/.test(q)) extra.push("envelope", "glazing", "facade", "oakwood", "mullion");
    if (/class\s*p1|sports\s*floor|finish/.test(q)) extra.push("sports", "floor", "class", "harborview", "p1");
    if (/project\s*manager|pm\b|samira|team|cv/.test(q)) extra.push("project", "manager", "samira", "haddad", "cv");
    if (/weather|programme|program|gantt|closure|week/.test(q)) extra.push("programme", "weather", "weeks", "closure", "contingency");
    if (/iso|quality|9001/.test(q)) extra.push("iso", "quality", "certificate", "9001");
    if (/crane|temporary|lift|roof/.test(q)) extra.push("crane", "temporary", "works", "lift", "roof");
    if (/waste|divert|environment/.test(q)) extra.push("waste", "diversion", "landfill", "environment");
    if (/insur|liability|pi\b/.test(q)) extra.push("insurance", "liability", "professional");
    return query + " " + extra.join(" ");
  }

  function buildIndex(docs) {
    const N = docs.length;
    const df = Object.create(null);
    const docsTokens = docs.map((d) => {
      const titleToks = contentTokens(d.title);
      const bodyToks = contentTokens(d.text);
      const tokens = titleToks.concat(titleToks).concat(titleToks).concat(bodyToks); // title x3 boost
      const tf = Object.create(null);
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
      for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
      return {
        id: d.id,
        title: d.title,
        source: d.source,
        text: d.text,
        tf,
        len: Math.max(bodyToks.length, 1),
        titleSet: new Set(titleToks),
      };
    });
    const avgdl = docsTokens.reduce((s, d) => s + d.len, 0) / Math.max(N, 1);
    return { docs: docsTokens, df, N, avgdl, k1: 1.5, b: 0.75 };
  }

  function score(index, query) {
    const qTokens = contentTokens(expandQuery(query));
    if (!qTokens.length) return [];
    const { docs, df, N, avgdl, k1, b } = index;
    const results = [];
    for (const doc of docs) {
      let s = 0;
      for (const t of qTokens) {
        const f = doc.tf[t] || 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5));
        const denom = f + k1 * (1 - b + b * (doc.len / avgdl));
        s += idf * ((f * (k1 + 1)) / denom);
        if (doc.titleSet.has(t)) s += idf * 0.85;
      }
      if (s > 0) results.push({ ...doc, score: s });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function splitSentences(text) {
    // Keep Q/A pairs separable; treat ? ! . as boundaries
    const parts = String(text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  function isQuestionSentence(sent) {
    const t = sent.trim();
    if (/\?\s*$/.test(t)) return true;
    return /^(how|what|when|where|why|which|who|can|do|does|is|are|will)\b/i.test(t);
  }

  function sentenceScore(sent, qSet) {
    const toks = contentTokens(sent);
    let overlap = 0;
    for (const t of toks) if (qSet.has(t)) overlap++;
    // Prefer declarative answer-like sentences
    let bonus = 0;
    if (/\b(takes?|is|are|include|accept|available|monday|within|eur|percent|hours?)\b/i.test(sent)) bonus += 0.5;
    if (isQuestionSentence(sent)) bonus -= 3;
    // Prefer denser overlap relative to length
    const dens = toks.length ? overlap / toks.length : 0;
    return overlap + bonus + dens;
  }

  function answer(index, query, topK) {
    topK = topK || 3;
    const hits = score(index, query).slice(0, topK);
    if (!hits.length) {
      return {
        text: "I couldn't find that in the sample docs. Try asking about shipping, returns, warranty, pricing, support hours, or privacy.",
        citations: [],
      };
    }
    const best = hits[0];
    const qSet = new Set(contentTokens(expandQuery(query)));
    const sentences = splitSentences(best.text);
    const ranked = sentences
      .map((sent) => ({ sent, score: sentenceScore(sent, qSet) }))
      .sort((a, b) => b.score - a.score);

    // Prefer a single direct declarative answer sentence
    let candidates = ranked.filter((r) => r.score > 0 && !isQuestionSentence(r.sent));
    if (!candidates.length) {
      candidates = ranked.filter((r) => !isQuestionSentence(r.sent));
    }
    if (!candidates.length) {
      candidates = ranked.slice(0, 1);
    }
    // One direct answer sentence (citations carry the rest of the context)
    let picked = candidates.slice(0, 1);
    if (picked[0] && picked[0].score < 0.5) {
      const firstDecl = sentences.find((s) => !isQuestionSentence(s));
      if (firstDecl) picked = [{ sent: firstDecl, score: 1 }];
    }
    const body = picked.map((r) => r.sent.trim()).join(" ");
    return {
      text: body,
      citations: hits.map((h) => ({
        id: h.id,
        title: h.title,
        source: h.source,
        score: Math.round(h.score * 100) / 100,
        snippet: h.text.slice(0, 160) + (h.text.length > 160 ? "…" : ""),
      })),
    };
  }

  global.NyyoBM25 = { buildIndex, score, answer, tokenize, contentTokens };
})(typeof window !== "undefined" ? window : globalThis);
