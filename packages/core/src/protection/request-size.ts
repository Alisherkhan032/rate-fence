export function isRequestTooLarge(
  contentLength: number | undefined,
  maxRequestBytes: number | undefined,
): boolean {
  if (maxRequestBytes === undefined || contentLength === undefined) {
    return false;
  }
  return contentLength > maxRequestBytes;
}
