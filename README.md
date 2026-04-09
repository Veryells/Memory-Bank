# MemoryBank

MemoryBank is a lightweight, local-first Chrome extension that remembers answers you have already typed into web forms and helps you reuse them later.

## What It Does

- Detects common form fields on webpages
- Tries to identify the question being asked
- Matches that question against saved local memories
- Suggests or applies saved answers depending on your settings
- Lets you review, edit, and delete saved answers in a simple dashboard

## Tech

- TypeScript
- Chrome Extension Manifest V3
- Local storage only
- No AI features in the product itself

## Local Setup

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer Mode, choose `Load unpacked`, and select:

`C:\Users\Justin\Projects\MemoryBank`

## Project Structure

- `src/` application, domain, infrastructure, and UI code
- `dist/` compiled TypeScript output
- `manifest.json` extension manifest
- `popup.html` simple popup controls
- `options.html` simple dashboard for editing saved answers

## Notes

- The extension is designed to work across websites via `<all_urls>` in the manifest.
- The current UI is intentionally minimal.
- Initial scaffolding and implementation were created with OpenAI Codex, using the GPT-5-based Codex coding agent available in this session.
