# Henry Founder Workspace Manual Test Guide

Use this guide for a clean local QA run of the Henry Founder Workspace.

## Clean State Guidance

The Henry Founder Workspace seed is intentionally loaded by the user. It does not auto-run and it does not overwrite unrelated local demo data.

For a clean Henry Founder Workspace QA test:

1. Use a clean browser profile or incognito session, OR
2. Manually clear Memoire local demo storage before loading Henry Workspace.
3. Reload the app.
4. Open the login page.
5. Click `Load Henry Workspace`.

Do not use a browser profile that already contains old Memoire demo records if you want a pure founder workspace test. Existing local demo data may remain visible because the seed merges by stable record id and preserves unrelated demo data by design.

## Required Local Flag

Set this flag for founder workspace QA:

```env
VITE_ENABLE_FOUNDER_WORKSPACE=true
```

This flag allows the `Load Henry Workspace` button to appear even when Supabase environment variables are present. The workspace still does not auto-load; Henry must click the button intentionally.

## What To Verify

- TopNav shows `Demo Mode`.
- TopNav shows `Henry Founder Workspace`.
- Today shows founder-seeded revenue actions and attention items.
- Journey shows active founder journeys and broken loops.
- Account Memory shows real notes and real contacts only.
- Opportunity Memory does not show win probability, deal score, or forecast UI.
- Ask Memoire All Memory attention questions return ranked attention items from Broken Loops / Memory Health.
