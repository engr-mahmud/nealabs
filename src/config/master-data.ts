/** Settings for clients, sites and workforce. Change here, not in components. */
export const masterDataConfig = {
  /** A document is "expiring soon" when it expires within this many days. */
  expiryWarningDays: 30,
  /** Reminder emails go out when a document is exactly this many days from expiry (0 = expires today). */
  reminderDays: [30, 14, 7, 1, 0],
  pageSize: 50,
  import: {
    maxBytes: 2 * 1024 * 1024,
    maxRows: 2000,
  },
  /** Suggestions for the nationality field. Users can still type any value. */
  nationalities: [
    "Bangladesh",
    "India",
    "Pakistan",
    "Nepal",
    "Philippines",
    "Sri Lanka",
    "Indonesia",
    "Egypt",
    "Sudan",
    "Yemen",
    "Jordan",
    "Syria",
    "Ethiopia",
    "Kenya",
    "Uganda",
    "Saudi Arabia",
  ],
} as const;
