# MemoryBank

MemoryBank is a lightweight, local-first Chrome extension that remembers answers you have already used in web forms and helps you reuse them later.

Initial scaffolding for this project was created with OpenAI Codex using the GPT-5-based Codex coding agent available in this session.

## How It Works

MemoryBank watches supported form fields on a page, tries to identify the question being asked, and checks whether you have a saved answer for that question.

If it finds a match, it can:
- suggest the saved answer
- ask before applying it
- auto-apply it, depending on your settings

If you type a new meaningful answer into a normal form field, MemoryBank can prompt you to save it for later reuse.

Saved answers are stored locally in Chrome storage. The extension is designed to stay simple and local-first.

## What It Supports

- text inputs
- textareas
- select dropdowns
- checkboxes
- radio groups

It does not try to save obvious username or password fields.

## How To Use It

Use the popup to:
- enable or disable MemoryBank
- cycle between apply modes
- enable or disable the current site
- open the dashboard

Use the dashboard to:
- search saved memories
- edit a saved question
- edit the saved answer
- enable or disable a memory
- update tags and host metadata
- delete a memory

On supported pages, MemoryBank will show very simple inline prompts such as:
- `Apply`
- `Dismiss`
- `Save`

## Setup

Clone the repository:

```bash
git clone <your-repo-url>
cd MemoryBank
```

If you already have it cloned, pull the latest changes:

```bash
git pull
```

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

## Load In Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the project root:

`C:\Users\Justin\Projects\MemoryBank`

Load the project root, not `dist`, because:
- `manifest.json` is in the root
- compiled TypeScript output is in `dist/`

## Project Structure

- `src/` core logic, browser integrations, and UI code
- `dist/` compiled TypeScript output
- `manifest.json` Chrome extension manifest
- `popup.html` popup UI
- `options.html` dashboard UI

## Current Status

This repo contains the extension scaffold, core services, Chrome integration layer, simple popup, simple dashboard, and simple inline prompts for content pages.
