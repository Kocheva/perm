const PERM = "MUN_PERM";
const MODES = { projects: "Проекты", organizations: "Организации", roles: "Роли" };
const UNITS = {
  projects: ["проект", "проекта", "проектов"],
  organizations: ["организация", "организации", "организаций"],
  roles: ["человек", "человека", "человек"],
};
const ROLE_STYLE = {
  ROLE_ORG_LEADER: ["#315981", "руководитель", "руководителя", "руководителей"],
  ROLE_COUNCIL_MEMBER: ["#39827d", "член совета", "члена совета", "членов совета"],
  ROLE_SPEAKER: ["#7345a7", "спикер", "спикера", "спикеров"],
  ROLE_TRAINER: ["#bc6538", "тренер", "тренера", "тренеров"],
  ROLE_EXPERT: ["#438c56", "эксперт", "эксперта", "экспертов"],
  ROLE_MODERATOR: ["#ab496e", "модератор", "модератора", "модераторов"],
  ROLE_AUTHOR: ["#927123", "автор", "автора", "авторов"],
};

// The first pair places the label. The remaining pairs route the guide back to its geographic point.
const LABELS = {
  MUN_CHERDYN: [763, 272, 750, 302],
  MUN_SOLIKAMSK: [798, 359, 788, 401],
  MUN_BEREZNIKI: [838, 435, 812, 459],
  MUN_KUDYMKAR: [466, 443, 606, 494],
  MUN_DOBRYANKA: [643, 526, 715, 569],
  MUN_VERESHCHAGINO: [118, 605, 489, 639, 254, 629],
  MUN_KRASNOKAMSK: [325, 679, 546, 660, 493, 697],
  MUN_GORNOZAVODSK: [926, 522, 908, 579],
  MUN_CHUSOVOY: [901, 595, 875, 610],
  MUN_LYSVA: [946, 652, 892, 651],
  MUN_PERM_DISTRICT: [832, 705, 788, 690],
  MUN_KUNGUR: [824, 787, 802, 755],
  MUN_OSA: [628, 788, 666, 760],
  MUN_CHASTYE: [386, 755, 570, 752, 450, 772],
  MUN_CHAIKOVSKY: [407, 850, 526, 823],
  MUN_CHERNUSHKA: [684, 889, 717, 858],
};
const COMPACT_LABELS = {
  MUN_CHERDYN: [10, 4], MUN_SOLIKAMSK: [-12, -7], MUN_BEREZNIKI: [10, 6],
  MUN_DOBRYANKA: [7, -13], MUN_VERESHCHAGINO: [-11, -7], MUN_KRASNOKAMSK: [-9, -19],
  MUN_GORNOZAVODSK: [12, -7], MUN_CHUSOVOY: [-10, -8], MUN_LYSVA: [12, 7],
  MUN_PERM_DISTRICT: [30, 32], MUN_KUNGUR: [11, 6], MUN_OSA: [10, 16],
  MUN_CHASTYE: [-10, 8], MUN_CHAIKOVSKY: [-11, 4], MUN_CHERNUSHKA: [11, 5],
  MUN_KUDYMKAR: [-10, -16],
};
const compactNumber = new Intl.NumberFormat("ru", { maximumFractionDigits: 1 });
const plurals = new Intl.PluralRules("ru");
function quantity(n, forms) {
  const form = plurals.select(n);
  return `${n} ${forms[form === "one" ? 0 : form === "few" ? 1 : 2]}`;
}
function mapUrl(s) {
  const q = new URLSearchParams();
  if (s.mode !== "projects") q.set("mode", s.mode);
  for (const key of ["topic", "role", "city", "item"]) if (s[key]) q.set(key, s[key]);
  return q.size ? `#/map?${q}` : "#/map";
}
function linksIndex(links, field) {
  const index = new Map();
  for (const link of links) {
    if (!index.has(link[field])) index.set(link[field], new Set());
    index.get(link[field]).add(link.person_id);
  }
  return index;
}
function sourceRows(data) {
  const projects = linksIndex(data.person_project_links, "project_id");
  const orgs = linksIndex(data.person_organization_links, "org_id");
  return {
    projects: data.projects.map(p => ({ city: p.municipality_id, categories: [p.topic_id], people: projects.get(p.project_id) || [] })),
    organizations: data.organizations.map(o => ({ city: o.municipality_id, categories: [o.primary_topic_id], people: orgs.get(o.org_id) || [] })),
    roles: data.people.filter(p => p.role_ids.length).map(p => ({ city: p.municipality_id, categories: [...new Set(p.role_ids)], people: [p.person_id], topics: p.topic_ids })),
  };
}
function summarize(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const id of row.categories) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return { counts, total: rows.length };
}

export function createRegionalMap(data, { esc, peoplePanel }) {
  const rows = sourceRows(data);
  const topics = [...data.topics].sort((a, b) => a.dashboard_order - b.dashboard_order).map(t => ({
    id: t.topic_id, name: t.topic_name, label: t.topic_short_name, code: String(t.dashboard_order).padStart(2, "0"), color: t.color,
  }));
  const roles = [...data.roles].sort((a, b) => a.display_order - b.display_order).map(r => ({
    id: r.role_id, name: r.role_name, label: r.role_short_name, code: String(r.display_order).padStart(2, "0"), color: ROLE_STYLE[r.role_id]?.[0] || "#657189",
  }));
  const cities = [...data.municipalities].sort((a, b) => a.display_name.localeCompare(b.display_name, "ru"));
  let lastHash = "#/map";
  let root;
  let zoomed = false;
  function readState() {
    const q = new URLSearchParams(location.hash.split("?")[1]);
    const valid = (list, id) => list.some(x => x.id === id) ? id : "";
    const mode = Object.hasOwn(MODES, q.get("mode")) ? q.get("mode") : "projects";
    const city = cities.some(m => m.municipality_id === q.get("city")) ? q.get("city") : "";
    const topic = valid(topics, q.get("topic"));
    const role = mode === "roles" ? valid(roles, q.get("role")) : "";
    const global = mode === "roles" ? role : topic;
    const item = city ? valid(mode === "roles" ? roles : topics, q.get("item")) : "";
    return { mode, city, topic, role, item: !global || global === item ? item : "" };
  }
  function content(s) {
    const isRoles = s.mode === "roles";
    const cats = isRoles ? roles : topics;
    const global = isRoles ? s.role : s.topic;
    const chosen = s.item || global;
    const units = UNITS[s.mode];
    const rowsInMode = isRoles && s.topic ? rows.roles.filter(row => row.topics.includes(s.topic)) : rows[s.mode];
    const regional = summarize(rowsInMode);
    const byCity = new Map(cities.map(m => [m.municipality_id, summarize(rowsInMode.filter(row => row.city === m.municipality_id))]));
    const filtered = global ? rowsInMode.filter(row => row.categories.includes(global)) : rowsInMode;
    const municipalityCount = new Set(filtered.map(row => row.city)).size;
    const matching = rowsInMode.filter(row => (!s.city || row.city === s.city) && (!chosen || row.categories.includes(chosen)));
    const personIds = new Set(matching.flatMap(row => [...row.people]));
    const people = data.people.filter(p => personIds.has(p.person_id));
    const categoryName = id => cats.find(c => c.id === id)?.label || "";
    const cityName = id => data.municipalityById[id]?.display_name || "Весь край";
    const jump = patch => esc(mapUrl({ ...s, ...patch }));
    const denominatorLabel = isRoles ? " среди людей с указанной ролью" : " в муниципалитете";
    const cityUrl = id => jump({ city: id, item: "" });
    const categoryPatch = id => isRoles ? { role: id } : { topic: id };
    const bubbleUrl = (city, id) => jump({ city, item: id, ...(global && global !== id ? categoryPatch(id) : {}) });
    const amount = (n, category) => quantity(n, isRoles && ROLE_STYLE[category] ? ROLE_STYLE[category].slice(1) : units);
    const share = (n, total) => total ? compactNumber.format(100 * n / total) + "%" : "0%";
    const localScope = s.city ? byCity.get(s.city) : regional;
    const tip = (city, c, n) => {
      const total = byCity.get(city).total;
      return `${cityName(city)} · ${c.name} · ${amount(n, c.id)} из ${total} (${share(n, total)}${isRoles ? denominatorLabel : ""})`;
    };
    const svgLink = (href, key, label, body, cls = "") =>
      `<a class="atlas-hit ${cls}" href="${href}" data-key="${esc(key)}" data-tip="${esc(label)}" aria-label="${esc(label)}">${body}</a>`;
    const coef = isRoles ? 4.3 : 3;
    const radius = n => coef * Math.sqrt(n);
    function pin(m) {
      return [455 + (m.map_x + 8) * 5.1, 196 + (m.map_y * 1.1 + 0.4) * 6.83];
    }
    function cityGraphic(m) {
      const id = m.municipality_id;
      const [ax, ay] = pin(m);
      const [x, y, ...route] = LABELS[id] || [ax + 10, ay - 10];
      const group = byCity.get(id);
      const hits = cats.filter(c => (!global || c.id === global) && group.counts.get(c.id));
      const selected = s.city === id;
      const context = `${m.display_name} · ${amount(global ? group.counts.get(global) || 0 : group.total, global)}`;
      if (global && municipalityCount <= 4) {
        const [dx, dy] = COMPACT_LABELS[id] || [10, -10];
        const n = group.counts.get(global) || 0;
        const r = n ? radius(n) : 3.3;
        const color = cats.find(c => c.id === global).color;
        const textX = ax + (dx < 0 ? -1 : 1) * Math.max(Math.abs(dx), r + 5);
        const align = dx < 0 ? "end" : "start";
        const guide = id === "MUN_PERM_DISTRICT" ? `<path d="M${ax} ${ay}l12 20 12 6" class="atlas-guide"/>` : "";
        const body = `${guide}<circle cx="${ax}" cy="${ay}" r="${Math.max(r+4,9)}" fill="transparent"/>
          ${selected ? `<circle cx="${ax}" cy="${ay}" r="${r+3}" class="atlas-ring"/>` : ""}
          <circle cx="${ax}" cy="${ay}" r="${r}" fill="${n ? esc(color) : "white"}" stroke="${n ? "none" : "#8998a5"}"/>
          <text x="${textX}" y="${ay+dy}" text-anchor="${align}" class="atlas-city-name">${esc(m.display_name)}</text>
          ${n ? `<text class="atlas-code" x="${textX}" y="${ay+dy+18}" text-anchor="${align}">${amount(n, global)}</text>` : ""}`;
        return `<g class="atlas-city ${n ? "" : "quiet"}">${svgLink(cityUrl(id), "city-" + id, context, body)}</g>`;
      }
      const pinDot = `<circle cx="${ax}" cy="${ay}" r="${selected ? 5.5 : 3.4}" class="atlas-point ${hits.length ? "filled" : ""}"/>`;
      const title = svgLink(cityUrl(id), "city-" + id, context,
        `<rect class="atlas-target" x="-4" y="-17" width="${Math.max(64, m.display_name.length * 9.2)}" height="20"/><text class="atlas-city-name" x="0" y="0">${esc(m.display_name)}</text>`);
      const circleRow = hits.map((c, i) => {
        const n = group.counts.get(c.id);
        const r = radius(n);
        const at = global ? Math.max(11, r) : 9 + 24 * i;
        const cy = global ? Math.max(r + 4, 14) : 21;
        const localActive = selected && chosen === c.id;
        return svgLink(bubbleUrl(id, c.id), `bubble-${id}-${c.id}`, tip(id, c, n),
          `<g transform="translate(${at} ${cy})"><rect class="atlas-target" x="-12" y="-12" width="${global ? 64 : 24}" height="40"/>
          ${localActive ? `<circle r="${r + 3}" class="atlas-ring"/>` : ""}<circle r="${r}" fill="${esc(c.color)}"/>
          <text class="atlas-code" x="${global ? r + 7 : 0}" y="${global ? 4 : 21}" text-anchor="${global ? "start" : "middle"}">${global ? n : c.code}</text></g>`);
      }).join("");
      return `<g class="atlas-city ${selected ? "selected" : ""} ${hits.length ? "" : "quiet"}">
        <polyline points="${[ax, ay, ...route].join(" ")}" class="atlas-guide"/>
        ${svgLink(cityUrl(id), "pin-" + id, context, `<circle cx="${ax}" cy="${ay}" r="9" fill="transparent"/>${pinDot}`)}
        <g transform="translate(${x} ${y})">${title}${circleRow}${!group.total && !global ? '<text class="atlas-code" y="21">Нет записей</text>' : ""}</g></g>`;
    }
    function permGraphic() {
      const group = byCity.get(PERM);
      const [x, y] = pin(data.municipalityById[PERM]);
      const active = s.city === PERM;
      const mapCount = group.counts.get(global) || 0;
      const globalCat = cats.find(c => c.id === global);
      const r = global ? radius(mapCount) : 7;
      const block = cats.map((c, i) => {
        const n = group.counts.get(c.id) || 0;
        const colCount = isRoles ? 4 : 5;
        const cx = (isRoles ? 102 : 92) + (i % colCount) * (isRoles ? 92 : 79);
        const cy = (isRoles ? 346 : 315) + Math.floor(i / colCount) * (isRoles ? 120 : 94);
        const labelY = cy + (isRoles ? 53 : 40);
        const chosenHere = chosen && chosen === c.id && (active || global);
        const weight = global && c.id !== global ? ' opacity=".53"' : "";
        const rad = radius(n);
        const body = `<g${weight}><rect class="atlas-target" x="${cx - 38}" y="${cy - (isRoles ? 44 : 32)}" width="76" height="${isRoles ? 115 : 92}"/>
            ${chosenHere ? `<circle cx="${cx}" cy="${cy}" r="${rad + 4}" class="atlas-ring"/>` : ""}
            ${n ? `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${esc(c.color)}"/>` : `<circle cx="${cx}" cy="${cy}" r="2.8" fill="none" stroke="#9da8b4"/>`}
            <text class="atlas-inset-label" x="${cx}" y="${labelY}">${esc(c.id === "T13" ? "НКО" : c.label)}</text>
            <text class="atlas-inset-value" x="${cx}" y="${labelY+17}">${n}</text></g>`;
        return svgLink(bubbleUrl(PERM, c.id), "inset-" + c.id, tip(PERM, c, n), body);
      }).join("");
      const pinBody = `<circle cx="${x}" cy="${y}" r="${Math.max(10, r + 3)}" fill="transparent"/>${active ? `<circle cx="${x}" cy="${y}" r="${Math.max(5, r) + 4}" class="atlas-ring"/>` : ""}
        <circle cx="${x}" cy="${y}" r="${Math.max(3, r)}" fill="${globalCat ? (mapCount ? esc(globalCat.color) : "#c5ced6") : "#b0234b"}" stroke="white" stroke-width="1.3"/>
        <text x="${x + Math.max(15, r + 7)}" y="${y - 8}" class="atlas-city-name atlas-perm-name">Пермь${global ? " · " + mapCount : ""}</text>`;
      return `<polyline points="444,541 484,541 ${x-42},${y} ${x},${y}" class="atlas-guide perm"/>
        ${svgLink(cityUrl(PERM), "pin-" + PERM, cityName(PERM) + " · " + amount(global ? mapCount : group.total, global), pinBody)}
        <rect x="50" y="226" width="402" height="347" rx="12" class="atlas-inset-bg"/>
        ${svgLink(cityUrl(PERM), "city-" + PERM, "Выбрать Пермь", '<rect class="atlas-target" x="60" y="230" width="100" height="47"/><text x="70" y="260" class="atlas-inset-name">Пермь</text>')}
        <text x="433" y="258" text-anchor="end" class="atlas-inset-meta">${isRoles ? (s.topic ? "Роли в выбранной теме" : "Все роли города") : amount(group.total) + " · " + quantity([...group.counts.values()].filter(Boolean).length, ["тема","темы","тем"])}</text>
        <path d="M68 277H434" class="atlas-guide"/>${block}`;
    }
    function scale() {
      const ns = isRoles ? [1, 5, 15] : [1, 10, 50];
      return `<g class="atlas-scale-svg"><text x="60" y="859">Размер круга</text>${ns.map((n, i) => {
        const x = 70 + i*82;
        return `<circle cx="${x}" cy="901" r="${radius(n)}" fill="#99aab9"/><text x="${x+radius(n)+7}" y="905">${n}</text>`;
      }).join("")}</g>`;
    }
    const filters = cats.map(c => {
      const n = regional.counts.get(c.id) || 0;
      return `<a href="${jump({ ...categoryPatch(c.id === global ? "" : c.id), city:"", item:"" })}" data-key="legend-${esc(c.id)}" aria-label="${esc(c.name)} — ${amount(n, c.id)}" ${c.id === global ? 'aria-current="true"' : ''} title="${esc(c.name)}" class="atlas-filter" style="--atlas-category:${esc(c.color)}">
        <i style="background:${esc(c.color)}"></i><small>${c.code}</small><span>${esc(c.label)}</span>${isRoles ? `<b>${n}</b>` : ""}</a>`;
    }).join("");
    const currentTopic = isRoles ? s.topic : chosen;
    const activeCity = s.city && cityName(s.city);
    const details = s.city ? `<details class="atlas-breakdown" ${s.city !== PERM && !chosen ? "open" : ""}><summary>${isRoles ? "Роли" : "Темы"} · ${esc(activeCity)}</summary>
      <div>${cats.filter(c => localScope.counts.get(c.id)).map(c => {
        const n = localScope.counts.get(c.id);
        return `<a href="${bubbleUrl(s.city,c.id)}"><i style="background:${esc(c.color)}"></i><span>${esc(c.name)}</span><b>${n}</b><small>${share(n,localScope.total)}</small></a>`;
      }).join("") || "<p>Нет записей по выбранным условиям.</p>"}</div></details>` : "";
    const summary = [activeCity || "Весь край", categoryName(chosen)].filter(Boolean).join(" · ");
    return `<div class="atlas-heading"><h1>${isRoles ? "Роли" : "Темы"} на карте края</h1>
      <nav class="atlas-modes" aria-label="Режим карты">${Object.entries(MODES).map(([id,label]) => `<a data-key="mode-${id}" href="${jump(id === s.mode ? {} : {mode:id, role:"", item:""})}" ${id===s.mode ? 'aria-current="true"' : ""}>${label}</a>`).join("")}</nav></div>
      <div class="atlas-layout">
        <section class="atlas-mapbox" aria-label="Карта муниципалитетов">
          <div class="atlas-maphead"><div><strong>${amount(filtered.length, global)}</strong><span>${quantity(municipalityCount, ["муниципалитет","муниципалитета","муниципалитетов"])}</span></div>
          <button type="button" class="atlas-zoom" data-zoom data-key="zoom" aria-pressed="${zoomed}">${zoomed ? "Уместить карту" : "Увеличить карту"}</button></div>
          ${!filtered.length ? '<p class="atlas-empty">По выбранным условиям записей в крае нет.</p>' : ""}
          <div class="atlas-viewport ${zoomed ? "zoomed" : ""}" tabindex="0" aria-label="Карта. При увеличении доступна прокрутка">
          <svg class="atlas-geography" viewBox="32 181 1107 757" role="group" aria-label="Пермский край. Выберите муниципалитет или цветной круг">
          <image href="./assets/perm-krai.svg" x="453" y="194" width="514" height="687"/>
          ${cities.filter(m=>m.municipality_id!==PERM).map(cityGraphic).join("")}${permGraphic()}${scale()}</svg></div>
          <div class="atlas-mapfoot"><span>${isRoles ? "Число людей с ролью. У человека может быть несколько ролей." : "Площадь круга — число " + (s.mode==="projects" ? "проектов" : "организаций") + " по теме."}</span>${s.city || chosen ? `<button type="button" data-show-results class="atlas-jump">${esc(summary)} · ${quantity(people.length,["персона","персоны","персон"])} ↓</button>` : ""}</div>
        </section>
        <section class="atlas-filters" aria-label="Фильтры карты"><div class="atlas-sidehead"><h2>Фильтр по ${isRoles ? "роли" : "теме"}</h2>
          <a href="${jump({...categoryPatch(""),item:""})}" data-key="legend-all" ${!global ? 'aria-current="true"' : ""}>${isRoles ? "Все роли" : "Все темы"}</a></div>
          ${isRoles ? '<p class="atlas-note">Число людей по краю</p>' : ""}
          <div class="atlas-legend ${isRoles ? "role-legend" : ""}">${filters}</div>
          ${isRoles ? `<label class="atlas-field">Тема<select aria-label="Тема" data-field="topic" data-key="topic-select"><option value="">Все темы</option>${topics.map(c => `<option value="${esc(c.id)}" ${s.topic===c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>` : ""}
        </section>
        <section class="atlas-results" tabindex="-1" aria-label="Лидеры выбранного среза">
          <label class="atlas-field">Муниципалитет<select aria-label="Муниципалитет" data-field="city" data-key="city-select"><option value="">Весь край</option>${cities.map(m => `<option value="${esc(m.municipality_id)}" ${s.city===m.municipality_id ? "selected" : ""}>${esc(m.display_name)}</option>`).join("")}</select></label>
          <div class="atlas-selection" aria-live="polite"><strong>${esc(summary)}</strong><span>${amount(matching.length, chosen)}${s.city && chosen && localScope.total ? " · " + share(matching.length,localScope.total) + denominatorLabel : ""}</span></div>
          ${currentTopic ? `<a class="atlas-topic-link" href="#/topic/${encodeURIComponent(currentTopic)}">Открыть тему по всему краю →</a>` : ""}
          ${details}${peoplePanel({people})}</section></div>
          <div class="atlas-tip" role="tooltip" hidden></div>`;
  }
  function update() {
    const viewport = root.querySelector(".atlas-viewport");
    const scrollLeft = viewport?.scrollLeft || 0;
    const scrollTop = viewport?.scrollTop || 0;
    const focusKey = root.contains(document.activeElement) ? document.activeElement?.dataset.key : null;
    const s = readState();
    lastHash = mapUrl(s);
    root.innerHTML = content(s);
    const currentViewport = root.querySelector(".atlas-viewport");
    currentViewport.scrollTo(scrollLeft, scrollTop);
    const nav = document.querySelector('.site-views a[aria-current="page"]');
    if (nav) nav.setAttribute("href", lastHash);
    if (focusKey) root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({preventScroll:true});
  }
  function mount() {
    root = document.getElementById("regional-map");
    update();
    root.addEventListener("change", e => {
      const field = e.target.dataset.field;
      if (field) location.hash = mapUrl({ ...readState(), [field]:e.target.value, item:"" });
    });
    root.addEventListener("click", e => {
      if (e.target.closest("[data-show-results]")) {
        const panel = root.querySelector(".atlas-results");
        panel.focus({preventScroll:true});
        panel.scrollIntoView({block:"start"});
      }
      if (e.target.closest("[data-zoom]")) {
        zoomed = !zoomed;
        update();
        if (zoomed) {
          const v = root.querySelector(".atlas-viewport");
          v.scrollLeft = (v.scrollWidth-v.clientWidth)*.55;
          v.scrollTop = (v.scrollHeight-v.clientHeight)*.5;
        }
      }
    });
    function hide() { root.querySelector(".atlas-tip").hidden = true; }
    function show(e) {
      const el = e.target.closest("[data-tip]");
      if (!el || !root.contains(el)) return;
      const box = el.getBoundingClientRect();
      const tip = root.querySelector(".atlas-tip");
      tip.textContent = el.dataset.tip;
      tip.hidden = false;
      const x = e.type === "focusin" ? box.left + box.width/2 : e.clientX;
      const y = e.type === "focusin" ? box.bottom : e.clientY;
      tip.style.left = Math.max(6, Math.min(x+10, window.innerWidth-tip.offsetWidth-8))+"px";
      tip.style.top = (y+tip.offsetHeight+24 < window.innerHeight ? y+14 : Math.max(4,y-tip.offsetHeight-12))+"px";
    }
    root.addEventListener("pointerover", e => { if(e.pointerType !== "touch") show(e); });
    root.addEventListener("pointerout", hide);
    root.addEventListener("focusin", show);
    root.addEventListener("focusout", hide);
    root.addEventListener("keydown", e => { if (e.key==="Escape") hide(); });
  }
  return { mount, update, lastUrl: () => lastHash };
}
