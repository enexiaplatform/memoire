-- Canonical opportunity identities are UUIDs while JSON collection identities are text.
-- Compare their textual identity under the explicit owner predicate in both cases.
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
    execute format('select exists(select 1 from public.%I where user_id=$1 and id::text=$2)',source_table)
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
