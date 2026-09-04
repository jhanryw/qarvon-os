// Transforma o FormData bruto do formulário de cadastro rápido no shape
// aceito por createLeadSchema. Puro e testável — não chama createLead.
//
// nextActionAt chega aqui já convertido para ISO (UTC) pelo próprio
// formulário no browser: um <input type="datetime-local"> não carrega
// timezone nenhuma, então só o browser (contexto real do usuário) pode
// interpretar corretamente a que instante aquilo corresponde. Fazer essa
// conversão no servidor seria usar o timezone arbitrário do container.

const KNOWN_TEMPERATURES = new Set(["COLD", "WARM", "HOT"]);

function getTrimmedString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function getNumber(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function getTemperature(
  formData: FormData,
): "COLD" | "WARM" | "HOT" | undefined {
  const raw = formData.get("temperature");
  if (typeof raw !== "string" || !KNOWN_TEMPERATURES.has(raw)) return undefined;
  return raw as "COLD" | "WARM" | "HOT";
}

export function parseCreateLeadFormData(formData: FormData): Record<string, unknown> {
  return {
    name: getTrimmedString(formData, "name"),
    whatsapp: getTrimmedString(formData, "whatsapp"),
    company: getTrimmedString(formData, "company"),
    leadSourceId: getTrimmedString(formData, "leadSourceId"),
    ownerId: getTrimmedString(formData, "ownerId"),
    note: getTrimmedString(formData, "note"),
    email: getTrimmedString(formData, "email"),
    instagram: getTrimmedString(formData, "instagram"),
    website: getTrimmedString(formData, "website"),
    segment: getTrimmedString(formData, "segment"),
    city: getTrimmedString(formData, "city"),
    state: getTrimmedString(formData, "state"),
    serviceInterest: getTrimmedString(formData, "serviceInterest"),
    estimatedValue: getNumber(formData, "estimatedValue"),
    campaign: getTrimmedString(formData, "campaign"),
    revenueRange: getTrimmedString(formData, "revenueRange"),
    temperature: getTemperature(formData),
    nextAction: getTrimmedString(formData, "nextAction"),
    nextActionAt: getTrimmedString(formData, "nextActionAt"),
  };
}
