# Changelog

All notable changes to the portfolio site.

## 1.0.1 · 10 October 2026

### Fixed
- **Hero name losing its first letter.** On some loads the first letter of each row of the hero name ("N" in NTWALI, "P" in PRESTON) stayed hidden below its clip, so the page read "TWALI / RESTON". The intro rise and the scroll-scrubbed split-apart effect both animated `yPercent` on the same letters. When ScrollTrigger refreshed mid-intro (on a resize, for example), the scrubbed timeline recorded the half-risen value as its start and held it there. The intro rise now animates `y` in pixels, so the two effects no longer share a property.

## 1.0.0 · 9 October 2026

- First public release on GitHub Pages: home (F1 car, jet formation, rocket), about, and the Solar TEG satellite and piezo harvester project pages.
- Midnight-blue dark theme (#070B19) in place of pure black.
