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
];

export function LeadsTable({ leads, timezone }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-4 py-2">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
