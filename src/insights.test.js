import test from "node:test";
import assert from "node:assert/strict";
import { bestHeroes, winConfidence, heroTiers, topPerformers, observedBuild, comparePeers } from "./insights.js";
import { analysisWindow, fetchComparison, fetchTiers, fetchHeroLeaders, fetchBuild } from "./insights-api.js";

const match = (hero_id, win = true) => ({ hero_id, player_match_outcome: win ? 1 : 2, player_kills: 6, player_deaths: 2, player_assists: 4 });
test("personal hero ranking discounts one lucky game and never scores missing outcomes", () => {
  const rows = [...Array.from({ length: 6 }, () => match(1)), match(2), ...Array.from({ length: 4 }, () => match(3, false)), { ...match(4), player_match_outcome: 0 }];
  const best = bestHeroes(rows);
  assert.deepEqual(best.map((hero) => hero.id), [1, 3, 2]);
  assert.equal(best[2].provisional, true);
  assert.equal(bestHeroes([{ ...match(4), player_match_outcome: 0 }]).length, 0);
  assert.ok(winConfidence(6, 6) > winConfidence(1, 1));
  assert.equal(winConfidence(0, 0), null);
});

test("global tiers enforce sample size, reject malformed rows, and rank by confidence", () => {
  const rows = heroTiers([null, { hero_id: 1, wins: 60, losses: 40 }, { hero_id: 2, wins: 1, losses: 0 }, { hero_id: 3, wins: 6000, losses: 4000 }, { hero_id: 4, wins: null, losses: 100 }]);
  assert.deepEqual(rows.map((hero) => hero.id), [3, 1]);
  assert.equal(rows[0].tier, "S");
  assert.equal(rows[1].tier, "B");
});

test("leaderboard requires 20 games, unique account IDs and real finite win rates", () => {
  assert.deepEqual(topPerformers([null, { account_id: 1, value: 1, matches: 1 }, { account_id: 2, value: 0.8, matches: 30 }, { account_id: 2, value: 0.8, matches: 30 }, { account_id: 3, value: 0.9, matches: 25 }, { account_id: 4, value: 2, matches: 25 }]).map((row) => row.account_id), [3, 2]);
});

test("observed builds are hero-specific and selected by actual usage, never authorship", () => {
  assert.equal(observedBuild([{ hero_id: 2, hero_build_id: 9, matches: 100 }, { hero_id: 1, hero_build_id: 0, matches: 200 }, { hero_id: 1, hero_build_id: 8, matches: 3 }, { hero_id: 1, hero_build_id: 7, matches: 10 }], 1).hero_build_id, 7);
  assert.equal(observedBuild([], 1), null);
});

const self = { account_id: 10, hero_id: 1, wins: 10, matches_played: 20, time_played: 1200, networth_per_min: 500, deaths_per_min: 0.3, damage_per_min: null };
const peer = (id, extra = {}) => ({ account_id: id, hero_id: 1, wins: 15, matches_played: 20, time_played: 1200, networth_per_min: 1000, deaths_per_min: 0.1, damage_per_min: 2000, ...extra });
test("peer comparison excludes self, weaker players, wrong heroes, and tiny samples", () => {
  const result = comparePeers(self, [peer(10), peer(11, { wins: 10 }), peer(12, { hero_id: 2 }), peer(13, { matches_played: 2 }), peer(14), peer(14)]);
  assert.deepEqual(result.peers.map((row) => row.account_id), [14]);
  assert.equal(result.metrics.find((row) => row.key === "damage_per_min"), undefined);
  assert.equal(result.priorities[0].key, "deaths_per_min");
  assert.equal(comparePeers({ ...self, matches_played: 4 }, []), null);
});

test("benchmarks are weighted by play time and missing data is not zero", () => {
  const result = comparePeers(self, [peer(11), peer(12, { time_played: 3600, networth_per_min: 2000 }), peer(13, { networth_per_min: null })]);
  const souls = result.metrics.find((row) => row.key === "networth_per_min");
  assert.equal(souls.peer, 1750);
  assert.equal(souls.peerCount, 2);
  assert.deepEqual(comparePeers(self, []).priorities, []);
});

test("analysis periods use matching, completed UTC days", () => {
  const window = analysisWindow(30, Date.parse("2026-11-25T20:05:00Z"));
  assert.equal(new Date(window.start * 1000).toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(new Date(window.end * 1000).toISOString(), "2026-11-25T00:00:00.000Z");
});

test("live tier requests are uncached standard PvP analytics with explicit dates", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const query = new URL(url).searchParams;
      assert.equal(options.cache, "no-store");
      assert.equal(query.get("game_mode"), "normal");
      assert.equal(query.get("match_mode"), "ranked,unranked");
      assert.equal(query.get("min_unix_timestamp"), "100");
      assert.equal(query.get("max_unix_timestamp"), "200");
      return new Response(JSON.stringify([{ hero_id: 1, wins: 60, losses: 40 }]));
    };
    assert.equal((await fetchTiers({ start: 100, end: 200 }, true)).heroes.length, 1);
  } finally { globalThis.fetch = original; }
});

test("analytics still send requests when AbortSignal.timeout is unavailable", async () => {
  const original = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  let requested = false;
  try {
    globalThis.fetch = async (_, { signal }) => { requested = true; assert.ok(signal instanceof AbortSignal); return Response.json([]); };
    await fetchTiers({ start: 501, end: 502 }, true);
    assert.equal(requested, true);
  } finally { globalThis.fetch = original; AbortSignal.timeout = originalTimeout; }
});

test("leader builds are filtered to that account and not replaced when missing", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.cache, "no-store");
      const query = new URL(url).searchParams;
      if (url.includes("scoreboards")) return Response.json([{ account_id: 123, matches: 25, value: 0.8 }]);
      if (url.includes("hero-build-stats")) { assert.equal(query.get("account_id"), "123"); return Response.json([]); }
      return Response.json([]);
    };
    const result = await fetchHeroLeaders(1, { start: 201, end: 202 }, true);
    assert.equal(result.players[0].build, null);
    assert.equal(result.players[0].account_id, 123);
  } finally { globalThis.fetch = original; }
});

test("API failures stay actionable; comparisons recheck peer eligibility", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 429 });
    await assert.rejects(fetchTiers({ start: 301, end: 302 }, true), /busy/);
    globalThis.fetch = async (url) => url.includes("scoreboards") ? Response.json([{ account_id: 11, matches: 20, value: 0.9 }]) : Response.json([peer(11, { wins: 9 })]);
    const result = await fetchComparison(self, { start: 401, end: 402 }, true);
    assert.equal(result.peers.length, 0);
  } finally { globalThis.fetch = original; }
});

test("refreshing comparison fetches fresh peers and recomputes their benchmark", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  let benchmark = 1000;
  try {
    globalThis.fetch = async (url) => {
      requests++;
      return Response.json(url.includes("scoreboards") ? [{ account_id: 11, matches: 20, value: 0.9 }] : [peer(11, { networth_per_min: benchmark })]);
    };
    const window = { start: 601, end: 602 };
    const first = await fetchComparison(self, window);
    benchmark = 2000;
    const fresh = await fetchComparison(self, window, true);
    assert.equal(requests, 4);
    assert.equal(first.metrics.find((m) => m.key === "networth_per_min").peer, 1000);
    assert.equal(fresh.metrics.find((m) => m.key === "networth_per_min").peer, 2000);
  } finally { globalThis.fetch = original; }
});

test("retry unindexed builds and reload details both bypass cached build responses", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async (url) => {
      if (url.includes("/assets/items")) return Response.json([]);
      requests++;
      return Response.json(requests === 1 ? [] : [{ hero_build: { hero_id: 1, hero_build_id: 999999, version: requests, name: `Build version ${requests}` } }]);
    };
    await assert.rejects(fetchBuild(1, 999999), /not publicly indexed/);
    assert.equal((await fetchBuild(1, 999999, true)).build.version, 2);
    assert.equal((await fetchBuild(1, 999999, true)).build.version, 3);
    assert.equal(requests, 3);
  } finally { globalThis.fetch = original; }
});
