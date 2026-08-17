<template>
  <div class="auth-overlay" @click.self="$emit('close')">
    <form class="auth-card" @submit.prevent="submit">
      <button type="button" class="auth-close" aria-label="关闭登录窗口" @click="$emit('close')">×</button>
      <div class="auth-logo">✦</div>
      <h2>{{ registerMode ? '创建账号' : '欢迎回来' }}</h2>
      <p>{{ registerMode ? '邮箱首次注册可获得 10 点免费算力' : '登录后继续你的 AI 创作' }}</p>
      <label>邮箱</label>
      <input v-model.trim="email" type="email" autocomplete="email" placeholder="name@example.com" required />
      <label>密码</label>
      <input v-model="password" type="password" :autocomplete="registerMode ? 'new-password' : 'current-password'" minlength="6" placeholder="至少 6 位密码" required />
      <template v-if="registerMode"><label>邀请码 <small>选填</small></label><input v-model.trim="inviteCode" maxlength="16" placeholder="有邀请码可填写" /></template>
      <button class="auth-submit" :disabled="loading">{{ loading ? '请稍候…' : (registerMode ? '注册' : '登录') }}</button>
      <p v-if="message" class="auth-message" :class="{ error: isError }">{{ message }}</p>
      <button type="button" class="auth-switch" @click="switchMode">
        {{ registerMode ? '已有账号？去登录' : '还没有账号？免费注册' }}
      </button>
    </form>
  </div>
</template>

<script>
import { supabase, supabaseConfigured } from './supabase'

export default {
  name: 'AuthModal',
  data: () => ({ email: '', password: '', inviteCode: new URLSearchParams(window.location.search).get('ref') || localStorage.getItem('lingjing-invite-code') || '', registerMode: Boolean(new URLSearchParams(window.location.search).get('ref')), loading: false, message: '', isError: false }),
  methods: {
    switchMode() { this.registerMode = !this.registerMode; this.message = '' },
    async submit() {
      if (!supabaseConfigured) {
        this.message = '登录服务尚未配置'; this.isError = true; return
      }
      this.loading = true; this.message = ''; this.isError = false
      try {
        if (this.registerMode) {
          const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.email, password: this.password, inviteCode: this.inviteCode })
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || '注册失败')
          const { error } = await supabase.auth.signInWithPassword({ email: this.email, password: this.password })
          if (error) throw error
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: this.email, password: this.password })
          if (error) throw error
        }
      } catch (error) {
        this.message = error.message || '操作失败，请稍后重试'; this.isError = true
      } finally { this.loading = false }
    }
  }
}
</script>
