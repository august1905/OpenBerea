# Decisions

Where the spec was unclear, the simplest option that fits the Guiding principles (free, open, no account, source-first, offline-capable) was chosen. Each entry gives the decision and the reason.

## Project setup

1. **Spec file name.** The spec lives in `Bible Study App — Requirements Spec.md` (the build request calls it SPEC.md). It is kept under its original name so the owner's file is unchanged.
2. **Single-page web export.** `web.output` is `"single"`: one `index.html` serves every route, with Cloudflare's single-page-application fallback. Static rendering of every chapter would add thousands of HTML files without serving any requirement, and a single shell is simpler to cache offline.
3. **Cloudflare Workers static assets** (not Pages). It is Cloudflare's current recommendation for static sites, runs no server code, and handles the single-page fallback in configuration (`wrangler.jsonc`).
4. **Placeholder deploy deferred.** Step 1 calls for a placeholder deploy, but deploying needs the owner's Cloudflare login. The deploy config is in place from step 1; the deploy itself is the final step, and the login is listed in the hand-off.
5. **Vitest for unit tests.** The required unit tests (reference parsing, data conversion) are plain TypeScript, and Vitest runs them without a React Native transform. End-to-end tests use Playwright against the exported site.
6. **Generated data is not committed.** `npm run data` rebuilds `public/data/` from sources pinned by commit or checksum and recorded in `data/manifest.json`. The generated files are large (hundreds of MB) and fully reproducible, so the repository holds the pipeline and the owner-edited `content/` files only.
