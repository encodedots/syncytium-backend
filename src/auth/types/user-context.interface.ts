import { Role } from '../../rbac/enums/roles.enum';

/**
 * User context extracted from JWT and populated in request.user
 *
 * This interface is used throughout the application for RBAC checks
 * and tenant scoping.
 *
 * Note: tenantId is optional for ADMIN users who can access all tenants
 */
export interface UserContext {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null; // Optional for ADMIN users
  auth0Id: string;
}
