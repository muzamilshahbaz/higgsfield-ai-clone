'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { signIn, type AuthState } from '@/app/(auth)/actions'
import {
  FieldError,
  FormError,
  SubmitButton,
  useFieldErrors,
} from '@/components/auth/form-parts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INITIAL: AuthState = {}

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, INITIAL)
  const { errorFor, onEdit } = useFieldErrors(state)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />

      <FormError message={state.error} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@studio.com"
          defaultValue={state.values?.email}
          onChange={() => onEdit('email')}
          aria-invalid={Boolean(errorFor('email'))}
          aria-describedby={errorFor('email') ? 'email-error' : undefined}
          required
        />
        <FieldError id="email-error" message={errorFor('email')} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Forgot?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          onChange={() => onEdit('password')}
          placeholder="••••••••"
          aria-invalid={Boolean(errorFor('password'))}
          aria-describedby={errorFor('password') ? 'password-error' : undefined}
          required
        />
        <FieldError id="password-error" message={errorFor('password')} />
      </div>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  )
}
