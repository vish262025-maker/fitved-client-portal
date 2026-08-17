import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, ExternalLink, Megaphone, ImageIcon, Video } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { useAuth } from "@/contexts/AuthContext";
import { scopeByAdmin } from "@/lib/adminScope";

interface Post {
  id: string;
  caption: string | null;
  media_path: string;
  media_type: string;
  cta_label: string | null;
  cta_url: string | null;
  active: boolean;
  created_at: string;
  assigned_admin_id?: string | null;
}

export function marketingMediaUrl(path: string): string {
  return supabase.storage.from("marketing").getPublicUrl(path).data.publicUrl;
}

export default function Marketing() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const adminId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ctaLabel, setCtaLabel] = useState<string>("none");
  const [ctaUrl, setCtaUrl] = useState("");

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["marketing-posts-admin", adminId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      // Each admin sees only their own posts; a new admin starts with none.
      return scopeByAdmin((data ?? []) as Post[], adminId);
    },
  });

  const reset = () => { setCaption(""); setFile(null); setCtaLabel("none"); setCtaUrl(""); };

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick an image or a video");
      const isVideo = file.type.startsWith("video");
      if (!isVideo && !file.type.startsWith("image")) throw new Error("Only images and videos are supported");
      if (ctaLabel !== "none" && !ctaUrl.trim()) throw new Error("Add the link the button should open");

      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("marketing").upload(path, file);
      if (upErr) throw upErr;

      const payload: Record<string, unknown> = {
        caption: caption.trim() || null,
        media_path: path,
        media_type: isVideo ? "video" : "image",
        cta_label: ctaLabel === "none" ? null : ctaLabel,
        cta_url: ctaLabel === "none" ? null : ctaUrl.trim(),
        active: true,
        assigned_admin_id: adminId,
      };
      let { error } = await (supabase as any).from("marketing_posts").insert(payload);
      // Retry without the owner column if the migration hasn't run yet.
      if (error && /assigned_admin_id/.test(error.message || "")) {
        delete payload.assigned_admin_id;
        ({ error } = await (supabase as any).from("marketing_posts").insert(payload));
      }
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post published — visible to customers and trainers");
      reset(); setOpen(false);
      qc.invalidateQueries({ queryKey: ["marketing-posts-admin"] });
      qc.invalidateQueries({ queryKey: ["marketing-feed"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Publish failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("marketing_posts").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { active }) => {
      toast.success(active ? "Post is live" : "Post hidden");
      qc.invalidateQueries({ queryKey: ["marketing-posts-admin"] });
      qc.invalidateQueries({ queryKey: ["marketing-feed"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (p: Post) => {
      await supabase.storage.from("marketing").remove([p.media_path]);
      const { error } = await supabase.from("marketing_posts").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: ["marketing-posts-admin"] });
      qc.invalidateQueries({ queryKey: ["marketing-feed"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Marketing</h1>
          <p className="mt-1 text-muted-foreground">
            Promo cards shown on customer and trainer dashboards · {posts.filter((p) => p.active).length} live
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New post</Button>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : posts.length === 0 ? (
        <Card className="rounded-2xl shadow-card p-10 text-center">
          <Megaphone className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No posts yet — publish your first announcement or promo.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((p) => (
            <Card key={p.id} className={`rounded-2xl shadow-card overflow-hidden ${p.active ? "" : "opacity-60"}`}>
              {p.media_type === "video" ? (
                <video src={marketingMediaUrl(p.media_path)} controls className="w-full aspect-square object-cover bg-black" />
              ) : (
                <img src={marketingMediaUrl(p.media_path)} alt={p.caption ?? "Marketing post"} className="w-full aspect-square object-cover" />
              )}
              <div className="p-4 space-y-3">
                {p.caption && <p className="text-sm whitespace-pre-wrap">{p.caption}</p>}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {p.media_type === "video" ? <Video className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {formatDate(p.created_at)}
                  {p.cta_label && p.cta_url && (
                    <a href={p.cta_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> {p.cta_label}
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={p.active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: p.id, active: v })}
                    />
                    {p.active ? <Badge variant="secondary">Live</Badge> : <Badge variant="outline">Hidden</Badge>}
                  </label>
                  <Button size="sm" variant="ghost"
                    onClick={() => { if (confirm("Delete this post? The media is removed too.")) remove.mutate(p); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New marketing post</DialogTitle>
            <DialogDescription>
              One image or video, a caption, and an optional button linking anywhere — a form, a page, a reel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Image or video *</Label>
              <Input type="file" accept="image/*,video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.type.startsWith("video") ? "Video" : "Image"} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Caption</Label>
              <Textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder="Announce an event, offer, or update…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Button</Label>
                <Select value={ctaLabel} onValueChange={setCtaLabel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No button</SelectItem>
                    <SelectItem value="Apply">Apply</SelectItem>
                    <SelectItem value="View">View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Button link</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://…" disabled={ctaLabel === "none"} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!file || create.isPending}>
              {create.isPending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
