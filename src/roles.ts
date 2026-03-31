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

export const roleCatalog: RoleOption[] = Object.entries(roleModules)
  .map(([path, imageSrc]) => ({
    id: getRoleIdFromPath(path),
    imageSrc
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
