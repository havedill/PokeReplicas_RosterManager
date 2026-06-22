# Pokebox for PokeReplicas

A Brave extension for [PokeReplicas](https://pokemonchampionsreplicateams.com/) that helps you manage your Pokémon Champions box (owned vs rented), sort teams by roster match, and discover which Pokémon to add next.

<img width="459" height="1191" alt="image" src="https://github.com/user-attachments/assets/094b3ce2-70bc-459b-87b9-935ed3711f41" />
<img width="1356" height="556" alt="image" src="https://github.com/user-attachments/assets/9a76e95b-0d6e-4025-9a14-f221c0310db0" />
<img width="922" height="681" alt="image" src="https://github.com/user-attachments/assets/6c65d497-f82a-4984-813c-5cef1d2a0d62" />


## Install in Brave

1. Clone or download this repository.
2. Open Brave and go to `brave://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `extension/` folder inside this repo:
   ```
   brave-extension-pokereplicas/extension/
   ```
6. The extension should appear as **Pokebox for PokeReplicas**.

After installing, visit [pokemonchampionsreplicateams.com](https://pokemonchampionsreplicateams.com/) and refresh the page if it was already open.

## Using the extension

### Manage your Pokebox

1. Click the **Pokebox** extension icon in the Brave toolbar — this opens the main window (920px tall, resizable).
2. Search for Pokémon and press **Enter** to add them.
3. Set each Pokémon as **Owned** or **Rented** (rented Pokémon cannot learn new moves or stats in Champions).
4. Use the **All / Owned / Rented** filters to browse your roster.

### Sort teams on PokeReplicas

On team list pages, look for the purple **Pokebox sort** control in the filter bar.

- Toggle it to reorder teams by how many roster Pokémon match.
- Each team card shows an overlay like `4/6` with owned/rented breakdown.
- Matched sprites are highlighted: green = owned, yellow = rented, faded = missing.

### Recommended picks

Click **Recommended picks** in the popup to open a separate window. It shows Pokémon you don't have yet that would unlock the most replica teams for your current box. Scores are based on:

- **Full teams** — teams that would become 6/6 if you added this Pokémon
- **Improved** — teams where your match count would go up
- **On X teams** — how often the Pokémon appears across the site

Team data is bundled with the extension and **refreshes automatically every 7 days** in the background. You never need to run a script or manually update anything. If data is stale when you open the popup, a refresh starts silently while you keep using the current cache.

### Backup and restore

Click **Backup team** in the popup to open a separate window where you can:

- **Export JSON** — saves your roster and settings to a file.
- **Import JSON** — restore from a file or pasted backup text.

Your roster is stored in browser sync storage (`chrome.storage.sync`), not in this repository.

## Updating after code changes

If you pull new changes or edit the extension locally:

1. Go to `brave://extensions/`.
2. Click the **Reload** button on Pokebox for PokeReplicas.
3. Refresh any open PokeReplicas tabs.

## Chrome and other Chromium browsers

This is a standard Manifest V3 extension. The same steps work in Chrome at `chrome://extensions/` — load the `extension/` folder as unpacked.

## Project structure

```
extension/
  logo.svg           App logo (vector source)
  icons/             Raster icons (16, 48, 128, 512)
  manifest.json      Extension config
  popup.html/js/css  Main Pokebox popup
  recommend.html     Recommended picks window
  backup.html        Backup / restore window
  shared.css         Shared styles across windows
  content.js/css     Site integration (sorting, overlays)
  roster-utils.js    Shared roster matching logic
  recommend.js       Recommended picks scoring
  teams-cache.js     Auto-refreshing team index cache
  background.js      Background refresh (7-day cycle)
  teams-index.json   Bundled team index (seed + offline fallback)
  pokemon_data.js    Champions Pokémon slug list
```
