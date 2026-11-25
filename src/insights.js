import { summarize } from "./stats.js";

// Wilson's 95% lower bound rewards repeatable wins, not a single 1–0 game.
export function winConfidence(wins, total) {
  if (!Number.isFinite(wins) || !Number.isFinite(total) || total <= 0 || wins < 0 || wins > total) return null;
  const z = 1.96;
  const p = wins / total;
  return (p + z * z / (2 * total) - z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / (1 + z * z / total);
}

export function bestHeroes(matches) {
  return summarize(matches).heroes.map((hero) => {
    const stats = summarize(hero.matches);
    return { id: hero.id, ...stats, confidence: winConfidence(stats.wins, stats.scored), provisional: stats.scored < 3 };
  }).filter((hero) => hero.scored > 0).sort((a, b) =>
    Number(a.provisional) - Number(b.provisional) || b.confidence - a.confidence || b.kda - a.kda || b.scored - a.scored || a.id - b.id,
  ).slice(0, 3);
}

const nonnegative = (value) => Number.isFinite(value) && value >= 0;

export function heroTiers(rows) {
  if (!Array.isArray(rows)) throw new Error("Hero stats are temporarily unavailable. Try again shortly.");
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || !Number.isSafeInteger(row.hero_id) || seen.has(row.hero_id) || ![row.wins, row.losses].every(nonnegative) || row.wins + row.losses < 100) return false;
    seen.add(row.hero_id);
    return true;
  }).map((row) => {
    const scored = row.wins + row.losses;
    const confidence = winConfidence(row.wins, scored);
    return { id: row.hero_id, wins: row.wins, losses: row.losses, scored, winRate: row.wins / scored, confidence,
      tier: confidence >= 0.54 ? "S" : confidence >= 0.51 ? "A" : confidence >= 0.48 ? "B" : "C" };
  }).sort((a, b) => b.confidence - a.confidence || b.scored - a.scored || a.id - b.id);
}

export function topPerformers(rows) {
  if (!Array.isArray(rows)) throw new Error("Player rankings are temporarily unavailable. Try again shortly.");
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || !Number.isSafeInteger(row.account_id) || row.account_id <= 0 || row.account_id > 4294967295 || seen.has(row.account_id) || !nonnegative(row.value) || row.value > 1 || !Number.isFinite(row.matches) || row.matches < 20) return false;
    seen.add(row.account_id);
    return true;
  }).sort((a, b) => b.value - a.value || b.matches - a.matches || a.account_id - b.account_id).slice(0, 5);
}

export function observedBuild(rows, heroId) {
  if (!Array.isArray(rows)) throw new Error("Build usage is temporarily unavailable.");
  return rows.filter((row) => row && row.hero_id === heroId && Number.isSafeInteger(row.hero_build_id) && row.hero_build_id > 0 && Number.isFinite(row.matches) && row.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.hero_build_id - b.hero_build_id)[0] ?? null;
}

export const metricDefinitions = [
  { key: "networth_per_min", label: "Souls / min", advice: "Review missed waves and safe jungle rotations. Try to collect farm between fights rather than waiting for the next one." },
  { key: "last_hits_per_min", label: "Last hits / min", advice: "Practice securing trooper last hits and souls before trading. Review waves that die while you rotate." },
  { key: "damage_per_min", label: "Hero damage / min", advice: "Review fights where you were absent or out of range. Look for safe poke and coordinate your damage windows with teammates." },
  { key: "obj_damage_per_min", label: "Objective damage / min", advice: "After a pick or won fight, look for a safe Guardian, Walker or Patron push instead of immediately returning to farming." },
  { key: "deaths_per_min", label: "Deaths / min", lowerIsBetter: true, advice: "Review the moments before each death: missing enemies, cooldowns and escape routes. Avoid taking isolated fights without information." },
  { key: "denies_per_min", label: "Denies / min", advice: "Practice denying exposed souls when your own last hits are secure. Use cover so denial attempts do not cost your health or farm." },
];

export function comparePeers(self, peers) {
  if (!self || !Array.isArray(peers) || !Number.isFinite(self.matches_played) || self.matches_played < 5 || !Number.isFinite(self.wins)) return null;
  const ownRate = self.wins / self.matches_played;
  const seen = new Set();
  const eligible = peers.filter((row) => {
    if (!row || row.hero_id !== self.hero_id || row.account_id === self.account_id || seen.has(row.account_id) || !Number.isFinite(row.matches_played) || row.matches_played < 20 || !Number.isFinite(row.wins) || row.wins > row.matches_played || row.wins / row.matches_played <= ownRate || !Number.isFinite(row.time_played) || row.time_played <= 0) return false;
    seen.add(row.account_id);
    return true;
  }).slice(0, 5);
  if (!eligible.length) return { peers: [], metrics: [], priorities: [] };
  const metrics = metricDefinitions.flatMap((metric) => {
    if (!nonnegative(self[metric.key])) return [];
    const covered = eligible.filter((row) => nonnegative(row[metric.key]));
    if (!covered.length) return [];
    const seconds = covered.reduce((sum, row) => sum + row.time_played, 0);
    const peer = covered.reduce((sum, row) => sum + row[metric.key] * row.time_played, 0) / seconds;
    const own = self[metric.key];
    const difference = metric.lowerIsBetter ? own - peer : peer - own;
    return [{ ...metric, own, peer, deficit: difference / Math.max(peer, own, 0.001), peerCount: covered.length }];
  });
  return { peers: eligible, metrics, priorities: metrics.filter((metric) => metric.deficit > 0.05).sort((a, b) => b.deficit - a.deficit).slice(0, 3) };
}
