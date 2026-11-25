import test from "node:test";
import assert from "node:assert/strict";
import { Intelligence } from "./insights-ui.js";

const player = {
  account_id: 100, name: "Player", matches: 30, value: 0.8,
  build: { hero_build_id: 674881, matches: 10 },
};
function intelligence(players = [player], buildStatus = "ready") {
  const ui = new Intelligence(() => {});
  ui.activeBuild = { id: 674881, account: 100 };
  ui.leaders.set(4, { status: "ready", data: { players, fetchedAt: "2026-11-25T20:00:00Z" } });
  ui.builds.set("4:674881", {
    status: buildStatus, error: "Build unavailable",
    data: buildStatus === "ready" ? {
      build: { name: "Linked build items", hero_build_id: 674881, version: 1, author_account_id: 200, details: { mod_categories: [] } },
      itemNames: new Map(),
    } : undefined,
  });
  return ui;
}

test("Back hides cached build details; Forward reopens only the selected account's card", () => {
  const ui = intelligence();
  assert.match(ui.leaderCard(player, 0, 4), /Linked build items/);
  ui.activeBuild = null;
  assert.doesNotMatch(ui.leaderCard(player, 0, 4), /Linked build items/);
  assert.match(ui.leaderCard(player, 0, 4), /aria-expanded="false"/);
  assert.ok(ui.builds.has("4:674881"));
  ui.activeBuild = { id: 674881, account: 100 };
  assert.match(ui.leaderCard(player, 0, 4), /aria-expanded="true"/);
  assert.doesNotMatch(ui.leaderCard({ ...player, account_id: 300 }, 1, 4), /Linked build items/);
});

test("a linked build remains visible if its account drops out of the top five", () => {
  const ui = intelligence([]);
  const html = ui.heroPage(4);
  assert.match(html, /Build from your link/);
  assert.match(html, /Linked build items/);
  assert.match(html, /not a claim of current player usage/);
});

test("a linked build remains visible if the account now uses a different observed build", () => {
  const ui = intelligence([{ ...player, build: { hero_build_id: 123, matches: 20 } }]);
  const html = ui.heroPage(4);
  assert.match(html, /Linked build items/);
  assert.match(html, /Build #123/);
  assert.match(html, /Build #674881/);
});

test("a linked build loads independently of a loading or failed leaderboard", () => {
  const ui = intelligence();
  for (const status of ["loading", "error"]) {
    ui.leaders.set(4, { status, error: "Rankings unavailable" });
    assert.match(ui.heroPage(4), /Linked build items/);
  }
});

test("matching builds render once inline, and Back hides the linked fallback too", () => {
  const ui = intelligence();
  assert.doesNotMatch(ui.heroPage(4), /Build from your link/);
  assert.equal(ui.heroPage(4).match(/Linked build items/g).length, 1);
  ui.leaders.get(4).data.players = [];
  ui.activeBuild = null;
  assert.doesNotMatch(ui.heroPage(4), /Linked build items|Build from your link/);
});

test("unavailable linked builds show a retry with the original hero, build and account", () => {
  const ui = intelligence([], "error");
  const html = ui.heroPage(4);
  assert.match(html, /Build unavailable/);
  assert.match(html, /data-show-build="674881" data-build-hero="4" data-build-account="100"/);
  assert.doesNotMatch(html, /Linked build items/);
});
