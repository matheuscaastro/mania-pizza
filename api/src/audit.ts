import { query, type Db } from './db.js';

export async function audit(db: Db, userId: number | null, action: string, entity: string, entityId: number | null, detail?: unknown) {
  await query('insert into audit_logs (user_id, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)', [
    userId,
    action,
    entity,
    entityId,
    detail === undefined ? null : JSON.stringify(detail),
  ], db);
}
