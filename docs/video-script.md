# Black Tier MemoryOS — Demo Video Script

Ten scenes. Total runtime 3:00.

## Scene 1

- **Title:** Cold open
- **Duration:** 0:00–0:15 (15s)
- **On screen:** A checkout thread that resets. The same buyer asks about price again. No prior order, no prior objection, no saved preference.
- **Voiceover:** Every commerce platform forgets. The next message starts from zero, even when the last one ended in a sale.
- **Action / b-roll:** Cut between a blank chat and a completed order receipt. Hold on the empty thread.

## Scene 2

- **Title:** Three layers of forgetting
- **Duration:** 0:15–0:30 (15s)
- **On screen:** Three stacked labels: customer, store, platform. Each label fades as a short example appears under it.
- **Voiceover:** Forgetting happens in three places. The customer relationship. The store's own rules. The platform's operational history.
- **Action / b-roll:** Reveal one line under each label: a repeated price objection, a discount policy nobody can find, an outage the team already fixed.

## Scene 3

- **Title:** Architecture overview
- **Duration:** 0:30–0:50 (20s)
- **On screen:** The three-layer ASCII diagram. Highlight each bank id as it is named.
- **Voiceover:** Black Tier MemoryOS keeps those layers in separate banks. Customer memory lives at tenant and customer. Store memory lives at the tenant. Platform memory lives in its own bank. Supabase still holds the order. Hindsight holds what the order taught us.
- **Action / b-roll:** Slow scroll of the diagram. Pause on the three bank id lines.

## Scene 4

- **Title:** Customer Intelligence Panel
- **Duration:** 0:50–1:10 (20s)
- **On screen:** Reseller Intelligence tab. The panel starts on Without Memory, showing a generic greeting and "No memory available". Toggle to With Memory.
- **Voiceover:** This is the same customer, with memory on. Preferences, the objection we already heard, and a recommendation written from that history.
- **Action / b-roll:** Click With Memory. Hold on the preference card, the objection card, and the recommendation.

## Scene 5

- **Title:** Memory badge in the chatbot
- **Duration:** 1:10–1:25 (15s)
- **On screen:** Two assistant replies. The first has no badge. The second shows ✦ Memory.
- **Voiceover:** The assistant can answer without memory. When it used the customer bank, the reply is marked. That badge is the difference between a generic answer and one that already knows the history.
- **Action / b-roll:** Show the plain reply, then the reply with the ✦ Memory badge. Click the badge so the memory lines appear.

## Scene 6

- **Title:** WHY? and the Memory Inspector
- **Duration:** 1:25–1:45 (20s)
- **On screen:** The recommendation, then the Memory Inspector modal.
- **Voiceover:** WHY? opens the evidence. Each memory shows its text, its type, and when it happened. The footer says Powered by Hindsight. The recommendation is not a black box.
- **Action / b-roll:** Click WHY? See Evidence. Scroll the evidence list. Pause on a type badge and the footer.

## Scene 7

- **Title:** Store Intelligence Panel
- **Duration:** 1:45–2:00 (15s)
- **On screen:** Store intelligence section. Seller instruction cards and the learned summary.
- **Voiceover:** The store has memory too. Seller instructions and patterns that showed up across customers stay in the tenant bank, not in one person's notes.
- **Action / b-roll:** Scroll the seller instruction card for the returning-customer discount. Show the evidence list under it.

## Scene 8

- **Title:** Commerce Recovery Intelligence
- **Duration:** 2:00–2:15 (15s)
- **On screen:** Recovery form. Incident type set to Supplier Outage. A short description. Results below.
- **Voiceover:** Type the incident. Recovery recalls what worked last time and suggests the next action from that evidence, instead of starting the postmortem from scratch.
- **Action / b-roll:** Type a supplier outage description. Click Find Recovery. Hold on past incidents and the suggested recovery.

## Scene 9

- **Title:** Bank isolation proof
- **Duration:** 2:15–2:40 (25s)
- **On screen:** Terminal. Command `npm run memory:smoke`. Three PASS lines.
- **Voiceover:** Multi-tenant memory with zero leakage. The same customer id in another store returns nothing. The platform bank returns nothing. Isolation is the bank, not a filter we hope the query remembers.
- **Action / b-roll:** Run the command. Hold on the three PASS lines until they are readable.

## Scene 10

- **Title:** Closing
- **Duration:** 2:40–3:00 (20s)
- **On screen:** The live app, then the URL https://blacktiercircle.vercel.app
- **Voiceover:** Commerce should learn. Now it does.
- **Action / b-roll:** Fade from the Intelligence tab to the URL. End on the address.
