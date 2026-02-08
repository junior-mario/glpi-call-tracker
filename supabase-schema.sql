-- Configuração GLPI por usuário
create table glpi_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  base_url text not null,
  app_token text not null,
  user_token text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Chamados acompanhados por usuário
create table tracked_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  ticket_id text not null,
  title text not null,
  status text not null,
  priority text not null,
  assignee text,
  requester text,
  has_new_updates boolean default false,
  glpi_created_at text,
  glpi_updated_at text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, ticket_id)
);

-- Row Level Security
alter table glpi_configs enable row level security;
alter table tracked_tickets enable row level security;

create policy "Users manage own config"
  on glpi_configs for all using (auth.uid() = user_id);

create policy "Users manage own tickets"
  on tracked_tickets for all using (auth.uid() = user_id);
