# Changelog

All notable changes to the portfolio site.

## 1.2.0 · 10 October 2026

### Added
- **Brand mark in the header.** A chrome four-point north star, drawn as inline SVG so it stays sharp at any size. The chrome is silver in dark mode and black in light mode.
- **One-time reveal.** When the loader lifts, three gold claw marks slash across the header and the tears widen until the star shows through. The claws then fade and only the star stays. On pages with no loader it plays after a short delay. Visitors with reduced motion turned on just see the star.
- **Theme switch.** The star spins a quarter turn while the chrome fades to the new colour, with a brief gold glint.
- **Cursor orbit.** Over the star, the custom cursor no longer covers it: the ring locks into an orbit around the star with a soft gold halo, and the dot rides the ring on the side the mouse is on. The star swells slightly and a sheen sweeps across it.
- **Favicon** (favicon.svg): the star on a midnight tile.

### Fixed
- **Star missing after an update.** Browsers could keep the old script for up to 10 minutes alongside the new page, which left the star in its hidden pre-intro state. The stylesheet, script and favicon links now carry a version number (`?v=1.2.0`) so an update always loads together, and the star fades in on its own after 5 seconds if the intro never starts.

## 1.1.0 · 10 October 2026

### Changed
- **About page title** is now "Engineer. Be Brave." (it was "Engineer. Serial starter."). It uses the same cinematic style as the home statement: uppercase words blur in from depth one after another, with "Brave" set large in the Pinyon Script hand-lettered font, in gold (blue in light mode). The title is already on screen when the page opens, so it plays on load instead of being tied to scrolling.

## 1.0.1 · 10 October 2026

### Fixed
- **Hero name losing its first letter.** On some loads the first letter of each row of the hero name ("N" in NTWALI, "P" in PRESTON) stayed hidden below its clip, so the page read "TWALI / RESTON". The intro rise and the scroll-scrubbed split-apart effect both animated `yPercent` on the same letters. When ScrollTrigger refreshed mid-intro (on a resize, for example), the scrubbed timeline recorded the half-risen value as its start and held it there. The intro rise now animates `y` in pixels, so the two effects no longer share a property.

## 1.0.0 · 9 October 2026

- First public release on GitHub Pages: home (F1 car, jet formation, rocket), about, and the Solar TEG satellite and piezo harvester project pages.
- Midnight-blue dark theme (#070B19) in place of pure black.
