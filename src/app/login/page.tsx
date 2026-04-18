"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else setError("Check your email to confirm your account.");
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Trade Republic Account Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "…" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleSignUp}
            >
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
