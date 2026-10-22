# VaCuus Menu Play (Figma 457:8)

Standalone RML/RCSS/JS screen for the VaCuus UI in `VaCuus_Test`.

The current Figma-to-Code context and its source-layer exports for node `457:8` are
preserved in `assets/figma-source-457-8/`. The generated React/Tailwind is reference
output only; the shipped screen is adapted to RML/RCSS/JS.

`assets/LamguardLogo.svg` is the supplied master asset. `play_menu.rml` references its
transparent 4x PNG rasterization because the VaCuus runtime image pipeline accepts PNG/JPEG,
not SVG; it is displayed at the SVG's native 16×35 dp size.

## Install

Copy this folder to `<Project>/Content/DevUI/Play`. In the VaCuus Widget Blueprint set
`Document` to `Play/play_menu.rml` and leave `Auto Load Document` enabled. The plugin
resolves project DevUI files after its own DevUI root, so this unique path is safe. Use
`update-ue.ps1` to deploy later source/font fixes without touching the art assets.

The UI emits flat game-bridge events through `vacuus.emit`:

- `ui:navigate` with `screen` and `documentPath` from the header.
- `game:mode_category`, `game:matchmaking_tab`, and `game:select_mode` from the GameMode selection screen.
- `game:play` from the large Play button.
- `game:private_room` from Private Room.
- `game:quit` from Quit.
- `ui:open_profile`, `ui:open_messages`, and `ui:open_notifications` from the bottom utility bar.

The three bottom utility hitboxes align to the separators in the Figma block and show a
subtle teal hover/pressed tint. Their click events still require the game's VaCuus
`OnJsEvent` handler to open the corresponding game UI.

The right side of the header follows Figma's `PlayerNameAndClanNameBlock`: clan name
(`Bermood`) above player name (`Metascript`), then a divider and the rank image. These are
mockup defaults; another in-document script can call
`PlayMenu.setPlayerHeader(clanName, playerName, rankImagePath)` to populate live player data.
The identity, divider, and rank are anchored from the topbar's right edge; their 1920px
reference positions are preserved with fixed 94dp, 69dp, and 10dp right insets respectively.

The game/Blueprint side must bind VaCuus `OnJsEvent` and perform the requested level,
screen, or quit action. The RML package does not assume game-specific level names or
Blueprint assets.

`Change Gamemode` opens the Figma `GameModeSelectionScreen` (node `487:66`) inside the
existing Play document. Its category/matchmaking tabs, mode filters, seven map cards,
Back, Quick Game, and Private Room controls are interactive. Map selection emits
`game:select_mode`; Quick Game emits `game:play` with the selected mode, map, category,
matchmaking tab, and filter. All map cards currently use the map thumbnail exported from
Figma; connect each card's `map` value to the corresponding UE map in the game's event
handler.
Filter rows show only a rectangular hover highlight; selecting a row reveals its `PLAY`
action. Pressing `PLAY` emits the Quick Game event for the selected filter.
When open, the Play card/button/Quit/Social block are hidden and the area below the header
receives a 10dp RmlUi backdrop blur with a 30% black tint; Back or Quick Game restores the
Play controls.

The Play area uses the current Figma hierarchy: a 398×210dp `GameModeCard`, with its
map art, overlay/border, title, mode name, two stats and Change Gamemode row; followed
by an independently anchored 398×70dp `GameMode Card Button` with its border, load-effect
stripes and PLAY label. Both remain anchored 25dp from the left and 112dp from the bottom
for the button; the card sits 4dp above it. Vector layers are retained as SVG sources in
`assets/figma-source-457-8/` and rasterized for the VaCuus runtime.
The map art now uses a canonical 397×210dp viewport and a normalized 2× 794×420 PNG;
CSS holds that exact slot for every selected background. Call
`PlayMenu.setModeBackground(path)` to replace its local image without changing card or
image dimensions.

## Fonts

Onest Regular/Medium/Bold are supplied by this converter repository. Inter Regular is
the Figma font used for “CHANGE GAMEMODE”; its static face and OFL license are included.
VaCuus currently needs static font files because the runtime does not select variable font axes.
