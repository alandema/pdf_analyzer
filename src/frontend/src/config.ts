// Runtime config - these are public values (safe to expose)
export const config = {
  userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID || 'us-east-2_QNyvXp3ad',
  clientId: process.env.NEXT_PUBLIC_CLIENT_ID || '58bvl0sqtg6vg9mfd00g1rce39',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'https://jzup99p8tg.execute-api.us-east-2.amazonaws.com/development',
  region: process.env.NEXT_PUBLIC_REGION || 'us-east-2',
};
