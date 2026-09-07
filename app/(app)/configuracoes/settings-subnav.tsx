import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/configuracoes/pipeline", label: "Pipeline", key: "pipeline" as const },
  { href: "/configuracoes/integracoes/meta", label: "Integrações", key: "integracoes" as const },
];

interface SettingsSubnavProps {
  active: "pipeline" | "integracoes";
}

export function SettingsSubnav({ active }: SettingsSubnavProps) {
  return (
    <div className="mb-6 flex gap-4 border-b border-neutral-200">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "border-b-2 px-1 pb-3 text-sm font-medium",
            active === tab.key
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:text-neutral-700",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
