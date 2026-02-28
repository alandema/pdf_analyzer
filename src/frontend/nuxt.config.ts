export default defineNuxtConfig({
  ssr: false,
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      userPoolId: '',
      clientId: '',
      apiUrl: '',
      region: '',
    },
  },
})
