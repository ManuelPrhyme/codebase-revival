import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { canDeliver, deliveryOutcome, localClock, object, reminderEvents, type PushEvent } from './push-rules';

type Client = SupabaseClient<Database>;
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
export async function enqueuePush(db: Client, userId: string, event: PushEvent) {
  const { data: devices, error } = await db.from('push_devices').select('token').eq('user_id', userId);
  check(error);
  if (!devices?.length) return;
  const write = await db.from('push_deliveries').upsert(devices.map(device => ({ user_id: userId, token: device.token, event_key: event.key, category: event.category, title: event.title, path: event.path })), { onConflict: 'user_id,event_key,token', ignoreDuplicates: true });
  check(write.error);
}
export async function deliverPending(db: Client, userId?: string) {
  const key = process.env['FIREBASE_MESSAGING_API_KEY'];
  const lovableKey = process.env['LOVABLE_API_KEY'];
  if (!key || !lovableKey) throw new Error('Firebase delivery is not configured');
  let query = db.from('push_deliveries').select('*').eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at').limit(25);
  if (userId) query = query.eq('user_id', userId);
  const { data: pending, error } = await query;
  check(error);
  let sent = 0;
  for (const row of pending ?? []) {
    const prefs = await db.from('user_preferences').select('data').eq('user_id', row.user_id).maybeSingle();
    check(prefs.error);
    if (!canDeliver(prefs.data?.data, row.category, new Date())) continue;
    const device = await db.from('push_devices').select('token').eq('user_id', row.user_id).eq('token', row.token).maybeSingle();
    check(device.error);
    if (!device.data) { check((await db.from('push_deliveries').update({ status: 'cancelled' }).eq('id', row.id)).error); continue; }
    const claim = await db.rpc('claim_push_delivery', { _id: row.id });
    check(claim.error);
    const claimed = claim.data?.[0];
    if (!claimed) continue;
    let status = 503, body = '';
    try {
      const response = await fetch('https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send', {
        method: 'POST', headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: row.token, notification: { title: row.title, body: 'Open KukuThrive to review this alert.' }, data: { path: row.path }, webpush: { notification: { tag: row.event_key } } } }),
        signal: AbortSignal.timeout(5000),
      });
      status = response.status;
      if (!response.ok) { body = await response.text(); console.error(`Firebase delivery failed [${status}]: ${body}`); }
    } catch { console.error('Firebase delivery request could not complete'); }
    const outcome = status >= 200 && status < 300 ? 'sent' : deliveryOutcome(status, body);
    if (outcome === 'stale') check((await db.from('push_devices').delete().eq('user_id', row.user_id).eq('token', row.token)).error);
    const delay = Math.min(24, 2 ** claimed.attempts) * 3600000;
    check((await db.from('push_deliveries').update({ status: outcome === 'retry' && claimed.attempts < 5 ? 'pending' : outcome, last_status: status, sent_at: outcome === 'sent' ? new Date().toISOString() : null, next_attempt_at: new Date(Date.now() + delay).toISOString() }).eq('id', row.id)).error);
    if (outcome === 'sent') sent++;
  }
  return { sent, checked: pending?.length ?? 0 };
}
export async function scheduledReminders(db: Client) {
  const devices = await db.from('push_devices').select('user_id');
  check(devices.error);
  for (const userId of new Set((devices.data ?? []).map(d => d.user_id))) {
    const prefs = await db.from('user_preferences').select('data').eq('user_id', userId).maybeSingle();
    check(prefs.error);
    const p = object(prefs.data?.data);
    const clock = localClock(new Date(), typeof p['timezone'] === 'string' ? p['timezone'] : undefined);
    if (clock.time < '08:00') continue;
    const membership = await db.from('farm_members').select('owner_id').eq('user_id', userId);
    check(membership.error);
    const owners = [...new Set([userId, ...(membership.data ?? []).map(m => m.owner_id)])];
    const records = await db.from('record_store').select('owner_id,table_name,id,data').in('owner_id', owners).in('table_name', ['vaccinations', 'medicineStock', 'medicationApplications']).is('deleted_at', null);
    check(records.error);
    for (const event of reminderEvents(records.data ?? [], clock.date)) await enqueuePush(db, userId, event);
  }
  return deliverPending(db);
}