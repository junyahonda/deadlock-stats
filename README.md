# Deadlock Stats

A mobile-first, static Deadlock player dashboard. Look up a Steam account to see recent matches, win rate, KDA, and heroes played. No account, API key, server, or paid hosting required.

## Run locally

## Hero intelligence

- **Your top 3 heroes** uses the selected recent-match window and ranks repeatable results using a 95% Wilson win-rate lower bound. Heroes with at least three scored games rank ahead of provisional small samples; KDA breaks ties. Unavailable scores never become losses.
- **Hero tier list** uses the last seven complete UTC days of global Normal Unranked/Ranked analytics, with at least 100 scored appearances. Tiers use the confidence-adjusted win rate: S ≥54%, A ≥51%, B ≥48%, C below 48%. This is a data-based global view, not a pro-play tier list or matchup prediction.
- **Top 5 players per hero** means the highest observed hero win rates over the last 30 complete UTC days, requiring at least 20 matches. This is not Valve’s MMR leaderboard, whose name-based account mappings can be ambiguous. Each player links to their own dossier.
- **Builds** are selected from account-filtered hero-build usage in processed demos. The most-used observed build ID is shown, with public item groups on demand. This is a selected build at match start, not proof that all items were bought, and the player need not be the build’s author. Public build details show the latest version, not necessarily the version observed in the match. Missing build data is explicit; no popular build is substituted.
- **Improve** compares the same hero and 30-day period with up to five strictly higher-win-rate peers from that scoreboard. The player needs five matches; peers need 20. Per-minute benchmarks are weighted by play time, with missing measurements excluded rather than zero-filled. Up to three supported gaps produce practice suggestions. This is a higher-win-rate proxy, not proof of higher skill or causal coaching; role, opponent strength and decision-making are not controlled. If the sample is insufficient or no gaps are supported, the page says so. Saved demos never mix with live comparisons.

Analytics are requested only when their page or tab is opened. Requests bypass the HTTP/service-worker cache; identical requests may be reused in memory for five minutes. Every view names its date range and sample size. `?view=heroes&hero=<id>` can be shared and supports browser Back/Forward. Hero intelligence needs an internet connection; saved demos and their local top-three ranking remain available offline.

### Local development

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

`npm test` checks Steam ID parsing and stats calculations. `npm run build` produces the static site in `dist/`; `npm run preview` serves that build.

On a Devin VM using nvm, run `source ~/.nvm/nvm.sh` first. For offline checks, use an isolated production preview (`npm run preview -- --port 4188`), not the development server, and wait for the service worker to finish downloading the app before going offline.

## Lookups and data

- Accepts SteamID64 (converted with BigInt, never floating point), account IDs, SteamID2, SteamID3, and `steamcommunity.com/profiles/…` or `/id/…` URLs, including mobile `m.` links and profile sub-pages. Numeric IDs may include spaces or a trailing slash.
- Steam mobile `s.team/p/…` and `steamcommunity.com/user/…` share links are decoded locally without a Steam key or proxy.
- Custom profile URLs and bare custom names are resolved through the public API's indexed Steam search, with an **exact profile-URL match**. Bare display names show a player picker; fuzzy matches are never silently selected. Unindexed names explain how to find your numeric ID (Steam → Account details) or use a Steam mobile share link instead.
- Fetches public data directly from [Deadlock API](https://deadlock-api.com): `/v1/players/{account_id}/match-history`, `/v1/players/steam`, and `/v1/players/steam-search`. Browser CORS is supported by that API.
- Summary and hero stats consistently cover the selected latest 20, 50, or 100 **indexed standard PvP** matches, not a claim of lifetime totals. Street Brawl, bots, and private lobbies are excluded. Scored wins/losses use `player_match_outcome` values 1/2 only. Explicit penalties (3/4), not-scored matches (5), and unavailable historical outcomes (0/missing) are labeled separately and excluded from win rates. A known team result (`player_team` vs `match_result`) is shown separately, never used to guess scored eligibility. Headline and per-hero rates disclose scored coverage. KDA is `(kills + assists) / max(deaths, 1)`; deathless rows are labeled.
- Match-mode IDs come from Valve’s [ECitadelMatchMode protobuf](https://github.com/SteamDatabase/Protobufs/blob/master/deadlock/citadel_gcmessages_common.proto): Unranked = 1, Private Lobby = 2, Ranked = 4. Only game mode Normal = 1 and match modes 1/4 are included.
- Match history may be delayed or incomplete. No `force_refetch` or costly Steam profile refresh calls are made. A rate-limited history response containing an array is displayed as stored API data.
- Three explicit demo profiles contain saved real API snapshots, captured November 25, 2026. `src/samples.json` is lazy-loaded, labeled **SAVED DEMO**, and never substituted for a requested player. The “Load live” button fetches a fresh result. Missing numeric profiles with no history are reported as not found, not synthetic live players.
- Hero metadata in `src/heroes.json` is a compact snapshot of `/v1/assets/heroes`. Images come from the API asset CDN; Steam avatars come from Steam. These images degrade gracefully when unavailable.
- Share live lookups with `?player=399289886` and repeatable snapshots with `?demo=399289886`. **Share / copy link** uses Android's native share sheet, clipboard, or a selectable link fallback. Titles include the player name and demo status; static Open Graph metadata is generic because GitHub Pages has no per-profile server rendering.
- Recent successful lookups and favorites store only account ID, display name, and live/demo choice on this device (up to 16 entries). **Clear saved players** removes the list. No analytics or accounts are used. Live API results are not stored persistently; session history preserves previous dashboards without refetching. Failed searches and refreshes keep the existing results and their URL.
- Typefaces are self-hosted WOFF2 Latin subsets with optional display (no blocking Google Fonts CSS or late font swap); their OFL licenses are in `public/`. Decorative hero cards are resized local WebP files. Other hero images and Steam avatars still come from their public image hosts and degrade gracefully when unavailable.

## Android and offline use

The web manifest provides app icons, the app name and standalone mode for **Chrome → Add to Home screen / Install app** on Android. Installation requires HTTPS (or localhost). No paid service or Play Store account is needed.

Production builds include a scope-limited service worker that downloads the static app and saved demo chunk after first load. Once it finishes, the app and explicit saved demos work offline. Live player searches still need the public API and show a connection error offline; they are never silently replaced by demo data. The worker never intercepts external API requests or the main website, and a new worker activates after older app tabs close. Development mode does not register the worker.

Live API fetches bypass the browser HTTP cache. Earlier session results are labeled as previous results, including when the phone goes offline, and retain their fetch timestamp. A failed initial deep-link lookup keeps the requested player/demo URL for retry after reconnecting. Static cache matching ignores `Vary: Origin` because precache requests and browser module/font requests can carry different Origin headers even when the public file is identical; navigation fallback uses this build's cache only.

## GitHub Pages

The Actions workflow tests and builds pull requests, then deploys `main` with the official Pages artifact/deploy actions. In this repository's **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.

Default URL: <https://junyahonda.github.io/deadlock-stats/>. Relative build assets support both the project path and a custom-domain root. `public/CNAME` is copied to `dist/CNAME` with `deadlock.junyahonda.com`; GitHub Actions deployments still require configuring the custom domain in Pages settings.

### Owner's custom-domain steps (after default Pages is live)

1. In Namecheap DNS for `junyahonda.com`, add a **CNAME** with host **deadlock** and value **junyahonda.github.io**. Do not change the apex or `www` records.
2. In <https://github.com/junyahonda/deadlock-stats/settings/pages>, set the custom domain to **deadlock.junyahonda.com** and save.
3. Once GitHub verifies DNS and provisions its certificate, enable **Enforce HTTPS**. This affects this repository only; the main `junyahonda.com` site is untouched.

## Credits

Independent fan project, not affiliated with Valve. Deadlock and hero art belong to Valve. Public stats and asset metadata are provided by the community-run Deadlock API.
