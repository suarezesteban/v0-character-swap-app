import { redirect } from "next/navigation"
import { createAuthUrl } from "@/lib/auth"

export async function GET() {
  const authUrl = await createAuthUrl()
  redirect(authUrl)
}
