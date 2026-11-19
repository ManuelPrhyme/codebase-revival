import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverPending } from './push.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function fixture() {
  const writes: unknown[] = [];
  const row = { id: 'delivery', user_id: 'owner', token: 'test-device', category: 'schedule', title: 'Vaccination reminder', path: '/vaccination', event_key: 'farm:vaccine', attempts: 0 };
  const db = {
    from: (table: string) => {
      const result = table === 'push_deliveries' ? [row] : table === 'push_devices' ? { token: row.token } : { data: { quietFrom: '00:00', quietTo: '00:00' } };
      const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => void) => resolve({ data: result, error: null }) };
      for (const method of ['select', 'eq', 'lte', 'order', 'limit', 'maybeSingle', 'delete']) chain[method] = () => chain;
      chain['update'] = (value: unknown) => { writes.push(value); return chain; };
      return chain;
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ ...row, attempts: 1 }], error: null }),
  } as unknown as SupabaseClient<Database>;
  vi.stubEnv('LOVABLE_API_KEY', 'test-gateway');
  vi.stubEnv('FIREBASE_MESSAGING_API_KEY', 'test-connection');
  return { db, writes };
}
describe('Server push delivery', () => {
  it('sends a generic alert through Firebase and records success', async () => {
    const { db, writes } = fixture();
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    expect(await deliverPending(db, 'owner')).toEqual({ sent: 1, checked: 1 });
    expect(send.mock.calls[0]?.[0]).toBe('https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send');
    const payload = JSON.parse(send.mock.calls[0]?.[1].body);
    expect(payload.message.token).toBe('test-device');
    expect(payload.message.data.path).toBe('/vaccination');
    expect(writes).toContainEqual(expect.objectContaining({ status: 'sent', last_status: 200 }));
  });
  it('keeps transient failures pending for a later retry', async () => {
    const { db, writes } = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
    expect((await deliverPending(db)).sent).toBe(0);
    expect(writes).toContainEqual(expect.objectContaining({ status: 'pending', last_status: 503 }));
  });
});