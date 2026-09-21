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
    productNew: '/owner/products/new',
    productDetail: (id: string) => `/owner/products/${id}`,
    productEdit: (id: string) => `/owner/products/${id}/edit`,
    orders: '/owner/orders',
    orderDetail: (orderId: string) => `/owner/orders/${orderId}`,
    fulfillment: '/owner/fulfillment',
    payments: '/owner/payments',
    paymentDetail: (orderId: string) => `/owner/payments/${orderId}`,
    bots: '/owner/bots',
    settings: '/owner/settings',
    tokens: '/owner/tokens',
    wallets: '/owner/wallets',
    walletDetail: (walletId: string) => `/owner/wallets/${walletId}`,
  },
  reseller: {
    home: '/reseller',
    bot: '/reseller/bot',
    products: '/reseller/products',
    wallet: '/reseller/wallet',
    walletHistory: '/reseller/wallet/history',
    orders: '/reseller/orders',
    orderDetail: (orderId: string) => `/reseller/orders/${orderId}`,
    settings: '/reseller/settings',
  },
} as const;

export const API_PREFIX = '/api';

export const API_ROUTES = {
  authLogout: `${API_PREFIX}/auth/logout`,
  invitationsCreate: `${API_PREFIX}/invitations/create`,
  invitationsAccept: `${API_PREFIX}/invitations/accept`,
  invitationsValidate: `${API_PREFIX}/invitations/validate`,
  resellers: `${API_PREFIX}/resellers`,
  resellerStatus: (tenantId: string) => `${API_PREFIX}/resellers/${tenantId}/status`,
  products: `${API_PREFIX}/products`,
  product: (productId: string) => `${API_PREFIX}/products/${productId}`,
  productStatus: (productId: string) => `${API_PREFIX}/products/${productId}/status`,
  productListings: (productId: string) => `${API_PREFIX}/products/${productId}/listings`,
  productUpload: `${API_PREFIX}/products/upload`,
  productDownload: (productId: string, assetId: string) =>
    `${API_PREFIX}/products/${productId}/download/${assetId}`,
  productAsset: (productId: string, assetId: string) =>
    `${API_PREFIX}/products/${productId}/assets/${assetId}`,
  resellerListings: `${API_PREFIX}/reseller/listings`,
  resellerListing: (listingId: string) => `${API_PREFIX}/reseller/listings/${listingId}`,
  wallet: `${API_PREFIX}/wallet`,
  walletRedeem: `${API_PREFIX}/wallet/redeem`,
  walletLedger: `${API_PREFIX}/wallet/ledger`,
  walletStatement: `${API_PREFIX}/wallet/statement`,
  adminTokens: `${API_PREFIX}/admin/tokens`,
  adminTokenRevoke: (tokenId: string) => `${API_PREFIX}/admin/tokens/${tokenId}/revoke`,
  adminWallets: `${API_PREFIX}/admin/wallets`,
  adminWallet: (walletId: string) => `${API_PREFIX}/admin/wallets/${walletId}`,
  adminWalletCredit: (walletId: string) => `${API_PREFIX}/admin/wallets/${walletId}/credit`,
  adminWalletDebit: (walletId: string) => `${API_PREFIX}/admin/wallets/${walletId}/debit`,
  adminBots: `${API_PREFIX}/admin/bots`,
  adminPayments: `${API_PREFIX}/admin/payments`,
  adminPaymentOverride: (orderId: string) => `${API_PREFIX}/admin/payments/${orderId}/override`,
  paymentsBinanceCreate: `${API_PREFIX}/payments/binance/create`,
  paymentsBinanceVerify: `${API_PREFIX}/payments/binance/verify`,
  paymentsBep20Verify: `${API_PREFIX}/payments/bep20/verify`,
  botsConnect: `${API_PREFIX}/bots/connect`,
  botsDisconnect: `${API_PREFIX}/bots/disconnect`,
  botsStatus: `${API_PREFIX}/bots/status`,
  botsHealth: `${API_PREFIX}/bots/health`,
  fulfillmentProcess: `${API_PREFIX}/fulfillment/process`,
  fulfillmentManualComplete: (orderId: string) => `${API_PREFIX}/fulfillment/${orderId}/manual-complete`,
  fulfillmentRetryDelivery: (orderId: string) => `${API_PREFIX}/fulfillment/${orderId}/retry-delivery`,
  orderCancel: (orderId: string) => `${API_PREFIX}/orders/${orderId}/cancel`,
  orderNote: (orderId: string) => `${API_PREFIX}/orders/${orderId}/note`,
  ownerOrders: `${API_PREFIX}/owner/orders`,
  resellerOrders: `${API_PREFIX}/reseller/orders`,
  resellerOrder: (orderId: string) => `${API_PREFIX}/reseller/orders/${orderId}`,
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
