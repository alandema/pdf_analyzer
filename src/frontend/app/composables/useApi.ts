export function useApi() {
  const config = useRuntimeConfig()

  async function uploadPdf(idToken: string, file: File) {
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.readAsDataURL(file)
    })
    const res = await fetch(`${config.public.apiUrl}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, file: base64 }),
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  }

  async function getProcessedPdfs(idToken: string) {
    const res = await fetch(`${config.public.apiUrl}/processed`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) throw new Error('Failed to fetch processed PDFs')
    return res.json()
  }

  async function getPlans() {
    const res = await fetch(`${config.public.apiUrl}/stripe/plans`)
    if (!res.ok) throw new Error('Failed to fetch plans')
    return res.json()
  }

  async function createCheckoutSession(idToken: string, priceId: string, successUrl: string, cancelUrl: string) {
    const res = await fetch(`${config.public.apiUrl}/stripe/checkout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, successUrl, cancelUrl }),
    })
    if (!res.ok) throw new Error('Failed to create checkout session')
    return res.json()
  }

  return { uploadPdf, getProcessedPdfs, getPlans, createCheckoutSession }
}
