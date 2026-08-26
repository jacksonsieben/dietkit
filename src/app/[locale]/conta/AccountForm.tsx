"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { ActionButton } from "@/components/nd/kit";
import {
  MINIMUM_PASSWORD_LENGTH,
  type AccountState,
  type ErrorKey,
} from "@/lib/auth/contract";

/**
 * The one form the account screens draw (#93).
 *
 * It lives beside the screens rather than in `src/components/` on purpose:
 * `src/account-optional.test.ts` lets only the account screens reach the auth
 * module, and a shared component in the components folder importing it — even
 * for a type — would be the first hole in that wall. Colocation makes the
 * boundary a directory instead of a list somebody has to keep honest.
 *
 * All four forms are the same three questions in different combinations, so
 * this takes the fields as a list rather than being copied four times. It is a
 * list of what to ask, not a mode switch: nothing below branches on which
 * screen is rendering it.
 */

/** Every failure the server can return, in the language of the catalogue. */
const MESSAGE = {
  credentials: "errorCredentials",
  exists: "errorExists",
  identityRemains: "errorIdentityRemains",
  invalidEmail: "errorInvalidEmail",
  invalidToken: "errorInvalidToken",
  shortPassword: "errorShortPassword",
  throttled: "errorThrottled",
  unavailable: "errorUnavailable",
  unexpected: "errorUnexpected",
} as const satisfies Record<ErrorKey, string>;

export type FieldName = "email" | "password" | "newPassword";

/**
 * `autoComplete` is doing real work here rather than being decoration: it is
 * what tells a password manager that the box on `/conta/redefinir` is a new
 * password to generate rather than the old one to fill in.
 */
const FIELDS = {
  email: {
    name: "email",
    type: "email",
    autoComplete: "email",
    label: "emailLabel",
    hint: "emailHint",
  },
  password: {
    name: "password",
    type: "password",
    autoComplete: "current-password",
    label: "passwordLabel",
    hint: "currentPasswordHint",
  },
  newPassword: {
    name: "password",
    type: "password",
    autoComplete: "new-password",
    label: "passwordLabel",
    hint: "passwordHint",
  },
} as const satisfies Record<FieldName, unknown>;

const EMPTY: AccountState = {};

export function AccountForm({
  action,
  fields,
  submit,
  done,
  token,
}: {
  action: (state: AccountState, form: FormData) => Promise<AccountState>;
  fields: readonly FieldName[];
  /** The label on the button. */
  submit: string;
  /** What to say instead of the form once it has succeeded, where it stays put. */
  done?: string;
  /** The one-time reset token, carried from the emailed link. */
  token?: string;
}) {
  const t = useTranslations("Account");
  const [state, formAction, pending] = useActionState(action, EMPTY);

  if (state.done && done) {
    return (
      <p role="status" className="max-w-prose text-sm leading-relaxed">
        {done}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {token === undefined ? null : (
        <input type="hidden" name="token" value={token} />
      )}

      {fields.map((field) => {
        const spec = FIELDS[field];

        return (
          <Field
            key={field}
            label={t(spec.label)}
            hint={t(spec.hint, { length: MINIMUM_PASSWORD_LENGTH })}
          >
            {(props) => (
              <input
                {...props}
                name={spec.name}
                type={spec.type}
                autoComplete={spec.autoComplete}
                required
                minLength={
                  spec.autoComplete === "new-password"
                    ? MINIMUM_PASSWORD_LENGTH
                    : undefined
                }
              />
            )}
          </Field>
        );
      })}

      {state.error ? (
        <p
          role="alert"
          className="max-w-prose text-sm leading-relaxed text-nd-red-ink"
        >
          {t(MESSAGE[state.error], { length: MINIMUM_PASSWORD_LENGTH })}
        </p>
      ) : null}

      <ActionButton type="submit" disabled={pending}>
        {pending ? t("working") : submit}
      </ActionButton>
    </form>
  );
}
