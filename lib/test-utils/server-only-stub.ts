// Stub for the `server-only` package used under vitest.
// In production the real module throws if imported from a client component,
// which is the desired safety behavior. Unit tests run in node and don't
// care about that boundary, so we alias this no-op in place.
export {};
