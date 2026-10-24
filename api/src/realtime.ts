import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { corsOrigin } from './config.js';

let io: Server | null = null;

export function attachRealtime(app: FastifyInstance) {
  io = new Server(app.server, { cors: { origin: corsOrigin() } });
  io.use((socket, next) => {
    try {
      app.jwt.verify(String(socket.handshake.auth?.token ?? ''));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  app.addHook('onClose', async () => {
    io?.close();
    io = null;
  });
}

/** Avisa os clientes conectados; os apps recarregam os dados ao receber. */
export function emit(event: 'order:new' | 'order:updated' | 'tables:changed' | 'cash:updated', payload: unknown = {}) {
  io?.emit(event, payload);
}
