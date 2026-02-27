import { cn } from "@/lib/utils";

const map = {
  PENDING: "bg-amber-50 text-warning",
  PARTIAL: "bg-amber-50 text-warning",
  COMPLETE: "bg-emerald-50 text-success"
};

export function StatusChip({ status }: { status: "PENDING" | "PARTIAL" | "COMPLETE" }) {
  const label = status === "COMPLETE" ? "Enviado" : "No enviado";
  return <span className={cn("chip", map[status])}>{label}</span>;
}
