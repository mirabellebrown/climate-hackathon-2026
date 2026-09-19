import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";

export const metadata: Metadata = {
  title: "Team usage dashboard — GreenRoute",
  description: "Manager view of team lifetime savings, cost vs Always Pro, budget, use cases, and environmental impact.",
};

export default function DashboardPage() {
  return <DashboardView />;
}
