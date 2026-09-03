import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/crm", label: "CRM" },
  { href: "/financeiro", label: "Financeiro" },
];

interface SidebarProps {
  userName: string;
  organizationName: string;
}

export function Sidebar({ userName, organizationName }: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-5">
        <p className="text-sm font-semibold text-neutral-900">Qarvon OS</p>
        <p className="text-xs text-neutral-500">{organizationName}</p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-neutral-200 px-4 py-4">
        <p className="mb-2 truncate text-xs text-neutral-500">{userName}</p>
        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full">
            Sair
          </Button>
        </form>
      </div>
    </aside>
  );
}
