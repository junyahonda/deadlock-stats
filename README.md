# Deadlock Stats

A mobile-first, static Deadlock player dashboard. Look up a Steam account to see recent matches, win rate, KDA, and heroes played. No account, API key, server, or paid hosting required.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

`npm test` checks Steam ID parsing and stats calculations. `npm run build` produces the static site in `dist/`; `npm run preview` serves that build.

## Lookups and data

- Accepts SteamID64 (converted with BigInt, never floating point), account IDs, SteamID2, SteamID3, and `steamcommunity.com/profiles/…` or `/id/…` URLs.
- Custom profile URLs are resolved through the public API's indexed Steam search, with an **exact profile-URL match**. Unindexed custom URLs need the numeric ID instead; fuzzy matches are never silently selected.
- Fetches public data directly from [Deadlock API](https://deadlock-api.com): `/v1/players/{account_id}/match-history`, `/v1/players/steam`, and `/v1/players/steam-search`. Browser CORS is supported by that API.
- Summary and hero stats consistently cover the selected latest 20, 50, or 100 **indexed standard PvP** matches, not a claim of lifetime totals. Street Brawl, bots, and private lobbies are excluded. Scored wins/losses use `player_match_outcome`; penalized and unscored outcomes are excluded from win-rate denominators. KDA is `(kills + assists) / max(deaths, 1)`.
- Match history may be delayed or incomplete. No `force_refetch` or costly Steam profile refresh calls are made. A rate-limited history response containing an array is displayed as stored API data.
- Three explicit demo profiles contain saved real API snapshots, captured November 25, 2026. They are bundled in `src/samples.json`, labeled **SAVED DEMO**, and never substituted for a requested player. The “Load live” button fetches a fresh result.
- Hero metadata in `src/heroes.json` is a compact snapshot of `/v1/assets/heroes`. Images come from the API asset CDN; Steam avatars come from Steam. These images degrade gracefully when unavailable.
- A lookup can be shared using `?player=399289886`. Player input is not stored locally or sent to analytics. Requests go to the public API and image hosts only; Google Fonts supplies the optional typefaces.

## GitHub Pages

The Actions workflow tests and builds pull requests, then deploys `main` with the official Pages artifact/deploy actions. In this repository's **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.

Default URL: <https://junyahonda.github.io/deadlock-stats/>. Relative build assets support both the project path and a custom-domain root. `public/CNAME` is copied to `dist/CNAME` with `deadlock.junyahonda.com`; GitHub Actions deployments still require configuring the custom domain in Pages settings.

### Owner's custom-domain steps (after default Pages is live)

1. In Namecheap DNS for `junyahonda.com`, add a **CNAME** with host **deadlock** and value **junyahonda.github.io**. Do not change the apex or `www` records.
2. In <https://github.com/junyahonda/deadlock-stats/settings/pages>, set the custom domain to **deadlock.junyahonda.com** and save.
3. Once GitHub verifies DNS and provisions its certificate, enable **Enforce HTTPS**. This affects this repository only; the main `junyahonda.com` site is untouched.

## Credits

Independent fan project, not affiliated with Valve. Deadlock and hero art belong to Valve. Public stats and asset metadata are provided by the community-run Deadlock API.
