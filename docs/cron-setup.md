# Cron Job Setup — Cron-Job.org

## Why external crons?
Vercel Hobby plan only supports daily crons.
We use cron-job.org (free) to run our jobs on the correct schedule.

## Setup Steps

### 1. Sign up
Go to https://cron-job.org and create a free account.

### 2. Create these 3 cron jobs

#### Job 1: Process Orders (every 2 minutes)
- Title: BTC Process Orders
- URL: https://YOUR_VERCEL_URL/api/fulfillment/process
- Schedule: Every 2 minutes (*/2 * * * *)
- Method: GET
- Header: Authorization: Bearer YOUR_CRON_SECRET

#### Job 2: Reconcile Supplier (every 15 minutes)
- Title: BTC Supplier Reconcile
- URL: https://YOUR_VERCEL_URL/api/supplier/reconcile
- Schedule: Every 15 minutes (*/15 * * * *)
- Method: GET
- Header: Authorization: Bearer YOUR_CRON_SECRET

#### Job 3: Bot Health Check (every 30 minutes)
- Title: BTC Bot Health
- URL: https://YOUR_VERCEL_URL/api/bots/health
- Schedule: Every 30 minutes (*/30 * * * *)
- Method: GET
- Header: Authorization: Bearer YOUR_CRON_SECRET

### 3. Get your CRON_SECRET
Check your .env.local or Vercel environment variables for CRON_SECRET.
If it says PLACEHOLDER, generate a real one:
  openssl rand -hex 32

### 4. Add it to Vercel
Vercel dashboard → your project → Settings → Environment Variables
→ Add CRON_SECRET = your generated value
→ Redeploy

### 5. Test
After setting up, click "Run now" on each job in cron-job.org.
Check the response — should be 200 with JSON result.

## Alternative: Query parameter (if headers not supported)
Instead of Authorization header, append ?secret=YOUR_CRON_SECRET to the URL:
https://YOUR_VERCEL_URL/api/fulfillment/process?secret=YOUR_CRON_SECRET
