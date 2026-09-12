import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getSession } from '@/lib/auth/jwt'

export async function GET() {
  try {
    const session = await getSession()

    if (!session || !session.email) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: session.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: dbUser })
  } catch (error) {
    console.error('Get current user error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}
