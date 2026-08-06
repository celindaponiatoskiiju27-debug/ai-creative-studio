<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <a href="/" class="admin-brand"><span>✦</span> 灵境 AI 管理后台</a>
      <div v-if="profile" class="admin-account"><span>{{ profile.email }}</span><button @click="logout">退出</button></div>
    </header>

    <div v-if="loading" class="admin-gate"><div class="loader"><i /><i /><i /></div><p>正在验证管理员权限…</p></div>

    <form v-else-if="!session" class="auth-card admin-login" @submit.prevent="login">
      <div class="auth-logo">✦</div><h2>管理员登录</h2><p>此入口仅供平台管理员使用</p>
      <label>管理员邮箱</label><input v-model.trim="email" type="email" autocomplete="email" required />
      <label>密码</label><input v-model="password" type="password" autocomplete="current-password" minlength="6" required />
      <button class="auth-submit" :disabled="submitting">{{ submitting ? '登录中…' : '登录后台' }}</button>
      <p v-if="errorMessage" class="auth-message error">{{ errorMessage }}</p>
    </form>

    <div v-else-if="denied" class="admin-denied"><h2>无权访问管理后台</h2><p>当前账号不是管理员，请联系最高管理员授权。</p><button @click="logout">返回登录</button></div>

    <AdminPanel v-else :session="session" />
  </div>
</template>

<script>
import AdminPanel from './AdminPanel.vue'
import { supabase, supabaseConfigured } from './supabase'

export default {
  name: 'AdminApp',
  components: { AdminPanel },
  data: () => ({ session: null, profile: null, email: '', password: '', loading: true, submitting: false, denied: false, errorMessage: '', subscription: null }),
  async mounted() {
    if (!supabaseConfigured) { this.errorMessage = '后台登录服务尚未配置'; this.loading = false; return }
    const { data } = await supabase.auth.getSession()
    this.session = data.session
    if (this.session) await this.verifyAdmin()
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      this.session = session; this.profile = null; this.denied = false
      if (session) await this.verifyAdmin()
    })
    this.subscription = listener.subscription
    this.loading = false
  },
  beforeDestroy() { this.subscription?.unsubscribe() },
  methods: {
    async login() {
      this.submitting = true; this.errorMessage = ''
      const { error } = await supabase.auth.signInWithPassword({ email: this.email, password: this.password })
      if (error) this.errorMessage = error.message || '登录失败'
      this.submitting = false
    },
    async verifyAdmin() {
      this.loading = true
      try {
        const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${this.session.access_token}` } })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '身份验证失败')
        this.profile = data.user; this.denied = !data.user.is_admin
      } catch (error) { this.errorMessage = error.message; this.denied = true }
      finally { this.loading = false }
    },
    async logout() { await supabase.auth.signOut(); this.email = ''; this.password = '' }
  }
}
</script>
