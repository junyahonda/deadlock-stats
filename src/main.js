import "./style.css";
import { fetchPlayer } from "./api.js";
import {
  outcome,
  outcomeDescription,
  outcomeMark,
  standardMatches,
  summarize,
  STEAM_BASE,
  parsePlayerInput,
} from "./stats.js";
import heroes from "./heroes.json";
import geistCard from "./art/hero-4.webp";
import infernusCard from "./art/hero-1.webp";
import wraithCard from "./art/hero-7.webp";
import { sampleProfiles as samples, loadSample } from "./samples.js";
import { KEY as PLAYERS_KEY, readPlayers, writePlayers, upsertPlayer } from "./storage.js";
import { Intelligence, personalBest } from "./insights-ui.js";
import { playerPath, playerTab, tierPath, readRoute, writeNavigation } from "./navigation.js";

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
  page: "player",
  hero: null,
};
let request = 0;
let controller;
const playerCache = new Map();
let recentPlayers = readPlayers();
const intelligence = new Intelligence(() => renderKeepPosition());
const heroCards = { 4: geistCard, 1: infernusCard, 7: wraithCard };
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
  return `<section class="search-section" aria-labelledby="search-title"><div class="eyebrow"><span class="tiny-line"></span> YOUR GAME, IN FOCUS</div><div class="intro-grid"><div><h1 id="search-title">Know your game.<br><em>Own the next one.</em></h1><p class="intro">Every match tells a story. Find your form, your heroes,<br class="desktop-break"> and your next edge.</p></div><div class="hero-art" aria-hidden="true"><span class="art-orbit"></span>${[4, 1, 7].map((id) => `<img loading="lazy" decoding="async" src="${heroCards[id]}" alt="" />`).join("")}<span class="art-stamp">EVERY MATCH.<br>A NEW STORY.</span></div></div><form id="search-form" novalidate><label for="player-input">FIND A PLAYER</label><div class="search-box"><span class="search-icon" aria-hidden="true">⌕</span><input id="player-input" name="player" type="text" value="${esc(state.input)}" placeholder="Steam ID or Steam profile link" autocomplete="off" spellcheck="false" autocapitalize="off" aria-describedby="search-hint${state.error ? " lookup-error" : ""}" ${state.error ? 'aria-invalid="true"' : ""} /><button class="primary" type="submit" ${state.loading ? "disabled" : ""}>${state.loading ? "Searching…" : "Look up player"} <span aria-hidden="true">→</span></button></div><p id="search-hint" class="input-hint">Steam ID64, account ID, or steamcommunity.com/id/your-name</p></form><div class="quick-profiles"><span>TRY A LIVE PLAYER · ONLINE</span>${samples.map((s) => `<button type="button" data-lookup="${s.id}">${esc(s.profile.personaname)} ${arrow}</button>`).join("")}</div>${state.error ? `<div class="notice error" id="lookup-error" role="alert"><strong>Couldn’t load this player.</strong> ${esc(state.error)} <button type="button" data-demo="0">Explore a saved demo →</button></div>` : ""}</section>`;
}

function landing() {
  return `<section class="landing"><div class="section-label"><span>THE MATCH IS ONLY HALF THE STORY</span><span>01 — THE NUMBERS</span></div><div class="feature-grid"><article><span class="feature-number">01 /</span><h2>Find your form.</h2><p>Recent wins, losses, and your KDA. See the bigger picture behind your last match.</p></article><article><span class="feature-number">02 /</span><h2>Meet your mains.</h2><p>Track your most-played heroes and see which ones turn your time into wins.</p></article><article><span class="feature-number">03 /</span><h2>Straight from the source.</h2><p>Live public stats, no sign-in required. Your Steam profile is all you need.</p></article></div><div class="demo-strip"><div><strong>Just looking around?</strong><span>Saved demo snapshots — not live stats. Available offline after download.</span></div><div>${samples.map((s, i) => `<button class="text-button" data-demo="${i}">${esc(s.profile.personaname)} · demo ${arrow}</button>`).join("")}</div></div></section>`;
}

function matchList(matches) {
  return `<div class="match-head"><span>RESULT / HERO</span><span>K / D / A</span><span>SOULS</span><span>TIME</span></div><div class="match-list">${matches
    .slice(0, state.show)
    .map((m) => {
      const result = outcome(m);
      return `<article class="match-row ${result}"><div class="match-identity"><span class="result-dot" aria-label="${esc(outcomeDescription(m))}">${outcomeMark(m)}</span>${heroImage(m.hero_id)}<div><strong>${esc(heroName(m.hero_id))}</strong><small>${date(m.start_time)} <span>· ${esc(outcomeDescription(m))}</span></small></div></div><div class="match-kda"><strong>${m.player_kills} <b>/</b> ${m.player_deaths} <b>/</b> ${m.player_assists}</strong><small>${ratio((m.player_kills + m.player_assists) / Math.max(1, m.player_deaths))} KDA${m.player_deaths === 0 ? " · deathless" : ""}</small></div><div class="match-souls">${(m.net_worth / 1000).toFixed(1)}k</div><div class="match-time">${time(m.match_duration_s)}<small>#${m.match_id}</small></div></article>`;
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
      return `<article class="hero-row"><span class="hero-index">${String(i + 1).padStart(2, "0")}</span>${heroImage(h.id)}<div class="hero-detail"><strong>${esc(heroName(h.id))}</strong><small>${h.matches.length} ${h.matches.length === 1 ? "match" : "matches"} · ${ratio(stats.kda)} KDA</small><div class="hero-bar"><i style="width:${stats.winRate ?? 0}%"></i></div></div><div class="hero-rate">${percent(stats.winRate)}<small>${stats.scored ? `win rate · ${stats.scored} scored` : "no scored results"}</small></div></article>`;
    })
    .join("")}</div>`;
}

function results() {
  const player = state.player;
  const all = standardMatches(player.matches);
  const matches = all.slice(0, state.limit);
  const stats = summarize(matches);
  return `<section class="results" aria-labelledby="player-title"><div class="profile-top"><div class="profile-identity">${image(player.profile.avatarfull, "", "avatar")}<div><div class="profile-overline">PLAYER DOSSIER <span class="data-badge ${player.demo ? "demo" : ""}"><i></i>${player.demo ? "SAVED DEMO" : player.stored ? "STORED API DATA" : "LIVE API"}</span></div><h2 id="player-title">${esc(player.profile.personaname)}</h2><a class="steam-link" href="https://steamcommunity.com/profiles/${STEAM_BASE + BigInt(player.id)}" target="_blank" rel="noreferrer">Steam · ${player.id} ${arrow}</a></div></div><button class="refresh" data-lookup="${player.id}" aria-label="Refresh live player stats">↻ <span>${player.demo ? "Load live" : "Refresh"}</span></button></div>${player.demo ? `<div class="notice demo-notice">You’re viewing a saved snapshot from ${new Date(player.fetchedAt).toLocaleDateString()}. These are sample stats, not live results. <button data-lookup="${player.id}">Try live stats →</button></div>` : ""}<div class="scope-row"><p>${matches.length ? `Showing the latest <strong>${matches.length}</strong> indexed standard ${matches.length === 1 ? "match" : "matches"}` : "No indexed standard matches yet"}</p><label class="range-control">Match window <select id="match-window" aria-label="Match window">${[20, 50, 100].map((n) => `<option value="${n}" ${state.limit === n ? "selected" : ""}>Last ${n}</option>`).join("")}</select></label></div>${
    matches.length
      ? `<div class="stat-grid"><article class="stat-card featured"><span>WIN RATE</span><strong>${percent(stats.winRate)}<span class="stat-arrow" aria-hidden="true">↗</span></strong><small>${stats.wins} wins <b>·</b> ${stats.losses} losses${stats.scored < stats.total ? ` · ${stats.total - stats.scored} unscored` : ""}</small></article><article class="stat-card"><span>KDA RATIO</span><strong>${ratio(stats.kda)}</strong><small>(kills + assists) / deaths</small></article><article class="stat-card"><span>AVG. K / D / A</span><strong class="avg-kda">${(stats.kills / stats.total).toFixed(1)}<b>/</b>${(stats.deaths / stats.total).toFixed(1)}<b>/</b>${(stats.assists / stats.total).toFixed(1)}</strong><small>per indexed match</small></article><article class="stat-card"><span>HEROES PLAYED</span><strong>${String(stats.heroes.length).padStart(2, "0")}</strong><small>in this match window</small></article></div><div class="dashboard-grid"><section class="matches-panel"><div class="panel-heading"><div class="tabs" role="tablist" aria-label="Player stats"><button id="matches-tab" role="tab" aria-controls="stats-panel" aria-selected="${state.tab === "matches"}" data-tab="matches">Recent matches</button><button id="heroes-tab" role="tab" aria-controls="stats-panel" aria-selected="${state.tab === "heroes"}" data-tab="heroes">Heroes <span>${stats.heroes.length}</span></button></div><span class="panel-note">${state.tab === "matches" ? "NEWEST FIRST" : "MOST PLAYED FIRST"}</span></div><div id="stats-panel" role="tabpanel" aria-labelledby="${state.tab}-tab">${state.tab === "matches" ? matchList(matches) : heroList(stats.heroes, true)}</div></section><aside class="top-heroes"><div class="panel-heading"><h3>Your most played</h3><span>HEROES</span></div>${heroList(stats.heroes)}<div class="form-box"><span>RECENT FORM</span><div class="form-blocks">${matches
          .slice(0, 10)
          .reverse()
          .map(
            (m) =>
              `<span class="${outcome(m)}" title="${esc(heroName(m.hero_id))}: ${esc(outcomeDescription(m))}">${outcomeMark(m)}</span>`,
          )
          .join(
            "",
          )}</div><small>Oldest <span aria-hidden="true">────────→</span> Newest</small></div></aside></div>`
      : `<div class="empty-state"><h3>No matches found. A fresh start?</h3><p>This player may be new, private, or not indexed by the API. Try another Steam profile or one of the saved demos.</p><button class="text-button" data-demo="0">Explore a saved demo →</button></div>`
  }<p class="data-footnote">${player.demo ? "Snapshot" : "Fetched"} ${new Date(player.fetchedAt).toLocaleString()} · Standard PvP only. API coverage can be incomplete or delayed. Win rate counts only scored wins/losses; penalties, not-scored and unavailable scores are excluded. Team results are separate from scoring eligibility. KDA divides by at least one death.</p></section>`;
}

function render() {
  app.innerHTML = `${header()}<nav class="site-nav" aria-label="Main navigation"><button id="nav-player" data-player-page ${state.page === "player" ? 'aria-current="page"' : ""}>Player stats</button><button id="nav-tiers" data-hero-page="" ${state.page === "tiers" ? 'aria-current="page"' : ""}>Hero tier list</button></nav><main>${state.page === "tiers" ? intelligence.tierPage(state.hero) : `${search()}<div id="result-region" aria-live="polite" aria-busy="${state.loading}">${state.loading ? '<section class="loading-state" role="status"><span class="spinner"></span><h2>Reading the streets…</h2><p>Fetching this player’s latest indexed matches.</p></section>' : state.player ? results() : landing()}</div>`}</main><footer><a class="footer-brand" href="${esc(location.pathname)}">DEADLOCK<span> / STATS</span></a><p>An independent fan project. Not affiliated with Valve.<br>Data & hero art by <a href="https://deadlock-api.com" target="_blank" rel="noreferrer">Deadlock API ${arrow}</a>. Deadlock belongs to Valve.</p><span class="footer-end">PLAY. LEARN. QUEUE AGAIN.</span></footer>`;
  if (state.page === "player") {
    updateSearchGuidance();
    document.querySelector(".search-section").insertAdjacentHTML("beforeend", savedPlayers());
    updateProfileActions();
    updateInsights();
  }
  const title = state.page === "tiers" ? `${state.hero ? heroName(state.hero) + " players & builds" : "Hero tier list"} — Deadlock Stats` : state.player ? `${state.player.profile.personaname}${state.player.demo ? " (saved demo)" : ""} — Deadlock Stats` : "Deadlock Stats — Know your game.";
  document.title = title;
  document.querySelector('meta[property="og:title"]').content = title;
}

function updateInsights() {
  const grid = document.querySelector(".stat-grid");
  if (!grid || !state.player) return;
  const matches = standardMatches(state.player.matches).slice(0, state.limit);
  grid.insertAdjacentHTML("afterend", personalBest(matches, state.limit));
  document.querySelector(".tabs").insertAdjacentHTML("beforeend", `<button id="improve-tab" role="tab" aria-controls="stats-panel" aria-selected="${state.tab === "improve"}" data-tab="improve">Improve</button>`);
  if (state.tab === "improve") {
    document.querySelector("#stats-panel").innerHTML = intelligence.improvementPanel(state.player);
    document.querySelector(".panel-note").textContent = "SAME-HERO PEERS";
  }
  document.querySelectorAll('[role="tab"]').forEach((tab) => { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
}

function savedPlayers() {
  if (!recentPlayers.length) return "";
  return `<div class="saved-players"><span class="section-label">RECENT & FAVORITE PLAYERS · SAVED ON THIS DEVICE</span><div>${recentPlayers.map((p) => `<button type="button" ${p.demo ? `data-saved-demo="${p.id}"` : `data-lookup="${p.id}"`}>${p.favorite ? '<span aria-hidden="true">★ </span>' : ""}${esc(p.name)}${p.demo ? " · demo" : ""}</button>`).join("")}<button type="button" data-clear-recent>Clear saved players</button></div></div>`;
}

function saveRecent(player, toggleFavorite = false) {
  recentPlayers = upsertPlayer(readPlayers(recentPlayers), player, toggleFavorite);
  return writePlayers(recentPlayers);
}

function updateSavedName(player) {
  recentPlayers = readPlayers(recentPlayers);
  const saved = recentPlayers.find((p) => p.id === player.id && p.demo === player.demo);
  if (!saved) return;
  saved.name = player.profile.personaname;
  writePlayers(recentPlayers);
}

window.addEventListener("storage", (event) => {
  if (event.key !== PLAYERS_KEY && event.key !== null) return;
  recentPlayers = readPlayers(recentPlayers);
  renderKeepPosition();
});

function updateProfileActions() {
  const refresh = document.querySelector(".profile-top .refresh");
  if (!refresh || !state.player) return;
  refresh.id = "refresh-player";
  const actions = document.createElement("div");
  actions.className = "profile-actions";
  refresh.replaceWith(actions);
  actions.append(refresh);
  const favorite = recentPlayers.some((p) => p.id === state.player.id && p.demo === state.player.demo && p.favorite);
  actions.insertAdjacentHTML("beforeend", `<button type="button" id="share-player" data-share>Share / copy link</button><button type="button" id="favorite-player" data-favorite aria-pressed="${favorite}">${favorite ? "★ Favorited" : "☆ Favorite"}</button><span id="share-status" role="status"></span>`);
}

function pageUrl(player = state.player) {
  return playerPath(location.pathname, player, state.tab);
}

function restoreCurrentUrl() {
  history.replaceState({ key: state.player ? `${state.player.demo ? "demo" : "live"}:${state.player.id}` : "home" }, "", pageUrl());
}

async function sharePlayer() {
  const url = new URL(pageUrl(), location.origin).href;
  const message = document.querySelector("#share-status");
  try {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(url);
    if (message?.isConnected) message.textContent = "Link copied.";
  } catch {
    if (!message?.isConnected) return;
    message.innerHTML = `<label>Copy this link <input readonly value="${esc(url)}" aria-label="Profile link to copy"></label>`;
    const input = message.querySelector("input");
    input.focus();
    input.select();
  }
}

function playerChoices() {
  return `<section class="player-choices" aria-labelledby="choice-title"><h2 id="choice-title" tabindex="-1">Choose a player</h2><p>Check the account ID: several people can share a display name.</p>${state.candidates.map((p) => `<button type="button" data-lookup="${Number(p.account_id)}">${image(p.avatarfull, "")}<span><strong>${esc(p.personaname)}</strong><small>Steam account ${Number(p.account_id)}</small></span><span aria-hidden="true">→</span></button>`).join("")}</section>`;
}

function updateSearchGuidance() {
  document.querySelector(".brand").removeAttribute("aria-label");
  document.querySelector("#search-hint").textContent =
    "Steam ID, custom or display name, profile link, or s.team/p/ share link";
  document.querySelector("#player-input").placeholder =
    "Steam ID, player name, or profile link";
  const errorTitle = document.querySelector("#lookup-error strong");
  if (errorTitle) errorTitle.textContent = state.errorTitle;
  if (state.candidates.length) {
    const notice = document.querySelector("#lookup-error");
    notice.classList.remove("error");
    notice.setAttribute("role", "status");
    notice.textContent = "Several players match this name. Choose the right account below.";
  }
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
    const badge = region.querySelector(".data-badge");
    if (badge && (navigator.onLine === false || player.previous)) {
      badge.textContent = navigator.onLine === false ? "OFFLINE · PREVIOUS RESULT" : "PREVIOUS API RESULT";
      badge.classList.add("previous");
    }
    if (player.profileStatus === "loading" && player.profile.personaname === `Steam account ${player.id}`)
      region.querySelector("#player-title").textContent = "Player stats";
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
  if (state.player) {
    const matches = standardMatches(state.player.matches).slice(0, state.limit);
    const stats = summarize(matches);
    const winLabel = region.querySelector(".stat-card.featured > small");
    if (winLabel)
      winLabel.textContent = `${stats.wins} ${stats.wins === 1 ? "win" : "wins"} · ${stats.losses} ${stats.losses === 1 ? "loss" : "losses"} · ${stats.scored}/${stats.total} scored outcomes`;
    const kdaLabel = region.querySelector(".stat-card:nth-child(2) > small");
    if (kdaLabel) kdaLabel.textContent = "(kills + assists) / deaths (min. 1)";
    if (!matches.length && state.player.matches.length) {
      const title = region.querySelector(".empty-state h3");
      const copy = region.querySelector(".empty-state p");
      if (title) title.textContent = "No standard PvP matches in this history.";
      if (copy)
        copy.textContent =
          "The indexed matches are from other modes. This dashboard includes unranked and ranked standard PvP, not private lobbies, bots, or Street Brawl.";
    }
    region
      .querySelectorAll('[role="tab"]')
      .forEach(
        (tab) =>
          (tab.tabIndex =
            tab.getAttribute("aria-selected") === "true" ? 0 : -1),
      );
  }
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
  saveRecent(player);
  writeNavigation(pageUrl(player), navigation, key);
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
  const next = activeId ? document.getElementById(activeId) : null;
  next?.focus({ preventScroll: true });
  if (selection) next?.setSelectionRange(...selection);
  window.scrollTo(0, scroll);
}

async function lookup(value, { navigation = "push", preserveRoute = false, profileHint, tab = "matches" } = {}) {
  controller?.abort();
  controller = new AbortController();
  const activeController = controller;
  const serial = ++request;
  state.page = "player";
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
    restoreCurrentUrl();
    render();
    return;
  }
  render();
  const timeout = setTimeout(() => activeController.abort(), 20000);
  try {
    const player = await fetchPlayer(state.input, activeController.signal);
    if (serial !== request) return;
    if (player.profileStatus === "loading" && profileHint?.account_id === player.id)
      player.profile = profileHint;
    state.player = player;
    state.show = 8;
    state.tab = playerTab(tab);
    rememberPlayer(player, navigation);
    player.profilePromise.then(({ profile, status }) => {
      if (profile) {
        player.profile = profile;
        updateSavedName(player);
      }
      player.profileStatus = status;
      if (state.player === player || profile) renderKeepPosition();
    });
  } catch (error) {
    if (serial !== request) return;
    state.error =
      error.name === "AbortError"
        ? "The request took too long. Please try again or open a saved demo."
        : error.message;
    state.candidates = error.candidates ?? [];
    if (state.candidates.length) state.errorTitle = "Choose a player.";
    if (state.player) state.player.previous = true;
    if (state.player || !preserveRoute) restoreCurrentUrl();
  } finally {
    clearTimeout(timeout);
    if (serial === request) {
      state.loading = false;
      render();
      if (state.player && !state.error) revealResults();
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

function showSavedPlayer(player, navigation = "push", { tab = "matches" } = {}) {
  controller?.abort();
  request++;
  state.page = "player";
  if (!player.demo) player.previous = true;
  state.player = player;
  state.input = String(player.id);
  state.loading = false;
  state.error = "";
  state.candidates = [];
  state.show = 8;
  state.tab = playerTab(tab);
  rememberPlayer(player, navigation);
  render();
  revealResults();
}

async function openDemo(id, navigation = "push", { preserveRoute = false, tab = "matches" } = {}) {
  controller?.abort();
  const serial = ++request;
  state.page = "player";
  state.loading = true;
  state.error = "";
  state.candidates = [];
  render();
  try {
    const player = await loadSample(id);
    if (serial === request) showSavedPlayer(player, navigation, { tab });
  } catch {
    if (serial !== request) return;
    state.loading = false;
    state.error = "The saved demo could not load. Go online once to download it, then try again.";
    if (state.player || !preserveRoute || !samples.some((s) => s.id === Number(id))) restoreCurrentUrl();
    render();
  }
}

function showHome(navigation = "push") {
  controller?.abort();
  request++;
  Object.assign(state, { player: null, input: "", loading: false, error: "", candidates: [], page: "player", hero: null });
  writeNavigation(pageUrl(null), navigation, "home");
  render();
  window.scrollTo(0, 0);
}

function showTiers(heroId = null, navigation = "push", build = null) {
  controller?.abort();
  request++;
  Object.assign(state, { page: "tiers", hero: heroId, loading: false, error: "", candidates: [] });
  intelligence.activeBuild = build;
  writeNavigation(tierPath(location.pathname, heroId, build), navigation, `tiers:${heroId ?? "all"}`);
  render();
  const title = (build && document.getElementById(`build-${heroId}-${build.account}-${build.id}`)) || document.querySelector(heroId ? "#hero-leader-title" : "#tier-title");
  title?.focus({ preventScroll: true });
  title?.scrollIntoView({ block: "start" });
}

function showPlayerTab(tab) {
  if (!state.player || state.page !== "player" || state.tab === tab) return;
  state.tab = playerTab(tab);
  writeNavigation(pageUrl(), "push", `${state.player.demo ? "demo" : "live"}:${state.player.id}`);
  renderKeepPosition();
  document.querySelector(`#${state.tab}-tab`)?.focus({ preventScroll: true });
}

app.addEventListener("click", (event) => {
  const homeLink = event.target.closest(".brand, .footer-brand");
  if (homeLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    showHome();
    return;
  }
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-hero-page")) { showTiers(Number(button.dataset.heroPage) || null); return; }
  if (button.hasAttribute("data-player-page")) {
    if (state.player) showSavedPlayer(state.player); else showHome();
    return;
  }
  if (button.dataset.showBuild && state.page === "tiers" && state.hero) {
    intelligence.activeBuild = { id: Number(button.dataset.showBuild), account: Number(button.dataset.buildAccount) };
    writeNavigation(tierPath(location.pathname, state.hero, intelligence.activeBuild), "push", `tiers:${state.hero}`);
  }
  if (intelligence.click(button, state.player)) { renderKeepPosition(); return; }
  if (button.dataset.lookup) {
    const id = Number(button.dataset.lookup);
    const profileHint = state.candidates.find((p) => p.account_id === id) ?? (state.player?.id === id ? state.player.profile : undefined);
    lookup(button.dataset.lookup, { profileHint, tab: button.id === "refresh-player" ? state.tab : "matches" });
  }
  if (button.dataset.demo !== undefined) {
    openDemo(samples[Number(button.dataset.demo)].id);
  }
  if (button.dataset.savedDemo) openDemo(button.dataset.savedDemo);
  if (button.hasAttribute("data-share")) sharePlayer();
  if (button.hasAttribute("data-favorite") && state.player) {
    const stored = saveRecent(state.player, true);
    renderKeepPosition();
    if (!stored) document.querySelector("#share-status").textContent = "Browser storage is unavailable; this favorite will last only for this tab.";
    document.querySelector("[data-favorite]")?.focus({ preventScroll: true });
  }
  if (button.hasAttribute("data-clear-recent")) {
    recentPlayers = [];
    writePlayers(recentPlayers);
    renderKeepPosition();
  }
  if (button.dataset.tab) {
    showPlayerTab(button.dataset.tab);
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
  const tabs = ["matches", "heroes", "improve"];
  const current = tabs.indexOf(state.tab);
  showPlayerTab(event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(current + (event.key === "ArrowRight" ? 1 : 2)) % tabs.length]);
});
app.addEventListener("change", (event) => {
  if (event.target.id === "comparison-hero" && state.player) {
    intelligence.selectedHeroes.set(state.player.id, Number(event.target.value));
    renderKeepPosition();
    return;
  }
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
function openLocation() {
  const route = readRoute(location.search);
  if (route.page === "tiers") return showTiers(route.hero, "none", route.build);
  const { demo, id, tab } = route;
  const key = `${demo ? "demo" : "live"}:${id}`;
  const cached = playerCache.get(key);
  if (cached && cached === state.player && state.page === "player") {
    controller?.abort();
    request++;
    Object.assign(state, { tab, loading: false, error: "", candidates: [] });
    renderKeepPosition();
    document.querySelector(`#${tab}-tab`)?.focus({ preventScroll: true });
    return;
  }
  if (cached) return showSavedPlayer(cached, "none", { tab });
  if (id) {
    state.player = null;
    if (demo) return openDemo(id, "replace", { preserveRoute: true, tab });
    return lookup(id, { navigation: "replace", preserveRoute: true, tab });
  }
  showHome("none");
}

history.replaceState({ key: "home" }, "", location.href);
openLocation();
window.addEventListener("popstate", openLocation);
for (const event of ["online", "offline"]) {
  window.addEventListener(event, () => {
    if (state.player && !state.player.demo && navigator.onLine === false) state.player.previous = true;
    renderKeepPosition();
  });
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Live lookups and saved demos still work if this browser disallows SWs.
    });
  });
}
