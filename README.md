## Zotero Author Search

Lightweight Zotero 7 add-on that searches your library for other items written by the same authors as the currently selected reference. Results can be reviewed in a dialog and optionally saved into per-author collections.

### What's New in V1.1
- **Interactive Links**: Added clickable arrow icons (↗) to search results and generated notes that link directly to the Zotero item (`zotero://select/...`).
- **Copy to Clipboard**: A new "Copy" button formats the search results (Title, Authors, Journal, Year) and copies them to the system clipboard.
- **Add Note**: A new "Add Note" button creates a child note under the original item, saving the search results as a formatted HTML list with clickable links.

### Features
- Adds a `Search Authors` menu entry on item right-click (three matching modes: Flexible, Strict, Surname).
- Scans selected item creators, finds related items in the same library, and extracts affiliations from the `Extra` field when possible.
- Displays results in an interactive list with quick navigation back to the main library view.
- Optional action to save results into an `@SearchAuthor` parent collection with automatic per-author subcollections.
- English and Chinese locale strings bundled.

### Installation
- Prebuilt: load the packaged `author-search.xpi` through Zotero → Tools → Add-ons → cog menu → Install Add-on From File.
- From source:
  1) `npm install`
  2) `npm run build` to produce the XPI under `.scaffold/build`
  3) Install the generated XPI in Zotero.

### Usage
1) Select a single regular item in Zotero that contains author metadata.  
2) Right-click and choose `Search Authors`, then pick a matching mode:
   - Flexible: allows initial/partial first-name matches.  
   - Strict: requires exact first- and last-name matches.  
   - Surname: matches last names only.  
3) Wait for the progress toast; a dialog lists matching items with titles, authors, journal info, and dates. Click an entry to select it in the main Zotero pane.  
4) Click `Save as Collection` in the dialog to create `@SearchAuthor` with subcollections for each matched author containing their items.

### Development Notes
- Source lives in `src/`; bundled assets live in `addon/`. Build settings are defined in `zotero-plugin.config.ts`.
- Run `npm start` to start a watch build for live reloading in Zotero, or `npm test` for the basic startup smoke test.
