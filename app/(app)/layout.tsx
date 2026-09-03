import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-profile";
import { resolveAccessRedirect } from "@/lib/auth/resolve-access";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const redirectTo = resolveAccessRedirect(user);

  if (redirectTo) {
    redirect(redirectTo);
  }

  // resolveAccessRedirect só retorna null quando user.status === "authorized".
  const { profile, organization } = user as Extract<
    typeof user,
    { status: "authorized" }
  >;

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={profile.name} organizationName={organization.name} />
      <main className="flex-1 overflow-y-auto bg-neutral-50 p-8">
        {children}
      </main>
    </div>
  );
}
