import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Initiating Google sign-in is not supported from this endpoint. Use the Google Sign-In Button on the login page.',
    },
    { status: 501 }
  )
}
