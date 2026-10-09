# Step 3 — screens pushed to Figma

Pushed into the designer's file with the same scripts UX Studio's "Push to Figma" generates
(`lib/figma/export.ts`), on the medication-reminders sample.

| Section | What it shows |
| --- | --- |
| [Today · Android · light](https://www.figma.com/design/2p2wcD2i751EzR4dxG4auF/?node-id=6-53) | 5 states; colours bound to Material 3 variables in the Teal LT mode, M3 text styles, real M3 Button instances |
| [Dose reminder · Android · light](https://www.figma.com/design/2p2wcD2i751EzR4dxG4auF/?node-id=9-25) | Bottom sheet in 4 states (default, loading, error, success) |
| [Today · iOS · light](https://www.figma.com/design/2p2wcD2i751EzR4dxG4auF/?node-id=7-22) | 5 states drawn from the iOS theme tokens (Apple's kit can't be read via the API); Inter in place of SF Pro |

Fixes found while pushing, now built into the generator:
- SF Pro isn't renderable outside Apple devices → Apple fonts are swapped for Inter.
- Auto-layout could leave growing text columns at zero width → a "settle" pass sizes them.
- Variable-bound paints lose their opacity → the sheet scrim is a plain 32% black fill.
