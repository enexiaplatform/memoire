# Henry Master Data Mapping Report

Prepared for Memoire founder/admin workspace review.

Scope: inspect and map 5 Google Sheets master data files only. No import code, seed files, data model changes, or app changes were created.

## 1. Executive Summary

Henry's master data folder contains 5 structured Google Sheets covering sales pipeline, key account plans, brand portfolio, master account/lead database, and pricing/deal economics.

Overall, the data is usable for a founder workspace import, but it should not be imported wholesale into Memoire V1 without curation. The strongest V1 fit is Account Memory, Opportunity Memory, Next Actions, Objections/Blockers, and Ask Memoire grounding. Pricing and brand data should be treated as supporting opportunity context and reference data, not as core V1 product surfaces.

Authoritative source recommendations:

- Accounts: `4. Master_Database_FY26 / tblAccounts`
- Contacts: `2. KA_Strategy_FY26 / individual account tabs`
- Opportunities: `1. Pipeline_Forecast_FY26 / 2. Pipeline`, with strategic enrichment from `2. KA_Strategy_FY26`
- Actions: `4. Master_Database_FY26 / tblAccounts / Next Step` and `2. KA_Strategy_FY26 / account tabs / Action Plan`
- Objections / blockers: explicit background, incumbent, tender, status, and current supplier fields across account plans, pipeline, master database, and pricing log
- Brand / product reference: `3. Portfolio_Brand_Strategy_FY26 / tblBrands`
- Pricing / deal economics: `5. Pricing_Margin_Monitor_FY26 / 3. Deal Log`

Overall readiness for Memoire import: Medium. The source files contain enough real account/opportunity context to power a strong founder workspace, but many fields needed for high-quality Living Memory are incomplete or ambiguous: contacts, decision makers, decision timelines, dated next actions, explicit stages, and linked interactions.

Recommendation: import a curated founder workspace subset first, not all 5 files as full V1 data.

## 2. Source File Inventory

### 1. Pipeline_Forecast_FY26

- Google Sheet title inspected: `1. Pipeline_Forecast_FY26`
- Purpose: sales target, pipeline, forecast, opportunity value, product, brand, type, channel, background, open timing
- Important tabs inspected:
  - `README`
  - `Dashboard`
  - `1. Sales Target`
  - `2. Pipeline`
  - `_Lists`
- Key fields observed in `2. Pipeline`:
  - Opportunity probability
  - Account
  - Q1 / Q2 / Q3 / Q4 / FY26 / FY27
  - Product
  - Brand
  - Type
  - Channel
  - Background
  - Open
- Example accounts / opportunities observed:
  - Samil
  - TV Pharm
  - Control Union
  - Pymepharco
  - FT Pharma
  - Allomed
  - Terumo BCT
  - Boston Pharma
  - FIGLA
  - FKV
  - DHG Pharma
  - Tenamyd
- Memoire objects supported:
  - Account
  - Opportunity
  - Action / Next Action
  - Interaction note
  - Objection / Blocker where Background is explicit
  - Brand / Product Reference

### 2. KA_Strategy_FY26

- Google Sheet title inspected: `2. KA_Strategy_FY26`
- Purpose: key account strategy, account plan, executive summary, top key accounts, special projects, individual account plans
- Important tabs inspected:
  - `README`
  - `Dashboard`
  - `Overview`
  - `Pymepharco`
  - `Samil`
  - `FT Pharma`
  - `Terumo BCT`
  - `Bidiphar`
  - `Special Projects`
  - `Market Mapping`
  - `_Lists`
- Key fields observed in `Overview`:
  - Top 5 Key Accounts
  - Account
  - Segment
  - FY26 Target
  - FY27 Outlook
  - Strategic Rationale
  - Status
  - Special Projects
  - Nature
  - Status
- Top accounts observed:
  - STADA Pymepharco
  - Samil Pharmaceutical
  - F.T. Pharma
  - Terumo BCT Vietnam
  - Bidiphar
- Special projects observed:
  - TV Pharm
  - VNVC
  - Cuu Long Pharma
- Key fields observed in account plan tabs:
  - Account Profile
  - Company Full Name
  - Location / HQ
  - Parent / Ownership
  - Business Type
  - Employee Size
  - Annual Revenue
  - GMP Status
  - Current Micro QC Setup
  - Procurement Cycle
  - Decision Lead Time
  - Key Contacts & Decision Map
  - Name
  - Title / Role
  - Influence
  - Relationship
  - Last Contact
  - Notes
  - Current Spend vs Target Share
  - Product Category
  - Current Supplier
  - Annual Spend
  - Our Share %
  - Target Share %
  - FY26 Target
  - Action Plan - Next 90 Days
  - Action
  - Owner
  - Deadline
  - Outcome
  - Status
- Memoire objects supported:
  - Account
  - Contact
  - Opportunity
  - Interaction
  - Action / Next Action
  - Objection / Pain Point / Blocker
  - Account Narrative source material

### 3. Portfolio_Brand_Strategy_FY26

- Google Sheet title inspected: `3. Portfolio_Brand_Strategy_FY26`
- Purpose: brand portfolio, brand strategy, margin matrix, tactics plan, brand partnership, product development
- Important tabs inspected:
  - `README`
  - `Dashboard`
  - `tblBrands`
  - `Margin Matrix`
  - `Tactics Plan`
  - `Brand Partnership`
  - `Product Development`
  - `_Lists`
- Key fields observed in `tblBrands`:
  - Brand
  - Segment
  - Type
  - Q1 Volume
  - Q2 Volume
  - Q3 Volume
  - Q4 Volume
  - FY26 Volume
  - Margin %
  - Approval Y/N
  - FY26 Margin
  - Volume Tier
  - Margin Tier
  - Rank
- Brands observed:
  - Tailin
  - PMM
  - CulturaLab
  - CertaBlue
  - SolidFog
  - Protak
  - Microbs
  - CMD
  - Scitek
  - Entegris
  - ATCC
  - InnovaPrep
  - Zybio
  - STBio
  - Conda
- Memoire objects supported:
  - Brand / Product Reference
  - Opportunity supporting context
  - Pricing / economics supporting context

### 4. Master_Database_FY26

- Google Sheet title inspected: `4. Master_Database_FY26`
- Purpose: master account list, lead pool, dealers, market data, EU accounts, VAR / reseller
- Important tabs inspected:
  - `README`
  - `Dashboard`
  - `tblAccounts`
  - `tblLeads`
  - `tblDealers`
  - `DCM Market`
  - `EU Account`
  - `VAR-Reseller`
  - `_Lists`
- Key fields observed in `tblAccounts`:
  - KAC FY26
  - Account Name
  - Application
  - Product
  - Segment
  - Territory
  - Province
  - GMP Status
  - Vol EM
  - Vol Sterility
  - Vol Endotoxin
  - Vol DCM
  - Vol Total
  - Status
  - Last Updated
  - Background
  - Next Step
- Key fields observed in `tblLeads`:
  - Why / Trigger
  - Qualified
  - Application
  - Account / Lead
  - Product
  - Type
  - Background
  - Volume
  - Converted Est.
- Memoire objects supported:
  - Account
  - Opportunity
  - Interaction
  - Action / Next Action
  - Objection / Pain Point / Blocker

### 5. Pricing_Margin_Monitor_FY26

- Google Sheet title inspected: `5. Pricing_Margin_Monitor_FY26`
- Purpose: pricing logic, deal calculator, deal log, talking points, MBR pricing section
- Important tabs inspected:
  - `1. How Pricing Works`
  - `2. Deal Calculator`
  - `3. Deal Log`
  - `4. Talking Points`
  - `5. MBR Pricing Section`
- Key fields observed in `3. Deal Log`:
  - Deal Date
  - Customer
  - Product
  - Brand
  - Qty
  - SPD USD
  - MSC USD
  - F&H USD
  - Other USD
  - VN Cost
  - Selling Price
  - VN Margin USD
  - VN Margin %
  - Stage
  - Status
- Deal examples observed:
  - Allomed & Tenamyd - AMD280 - GEEVO - Quoted - Awaiting PO
  - TV Pharma - DosyMist VHP - SolidFog - Tender - Tender pending
- Memoire objects supported:
  - Opportunity
  - Action / Next Action from status
  - Objection / Blocker from status
  - Pricing / Deal Economics
  - Brand / Product Reference

## 3. Object Mapping Table

| Source File | Source Tab | Source Field | Memoire Object | Memoire Field | Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Master_Database_FY26 | tblAccounts | Account Name | Account | canonicalName | High | Best canonical account source. |
| Master_Database_FY26 | tblAccounts | KAC FY26 | Account | priority / KAC flag | High | Map `Y` to founder priority flag. |
| Master_Database_FY26 | tblAccounts | Application | Account | industry/application | High | Application context is account-level. |
| Master_Database_FY26 | tblAccounts | Product | Account | product focus | Medium | May also support opportunity/product references. |
| Master_Database_FY26 | tblAccounts | Segment | Account | segment | High | Direct mapping. |
| Master_Database_FY26 | tblAccounts | Territory | Account | territory | High | Direct mapping. |
| Master_Database_FY26 | tblAccounts | Province | Account | province/location | High | Direct mapping. |
| Master_Database_FY26 | tblAccounts | GMP Status | Account | GMP status | High | Direct mapping. |
| Master_Database_FY26 | tblAccounts | Status | Account | status | High | Convert to Memoire account status. |
| Master_Database_FY26 | tblAccounts | Last Updated | Interaction | date | Medium | Only if Background/Next Step is converted into note. |
| Master_Database_FY26 | tblAccounts | Background | Interaction | rawNote / summary | High | Preserve raw background text. |
| Master_Database_FY26 | tblAccounts | Background | Objection / Blocker | detail | Medium | Only derive blocker when explicit text says using incumbent, issue, prospecting lead, etc. |
| Master_Database_FY26 | tblAccounts | Next Step | Action | title / dueDate if explicit | High | Best simple action source. |
| Master_Database_FY26 | tblLeads | Account / Lead | Account / Opportunity | accountId / name | Medium | Some are leads, not confirmed accounts. |
| Master_Database_FY26 | tblLeads | Why / Trigger | Opportunity | background / trigger | High | Useful opportunity origin. |
| Master_Database_FY26 | tblLeads | Qualified | Opportunity | status | Medium | `YES` can mark qualified; blanks remain unknown. |
| Master_Database_FY26 | tblLeads | Application | Opportunity | application | High | Direct mapping. |
| Master_Database_FY26 | tblLeads | Product | Opportunity | product | High | Direct mapping. |
| Master_Database_FY26 | tblLeads | Type | Opportunity | type | High | Direct mapping. |
| Master_Database_FY26 | tblLeads | Background | Interaction / Opportunity | rawNote / background | High | Preserve as raw source context. |
| Master_Database_FY26 | tblLeads | Volume | Opportunity | estimated value / volume | Medium | Need confirm units. |
| Master_Database_FY26 | tblLeads | Converted Est. | Opportunity | estimated value | Medium | Needs interpretation. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Opportunity probability | Opportunity | probability | High | Direct numeric field. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Account | Account / Opportunity | accountId / account link | High | Requires normalization. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Q1-Q4 | Opportunity | quarterly values | High | Preserve as opportunity context, not core UI. |
| Pipeline_Forecast_FY26 | 2. Pipeline | FY26 / FY27 | Opportunity | annual values | High | Preserve as opportunity context. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Product | Opportunity | product | High | Direct mapping. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Brand | Opportunity / Brand Reference | brand | High | Link to brand reference where possible. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Type | Opportunity | type | High | Direct mapping. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Channel | Opportunity | channel | High | Direct mapping. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Background | Interaction / Objection | rawNote / blocker | Medium | Only derive blocker when explicit. |
| Pipeline_Forecast_FY26 | 2. Pipeline | Open | Action / Opportunity | due timing / open timing | Medium | Values like `04Apr/W2` need date normalization review. |
| KA_Strategy_FY26 | Overview | Account | Account | alias / canonicalName | High | Use to enrich top accounts, not master canonical source. |
| KA_Strategy_FY26 | Overview | Segment | Account | segment | High | Direct mapping. |
| KA_Strategy_FY26 | Overview | FY26 Target | Opportunity / Account | FY26 target | High | Strategic target context. |
| KA_Strategy_FY26 | Overview | FY27 Outlook | Opportunity / Account | FY27 outlook | High | Strategic context; not V1 forecast UI. |
| KA_Strategy_FY26 | Overview | Strategic Rationale | Account / Opportunity | summary / background | High | Strong Account Narrative input. |
| KA_Strategy_FY26 | Overview | Status | Account / Opportunity | status / stage | Medium | Values need mapping to Memoire stages. |
| KA_Strategy_FY26 | Special Projects | Customer Context | Account / Interaction | summary / rawNote | High | Preserve raw context. |
| KA_Strategy_FY26 | Special Projects | Opportunity Value | Opportunity | estimated value | High | Direct context. |
| KA_Strategy_FY26 | Special Projects | Stage / Probability | Opportunity | stage / probability | High | Example: `60% - Tender submitted`. |
| KA_Strategy_FY26 | Special Projects | Channel | Opportunity | channel | High | Direct mapping. |
| KA_Strategy_FY26 | Special Projects | Critical Path | Action / Opportunity | next action / timing | Medium | May contain timing and conditional path. |
| KA_Strategy_FY26 | Special Projects | Key Risk | Objection / Blocker | detail | High | Direct blocker if explicit. |
| KA_Strategy_FY26 | Account tabs | Company Full Name | Account | canonicalName / legalName | High | Best enrichment for top account profile. |
| KA_Strategy_FY26 | Account tabs | Location / HQ | Account | province/location | High | Direct mapping. |
| KA_Strategy_FY26 | Account tabs | Parent / Ownership | Account | background | High | Account Narrative context. |
| KA_Strategy_FY26 | Account tabs | Business Type | Account | industry/application | High | Direct context. |
| KA_Strategy_FY26 | Account tabs | Employee Size | Account | background | Medium | Profile enrichment. |
| KA_Strategy_FY26 | Account tabs | Annual Revenue | Account | background | Medium | Many values are missing/fill-in. |
| KA_Strategy_FY26 | Account tabs | GMP Status | Account | GMP status | High | Direct mapping. |
| KA_Strategy_FY26 | Account tabs | Current Micro QC Setup | Objection / Blocker | incumbent / current setup | High when filled | Example: Sartorius, Merck, Lonza. |
| KA_Strategy_FY26 | Account tabs | Procurement Cycle | Account / Opportunity | procurement context | Medium | Many blanks. |
| KA_Strategy_FY26 | Account tabs | Decision Lead Time | Account / Opportunity | decision timeline | Medium | Many blanks. |
| KA_Strategy_FY26 | Account tabs | Name | Contact | name | High when not `[fill in]` | Do not import placeholder rows. |
| KA_Strategy_FY26 | Account tabs | Title / Role | Contact | role | High when filled | Often blank. |
| KA_Strategy_FY26 | Account tabs | Influence | Contact | influence | High when filled | Map H/M/L. |
| KA_Strategy_FY26 | Account tabs | Relationship | Contact | relationship | High when filled | Direct mapping. |
| KA_Strategy_FY26 | Account tabs | Last Contact | Interaction | date | Medium | Contact row only, not full interaction. |
| KA_Strategy_FY26 | Account tabs | Notes | Contact / Interaction | notes / summary | Medium | Preserve as note if present. |
| KA_Strategy_FY26 | Account tabs | Product Category | Opportunity | product category | Medium | May be spend category rather than opportunity. |
| KA_Strategy_FY26 | Account tabs | Current Supplier | Objection / Blocker | incumbent / competitor | High when filled | Example: Merck, Sartorius, Lonza. |
| KA_Strategy_FY26 | Account tabs | Annual Spend | Opportunity | annual spend | Medium | Need currency/unit consistency. |
| KA_Strategy_FY26 | Account tabs | FY26 Target | Opportunity | target value | High | Direct strategic target. |
| KA_Strategy_FY26 | Account tabs | Action | Action | title | High when filled | Most inspected top account tabs have blank action rows. |
| KA_Strategy_FY26 | Account tabs | Owner | Action | owner | High when filled | Usually blank in inspected tabs. |
| KA_Strategy_FY26 | Account tabs | Deadline | Action | dueDate | High when filled | Usually blank in inspected tabs. |
| KA_Strategy_FY26 | Account tabs | Outcome | Action | outcome | High when filled | Usually blank in inspected tabs. |
| KA_Strategy_FY26 | Account tabs | Status | Action | status | High when filled | Usually blank in inspected tabs. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Brand | Brand / Product Reference | brand | High | Authoritative brand list. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Segment | Brand / Product Reference | segment | High | Direct mapping. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Type | Brand / Product Reference | type | High | Direct mapping. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Q1-Q4 Volume | Brand / Product Reference | quarterly volume | Medium | Reference only. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | FY26 Volume | Brand / Product Reference | FY26 volume | Medium | Reference only. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Margin % | Brand / Product Reference | margin | Medium | Reference only; avoid V1 dashboarding. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Approval Y/N | Brand / Product Reference | approval status | High | Direct mapping. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Volume Tier | Brand / Product Reference | volume tier | Medium | Reference only. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Margin Tier | Brand / Product Reference | margin tier | Medium | Reference only. |
| Portfolio_Brand_Strategy_FY26 | tblBrands | Rank | Brand / Product Reference | rank | Medium | Reference only. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Deal Date | Opportunity / Pricing | date | High | Deal log timestamp. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Customer | Account | account link | Medium | Requires normalization; combined customer row exists. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Product | Opportunity / Pricing | product | High | Direct mapping. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Brand | Opportunity / Brand Reference | brand | High | Direct mapping. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Qty | Pricing | quantity | High | Direct mapping. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | SPD / MSC / F&H / Other USD | Pricing | cost fields | High | Supporting context only. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | VN Cost | Pricing | VN cost | High | Supporting context only. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Selling Price | Pricing | selling price | Medium | Blank in inspected rows. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | VN Margin USD / % | Pricing | margin | Medium | Blank in inspected rows. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Stage | Opportunity | stage | High | Example: Quoted, Tender. Needs Memoire stage mapping. |
| Pricing_Margin_Monitor_FY26 | 3. Deal Log | Status | Action / Blocker | status / suggested next action | Medium | Example: Awaiting PO, Tender pending. |
| Pricing_Margin_Monitor_FY26 | 4. Talking Points | Talking point text | Learning / Reference | sales learning note | Low for V1 | Useful later; do not import as core V1 unless scoped. |

## 4. Recommended Source of Truth

| Memoire Object | Recommended Source of Truth | Secondary Enrichment | Notes |
| --- | --- | --- | --- |
| Accounts | `Master_Database_FY26 / tblAccounts` | `KA_Strategy_FY26 / Overview` and account tabs | `tblAccounts` has canonical account names, segment, territory, status, background, next step. |
| Contacts | `KA_Strategy_FY26 / individual account tabs` | `tblAccounts / Background` only if explicit person names appear | Contact data is sparse and mostly available for top account plans. |
| Opportunities | `Pipeline_Forecast_FY26 / 2. Pipeline` | `KA_Strategy_FY26 / Overview`, `Special Projects`, account tabs, `Master_Database_FY26 / tblLeads`, `Pricing / Deal Log` | Pipeline is best structured source for opportunity value/product/brand/channel/timing. |
| Actions | `Master_Database_FY26 / tblAccounts / Next Step` | `KA_Strategy_FY26 / Action Plan`, `Pipeline / Open`, `Pricing / Status` | Need date parsing rules for `Open` and natural language dates. |
| Objections / Blockers | Explicit background/status/current supplier/risk fields across files | `KA account tabs / Current Micro QC Setup`, `Current Supplier`, `Special Projects / Key Risk`, `Pricing / Status` | Only import explicit blockers; do not invent objections. |
| Brand / Product Reference | `Portfolio_Brand_Strategy_FY26 / tblBrands` | Pipeline and pricing product/brand fields | Reference-only for V1. |
| Pricing / Deal Economics | `Pricing_Margin_Monitor_FY26 / 3. Deal Log` | Portfolio Margin Matrix if needed later | Supporting opportunity context only; not a primary V1 surface. |

## 5. Account Normalization Map

| Raw Name | Canonical Account | Confidence | Notes | Needs Henry Review? |
| --- | --- | --- | --- | --- |
| TV Pharm | TV Pharm | Medium | Pipeline and KA Special Projects use TV Pharm. Pricing uses TV Pharma. Likely same account. | Yes |
| TV Pharma | TV Pharm | Medium | From Pricing Deal Log. Confirm exact legal/common name. | Yes |
| TV Pharmaceutical | TV Pharm | Low | Mentioned as possible variant, not observed in inspected ranges. | Yes |
| Pymepharco | STADA Pymepharco | High | Master uses Pymepharco; KA uses STADA Pymepharco; account plan legal name is STADA Pymepharco JSC. | No |
| STADA Pymepharco | STADA Pymepharco | High | KA Overview canonical strategic name. | No |
| Pymepharco JSC | STADA Pymepharco | High | Account plan says formerly Pymepharco JSC. | No |
| FT Pharma | F.T. Pharma | High | Master/Pipeline use FT Pharma; KA uses F.T. Pharma / F.T.Pharma. | No |
| F.T. Pharma | F.T. Pharma | High | KA Overview strategic name. | No |
| F.T.Pharma / FTP | F.T. Pharma | High | Account plan legal alias. | No |
| Samil | Samil Pharmaceutical | High | Pipeline shorthand maps to KA account plan. | No |
| Samil Pharmaceutical | Samil Pharmaceutical | High | KA Overview and Master Leads use this form. | No |
| Terumo BCT | Terumo BCT Vietnam | High | Master and Pipeline shorthand map to KA account plan. | No |
| Terumo BCT Vietnam | Terumo BCT Vietnam | High | KA Overview/account plan canonical form. | No |
| Allomed | Allomed | High | Appears in Master and Pipeline. | No |
| Tenamyd | Tenamyd | High | Appears separately in Pipeline. | No |
| Allomed & Tenamyd | Split: Allomed + Tenamyd, or combined deal | Low | Pricing Deal Log combines both customers for one AMD280 deal. Needs decision on whether to create one opportunity linked to two accounts or duplicate/split. | Yes |
| Cuu Long Pharma | Cuu Long Pharma | Medium | KA Special Projects only in inspected ranges. | Yes |
| Cuu Long | Cuu Long Pharma | Low | Possible alias; not observed in inspected ranges. | Yes |
| FKV | Fresenius Kabi Vietnam | Medium | Pipeline uses FKV; Master has Fresenius Kabi Vietnam. Likely same but should confirm. | Yes |
| DHG Pharma | DHG Pharma | Medium | Pipeline has DHG Pharma; Master splits plant 1/2/3. Need canonical grouping rule. | Yes |
| Boston Pharma | Boston Pharma | High | Appears in Master and Pipeline. | No |
| VNVC | VNVC | High | Appears in Pipeline, KA Special Projects, and Master Lead references. | No |
| Bidiphar | Bidiphar | High | Appears in Master, KA Overview/account plan, and Leads. | No |
| Phuc Thinh Food | Phuc Thinh | Medium | Pipeline uses Phuc Thinh Food; Master uses Phuc Thinh. Likely same but verify. | Yes |
| SGS Ho Chi Minh | SGS Ho Chi Minh | Medium | Pipeline only in inspected range. Need check master presence later. | Yes |

## 6. Missing Data Assessment

### Contacts missing

Contacts are sparse outside KA account-plan tabs. `Pymepharco`, `Samil`, and `Terumo BCT` have some contact names, but many rows lack role, influence, relationship, last contact, or notes. `FT Pharma` and `Bidiphar` inspected tabs mostly contain `[fill in]` contact placeholders.

### No decision maker

Decision maker data is not consistently present. Influence fields exist in KA account tabs, but decision authority is not consistently filled. Do not infer decision maker from role unless Henry confirms.

### No decision timeline

Decision lead time is mostly `[fill in]`. Some timing exists as:

- Pipeline `Open` values such as `04Apr/W2`
- Special Projects `Critical Path`
- Pricing status such as `Tender pending`

These are not equivalent to a clear decision timeline without normalization.

### Unclear next action

Master `tblAccounts / Next Step` has useful actions for some accounts, e.g. `Engage Ms. Giao (26/02)`, `Request sample canister for Terumo`, `Follow up DKSH package tender`. Many rows are blank.

KA account-plan `Action Plan - Next 90 Days` rows are mostly empty in inspected tabs.

### No last interaction

Some rows have `Last Updated` or contact `Last Contact`, but most do not contain structured interaction dates. Background fields can be preserved as notes but should not be treated as meetings/calls unless explicitly stated.

### Opportunity stage unclear

Pipeline probability is available, but stage is not always explicit. Pricing has stages like `Quoted` and `Tender`. KA Special Projects has clearer stage/probability fields. Stage mapping will require controlled rules.

### Unresolved objection not explicit

Objections/blockers are often implicit in current supplier, incumbent, tender status, or background notes. Safe derivations include:

- `Sartorius pump` -> incumbent / competitor context
- `Merck RTU` -> incumbent supplier context
- `Tender pending` -> tender/procurement status
- `Awaiting PO` -> procurement/status blocker

Do not infer pain, urgency, or objection severity unless explicit.

### No linked action

Most likely generated actions will not have a true source interaction unless derived from the same row's `Background` or `Next Step`. Preserve source metadata so future linking is auditable.

## 7. Import Strategy Recommendation

Do not import all 5 files directly into production V1.

Recommended Step 2 implementation strategy:

1. Create a founder workspace subset import, not a generic importer.
2. Prefer source export to local JSON files first, then map JSON to Memoire local/Supabase objects.
3. Use one curated folder:
   - `src/features/v31/founderWorkspaceSeed.ts` only if the seed is small and typed
   - or `supabase/seed/henry-founder-workspace/*.json` if data is larger and should be auditable
4. Preserve raw source rows:
   - keep `sourceFile`
   - keep `sourceTab`
   - keep `sourceRow`
   - keep `rawNote` or `rawSource`
5. Avoid damaging existing demo data:
   - create separate founder/admin workspace seed function
   - use Henry's admin user ID or a deterministic workspace flag
   - do not overwrite existing demo/localStorage data
   - do not run automatically on app load
6. Add normalization utilities:
   - `normalizeAccountName(rawName)`
   - `mapOpportunityStage(rawStage, probability, status)`
   - `parseOpenTiming(value)` with conservative behavior
   - `deriveBlockersFromExplicitText(text)`
7. Import order:
   - accounts
   - contacts for top accounts
   - opportunities
   - interactions/notes
   - actions
   - objections/blockers
   - brand reference data
   - pricing context attached to opportunities

Raw notes should be preserved by converting background/strategic rationale/current setup/status fields into Interaction records with `interaction_type = note` and explicit `sourceFile/sourceTab/sourceRow` metadata where the current schema allows. If schema does not yet support source metadata cleanly, store it inside `structured_data` rather than adding schema before review.

## 8. Expected Founder Workspace Output

### Today

Henry should see:

- Top Revenue Actions from explicit `Next Step`, pricing statuses, and KA action plans where filled
- Needs Attention from missing next actions, stale account notes, tender/procurement blockers, open objections
- Due / Overdue Actions where deadlines can be safely parsed
- What Changed based on imported timestamps and recent rows

### Journey

Henry should see:

- Active Journeys from real accounts and opportunities
- Broken Loops for opportunities without next action, open objections without linked action, stale accounts, and captures/notes without action
- Memory Health badges based on recent interaction, next action, opportunity context, contact context, and blockers

### Accounts

Henry should see:

- Account Memory for top accounts and master account list entries
- Account Narrative generated from profile, background, strategic rationale, current setup, spend context, and latest notes
- Timeline built from imported notes/background rows
- Contacts for KA account plan contacts where non-placeholder values exist
- Open Actions from next steps and action-plan rows
- Objections/blockers from explicit incumbent/current supplier/status/risk text

### Opportunities

Henry should see:

- Opportunity Memory from Pipeline, Special Projects, Leads, and Deal Log
- Stage where explicitly available or safely mapped
- Linked account via normalization map
- Blocker from explicit risk/status/incumbent/current supplier fields
- Next Action from `Open`, `Next Step`, action plan, or pricing status where usable

### Ask Memoire

Henry should be able to ask:

- All memory: "What needs attention?" / "What changed recently?"
- Specific account: "Summarize Control Union" / "What happened last time?"
- Specific opportunity: "What is blocking this deal?" / "What should I do next?"

## 9. Risks and Assumptions

- Ambiguous accounts: TV Pharm/TV Pharma, FKV/Fresenius Kabi Vietnam, DHG Pharma plant grouping, Allomed & Tenamyd combined deal, Phuc Thinh/Phuc Thinh Food.
- Missing contacts: many account plans have placeholders or incomplete contact maps.
- Mixed forecast vs real deal data: Pipeline forecast values, KA targets, lead volumes, and Pricing Deal Log costs should not be treated as the same object without source tagging.
- Pricing data should not become a core V1 feature: it should support Opportunity Memory only.
- Dashboard-style fields should be translated into Memoire language:
  - forecast -> opportunity context
  - target -> commercial context
  - margin -> pricing context
  - status -> stage/blocker/action clue
  - background -> raw memory note
- Some date formats need review:
  - Vietnamese formatted dates such as `03-thg 5-2026`
  - pipeline open timing such as `04Apr/W2`
  - natural next steps such as `Contact Mr. An next week`
- Some fields contain placeholders like `[fill in]`; these should not be imported as real data.
- Contact names in background fields may be useful but should not create contacts automatically unless explicit enough and approved.

## 10. Product Recommendation

Do not import all 5 files fully into Memoire V1.

Recommended path: import a founder workspace subset first.

Preferred subset:

1. `Master_Database_FY26 / tblAccounts`
   - Primary Account Memory source
   - Background and Next Step become notes/actions

2. `Pipeline_Forecast_FY26 / 2. Pipeline`
   - Primary Opportunity Memory source
   - Product/brand/channel/value/open timing become opportunity context

3. `KA_Strategy_FY26 / top account tabs`
   - Enrich top account narratives, contacts, decision map, current supplier/incumbent context

4. `Pricing_Margin_Monitor_FY26 / 3. Deal Log`
   - Use only as supporting opportunity context
   - Do not create a pricing dashboard

5. `Portfolio_Brand_Strategy_FY26 / tblBrands`
   - Use as reference data only
   - Do not expose as a main V1 module

This approach best fits Memoire's product direction: Sales Memory, Next Action, Account Narrative, Journey, Ask Memoire, and Learning without turning V1 into CRM reporting or analytics.

## 11. Henry Review Checklist

Henry should review:

- Canonical account names and uncertain aliases
- Whether `Allomed & Tenamyd` should split into two opportunities/accounts or remain one combined deal context
- Whether `FKV` equals `Fresenius Kabi Vietnam`
- How to group `DHG Pharma` plant-specific accounts
- Whether `Open` timing values like `04Apr/W2` should become due dates
- Whether pipeline probability should map to Memoire confidence or remain raw opportunity context
- Which contacts are real enough to import
- Which background notes should become interactions versus account summary
- Whether pricing rows should create opportunities or only enrich existing opportunities

