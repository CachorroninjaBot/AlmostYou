import { localeCodeSchema } from '@almost-you/shared';
import type { ContentService } from '../../content/content-loader.js';
import type { AppFastifyInstance } from '../../types.js';

export function registerContentRoutes(
  app: AppFastifyInstance,
  content: ContentService,
): void {
  app.get('/api/locales', async (_request, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return content.getLocalesResponse();
  });

  app.get<{ Params: { locale: string } }>('/api/locales/:locale', async (request, reply) => {
    const parsed = localeCodeSchema.safeParse(request.params.locale);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_locale' });
    }

    const resource = content.getLocalizedResource(parsed.data);
    if (!resource) {
      return reply.code(404).send({ error: 'locale_not_found' });
    }

    reply.header('Cache-Control', 'public, max-age=300');
    return resource;
  });
}
