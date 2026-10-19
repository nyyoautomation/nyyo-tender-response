/* Nyyo tender-response demo — browser-only assembly */
(function () {
  "use strict";

  const state = {
    extraction: null,
    knowledge: null,
    sections: null,
    kbIndex: null,
    covered: new Set(),
    packReady: false,
    form: null,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function icons() {
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error("Failed to load " + path);
    return r.json();
  }

  function setStep(n) {
    $$(".step").forEach((s) => s.classList.toggle("active", Number(s.dataset.step) === n));
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ---------- WOW pipeline ---------- */
  async function runPipeline() {
    const btn = $("#btnRun");
    if (btn) btn.disabled = true;
    setStep(1);
    const nodes = $$(".pipe-node");
    nodes.forEach((n) => n.classList.remove("on", "done"));
    $("#flyDocs").innerHTML = "";

    const files = ["Rules.pdf", "Admin.pdf", "Specs.pdf", "Prices.xlsx"];
    files.forEach((name, i) => {
      const d = document.createElement("div");
      d.className = "fly-doc";
      d.style.top = 52 + i * 8 + "%";
      d.style.left = 6 + i * 3 + "%";
      d.style.animationDelay = i * 0.18 + "s";
      d.textContent = name;
      $("#flyDocs").appendChild(d);
      requestAnimationFrame(() => d.classList.add("go"));
    });

    nodes[0].classList.add("on");
    await sleep(400);
    nodes[0].classList.add("done");
    nodes[1].classList.add("on");
    await sleep(700);
    nodes[1].classList.add("done");
    nodes[2].classList.add("on");
    renderExtraction();
    await lightCriteria();
    nodes[2].classList.add("done");
    nodes[3].classList.add("on");
    await animateRing(42);
    nodes[3].classList.add("done");
    $("#panelExtract").classList.remove("hidden");
    if (btn) btn.disabled = false;
    icons();
    $("#panelExtract").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function lightCriteria() {
    const cards = $$(".crit");
    for (let i = 0; i < cards.length; i++) {
      await sleep(180);
      cards[i].classList.add("lit");
    }
  }

  function animateRing(pct) {
    return new Promise((resolve) => {
      const ring = $("#coverRing");
      const label = $("#coverPct");
      const start = Number(getComputedStyle(ring).getPropertyValue("--p")) || 0;
      const t0 = performance.now();
      const dur = 900;
      function frame(t) {
        const k = Math.min(1, (t - t0) / dur);
        const v = Math.round(start + (pct - start) * k);
        ring.style.setProperty("--p", v);
        label.textContent = v + "%";
        if (k < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function renderExtraction() {
    const ex = state.extraction;
    $("#tenderTitle").innerHTML =
      `<strong>${escapeHtml(ex.meta.title)}</strong> · ${escapeHtml(ex.meta.buyer)} · ` +
      `<span class="mono">${escapeHtml(ex.meta.tender_id)}</span>`;

    const crit = $("#criteria");
    crit.innerHTML = ex.scoring
      .map(
        (c) => `<div class="crit" data-id="${c.id}">
        <div class="w">${c.weight}%</div>
        <div class="name">${escapeHtml(c.id)} · ${escapeHtml(c.name)}</div>
        <p class="desc">${escapeHtml(c.description)}</p>
      </div>`
      )
      .join("");

    const dl = $("#deadlines tbody");
    dl.innerHTML = ex.deadlines
      .map((d) => {
        const when = [d.date, d.time, d.tz].filter(Boolean).join(" ");
        const note = d.note ? ` <span class="pill">${escapeHtml(d.note)}</span>` : "";
        return `<tr><td>${escapeHtml(d.label)}</td><td class="mono">${escapeHtml(when)}${note}</td></tr>`;
      })
      .join("");

    const docs = $("#docs tbody");
    docs.innerHTML = ex.required_documents
      .map(
        (d) =>
          `<tr><td>${escapeHtml(d.name)}<div style="color:var(--muted);font-size:0.72rem">${escapeHtml(
            d.notes || ""
          )}</div></td><td>${
            d.mandatory ? '<span class="pill warn">Required</span>' : '<span class="pill">Optional</span>'
          }</td></tr>`
      )
      .join("");

    const reqs = $("#reqs");
    reqs.innerHTML = ex.requirements
      .map(
        (r) => `<div class="req-item">
        <span class="id">${escapeHtml(r.id)}</span>
        <div><strong>${escapeHtml(r.category)}</strong> — ${escapeHtml(r.text)}</div>
        <span class="src cite">${escapeHtml(r.source)} · p.${r.page}</span>
      </div>`
      )
      .join("");

    const alerts = $("#alerts");
    alerts.innerHTML = (ex.alerts || [])
      .map(
        (a) =>
          `<div class="pill ${a.level === "warn" ? "warn" : "ok"}" style="display:flex;margin:4px 0;padding:6px 10px">${escapeHtml(
            a.text
          )}</div>`
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- KB search ---------- */
  function initKb() {
    const chunks = state.knowledge.chunks.map((c) => ({
      id: c.id,
      title: c.title,
      source: c.source,
      text: c.text,
      page: c.page,
      tags: c.tags || [],
    }));
    state.kbIndex = window.NyyoBM25.buildIndex(chunks);
    state.kbDocs = chunks;

    const chips = ["heat recovery", "Class P1", "project manager", "weather contingency", "ISO 9001", "crane"];
    $("#kbChips").innerHTML = chips
      .map((c) => `<button type="button" class="chip" data-q="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
      .join("");
    $("#kbChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      $$(".chip").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      $("#kbQ").value = b.dataset.q;
      searchKb(b.dataset.q);
    });
    $("#btnKb").addEventListener("click", () => searchKb($("#kbQ").value));
    $("#kbQ").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchKb($("#kbQ").value);
      }
    });
    searchKb("heat recovery");
  }

  function searchKb(q) {
    setStep(2);
    const query = (q || "").trim();
    if (!query) {
      $("#kbHits").innerHTML = '<p style="color:var(--muted);font-size:0.84rem">Type a query or tap a chip.</p>';
      return;
    }
    const hits = window.NyyoBM25.score(state.kbIndex, query).slice(0, 5);
    if (!hits.length) {
      $("#kbHits").innerHTML = '<p style="color:var(--muted);font-size:0.84rem">No matches — try another term.</p>';
      return;
    }
    $("#kbHits").innerHTML = hits
      .map((h) => {
        const doc = state.kbDocs.find((d) => d.id === h.id) || h;
        state.covered.add(doc.id);
        return `<article class="hit">
          <h4>${escapeHtml(doc.title)}</h4>
          <p>${escapeHtml(doc.text.slice(0, 280))}${doc.text.length > 280 ? "…" : ""}</p>
          <span class="cite"><i data-lucide="link" style="width:12px;height:12px"></i> ${escapeHtml(
            doc.source
          )} · p.${doc.page}</span>
        </article>`;
      })
      .join("");
    icons();
    const pct = Math.min(92, 42 + state.covered.size * 4);
    animateRing(pct);
  }

  /* ---------- Generate pack ---------- */
  function readForm() {
    return {
      price: Number($("#price").value) || 0,
      weeks: Number($("#weeks").value) || 14,
      pm: $("#pm").value,
      variant: $("#variant").value,
      notes: $("#notes").value.trim(),
    };
  }

  function citeChip(id) {
    if (!id) return "";
    const doc = state.kbDocs.find((d) => d.id === id);
    if (!doc) return "";
    return ` <span class="cite">${escapeHtml(doc.source)} · p.${doc.page}</span>`;
  }

  async function generatePack() {
    setStep(3);
    state.form = readForm();
    setStep(4);
    const panel = $("#panelPack");
    panel.classList.remove("hidden");
    const out = $("#proposalOut");
    out.innerHTML = '<p class="cursor-blink" style="color:var(--muted);font-size:0.84rem">Drafting sections from criteria + knowledge base…</p>';
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    const scoring = state.extraction.scoring;
    const sections = state.sections;
    out.innerHTML = "";

    // Inject form-driven bullets into C3/C4/C5
    const formBits = {
      C3: [
        {
          text: `Named project manager for this bid: ${state.form.pm}.`,
          cite: state.form.pm.includes("Samira") ? "kb-cv-pm" : null,
        },
      ],
      C4: [
        {
          text: `Committed continuous hall closure: ${state.form.weeks} weeks (buyer maximum 14).`,
          cite: "kb-programme",
        },
      ],
      C5: [
        {
          text: `Submitted total price (USD): ${state.form.price.toLocaleString("en-US")}. Prices are bidder-entered — not model-calculated.`,
          cite: null,
        },
        {
          text:
            state.form.variant === "yes"
              ? "Heat-recovery technology variant selected — to be priced only on schedule tab V."
              : "Base offer only — no heat-recovery variant.",
          cite: null,
        },
      ],
    };

    for (const c of scoring) {
      const sec = sections[c.id];
      const el = document.createElement("div");
      el.className = "prop-sec";
      el.innerHTML = `<h3><span class="pill">${escapeHtml(c.id)} · ${c.weight}%</span> ${escapeHtml(
        sec.title
      )}</h3><ul></ul>`;
      out.appendChild(el);
      await sleep(220);
      el.classList.add("show");
      const ul = $("ul", el);
      const bullets = [...(sec.bullets || []), ...(formBits[c.id] || [])];
      if (c.id === "C4" && state.form.notes) {
        bullets.push({ text: `Bidder notes: ${state.form.notes}`, cite: null });
      }
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        const li = document.createElement("li");
        li.style.animationDelay = i * 0.08 + "s";
        li.innerHTML = escapeHtml(b.text) + citeChip(b.cite);
        ul.appendChild(li);
        if (b.cite) state.covered.add(b.cite);
        await sleep(120);
      }
    }

    buildMatrix();
    buildChecklist();
    await animateRing(Math.min(96, 55 + state.covered.size * 3));
    state.packReady = true;
    icons();
  }

  function mapReqToCite(req) {
    const q = req.category + " " + req.text;
    const hits = window.NyyoBM25.score(state.kbIndex, q).slice(0, 1);
    if (hits[0]) {
      const doc = state.kbDocs.find((d) => d.id === hits[0].id);
      return doc ? `${doc.source} · p.${doc.page}` : "—";
    }
    return "Form / manual";
  }

  function buildMatrix() {
    const tb = $("#matrix tbody");
    tb.innerHTML = state.extraction.requirements
      .map((r) => {
        const cite = mapReqToCite(r);
        const status =
          cite === "Form / manual"
            ? '<span class="pill warn">Needs review</span>'
            : '<span class="pill ok">Draft mapped</span>';
        return `<tr>
          <td class="mono">${escapeHtml(r.id)}</td>
          <td>${escapeHtml(r.text.slice(0, 120))}${r.text.length > 120 ? "…" : ""}</td>
          <td>${status}</td>
          <td class="cite">${escapeHtml(cite)}</td>
        </tr>`;
      })
      .join("");
  }

  function buildChecklist() {
    const tb = $("#checklist tbody");
    const auto = {
      D3: "Draft generated in this demo",
      D4: state.form ? `Price entered: $${state.form.price.toLocaleString("en-US")}` : "Enter price in form",
      D5: state.form ? `PM: ${state.form.pm}` : "Select PM",
      D10: state.form && state.form.variant === "yes" ? "Variant selected — complete tab V" : "Not selected",
    };
    tb.innerHTML = state.extraction.required_documents
      .map((d) => {
        const note = auto[d.id] || (d.mandatory ? "Attach from your files" : "Optional");
        const ok = ["D3", "D4", "D5"].includes(d.id);
        return `<tr><td>${escapeHtml(d.name)}</td><td>${
          ok ? '<span class="pill ok">' : '<span class="pill warn">'
        }${escapeHtml(note)}</span></td></tr>`;
      })
      .join("");
  }

  /* ---------- DOCX export ---------- */
  async function downloadDocx() {
    if (!state.packReady) await generatePack();
    const D = window.docx;
    if (!D) {
      alert("DOCX library still loading — try again in a second.");
      return;
    }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } =
      D;
    const form = state.form || readForm();
    const children = [
      new Paragraph({
        text: "REVIEW-READY TECHNICAL PROPOSAL (DRAFT)",
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "HUMAN REVIEW REQUIRED — fictional sample tender for demo. Bidder remains solely responsible for any real submission.",
            bold: true,
            color: "B45309",
          }),
        ],
      }),
      new Paragraph({
        text: `${state.extraction.meta.title} · ${state.extraction.meta.tender_id}`,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: `Price (USD): ${form.price.toLocaleString("en-US")} · Closure weeks: ${form.weeks} · PM: ${form.pm} · Variant: ${form.variant}`,
        spacing: { after: 300 },
      }),
    ];

    for (const c of state.extraction.scoring) {
      const sec = state.sections[c.id];
      children.push(
        new Paragraph({
          text: `${c.id} (${c.weight}%) — ${sec.title}`,
          heading: HeadingLevel.HEADING_1,
        })
      );
      const extras = [];
      if (c.id === "C3") extras.push(`Named project manager: ${form.pm}.`);
      if (c.id === "C4") {
        extras.push(`Committed continuous hall closure: ${form.weeks} weeks.`);
        if (form.notes) extras.push(`Bidder notes: ${form.notes}`);
      }
      if (c.id === "C5") {
        extras.push(`Submitted total price (USD): ${form.price.toLocaleString("en-US")}.`);
        extras.push(
          form.variant === "yes"
            ? "Heat-recovery variant selected (schedule tab V)."
            : "Base offer only — no variant."
        );
      }
      for (const b of [...sec.bullets, ...extras.map((t) => ({ text: t, cite: null }))]) {
        const cite =
          b.cite && state.kbDocs.find((d) => d.id === b.cite)
            ? ` [${state.kbDocs.find((d) => d.id === b.cite).source} p.${state.kbDocs.find((d) => d.id === b.cite).page}]`
            : "";
        children.push(
          new Paragraph({
            text: `• ${typeof b === "string" ? b : b.text}${cite}`,
            spacing: { after: 80 },
          })
        );
      }
    }

    children.push(new Paragraph({ text: "Compliance matrix", heading: HeadingLevel.HEADING_1 }));
    const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const headerRow = new TableRow({
      children: ["ID", "Requirement", "Citation"].map(
        (t) =>
          new TableCell({
            borders,
            width: { size: 2000, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
          })
      ),
    });
    const rows = state.extraction.requirements.map((r) => {
      const cite = mapReqToCite(r);
      return new TableRow({
        children: [r.id, r.text.slice(0, 160), cite].map(
          (t) =>
            new TableCell({
              borders,
              width: { size: 2000, type: WidthType.DXA },
              children: [new Paragraph(String(t))],
            })
        ),
      });
    });
    children.push(
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows: [headerRow, ...rows],
      })
    );

    children.push(new Paragraph({ text: "Document checklist", heading: HeadingLevel.HEADING_1 }));
    for (const d of state.extraction.required_documents) {
      children.push(
        new Paragraph({
          text: `☐ ${d.name}${d.mandatory ? " (required)" : " (optional)"} — ${d.notes || ""}`,
          spacing: { after: 60 },
        })
      );
    }

    children.push(
      new Paragraph({
        text: "Generated by Nyyo Automation tender-response demo · sample / fictional data · not legal advice.",
        spacing: { before: 400 },
      })
    );

    const doc = new Document({
      creator: "Nyyo Automation",
      title: "Tender response pack (draft)",
      sections: [{ children }],
    });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "NMW-2026-HALL-014_review_ready_draft.docx";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- PDF via print ---------- */
  function exportPdf() {
    if (!state.packReady) {
      alert("Generate the pack first.");
      return;
    }
    const root = $("#printRoot");
    root.classList.remove("hidden");
    root.innerHTML = `<div style="font-family:Inter,system-ui,sans-serif;padding:24px;color:#111;background:#fff">
      <h1>Review-ready technical proposal (DRAFT)</h1>
      <p style="color:#b45309;font-weight:700">HUMAN REVIEW REQUIRED — fictional sample.</p>
      <p>${escapeHtml(state.extraction.meta.title)} · ${escapeHtml(state.extraction.meta.tender_id)}</p>
      ${$("#proposalOut").innerHTML}
      <h2>Compliance matrix</h2>
      ${$("#matrix").outerHTML}
      <h2>Document checklist</h2>
      ${$("#checklist").outerHTML}
    </div>`;
    const prev = document.title;
    document.title = "NMW-2026-HALL-014_draft";
    window.print();
    document.title = prev;
    setTimeout(() => {
      root.classList.add("hidden");
      root.innerHTML = "";
    }, 500);
  }

  /* ---------- boot ---------- */
  async function main() {
    try {
      const [extraction, knowledge, sections] = await Promise.all([
        loadJSON("./data/extraction.json"),
        loadJSON("./data/knowledge.json"),
        loadJSON("./data/proposal_sections.json"),
      ]);
      state.extraction = extraction;
      state.knowledge = knowledge;
      state.sections = sections;
      initKb();
      icons();

      $("#btnRun").addEventListener("click", runPipeline);
      $("#btnRunSticky").addEventListener("click", () => {
        window.scrollTo({ top: $("#pipeline").offsetTop - 20, behavior: "smooth" });
        runPipeline();
      });
      $("#btnGenerate").addEventListener("click", generatePack);
      $("#btnDocx").addEventListener("click", downloadDocx);
      $("#btnPdf").addEventListener("click", exportPdf);

      // Auto-run wow once for first impression
      setTimeout(runPipeline, 600);
    } catch (err) {
      console.error(err);
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<p style="color:#ff6b8a;padding:12px">Demo failed to load data: ${escapeHtml(err.message)}</p>`
      );
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
