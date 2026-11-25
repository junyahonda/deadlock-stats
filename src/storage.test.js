import test from "node:test";
import assert from "node:assert/strict";
import { readPlayers, writePlayers } from "./storage.js";

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
