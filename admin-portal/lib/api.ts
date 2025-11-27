export function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_BASE;
  if (env) {
    // Ensure exactly one trailing slash even if env lacks it
    return env.endsWith("/") ? env : env + "/";
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h.endsWith("digitalchain.in")) {
      // Use relative URL so Next.js rewrites work
      return "/api/";
    }
  }
  return "http://localhost:8000/";
}
