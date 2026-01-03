import { config } from './config';
import toast from 'react-hot-toast';

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
  if (!res.ok) {
    let errorMessage = data.message || data.__type || 'Request failed';
    let displayMessage = errorMessage;

    switch (data.__type) {
      case 'UserNotConfirmedException':
        displayMessage = 'Please confirm your email before signing in.';
        break;
      case 'NotAuthorizedException':
        displayMessage = 'Incorrect email or password.';
        break;
      case 'UserNotFoundException':
        displayMessage = 'User not found. Please sign up first.';
        break;
      case 'UsernameExistsException':
        displayMessage = 'An account with this email already exists.';
        break;
      case 'CodeMismatchException':
        displayMessage = 'Invalid confirmation code.';
        break;
      case 'ExpiredCodeException':
        displayMessage = 'Confirmation code has expired.';
        break;
      case 'TooManyRequestsException':
        displayMessage = 'Too many attempts. Please try again later.';
        break;
      default:
        displayMessage = errorMessage;
    }

    toast.error(displayMessage);
    throw new Error(errorMessage);
  }
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
