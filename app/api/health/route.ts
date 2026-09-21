/**
 * @file app/api/health/route.ts
 *
 * Liveness endpoint for development and Vercel health checks.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    service: 'black-tier-circle',
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
}
