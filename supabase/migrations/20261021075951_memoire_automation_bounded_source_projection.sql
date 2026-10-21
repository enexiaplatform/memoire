-- Project only preparation fields. Imported provenance and private contact details
-- are not preparation inputs; owner predicates, source timestamps and bounds remain.
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
    'accounts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select id,user_id,name,account_name,strategy,next_follow_up,status,created_at,updated_at from public.accounts where user_id=p_owner order by id limit 5001) r),
    'stakeholders',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select id,user_id,account_id,opportunity_id,name,role_title,stakeholder_role,influence_level,stance,last_interaction_date,created_at,updated_at from public.stakeholders where user_id=p_owner order by id limit 5001) r),
    'objections',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.objections where user_id=p_owner order by id limit 5001) r),
    'portfolio',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.portfolio_records where user_id=p_owner order by id limit 5001) r),
    'reports',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.report_definitions where user_id=p_owner order by id limit 5001) r),
    'dashboards',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.dashboard_definitions where user_id=p_owner order by id limit 5001) r),
    'weeklyCommitments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.weekly_commitments where user_id=p_owner order by id limit 5001) r),
    'reviewPacks',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.review_packs where user_id=p_owner order by id limit 5001) r),
    'knowledge',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.knowledge_notes where user_id=p_owner order by id limit 5001) r),
    'assets',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.sales_assets where user_id=p_owner order by id limit 5001) r),
    'importBatches',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select * from public.import_batches where user_id=p_owner order by id limit 5001) r),
    'importRows',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from (select id,user_id,batch_id,target_table,action,warning_codes,error_code,source_file,source_sheet,source_row,created_at from public.import_row_results where user_id=p_owner order by id limit 5001) r),
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
