'use client'

import { useActionState } from 'react'

import { resetPassword, type AuthState } from '@/app/(auth)/actions'
import { FieldError, FormError, SubmitButton } from '@/components/auth/form-parts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INITIAL: AuthState = {}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPassword, INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          required
        />
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          aria-describedby={state.fieldErrors?.confirmPassword ? 'confirm-error' : undefined}
          required
        />
        <FieldError id="confirm-error" message={state.fieldErrors?.confirmPassword} />
      </div>

      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  )
}
