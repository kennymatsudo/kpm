  /** Alias for `sessions` retained so existing board code (`allSessions`) keeps working. */
  allSessions: DevSessionWithPlanItem[];
  dismissSession: (session: DevSessionWithPlanItem) => Promise<{ success: boolean; error?: string }>;
  updateSessionName: (session: DevSessionWithPlanItem, name: string) => Promise<{ success: boolean; error?: string }>;
  allSessions: [] as DevSessionWithPlanItem[],
