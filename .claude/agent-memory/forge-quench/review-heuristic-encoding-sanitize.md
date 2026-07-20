---
name: review-heuristic-encoding-sanitize
description: When reviewing a fix that sanitizes/filters input to satisfy an external library's encoding contract, probe the library's ACTUAL failure set — don't trust a spec-derived subset or a single-value test
metadata:
  type: project
---

Product-agnostic reviewer heuristic for **input-sanitize / encoding-drop fixes** against a
third-party library (fonts, serializers, DB drivers, protocol encoders).

**The trap:** the author derives the "bad input" set from a *spec model* (e.g. "CP1252
leaves bytes 0x81,0x8D,0x8F,0x90,0x9D undefined") but the library rejects by a *different
domain* (e.g. pdf-lib WinAnsi encodes by **Unicode codepoint**, and rejects the entire C1
range U+0080–U+009F plus C0 controls and U+007F — because the CP1252 printable glyphs at
those byte slots live at other codepoints like U+20AC). Model ≠ reality → the drop-set
covers a fraction of what actually throws. A test that asserts one representative value
(0x81) passes and gives false confidence for the whole class.

**How to apply:** when no network is needed to run the library (standard fonts, in-proc
codecs), write a throwaway probe that iterates the *full input domain* through the real
library and reports the true failure set, then diff it against the committed drop-set.
Report both UNDER-drop (still throws → bug persists) and OVER-drop (dropped a valid char).
Confirmed 2026-07-14 in akkordio pdf.ts `WINANSI_UNDEFINED`: a probe over 0x00–0xFF via
`page.drawText(String.fromCharCode(cp), {font: Courier})` showed ~58 throwing codepoints;
the fix dropped only 5. The generic catch added alongside kept the app from crashing, so
the residue degrades to an error message, not a hard failure — but the stated "drawText
never throws" invariant in the code comment was still false. See [[defect-patterns-harness]]
for the harness-diff equivalents.
