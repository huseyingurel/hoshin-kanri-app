import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/auth";

export type AppSession = SessionPayload;

export async function getSessionOrRedirect(): Promise<AppSession> {
  const raw = await getSession();
  if (!raw?.userId) redirect("/login");
  return raw;
}
