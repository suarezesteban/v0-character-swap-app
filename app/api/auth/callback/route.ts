import { NextRequest, NextResponse } from "next/server"
import { setSession, getBaseUrl, getOAuthCookies, clearOAuthCookies } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const baseUrl = getBaseUrl()
  
  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", baseUrl))
  }
  
  // Verify state and get code verifier
  const { state: savedState, verifier } = await getOAuthCookies()
  
  if (!savedState || state !== savedState) {
    await clearOAuthCookies()
    return NextResponse.redirect(new URL("/?error=invalid_state", baseUrl))
  }
  
  if (!verifier) {
    await clearOAuthCookies()
    return NextResponse.redirect(new URL("/?error=no_verifier", baseUrl))
  }
  
  const redirectUri = `${baseUrl}/api/auth/callback`
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID!
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET!
  
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
    
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: tokenBody,
    })
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error("Token exchange failed:", error)
      await clearOAuthCookies()
      return NextResponse.redirect(new URL("/?error=token_exchange", baseUrl))
    }
    
    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    
    if (!accessToken) {
      console.error("No access token in response")
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
    
    if (!userResponse.ok) {
      const userError = await userResponse.text()
      console.error("User info failed:", userError)
      await clearOAuthCookies()
      return NextResponse.redirect(new URL("/?error=user_fetch", baseUrl))
    }
    
    const userData = await userResponse.json()
    
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
    
    return NextResponse.redirect(new URL("/", baseUrl))
  } catch (error) {
    console.error("Auth callback error:", error)
    await clearOAuthCookies()
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl))
  }
}
