import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.role === "STORE" ? "/store" : "/admin");
  }

  return (
    <main className="app-shell flex min-h-screen items-center justify-center">
      <LoginForm />
    </main>
  );
}
