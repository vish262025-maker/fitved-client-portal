import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trackAdminActivity } from "@/lib/adminActivity";
import { formatDate } from "@/lib/dates";
import { Trash2 } from "lucide-react";

type BillingType = "payment" | "refund";

export function BillingTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("payment");

  const { data: items = [] } = useQuery({
    queryKey: ["customer-billing", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_history").select("*").eq("user_id", userId)
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const finalAmount = billingType === "refund" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));
      const { error } = await supabase.from("billing_history").insert({
        user_id: userId,
        payment_date: date,
        amount: finalAmount,
        method: method || null,
        type: billingType,
        notes: notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(billingType === "refund" ? "Refund recorded" : "Payment recorded");
      trackAdminActivity({ action: billingType === "refund" ? "billing.refund" : "billing.payment", entityType: "customer", entityId: userId, details: { amount, method } });
      setAmount(""); setMethod(""); setNotes(""); setBillingType("payment");
      qc.invalidateQueries({ queryKey: ["customer-billing", userId] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("billing_history").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Record deleted");
      qc.invalidateQueries({ queryKey: ["customer-billing", userId] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  // Totals
  const totalPaid = items.filter((b: any) => Number(b.amount) > 0).reduce((s: number, b: any) => s + Number(b.amount), 0);
  const totalRefunded = items.filter((b: any) => Number(b.amount) < 0).reduce((s: number, b: any) => s + Math.abs(Number(b.amount)), 0);
  const netTotal = totalPaid - totalRefunded;

  return (
    <div className="space-y-5 max-w-xl">
      {/* Record form */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium">Record payment or refund</h3>

        {/* Type toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBillingType("payment")}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              background: billingType === "payment" ? "#1e3a5f" : "transparent",
              color: billingType === "payment" ? "#fff" : "#1e3a5f",
              borderColor: "#1e3a5f",
            }}
          >
            💰 Payment
          </button>
          <button
            type="button"
            onClick={() => setBillingType("refund")}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              background: billingType === "refund" ? "#d23b34" : "transparent",
              color: billingType === "refund" ? "#fff" : "#d23b34",
              borderColor: "#d23b34",
            }}
          >
            ↩ Refund
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="UPI" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Reason / Notes</Label>
          <Input 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)} 
            placeholder="e.g. Refund for cancellation, Upgrade, 12 sessions plan payment, etc." 
          />
        </div>
        <Button
          onClick={() => add.mutate()}
          disabled={!amount || add.isPending}
          variant={billingType === "refund" ? "destructive" : "default"}
        >
          {add.isPending ? "Saving…" : billingType === "refund" ? "Record refund" : "Add payment"}
        </Button>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Total paid</p>
            <p className="font-semibold text-lg" style={{ color: "#16a34a" }}>₹{totalPaid.toLocaleString("en-IN")}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Refunded</p>
            <p className="font-semibold text-lg" style={{ color: "#d23b34" }}>₹{totalRefunded.toLocaleString("en-IN")}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="font-semibold text-lg">₹{netTotal.toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}

      {/* History */}
      <div className="space-y-2">
        <h3 className="font-medium">History</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : items.map((b: any) => {
          const isRefund = Number(b.amount) < 0 || b.type === "refund";
          const displayAmount = Math.abs(Number(b.amount));
          const timeStr = b.created_at ? new Date(b.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
          return (
            <div key={b.id} className="flex items-center justify-between rounded-lg border p-3 group">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium">{formatDate(b.payment_date)}{timeStr ? ` · ${timeStr}` : ""}</div>
                  {isRefund && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(210,59,52,0.1)", color: "#d23b34" }}>
                      Refund
                    </span>
                  )}
                </div>
                {b.notes && <div className="text-xs text-foreground mt-1 font-medium">{b.notes}</div>}
                <div className="text-[11px] text-muted-foreground mt-0.5">{b.method ?? "—"}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="font-medium" style={{ color: isRefund ? "#d23b34" : undefined }}>
                  {isRefund ? "−" : ""}₹{displayAmount.toLocaleString("en-IN")}
                </div>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => { if (confirm("Delete this record?")) remove.mutate(b.id); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
