"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/authActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Target, Lock, Mail, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [state, action, isPending] = useActionState(loginAction, undefined);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="z-10 w-full max-w-md p-4">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/10">
            <Target className="text-emerald-500 w-10 h-10" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-white">HOSHIN KANRI</h1>
            <p className="text-zinc-500 font-medium">Stratejik Yönetim Platformu</p>
          </div>
        </div>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl text-zinc-100">Giriş Yap</p>
            <CardDescription className="text-zinc-500">
              Devam etmek için kurumsal kimlik bilgilerinizle giriş yapın.
            </CardDescription>
          </CardHeader>
          <form action={action}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-400">E-posta</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    placeholder="ornek@sirket.com" 
                    className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500/50"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-400">Şifre</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500/50"
                    required
                  />
                </div>
              </div>
              {state?.error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium animate-in fade-in slide-in-from-top-1">
                  {state.error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 transition-all shadow-lg shadow-emerald-600/20"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : "Giriş Yap"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-8 text-center text-xs text-zinc-600">
          © 2026 Hoshin Kanri Platformu. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
