// Curated Region and Timezone options for Organization Settings
// Keep lists small and relevant; expand later as needed.

export type Option = { value: string; label: string };

export const REGIONS: Option[] = [
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "QA", label: "Qatar" },
  { value: "KW", label: "Kuwait" },
  { value: "OM", label: "Oman" },
  { value: "BH", label: "Bahrain" },
  { value: "LK", label: "Sri Lanka" },
  { value: "BD", label: "Bangladesh" },
  { value: "NP", label: "Nepal" },
  { value: "PK", label: "Pakistan" },
  { value: "US", label: "United States" },
  { value: "EU", label: "Europe (EU)" },
  { value: "APAC", label: "Asia Pacific (APAC)" },
  { value: "GLOBAL", label: "Global" },
];

// A focused set of IANA timezones covering common customer locales.
export const TIMEZONES: Option[] = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+05:30)" },
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu (NPT, UTC+05:45)" },
  { value: "Asia/Karachi", label: "Asia/Karachi (PKT, UTC+05:00)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (BST, UTC+06:00)" },
  { value: "Asia/Colombo", label: "Asia/Colombo (SLST, UTC+05:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+04:00)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (AST, UTC+03:00)" },
  { value: "Asia/Doha", label: "Asia/Doha (AST, UTC+03:00)" },
  { value: "Asia/Kuwait", label: "Asia/Kuwait (AST, UTC+03:00)" },
  { value: "Asia/Bahrain", label: "Asia/Bahrain (AST, UTC+03:00)" },
  { value: "Asia/Muscat", label: "Asia/Muscat (GST, UTC+04:00)" },
  { value: "Europe/London", label: "Europe/London (UK, UTC±00/±01)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST, UTC+01/UTC+02)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST, UTC+01/UTC+02)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (CET/CEST, UTC+01/UTC+02)" },
  { value: "America/New_York", label: "America/New_York (ET, UTC-05/UTC-04)" },
  { value: "America/Chicago", label: "America/Chicago (CT, UTC-06/UTC-05)" },
  { value: "America/Denver", label: "America/Denver (MT, UTC-07/UTC-06)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT, UTC-08/UTC-07)" },
];

export function detectBrowserTimeZone(): string | null {
  try {
    // Available in modern browsers
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || null;
  } catch {
    return null;
  }
}
