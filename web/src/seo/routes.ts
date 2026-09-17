export const SITE_NAME = "Super AI";
export const SITE_URL = "https://super-ai.amrahaz.me";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface RouteSeo {
  title: string;
  description: string;
  canonical: string;
  index: boolean;
  ogType?: string;
}

const make = (
  path: string,
  index: boolean,
  title: string,
  description: string,
  ogType: string = "website"
): RouteSeo => ({
  title,
  description,
  canonical: `${SITE_URL}${path === "/" ? "/" : path}`,
  index,
  ogType,
});

export const seoByPath: Record<string, RouteSeo> = {
  "/": make(
    "/",
    true,
    "Super AI — Free AI Chat Assistant Powered by Gemini",
    "Chat with Super AI, a free AI assistant powered by Gemini. Ask anything, use voice input, attach files, and get instant answers in beautiful markdown, code, and math."
  ),
  "/login": make(
    "/login",
    true,
    "Sign In | Super AI",
    "Sign in to Super AI to continue your conversations, access your saved themes, and keep every chat in sync across devices."
  ),
  "/signup": make(
    "/signup",
    true,
    "Sign Up | Super AI — Free AI Chat",
    "Create a free Super AI account. Chat with an AI assistant powered by Gemini, use voice input and file attachments, and pick from 8 chat themes — no credit card required."
  ),
  "/forgot-password": make(
    "/forgot-password",
    false,
    "Forgot Password | Super AI",
    "Reset your Super AI password and get back to your conversations in minutes."
  ),
  "/reset-password": make(
    "/reset-password",
    false,
    "Reset Password | Super AI",
    "Choose a new password for your Super AI account."
  ),
  "/verify-email": make(
    "/verify-email",
    false,
    "Verify Email | Super AI",
    "Verify your email address to activate your Super AI account."
  ),
};

export const fallbackSeo: RouteSeo = {
  title: `${SITE_NAME} — The next generation of intelligent conversation`,
  description:
    "Super AI is a free AI chat assistant powered by Gemini with voice input, file attachments, and beautiful markdown, code, and math rendering.",
  canonical: SITE_URL,
  index: false,
  ogType: "website",
};

export const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "WebApplication",
  operatingSystem: "Web",
  description: fallbackSeo.description,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList:
    "AI-powered conversations, voice input, file attachments, markdown and math rendering, 8 chat themes, secure authentication",
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  },
};

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: fallbackSeo.description,
};