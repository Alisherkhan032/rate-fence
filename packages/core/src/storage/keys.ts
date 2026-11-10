/** Stable key namespaces to avoid collisions across modules. */
export const StoreKeys = {
  rate: (algorithm: string, clientKey: string, policy?: string) =>
    `rate:${algorithm}:${policy ?? "global"}:${clientKey}`,
  block: (clientKey: string) => `block:${clientKey}`,
  threat: (rule: string, clientKey: string) => `threat:${rule}:${clientKey}`,
  threatRoutes: (clientKey: string) => `threat:routes:${clientKey}`,
  concurrencyGlobal: () => `concurrency:global`,
  concurrencyClient: (clientKey: string) => `concurrency:client:${clientKey}`,
  concurrencyRoute: (route: string) => `concurrency:route:${route}`,
  signal: (type: string, clientKey: string) => `signal:${type}:${clientKey}`,
} as const;
