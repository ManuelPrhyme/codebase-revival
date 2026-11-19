import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/jobs/farm-reminders')({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    const parsed = z.object({ kind: z.literal('farm-reminders') }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { scheduledReminders } = await import('@/lib/push.server');
    return Response.json(await scheduledReminders(supabaseAdmin), { headers: { 'Cache-Control': 'no-store' } });
  } } },
});