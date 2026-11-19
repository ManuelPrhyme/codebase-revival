import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createReminderPlan, type ReminderPlan } from "@/lib/reminder-plan.functions";
import { ModuleHeader, Panel } from "@/features/kukuthrive/ui";

const tone = { high: "bg-destructive/10 text-destructive", medium: "bg-primary/10 text-primary", low: "bg-muted text-muted-foreground" };

export function ReminderPlannerScreen() {
  const run = useServerFn(createReminderPlan);
  const [task, setTask] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [plan, setPlan] = useState<ReminderPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (task.trim().length < 5) return setError("Describe the task in a few words.");
    setBusy(true); setError(""); setPlan(null);
    try {
      const r = await run({ data: { task, startDate } });
      if (r.error) setError(r.error); else if (r.plan) setPlan(r.plan);
    } catch { setError("Could not create a plan right now."); }
    finally { setBusy(false); }
  }

  function copy() {
    if (!plan) return;
    const t = [plan.summary, "", ...plan.reminders.map((r) => `• ${r.when} — ${r.title}: ${r.details}`)].join("\n");
    navigator.clipboard.writeText(t).then(() => toast.success("Plan copied"));
  }

  return (
    <div className="space-y-6">
      <ModuleHeader eyebrow="Assistant" title="Reminder planner" description="Describe a farm task and get a tailored, step-by-step reminder plan." />
      <Panel title="Describe the task">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task">Task</Label>
            <Textarea id="task" rows={4} value={task} maxLength={2000} onChange={(e) => setTask(e.target.value)}
              placeholder="e.g. Newcastle vaccination for 500 layer chicks in House B, plus a booster" />
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="start">Start date</Label>
            <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {busy ? "Planning…" : "Create plan"}
          </Button>
        </form>
      </Panel>
      {plan && (
        <Panel title="Your reminder plan" description={plan.summary}
          action={<Button variant="outline" size="sm" onClick={copy}><Copy className="mr-2 h-4 w-4" />Copy</Button>}>
          <ol className="space-y-3">
            {plan.reminders.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-lg border p-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    <span className={`rounded px-2 py-0.5 text-xs capitalize ${tone[r.priority]}`}>{r.priority}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.when}</p>
                  <p className="mt-1 text-sm">{r.details}</p>
                </div>
              </li>
            ))}
          </ol>
          {plan.tips.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{plan.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          )}
        </Panel>
      )}
    </div>
  );
}
