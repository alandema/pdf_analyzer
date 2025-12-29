// session.ts - Simple session management (like a Python class)
// This handles saving and loading user data from the browser

// Save user session after login
export function saveSession(email: string, token: string) {
  localStorage.setItem('email', email);
  localStorage.setItem('idToken', token);
}

// Load user session from browser storage
export function loadSession() {
  const email = localStorage.getItem('email');
  const token = localStorage.getItem('idToken');
  return { email, token };
}

// Clear user session (logout)
export function clearSession() {
  localStorage.clear();
}

// Check if user is logged in
export function isLoggedIn() {
  const { token } = loadSession();
  return token !== null;
}
