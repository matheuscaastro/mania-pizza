-- Esquema inicial do sistema Mania de Pizza.
-- Valores em dinheiro são guardados em centavos (inteiros).

create table users (
  id serial primary key,
  name text not null,
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'caixa', 'garcom', 'entregador', 'cozinha')),
  deliverer_type text check (deliverer_type in ('funcionario', 'autonomo')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value text not null
);

insert into settings (key, value) values ('half_rule', 'maior');

create table categories (
  id serial primary key,
  name text not null,
  kind text not null default 'pizza' check (kind in ('pizza', 'simples')),
  sort integer not null default 0,
  active boolean not null default true
);

create table products (
  id serial primary key,
  category_id integer not null references categories (id),
  name text not null,
  description text not null default '',
  price_g integer not null check (price_g >= 0),
  price_gg integer check (price_gg >= 0),
  allows_half boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table dining_tables (
  id serial primary key,
  number integer not null unique,
  capacity integer not null default 4,
  area text not null default 'Salão',
  status text not null default 'livre' check (status in ('livre', 'ocupada', 'aguardando_conta', 'reservada')),
  reserved_for text,
  reserved_at text
);

create table neighborhoods (
  id serial primary key,
  name text not null unique,
  fee integer not null check (fee >= 0),
  eta_minutes integer not null default 30,
  active boolean not null default true
);

create table customers (
  id serial primary key,
  name text not null,
  phone text not null unique,
  address text,
  neighborhood_id integer references neighborhoods (id),
  created_at timestamptz not null default now()
);

create table cash_sessions (
  id serial primary key,
  opened_by integer not null references users (id),
  opened_at timestamptz not null default now(),
  initial_amount integer not null check (initial_amount >= 0),
  closed_by integer references users (id),
  closed_at timestamptz,
  counted_cash integer,
  expected_cash integer,
  difference integer
);

create unique index cash_sessions_one_open on cash_sessions ((closed_at is null)) where closed_at is null;

-- Uma conta agrupa os pedidos (envios) de uma mesa; balcão e entrega têm uma conta por pedido.
create table accounts (
  id serial primary key,
  table_id integer references dining_tables (id),
  people integer,
  status text not null default 'aberta' check (status in ('aberta', 'aguardando_conta', 'paga', 'cancelada')),
  discount integer not null default 0 check (discount >= 0),
  discount_reason text,
  opened_by integer references users (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index accounts_one_open_per_table on accounts (table_id)
  where table_id is not null and status in ('aberta', 'aguardando_conta');

create sequence order_number_seq start 1;

create table orders (
  id serial primary key,
  number integer not null default nextval('order_number_seq'),
  client_id text unique,
  account_id integer not null references accounts (id),
  type text not null check (type in ('mesa', 'balcao', 'entrega')),
  status text not null default 'novo' check (status in ('novo', 'em_preparo', 'pronto', 'em_rota', 'entregue', 'cancelado')),
  table_id integer references dining_tables (id),
  customer_id integer references customers (id),
  customer_name text,
  customer_phone text,
  address text,
  neighborhood_id integer references neighborhoods (id),
  neighborhood_name text,
  delivery_fee integer not null default 0,
  deliverer_id integer references users (id),
  pay_on_delivery_method text check (pay_on_delivery_method in ('dinheiro', 'debito', 'credito', 'pix')),
  change_for integer,
  notes text,
  cancel_reason text,
  created_by integer references users (id),
  created_at timestamptz not null default now(),
  prepared_at timestamptz,
  ready_at timestamptz,
  out_at timestamptz,
  delivered_at timestamptz
);

create index orders_status_idx on orders (status);
create index orders_created_idx on orders (created_at);
create index orders_account_idx on orders (account_id);

create table order_items (
  id serial primary key,
  order_id integer not null references orders (id) on delete cascade,
  product_id integer not null references products (id),
  name text not null,
  size text check (size in ('G', 'GG')),
  half_product_id integer references products (id),
  half_name text,
  qty integer not null check (qty > 0),
  unit_price integer not null check (unit_price >= 0),
  notes text
);

create index order_items_order_idx on order_items (order_id);

create table payments (
  id serial primary key,
  account_id integer not null references accounts (id),
  cash_session_id integer not null references cash_sessions (id),
  method text not null check (method in ('dinheiro', 'debito', 'credito', 'pix')),
  amount integer not null check (amount > 0),
  created_by integer references users (id),
  created_at timestamptz not null default now()
);

create table cash_movements (
  id serial primary key,
  cash_session_id integer not null references cash_sessions (id),
  type text not null check (type in ('sangria', 'suprimento', 'despesa')),
  amount integer not null check (amount > 0),
  category text,
  note text,
  created_by integer references users (id),
  created_at timestamptz not null default now()
);

create table audit_logs (
  id serial primary key,
  user_id integer references users (id),
  action text not null,
  entity text not null,
  entity_id integer,
  detail jsonb,
  created_at timestamptz not null default now()
);
