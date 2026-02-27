import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { verifyJwt } from "@/lib/jwt";
import { requireStore } from "@/lib/request-auth";

const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

const payloadSchema = z.object({
  finalizeToken: z.string().min(1),
  start: z.coerce.number().int().min(0),
  endExclusive: z.coerce.number().int().positive(),
  totalBytes: z.coerce.number().int().positive(),
  chunk: z.instanceof(File)
});

type ChunkToken = {
  t: string;
  uid: string;
  storeId: string;
  mimeType: string;
  bytes: number;
  uploadUrl: string;
  exp?: number;
};

function parseLastUploadedByte(rangeHeader: string | null) {
  if (!rangeHeader) {
    return null;
  }
  const match = /bytes=0-(\d+)/i.exec(rangeHeader);
  if (!match) {
    return null;
  }
  const end = Number(match[1]);
  if (!Number.isFinite(end) || end < 0) {
    return null;
  }
  return end;
}

export async function POST(request: Request) {
  const auth = await requireStore();
  if (!auth) {
    return unauthorized();
  }

  try {
    const form = await request.formData();
    const parsed = payloadSchema.safeParse({
      finalizeToken: form.get("finalizeToken"),
      start: form.get("start"),
      endExclusive: form.get("endExclusive"),
      totalBytes: form.get("totalBytes"),
      chunk: form.get("chunk")
    });

    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
    }

    let token: ChunkToken;
    try {
      token = await verifyJwt<ChunkToken>(parsed.data.finalizeToken);
    } catch {
      return badRequest("Token de vídeo inválido o expirado");
    }

    if (token.t !== "video_upload_finalize" || !token.uploadUrl) {
      return badRequest("Token de vídeo inválido");
    }
    if (token.uid !== auth.session.uid || token.storeId !== auth.store.id) {
      return forbidden();
    }

    const { chunk, start, endExclusive, totalBytes } = parsed.data;
    if (totalBytes !== token.bytes) {
      return badRequest("Tamaño total no coincide con el token de subida");
    }
    if (start >= endExclusive || endExclusive > totalBytes) {
      return badRequest("Rango de chunk inválido");
    }
    if (chunk.size !== endExclusive - start) {
      return badRequest("Tamaño de chunk inválido");
    }
    if (chunk.size > MAX_CHUNK_BYTES) {
      return badRequest(`Chunk demasiado grande (máximo ${MAX_CHUNK_BYTES} bytes)`);
    }

    const buffer = Buffer.from(await chunk.arrayBuffer());
    const contentRange = `bytes ${start}-${endExclusive - 1}/${totalBytes}`;

    const driveResponse = await fetch(token.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": token.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Range": contentRange
      },
      body: buffer
    });

    if (driveResponse.status === 308) {
      const uploadedUntil = parseLastUploadedByte(driveResponse.headers.get("range"));
      const uploadedBytes = uploadedUntil === null ? endExclusive : Math.min(totalBytes, uploadedUntil + 1);
      return Response.json({
        ok: true,
        done: false,
        uploadedBytes
      });
    }

    if (!driveResponse.ok) {
      const details = await driveResponse.text().catch(() => "");
      return Response.json(
        {
          error: `Google Drive rechazó el chunk (${driveResponse.status}) ${details}`.trim()
        },
        { status: 502 }
      );
    }

    const text = await driveResponse.text().catch(() => "");
    let driveFileId = "";
    if (text) {
      try {
        const json = JSON.parse(text) as { id?: string };
        driveFileId = String(json.id || "");
      } catch {
        driveFileId = "";
      }
    }

    if (!driveFileId) {
      return Response.json(
        {
          error: "No se pudo obtener el ID del archivo en Drive tras subir el vídeo"
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      done: true,
      driveFileId
    });
  } catch (error) {
    console.error("[store/upload/video/chunk] error", error);
    return Response.json(
      {
        error: "Error de red durante la subida de vídeo por bloques"
      },
      { status: 500 }
    );
  }
}
