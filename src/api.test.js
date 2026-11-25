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
    assert.equal(player.profile.personaname, "Player 399289886");
  } finally {
    globalThis.fetch = original;
  }
});
