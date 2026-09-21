import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LOGIN_PATH, homeForRole } from "@/lib/auth/roles";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? homeForRole(user.role) : LOGIN_PATH);
}
