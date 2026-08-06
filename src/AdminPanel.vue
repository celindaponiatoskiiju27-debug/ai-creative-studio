<template>
  <section class="admin-view">
    <div class="admin-heading">
      <div><h2>用户与算力管理</h2><p>查看用户余额、累计消耗和生成情况</p></div>
      <input v-model.trim="search" placeholder="搜索用户邮箱" @keyup.enter="loadUsers" />
      <button @click="loadUsers">搜索</button>
    </div>
    <p v-if="errorMessage" class="api-error">{{ errorMessage }}</p>
    <div class="admin-stats">
      <article><span>用户数量</span><b>{{ users.length }}</b></article>
      <article><span>累计生成图片</span><b>{{ totalImages }}</b></article>
      <article><span>累计消耗算力</span><b>{{ totalCredits }}</b></article>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>用户</th><th>剩余算力</th><th>累计消耗</th><th>图片数</th><th>最近使用</th><th>调整算力</th></tr></thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td><b>{{ user.email || '未设置邮箱' }}</b><small>{{ user.is_admin ? '管理员' : '普通用户' }}</small></td>
            <td><strong>{{ user.credits }}</strong></td>
            <td>{{ user.credits_used }}</td>
            <td>{{ user.images_generated }}</td>
            <td>{{ formatDate(user.last_used_at) }}</td>
            <td>
              <div class="credit-adjust"><input v-model.number="adjustments[user.id]" type="number" placeholder="如 10 或 -5" /><button :disabled="busyId === user.id" @click="adjust(user)">确认</button></div>
            </td>
          </tr>
          <tr v-if="!loading && !users.length"><td colspan="6" class="admin-empty">暂无用户</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script>
export default {
  name: 'AdminPanel',
  props: { session: { type: Object, required: true } },
  data: () => ({ users: [], search: '', adjustments: {}, loading: false, busyId: '', errorMessage: '' }),
  computed: {
    totalImages() { return this.users.reduce((sum, user) => sum + user.images_generated, 0) },
    totalCredits() { return this.users.reduce((sum, user) => sum + user.credits_used, 0) }
  },
  mounted() { this.loadUsers() },
  methods: {
    headers(extra = {}) { return { ...extra, Authorization: `Bearer ${this.session.access_token}` } },
    async loadUsers() {
      this.loading = true; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/users?search=${encodeURIComponent(this.search)}`, { headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取用户失败')
        this.users = data.users
      } catch (error) { this.errorMessage = error.message }
      finally { this.loading = false }
    },
    async adjust(user) {
      const amount = Number(this.adjustments[user.id])
      if (!Number.isInteger(amount) || amount === 0) { this.errorMessage = '请输入非零整数，例如 10 或 -5'; return }
      this.busyId = user.id; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/users/${user.id}/credits`, {
          method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ amount, reason: '管理员后台调整' })
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '调整失败')
        user.credits = data.credits; this.adjustments[user.id] = null
      } catch (error) { this.errorMessage = error.message }
      finally { this.busyId = '' }
    },
    formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN') : '尚未使用' }
  }
}
</script>

