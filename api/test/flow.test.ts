import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://postgres@localhost:5433/mania_test';
process.env.ADMIN_PASSWORD = 'admin-pass';
process.env.DEMO_PASSWORD = 'demo-pass';

const { buildApp } = await import('../src/app.js');
const { closePool, getPool, query } = await import('../src/db.js');
const { runMigrations } = await import('../src/migrate.js');
const { ensureAdmin, seedDemo } = await import('../src/seed.js');

let app: Awaited<ReturnType<typeof buildApp>>;
const tokens: Record<string, string> = {};

async function call(who: string | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) {
  const res = await app.inject({ method, url: '/api' + url, payload: payload as any, headers: who ? { authorization: `Bearer ${tokens[who]}` } : {} });
  return { status: res.statusCode, body: res.json() as any };
}

before(async () => {
  const pool = getPool();
  await pool.query('drop schema public cascade; create schema public;');
  await runMigrations(() => {});
  await ensureAdmin(() => {});
  await seedDemo(() => {});
  app = await buildApp();
  for (const [k, u, p] of [['admin', 'admin', 'admin-pass'], ['caixa', 'caixa', 'demo-pass'], ['garcom', 'garcom', 'demo-pass'], ['cozinha', 'cozinha', 'demo-pass'], ['entregador', 'entregador', 'demo-pass']]) {
    const r = await call(null, 'POST', '/auth/login', { username: u, password: p });
    assert.equal(r.status, 200, `login ${u}`);
    tokens[k] = r.body.token;
  }
});
after(async () => {
  await app.close();
  await closePool();
});

test('login errado e permissões', async () => {
  assert.equal((await call(null, 'POST', '/auth/login', { username: 'admin', password: 'x' })).status, 401);
  assert.equal((await call(null, 'GET', '/tables')).status, 401);
  assert.equal((await call('garcom', 'GET', '/users')).status, 403);
  assert.equal((await call('garcom', 'POST', '/cash/open', { initial_amount: 0 })).status, 403);
});

test('mesa: pedido do garçom, meio a meio, observação, cozinha, conta e pagamento', async () => {
  const menu = (await call('garcom', 'GET', '/menu')).body.categories;
  const pizzas = menu[0].products;
  const [mussarela, calabresa] = [pizzas.find((p: any) => p.name === 'Mussarela'), pizzas.find((p: any) => p.name === 'Calabresa')];
  const tables = (await call('garcom', 'GET', '/tables')).body.tables;
  const t1 = tables[0];

  const body = {
    client_id: 'abc-12345-xyz',
    type: 'mesa',
    table_id: t1.id,
    people: 3,
    items: [
      { product_id: mussarela.id, size: 'GG', half_product_id: calabresa.id, qty: 1, notes: 'sem cebola, bem assada' },
      { product_id: menu[3].products[0].id, qty: 2 },
    ],
  };
  const r1 = await call('garcom', 'POST', '/orders', body);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  // meio a meio GG: maior(5900, 6200)=6200; 2 refri 1400 => 6200+2800
  assert.equal(r1.body.order.items_total, 9000);
  assert.equal(r1.body.order.items[0].notes, 'sem cebola, bem assada');
  // idempotência (reenvio do app offline)
  const r2 = await call('garcom', 'POST', '/orders', body);
  assert.equal(r2.body.order.id, r1.body.order.id);
  assert.equal((await call('garcom', 'GET', '/orders?scope=active')).body.orders.length, 1);

  // tamanho obrigatório para pizza e GG indisponível
  assert.equal((await call('garcom', 'POST', '/orders', { type: 'mesa', table_id: t1.id, items: [{ product_id: mussarela.id, qty: 1 }] })).status, 400);

  const id = r1.body.order.id;
  // garçom não manda para preparo; cozinha sim
  assert.equal((await call('garcom', 'POST', `/orders/${id}/status`, { status: 'em_preparo' })).status, 403);
  assert.equal((await call('cozinha', 'POST', `/orders/${id}/status`, { status: 'em_preparo' })).status, 200);
  assert.equal((await call('cozinha', 'POST', `/orders/${id}/status`, { status: 'em_rota' })).status, 409);
  assert.equal((await call('cozinha', 'POST', `/orders/${id}/status`, { status: 'pronto' })).status, 200);
  assert.equal((await call('garcom', 'POST', `/orders/${id}/status`, { status: 'entregue' })).status, 200);

  const tbl = (await call('garcom', 'GET', '/tables')).body.tables[0];
  assert.equal(tbl.status, 'ocupada');
  assert.equal(tbl.total, 9000);

  const accId = tbl.account_id;
  assert.equal((await call('garcom', 'POST', `/accounts/${accId}/request-bill`)).status, 200);
  assert.equal((await call('garcom', 'GET', '/tables')).body.tables[0].status, 'aguardando_conta');

  // sem caixa aberto não paga
  assert.equal((await call('caixa', 'POST', `/accounts/${accId}/pay`, { payments: [{ method: 'pix', amount: 9000 }] })).status, 409);
  assert.equal((await call('caixa', 'POST', '/cash/open', { initial_amount: 10000 })).status, 200);
  assert.equal((await call('caixa', 'POST', '/cash/open', { initial_amount: 10000 })).status, 409);
  // desconto e soma errada
  assert.equal((await call('caixa', 'POST', `/accounts/${accId}/discount`, { amount: 500, reason: 'cliente fiel' })).body.account.total, 8500);
  assert.equal((await call('caixa', 'POST', `/accounts/${accId}/pay`, { payments: [{ method: 'pix', amount: 9000 }] })).status, 400);
  const pay = await call('caixa', 'POST', `/accounts/${accId}/pay`, { payments: [{ method: 'dinheiro', amount: 3500 }, { method: 'pix', amount: 5000 }] });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  assert.equal(pay.body.account.status, 'paga');
  assert.equal((await call('garcom', 'GET', '/tables')).body.tables[0].status, 'livre');
  assert.equal((await call('caixa', 'POST', `/accounts/${accId}/pay`, { payments: [{ method: 'pix', amount: 8500 }] })).status, 409);
});

test('cancelamento exige motivo; garçom só o próprio pedido novo; libera a mesa', async () => {
  const menu = (await call('garcom', 'GET', '/menu')).body.categories;
  const t2 = (await call('garcom', 'GET', '/tables')).body.tables[1];
  const r = await call('garcom', 'POST', '/orders', { type: 'mesa', table_id: t2.id, items: [{ product_id: menu[3].products[0].id, qty: 1 }] });
  const id = r.body.order.id;
  assert.equal((await call('garcom', 'POST', `/orders/${id}/status`, { status: 'cancelado' })).status, 400);
  assert.equal((await call('garcom', 'POST', `/orders/${id}/status`, { status: 'cancelado', reason: 'cliente desistiu' })).status, 200);
  assert.equal((await call('garcom', 'GET', '/tables')).body.tables[1].status, 'livre');
  const logs = await query(`select * from audit_logs where action='pedido.cancelar'`);
  assert.equal(logs.length, 1);
});

test('entrega: bairro/taxa, entregador, rota, entrega e pagamento automático', async () => {
  const menu = (await call('caixa', 'GET', '/menu')).body.categories;
  const hoods = (await call('caixa', 'GET', '/neighborhoods')).body.neighborhoods;
  const muss = menu[0].products.find((p: any) => p.name === 'Mussarela');
  const body = {
    type: 'entrega',
    customer_name: 'Maria',
    customer_phone: '(11) 98888-7777',
    address: 'Rua das Flores, 100',
    neighborhood_id: hoods[1].id,
    pay_on_delivery_method: 'dinheiro',
    change_for: 10000,
    items: [{ product_id: muss.id, size: 'G', qty: 1 }],
  };
  assert.equal((await call('garcom', 'POST', '/orders', body)).status, 403);
  const r = await call('caixa', 'POST', '/orders', body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const o = r.body.order;
  assert.equal(o.delivery_fee, 800);
  assert.equal(o.total, 4900 + 800);
  assert.equal((await call('caixa', 'GET', '/customers?phone=11988')).body.customers[0].name, 'Maria');

  assert.equal((await call('cozinha', 'POST', `/orders/${o.id}/status`, { status: 'pronto' })).status, 200);
  assert.equal((await call('caixa', 'POST', `/orders/${o.id}/status`, { status: 'em_rota' })).status, 400); // sem entregador
  const dels = (await call('caixa', 'GET', '/users/deliverers')).body.users;
  assert.equal(dels.length, 2);
  assert.equal((await call('caixa', 'POST', `/orders/${o.id}/deliverer`, { deliverer_id: dels.find((d: any) => d.name === 'Entregador Funcionário').id })).status, 200);
  assert.equal((await call('caixa', 'POST', `/orders/${o.id}/status`, { status: 'entregue' })).status, 409); // precisa de rota
  assert.equal((await call('caixa', 'POST', `/orders/${o.id}/status`, { status: 'em_rota' })).status, 200);

  const mine = await call('entregador', 'GET', '/deliveries/mine');
  assert.equal(mine.body.orders.length, 1);
  const done = await call('entregador', 'POST', `/orders/${o.id}/status`, { status: 'entregue' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.auto_paid, true);
  const acc = (await call('caixa', 'GET', `/accounts/${o.account_id}`)).body.account;
  assert.equal(acc.status, 'paga');
  assert.equal(acc.paid, 5700);
});

test('caixa: sangria, despesa, fechamento com conferência e relatórios', async () => {
  assert.equal((await call('caixa', 'POST', '/cash/movements', { type: 'sangria', amount: 2000, note: 'cofre' })).status, 200);
  assert.equal((await call('caixa', 'POST', '/cash/movements', { type: 'despesa', amount: 500, category: 'gás' })).status, 200);
  const cur = (await call('caixa', 'GET', '/cash/current')).body.session;
  // inicial 100 + dinheiro (35 da mesa + 57 da entrega) - 20 - 5
  assert.equal(cur.expected_cash, 10000 + 3500 + 5700 - 2000 - 500);
  assert.equal(cur.received, 8500 + 5700);
  const closed = (await call('caixa', 'POST', '/cash/close', { counted_cash: cur.expected_cash - 100 })).body.session;
  assert.equal(closed.difference, -100);
  assert.equal((await call('caixa', 'GET', '/cash/current')).body.session, null);

  const rep = await call('admin', 'GET', '/reports/summary');
  assert.equal(rep.body.revenue, 14200);
  assert.ok(rep.body.top_products.length > 0);
  assert.equal((await call('caixa', 'GET', '/reports/summary')).status, 403);
  const dash = await call('caixa', 'GET', '/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.revenue, 14200);
});

test('mesas: transferir e juntar', async () => {
  const menu = (await call('garcom', 'GET', '/menu')).body.categories;
  const drink = menu[3].products[0].id;
  const [a, b, c] = (await call('garcom', 'GET', '/tables')).body.tables;
  await call('garcom', 'POST', '/orders', { type: 'mesa', table_id: a.id, items: [{ product_id: drink, qty: 1 }] });
  assert.equal((await call('garcom', 'POST', `/tables/${a.id}/transfer`, { to_table_id: b.id })).status, 200);
  let t = (await call('garcom', 'GET', '/tables')).body.tables;
  assert.equal(t[0].status, 'livre');
  assert.equal(t[1].status, 'ocupada');
  await call('garcom', 'POST', '/orders', { type: 'mesa', table_id: c.id, items: [{ product_id: drink, qty: 2 }] });
  assert.equal((await call('caixa', 'POST', `/tables/${c.id}/merge`, { into_table_id: b.id })).status, 200);
  t = (await call('garcom', 'GET', '/tables')).body.tables;
  assert.equal(t[2].status, 'livre');
  assert.equal(t[1].total, 1400 * 3);
  assert.equal((await call('garcom', 'POST', `/tables/${a.id}/reserve`, { reserved_for: 'João', reserved_at: '20:00' })).status, 200);
});
