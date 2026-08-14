import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "دخول الإدارة — المساعد التدريبي" },
      {
        name: "description",
        content: "صفحة دخول مخصصة لمشرفي إدارة الحقائب التدريبية في المنصة.",
      },
      { property: "og:title", content: "دخول الإدارة — المساعد التدريبي" },
      {
        property: "og:description",
        content: "تسجيل دخول المشرفين لإدارة الحقائب التدريبية.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        void navigate({ to: "/admin" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب. يمكنك تسجيل الدخول الآن.");
        setMode("signin");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر إتمام العملية.",
      );
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("تعذر تسجيل الدخول عبر Google.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/admin" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="surface-panel w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <span className="gradient-primary mx-auto mb-3 flex size-11 items-center justify-center rounded-xl text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="text-xl font-bold">دخول الإدارة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            هذه الصفحة مخصصة لمشرفي الحقائب التدريبية.
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
          </Button>
        </form>

        <Button variant="outline" className="mt-3 w-full" onClick={google}>
          المتابعة عبر Google
        </Button>

        <button
          className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "ليس لديك حساب؟ إنشاء حساب" : "لديك حساب؟ تسجيل الدخول"}
        </button>
      </div>
    </main>
  );
}
