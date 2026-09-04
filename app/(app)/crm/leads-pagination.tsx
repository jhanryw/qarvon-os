"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

interface LeadsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function LeadsPagination({ page, pageSize, total }: LeadsPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return null;

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
      <p>
        Página {page} de {totalPages} — {total} lead{total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
