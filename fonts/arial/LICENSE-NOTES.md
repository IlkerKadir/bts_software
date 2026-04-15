# Arial TTF files — licensing notes

The `.ttf` files in this directory are Microsoft Arial (Regular, Bold,
Italic, Bold Italic). They are **proprietary** and subject to the
Microsoft End User License Agreement that accompanies the product
they shipped with (Windows, Office, or macOS).

## Why they live in the repo

The PDF export path uses Puppeteer + Chromium inside a production
Docker image. The quote template references Arial explicitly so
customer-facing proforma PDFs render with the exact typeface the
client has standardized on. Alpine Linux doesn't ship Arial
(Microsoft doesn't permit free redistribution), so the fonts are
copied from a licensed macOS install and baked into the image at
build time via `COPY fonts/arial/*.ttf /usr/share/fonts/TTF/` in the
Dockerfile, followed by `fc-cache -f`.

## License basis we rely on

Every machine that runs or builds this image is expected to hold a
valid license for Arial — typically through Microsoft Office, Windows,
or macOS. The TTF files were sourced from:

    /System/Library/Fonts/Supplemental/Arial*.ttf

on a licensed macOS machine belonging to the development team.

## Scope of use

- **Permitted:** embedding in server-generated PDFs for our own
  commercial quotes, provided each end machine running the image is
  covered by a Microsoft license.
- **Not permitted:** redistributing the TTF files as standalone assets,
  serving them as web fonts to third parties, publishing this repo
  publicly.

## If this repo ever becomes public

Move `fonts/arial/` out of version control (or replace the contents
with a `.gitkeep` + README pointing to a secured internal artifact
store) **before** flipping visibility. The Dockerfile would need an
updated `COPY` path or a fetch step at build time.

## Fallbacks

The CSS font stack in `src/lib/pdf/quote-template.ts` lists
`Arial, "Liberation Sans", "Noto Sans", sans-serif`. If the Arial
COPY step ever fails or is removed, the image still renders quotes
in Liberation Sans (metric-compatible with Arial, so layouts stay
identical) with Noto Sans as the final fallback for rare glyphs.
