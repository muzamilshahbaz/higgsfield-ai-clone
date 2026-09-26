'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'

import { signUp, type AuthState } from '@/app/(auth)/actions'
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

export function SignUpForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signUp, INITIAL)
  // Tracked so the checklist can tick as you type. The input stays a normal
  // named field, so the Server Action still receives it the usual way.
  const [password, setPassword] = useState('')
  // Clears a field's server error the moment that field is edited, so a stale
  // "add an uppercase letter" cannot sit under a password the checklist has
  // already gone green for.
  const { errorFor, onEdit } = useFieldErrors(state)

  /*
    The project has email confirmation ON, so this is the ordinary path out of
    a successful sign-up rather than an edge case: Supabase creates the user,
    returns no session, and nothing else happens until the link is clicked.
    It gets a real panel rather than a one-line banner because it is the last
    thing the user sees here and it has to tell them what to do next.
  */
  if (state.success) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-success/15">
          <MailCheck className="size-5 text-success" aria-hidden />
        </span>

        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Confirm your email</h2>
          {/*
            The address is echoed back deliberately. A confirmation link that
            never arrives is most often a typo in the address, and this is the
            last moment it can be spotted without starting again.
          */}
          {state.values?.email && (
            <p className="break-all font-medium">{state.values.email}</p>
          )}
          <p className="text-sm leading-relaxed text-muted-foreground">{state.success}</p>
        </div>

        {/*
          Deliberately does NOT claim the account is unprovisioned. The
          `on_auth_user_created` trigger fires `after insert on auth.users`,
          which Supabase does at sign-up rather than at confirmation — so the
          profile, the default project and the signup credits already exist by
          the time this renders. Saying otherwise would be a comforting lie.
        */}
        <p className="text-xs text-muted-foreground">
          The link only works once and expires after a while. If it has not arrived in a minute,
          check your spam folder.
        </p>

        <Link
          href="/sign-in"
          className="inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    )
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
          onChange={() => onEdit('displayName')}
          aria-invalid={Boolean(errorFor('displayName'))}
          aria-describedby={errorFor('displayName') ? 'displayName-error' : undefined}
        />
        <FieldError id="displayName-error" message={errorFor('displayName')} />
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
          onChange={() => onEdit('email')}
          aria-invalid={Boolean(errorFor('email'))}
          aria-describedby={errorFor('email') ? 'email-error' : undefined}
          required
        />
        <FieldError id="email-error" message={errorFor('email')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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

      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        You start with 200 credits. No card required.
      </p>
    </form>
  )
}
