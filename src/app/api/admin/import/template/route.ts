import { badRequest, unauthorized } from "@/lib/http";
import { requireAdmin } from "@/lib/request-auth";
import { toCsv } from "@/lib/csv";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();

  if (type === "clusters") {
    const csv = toCsv([
      {
        clusterCode: "NORTE",
        clusterName: "Cluster Norte",
        clusterUsername: "cluster_norte",
        clusterEmail: "cluster.norte@empresa.com",
        clusterPassword: "ChangeMe123!",
        isActive: "true"
      }
    ]);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="template_clusters.csv"',
        "Cache-Control": "no-store"
      }
    });
  }

  if (type === "stores") {
    const csv = toCsv([
      {
        storeCode: "043",
        storeName: "Tienda Gran Via",
        storeUsername: "tienda043",
        storeEmail: "tienda043@empresa.com",
        storePassword: "ChangeMe123!",
        clusterCode: "NORTE",
        deadlineTime: "10:30",
        isActive: "true"
      }
    ]);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="template_stores.csv"',
        "Cache-Control": "no-store"
      }
    });
  }

  return badRequest("type inválido. Usa: clusters o stores");
}
