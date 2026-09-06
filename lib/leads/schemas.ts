import { z } from "zod";
import { revenueRangeCodeSchema } from "@/lib/leads/revenue-range";

export const leadTemperatureSchema = z.enum(["COLD", "WARM", "HOT"]);

// Campos que o client pode enviar. id/organization_id/created_at/updated_at
// não existem aqui de propósito — não pertencem ao client. `.strict()`
// rejeita explicitamente qualquer chave a mais (ex.: organization_id
// injetado), em vez de simplesmente ignorá-la em silêncio.
const leadFields = {
  name: z.string().trim().min(1, "Nome é obrigatório"),
  whatsapp: z.string().trim().min(1).optional().nullable(),
  company: z.string().trim().min(1).optional().nullable(),
  leadSourceId: z.string().uuid().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  note: z.string().trim().min(1).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  instagram: z.string().trim().min(1).optional().nullable(),
  website: z.string().trim().min(1).optional().nullable(),
  segment: z.string().trim().min(1).optional().nullable(),
  city: z.string().trim().min(1).optional().nullable(),
  state: z.string().trim().min(1).optional().nullable(),
  serviceInterest: z.string().trim().min(1).optional().nullable(),
  estimatedValue: z.number().finite().nonnegative().optional().nullable(),
  campaign: z.string().trim().min(1).optional().nullable(),
  revenueRange: revenueRangeCodeSchema.optional().nullable(),
  temperature: leadTemperatureSchema.optional().nullable(),
  nextAction: z.string().trim().min(1).optional().nullable(),
  nextActionAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "next_action_at precisa ser uma data/hora válida",
    })
    .optional()
    .nullable(),
};

export const createLeadSchema = z.object(leadFields).strict();
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object(leadFields).partial().strict();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// "none" é um filtro válido e diferente de "sem filtro": significa
// explicitamente owner_id/lead_source_id IS NULL (ex.: "Sem responsável").
const ownerOrSourceFilterSchema = z.union([z.string().uuid(), z.literal("none")]);

export const nextActionFilterSchema = z.enum([
  "overdue",
  "today",
  "future",
  "none",
]);
export type NextActionFilter = z.infer<typeof nextActionFilterSchema>;

export const listLeadsSchema = z
  .object({
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).optional(),
    ownerId: ownerOrSourceFilterSchema.optional(),
    leadSourceId: ownerOrSourceFilterSchema.optional(),
    temperature: leadTemperatureSchema.optional(),
    nextActionFilter: nextActionFilterSchema.optional(),
    minEstimatedValue: z.number().finite().nonnegative().optional(),
    maxEstimatedValue: z.number().finite().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minEstimatedValue == null ||
      value.maxEstimatedValue == null ||
      value.maxEstimatedValue >= value.minEstimatedValue,
    {
      message: "Valor máximo precisa ser maior ou igual ao valor mínimo",
      path: ["maxEstimatedValue"],
    },
  );
export type ListLeadsInput = z.input<typeof listLeadsSchema>;
export type ParsedListLeadsInput = z.output<typeof listLeadsSchema>;
