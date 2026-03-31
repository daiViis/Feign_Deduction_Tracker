# Feign Deduction Tracker <img width="50" height="50" alt="icon" src="https://github.com/user-attachments/assets/1e6da130-91ee-4198-94d7-badcb7f6c646" />

**Feign Deduction Tracker** is an interactive Overwolf overlay application for the social deduction game **Feign**. It serves as an in-game analytical hub, allowing players to easily track information, map out player movements, and deduce remaining roles to catch imposters and avoid mislynches.

It provides a clean, native UI with multi-monitor support and customizable hotkeys.

## Windows and Panels

The app consists of a main controller and four distinct panels that can be freely moved, resized, or toggled on/off to match any screen size.

### 1. Controller Bar
The command center of the overlay. Sitting at the top of your screen, this compact bar lets you toggle visibility for each panel, change the current timeline phase (e.g., Night 1), and reset the match when a new game begins.

<img width="323" height="27" alt="controlPanel" src="https://github.com/user-attachments/assets/cf43988c-b3c5-49f7-9cae-6d241fcc31a1" />

### 2. Player List
Your main hub for tracking the lobby. Here, you can add up to 15 players, arrange them by seat order, and explicitly note their claims, alignments (Innocent, Killer, Neutral), and life status. You can intuitively mark individuals as suspicious as the game progresses.

<img width="406" height="414" alt="playerList" src="https://github.com/user-attachments/assets/40e6a846-8b83-4cbf-969d-2dfe09703621" />

### 3. Detail
Provides a deep-dive timeline into a specific player. When you select someone from the Player List, the Detail Panel shows all recorded actions they have taken or received. This is where you input night actions (e.g., "Player A investigated Player B"), fueling the logic of the entire tracker.

<img width="383" height="499" alt="playerDetail" src="https://github.com/user-attachments/assets/d355028a-88ba-4edb-8f88-1a3eea0dd819" />

### 4. Visit Map
A visual mapping tool that draws the web of interactions. It parses the claims in the Detail Panel to draw directional arrows between players. This makes it incredibly easy to spot contradictions, such as two players claiming the same target.

<img width="338" height="318" alt="visitmap" src="https://github.com/user-attachments/assets/8e8d053b-b8f4-4aee-9daf-6ef500fc4315" />

### 5. Roles in Play
An automated deduction engine. As players claim roles and perform actions, this panel tracks the confirmed and possible roles remaining in the setup, helping you determine who is telling the truth.

<img width="277" height="226" alt="rolesinplay" src="https://github.com/user-attachments/assets/d57541e9-2832-476d-b8dc-7576899ff2e8" />

## Shortcuts

### Global Overwolf Hotkeys
These work through Overwolf even when the overlay windows are not focused.

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+D` | Toggle the full overlay: controller bar plus any panel that is currently enabled in overlay state |
| `Ctrl+Shift+L` | Toggle the Player List panel |
| `Ctrl+Shift+Q` | Toggle the Detail panel |
| `Ctrl+Shift+K` | Toggle the Roles in Play panel |
| `Ctrl+Shift+V` | Toggle the Visit Map panel |

### In-App Panel Shortcuts
These work when an overlay window is focused and the cursor is not inside a text input.

| Shortcut | Action | Availability |
| --- | --- | --- |
| `Alt+1` | Toggle Player List | Multi-window overlay and legacy single-window view |
| `Alt+2` | Toggle Detail | Multi-window overlay and legacy single-window view |
| `Alt+3` | Toggle Roles in Play | Multi-window overlay |
| `Alt+4` | Toggle Visit Map | Multi-window overlay |

### Picker and Editing Actions

| Shortcut | Action | Availability |
| --- | --- | --- |
| `Escape` | Close the open role picker or quick picker | Role picker and quick picker panels |
| `Enter` | Confirm a player-name edit | Player name editors |
| `Escape` | Cancel a player-name edit and restore the previous value | Player name editors |

## Notes

- The global hotkeys are defined in [`manifest.json`](./manifest.json) and can be customized through Overwolf hotkey settings.
- The `Alt+1` to `Alt+4` shortcuts are handled inside the app, so the relevant overlay window must be focused for them to work.
- In the legacy single-window route, only `Alt+1` and `Alt+2` are available because that layout only has left and right panels.
