# Secret Rotation Guide

## When to rotate secrets
- Immediately: if any secret is exposed in logs, git, or error messages
- Periodically: TELEGRAM_WEBHOOK_SECRET (monthly)
- On team change: ADMIN_SECRET, CRON_SECRET

## How to rotate each secret
### BOT_TOKEN_ENCRYPTION_KEY
1. Generate new key: openssl rand -hex 32
2. Re-encrypt all bot tokens in DB with new key
3. Update env var
4. Restart

### TELEGRAM_WEBHOOK_SECRET
1. Generate new secret
2. Call Telegram setWebhook with new secret for each bot
3. Update DB + env var
4. Restart

### ADMIN_SECRET / CRON_SECRET
1. Generate new values
2. Update env var
3. Restart
