import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  return NextResponse.redirect(`${origin}/login?error=invalid_auth_callback`)
}
