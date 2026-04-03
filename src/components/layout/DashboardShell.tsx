"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import OverviewTab from "@/components/tabs/OverviewTab";
import UploadButton from "@/components/UploadButton";

interface Props {
  userId: string;
}

export default function DashboardShell({ userId }: Props) {
  const supabase = createClient();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <span className="font-semibold tracking-tight">Account Tracker</span>
          <div className="flex items-center gap-3">
            <UploadButton userId={userId} />
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Dashboard</TabsTrigger>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="tax">Tax</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab userId={userId} />
          </TabsContent>

          <TabsContent value="holdings">
            <p className="text-muted-foreground text-sm">Holdings tab — coming soon.</p>
          </TabsContent>

          <TabsContent value="transactions">
            <p className="text-muted-foreground text-sm">Transactions tab — coming soon.</p>
          </TabsContent>

          <TabsContent value="tax">
            <p className="text-muted-foreground text-sm">Tax tab — coming soon.</p>
          </TabsContent>

          <TabsContent value="settings">
            <p className="text-muted-foreground text-sm">Settings tab — coming soon.</p>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
