"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <button onClick={logout} disabled={loading} className="btn-ghost h-10 text-xs sm:text-sm">
      {loading ? "Saliendo..." : "Cerrar sesión"}
    </button>
  );
}
