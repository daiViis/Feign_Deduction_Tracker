# Feign Overlay UX/UI Specification

## 1. Product Intent

This overlay is a dense deduction workspace for live Feign matches. It replaces scattered note-taking with a single compact surface optimized for fast scanning and one-step updates.

Primary operating principle:

- The player list is the main workspace.
- The detail panel is a secondary inspection and editing surface.
- The timeline is a reference surface.
- Low-confidence parsing and contradictions must stay visible without blocking core play.

The interface should feel like a compact investigation console, not a dashboard and not a marketing page.

## 2. Core Assumptions

- Typical match size: 8 to 14 players.
- Overlay window is resizable and may be docked to a second monitor or pinned over the game.
- Most interactions happen with mouse plus a few high-value keyboard shortcuts.
- Frequent actions must avoid full-screen modals.
- The app supports manual entry, imported game/log events, and parser review.

## 3. App Layout

### 3.1 Default Layout

Use a three-row shell:

- Row 1: `TopBar`
- Row 2: main content grid
- Row 3: collapsible `TimelinePanel`

Use a two-column main content grid:

- Left: `PlayerWorkspace`
- Right: `PlayerDetailPanel`

Add an optional overlay-side drawer on the far right:

- `ReviewQueueDrawer`

Recommended default overlay size:

- `1180 x 720`

Recommended default grid:

- Top bar height: `32px`
- Main content height: `1fr`
- Timeline expanded height: `160px`
- Timeline collapsed height: `28px`
- Left panel width: `minmax(540px, 1fr)`
- Right panel width: `360px`
- Review drawer width: `300px`

### 3.2 Layout Priority

If space becomes constrained, preserve in this order:

1. Top bar
2. Player list
3. Filter bar
4. Inline row actions
5. Detail panel
6. Timeline
7. Review drawer

### 3.3 Compact Mode

Compact mode is the active-play layout. It keeps only the minimum set required for round-to-round reasoning.

Show:

- Top bar
- Filter bar
- Dense player list
- Inline role assignment
- Suspicion state
- Quick note entry

Hide or collapse:

- Full detail panel
- Timeline body
- Review drawer body
- Advanced sections and secondary controls

Compact mode target window size:

- usable at `760 x 520`

## 4. Screen Structure

```text
AppShell
|- TopBar
|- MainContent
|  |- PlayerWorkspace
|  |  |- FilterBar
|  |  `- PlayerList
|  |     `- PlayerRow*
|  |- PlayerDetailPanel
|  |  |- SummarySection
|  |  |- ClaimsSection
|  |  |- NightActionsSection
|  |  |- NotesSection
|  |  |- ContradictionsSection
|  |  `- RelationshipsSection
|  `- ReviewQueueDrawer (optional overlay drawer)
`- TimelinePanel
```

## 5. Component Hierarchy

```text
AppShell
|- TopBar
|  |- MatchMeta
|  |- PhasePill
|  |- RoundIndicator
|  |- LifeCounter
|  |- SearchInput
|  |- CompactModeToggle
|  |- IngestionStatus
|  |- SettingsButton
|  `- CollapseButton
|- PlayerWorkspace
|  |- FilterBar
|  |  |- QuickFilterToggle*
|  |  |- SortMenu
|  |  `- ActiveFilterChips
|  `- PlayerList
|     |- ListHeader
|     `- PlayerRow*
|        |- StatusStripe
|        |- NameCell
|        |- RolePicker
|        |- ConfidenceIndicator
|        |- TagStrip
|        |- QuickNotePreview
|        `- RowActions
|- PlayerDetailPanel
|  |- PlayerHeader
|  |- SummarySection
|  |- ClaimList
|  |- NightActionList
|  |- NotesEditor
|  |- ContradictionPanel
|  `- RelationshipLinks
|- NightActionEditor (anchored popover)
|- QuickNoteInput (inline or popover)
|- TagSelector (popover)
|- RolePicker (anchored menu)
|- ReviewQueueDrawer
|  `- ReviewQueueItem*
`- TimelinePanel
   |- TimelineHeader
   `- TimelineGroup*
      `- TimelineEventRow*
```

## 6. Detailed Component Specs

### 6.1 AppShell

Purpose:

- Maintain persistent workspace layout.
- Preserve selection when panels collapse.
- Keep the player list stable while secondary UI changes.

Rules:

- Use CSS grid for shell geometry.
- Timeline collapse must not reflow the player list horizontally.
- Review drawer should slide over the right edge instead of resizing the player list.
- Persist panel sizes and compact mode in local settings.

### 6.2 TopBar

Height:

- `32px`

Contents left to right:

- Match title
- Phase indicator
- Round number
- Alive/dead counter
- Search input
- Compact toggle
- Ingestion status
- Settings
- Collapse overlay

Behavior:

- Keep all controls single-line.
- Use icon-only controls where labels are obvious.
- Search input width: `180px` default, shrink to `120px` on narrower layouts.
- Phase indicator is a high-contrast pill: `Day` or `Night`.
- Ingestion status is a small dot plus label, no diagnostic details by default.

### 6.3 FilterBar

Height:

- `28px`

Filters:

- Alive
- Dead
- Suspicious
- Has Notes
- Has Contradictions
- Claimed Role
- Imported

Rules:

- Render as compact toggle chips.
- Only one row of filters.
- Overflow filters move into a `More` menu.
- Keep active sort visible at all times.
- Support keyboard traversal with arrow keys.

### 6.4 PlayerList

Purpose:

- Main operational surface for all live play actions.

Structure:

- Sticky header row
- Scrollable row body
- Optional pinned current-turn markers

Default visible columns:

- Status
- Player
- Role
- Confidence
- Tags
- Note
- Actions

List behavior:

- Single-select list
- Hover highlights row
- Selected row remains obvious even when list loses hover
- Keyboard roving selection with `ArrowUp` and `ArrowDown`
- `Enter` opens detail focus
- Double-click can open detail, but single-click selection must remain primary

Sorting:

- Seat order
- Alphabetical
- Suspicion
- Last updated
- Role

Filtering:

- Client-side and immediate
- Search should match name, role, tags, and notes

### 6.5 PlayerRow

Target row heights:

- Default: `36px`
- Compact mode: `28px`

Grid anatomy:

- `4px` status stripe
- Name block
- Role block
- Confidence block
- Tag strip
- Note preview
- Action cluster

Row cell rules:

- Name is the primary text and always visible.
- Show alive/dead state via stripe plus icon, not icon alone.
- Suspected role is an inline badge/dropdown, not static text.
- Confidence uses three visual levels plus optional numeric tooltip.
- Tags show up to two pills inline plus `+N` overflow.
- Quick note preview is one line, ellipsized.
- Actions stay on the right edge and appear stronger on hover or selection.

Default action set:

- Assign role
- Add note
- Add action
- Mark suspicious

Selected state:

- Strong surface change
- 1px inset border or left accent
- Do not rely only on glow

Dead state:

- Lower text contrast
- Muted stripe color
- Optional skull or cross icon
- Keep row interactive

Conflicted state:

- Show a small warning marker in row header area
- Role badge gets conflict outline

Imported state:

- Use a subdued imported dot or corner marker
- Imported values should look editable, not locked

### 6.6 RolePicker

Preferred behavior:

- Anchored to the role badge in the row or detail panel
- Opens inline menu, not a full modal

Menu structure:

- Search input
- `Unknown`
- Suspected roles
- Confirmed roles
- Imported roles

Role states:

- `unknown`
- `suspected`
- `confirmed`
- `imported`
- `conflicted`

Visual rules:

- Suspected: neutral surface with colored text accent
- Confirmed: stronger fill and stronger label
- Imported: dotted border or import glyph
- Conflicted: warning outline

Input rules:

- Typing immediately filters roles
- `Enter` assigns highlighted role
- `Shift+Enter` assigns as confirmed
- `Esc` closes without change

### 6.7 QuickNoteInput

Modes:

- Inline expansion under note cell
- Anchored popover from note action

Default behavior:

- One-line input
- Save on `Enter`
- Cancel on `Esc`
- Autosave only on blur if value changed

Rules:

- Never steal the whole row width
- Keep editing inside list context
- After save, return focus to the row
- Timestamp every saved note

### 6.8 NightActionEditor

Purpose:

- Replace free-text action notes with structured input

Preferred flow:

1. Actor prefilled from selected player
2. Choose action type
3. Choose target
4. Optional note
5. Save

Presentation:

- Anchored popover or narrow side sheet
- Maximum width `320px`

Fields:

- Actor
- Action type
- Target
- Round
- Optional note

Rules:

- Default round to current round and phase
- Target picker should reuse live player list names
- Target selection should support keyboard search
- Action types should be a short controlled vocabulary
- Save action in one primary button or `Enter`

Recommended action vocabulary:

- Visited
- Investigated
- Protected
- Blocked
- Claimed attack
- Claimed info
- Unknown action

### 6.9 PlayerDetailPanel

Purpose:

- Focused editing and review for the selected player

Width:

- `360px` default
- `320px` minimum

Layout:

- Sticky player header
- Scrollable section stack
- Subtle dividers between sections

Sections in order:

1. Summary
2. Claims
3. Night Actions
4. Notes
5. Contradictions
6. Relationships

Panel rules:

- Do not use oversized cards inside the panel.
- Each section is a flat stack with header, content, and divider.
- Keep controls aligned to a consistent two-column utility layout where useful.

#### Summary Section

Include:

- Alive/dead toggle
- Suspected role selector
- Confidence slider
- Tags
- Suspicion toggle

#### Claims Section

Use a compact table/list.

Columns:

- Day
- Claim type
- Role
- Wording preview

Claim types:

- Hard claim
- Soft claim
- Counterclaim
- Retraction

#### Night Actions Section

Use chronological list rows.

Fields:

- Round
- Action type
- Target
- Source
- Note preview

Each row should support edit and delete.

#### Notes Section

Use multiline editor plus timestamped note history.

Behavior:

- Primary textarea for current extended note
- Below it, compact history list
- Preserve quick notes in timeline/history

#### Contradictions Section

Use utility alerts, not banners.

Each item shows:

- Severity
- Short title
- One-line explanation
- Linked players
- Source references
- Dismiss

Severity levels:

- Low
- Medium
- High

#### Relationships Section

Use compact linked-player rows.

Relationship types:

- Trusts
- Suspects
- Claimed with
- Contradicts
- Protected by

### 6.10 ClaimList

Purpose:

- Make claim history readable at a glance

Rules:

- Sort by round/day first, latest visible near top
- Show changed-story marker when claim type or target role changes
- Flag duplicate unique-role claims
- Link each claim to source event

### 6.11 TagSelector

Behavior:

- Anchored popover with search and recent tags
- Multi-select
- Fast toggle with one click

Guidelines:

- Prefer short tags only
- Max visible tag length: `14ch`
- Suggested tags: `aggressive`, `quiet`, `confirmed`, `pushed`, `defended`, `late-claim`

### 6.12 ContradictionPanel

Purpose:

- Show warnings without pretending to prove truth

Rules:

- Present contradictions as heuristic signals
- Keep copy factual and short
- Severity color should be muted, not alarm-red by default
- Dismiss action must be immediate
- Dismissed contradictions remain reviewable from queue/history

### 6.13 TimelinePanel

Purpose:

- Give round-by-round context without taking focus away from the list

Heights:

- Expanded: `120px` to `180px`
- Collapsed header: `28px`

Structure:

- Group by `Day N` and `Night N`
- Each group expandable/collapsible
- Dense event rows with icons and source markers

Event types:

- Death
- Claim
- Note
- Contradiction
- Imported event

Timeline row target height:

- `24px`

Rules:

- Latest group expanded by default
- Older groups collapsed after inactivity
- Clicking an event should focus relevant player or detail section

### 6.14 ReviewQueueDrawer

Purpose:

- Handle low-confidence imported events without blocking core play

Width:

- `300px`

Item layout:

- Raw input
- Suggested interpretation
- Confidence
- Accept
- Edit
- Dismiss

Rules:

- Drawer overlays from the right
- Closed by default unless queue is non-empty and auto-open is enabled
- Show count badge in top bar
- Edits should open a compact inline editor or reuse the existing action/claim editor

### 6.15 CompactModeView

Purpose:

- Preserve the fastest live-match workflow in a smaller overlay footprint

Composition:

- TopBar
- FilterBar
- Dense PlayerList
- Inline popovers for role, note, and action editing

Hidden by default:

- Persistent detail panel
- Expanded timeline
- Review queue body
- Lower-priority metadata and advanced controls

Rules:

- Player rows shrink to compact height
- Keep action icons always available on selected row
- Opening detail should use a temporary overlay sheet, not a layout split
- Exiting compact mode should restore previous expanded panel state

## 7. Interaction Rules

### 7.1 Primary Interactions

- Single click row: select player
- Double click row: focus/open detail
- Right click row: open context menu for fast actions
- Hover row: reveal stronger action affordances
- `Enter`: open detail focus or confirm current popover action
- `Esc`: close current popover and restore row focus

### 7.2 Keyboard Model

Recommended hotkeys for selected row:

- `ArrowUp` / `ArrowDown`: move selection
- `R`: open role picker
- `N`: open quick note
- `A`: open add action
- `S`: toggle suspicious
- `X`: toggle alive/dead
- `F`: focus search/filter
- `Tab`: move between list, detail, timeline, drawer

Guidelines:

- Keep hotkeys local to overlay focus
- Show hotkey hints in tooltips only, not always visible
- Preserve keyboard focus after save

### 7.3 Mouse Model

- Most-used actions are always within one click from selected row
- No full-screen modal for role assignment, quick notes, or simple action entry
- Context menus can expose secondary actions such as clear role, mark confirmed, copy summary, or dismiss contradictions

## 8. Spacing and Density Rules

Use a tight spacing scale:

- `2px`
- `4px`
- `6px`
- `8px`
- `12px`

General rules:

- Internal control padding: `4px 6px`
- Section padding in detail panel: `8px`
- Gap between stacked controls: `6px`
- Panel gap: `8px`
- Border radius: `4px`
- Divider thickness: `1px`

Avoid:

- Padding larger than `12px` in core workspace regions
- Radius larger than `6px`
- Empty decorative whitespace

## 9. Visual Style and Tokens

Typography:

- Primary font: `IBM Plex Sans`, `Segoe UI`, `sans-serif`
- Mono/supporting tokens: `IBM Plex Mono`, `Consolas`, `monospace`

Font sizes:

- App chrome: `12px`
- Row content: `13px`
- Section headers: `11px` uppercase or tracked small caps
- Detail body: `13px`

Line heights:

- Dense text: `1.2`
- Body text: `1.35`

Color tokens:

- `--bg-app: #0e1116`
- `--bg-panel: #141922`
- `--bg-panel-2: #181f29`
- `--bg-hover: #1d2632`
- `--bg-selected: #243142`
- `--border-subtle: #27303c`
- `--border-strong: #3a4656`
- `--text-primary: #e6ebf2`
- `--text-secondary: #aab4c3`
- `--text-muted: #7e8898`
- `--alive: #4aa56d`
- `--dead: #7c3f49`
- `--warn-low: #8f7a45`
- `--warn-med: #b48a38`
- `--warn-high: #b55a5a`
- `--accent-info: #5d87b9`
- `--accent-imported: #6f7ea0`

Surface rules:

- No large shadows
- Use subtle borders to separate regions
- Keep elevation mostly flat
- Use color and dividers more than blur or glow

## 10. Important State Behaviors

### 10.1 Selection

- Selected row has persistent filled background
- Selected detail panel header mirrors row identity
- Opening a popover should not visually lose selection

### 10.2 Hover

- Slight surface lift only
- Action icons increase contrast on hover
- Never hide critical data behind hover-only interactions

### 10.3 Suspicious

- Represent with a compact amber marker or badge
- Avoid full-row red styling

### 10.4 Confirmed Role

- Stronger role chip fill
- Higher contrast label
- Optional check icon

### 10.5 Imported Data

- Small source marker
- Tooltip can explain source on hover
- Imported fields remain editable

### 10.6 Contradictions

- Warning icon plus severity tint
- Do not shake, pulse, or animate aggressively
- Keep contradiction count visible in player list and detail header

## 11. Responsive Behavior for Overlay Resizing

Use width-based layout modes.

### 11.1 Wide: `>= 1180px`

- Two-column main layout
- Timeline expanded by default
- Review drawer may overlay without issue

### 11.2 Medium: `960px to 1179px`

- Two-column layout with narrower detail panel
- Hide note preview column before hiding role or actions
- Timeline starts collapsed by default

### 11.3 Narrow: `760px to 959px`

- Default to compact mode
- Detail panel becomes toggleable side sheet
- Timeline collapsed
- Review drawer closed unless manually opened

### 11.4 Minimal: `< 760px`

- Single-column list-first layout
- Only top bar, filter bar, player list, and inline popovers remain persistent
- Detail opens as temporary overlay sheet
- Timeline and review queue become icon-accessed drawers

Priority for column removal:

1. Note preview
2. Tags overflow
3. Confidence label text
4. Persistent detail panel

Never remove:

- Name
- Alive/dead marker
- Role control
- Quick actions

## 12. Implementation-Oriented React Guidance

### 12.1 Component Strategy

Use the following top-level React components:

- `AppShell`
- `TopBar`
- `FilterBar`
- `PlayerList`
- `PlayerRow`
- `PlayerDetailPanel`
- `RolePickerPopover`
- `QuickNotePopover`
- `NightActionPopover`
- `TimelinePanel`
- `ReviewQueueDrawer`

Guidelines:

- Keep row-level interactions local and cheap.
- Use anchored popovers for frequent edits.
- Centralize match state; localize transient UI state.

### 12.2 State Shape

Use normalized match data.

Suggested domain entities:

```ts
type RoleStatus = "unknown" | "suspected" | "confirmed" | "imported" | "conflicted";

type Player = {
  id: string;
  name: string;
  seat?: number;
  isAlive: boolean;
  suspectedRoleId?: string;
  roleStatus: RoleStatus;
  confidence: 0 | 1 | 2 | 3;
  tags: string[];
  quickNote?: string;
  fullNote?: string;
  contradictionIds: string[];
  claimIds: string[];
  actionIds: string[];
  sourceFlags?: ("manual" | "imported" | "review")[];
};

type Claim = {
  id: string;
  playerId: string;
  round: number;
  phase: "day" | "night";
  type: "hard" | "soft" | "counterclaim" | "retraction";
  roleId?: string;
  wording?: string;
  sourceEventId?: string;
};

type NightAction = {
  id: string;
  actorId: string;
  targetId?: string;
  round: number;
  actionType: string;
  note?: string;
  source: "manual" | "imported";
};

type Contradiction = {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  playerIds: string[];
  sourceEventIds: string[];
  dismissed: boolean;
};
```

UI state should be separate:

```ts
type OverlayUIState = {
  selectedPlayerId?: string;
  compactMode: boolean;
  search: string;
  filters: string[];
  sortBy: "seat" | "name" | "suspicion" | "updated" | "role";
  timelineCollapsed: boolean;
  reviewDrawerOpen: boolean;
  activePopover?: "role" | "note" | "action" | "tags";
};
```

### 12.3 Rendering Guidance

- Use CSS grid for the main shell and player rows.
- Use sticky headers for top bar, filter bar, and list header.
- Avoid virtualization until list size justifies it; Feign player counts are usually small.
- Use `useDeferredValue` for search/filter text if notes are included in search.
- Use `startTransition` for non-blocking filter/sort updates when imported data batches land.
- Prefer a reducer or store for match state because events come from multiple sources.

### 12.4 Accessibility and Input Reliability

- Use roving tabindex for rows.
- Every icon-only button needs a tooltip and `aria-label`.
- Keep focus restoration explicit after saving popovers.
- Do not trap focus inside small popovers unless they contain multi-field forms.

### 12.5 Event Ingestion Handling

Top bar status states:

- `Connected`
- `Logs Active`
- `Manual Only`
- `Review Needed`

Behavior:

- Status pill remains tiny and stable
- New imported events should update player rows optimistically
- Low-confidence events route to review queue, not directly into confirmed state

### 12.6 CSS Architecture

Recommended approach:

- CSS variables for tokens
- Layout primitives for panel, row, divider, chip, and icon button
- Component-scoped styles for row/popover interactions

Avoid:

- Heavy animation libraries
- Oversized motion
- Deep nested card systems

## 13. Recommended Default Behaviors

- Select the first alive player on overlay open if nothing is selected
- Preserve selected player across round changes
- Auto-advance note/action focus back to list after save
- Auto-expand contradiction section in detail only when a new high-severity contradiction is created
- Collapse older timeline groups when a new round starts
- Show parser review badge count in top bar even when drawer is closed

## 14. Summary for Coding

If implementing this from scratch:

1. Build `AppShell` with top bar, player workspace, detail panel, and collapsible timeline.
2. Implement `PlayerList` and `PlayerRow` first because they drive the primary workflow.
3. Add anchored `RolePicker`, `QuickNoteInput`, and `NightActionEditor` before building any complex modal.
4. Treat `PlayerDetailPanel` as a compact inspector with stacked utility sections.
5. Keep all spacing, controls, and typography dense enough for live gameplay, especially in compact mode.
