# PokeReplicas Roster Manager

A Brave extension for [PokeReplicas](https://pokemonchampionsreplicateams.com/) that lets you track your Pokémon Champions box (owned vs rented) and sort teams by how many Pokémon you can actually use.
<img width="424" height="653" alt="image" src="https://github.com/user-attachments/assets/c985d1b1-9cc7-4426-9e49-2d7bc9175907" />
<img width="1183" height="560" alt="image" src="https://github.com/user-attachments/assets/7904b384-2fa7-4c09-a10b-9d85df9cc1b5" />

## Install in Brave

1. Clone or download this repository.
2. Open Brave and go to `brave://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `extension/` folder inside this repo:
   ```
   brave-extension-pokereplicas/extension/
   ```
6. The extension should appear as **PokeReplicas Roster Manager**.

After installing, visit [pokemonchampionsreplicateams.com](https://pokemonchampionsreplicateams.com/) and refresh the page if it was already open.

## Using the extension

### Manage your Pokebox

1. Click the extension icon in the Brave toolbar.
2. Search for Pokémon and press **Enter** to add them.
3. Set each Pokémon as **Owned** or **Rented** (rented Pokémon cannot learn new moves or stats in Champions).
4. Use the **All / Owned / Rented** filters to browse your roster.

### Sort teams on PokeReplicas

On team list pages, look for the purple **Sort by Roster Match** control in the filter bar (`.fb-controls`).

- Enable it to reorder teams by how many roster Pokémon match.
- Each team card shows an overlay like `4/6` with owned/rented breakdown.
- Matched sprites are highlighted: green = owned, yellow = rented, faded = missing.

### Backup and restore

In the popup **Backup** section:

- **Export JSON** — saves your roster and settings to a file.
- **Import JSON** — restore from a file or pasted backup text.

Your roster is stored in browser sync storage (`chrome.storage.sync`), not in this repository.

## Updating after code changes

If you pull new changes or edit the extension locally:

1. Go to `brave://extensions/`.
2. Click the **Reload** button on PokeReplicas Roster Manager.
3. Refresh any open PokeReplicas tabs.

## Chrome and other Chromium browsers

This is a standard Manifest V3 extension. The same steps work in Chrome at `chrome://extensions/` — load the `extension/` folder as unpacked.

## Project structure

```
extension/
  manifest.json      Extension config
  popup.html/js/css  Pokebox manager UI
  content.js/css     Site integration (sorting, overlays)
  roster-utils.js    Shared roster matching logic
  pokemon_data.js    Champions Pokémon slug list
```
