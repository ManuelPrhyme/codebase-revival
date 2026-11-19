import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const reportSyncAlert = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ state: z.enum(['failed', 'recovered']) }).parse(input))
  .handler(async ({ data, context }) => {
    // Authenticated users can only notify their own registered devices.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { enqueuePush, deliverPending } = await import('./push.server');
    const { localClock } = await import('./push-rules');
    const date = localClock(new Date()).date;
    await enqueuePush(supabaseAdmin, context.userId, { key: `sync:${data.state}:${date}`, category: 'quality', title: data.state === 'failed' ? 'Farm sync needs attention' : 'Farm sync restored', path: '/dashboard' });
    return deliverPending(supabaseAdmin, context.userId);
  });