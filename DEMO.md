# Black Tier Circle — Live Demo

## Try the Platform

**Dashboard:** https://blacktiercircle.vercel.app

**Telegram Bot:** https://t.me/blacktiercirclebot
- Open Telegram, search @blacktiercirclebot
- Send /start to begin
- Browse /shop, test /wallet, check /orders

**RIA (AI Assistant with MemoryOS):**
- Log in to the dashboard
- Click "Intelligence" in the sidebar
- Ask: "What are my best selling products?"
- Ask: "Give me cart recovery tactics for my store"
- Watch the → Memory badge appear when context is retrieved from memory banks

## What to Test

| Feature | How to Test |
|---------|------------|
| Multi-tenant bot | Connect a BotFather token in the reseller dashboard |
| MemoryOS memory | Ask RIA any store question — notice Memory badge |
| Payment flow | Start a purchase in the Telegram bot |
| Order tracking | Send /orders in the bot after a purchase |
| Wallet system | Send /wallet to see balance and top-up options |

## Architecture Proof

- 26+ database tables, 21 migrations applied
- 171 passing tests
- AES-256-GCM bot token encryption
- Row Level Security on all tables
- Live cron jobs: fulfillment every 2min, reconcile every 15min

**GitHub:** https://github.com/Luvoia-Web/Black-Tier-Circle
