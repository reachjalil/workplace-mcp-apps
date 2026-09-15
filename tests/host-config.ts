export const hostPort = Number(process.env.WORKPLACE_TEST_PORT ?? 43173);
if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65534) {
  throw new Error("WORKPLACE_TEST_PORT must be an integer between 1024 and 65534.");
}

export const hostOrigin = `http://127.0.0.1:${hostPort}`;
export const widgetOrigin = `http://127.0.0.1:${hostPort + 1}`;
export const fixtureTime = Date.UTC(2026, 0, 6, 12);
export const widgetCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "img-src data:",
  "font-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  `frame-ancestors ${hostOrigin}`,
].join("; ");
