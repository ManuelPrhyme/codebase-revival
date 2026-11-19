import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type ReminderPlan = {
  summary: string;
  reminders: { title: string; when: string; details: string; priority: 'high' | 'medium' | 'low' }[];
  tips: string[];
};

const schema = {
  type: 'object', additionalProperties: false, required: ['summary', 'reminders', 'tips'],
  properties: {
    summary: { type: 'string' },
    reminders: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'when', 'details', 'priority'],
      properties: { title: { type: 'string' }, when: { type: 'string' }, details: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } } } },
    tips: { type: 'array', items: { type: 'string' } },
  },
};

export const createReminderPlan = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ task: z.string().trim().min(5).max(2000), startDate: z.string().max(20) }).parse(input))
  .handler(async ({ data }): Promise<{ plan?: ReminderPlan; error?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: 'The AI planner is not configured yet.' };
    const res = await fetch('https://ai.gateway.lovable.dev/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra', stream: true, store: false, reasoning: { effort: 'low' },
        instructions: 'You are a poultry farm operations assistant in Kenya (Nairobi time). Turn the manager\'s task into a practical, ordered reminder plan with concrete dates/times relative to the start date, preparation steps, follow-ups and welfare/biosecurity checks. Keep each reminder short. 3-10 reminders.',
        input: [{ role: 'user', content: `Start date: ${data.startDate}\nTask: ${data.task}` }],
        text: { format: { type: 'json_schema', name: 'reminder_plan', strict: true, schema } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      console.error('AI gateway error', res.status, body.slice(0, 500));
      if (res.status === 429) return { error: 'The planner is busy. Please try again in a minute.' };
      if (res.status === 402) return { error: 'AI credits are used up for this workspace.' };
      return { error: 'Could not create a plan right now.' };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === 'response.output_text.delta') text += ev.delta;
          if (ev.type === 'response.refusal.delta') refused = true;
          if (ev.type === 'error' || ev.type === 'response.failed') return { error: 'Could not create a plan right now.' };
        } catch { /* partial frame */ }
      }
    }
    if (refused) return { error: 'The planner declined this request.' };
    try { return { plan: JSON.parse(text) as ReminderPlan }; } catch { return { error: 'The plan came back incomplete. Please try again.' }; }
  });
