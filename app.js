// Отрисовка вики. Данные лежат в data/ и собираются в window.WIKI
const { site: SITE, series: SERIES, chars: CHARS, groups: GROUPS, places: PLACES, glossary: GLOSSARY,
  quotes: QUOTES, mentions: MENTIONS, minorExtras: MINOR_EXTRAS } = WIKI;

const byId = Object.fromEntries(CHARS.map(c => [c.id, c]));
const groupName = Object.fromEntries(GROUPS.map(([g, t]) => [g, t]));
const subName = (g, sub) => ((GROUPS.find(x => x[0] === g) || [])[2] || []).find(x => x[0] === sub)?.[1] || "";
// Разделы персонажей: сначала главные герои, потом владения и роли внутри них
function castSections() {
  const out = [{ title: "Главный герой", list: CHARS.filter(c => c.main), level: 1 }, { title: "Почти главные", list: CHARS.filter(c => c.major), level: 1 }];
  GROUPS.forEach(([g, title, subs]) => {
    const inGroup = CHARS.filter(c => c.group === g);
    if (!inGroup.length) return;
    out.push({ title, list: [], level: 1, group: true });
    (subs || []).forEach(([sub, st]) => {
      const list = inGroup.filter(c => c.sub === sub);
      if (list.length) out.push({ title: st, parent: title, list, level: 2 });
    });
  });
  return out.filter(x => x.group || x.list.length);
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const imagesOf = c => c.images || [];
// Галерея персонажа: его картинки плюс арты глав, где он отмечен в chars
const galleryOf = c => [...imagesOf(c), ...sceneImagesOf(c.id)];
const imgUrl = src => `img/${src}`;
// Картинки главы: поле image (одна) или images (несколько). У картинки можно указать at — перед каким абзацем её ставить (0 — перед первым)
const chapterImages = ch => ch.images || (ch.image ? [ch.image] : []);
function sceneImagesOf(id) {
  return WIKI.series.flatMap((s, si) => s.chapters.flatMap((ch, ci) => chapterImages(ch)
    .filter(im => (im.chars || []).includes(id))
    .map(im => ({ ...im, from: `<a href="#s${si + 1}c${ci + 1}">Серия ${si + 1}, глава ${ci + 1}</a>` }))));
}
function chapterBody(ch, si, ci) {
  const parts = ch.body.split(/(?=<p[\s>])/);
  const figs = chapterImages(ch).map((im, i) => ({ at: im.at || 0, html: `<figure class="ch-figure">
      <button type="button" class="ib-open" data-lb="ch:${si}:${ci}" data-i="${i}" aria-label="Открыть изображение">
        <img src="${imgUrl(im.src)}" alt="${esc(im.caption || ch.title)}" loading="lazy">
      </button>
      ${im.caption ? `<figcaption>${im.caption}</figcaption>` : ""}
    </figure>` }));
  let n = -1;
  return parts.map(part => {
    if (/^\s*<p[\s>]/.test(part)) n++;
    return figs.filter(f => f.at === Math.max(n, 0) && (n >= 0 || f.at === 0) && !f.done && (f.done = true)).map(f => f.html).join("") + part;
  }).join("") + figs.filter(f => !f.done).map(f => f.html).join("");
}
const $ = id => document.getElementById(id);

// ---------- автоссылки на персонажей ----------

const MENTION_RE = Object.entries(MENTIONS).map(([id, src]) =>
  [id, new RegExp(`(?<![А-Яа-яЁё])(?:${src})(?![А-Яа-яЁё])`)]);

// Превращает первое упоминание каждого персонажа в абзаце в ссылку на его статью
function linkify(root, selfId) {
  root.querySelectorAll("p, li, dd, td, blockquote, figcaption, .ib-value, .ib-quote, .wquote").forEach(block => {
    const used = new Set([selfId]);
    block.querySelectorAll('a[href^="#"]').forEach(a => used.add(a.getAttribute("href").slice(1)));
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest("a, button, .nolink") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      let rest = node;
      for (;;) {
        let best = null;
        for (const [id, re] of MENTION_RE) {
          if (used.has(id)) continue;
          const m = re.exec(rest.data);
          if (m && (!best || m.index < best.index)) best = { id, index: m.index, text: m[0] };
        }
        if (!best) break;
        used.add(best.id);
        const tail = rest.splitText(best.index);
        rest = tail.splitText(best.text.length);
        const a = document.createElement("a");
        a.className = "mention";
        a.href = `#${best.id}`;
        a.title = byId[best.id].name;
        a.textContent = best.text;
        tail.replaceWith(a);
      }
    });
  });
}

// Абзац, состоящий только из пометки «за кадром», оформляется отдельной плашкой
function markBts(root) {
  root.querySelectorAll("p").forEach(p => {
    const b = p.querySelector(":scope > .bts");
    if (b && p.textContent.trim() === b.textContent.trim()) p.classList.add("bts-box");
  });
}

// ---------- общие куски разметки ----------

function thumb(c, cls = "") {
  // thumb — квадратное превью с лицом (делает tools/make_thumbs.py); если его нет, берётся первая картинка
  const src = c.thumb || (imagesOf(c)[0] || {}).src;
  return src
    ? `<img class="${cls}" src="${imgUrl(src)}" alt="${esc(c.name)}" loading="lazy">`
    : `<span class="mono ${cls}" aria-hidden="true">${esc(c.name[0])}</span>`;
}

function toc(items) {
  const li = (it, num) => `<li><a href="${it.href}"${it.scroll ? ` data-scroll="${it.scroll}"` : ""}><span class="tocnum">${num}</span> ${it.text}</a>${
    it.sub ? `<ul>${it.sub.map((s, j) => li(s, `${num}.${j + 1}`)).join("")}</ul>` : ""}</li>`;
  return `<nav class="toc" aria-label="Содержание"><div class="toc-title">Содержание</div><ul>${items.map((it, i) => li(it, i + 1)).join("")}</ul></nav>`;
}

function wikiTable(heads, rows) {
  return `<div class="table-wrap"><table class="wikitable"><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((v, i) => i ? `<td>${v}</td>` : `<th scope="row">${v}</th>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function ibRows(rows) {
  return rows.map(([k, v]) => `<div class="ib-row"><div class="ib-label">${k}</div><div class="ib-value">${v}</div></div>`).join("");
}

// ---------- главная ----------

function renderHome() {
  const chapters = SERIES.reduce((n, s) => n + s.chapters.length, 0);
  const items = [
    { href: "#about", text: "О сериале" },
    { href: "#plot", text: "Сюжет", sub: SERIES.map((s, si) => ({ href: `#s${si + 1}`, text: `Серия ${si + 1}. ${s.title}`,
      sub: s.chapters.map((ch, ci) => ({ href: `#s${si + 1}c${ci + 1}`, text: ch.title })) })) },
    { href: "#hooks", text: "Открытые сюжетные линии" },
    { href: "#cast", text: "Персонажи" },
    { href: "#places", text: "Места" },
    { href: "#glossary", text: "Словарь" },
    { href: "#quotes", text: "Цитаты" }
  ];
  const mains = CHARS.filter(c => c.main || c.major);

  $("home").innerHTML = `
    <header class="page-header">
      <h1 class="page-title">${SITE.title}</h1>
      <div class="page-sub">${SITE.subtitle}</div>
    </header>
    <div class="page-body">
      <div class="content">
        <p class="welcome">${SITE.welcome}</p>
        ${toc(items)}

        <h2 id="about">О сериале</h2>
        ${SITE.about}

        <h2 id="plot">Сюжет</h2>
        ${SERIES.map((s, si) => `
          <h3 id="s${si + 1}">Серия ${si + 1}. «${s.title}»</h3>
          <p class="hatnote">${s.logline}${s.video ? ` <a href="https://www.youtube.com/watch?v=${s.video}" target="_blank" rel="noopener">Смотреть серию на YouTube</a>` : ""}</p>
          ${s.summary || ""}
          <p class="series-more"><a href="#seria-${si + 1}">Подробнее: все ${s.chapters.length} глав серии ›</a></p>
          <ol class="chapter-list">${s.chapters.map((ch, ci) => `<li><a href="#s${si + 1}c${ci + 1}">${ch.title}</a></li>`).join("")}</ol>`).join("")}

        <h2 id="hooks">Открытые сюжетные линии</h2>
        <ul>${SITE.hooks.map(h => `<li>${h}</li>`).join("")}</ul>

        <h2 id="cast">Персонажи</h2>
        ${castSections().map(sec => sec.group ? `<h3>${sec.title}</h3>` :
          `${sec.level === 2 ? `<h4 class="cast-sub">${sec.title}</h4>` : `<h3>${sec.title}</h3>`}<div class="tiles">${sec.list.map(c => `
            <a class="tile" href="#${c.id}"><span class="tile-img">${thumb(c)}</span><span class="tile-name">${c.name}</span></a>`).join("")}</div>`).join("")}
        <p class="small">${MINOR_EXTRAS}</p>

        <h2 id="places">Места</h2>
        ${wikiTable(["Место", "Описание"], PLACES)}

        <h2 id="glossary">Словарь</h2>
        ${wikiTable(["Термин", "Значение"], GLOSSARY)}

        <h2 id="quotes">Цитаты</h2>
        ${QUOTES.map(([q, w]) => `<blockquote class="wquote">«${q}»<cite>${w}</cite></blockquote>`).join("")}
      </div>

      <aside class="rail">
        <div class="infobox">
          <div class="ib-title">${SITE.seriesName}</div>
          ${SITE.banner ? `<figure class="ib-figure"><img src="${imgUrl(SITE.banner)}" alt="Обложка сериала"></figure>` : ""}
          <div class="ib-header">Информация</div>
          ${ibRows([...SITE.facts, ["Серий", String(SERIES.length)], ["Глав", String(chapters)], ["Персонажей", String(CHARS.length)]])}
          <div class="ib-header">Заглавная песня</div>
          <div class="ib-quote">${SITE.opening}</div>
        </div>
        <section class="rail-module">
          <h2 class="rail-title">Главный и почти главные</h2>
          <ul class="rail-list">${mains.map(c => `<li><a href="#${c.id}">${thumb(c, "rail-thumb")}<span>${c.name}<small>${c.role}</small></span></a></li>`).join("")}</ul>
        </section>
      </aside>
    </div>`;

  markBts($("home"));
  linkify($("home").querySelector(".content"), null);
  linkify($("home").querySelector(".rail .infobox"), null);
}

// ---------- страница персонажа ----------

function infobox(c) {
  const imgs = imagesOf(c);
  const media = imgs.length ? `
    <div class="ib-media" data-char="${c.id}">
      ${imgs.length > 1 ? `<div class="ib-tabs" role="tablist">${imgs.map((im, i) =>
        `<button type="button" role="tab" class="ib-tab${i ? "" : " is-active"}" data-i="${i}" aria-selected="${!i}">${esc(im.tab || `Кадр ${i + 1}`)}</button>`).join("")}</div>` : ""}
      <figure class="ib-figure">
        <button type="button" class="ib-open" data-lb="${c.id}" data-i="0" aria-label="Открыть изображение">
          <img src="${imgUrl(imgs[0].src)}" alt="${esc(imgs[0].caption || c.name)}">
        </button>
        ${imgs[0].caption ? `<figcaption>${imgs[0].caption}</figcaption>` : ""}
      </figure>
    </div>` : "";
  return `
    <aside class="infobox infobox-float" aria-label="Карточка персонажа">
      <div class="ib-title">${c.name}</div>
      ${media}
      <div class="ib-header">Информация</div>
      ${ibRows(c.fields)}
      ${c.quote ? `<div class="ib-quote">${c.quote}</div>` : ""}
    </aside>`;
}

function renderChar(c) {
  const imgs = imagesOf(c);
  const gal = galleryOf(c);
  const sections = [
    c.bio && { id: "bio", title: "Биография", html: c.bio },
    c.story && { id: "story", title: "В сериале", html: c.story },
    c.facts.length && { id: "facts", title: "Интересные факты", html: `<ul>${c.facts.map(f => `<li>${f}</li>`).join("")}</ul>` },
    c.rels.length && { id: "rels", title: "Отношения", html: `<ul class="rels">${c.rels.map(([id, t]) =>
      `<li><a href="#${id}" class="rel-thumb">${thumb(byId[id])}</a><div><a href="#${id}"><b>${byId[id].name}</b></a> — ${t}</div></li>`).join("")}</ul>` },
    gal.length && { id: "gallery", title: "Галерея", html: `<div class="gallery">${gal.map((im, i) => `
      <figure class="gal-item">
        <button type="button" class="gal-thumb" data-lb="${c.id}" data-i="${i}" aria-label="Открыть изображение"><img src="${imgUrl(im.src)}" alt="${esc(im.caption || c.name)}" loading="lazy"></button>
        ${im.caption || im.from ? `<figcaption>${im.caption || ""}${im.from ? ` <span class="gal-from">${im.from}</span>` : ""}</figcaption>` : ""}
      </figure>`).join("")}</div>` }
  ].filter(Boolean);

  const cats = [
    `<a href="#cast">Персонажи</a>`,
    c.main && `<a href="#cast">Главный герой</a>`,
    c.major && `<a href="#cast">Почти главные</a>`,
    `<a href="#cast">${groupName[c.group]}</a>`,
    subName(c.group, c.sub) && `<a href="#cast">${subName(c.group, c.sub)}</a>`,
    !imgs.length && `<a href="#cast">Статьи без изображений</a>`
  ].filter(Boolean);

  $("charView").innerHTML = `
    <header class="page-header">
      <div class="crumbs"><a href="#cast">‹ Персонажи</a></div>
      <h1 class="page-title">${c.name}</h1>
    </header>
    <div class="page-body single">
      <div class="content">
        ${infobox(c)}
        <p class="lead"><b>${c.name}</b>${c.aka ? ` (также ${c.aka})` : ""} — ${c.role.charAt(0).toLowerCase() + c.role.slice(1)}.</p>
        ${sections.length > 1 ? toc(sections.map(s => ({ href: `#${c.id}`, scroll: s.id, text: s.title }))) : ""}
        ${sections.map(s => `<h2 id="${s.id}">${s.title}</h2>${s.html}`).join("")}
        ${navbox(c.id)}
        <div class="catlinks"><b>Категории:</b> ${cats.join(" · ")}</div>
      </div>
    </div>`;

  markBts($("charView"));
  linkify($("charView").querySelector(".content"), c.id);
}

// ---------- страница серии: все главы целиком ----------

function renderSeries(si) {
  const s = SERIES[si], n = si + 1;
  $("charView").innerHTML = `
    <header class="page-header">
      <div class="crumbs"><a href="#plot">‹ Сюжет</a></div>
      <h1 class="page-title">Серия ${n}. «${s.title}»</h1>
    </header>
    <div class="page-body single">
      <div class="content">
        <p class="hatnote">${s.logline}${s.video ? ` <a href="https://www.youtube.com/watch?v=${s.video}" target="_blank" rel="noopener">Смотреть серию на YouTube</a>` : ""}</p>
        ${toc(s.chapters.map((ch, ci) => ({ href: `#s${n}c${ci + 1}`, text: ch.title })))}
        ${s.chapters.map((ch, ci) => `
          <h2 id="s${n}c${ci + 1}">Глава ${ci + 1}. «${ch.title}»</h2>
          <p class="logline">${ch.logline}</p>
          ${chapterBody(ch, si, ci)}
          <blockquote class="wquote">${ch.quote}</blockquote>`).join("")}
        <div class="series-nav">
          ${si > 0 ? `<a href="#seria-${n - 1}">‹ Серия ${n - 1}. «${SERIES[si - 1].title}»</a>` : "<span></span>"}
          ${si < SERIES.length - 1 ? `<a href="#seria-${n + 1}">Серия ${n + 1}. «${SERIES[si + 1].title}» ›</a>` : ""}
        </div>
      </div>
    </div>`;
  markBts($("charView"));
  linkify($("charView").querySelector(".content"), null);
}

function navbox(currentId) {
  return `
    <nav class="navbox" aria-label="Все персонажи">
      <div class="nb-title">Персонажи сериала «${SITE.seriesName}»</div>
      ${castSections().map(sec => sec.group
        ? `<div class="nb-faction">${sec.title}</div>`
        : `<div class="nb-row${sec.parent ? " nb-sub" : ""}"><div class="nb-group">${sec.title}</div><div class="nb-list">${sec.list.map(c =>
          c.id === currentId ? `<b>${c.name}</b>` : `<a href="#${c.id}">${c.name}</a>`).join(`<span class="nb-sep"> • </span>`)}</div></div>`).join("")}
    </nav>`;
}

// ---------- шапка: меню и поиск ----------

function renderHeader() {
  $("wordmark").textContent = SITE.title;
  if (SITE.banner) $("community").style.setProperty("--banner", `url("${imgUrl(SITE.banner)}")`);
  $("ddPlot").innerHTML = SERIES.map((s, si) => `<a href="#s${si + 1}">Серия ${si + 1}. ${s.title}</a>`).join("") +
    `<a href="#hooks">Открытые сюжетные линии</a>`;
  $("ddCast").innerHTML = castSections().filter(sec => !sec.group).map(sec =>
    `<div class="dd-group">${sec.parent ? sec.parent.split(":")[0] + ": " : ""}${sec.title}</div>${sec.list.map(c => `<a href="#${c.id}">${c.name}</a>`).join("")}`).join("");
}

function initSearch() {
  const input = $("search"), box = $("searchResults");
  const update = () => {
    const q = input.value.trim().toLowerCase();
    const hits = q ? CHARS.filter(c => [c.name, c.aka, c.role].join(" ").toLowerCase().includes(q)).slice(0, 8) : [];
    box.innerHTML = hits.map(c => `<li><a href="#${c.id}">${thumb(c, "rail-thumb")}<span>${c.name}<small>${c.role}</small></span></a></li>`).join("") ||
      (q ? `<li class="none">Ничего не найдено</li>` : "");
    box.hidden = !q;
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { const a = box.querySelector("a"); if (a) { location.hash = a.getAttribute("href"); input.value = ""; update(); } }
    if (e.key === "Escape") { input.value = ""; update(); }
  });
  box.addEventListener("click", () => { input.value = ""; update(); });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) box.hidden = true; });
}

// ---------- просмотр картинок ----------

const lb = { list: [], i: 0 };

function openLightbox(charId, i) {
  if (charId.startsWith("ch:")) {
    const [, si, ci] = charId.split(":");
    lb.list = chapterImages(SERIES[+si].chapters[+ci]);
  } else lb.list = galleryOf(byId[charId]);
  lb.i = i;
  showLightbox();
  $("lightbox").hidden = false;
  $("lbClose").focus();
}

function showLightbox() {
  const im = lb.list[lb.i];
  $("lbImg").src = imgUrl(im.src);
  $("lbImg").alt = im.caption || "";
  $("lbCap").innerHTML = im.caption || "";
  $("lbCount").textContent = lb.list.length > 1 ? `${lb.i + 1} из ${lb.list.length}` : "";
  $("lbPrev").hidden = $("lbNext").hidden = lb.list.length < 2;
}

function stepLightbox(d) {
  lb.i = (lb.i + d + lb.list.length) % lb.list.length;
  showLightbox();
}

function initLightbox() {
  $("lbClose").addEventListener("click", () => { $("lightbox").hidden = true; });
  $("lbPrev").addEventListener("click", () => stepLightbox(-1));
  $("lbNext").addEventListener("click", () => stepLightbox(1));
  $("lightbox").addEventListener("click", e => { if (e.target.id === "lightbox") $("lightbox").hidden = true; });
  document.addEventListener("keydown", e => {
    if ($("lightbox").hidden) return;
    if (e.key === "Escape") $("lightbox").hidden = true;
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });
}

// Клики по вкладкам инфобокса, картинкам галереи и пунктам содержания на странице персонажа
document.addEventListener("click", e => {
  const tab = e.target.closest(".ib-tab");
  if (tab) {
    const media = tab.closest(".ib-media");
    const im = imagesOf(byId[media.dataset.char])[+tab.dataset.i];
    media.querySelectorAll(".ib-tab").forEach(t => { t.classList.toggle("is-active", t === tab); t.setAttribute("aria-selected", t === tab); });
    const fig = media.querySelector(".ib-figure");
    fig.querySelector("img").src = imgUrl(im.src);
    fig.querySelector("img").alt = im.caption || "";
    fig.querySelector(".ib-open").dataset.i = tab.dataset.i;
    let cap = fig.querySelector("figcaption");
    if (im.caption) { if (!cap) { cap = document.createElement("figcaption"); fig.append(cap); } cap.innerHTML = im.caption; }
    else if (cap) cap.remove();
    return;
  }
  const open = e.target.closest("[data-lb]");
  if (open) { openLightbox(open.dataset.lb, +open.dataset.i); return; }
  const jump = e.target.closest("[data-scroll]");
  if (jump) { e.preventDefault(); document.getElementById(jump.dataset.scroll)?.scrollIntoView({ behavior: "smooth" }); }
});

// ---------- маршруты: #id персонажа или #раздел главной ----------

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const c = byId[h];
  document.activeElement?.blur?.();
  const sm = h.match(/^seria-(\d+)$/) || h.match(/^s(\d+)c\d+$/);
  if (sm && SERIES[+sm[1] - 1]) {
    renderSeries(+sm[1] - 1);
    $("home").hidden = true; $("charView").hidden = false;
    document.title = `Серия ${sm[1]}. ${SERIES[+sm[1] - 1].title} — ${SITE.title}`;
    const el = h.startsWith("s") && document.getElementById(h);
    if (el) requestAnimationFrame(() => el.scrollIntoView()); else window.scrollTo(0, 0);
  } else if (c) {
    renderChar(c);
    $("home").hidden = true; $("charView").hidden = false;
    document.title = `${c.name} — ${SITE.title}`;
    window.scrollTo(0, 0);
  } else {
    $("home").hidden = false; $("charView").hidden = true;
    document.title = SITE.title;
    const el = h && document.getElementById(h);
    if (el) requestAnimationFrame(() => el.scrollIntoView());
    else if (!h || h === "top") window.scrollTo(0, 0);
  }
}

renderHeader();
renderHome();
initSearch();
initLightbox();
window.addEventListener("hashchange", route);
route();
