import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query } from './db.js';

/** Cria o primeiro administrador quando o banco está vazio. */
export async function ensureAdmin(log: (m: string) => void = console.log) {
  if ((await query('select 1 from users limit 1'))[0]) return;
  const username = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(6).toString('base64url');
  await query(`insert into users (name, username, password_hash, role) values ('Administrador', $1, $2, 'admin')`, [username, await bcrypt.hash(password, 10)]);
  log(`Administrador criado: usuário "${username}"${generated ? ` senha "${password}" (anote e troque depois)` : ''}`);
}

/** Dados de exemplo (SEED_DEMO=true): mesas, bairros, cardápio de exemplo e usuários de teste. Preços são apenas exemplos. */
export async function seedDemo(log: (m: string) => void = console.log) {
  if ((await query('select 1 from dining_tables limit 1'))[0]) return;
  for (let n = 1; n <= 5; n++) await query('insert into dining_tables (number, capacity) values ($1, 4)', [n]);
  const hoods: [string, number, number][] = [['Centro', 600, 20], ['Jardim América', 800, 25], ['Vila Nova', 1000, 30], ['São José', 1200, 35]];
  for (const [n, fee, eta] of hoods) await query('insert into neighborhoods (name, fee, eta_minutes) values ($1,$2,$3)', [n, fee, eta]);

  const cat = async (name: string, kind: string, sort: number) => (await query('insert into categories (name, kind, sort) values ($1,$2,$3) returning id', [name, kind, sort]))[0].id as number;
  const trad = await cat('Pizzas tradicionais', 'pizza', 1);
  const esp = await cat('Pizzas especiais', 'pizza', 2);
  const doce = await cat('Pizzas doces', 'pizza', 3);
  const beb = await cat('Bebidas', 'simples', 4);
  const pizza = (c: number, name: string, description: string, g: number, gg: number) =>
    query('insert into products (category_id, name, description, price_g, price_gg, allows_half) values ($1,$2,$3,$4,$5,true)', [c, name, description, g, gg]);
  await pizza(trad, 'Mussarela', 'Molho, mussarela e orégano', 4900, 5900);
  await pizza(trad, 'Calabresa', 'Calabresa fatiada, cebola e mussarela', 5200, 6200);
  await pizza(trad, 'Portuguesa', 'Presunto, ovo, cebola, azeitona e mussarela', 5800, 6800);
  await pizza(trad, 'Frango com catupiry', 'Frango desfiado e catupiry', 5800, 6800);
  await pizza(trad, 'Margherita', 'Mussarela, tomate e manjericão', 5400, 6400);
  await pizza(esp, 'Quatro queijos', 'Mussarela, provolone, parmesão e gorgonzola', 6400, 7600);
  await pizza(esp, 'Pepperoni', 'Pepperoni e mussarela', 6600, 7800);
  await pizza(doce, 'Chocolate com morango', 'Chocolate ao leite e morango', 5600, 6600);
  const drink = (name: string, price: number) => query('insert into products (category_id, name, price_g) values ($1,$2,$3)', [beb, name, price]);
  await drink('Refrigerante 2L', 1400);
  await drink('Refrigerante lata', 600);
  await drink('Suco natural', 900);
  await drink('Água', 400);

  const pass = process.env.DEMO_PASSWORD ?? 'mania123';
  const hash = await bcrypt.hash(pass, 10);
  const users: [string, string, string, string | null][] = [
    ['Caixa', 'caixa', 'caixa', null],
    ['Garçom', 'garcom', 'garcom', null],
    ['Cozinha', 'cozinha', 'cozinha', null],
    ['Entregador Funcionário', 'entregador', 'entregador', 'funcionario'],
    ['Entregador Autônomo', 'autonomo', 'entregador', 'autonomo'],
  ];
  for (const [name, username, role, dt] of users) {
    await query('insert into users (name, username, password_hash, role, deliverer_type) values ($1,$2,$3,$4,$5) on conflict (username) do nothing', [name, username, hash, role, dt]);
  }
  log(`Dados de exemplo criados (usuários caixa, garcom, cozinha, entregador, autonomo; senha "${pass}").`);
}
