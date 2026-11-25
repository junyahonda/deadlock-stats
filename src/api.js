import { parsePlayerInput } from "./stats.js";

const API = "https://api.deadlock-api.com";

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "The stats service returned an unreadable response. Try again shortly, or explore a saved demo.",
    );
  }
}

async function get(path, signal) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { signal, cache: "no-store" });
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError")
      throw error;
    throw new Error(
      "Couldn’t reach the stats service. Check your connection and try again, or explore a saved demo.",
    );
  }
  // The API can return stored history with 429; accept only an actual array.
  if (response.status === 429 && path.includes("/match-history")) {
    try {
      const data = await readJson(response);
      if (Array.isArray(data)) return { data, stored: true };
    } catch (error) {
      if (["AbortError", "TimeoutError"].includes(error.name)) throw error;
      // An empty/malformed 429 body is still rate limiting, not a JSON fault.
    }
  }
  if (!response.ok) {
    if (response.status === 404) {
      const error = new Error(
        "No indexed profile or match history was found for this Steam ID. Check the ID, or try another player.",
      );
      error.code = "NOT_FOUND";
      throw error;
    }
    if (response.status === 429)
      throw new Error(
        "The stats service is busy. Wait a moment and try again, or explore a saved demo.",
      );
    throw new Error(
      "The stats service could not return this profile. Try again shortly, or explore a saved demo.",
    );
  }
  return { data: await readJson(response), stored: false };
}

export async function resolvePlayer(raw, signal) {
  const input = parsePlayerInput(raw);
  if (input.accountId) return input.accountId;
  const { data } = await get(
    `/v1/players/steam-search?search_query=${encodeURIComponent(input.vanity)}&limit=100&min_matches_played_last_30d=0`,
    signal,
  );
  if (!Array.isArray(data))
    throw new Error(
      "The profile search is temporarily unavailable. Try a numeric Steam ID or Steam share link.",
    );
  const candidates = data.filter(
    (p) =>
      p &&
      Number.isSafeInteger(p.account_id) &&
      p.account_id > 0 &&
      p.account_id <= 4294967295,
  );
  const exact = candidates.find((p) => {
    try {
      return (
        new URL(p.profileurl).pathname.replace(/\/$/, "").toLowerCase() ===
        `/id/${input.vanity.toLowerCase()}`
      );
    } catch {
      return false;
    }
  });
  if (!exact && input.allowSearch && candidates.length) {
    const error = new Error(
      "Choose the right player below. Display names are not unique.",
    );
    error.candidates = candidates.slice(0, 8);
    throw error;
  }
  if (!exact)
    throw new Error(
      "This custom URL or name is not indexed yet. Paste the player’s numeric Steam ID or a Steam mobile share link (s.team/p/…). For your own ID: open Steam → your account name → Account details and copy the Steam ID below your account name. Display names may differ from custom URL names.",
    );
  return exact.account_id;
}

export async function fetchPlayer(raw, signal) {
  const id = await resolvePlayer(raw, signal);
  let verified = { profile: null, status: "loading" };
  // Optional name/avatar data must never hold back the match dashboard.
  const profileSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(4000),
  ]);
  const profilePromise = get(
    `/v1/players/steam?account_ids=${id}`,
    profileSignal,
  )
    .then(({ data }) => {
      if (!Array.isArray(data)) return { profile: null, status: "unavailable" };
      const profile = data.find(
        (p) => p && p.account_id === id && typeof p.personaname === "string",
      );
      return {
        profile: profile ?? null,
        status: profile ? "found" : "missing",
      };
    })
    .catch((error) => ({
      profile: null,
      status: error.code === "NOT_FOUND" ? "missing" : "unavailable",
    }))
    .then((result) => {
      verified = result;
      return result;
    });
  const history = await get(`/v1/players/${id}/match-history`, signal);
  if (!Array.isArray(history.data))
    throw new Error(
      "The stats service returned an unexpected response. Please try again.",
    );
  const fields = [
    "match_id",
    "game_mode",
    "match_mode",
    "hero_id",
    "start_time",
    "player_kills",
    "player_deaths",
    "player_assists",
    "net_worth",
    "match_duration_s",
  ];
  const matches = history.data.filter(
    (m) => m && fields.every((key) => Number.isFinite(m[key]) && m[key] >= 0),
  );
  if (history.data.length && !matches.length)
    throw new Error(
      "The stats service returned unreadable match records. Try again shortly, or explore a saved demo.",
    );
  // An empty history is not evidence that a player exists. Only wait for the
  // optional profile when there are no matches to show in the meantime.
  if (!matches.length) {
    verified = await profilePromise;
    if (verified.status === "missing")
      throw new Error(
        "No indexed profile or match history was found for this Steam ID. Check the ID, or try another player.",
      );
    if (verified.status !== "found")
      throw new Error(
        "No indexed match history was returned, and the Steam profile could not be verified. Check the ID and try again, or explore a saved demo.",
      );
  }
  return {
    id,
    profile: verified.profile ?? {
      account_id: id,
      personaname: `Steam account ${id}`,
    },
    profileStatus: verified.status,
    profilePromise,
    matches,
    invalidMatches: history.data.length - matches.length,
    stored: history.stored,
    fetchedAt: new Date().toISOString(),
    demo: false,
  };
}
