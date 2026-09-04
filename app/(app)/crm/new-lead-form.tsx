"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createLeadAction, type CreateLeadActionState } from "@/lib/leads/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

interface NewLeadFormProps {
  leadSources: LeadSource[];
  profiles: ProfileOption[];
  onSuccess: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const initialState: CreateLeadActionState = { status: "idle" };

export function NewLeadForm({
  leadSources,
  profiles,
  onSuccess,
  onCancel,
  onDirtyChange,
}: NewLeadFormProps) {
  const [state, formAction, isPending] = useActionState(
    createLeadAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const nextActionAtIsoRef = useRef<HTMLInputElement>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      onSuccess();
    }
  }, [state, onSuccess]);

  function handleFormChange() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const hasValue = Array.from(formData.entries()).some(
      ([key, value]) =>
        key !== "nextActionAtLocal" &&
        typeof value === "string" &&
        value.trim() !== "",
    );
    onDirtyChange(hasValue);
  }

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

  return (
    <form ref={formRef} action={formAction} onChange={handleFormChange}>
      <div className="space-y-4">
        {state.status === "error" && state.message && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.message}
          </p>
        )}

        <div>
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required autoFocus />
          {state.fieldErrors?.name && (
            <p className="mt-1 text-xs text-red-600">
              {state.fieldErrors.name}
            </p>
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
          />
        </div>

        <div>
          <Label htmlFor="company">Empresa</Label>
          <Input id="company" name="company" />
        </div>

        <div>
          <Label htmlFor="leadSourceId">Origem</Label>
          <Select id="leadSourceId" name="leadSourceId" defaultValue="">
            <option value="">Sem origem</option>
            {leadSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="ownerId">Responsável</Label>
          <Select id="ownerId" name="ownerId" defaultValue="">
            <option value="">Sem responsável</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="note">Observação</Label>
          <Textarea id="note" name="note" rows={2} />
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
                <Input id="email" name="email" type="email" />
              </div>

              <div>
                <Label htmlFor="instagram">Instagram</Label>
                <Input id="instagram" name="instagram" placeholder="@empresa" />
              </div>

              <div>
                <Label htmlFor="website">Site</Label>
                <Input id="website" name="website" placeholder="empresa.com.br" />
              </div>

              <div>
                <Label htmlFor="segment">Segmento</Label>
                <Input id="segment" name="segment" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" name="city" />
                </div>
                <div>
                  <Label htmlFor="state">Estado</Label>
                  <Input id="state" name="state" />
                </div>
              </div>

              <div>
                <Label htmlFor="serviceInterest">Serviço de interesse</Label>
                <Input id="serviceInterest" name="serviceInterest" />
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
                />
              </div>

              <div>
                <Label htmlFor="campaign">Campanha</Label>
                <Input id="campaign" name="campaign" />
              </div>

              <div>
                <Label htmlFor="revenueRange">Faixa de faturamento</Label>
                <Input id="revenueRange" name="revenueRange" />
              </div>

              <div>
                <Label htmlFor="temperature">Temperatura</Label>
                <Select id="temperature" name="temperature" defaultValue="">
                  <option value="">Não definida</option>
                  <option value="COLD">Frio</option>
                  <option value="WARM">Morno</option>
                  <option value="HOT">Quente</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="nextAction">Próxima ação</Label>
                <Input id="nextAction" name="nextAction" />
              </div>

              <div>
                <Label htmlFor="nextActionAtLocal">
                  Data da próxima ação
                </Label>
                <Input
                  id="nextActionAtLocal"
                  name="nextActionAtLocal"
                  type="datetime-local"
                  onChange={(event) =>
                    handleNextActionAtChange(event.target.value)
                  }
                />
                <input
                  ref={nextActionAtIsoRef}
                  type="hidden"
                  name="nextActionAt"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-neutral-200 bg-white pt-4 pb-1">
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? "Salvando..." : "Salvar lead"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
