<template>
  <main v-if="token" class="container">
    <h1>📄 PDF Analyzer</h1>
    <div class="card">
      <div class="user-info"><strong>Logged in as:</strong> {{ email }}</div>
      <button class="logout" @click="handleLogout">Logout</button>
      <button @click="navigateTo('/subscribe')" style="margin-left: 0.5rem">💎 Upgrade Plan</button>

      <hr />

      <h3>Upload PDF</h3>
      <input ref="fileInput" type="file" accept=".pdf" @change="onFileChange" />
      <button :disabled="!selectedFile" @click="handleUpload">Confirm Upload</button>
      <div v-if="uploadStatus" class="success">{{ uploadStatus }}</div>

      <hr />

      <h3>Processed PDFs</h3>
      <button :disabled="loadingPdfs" @click="fetchPdfs">
        {{ loadingPdfs ? 'Loading...' : 'Refresh Processed PDFs' }}
      </button>

      <table v-if="pdfs.length" class="pdf-table">
        <thead>
          <tr><th>Name</th><th>Status</th><th>Uploaded</th><th>Processed</th><th>Link</th></tr>
        </thead>
        <tbody>
          <tr v-for="f in pdfs" :key="f.pdfId || f.name">
            <td>{{ f.name }}</td>
            <td>{{ f.status }}</td>
            <td>{{ f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '-' }}</td>
            <td>{{ f.processedAt ? new Date(f.processedAt).toLocaleString() : '-' }}</td>
            <td>
              <a v-if="f.url" :href="f.url" target="_blank">Download</a>
              <span v-else>Not available</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="!pdfs.length && !loadingPdfs" class="info">No processed PDFs yet. Upload a PDF to get started!</p>
    </div>
  </main>
</template>

<script setup lang="ts">
const { load, clear } = useSession()
const { uploadPdf, getProcessedPdfs } = useApi()

const email = ref('')
const token = ref('')
const uploadStatus = ref('')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pdfs = ref<any[]>([])
const loadingPdfs = ref(false)

onMounted(() => {
  const session = load()
  if (!session.token) return navigateTo('/login')
  email.value = session.email || ''
  token.value = session.token
  fetchPdfs()
})

function handleLogout() {
  clear()
  navigateTo('/login')
}

function onFileChange(e: Event) {
  selectedFile.value = (e.target as HTMLInputElement).files?.[0] || null
}

async function handleUpload() {
  if (!selectedFile.value) return
  uploadStatus.value = 'Uploading...'
  try {
    await uploadPdf(token.value, selectedFile.value)
    uploadStatus.value = '✅ Uploaded!'
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
  } catch {
    uploadStatus.value = '❌ Upload failed. Please try again.'
  }
}

async function fetchPdfs() {
  loadingPdfs.value = true
  try {
    const data = await getProcessedPdfs(token.value)
    pdfs.value = data.files
  } catch (e) {
    console.error('Failed to fetch processed PDFs:', e)
  } finally {
    loadingPdfs.value = false
  }
}
</script>
