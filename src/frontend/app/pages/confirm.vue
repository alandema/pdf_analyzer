<template>
  <main class="container">
    <h1>📄 PDF Analyzer</h1>
    <div class="card">
      <h2>Verify Email</h2>
      <p class="info">{{ message }}</p>
      <p class="info">Email: {{ email }}</p>
      <input v-model="code" type="text" placeholder="Verification Code" />
      <button @click="handleConfirm">Confirm</button>
      <p class="link-text"><NuxtLink to="/signup">Back to Sign Up</NuxtLink></p>
    </div>
  </main>
</template>

<script setup lang="ts">
const code = ref('')
const email = ref('')
const message = ref('Check your email for verification code')
const { confirmSignUp } = useAuth()

onMounted(() => {
  email.value = localStorage.getItem('pendingEmail') || ''
})

async function handleConfirm() {
  try {
    await confirmSignUp(email.value, code.value)
    localStorage.removeItem('pendingEmail')
    message.value = 'Email verified! Redirecting to login...'
    setTimeout(() => navigateTo('/login'), 2000)
  } catch (e: any) {
    message.value = e.message
  }
}
</script>
