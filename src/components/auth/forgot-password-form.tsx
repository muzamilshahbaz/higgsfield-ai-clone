'use client'

import { useActionState } from 'react'

import { requestPasswordReset, type AuthState } from '@/app/(auth)/actions'
import { FieldError, FormError, FormSuccess, SubmitButton } from '@/components/auth/form-parts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INITIAL: AuthState = {}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, INITIAL)

  if (state.success) {
    return <FormSuccess message={state.success} />
  }

  return (
    <form action={formAction} className="space-y-4">
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
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          required
        />
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <SubmitButton pendingLabel="Sending the link…">Send reset link</SubmitButton>
    </form>
  )
}
