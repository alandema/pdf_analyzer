<template>
  <main class="container">
    <h1>📄 PDF Analyzer</h1>
    <div class="card">
      <h2>Login</h2>
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password" />
      <button @click="handleLogin">Login</button>
      <div v-if="error" class="error">{{ error }}</div>
      <p class="link-text">Don't have an account? <NuxtLink to="/signup">Sign Up</NuxtLink></p>
    </div>
  </main>
</template>

<script setup lang="ts">
const email = ref('')
const password = ref('')
const error = ref('')
const { signIn } = useAuth()
const { save } = useSession()

async function handleLogin() {
  try {
    error.value = ''
    const result = await signIn(email.value, password.value)
    save(email.value, result.idToken)
    navigateTo('/')
  } catch (e: any) {
    error.value = e.message
  }
}
</script>
