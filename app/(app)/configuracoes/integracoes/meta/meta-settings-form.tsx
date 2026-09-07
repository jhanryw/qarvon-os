"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { upsertMetaIntegrationSettingsAction } from "@/lib/integrations/meta/actions";
import type { MetaIntegrationSettings } from "@/lib/integrations/meta/queries";

interface MetaSettingsFormProps {
  initialSettings: MetaIntegrationSettings;
}

// accessToken NUNCA é pré-preenchido com o valor real (o backend nunca o
// devolve, ver get_meta_integration_settings) — o campo começa vazio
// sempre; deixar em branco ao salvar preserva o token já configurado (ver
// upsert_meta_integration).
export function MetaSettingsForm({ initialSettings }: MetaSettingsFormProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [pixelId, setPixelId] = useState(initialSettings.pixelId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [mode, setMode] = useState<"MRR" | "TCV">(initialSettings.conversionValueMode);
  const [active, setActive] = useState(initialSettings.active);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await upsertMetaIntegrationSettingsAction({
        pixelId: pixelId.trim() || null,
        accessToken: accessToken.trim() || null,
        conversionValueMode: mode,
        active,
      });

      if (result.success && result.settings) {
        setSettings(result.settings);
        setAccessToken("");
        setSuccess("Configuração salva.");
        router.refresh();
      } else {
        setError(result.message ?? "Falha ao salvar configuração.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="mb-4 text-base font-semibold text-neutral-900">Meta Conversions API</h2>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      )}

      <div className="mb-4">
        <Label htmlFor="meta-pixel-id">Pixel / Dataset ID</Label>
        <Input
          id="meta-pixel-id"
          value={pixelId}
          onChange={(event) => setPixelId(event.target.value)}
          placeholder="Ex.: 123456789012345"
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="meta-access-token">Access Token da Conversions API</Label>
        <Input
          id="meta-access-token"
          type="password"
          autoComplete="off"
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          placeholder={
            settings.hasAccessToken
              ? "•••••••••••• já configurado — deixe em branco para manter"
              : "Cole o access token"
          }
        />
        <p className="mt-1 text-xs text-neutral-500">
          {settings.hasAccessToken
            ? "Um token já está configurado e nunca é reexibido aqui. Preencha só se quiser trocá-lo."
            : "Nenhum token configurado ainda."}
        </p>
      </div>

      <div className="mb-4">
        <Label htmlFor="meta-value-mode">Valor de conversão enviado</Label>
        <Select
          id="meta-value-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as "MRR" | "TCV")}
        >
          <option value="TCV">TCV — valor total do contrato</option>
          <option value="MRR">MRR — recorrência mensal</option>
        </Select>
        <p className="mt-1 text-xs text-neutral-500">
          O CRM continua guardando os dois valores quando disponíveis — esta
          escolha só define o que é enviado para a Meta.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          id="meta-active"
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        <Label htmlFor="meta-active" className="mb-0">
          Integração ativa
        </Label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar configuração"}
      </Button>
    </form>
  );
}
