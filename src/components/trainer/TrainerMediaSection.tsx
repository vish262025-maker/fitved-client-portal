import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, X, Video as VideoIcon, ImagePlus } from "lucide-react";
import { shrinkImage } from "@/lib/imageUpload";

const BUCKET = "trainer-assets";
const IMAGE_LIMIT = 20;
const VIDEO_LIMIT = 10;

const KINDS = [
  { value: "transformation", label: "Transformation photo", type: "image" },
  { value: "workout_image", label: "Workout image", type: "image" },
  { value: "workout_video", label: "Workout video", type: "video" },
  { value: "reel", label: "Reel", type: "video" },
] as const;

type MediaRow = { id: string; kind: string; file_path: string; caption: string | null };

const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9.-]/g, "_");
const publicUrl = (p: string) => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
const isVideoKind = (k: string) => k === "workout_video" || k === "reel";

export default function TrainerMediaSection({ trainerId }: { trainerId: string }) {
  const qc = useQueryClient();
  const sb = supabase as any;
  const [kind, setKind] = useState<string>("transformation");
  const fileInput = useRef<HTMLInputElement>(null);

  const media = useQuery({
    queryKey: ["trainer-media", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await sb.from("trainer_media")
        .select("id, kind, file_path, caption").eq("trainer_id", trainerId)
        .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (error) return { __notReady: true } as const;
      return (data ?? []) as MediaRow[];
    },
  });

  const notReady = (media.data as any)?.__notReady === true;
  const rows: MediaRow[] = Array.isArray(media.data) ? media.data : [];
  const imageCount = rows.filter((r) => !isVideoKind(r.kind)).length;
  const videoCount = rows.filter((r) => isVideoKind(r.kind)).length;

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const video = isVideoKind(kind);
      const remaining = video ? VIDEO_LIMIT - videoCount : IMAGE_LIMIT - imageCount;
      if (remaining <= 0) throw new Error(video ? `Video limit (${VIDEO_LIMIT}) reached` : `Image limit (${IMAGE_LIMIT}) reached`);
      for (const f of files.slice(0, remaining)) {
        const okType = video ? f.type.startsWith("video") : f.type.startsWith("image");
        if (!okType) { toast.error(`${f.name}: wrong file type for ${video ? "video" : "image"}`); continue; }
        const path = `media/${trainerId}/${Date.now()}-${sanitize(f.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, await shrinkImage(f), { cacheControl: "31536000" });
        if (up.error) throw up.error;
        const ins = await sb.from("trainer_media").insert({ trainer_id: trainerId, kind, file_path: path });
        if (ins.error) throw ins.error;
      }
      if (files.length > remaining) toast.message(`Only ${remaining} added — limit reached`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trainer-media", trainerId] }); },
    onError: (e: any) => toast.error(e.message || "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: async (row: MediaRow) => {
      await supabase.storage.from(BUCKET).remove([row.file_path]);
      const { error } = await sb.from("trainer_media").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trainer-media", trainerId] }); },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  if (notReady) {
    return <p className="text-sm text-muted-foreground">Media isn't enabled yet — run the latest migration.</p>;
  }

  const accept = isVideoKind(kind) ? "video/*" : "image/*";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground -mt-2">
        Up to {IMAGE_LIMIT} images ({imageCount} used) and {VIDEO_LIMIT} videos ({videoCount} used).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <input ref={fileInput} type="file" accept={accept} multiple className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) upload.mutate(fs); e.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
          {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add {isVideoKind(kind) ? "video" : "image"}
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {rows.map((r) => (
            <div key={r.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
              {isVideoKind(r.kind) ? (
                <video src={publicUrl(r.file_path)} className="h-full w-full object-cover" muted />
              ) : (
                <img src={publicUrl(r.file_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
              {isVideoKind(r.kind) && (
                <span className="absolute bottom-1 left-1 grid place-items-center h-5 w-5 rounded-full bg-black/60 text-white">
                  <VideoIcon className="h-3 w-3" />
                </span>
              )}
              <button type="button" onClick={() => remove.mutate(r)} aria-label="Remove"
                className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <ImagePlus className="h-5 w-5" /> No media yet — add transformation photos, workout images, videos or reels.
        </div>
      )}
    </div>
  );
}
