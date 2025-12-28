import { config } from './config';

interface CognitoAuthResult {
  IdToken: string;
  AccessToken: string;
  RefreshToken?: string;
}

interface CognitoResponse {
  AuthenticationResult?: CognitoAuthResult;
  message?: string;
  __type?: string;
}

async function cognitoFetch(action: string, body: object): Promise<CognitoResponse> {
  const res = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.__type || 'Request failed');
  return data;
}

export async function signUp(email: string, password: string): Promise<void> {
  await cognitoFetch('SignUp', {
    ClientId: config.clientId,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognitoFetch('ConfirmSignUp', {
    ClientId: config.clientId,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function signIn(email: string, password: string): Promise<{ idToken: string; accessToken: string }> {
  const res = await cognitoFetch('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  
  if (!res.AuthenticationResult) throw new Error('Authentication failed');
  
  return {
    idToken: res.AuthenticationResult.IdToken,
    accessToken: res.AuthenticationResult.AccessToken,
  };
}
