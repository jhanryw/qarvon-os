"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NEXT_ACTION_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "overdue", label: "Atrasadas" },
  { value: "today", label: "Hoje" },
  { value: "future", label: "Futuras" },
  { value: "none", label: "Sem próxima ação" },
];

// Painel separado da barra principal para não sobrecarregar a barra com
// mais 3 campos — os filtros mais usados (busca/responsável/origem/
// temperatura) continuam sempre visíveis, estes ficam atrás de um botão.
export function LeadsAdditionalFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const [nextAction, setNextAction] = useState(
    searchParams.get("nextAction") ?? "",
  );
  const [minValue, setMinValue] = useState(searchParams.get("minValue") ?? "");
  const [maxValue, setMaxValue] = useState(searchParams.get("maxValue") ?? "");

  const activeCount = [
    searchParams.get("nextAction"),
    searchParams.get("minValue"),
    searchParams.get("maxValue"),
  ].filter(Boolean).length;

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleApply() {
    updateParams({
      nextAction: nextAction || null,
      minValue: minValue || null,
      maxValue: maxValue || null,
    });
    setOpen(false);
  }

  function handleClear() {
    setNextAction("");
    setMinValue("");
    setMaxValue("");
    updateParams({ nextAction: null, minValue: null, maxValue: null });
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
        Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-neutral-200 bg-white p-4 shadow-lg">
          <div className="mb-3">
            <Label htmlFor="nextActionFilter">Próxima ação</Label>
            <Select
              id="nextActionFilter"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
            >
              {NEXT_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="minValue">Valor mín. (R$)</Label>
              <Input
                id="minValue"
                type="number"
                min="0"
                step="0.01"
                value={minValue}
                onChange={(event) => setMinValue(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="maxValue">Valor máx. (R$)</Label>
              <Input
                id="maxValue"
                type="number"
                min="0"
                step="0.01"
                value={maxValue}
                onChange={(event) => setMaxValue(event.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={handleApply} className="flex-1">
              Aplicar
            </Button>
            <Button type="button" variant="secondary" onClick={handleClear}>
              Limpar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
