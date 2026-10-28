import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/server/auth/current";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homeFor(session.role) : "/login");
}
