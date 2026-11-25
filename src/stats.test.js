import test from "node:test";
import assert from "node:assert/strict";
import { parsePlayerInput, standardMatches, summarize, outcome, outcomeDescription } from "./stats.js";

test("numeric Steam64 conversion keeps all 64-bit digits precise", () => {
  for (const input of [
    "76561198359555614",
    "https://steamcommunity.com/profiles/76561198359555614/",
    "399289886",
    "[U:1:399289886]",
    "STEAM_1:0:199644943",
  ]) {
    assert.deepEqual(parsePlayerInput(input), { accountId: 399289886 });
  }
});

test("custom Steam URLs are parsed without treating their names as numeric IDs", () => {
  assert.deepEqual(parsePlayerInput("steamcommunity.com/id/Parzeli/?foo=bar"), {
    vanity: "Parzeli",
  });
  assert.deepEqual(
    parsePlayerInput("https://www.steamcommunity.com/id/123456/"),
    { vanity: "123456" },
  );
});

test("rejects invalid and lookalike profiles instead of making the wrong lookup", () => {
  assert.throws(() => parsePlayerInput("-123"), /must be positive numbers/);
  assert.throws(() => parsePlayerInput("- 123/"), /must be positive numbers/);
  for (const input of [
    "",
    "https://steamcommunity.com.evil.test/id/player",
    "https://example.com/profiles/76561198359555614",
    "0",
    "4294967296",
    "76561197960265727",
    "https://s.team/p/not-real",
    "https://s.team/p/wwww-wwwww",
    "https://steamcommunity.com/id/%zz",
    "https://steamcommunity.com/groups/a",
  ]) {
    assert.throws(() => parsePlayerInput(input));
  }
});

test("accepts mobile and profile-tab links, share links, pasted numeric formatting, and bare names", () => {
  for (const input of [
    "https://steamcommunity.com/profiles/76561198359555614/home",
    "m.steamcommunity.com/profiles/76561198359555614/games/?tab=all",
    "76561198359555614/",
    "7656 1198 3595 55614",
  ])
    assert.deepEqual(parsePlayerInput(input), { accountId: 399289886 });
  assert.deepEqual(
    parsePlayerInput("https://steamcommunity.com/id/Parzeli/games/?tab=all"),
    { vanity: "Parzeli" },
  );
  for (const input of [
    "https://s.team/p/fdgc-rhf",
    "s.team/p/fdgc-rhf/token",
    "https://steamcommunity.com/user/fdgc-rhf/",
  ]) {
    assert.deepEqual(parsePlayerInput(input), { accountId: 52698195 });
  }
  assert.deepEqual(parsePlayerInput("imduckies"), {
    vanity: "imduckies",
    allowSearch: true,
  });
  assert.deepEqual(parsePlayerInput("C9 Average"), {
    vanity: "C9 Average",
    allowSearch: true,
  });
  for (const name of ["ttv/3apomni", "name:with:colons", "player\\name"]) {
    assert.deepEqual(parsePlayerInput(name), { vanity: name, allowSearch: true });
  }
});

const match = (overrides = {}) => ({
  match_id: 1,
  game_mode: 1,
  match_mode: 4,
  hero_id: 4,
  start_time: 10,
  player_match_outcome: 1,
  player_kills: 10,
  player_deaths: 0,
  player_assists: 5,
  ...overrides,
});

test("win rate excludes unscored and penalized outcomes; zero deaths never yields Infinity", () => {
  const summary = summarize([
    match(),
    match({ player_match_outcome: 2 }),
    match({ player_match_outcome: 3 }),
    match({ player_match_outcome: 5 }),
  ]);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.kda, 60);
  assert.equal(summary.heroes.length, 1);
  assert.equal(summarize([]).winRate, null);
  assert.equal(summarize([match({ player_match_outcome: 0 })]).winRate, null);
});

test("selects standard PvP, deduplicates matches and sorts newest first", () => {
  const matches = standardMatches([
    match(),
    match(),
    match({ match_id: 2, start_time: 20 }),
    match({ match_id: 3, game_mode: 2 }),
    match({ match_id: 4, match_mode: 3 }),
    match({ match_id: 5, match_mode: 2 }),
    match({ match_id: 6, match_mode: 1, start_time: 30 }),
    match({ match_id: 7, match_mode: 8 }),
    match({ match_id: 8, game_mode: 4, match_mode: 1 }),
  ]);
  assert.deepEqual(
    matches.map((m) => m.match_id),
    [6, 2, 1],
  );
});

test("hero stats use the same match window as the summary", () => {
  const summary = summarize([match(), match({ hero_id: 7, player_deaths: 5 })]);
  assert.equal(summary.total, 2);
  assert.equal(summary.heroes.length, 2);
  assert.equal(summary.kda, 6);
});

test("historical missing scores differ from explicit unscored and penalties; team results never change scored eligibility", () => {
  const historical = match({ player_match_outcome: 0, player_team: 0, match_result: 0 });
  assert.equal(outcome(historical), "unavailable");
  assert.equal(outcomeDescription(historical), "Score unavailable · Team win");
  assert.equal(outcomeDescription(match({ player_match_outcome: 0, player_team: 1, match_result: 0 })), "Score unavailable · Team loss");
  assert.equal(outcomeDescription(match({ player_match_outcome: 0 })), "Score unavailable");
  assert.equal(outcome(match({ player_match_outcome: 3 })), "penalized");
  assert.equal(outcome(match({ player_match_outcome: 4 })), "party-penalized");
  assert.equal(outcome(match({ player_match_outcome: 5 })), "unscored");
  assert.equal(summarize([historical, match(), match({ player_match_outcome: 2 })]).winRate, 50);
  assert.equal(summarize([historical]).scored, 0);
});
