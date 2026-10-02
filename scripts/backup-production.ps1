param(
  [Parameter(Mandatory=$true)][string]$ClientBin,
  [Parameter(Mandatory=$true)][string]$BackupDirectory
)
$ErrorActionPreference = 'Stop'
$auditRoot = Split-Path -Parent $PSScriptRoot
$auditConnection = $env:DATABASE_URL
if (!$auditConnection) {
  $auditEnvFile = Join-Path $auditRoot '.env.local'
  if (Test-Path -LiteralPath $auditEnvFile) {
    $auditEntry = Get-Content -LiteralPath $auditEnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
    if ($auditEntry) { $auditConnection = $auditEntry.Substring('DATABASE_URL='.Length).Trim().Trim('"').Trim("'") }
  }
}
if (!$auditConnection) { throw 'DATABASE_URL is missing. Configure the existing PostgreSQL password locally; do not send it through chat.' }
try { $auditUri = [Uri]$auditConnection } catch { throw 'DATABASE_URL is not a valid PostgreSQL URI.' }
if ($auditUri.Scheme -notin @('postgres','postgresql')) { throw 'Only PostgreSQL connection URIs are accepted.' }
$auditUserParts = $auditUri.UserInfo.Split(':',2)
$auditUser = [Uri]::UnescapeDataString($auditUserParts[0])
if ($auditUserParts.Count -ne 2 -or !$auditUserParts[1] -or $auditUserParts[1] -match 'YOUR-PASSWORD') { throw 'The existing database password is not configured.' }
$auditDirect = $auditUri.Host -eq 'db.mlmpcpkucurylkrobain.supabase.co' -and $auditUser -eq 'postgres'
$auditSession = $auditUri.Host -eq 'aws-1-ap-south-1.pooler.supabase.com' -and $auditUser -eq 'postgres.mlmpcpkucurylkrobain'
if ((!$auditDirect -and !$auditSession) -or $auditUri.Port -ne 5432 -or $auditUri.AbsolutePath -ne '/postgres') { throw 'Target refused: use the verified mlmpcpkucurylkrobain direct or session-pooler connection on port 5432.' }
if ($auditUri.Query) { throw 'Remove URI query options; this workflow enforces its own connection settings.' }
$auditDestination = [IO.Path]::GetFullPath($BackupDirectory)
$auditCheckout = [IO.Path]::GetFullPath($auditRoot).TrimEnd('\') + '\'
if ($auditDestination.StartsWith($auditCheckout,[StringComparison]::OrdinalIgnoreCase)) { throw 'Retain the database backup outside the source checkout.' }
if (Test-Path -LiteralPath $auditDestination) { throw 'Use a new backup directory; existing backups are never overwritten.' }
$auditTools = @{}
foreach ($auditName in @('psql','pg_dump','pg_dumpall','pg_restore')) {
  $auditPath = Join-Path $ClientBin ($auditName + '.exe')
  if (!(Test-Path -LiteralPath $auditPath)) { throw "PostgreSQL client missing: $auditName" }
  $auditTools[$auditName] = $auditPath
}
$auditClientVersion = & $auditTools.pg_dump --version
if ($LASTEXITCODE -ne 0 -or $auditClientVersion -notmatch 'PostgreSQL\) 17\.') { throw 'Use a PostgreSQL 17 client matching the verified server major version.' }
$auditNames = @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT','PGOPTIONS','PGSERVICE','PGSERVICEFILE')
$auditPrevious = @{}
foreach ($auditName in $auditNames) { $auditPrevious[$auditName] = [Environment]::GetEnvironmentVariable($auditName,'Process') }
try {
  $env:PGHOST=$auditUri.Host; $env:PGPORT='5432'; $env:PGUSER=$auditUser
  $env:PGPASSWORD=[Uri]::UnescapeDataString($auditUserParts[1]); $env:PGDATABASE='postgres'
  $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'; $env:PGOPTIONS='-c default_transaction_read_only=on'
  $env:PGSERVICE=$null; $env:PGSERVICEFILE=$null
  New-Item -ItemType Directory -Path $auditDestination | Out-Null
  # Child process environment carries the password, never a command argument.
  & $auditTools.psql --no-password -X --set=ON_ERROR_STOP=1 --tuples-only --no-align --command="select current_database(), current_user, version();" *> (Join-Path $auditDestination 'connection-check.log')
  if ($LASTEXITCODE -ne 0) { throw 'Database connection failed. See the local private connection-check.log.' }
  & $auditTools.pg_dump --no-password --format=custom --lock-wait-timeout=10s --file=(Join-Path $auditDestination 'database.dump') *> (Join-Path $auditDestination 'dump.log')
  if ($LASTEXITCODE -ne 0) { throw 'Database dump failed; this directory is incomplete and must not be treated as a recovery point.' }
  & $auditTools.pg_dumpall --no-password --roles-only --no-role-passwords --file=(Join-Path $auditDestination 'roles.sql') *> (Join-Path $auditDestination 'roles.log')
  if ($LASTEXITCODE -ne 0) { throw 'Role export failed; the backup is incomplete.' }
  & $auditTools.pg_restore --list (Join-Path $auditDestination 'database.dump') *> (Join-Path $auditDestination 'archive-contents.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Archive listing failed; the backup is incomplete.' }
  $auditHashes = @('database.dump','roles.sql','archive-contents.txt') | ForEach-Object { $auditHash=Get-FileHash -LiteralPath (Join-Path $auditDestination $_) -Algorithm SHA256; [pscustomobject]@{file=$_;sha256=$auditHash.Hash} }
  [pscustomobject]@{project='mlmpcpkucurylkrobain';capturedAt=[DateTime]::UtcNow.ToString('o');client=$auditClientVersion;scope='full database plus roles without role passwords';checksums=$auditHashes;restoreRehearsal='NOT_RUN';productionGate='NO_GO_UNTIL_RESTORED_AND_RECONCILED';limitations='Storage object bytes, provider configuration and excluded role passwords require separate recovery evidence.'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $auditDestination 'manifest.json') -Encoding utf8
  Write-Output 'Dump and checksums retained. Restoration has NOT been rehearsed; Production is not approved.'
} finally {
  foreach ($auditName in $auditNames) { [Environment]::SetEnvironmentVariable($auditName,$auditPrevious[$auditName],'Process') }
}
