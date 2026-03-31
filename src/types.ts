export type Phase = "day" | "night";
export type RoleAssignmentSlot = "primary" | "secondary";

export type RoleStatus =
  | "unknown"
  | "suspected"
  | "confirmed"
  | "imported"
  | "conflicted";

export type PlayerClass = "Innocent" | "Neutral" | "Killer";
export type UnknownValue = "unknown";
export type ObservedPlayerClass = PlayerClass | UnknownValue;
export type UsedAbilityRoleType =
  | "Doctor"
  | "Police"
  | "Lookout"
  | "Investigator"
  | "Trapper"
  | "Snitch"
  | "Provoker"
  | "Tracker";
export type UsedAbilityLogSourceType = "self_action";
export type FakeClaimActionType = "Stayed Home" | "Visited";
export type AbilityPlayerReference = string | UnknownValue;
export type AbilityRoleReference = string | UnknownValue;
export type RoleInPlayGroupType = "role" | "class_only";
export type RoleInstanceStatus = "assigned" | "unclaimed";
export type EvidenceStrength = "confirmed" | "possible";
export type EvidenceSourceCategory =
  | "used_ability"
  | "night_action"
  | "claim"
  | "assignment";
export type EvidenceSourceType =
  | "ability_role"
  | "visit_evidence"
  | "reveal"
  | "claim"
  | "role_assignment"
  | "class_assignment";
export type VisitEvidenceSourceType =
  | "ability_log"
  | "manual_visit_evidence"
  | "imported_event";
export type VisitEvidenceConfidence = "confirmed" | "suspected" | "unknown";
export type DoctorReviveResult = "revived" | "not_revived" | UnknownValue;
export type PoliceMovementResult =
  | "tried_to_leave"
  | "stayed_home"
  | UnknownValue;

export type ConfidenceLevel = 0 | 1 | 2 | 3;

export type FilterKey =
  | "alive"
  | "dead"
  | "suspicious"
  | "hasNotes"
  | "hasContradictions"
  | "claimed"
  | "imported";

export type SortKey = "seat" | "name" | "suspicion" | "updated" | "role";

export type IngestionMode = "connected" | "logs" | "manual" | "review";

export type ClaimType = "hard" | "soft" | "counterclaim" | "retraction";

export type NoteMode = "quick" | "full";

export type RelationshipType =
  | "trusts"
  | "suspects"
  | "claimed-with"
  | "contradicts"
  | "protected-by";

export type ReviewKind = "note" | "claim" | "action";

export type TimelineEventKind =
  | "death"
  | "claim"
  | "note"
  | "contradiction"
  | "imported"
  | "action";

export type SourceFlag = "manual" | "imported" | "review";
export type TimelineViewMode = "focus" | "full";

export interface TimelineStep {
  phase: Phase;
  index: number;
}

export interface RoleOption {
  id: string;
  imageSrc: string;
  side?: "Innocent" | "Imposter" | "Neutral" | "Innocent or Imposter";
  pickerSummary?: string;
  summary?: string;
  visitBehavior?: string;
  keyEvidence?: string;
  limitsOrCaveats?: string;
}

export interface NoteEntry {
  id: string;
  content: string;
  mode: NoteMode;
  createdAt: string;
}

export interface RelationshipLink {
  id: string;
  targetId: string;
  type: RelationshipType;
  note?: string;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  isAlive: boolean;
  primaryRole?: string;
  secondaryRole?: string;
  assignedClass: PlayerClass | null;
  roleStatus: RoleStatus;
  confidence: ConfidenceLevel;
  tags: string[];
  suspicious: boolean;
  fullNote: string;
  notes: NoteEntry[];
  claimIds: string[];
  actionIds: string[];
  usedAbilityIds: string[];
  contradictionIds: string[];
  relationships: RelationshipLink[];
  sourceFlags: SourceFlag[];
  updatedAt: string;
}

export interface UsedAbilityLogMeta {
  id: string;
  playerId: string;
  roundNumber: number;
  sourceType: UsedAbilityLogSourceType;
  ignored: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsedAbilityDraftMeta {
  playerId: string;
  roundNumber: number;
}

export interface DoctorAbilityFields {
  roleType: "Doctor";
  targetPlayerId: AbilityPlayerReference;
  reviveResult: DoctorReviveResult;
}

export interface PoliceAbilityFields {
  roleType: "Police";
  targetPlayerId: AbilityPlayerReference;
  movementResult: PoliceMovementResult;
}

export interface LookoutAbilityFields {
  roleType: "Lookout";
  targetPlayerId: AbilityPlayerReference;
  seenVisitorIds: AbilityPlayerReference[];
}

export interface InvestigatorAbilityFields {
  roleType: "Investigator";
  targetPlayerId: AbilityPlayerReference;
  possibleResult1: InvestigatorPossibleResult;
  possibleResult2: InvestigatorPossibleResult;
}

export interface InvestigatorPossibleResult {
  role: AbilityRoleReference;
  class: ObservedPlayerClass;
}

export interface TrapperAbilityFields {
  roleType: "Trapper";
  trapTargetPlayerId: AbilityPlayerReference;
  trappedPlayerId: AbilityPlayerReference;
}

export interface SnitchAbilityFields {
  roleType: "Snitch";
  targetPlayerId: string;
  revealedRole: AbilityRoleReference;
  revealedClass: ObservedPlayerClass;
}

export interface ProvokerAbilityFields {
  roleType: "Provoker";
  targetPlayerId: AbilityPlayerReference;
}

export interface TrackerAbilityFields {
  roleType: "Tracker";
  trackedPlayerId: AbilityPlayerReference;
  destinationPlayerId: AbilityPlayerReference;
}

export interface EvidenceSource {
  type: EvidenceSourceType;
  sourceId: string;
  sourceCategory: EvidenceSourceCategory;
  strength: EvidenceStrength;
  summary: string;
  timelineStep?: TimelineStep;
}

export interface VisitEvidence {
  id: string;
  nightNumber?: number;
  sourceType: VisitEvidenceSourceType;
  sourceRole?: string | null;
  sourcePlayerId?: string | null;
  targetPlayerId?: string | null;
  targetRole?: string | null;
  ignored?: boolean;
  confidence?: VisitEvidenceConfidence;
  summary?: string;
}

export interface RoleInstance {
  id: string;
  status: RoleInstanceStatus;
  certainty: EvidenceStrength;
  assignedPlayerId?: string | null;
  candidatePlayerIds: string[];
  conflict: boolean;
  notes?: string;
  evidenceSources: EvidenceSource[];
  promotionEvidenceSourceKeys: string[];
}

export interface RoleInPlay {
  key: string;
  type: RoleInPlayGroupType;
  roleId?: string | null;
  classId?: PlayerClass | null;
  instances: RoleInstance[];
}

export interface KnownRoleEntry {
  roleId: string;
  status: string;
  assignedPlayerIds: string[];
  evidenceSources: EvidenceSource[];
  claimPlayerIds: string[];
}

export type UsedAbilityLog =
  | (UsedAbilityLogMeta & DoctorAbilityFields)
  | (UsedAbilityLogMeta & PoliceAbilityFields)
  | (UsedAbilityLogMeta & LookoutAbilityFields)
  | (UsedAbilityLogMeta & InvestigatorAbilityFields)
  | (UsedAbilityLogMeta & TrapperAbilityFields)
  | (UsedAbilityLogMeta & SnitchAbilityFields)
  | (UsedAbilityLogMeta & ProvokerAbilityFields)
  | (UsedAbilityLogMeta & TrackerAbilityFields);

export type UsedAbilityDraft =
  | (UsedAbilityDraftMeta & DoctorAbilityFields)
  | (UsedAbilityDraftMeta & PoliceAbilityFields)
  | (UsedAbilityDraftMeta & LookoutAbilityFields)
  | (UsedAbilityDraftMeta & InvestigatorAbilityFields)
  | (UsedAbilityDraftMeta & TrapperAbilityFields)
  | (UsedAbilityDraftMeta & SnitchAbilityFields)
  | (UsedAbilityDraftMeta & ProvokerAbilityFields)
  | (UsedAbilityDraftMeta & TrackerAbilityFields);

export interface FakeClaimEntry {
  timelineStep: TimelineStep;
  claimedAction: FakeClaimActionType;
  claimedTargetPlayerId?: string;
}

export interface FakeClaim {
  roleId?: string;
  entries: FakeClaimEntry[];
  notes: string;
}

export interface RoleEvidenceOverride {
  playerId?: string;
  strength: EvidenceStrength;
}

export interface Claim {
  id: string;
  playerId: string;
  round: number;
  phase: Phase;
  type: ClaimType;
  roleId?: string;
  wording?: string;
  sourceEventId?: string;
  createdAt: string;
}

export interface NightAction {
  id: string;
  actorId: string;
  targetId?: string;
  round: number;
  phase: Phase;
  actionType: string;
  note?: string;
  source: "manual" | "imported";
  createdAt: string;
}

export interface Contradiction {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  playerIds: string[];
  sourceEventIds: string[];
  dismissed: boolean;
}

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  playerId: string;
  rawInput: string;
  suggestedLabel: string;
  confidence: number;
  payload: Record<string, string | number | undefined>;
}

export interface TimelineEvent {
  id: string;
  round: number;
  phase: Phase;
  kind: TimelineEventKind;
  playerIds: string[];
  title: string;
  detail: string;
  source: SourceFlag;
  createdAt: string;
}

export interface TimelineGroup {
  id: string;
  round: number;
  phase: Phase;
  expanded: boolean;
  eventIds: string[];
}

export interface MatchSeed {
  title: string;
  round: number;
  phase: Phase;
  ingestionMode: IngestionMode;
  selfPlayerId?: string;
  selfPlayerIgnoreActions: boolean;
  ignoreActionsByPlayerId: Record<string, boolean>;
  fakeClaims: Record<string, FakeClaim>;
  roleEvidenceOverrides: Record<string, RoleEvidenceOverride>;
  players: Player[];
  claims: Claim[];
  actions: NightAction[];
  usedAbilities: UsedAbilityLog[];
  contradictions: Contradiction[];
  reviewQueue: ReviewItem[];
  timelineEvents: TimelineEvent[];
  timelineGroups: TimelineGroup[];
  roles: RoleOption[];
  tags: string[];
}
