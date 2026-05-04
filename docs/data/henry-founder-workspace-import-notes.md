# Henry Founder Workspace Import Notes

## 1. Files Created / Changed

Created:

- `src/features/v31/data/henryFounderWorkspaceSeed.ts`
- `src/features/v31/utils/normalizeFounderWorkspaceData.ts`
- `docs/data/henry-founder-workspace-import-notes.md`

Changed:

- `src/features/v31/localStore.ts`
- `src/features/auth/LoginPage.tsx`
- `src/components/layout/TopNav.tsx`

No generic importer was created. No Google Sheets live sync was added. No app data model migration was added for this step.

## 2. Data Model Used

The seed reuses existing Memoire V1 local/demo object shapes:

- `Account`
- `Contact`
- `Opportunity`
- `Interaction`
- `SalesAction`
- `Objection`

Additional source and review metadata is attached as extra JSON fields on seeded objects:

- `sourceMetadata`
  - `sourceFile`
  - `sourceTab`
  - `sourceRow`
  - `rawSource`
- `needsReview`
- `reviewReason`

For interactions, source metadata is also preserved inside `structured_data` so raw provenance survives even if the UI ignores extra top-level fields.

Founder-only reference data is stored under local memory metadata:

- `founderWorkspace.brandReferences`
- `founderWorkspace.pricingContexts`
- `founderWorkspace.reviewFlags`

Pricing remains supporting context only. No pricing page, dashboard, or module was created.

## 3. Number of Accounts Seeded

18 accounts:

- STADA Pymepharco
- Samil Pharmaceutical
- F.T. Pharma
- Terumo BCT Vietnam
- Bidiphar
- TV Pharm
- VNVC
- Cuu Long Pharma
- Allomed
- Tenamyd
- Boston Pharma
- DHG Pharma
- Fresenius Kabi Vietnam
- Phuc Thinh
- Control Union
- Bitechphar
- Vinamilk Can Tho
- Imexpharm

## 4. Number of Contacts Seeded

7 contacts:

- Ms. Trinh
- Ms. Nhu
- Mr. Jaewon Kim
- Mr. Kwon Dae Hoon
- Mr. Lee Huynchul
- Ms. Dao My
- Mr. Hien

Only non-placeholder contacts from KA account tabs were imported.

## 5. Number of Opportunities Seeded

16 opportunities from `Pipeline_Forecast_FY26 / 2. Pipeline`.

Examples:

- Samil Pharmaceutical / EM / PMM RTU
- TV Pharm / VHP / SolidFog EU-GMP Phase 2
- Control Union / UV-VIS / Scitek instrument
- STADA Pymepharco / EM / PMM RTU
- Terumo BCT Vietnam / Canister / Tailin consumables
- Fresenius Kabi Vietnam / Canister / Tailin consumables
- DHG Pharma / Auto Colony Counter / Tailin
- Phuc Thinh / RTU / CulturaLab media

Pipeline probability is preserved only as raw context:

- `sourceProbability`
- `rawProbability`
- `confidenceHint`

It is not exposed as win probability, deal score, or forecast score.

## 6. Number of Interactions / Notes Seeded

24 note interactions:

- 18 account background notes from `Master_Database_FY26 / tblAccounts`
- 6 KA strategy / special project enrichment notes

All imported notes use `interaction_type = note`.

Background, strategic rationale, current setup, and special project context were not converted into calls or meetings.

## 7. Number of Actions Seeded

20 actions:

- 5 explicit account Next Steps from `Master_Database_FY26 / tblAccounts`
- 15 tentative timing review actions from `Pipeline_Forecast_FY26 / Open`

Pipeline `Open` values such as `04Apr/W2` are not treated as hard due dates. They are preserved as:

- `timingLabel`
- `tentativeTiming`
- `rawOpenTiming`

Only explicit dates inside next-step text, such as `(26/02)`, are mapped to `due_date`.

## 8. Number of Objections / Blockers Seeded

8 blockers/objections from explicit text only.

Safe explicit blocker patterns used:

- Sartorius incumbent context
- Merck incumbent supplier context
- Lonza incumbent supplier context
- Tender/procurement status pending
- Awaiting PO

No pain, urgency, severity, decision maker, or decision timeline was invented.

## 9. Pricing Contexts Attached

2 pricing contexts are stored as founder workspace metadata:

- Allomed & Tenamyd / AMD280 / GEEVO / Quoted / Awaiting PO
- TV Pharm / DosyMist VHP / SolidFog / Tender / Tender pending

The combined `Allomed & Tenamyd` context is preserved as raw pricing context and flagged for Henry review. It is not forced into a single account or duplicated into two opportunities.

## 10. Brand References Attached or Skipped

8 brand references are stored as founder workspace metadata:

- Tailin
- PMM
- CulturaLab
- CertaBlue
- Solidfog
- Protak
- Scitek
- Entegris

Brand references are not exposed as a core V1 module. They are available as seed metadata for future enrichment.

## 11. Account Normalization Applied

Applied:

- TV Pharm / TV Pharma / TV Pharmaceutical -> TV Pharm
- Pymepharco / STADA Pymepharco / Pymepharco JSC -> STADA Pymepharco
- FT Pharma / F.T. Pharma / F.T.Pharma / FTP -> F.T. Pharma
- Samil / Samil Pharmaceutical -> Samil Pharmaceutical
- Terumo BCT / Terumo BCT Vietnam -> Terumo BCT Vietnam
- FKV / Fresenius Kabi Vietnam -> Fresenius Kabi Vietnam
- Phuc Thinh / Phuc Thinh Food -> Phuc Thinh
- Cuu Long / Cuu Long Pharma -> Cuu Long Pharma
- DHG Pharma and plant-specific accounts -> DHG Pharma, with plant context preserved in notes

## 12. Records Flagged for Henry Review

27 review flags are generated.

Primary review categories:

- FKV -> Fresenius Kabi Vietnam
- Phuc Thinh Food -> Phuc Thinh
- Cuu Long / Cuu Long Pharma canonical naming
- DHG Pharma parent vs plant-specific grouping
- Pipeline `Open` values kept as tentative timing, not hard due dates
- Combined `Allomed & Tenamyd` pricing context

## 13. Missing Data Summary

Still missing or incomplete:

- Decision makers
- Decision timelines
- Many contact roles
- Many last-contact dates
- True meeting/call history
- Clean due dates for most pipeline timing
- Explicit action-plan rows in KA account tabs
- Clean opportunity stage labels for many pipeline rows
- Multi-account opportunity linking for combined pricing/deal contexts

## 14. How to Load Founder Workspace

The Founder Workspace does not auto-run.

To load intentionally:

1. Enable local demo mode with Supabase not configured:
   - `VITE_ENABLE_DEMO_MODE=true`
2. Open the Login page.
3. Click `Load Henry Workspace`.
4. The app signs into local demo mode as:
   - `henry@memoire.local`
5. The TopNav shows:
   - `Demo Mode`
   - `Henry Founder Workspace`

The loader merges by deterministic IDs and does not clear or overwrite unrelated local demo data.

## 15. Build / Lint Result

Implemented helper-level lint:

- `npx eslint src/features/v31/data/henryFounderWorkspaceSeed.ts src/features/v31/utils/normalizeFounderWorkspaceData.ts src/features/v31/localStore.ts src/features/auth/LoginPage.tsx src/components/layout/TopNav.tsx`

Result: Passed.

Build:

- `npm run build`

Result: Passed.

Vite bundle-size warning remains; it is not caused by this seed alone and does not block build.

## 16. Known Limitations

- This is a curated founder workspace seed, not a generic importer.
- It currently loads into local demo memory, not Supabase production tables.
- Pricing contexts are stored as metadata and attached to opportunities where safe, but no UI surfaces pricing as a module.
- Brand references are metadata only.
- Some source metadata is preserved as extra JSON fields that the current UI does not display.
- Multi-account linking is not supported by current V1 schema, so `Allomed & Tenamyd` is flagged instead of forced.
- Pipeline open timing is not parsed as due date unless explicitly safe.

## 17. What Needs Product Review

- Whether founder workspace should later be loaded into Henry's real Supabase user instead of local demo memory.
- Whether review flags should have a visible UI in Settings or remain metadata for now.
- Whether `Open` timing labels such as `04Apr/W2` should become due dates after Henry defines the intended calendar logic.
- Whether combined pricing contexts should create linked multi-account opportunities in a future schema.
- Whether all 18 seeded accounts are the right first founder subset for validation, or whether Henry wants to narrow to top 5 KA + special projects.

