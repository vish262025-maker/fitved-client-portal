import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { ProfileTab } from "@/components/admin/customer-tabs/ProfileTab";
import { PlanTab } from "@/components/admin/customer-tabs/PlanTab";
import { PausesTab } from "@/components/admin/customer-tabs/PausesTab";
import { HealthTab } from "@/components/admin/customer-tabs/HealthTab";
import { ManageAccountTab } from "@/components/admin/customer-tabs/ManageAccountTab";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-customer", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!id) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/customers")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <header>
        <h1 className="font-display text-3xl text-foreground">
          {isLoading ? "Loading…" : profile?.name ?? "Unnamed customer"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground font-mono">{id}</p>
      </header>

      <Card className="rounded-2xl shadow-card p-2">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid grid-cols-3 md:grid-cols-5 w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="pauses">Pauses</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="manage">Manage Account</TabsTrigger>
          </TabsList>
          <div className="p-4">
            <TabsContent value="profile"><ProfileTab userId={id} /></TabsContent>
            <TabsContent value="plan"><PlanTab userId={id} /></TabsContent>
            <TabsContent value="pauses"><PausesTab userId={id} /></TabsContent>
            <TabsContent value="health"><HealthTab userId={id} /></TabsContent>
            <TabsContent value="manage"><ManageAccountTab userId={id} /></TabsContent>
          </div>
        </Tabs>
      </Card>
    </div>
  );
}
