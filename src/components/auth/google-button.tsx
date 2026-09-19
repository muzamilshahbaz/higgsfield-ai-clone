'use client'

import { useActionState } from 'react'

import { signInWithGoogle, type AuthState } from '@/app/(auth)/actions'
import { FormError, SubmitButton } from '@/components/auth/form-parts'

const INITIAL: AuthState = {}

/** Google icon. Inlined so the button needs no network request to render. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

export function GoogleButton({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInWithGoogle, INITIAL)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ''} />
      <SubmitButton variant="outline" pendingLabel="Redirecting to Google…">
        <GoogleMark />
        Continue with Google
      </SubmitButton>
      <FormError message={state.error} />
    </form>
  )
}
