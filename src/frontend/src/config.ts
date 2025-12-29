// Runtime config - these are public values (safe to expose)
// Next.js inlines NEXT_PUBLIC_* values at build time.
export const config = {
  userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID,
  clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  region: process.env.NEXT_PUBLIC_REGION,
};
