import { heroTiers, topPerformers, observedBuild, comparePeers } from "./insights.js";

const API = "https://api.deadlock-api.com";
const cache = new Map();
const TTL = 5 * 60 * 1000;

// An explicit UTC-day boundary gives every request in a comparison the same window.
export function analysisWindow(days = 30, now = Date.now()) {
  const end = Math.floor(now / 86400000) * 86400;
  return { start: end - days * 86400, end, days };
}

async function json(path, params = {}, { refresh = false } = {}) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const entry = cache.get(url);
  if (!refresh && entry && Date.now() - entry.at < TTL) return entry.promise;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
    let response;
    try {
      response = await fetch(url, { cache: "no-store", signal: controller.signal });
    } catch {
      throw new Error("Couldn’t reach the stats service. Go online and try again.");
    }
    if (response.status === 429) throw new Error("The stats service is busy. Wait a moment, then retry.");
    if (!response.ok) throw new Error("This data is currently unavailable from the stats service. Try again shortly.");
    try { return await response.json(); } catch { throw new Error("The stats service returned an unreadable response. Please retry."); }
    } finally { clearTimeout(timeout); }
  })();
  const record = { at: Date.now(), promise };
  cache.set(url, record);
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  try { return await promise; } catch (error) { if (cache.get(url) === record) cache.delete(url); throw error; }
}

const range = (window) => ({ min_unix_timestamp: window.start, max_unix_timestamp: window.end });
const standard = { game_mode: "normal", match_mode: "ranked,unranked" };

export async function fetchTiers(window, refresh = false) {
  const rows = await json("/v1/analytics/hero-stats", { ...standard, ...range(window), bucket: "no_bucket" }, { refresh });
  return { heroes: heroTiers(rows), window, fetchedAt: new Date().toISOString() };
}

async function scoreboard(heroId, window, refresh = false) {
  return topPerformers(await json("/v1/analytics/scoreboards/players", { ...standard, ...range(window), hero_id: heroId, sort_by: "winrate", sort_direction: "desc", min_matches: 20, limit: 5 }, { refresh }));
}

export async function fetchHeroLeaders(heroId, window, refresh = false) {
  const players = await scoreboard(heroId, window, refresh);
  const ids = players.map((player) => player.account_id);
  // Names are optional and must not stop real account IDs and build usage displaying.
  const names = ids.length ? json("/v1/players/steam", { account_ids: ids.join(",") }, { refresh }).catch(() => []) : Promise.resolve([]);
  const builds = await Promise.all(players.map(async (player) => {
    try {
      const rows = await json(`/v1/analytics/hero-build-stats/${heroId}`, { ...range(window), match_mode: standard.match_mode, account_id: player.account_id, min_matches: 1, bucket: "no_bucket" }, { refresh });
      return { ...player, build: observedBuild(rows, heroId) };
    } catch (error) { return { ...player, buildError: error.message }; }
  }));
  const profiles = await names;
  return { players: builds.map((player) => ({ ...player, name: Array.isArray(profiles) ? profiles.find((profile) => profile?.account_id === player.account_id)?.personaname : null })), window, fetchedAt: new Date().toISOString() };
}

export async function fetchComparisonHeroes(accountId, window, refresh = false) {
  const rows = await json("/v1/players/hero-stats", { ...standard, ...range(window), account_ids: accountId }, { refresh });
  if (!Array.isArray(rows)) throw new Error("Player comparison stats are temporarily unavailable.");
  return rows.filter((row) => row?.account_id === accountId && Number.isSafeInteger(row.hero_id) && Number.isFinite(row.matches_played) && row.matches_played > 0 && Number.isFinite(row.wins) && row.wins >= 0 && row.wins <= row.matches_played)
    .sort((a, b) => b.matches_played - a.matches_played || a.hero_id - b.hero_id);
}

export async function fetchComparison(self, window, refresh = false) {
  if (self.matches_played < 5) return null;
  const players = (await scoreboard(self.hero_id, window, refresh)).filter((player) => player.account_id !== self.account_id && player.value > self.wins / self.matches_played);
  if (!players.length) return { peers: [], metrics: [], priorities: [] };
  const rows = await json("/v1/players/hero-stats", { ...standard, ...range(window), hero_ids: self.hero_id, account_ids: players.map((player) => player.account_id).join(",") }, { refresh });
  if (!Array.isArray(rows)) throw new Error("Peer comparison stats are temporarily unavailable.");
  const ids = new Set(players.map((player) => player.account_id));
  return comparePeers(self, rows.filter((row) => ids.has(row?.account_id)));
}

export async function fetchBuild(heroId, buildId) {
  const [builds, items] = await Promise.all([
    json("/v1/builds", { build_id: buildId, hero_id: heroId, only_latest: true, limit: 1 }),
    json("/v1/assets/items", { language: "english" }).catch(() => []),
  ]);
  const build = Array.isArray(builds) ? builds.find((row) => row?.hero_build?.hero_id === heroId && row.hero_build.hero_build_id === buildId)?.hero_build : null;
  if (!build) throw new Error("This observed build is not publicly indexed. Search its build ID in Deadlock instead.");
  const itemNames = new Map(Array.isArray(items) ? items.filter((item) => Number.isSafeInteger(item?.id) && typeof item.name === "string").map((item) => [item.id, item.name]) : []);
  return { build, itemNames };
}
