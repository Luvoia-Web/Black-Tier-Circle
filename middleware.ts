/**
 * @file middleware.ts
 *
 * Auth middleware stub for Phase 0.
 *
 * Later phases will require a session for dashboard routes and
 * derive tenant identity from that session. Phase 0 only passes
 * traffic through so scaffolding can boot.
 *
 * @module Middleware
 */

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Passes every request through without enforcing auth yet.
 *
 * @param request - Incoming Next.js request
 * @returns Unmodified next response
 *
 * STUB(phase-1): Session and role gates are added with identity.
 */
export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
