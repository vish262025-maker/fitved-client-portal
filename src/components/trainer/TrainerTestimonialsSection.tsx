import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, X, Star, Quote } from "lucide-react";
import { shrinkImage } from "@/lib/imageUpload";

const BUCKET = "trainer-assets";
const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9.-]/g, "_");
const publicUrl = (p: string | null) => (p ? supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : null);

type Row = {
  id: string; client_name: string; client_image: string | null;
  rating: number | null; review: string | null; video_url: string | null;
};

// Optional image slots for the add form
const IMG_SLOTS = [
  { key: "client_image", label: "Client photo" },
] as const;

export default function TrainerTestimonialsSection({ trainerId }: { trainerId: string }) {
  const qc = useQueryClient();
  const sb = supabase as any;
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [review, setReview] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [imgs, setImgs] = useState<Record<string, File | null>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const list = useQuery({
    queryKey: ["trainer-testimonials", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await sb.from("trainer_testimonials")
        .select("id, client_name, client_image, rating, review, video_url")
        .eq("trainer_id", trainerId).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (error) return { __notReady: true } as const;
      return (data ?? []) as Row[];
    },
  });

  const notReady = (list.data as any)?.__notReady === true;
  const rows: Row[] = Array.isArray(list.data) ? list.data : [];

  const reset = () => { setClientName(""); setRating(5); setReview(""); setVideoUrl(""); setImgs({}); setOpen(false); };

  const add = useMutation({
    mutationFn: async () => {
      if (!clientName.trim()) throw new Error("Client name is required");
      const payload: Record<string, any> = { trainer_id: trainerId, client_name: clientName.trim(), rating, review: review.trim() || null, video_url: videoUrl.trim() || null };
      for (const slot of IMG_SLOTS) {
        const f = imgs[slot.key];
        if (f) {
          const path = `testimonials/${trainerId}/${Date.now()}-${sanitize(f.name)}`;
          const up = await supabase.storage.from(BUCKET).upload(path, await shrinkImage(f), { cacheControl: "31536000" });
          if (up.error) throw up.error;
          payload[slot.key] = path;
        }
      }
      const { error } = await sb.from("trainer_testimonials").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Testimonial added"); reset(); qc.invalidateQueries({ queryKey: ["trainer-testimonials", trainerId] }); },
    onError: (e: any) => toast.error(e.message || "Could not add testimonial"),
  });

  const remove = useMutation({
    mutationFn: async (r: Row) => {
      const paths = [r.client_image].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const { error } = await sb.from("trainer_testimonials").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trainer-testimonials", trainerId] }); },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  if (notReady) return <p className="text-sm text-muted-foreground">Testimonials aren't enabled yet — run the latest migration.</p>;

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="relative rounded-xl border p-4">
              <button type="button" onClick={() => remove.mutate(r)} aria-label="Remove testimonial"
                className="absolute top-2 right-2 text-destructive"><X className="h-4 w-4" /></button>
              <div className="flex items-center gap-3">
                {publicUrl(r.client_image) ? (
                  <img src={publicUrl(r.client_image)!} alt={r.client_name} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="grid place-items-center h-10 w-10 rounded-full bg-muted"><Quote className="h-4 w-4 text-muted-foreground" /></span>
                )}
                <div>
                  <p className="font-semibold text-sm">{r.client_name}</p>
                  {r.rating != null && (
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3 w-3 ${i < (r.rating ?? 0) ? "fill-[#f0a720] text-[#f0a720]" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {r.review && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{r.review}</p>}
              {r.video_url && <a href={r.video_url} target="_blank" rel="noopener" className="mt-2 inline-block text-xs font-semibold text-fv-orange hover:underline">Video testimonial →</a>}
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add testimonial
        </Button>
      ) : (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Client name <span className="text-destructive">*</span></Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Priya Sharma" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Rating</Label>
              <div className="flex gap-1 pt-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                    <Star className={`h-5 w-5 ${n <= rating ? "fill-[#f0a720] text-[#f0a720]" : "text-muted-foreground/30"}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Review <span className="text-xs font-normal text-muted-foreground">· optional</span></Label>
            <Textarea value={review} onChange={(e) => setReview(e.target.value)} rows={2} placeholder="What the client said about training with you." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMG_SLOTS.map((slot) => (
              <div key={slot.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{slot.label}</Label>
                <input ref={(el) => (inputs.current[slot.key] = el)} type="file" accept="image/*" className="hidden"
                  onChange={(e) => setImgs((p) => ({ ...p, [slot.key]: e.target.files?.[0] ?? null }))} />
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputs.current[slot.key]?.click()}>
                  {imgs[slot.key] ? <span className="truncate">{imgs[slot.key]!.name}</span> : `Upload ${slot.label.toLowerCase()}`}
                </Button>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Video testimonial URL <span className="text-xs font-normal text-muted-foreground">· optional</span></Label>
            <Input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="YouTube / video link" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset} disabled={add.isPending}>Cancel</Button>
            <Button type="button" size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save testimonial
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
