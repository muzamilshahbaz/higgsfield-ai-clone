'use client'

import { useActionState, useState } from 'react'

import { resetPassword, type AuthState } from '@/app/(auth)/actions'
import {
  FieldError,
  FormError,
  SubmitButton,
  useFieldErrors,
} from '@/components/auth/form-parts'
import { PasswordChecklist } from '@/components/auth/password-checklist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INITIAL: AuthState = {}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPassword, INITIAL)
  // A reset has to satisfy exactly the rules a new account does, so it shows
  // exactly the same checklist rather than leaving the user to guess.
  const [password, setPassword] = useState('')
  const { errorFor, onEdit } = useFieldErrors(state)

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
          placeholder="Choose a strong password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            onEdit('password')
          }}
          aria-invalid={Boolean(errorFor('password'))}
          aria-describedby={errorFor('password') ? 'password-error' : 'password-rules'}
          required
        />
        <FieldError id="password-error" message={errorFor('password')} />
        <PasswordChecklist id="password-rules" value={password} className="pt-1" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          onChange={() => onEdit('confirmPassword')}
          aria-invalid={Boolean(errorFor('confirmPassword'))}
          aria-describedby={errorFor('confirmPassword') ? 'confirm-error' : undefined}
          required
        />
        <FieldError id="confirm-error" message={errorFor('confirmPassword')} />
      </div>

      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  )
}
