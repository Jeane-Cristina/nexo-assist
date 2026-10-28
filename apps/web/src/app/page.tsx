import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/server/auth/current";

/** A raiz só decide para onde mandar: login, chat do funcionário ou console do analista. */
export default async function Home() {
  const session = await getSession();
  redirect(session ? homeFor(session.role) : "/login");
}
