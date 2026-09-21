/**
 * @file lib/navigation.ts
 *
 * Centralized route definitions for the Black Tier Circle dashboard.
 * All internal links must reference these constants — never hardcode paths.
 * This makes route changes a one-line edit.
 *
 * @module Navigation
 */

import type { UserRole } from '@/modules/identity/types';

export const ROUTES = {
  home: '/',
  login: '/login',
  invite: (token: string) => `/invite/${token}`,
  owner: {
    home: '/owner',
    resellers: '/owner/resellers',
    resellersInvite: '/owner/resellers/invite',
    products: '/owner/products',
    orders: '/owner/orders',
    settings: '/owner/settings',
  },
  reseller: {
    home: '/reseller',
    bot: '/reseller/bot',
    products: '/reseller/products',
    wallet: '/reseller/wallet',
    orders: '/reseller/orders',
    settings: '/reseller/settings',
  },
} as const;

export const API_PREFIX = '/api';

export const API_ROUTES = {
  authLogin: `${API_PREFIX}/auth/login`,
  authLogout: `${API_PREFIX}/auth/logout`,
  invitationsCreate: `${API_PREFIX}/invitations/create`,
  invitationsAccept: `${API_PREFIX}/invitations/accept`,
  invitationsValidate: `${API_PREFIX}/invitations/validate`,
  resellers: `${API_PREFIX}/resellers`,
  resellerStatus: (tenantId: string) => `${API_PREFIX}/resellers/${tenantId}/status`,
} as const;

/**
 * Returns whether a pathname is an invite onboarding route.
 *
 * @param pathname - Request pathname
 */
export function isInviteRoute(pathname: string): boolean {
  return pathname.startsWith(`${ROUTES.invite('')}`);
}

/**
 * Returns whether a pathname is an API route (auth handled in the route).
 *
 * @param pathname - Request pathname
 */
export function isApiRoute(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

/**
 * Returns whether a pathname is an owner dashboard route.
 *
 * @param pathname - Request pathname
 */
export function isOwnerRoute(pathname: string): boolean {
  return pathname === ROUTES.owner.home || pathname.startsWith(`${ROUTES.owner.home}/`);
}

/**
 * Returns whether a pathname is a reseller dashboard route.
 *
 * @param pathname - Request pathname
 */
export function isResellerRoute(pathname: string): boolean {
  return pathname === ROUTES.reseller.home || pathname.startsWith(`${ROUTES.reseller.home}/`);
}

/**
 * Returns the default dashboard home for a role.
 *
 * @param role - Authenticated profile role
 */
export function dashboardHomeForRole(role: UserRole): string {
  return role === 'owner' ? ROUTES.owner.home : ROUTES.reseller.home;
}

/**
 * Returns true when `next` is an in-app path the given role is allowed to open.
 *
 * @param nextPath - Candidate redirect from the login `next` query param
 * @param role - Authenticated profile role
 */
export function isSafeNextPath(nextPath: string, role: UserRole): boolean {
  if (!nextPath.startsWith('/') || nextPath.startsWith('//') || nextPath.includes('\\')) {
    return false;
  }
  if (role === 'owner') {
    return isOwnerRoute(nextPath);
  }
  return isResellerRoute(nextPath);
}
