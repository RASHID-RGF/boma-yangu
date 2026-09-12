'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db/prisma'
import { getSession, clearSession } from '@/lib/auth/jwt'
import type { User } from '@/types'

export async function signInWithGoogle() {
  // One Tap / Sign-In Button flow posts the credential to /api/auth/google.
  // This server action is kept only for any server-initiated auth flows.
  return { success: false, error: 'Use the Google Sign-In Button to sign in' }
}

export async function signOut() {
  clearSession()

  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function getUserProfile(): Promise<{ success: boolean; data?: User; error?: string }> {
  const session = await getSession()

  if (!session) {
    return { success: false, error: 'Not authenticated' }
  }

  const email = session.email.toLowerCase()

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        isTwoFactorEnabled: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!dbUser) {
      return { success: false, error: 'User not found in database' }
    }

    return {
      success: true,
      data: {
        ...dbUser,
        role: dbUser.role as User['role'],
      },
    }
  } catch (err) {
    console.error('Failed to fetch user profile:', err)
    return { success: false, error: 'Failed to fetch user profile' }
  }
}
