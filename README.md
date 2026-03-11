# ChatGPT SidePanel Dev Agent — Chrome Extension (MV3)
Version 0.1.2

## What's new
- **No eager HTML push** → prevents 128k context overflows.
- **Per-turn chunk quota** (default 2) → model can fetch more in the next turn.
- **Heuristic history trimming** to reduce token usage.
- New tools: **getDigest**, **getHtmlBySelector**, **getTextBySelector**.
- **Watch mode** (SPA/DOM changes): resnapshots meta/digest after route changes or big DOM mutations.

## Install
1) chrome://extensions → Developer mode → Load unpacked → select this folder.
2) Open the Side Panel from the toolbar button.

## Use
- Click **Snapshot DOM** → sends META + DIGEST (no full HTML).
- Ask ChatGPT for actions; it will request `getSourceChunk` or selector-based tools as needed.
- Toggle **Watch: On** to auto-resume on URL/DOM changes (SPAs).

## Tips to avoid overflows
- Keep conversations focused; long unrelated chat increases tokens.
- Let the model fetch small, relevant windows (selectors) instead of whole-page chunks.
- Increase chunk quota carefully if needed (sidepanel.js → MAX_CHUNKS_THIS_TURN).
