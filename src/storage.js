export const KEY = "deadlock-stats-players-v1";

export function readPlayers(fallback = []) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!Array.isArray(saved)) return [];
    return saved.filter((p) => p && Number.isInteger(p.id) && p.id > 0 && p.id <= 4294967295 && typeof p.name === "string" && typeof p.demo === "boolean")
      .slice(0, 16).map((p) => ({ id: p.id, name: p.name.slice(0, 100), demo: p.demo, favorite: p.favorite === true }));
  } catch {
    return fallback;
  }
}

export function writePlayers(players) {
  try {
    localStorage.setItem(KEY, JSON.stringify(players));
    return true;
  } catch {
    return false;
  }
}
