import { cookies } from "next/headers"
import crypto from "node:crypto"

export interface VercelUser {
  id: string
  email: string
  name: string
  avatar?: string
}

export interface AuthSession {
  user: VercelUser
  accessToken: string
}

const SESSION_COOKIE = "vercel_session"
const STATE_COOKIE = "oauth_state"
const VERIFIER_COOKIE = "oauth_verifier"

// Generate a secure random string
function generateSecureRandomString(length: number): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomBytes, (byte) => charset[byte % charset.length]).join("")
}

// Generate code challenge from verifier (SHA256 + base64url)
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const base64 = Buffer.from(digest).toString("base64")
  // Convert to base64url
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return "http://localhost:3000"
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE)
  
  if (!sessionCookie?.value) {
    return null
  }
  
  try {
    return JSON.parse(sessionCookie.value) as AuthSession
  } catch {
    return null
  }
}

export async function verifySession(): Promise<AuthSession | null> {
  return getSession()
}

export async function setSession(session: AuthSession): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: "/",
  })
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function createAuthUrl(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID!
  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}/api/auth/callback`
  
  // Generate PKCE values
  const state = generateSecureRandomString(32)
  const codeVerifier = generateSecureRandomString(64)
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  
  // Store state and verifier in cookies
  const cookieStore = await cookies()
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  }
  
  cookieStore.set(STATE_COOKIE, state, cookieOptions)
  cookieStore.set(VERIFIER_COOKIE, codeVerifier, cookieOptions)
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid email profile offline_access",
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })
  
  return `https://vercel.com/oauth/authorize?${params.toString()}`
}

export async function getOAuthCookies(): Promise<{ state: string | null; verifier: string | null }> {
  const cookieStore = await cookies()
  return {
    state: cookieStore.get(STATE_COOKIE)?.value || null,
    verifier: cookieStore.get(VERIFIER_COOKIE)?.value || null,
  }
}

export async function clearOAuthCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(STATE_COOKIE)
  cookieStore.delete(VERIFIER_COOKIE)
}
