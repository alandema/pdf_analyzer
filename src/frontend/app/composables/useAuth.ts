export function useAuth() {
  const config = useRuntimeConfig()

  const errorMessages: Record<string, string> = {
    UserNotConfirmedException: 'Please confirm your email before signing in.',
    NotAuthorizedException: 'Incorrect email or password.',
    UserNotFoundException: 'User not found. Please sign up first.',
    UsernameExistsException: 'An account with this email already exists.',
    CodeMismatchException: 'Invalid confirmation code.',
    ExpiredCodeException: 'Confirmation code has expired.',
    TooManyRequestsException: 'Too many attempts. Please try again later.',
  }

  async function cognitoFetch(action: string, body: object) {
    const res = await fetch(`https://cognito-idp.${config.public.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(errorMessages[data.__type] || data.message || 'Request failed')
    }
    return data
  }

  async function signUp(email: string, password: string) {
    await cognitoFetch('SignUp', {
      ClientId: config.public.clientId,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    })
  }

  async function confirmSignUp(email: string, code: string) {
    await cognitoFetch('ConfirmSignUp', {
      ClientId: config.public.clientId,
      Username: email,
      ConfirmationCode: code,
    })
  }

  async function signIn(email: string, password: string) {
    const res = await cognitoFetch('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.public.clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
    if (!res.AuthenticationResult) throw new Error('Authentication failed')
    return {
      idToken: res.AuthenticationResult.IdToken,
      accessToken: res.AuthenticationResult.AccessToken,
    }
  }

  return { signUp, confirmSignUp, signIn }
}
