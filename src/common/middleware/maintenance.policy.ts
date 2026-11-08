/** Pure rules — kept free of Nest imports so Jest can unit-test without ESM friction. */
export function isHealthPath(path: string): boolean {
  return (
    path === '/v1/health' ||
    path === '/v1/ready' ||
    path === '/health' ||
    path === '/ready' ||
    path.endsWith('/health') ||
    path.endsWith('/ready')
  );
}

export function shouldBlockForMaintenance(
  maintenanceMode: boolean,
  path: string,
): boolean {
  if (!maintenanceMode) return false;
  return !isHealthPath(path);
}
