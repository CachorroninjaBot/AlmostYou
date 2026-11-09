import { createRateLimiter } from '../rate-limit.js';
import type { RoomManager } from '../../rooms/room-manager.js';
import type { AppFastifyInstance } from '../../types.js';

const limiter = createRateLimiter();

export function registerRoomRoutes(app: AppFastifyInstance, rooms: RoomManager): void {
  app.get('/api/rooms', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const limit = limiter.track(request.ip);
    if (limit.limited) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply
        .code(429)
        .send({ error: 'rate_limited', retryAfter: limit.retryAfterSeconds });
    }
    return { rooms: rooms.listPublic() };
  });
}
