// Shareable, SEO-friendly public URL slug for a trainer, e.g.
//   Suma + ["Yoga", …] + id → "suma-yoga-3b1c"
// Structure: <name>-<primary specialization>-<short id>. The name and a
// specialization make it readable and keyword-rich for search; the short id
// suffix guarantees every trainer gets a unique, permanent link they can share.

function kebab(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-") // non-alphanumerics → dashes
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildTrainerSlug(
  name: string | null | undefined,
  specializations: string[] | null | undefined,
  id: string,
): string {
  const namePart = kebab(name || "trainer") || "trainer";
  const primarySpec = Array.isArray(specializations)
    ? specializations.find((s) => !!s && s.trim())
    : undefined;
  const specPart = primarySpec ? kebab(primarySpec) : "";
  // A short, stable token from the id keeps the slug unique without a DB lookup.
  const idPart = (id || "").replace(/[^0-9a-f]/gi, "").slice(0, 4) || "0000";
  return [namePart, specPart, idPart].filter(Boolean).join("-");
}
