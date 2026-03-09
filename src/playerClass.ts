import type { Player, PlayerClass } from "./types";

export const PLAYER_CLASS_OPTIONS: PlayerClass[] = [
  "Innocent",
  "Neutral",
  "Killer"
];

const FORCED_CLASS_BY_ROLE: Record<string, PlayerClass> = {
  Doctor: "Innocent",
  Survivor: "Neutral",
  Bomber: "Neutral",
  Thief: "Neutral",
  Sorcerer: "Neutral",
  Haunter: "Neutral",
  Blame: "Killer",
  Cleaner: "Killer"
};

const NON_NEUTRAL_ROLE_CLASSES: PlayerClass[] = ["Innocent", "Killer"];

export function getClassRoleId(primaryRole?: string, _secondaryRole?: string) {
  // Class validation follows the actual assigned role. Mad's pretending role stays isolated.
  return primaryRole;
}

export function getForcedClassForRole(roleId?: string) {
  if (!roleId) {
    return undefined;
  }

  return FORCED_CLASS_BY_ROLE[roleId];
}

export function isClassLockedByRole(roleId?: string) {
  return Boolean(getForcedClassForRole(roleId));
}

export function getAllowedClassesForRole(roleId?: string) {
  const forcedClass = getForcedClassForRole(roleId);
  if (forcedClass) {
    return [forcedClass];
  }

  if (!roleId) {
    return [...PLAYER_CLASS_OPTIONS];
  }

  return [...NON_NEUTRAL_ROLE_CLASSES];
}

export function reconcilePlayerClassWithRole(
  roleId: string | undefined,
  currentClass: PlayerClass | null | undefined
) {
  const forcedClass = getForcedClassForRole(roleId);
  if (forcedClass) {
    return forcedClass;
  }

  const allowedClasses = getAllowedClassesForRole(roleId);
  if (currentClass && allowedClasses.includes(currentClass)) {
    return currentClass;
  }

  return null;
}

export function getEffectivePlayerClass(player: Pick<Player, "primaryRole" | "secondaryRole" | "assignedClass">) {
  return reconcilePlayerClassWithRole(
    getClassRoleId(player.primaryRole, player.secondaryRole),
    player.assignedClass
  );
}

export function getClassCounts(
  players: Array<Pick<Player, "primaryRole" | "secondaryRole" | "assignedClass">>
) {
  return players.reduce(
    (counts, player) => {
      const effectiveClass = getEffectivePlayerClass(player);

      if (effectiveClass === "Innocent") {
        counts.innocent += 1;
      } else if (effectiveClass === "Killer") {
        counts.killer += 1;
      } else if (effectiveClass === "Neutral") {
        counts.neutral += 1;
      }

      return counts;
    },
    {
      innocent: 0,
      killer: 0,
      neutral: 0
    }
  );
}
