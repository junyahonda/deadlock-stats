const tabs = new Set(["matches", "heroes", "improve"]);
export const playerTab = (value) => tabs.has(value) ? value : "matches";
const positiveId = (value, max = Number.MAX_SAFE_INTEGER) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= max ? id : null;
};

export function playerPath(pathname, player, tab = "matches") {
  if (!player) return pathname;
  const params = new URLSearchParams({ [player.demo ? "demo" : "player"]: player.id });
  if (playerTab(tab) !== "matches") params.set("tab", playerTab(tab));
  return `${pathname}?${params}`;
}

export function tierPath(pathname, hero = null, build = null) {
  const params = new URLSearchParams({ view: "heroes" });
  if (hero) params.set("hero", hero);
  if (hero && build) {
    params.set("build", build.id);
    params.set("account", build.account);
  }
  return `${pathname}?${params}`;
}

export function readRoute(search) {
  const params = new URLSearchParams(search);
  if (params.get("view") === "heroes") {
    const hero = positiveId(params.get("hero"), 9999);
    const id = positiveId(params.get("build"));
    const account = positiveId(params.get("account"), 4294967295);
    return { page: "tiers", hero, build: hero && id && account ? { id, account } : null };
  }
  const demo = params.get("demo");
  const id = demo || params.get("player");
  return { page: "player", id, demo: Boolean(demo), tab: playerTab(params.get("tab")) };
}

// Repeated taps and reload/retry actions must not create phantom Back stops.
export function writeNavigation(url, navigation = "push", key = null, browser = window) {
  if (navigation === "none") return;
  if (navigation === "replace" || browser.location.pathname + browser.location.search === url) {
    browser.history.replaceState({ key }, "", url);
  } else {
    browser.history.pushState({ key }, "", url);
  }
}
