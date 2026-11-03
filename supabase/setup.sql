-- =====================================================================
-- Montaud — installation Supabase (à coller dans SQL Editor → Run)
-- Le script peut être relancé sans risque.
-- =====================================================================

-- 1. Les personnes autorisées (remplace les adresses ci-dessous !)
create table if not exists public.members (
  email text primary key
);
insert into public.members (email) values
  ('ton.adresse@exemple.fr'),
  ('adresse.de.ta.femme@exemple.fr')
on conflict do nothing;

-- 2. Les données : une ligne par catégorie / rubrique / événement / dépense / pièce jointe
create table if not exists public.items (
  id uuid primary key,
  collection text not null
    check (collection in ('categories', 'events', 'occurrences', 'purchases', 'attachments')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text default (auth.jwt() ->> 'email')
);

create or replace function public.touch_item() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.jwt() ->> 'email';
  return new;
end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items for each row execute function public.touch_item();

-- 3. « Suis-je membre ? »
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
grant execute on function public.is_member() to authenticated;

-- 4. Sécurité : seuls les membres connectés lisent et écrivent
alter table public.members enable row level security;
alter table public.items enable row level security;

drop policy if exists "membres lisent la liste" on public.members;
create policy "membres lisent la liste" on public.members for select to authenticated using (public.is_member());

drop policy if exists "membres lisent" on public.items;
drop policy if exists "membres ajoutent" on public.items;
drop policy if exists "membres modifient" on public.items;
drop policy if exists "membres suppriment" on public.items;
create policy "membres lisent" on public.items for select to authenticated using (public.is_member());
create policy "membres ajoutent" on public.items for insert to authenticated with check (public.is_member());
create policy "membres modifient" on public.items for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "membres suppriment" on public.items for delete to authenticated using (public.is_member());

-- 5. Mises à jour en direct (ce que l'un ajoute apparaît chez l'autre)
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

-- 6. Photos et documents : stockage privé « files »
insert into storage.buckets (id, name, public) values ('files', 'files', false)
on conflict (id) do nothing;

drop policy if exists "montaud fichiers lecture" on storage.objects;
drop policy if exists "montaud fichiers ajout" on storage.objects;
drop policy if exists "montaud fichiers modif" on storage.objects;
drop policy if exists "montaud fichiers suppression" on storage.objects;
create policy "montaud fichiers lecture" on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.is_member());
create policy "montaud fichiers ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.is_member());
create policy "montaud fichiers modif" on storage.objects for update to authenticated
  using (bucket_id = 'files' and public.is_member()) with check (bucket_id = 'files' and public.is_member());
create policy "montaud fichiers suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.is_member());
