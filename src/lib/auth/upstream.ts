/**
 * Telling "this deployment is wrong" apart from "you typed the wrong thing".
 *
 * Every other error from the auth service is deliberately flattened into one
 * message: a wrong password and an address with no account come back the same
 * way, because the difference between them is the answer to "does this person
 * use this app" (`./actions.ts`). That flattening is right for anything a
 * person could have caused, and wrong for anything they could not.
 *
 * The case that taught us this was a deployed preview whose domain had not
 * been added to Neon's trusted domains. The service answered 403 INVALID_ORIGIN
 * to every request, and because sign-up maps any returned error to "exists",
 * the screen told somebody creating their first account that the address
 * already had one. The person then has no move: the thing they are being asked
 * to fix is not theirs to fix, and the message points them away from the cause.
 *
 * So a small, named set. Not "any 403" — a banned account is a 403 too, and
 * quietly reporting that as "the service is unavailable" would be the same
 * mistake in the other direction.
 */

/** As much of Better Auth's error as this needs. `code` is the stable part. */
export interface UpstreamError {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Codes that describe the configuration rather than the request.
 *
 * Both of these are the trusted-domains list: the first when the origin is not
 * on it, the second when there is no origin header to check. Add to this set
 * only when the answer to "could the person on the screen have caused this?"
 * is no.
 */
const CONFIGURATION = new Set(["INVALID_ORIGIN", "MISSING_OR_NULL_ORIGIN"]);

/**
 * The code, when the failure is ours to fix, and null otherwise.
 *
 * Returns the code rather than a boolean so the caller can put it in a server
 * log. It is safe to log: it names a setting, not a person, and it is the one
 * thing that turns a silent misconfiguration into a five-minute fix.
 */
export function configurationProblem(error: UpstreamError): string | null {
  const code = error.code;
  return code !== undefined && CONFIGURATION.has(code) ? code : null;
}
