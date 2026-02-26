import sharp from "sharp";

export type NormalizedFile = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export async function normalizeImageBuffer(input: Buffer, mimeType: string): Promise<NormalizedFile> {
  if (!mimeType.startsWith("image/")) {
    return {
      buffer: input,
      mimeType,
      extension: "bin"
    };
  }

  const output = await sharp(input)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return {
    buffer: output,
    mimeType: "image/jpeg",
    extension: "jpg"
  };
}

export function extFromFilename(name: string) {
  const parts = name.split(".");
  if (parts.length < 2) {
    return "";
  }
  return parts.at(-1)?.toLowerCase() ?? "";
}
