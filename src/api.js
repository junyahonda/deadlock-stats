import { parsePlayerInput } from "./stats.js";

const API = "https://api.deadlock-api.com";

async function get(path, signal) {
  const response = await fetch(`${API}${path}`, { signal });
  // The API can return stored history with 429; accept only an actual array.
  if (response.status === 429 && path.includes("/match-history")) {
    const data = await response.json();
    if (Array.isArray(data)) return { data, stored: true };
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new Error(
        "The stats service is busy. Wait a moment and try again, or explore a saved demo.",
      );
    throw new Error(
      "The stats service could not return this profile. Try again shortly, or explore a saved demo.",
    );
  }
  return { data: await response.json(), stored: false };
}

export async function resolvePlayer(raw, signal) {
  const input = parsePlayerInput(raw);
  if (input.accountId) return input.accountId;
  const { data } = await get(
    `/v1/players/steam-search?search_query=${encodeURIComponent(input.vanity)}&limit=100&min_matches_played_last_30d=0`,
    signal,
  );
  const exact = data.find((p) => {
    try {
      return (
        new URL(p.profileurl).pathname.replace(/\/$/, "").toLowerCase() ===
        `/id/${input.vanity.toLowerCase()}`
      );
    } catch {
      return false;
    }
  });
  if (!exact)
    throw new Error(
      "This custom Steam URL is not indexed yet. Use the numeric Steam ID or /profiles/ link instead.",
    );
  return exact.account_id;
}

export async function fetchPlayer(raw, signal) {
  const id = await resolvePlayer(raw, signal);
  const [history, profile] = await Promise.all([
    get(`/v1/players/${id}/match-history`, signal),
    get(`/v1/players/steam?account_ids=${id}`, signal).catch(() => ({
      data: [],
    })),
  ]);
  if (!Array.isArray(history.data))
    throw new Error(
      "The stats service returned an unexpected response. Please try again.",
    );
  return {
    id,
    profile: profile.data?.[0] ?? {
      account_id: id,
      personaname: `Player ${id}`,
    },
    matches: history.data,
    stored: history.stored,
    fetchedAt: new Date().toISOString(),
    demo: false,
  };
}
