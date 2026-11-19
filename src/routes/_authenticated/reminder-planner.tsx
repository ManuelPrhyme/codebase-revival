import { createFileRoute } from "@tanstack/react-router";
import { ReminderPlannerScreen } from "@/features/reminder-planner/ReminderPlannerScreen";
const t = "Reminder Planner · KukuThrive", d = "Describe a farm task and get an AI-tailored reminder plan.";
export const Route = createFileRoute("/_authenticated/reminder-planner")({
  head: () => ({ meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReminderPlannerScreen,
});
