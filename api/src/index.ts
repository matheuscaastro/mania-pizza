import { buildApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { runMigrations } from './migrate.js';
import { ensureAdmin, seedDemo } from './seed.js';

await runMigrations();
await ensureAdmin();
if (process.env.SEED_DEMO === 'true') await seedDemo();

const app = await buildApp();
attachRealtime(app);
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
