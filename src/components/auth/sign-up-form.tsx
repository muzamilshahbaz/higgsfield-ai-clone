'use client'

import { useActionState } from 'react'

import { signUp, type AuthState } from '@/app/(auth)/actions'
import { FieldError, FormError, FormSuccess, SubmitButton } from '@/components/auth/form-parts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INITIAL: AuthState = {}

export function SignUpForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signUp, INITIAL)

  // Only reachable if email confirmation gets switched on for the project.
  if (state.success) {
    return <FormSuccess message={state.success} />
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />

      <FormError message={state.error} />

      <div className="space-y-2">
        <Label htmlFor="displayName">Name</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
          defaultValue={state.values?.displayName}
          aria-invalid={Boolean(state.fieldErrors?.displayName)}
          aria-describedby={state.fieldErrors?.displayName ? 'displayName-error' : undefined}
        />
        <FieldError id="displayName-error" message={state.fieldErrors?.displayName} />
      </div>

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

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : 'password-hint'}
          required
        />
        <FieldError id="password-error" message={state.fieldErrors?.password} />
        {!state.fieldErrors?.password && (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        )}
      </div>

      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        You start with 200 credits. No card required.
      </p>
    </form>
  )
}
