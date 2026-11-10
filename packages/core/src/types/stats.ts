export interface FenceStats {
  totalEvaluated: number;
  allowed: number;
  blocked: number;
  rateLimitViolations: number;
  threatDetections: number;
  concurrencyRejections: number;
  activeConcurrentRequests: number;
  activeTrackedClients: number;
  storeEntryCount: number;
}

export interface StoreStats {
  entryCount: number;
  maxEntries: number;
  expiredSwept: number;
  evicted: number;
}
