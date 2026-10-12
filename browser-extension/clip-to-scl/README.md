# Clip to SCL (Chrome extension)

Send the page you are viewing — and any text you highlighted — to SCL Professional Intelligence as an **unreviewed source**.
Useful for pages SCL must not fetch automatically (e.g. LinkedIn), because *you* view and select the content.

## Install (once)
1. Open `chrome://extensions`, switch on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder: `browser-extension/clip-to-scl`.
3. Pin "Clip to SCL" from the puzzle-piece menu.

## Use
* Highlight text on a page → right-click → **Clip selection to SCL**, or click the toolbar icon → **Clip to SCL**.
* A new SCL tab opens with the clip. Pick the professional, check the excerpt, **Save as source**. Then link it to claims and verify it.
* Settings (toolbar icon → Settings): change the SCL address if it is not `http://127.0.0.1:3000`.

## Privacy
* Permissions: `activeTab` + `scripting` (read your selection only when you click), `contextMenus`, `storage` (the app address). No access to any site in the background, no analytics.
* The clip travels in the URL fragment (`#clip=…`), which browsers never send to a server; the SCL page reads it locally.
* Emails and phone numbers are removed by default in SCL before saving.
* Clip only what you are permitted to use; respect each site's terms.
