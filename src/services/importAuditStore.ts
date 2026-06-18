import { supabaseClient } from '../lib/supabaseClient';

export const FOUNDER_IMPORT_TARGET_EMAIL = 'thongtran.hcmus@gmail.com';

export type ImportBatchStatus = 'running' | 'completed' | 'failed' | 'rolled_back';

export type ImportBatchRecord = {
  id: string;
  userId: string;
  targetEmail: string;
  scope: string;
  mode: string;
  status: ImportBatchStatus;
  dryRun: boolean;
  sourceFiles: string[];
  summary: Record<string, any>;
  warnings: Record<string, any> | any[];
  createdBy: string;
  createdAt: string;
  committedAt: string;
  completedAt: string;
};

export type ImportRowResultRecord = {
  id: number;
  batchId: string;
  userId: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number | null;
  targetTable: string;
  action: string;
  warningCodes: string[];
  errorCode: string;
  sourceHash: string;
  createdAt: string;
};

type ImportBatchRow = {
  id: string;
  user_id: string;
  target_email: string;
  scope: string;
  mode: string;
  status: ImportBatchStatus;
  dry_run: boolean;
  source_files: string[] | null;
  summary: Record<string, any> | null;
  warnings: Record<string, any> | any[] | null;
  created_by: string | null;
  created_at: string;
  committed_at: string | null;
  completed_at: string | null;
};

type ImportRowResultRow = {
  id: number;
  batch_id: string;
  user_id: string;
  source_file: string;
  source_sheet: string;
  source_row: number | null;
  target_table: string;
  action: string;
  warning_codes: string[] | null;
  error_code: string | null;
  source_hash: string | null;
  created_at: string;
};

export function isFounderImportUser(email?: string | null) {
  return (email || '').trim().toLowerCase() === FOUNDER_IMPORT_TARGET_EMAIL;
}

export async function loadImportBatches(userId?: string | null): Promise<ImportBatchRecord[]> {
  if (!userId || !supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from('import_batches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw new Error(error.message);
  return ((data || []) as ImportBatchRow[]).map(rowToBatch);
}

export async function loadImportRowResults(userId: string, batchId: string): Promise<ImportRowResultRecord[]> {
  if (!userId || !batchId || !supabaseClient) return [];

  const { data, error } = await supabaseClient
    .from('import_row_results')
    .select('id,batch_id,user_id,source_file,source_sheet,source_row,target_table,action,warning_codes,error_code,source_hash,created_at')
    .eq('user_id', userId)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return ((data || []) as ImportRowResultRow[]).map(rowToResult);
}

function rowToBatch(row: ImportBatchRow): ImportBatchRecord {
  return {
    id: row.id,
    userId: row.user_id,
    targetEmail: row.target_email,
    scope: row.scope,
    mode: row.mode,
    status: row.status,
    dryRun: row.dry_run,
    sourceFiles: Array.isArray(row.source_files) ? row.source_files : [],
    summary: row.summary || {},
    warnings: row.warnings || {},
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    committedAt: row.committed_at || '',
    completedAt: row.completed_at || '',
  };
}

function rowToResult(row: ImportRowResultRow): ImportRowResultRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    userId: row.user_id,
    sourceFile: row.source_file,
    sourceSheet: row.source_sheet,
    sourceRow: row.source_row,
    targetTable: row.target_table,
    action: row.action,
    warningCodes: Array.isArray(row.warning_codes) ? row.warning_codes : [],
    errorCode: row.error_code || '',
    sourceHash: row.source_hash || '',
    createdAt: row.created_at,
  };
}
