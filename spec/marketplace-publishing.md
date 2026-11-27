# Publishing to the Elgato Marketplace

Researched 2026-10-27.

- Official catalog: `marketplace.elgato.com`
- Submission portal: **Maker Console** (`maker.elgato.com`)
- Support: Marketplace Makers Discord / `maker@elgato.com`

## Submission Flow

1. Run `npm run validate` and `npm run pack` → produces `dist/*.streamDeckPlugin` (`pack` validates too; `.sdignore` controls excluded files).
2. In Maker Console, create an organization and sign the Maker Agreement (Stripe Connect is only required for paid products; free plugins have no restrictions). `Author` in `manifest.json` must match the Marketplace organization name.
3. Prepare listing assets:
   - Plugin icon PNG: `256` + `512` (`@2x`) — already present
   - Category icon `28×28` + action icons `20×20` monochrome white SVG — already present
   - 1 thumbnail + ≥3 gallery images (can reuse `docs/screenshots/`)
   - Description (≤1500 chars) and optional links (website / support / privacy)
4. Upload → review → publish.
   - For beta/test builds: upload with **"Publish after review"** unchecked; DRM-processed builds can be downloaded from the product's Versions tab.
5. Updates follow the same flow — **never change action UUIDs** (clone + hide old actions instead).

## Pre-Submission Guideline Gaps

Close these before submitting:

- Call `showAlert()` when an action fails (Marketplace guidelines require it; currently the plugin only paints the key).
- Verify the name `"herdr"` is unique on Marketplace and that `Author` matches the Maker organization name.
- **DRM** (optional, default-on for `SDKVersion: 3` + CLI 1.6+): requires manifest `SDKVersion: 3`, `@elgato/streamdeck` v2+ (currently 3.x), `Software.MinimumVersion` ≥ `6.9` (currently `"7.1"`), and immutable shipped files (never rewrite plugin files at runtime except SDK-managed `logs/`).
