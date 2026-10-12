create extension if not exists pgcrypto;

create type public.brand_audit_status as enum ('draft','in_review','approved','archived');
create type public.brand_finding_status as enum ('open','accepted','rejected','resolved');
create type public.brand_priority as enum ('low','medium','high','critical');
create type public.brand_task_status as enum ('backlog','todo','in_progress','review','done');
create type public.brand_token_status as enum ('draft','approved','retired');

create table public.brand_clients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  name text not null, slug text not null, current_positioning text,
  desired_positioning text, created_by uuid, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(organization_id, slug)
);
create table public.brand_audits (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.brand_clients(id) on delete cascade,
  title text not null, version integer not null default 1 check(version > 0),
  status public.brand_audit_status not null default 'draft', source_text text,
  created_by uuid, approved_by uuid, approved_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(client_id, version)
);
create table public.brand_audit_findings (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references public.brand_audits(id) on delete cascade,
  category text not null, element text not null, current_score numeric(3,1) not null check(current_score between 0 and 10),
  target_score numeric(3,1) not null default 9 check(target_score between 0 and 10), weight numeric(5,2) not null default 1 check(weight > 0),
  severity public.brand_priority not null default 'medium', observation text not null,
  issues jsonb not null default '[]'::jsonb check(jsonb_typeof(issues)='array'),
  recommendations jsonb not null default '[]'::jsonb check(jsonb_typeof(recommendations)='array'),
  status public.brand_finding_status not null default 'open', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brand_tokens (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.brand_clients(id) on delete cascade,
  token_type text not null check(token_type in ('colour','typography','logo','photography','website','social')),
  name text not null, value jsonb not null default '{}'::jsonb, status public.brand_token_status not null default 'draft',
  version integer not null default 1, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(client_id, token_type, name, version)
);
create table public.brand_transformation_tasks (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.brand_clients(id) on delete cascade,
  finding_id uuid references public.brand_audit_findings(id) on delete set null, title text not null, description text,
  priority public.brand_priority not null default 'medium', status public.brand_task_status not null default 'backlog',
  output_required text, assignee_id uuid, due_date date, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brand_generated_creatives (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.brand_clients(id) on delete cascade,
  source_type text not null default 'manual', source_id uuid, content jsonb not null, prompt text not null,
  compliance_score numeric(5,2) check(compliance_score between 0 and 100), compliance_report jsonb,
  status text not null default 'draft' check(status in ('draft','review','approved','rejected')),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index brand_audits_client_idx on public.brand_audits(client_id, version desc);
create index brand_findings_audit_idx on public.brand_audit_findings(audit_id);
create index brand_tokens_client_idx on public.brand_tokens(client_id, status);
create index brand_tasks_client_idx on public.brand_transformation_tasks(client_id, status);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger brand_clients_updated before update on public.brand_clients for each row execute function public.set_updated_at();
create trigger brand_audits_updated before update on public.brand_audits for each row execute function public.set_updated_at();
create trigger brand_findings_updated before update on public.brand_audit_findings for each row execute function public.set_updated_at();
create trigger brand_tokens_updated before update on public.brand_tokens for each row execute function public.set_updated_at();
create trigger brand_tasks_updated before update on public.brand_transformation_tasks for each row execute function public.set_updated_at();

alter table public.brand_clients enable row level security;
alter table public.brand_audits enable row level security;
alter table public.brand_audit_findings enable row level security;
alter table public.brand_tokens enable row level security;
alter table public.brand_transformation_tasks enable row level security;
alter table public.brand_generated_creatives enable row level security;

-- Replace public.organization_members with your existing membership table if its name differs.
-- Expected columns: organization_id uuid, user_id uuid.
create table if not exists public.organization_members (organization_id uuid not null, user_id uuid not null, primary key(organization_id,user_id));
create policy brand_clients_member_access on public.brand_clients for all using (
  exists(select 1 from public.organization_members m where m.organization_id=brand_clients.organization_id and m.user_id=auth.uid())
) with check (exists(select 1 from public.organization_members m where m.organization_id=brand_clients.organization_id and m.user_id=auth.uid()));
create policy brand_audits_member_access on public.brand_audits for all using (
  exists(select 1 from public.brand_clients c join public.organization_members m on m.organization_id=c.organization_id where c.id=brand_audits.client_id and m.user_id=auth.uid())
);
create policy brand_findings_member_access on public.brand_audit_findings for all using (
  exists(select 1 from public.brand_audits a join public.brand_clients c on c.id=a.client_id join public.organization_members m on m.organization_id=c.organization_id where a.id=brand_audit_findings.audit_id and m.user_id=auth.uid())
);
create policy brand_tokens_member_access on public.brand_tokens for all using (
  exists(select 1 from public.brand_clients c join public.organization_members m on m.organization_id=c.organization_id where c.id=brand_tokens.client_id and m.user_id=auth.uid())
);
create policy brand_tasks_member_access on public.brand_transformation_tasks for all using (
  exists(select 1 from public.brand_clients c join public.organization_members m on m.organization_id=c.organization_id where c.id=brand_transformation_tasks.client_id and m.user_id=auth.uid())
);
create policy brand_creatives_member_access on public.brand_generated_creatives for all using (
  exists(select 1 from public.brand_clients c join public.organization_members m on m.organization_id=c.organization_id where c.id=brand_generated_creatives.client_id and m.user_id=auth.uid())
);

create or replace function public.seed_the_page_brand_audit(p_organization_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_client uuid; v_audit uuid;
begin
  insert into organization_members(organization_id,user_id) values(p_organization_id,p_user_id) on conflict do nothing;
  insert into brand_clients(organization_id,name,slug,current_positioning,desired_positioning,created_by)
  values(p_organization_id,'The Page','the-page','Premium local hotel','Experience-led luxury hospitality destination',p_user_id)
  returning id into v_client;
  insert into brand_audits(client_id,title,version,status,created_by) values(v_client,'Brand & Digital Experience Audit',1,'approved',p_user_id) returning id into v_audit;
  insert into brand_audit_findings(audit_id,category,element,current_score,target_score,weight,severity,observation,issues,recommendations,status) values
  (v_audit,'brand_identity','logo_concept',6.5,9,1,'medium','The logo has potential but lacks refinement.','["Monogram and wordmark feel disconnected","Weak visual hierarchy","Limited flexibility"]','["Develop an integrated primary logo","Create TP monogram","Create horizontal and vertical lockups","Produce monochrome, embossed and gold-foil variants"]','accepted'),
  (v_audit,'brand_identity','typography',4.5,9,1,'critical','Typography is inconsistent and does not communicate luxury.','["No consistent hierarchy","Inconsistent weights","Uneven spacing","Generic font selection"]','["Select a display typeface","Define H1-H4 styles","Define body, button and caption styles","Lock spacing and line-height rules"]','accepted'),
  (v_audit,'brand_identity','colour_palette',5.5,9,1,'high','Luxury colours are present but lack harmony and systematic use.','["Gold and black dominate","Green is not reflected across touchpoints","Usage varies by page"]','["Define primary luxury colours","Define supporting and accent colours","Create background and digital UI tokens","Publish social colour guidelines"]','accepted'),
  (v_audit,'brand_identity','brand_recall',6,9,1,'medium','The TP monogram can become distinctive but is not used as a cohesive recognition device.','["Inconsistent applications","No unified logo system"]','["Standardise the TP monogram","Create application rules for digital and physical touchpoints"]','accepted'),
  (v_audit,'positioning','luxury_perception',4,9,1,'critical','The identity reads as a business hotel rather than a luxury hospitality destination.','["Generic layouts","Limited storytelling","Photography lacks emotional appeal"]','["Adopt experience-led storytelling","Commission editorial hospitality photography","Redesign website hierarchy and social templates"]','accepted');
  insert into brand_tokens(client_id,token_type,name,value,status,approved_by,approved_at) values
  (v_client,'logo','TP primary system','{"variants":["primary","monogram","horizontal","vertical","monochrome","embossed","gold_foil"],"rule":"Use only approved artwork"}','approved',p_user_id,now()),
  (v_client,'photography','Luxury editorial','{"style":"realistic editorial hospitality","lighting":"warm ambient or directional","avoid":["stock-glossy","flat functional framing"],"focus":["guest experience","details","food stories","arrival"]}','approved',p_user_id,now()),
  (v_client,'social','Story-led content','{"pillars":["arrival","rooms","food stories","guest moments","property details","local experiences"],"reels":"cinematic with curated emotional audio"}','approved',p_user_id,now());
  return v_client;
end $$;

