/**
 * Server-side image pipeline using sharp (already bundled for
 * Next.js image optimization).
 *
 * We produce two derivatives per photo:
 *   - `full`:  max 2048px on the longest side, JPEG q=82
 *   - `thumb`: max 400px  on the longest side, JPEG q=78
 *
 * `rotate()` without arguments honours EXIF orientation so the
 * output pixels match what the user saw in their camera roll.
 */
import sharp from "sharp";

export type ProcessedImage = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
};

export async function processPhoto(
  input: ArrayBuffer | Buffer
): Promise<ProcessedImage> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const base = sharp(buf, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;

  const full = await base
    .clone()
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const thumb = await base
    .clone()
    .resize({
      width: 400,
      height: 400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();

  return { full, thumb, width: srcWidth, height: srcHeight };
}
