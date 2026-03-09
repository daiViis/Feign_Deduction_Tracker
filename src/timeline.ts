import {
  type Claim,
  type EvidenceSource,
  type MatchSeed,
  type NightAction,
  type Phase,
  type TimelineEvent,
  type TimelineGroup,
  type TimelineStep,
  type UsedAbilityLog,
  type VisitEvidence
} from "./types";

type TimelineBoundRecord = {
  round: number;
  phase: Phase;
};

export function createTimelineStep(phase: Phase, index: number): TimelineStep {
  return {
    phase: "night",
    index: Math.max(1, Math.trunc(index) || 1)
  };
}

export function getTimelineStepKey(step: TimelineStep) {
  return `${step.phase}:${step.index}`;
}

export function compareTimelineSteps(left: TimelineStep, right: TimelineStep) {
  return left.index - right.index;
}

export function isSameTimelineStep(
  left?: TimelineStep | null,
  right?: TimelineStep | null
) {
  if (!left || !right) {
    return false;
  }

  return left.index === right.index;
}

export function getLabelForTimelineStep(step: TimelineStep) {
  return `Night ${step.index}`;
}

export function getMatchTimelineStep(match: MatchSeed) {
  return createTimelineStep(match.phase, match.round);
}

export function getTimelineStepFromClaim(claim: Claim) {
  return createTimelineStep(claim.phase, claim.round);
}

export function getTimelineStepFromAction(action: NightAction) {
  return createTimelineStep(action.phase, action.round);
}

export function getTimelineStepFromUsedAbility(entry: UsedAbilityLog) {
  return createTimelineStep("night", entry.roundNumber);
}

export function getTimelineStepFromTimelineEvent(event: TimelineEvent) {
  return createTimelineStep(event.phase, event.round);
}

export function getTimelineStepFromTimelineGroup(group: TimelineGroup) {
  return createTimelineStep(group.phase, group.round);
}

export function getTimelineStepFromVisitEvidence(entry: VisitEvidence) {
  if (!entry.nightNumber) {
    return undefined;
  }

  return createTimelineStep("night", entry.nightNumber);
}

export function getTimelineStepFromEvidenceSource(source: EvidenceSource) {
  return source.timelineStep;
}

export function getTimelineSteps(match: MatchSeed) {
  const stepsByKey = new Map<string, TimelineStep>();
  const addStep = (step?: TimelineStep | null) => {
    if (!step) {
      return;
    }

    stepsByKey.set(getTimelineStepKey(step), step);
  };

  for (let index = 1; index <= match.round; index += 1) {
    addStep(createTimelineStep("night", index));
  }

  addStep(getMatchTimelineStep(match));

  match.claims.forEach((claim) => addStep(getTimelineStepFromClaim(claim)));
  match.actions.forEach((action) => addStep(getTimelineStepFromAction(action)));
  match.usedAbilities.forEach((entry) => addStep(getTimelineStepFromUsedAbility(entry)));
  match.timelineEvents.forEach((event) => addStep(getTimelineStepFromTimelineEvent(event)));
  match.timelineGroups.forEach((group) => addStep(getTimelineStepFromTimelineGroup(group)));

  return [...stepsByKey.values()].sort(compareTimelineSteps);
}

export function clampTimelineStep(match: MatchSeed, step?: TimelineStep | null) {
  const steps = getTimelineSteps(match);
  if (!step) {
    return getMatchTimelineStep(match);
  }

  const exactStep = steps.find((entry) => isSameTimelineStep(entry, step));
  return exactStep ?? getMatchTimelineStep(match);
}

export function getEventsForTimelineStep<T extends TimelineBoundRecord>(
  items: T[],
  step: TimelineStep
) {
  return items.filter((item) => item.round === step.index);
}

export function getVisitEdgesForTimelineStep(entries: VisitEvidence[], step: TimelineStep) {
  if (step.phase !== "night") {
    return [];
  }

  return entries.filter((entry) => entry.nightNumber === step.index);
}

export function getUsedAbilitiesForTimelineStep(
  entries: UsedAbilityLog[],
  step: TimelineStep
) {
  if (step.phase !== "night") {
    return [];
  }

  return entries.filter((entry) => entry.roundNumber === step.index);
}

export function sortTimelineStepsForDisplay(
  steps: TimelineStep[],
  selectedStep: TimelineStep
) {
  return [...steps].sort((left, right) => {
    const leftSelected = isSameTimelineStep(left, selectedStep);
    const rightSelected = isSameTimelineStep(right, selectedStep);
    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }

    return compareTimelineSteps(right, left);
  });
}

export function getTimelineStepOptionIndex(steps: TimelineStep[], step: TimelineStep) {
  return steps.findIndex((entry) => isSameTimelineStep(entry, step));
}

export function groupItemsByTimelineStep<T>(
  items: T[],
  getStep: (item: T) => TimelineStep | undefined
) {
  const groups = new Map<string, { step: TimelineStep; items: T[] }>();

  for (const item of items) {
    const step = getStep(item);
    if (!step) {
      continue;
    }

    const key = getTimelineStepKey(step);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(key, { step, items: [item] });
  }

  return [...groups.values()].sort((left, right) =>
    compareTimelineSteps(right.step, left.step)
  );
}
