"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  updateLeadAction,
  type LeadFormActionState,
} from "@/lib/leads/actions";
import { Button } from "@/components/ui/button";
import {
  LeadFormFields,
  type LeadFormDefaultValues,
} from "@/app/(app)/crm/lead-form-fields";
import type { Lead, LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

interface EditLeadFormProps {
  lead: Lead;
  leadSources: LeadSource[];
  profiles: ProfileOption[];
  onSuccess: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const initialState: LeadFormActionState = { status: "idle" };

function leadToDefaultValues(lead: Lead): LeadFormDefaultValues {
  return {
    name: lead.name,
    whatsapp: lead.whatsapp,
    company: lead.company,
    leadSourceId: lead.lead_source_id,
    ownerId: lead.owner_id,
    note: lead.note,
    email: lead.email,
    instagram: lead.instagram,
    website: lead.website,
    segment: lead.segment,
    city: lead.city,
    state: lead.state,
    serviceInterest: lead.service_interest,
    estimatedValue: lead.estimated_value,
    campaign: lead.campaign,
    revenueRange: lead.revenue_range,
    temperature: lead.temperature,
    nextAction: lead.next_action,
    nextActionAt: lead.next_action_at,
  };
}

function snapshot(form: HTMLFormElement): string {
  const formData = new FormData(form);
  return JSON.stringify(
    Array.from(formData.entries()).filter(
      ([key]) => key !== "nextActionAtLocal",
    ),
  );
}

export function EditLeadForm({
  lead,
  leadSources,
  profiles,
  onSuccess,
  onCancel,
  onDirtyChange,
}: EditLeadFormProps) {
  const boundAction = updateLeadAction.bind(null, lead.id);
  const [state, formAction, isPending] = useActionState(
    boundAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshotRef = useRef<string>("");

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
    }
  }, [state, onSuccess]);

  // Captura o estado inicial uma única vez, no mount deste lead.
  useEffect(() => {
    if (formRef.current) {
      initialSnapshotRef.current = snapshot(formRef.current);
    }
  }, []);

  function handleFormChange() {
    if (!formRef.current) return;
    onDirtyChange(snapshot(formRef.current) !== initialSnapshotRef.current);
  }

  return (
    <form ref={formRef} action={formAction} onChange={handleFormChange}>
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}

      <LeadFormFields
        defaultValues={leadToDefaultValues(lead)}
        leadSources={leadSources}
        profiles={profiles}
        fieldErrors={state.fieldErrors}
      />

      <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-neutral-200 bg-white pt-4 pb-1">
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? "Salvando..." : "Salvar alterações"}
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
