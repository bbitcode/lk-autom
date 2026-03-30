-- Posts table
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  content_en text,
  content_es text,
  source_url text,
  source_summary text,
  status text default 'draft' check (status in ('draft', 'ready', 'used')),
  used_by text check (used_by in ('Daniel', 'Natalia', 'Tomás', 'Isa', 'Jorge', null)),
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Team members table
create table if not exists team_members (
  id uuid default gen_random_uuid() primary key,
  name text unique not null check (name in ('Daniel', 'Natalia', 'Tomás', 'Isa', 'Jorge')),
  language text default 'es' check (language in ('en', 'es')),
  tone_description text,
  writing_samples text
);

-- Company context table
create table if not exists company_context (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  value text not null
);

-- Insert team members
insert into team_members (name, language) values
  ('Daniel', 'en'),
  ('Natalia', 'es'),
  ('Tomás', 'es'),
  ('Isa', 'es'),
  ('Jorge', 'es')
on conflict (name) do nothing;

-- Insert default company context
insert into company_context (key, value) values
  ('company_description', 'Aloud es un estudio de productos para creadores de contenido. Diseñamos, construimos y lanzamos productos digitales, newsletters, comunidades, apps y automatizaciones de crecimiento. Nuestra filosofía: la audiencia es tu negocio.'),
  ('services', 'Productos digitales (guías, cursos, comunidades, membresías, apps, plataformas, newsletters), branding y estrategia de producto, asistencia legal para empresas en EE.UU., partnerships con marcas, eventos.'),
  ('target_audience', 'Creadores de contenido con audiencia establecida e industry leaders que buscan monetizar su conocimiento y audiencia.'),
  ('tone', 'Directo y motivacional. Orientado a resultados concretos y ROI. Conversacional, sin jerga técnica innecesaria. Confianza basada en ejecución.'),
  ('notable_clients', 'MiaWellness (1M+ seguidores), MarathonScience ($50K+ en lanzamiento), Amaluld, SustainMotion360, BITS by TUHUB, The Latino Newsletter, Extracto News.')
on conflict (key) do nothing;

-- Discover cache table
create table if not exists discover_cache (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  link text unique not null,
  source text,
  date timestamptz,
  snippet text,
  relevance_score integer default 0,
  source_type text default 'rss',
  cached_at timestamptz default now()
);

create index if not exists idx_discover_cache_cached_at on discover_cache (cached_at);
create index if not exists idx_discover_cache_relevance on discover_cache (relevance_score);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at
  before update on posts
  for each row
  execute function update_updated_at();
