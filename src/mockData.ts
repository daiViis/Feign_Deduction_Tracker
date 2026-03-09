import {
  type Claim,
  type Contradiction,
  type MatchSeed,
  type NightAction,
  type Player,
  type ReviewItem,
  type TimelineEvent,
  type TimelineGroup,
  type UsedAbilityLog
} from "./types";
import { reconcilePlayerClassWithRole } from "./playerClass";
import { MAD_ROLE_ID, roleCatalog } from "./roles";

const now = "2026-03-08T12:00:00.000Z";

const seededRoles = {
  info: roleIdAt(4),
  guard: roleIdAt(7),
  confirmed: roleIdAt(12),
  counter: roleIdAt(14),
  protect: roleIdAt(5),
  pressure: roleIdAt(11),
  imported: roleIdAt(15),
  mad: findRoleId(MAD_ROLE_ID) ?? roleIdAt(6),
  madPretend: roleIdAt(4)
};

const players: Player[] = [
  {
    id: "p1",
    name: "Avery",
    seat: 1,
    isAlive: true,
    primaryRole: seededRoles.info,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.info, "Innocent"),
    roleStatus: "suspected",
    confidence: 2,
    tags: ["quiet", "late-claim"],
    suspicious: false,
    fullNote: "Opened by soft-claiming info and backed off when pressed.",
    notes: [
      { id: "n1", content: "Soft info claim D1", mode: "quick", createdAt: now }
    ],
    claimIds: ["c1"],
    actionIds: ["a1"],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [{ id: "r1", targetId: "p6", type: "trusts" }],
    sourceFlags: ["manual"],
    updatedAt: now
  },
  {
    id: "p2",
    name: "Blake",
    seat: 2,
    isAlive: true,
    primaryRole: seededRoles.guard,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.guard, "Killer"),
    roleStatus: "imported",
    confidence: 1,
    tags: ["defended"],
    suspicious: true,
    fullNote: "Pushed Faye after the first death with little evidence.",
    notes: [
      { id: "n2", content: "Hard push on Faye", mode: "quick", createdAt: now }
    ],
    claimIds: ["c2"],
    actionIds: [],
    usedAbilityIds: [],
    contradictionIds: ["x1"],
    relationships: [{ id: "r2", targetId: "p5", type: "suspects" }],
    sourceFlags: ["imported"],
    updatedAt: "2026-03-08T12:02:00.000Z"
  },
  {
    id: "p3",
    name: "Cora",
    seat: 3,
    isAlive: false,
    primaryRole: seededRoles.confirmed,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.confirmed, "Innocent"),
    roleStatus: "confirmed",
    confidence: 3,
    tags: ["confirmed"],
    suspicious: false,
    fullNote: "Dead after Night 1. Death aligned with Blake's story poorly.",
    notes: [
      { id: "n3", content: "Night 1 death", mode: "quick", createdAt: now }
    ],
    claimIds: ["c3"],
    actionIds: [],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [{ id: "r3", targetId: "p2", type: "contradicts" }],
    sourceFlags: ["manual", "imported"],
    updatedAt: "2026-03-08T11:57:00.000Z"
  },
  {
    id: "p4",
    name: "Dax",
    seat: 4,
    isAlive: true,
    primaryRole: seededRoles.counter,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.counter, "Killer"),
    roleStatus: "suspected",
    confidence: 1,
    tags: ["aggressive"],
    suspicious: true,
    fullNote: "Counterclaimed utility role after Avery's claim.",
    notes: [],
    claimIds: ["c4", "c5"],
    actionIds: [],
    usedAbilityIds: [],
    contradictionIds: ["x2"],
    relationships: [{ id: "r4", targetId: "p1", type: "contradicts" }],
    sourceFlags: ["manual"],
    updatedAt: "2026-03-08T12:03:00.000Z"
  },
  {
    id: "p5",
    name: "Elio",
    seat: 5,
    isAlive: true,
    primaryRole: undefined,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(undefined, "Neutral"),
    roleStatus: "unknown",
    confidence: 0,
    tags: ["quiet"],
    suspicious: false,
    fullNote: "",
    notes: [],
    claimIds: [],
    actionIds: ["a2"],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [],
    sourceFlags: ["manual"],
    updatedAt: "2026-03-08T11:55:00.000Z"
  },
  {
    id: "p6",
    name: "Faye",
    seat: 6,
    isAlive: true,
    primaryRole: seededRoles.protect,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.protect, "Innocent"),
    roleStatus: "suspected",
    confidence: 2,
    tags: ["defended"],
    suspicious: false,
    fullNote: "Claimed protective utility late in Day 1.",
    notes: [
      { id: "n4", content: "Late protect claim", mode: "quick", createdAt: now }
    ],
    claimIds: ["c6"],
    actionIds: ["a3"],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [{ id: "r5", targetId: "p1", type: "claimed-with" }],
    sourceFlags: ["manual"],
    updatedAt: "2026-03-08T12:01:00.000Z"
  },
  {
    id: "p7",
    name: "Gideon",
    seat: 7,
    isAlive: true,
    primaryRole: seededRoles.pressure,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.pressure, "Killer"),
    roleStatus: "suspected",
    confidence: 1,
    tags: ["pushed"],
    suspicious: true,
    fullNote: "Minimal contribution, jumped onto existing pressure.",
    notes: [
      { id: "n5", content: "Echoed push without reason", mode: "quick", createdAt: now }
    ],
    claimIds: [],
    actionIds: [],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [{ id: "r6", targetId: "p2", type: "claimed-with" }],
    sourceFlags: ["manual"],
    updatedAt: "2026-03-08T12:05:00.000Z"
  },
  {
    id: "p8",
    name: "Hera",
    seat: 8,
    isAlive: true,
    primaryRole: seededRoles.imported,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.imported, "Innocent"),
    roleStatus: "suspected",
    confidence: 2,
    tags: ["confirmed"],
    suspicious: false,
    fullNote: "Imported night visit line points to Avery.",
    notes: [],
    claimIds: ["c7"],
    actionIds: ["a4"],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [{ id: "r7", targetId: "p1", type: "suspects" }],
    sourceFlags: ["imported"],
    updatedAt: "2026-03-08T12:04:00.000Z"
  },
  {
    id: "p9",
    name: "Ivo",
    seat: 9,
    isAlive: true,
    primaryRole: undefined,
    secondaryRole: undefined,
    assignedClass: reconcilePlayerClassWithRole(undefined, null),
    roleStatus: "unknown",
    confidence: 0,
    tags: [],
    suspicious: false,
    fullNote: "",
    notes: [],
    claimIds: [],
    actionIds: [],
    usedAbilityIds: [],
    contradictionIds: [],
    relationships: [],
    sourceFlags: ["manual"],
    updatedAt: "2026-03-08T11:52:00.000Z"
  },
  {
    id: "p10",
    name: "Juno",
    seat: 10,
    isAlive: true,
    primaryRole: seededRoles.mad,
    secondaryRole: seededRoles.madPretend,
    assignedClass: reconcilePlayerClassWithRole(seededRoles.mad, "Killer"),
    roleStatus: "conflicted",
    confidence: 2,
    tags: ["late-claim"],
    suspicious: true,
    fullNote: "Mirrored Avery's role line in the same phase.",
    notes: [
      { id: "n6", content: "Mirrored claim timing", mode: "quick", createdAt: now }
    ],
    claimIds: ["c8"],
    actionIds: [],
    usedAbilityIds: [],
    contradictionIds: ["x3"],
    relationships: [{ id: "r8", targetId: "p1", type: "contradicts" }],
    sourceFlags: ["manual", "review"],
    updatedAt: "2026-03-08T12:06:00.000Z"
  }
];

const claims: Claim[] = [
  {
    id: "c1",
    playerId: "p1",
    round: 1,
    phase: "day",
    type: "soft",
    roleId: seededRoles.info,
    wording: `Soft ${seededRoles.info ?? "info"} line.`,
    createdAt: now
  },
  {
    id: "c2",
    playerId: "p2",
    round: 1,
    phase: "day",
    type: "soft",
    roleId: seededRoles.guard,
    wording: `Soft ${seededRoles.guard ?? "defensive"} claim.`,
    createdAt: now
  },
  {
    id: "c3",
    playerId: "p3",
    round: 1,
    phase: "day",
    type: "hard",
    roleId: seededRoles.confirmed,
    wording: `Hard claim ${seededRoles.confirmed ?? "confirmed role"}.`,
    createdAt: now
  },
  {
    id: "c4",
    playerId: "p4",
    round: 1,
    phase: "day",
    type: "soft",
    roleId: seededRoles.counter,
    wording: `I have ${seededRoles.counter ?? "utility"} info if needed.`,
    createdAt: now
  },
  {
    id: "c5",
    playerId: "p4",
    round: 2,
    phase: "day",
    type: "counterclaim",
    roleId: seededRoles.info,
    wording: `Actually Avery's line does not fit ${seededRoles.info ?? "that role"}.`,
    createdAt: "2026-03-08T12:08:00.000Z"
  },
  {
    id: "c6",
    playerId: "p6",
    round: 1,
    phase: "day",
    type: "hard",
    roleId: seededRoles.protect,
    wording: `Hard claim ${seededRoles.protect ?? "protective role"} late.`,
    createdAt: now
  },
  {
    id: "c7",
    playerId: "p8",
    round: 2,
    phase: "day",
    type: "soft",
    roleId: seededRoles.imported,
    wording: `Saw movement around Avery as ${seededRoles.imported ?? "utility role"}.`,
    createdAt: "2026-03-08T12:04:00.000Z"
  },
  {
    id: "c8",
    playerId: "p10",
    round: 2,
    phase: "day",
    type: "hard",
    roleId: seededRoles.madPretend,
    wording: `Hard claim ${seededRoles.madPretend ?? "copied role"}.`,
    createdAt: "2026-03-08T12:06:00.000Z"
  }
];

const actions: NightAction[] = [
  {
    id: "a1",
    actorId: "p1",
    targetId: "p6",
    round: 1,
    phase: "night",
    actionType: "Investigated",
    note: "Imported whisper line",
    source: "imported",
    createdAt: now
  },
  {
    id: "a2",
    actorId: "p5",
    targetId: "p3",
    round: 1,
    phase: "night",
    actionType: "Visited",
    note: "Manual suspicion",
    source: "manual",
    createdAt: now
  },
  {
    id: "a3",
    actorId: "p6",
    targetId: "p3",
    round: 1,
    phase: "night",
    actionType: "Protected",
    note: "Claimed save target",
    source: "manual",
    createdAt: now
  },
  {
    id: "a4",
    actorId: "p8",
    targetId: "p1",
    round: 2,
    phase: "night",
    actionType: "Investigated",
    note: "Parser line pending confirmation",
    source: "imported",
    createdAt: "2026-03-08T12:04:00.000Z"
  }
];

const usedAbilities: UsedAbilityLog[] = [];

const contradictions: Contradiction[] = [
  {
    id: "x1",
    severity: "medium",
    title: "Push conflicts with defensive claim",
    description: "Blake claimed defensive utility but pushed an early execution line aggressively.",
    playerIds: ["p2", "p6"],
    sourceEventIds: ["c2"],
    dismissed: false
  },
  {
    id: "x2",
    severity: "high",
    title: "Claim changed between days",
    description: `Dax moved from ${seededRoles.counter ?? "one role"} wording to counterclaiming ${seededRoles.info ?? "another role"}.`,
    playerIds: ["p4", "p1"],
    sourceEventIds: ["c4", "c5"],
    dismissed: false
  },
  {
    id: "x3",
    severity: "high",
    title: "Duplicate claim line",
    description: `Juno mirrored Avery's ${seededRoles.info ?? "role"} story while actually marked as ${seededRoles.mad ?? "Mad"}.`,
    playerIds: ["p10", "p1"],
    sourceEventIds: ["c1", "c8"],
    dismissed: false
  }
];

const reviewQueue: ReviewItem[] = [
  {
    id: "q1",
    kind: "action",
    playerId: "p8",
    rawInput: "N2 log: Hera -> Avery (?)",
    suggestedLabel: "Hera investigated Avery",
    confidence: 0.66,
    payload: {
      actionType: "Investigated",
      targetId: "p1",
      note: "Parser flagged target ambiguity."
    }
  },
  {
    id: "q2",
    kind: "note",
    playerId: "p2",
    rawInput: "voice: Blake says Faye lied about night target",
    suggestedLabel: "Add accusation note to Blake",
    confidence: 0.58,
    payload: {
      content: "Accused Faye of lying about target."
    }
  },
  {
    id: "q3",
    kind: "claim",
    playerId: "p7",
    rawInput: "transcript: Gideon soft utility line",
    suggestedLabel: "Soft claim on Day 2",
    confidence: 0.61,
    payload: {
      type: "soft",
      roleId: seededRoles.pressure,
      wording: "Soft utility line picked up in transcript."
    }
  }
];

const timelineEvents: TimelineEvent[] = [
  {
    id: "t1",
    round: 1,
    phase: "day",
    kind: "claim",
    playerIds: ["p3"],
    title: `Cora hard-claimed ${seededRoles.confirmed ?? "role"}`,
    detail: `Hard claim ${seededRoles.confirmed ?? "role"}.`,
    source: "manual",
    createdAt: now
  },
  {
    id: "t2",
    round: 1,
    phase: "night",
    kind: "death",
    playerIds: ["p3"],
    title: "Cora died",
    detail: "Night 1 death recorded.",
    source: "imported",
    createdAt: now
  },
  {
    id: "t3",
    round: 2,
    phase: "day",
    kind: "contradiction",
    playerIds: ["p4", "p1"],
    title: "Dax changed claim",
    detail: "Counterclaim against Avery conflicts with Day 1 story.",
    source: "manual",
    createdAt: "2026-03-08T12:08:00.000Z"
  },
  {
    id: "t4",
    round: 2,
    phase: "night",
    kind: "imported",
    playerIds: ["p8", "p1"],
    title: "Parser suggests Hera -> Avery",
    detail: "Low-confidence imported visit event.",
    source: "review",
    createdAt: "2026-03-08T12:04:00.000Z"
  }
];

const timelineGroups: TimelineGroup[] = [
  {
    id: "g1d",
    round: 1,
    phase: "day",
    expanded: false,
    eventIds: ["t1"]
  },
  {
    id: "g1n",
    round: 1,
    phase: "night",
    expanded: false,
    eventIds: ["t2"]
  },
  {
    id: "g2d",
    round: 2,
    phase: "day",
    expanded: true,
    eventIds: ["t3"]
  },
  {
    id: "g2n",
    round: 2,
    phase: "night",
    expanded: true,
    eventIds: ["t4"]
  }
];

export const tagOptions = [
  "aggressive",
  "quiet",
  "confirmed",
  "pushed",
  "defended",
  "late-claim",
  "counterclaim",
  "imported",
  "townread",
  "scumread"
];

export const actionOptions = [
  "Visited",
  "Investigated",
  "Protected",
  "Blocked",
  "Claimed attack",
  "Claimed info",
  "Unknown action"
];

export function createMockMatch(): MatchSeed {
  return {
    title: "Feign Match 04",
    round: 2,
    phase: "night",
    ingestionMode: "logs",
    selfPlayerIgnoreActions: false,
    ignoreActionsByPlayerId: {},
    fakeClaims: {},
    roleEvidenceOverrides: {},
    players: players.map((player) => ({
      ...player,
      tags: [...player.tags],
      notes: player.notes.map((note) => ({ ...note })),
      claimIds: [...player.claimIds],
      actionIds: [...player.actionIds],
      usedAbilityIds: [...player.usedAbilityIds],
      contradictionIds: [...player.contradictionIds],
      relationships: player.relationships.map((relationship) => ({
        ...relationship
      })),
      sourceFlags: [...player.sourceFlags]
    })),
    claims: claims.map((claim) => ({ ...claim })),
    actions: actions.map((action) => ({ ...action })),
    usedAbilities: usedAbilities.map((entry) => ({ ...entry })),
    contradictions: contradictions.map((contradiction) => ({
      ...contradiction,
      playerIds: [...contradiction.playerIds],
      sourceEventIds: [...contradiction.sourceEventIds]
    })),
    reviewQueue: reviewQueue.map((item) => ({
      ...item,
      payload: { ...item.payload }
    })),
    timelineEvents: timelineEvents.map((event) => ({
      ...event,
      playerIds: [...event.playerIds]
    })),
    timelineGroups: timelineGroups.map((group) => ({
      ...group,
      eventIds: [...group.eventIds]
    })),
    roles: roleCatalog.map((role) => ({ ...role })),
    tags: [...tagOptions]
  };
}

function roleIdAt(index: number, fallbackIndex = 0) {
  return roleCatalog[index]?.id ?? roleCatalog[fallbackIndex]?.id;
}

function findRoleId(roleId: string) {
  return roleCatalog.find((role) => role.id === roleId)?.id;
}
