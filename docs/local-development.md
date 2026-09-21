# Local Development

## Running the app
```bash
npm run dev
```

## Connecting a Telegram bot (local testing)

Telegram requires a public HTTPS URL for webhooks.
For local development, use the tunnel script:

```bash
# Terminal 1 — start the tunnel (updates .env.local automatically)
npm run tunnel

# Terminal 2 — start the dev server
npm run dev
```

Then go to http://localhost:3000/reseller/bot and connect your bot.

When you stop the tunnel (Ctrl+C), your .env.local is restored to localhost automatically.

If `npm run tunnel` cannot get a public URL, add a free ngrok authtoken:

```bash
ngrok config add-authtoken <token>
```

Get a token at https://dashboard.ngrok.com/get-started/your-authtoken

## Production

On Vercel, NEXT_PUBLIC_APP_URL is set to your production domain.
Bots connect permanently — no tunnel needed.
