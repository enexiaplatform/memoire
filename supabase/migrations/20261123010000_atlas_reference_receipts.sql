-- Private, owner-scoped reference pins. No commercial table is modified.
create table public.memoire_atlas_pins(
 owner_id uuid not null, atlas_org uuid not null, atlas_workspace uuid not null, asset_id uuid not null,
 version integer not null check(version>0),primary key(owner_id,atlas_org,atlas_workspace,asset_id));
create table public.memoire_atlas_receipts(
 owner_id uuid not null, atlas_org uuid not null, atlas_workspace uuid not null,event_id uuid not null,
 primary key(owner_id,atlas_org,atlas_workspace,event_id));
alter table public.memoire_atlas_pins enable row level security;
alter table public.memoire_atlas_receipts enable row level security;
revoke all on public.memoire_atlas_pins,public.memoire_atlas_receipts from public,anon,authenticated;
grant select on public.memoire_atlas_pins to authenticated;
create policy read_current_owner on public.memoire_atlas_pins for select to authenticated using(owner_id=(select public.memoire_active_data_owner()));
-- Receipts and pins are hints. Every presentation requires a fresh Atlas authorization.
create function public.memoire_pin_atlas_reference(p_org uuid,p_workspace uuid,p_asset uuid,p_version integer,p_event uuid)
returns void language plpgsql security definer set search_path='' as $$
declare active_owner uuid:=public.memoire_active_data_owner();
begin
 if auth.uid() is null or active_owner is null then raise insufficient_privilege;end if;
 if p_event is not null then
 insert into public.memoire_atlas_receipts values(active_owner,p_org,p_workspace,p_event) on conflict do nothing;
 if not found then return;end if;
 end if;
 insert into public.memoire_atlas_pins values(active_owner,p_org,p_workspace,p_asset,p_version)
 on conflict(owner_id,atlas_org,atlas_workspace,asset_id) do update set version=greatest(memoire_atlas_pins.version,excluded.version);
end$$;
revoke all on function public.memoire_pin_atlas_reference(uuid,uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.memoire_pin_atlas_reference(uuid,uuid,uuid,integer,uuid) to authenticated;
