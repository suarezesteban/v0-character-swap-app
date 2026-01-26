import { NextRequest, NextResponse } from "next/server"
import { setSession, getBaseUrl, getOAuthCookies, clearOAuthCookies } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const baseUrl = getBaseUrl()
  
  console.log("[v0] Auth callback started")
  console.log("[v0] Code received:", code ? "yes" : "no")
  console.log("[v0] State received:", state)
  
  if (!code) {
    console.log("[v0] No code received")
    return NextResponse.redirect(new URL("/?error=no_code", baseUrl))
  }
  
  // Verify state and get code verifier
  const { state: savedState, verifier } = await getOAuthCookies()
  console.log("[v0] Saved state:", savedState)
  console.log("[v0] Verifier exists:", !!verifier)
  
  if (!savedState || state !== savedState) {
    console.log("[v0] State mismatch")
    await clearOAuthCookies()
    return NextResponse.redirect(new URL("/?error=invalid_state", baseUrl))
  }
  
  if (!verifier) {
    console.log("[v0] No verifier found")
    await clearOAuthCookies()
    return NextResponse.redirect(new URL("/?error=no_verifier", baseUrl))
  }
  
  const redirectUri = `${baseUrl}/api/auth/callback`
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID!
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET!
  
  console.log("[v0] Base URL:", baseUrl)
  console.log("[v0] Redirect URI:", redirectUri)
  
  try {
    // Exchange code for tokens using the correct endpoint
    const tokenUrl = "https://api.vercel.com/login/oauth/token"
    
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })
    
    // Basic auth with client credentials
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    
    console.log("[v0] Token exchange URL:", tokenUrl)
    console.log("[v0] Token body:", {
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_length: code.length,
      verifier_length: verifier.length,
    })
    
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: tokenBody,
    })
    
    console.log("[v0] Token response status:", tokenResponse.status)
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error("[v0] Token exchange failed:", error)
      await clearOAuthCookies()
      return NextResponse.redirect(new URL("/?error=token_exchange", baseUrl))
    }
    
    const tokenData = await tokenResponse.json()
    console.log("[v0] Token data keys:", Object.keys(tokenData))
    
    const accessToken = tokenData.access_token
    
    if (!accessToken) {
      console.error("[v0] No access token in response")
      await clearOAuthCookies()
      return NextResponse.redirect(new URL("/?error=no_access_token", baseUrl))
    }
    
    // Get user info from the userinfo endpoint
    const userInfoUrl = "https://api.vercel.com/login/oauth/userinfo"
    const userResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    
    console.log("[v0] User info response status:", userResponse.status)
    
    if (!userResponse.ok) {
      const userError = await userResponse.text()
      console.error("[v0] User info failed:", userError)
      await clearOAuthCookies()
      return NextResponse.redirect(new URL("/?error=user_fetch", baseUrl))
    }
    
    const userData = await userResponse.json()
    console.log("[v0] User data:", JSON.stringify(userData, null, 2))
    
    // Create session
    await setSession({
      user: {
        id: userData.sub || userData.id,
        email: userData.email,
        name: userData.name || userData.preferred_username || "User",
        avatar: userData.picture,
      },
      accessToken,
    })
    
    // Clear OAuth cookies
    await clearOAuthCookies()
    
    console.log("[v0] Session created, redirecting to home")
    return NextResponse.redirect(new URL("/", baseUrl))
  } catch (error) {
    console.error("[v0] Auth callback error:", error)
    await clearOAuthCookies()
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl))
  }
}
