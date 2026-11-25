export const STEAM_BASE = 76561197960265728n;

export function parsePlayerInput(raw) {
  let value = raw.trim();
  if (!value)
    throw new Error("Enter a Steam ID or Steam profile link to get started.");
  if (/^(https?:\/\/|www\.|steamcommunity\.com)/i.test(value)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      throw new Error(
        "That profile link is not valid. Try a steamcommunity.com profile link.",
      );
    }
    if (
      !["steamcommunity.com", "www.steamcommunity.com"].includes(
        url.hostname.toLowerCase(),
      )
    ) {
      throw new Error(
        "Use a steamcommunity.com profile link, not another website.",
      );
    }
    const match = url.pathname.match(/^\/(profiles|id)\/([^/]+)\/?$/i);
    if (!match)
      throw new Error(
        "Use a Steam link ending in /profiles/765… or /id/your-name.",
      );
    value = decodeURIComponent(match[2]);
    if (match[1].toLowerCase() === "id") {
      if (!/^[\w-]{2,64}$/.test(value))
        throw new Error("That Steam custom profile link is not valid.");
      return { vanity: value };
    }
  }
  const steam3 = value.match(/^\[U:1:(\d+)\]$/i);
  const steam2 = value.match(/^STEAM_[01]:([01]):(\d+)$/i);
  let account;
  if (steam3) account = BigInt(steam3[1]);
  else if (steam2) account = BigInt(steam2[2]) * 2n + BigInt(steam2[1]);
  else if (/^\d+$/.test(value)) {
    const number = BigInt(value);
    account = number >= STEAM_BASE ? number - STEAM_BASE : number;
  } else
    throw new Error("Enter a numeric Steam ID or a full Steam profile link.");
  if (account <= 0n || account > 4294967295n)
    throw new Error("That Steam ID is outside the valid player account range.");
  return { accountId: Number(account) };
}

export function outcome(match) {
  // Use the scored outcome: penalized, unscored and invalid are not losses.
  if (match.player_match_outcome === 1) return "win";
  if (match.player_match_outcome === 2) return "loss";
  return "unscored";
}

export function summarize(matches) {
  const scored = matches.filter((m) => outcome(m) !== "unscored");
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
        .filter((m) => m.game_mode === 1 && [1, 2].includes(m.match_mode))
        .map((m) => [m.match_id, m]),
    ).values(),
  ].sort((a, b) => b.start_time - a.start_time);
}
