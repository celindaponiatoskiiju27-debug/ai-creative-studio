<template>
  <div class="auth-overlay" @click.self="$emit('close')">
    <section class="account-modal">
      <button class="auth-close" aria-label="关闭账户中心" @click="$emit('close')">×</button>
      <header><div class="account-avatar">{{ avatar }}</div><div><h2>账户中心</h2><p>{{ email }}</p></div></header>
      <div class="account-stats"><article><span>当前算力</span><b>{{ profile.credits || 0 }} 点</b></article><article><span>账号类型</span><b>{{ profile.is_admin ? '管理员' : '注册用户' }}</b></article><article><span>注册时间</span><b>{{ createdAt }}</b></article></div>
      <div class="account-actions"><button @click="$emit('works')"><span>作</span><div><b>我的作品</b><small>查看云端生成记录</small></div><i>›</i></button><button @click="$emit('recharge')"><span>充</span><div><b>获取算力</b><small>查看套餐和充值记录</small></div><i>›</i></button></div>
      <form class="password-form" @submit.prevent="changePassword"><h3>修改登录密码</h3><label>新密码<input v-model="password" type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位，建议包含字母和数字" required /></label><label>确认新密码<input v-model="confirmPassword" type="password" minlength="8" autocomplete="new-password" placeholder="再次输入新密码" required /></label><button :disabled="saving">{{ saving ? '修改中…' : '确认修改密码' }}</button><p v-if="message" :class="{ error: isError }">{{ message }}</p></form>
      <div class="account-footer"><small>用户编号：{{ userId }}</small><button @click="$emit('logout')">退出当前账号</button></div>
    </section>
  </div>
</template>

<script>
import { supabase } from './supabase'

export default {
  name: 'AccountModal',
  props: { profile: { type: Object, required: true }, session: { type: Object, required: true } },
  data: () => ({ password: '', confirmPassword: '', saving: false, message: '', isError: false }),
  computed: {
    email() { return this.profile.email || this.session.user?.email || '' },
    avatar() { return this.email.slice(0, 1).toUpperCase() || 'U' },
    userId() { return this.profile.id || this.session.user?.id || '' },
    createdAt() { return this.profile.created_at ? new Date(this.profile.created_at).toLocaleDateString('zh-CN') : '—' }
  },
  methods: {
    async changePassword() {
      this.message = ''; this.isError = false
      if (this.password.length < 8) { this.message = '新密码至少需要 8 位'; this.isError = true; return }
      if (this.password !== this.confirmPassword) { this.message = '两次输入的密码不一致'; this.isError = true; return }
      this.saving = true
      try { const { error } = await supabase.auth.updateUser({ password: this.password }); if (error) throw error; this.password = ''; this.confirmPassword = ''; this.message = '密码修改成功，请妥善保存新密码' }
      catch (error) { this.message = error.message || '密码修改失败，请稍后重试'; this.isError = true }
      finally { this.saving = false }
    }
  }
}
</script>
