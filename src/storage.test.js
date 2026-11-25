import test from "node:test";
import assert from "node:assert/strict";
import { readPlayers, writePlayers, upsertPlayer } from "./storage.js";

test("favoriting a seventeenth player happens before capacity trimming", () => {
  const full = Array.from({ length: 16 }, (_, id) => ({ id: id + 1, name: String(id), demo: false, favorite: true }));
  const next = upsertPlayer(full, { id: 17, demo: false, profile: { personaname: "New player" } }, true);
  assert.equal(next.length, 16);
  assert.deepEqual(next[0], { id: 17, name: "New player", demo: false, favorite: true });
  const unfavorite = upsertPlayer(next, { id: 17, demo: false, profile: { personaname: "New player" } }, true);
  assert.equal(unfavorite.find((p) => p.id === 17).favorite, false);
});

test("saved players are reread after other tabs change or clear storage", () => {
  const original = globalThis.localStorage;
  let value = null;
  globalThis.localStorage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  try {
    writePlayers([{ id: 1, name: "A", demo: false, favorite: false }]);
    const stale = readPlayers();
    writePlayers([{ id: 1, name: "A", demo: false, favorite: true }]);
    assert.equal(readPlayers(stale)[0].favorite, true);
    value = null;
    assert.deepEqual(readPlayers(stale), []);
    globalThis.localStorage.getItem = () => { throw new Error("Storage blocked"); };
    assert.deepEqual(readPlayers(stale), stale);
  } finally { globalThis.localStorage = original; }
});
