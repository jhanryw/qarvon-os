import type { LeadListItem } from "@/lib/leads/queries";
import {
  formatDateTime,
  formatLeadSourceName,
  formatOwnerName,
  formatTemperature,
  formatWhatsapp,
} from "@/lib/leads/format";

interface LeadsTableProps {
  leads: LeadListItem[];
  timezone: string;
  onEditLead: (leadId: string) => void;
}

const COLUMNS = [
  "Nome",
  "Empresa",
  "WhatsApp",
  "Origem",
  "Responsável",
  "Temperatura",
  "Próxima ação",
  "Criado em",
  "",
];

// Ação "Editar" explícita em vez de linha inteira clicável — clicar na
// linha atrapalharia selecionar/copiar o WhatsApp ou o nome.
export function LeadsTable({ leads, timezone, onEditLead }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <tr>
            {COLUMNS.map((column, index) => (
              <th key={column || `col-${index}`} scope="col" className="px-4 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td className="px-4 py-2 font-medium text-neutral-900">
                {lead.name}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {lead.company ?? "—"}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {formatWhatsapp(lead.whatsapp)}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {formatLeadSourceName(lead.leadSourceName)}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {formatOwnerName(lead.ownerName)}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {formatTemperature(lead.temperature)}
              </td>
              <td className="px-4 py-2 text-neutral-600">
                {lead.next_action_at
                  ? formatDateTime(lead.next_action_at, timezone)
                  : (lead.next_action ?? "—")}
              </td>
              <td className="px-4 py-2 text-neutral-500">
                {formatDateTime(lead.created_at, timezone)}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onEditLead(lead.id)}
                  aria-label={`Editar ${lead.name}`}
                  className="rounded-md px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
