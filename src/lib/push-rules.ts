export type FarmRow = { owner_id: string; table_name: string; id: string; data: unknown };
export type PushEvent = { key: string; category: string; title: string; path: string };
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function localClock(now: Date, timezone = 'Africa/Nairobi') {
  let zone = timezone;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(now); } catch { zone = 'Africa/Nairobi'; }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export function canDeliver(raw: unknown, category: string, now: Date) {
  const prefs = object(raw);
  if (object(prefs['categories'])[category] === false) return false;
  const time = localClock(now, typeof prefs['timezone'] === 'string' ? prefs['timezone'] : undefined).time;
  const from = typeof prefs['quietFrom'] === 'string' && /^\d{2}:\d{2}$/.test(prefs['quietFrom']) ? prefs['quietFrom'] : '21:00';
  const to = typeof prefs['quietTo'] === 'string' && /^\d{2}:\d{2}$/.test(prefs['quietTo']) ? prefs['quietTo'] : '06:00';
  return from === to || !(from < to ? time >= from && time < to : time >= from || time < to);
}
export function reminderEvents(rows: FarmRow[], date: string): PushEvent[] {
  const result: PushEvent[] = [];
  for (const row of rows) {
    const d = object(row.data);
    if (row.table_name === 'vaccinations' && d['done'] !== true && typeof d['dueDate'] === 'string' && d['dueDate'] <= date) {
      result.push({ key: `${row.owner_id}:vaccination:${row.id}:${d['dueDate']}`, category: 'schedule', title: 'Vaccination reminder', path: '/vaccination' });
    }
    if (row.table_name === 'medicineStock' && typeof d['expiry'] === 'string' && d['expiry'] <= date) {
      result.push({ key: `${row.owner_id}:expiry:${row.id}:${d['expiry']}`, category: 'expiry', title: 'Medication expiry reminder', path: '/medication' });
    }
    if (row.table_name === 'medicationApplications' && typeof d['date'] === 'string' && typeof d['withdrawalDays'] === 'number' && d['withdrawalDays'] >= 0) {
      const end = new Date(`${d['date'].slice(0, 10)}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + d['withdrawalDays']);
      if (Number.isFinite(end.getTime()) && end.toISOString().slice(0, 10) === date) result.push({ key: `${row.owner_id}:withdrawal:${row.id}:${date}`, category: 'expiry', title: 'Withdrawal period reminder', path: '/medication' });
    }
  }
  return result;
}
export function deliveryOutcome(status: number, body: string) {
  // INVALID_ARGUMENT alone can be a malformed payload, not a stale token.
  if (status === 404 && body.includes('UNREGISTERED')) return 'stale' as const;
  if (status === 429 || status >= 500) return 'retry' as const;
  return 'failed' as const;
}