import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-profile";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function SemAcessoPage() {
  const user = await getCurrentUser();

  if (user.status === "unauthenticated") {
    redirect("/login");
  }

  if (user.status === "authorized") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-lg font-semibold text-neutral-900">
          Acesso não liberado
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          Sua conta ainda não está vinculada a uma organização do Qarvon OS,
          ou está inativa. Fale com um administrador para liberar o acesso.
        </p>
        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full">
            Sair
          </Button>
        </form>
      </Card>
    </div>
  );
}
