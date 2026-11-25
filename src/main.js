import "./style.css";
import { fetchPlayer } from "./api.js";
import {
  outcome,
  standardMatches,
  summarize,
  STEAM_BASE,
  parsePlayerInput,
} from "./stats.js";
import heroes from "./heroes.json";
import samples from "./samples.json";

const app = document.querySelector("#app");
const arrow = '<span aria-hidden="true">↗</span>';
const state = {
  input: "",
  player: null,
  loading: false,
  error: "",
  errorTitle: "Couldn’t load this player.",
  candidates: [],
  limit: 20,
  show: 8,
  tab: "matches",
};
let request = 0;
let controller;
const playerCache = new Map();
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (n) => n.toLocaleString();
const percent = (n) => (n === null ? "—" : `${n.toFixed(0)}%`);
const ratio = (n) => (n === null ? "—" : n.toFixed(2));
const heroName = (id) => heroes[id]?.name ?? `Hero ${id}`;
function image(url, alt, cls = "") {
  if (
    !url ||
    !/^https:\/\/(assets-bucket\.deadlock-api\.com|avatars\.steamstatic\.com)\//.test(
      url,
    )
  )
    return `<span class="portrait placeholder ${cls}" aria-hidden="true">D</span>`;
  return `<img class="portrait ${cls}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" />`;
}
const heroImage = (id) => image(heroes[id]?.image, heroName(id));
const date = (t) =>
  new Date(t * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const time = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function header() {
  return `<header class="site-header"><a href="${esc(location.pathname)}" class="brand" aria-label="Deadlock Stats home"><span class="brand-mark">D<span>•</span></span><span>DEADLOCK<span class="brand-sub">STATS / PLAYER INTELLIGENCE</span></span></a><a class="github-link" href="https://github.com/junyahonda/deadlock-stats" target="_blank" rel="noreferrer">Open source ${arrow}</a><span class="header-pill"><i></i> THE STREETS ARE WATCHING</span></header>`;
}

function search() {
  return `<section class="search-section" aria-labelledby="search-title"><div class="eyebrow"><span class="tiny-line"></span> YOUR GAME, IN FOCUS</div><div class="intro-grid"><div><h1 id="search-title">Know your game.<br><em>Own the next one.</em></h1><p class="intro">Every match tells a story. Find your form, your heroes,<br class="desktop-break"> and your next edge.</p></div><div class="hero-art" aria-hidden="true"><span class="art-orbit"></span>${[4, 1, 7].map((id) => `<img src="${esc(heroes[id]?.card)}" alt="" />`).join("")}<span class="art-stamp">EVERY MATCH.<br>A NEW STORY.</span></div></div><form id="search-form" novalidate><label for="player-input">FIND A PLAYER</label><div class="search-box"><span class="search-icon" aria-hidden="true">⌕</span><input id="player-input" name="player" type="text" value="${esc(state.input)}" placeholder="Steam ID or Steam profile link" autocomplete="off" spellcheck="false" autocapitalize="off" aria-describedby="search-hint${state.error ? " lookup-error" : ""}" ${state.error ? 'aria-invalid="true"' : ""} /><button class="primary" type="submit" ${state.loading ? "disabled" : ""}>${state.loading ? "Searching…" : "Look up player"} <span aria-hidden="true">→</span></button></div><p id="search-hint" class="input-hint">Steam ID64, account ID, or steamcommunity.com/id/your-name</p></form><div class="quick-profiles"><span>TRY A PLAYER</span>${samples.map((s) => `<button type="button" data-lookup="${s.id}">${esc(s.profile.personaname)} ${arrow}</button>`).join("")}</div>${state.error ? `<div class="notice error" id="lookup-error" role="alert"><strong>Couldn’t load this player.</strong> ${esc(state.error)} <button type="button" data-demo="0">Explore a saved demo →</button></div>` : ""}</section>`;
}

function landing() {
  return `<section class="landing"><div class="section-label"><span>THE MATCH IS ONLY HALF THE STORY</span><span>01 — THE NUMBERS</span></div><div class="feature-grid"><article><span class="feature-number">01 /</span><h2>Find your form.</h2><p>Recent wins, losses, and your KDA. See the bigger picture behind your last match.</p></article><article><span class="feature-number">02 /</span><h2>Meet your mains.</h2><p>Track your most-played heroes and see which ones turn your time into wins.</p></article><article><span class="feature-number">03 /</span><h2>Straight from the source.</h2><p>Live public stats, no sign-in required. Your Steam profile is all you need.</p></article></div><div class="demo-strip"><div><strong>Just looking around?</strong><span>Explore saved profiles. No API connection needed.</span></div><div>${samples.map((s, i) => `<button class="text-button" data-demo="${i}">${esc(s.profile.personaname)} ${arrow}</button>`).join("")}</div></div></section>`;
}

function matchList(matches) {
  return `<div class="match-head"><span>RESULT / HERO</span><span>K / D / A</span><span>SOULS</span><span>TIME</span></div><div class="match-list">${matches
    .slice(0, state.show)
    .map((m) => {
      const result = outcome(m);
      return `<article class="match-row ${result}"><div class="match-identity"><span class="result-dot" aria-label="${result}">${result === "win" ? "W" : result === "loss" ? "L" : "–"}</span>${heroImage(m.hero_id)}<div><strong>${esc(heroName(m.hero_id))}</strong><small>${date(m.start_time)} <span>· ${result === "win" ? "Victory" : result === "loss" ? "Defeat" : "Unscored"}</span></small></div></div><div class="match-kda"><strong>${m.player_kills} <b>/</b> ${m.player_deaths} <b>/</b> ${m.player_assists}</strong><small>${ratio((m.player_kills + m.player_assists) / Math.max(1, m.player_deaths))} KDA</small></div><div class="match-souls">${(m.net_worth / 1000).toFixed(1)}k</div><div class="match-time">${time(m.match_duration_s)}<small>#${m.match_id}</small></div></article>`;
    })
    .join(
      "",
    )}</div>${state.show < matches.length ? `<button class="load-more" data-more>Show more matches <span aria-hidden="true">↓</span></button>` : ""}`;
}

function heroList(heroStats, all = false) {
  return `<div class="hero-list ${all ? "expanded" : ""}">${heroStats
    .slice(0, all ? Infinity : 5)
    .map((h, i) => {
      const stats = summarize(h.matches);
      return `<article class="hero-row"><span class="hero-index">${String(i + 1).padStart(2, "0")}</span>${heroImage(h.id)}<div class="hero-detail"><strong>${esc(heroName(h.id))}</strong><small>${h.matches.length} ${h.matches.length === 1 ? "match" : "matches"} · ${ratio(stats.kda)} KDA</small><div class="hero-bar"><i style="width:${stats.winRate ?? 0}%"></i></div></div><div class="hero-rate">${percent(stats.winRate)}<small>win rate</small></div></article>`;
    })
    .join("")}</div>`;
}

function results() {
  const player = state.player;
  const all = standardMatches(player.matches);
  const matches = all.slice(0, state.limit);
  const stats = summarize(matches);
  return `<section class="results" aria-labelledby="player-title"><div class="profile-top"><div class="profile-identity">${image(player.profile.avatarfull, "", "avatar")}<div><div class="profile-overline">PLAYER DOSSIER <span class="data-badge ${player.demo ? "demo" : ""}"><i></i>${player.demo ? "SAVED DEMO" : player.stored ? "STORED API DATA" : "LIVE API"}</span></div><h2 id="player-title">${esc(player.profile.personaname)}</h2><a class="steam-link" href="https://steamcommunity.com/profiles/${STEAM_BASE + BigInt(player.id)}" target="_blank" rel="noreferrer">Steam · ${player.id} ${arrow}</a></div></div><button class="refresh" data-lookup="${player.id}" aria-label="Refresh live player stats">↻ <span>${player.demo ? "Load live" : "Refresh"}</span></button></div>${player.demo ? `<div class="notice demo-notice">You’re viewing a saved snapshot from ${new Date(player.fetchedAt).toLocaleDateString()}. These are sample stats, not live results. <button data-lookup="${player.id}">Try live stats →</button></div>` : ""}<div class="scope-row"><p>${matches.length ? `Showing the latest <strong>${matches.length}</strong> indexed standard matches` : "No indexed standard matches yet"}</p><label class="range-control">Match window <select id="match-window" aria-label="Match window">${[20, 50, 100].map((n) => `<option value="${n}" ${state.limit === n ? "selected" : ""}>Last ${n}</option>`).join("")}</select></label></div>${
    matches.length
      ? `<div class="stat-grid"><article class="stat-card featured"><span>WIN RATE</span><strong>${percent(stats.winRate)}<span class="stat-arrow" aria-hidden="true">↗</span></strong><small>${stats.wins} wins <b>·</b> ${stats.losses} losses${stats.scored < stats.total ? ` · ${stats.total - stats.scored} unscored` : ""}</small></article><article class="stat-card"><span>KDA RATIO</span><strong>${ratio(stats.kda)}</strong><small>(kills + assists) / deaths</small></article><article class="stat-card"><span>AVG. K / D / A</span><strong class="avg-kda">${(stats.kills / stats.total).toFixed(1)}<b>/</b>${(stats.deaths / stats.total).toFixed(1)}<b>/</b>${(stats.assists / stats.total).toFixed(1)}</strong><small>per indexed match</small></article><article class="stat-card"><span>HEROES PLAYED</span><strong>${String(stats.heroes.length).padStart(2, "0")}</strong><small>in this match window</small></article></div><div class="dashboard-grid"><section class="matches-panel"><div class="panel-heading"><div class="tabs" role="tablist" aria-label="Player stats"><button id="matches-tab" role="tab" aria-controls="stats-panel" aria-selected="${state.tab === "matches"}" data-tab="matches">Recent matches</button><button id="heroes-tab" role="tab" aria-controls="stats-panel" aria-selected="${state.tab === "heroes"}" data-tab="heroes">Heroes <span>${stats.heroes.length}</span></button></div><span class="panel-note">${state.tab === "matches" ? "NEWEST FIRST" : "MOST PLAYED FIRST"}</span></div><div id="stats-panel" role="tabpanel" aria-labelledby="${state.tab}-tab">${state.tab === "matches" ? matchList(matches) : heroList(stats.heroes, true)}</div></section><aside class="top-heroes"><div class="panel-heading"><h3>Your most played</h3><span>HEROES</span></div>${heroList(stats.heroes)}<div class="form-box"><span>RECENT FORM</span><div class="form-blocks">${matches
          .slice(0, 10)
          .reverse()
          .map(
            (m) =>
              `<span class="${outcome(m)}" title="${esc(heroName(m.hero_id))}: ${outcome(m)}">${outcome(m) === "win" ? "W" : outcome(m) === "loss" ? "L" : "–"}</span>`,
          )
          .join(
            "",
          )}</div><small>Oldest <span aria-hidden="true">────────→</span> Newest</small></div></aside></div>`
      : `<div class="empty-state"><h3>No matches found. A fresh start?</h3><p>This player may be new, private, or not indexed by the API. Try another Steam profile or one of the saved demos.</p><button class="text-button" data-demo="0">Explore a saved demo →</button></div>`
  }<p class="data-footnote">${player.demo ? "Snapshot" : "Fetched"} ${new Date(player.fetchedAt).toLocaleString()} · Standard PvP only. API coverage can be incomplete or delayed. Win rate excludes unscored matches; KDA divides by at least one death.</p></section>`;
}

function render() {
  app.innerHTML = `${header()}<main>${search()}<div id="result-region" aria-live="polite" aria-busy="${state.loading}">${state.loading ? '<section class="loading-state" role="status"><span class="spinner"></span><h2>Reading the streets…</h2><p>Fetching this player’s latest indexed matches.</p></section>' : state.player ? results() : landing()}</div></main><footer><a class="footer-brand" href="${esc(location.pathname)}">DEADLOCK<span> / STATS</span></a><p>An independent fan project. Not affiliated with Valve.<br>Data & hero art by <a href="https://deadlock-api.com" target="_blank" rel="noreferrer">Deadlock API ${arrow}</a>. Deadlock belongs to Valve.</p><span class="footer-end">PLAY. LEARN. QUEUE AGAIN.</span></footer>`;
  updateSearchGuidance();
}

function playerChoices() {
  return `<section class="player-choices" aria-labelledby="choice-title"><h2 id="choice-title" tabindex="-1">Choose a player</h2><p>Check the account ID: several people can share a display name.</p>${state.candidates.map((p) => `<button type="button" data-lookup="${Number(p.account_id)}">${image(p.avatarfull, "")}<span><strong>${esc(p.personaname)}</strong><small>Steam account ${Number(p.account_id)}</small></span><span aria-hidden="true">→</span></button>`).join("")}</section>`;
}

function updateSearchGuidance() {
  document.querySelector("#search-hint").textContent =
    "Steam ID, custom or display name, profile link, or s.team/p/ share link";
  document.querySelector("#player-input").placeholder =
    "Steam ID, player name, or profile link";
  const errorTitle = document.querySelector("#lookup-error strong");
  if (errorTitle) errorTitle.textContent = state.errorTitle;
  const fallback = document.querySelector("#lookup-error [data-demo]");
  if (fallback && state.player) {
    const index = samples.findIndex((s) => s.id === state.player.id);
    if (index >= 0) fallback.dataset.demo = String(index);
  }
  const region = document.querySelector("#result-region");
  if (state.player && state.loading) {
    region.innerHTML = `<div class="notice" role="status">Updating stats. Your previous results remain below until the new lookup completes.</div>${results()}`;
  }
  if (state.player && state.error && !state.candidates.length) {
    region.insertAdjacentHTML(
      "afterbegin",
      '<p class="notice">Showing the previous results. The latest lookup did not replace this dashboard.</p>',
    );
  }
  if (state.player && !state.player.demo) {
    const player = state.player;
    const link = region.querySelector(".steam-link");
    if (link && player.profileStatus !== "found") {
      link.removeAttribute("href");
      link.textContent = `Account ${player.id} · ${player.profileStatus === "loading" ? "name loading…" : "Steam profile unverified"}`;
    }
    if (player.profileStatus === "missing" && !player.matches.length) {
      const badge = region.querySelector(".data-badge");
      if (badge) badge.textContent = "NO PROFILE DATA";
      const heading = region.querySelector(".empty-state h3");
      if (heading) heading.textContent = "No indexed player or matches found.";
    }
    if (player.invalidMatches)
      region.insertAdjacentHTML(
        "beforeend",
        '<p class="notice">Some unreadable match records were excluded. Stats cover the valid records only.</p>',
      );
  }
  const heading = region.querySelector("#player-title");
  heading?.setAttribute("tabindex", "-1");
  if (state.candidates.length) {
    document.querySelector("#result-region").innerHTML = playerChoices();
    document.querySelector("#player-input").removeAttribute("aria-invalid");
    const title = document.querySelector("#choice-title");
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "start" });
  }
}

function revealResults() {
  const results = document.querySelector(".results");
  if (!results) return;
  document.activeElement?.blur();
  const title = document.querySelector("#player-title");
  title?.setAttribute("tabindex", "-1");
  title?.focus({ preventScroll: true });
  results.scrollIntoView({ behavior: "instant", block: "start" });
}

function rememberPlayer(player, navigation = "push") {
  const key = `${player.demo ? "demo" : "live"}:${player.id}`;
  playerCache.set(key, player);
  if (playerCache.size > 12)
    playerCache.delete(playerCache.keys().next().value);
  if (navigation !== "none") {
    const url = `${location.pathname}?${player.demo ? "demo" : "player"}=${player.id}`;
    const method =
      navigation === "replace" || location.pathname + location.search === url
        ? "replaceState"
        : "pushState";
    history[method]({ key }, "", url);
  }
}

function renderKeepPosition() {
  const active = document.activeElement;
  const activeId = active?.id;
  const selection =
    active?.id === "player-input"
      ? [active.selectionStart, active.selectionEnd]
      : null;
  const scroll = window.scrollY;
  render();
  const next = activeId && document.getElementById(activeId);
  next?.focus({ preventScroll: true });
  if (selection) next?.setSelectionRange(...selection);
  window.scrollTo(0, scroll);
}

async function lookup(value, { navigation = "push" } = {}) {
  controller?.abort();
  controller = new AbortController();
  const activeController = controller;
  const serial = ++request;
  state.input = String(value);
  state.loading = true;
  state.error = "";
  state.candidates = [];
  state.errorTitle = "Couldn’t load this player.";
  try {
    parsePlayerInput(state.input);
  } catch (error) {
    state.loading = false;
    state.error = error.message;
    state.errorTitle = state.input.trim()
      ? "Check the player input."
      : "Enter a player to start.";
    render();
    return;
  }
  render();
  const timeout = setTimeout(() => activeController.abort(), 20000);
  try {
    const player = await fetchPlayer(state.input, activeController.signal);
    if (serial !== request) return;
    state.player = player;
    state.show = 8;
    state.tab = "matches";
    rememberPlayer(player, navigation);
    player.profilePromise.then(({ profile, status }) => {
      if (serial !== request || state.player !== player) return;
      if (profile) player.profile = profile;
      player.profileStatus = status;
      renderKeepPosition();
    });
  } catch (error) {
    if (serial !== request) return;
    state.error =
      error.name === "AbortError"
        ? "The request took too long. Please try again or open a saved demo."
        : error.message;
    state.candidates = error.candidates ?? [];
    if (state.candidates.length) state.errorTitle = "Choose a player.";
  } finally {
    clearTimeout(timeout);
    if (serial === request) {
      state.loading = false;
      render();
      if (state.player) revealResults();
    }
  }
}

app.addEventListener("submit", (event) => {
  if (event.target.id !== "search-form") return;
  event.preventDefault();
  lookup(new FormData(event.target).get("player"));
});
app.addEventListener("input", (event) => {
  if (event.target.id === "player-input") {
    state.input = event.target.value;
    if (state.loading) {
      controller?.abort();
      request++;
      state.loading = false;
      state.error =
        "The lookup was canceled because the input changed. Submit the new player when ready.";
      state.errorTitle = "Input changed.";
      renderKeepPosition();
    }
  }
});

function showSavedPlayer(player, navigation = "push") {
  controller?.abort();
  request++;
  state.player = player;
  state.input = String(player.id);
  state.loading = false;
  state.error = "";
  state.candidates = [];
  state.show = 8;
  state.tab = "matches";
  rememberPlayer(player, navigation);
  render();
  revealResults();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.lookup) lookup(button.dataset.lookup);
  if (button.dataset.demo !== undefined) {
    showSavedPlayer(samples[Number(button.dataset.demo)]);
  }
  if (button.dataset.tab) {
    state.tab = button.dataset.tab;
    render();
    document.querySelector(`#${state.tab}-tab`)?.focus({ preventScroll: true });
  }
  if (button.hasAttribute("data-more")) {
    const scroll = window.scrollY;
    state.show += 8;
    render();
    window.scrollTo(0, scroll);
  }
});
app.addEventListener("keydown", (event) => {
  if (
    !event.target.matches('[role="tab"]') ||
    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
  )
    return;
  event.preventDefault();
  state.tab =
    event.key === "Home"
      ? "matches"
      : event.key === "End"
        ? "heroes"
        : state.tab === "matches"
          ? "heroes"
          : "matches";
  render();
  document.querySelector(`#${state.tab}-tab`)?.focus({ preventScroll: true });
});
app.addEventListener("change", (event) => {
  if (event.target.id === "match-window") {
    state.limit = Number(event.target.value);
    state.show = 8;
    render();
    document.querySelector("#match-window")?.focus({ preventScroll: true });
  }
});
app.addEventListener(
  "error",
  (event) => {
    if (event.target.tagName === "IMG")
      event.target.style.visibility = "hidden";
  },
  true,
);
render();
const initialPlayer = new URLSearchParams(location.search).get("player");
const initialDemo = new URLSearchParams(location.search).get("demo");
if (initialPlayer) lookup(initialPlayer, { navigation: "replace" });
else if (initialDemo && samples.some((s) => s.id === Number(initialDemo)))
  showSavedPlayer(
    samples.find((s) => s.id === Number(initialDemo)),
    "replace",
  );
else history.replaceState({ page: "home" }, "", location.href);

window.addEventListener("popstate", () => {
  const cached = playerCache.get(history.state?.key);
  if (cached) return showSavedPlayer(cached, "none");
  const params = new URLSearchParams(location.search);
  const demo = samples.find((s) => s.id === Number(params.get("demo")));
  if (demo) return showSavedPlayer(demo, "none");
  if (params.get("player"))
    return lookup(params.get("player"), { navigation: "none" });
  controller?.abort();
  request++;
  Object.assign(state, {
    player: null,
    input: "",
    loading: false,
    error: "",
    candidates: [],
  });
  render();
  window.scrollTo(0, 0);
});
