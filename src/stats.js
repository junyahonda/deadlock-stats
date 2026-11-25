export const STEAM_BASE = 76561197960265728n;

export function parsePlayerInput(raw) {
  let value = raw.trim();
  if (!value)
    throw new Error("Enter a Steam ID or Steam profile link to get started.");
  if (/^(https?:\/\/|www\.|(?:m\.)?steamcommunity\.com|s\.team)/i.test(value)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      throw new Error(
        "That profile link is not valid. Try a steamcommunity.com profile link.",
      );
    }
    const host = url.hostname.toLowerCase();
    if (
      host === "s.team" ||
      host === "www.s.team" ||
      ([
        "steamcommunity.com",
        "www.steamcommunity.com",
        "m.steamcommunity.com",
      ].includes(host) &&
        /^\/user\//i.test(url.pathname))
    ) {
      const share = url.pathname.match(
        /^\/(?:p|user)\/([bcdfghjkmnpqrtvw-]+)(?:\/|$)/i,
      );
      const code = share?.[1].replace(/-/g, "").toLowerCase();
      if (!code || code.length > 8)
        throw new Error(
          "That Steam share link is not valid. Copy a full s.team/p/ profile link.",
        );
      // Steam short friend codes substitute these letters for hex digits.
      // https://github.com/ValvePython/steam/blob/master/steam/steamid.py
      value = String(
        parseInt(
          [...code]
            .map((c) => "bcdfghjkmnpqrtvw".indexOf(c).toString(16))
            .join(""),
          16,
        ),
      );
    } else {
      if (
        ![
          "steamcommunity.com",
          "www.steamcommunity.com",
          "m.steamcommunity.com",
        ].includes(url.hostname.toLowerCase())
      ) {
        throw new Error(
          "Use a Steam profile link (steamcommunity.com) or Steam mobile share link (s.team/p/).",
        );
      }
      const match = url.pathname.match(/^\/(profiles|id)\/([^/]+)(?:\/|$)/i);
      if (!match)
        throw new Error(
          "Use a Steam link ending in /profiles/765… or /id/your-name.",
        );
      try {
        value = decodeURIComponent(match[2]);
      } catch {
        throw new Error(
          "That Steam profile link contains an invalid character. Copy the link again.",
        );
      }
      if (match[1].toLowerCase() === "id") {
        if (!/^[\w-]{2,64}$/.test(value))
          throw new Error("That Steam custom profile link is not valid.");
        return { vanity: value };
      }
      if (!/^\d+$/.test(value))
        throw new Error(
          "That Steam profile link needs a numeric SteamID64 after /profiles/.",
        );
    }
  }
  if (/^\d[\d\s]*\/?$/.test(value))
    value = value.replace(/\s/g, "").replace(/\/$/, "");
  if (/^-[\d\s]+\/?$/.test(value))
    throw new Error("Steam account IDs must be positive numbers. Check the ID and try again.");
  const steam3 = value.match(/^\[U:1:(\d+)\]$/i);
  const steam2 = value.match(/^STEAM_[01]:([01]):(\d+)$/i);
  let account;
  if (steam3) account = BigInt(steam3[1]);
  else if (steam2) account = BigInt(steam2[2]) * 2n + BigInt(steam2[1]);
  else if (/^\d+$/.test(value)) {
    const number = BigInt(value);
    account = number >= STEAM_BASE ? number - STEAM_BASE : number;
  } else if (/^[\w-]{2,64}$/.test(value)) {
    return { vanity: value, allowSearch: true };
  } else if (/^[^<>:/\\\[\]]{2,64}$/.test(value) && !/^STEAM_/i.test(value)) {
    return { vanity: value, allowSearch: true };
  } else
    throw new Error(
      "Enter a Steam ID, custom profile name, display name, or Steam profile/share link.",
    );
  if (account <= 0n || account > 4294967295n)
    throw new Error("That Steam ID is outside the valid player account range.");
  return { accountId: Number(account) };
}

export function outcome(match) {
  // Invalid/missing historical scores are not confirmed NotScored games.
  if (match.player_match_outcome === 1) return "win";
  if (match.player_match_outcome === 2) return "loss";
  if (match.player_match_outcome === 3) return "penalized";
  if (match.player_match_outcome === 4) return "party-penalized";
  if (match.player_match_outcome === 5) return "unscored";
  return "unavailable";
}

export function outcomeDescription(match) {
  const result = outcome(match);
  const label = { win: "Victory", loss: "Defeat", penalized: "Penalized", "party-penalized": "Party penalized", unscored: "Not scored", unavailable: "Score unavailable" }[result];
  // History supplies the winning team separately. It says nothing about
  // scoring eligibility: never silently use it in a scored win-rate.
  if (!["win", "loss"].includes(result) && [0, 1].includes(match.player_team) && [0, 1].includes(match.match_result))
    return `${label} · Team ${match.player_team === match.match_result ? "win" : "loss"}`;
  return label;
}

export function outcomeMark(match) {
  const result = outcome(match);
  return result === "win" ? "W" : result === "loss" ? "L" : result === "unavailable" ? "?" : result.includes("penalized") ? "P" : "–";
}

export function summarize(matches) {
  const scored = matches.filter((m) => ["win", "loss"].includes(outcome(m)));
  const wins = scored.filter((m) => outcome(m) === "win").length;
  const kills = matches.reduce((sum, m) => sum + m.player_kills, 0);
  const deaths = matches.reduce((sum, m) => sum + m.player_deaths, 0);
  const assists = matches.reduce((sum, m) => sum + m.player_assists, 0);
  const heroes = Object.values(
    matches.reduce((all, m) => {
      const h = (all[m.hero_id] ??= { id: m.hero_id, matches: [] });
      h.matches.push(m);
      return all;
    }, {}),
  ).sort((a, b) => b.matches.length - a.matches.length);
  return {
    total: matches.length,
    wins,
    losses: scored.length - wins,
    scored: scored.length,
    winRate: scored.length ? (wins / scored.length) * 100 : null,
    kda: matches.length ? (kills + assists) / Math.max(1, deaths) : null,
    kills,
    deaths,
    assists,
    heroes,
  };
}

export function standardMatches(matches) {
  return [
    ...new Map(
      matches
        // Valve ECitadelMatchMode: Unranked=1, PrivateLobby=2, Ranked=4.
        // https://github.com/SteamDatabase/Protobufs/blob/master/deadlock/citadel_gcmessages_common.proto
        .filter((m) => m.game_mode === 1 && [1, 4].includes(m.match_mode))
        .map((m) => [m.match_id, m]),
    ).values(),
  ].sort((a, b) => b.start_time - a.start_time);
}
