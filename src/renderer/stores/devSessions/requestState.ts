let loadSessionsRequestId = 0;

export function beginLoadSessionsRequest(): number {
  loadSessionsRequestId += 1;
  return loadSessionsRequestId;
}

export function invalidateLoadSessionsRequests() {
  loadSessionsRequestId += 1;
}

export function isCurrentLoadSessionsRequest(requestId: number): boolean {
  return requestId === loadSessionsRequestId;
}
