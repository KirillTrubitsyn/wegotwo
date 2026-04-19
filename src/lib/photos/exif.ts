"use client";

/**
 * Extract taken_at and GPS from an image file on the browser
 * before uploading. Works for JPG, PNG (rarely has EXIF), HEIC
 * and TIFF sources. exifr is ESM-friendly and keeps the parser
 * off the server where Next would otherwise bundle it.
 *
 * Returns ISO strings (UTC) and plain numbers, or null when a
 * field is missing. Errors are swallowed: no EXIF just means
 * the server will fall back to a day-less photo.
 */
export type ExtractedExif = {
  takenAt: string | null;
  lat: number | null;
  lon: number | null;
  width: number | null;
  height: number | null;
};

type ExifrParsed = {
  DateTimeOriginal?: Date | string | null;
  CreateDate?: Date | string | null;
  ModifyDate?: Date | string | null;
  latitude?: number | null;
  longitude?: number | null;
  GPSLatitude?: number | null;
  GPSLongitude?: number | null;
  ExifImageWidth?: number | null;
  ExifImageHeight?: number | null;
  ImageWidth?: number | null;
  ImageHeight?: number | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

export async function extractExif(file: File): Promise<ExtractedExif> {
  try {
    const exifr = await import("exifr");
    const parsed = (await exifr.parse(file, [
      "DateTimeOriginal",
      "CreateDate",
      "ModifyDate",
      "latitude",
      "longitude",
      "GPSLatitude",
      "GPSLongitude",
      "ExifImageWidth",
      "ExifImageHeight",
      "ImageWidth",
      "ImageHeight",
    ])) as ExifrParsed | null;

    if (!parsed) {
      return { takenAt: null, lat: null, lon: null, width: null, height: null };
    }

    const takenAt =
      toIso(parsed.DateTimeOriginal) ??
      toIso(parsed.CreateDate) ??
      toIso(parsed.ModifyDate);

    const lat = parsed.latitude ?? parsed.GPSLatitude ?? null;
    const lon = parsed.longitude ?? parsed.GPSLongitude ?? null;
    const width = parsed.ExifImageWidth ?? parsed.ImageWidth ?? null;
    const height = parsed.ExifImageHeight ?? parsed.ImageHeight ?? null;

    return {
      takenAt,
      lat: typeof lat === "number" ? lat : null,
      lon: typeof lon === "number" ? lon : null,
      width: typeof width === "number" ? width : null,
      height: typeof height === "number" ? height : null,
    };
  } catch {
    return { takenAt: null, lat: null, lon: null, width: null, height: null };
  }
}

/**
 * Convert HEIC/HEIF to JPEG using heic2any. Returns the original
 * file untouched for non-HEIC sources.
 */
export async function normalizeHeic(file: File): Promise<File> {
  const mime = (file.type || "").toLowerCase();
  const isHeic =
    mime === "image/heic" ||
    mime === "image/heif" ||
    /\.heic$|\.heif$/i.test(file.name);
  if (!isHeic) return file;

  try {
    const mod = (await import("heic2any")) as unknown;
    type Heic2AnyFn = (opts: {
      blob: Blob;
      toType: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const fn: Heic2AnyFn =
      (mod as { default?: Heic2AnyFn }).default ??
      (mod as Heic2AnyFn);
    const out = await fn({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    const blob = Array.isArray(out) ? out[0] : out;
    const jpgName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], jpgName, { type: "image/jpeg" });
  } catch {
    // If conversion fails, upload the original. The server will
    // still store it, but browsers won't render HEIC inline.
    return file;
  }
}
