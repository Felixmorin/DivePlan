const MISSING_START_TIME_MESSAGE =
  "Cannot read properties of undefined (reading 'startTime')";

/**
 * Some browser- or hosting-injected Web Vitals collectors can receive an INP
 * entry without its matching render-timing record. That collector failure is
 * unrelated to application code, but otherwise appears as an uncaught error.
 *
 * Keep this deliberately narrow so genuine DivePlan errors still reach the
 * Next.js error overlay and any monitoring installed by the application.
 */
export function isExternalWebVitalsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === MISSING_START_TIME_MESSAGE &&
    error.stack?.includes("reportAllChanges") === true &&
    error.stack.includes("<anonymous>")
  );
}
