import type { RoleOption } from "./types";

export const MAD_ROLE_ID = "Mad";

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
  if (!roleId) {
    return undefined;
  }

  return roles.find((role) => role.id === roleId);
}

function getRoleIdFromPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? path;
  return fileName.replace(/\.[^.]+$/, "");
}
