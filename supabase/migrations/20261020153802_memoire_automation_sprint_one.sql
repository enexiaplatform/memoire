-- Sprint 1 adds configuration and execution receipts, reusing plan_items for work.
-- No external sending, money posting or commercial state change is authorized here.
create schema memoire_automation_private;
revoke all on schema memoire_automation_private from public, anon, authenticated;

create table public.memoire_automation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table public.memoire_automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_date date not null,
  settings_revision bigint not null,
  status text not null check (status in ('running','completed','failed','cancelled')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  unique(user_id,business_date)
);
create index memoire_automation_runs_owner_started on public.memoire_automation_runs(user_id,started_at desc);
alter table public.memoire_automation_settings enable row level security;
alter table public.memoire_automation_runs enable row level security;
create policy automation_settings_owner on public.memoire_automation_settings for select to authenticated
  using ((select auth.uid())=user_id);
create policy automation_runs_owner on public.memoire_automation_runs for select to authenticated
  using ((select auth.uid())=user_id);
revoke all on public.memoire_automation_settings,public.memoire_automation_runs from public,anon,authenticated;
grant select on public.memoire_automation_settings,public.memoire_automation_runs to authenticated,service_role;

create function public.memoire_save_automation_settings(p_config jsonb,p_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); previous public.memoire_automation_settings; saved public.memoire_automation_settings; key text;
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_config) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(p_config) k) is distinct from
    array['commitmentLeadDays','commitmentReminder','dailyBrief','enabled','maxPlanItems','quoteDays','quoteFollowup','runHour','timezone']::text[]
    then raise exception 'invalid_settings'; end if;
  foreach key in array array['enabled','dailyBrief','quoteFollowup','commitmentReminder'] loop
    if jsonb_typeof(p_config->key) is distinct from 'boolean' then raise exception 'invalid_settings'; end if;
  end loop;
  foreach key in array array['runHour','quoteDays','commitmentLeadDays','maxPlanItems'] loop
    if jsonb_typeof(p_config->key) is distinct from 'number' or (p_config->>key)!~'^[0-9]+$'
      then raise exception 'invalid_settings'; end if;
  end loop;
  if (p_config->>'runHour')::integer not between 0 and 23 or (p_config->>'quoteDays')::integer not between 1 and 30
    or (p_config->>'commitmentLeadDays')::integer not between 0 and 7 or (p_config->>'maxPlanItems')::integer not between 1 and 10
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
revoke all on function public.memoire_save_automation_settings(jsonb,bigint) from public,anon;
grant execute on function public.memoire_save_automation_settings(jsonb,bigint) to authenticated;

-- One transactionally consistent source set. Explicit owner predicates apply even
-- when the trusted worker has service authority. Oversized workspaces fail closed.
create function memoire_automation_private.snapshot(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb; value jsonb;
begin
  select jsonb_build_object(
    'opportunities',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.opportunities where user_id=p_owner order by id limit 5001) r),
    'quotes',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.quotes where user_id=p_owner order by id limit 5001) r),
    'commitments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.commercial_commitments where user_id=p_owner order by id limit 5001) r),
    'plans',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.plan_items where user_id=p_owner order by id limit 5001) r),
    'activities',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.sales_activities where user_id=p_owner order by id limit 5001) r),
    'expenses',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.expenses where user_id=p_owner order by id limit 5001) r)
  ) into result;
  for value in select v from jsonb_each(result) x(k,v) loop
    if jsonb_array_length(value)>5000 then raise exception 'snapshot_too_large'; end if;
  end loop;
  if octet_length(result::text)>5000000 then raise exception 'snapshot_too_large'; end if;
  return result;
end $$;
revoke all on function memoire_automation_private.snapshot(uuid) from public,anon,authenticated;

create function public.memoire_preview_automation() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid();
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  return memoire_automation_private.snapshot(owner_id);
end $$;
revoke all on function public.memoire_preview_automation() from public,anon;
grant execute on function public.memoire_preview_automation() to authenticated;

create function public.memoire_claim_automation_run(p_owner uuid,p_revision bigint,p_manual boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare settings public.memoire_automation_settings; job public.memoire_automation_runs; local_now timestamp; day date;
begin
  perform pg_advisory_xact_lock(hashtextextended('memoire-automation:'||p_owner::text,0));
  select * into settings from public.memoire_automation_settings where user_id=p_owner for update;
  if not found or not (settings.config->>'enabled')::boolean or settings.revision<>p_revision then return null; end if;
  local_now:=timezone(settings.config->>'timezone',clock_timestamp()); day:=local_now::date;
  if not p_manual and extract(hour from local_now)<(settings.config->>'runHour')::integer then return null; end if;
  select * into job from public.memoire_automation_runs where user_id=p_owner and business_date=day for update;
  if found then
    if job.status='completed' or (job.status='running' and job.lease_until>clock_timestamp())
      or job.attempts>=3 then return null; end if;
    update public.memoire_automation_runs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
      lease_until=clock_timestamp()+interval '2 minutes',settings_revision=p_revision,started_at=clock_timestamp(),finished_at=null,error_code=null
      where id=job.id returning * into job;
  else
    insert into public.memoire_automation_runs(user_id,business_date,settings_revision,status,lease_until)
      values(p_owner,day,p_revision,'running',clock_timestamp()+interval '2 minutes') returning * into job;
  end if;
  return to_jsonb(job);
end $$;
revoke all on function public.memoire_claim_automation_run(uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.memoire_claim_automation_run(uuid,bigint,boolean) to service_role;

create function public.memoire_read_automation_run(p_run uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.memoire_automation_runs; settings public.memoire_automation_settings; data jsonb;
begin
  select * into job from public.memoire_automation_runs where id=p_run;
  if not found or job.status<>'running' or job.lease_token<>p_lease or job.lease_until<=clock_timestamp() then raise exception 'lease_expired'; end if;
  select * into settings from public.memoire_automation_settings where user_id=job.user_id;
  if not (settings.config->>'enabled')::boolean or settings.revision<>job.settings_revision then raise exception 'settings_changed'; end if;
  data:=memoire_automation_private.snapshot(job.user_id);
  return jsonb_build_object('snapshot',data,'fingerprint',md5(data::text),'config',settings.config,'businessDate',job.business_date);
end $$;
revoke all on function public.memoire_read_automation_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.memoire_read_automation_run(uuid,uuid) to service_role;

create function public.memoire_finish_automation_run(p_run uuid,p_lease uuid,p_fingerprint text,p_candidates jsonb,p_retire_ids jsonb,p_summary jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.memoire_automation_runs; settings public.memoire_automation_settings; data jsonb; item jsonb;
  created_ids jsonb:='[]'; retired_ids jsonb:='[]'; plan_id text; stamp text; saved_id text; actual_day date;
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
  data:=memoire_automation_private.snapshot(job.user_id);
  if md5(data::text) is distinct from p_fingerprint then
    update public.memoire_automation_runs set status='failed',finished_at=clock_timestamp(),error_code='source_changed' where id=p_run;
    return jsonb_build_object('retryable',true,'error','source_changed');
  end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>(settings.config->>'maxPlanItems')::integer
    or jsonb_typeof(p_retire_ids) is distinct from 'array' or jsonb_array_length(p_retire_ids)>100
    or jsonb_typeof(p_summary) is distinct from 'object' or octet_length(p_summary::text)>48000 then raise exception 'invalid_work'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for item in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'rule' is null
      or item->>'rule' not in ('quote-followup','commitment-reminder') or length(coalesce(item->>'key','')) not between 1 and 500
      or length(coalesce(item->>'label','')) not between 1 and 450 or item->>'date' is distinct from job.business_date::text
      or (item->>'rule'='quote-followup' and not (settings.config->>'quoteFollowup')::boolean)
      or (item->>'rule'='commitment-reminder' and not (settings.config->>'commitmentReminder')::boolean)
      then raise exception 'invalid_work'; end if;
    if item->>'rule'='quote-followup' and not exists(select 1 from public.quotes where user_id=job.user_id and id=item->>'sourceId')
      or item->>'rule'='commitment-reminder' and not exists(select 1 from public.commercial_commitments where user_id=job.user_id and id=item->>'sourceId')
      then raise exception 'invalid_source'; end if;
    plan_id:='auto-'||encode(sha256(convert_to(item->>'key','UTF8')),'hex'); saved_id:=null;
    insert into public.plan_items(user_id,id,payload) values(job.user_id,plan_id,jsonb_build_object(
      'id',plan_id,'date',job.business_date::text,'label',item->>'label','tag','Auto · '||coalesce(item->>'accountName',''),
      'done',false,'linkedOpportunityId',nullif(item->>'opportunityId',''),'linkedAccountName',item->>'accountName',
      'source','user','isSample',false,'suggestionKey','automation:'||(item->>'key'),'createdAt',stamp,'updatedAt',stamp,
      'automation',jsonb_build_object('key',item->>'key','rule',item->>'rule','sourceId',item->>'sourceId','dueDate',item->>'dueDate','runId',p_run)
    )) on conflict(user_id,id) do nothing returning id into saved_id;
    if saved_id is not null then created_ids:=created_ids||to_jsonb(saved_id); end if;
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
  p_summary:=p_summary||jsonb_build_object('createdPlanIds',created_ids,'retiredPlanIds',retired_ids,'asOf',stamp,'businessDate',job.business_date);
  update public.memoire_automation_runs set status='completed',finished_at=clock_timestamp(),summary=p_summary,error_code=null where id=p_run;
  return p_summary;
end $$;
revoke all on function public.memoire_finish_automation_run(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.memoire_finish_automation_run(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

create function public.memoire_fail_automation_run(p_run uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.memoire_automation_runs set status='failed',finished_at=clock_timestamp(),error_code='worker_unavailable'
    where id=p_run and lease_token=p_lease and status='running';
  return found;
end $$;
revoke all on function public.memoire_fail_automation_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.memoire_fail_automation_run(uuid,uuid) to service_role;
