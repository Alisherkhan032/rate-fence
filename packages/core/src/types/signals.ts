export type SecuritySignal =
  | { type: "authentication.failure"; key: string; at?: number }
  | { type: "authentication.success"; key: string; at?: number }
  | { type: "response.status"; key: string; status: number; path?: string; at?: number }
  | { type: "payload.oversized"; key: string; at?: number }
  | { type: "request.blocked"; key: string; at?: number };
