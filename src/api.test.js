import test from "node:test";
import assert from "node:assert/strict";
import { fetchPlayer, resolvePlayer } from "./api.js";

test("a browser network failure gives an actionable offline message", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(
      fetchPlayer("399289886"),
      /Check your connection.*saved demo/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("vanity search selects the exact custom URL, not a higher-ranked fuzzy result", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          account_id: 99,
          profileurl: "https://steamcommunity.com/id/Parzelion/",
        },
        {
          account_id: 278919272,
          profileurl: "https://steamcommunity.com/id/Parzeli/",
        },
      ]),
    );
  try {
    assert.equal(
      await resolvePlayer("https://steamcommunity.com/id/Parzeli/"),
      278919272,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("rate-limited match history containing stored data remains usable and labeled stored", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    url.includes("match-history")
      ? new Response("[]", { status: 429 })
      : new Response("[]");
  try {
    const player = await fetchPlayer("399289886");
    assert.equal(player.stored, true);
    assert.equal(player.demo, false);
    assert.equal(player.profile.personaname, "Steam account 399289886");
  } finally {
    globalThis.fetch = original;
  }
});

test("unindexed vanity URLs explain how to find a numeric Steam ID or share link", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]");
  try {
    await assert.rejects(
      resolvePlayer("https://steamcommunity.com/id/not-indexed/"),
      /Account details.*Steam ID/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("display-name search asks the user to choose rather than silently picking a fuzzy profile", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          account_id: 278919272,
          personaname: "Parzelion",
          profileurl: "https://steamcommunity.com/id/Parzeli/",
        },
        {
          account_id: 99,
          personaname: "Other Parzelion",
          profileurl: "https://steamcommunity.com/id/someone-else/",
        },
      ]),
    );
  try {
    await assert.rejects(
      resolvePlayer("Parzelion"),
      (error) => error.candidates?.length === 2 && /Choose/.test(error.message),
    );
    await assert.rejects(
      resolvePlayer("https://steamcommunity.com/id/Parzelion/"),
      /not indexed/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test(
  "a slow optional Steam profile never delays returned match history",
  { timeout: 1000 },
  async () => {
    const original = globalThis.fetch;
    let resolveProfile;
    globalThis.fetch = async (url) =>
      url.includes("/steam?")
        ? new Promise((resolve) => {
            resolveProfile = resolve;
          })
        : new Response("[]");
    try {
      const player = await fetchPlayer("399289886");
      assert.equal(player.profileStatus, "loading");
      assert.deepEqual(player.matches, []);
      resolveProfile(
        new Response(
          JSON.stringify([
            { account_id: 399289886, personaname: "C9 Average" },
          ]),
        ),
      );
      const profile = await player.profilePromise;
      assert.equal(profile.status, "found");
      assert.equal(profile.profile.personaname, "C9 Average");
    } finally {
      globalThis.fetch = original;
    }
  },
);

test("malformed match records and HTML responses show readable errors, not renderer or JSON exceptions", async () => {
  const original = globalThis.fetch;
  try {
    for (const body of ["[null]", "[{}]", "<html>upstream error</html>"]) {
      globalThis.fetch = async () => new Response(body);
      await assert.rejects(fetchPlayer("399289886"), /unreadable/);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("history 404 is distinct from service failure and empty profiles remain unverified", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) =>
      url.includes("match-history")
        ? new Response("{}", { status: 404 })
        : new Response("[]");
    await assert.rejects(fetchPlayer("4"), /No indexed profile.*Check the ID/);
    globalThis.fetch = async () => new Response("[]");
    const player = await fetchPlayer("4");
    assert.equal((await player.profilePromise).status, "missing");
  } finally {
    globalThis.fetch = original;
  }
});
