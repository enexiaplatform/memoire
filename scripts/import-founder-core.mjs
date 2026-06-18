#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

const TARGET_EMAIL = 'thongtran.hcmus@gmail.com';
const SOURCE_SYSTEM = 'founder_core_fy26';
const BACKUP_DIR = '.memoire-private/import-backups';
const CHUNK_SIZE = 500;

const logicalFiles = {
  accountMaster: 'account_master_fy26',
  pipelineForecast: 'pipeline_forecast_fy26',
  operationSystem: 'operation_system_fy26',
};

const targetTables = [
  'accounts',
  'stakeholders',
  'sales_activities',
  'opportunities',
  'operating_context',
];

main().catch((error) => {
  console.error(`[founder-import] ${safeError(error)}`);
  process.exitCode = 1;
});

async function main() {
  await loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.rollbackBatchId) {
    const result = await rollbackImport(options);
    printRollbackSummary(result, options);
    return;
  }

  if (options.preflight) {
    const result = await runPreflight(options);
    printPreflightSummary(result, options);
    return;
  }

  if (options.verifyImport) {
    const result = await verifyImport(options);
    printVerifySummary(result, options);
    return;
  }

  const plan = await buildImportPlan(options);
  const summary = summarizePlan(plan, options);

  if (options.dryRun) {
    printSummary(summary, options);
    return;
  }

  const result = await commitImport(plan, summary, options);
  printSummary({ ...summary, commit: result }, options);
}

function parseArgs(args) {
  const options = {
    dryRun: true,
    targetEmail: process.env.MEMOIRE_IMPORT_TARGET_EMAIL || TARGET_EMAIL,
    accountMaster: '',
    pipelineForecast: '',
    operationSystem: '',
    rollbackBatchId: '',
    preflight: false,
    verifyImport: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    rejectOutOfScopePricing(arg);
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--commit') options.dryRun = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--preflight') options.preflight = true;
    else if (arg === '--verify-import') options.verifyImport = true;
    else if (arg === '--json') options.json = true;
    else if (optionMatches(arg, '--rollback-batch')) {
      const parsed = readOptionValue(args, index);
      options.rollbackBatchId = parsed.value;
      index = parsed.nextIndex;
    } else if (optionMatches(arg, '--target-email')) {
      const parsed = readOptionValue(args, index);
      options.targetEmail = parsed.value;
      index = parsed.nextIndex;
    } else if (optionMatches(arg, '--account-master')) {
      const parsed = readOptionValue(args, index);
      options.accountMaster = parsed.value;
      index = parsed.nextIndex;
    } else if (optionMatches(arg, '--pipeline-forecast', '--pipeline')) {
      const parsed = readOptionValue(args, index);
      options.pipelineForecast = parsed.value;
      index = parsed.nextIndex;
    } else if (optionMatches(arg, '--operation-system', '--operation')) {
      const parsed = readOptionValue(args, index);
      options.operationSystem = parsed.value;
      index = parsed.nextIndex;
    }
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.help && !options.preflight && !options.verifyImport && !options.rollbackBatchId && !options.accountMaster && !options.pipelineForecast && !options.operationSystem) {
    throw new Error('At least one workbook path is required. Run with --help for usage.');
  }
  if (options.targetEmail.toLowerCase() !== TARGET_EMAIL) {
    throw new Error(`Refusing to import into any user except ${TARGET_EMAIL}.`);
  }

  return options;
}

function argValue(arg) {
  return cleanArgValue(arg.slice(arg.indexOf('=') + 1));
}

function cleanArgValue(value) {
  return value.trim().replace(/^"|"$/g, '');
}

function optionMatches(arg, ...names) {
  return names.some((name) => arg === name || arg.startsWith(`${name}=`));
}

function readOptionValue(args, index) {
  const arg = args[index];
  if (arg.includes('=')) {
    const value = argValue(arg);
    rejectOutOfScopePricing(value);
    return { value, nextIndex: index };
  }

  const valueArg = args[index + 1];
  if (!valueArg || valueArg.startsWith('--')) {
    throw new Error(`${arg} requires a value.`);
  }
  rejectOutOfScopePricing(valueArg);
  return { value: cleanArgValue(valueArg), nextIndex: index + 1 };
}

function rejectOutOfScopePricing(value) {
  if (/pricing/i.test(value)) {
    throw new Error('Pricing workbook is out of scope for this importer.');
  }
}

function printUsage() {
  console.log(`Memoire founder core importer

Dry-run is the default and never writes to Supabase.

Usage:
  node scripts/import-founder-core.mjs --account-master="C:\\path\\Account_Master.xlsx" --pipeline-forecast="C:\\path\\Pipeline_Forecast.xlsx" --operation-system="C:\\path\\Operation_System.xlsx"
  node scripts/import-founder-core.mjs --preflight --account-master="C:\\path\\Account_Master.xlsx" --pipeline-forecast="C:\\path\\Pipeline_Forecast.xlsx" --operation-system="C:\\path\\Operation_System.xlsx"
  node scripts/import-founder-core.mjs --commit --account-master="C:\\path\\Account_Master.xlsx" --pipeline-forecast="C:\\path\\Pipeline_Forecast.xlsx"
  node scripts/import-founder-core.mjs --verify-import --account-master="C:\\path\\Account_Master.xlsx" --pipeline-forecast="C:\\path\\Pipeline_Forecast.xlsx" --operation-system="C:\\path\\Operation_System.xlsx"
  node scripts/import-founder-core.mjs --rollback-batch="00000000-0000-0000-0000-000000000000"

Commit requirements:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  Target email fixed to ${TARGET_EMAIL}

Out of scope:
  Pricing workbooks are rejected by this importer.`);
}

async function buildImportPlan(options) {
  const plan = {
    accounts: [],
    stakeholders: [],
    salesActivities: [],
    opportunities: [],
    operatingContext: [],
    rowResults: [],
    warnings: [],
    sourceFiles: [],
  };

  if (options.accountMaster) {
    const workbook = await readWorkbook(options.accountMaster);
    plan.sourceFiles.push(logicalFiles.accountMaster);
    parseAccountMaster(workbook, plan);
  }

  if (options.pipelineForecast) {
    const workbook = await readWorkbook(options.pipelineForecast);
    plan.sourceFiles.push(logicalFiles.pipelineForecast);
    parsePipelineForecast(workbook, plan);
  }

  if (options.operationSystem) {
    const workbook = await readWorkbook(options.operationSystem);
    plan.sourceFiles.push(logicalFiles.operationSystem);
    parseOperationSystem(workbook, plan);
  }

  return plan;
}

function parseAccountMaster(workbook, plan) {
  const accountRows = rowsFromSheet(workbook, '2. Accounts', ['Account_ID', 'Account Name (Local)']);
  const contactRows = rowsFromSheet(workbook, '3. Contacts', ['Account_ID', 'Full Name']);
  const activityRows = rowsFromSheet(workbook, 'Activity Log', ['Date', 'Account_ID', 'Summary']);
  const contactsByAccount = new Map();
  const knownAccountIds = new Set();

  for (const row of accountRows) {
    const sourceRow = row.__sourceRow;
    const accountId = asText(get(row, 'Account_ID'));
    const accountName = asText(get(row, 'Account Name (Local)')) || asText(get(row, 'Account Name'));
    if (!accountId && !accountName) {
      addRowResult(plan, logicalFiles.accountMaster, '2. Accounts', sourceRow, 'accounts', 'skip', ['missing_account_identity']);
      continue;
    }
    if (accountId) knownAccountIds.add(normalizeIdentity(accountId));
  }

  for (const row of contactRows) {
    const accountId = asText(get(row, 'Account_ID'));
    const fullName = asText(get(row, 'Full Name'));
    if (!fullName) continue;
    const key = normalizeIdentity(accountId);
    if (key) {
      const names = contactsByAccount.get(key) || [];
      if (names.length < 5) names.push(fullName);
      contactsByAccount.set(key, names);
    }
  }

  for (const row of accountRows) {
    const sourceRow = row.__sourceRow;
    const accountId = asText(get(row, 'Account_ID'));
    const accountName = asText(get(row, 'Account Name (Local)')) || asText(get(row, 'Account Name')) || accountId;
    if (!accountName) continue;

    const sourceHash = hashSource(row);
    const accountKey = accountId || `account:${stableHash(normalizeIdentity(accountName)).slice(0, 20)}`;
    const territory = asText(get(row, 'Territory'));
    const stateProvince = asText(get(row, 'State_Province')) || asText(get(row, 'State Province'));
    const note = asText(get(row, 'Note'));
    const strategy = asText(get(row, 'Strategy'));
    const priority = asText(get(row, 'Priority'));
    const inStage = asText(get(row, 'In-stage')) || asText(get(row, 'In stage'));
    const activityCount = asNumber(get(row, 'Activity_Count'));
    const summaryParts = [
      strategy ? `Strategy: ${strategy}` : '',
      note ? `Note: ${note}` : '',
      inStage ? `Stage: ${inStage}` : '',
    ].filter(Boolean);

    plan.accounts.push({
      user_id: null,
      name: accountName,
      account_name: accountName,
      summary: summaryParts.join('\n') || null,
      segment: asText(get(row, 'Segment')) || null,
      industry: null,
      location: [territory, stateProvince].filter(Boolean).join(', ') || null,
      account_potential: normalizeAccountPotential(priority, asNumber(get(row, 'FY26_Target_SGD'))),
      relationship_status: normalizeRelationshipStatus(inStage, activityCount, asText(get(row, 'Overdue_Status'))),
      key_stakeholders: contactsByAccount.get(normalizeIdentity(accountId)) || [],
      notes: summaryParts.join('\n') || null,
      tags: compactTags(['founder-import', 'account-master', asText(get(row, 'Segment')), territory, boolValue(get(row, 'KA_Flag')) ? 'key-account' : '']),
      status: 'active',
      pain_points: [],
      objections: [],
      external_source_key: accountKey,
      source_system: SOURCE_SYSTEM,
      source_file: logicalFiles.accountMaster,
      source_sheet: '2. Accounts',
      source_row: sourceRow,
      source_hash: sourceHash,
      import_batch_id: null,
      territory: territory || null,
      state_province: stateProvince || null,
      ka_flag: boolValue(get(row, 'KA_Flag')),
      priority: priority || null,
      fy26_target_sgd: asNumber(get(row, 'FY26_Target_SGD')),
      fy27_target_sgd: asNumber(get(row, 'FY27_Target_SGD')),
      account_master_stage: inStage || null,
      strategy: strategy || null,
      strategy_owner: asText(get(row, 'Who')) || null,
      next_follow_up: asDate(get(row, 'Next_Follow_Up')) || asDate(get(row, 'Next Action Date')) || null,
      overdue_status: asText(get(row, 'Overdue_Status')) || null,
    });
    addRowResult(plan, logicalFiles.accountMaster, '2. Accounts', sourceRow, 'accounts', 'insert_or_update', [], sourceHash);
  }

  for (const row of contactRows) {
    const sourceRow = row.__sourceRow;
    const accountId = asText(get(row, 'Account_ID'));
    const accountName = asText(get(row, 'Account Name'));
    const fullName = asText(get(row, 'Full Name'));
    if (!fullName) {
      addRowResult(plan, logicalFiles.accountMaster, '3. Contacts', sourceRow, 'stakeholders', 'skip', ['missing_contact_name']);
      continue;
    }

    const warnings = [];
    if (accountId && !knownAccountIds.has(normalizeIdentity(accountId))) warnings.push('contact_account_not_found');
    const sourceHash = hashSource(row);
    const email = asText(get(row, 'Email'));
    const phone = asText(get(row, 'Phone'));
    const externalKey = [accountId || accountName || 'unknown-account', email || phone || normalizeIdentity(fullName)].join(':');

    plan.stakeholders.push({
      user_id: null,
      account_id: null,
      account_name: accountName || null,
      opportunity_id: null,
      opportunity_name: null,
      name: fullName,
      role_title: asText(get(row, 'Title')) || null,
      stakeholder_role: inferStakeholderRole(asText(get(row, 'Title'))),
      influence_level: 'Unknown',
      relationship_strength: 'Unknown',
      stance: 'Unknown',
      email: email || null,
      phone: phone || null,
      notes: asText(get(row, 'Last Activity Summary')) || null,
      tags: compactTags(['founder-import', 'contact-import']),
      last_interaction_date: asDate(get(row, 'Last Activity Date')) || null,
      last_activity_type: asText(get(row, 'Last Activity Type')) || null,
      last_activity_summary: asText(get(row, 'Last Activity Summary')) || null,
      external_source_key: externalKey,
      source_system: SOURCE_SYSTEM,
      source_file: logicalFiles.accountMaster,
      source_sheet: '3. Contacts',
      source_row: sourceRow,
      source_hash: sourceHash,
      import_batch_id: null,
    });
    addWarnings(plan, logicalFiles.accountMaster, '3. Contacts', sourceRow, warnings);
    addRowResult(plan, logicalFiles.accountMaster, '3. Contacts', sourceRow, 'stakeholders', warnings.length ? 'warning' : 'insert_or_update', warnings, sourceHash);
  }

  for (const row of activityRows) {
    const sourceRow = row.__sourceRow;
    const activityDate = asDate(get(row, 'Date'));
    const summary = asText(get(row, 'Summary'));
    if (!activityDate || !summary) {
      addRowResult(plan, logicalFiles.accountMaster, 'Activity Log', sourceRow, 'sales_activities', 'skip', ['missing_activity_date_or_summary']);
      continue;
    }

    const sourceHash = hashSource(row);
    const nextAction = asText(get(row, 'Next Action'));
    const dueDate = asDate(get(row, 'Next Action Date'));
    const activityType = normalizeActivityType(asText(get(row, 'Activity Type')), summary);
    const accountName = asText(get(row, 'Account Name'));
    const contactName = asText(get(row, 'Contact Name'));
    const nextActions = nextAction ? [{ title: nextAction, ...(dueDate ? { dueDate } : {}), sourceText: 'Imported account activity log' }] : [];

    plan.salesActivities.push({
      user_id: null,
      activity_date: activityDate,
      raw_note: [summary, nextAction ? `Next action: ${nextAction}` : ''].filter(Boolean).join('\n'),
      activity_type: activityType,
      account_name: accountName || null,
      opportunity_name: null,
      contact_name: contactName || null,
      stakeholder_name: contactName || null,
      stakeholder_role: null,
      competitors: [],
      buying_signals: [],
      risks: [],
      timeline_signals: [],
      next_actions: nextActions,
      summary,
      next_action: nextAction || null,
      due_date: dueDate || null,
      tags: compactTags(['founder-import', 'activity-log', activityType.toLowerCase().replace(/[^a-z0-9]+/g, '-')]),
      linked_opportunity_id: null,
      linked_opportunity_name: null,
      linked_account_name: accountName || null,
      link_status: 'Unlinked',
      external_source_key: `activity:${sourceHash}`,
      source_system: SOURCE_SYSTEM,
      source_file: logicalFiles.accountMaster,
      source_sheet: 'Activity Log',
      source_row: sourceRow,
      source_hash: sourceHash,
      import_batch_id: null,
    });
    addRowResult(plan, logicalFiles.accountMaster, 'Activity Log', sourceRow, 'sales_activities', 'insert_or_update', [], sourceHash);
  }
}

function parsePipelineForecast(workbook, plan) {
  const rows = rowsFromSheet(workbook, '2. Pipeline', ['Opportunity (prob.)', 'Account', 'FY26']);

  for (const row of rows) {
    const sourceRow = row.__sourceRow;
    const accountName = asText(get(row, 'Account'));
    const opportunityCell = asText(get(row, 'Opportunity (prob.)')) || asText(get(row, 'Opportunity'));
    const product = asText(get(row, 'Product'));
    const brand = asText(get(row, 'Brand'));
    if (!accountName && !opportunityCell && !product && !brand) {
      addRowResult(plan, logicalFiles.pipelineForecast, '2. Pipeline', sourceRow, 'opportunities', 'skip', ['blank_pipeline_row']);
      continue;
    }

    const sourceHash = hashSource(row);
    const probability = parseProbability(opportunityCell);
    const stage = inferStage(probability, asText(get(row, 'Open')));
    const status = inferOpportunityStatus(stage, asText(get(row, 'Open')));
    const fy26 = asNumber(get(row, 'FY26'));
    const fy27 = asNumber(get(row, 'FY27'));
    const q1 = asNumber(get(row, 'Q1'));
    const q2 = asNumber(get(row, 'Q2'));
    const q3 = asNumber(get(row, 'Q3'));
    const q4 = asNumber(get(row, 'Q4'));
    const quarterValues = { Q1: q1, Q2: q2, Q3: q3, Q4: q4 };
    const expectedClosePeriod = firstQuarterWithValue(quarterValues);
    const cleanOpportunityName = stripProbability(opportunityCell) || [accountName, product, brand].filter(Boolean).join(' / ') || 'Imported pipeline opportunity';
    const missingContext = [
      'Stage inferred from probability/open fields because workbook has no explicit stage.',
      asText(get(row, 'Channel')) ? '' : 'Channel missing in source row.',
      asText(get(row, 'Background')) ? '' : 'Background missing in source row.',
    ].filter(Boolean).join('\n');

    plan.opportunities.push({
      user_id: null,
      account_name: accountName || 'Unknown account',
      opportunity_name: cleanOpportunityName,
      title: cleanOpportunityName,
      stage,
      estimated_value: fy26 ?? sumNumbers([q1, q2, q3, q4]),
      currency: 'SGD',
      expected_close_period: expectedClosePeriod || null,
      product_or_solution: [product, brand, asText(get(row, 'Type'))].filter(Boolean).join(' / ') || null,
      decision_maker: null,
      budget_owner: null,
      procurement_path: null,
      technical_criteria: null,
      next_action: null,
      next_action_text: null,
      next_action_date: null,
      evidence: [asText(get(row, 'Background')), asText(get(row, 'Open'))].filter(Boolean).join('\n') || null,
      missing_context: missingContext || null,
      objection_debt: null,
      blocker: null,
      forecast_evidence_category: inferForecastCategory(probability),
      decision_recommendation: inferDecisionRecommendation(probability, status),
      status,
      fy26_value: fy26,
      fy27_value: fy27,
      quarter_values: quarterValues,
      forecast_metadata: {
        sourceHadExplicitStage: false,
        probability,
        quotationPresent: Boolean(asText(get(row, 'Quotation'))),
      },
      brand: brand || null,
      channel: asText(get(row, 'Channel')) || null,
      opportunity_type: asText(get(row, 'Type')) || null,
      pipeline_probability: probability,
      is_stage_inferred: true,
      source_stage_confidence: 'inferred',
      external_source_key: `pipeline:${sourceHash}`,
      source_system: SOURCE_SYSTEM,
      source_file: logicalFiles.pipelineForecast,
      source_sheet: '2. Pipeline',
      source_row: sourceRow,
      source_hash: sourceHash,
      import_batch_id: null,
    });
    addRowResult(plan, logicalFiles.pipelineForecast, '2. Pipeline', sourceRow, 'opportunities', 'insert_or_update', [], sourceHash);
  }
}

function parseOperationSystem(workbook, plan) {
  parsePlaybookRows(workbook, plan);
  parseInitiativeRows(workbook, plan);
}

function parsePlaybookRows(workbook, plan) {
  const rows = rowsFromSheet(workbook, '♟️ Playbook', ['ID', 'Play']);

  for (const row of rows) {
    const sourceRow = row.__sourceRow;
    const id = asText(get(row, 'ID'));
    const play = asText(get(row, 'Play'));
    if (!id && !play) {
      addRowResult(plan, logicalFiles.operationSystem, '♟️ Playbook', sourceRow, 'operating_context', 'skip', ['blank_playbook_row']);
      continue;
    }
    const sourceHash = hashSource(row);
    const title = play || id || 'Imported play';
    plan.operatingContext.push({
      user_id: null,
      context_type: 'play',
      title,
      status: asText(get(row, 'Status')) || null,
      period: asText(get(row, 'Stage')) || null,
      owner: asText(get(row, 'Owner')) || null,
      value_at_stake: asNumber(get(row, 'Expected Value SGD')),
      next_action: asText(get(row, 'Next action')) || asText(get(row, 'Next Action')) || null,
      next_date: asDate(get(row, 'Next date')) || asDate(get(row, 'Next Date')) || null,
      summary: [asText(get(row, 'Target Account')), asText(get(row, 'Brand')), asText(get(row, 'Trigger'))].filter(Boolean).join(' / ') || null,
      payload: compactObject({
        id,
        type: asText(get(row, 'Type')),
        segment: asText(get(row, 'Segment')),
        targetAccount: asText(get(row, 'Target Account')),
        brand: asText(get(row, 'Brand')),
        trigger: asText(get(row, 'Trigger')),
        keySteps: asText(get(row, 'Key steps')),
        init: asText(get(row, 'Init')),
      }),
      external_source_key: `play:${id || sourceHash}`,
      source_system: SOURCE_SYSTEM,
      source_file: logicalFiles.operationSystem,
      source_sheet: '♟️ Playbook',
      source_row: sourceRow,
      source_hash: sourceHash,
      import_batch_id: null,
    });
    addRowResult(plan, logicalFiles.operationSystem, '♟️ Playbook', sourceRow, 'operating_context', 'insert_or_update', [], sourceHash);
  }
}

function parseInitiativeRows(workbook, plan) {
  const rows = rowsFromSheet(workbook, '🎖️ Initiatives', ['ID', 'Initiative']);

  for (const row of rows) {
    const sourceRow = row.__sourceRow;
    const id = asText(get(row, 'ID'));
    const initiative = asText(get(row, 'Initiative'));
    if (!id && !initiative) {
      addRowResult(plan, logicalFiles.operationSystem, '🎖️ Initiatives', sourceRow, 'operating_context', 'skip', ['blank_initiative_row']);
      continue;
    }
    const sourceHash = hashSource(row);
    plan.operatingContext.push({
      user_id: null,
      context_type: 'initiative',
      title: initiative || id || 'Imported initiative',
      status: asText(get(row, 'Status')) || null,
      period: asText(get(row, 'Quarter')) || null,
      owner: null,
      value_at_stake: asNumber(get(row, 'Value at stake')),
      next_action: asText(get(row, 'Next milestone')) || null,
      next_date: null,
      summary: asText(get(row, 'Objective')) || null,
      payload: compactObject({
        id,
        themeOrSegment: asText(get(row, 'Theme/Segment')),
        objective: asText(get(row, 'Objective')),
        kr1: asText(get(row, 'KR1')),
        kr2: asText(get(row, 'KR2')),
        kr3: asText(get(row, 'KR3')),
        plays: asText(get(row, 'Plays')),
        progress: asText(get(row, 'Progress')),
      }),
      external_source_key: `initiative:${id || sourceHash}`,
      source_system: SOURCE_SYSTEM,
      source_file: logicalFiles.operationSystem,
      source_sheet: '🎖️ Initiatives',
      source_row: sourceRow,
      source_hash: sourceHash,
      import_batch_id: null,
    });
    addRowResult(plan, logicalFiles.operationSystem, '🎖️ Initiatives', sourceRow, 'operating_context', 'insert_or_update', [], sourceHash);
  }
}

function rowsFromSheet(workbook, sheetName, requiredHeaders) {
  const rows = workbook.sheets.get(sheetName);
  if (!rows) return [];
  const headerIndex = findHeaderIndex(rows, requiredHeaders);
  if (headerIndex < 0) return [];
  return objectsFromRows(rows, headerIndex);
}

function findHeaderIndex(rows, requiredHeaders) {
  const required = requiredHeaders.map(normalizeHeader);
  const maxScan = Math.min(rows.length, 60);
  for (let index = 0; index < maxScan; index += 1) {
    const normalizedValues = (rows[index] || []).map((cell) => normalizeHeader(cell));
    if (required.every((header) => normalizedValues.includes(header))) return index;
  }
  return -1;
}

function objectsFromRows(rows, headerIndex) {
  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const objects = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (!row.some((cell) => asText(cell) || typeof cell === 'number')) continue;
    const object = { __sourceRow: rowIndex + 1 };
    headers.forEach((header, columnIndex) => {
      if (header) object[header] = row[columnIndex];
    });
    objects.push(object);
  }
  return objects;
}

async function readWorkbook(filePath) {
  const file = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(file);
  const workbookXml = await zipText(zip, 'xl/workbook.xml');
  const relsXml = await zipText(zip, 'xl/_rels/workbook.xml.rels');
  const sharedStrings = await readSharedStrings(zip);
  const styles = await readStyles(zip);
  const sheetDefs = parseSheetDefs(workbookXml, relsXml);
  const sheets = new Map();

  for (const sheet of sheetDefs) {
    const xml = await zipText(zip, sheet.path);
    sheets.set(sheet.name, parseSheetXml(xml, sharedStrings, styles));
  }

  return { sheets };
}

async function zipText(zip, fileName) {
  const file = zip.file(fileName);
  if (!file) return '';
  return file.async('string');
}

async function readSharedStrings(zip) {
  const xml = await zipText(zip, 'xl/sharedStrings.xml');
  if (!xml) return [];
  const strings = [];
  for (const match of xml.matchAll(/<si[\s\S]*?<\/si>/g)) {
    const itemXml = match[0];
    const textParts = [...itemXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    strings.push(textParts.join(''));
  }
  return strings;
}

async function readStyles(zip) {
  const xml = await zipText(zip, 'xl/styles.xml');
  if (!xml) return { dateStyleIndexes: new Set() };
  const customNumFmts = new Map();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/>/g)) {
    const attrs = parseAttrs(match[1]);
    customNumFmts.set(Number(attrs.numFmtId), attrs.formatCode || '');
  }
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  const dateStyleIndexes = new Set();
  let index = 0;
  for (const match of cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(match[1]);
    const numFmtId = Number(attrs.numFmtId || 0);
    if (isDateNumFmt(numFmtId, customNumFmts.get(numFmtId))) dateStyleIndexes.add(index);
    index += 1;
  }
  return { dateStyleIndexes };
}

function parseSheetDefs(workbookXml, relsXml) {
  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.Id || !attrs.Target) continue;
    const target = attrs.Target.replace(/^\/+/, '');
    rels.set(attrs.Id, target.startsWith('xl/') ? target : `xl/${target}`);
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = parseAttrs(match[1]);
    const relId = attrs['r:id'];
    const sheetPath = rels.get(relId);
    if (attrs.name && sheetPath) sheets.push({ name: decodeXml(attrs.name), path: sheetPath });
  }
  return sheets;
}

function parseSheetXml(xml, sharedStrings, styles) {
  const rows = [];
  let fallbackRow = 1;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = parseAttrs(rowMatch[1]);
    const rowNumber = Number(rowAttrs.r || fallbackRow);
    fallbackRow = rowNumber + 1;
    const values = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrText = cellMatch[1] || cellMatch[3] || '';
      const cellXml = cellMatch[2] || '';
      const attrs = parseAttrs(attrText);
      const columnIndex = columnIndexFromRef(attrs.r);
      if (columnIndex < 0) continue;
      values[columnIndex] = parseCellValue(cellXml, attrs, sharedStrings, styles);
    }
    rows[rowNumber - 1] = values;
  }
  return rows;
}

function parseCellValue(cellXml, attrs, sharedStrings, styles) {
  const type = attrs.t || '';
  const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (type === 'inlineStr') {
    return [...cellXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join('');
  }
  if (rawValue === undefined) return '';
  const decoded = decodeXml(rawValue);
  if (type === 's') return sharedStrings[Number(decoded)] || '';
  if (type === 'b') return decoded === '1';
  if (type === 'str' || type === 'e') return decoded;

  const numeric = Number(decoded);
  if (!Number.isFinite(numeric)) return decoded;
  const styleIndex = Number(attrs.s || -1);
  if (styles.dateStyleIndexes.has(styleIndex)) return excelSerialToIsoDate(numeric);
  return numeric;
}

function parseAttrs(attrText) {
  const attrs = {};
  for (const match of attrText.matchAll(/([:\w]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function decodeXml(value = '') {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function columnIndexFromRef(ref = '') {
  const letters = ref.match(/[A-Z]+/i)?.[0] || '';
  if (!letters) return -1;
  return letters.toUpperCase().split('').reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function isDateNumFmt(numFmtId, customFormat = '') {
  const builtInDateIds = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  if (builtInDateIds.has(numFmtId)) return true;
  const format = customFormat.toLowerCase().replace(/\[[^\]]+\]/g, '').replace(/"[^"]*"/g, '');
  return /(^|[^a-z])[dmyhs]{1,4}([^a-z]|$)/.test(format) && !/^\s*(0+|#|general)/i.test(format);
}

function get(row, header) {
  return row[normalizeHeader(header)];
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_./()-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[,$\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return excelSerialToIsoDate(value);
  const text = asText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return '';
}

function excelSerialToIsoDate(serial) {
  const millis = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(millis).toISOString().slice(0, 10);
}

function boolValue(value) {
  if (typeof value === 'boolean') return value;
  const text = asText(value).toLowerCase();
  if (!text) return null;
  if (['yes', 'y', 'true', '1', 'ka', 'key account'].includes(text)) return true;
  if (['no', 'n', 'false', '0'].includes(text)) return false;
  return null;
}

function normalizeIdentity(value) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeAccountPotential(priority, target) {
  const text = asText(priority).toLowerCase();
  if (/high|a\b|p1|top/.test(text)) return 'High';
  if (/medium|b\b|p2/.test(text)) return 'Medium';
  if (/low|c\b|p3/.test(text)) return 'Low';
  if (typeof target === 'number' && target > 0) return 'Medium';
  return 'Unknown';
}

function normalizeRelationshipStatus(stage, activityCount, overdueStatus) {
  const text = `${stage} ${overdueStatus}`.toLowerCase();
  if (/risk|overdue|stuck/.test(text)) return 'At risk';
  if (/strong|key|active/.test(text)) return 'Active';
  if ((activityCount || 0) > 0) return 'Developing';
  return 'New';
}

function inferStakeholderRole(title) {
  const text = asText(title).toLowerCase();
  if (/procurement|purchasing|buyer/.test(text)) return 'Procurement';
  if (/director|head|chief|owner|ceo|cfo|coo|gm|general manager/.test(text)) return 'Decision maker';
  if (/technical|engineer|qa|qc|lab|scientist/.test(text)) return 'Technical buyer';
  if (/doctor|user|operator|specialist/.test(text)) return 'User';
  return 'Unknown';
}

function normalizeActivityType(type, summary) {
  const text = `${type} ${summary}`.toLowerCase();
  if (/tender|procurement|rfp|rfq|bid|po\b/.test(text)) return 'Tender / procurement';
  if (/quote|quotation|proposal|offer/.test(text)) return 'Quote / proposal';
  if (/demo|technical|validation|trial|poc/.test(text)) return 'Demo / technical discussion';
  if (/objection|concern|risk|competitor/.test(text)) return 'Objection handling';
  if (/internal|sync|coordinate/.test(text)) return 'Internal coordination';
  if (/crm|admin/.test(text)) return 'Admin / CRM';
  if (/follow|email|send|reply/.test(text)) return 'Follow-up';
  if (/meeting|visit|call|discussion|met/.test(text)) return 'Customer meeting';
  return 'Other';
}

function parseProbability(value) {
  const text = asText(value);
  const percent = text.match(/(\d{1,3})(?:\s*)%/);
  if (percent) return clamp(Number(percent[1]), 0, 100);
  const decimal = text.match(/\b0\.\d+\b/);
  if (decimal) return clamp(Number(decimal[0]) * 100, 0, 100);
  const integer = text.match(/\((\d{1,3})\)/);
  if (integer) return clamp(Number(integer[1]), 0, 100);
  return null;
}

function stripProbability(value) {
  return asText(value).replace(/\(?\s*\d{1,3}\s*%?\s*\)?/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferStage(probability, openValue) {
  const open = asText(openValue).toLowerCase();
  if (/won|closed won|po received/.test(open)) return 'Won';
  if (/lost|closed lost|cancel/.test(open)) return 'Lost';
  if (/hold|pause/.test(open)) return 'On hold';
  if (probability === null) return 'Discovery';
  if (probability >= 80) return 'Negotiation';
  if (probability >= 60) return 'Proposal';
  if (probability >= 40) return 'Qualification';
  if (probability > 0) return 'Discovery';
  return 'Lead';
}

function inferOpportunityStatus(stage, openValue) {
  const open = asText(openValue).toLowerCase();
  if (stage === 'Won' || /won|closed won|po received/.test(open)) return 'Won';
  if (stage === 'Lost' || /lost|closed lost|cancel/.test(open)) return 'Lost';
  if (stage === 'On hold' || /hold|pause/.test(open)) return 'On hold';
  return 'Active';
}

function inferForecastCategory(probability) {
  if (probability === null) return 'Unsupported';
  if (probability >= 70) return 'Defensible';
  if (probability >= 40) return 'Weak but recoverable';
  if (probability > 0) return 'Hope-based';
  return 'Unsupported';
}

function inferDecisionRecommendation(probability, status) {
  if (status === 'Won') return 'Defend';
  if (status === 'Lost') return 'Deprioritize';
  if (probability === null) return 'Monitor';
  if (probability >= 70) return 'Defend';
  if (probability >= 30) return 'Monitor';
  return 'Rescue';
}

function firstQuarterWithValue(values) {
  return Object.entries(values).find(([, value]) => typeof value === 'number' && value !== 0)?.[0] || '';
}

function sumNumbers(values) {
  const total = values.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
  return total || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compactTags(values) {
  return Array.from(new Set(values.map((value) => asText(value).toLowerCase()).filter(Boolean))).slice(0, 12);
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function hashSource(row) {
  const copy = { ...row };
  delete copy.__sourceRow;
  return stableHash(copy);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function addWarnings(plan, sourceFile, sourceSheet, sourceRow, warningCodes) {
  for (const code of warningCodes) {
    plan.warnings.push({ sourceFile, sourceSheet, sourceRow, code });
  }
}

function addRowResult(plan, sourceFile, sourceSheet, sourceRow, targetTable, action, warningCodes = [], sourceHash = null, errorCode = null) {
  plan.rowResults.push({
    source_file: sourceFile,
    source_sheet: sourceSheet,
    source_row: sourceRow,
    target_table: targetTable,
    action,
    warning_codes: warningCodes,
    error_code: errorCode,
    source_hash: sourceHash,
  });
}

function summarizePlan(plan, options) {
  const warningCounts = countBy(plan.warnings, (warning) => warning.code);
  const rowActionCounts = countBy(plan.rowResults, (result) => `${result.target_table}:${result.action}`);
  return {
    dryRun: options.dryRun,
    targetEmail: options.targetEmail,
    scope: 'founder_core_no_pricing',
    parsedAt: new Date().toISOString(),
    sourceFiles: plan.sourceFiles,
    counts: {
      accounts: plan.accounts.length,
      stakeholders: plan.stakeholders.length,
      salesActivities: plan.salesActivities.length,
      opportunities: plan.opportunities.length,
      operatingContext: plan.operatingContext.length,
      rowResults: plan.rowResults.length,
      warnings: plan.warnings.length,
    },
    warningCounts,
    rowActionCounts,
  };
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function printSummary(summary, options) {
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('[founder-import] safe summary');
  console.log(`mode: ${summary.dryRun ? 'dry-run' : 'commit'}`);
  console.log(`target: ${summary.targetEmail}`);
  console.log(`scope: ${summary.scope}`);
  console.log(`source files: ${summary.sourceFiles.join(', ') || 'none'}`);
  console.log(`accounts: ${summary.counts.accounts}`);
  console.log(`stakeholders: ${summary.counts.stakeholders}`);
  console.log(`sales activities: ${summary.counts.salesActivities}`);
  console.log(`opportunities: ${summary.counts.opportunities}`);
  console.log(`operating context: ${summary.counts.operatingContext}`);
  console.log(`warnings: ${summary.counts.warnings}`);
  if (Object.keys(summary.warningCounts).length) {
    console.log(`warning codes: ${JSON.stringify(summary.warningCounts)}`);
  }
  if (summary.commit) {
    console.log(`batch: ${summary.commit.batchId}`);
    console.log(`backup: ${summary.commit.backupPath}`);
    console.log(`committed rows: ${JSON.stringify(summary.commit.committedRows)}`);
  }
}

async function runPreflight(options) {
  const workbookPlan = hasWorkbookInput(options) ? await buildImportPlan(options) : null;
  const expectedSummary = workbookPlan ? summarizePlan(workbookPlan, { ...options, dryRun: true }) : null;
  const env = getEnvReadiness();
  const result = {
    targetEmail: options.targetEmail,
    readyToCommit: false,
    env,
    expected: expectedSummary,
    database: {
      checked: false,
      targetUserFound: false,
      schemaReady: false,
      existingImportCounts: null,
      latestBatch: null,
      reason: '',
    },
  };

  if (!env.supabaseUrlPresent || !env.serviceRolePresent) {
    result.database.reason = 'missing_supabase_url_or_service_role';
    return result;
  }

  const supabase = createAdminClient();
  const userId = await resolveUserIdByEmail(supabase, options.targetEmail);
  const existingImportCounts = await getExistingImportCounts(supabase, userId);
  const latestBatch = await getLatestImportBatch(supabase, userId);
  result.database = {
    checked: true,
    targetUserFound: Boolean(userId),
    schemaReady: true,
    existingImportCounts,
    latestBatch,
    reason: '',
  };
  result.readyToCommit = Boolean(userId && expectedSummary);
  return result;
}

async function verifyImport(options) {
  const env = getEnvReadiness();
  if (!env.supabaseUrlPresent || !env.serviceRolePresent) {
    throw new Error('Verify requires SUPABASE_URL/VITE_SUPABASE_URL and a non-empty SUPABASE_SERVICE_ROLE_KEY.');
  }

  const workbookPlan = hasWorkbookInput(options) ? await buildImportPlan(options) : null;
  const expectedSummary = workbookPlan ? summarizePlan(workbookPlan, { ...options, dryRun: true }) : null;
  const supabase = createAdminClient();
  const userId = await resolveUserIdByEmail(supabase, options.targetEmail);
  const actualCounts = await getExistingImportCounts(supabase, userId);
  const latestBatch = await getLatestImportBatch(supabase, userId);
  const expectedCounts = expectedSummary?.counts || null;
  const countMatches = expectedCounts
    ? {
        accounts: actualCounts.accounts === expectedCounts.accounts,
        stakeholders: actualCounts.stakeholders === expectedCounts.stakeholders,
        salesActivities: actualCounts.salesActivities === expectedCounts.salesActivities,
        opportunities: actualCounts.opportunities === expectedCounts.opportunities,
        operatingContext: actualCounts.operatingContext === expectedCounts.operatingContext,
      }
    : {};
  const countsVerified = expectedCounts ? Object.values(countMatches).every(Boolean) : true;

  return {
    targetEmail: options.targetEmail,
    verified: Boolean(countsVerified && latestBatch?.status === 'completed'),
    expected: expectedSummary,
    actualCounts,
    countMatches,
    latestBatch,
  };
}

function printPreflightSummary(result, options) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('[founder-import] preflight summary');
  console.log(`target: ${result.targetEmail}`);
  console.log(`supabase url present: ${result.env.supabaseUrlPresent}`);
  console.log(`service role present: ${result.env.serviceRolePresent}`);
  if (result.expected) {
    console.log(`expected accounts: ${result.expected.counts.accounts}`);
    console.log(`expected stakeholders: ${result.expected.counts.stakeholders}`);
    console.log(`expected sales activities: ${result.expected.counts.salesActivities}`);
    console.log(`expected opportunities: ${result.expected.counts.opportunities}`);
    console.log(`expected operating context: ${result.expected.counts.operatingContext}`);
    console.log(`expected warnings: ${result.expected.counts.warnings}`);
  }
  console.log(`database checked: ${result.database.checked}`);
  if (result.database.checked) {
    console.log(`target user found: ${result.database.targetUserFound}`);
    console.log(`schema ready: ${result.database.schemaReady}`);
    console.log(`existing import counts: ${JSON.stringify(result.database.existingImportCounts)}`);
    console.log(`latest batch: ${result.database.latestBatch ? `${result.database.latestBatch.id} ${result.database.latestBatch.status}` : 'none'}`);
  } else if (result.database.reason) {
    console.log(`database check skipped: ${result.database.reason}`);
  }
  console.log(`ready to commit: ${result.readyToCommit}`);
}

function printVerifySummary(result, options) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('[founder-import] verify summary');
  console.log(`target: ${result.targetEmail}`);
  console.log(`verified: ${result.verified}`);
  console.log(`actual counts: ${JSON.stringify(result.actualCounts)}`);
  if (result.expected) {
    console.log(`expected counts: ${JSON.stringify(result.expected.counts)}`);
    console.log(`count matches: ${JSON.stringify(result.countMatches)}`);
  }
  console.log(`latest batch: ${result.latestBatch ? `${result.latestBatch.id} ${result.latestBatch.status}` : 'none'}`);
}

async function commitImport(plan, summary, options) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Commit requires SUPABASE_URL/VITE_SUPABASE_URL and a non-empty SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await resolveUserIdByEmail(supabase, options.targetEmail);
  const backupPath = await backupExistingRows(supabase, userId);
  const batch = await createImportBatch(supabase, userId, options.targetEmail, summary);

  try {
    const committedRows = {};
    committedRows.accounts = await upsertRows(supabase, 'accounts', stampRows(plan.accounts, userId, batch.id), 'user_id,source_system,external_source_key');
    committedRows.stakeholders = await upsertRows(supabase, 'stakeholders', stampRows(plan.stakeholders, userId, batch.id), 'user_id,source_system,external_source_key');
    committedRows.salesActivities = await upsertRows(supabase, 'sales_activities', stampRows(plan.salesActivities, userId, batch.id), 'user_id,source_system,external_source_key');
    committedRows.opportunities = await upsertRows(supabase, 'opportunities', stampRows(plan.opportunities, userId, batch.id), 'user_id,source_system,external_source_key');
    committedRows.operatingContext = await upsertRows(supabase, 'operating_context', stampRows(plan.operatingContext, userId, batch.id), 'user_id,source_system,external_source_key');
    await insertRowResults(supabase, stampRowResults(plan.rowResults, userId, batch.id));

    const completedSummary = { ...summary, committedRows };
    const { error } = await supabase
      .from('import_batches')
      .update({
        status: 'completed',
        dry_run: false,
        summary: completedSummary,
        completed_at: new Date().toISOString(),
        committed_at: new Date().toISOString(),
      })
      .eq('id', batch.id)
      .eq('user_id', userId);
    if (error) throw error;

    return { batchId: batch.id, backupPath, committedRows };
  } catch (error) {
    await supabase
      .from('import_batches')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', batch.id)
      .eq('user_id', userId);
    throw error;
  }
}

function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Admin client requires SUPABASE_URL/VITE_SUPABASE_URL and a non-empty SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getEnvReadiness() {
  return {
    supabaseUrlPresent: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

async function getExistingImportCounts(supabase, userId) {
  const [batches, accounts, stakeholders, salesActivities, opportunities, operatingContext] = await Promise.all([
    countRows(supabase, 'import_batches', userId, (query) => query.eq('scope', 'founder_core_no_pricing')),
    countRows(supabase, 'accounts', userId, sourceSystemFilter),
    countRows(supabase, 'stakeholders', userId, sourceSystemFilter),
    countRows(supabase, 'sales_activities', userId, sourceSystemFilter),
    countRows(supabase, 'opportunities', userId, sourceSystemFilter),
    countRows(supabase, 'operating_context', userId, sourceSystemFilter),
  ]);

  return {
    importBatches: batches,
    accounts,
    stakeholders,
    salesActivities,
    opportunities,
    operatingContext,
  };
}

async function getLatestImportBatch(supabase, userId) {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id,status,scope,created_at,completed_at')
    .eq('user_id', userId)
    .eq('scope', 'founder_core_no_pricing')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function countRows(supabase, table, userId, applyFilter = (query) => query) {
  const { count, error } = await applyFilter(
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
  );
  if (error) throw error;
  return count || 0;
}

function sourceSystemFilter(query) {
  return query.eq('source_system', SOURCE_SYSTEM);
}

async function rollbackImport(options) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Rollback requires SUPABASE_URL/VITE_SUPABASE_URL and a non-empty SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!isUuid(options.rollbackBatchId)) {
    throw new Error('Rollback batch id must be a UUID.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await resolveUserIdByEmail(supabase, options.targetEmail);
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .select('id,user_id,status,scope,summary')
    .eq('id', options.rollbackBatchId)
    .eq('user_id', userId)
    .single();
  if (batchError) throw batchError;
  if (!batch) throw new Error('Import batch not found for target user.');
  if (batch.status === 'rolled_back') throw new Error('Import batch is already marked rolled_back.');

  const rolledBackRows = {};
  for (const table of ['operating_context', 'sales_activities', 'stakeholders', 'opportunities', 'accounts']) {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('import_batch_id', options.rollbackBatchId);
    if (error) throw error;
    rolledBackRows[table] = count || 0;
  }

  const rolledBackAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({
      status: 'rolled_back',
      completed_at: rolledBackAt,
      summary: {
        ...(batch.summary || {}),
        rollback: true,
        rolledBackAt,
        rolledBackRows,
      },
    })
    .eq('id', options.rollbackBatchId)
    .eq('user_id', userId);
  if (updateError) throw updateError;

  return {
    batchId: options.rollbackBatchId,
    targetEmail: options.targetEmail,
    rolledBackRows,
  };
}

function printRollbackSummary(result, options) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('[founder-import] rollback summary');
  console.log(`target: ${result.targetEmail}`);
  console.log(`batch: ${result.batchId}`);
  console.log(`rolled back rows: ${JSON.stringify(result.rolledBackRows)}`);
}

async function resolveUserIdByEmail(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 1000) break;
  }
  throw new Error(`Target user not found: ${email}`);
}

async function backupExistingRows(supabase, userId) {
  const backup = { userId, createdAt: new Date().toISOString(), tables: {} };
  for (const table of targetTables) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
    if (error) throw error;
    backup.tables[table] = data || [];
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const fileName = `founder-core-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const backupPath = path.join(BACKUP_DIR, fileName);
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  return backupPath;
}

async function createImportBatch(supabase, userId, targetEmail, summary) {
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      user_id: userId,
      target_email: targetEmail,
      scope: 'founder_core_no_pricing',
      mode: 'commit',
      status: 'running',
      dry_run: false,
      source_files: summary.sourceFiles,
      summary,
      warnings: summary.warningCounts,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

function stampRows(rows, userId, batchId) {
  return rows.map((row) => ({ ...row, user_id: userId, import_batch_id: batchId }));
}

function stampRowResults(rows, userId, batchId) {
  return rows.map((row) => ({ ...row, user_id: userId, batch_id: batchId }));
}

async function upsertRows(supabase, table, rows, onConflict) {
  if (!rows.length) return 0;
  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
  return rows.length;
}

async function insertRowResults(supabase, rows) {
  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from('import_row_results').insert(chunk);
    if (error) throw error;
  }
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function hasWorkbookInput(options) {
  return Boolean(options.accountMaster || options.pipelineForecast || options.operationSystem);
}

async function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawName, ...rawValueParts] = trimmed.split('=');
    const name = rawName.trim();
    if (!name || process.env[name]) continue;
    const value = rawValueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
    process.env[name] = value;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeError(error) {
  if (error instanceof Error) return error.message;
  return 'Unknown import error.';
}
