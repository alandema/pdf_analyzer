<template>
  <main class="container">
    <h1>📄 PDF Analyzer</h1>
    <div class="card">
      <h2>Sign Up</h2>
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password (min 8 chars, upper+lower+number)" />
      <input v-model="confirmPassword" type="password" placeholder="Confirm Password" />
      <button @click="handleSignup">Sign Up</button>
      <div v-if="error" class="error">{{ error }}</div>
      <p class="link-text">Already have an account? <NuxtLink to="/login">Login</NuxtLink></p>
    </div>
  </main>
</template>

<script setup lang="ts">
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const { signUp } = useAuth()

async function handleSignup() {
  try {
    error.value = ''
    if (password.value !== confirmPassword.value) {
      error.value = 'Passwords do not match'
      return
    }
    await signUp(email.value, password.value)
    localStorage.setItem('pendingEmail', email.value)
    navigateTo('/confirm')
  } catch (e: any) {
    error.value = e.message
  }
}
</script>
