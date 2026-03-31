import type { RoleOption } from "./types";

export const MAD_ROLE_ID = "Mad";

const ROLE_ID_ALIASES: Record<string, string> = {
  "blame": "Blame",
  "blamer": "Blame",
  "insane": MAD_ROLE_ID,
  "mad": MAD_ROLE_ID,
  "serial killer": "Serial Killer"
};

const roleModules = import.meta.glob("../roles/*.{png,jpg,jpeg,webp,avif,gif,svg}", {
  eager: true,
  import: "default"
}) as Record<string, string>;

const ROLE_METADATA: Record<string, Omit<RoleOption, "id" | "imageSrc">> = {
  "Blame": {
    side: "Imposter",
    pickerSummary: "Frames dead players as imposters.",
    summary:
      "Targets a player at night and falsifies their revealed role if they die or get voted out. It is an information-manipulation role, not a direct kill.",
    visitBehavior: "Targets a player at night; notebook sources are unclear on visible visit traces.",
    keyEvidence:
      "A blamed elimination can show a false Imposter reveal. Dead players can uniquely tell they were blamed.",
    limitsOrCaveats:
      "Only matters if the targeted player dies at night or is exiled during the following day."
  },
  "Bomber": {
    side: "Neutral",
    pickerSummary: "Plants bombs, then detonates all.",
    summary:
      "Plants dynamite in different houses over multiple nights, then chooses when to detonate every planted bomb at once. The threat grows over time rather than immediately.",
    visitBehavior: "Targets a house each night to plant dynamite.",
    keyEvidence:
      "Dead players can see already planted bombs in their UI. Detonation creates a multi-target lethal event.",
    limitsOrCaveats:
      "One plant per night. Police cannot stop the Bomber from detonating once they choose to trigger it."
  },
  "Cleaner": {
    side: "Imposter",
    pickerSummary: "Hides a dead player's true role.",
    summary:
      "Marks a player so that if they die, their exact role is permanently concealed. This corrupts later role-checking information as well.",
    visitBehavior: "Targets a player at night; notebook sources are unclear on visible visit traces.",
    keyEvidence:
      "The dead player's role becomes a yellow question mark, even for later Investigator or Snitch effects.",
    limitsOrCaveats:
      "The effect only matters if that player dies, and the clean remains in place permanently once triggered."
  },
  "Doctor": {
    side: "Innocent",
    pickerSummary: "Heals a player against normal kills.",
    summary:
      "Visits a player at night to save them from standard lethal attacks. The UI also reports whether the heal mattered.",
    visitBehavior: "Leaves home to visit the targeted player's house.",
    keyEvidence:
      "Successful heals show green crosses; uneventful visits show red marks. The target house also gets a plus animation.",
    limitsOrCaveats:
      "Cannot target the same house two nights in a row. Cannot save against Haunter or Sorcerer attacks."
  },
  "Haunter": {
    side: "Neutral",
    pickerSummary: "Sets revenge kill if voted out.",
    summary:
      "Places a candle on a target at night, then only wins if the village votes them out. If exiled, they return next night to inevitably kill that marked target.",
    visitBehavior: "Leaves home to visit the target's house and place a candle.",
    keyEvidence:
      "Their revenge attack resolves with highest priority and ignores Doctor heals and Survivor shields.",
    limitsOrCaveats:
      "Must be voted out to cash in the revenge. If others kill the marked target first, the Haunter loses that route."
  },
  "Investigator": {
    side: "Innocent or Imposter",
    pickerSummary: "Sees two possible roles.",
    summary:
      "Searches a target's house and gets a card with two possible roles, one of which is correct. It is strong but highly sensitive to Cleaner and Mad distortions.",
    visitBehavior: "Leaves home to visit the targeted player's house.",
    keyEvidence:
      "Produces a two-role result card. Cleaned targets become double question marks; Mad can pollute what is shown.",
    limitsOrCaveats:
      "If the Investigator is Mad, the UI can show two completely random roles instead of useful information."
  },
  "Lookout": {
    side: "Innocent or Imposter",
    pickerSummary: "Sees everyone visiting one house.",
    summary:
      "Watches a single house and learns exactly who visited it that night. This is one of the cleanest sources of visit evidence in the game.",
    visitBehavior: "Leaves home to watch the targeted player's house.",
    keyEvidence:
      "Reports the exact identities and count of all visitors, including a Mad player physically visiting that house.",
    limitsOrCaveats:
      "If the Lookout is Mad, the UI can show fake counts and random visitors."
  },
  "Mad": {
    side: "Innocent",
    pickerSummary: "Gets fake UI for a fake role.",
    summary:
      "An Innocent who believes they have another Innocent role and receives fabricated UI feedback about it. Their physical movement still follows that believed role and remains real for deduction.",
    visitBehavior: "Visits houses according to the innocent role they think they are.",
    keyEvidence:
      "Leaves real footprints for Tracker and can be seen by Lookout, even while their personal UI feedback is fake.",
    limitsOrCaveats:
      "Cannot imitate Neutral or Imposter roles. Investigators can see the believed role as part of Mad-related misinformation."
  },
  "Police": {
    side: "Innocent or Imposter",
    pickerSummary: "Blocks a player's night action.",
    summary:
      "Visits a player and prevents them from leaving home, usually stopping their night action. It is a direct control role rather than an information role.",
    visitBehavior: "Leaves home to physically block the targeted player's house.",
    keyEvidence:
      "The blocked target fails to perform their normal night action.",
    limitsOrCaveats:
      "Cannot target the same person two nights in a row. Cannot block Serial Killer or Sorcerer."
  },
  "Provoker": {
    side: "Innocent or Imposter",
    pickerSummary: "Starts day with two votes on target.",
    summary:
      "Marks a player overnight so they wake with two votes already cast against them. It shifts day pressure more than it changes night information.",
    visitBehavior: "Targets a player at night to apply the provoke effect.",
    keyEvidence:
      "The target visibly begins the day phase with two votes already against them.",
    limitsOrCaveats:
      "One-shot style effect that refunds if the target dies that night. Also matters in some late-game tie scenarios."
  },
  "Serial Killer": {
    side: "Neutral",
    pickerSummary: "Untrackable killer aiming to solo win.",
    summary:
      "Kills a target each night and tries to outlast every other faction. It is designed to evade several normal deduction counters.",
    visitBehavior:
      "Leaves home first at night, making them effectively immune to Police and Trapper interactions.",
    keyEvidence:
      "Victims always reveal as an unknown yellow question mark instead of showing the exact killer role.",
    limitsOrCaveats:
      "Cannot be blocked by Police or caught by Trapper, and Tracker does not get normal movement evidence on them."
  },
  "Snitch": {
    side: "Innocent or Imposter",
    pickerSummary: "Privately learns one player's exact role.",
    summary:
      "Visits a player at night and privately receives their exact role afterward. It is precise information, but only for the Snitch and only once per successful use.",
    visitBehavior: "Leaves home to visit the targeted player's house.",
    keyEvidence:
      "The Snitch privately sees the role result; other players only get indirect deduction from the visit and later claims.",
    limitsOrCaveats:
      "One-time use, refunded if the target dies that same night. Mad can distort what the Snitch sees."
  },
  "Sorcerer": {
    side: "Neutral",
    pickerSummary: "Kills from home by role-guessing.",
    summary:
      "Guesses a target's exact role and casts lethal lightning without leaving home. A wrong guess backfires and kills the Sorcerer instead.",
    visitBehavior: "Stays home and attacks remotely with no physical visit.",
    keyEvidence:
      "Bypasses normal visit-based counters and can self-destruct on a bad guess.",
    limitsOrCaveats:
      "Immune to Police, Trapper, and Tracker interactions. Sorcerer damage ignores Doctor heals and Survivor shields."
  },
  "Survivor": {
    side: "Neutral",
    pickerSummary: "Uses limited shields to stay alive.",
    summary:
      "Targets themselves with a shield and tries to survive until the end of the match. It is a defensive neutral role rather than a proactive deduction role.",
    visitBehavior: "Targets self at night; notebook sources are unclear on visible visit traces.",
    keyEvidence:
      "The player survives standard lethal attacks while shielded, which can explain failed kills.",
    limitsOrCaveats:
      "Only three shields total. Shields do not stop Haunter or Sorcerer."
  },
  "Thief": {
    side: "Neutral",
    pickerSummary: "Kills to steal the victim's role.",
    summary:
      "Eliminates a target and permanently takes over their role for the rest of the game. It can inherit complex state from the stolen role.",
    visitBehavior: "Targets a player at night; notebook sources are unclear on visible visit traces.",
    keyEvidence:
      "Can inherit active state such as Bomb placements or existing Investigator information.",
    limitsOrCaveats:
      "Can be stopped by Police or Trapper before the theft goes through."
  },
  "Trapper": {
    side: "Innocent or Imposter",
    pickerSummary: "Sets a trap for one visitor.",
    summary:
      "Places a trap at a house to catch and block a visitor, preventing that visitor from using their role. It is strongest as a visit-control and contradiction tool.",
    visitBehavior: "Leaves home to place a trap at the target's house.",
    keyEvidence:
      "A trapped visitor is visibly stopped at the door and loses their action that night.",
    limitsOrCaveats:
      "Serial Killer is immune to traps. Police can also stop the Trapper from placing the trap."
  },
  "Tracker": {
    side: "Innocent or Imposter",
    pickerSummary: "Paints a house to trace movement.",
    summary:
      "Marks a house so the target's footsteps can be followed in the morning. It is one of the clearest movement-evidence roles in the game.",
    visitBehavior: "Leaves home to pour paint at the targeted player's house.",
    keyEvidence:
      "Creates visible footprints showing exactly which house the tracked player visited.",
    limitsOrCaveats:
      "Serial Killer is immune and leaves no footprints for this ability."
  }
};

export const roleCatalog: RoleOption[] = Object.entries(roleModules)
  .map(([path, imageSrc]) => ({
    id: getRoleIdFromPath(path),
    imageSrc,
    ...(ROLE_METADATA[getRoleIdFromPath(path)] ?? {})
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

export function getRoleById(roleId?: string, roles: RoleOption[] = roleCatalog) {
  const normalizedRoleId = normalizeRoleId(roleId);
  if (!normalizedRoleId) {
    return undefined;
  }

  return roles.find((role) => normalizeRoleId(role.id) === normalizedRoleId);
}

export function normalizeRoleId(roleId?: string | null) {
  if (!roleId) {
    return undefined;
  }

  const collapsedRoleId = roleId.trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!collapsedRoleId) {
    return undefined;
  }

  return ROLE_ID_ALIASES[collapsedRoleId.toLowerCase()] ?? collapsedRoleId;
}

function getRoleIdFromPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? path;
  return normalizeRoleId(fileName.replace(/\.[^.]+$/, "")) ?? fileName;
}
