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
          <polygon transform="translate(455 196)" points="373.3,654.9 363.9,658.2 363.1,664.9 358.5,671.1 360.7,672.5 357.2,675.7 348.5,676.7 347.8,679.3 340.6,683.0 337.2,682.0 331.0,674.4 328.8,667.9 322.7,668.0 321.3,663.3 318.0,663.0 313.1,655.7 316.9,651.1 314.9,648.3 309.7,649.4 306.0,647.7 304.5,648.9 304.2,651.9 301.3,653.0 297.6,658.4 293.8,657.4 284.8,659.8 277.2,649.4 274.2,638.1 270.9,642.2 263.0,641.6 250.0,646.3 243.8,653.1 241.0,654.2 230.4,654.0 228.5,650.6 226.3,652.3 225.1,656.3 220.5,653.1 211.5,656.0 209.0,647.9 196.6,641.4 184.4,629.3 175.9,653.3 170.7,651.3 168.4,640.0 167.6,639.2 163.6,642.3 159.2,630.7 155.4,629.2 152.3,623.4 150.1,622.7 153.3,617.4 152.4,613.4 148.4,611.5 143.8,618.7 138.1,619.3 137.1,617.1 138.9,609.8 135.5,597.4 138.9,596.5 144.0,604.7 147.1,605.1 150.4,603.1 153.2,600.8 153.7,597.6 153.9,577.0 159.0,572.4 170.0,571.4 173.9,567.6 172.5,564.3 166.9,562.6 165.7,560.2 168.8,555.9 168.5,537.8 164.5,535.5 155.3,535.0 157.8,524.9 165.3,520.6 164.8,516.1 159.4,515.9 158.6,510.6 160.6,508.0 159.0,504.8 155.3,504.6 153.4,509.0 150.0,507.9 150.1,504.5 146.7,502.7 147.2,501.0 155.1,497.5 152.4,491.4 153.7,488.4 157.7,486.4 156.4,471.4 153.3,461.6 153.5,451.7 143.5,438.4 139.8,427.2 134.8,422.6 139.8,411.5 133.1,401.3 133.1,396.7 127.8,375.5 130.8,371.1 130.6,366.1 132.2,362.9 142.2,354.7 132.2,345.7 129.2,335.7 131.5,326.1 136.8,324.1 137.1,319.8 139.2,316.8 131.1,310.9 127.0,313.2 128.5,316.7 114.1,310.1 107.8,309.9 103.3,305.5 96.1,291.7 94.7,283.6 104.6,266.9 109.1,244.4 120.3,241.5 122.4,235.9 127.9,205.7 121.4,188.3 111.4,180.7 104.8,185.4 44.9,181.3 34.5,176.2 37.8,158.7 36.3,152.9 32.0,149.7 24.0,148.0 23.7,138.9 0.0,132.3 7.9,98.2 38.3,102.6 43.3,86.2 67.1,89.7 72.9,72.0 105.7,79.9 103.6,94.5 104.5,96.5 134.4,101.8 137.6,85.9 212.3,100.1 217.8,82.4 226.8,82.3 232.7,68.6 261.1,72.7 268.7,53.0 299.0,57.8 302.2,48.7 301.2,42.7 305.8,32.0 315.6,30.7 319.6,22.8 322.9,22.2 324.7,19.6 351.9,23.8 359.7,21.0 466.2,21.2 474.1,15.6 479.8,16.3 488.4,6.2 501.8,0.0 507.1,20.8 504.9,25.3 506.4,31.0 499.1,38.4 498.6,43.0 496.0,47.5 495.7,53.6 497.6,59.9 502.4,65.0 501.4,72.5 504.1,77.4 503.5,87.1 509.9,90.6 510.0,105.6 507.5,112.2 504.6,134.5 500.8,141.7 494.2,147.7 493.8,152.6 489.6,160.9 491.1,172.7 486.3,181.0 485.9,187.2 481.8,192.0 482.1,200.5 475.5,206.4 478.7,214.2 469.2,214.1 465.8,222.6 457.2,223.0 451.0,240.6 442.4,241.9 439.0,261.2 433.1,271.5 446.8,274.6 456.8,292.3 479.0,299.9 484.1,305.7 490.3,307.5 490.4,310.2 484.8,325.5 490.8,333.9 488.1,339.9 483.2,341.6 484.2,356.4 490.2,358.1 491.7,364.0 496.4,363.3 499.9,365.6 504.0,364.2 506.7,367.3 504.5,378.3 509.0,390.2 504.9,395.7 497.7,399.4 497.2,405.7 492.2,413.2 484.4,418.0 478.6,425.6 468.1,425.9 462.9,434.1 457.0,438.1 456.5,443.9 452.9,447.8 452.5,451.0 455.1,456.9 460.7,462.7 463.1,469.7 469.5,470.8 469.5,479.2 467.5,484.0 447.1,502.4 441.9,499.8 442.7,492.9 441.4,490.1 434.6,489.1 430.2,490.9 428.3,488.8 423.8,488.9 422.6,491.2 423.9,495.3 420.5,504.2 416.0,498.8 413.8,503.7 410.8,506.7 412.3,513.4 408.4,532.2 410.7,534.2 409.2,536.8 413.1,537.8 415.0,543.9 413.9,546.4 411.8,547.4 411.7,549.2 415.2,550.2 415.2,555.7 419.4,557.3 414.0,558.9 417.3,561.7 417.2,566.6 410.9,566.2 413.0,563.5 412.2,561.9 408.8,565.1 404.7,564.6 400.7,576.5 397.0,576.3 395.8,580.8 392.4,579.9 383.3,586.5 376.8,585.0 375.2,580.7 372.9,583.0 368.6,582.1 360.7,590.8 367.1,603.1 366.8,606.6 370.3,612.4 374.4,614.5 369.6,620.9 371.4,625.8 367.9,635.5 369.3,639.3 367.2,649.5 371.1,651.1 373.3,654.9" fill="#e9eef2" stroke="#94a7b5" stroke-width="1.7" stroke-linejoin="round" pointer-events="none"/>
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
