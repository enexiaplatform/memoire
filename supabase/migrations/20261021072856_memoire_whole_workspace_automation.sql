-- Owner-opted preparation across existing destinations. No messages, payments,
-- qualification, merges, completed work or standing permissions are replayed.
alter table public.memoire_automation_runs add column run_key text not null default 'daily' check(length(run_key) between 1 and 80);
alter table public.memoire_automation_runs drop constraint memoire_automation_runs_user_id_business_date_key;
alter table public.memoire_automation_runs add unique(user_id,business_date,run_key);
create table public.memoire_automation_outputs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null, kind text not null, title text not null, href text not null, period text not null,
  payload jsonb not null, source_fingerprint text not null, settings_revision bigint not null,
  run_id uuid references public.memoire_automation_runs(id) on delete cascade,
  prepared_at timestamptz not null default now(), primary key(user_id,id),
  check(octet_length(payload::text)<=2000000)
);
create index memoire_automation_outputs_recent on public.memoire_automation_outputs(user_id,prepared_at desc);
alter table public.memoire_automation_outputs enable row level security;
create policy automation_outputs_owner on public.memoire_automation_outputs for select to authenticated using((select auth.uid())=user_id);
revoke all on public.memoire_automation_outputs from public,anon,authenticated;
grant select on public.memoire_automation_outputs to authenticated,service_role;

create or replace function public.memoire_save_automation_settings(p_config jsonb,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); previous public.memoire_automation_settings; saved public.memoire_automation_settings; key text;
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_config) k)=array['commitmentLeadDays', 'commitmentReminder', 'dailyBrief', 'enabled', 'maxPlanItems', 'quoteDays', 'quoteFollowup', 'runHour', 'timezone']::text[] then
    p_config:='{"continuous":false,"collectionReminder":false,"collectionLeadDays":7,"supplierReminder":false,"supplierLeadDays":7,"leadFollowup":false,"orderReminder":false,"opportunityReminder":false,"weeklyReview":false,"preparedOutputs":false,"savedReports":false,"savedDashboards":false}'::jsonb||p_config;
  end if;
  if jsonb_typeof(p_config) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(p_config) k) is distinct from
    array['collectionLeadDays','collectionReminder','commitmentLeadDays','commitmentReminder','continuous','dailyBrief','enabled','leadFollowup','maxPlanItems','opportunityReminder','orderReminder','preparedOutputs','quoteDays','quoteFollowup','runHour','savedDashboards','savedReports','supplierLeadDays','supplierReminder','timezone','weeklyReview']::text[]
    then raise exception 'invalid_settings'; end if;
  foreach key in array array['enabled','dailyBrief','quoteFollowup','commitmentReminder','continuous','collectionReminder','supplierReminder','leadFollowup','orderReminder','opportunityReminder','weeklyReview','preparedOutputs','savedReports','savedDashboards'] loop
    if jsonb_typeof(p_config->key) is distinct from 'boolean' then raise exception 'invalid_settings'; end if;
  end loop;
  foreach key in array array['runHour','quoteDays','commitmentLeadDays','maxPlanItems','collectionLeadDays','supplierLeadDays'] loop
    if jsonb_typeof(p_config->key) is distinct from 'number' or (p_config->>key)!~'^[0-9]+$'
      then raise exception 'invalid_settings'; end if;
  end loop;
  if (p_config->>'runHour')::integer not between 0 and 23 or (p_config->>'quoteDays')::integer not between 1 and 30
    or (p_config->>'commitmentLeadDays')::integer not between 0 and 7 or (p_config->>'maxPlanItems')::integer not between 1 and 10
    or (p_config->>'collectionLeadDays')::integer not between 0 and 30 or (p_config->>'supplierLeadDays')::integer not between 0 and 30
    or jsonb_typeof(p_config->'timezone') is distinct from 'string'
    or length(p_config->>'timezone')>80
    or not exists(select 1 from pg_timezone_names where name=p_config->>'timezone') then raise exception 'invalid_settings'; end if;
  perform pg_advisory_xact_lock(hashtextextended('memoire-automation:'||owner_id::text,0));
  select * into previous from public.memoire_automation_settings where user_id=owner_id for update;
  if coalesce(previous.revision,0) is distinct from p_revision then raise exception 'settings_changed'; end if;
  insert into public.memoire_automation_settings(user_id,config,revision) values(owner_id,p_config,1)
  on conflict(user_id) do update set config=excluded.config,revision=memoire_automation_settings.revision+1,updated_at=clock_timestamp()
  returning * into saved;
  return to_jsonb(saved);
end $$;

create or replace function memoire_automation_private.snapshot(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb; value jsonb;
begin
  select jsonb_build_object(
    'opportunities',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.opportunities where user_id=p_owner order by id limit 5001) r),
    'quotes',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.quotes where user_id=p_owner order by id limit 5001) r),
    'commitments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.commercial_commitments where user_id=p_owner order by id limit 5001) r),
    'plans',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.plan_items where user_id=p_owner order by id limit 5001) r),
    'activities',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.sales_activities where user_id=p_owner order by id limit 5001) r),
    'expenses',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.expenses where user_id=p_owner order by id limit 5001) r),
    'supplierCommitments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.supplier_commitments where user_id=p_owner order by id limit 5001) r),
    'receivables',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.order_receivables where user_id=p_owner order by id limit 5001) r),
    'milestones',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.order_milestones where user_id=p_owner order by id limit 5001) r),
    'costs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.order_costs where user_id=p_owner order by id limit 5001) r),
    'outcomes',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.opportunity_outcomes where user_id=p_owner order by id limit 5001) r),
    'accounts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.accounts where user_id=p_owner order by id limit 5001) r),
    'stakeholders',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.stakeholders where user_id=p_owner order by id limit 5001) r),
    'objections',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.objections where user_id=p_owner order by id limit 5001) r),
    'portfolio',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.portfolio_records where user_id=p_owner order by id limit 5001) r),
    'reports',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.report_definitions where user_id=p_owner order by id limit 5001) r),
    'dashboards',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.dashboard_definitions where user_id=p_owner order by id limit 5001) r),
    'weeklyCommitments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.weekly_commitments where user_id=p_owner order by id limit 5001) r),
    'reviewPacks',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.review_packs where user_id=p_owner order by id limit 5001) r),
    'knowledge',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.knowledge_notes where user_id=p_owner order by id limit 5001) r),
    'assets',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.sales_assets where user_id=p_owner order by id limit 5001) r),
    'importBatches',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.import_batches where user_id=p_owner order by id limit 5001) r),
    'importRows',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.import_row_results where user_id=p_owner order by id limit 5001) r),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select id,reporting_currency,target_margin_pct from public.user_profiles where id=p_owner order by id limit 5001) r),
    'captures',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select id,user_id,raw_text,status,captured_at,created_at from public.captures where user_id=p_owner order by id limit 5001) r),
    'threads',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.commercial_threads where user_id=p_owner order by id limit 5001) r)
  ) into result;
  for value in select v from jsonb_each(result) x(k,v) loop
    if jsonb_array_length(value)>5000 then raise exception 'snapshot_too_large'; end if;
  end loop;
  if octet_length(result::text)>5000000 then raise exception 'snapshot_too_large'; end if;
  return result;
end $$;

create or replace function public.memoire_claim_automation_run(p_owner uuid,p_revision bigint,p_manual boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare settings public.memoire_automation_settings; job public.memoire_automation_runs; local_now timestamp; day date; cycle_key text;
begin
  perform pg_advisory_xact_lock(hashtextextended('memoire-automation:'||p_owner::text,0));
  select * into settings from public.memoire_automation_settings where user_id=p_owner for update;
  if not found or not (settings.config->>'enabled')::boolean or settings.revision<>p_revision then return null; end if;
  local_now:=timezone(settings.config->>'timezone',clock_timestamp()); day:=local_now::date;
  if not p_manual and extract(hour from local_now)<(settings.config->>'runHour')::integer then return null; end if;
  cycle_key:=case when coalesce((settings.config->>'continuous')::boolean,false)
    then to_char(clock_timestamp() at time zone 'UTC','YYYYMMDDHH24')||':'||floor(extract(minute from clock_timestamp() at time zone 'UTC')/15)::text
    else 'daily' end;
  if exists(select 1 from public.memoire_automation_runs where user_id=p_owner and status='running' and lease_until>clock_timestamp()) then return null; end if;
  select * into job from public.memoire_automation_runs where user_id=p_owner and business_date=day and run_key=cycle_key for update;
  if found then
    if job.status='completed' or (job.status='running' and job.lease_until>clock_timestamp())
      or job.attempts>=3 then return null; end if;
    update public.memoire_automation_runs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
      lease_until=clock_timestamp()+interval '2 minutes',settings_revision=p_revision,started_at=clock_timestamp(),finished_at=null,error_code=null
      where id=job.id returning * into job;
  else
    insert into public.memoire_automation_runs(user_id,business_date,settings_revision,status,lease_until,run_key)
      values(p_owner,day,p_revision,'running',clock_timestamp()+interval '2 minutes',cycle_key) returning * into job;
  end if;
  return to_jsonb(job);
end $$;

create or replace function public.memoire_finish_automation_run(p_run uuid,p_lease uuid,p_fingerprint text,p_candidates jsonb,p_retire_ids jsonb,p_summary jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.memoire_automation_runs; settings public.memoire_automation_settings; data jsonb; item jsonb;
  created_ids jsonb:='[]'; retired_ids jsonb:='[]'; plan_id text; stamp text; saved_id text; actual_day date; remaining integer; used integer; rule_setting text; source_table text; source_valid boolean;
begin
  select * into job from public.memoire_automation_runs where id=p_run;
  if not found then raise exception 'run_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('memoire-automation:'||job.user_id::text,0));
  select * into job from public.memoire_automation_runs where id=p_run for update;
  if job.status='completed' and job.lease_token=p_lease then return job.summary; end if;
  if job.status<>'running' or job.lease_token<>p_lease or job.lease_until<=clock_timestamp() then raise exception 'lease_expired'; end if;
  select * into settings from public.memoire_automation_settings where user_id=job.user_id for update;
  actual_day:=timezone(settings.config->>'timezone',clock_timestamp())::date;
  if not (settings.config->>'enabled')::boolean or settings.revision<>job.settings_revision or actual_day<>job.business_date then
    update public.memoire_automation_runs set status='cancelled',finished_at=clock_timestamp(),error_code='settings_or_date_changed' where id=p_run;
    return jsonb_build_object('cancelled',true);
  end if;
  -- Stabilize rows against concurrent edits while comparing and applying. Inserts
  -- after this snapshot are independent new facts, never overwritten by this run.
  perform 1 from public.opportunities where user_id=job.user_id for share;
  perform 1 from public.quotes where user_id=job.user_id for share;
  perform 1 from public.commercial_commitments where user_id=job.user_id for share;
  perform 1 from public.plan_items where user_id=job.user_id for update;
  perform 1 from public.sales_activities where user_id=job.user_id for share;
  perform 1 from public.expenses where user_id=job.user_id for share;
  perform 1 from public.supplier_commitments where user_id=job.user_id for share;
  perform 1 from public.order_receivables where user_id=job.user_id for share;
  perform 1 from public.order_milestones where user_id=job.user_id for share;
  perform 1 from public.order_costs where user_id=job.user_id for share;
  perform 1 from public.opportunity_outcomes where user_id=job.user_id for share;
  perform 1 from public.accounts where user_id=job.user_id for share;
  perform 1 from public.stakeholders where user_id=job.user_id for share;
  perform 1 from public.objections where user_id=job.user_id for share;
  perform 1 from public.portfolio_records where user_id=job.user_id for share;
  perform 1 from public.report_definitions where user_id=job.user_id for share;
  perform 1 from public.dashboard_definitions where user_id=job.user_id for share;
  perform 1 from public.weekly_commitments where user_id=job.user_id for share;
  perform 1 from public.review_packs where user_id=job.user_id for share;
  perform 1 from public.knowledge_notes where user_id=job.user_id for share;
  perform 1 from public.sales_assets where user_id=job.user_id for share;
  perform 1 from public.import_batches where user_id=job.user_id for share;
  perform 1 from public.import_row_results where user_id=job.user_id for share;
  perform 1 from public.user_profiles where id=job.user_id for share;
  perform 1 from public.captures where user_id=job.user_id for share;
  perform 1 from public.commercial_threads where user_id=job.user_id for share;
  data:=memoire_automation_private.snapshot(job.user_id);
  if md5(data::text) is distinct from p_fingerprint then
    update public.memoire_automation_runs set status='failed',finished_at=clock_timestamp(),error_code='source_changed' where id=p_run;
    return jsonb_build_object('retryable',true,'error','source_changed');
  end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>(settings.config->>'maxPlanItems')::integer
    or jsonb_typeof(p_retire_ids) is distinct from 'array' or jsonb_array_length(p_retire_ids)>100
    or jsonb_typeof(p_summary) is distinct from 'object' or octet_length(p_summary::text)>48000 then raise exception 'invalid_work'; end if;
  select coalesce(sum(jsonb_array_length(coalesce(summary->'createdPlanIds','[]'::jsonb))),0)::integer into used
    from public.memoire_automation_runs where user_id=job.user_id and business_date=job.business_date and status='completed';
  remaining:=greatest(0,(settings.config->>'maxPlanItems')::integer-used);
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for item in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'rule' is null
      or item->>'rule' not in ('quote-followup','commitment-reminder','collection-reminder','supplier-reminder','lead-followup','order-reminder','opportunity-reminder') or length(coalesce(item->>'key','')) not between 1 and 500
      or length(coalesce(item->>'label','')) not between 1 and 450 or item->>'date' is distinct from job.business_date::text
      or (item->>'rule'='quote-followup' and not (settings.config->>'quoteFollowup')::boolean)
      or (item->>'rule'='commitment-reminder' and not (settings.config->>'commitmentReminder')::boolean)
      then raise exception 'invalid_work'; end if;
    select setting,source into rule_setting,source_table from (values
      ('quote-followup','quoteFollowup','quotes'),('commitment-reminder','commitmentReminder','commercial_commitments'),
      ('collection-reminder','collectionReminder','opportunities'),('supplier-reminder','supplierReminder','supplier_commitments'),
      ('lead-followup','leadFollowup','opportunities'),('order-reminder','orderReminder','opportunities'),
      ('opportunity-reminder','opportunityReminder','opportunities')) rules(rule,setting,source) where rule=item->>'rule';
    if not coalesce((settings.config->>rule_setting)::boolean,false) then raise exception 'rule_not_enabled'; end if;
    execute format('select exists(select 1 from public.%I where user_id=$1 and id=$2)',source_table)
      into source_valid using job.user_id,item->>'sourceId';
    if not source_valid then raise exception 'invalid_source'; end if;
    if remaining<=0 then continue; end if;
    plan_id:='auto-'||encode(sha256(convert_to(item->>'key','UTF8')),'hex'); saved_id:=null;
    insert into public.plan_items(user_id,id,payload) values(job.user_id,plan_id,jsonb_build_object(
      'id',plan_id,'date',job.business_date::text,'label',item->>'label','tag','Auto · '||coalesce(item->>'accountName',''),
      'done',false,'linkedOpportunityId',nullif(item->>'opportunityId',''),'linkedAccountName',item->>'accountName',
      'source','user','isSample',false,'suggestionKey','automation:'||(item->>'key'),'createdAt',stamp,'updatedAt',stamp,
      'automation',jsonb_build_object('key',item->>'key','rule',item->>'rule','sourceId',item->>'sourceId','subjectKey',item->>'subjectKey','dueDate',item->>'dueDate','runId',p_run)
    )) on conflict(user_id,id) do nothing returning id into saved_id;
    if saved_id is not null then created_ids:=created_ids||to_jsonb(saved_id); remaining:=remaining-1; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_retire_ids) loop
    saved_id:=null;
    update public.plan_items set payload=payload||jsonb_build_object('dismissed',true,'updatedAt',stamp),updated_at=clock_timestamp()
      where user_id=job.user_id and id=(item#>>'{}') and payload->'automation'->>'runId' is not null
      and payload->>'createdAt'=payload->>'updatedAt' and coalesce((payload->>'done')::boolean,false)=false
      and coalesce((payload->>'dismissed')::boolean,false)=false and coalesce((payload->>'__deleted')::boolean,false)=false
      returning id into saved_id;
    if saved_id is not null then retired_ids:=retired_ids||to_jsonb(saved_id); end if;
  end loop;
  p_summary:=p_summary||jsonb_build_object('createdPlanIds',created_ids,'retiredPlanIds',retired_ids,'asOf',stamp,'businessDate',job.business_date,'dailyLimit', (settings.config->>'maxPlanItems')::integer,'dailyCreated',used+jsonb_array_length(created_ids),'dailyCapDeferred',greatest(0,jsonb_array_length(p_candidates)-jsonb_array_length(created_ids)));
  update public.memoire_automation_runs set status='completed',finished_at=clock_timestamp(),summary=p_summary,error_code=null where id=p_run;
  return p_summary;
end $$;

-- Output commit shares the work transaction. A failed output write rolls back
-- Plan changes and the receipt; uncertain acknowledgements stay idempotent.
create function public.memoire_finish_automation_cycle(p_run uuid,p_lease uuid,p_fingerprint text,p_candidates jsonb,p_retire_ids jsonb,p_summary jsonb,p_outputs jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.memoire_automation_runs; result jsonb; item jsonb; setting text;
begin
  select * into job from public.memoire_automation_runs where id=p_run;
  if not found then raise exception 'run_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('memoire-automation:'||job.user_id::text,0));
  select * into job from public.memoire_automation_runs where id=p_run for update;
  if job.status='completed' and job.lease_token=p_lease then return job.summary; end if;
  if jsonb_typeof(p_outputs) is distinct from 'array' or jsonb_array_length(p_outputs)>100
    or octet_length(p_outputs::text)>2200000 then raise exception 'invalid_outputs'; end if;
  result:=public.memoire_finish_automation_run(p_run,p_lease,p_fingerprint,p_candidates,p_retire_ids,p_summary);
  if result ? 'cancelled' or result ? 'retryable' then return result; end if;
  for item in select value from jsonb_array_elements(p_outputs) loop
    setting:=case item->>'kind' when 'weekly-review' then 'weeklyReview' when 'saved-report' then 'savedReports'
      when 'saved-dashboard' then 'savedDashboards'
      when 'capture-review' then 'preparedOutputs' when 'plan-review' then 'preparedOutputs'
      when 'account-briefs' then 'preparedOutputs' when 'margin-review' then 'preparedOutputs'
      when 'portfolio-review' then 'preparedOutputs' when 'knowledge-review' then 'preparedOutputs'
      when 'data-quality' then 'preparedOutputs' when 'cloud-health' then 'preparedOutputs' else null end;
    if setting is null or not exists(select 1 from public.memoire_automation_settings where user_id=job.user_id and coalesce((config->>setting)::boolean,false))
      or length(coalesce(item->>'key','')) not between 1 and 500 or length(coalesce(item->>'title','')) not between 1 and 450
      or (item->>'href') not like '/app/%' or jsonb_typeof(item->'payload') is distinct from 'object'
      or length(coalesce(item->>'period','')) not between 1 and 250 then raise exception 'invalid_output'; end if;
    insert into public.memoire_automation_outputs(user_id,id,kind,title,href,period,payload,source_fingerprint,settings_revision,run_id,prepared_at)
      values(job.user_id,item->>'key',item->>'kind',item->>'title',item->>'href',item->>'period',item->'payload',p_fingerprint,job.settings_revision,p_run,clock_timestamp())
      on conflict(user_id,id) do update set payload=excluded.payload,title=excluded.title,href=excluded.href,
        source_fingerprint=excluded.source_fingerprint,settings_revision=excluded.settings_revision,run_id=p_run,prepared_at=clock_timestamp();
  end loop;
  return result;
end $$;
revoke all on function public.memoire_finish_automation_cycle(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.memoire_finish_automation_cycle(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb) to service_role;

create or replace function public.memoire_read_automation_run(p_run uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.memoire_automation_runs; settings public.memoire_automation_settings; data jsonb;
begin
  select * into job from public.memoire_automation_runs where id=p_run;
  if not found or job.status<>'running' or job.lease_token<>p_lease or job.lease_until<=clock_timestamp() then raise exception 'lease_expired'; end if;
  select * into settings from public.memoire_automation_settings where user_id=job.user_id;
  if not (settings.config->>'enabled')::boolean or settings.revision<>job.settings_revision then raise exception 'settings_changed'; end if;
  data:=memoire_automation_private.snapshot(job.user_id);
  return jsonb_build_object('snapshot',data,'fingerprint',md5(data::text),'config',settings.config,'businessDate',job.business_date,'capturedAt',clock_timestamp());
end $$;
