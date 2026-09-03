import { Card } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">
        Dashboard
      </h1>
      <Card>
        <p className="text-sm text-neutral-500">
          Os KPIs comerciais e financeiros aparecerão aqui a partir dos
          próximos milestones.
        </p>
      </Card>
    </div>
  );
}
