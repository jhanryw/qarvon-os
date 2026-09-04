"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface LeadFormDefaultValues {
  name?: string;
  whatsapp?: string | null;
  company?: string | null;
  leadSourceId?: string | null;
  ownerId?: string | null;
  note?: string | null;
  email?: string | null;
  instagram?: string | null;
  website?: string | null;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  serviceInterest?: string | null;
  estimatedValue?: number | null;
  campaign?: string | null;
  revenueRange?: string | null;
  temperature?: "COLD" | "WARM" | "HOT" | null;
  nextAction?: string | null;
  /** ISO (UTC) — mesmo formato que sai de normalizeNextActionAt/vem do banco. */
  nextActionAt?: string | null;
}

export interface LeadFormOption {
  id: string;
  name: string;
  active: boolean;
}

interface LeadFormFieldsProps {
  defaultValues?: LeadFormDefaultValues;
  leadSources: LeadFormOption[];
  profiles: LeadFormOption[];
  fieldErrors?: Record<string, string>;
  autoFocusName?: boolean;
}

// Converte ISO (UTC) para o valor aceito por <input type="datetime-local">,
// no timezone do próprio browser — inverso da conversão feita ao enviar.
function isoToDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function hasAnyExtraValue(defaultValues?: LeadFormDefaultValues): boolean {
  if (!defaultValues) return false;
  return Boolean(
    defaultValues.email ||
      defaultValues.instagram ||
      defaultValues.website ||
      defaultValues.segment ||
      defaultValues.city ||
      defaultValues.state ||
      defaultValues.serviceInterest ||
      defaultValues.estimatedValue != null ||
      defaultValues.campaign ||
      defaultValues.revenueRange ||
      defaultValues.temperature ||
      defaultValues.nextAction ||
      defaultValues.nextActionAt,
  );
}

// Campos do cadastro/edição de lead, compartilhados entre criação (M1.3) e
// edição (M1.5) — evita duplicar os 19 campos em dois formulários. Uma
// source/responsável inativo aparece marcado, sem quebrar o valor já salvo
// (regra do M1.2: histórico não se quebra, só novas escolhas exigem ativo).
export function LeadFormFields({
  defaultValues,
  leadSources,
  profiles,
  fieldErrors,
  autoFocusName,
}: LeadFormFieldsProps) {
  const [showMore, setShowMore] = useState(() => hasAnyExtraValue(defaultValues));
  const nextActionAtIsoRef = useRef<HTMLInputElement>(null);

  // datetime-local não carrega timezone — convertemos para ISO usando o
  // timezone do próprio browser (contexto real do usuário) antes de
  // enviar, em vez de deixar o servidor reinterpretar um valor ambíguo.
  function handleNextActionAtChange(value: string) {
    if (nextActionAtIsoRef.current) {
      nextActionAtIsoRef.current.value = value
        ? new Date(value).toISOString()
        : "";
    }
  }

  function optionLabel(option: LeadFormOption): string {
    return option.active ? option.name : `${option.name} (inativa)`;
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          required
          autoFocus={autoFocusName}
          defaultValue={defaultValues?.name}
        />
        {fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
        )}
      </div>

      <div>
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          placeholder="(84) 99999-9999"
          autoComplete="tel"
          defaultValue={defaultValues?.whatsapp ?? undefined}
        />
      </div>

      <div>
        <Label htmlFor="company">Empresa</Label>
        <Input
          id="company"
          name="company"
          defaultValue={defaultValues?.company ?? undefined}
        />
      </div>

      <div>
        <Label htmlFor="leadSourceId">Origem</Label>
        <Select
          id="leadSourceId"
          name="leadSourceId"
          defaultValue={defaultValues?.leadSourceId ?? ""}
        >
          <option value="">Sem origem</option>
          {leadSources.map((source) => (
            <option key={source.id} value={source.id}>
              {optionLabel(source)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="ownerId">Responsável</Label>
        <Select
          id="ownerId"
          name="ownerId"
          defaultValue={defaultValues?.ownerId ?? ""}
        >
          <option value="">Sem responsável</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {optionLabel(profile)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="note">Observação</Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          defaultValue={defaultValues?.note ?? undefined}
        />
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          aria-expanded={showMore}
          aria-controls="lead-more-info"
          className="text-sm font-medium text-neutral-700 hover:text-neutral-900"
        >
          {showMore ? "Ocultar mais informações" : "Mais informações"}
        </button>

        {showMore && (
          <div id="lead-more-info" className="mt-4 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={defaultValues?.email ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                name="instagram"
                placeholder="@empresa"
                defaultValue={defaultValues?.instagram ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="website">Site</Label>
              <Input
                id="website"
                name="website"
                placeholder="empresa.com.br"
                defaultValue={defaultValues?.website ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="segment">Segmento</Label>
              <Input
                id="segment"
                name="segment"
                defaultValue={defaultValues?.segment ?? undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  name="city"
                  defaultValue={defaultValues?.city ?? undefined}
                />
              </div>
              <div>
                <Label htmlFor="state">Estado</Label>
                <Input
                  id="state"
                  name="state"
                  defaultValue={defaultValues?.state ?? undefined}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="serviceInterest">Serviço de interesse</Label>
              <Input
                id="serviceInterest"
                name="serviceInterest"
                defaultValue={defaultValues?.serviceInterest ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="estimatedValue">Valor estimado (R$)</Label>
              <Input
                id="estimatedValue"
                name="estimatedValue"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={defaultValues?.estimatedValue ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="campaign">Campanha</Label>
              <Input
                id="campaign"
                name="campaign"
                defaultValue={defaultValues?.campaign ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="revenueRange">Faixa de faturamento</Label>
              <Input
                id="revenueRange"
                name="revenueRange"
                defaultValue={defaultValues?.revenueRange ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="temperature">Temperatura</Label>
              <Select
                id="temperature"
                name="temperature"
                defaultValue={defaultValues?.temperature ?? ""}
              >
                <option value="">Não definida</option>
                <option value="COLD">Frio</option>
                <option value="WARM">Morno</option>
                <option value="HOT">Quente</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="nextAction">Próxima ação</Label>
              <Input
                id="nextAction"
                name="nextAction"
                defaultValue={defaultValues?.nextAction ?? undefined}
              />
            </div>

            <div>
              <Label htmlFor="nextActionAtLocal">Data da próxima ação</Label>
              <Input
                id="nextActionAtLocal"
                name="nextActionAtLocal"
                type="datetime-local"
                defaultValue={
                  defaultValues?.nextActionAt
                    ? isoToDatetimeLocalValue(defaultValues.nextActionAt)
                    : undefined
                }
                onChange={(event) =>
                  handleNextActionAtChange(event.target.value)
                }
              />
              <input
                ref={nextActionAtIsoRef}
                type="hidden"
                name="nextActionAt"
                defaultValue={defaultValues?.nextActionAt ?? ""}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
