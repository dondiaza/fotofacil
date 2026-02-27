"use client";

const VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;
const MIN_VIDEO_SIZE_TO_OPTIMIZE = 12 * 1024 * 1024;
const MAX_VISUAL_LOSSLESS_BITRATE = 8_000_000;
const MIN_AUDIO_BITRATE = 96_000;

type JsonObject = Record<string, unknown>;

type CaptureVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  webkitCaptureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export type UploadProgress =
  | { phase: "optimizing" }
  | { phase: "uploading"; uploadedBytes: number; totalBytes: number }
  | { phase: "finalizing" };

export type UploadVideoOptions = {
  date: string;
  slotName?: string;
  replaceFileId?: string;
  onProgress?: (progress: UploadProgress) => void;
};

export type UploadVideoResult = {
  payload: JsonObject | null;
  usedFile: File;
  optimized: boolean;
};

async function parseJson(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as JsonObject;
  } catch {
    return null;
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "");
  const normalized = msg.toLowerCase();
  return normalized.includes("failed to fetch") || normalized.includes("networkerror") || normalized.includes("load failed");
}

export function toUserError(error: unknown, fallback = "Error de conexión. Revisa internet e inténtalo de nuevo.") {
  if (isNetworkError(error)) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, retries = 2) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        throw error;
      }
      await wait(350 * (attempt + 1));
    }
  }
  throw lastError;
}

function pickMediaRecorderMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

async function readVideoMetadata(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el vídeo"));
    });
    return {
      duration: Number(video.duration || 0)
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function recompressVideoVisuallyLossless(file: File) {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return file;
  }
  if (file.size < MIN_VIDEO_SIZE_TO_OPTIMIZE) {
    return file;
  }

  const mimeType = pickMediaRecorderMimeType();
  if (!mimeType) {
    return file;
  }

  const { duration } = await readVideoMetadata(file);
  if (!duration || !Number.isFinite(duration) || duration < 1) {
    return file;
  }

  const sourceBitrate = Math.round((file.size * 8) / duration);
  const targetBitrate = Math.min(sourceBitrate, MAX_VISUAL_LOSSLESS_BITRATE);

  if (sourceBitrate <= targetBitrate * 1.02) {
    return file;
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as CaptureVideoElement;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const streamFactory = video.captureStream || video.webkitCaptureStream || video.mozCaptureStream;
  if (!streamFactory) {
    URL.revokeObjectURL(url);
    return file;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo procesar el vídeo"));
    });

    const stream = streamFactory.call(video);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: targetBitrate,
      audioBitsPerSecond: MIN_AUDIO_BITRATE
    });

    await new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => reject(new Error("Error al recomprimir el vídeo"));
      recorder.onstop = () => resolve();

      recorder.start(1000);
      video
        .play()
        .then(() => {
          video.onended = () => {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
          };
          video.onerror = () => {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
            reject(new Error("Error al reproducir vídeo para compresión"));
          };
        })
        .catch(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          reject(new Error("No se pudo iniciar la compresión de vídeo"));
        });
    });

    stream.getTracks().forEach((track) => track.stop());
    const compressed = new Blob(chunks, { type: mimeType || file.type || "video/mp4" });
    if (!compressed.size || compressed.size >= file.size) {
      return file;
    }

    const outputType = compressed.type || file.type || "video/mp4";
    const ext = outputType.includes("webm") ? "webm" : "mp4";
    const baseName = file.name.replace(/\.[a-z0-9]+$/i, "");
    return new File([compressed], `${baseName}_opt.${ext}`, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function uploadVideoResumable(file: File, options: UploadVideoOptions): Promise<UploadVideoResult> {
  options.onProgress?.({ phase: "optimizing" });
  const optimizedFile = await recompressVideoVisuallyLossless(file);
  const usedFile = optimizedFile;

  const initResponse = await fetchWithRetry(
    "/api/store/upload/video/init",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: options.date,
        mimeType: usedFile.type || "video/mp4",
        bytes: usedFile.size,
        originalFilename: usedFile.name,
        slotName: options.slotName || "VIDEO",
        replaceFileId: options.replaceFileId
      })
    },
    2
  );
  const initJson = await parseJson(initResponse);
  if (!initResponse.ok) {
    throw new Error(String((initJson as { error?: string } | null)?.error || `No se pudo iniciar subida de vídeo (${initResponse.status})`));
  }

  const finalizeToken = String((initJson as { finalizeToken?: string } | null)?.finalizeToken || "");
  if (!finalizeToken) {
    throw new Error("No se recibió token para finalizar la subida");
  }

  let driveFileId = "";
  let offset = 0;
  while (offset < usedFile.size) {
    const endExclusive = Math.min(offset + VIDEO_CHUNK_BYTES, usedFile.size);
    const chunkBlob = usedFile.slice(offset, endExclusive);
    const form = new FormData();
    form.append("finalizeToken", finalizeToken);
    form.append("start", String(offset));
    form.append("endExclusive", String(endExclusive));
    form.append("totalBytes", String(usedFile.size));
    form.append("chunk", chunkBlob, "chunk.bin");

    const chunkResponse = await fetchWithRetry("/api/store/upload/video/chunk", { method: "POST", body: form }, 3);
    const chunkJson = await parseJson(chunkResponse);
    if (!chunkResponse.ok) {
      throw new Error(
        String((chunkJson as { error?: string } | null)?.error || `No se pudo subir el bloque de vídeo (${chunkResponse.status})`)
      );
    }

    const done = Boolean((chunkJson as { done?: boolean } | null)?.done);
    if (done) {
      driveFileId = String((chunkJson as { driveFileId?: string } | null)?.driveFileId || "");
      offset = usedFile.size;
      options.onProgress?.({ phase: "uploading", uploadedBytes: usedFile.size, totalBytes: usedFile.size });
      break;
    }

    const uploadedBytes = Number((chunkJson as { uploadedBytes?: number } | null)?.uploadedBytes || endExclusive);
    offset = Math.max(endExclusive, uploadedBytes);
    options.onProgress?.({ phase: "uploading", uploadedBytes: Math.min(offset, usedFile.size), totalBytes: usedFile.size });
  }

  if (!driveFileId) {
    throw new Error("No se obtuvo el ID del vídeo en Google Drive");
  }

  options.onProgress?.({ phase: "finalizing" });
  const finalizeResponse = await fetchWithRetry(
    "/api/store/upload/video/finalize",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finalizeToken,
        driveFileId
      })
    },
    1
  );
  const finalizeJson = await parseJson(finalizeResponse);
  if (!finalizeResponse.ok) {
    throw new Error(
      String((finalizeJson as { error?: string } | null)?.error || `No se pudo cerrar subida de vídeo (${finalizeResponse.status})`)
    );
  }

  return {
    payload: finalizeJson,
    usedFile,
    optimized: usedFile !== file
  };
}
