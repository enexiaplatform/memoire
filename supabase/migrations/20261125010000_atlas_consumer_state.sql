-- Per-owner progress. Checkpoints and reference metadata never authorize display.
create table memoire_private.atlas_receiver_keys(owner_id uuid,atlas_org uuid,atlas_workspace uuid,principal uuid,key_hash bytea not null,primary key(owner_id,atlas_org,atlas_workspace,principal));
revoke all on memoire_private.atlas_receiver_keys from public,anon,authenticated;
create table public.memoire_atlas_progress (
 owner_id uuid not null, atlas_org uuid not null, atlas_workspace uuid not null, principal uuid not null,
 checkpoint bigint not null default 0, last_success timestamptz, failures integer not null default 0,
 failed_seq bigint, retry_at timestamptz, primary key(owner_id,atlas_org,atlas_workspace,principal)
);
alter table public.memoire_atlas_progress enable row level security;
revoke all on public.memoire_atlas_progress from public, anon, authenticated;

create function public.memoire_atlas_progress_op(p_org uuid,p_workspace uuid,p_principal uuid,p_action text,p_key text,
 p_expected bigint default 0,p_seq bigint default 0,p_asset uuid default null,p_version integer default null,p_event uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_owner uuid:=public.memoire_active_data_owner(); s public.memoire_atlas_progress;
begin
 if current_owner is null or not exists(select 1 from memoire_private.atlas_receiver_keys
 where (owner_id,atlas_org,atlas_workspace,principal)=(current_owner,p_org,p_workspace,p_principal)
 and key_hash=sha256(convert_to(p_key,'UTF8'))) then raise insufficient_privilege; end if;
 insert into public.memoire_atlas_progress(owner_id,atlas_org,atlas_workspace,principal)
 values(current_owner,p_org,p_workspace,p_principal) on conflict do nothing;
 select * into strict s from public.memoire_atlas_progress where
 (owner_id,atlas_org,atlas_workspace,principal)=(current_owner,p_org,p_workspace,p_principal) for update;
 if p_action='pin' then
  perform public.memoire_pin_atlas_reference(p_org,p_workspace,p_asset,p_version,null);
 elsif p_action='event' then
  if s.checkpoint<>p_expected or p_seq<=p_expected or p_event is null or p_asset is null then raise serialization_failure; end if;
  perform public.memoire_pin_atlas_reference(p_org,p_workspace,p_asset,p_version,p_event);
  s.checkpoint:=p_seq;
 elsif p_action='failure' and s.checkpoint=p_expected then
  s.failed_seq:=nullif(p_seq,0);
  s.failures:=least(s.failures+1,10);
  s.retry_at:=now()+make_interval(secs=>least(300,2^(s.failures-1))::int);
 elsif p_action='success' and s.checkpoint=p_expected then
  s.failed_seq:=null; s.last_success:=now(); s.failures:=0; s.retry_at:=null;
 elsif p_action not in ('read','success','failure') then raise invalid_parameter_value;
 end if;
 if p_action<>'read' then
 update public.memoire_atlas_progress set failed_seq=s.failed_seq,checkpoint=s.checkpoint,last_success=s.last_success,failures=s.failures,retry_at=s.retry_at
 where (owner_id,atlas_org,atlas_workspace,principal)=(current_owner,p_org,p_workspace,p_principal);
 end if;
 return jsonb_build_object('checkpoint',s.checkpoint::text,'last_success',s.last_success,'failed_event_seq',s.failed_seq::text,'retry_count',s.failures,'retry_at',s.retry_at);
end$$;
revoke all on function public.memoire_atlas_progress_op(uuid,uuid,uuid,text,text,bigint,bigint,uuid,integer,uuid) from public,anon;
revoke execute on function public.memoire_pin_atlas_reference(uuid,uuid,uuid,integer,uuid) from authenticated;
grant execute on function public.memoire_atlas_progress_op(uuid,uuid,uuid,text,text,bigint,bigint,uuid,integer,uuid) to authenticated;
