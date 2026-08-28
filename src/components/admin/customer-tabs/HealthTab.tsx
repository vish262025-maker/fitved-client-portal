import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { Eye, Trash2 } from "lucide-react";

export function HealthTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);

  const { data: reports = [] } = useQuery({
    queryKey: ["customer-reports", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_reports").select("*").eq("client_id", userId)
        .order("report_date", { ascending: false });
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a PDF or HTML report");
      const path = `${userId}/${Date.now()}-${file.name}`;
      // Explicit content type so the browser renders (not downloads) the file
      // when the customer views it — HTML reports open right in the app.
      const contentType =
        file.type || (/\.html?$/i.test(file.name) ? "text/html" : "application/pdf");
      const { error: upErr } = await supabase.storage
        .from("health-reports").upload(path, file, { contentType, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("health_reports").insert({
        client_id: userId, title, report_date: date, file_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report uploaded");
      setTitle(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["customer-reports", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });


  const view = async (path: string) => {
    const { data, error } = await supabase.storage.from("health-reports").createSignedUrl(path, 60);
    if (error || !data) { toast.error("Could not open"); return; }
    // Storage serves HTML as text/plain (anti-XSS) — re-wrap it in a blob so
    // the browser actually renders the report instead of showing source code.
    if (/\.html?$/i.test(path)) {
      try {
        const html = await (await fetch(data.signedUrl)).text();
        window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
        return;
      } catch { /* fall through to raw URL */ }
    }
    window.open(data.signedUrl, "_blank");
  };

  const remove = useMutation({
    mutationFn: async (r: { id: string; file_path: string | null }) => {
      if (r.file_path) await supabase.storage.from("health-reports").remove([r.file_path]);
      const { error } = await supabase.from("health_reports").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["customer-reports", userId] });
    },
  });

  return (
    <div className="space-y-5 max-w-xl">
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium">Upload health report</h3>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quarterly check-up" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Report date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Report file (PDF or HTML)</Label>
            <Input type="file" accept="application/pdf,text/html,.pdf,.html,.htm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <Button onClick={() => upload.mutate()} disabled={!title || !file || upload.isPending}>
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
        <p className="text-xs text-muted-foreground">
          HTML reports open directly in the customer's browser. Reports are kept until you delete them.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Reports</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        ) : reports.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">{formatDate(r.report_date)}</div>
            </div>
            <div className="flex gap-2">
              {r.file_path && (
                <Button size="sm" variant="outline" onClick={() => view(r.file_path!)}>
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => remove.mutate({ id: r.id, file_path: r.file_path })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
