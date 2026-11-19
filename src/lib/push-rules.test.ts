import { describe, expect, it } from 'vitest';
import { canDeliver, deliveryOutcome, localClock, reminderEvents } from './push-rules';
describe('Farm push rules', () => {
  it('uses Nairobi time for the daily reminder window', () => {
    expect(localClock(new Date('2026-11-19T05:00:00Z'))).toEqual({ date: '2026-11-19', time: '08:00' });
  });
  it('respects category opt-out', () => {
    expect(canDeliver({ categories: { schedule: false } }, 'schedule', new Date('2026-11-19T05:00:00Z'))).toBe(false);
  });
  it('defers normal deliveries during overnight quiet hours', () => {
    expect(canDeliver({}, 'quality', new Date('2026-11-19T20:00:00Z'))).toBe(false);
    expect(canDeliver({}, 'quality', new Date('2026-11-19T03:00:00Z'))).toBe(true);
  });
  it('only reminds for incomplete due vaccinations', () => {
    const rows = [false, true].map((done, i) => ({ owner_id: 'farm', id: String(i), table_name: 'vaccinations', data: { done, dueDate: '2026-11-19' } }));
    expect(reminderEvents(rows, '2026-11-19').map(e => e.key)).toEqual(['farm:vaccination:0:2026-11-19']);
  });
  it('deduplicates vaccination reminders across later dates using the due date', () => {
    const rows = [{ owner_id: 'farm', id: 'v', table_name: 'vaccinations', data: { done: false, dueDate: '2026-11-19' } }];
    expect(reminderEvents(rows, '2026-11-20')[0]?.key).toBe(reminderEvents(rows, '2026-11-19')[0]?.key);
  });
  it('retries only transient failures and removes explicitly unregistered tokens', () => {
    expect(deliveryOutcome(429, '')).toBe('retry');
    expect(deliveryOutcome(503, '')).toBe('retry');
    expect(deliveryOutcome(404, 'UNREGISTERED')).toBe('stale');
    expect(deliveryOutcome(400, 'INVALID_ARGUMENT')).toBe('failed');
  });
});