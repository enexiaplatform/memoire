# Memoire Visual Explorer v2 — production release

14/10/2026, Asia/Saigon. The requested visualization upgrade is live on [Review → Learning & Analytics](https://www.memoire-official.com/app/reviews?view=analytics).

| Gate | Verified result |
|---|---|
| PR | [#5](https://github.com/enexiaplatform/memoire/pull/5), merged |
| Tested PR commit | `b909221bacd9d34da9471416849513af64ddf8cc` |
| PR CI | [38560510529](https://github.com/enexiaplatform/memoire/actions/runs/38560510529): both jobs success |
| Production/master commit | `850a064e9cf4c73748c888c6b8ccaa40f5483d4b` |
| Master CI | [38576448764](https://github.com/enexiaplatform/memoire/actions/runs/38576448764): completed/success; Build, typecheck, lint, test and Full contract suite both success |
| Vercel target | Team `team_zHpaTEtoeDPAJQmKaHAED5Eh`, project `prj_IG0RdVVsY9KzEuSFHdTez5T5nQNH` / `memoire` |
| Production deployment | [dpl_DUynzEYtL4DB748EtL1XRwbKEMiq](https://vercel.com/enexiaplatforms-projects/memoire/DUynzEYtL4DB748EtL1XRwbKEMiq), READY, target production, exact master SHA |
| Domain assignment | `www.memoire-official.com` and `memoire-official.com` listed on this deployment; `aliasError = null` |
| Health | `ok = true`, 5 required passed, 0 required failed, 0 warnings |
| Code parity | No differences between the tested PR and production merge across `src`, `scripts`, `test`, `api`, `package.json` or lockfile |
| Database | No migration, schema, permission or production record mutation in this release |

## Runtime acceptance

The browser suite passed against the READY preview and again against the main production domain. It used 240 explicitly fictional records in isolated demo browser storage, including skewed values, uneven dates and missing fields. Checks cover picking, customer connections, inspector, mode identity, zoom, brush, stable selection across mobile reflow, own-filter alternatives, SVG/CSV parity, keyboard, portrait/landscape overflow and record navigation. The selected brand export contains 50 records, matching the CSV exactly.

A separate existing authenticated cloud session belongs to **[SIMULATED QC R5] Orion Calibration Partners**, a fictional QC owner. Live cloud acceptance verified:

- Workspace-record provenance is shown. USD selection contains 25 non-lead-stage opportunities and displays 302.5K USD in current recorded estimates; this is not a realized-revenue claim.
- Selecting `[SIM QC R5] 2026-09 Calibration station 4` reads record `00715cbf-82f4-4be3-8d30-32df8d16e341`, estimate 17K USD, Lost/Lost, unknown recorded probability and its existing next action.
- The scene and inspector show five other opportunities for the same customer, including links across CalPro and Inspectra.
- Switching to Value & probability and back preserves the selected record. The unknown-probability record remains inspectable even though it has no scatter position.
- Open opportunity navigates to the exact source ID and displays that opportunity's drawer. No form was saved, no transaction was created and no fixture was written to the cloud.
- Zero console errors were observed in the current authenticated tab's collected logs. This does not certify all historical or server logs.

Evidence is saved locally under `.audit/visual-explorer-release/`: separate preview and production screenshots, export packs, browser result files, production health and `release-target.json`. The cloud-session screenshot is `production/cloud-qc-selected.png`. Evidence remains local and is not published to GitHub.

## Scope and recovery

This release contains only the visualization upgrade and its dependencies, tests and design/report records. Other unfinished local page-header changes remain outside the release. Local working-tree changes were preserved; production was built by the Git integration from the merged commit.

The prior READY deployment `dpl_2UHqc75juQSNYpGrsKGKUjGRH9ZD` (master `33bf06b56c7fe9356523e205c61f29d148304abd`) was inspected before release and retained as the recovery reference. No rollback was needed. Acceptance on the fictional QC owner does not certify the accuracy of a real customer's commercial records.
