const DATA_URL = "./data/perm_leaders_map.json";

const app = document.querySelector("#app");
let data;

const state = {
  mode: "organizations",
  municipalityId: "",
  topicId: "",
  roleId: "",
  fund: "",
  year: "",
  orgProfile: "",
  moreOpen: false,
};

const esc = (value = "") => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    if (key !== null && key !== undefined) (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

function sumKnownFunding(projects) {
  return projects.reduce((sum, p) => sum + (p.amount_available && Number.isFinite(Number(p.grant_amount)) ? Number(p.grant_amount) : 0), 0);
}

function urlSafe(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function buildIndexes() {
  data.topicById = Object.fromEntries(data.topics.map((x) => [x.topic_id, x]));
  data.municipalityById = Object.fromEntries(data.municipalities.map((x) => [x.municipality_id, x]));
  data.roleById = Object.fromEntries(data.roles.map((x) => [x.role_id, x]));
  data.orgById = Object.fromEntries(data.organizations.map((x) => [x.org_id, x]));
  data.personById = Object.fromEntries(data.people.map((x) => [x.person_id, x]));
  data.projectById = Object.fromEntries(data.projects.map((x) => [x.project_id, x]));
  data.practiceById = Object.fromEntries(data.practices.map((x) => [x.practice_id, x]));
  data.orgLinksByPerson = groupBy(data.person_organization_links, (x) => x.person_id);
  data.personLinksByOrg = groupBy(data.person_organization_links, (x) => x.org_id);
  data.activitiesByPerson = groupBy(data.activities.filter((x) => x.person_evidence_status === "person_verified"), (x) => x.person_id);
  data.recognitionByPerson = groupBy(data.activities.filter((x) => x.activity_kind === "recognition" && x.person_id), (x) => x.person_id);
  data.activitiesByTopic = groupBy(data.activities, (x) => x.topic_id);
  data.councilsByPerson = groupBy(data.council_memberships, (x) => x.person_id);
  data.practicesByPerson = groupBy(data.practices, (x) => x.person_id);
  data.projectsByOrg = groupBy(data.projects, (x) => x.org_id);
  data.projectLinksByPerson = groupBy(data.person_project_links, (x) => x.person_id);
}

function selectedFilters(overrides = {}) {
  return {
    municipalityId: state.municipalityId,
    topicId: state.topicId,
    roleId: state.roleId,
    fund: state.fund,
    year: state.year,
    orgProfile: state.orgProfile,
    ...overrides,
  };
}

function personsForRole(roleId) {
  return roleId ? data.people.filter((p) => p.role_ids.includes(roleId)) : data.people;
}

function eligibleOrgIds(filters) {
  if (!filters.roleId) return null;
  const personIds = new Set(personsForRole(filters.roleId).map((p) => p.person_id));
  return new Set(data.person_organization_links.filter((l) => personIds.has(l.person_id)).map((l) => l.org_id));
}

function computeScope(filters = selectedFilters()) {
  const roleOrgIds = eligibleOrgIds(filters);
  const hasAdditionalProjectFilter = Boolean(filters.fund || filters.year);

  const matchingProjectForOrg = (orgId) => (data.projectsByOrg[orgId] || []).some((p) =>
    (!filters.fund || p.fund === filters.fund) &&
    (!filters.year || String(p.year) === String(filters.year))
  );

  const organizations = data.organizations.filter((org) =>
    (!filters.municipalityId || org.municipality_id === filters.municipalityId) &&
    (!filters.topicId || org.primary_topic_id === filters.topicId) &&
    (!filters.orgProfile || org.org_profile_type === filters.orgProfile) &&
    (!roleOrgIds || roleOrgIds.has(org.org_id)) &&
    (!hasAdditionalProjectFilter || matchingProjectForOrg(org.org_id))
  );

  const projects = data.projects.filter((project) => {
    const org = data.orgById[project.org_id];
    return Boolean(org) &&
      (!filters.municipalityId || project.municipality_id === filters.municipalityId) &&
      (!filters.topicId || project.topic_id === filters.topicId) &&
      (!filters.orgProfile || org.org_profile_type === filters.orgProfile) &&
      (!roleOrgIds || roleOrgIds.has(project.org_id)) &&
      (!filters.fund || project.fund === filters.fund) &&
      (!filters.year || String(project.year) === String(filters.year));
  });

  const people = data.people.filter((person) => {
    const orgIds = person.organization_ids || [];
    const projectPool = orgIds.flatMap((id) => data.projectsByOrg[id] || []);
    const hasProjectFilterMatch = projectPool.some((p) =>
      (!filters.fund || p.fund === filters.fund) &&
      (!filters.year || String(p.year) === String(filters.year))
    );
    return (!filters.municipalityId || person.municipality_id === filters.municipalityId) &&
      (!filters.topicId || person.topic_ids.includes(filters.topicId)) &&
      (!filters.roleId || person.role_ids.includes(filters.roleId)) &&
      (!filters.orgProfile || orgIds.some((id) => data.orgById[id]?.org_profile_type === filters.orgProfile)) &&
      (!hasAdditionalProjectFilter || hasProjectFilterMatch);
  });

  return {
    organizations,
    projects,
    people,
    funding: sumKnownFunding(projects),
    unknownFundingCount: projects.filter((p) => !p.amount_available).length,
  };
}

function header() {
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#/" aria-label="На главную">
          <span class="brand-logo-frame"><img class="brand-logo" src="./assets/grani-logo-base.png" alt="Центр ГРАНИ" /></span>
          <span><strong>Карта лидеров Пермского края</strong><span>Организации · проекты · практики</span></span>
        </a>
        <div class="global-search">
          <label class="hidden" for="global-search-input">Поиск по людям, организациям и проектам</label>
          <input id="global-search-input" type="search" autocomplete="off" placeholder="Найти человека, организацию или проект" aria-controls="search-results" />
          <div id="search-results" class="search-results hidden" role="listbox"></div>
        </div>
        <span class="search-hint">${integer.format(data.config.counts.people)} персон</span>
      </div>
    </header>`;
}

function footer() {
  return `<footer class="footer">Данные загружаются из JSON. Неизвестные суммы не включены в итог финансирования. Обновлено: ${esc(data.config.generated_at)}.</footer>`;
}

function option(value, label, selected = false) {
  return `<option value="${esc(value)}" ${selected ? "selected" : ""}>${esc(label)}</option>`;
}

function filterLabel(type, id) {
  if (type === "municipalityId") return data.municipalityById[id]?.display_name || id;
  if (type === "topicId") return data.topicById[id]?.topic_short_name || id;
  if (type === "roleId") return data.roleById[id]?.role_short_name || id;
  if (type === "orgProfile") return id;
  return id;
}

function activeChips() {
  const keys = ["municipalityId", "topicId", "roleId", "fund", "year", "orgProfile"];
  const chips = keys.filter((key) => state[key]).map((key) => `
    <span class="filter-chip">${esc(filterLabel(key, state[key]))}<button type="button" data-clear-filter="${key}" aria-label="Убрать фильтр">×</button></span>`);
  return chips.length ? `<div class="active-chips">${chips.join("")}</div>` : "";
}

function filters() {
  const profiles = [...new Set(data.organization_profiles.map((x) => x.profile_name))];
  return `
    <section class="filter-card" aria-label="Фильтры карты">
      <div class="filter-main">
        <div><strong>Дополнительные фильтры</strong><span style="display:block;color:var(--muted);font-size:12px;margin-top:3px">Фонд, год и профиль организации</span></div>
        <div class="filter-actions">
          <button class="button" type="button" data-action="toggle-more" aria-expanded="${state.moreOpen}">${state.moreOpen ? "Скрыть" : "Показать"}</button>
          <button class="button ghost" type="button" data-action="reset">Сбросить</button>
        </div>
      </div>
      <div class="more-filters ${state.moreOpen ? "" : "hidden"}">
        <div class="field"><label for="fund-filter">Фонд</label><select id="fund-filter" data-filter="fund"><option value="">Все фонды</option>${data.config.funds.map((x) => option(x, x, state.fund === x)).join("")}</select></div>
        <div class="field"><label for="year-filter">Год</label><select id="year-filter" data-filter="year"><option value="">Все годы</option>${[...data.config.years].reverse().map((x) => option(x, x, String(state.year) === String(x))).join("")}</select></div>
        <div class="field"><label for="profile-filter">Профиль организации</label><select id="profile-filter" data-filter="orgProfile"><option value="">Все профили</option>${profiles.map((x) => option(x, x, state.orgProfile === x)).join("")}</select></div>
      </div>
      ${activeChips()}
    </section>`;
}

function facetFilters() {
  const allRoleCount = computeScope(selectedFilters({ roleId: "" })).people.length;
  const roleChips = [
    `<button type="button" class="facet-chip ${!state.roleId ? "active" : ""}" data-role=""><span>Все роли</span><span class="facet-count">${allRoleCount}</span></button>`,
    ...data.roles.map((role) => {
      const count = computeScope(selectedFilters({ roleId: role.role_id })).people.length;
      return `<button type="button" class="facet-chip ${state.roleId === role.role_id ? "active" : ""}" data-role="${esc(role.role_id)}"><span>${esc(role.role_short_name)}</span><span class="facet-count">${count}</span></button>`;
    }),
  ];
  const allTopicCount = computeScope(selectedFilters({ topicId: "" })).people.length;
  const topicChips = [
    `<button type="button" class="facet-chip ${!state.topicId ? "active" : ""}" data-topic=""><span>Все темы</span><span class="facet-count">${allTopicCount}</span></button>`,
    ...data.topics.map((topic) => {
      const count = computeScope(selectedFilters({ topicId: topic.topic_id })).people.length;
      return `<button type="button" class="facet-chip ${state.topicId === topic.topic_id ? "active" : ""}" data-topic="${esc(topic.topic_id)}"><span>${esc(topic.topic_short_name)}</span><span class="facet-count">${count}</span></button>`;
    }),
  ];
  return `<div class="facet-grid"><div><p class="facet-group-title">Роль</p><div class="facet-chips">${roleChips.join("")}</div></div><div><p class="facet-group-title">Тема</p><div class="facet-chips">${topicChips.join("")}</div></div></div>`;
}

function modeSwitch() {
  const modes = [
    ["organizations", "Организации"], ["projects", "Проекты"], ["funding", "Финансирование"],
  ];
  return `<div class="mode-switch" role="group" aria-label="Режим данных">${modes.map(([id, label]) => `<button type="button" data-mode="${id}" class="${state.mode === id ? "active" : ""}">${label}</button>`).join("")}</div>`;
}

function contextTitle() {
  const bits = [];
  if (state.municipalityId) bits.push(data.municipalityById[state.municipalityId]?.display_name);
  if (state.topicId) bits.push(data.topicById[state.topicId]?.topic_name);
  return bits.length ? bits.join(" · ") : "Весь Пермский край";
}

function summary(scope) {
  const knownProjects = scope.projects.length - scope.unknownFundingCount;
  return `
    <section class="summary-card" aria-label="Сводка выбранного среза">
      <div class="summary-copy">
        <p class="eyebrow">Текущий срез</p>
        <h2>${esc(contextTitle())}</h2>
        <p>Карточки ниже пересчитаны по выбранным условиям. Темы организаций и темы проектов считаются независимо, чтобы не смешивать две логики классификации.</p>
      </div>
      <div class="metric"><strong>${integer.format(scope.organizations.length)}</strong><span>организаций</span></div>
      <div class="metric"><strong>${integer.format(scope.projects.length)}</strong><span>проектов</span></div>
      <div class="metric"><strong>${compact.format(scope.funding)} ₽</strong><span>известное финансирование · ${knownProjects} проектов</span></div>
    </section>`;
}

function municipalityCards() {
  const ranked = data.municipalities
    .map((m) => ({ m, scope: computeScope(selectedFilters({ municipalityId: m.municipality_id })) }))
    .sort((a, b) => b.scope.projects.length - a.scope.projects.length || b.scope.funding - a.scope.funding || a.m.display_name.localeCompare(b.m.display_name, "ru"));
  const cards = ranked.map(({ m, scope }, index) => {
    const topicCount = new Set([
      ...scope.organizations.map((o) => o.primary_topic_id),
      ...scope.projects.map((p) => p.topic_id),
      ...scope.people.flatMap((p) => p.topic_ids || []),
    ].filter(Boolean)).size;
    return `
      <button type="button" class="municipality-card ${index < 3 ? "top-rank" : ""} ${state.municipalityId === m.municipality_id ? "active" : ""}" data-municipality="${esc(m.municipality_id)}">
        <span class="municipality-rank">${index + 1}</span>
        <strong>${esc(m.display_name)}</strong>
        <span class="municipality-projects"><b>${scope.projects.length}</b><span>проектов</span></span>
        <span class="micro-metrics">
          <span><b>${scope.organizations.length}</b>организаций</span>
          <span><b>${scope.people.length}</b>персон</span>
          <span><b>${topicCount}</b>тем</span>
          <span><b>${compact.format(scope.funding)}</b>₽</span>
        </span>
      </button>`;
  });
  return `<section class="panel"><div class="panel-head"><h2>17 муниципалитетов</h2><p>Рейтинг по числу проектов · нажмите карточку для выбора территории</p></div><div class="municipality-grid">${cards.join("")}</div></section>`;
}

function topicCards() {
  const brandColors = ["#E51A4B", "#7A87A2", "#B2B3B3"];
  const cards = data.topics.map((t, index) => {
    const scope = computeScope(selectedFilters({ topicId: t.topic_id }));
    const mainValue = state.mode === "organizations" ? scope.organizations.length : state.mode === "projects" ? scope.projects.length : scope.funding;
    const mainLabel = state.mode === "organizations" ? "организаций" : state.mode === "projects" ? "проектов" : "₽ известного финансирования";
    return `
      <article class="topic-card ${state.topicId === t.topic_id ? "active" : ""}" style="--topic-color:${brandColors[index % brandColors.length]}">
        <h3>${esc(t.topic_name)}</h3>
        <div class="topic-count">${state.mode === "funding" ? compact.format(mainValue) : integer.format(mainValue)}</div>
        <div class="topic-meta">${mainLabel} · ${scope.people.length} персон</div>
        <div class="topic-actions"><button type="button" data-topic="${esc(t.topic_id)}">Выбрать</button><a href="#/topic/${encodeURIComponent(t.topic_id)}">Открыть тему →</a></div>
      </article>`;
  });
  return `${modeSwitch()}<section class="panel"><div class="panel-head"><h2>Темы и роли</h2><p>Выберите тему и роль — числа пересчитаются</p></div>${facetFilters()}<hr class="topics-divider" /><div class="topic-grid">${cards.join("")}</div></section>`;
}

function personCard(person) {
  const municipality = data.municipalityById[person.municipality_id]?.display_name;
  const roles = person.role_ids.slice(0, 3).map((id) => `<span class="tag role">${esc(data.roleById[id]?.role_short_name || id)}</span>`).join("");
  const topics = person.topic_ids.slice(0, 2).map((id) => `<span class="tag">${esc(data.topicById[id]?.topic_short_name || id)}</span>`).join("");
  return `<a class="person-card" href="#/person/${encodeURIComponent(person.person_id)}">
    <div class="person-card-top"><div><h3>${esc(person.person_name)}</h3><p>${esc(municipality || "Муниципалитет не указан")}</p></div><span class="confirmations">${person.confirmations_count} подтв.</span></div>
    <div class="tags">${roles}${topics}${person.practice_count ? `<span class="tag">Практики · ${person.practice_count}</span>` : ""}</div>
  </a>`;
}

function peoplePanel(scope) {
  const sorted = [...scope.people].sort((a, b) => b.confirmations_count - a.confirmations_count || a.person_name.localeCompare(b.person_name, "ru"));
  return `<aside class="panel people-panel"><div class="panel-head"><h2>Лидеры</h2><p>${sorted.length} в срезе</p></div><div class="people-list">${sorted.length ? sorted.map(personCard).join("") : `<div class="empty">По выбранным условиям персон не найдено</div>`}</div></aside>`;
}

function mainPage() {
  const scope = computeScope();
  return `${header()}<main id="main" class="page-shell">
    <p class="eyebrow">Публичная навигация по социальной сфере</p>
    <h1>Кто, где и в каких темах действует</h1>
    <p class="lead">Один экран объединяет муниципалитеты, темы, роли и подтверждённые практики. Выбирайте условия как «шведский стол» — все карточки и показатели пересчитаются.</p>
    ${filters()}
    ${summary(scope)}
    <div class="dashboard-grid"><div>${municipalityCards()}${topicCards()}</div>${peoplePanel(scope)}</div>
  </main>${footer()}`;
}

function roleTags(person) {
  return person.role_ids.length ? `<div class="tags">${person.role_ids.map((id) => `<span class="tag role">${esc(data.roleById[id]?.role_name || id)}</span>`).join("")}</div>` : `<p class="notice">Публичная роль по именным источникам пока не подтверждена.</p>`;
}

function practiceBox(practice) {
  const source = practice.source_urls?.map((url) => urlSafe(url)).find(Boolean);
  return `<article class="practice-box">
    <h3>${esc(practice.practice_name)}</h3>
    <p>${esc(practice.format_or_technology || "Механизм требует дополнительного описания.")}</p>
    ${practice.transferability_summary ? `<p><strong>Что можно тиражировать:</strong> ${esc(practice.transferability_summary)}</p>` : ""}
    ${practice.territory ? `<small>${esc(practice.territory)}</small>` : ""}
    ${source ? `<p><a class="source-link" target="_blank" rel="noopener noreferrer" href="${esc(source)}">Источник ↗</a></p>` : ""}
  </article>`;
}

function organizationName(org) {
  return org?.organization_name_short || org?.organization_name || org?.org_id || "Организация";
}

function cleanPublicValue(value) {
  const text = String(value ?? "").trim();
  return !text || /^(unknown|undefined|null|неизвестно|не указано)$/i.test(text) ? "" : text;
}

function splitUrls(value) {
  if (Array.isArray(value)) return value.flatMap(splitUrls);
  return String(value || "").split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
}

function personExternalLinks(orgs) {
  const seen = new Set();
  const links = [];
  orgs.forEach((org) => {
    const candidates = [
      ...splitUrls(org.website_urls), ...splitUrls(org.site_url),
      ...splitUrls(org.social_urls), ...splitUrls(org.social_url), ...splitUrls(org.tg_url),
    ];
    candidates.forEach((value) => {
      const url = urlSafe(value);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const type = host === "vk.com" || host.endsWith(".vk.com") ? "vk" : host === "t.me" || host.endsWith(".t.me") || host === "telegram.me" ? "telegram" : "site";
      const label = type === "vk" ? "VK" : type === "telegram" ? "Telegram" : host;
      links.push({ url, type, label });
    });
  });
  if (!links.length) return "";
  return `<div class="person-links" aria-label="Сайт и социальные сети организации"><span>Сайт и соцсети организации</span><div>${links.map((link) => `<a class="person-link ${link.type}" target="_blank" rel="noopener noreferrer" href="${esc(link.url)}">${esc(link.label)} ↗</a>`).join("")}</div></div>`;
}

function personOrganizationIntro(person, orgs) {
  const leaderIds = new Set(person.leader_organization_ids || []);
  if (!orgs.length) return "";
  return `<div class="person-org-intro">${orgs.map((org) => `<div><span>${leaderIds.has(org.org_id) ? "Руководитель" : "Связь с организацией"}</span> — <a href="#/organization/${encodeURIComponent(org.org_id)}">${esc(organizationName(org))}</a></div>`).join("")}</div>${personExternalLinks(orgs)}`;
}

const activityRoleNames = {
  speaker: "Спикер",
  trainer: "Тренер",
  expert: "Эксперт",
  moderator: "Модератор",
  organizer: "Организатор",
  author: "Автор",
};

function activityRoleName(value) {
  const key = cleanPublicValue(value).toLowerCase();
  return activityRoleNames[key] || cleanPublicValue(value);
}

function activityTitleLink(activity, fallback) {
  const title = cleanPublicValue(activity.activity_title) || fallback;
  const url = urlSafe(activity.source_url);
  return url ? `<a target="_blank" rel="noopener noreferrer" href="${esc(url)}"><strong>${esc(title)}</strong></a>` : `<strong>${esc(title)}</strong>`;
}

function expandableCards(items, renderItem, limit = 6) {
  const first = items.slice(0, limit).map(renderItem).join("");
  const rest = items.slice(limit);
  return `${first}${rest.length ? `<details class="content-more"><summary>Показать ещё ${rest.length}</summary><div class="content-more-list">${rest.map(renderItem).join("")}</div></details>` : ""}`;
}

function eventCard(activity) {
  const roleKey = cleanPublicValue(activity.role_class).toLowerCase();
  const role = activityRoleName(roleKey);
  const meta = [activity.year, cleanPublicValue(activity.platform_name)].filter(Boolean).join(" · ");
  return `<article class="activity-card" data-event-item data-event-role="${esc(roleKey)}">
    <div class="activity-card-meta"><span>${esc(meta || "Сведения о площадке не указаны")}</span>${role ? `<span class="activity-role">${esc(role)}</span>` : ""}</div>
    ${activityTitleLink(activity, "Участие в публичном мероприятии")}
    ${activity.quote ? `<p>${esc(activity.quote)}</p>` : ""}
  </article>`;
}

function publicationCard(activity) {
  const typeKey = cleanPublicValue(activity.publication_type) || "other";
  const typeLabel = typeKey === "other" ? "Публикация" : typeKey.charAt(0).toUpperCase() + typeKey.slice(1);
  const meta = [cleanPublicValue(activity.platform_name), activity.year].filter(Boolean).join(" · ");
  return `<article class="publication-card" data-publication-item data-publication-type="${esc(typeKey)}">
    <div class="activity-card-meta"><span>${esc(meta || "Источник не указан")}</span><span class="activity-role">${esc(typeLabel)}</span></div>
    ${activityTitleLink(activity, "Публикация")}
    ${activity.quote ? `<blockquote>${esc(activity.quote)}</blockquote>` : ""}
  </article>`;
}

function recognitionCard(activity) {
  const org = data.orgById[activity.org_id];
  const result = cleanPublicValue(activity.award_or_nomination) || cleanPublicValue(activity.project_or_practice_name);
  const recipient = activity.person_evidence_status === "person_verified" ? "" : organizationName(org);
  return `<article class="recognition-card">
    <div class="recognition-mark" aria-hidden="true">★</div><div>
      ${activityTitleLink(activity, "Публичное признание")}
      ${result ? `<p>${esc(result)}</p>` : ""}
      <small>${[recipient ? `Получатель: ${recipient}` : "", activity.year].filter(Boolean).map(esc).join(" · ")}</small>
    </div>
  </article>`;
}

function councilCard(council) {
  const role = cleanPublicValue(council.person_role);
  const period = council.start_year && council.end_year ? `${council.start_year}–${council.end_year}` : council.start_year ? `с ${council.start_year} года` : council.end_year ? `до ${council.end_year} года` : cleanPublicValue(council.period_note);
  const url = urlSafe(council.source_url);
  const title = esc(council.council_name || "Совет или экспертный орган");
  return `<li>${url ? `<a target="_blank" rel="noopener noreferrer" href="${esc(url)}"><strong>${title}</strong></a>` : `<strong>${title}</strong>`}${[role, period].filter(Boolean).length ? `<small>${[role, period].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</li>`;
}

function roleCountChips(events) {
  const counts = new Map();
  events.forEach((activity) => {
    const key = cleanPublicValue(activity.role_class).toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  const order = ["speaker", "trainer", "expert", "moderator", "organizer", "author"];
  const keys = [...order.filter((key) => counts.has(key)), ...[...counts.keys()].filter((key) => !order.includes(key))];
  if (!keys.length) return "";
  return `<div class="activity-filters" role="group" aria-label="Фильтр мероприятий по роли"><button class="activity-filter active" type="button" data-person-event-role="" aria-pressed="true">Все <b>${events.length}</b></button>${keys.map((key) => `<button class="activity-filter" type="button" data-person-event-role="${esc(key)}" aria-pressed="false">${esc(activityRoleName(key))} <b>${counts.get(key)}</b></button>`).join("")}</div>`;
}

function publicationCountChips(publications) {
  const counts = new Map();
  publications.forEach((activity) => {
    const key = cleanPublicValue(activity.publication_type) || "other";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const label = (key) => key === "other" ? "Другие" : key.charAt(0).toUpperCase() + key.slice(1);
  return `<div class="activity-filters" role="group" aria-label="Фильтр публикаций по типу"><button class="activity-filter active" type="button" data-person-publication-type="" aria-pressed="true">Все <b>${publications.length}</b></button>${[...counts].map(([key, count]) => `<button class="activity-filter" type="button" data-person-publication-type="${esc(key)}" aria-pressed="false">${esc(label(key))} <b>${count}</b></button>`).join("")}</div>`;
}

function personPage(personId) {
  const person = data.personById[personId];
  if (!person) return notFound("Персона не найдена");
  const orgs = person.organization_ids.map((id) => data.orgById[id]).filter(Boolean);
  const activities = [...(data.activitiesByPerson[personId] || [])].sort((a, b) => (b.year || 0) - (a.year || 0));
  const events = activities.filter((a) => a.activity_kind === "event_role");
  const publications = activities.filter((a) => a.activity_kind === "publication");
  const recognition = [...(data.recognitionByPerson[personId] || [])].sort((a, b) => (b.year || 0) - (a.year || 0));
  const councils = data.councilsByPerson[personId] || [];
  const practices = data.practicesByPerson[personId] || [];
  const projectLinks = data.projectLinksByPerson[personId] || [];
  const projects = projectLinks.map((x) => data.projectById[x.project_id]).filter(Boolean);
  const municipality = data.municipalityById[person.municipality_id]?.display_name;
  return `${header()}<main id="main" class="page-shell">
    <section class="detail-hero person-hero"><a class="back-link" href="#/">← Вернуться к карте</a><p class="eyebrow">Карточка персоны</p><h1>${esc(person.person_name)}</h1><p class="lead">${esc(person.person_summary || "Краткое описание пока не заполнено.")}</p>${personOrganizationIntro(person, orgs)}${roleTags(person)}</section>
    <div class="detail-layout"><div>
      <section class="detail-section"><h2>Публичная деятельность</h2><div class="fact-grid person-fact-grid">
        <div class="fact-box"><strong>${events.length}</strong><span>выступлений и экспертных участий</span></div>
        <div class="fact-box"><strong>${publications.length}</strong><span>публикаций и комментариев</span></div>
        <div class="fact-box"><strong>${councils.length}</strong><span>участий в советах</span></div>
        <div class="fact-box"><strong>${practices.length}</strong><span>практик</span></div>
      </div></section>
      ${practices.length ? `<section class="detail-section"><h2>Практики</h2>${practices.map(practiceBox).join("")}</section>` : ""}
      ${events.length ? `<section class="detail-section"><div class="section-heading-row"><h2>Выступления и экспертная работа</h2><span>${events.length}</span></div>${roleCountChips(events)}<div class="activity-list">${expandableCards(events, eventCard, 7)}</div></section>` : ""}
      ${publications.length ? `<section class="detail-section"><div class="section-heading-row"><h2>Публикации и комментарии</h2><span>${publications.length}</span></div>${publicationCountChips(publications)}<div class="publication-list">${expandableCards(publications, publicationCard, 6)}</div></section>` : ""}
      ${recognition.length ? `<section class="detail-section"><h2>Публичное признание</h2><div class="recognition-list">${recognition.map(recognitionCard).join("")}</div></section>` : ""}
      ${councils.length ? `<section class="detail-section"><h2>Советы и экспертные органы</h2><ul class="data-list council-list">${councils.map(councilCard).join("")}</ul></section>` : ""}
      ${projects.length ? `<section class="detail-section"><h2>Проекты организации</h2><ul class="data-list project-list">${projects.sort((a,b) => (b.year || 0) - (a.year || 0)).map((p) => `<li><a href="#/project/${encodeURIComponent(p.project_id)}"><strong>${esc(p.project_title)}</strong></a><small>${[p.year, p.fund, p.amount_available ? `${money.format(p.grant_amount)} ₽` : "сумма неизвестна"].filter(Boolean).map(esc).join(" · ")}</small>${p.project_goal ? `<p class="project-goal"><span>Цель:</span> ${esc(p.project_goal)}</p>` : ""}</li>`).join("")}</ul></section>` : ""}
    </div><aside>
      <section class="detail-section"><h2>Профиль</h2><ul class="data-list"><li><strong>Муниципалитет</strong><small>${esc(municipality || "Не указан")}</small></li><li><strong>Последний год активности</strong><small>${esc(person.last_activity_year || "Не указан")}</small></li></ul></section>
      <section class="detail-section"><h2>Темы</h2><div class="tags">${person.topic_ids.map((id) => `<a class="tag" href="#/topic/${encodeURIComponent(id)}">${esc(data.topicById[id]?.topic_name || id)}</a>`).join("")}</div></section>
      <section class="detail-section"><h2>Организации</h2><ul class="data-list">${orgs.map((o) => `<li><a href="#/organization/${encodeURIComponent(o.org_id)}"><strong>${esc(o.organization_name_short || o.organization_name)}</strong></a><small>${esc(o.org_profile_type || "")}</small></li>`).join("") || `<li><small>Связи не указаны</small></li>`}</ul></section>
    </aside></div>
  </main>${footer()}`;
}

function topicPage(topicId) {
  const topic = data.topicById[topicId];
  if (!topic) return notFound("Тема не найдена");
  const scope = computeScope({ municipalityId: "", topicId, roleId: "", fund: "", year: "", orgProfile: "" });
  const practices = data.practices.filter((p) => p.primary_topic_id === topicId);
  const activities = (data.activitiesByTopic[topicId] || []).filter((a) => a.person_evidence_status === "person_verified");
  const roleCounts = data.roles.map((r) => ({ ...r, count: scope.people.filter((p) => p.role_ids.includes(r.role_id)).length })).filter((r) => r.count);
  const municipalityRows = data.municipalities.map((m) => ({ m, s: computeScope({ municipalityId: m.municipality_id, topicId, roleId: "", fund: "", year: "", orgProfile: "" }) })).filter((x) => x.s.organizations.length || x.s.projects.length || x.s.people.length);
  return `${header()}<main id="main" class="page-shell">
    <section class="detail-hero" style="border-top:7px solid #E51A4B"><a class="back-link" href="#/">← Вернуться к карте</a><p class="eyebrow">Карточка темы</p><h1>${esc(topic.topic_name)}</h1><p class="lead">Организации учитываются по основной теме организации; проекты и финансирование — по теме конкретного проекта.</p><div class="fact-grid"><div class="fact-box"><strong>${scope.organizations.length}</strong><span>организаций</span></div><div class="fact-box"><strong>${scope.projects.length}</strong><span>проектов</span></div><div class="fact-box"><strong>${scope.people.length}</strong><span>персон</span></div></div></section>
    <div class="detail-layout"><div>
      <section class="detail-section"><h2>Лидеры темы</h2><div class="people-list">${[...scope.people].sort((a,b) => b.confirmations_count-a.confirmations_count).map(personCard).join("") || `<div class="empty">Нет персон</div>`}</div></section>
      ${practices.length ? `<section class="detail-section"><h2>Тиражируемые практики</h2>${practices.map(practiceBox).join("")}</section>` : ""}
      <section class="detail-section"><h2>Проекты</h2><ul class="data-list">${scope.projects.slice(0, 40).map((p) => `<li><a href="#/project/${encodeURIComponent(p.project_id)}"><strong>${esc(p.project_title)}</strong></a><small>${[p.year, p.fund].filter(Boolean).map(esc).join(" · ")}</small>${p.project_goal ? `<p class="project-goal"><span>Цель:</span> ${esc(p.project_goal)}</p>` : ""}</li>`).join("") || `<li><small>Нет проектов</small></li>`}</ul>${scope.projects.length > 40 ? `<p class="notice">Показаны первые 40 из ${scope.projects.length} проектов.</p>` : ""}</section>
    </div><aside>
      <section class="detail-section"><h2>Роли</h2><ul class="data-list">${roleCounts.map((r) => `<li><strong>${esc(r.role_name)}</strong><small>${r.count} персон</small></li>`).join("") || `<li><small>Нет подтверждённых ролей</small></li>`}</ul></section>
      <section class="detail-section"><h2>Муниципалитеты</h2><ul class="data-list">${municipalityRows.map(({m,s}) => `<li><strong>${esc(m.display_name)}</strong><small>${s.organizations.length} организаций · ${s.projects.length} проектов · ${s.people.length} персон</small></li>`).join("")}</ul></section>
      <section class="detail-section"><h2>Публичные подтверждения</h2><p>${activities.length} именных фактов по теме.</p></section>
    </aside></div>
  </main>${footer()}`;
}

function organizationPage(orgId) {
  const org = data.orgById[orgId];
  if (!org) return notFound("Организация не найдена");
  const topic = data.topicById[org.primary_topic_id];
  const municipality = data.municipalityById[org.municipality_id];
  const people = (data.personLinksByOrg[orgId] || []).map((l) => data.personById[l.person_id]).filter(Boolean);
  const projects = data.projectsByOrg[orgId] || [];
  const known = projects.filter((p) => p.amount_available);
  const websites = [...(org.website_urls || []), ...(org.social_urls || [])].map(urlSafe).filter(Boolean);
  return `${header()}<main id="main" class="page-shell"><section class="detail-hero"><a class="back-link" href="#/">← Вернуться к карте</a><p class="eyebrow">Карточка организации</p><h1>${esc(org.organization_name_short || org.organization_name)}</h1><p class="lead">${esc(org.organization_name)}</p><div class="fact-grid"><div class="fact-box"><strong>${projects.length}</strong><span>проектов</span></div><div class="fact-box"><strong>${compact.format(sumKnownFunding(projects))} ₽</strong><span>известное финансирование</span></div><div class="fact-box"><strong>${people.length}</strong><span>связанных персон</span></div></div></section>
  <div class="detail-layout"><div><section class="detail-section"><h2>Проекты</h2><ul class="data-list">${projects.map((p) => `<li><a href="#/project/${encodeURIComponent(p.project_id)}"><strong>${esc(p.project_title)}</strong></a><small>${esc(p.year)} · ${esc(p.fund)} · ${p.amount_available ? `${money.format(p.grant_amount)} ₽` : "сумма неизвестна"}${p.project_goal ? ` · Цель: ${esc(p.project_goal)}` : ""}</small></li>`).join("") || `<li><small>Нет проектов</small></li>`}</ul></section></div><aside><section class="detail-section"><h2>Профиль</h2><ul class="data-list"><li><strong>Муниципалитет</strong><small>${esc(municipality?.display_name || "Не указан")}</small></li><li><strong>Тема</strong><small><a href="#/topic/${encodeURIComponent(org.primary_topic_id)}">${esc(topic?.topic_name || "Не указана")}</a></small></li><li><strong>Профиль</strong><small>${esc(org.org_profile_type || "Не указан")}</small></li><li><strong>Известные суммы</strong><small>${known.length} из ${projects.length} проектов</small></li></ul>${websites.map((x) => `<p><a class="source-link" target="_blank" rel="noopener noreferrer" href="${esc(x)}">Внешняя ссылка ↗</a></p>`).join("")}</section><section class="detail-section"><h2>Люди</h2>${people.map(personCard).join("") || `<div class="empty">Связи не указаны</div>`}</section></aside></div></main>${footer()}`;
}

function projectPage(projectId) {
  const p = data.projectById[projectId];
  if (!p) return notFound("Проект не найден");
  const org = data.orgById[p.org_id];
  const topic = data.topicById[p.topic_id];
  const municipality = data.municipalityById[p.municipality_id];
  return `${header()}<main id="main" class="page-shell"><section class="detail-hero"><a class="back-link" href="#/">← Вернуться к карте</a><p class="eyebrow">Карточка проекта</p><h1>${esc(p.project_title)}</h1>${p.project_goal ? `<p class="lead"><strong>Цель:</strong> ${esc(p.project_goal)}</p>` : ""}</section><div class="detail-layout"><div><section class="detail-section"><h2>Основные сведения</h2><ul class="data-list"><li><strong>Организация</strong><small><a href="#/organization/${encodeURIComponent(p.org_id)}">${esc(org?.organization_name_short || org?.organization_name || p.org_id)}</a></small></li><li><strong>Тема проекта</strong><small><a href="#/topic/${encodeURIComponent(p.topic_id)}">${esc(topic?.topic_name || p.topic_id)}</a></small></li><li><strong>Муниципалитет</strong><small>${esc(municipality?.display_name || "Не указан")}</small></li></ul></section></div><aside><section class="detail-section"><h2>Финансирование</h2><div class="fact-box"><strong>${p.amount_available ? `${money.format(p.grant_amount)} ₽` : "Сумма не указана"}</strong><span>${esc(p.fund || "Фонд не указан")} · ${esc(p.year || "Год не указан")}</span></div></section></aside></div></main>${footer()}`;
}

function notFound(title) {
  return `${header()}<main id="main" class="page-shell"><section class="error-card"><h1>${esc(title)}</h1><p><a href="#/">Вернуться на главную</a></p></section></main>${footer()}`;
}

function parseRoute() {
  const path = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { section: path[0] || "home", id: decodeURIComponent(path[1] || "") };
}

function render() {
  const route = parseRoute();
  if (route.section === "person") app.innerHTML = personPage(route.id);
  else if (route.section === "topic") app.innerHTML = topicPage(route.id);
  else if (route.section === "organization") app.innerHTML = organizationPage(route.id);
  else if (route.section === "project") app.innerHTML = projectPage(route.id);
  else app.innerHTML = mainPage();
  bindCommon();
  if (route.section === "home") bindMain();
  if (route.section === "person") bindPerson();
  document.title = route.section === "home" ? data.config.title : `${document.querySelector("h1")?.textContent || "Карточка"} — ${data.config.title}`;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function bindCommon() {
  const input = document.querySelector("#global-search-input");
  const results = document.querySelector("#search-results");
  if (!input || !results) return;
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("ru");
    if (query.length < 2) { results.classList.add("hidden"); results.innerHTML = ""; return; }
    const contains = (value) => String(value || "").toLocaleLowerCase("ru").includes(query);
    const people = data.people.filter((p) => contains(p.person_name)).slice(0, 6);
    const orgs = data.organizations.filter((o) => contains(o.organization_name) || contains(o.organization_name_short)).slice(0, 5);
    const projects = data.projects.filter((p) => contains(p.project_title) || contains(p.project_goal)).slice(0, 5);
    const block = (title, items, renderer) => items.length ? `<div class="search-section-title">${title}</div>${items.map(renderer).join("")}` : "";
    results.innerHTML = block("Люди", people, (p) => `<a class="search-item" role="option" href="#/person/${encodeURIComponent(p.person_id)}">${esc(p.person_name)}<small>${esc(data.municipalityById[p.municipality_id]?.display_name || "")}</small></a>`) +
      block("Организации", orgs, (o) => `<a class="search-item" role="option" href="#/organization/${encodeURIComponent(o.org_id)}">${esc(o.organization_name_short || o.organization_name)}<small>${esc(data.topicById[o.primary_topic_id]?.topic_short_name || "")}</small></a>`) +
      block("Проекты", projects, (p) => `<a class="search-item" role="option" href="#/project/${encodeURIComponent(p.project_id)}">${esc(p.project_title)}<small>${esc(p.year || "")} · ${esc(p.fund || "")}</small></a>`);
    if (!results.innerHTML) results.innerHTML = `<div class="empty">Совпадений нет</div>`;
    results.classList.remove("hidden");
  });
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") results.classList.add("hidden"); });
  document.addEventListener("click", (event) => { if (!event.target.closest(".global-search")) results.classList.add("hidden"); }, { once: true });
}

function bindMain() {
  document.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", () => { state[select.dataset.filter] = select.value; render(); }));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { state.mode = button.dataset.mode; render(); }));
  document.querySelectorAll("[data-municipality]").forEach((button) => button.addEventListener("click", () => { state.municipalityId = state.municipalityId === button.dataset.municipality ? "" : button.dataset.municipality; render(); }));
  document.querySelectorAll("[data-topic]").forEach((button) => button.addEventListener("click", () => { state.topicId = state.topicId === button.dataset.topic ? "" : button.dataset.topic; render(); }));
  document.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => { state.roleId = state.roleId === button.dataset.role ? "" : button.dataset.role; render(); }));
  document.querySelectorAll("[data-clear-filter]").forEach((button) => button.addEventListener("click", () => { state[button.dataset.clearFilter] = ""; render(); }));
  document.querySelector("[data-action='toggle-more']")?.addEventListener("click", () => { state.moreOpen = !state.moreOpen; render(); });
  document.querySelector("[data-action='reset']")?.addEventListener("click", () => {
    Object.assign(state, { municipalityId: "", topicId: "", roleId: "", fund: "", year: "", orgProfile: "" });
    render();
  });
}

function bindPerson() {
  const bindFilter = ({ buttonSelector, itemSelector, buttonKey, itemKey }) => {
    const buttons = [...document.querySelectorAll(buttonSelector)];
    const items = [...document.querySelectorAll(itemSelector)];
    buttons.forEach((button) => button.addEventListener("click", () => {
      const value = button.dataset[buttonKey] || "";
      buttons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      items.forEach((item) => { item.hidden = Boolean(value) && item.dataset[itemKey] !== value; });
      button.closest(".detail-section")?.querySelectorAll(".content-more").forEach((details) => { details.open = Boolean(value); });
    }));
  };
  bindFilter({ buttonSelector: "[data-person-event-role]", itemSelector: "[data-event-item]", buttonKey: "personEventRole", itemKey: "eventRole" });
  bindFilter({ buttonSelector: "[data-person-publication-type]", itemSelector: "[data-publication-item]", buttonKey: "personPublicationType", itemKey: "publicationType" });
}

async function start() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    buildIndexes();
    window.addEventListener("hashchange", render);
    render();
  } catch (error) {
    app.innerHTML = `<main class="error-card"><h1>Не удалось загрузить данные</h1><p>Откройте сайт через HTTP-сервер, а не напрямую как локальный файл.</p><pre>${esc(error.message)}</pre></main>`;
  }
}

start();
