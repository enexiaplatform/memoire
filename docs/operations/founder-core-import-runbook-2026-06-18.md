# Founder Core Import Runbook

This runbook covers the confidential first-user import for `thongtran.hcmus@gmail.com`.

## Scope

Included:

- Account Master: accounts, contacts as stakeholders, activity log.
- Pipeline Forecast: opportunities and forecast metadata.
- Operation System: playbook and initiatives as minimal operating context.

Excluded:

- Pricing workbooks.
- Competitive intelligence import.
- Bulk workbook data in AI prompts.

## Dry Run

Run dry-run first. It writes nothing to Supabase and prints only safe counts and warning codes.

```powershell
npm run import:founder-core -- --account-master="C:\path\Account_Master.xlsx" --pipeline-forecast="C:\path\Pipeline_Forecast.xlsx" --operation-system="C:\path\Operation_System.xlsx"
```

## Preflight

Run preflight before commit. It parses the workbooks, checks whether required env values are present, and checks database readiness when a non-empty service-role key is available. It does not write data.

```powershell
npm run import:founder-core -- --preflight --account-master="C:\path\Account_Master.xlsx" --pipeline-forecast="C:\path\Pipeline_Forecast.xlsx" --operation-system="C:\path\Operation_System.xlsx"
```

## Commit

Commit requires server/local-only credentials:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- non-empty `SUPABASE_SERVICE_ROLE_KEY`

```powershell
npm run import:founder-core -- --commit --account-master="C:\path\Account_Master.xlsx" --pipeline-forecast="C:\path\Pipeline_Forecast.xlsx" --operation-system="C:\path\Operation_System.xlsx"
```

The importer resolves the Supabase user by email, creates a local ignored backup in `.memoire-private/import-backups`, creates an `import_batches` audit row, then upserts idempotently by source key.

After commit, sign in as `thongtran.hcmus@gmail.com` and open `/app/imports` to review the batch audit.

## Verify

After commit, verify imported counts against the same workbook inputs.

```powershell
npm run import:founder-core -- --verify-import --account-master="C:\path\Account_Master.xlsx" --pipeline-forecast="C:\path\Pipeline_Forecast.xlsx" --operation-system="C:\path\Operation_System.xlsx"
```

## Rollback

Rollback deletes rows created by a specific import batch for the target user and marks the batch `rolled_back`.

```powershell
npm run import:founder-core -- --rollback-batch="00000000-0000-0000-0000-000000000000"
```

## Post-Import Checks

- Confirm every imported row has the target `user_id`.
- Run the data isolation and trust-boundary verification scripts.
- Sign in as the target user and smoke-test Accounts, Stakeholders, Activities, Opportunities, Dashboard, Export, and Ask Memoire.
- Confirm no pricing or competitive intelligence rows were imported.
