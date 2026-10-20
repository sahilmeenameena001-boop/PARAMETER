-- Professional Authority Intelligence — additive migration (no existing table is altered or dropped).
-- Depends on: public.organization_members and public.set_updated_at() from 20260910_brand_transformation.sql.
-- Review before running. Do not run against production without authorisation and a backup.

create extension if not exists pgcrypto;

create type public.pi_role as enum ('viewer','editor','legal_reviewer','admin');
create type public.pi_source_tier as enum ('A','B','C','D');
create type public.pi_source_status as enum ('unreviewed','verified','contradicted','inaccessible','stale');
create type public.pi_claim_status as enum ('unverified','verified','disputed','rejected');
create type public.pi_confidence as enum ('low','medium','high');
create type public.pi_visibility as enum ('restricted','internal','public');
create type public.pi_case_status as enum ('pending','disposed','unknown');
create type public.pi_extraction_status as enum ('not_started','extracted','manual','failed','inaccessible');
create type public.pi_outcome as enum ('allowed','partly_allowed','dismissed','withdrawn','settled','remanded','infructuous','procedural_disposal','interim_direction','adjourned','other');
create type public.pi_disposal_nature as enum ('procedural','merits','undetermined');
create type public.pi_content_status as enum ('idea','research_needed','draft','legal_review','approved','scheduled','published','rejected');

-- Roles per organisation (organization_members has no role column; this table adds one without altering it).
create table public.pi_member_roles (
  organization_id uuid not null, user_id uuid not null, role public.pi_role not null default 'viewer',
  created_at timestamptz not null default now(), primary key (organization_id, user_id)
);

create table public.pi_professionals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  slug text not null, display_name text not null, profession text not null default '',
  is_example boolean not null default false, last_checked_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.pi_source_evidence (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  url text not null check (url ~* '^https?://'), title text not null, publisher text not null default '',
  source_type text not null check (source_type in ('court_order','court_record','official_directory','institutional_record','publisher_page','professional_org','firm_page','self_published_profile','third_party_directory','secondary_reporting','other')),
  tier public.pi_source_tier not null, published_at date, accessed_at timestamptz,
  status public.pi_source_status not null default 'unreviewed', excerpt text not null default '',
  verification_method text, reviewer_id uuid, reviewed_at timestamptz, confidence public.pi_confidence,
  access_notes text not null default '', notes text not null default '',
  attachment_path text, extracted_text text, -- storage path / raw text, subject to source permissions
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'verified' or (reviewer_id is not null and verification_method is not null and length(trim(verification_method)) > 0))
);

create table public.pi_claims (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.pi_professionals(id) on delete cascade,
  field text not null check (field in ('canonical_name','alias','profession','location','bar_enrolment','affiliation','role','education','credential','practice_area','publication','speaking','contact','office_address','photo','profile_link')),
  value text not null, label text, effective_from date, effective_to date,
  basis text not null default 'stated' check (basis in ('stated','inferred')),
  confidence public.pi_confidence not null default 'low', status public.pi_claim_status not null default 'unverified',
  visibility public.pi_visibility not null default 'internal',
  reviewer_id uuid, verified_at timestamptz, supersedes_id uuid references public.pi_claims(id),
  notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (status <> 'verified' or (reviewer_id is not null and verified_at is not null)),
  check (field not in ('contact','office_address') or visibility <> 'public' or status = 'verified')
);
create table public.pi_claim_evidence (
  claim_id uuid not null references public.pi_claims(id) on delete cascade,
  source_id uuid not null references public.pi_source_evidence(id) on delete restrict,
  excerpt text, primary key (claim_id, source_id)
);

-- Convenience views matching the suggested entity names; claims remain the single provenance store.
create view public.pi_professional_aliases with (security_invoker = true) as select * from public.pi_claims where field in ('canonical_name','alias');
create view public.pi_professional_affiliations with (security_invoker = true) as select * from public.pi_claims where field in ('affiliation','role');
create view public.pi_professional_contacts with (security_invoker = true) as select * from public.pi_claims where field in ('contact','office_address');
create view public.pi_practice_expertise with (security_invoker = true) as select * from public.pi_claims where field = 'practice_area';

create table public.pi_court_cases (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.pi_professionals(id) on delete cascade,
  cnr text, case_number text, title text not null, court text not null, bench text,
  case_type_raw text not null default '', acts_raw text,
  category text not null default 'other' check (category in ('ibc','insolvency_appeal','commercial_civil','cheque_dishonour','arbitration','company_law','writ','execution','interim_misc','other')),
  category_overridden boolean not null default false, is_interim boolean not null default false,
  parent_case_id uuid references public.pi_court_cases(id) on delete set null,
  filing_date date, disposal_date date, status public.pi_case_status not null default 'unknown', last_checked_at timestamptz,
  represented_side text check (represented_side in ('petitioner','respondent','appellant','complainant','accused','unknown')),
  represented_side_verified boolean not null default false, appearance_evidence text,
  case_url text, order_list_url text, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (disposal_date is null or filing_date is null or disposal_date >= filing_date)
);
create unique index pi_cases_cnr_unique on public.pi_court_cases (professional_id, upper(regexp_replace(cnr, '[^A-Za-z0-9]', '', 'g'))) where cnr is not null;
create table public.pi_court_case_parties (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.pi_court_cases(id) on delete cascade,
  name text not null, side text not null default 'unknown' check (side in ('petitioner','respondent','appellant','complainant','accused','unknown'))
);
create table public.pi_case_evidence (
  case_id uuid not null references public.pi_court_cases(id) on delete cascade,
  source_id uuid not null references public.pi_source_evidence(id) on delete restrict, primary key (case_id, source_id)
);
create table public.pi_court_orders (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.pi_court_cases(id) on delete cascade,
  order_number text, order_date date, order_url text, pdf_url text, is_final boolean not null default false,
  extraction_status public.pi_extraction_status not null default 'not_started', extracted_at timestamptz,
  order_text text not null default '', source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- History of classifications; the latest row per order is the current review.
create table public.pi_case_outcome_reviews (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.pi_court_orders(id) on delete cascade,
  operative_outcome public.pi_outcome not null, relief_sought text not null default '', relief_granted text not null default '',
  procedural_or_merits public.pi_disposal_nature not null, classification_rationale text not null check (length(trim(classification_rationale)) >= 20),
  evidence_excerpt text not null, method text not null, confidence public.pi_confidence not null,
  reviewer_id uuid not null, verified_at timestamptz not null default now(),
  check (not (operative_outcome in ('withdrawn','infructuous','procedural_disposal','adjourned','interim_direction') and procedural_or_merits = 'merits'))
);

create table public.pi_publications (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.pi_professionals(id) on delete cascade,
  title text not null, authors text not null, publisher text not null default '', identifier text, edition text, publication_date date,
  topics text[] not null default '{}', practice_areas text[] not null default '{}', content_ideas text[] not null default '{}',
  status public.pi_claim_status not null default 'unverified', reviewer_id uuid, verified_at timestamptz, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'verified' or reviewer_id is not null)
);
create table public.pi_publication_evidence (
  publication_id uuid not null references public.pi_publications(id) on delete cascade,
  source_id uuid not null references public.pi_source_evidence(id) on delete restrict, primary key (publication_id, source_id)
);

create table public.pi_content_pillars (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.pi_professionals(id) on delete cascade,
  name text not null, allocation numeric(5,2) not null default 0 check (allocation between 0 and 100),
  description text not null default '', series text[] not null default '{}'
);
create table public.pi_content_ideas (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.pi_professionals(id) on delete cascade,
  pillar_id uuid references public.pi_content_pillars(id) on delete set null, title text not null, series text,
  audience text not null default '', format text not null default 'linkedin_post', platform text not null default 'LinkedIn',
  hook text not null default '', cta text not null default '', status public.pi_content_status not null default 'idea',
  planned_date date, scheduled_at timestamptz, published_at timestamptz, published_url text, body text not null default '',
  score jsonb not null default '{}'::jsonb, author_id uuid not null, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.pi_content_evidence (
  content_id uuid not null references public.pi_content_ideas(id) on delete cascade,
  source_id uuid references public.pi_source_evidence(id) on delete restrict,
  claim_id uuid references public.pi_claims(id) on delete restrict,
  case_id uuid references public.pi_court_cases(id) on delete restrict,
  publication_id uuid references public.pi_publications(id) on delete restrict,
  id uuid primary key default gen_random_uuid(),
  check (num_nonnulls(source_id, claim_id, case_id, publication_id) = 1)
);
create table public.pi_content_assets (
  id uuid primary key default gen_random_uuid(), content_id uuid not null references public.pi_content_ideas(id) on delete cascade,
  kind text not null check (kind in ('image','carousel','video','document','prompt')), storage_path text, prompt text,
  created_by uuid, created_at timestamptz not null default now()
);
create table public.pi_content_revisions (
  id uuid primary key default gen_random_uuid(), content_id uuid not null references public.pi_content_ideas(id) on delete cascade,
  body text not null, note text not null default '', created_by uuid not null, created_at timestamptz not null default now()
);
create table public.pi_content_approvals (
  id uuid primary key default gen_random_uuid(), content_id uuid not null references public.pi_content_ideas(id) on delete cascade,
  from_status public.pi_content_status not null, to_status public.pi_content_status not null, note text not null default '',
  actor_id uuid not null, created_at timestamptz not null default now()
);
create table public.pi_content_performance (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.pi_professionals(id) on delete cascade,
  content_id uuid references public.pi_content_ideas(id) on delete set null, platform text not null, published_at date,
  period_start date not null, period_end date not null check (period_end >= period_start),
  impressions integer check (impressions >= 0), clicks integer check (clicks >= 0), reactions integer check (reactions >= 0),
  comments integer check (comments >= 0), saves integer check (saves >= 0), shares integer check (shares >= 0),
  qualified_enquiries integer check (qualified_enquiries >= 0), consultations integer check (consultations >= 0),
  attribution_evidence text not null default '', origin text not null default 'manual' check (origin in ('manual','csv','integration')),
  created_by uuid, created_at timestamptz not null default now(),
  check ((coalesce(qualified_enquiries,0) = 0 and coalesce(consultations,0) = 0) or length(trim(attribution_evidence)) > 0)
);
create table public.pi_audit_log (
  id bigint generated always as identity primary key, organization_id uuid, actor_id uuid, action text not null,
  entity text not null, entity_id uuid, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index pi_professionals_org_idx on public.pi_professionals(organization_id);
create index pi_sources_org_status_idx on public.pi_source_evidence(organization_id, status);
create index pi_claims_prof_field_idx on public.pi_claims(professional_id, field, status);
create index pi_cases_prof_idx on public.pi_court_cases(professional_id, status, category);
create index pi_orders_case_idx on public.pi_court_orders(case_id, order_date desc);
create index pi_outcome_reviews_order_idx on public.pi_case_outcome_reviews(order_id, verified_at desc);
create index pi_publications_prof_idx on public.pi_publications(professional_id);
create index pi_content_prof_status_idx on public.pi_content_ideas(professional_id, status, planned_date);
create index pi_content_evidence_content_idx on public.pi_content_evidence(content_id);
create index pi_performance_prof_idx on public.pi_content_performance(professional_id, period_start);
create index pi_audit_entity_idx on public.pi_audit_log(entity, entity_id, created_at desc);

create trigger pi_professionals_updated before update on public.pi_professionals for each row execute function public.set_updated_at();
create trigger pi_sources_updated before update on public.pi_source_evidence for each row execute function public.set_updated_at();
create trigger pi_claims_updated before update on public.pi_claims for each row execute function public.set_updated_at();
create trigger pi_cases_updated before update on public.pi_court_cases for each row execute function public.set_updated_at();
create trigger pi_orders_updated before update on public.pi_court_orders for each row execute function public.set_updated_at();
create trigger pi_publications_updated before update on public.pi_publications for each row execute function public.set_updated_at();
create trigger pi_content_updated before update on public.pi_content_ideas for each row execute function public.set_updated_at();

-- ---------- helpers ----------
create or replace function public.pi_role_of(p_org uuid, p_user uuid) returns public.pi_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from pi_member_roles where organization_id = p_org and user_id = p_user), 'viewer'::pi_role)
$$;
create or replace function public.pi_is_reviewer(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$ select pi_role_of(p_org, p_user) in ('legal_reviewer','admin') $$;
create or replace function public.pi_org_of_professional(p_professional uuid) returns uuid
language sql stable security definer set search_path = public as $$ select organization_id from pi_professionals where id = p_professional $$;

-- ---------- database-level gates (apply even to the service-role client) ----------
create or replace function public.pi_guard_claim() returns trigger language plpgsql set search_path = public as $$
declare v_org uuid := pi_org_of_professional(new.professional_id);
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified' or old.value is distinct from new.value) then
    if not pi_is_reviewer(v_org, new.reviewer_id) then raise exception 'Only a legal reviewer or admin can verify claims'; end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'verified' and new.value is distinct from old.value then
    raise exception 'Verified claim values are immutable. Add a new claim and supersede explicitly.';
  end if;
  return new;
end $$;
create trigger pi_claims_guard before insert or update on public.pi_claims for each row execute function public.pi_guard_claim();

create or replace function public.pi_guard_outcome_review() returns trigger language plpgsql set search_path = public as $$
declare v_order pi_court_orders; v_org uuid;
begin
  select * into v_order from pi_court_orders where id = new.order_id;
  select p.organization_id into v_org from pi_court_cases c join pi_professionals p on p.id = c.professional_id where c.id = v_order.case_id;
  if not pi_is_reviewer(v_org, new.reviewer_id) then raise exception 'Only a legal reviewer or admin can classify outcomes'; end if;
  if v_order.extraction_status not in ('extracted','manual') or length(trim(v_order.order_text)) = 0 then
    raise exception 'Order text missing: outcome remains unverified';
  end if;
  if position(lower(regexp_replace(trim(new.evidence_excerpt), '\s+', ' ', 'g')) in lower(regexp_replace(v_order.order_text, '\s+', ' ', 'g'))) = 0 then
    raise exception 'Evidence excerpt must appear verbatim in the order text';
  end if;
  return new;
end $$;
create trigger pi_outcome_reviews_guard before insert on public.pi_case_outcome_reviews for each row execute function public.pi_guard_outcome_review();

create or replace function public.pi_guard_content_status() returns trigger language plpgsql set search_path = public as $$
declare v_org uuid := pi_org_of_professional(new.professional_id);
begin
  if new.status = old.status then
    if old.status in ('approved','scheduled') and new.body is distinct from old.body then
      raise exception 'Approved content cannot be edited in place; move it back to draft first';
    end if;
    if old.status = 'published' and new.body is distinct from old.body then raise exception 'Published content is locked'; end if;
    return new;
  end if;
  if not (
    (old.status = 'idea' and new.status in ('research_needed','draft','rejected')) or
    (old.status = 'research_needed' and new.status in ('idea','draft','rejected')) or
    (old.status = 'draft' and new.status in ('research_needed','legal_review','rejected')) or
    (old.status = 'legal_review' and new.status in ('draft','approved','rejected')) or
    (old.status = 'approved' and new.status in ('draft','scheduled')) or
    (old.status = 'scheduled' and new.status in ('approved','published')) or
    (old.status = 'rejected' and new.status = 'idea')
  ) then raise exception 'Invalid content transition % -> %', old.status, new.status; end if;
  if new.status = 'approved' then
    if new.approved_by is null or not pi_is_reviewer(v_org, new.approved_by) then raise exception 'Approval requires a legal reviewer or admin'; end if;
    if new.approved_by = new.author_id then raise exception 'Authors cannot approve their own content'; end if;
    if exists (select 1 from pi_content_evidence e join pi_source_evidence s on s.id = e.source_id where e.content_id = new.id and s.status <> 'verified')
       or exists (select 1 from pi_content_evidence e join pi_claims c on c.id = e.claim_id where e.content_id = new.id and c.status <> 'verified') then
      raise exception 'All linked sources and claims must be verified before approval';
    end if;
    if not exists (select 1 from pi_content_evidence e where e.content_id = new.id) then raise exception 'Approved content must link evidence'; end if;
    new.approved_at := now();
  elsif new.status = 'scheduled' then
    if old.approved_by is null or new.scheduled_at is null then raise exception 'Scheduling requires prior approval and a date'; end if;
  elsif new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  elsif new.status in ('draft','research_needed','idea','rejected','legal_review') then
    new.approved_by := null; new.approved_at := null; new.scheduled_at := null;
  end if;
  insert into pi_audit_log(organization_id, actor_id, action, entity, entity_id, detail)
  values (v_org, coalesce(new.approved_by, auth.uid()), 'content_status', 'pi_content_ideas', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end $$;
create trigger pi_content_status_guard before update on public.pi_content_ideas for each row execute function public.pi_guard_content_status();
create or replace function public.pi_guard_content_insert() returns trigger language plpgsql as $$
begin
  if new.status not in ('idea','research_needed','draft') then raise exception 'New content must start as idea, research_needed or draft'; end if;
  return new;
end $$;
create trigger pi_content_insert_guard before insert on public.pi_content_ideas for each row execute function public.pi_guard_content_insert();

-- ---------- row level security ----------
alter table public.pi_member_roles enable row level security;
alter table public.pi_professionals enable row level security;
alter table public.pi_source_evidence enable row level security;
alter table public.pi_claims enable row level security;
alter table public.pi_claim_evidence enable row level security;
alter table public.pi_court_cases enable row level security;
alter table public.pi_court_case_parties enable row level security;
alter table public.pi_case_evidence enable row level security;
alter table public.pi_court_orders enable row level security;
alter table public.pi_case_outcome_reviews enable row level security;
alter table public.pi_publications enable row level security;
alter table public.pi_publication_evidence enable row level security;
alter table public.pi_content_pillars enable row level security;
alter table public.pi_content_ideas enable row level security;
alter table public.pi_content_evidence enable row level security;
alter table public.pi_content_assets enable row level security;
alter table public.pi_content_revisions enable row level security;
alter table public.pi_content_approvals enable row level security;
alter table public.pi_content_performance enable row level security;
alter table public.pi_audit_log enable row level security;

create or replace function public.pi_is_member(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members m where m.organization_id = p_org and m.user_id = auth.uid())
$$;
create or replace function public.pi_can_edit(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select pi_is_member(p_org) and pi_role_of(p_org, auth.uid()) in ('editor','legal_reviewer','admin')
$$;

create policy pi_roles_read on public.pi_member_roles for select using (pi_is_member(organization_id));
create policy pi_roles_admin on public.pi_member_roles for all using (pi_role_of(organization_id, auth.uid()) = 'admin') with check (pi_role_of(organization_id, auth.uid()) = 'admin');
create policy pi_professionals_read on public.pi_professionals for select using (pi_is_member(organization_id));
create policy pi_professionals_write on public.pi_professionals for all using (pi_can_edit(organization_id)) with check (pi_can_edit(organization_id));
create policy pi_sources_read on public.pi_source_evidence for select using (pi_is_member(organization_id));
create policy pi_sources_write on public.pi_source_evidence for all using (pi_can_edit(organization_id)) with check (pi_can_edit(organization_id));
-- Restricted contact claims are visible to reviewers/admins only.
create policy pi_claims_read on public.pi_claims for select using (
  pi_is_member(pi_org_of_professional(professional_id)) and (visibility <> 'restricted' or pi_is_reviewer(pi_org_of_professional(professional_id), auth.uid()))
);
create policy pi_claims_write on public.pi_claims for all using (pi_can_edit(pi_org_of_professional(professional_id))) with check (pi_can_edit(pi_org_of_professional(professional_id)));
create policy pi_claim_evidence_access on public.pi_claim_evidence for all using (exists (select 1 from pi_claims c where c.id = claim_id and pi_can_edit(pi_org_of_professional(c.professional_id))));
create policy pi_cases_read on public.pi_court_cases for select using (pi_is_member(pi_org_of_professional(professional_id)));
create policy pi_cases_write on public.pi_court_cases for all using (pi_can_edit(pi_org_of_professional(professional_id))) with check (pi_can_edit(pi_org_of_professional(professional_id)));
create policy pi_parties_access on public.pi_court_case_parties for all using (exists (select 1 from pi_court_cases c where c.id = case_id and pi_is_member(pi_org_of_professional(c.professional_id))));
create policy pi_case_evidence_access on public.pi_case_evidence for all using (exists (select 1 from pi_court_cases c where c.id = case_id and pi_is_member(pi_org_of_professional(c.professional_id))));
create policy pi_orders_access on public.pi_court_orders for all using (exists (select 1 from pi_court_cases c where c.id = case_id and pi_is_member(pi_org_of_professional(c.professional_id))));
create policy pi_outcome_reviews_read on public.pi_case_outcome_reviews for select using (exists (select 1 from pi_court_orders o join pi_court_cases c on c.id = o.case_id where o.id = order_id and pi_is_member(pi_org_of_professional(c.professional_id))));
create policy pi_outcome_reviews_insert on public.pi_case_outcome_reviews for insert with check (reviewer_id = auth.uid());
create policy pi_publications_access on public.pi_publications for all using (pi_is_member(pi_org_of_professional(professional_id)));
create policy pi_publication_evidence_access on public.pi_publication_evidence for all using (exists (select 1 from pi_publications p where p.id = publication_id and pi_is_member(pi_org_of_professional(p.professional_id))));
create policy pi_pillars_access on public.pi_content_pillars for all using (pi_is_member(pi_org_of_professional(professional_id)));
create policy pi_content_read on public.pi_content_ideas for select using (pi_is_member(pi_org_of_professional(professional_id)));
create policy pi_content_write on public.pi_content_ideas for all using (pi_can_edit(pi_org_of_professional(professional_id))) with check (pi_can_edit(pi_org_of_professional(professional_id)));
create policy pi_content_evidence_access on public.pi_content_evidence for all using (exists (select 1 from pi_content_ideas i where i.id = content_id and pi_is_member(pi_org_of_professional(i.professional_id))));
create policy pi_content_assets_access on public.pi_content_assets for all using (exists (select 1 from pi_content_ideas i where i.id = content_id and pi_is_member(pi_org_of_professional(i.professional_id))));
create policy pi_content_revisions_access on public.pi_content_revisions for all using (exists (select 1 from pi_content_ideas i where i.id = content_id and pi_is_member(pi_org_of_professional(i.professional_id))));
create policy pi_content_approvals_read on public.pi_content_approvals for select using (exists (select 1 from pi_content_ideas i where i.id = content_id and pi_is_member(pi_org_of_professional(i.professional_id))));
create policy pi_performance_access on public.pi_content_performance for all using (pi_is_member(pi_org_of_professional(professional_id)));
create policy pi_audit_read on public.pi_audit_log for select using (pi_is_member(organization_id));
