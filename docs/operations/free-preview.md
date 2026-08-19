# Free preview — how it is on, and how it goes off

**Started:** 2026-08-19 · **Owner:** founder

The public pages say the product is free right now. That is not a promotion
invented for the website; it is what the deployment already does. Checkout is
held shut by `BILLING_CHECKOUT_ENABLED=false`, so Lemon Squeezy can take no card,
and `src/utils/entitlement.ts` deliberately refuses to expire anybody while the
store is closed (`src/lib/checkoutAvailability.ts` is how it finds out). Before
this change the marketing pages described a seven-day trial with a card up
front — a checkout the visitor could not reach and a charge that could not
happen. The copy now matches the machine.

## The switch

`FREE_PREVIEW` in `src/config/launchPhase.ts`. One boolean.

Everything that changes is written twice — the preview copy and the paid copy
sit next to each other in the same file — so turning it off restores the launch
pages exactly as they were written, not as somebody remembers them a month
later.

| File | What the flag moves |
| --- | --- |
| `src/config/launchPhase.ts` | The flag itself, the badge, and the shared "when it ends" sentence |
| `src/pages/LandingPage.tsx` | Hero badge and reassurance line, pricing section, plan cards, the two money FAQs (which also ship as FAQPage JSON-LD), final CTA, meta description |
| `src/features/pricing/PricingPage.tsx` | Page title and description, the header, the first plan card (preview instead of trial), CTA copy |
| `src/config/structuredData.ts` | The `Offer` **terms** — the price stays $10, only the sentence about how a card is taken changes |

The structured price stays at `PERSONAL_MONTHLY_PRICE_USD` on purpose.
`scripts/verify-seo-contract.mjs` holds the machine-readable price to the visible
one, and $10 is the real published price — the preview is a phase, not a
discount. Both pages state it in plain sight for the same reason.

## Outside the flag

Two files are not React and have to be edited by hand:

1. `public/llms.txt` — delete the **Current status: free preview** paragraph and
   restore the original opening line ("It costs **$10 per month for one person**
   after a **7-day free trial**."). Also trim the preview clauses in the "No free
   tier" bullet and in the Pricing link line. The contract in
   `scripts/verify-seo-contract.mjs` requires the strings `$10 per month`,
   `7-day free trial` and `There is no free tier` to survive whatever wording is
   used.
2. This file — mark the preview closed, with the date.

## Order of operations on launch day

The flag changes what is **said**. It does not charge anybody. Doing these in
the wrong order is how a preview account finds out from a card statement.

1. Tell every preview account, in advance, with the date and the price.
2. Ship the copy change: `FREE_PREVIEW = false`, plus the two files above.
3. Only then set `BILLING_CHECKOUT_ENABLED=true` on Vercel, after the checks in
   `docs/deployment/billing-checkout-exposure-guard-2026-06-17.md`.

Step 3 is what starts entitlement gating: with checkout open, an account with no
subscription becomes `needs_trial` and loses capture and Search & Insights until
it starts one. Accounts created before `LEGACY_ACCESS_BEFORE` keep full access
regardless — that constant is the one that decides whether preview users are
grandfathered, and it is a commercial decision, not a code cleanup.

## Verifying either state

```bash
npm run check
```

The contracts that care: `verify:seo` (the visible `$10` and the structured
price must agree, and every public page must still prerender), `verify:commercial`
and `verify:billing-paid-readiness` (both pages must still name the real price,
Lemon Squeezy, and keep checkout out of the marketing bundle), and
`verify:business-activity-os` (the landing meta description must keep the
money-spine sentence).
