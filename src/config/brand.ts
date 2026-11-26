/**
 * Single source of truth for branding. Renaming the product or the umbrella
 * brand is a one-line change here. Customer organizations show their own name
 * and logo inside the app; this brand appears only as a small "Powered by" line.
 */
export const brand = {
  umbrellaName: "NeaLabs",
  productName: "NeaLabs Manpower",
  productShortName: "Manpower",
  tagline: {
    en: "Invoices, workforce and salaries for manpower companies in Saudi Arabia",
    ar: "الفواتير والعمالة والرواتب لشركات توريد العمالة في السعودية",
  },
  supportEmail: "support@example.com",
  // International format without "+" or spaces, used for wa.me links.
  whatsappNumber: "966500000000",
  logoPath: "/brand/logo.svg",
  colors: {
    // One brand accent on a neutral palette. Used as CSS variables.
    accent: "#0f766e",
    accentHover: "#115e59",
    accentForeground: "#ffffff",
  },
  // Where customer data is stored; shown on the Privacy page and in the app.
  dataLocation: "Demo environment (not for real personal data)",
} as const;

export type Brand = typeof brand;
