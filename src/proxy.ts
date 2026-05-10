import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth";

// Giriş yapmadan erişilebilecek sayfalar
const publicRoutes = ["/login", "/api/auth"];

export async function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);

  // Session çerezini al
  const session = request.cookies.get("session")?.value;

  // Giriş yapmamışsa ve gizli bir sayfaya gitmeye çalışıyorsa login'e at
  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Giriş yapmışsa ve login sayfasına gitmeye çalışıyorsa ana sayfaya at
  if (session && isPublicRoute) {
    try {
      const payload = await decrypt(session);
      if (payload) {
        return NextResponse.redirect(new URL("/", nextUrl));
      }
    } catch (error) {
      // Geçersiz session varsa login'e devam etsin (zaten login'de)
    }
  }

  return NextResponse.next();
}

// Hangi yolların middleware'den geçeceği
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
