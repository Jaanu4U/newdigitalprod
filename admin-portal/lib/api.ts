export function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (env) {
    // env should already include /v1/ - just ensure trailing slash
    return env.endsWith("/") ? env : env + "/";
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h.endsWith("digitalchain.in")) {
      // Use full API URL for production
      return "https://api.digitalchain.in/v1/";
    }
  }
  return "http://localhost:8000/v1/";
}
