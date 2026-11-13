# V-CROWN Panels (v0.1.0)

A SillyTavern extension for idol-survival cards such as PROJECT:V. It adds a gold **Program Record** panel with three tabs:

- **Mission**: the current mission card, the five-phase tracker and a progress log.
- **Ranking**: the official ranking with Active / Eliminated filters, plus a "your rank" bar.
- **Fans**: an X-style fan feed (For you / Trending) with verified badges, quote posts, fancam clips, polls, and like / repost buttons.

Nothing is added to your replies. Each tab is filled **on demand** by one extra generation with the model you already have connected ("Update record" or "Load new reactions"), and the result is stored in that chat's metadata, so every chat keeps its own record and feed.

## Install

Copy the `vcrown-panels` folder into your SillyTavern third-party extensions folder, then reload:

- Per user: `data/<your-user>/extensions/vcrown-panels/`
- Or global: `public/scripts/extensions/third-party/vcrown-panels/`

The folder must contain `manifest.json`, `index.js` and `style.css`. Then enable it under Extensions. You'll get:

- a gold crown button at the bottom right (can be turned off in the extension's settings),
- a "V-CROWN Panels" entry in the wand (Extensions) menu.

## Settings (Extensions panel > V-CROWN Panels)

- Show floating crown button
- Posts per load (4 to 12)
- Feed accent colour (X blue or gold)

## Notes

- Works best with a model that reliably returns JSON. If a call fails you'll see a message at the bottom of the panel; just tap the button again.
- Each update reads the whole chat context, so it costs about one extra reply.
- The phase list (five phases, vote weights) is the one from the PROJECT:V lorebook and is defined at the top of `index.js` (`PHASES`) if you want to change it.
- Model output is always rendered as plain text, never as HTML.

## Not in v0.1

Auto-update every N messages, a pre-generated 100-trainee roster, per-trainee profile pages, and a forum tab.
