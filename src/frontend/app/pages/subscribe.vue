<template>
  <main v-if="token" class="container">
    <h1>📄 Choose Your Plan</h1>
    <p style="text-align: center; margin-bottom: 2rem">Upgrade your account to upload more PDFs each month.</p>

    <div v-if="loadingPlans" class="card" style="text-align: center">
      <div class="spinner" />
      <div style="margin-top: 0.75rem; color: #666">Loading plans…</div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="!loadingPlans && !error" style="display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap">
      <div
        v-for="plan in plans" :key="plan.name"
        class="card"
        :style="{ width: '280px', textAlign: 'center', border: plan.name === 'Gold' ? '2px solid gold' : '1px solid #ddd' }"
      >
        <h2>{{ plan.name }}</h2>
        <p style="font-size: 2rem; font-weight: bold; margin: 1rem 0">{{ plan.price }}</p>
        <ul style="text-align: left; margin: 1.5rem 0; padding-left: 1.5rem">
          <li v-for="f in plan.features" :key="f" style="margin-bottom: 0.5rem">{{ f }}</li>
        </ul>
        <button
          :disabled="loading !== null || !plan.priceId"
          style="width: 100%"
          @click="handleSubscribe(plan.priceId, plan.name)"
        >
          {{ loading === plan.name ? 'Loading...' : `Subscribe to ${plan.name}` }}
        </button>
      </div>
    </div>

    <div style="text-align: center; margin-top: 2rem">
      <button class="logout" @click="navigateTo('/')">← Back to Dashboard</button>
    </div>
  </main>
</template>

<script setup lang="ts">
const { load } = useSession()
const { getPlans, createCheckoutSession } = useApi()

const token = ref('')
const loading = ref<string | null>(null)
const loadingPlans = ref(true)
const error = ref('')
const plans = ref<any[]>([])

onMounted(async () => {
  const session = load()
  if (!session.token) return navigateTo('/login')
  token.value = session.token
  try {
    const data = await getPlans()
    plans.value = data.plans
  } catch {
    error.value = 'Failed to load plans. Please try again.'
  } finally {
    loadingPlans.value = false
  }
})

async function handleSubscribe(priceId: string | null, planName: string) {
  if (!priceId) return
  loading.value = planName
  error.value = ''
  try {
    const origin = window.location.origin
    const { url } = await createCheckoutSession(token.value, priceId, `${origin}?success=true`, `${origin}/subscribe?canceled=true`)
    window.location.href = url
  } catch {
    error.value = 'Failed to start checkout. Please try again.'
    loading.value = null
  }
}
</script>
