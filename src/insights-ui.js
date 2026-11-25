import heroes from "./heroes.json";
import { bestHeroes } from "./insights.js";
import { analysisWindow, fetchTiers, fetchHeroLeaders, fetchComparisonHeroes, fetchComparison, fetchBuild } from "./insights-api.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const name = (id) => heroes[id]?.name ?? `Hero ${id}`;
const count = (n) => Number(n).toLocaleString();
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const value = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const portrait = (id) => heroes[id]?.image ? `<img src="${esc(heroes[id].image)}" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer">` : "";
const period = (window) => `${new Date(window.start * 1000).toLocaleDateString()}–${new Date(window.end * 1000 - 1).toLocaleDateString()} (UTC)`;
const fetched = (data) => `<p class="insight-footnote">Fetched ${esc(new Date(data.fetchedAt).toLocaleString())}${navigator.onLine === false ? " · OFFLINE · PREVIOUS RESULT" : ""}. API coverage can be incomplete. Results may be reused in this tab for up to five minutes.</p>`;

export function personalBest(matches, limit) {
  const ranked = bestHeroes(matches);
  return `<section class="personal-best" aria-labelledby="personal-best-title"><div class="insight-heading"><div><span class="section-label">YOUR EDGE · THIS MATCH WINDOW</span><h3 id="personal-best-title">Your top 3 heroes</h3></div><span class="insight-tag">LAST ${limit}</span></div>${ranked.length ? `<div class="best-grid">${ranked.map((hero, index) => `<article class="best-card"><span class="best-rank">0${index + 1}</span><button class="hero-jump" data-hero-page="${hero.id}">${portrait(hero.id)}<strong>${esc(name(hero.id))}</strong></button><strong class="best-win">${pct(hero.winRate / 100)} <small>win rate</small></strong><p>${hero.wins}W · ${hero.losses}L · ${hero.scored}/${hero.total} scored<br>${hero.kda.toFixed(2)} KDA${hero.provisional ? " · Early signal" : ""}</p></article>`).join("")}</div>` : '<p class="insight-empty">No scored hero results in this window yet. We will not rank unavailable outcomes as losses.</p>'}<details class="methodology"><summary>How your heroes are ranked</summary><p>Based only on this profile’s latest ${limit} indexed standard matches${ranked.length < 3 ? "; fewer than three heroes have scored results" : ""}. Heroes with at least three scored games rank first, then by the 95% Wilson lower bound of win rate, with KDA as a tie-breaker. This discounts tiny samples; fewer than three scored games is an early signal, not a reliable recommendation. Missing outcomes and penalties do not count as wins or losses. Click a hero to explore its overall tier and players.</p></details></section>`;
}

export class Intelligence {
  constructor(onChange) {
    this.onChange = onChange;
    this.window = analysisWindow();
    this.tierWindow = analysisWindow(7, this.window.end * 1000);
    this.tiers = new Map();
    this.leaders = new Map();
    this.playerHeroes = new Map();
    this.comparisons = new Map();
    this.builds = new Map();
    this.selectedHeroes = new Map();
  }

  load(store, key, loader, force = false) {
    if (!force && store.has(key)) return store.get(key);
    const record = { status: "loading", data: store.get(key)?.data };
    store.set(key, record);
    loader().then((data) => {
      if (store.get(key) !== record) return;
      Object.assign(record, { status: "ready", data, fetchedAt: new Date().toISOString() });
      this.onChange();
    }).catch((error) => {
      if (store.get(key) !== record) return;
      Object.assign(record, { status: "error", error: error.message });
      this.onChange();
    });
    return record;
  }

  status(record, retry) {
    if (record?.status === "loading") return '<p class="insight-status" role="status"><span class="spinner"></span> Reading live public stats…</p>';
    if (record?.status === "error") return `<div class="notice error" role="alert">${esc(record.error)}${record.data ? " Showing the previous result below." : ""} <button ${retry}>Retry</button></div>`;
    return "";
  }

  tierPage(heroId = null) {
    const record = this.load(this.tiers, "all", () => fetchTiers(this.tierWindow));
    return `<section class="intelligence-page" aria-labelledby="tier-title"><div class="eyebrow">THE META, MEASURED</div><h1 id="tier-title" tabindex="-1">Hero tier list<span>.</span></h1><p class="insight-intro">Find your next main. Explore the numbers, then learn from the players making them work.</p><div class="insight-heading"><p>Last 7 complete UTC days · Normal Unranked + Ranked<br><small>${esc(period(analysisWindow(7, this.window.end * 1000)))}</small></p><button id="refresh-tiers" class="insight-button" data-refresh-tiers>Refresh tiers</button></div><p class="insight-footnote">Global, all skill levels. At least 100 scored hero appearances. Tiers reflect observed win rates, not a professional or matchup-specific verdict.</p><details class="methodology"><summary>Tier and player ranking rules</summary><p>Heroes sort by the 95% Wilson lower bound of win rate. S: at least 54%; A: 51–54%; B: 48–51%; C: below 48%. These thresholds apply to the lower bound, not the raw win rate. Low-sample heroes are omitted. Each hero’s top five players are a separate global 30-day leaderboard by observed hero win rate, requiring at least 20 matches, not Valve’s MMR leaderboard. Builds are that player’s most frequently selected build in processed demos, not necessarily their own creation or their current item purchases.</p></details>${this.status(record, "data-refresh-tiers")}${record.data ? this.tierRows(record.data, heroId) : ""}${heroId ? this.heroPage(heroId) : '<p class="insight-empty">Select any hero to see five recent performers and their observed builds.</p>'}</section>`;
  }

  tierRows(data, selected) {
    if (!data.heroes.length) return '<p class="insight-empty">Not enough indexed hero results for this period. No tiers have been invented.</p>';
    return `<div class="tier-list">${["S", "A", "B", "C"].map((tier) => `<section class="tier-row tier-${tier.toLowerCase()}" aria-label="${tier} tier"><h2>${tier}</h2><div>${data.heroes.filter((hero) => hero.tier === tier).map((hero) => `<button id="tier-hero-${hero.id}" class="tier-hero" data-hero-page="${hero.id}" aria-pressed="${selected === hero.id}">${portrait(hero.id)}<span><strong>${esc(name(hero.id))}</strong><small>${pct(hero.winRate)} · ${count(hero.scored)} games</small></span></button>`).join("") || '<p class="insight-empty">No qualifying heroes</p>'}</div></section>`).join("")}</div>${fetched(data)}`;
  }

  heroPage(heroId) {
    const record = this.load(this.leaders, heroId, () => fetchHeroLeaders(heroId, this.window));
    return `<section class="hero-leaderboard" aria-labelledby="hero-leader-title"><div class="insight-heading"><div><span class="section-label">HERO DOSSIER</span><h2 id="hero-leader-title" tabindex="-1">${esc(name(heroId))} · Top 5 players</h2></div><button class="insight-button" id="refresh-leaders" data-refresh-leaders="${heroId}">Refresh players</button></div><p>Highest observed hero win rates · at least 20 matches<br><small>Last 30 complete UTC days · ${esc(period(this.window))}</small></p><p class="insight-footnote">A recent performance leaderboard, not a claim that these are the world’s best players. Small samples, matchmaking and API coverage affect the order.</p>${this.status(record, `data-refresh-leaders="${heroId}"`)}${record.data ? `${record.data.players.length ? `<ol class="leader-list">${record.data.players.map((player, index) => this.leaderCard(player, index, heroId)).join("")}</ol>` : '<p class="insight-empty">No players meet this hero’s minimum sample in the period.</p>'}${fetched(record.data)}` : ""}</section>`;
  }

  leaderCard(player, index, heroId) {
    const build = player.build;
    const buildRecord = build ? this.builds.get(`${heroId}:${build.hero_build_id}`) : null;
    return `<li class="leader-card"><div class="leader-summary"><span class="best-rank">0${index + 1}</span><div><button class="player-jump" data-lookup="${player.account_id}">${esc(player.name || `Steam account ${player.account_id}`)} <span aria-hidden="true">↗</span></button><small>Account ${player.account_id} · ${count(player.matches)} hero matches</small></div><strong>${pct(player.value)}<small>win rate</small></strong></div><div class="observed-build">${build ? `<span class="section-label">MOST-USED OBSERVED BUILD</span><p>Build #${build.hero_build_id} · selected in ${count(build.matches)} processed ${build.matches === 1 ? "demo" : "demos"}</p><button id="build-${heroId}-${build.hero_build_id}" class="insight-button" data-show-build="${build.hero_build_id}" data-build-hero="${heroId}">${buildRecord ? "Reload build details" : "Show build & items"}</button>${buildRecord ? `${this.status(buildRecord, `data-show-build="${build.hero_build_id}" data-build-hero="${heroId}"`)}${buildRecord.data ? this.buildDetails(buildRecord.data) : ""}` : ""}<p class="insight-footnote">Observed at match start; demo coverage is partial. Selection does not prove every item was purchased.</p>` : `<p class="insight-empty">${player.buildError ? esc(player.buildError) : "No observed build is available for this player and hero. We will not substitute a popular build."}</p>`}</div></li>`;
  }

  buildDetails({ build, itemNames }) {
    const categories = build.details?.mod_categories;
    return `<div class="build-details"><h3>${esc(build.name)}</h3><p>Build #${build.hero_build_id} · version ${build.version} · author account ${build.author_account_id}${Number.isFinite(build.last_updated_timestamp) ? ` · updated ${esc(new Date(build.last_updated_timestamp * 1000).toLocaleDateString())}` : ""}</p><p class="insight-footnote">Latest public version, which may differ from the version used in the observed matches. Enter this build ID in Deadlock’s build browser.</p>${Array.isArray(categories) ? categories.map((category) => `<section><h4>${esc(category.name || "Items")}</h4><ul class="build-items">${Array.isArray(category.mods) ? category.mods.filter((item) => Number.isSafeInteger(item?.ability_id)).map((item) => `<li>${esc(itemNames.get(item.ability_id) || `Item ${item.ability_id}`)}${item.annotation ? `<small>${esc(item.annotation)}</small>` : ""}</li>`).join("") : ""}</ul></section>`).join("") : '<p>No public item groups.</p>'}</div>`;
  }

  improvementPanel(player) {
    if (player.demo) return '<section class="improvement-panel"><h3>Find your next edge</h3><p>This is a saved demo snapshot. Load live stats before comparing this account with current peers; mixing the snapshot with a new comparison would be misleading.</p><button class="insight-button" data-lookup="' + player.id + '">Load this player live</button></section>';
    const record = this.load(this.playerHeroes, player.id, () => fetchComparisonHeroes(player.id, this.window));
    let selected = this.selectedHeroes.get(player.id);
    if (record.data?.length && !record.data.some((hero) => hero.hero_id === selected)) {
      selected = record.data[0].hero_id;
      this.selectedHeroes.set(player.id, selected);
    }
    const self = record.data?.find((hero) => hero.hero_id === selected);
    const comparison = self && record.status === "ready" ? this.load(this.comparisons, `${player.id}:${selected}`, () => fetchComparison(self, this.window)) : null;
    return `<section class="improvement-panel" aria-labelledby="improvement-title"><div class="insight-heading"><div><span class="section-label">LESS GUESSWORK. ONE NEXT STEP.</span><h3 id="improvement-title">Find your next edge</h3></div><button id="refresh-comparison" class="insight-button" data-refresh-comparison="${player.id}">Refresh analysis</button></div><p>Compare the same hero with up to five higher-win-rate players, each with at least 20 matches. You need at least five matches on that hero.</p><p class="insight-footnote">Last 30 complete UTC days · ${esc(period(this.window))}. This period is independent of Last 20/50/100 above. All indexed Normal Ranked/Unranked analytics; totals can differ from recent-history coverage. Higher win rate is a comparison proxy, not proof of higher MMR or better skill. Players may face different opponents or play different roles.</p>${this.status(record, `data-refresh-comparison="${player.id}"`)}${record.data?.length ? `<label class="comparison-picker" for="comparison-hero">Compare hero <select id="comparison-hero" data-player-id="${player.id}">${record.data.map((hero) => `<option value="${hero.hero_id}" ${hero.hero_id === selected ? "selected" : ""}>${esc(name(hero.hero_id))} · ${hero.matches_played} matches</option>`).join("")}</select></label>${this.status(comparison, `data-retry-peer="${player.id}"`)}${self ? `<p class="self-sample">Your ${esc(name(selected))}: ${pct(self.wins / self.matches_played)} win rate · ${self.matches_played} matches</p>` : ""}${comparison?.status === "ready" || comparison?.data ? this.comparisonResults(self, comparison.data) : ""}` : record.status === "ready" ? '<p class="insight-empty">No indexed hero analytics for this account in the period. Try another player or check back after more matches.</p>' : ""}${record.fetchedAt ? `<p class="insight-footnote">Player analytics fetched ${esc(new Date(record.fetchedAt).toLocaleString())}${navigator.onLine === false ? " · OFFLINE · PREVIOUS RESULT" : ""}.</p>` : ""}</section>`;
  }

  comparisonResults(self, data) {
    if (!data) return '<p class="insight-empty">Not enough matches on this hero for a useful comparison. Play at least five in this period.</p>';
    if (!data.peers.length) return '<p class="insight-empty">No qualifying higher-win-rate peers were returned. We cannot identify a supported gap for this hero; try a different hero.</p>';
    return `<div class="comparison-summary"><strong>${data.peers.length} higher-win-rate ${data.peers.length === 1 ? "peer" : "peers"}</strong><span>${count(data.peers.reduce((sum, peer) => sum + peer.matches_played, 0))} peer matches · same hero and date range</span></div><div class="gap-table-wrap"><table class="gap-table"><caption>Per-minute rates · peer benchmark weighted by time played</caption><thead><tr><th scope="col">Metric</th><th scope="col">You</th><th scope="col">Peers</th></tr></thead><tbody>${data.metrics.map((metric) => `<tr><th scope="row">${esc(metric.label)}<small>${metric.lowerIsBetter ? "Lower is better" : "Higher is generally better"}${metric.peerCount < data.peers.length ? ` · ${metric.peerCount} peers with data` : ""}</small></th><td>${value(metric.own)}</td><td>${value(metric.peer)}</td></tr>`).join("")}</tbody></table></div>${!data.metrics.length ? '<p class="insight-empty">The service did not return comparable metrics. Missing measurements are not treated as zero.</p>' : data.priorities.length ? `<h4 class="priorities-heading">Your next practice priorities</h4><ol class="priority-list">${data.priorities.map((metric) => `<li><strong>${esc(metric.label)}: ${value(metric.own)} vs ${value(metric.peer)}</strong><p>${esc(metric.advice)}</p></li>`).join("")}</ol>` : '<p class="insight-empty">You match or exceed these peers on the available metrics, within a 5% margin. These numbers alone do not explain their higher win rate.</p>'}<details class="methodology"><summary>Who is in this comparison?</summary><p>These are candidates from the top-five recent hero win-rate scoreboard, excluding this account. Each was checked again against hero analytics for at least 20 matches and a strictly higher win rate. Benchmarks use only finite, reported values and are weighted by each peer’s play time. This highlights correlations, not the cause of a loss; it cannot assess positioning, communication or decisions from aggregate stats.</p><ul class="peer-list">${data.peers.map((peer) => `<li><button class="player-jump" data-lookup="${peer.account_id}">Account ${peer.account_id}</button> · ${pct(peer.wins / peer.matches_played)} · ${peer.matches_played} matches</li>`).join("")}</ul></details>`;
  }

  click(button, player) {
    if (button.hasAttribute("data-refresh-tiers")) { this.load(this.tiers, "all", () => fetchTiers(this.tierWindow, true), true); return true; }
    if (button.dataset.refreshLeaders) { const id = Number(button.dataset.refreshLeaders); this.load(this.leaders, id, () => fetchHeroLeaders(id, this.window, true), true); return true; }
    if (button.dataset.showBuild) { const hero = Number(button.dataset.buildHero), build = Number(button.dataset.showBuild); this.load(this.builds, `${hero}:${build}`, () => fetchBuild(hero, build), true); return true; }
    if (button.dataset.refreshComparison && player) {
      for (const key of this.comparisons.keys()) if (key.startsWith(`${player.id}:`)) this.comparisons.delete(key);
      this.load(this.playerHeroes, player.id, () => fetchComparisonHeroes(player.id, this.window, true), true);
      return true;
    }
    if (button.dataset.retryPeer && player) {
      const hero = this.selectedHeroes.get(player.id);
      const self = this.playerHeroes.get(player.id)?.data?.find((row) => row.hero_id === hero);
      if (self) this.load(this.comparisons, `${player.id}:${hero}`, () => fetchComparison(self, this.window, true), true);
      return true;
    }
    return false;
  }
}
