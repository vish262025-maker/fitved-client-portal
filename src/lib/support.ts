/** FitVed's customer support WhatsApp line. */
export const SUPPORT_WHATSAPP = "919606047293";

/** Human-readable form, for showing next to the link. */
export const SUPPORT_WHATSAPP_DISPLAY = "+91 96060 47293";

/**
 * A wa.me link, optionally with the message already typed. Prefilling means
 * support opens on a question they can answer, instead of "hi".
 */
export function supportWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
