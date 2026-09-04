"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LeadsAdditionalFilters } from "@/app/(app)/crm/leads-additional-filters";
import type { LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

interface LeadsFilterBarProps {
  leadSources: LeadSource[];
  profiles: ProfileOption[];
}

const SEARCH_DEBOUNCE_MS = 300;

export function LeadsFilterBar({ leadSources, profiles }: LeadsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(
    searchParams.get("search") ?? "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Qualquer mudança de busca/filtro volta para a primeira página — a
    // página atual pode nem existir mais no novo resultado.
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: value.trim() || null });
    }, SEARCH_DEBOUNCE_MS);
  }

  const filterKeys = [
    "search",
    "owner",
    "source",
    "temperature",
    "nextAction",
    "minValue",
    "maxValue",
  ];
  const hasActiveFilters = filterKeys.some((key) => searchParams.get(key));

  function handleClearAll() {
    setSearchValue("");
    router.replace(pathname);
  }

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        placeholder="Buscar por nome, empresa ou WhatsApp"
        value={searchValue}
        onChange={(event) => handleSearchChange(event.target.value)}
        aria-label="Buscar leads"
        className="sm:max-w-xs"
      />

      <Select
        aria-label="Filtrar por responsável"
        defaultValue={searchParams.get("owner") ?? ""}
        onChange={(event) => updateParams({ owner: event.target.value || null })}
        className="sm:max-w-[190px]"
      >
        <option value="">Todos os responsáveis</option>
        <option value="none">Sem responsável</option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filtrar por origem"
        defaultValue={searchParams.get("source") ?? ""}
        onChange={(event) => updateParams({ source: event.target.value || null })}
        className="sm:max-w-[190px]"
      >
        <option value="">Todas as origens</option>
        <option value="none">Sem origem</option>
        {leadSources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filtrar por temperatura"
        defaultValue={searchParams.get("temperature") ?? ""}
        onChange={(event) =>
          updateParams({ temperature: event.target.value || null })
        }
        className="sm:max-w-[170px]"
      >
        <option value="">Todas as temperaturas</option>
        <option value="COLD">Frio</option>
        <option value="WARM">Morno</option>
        <option value="HOT">Quente</option>
      </Select>

      <LeadsAdditionalFilters />

      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={handleClearAll}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
