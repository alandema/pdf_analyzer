export function useSession() {
  function save(email: string, token: string) {
    localStorage.setItem('email', email)
    localStorage.setItem('idToken', token)
  }

  function load() {
    return {
      email: localStorage.getItem('email'),
      token: localStorage.getItem('idToken'),
    }
  }

  function clear() {
    localStorage.clear()
  }

  return { save, load, clear }
}
