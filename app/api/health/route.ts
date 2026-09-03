import { NextResponse } from "next/server";

// Health check simples para o container/EasyPanel: só confirma que o
// processo web está respondendo. Não consulta banco nem expõe dados.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
