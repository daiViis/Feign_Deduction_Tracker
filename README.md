# Feign Deduction Tracker

**Feign Deduction Tracker** is an interactive Overwolf overlay application for the social deduction game **Feign**. It serves as an in-game analytical hub, allowing players to easily track information, map out player movements, and deduce remaining roles to catch imposters and avoid mislynches.

It provides a clean, native UI with multi-monitor support and customizable hotkeys.

## Windows and Panels

The app consists of a main controller and four distinct panels that can be freely moved, resized, or toggled on/off to match any screen size.

### 1. Controller Bar
The command center of the overlay. Sitting at the top of your screen, this compact bar lets you toggle visibility for each panel, change the current timeline phase (e.g., Night 1), and reset the match when a new game begins.

### 2. Player List
Your main hub for tracking the lobby. Here, you can add up to 15 players, arrange them by seat order, and explicitly note their claims, alignments (Innocent, Killer, Neutral), and life status. You can intuitively mark individuals as suspicious as the game progresses.

### 3. Detail
Provides a deep-dive timeline into a specific player. When you select someone from the Player List, the Detail Panel shows all recorded actions they have taken or received. This is where you input night actions (e.g., "Player A investigated Player B"), fueling the logic of the entire tracker.

### 4. Visit Map
A visual mapping tool that draws the web of interactions. It parses the claims in the Detail Panel to draw directional arrows between players. This makes it incredibly easy to spot contradictions, such as two players claiming the same target.

### 5. Roles in Play
An automated deduction engine. As players claim roles and perform actions, this panel tracks the confirmed and possible roles remaining in the setup, helping you determine who is telling the truth.
