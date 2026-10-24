import pg from 'pg';

export type Row = Record<string, any>;
export type Db = pg.Pool | pg.PoolClient;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido');
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}

export async function query(text: string, params: any[] = [], db: Db = getPool()): Promise<Row[]> {
  const r = await db.query(text, params);
  return r.rows;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Atualiza colunas (nomes vindos de schemas zod, nunca do usuário). */
export async function updateRow(table: string, id: number, data: Record<string, any>, db: Db = getPool()): Promise<Row | undefined> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) throw new Error('Nada para atualizar.');
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const rows = await query(`update ${table} set ${sets} where id=$1 returning *`, [id, ...keys.map((k) => data[k])], db);
  return rows[0];
}
