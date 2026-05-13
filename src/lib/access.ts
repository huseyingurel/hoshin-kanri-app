import {
  DEPARTMENT_SCOPED_ROLES,
  ORG_WIDE_ROLES,
  type DepartmentScopedRole,
  type OrgWideRole,
} from "@/lib/domainTypes";

export { DEPARTMENT_SCOPED_ROLES, ORG_WIDE_ROLES };
export type { DepartmentScopedRole, OrgWideRole };

export function isOrgWideRole(role: string | undefined): boolean {
  if (!role) return false;
  return (ORG_WIDE_ROLES as readonly string[]).includes(role);
}

export function canManageSettings(role: string | undefined): boolean {
  return role === "ADMIN" || role === "PMO";
}

/** Kurum geneli değil, `departmentId` atanmış ve rol departman verisi görebilir. */
export function usesDepartmentalDataScope(
  role: string | undefined,
  departmentId: string | null | undefined
): boolean {
  if (!role || !departmentId) return false;
  if (isOrgWideRole(role)) return false;
  return (DEPARTMENT_SCOPED_ROLES as readonly string[]).includes(role);
}
