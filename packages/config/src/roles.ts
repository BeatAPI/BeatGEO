/**
 * Organization membership roles. Pure and dependency-free, so a client bundle
 * can import it.
 */

/**
 * Roles that may manage an organization. "admin" is what local provisioning
 * writes; "owner" is what better-auth's own organization creation writes. Both
 * are accepted; a plain "member" is not.
 */
export const ORG_ADMIN_ROLES: readonly string[] = ["admin", "owner"];

export function isOrgAdminRole(role: string | null | undefined): boolean {
	return role != null && ORG_ADMIN_ROLES.includes(role);
}
