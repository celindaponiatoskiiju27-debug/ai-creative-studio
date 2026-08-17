<template>
  <div class="auth-overlay" @click.self="$emit('close')">
    <form class="auth-card" @submit.prevent="submit">
      <button type="button" class="auth-close" aria-label="关闭登录窗口" @click="$emit('close')">×</button>
      <div class="auth-logo">✦</div>
      <h2>{{ recoveryMode ? '设置新密码' : (forgotMode ? '找回密码' : (registerMode ? '创建账号' : '欢迎回来')) }}</h2>
      <p>{{ recoveryMode ? '请输入新的登录密码' : (forgotMode ? '我们会向你的邮箱发送密码重置链接' : (registerMode ? '邮箱首次注册可获得 10 点免费算力' : '登录后继续你的 AI 创作')) }}</p>
      <label v-if="!recoveryMode">邮箱</label>
      <input v-if="!recoveryMode" v-model.trim="email" type="email" autocomplete="email" placeholder="name@example.com" required />
      <template v-if="!forgotMode"><label>{{ recoveryMode ? '新密码' : '密码' }}</label><input v-model="password" type="password" :autocomplete="registerMode || recoveryMode ? 'new-password' : 'current-password'" minlength="6" placeholder="至少 6 位密码" required /></template>
      <template v-if="registerMode && !recoveryMode"><label>邀请码 <small>选填</small></label><input v-model.trim="inviteCode" maxlength="16" placeholder="有邀请码可填写" /></template>
      <button class="auth-submit" :disabled="loading">{{ loading ? '请稍候…' : (recoveryMode ? '确认修改密码' : (forgotMode ? '发送重置邮件' : (registerMode ? '注册' : '登录'))) }}</button>
      <p v-if="message" class="auth-message" :class="{ error: isError }">{{ message }}</p>
      <button v-if="!recoveryMode && !forgotMode" type="button" class="auth-forgot" @click="forgotMode = true; message = ''">忘记密码？</button>
      <button v-if="forgotMode" type="button" class="auth-switch" @click="forgotMode = false; message = ''">返回登录</button>
      <button v-else-if="!recoveryMode" type="button" class="auth-switch" @click="switchMode">
        {{ registerMode ? '已有账号？去登录' : '还没有账号？免费注册' }}
      </button>
    </form>
  </div>
</template>

<script>
import { supabase, supabaseConfigured } from './supabase'

export default {
  name: 'AuthModal',
  props: { recoveryMode: { type: Boolean, default: false } },
  data: () => ({ email: '', password: '', inviteCode: new URLSearchParams(window.location.search).get('ref') || localStorage.getItem('lingjing-invite-code') || '', registerMode: Boolean(new URLSearchParams(window.location.search).get('ref')), forgotMode: false, loading: false, message: '', isError: false }),
  methods: {
    switchMode() { this.registerMode = !this.registerMode; this.message = '' },
    async submit() {
      if (!supabaseConfigured) {
        this.message = '登录服务尚未配置'; this.isError = true; return
      }
      this.loading = true; this.message = ''; this.isError = false
      try {
        if (this.recoveryMode) {
          const { error } = await supabase.auth.updateUser({ password: this.password })
          if (error) throw error
          this.message = '密码修改成功'; this.$emit('recovered')
        } else if (this.forgotMode) {
          const { error } = await supabase.auth.resetPasswordForEmail(this.email, { redirectTo: `${window.location.origin}/` })
          if (error) throw error
          this.message = '重置链接已发送，请检查邮箱（包括垃圾邮件）'
        } else if (this.registerMode) {
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
