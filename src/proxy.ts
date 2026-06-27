import { NextRequest, NextResponse } from "next/server";

const COOKIE = "auth";

export function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const authed = !!token && token === process.env.APP_PASSWORD;

  if (!authed) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/auth|login).*)"],
};
