# Visual review notes: LAMGUARD Play HTML

Reviewed source: user-provided `index.html` and a side-by-side browser/VaCuus-emulation screenshot (2026-10-18).

## Findings supported by the source

1. **An extra closing `</div>` exists in the profile header.** In the `.user` button, the `.user-label` is correctly closed, then a second `</div>` occurs before `.rank`. The converter's HTML tokenizer reports this at line 122 as an unmatched closing tag inside `<button>` and intentionally ignores it rather than closing a surrounding ancestor. This can cause differences from Chromium's HTML5 error recovery. The profile rank/helmet is not invented by the converter: both `.rank` and the helmet emoji are explicitly present in source HTML.
   - Fix in source: change `...Metascript</strong></div></div><div class="rank">...` to `...Metascript</strong></div><div class="rank">...`.
2. **The mode-card background includes an external URL plus `background-position` and `cover`.** The background value layers two gradients over an Unsplash image and ends the URL layer with `center 55%/cover`. `src/core/css-to-rcss.ts` already emits a warning for image-position/cover suffixes: the RCSS image decorator is element-sized and browser crop/position is approximated. This is a likely cause of the noticeable image-crop/composition difference on the screenshot, but the screenshot alone does not prove whether the source asset bytes or only the crop differ.
3. **The blank region is intentional.** The source CSS comment explicitly says the reference uses negative space and must not be given a full-screen hero. The verifier prompt therefore prohibits suggesting additional content just to fill that space.
4. The card, active navigation, mode stats, Change Gamemode and Play buttons, Quit button, bottom quick bar, and other named sections are present in the supplied source. Visual testing should focus on positions, typography, crop, paint layers and visible-state equivalence rather than counting only generated RML nodes.

## Visual judgement from the supplied screenshot

The main canvas geometry (header, active navigation, large negative space, card placement, and bottom quick bar) looks broadly aligned between left and right. The prominent image area inside the card is visibly different and should be treated as a major asset/crop discrepancy until verified in UE/PIE. This is a qualitative observation, not a measured pixel-similarity score.

## Recommended acceptance run

- Correct the stray HTML closing tag and reconvert.
- Check the generated diagnostics for the background-position/cover warning and confirm the image resource resolves from the exported `Content/DevUI/Assets` folder.
- Capture browser source and UE/PIE target screenshots at the same 1920×1080 state; use the AI visual reviewer as an advisory issue finder.
- Confirm remote image assets are actually included in the export. The converter's asset list is metadata until the exporter successfully downloads/packages the referenced URL; a browser preview that still uses a remote URL is not proof that the UE package contains it.
