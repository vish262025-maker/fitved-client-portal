/**
 * Shrink an image before it is uploaded.
 *
 * A phone camera or a design export is routinely 3–4000px and several MB. Two
 * such files accounted for 8.3 MB of 9.1 MB in storage and, served a few
 * hundred times, for most of a 5 GB egress quota — while being displayed a
 * few hundred pixels wide. Nothing here resized on upload, so the next big
 * photo would have done it again.
 *
 * Anything already small enough is returned untouched, and if the browser
 * cannot decode it (an odd format, a corrupt file) the original is uploaded
 * rather than failing the save.
 */
export async function shrinkImage(
  file: File,
  { maxWidth = 1600, quality = 0.8 }: { maxWidth?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  // Small already — recompressing would only lose quality for nothing.
  if (file.size <= 300 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;   // never make it worse

    const name = file.name.replace(/\.(png|jpe?g|webp|heic|heif)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
