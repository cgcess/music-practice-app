/** Dev-only logging. No-op in production builds; nothing is persisted. */
export function log(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}
