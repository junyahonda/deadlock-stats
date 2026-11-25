import test from "node:test";
import assert from "node:assert/strict";
import { playerPath, tierPath, readRoute, writeNavigation } from "./navigation.js";

// Minimal History API harness: each Back/Forward reads the destination URL,
// as the app's popstate handler does. No browser or network is required.
function browserAt(start) {
  const entries = [new URL(start, "https://deadlock.junyahonda.com")];
  let index = 0;
  return {
    get location() { return entries[index]; },
    get length() { return entries.length; },
    history: {
      pushState(_state, _title, url) {
        entries.splice(++index, entries.length, new URL(url, entries[index - 1]));
      },
      replaceState(_state, _title, url) { entries[index] = new URL(url, entries[index]); },
    },
    back() { if (index) index--; return readRoute(entries[index].search); },
    forward() { if (index + 1 < entries.length) index++; return readRoute(entries[index].search); },
  };
}

test("Back from Improve restores the previous tab even on a directly opened player", () => {
  const player = { id: 399289886 };
  for (const previous of ["matches", "heroes"]) {
    const browser = browserAt(playerPath("/", player, previous));
    writeNavigation(playerPath("/", player, "improve"), "push", null, browser);
    assert.equal(browser.length, 2);
    assert.deepEqual(browser.back(), { page: "player", id: "399289886", demo: false, tab: previous });
    assert.equal(browser.forward().tab, "improve");
  }
});

test("multiple player tab visits traverse in order without skipping players", () => {
  const browser = browserAt("/");
  const first = { id: 399289886 }, second = { id: 278919272 };
  for (const [player, tab] of [[first, "matches"], [first, "heroes"], [first, "improve"], [second, "matches"]]) {
    writeNavigation(playerPath("/", player, tab), "push", null, browser);
  }
  assert.equal(browser.back().tab, "improve");
  assert.equal(browser.back().tab, "heroes");
  assert.deepEqual(browser.back(), { page: "player", id: "399289886", demo: false, tab: "matches" });
  assert.equal(browser.back().id, null);
  assert.equal(browser.forward().id, "399289886");
});

test("Back from a build restores hero detail, then the tier list; Forward restores the selected card", () => {
  const browser = browserAt(tierPath("/"));
  const build = { id: 674881, account: 278919272 };
  writeNavigation(tierPath("/", 4), "push", null, browser);
  writeNavigation(tierPath("/", 4, build), "push", null, browser);
  assert.deepEqual(browser.back(), { page: "tiers", hero: 4, build: null });
  assert.deepEqual(browser.back(), { page: "tiers", hero: null, build: null });
  assert.equal(browser.forward().hero, 4);
  assert.deepEqual(browser.forward(), { page: "tiers", hero: 4, build });
});

test("opening a shared build for another account is a distinct history state", () => {
  const browser = browserAt(tierPath("/", 4));
  for (const account of [100, 200]) {
    writeNavigation(tierPath("/", 4, { id: 674881, account }), "push", null, browser);
  }
  assert.equal(browser.back().build.account, 100);
  assert.equal(browser.back().build, null);
});

test("build retries and repeated tab taps do not add redundant Back stops", () => {
  const url = tierPath("/", 4, { id: 674881, account: 100 });
  const browser = browserAt(tierPath("/", 4));
  writeNavigation(url, "push", null, browser);
  writeNavigation(url, "push", null, browser);
  writeNavigation(url, "replace", null, browser);
  assert.equal(browser.length, 2);
  const destination = browser.back();
  writeNavigation(tierPath("/", destination.hero, destination.build), "none", null, browser);
  assert.equal(browser.length, 2);
  assert.equal(browser.forward().build.id, 674881);
});

test("demo tabs and build links survive reload at both deployment paths", () => {
  for (const path of ["/", "/deadlock-stats/"]) {
    const playerUrl = playerPath(path, { id: 399289886, demo: true }, "improve");
    assert.deepEqual(readRoute(new URL(playerUrl, "https://example.com").search), {
      page: "player", id: "399289886", demo: true, tab: "improve",
    });
    assert.equal(playerPath(path, null), path);
    assert.equal(tierPath(path, null, { id: 1, account: 2 }), `${path}?view=heroes`);
    const buildUrl = tierPath(path, 4, { id: 674881, account: 100 });
    assert.deepEqual(readRoute(new URL(buildUrl, "https://example.com").search).build, { id: 674881, account: 100 });
  }
});

test("invalid tabs, heroes and incomplete build links fall back to safe parent views", () => {
  assert.equal(readRoute("?player=1&tab=unknown").tab, "matches");
  for (const suffix of ["&build=-1&account=2", "&build=1", "&build=1&account=4294967296", "&build=1.5&account=2", "&build=9007199254740992&account=2"]) {
    assert.deepEqual(readRoute(`?view=heroes&hero=4${suffix}`), { page: "tiers", hero: 4, build: null });
  }
  assert.deepEqual(readRoute("?view=heroes&hero=10000&build=1&account=2"), { page: "tiers", hero: null, build: null });
});
