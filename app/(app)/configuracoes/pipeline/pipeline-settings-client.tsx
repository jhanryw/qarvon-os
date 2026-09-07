"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import {
  createPipelineStageAction,
  updatePipelineStageAction,
  reorderPipelineStagesAction,
  deletePipelineStageAction,
  checkStageLeadCountAction,
} from "@/lib/pipeline/actions";
import type { PipelineStageWithFlags } from "@/lib/pipeline/queries";

interface PipelineSettingsClientProps {
  pipelineId: string;
  initialStages: PipelineStageWithFlags[];
}

interface DeleteState {
  stage: PipelineStageWithFlags;
  leadCount: number | null;
  reassignToStageId: string;
}

function StaticStageRow({ stage, badge }: { stage: PipelineStageWithFlags; badge: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-900">{stage.name}</span>
        <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
          {badge}
        </span>
      </div>
      <span className="text-xs text-neutral-500">
        {stage.leadCount} lead{stage.leadCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function SortableStageRow({
  stage,
  onRename,
  onToggleActive,
  onDelete,
  isPending,
}: {
  stage: PipelineStageWithFlags;
  onRename: (stageId: string, name: string) => void;
  onToggleActive: (stageId: string, active: boolean) => void;
  onDelete: (stage: PipelineStageWithFlags) => void;
  isPending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });
  const [name, setName] = useState(stage.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2",
        isDragging && "opacity-50",
        !stage.active && "opacity-60",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none px-1 text-neutral-400 active:cursor-grabbing"
        aria-label="Reordenar"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== stage.name) onRename(stage.id, name.trim());
        }}
        className="flex-1"
        disabled={isPending}
      />

      <span className="whitespace-nowrap text-xs text-neutral-500">
        {stage.leadCount} lead{stage.leadCount === 1 ? "" : "s"}
      </span>

      <Button
        type="button"
        variant="secondary"
        onClick={() => onToggleActive(stage.id, !stage.active)}
        disabled={isPending}
      >
        {stage.active ? "Desativar" : "Ativar"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={() => onDelete(stage)}
        disabled={isPending}
        className="text-red-600 hover:bg-red-50"
      >
        Excluir
      </Button>
    </div>
  );
}

export function PipelineSettingsClient({
  pipelineId,
  initialStages,
}: PipelineSettingsClientProps) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [newStageName, setNewStageName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const leadNovo = stages.find((stage) => stage.isLeadNovo);
  const won = stages.find((stage) => stage.stage_type === "WON");
  const lost = stages.find((stage) => stage.stage_type === "LOST");
  const intermediate = stages
    .filter((stage) => stage.stage_type === "OPEN" && !stage.isLeadNovo)
    .sort((a, b) => a.position - b.position);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function handleCreate() {
    const name = newStageName.trim();
    if (!name) return;
    setError(null);

    startTransition(async () => {
      const result = await createPipelineStageAction({ pipelineId, name });
      if (result.success) {
        setNewStageName("");
        router.refresh();
      } else {
        setError(result.message ?? "Falha ao criar etapa.");
      }
    });
  }

  function handleRename(stageId: string, name: string) {
    setError(null);
    startTransition(async () => {
      const result = await updatePipelineStageAction({ stageId, name, active: null });
      if (result.success) {
        setStages((prev) => prev.map((stage) => (stage.id === stageId ? { ...stage, name } : stage)));
        router.refresh();
      } else {
        setError(result.message ?? "Falha ao renomear etapa.");
        router.refresh();
      }
    });
  }

  function handleToggleActive(stageId: string, active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updatePipelineStageAction({ stageId, name: null, active });
      if (result.success) {
        setStages((prev) => prev.map((stage) => (stage.id === stageId ? { ...stage, active } : stage)));
        showToast(active ? "Etapa ativada." : "Etapa desativada.");
      } else {
        setError(result.message ?? "Falha ao atualizar etapa.");
      }
      router.refresh();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;

    const oldIndex = intermediate.findIndex((stage) => stage.id === event.active.id);
    const newIndex = intermediate.findIndex((stage) => stage.id === event.over!.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(intermediate, oldIndex, newIndex);
    const previousStages = stages;

    // Otimista: aplica a nova ordem localmente (recalculando "position"
    // só para exibição — o valor real vem do banco no próximo refresh).
    setStages((prev) =>
      prev.map((stage) => {
        const newPosition = reordered.findIndex((item) => item.id === stage.id);
        return newPosition === -1 ? stage : { ...stage, position: newPosition };
      }),
    );

    startTransition(async () => {
      const result = await reorderPipelineStagesAction({
        pipelineId,
        stageIds: reordered.map((stage) => stage.id),
      });
      if (result.success) {
        router.refresh();
      } else {
        setStages(previousStages);
        setError(result.message ?? "Falha ao reordenar etapas.");
      }
    });
  }

  async function handleDeleteClick(stage: PipelineStageWithFlags) {
    setError(null);
    const check = await checkStageLeadCountAction(stage.id);
    if ("error" in check) {
      setError(check.error);
      return;
    }
    if (check.leadCount === 0) {
      const confirmed = window.confirm(`Excluir a etapa "${stage.name}"? Esta ação não pode ser desfeita.`);
      if (!confirmed) return;
      runDelete(stage.id, null);
      return;
    }
    setDeleteState({ stage, leadCount: check.leadCount, reassignToStageId: "" });
  }

  function runDelete(stageId: string, reassignToStageId: string | null) {
    startTransition(async () => {
      const result = await deletePipelineStageAction({ stageId, reassignToStageId });
      if (result.success) {
        setStages((prev) => prev.filter((stage) => stage.id !== stageId));
        setDeleteState(null);
        showToast("Etapa excluída.");
        router.refresh();
      } else {
        setError(result.message ?? "Falha ao excluir etapa.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {leadNovo && <StaticStageRow stage={leadNovo} badge="Lead Novo" />}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={intermediate.map((stage) => stage.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {intermediate.map((stage) => (
                <SortableStageRow
                  key={stage.id}
                  stage={stage}
                  onRename={handleRename}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteClick}
                  isPending={isPending}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex gap-2 rounded-md border border-dashed border-neutral-300 p-2">
          <Input
            placeholder="Nome da nova etapa (ex.: Proposta Enviada)"
            value={newStageName}
            onChange={(event) => setNewStageName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreate();
              }
            }}
          />
          <Button type="button" onClick={handleCreate} disabled={isPending || !newStageName.trim()}>
            Adicionar etapa
          </Button>
        </div>

        {won && <StaticStageRow stage={won} badge="Ganho" />}
        {lost && <StaticStageRow stage={lost} badge="Perdido" />}
      </div>

      {deleteState && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="mb-3 text-sm text-amber-900">
            A etapa <strong>{deleteState.stage.name}</strong> tem{" "}
            {deleteState.leadCount} lead{deleteState.leadCount === 1 ? "" : "s"}. Escolha
            para qual etapa eles devem ir antes de excluir — nenhum lead será apagado.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={deleteState.reassignToStageId}
              onChange={(event) =>
                setDeleteState((prev) => (prev ? { ...prev, reassignToStageId: event.target.value } : prev))
              }
              className="max-w-xs"
            >
              <option value="">Selecione a etapa de destino</option>
              {intermediate
                .filter((stage) => stage.id !== deleteState.stage.id)
                .map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              {leadNovo && leadNovo.id !== deleteState.stage.id && (
                <option value={leadNovo.id}>{leadNovo.name}</option>
              )}
            </Select>
            <Button
              type="button"
              disabled={!deleteState.reassignToStageId || isPending}
              onClick={() => runDelete(deleteState.stage.id, deleteState.reassignToStageId)}
            >
              Confirmar e excluir
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDeleteState(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
