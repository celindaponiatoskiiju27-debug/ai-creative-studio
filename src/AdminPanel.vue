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
    <section class="referral-admin-card">
      <div class="admin-section-title"><div><h3>邀请奖励与预算</h3><p>控制双方奖励、每月总预算和单个邀请人的奖励人数</p></div><button @click="loadReferrals">刷新记录</button></div>
      <div class="referral-admin-stats"><div><span>邀请总数</span><b>{{ referralStats.total || 0 }}</b></div><div><span>已发奖励</span><b>{{ referralStats.rewarded || 0 }}</b></div><div><span>本月已用预算</span><b>{{ referralStats.monthSpent || 0 }} 点</b></div><div><span>本月剩余预算</span><b>{{ Math.max(0, (referralSettings.monthly_budget || 0) - (referralStats.monthSpent || 0)) }} 点</b></div></div>
      <div class="referral-settings-form"><label><input v-model="referralSettings.active" type="checkbox" /> 启用邀请活动</label><label>邀请人奖励<input v-model.number="referralSettings.inviter_reward" type="number" min="0" step="1" /></label><label>好友奖励<input v-model.number="referralSettings.invitee_reward" type="number" min="0" step="1" /></label><label>全站每月预算<input v-model.number="referralSettings.monthly_budget" type="number" min="0" step="1" /></label><label>每人每月奖励人数<input v-model.number="referralSettings.per_inviter_monthly_limit" type="number" min="0" step="1" /></label><button :disabled="referralSaving" @click="saveReferralSettings">{{ referralSaving ? '保存中…' : '保存邀请设置' }}</button></div>
      <div class="referral-records"><div v-for="item in referrals" :key="item.id"><span><b>{{ item.inviter_email }}</b> 邀请 {{ item.invitee_email }}</span><em>{{ item.status }}</em><strong>{{ item.status === 'rewarded' ? `-${item.inviter_reward + item.invitee_reward} 点预算` : '未发放' }}</strong><small>{{ formatDate(item.created_at) }}</small></div><p v-if="!referrals.length">暂无邀请记录</p></div>
    </section>
    <section class="support-admin-card">
      <div class="admin-section-title"><div><h3>人工客服</h3><p>查看用户咨询并在站内回复</p></div><button @click="loadSupportConversations">刷新消息</button></div>
      <div class="support-admin-layout">
        <aside class="support-conversation-list">
          <button v-for="item in supportConversations" :key="item.id" :class="{ active: selectedSupportId === item.id }" @click="selectSupportConversation(item)"><span><b>{{ item.email }}</b><small>{{ formatDate(item.last_message_at) }}</small></span><em v-if="item.unread_admin">{{ item.unread_admin }}</em></button>
          <p v-if="!supportConversations.length">暂无客服会话</p>
        </aside>
        <div class="support-admin-thread">
          <template v-if="selectedSupportId">
            <div class="support-thread-head"><b>{{ selectedSupport && selectedSupport.email }}</b><button @click="toggleSupportStatus">{{ selectedSupport && selectedSupport.status === 'closed' ? '重新打开' : '结束会话' }}</button></div>
            <div ref="adminSupportMessages" class="support-thread-messages"><article v-for="message in supportMessages" :key="message.id" :class="message.sender_role"><b>{{ message.sender_role === 'admin' ? '客服' : '用户' }}</b><p>{{ message.content }}</p><small>{{ formatDate(message.created_at) }}</small></article></div>
            <div class="support-admin-composer"><textarea v-model="supportReply" maxlength="2000" placeholder="输入回复内容…" @keydown.ctrl.enter.prevent="sendSupportReply"></textarea><button :disabled="supportSending || !supportReply.trim()" @click="sendSupportReply">{{ supportSending ? '发送中…' : '回复' }}</button></div>
          </template>
          <div v-else class="admin-empty">请选择左侧用户会话</div>
        </div>
      </div>
    </section>
    <section class="package-settings-card">
      <div class="admin-section-title"><div><h3>充值套餐设置</h3><p>修改后用户充值页面立即生效，无需重新部署</p></div><div class="section-actions"><button @click="addPackage">＋ 新增套餐</button><button class="secondary" @click="loadPackages">刷新</button></div></div>
      <div class="package-editor-grid">
        <article v-for="item in packages" :key="item.id" :class="{ inactive: !item.active }">
          <label>套餐名称<input v-model.trim="item.name" maxlength="30" /></label>
          <div><label>售价（元）<input v-model.number="item.price" type="number" min="0.01" step="0.01" /></label><label>算力点数<input v-model.number="item.credits" type="number" min="1" step="1" /></label></div>
          <div class="package-options"><label><input v-model="item.active" type="checkbox" /> 启用</label><label><input v-model="item.recommended" type="checkbox" /> 推荐</label><label>排序<input v-model.number="item.sortOrder" type="number" step="1" /></label></div>
          <small v-if="item.firstPurchaseOnly">此套餐为每位用户限购一次的首充套餐</small>
          <div class="package-card-actions"><button :disabled="packageSavingId === item.id" @click="savePackage(item)">{{ packageSavingId === item.id ? '保存中…' : '保存套餐' }}</button><button class="delete-package" :disabled="packageSavingId === item.id" @click="deletePackage(item)">删除</button></div>
        </article>
      </div>
    </section>
    <section class="payment-settings-card">
      <div class="admin-section-title"><div><h3>微信收款码设置</h3><p>图片保存在云端，可随时上传新收款码替换</p></div></div>
      <div class="payment-settings-body">
        <div class="qr-preview"><img v-if="paymentSettings.qr_url" :src="paymentSettings.qr_url" alt="当前微信收款码" /><span v-else>暂未上传</span></div>
        <div class="payment-settings-form">
          <label>更换收款码<input ref="qrInput" type="file" accept="image/png,image/jpeg,image/webp" @change="selectQr" /></label>
          <small>{{ qrFile ? qrFile.name : '支持 PNG、JPG、WebP，最大 5MB' }}</small>
          <label>付款说明<textarea v-model="paymentInstructions" maxlength="500" placeholder="例如：付款时请备注注册邮箱"></textarea></label>
          <button :disabled="paymentSaving" @click="savePaymentSettings">{{ paymentSaving ? '保存中…' : '保存收款设置' }}</button>
        </div>
      </div>
    </section>
    <div class="admin-table-wrap recharge-admin">
      <div class="admin-section-title"><div><h3>充值订单</h3><p>确认收到款项后再批准，系统只会到账一次</p></div><button @click="loadOrders">刷新订单</button></div>
      <table class="admin-table">
        <thead><tr><th>订单号 / 用户</th><th>套餐</th><th>金额</th><th>付款备注</th><th>提交时间</th><th>状态 / 操作</th></tr></thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td><b>{{ order.order_no }}</b><small>{{ order.email }}</small></td><td>{{ order.credits }} 点</td><td>¥{{ (order.amount_fen / 100).toFixed(2) }}</td><td>{{ order.payment_reference || '未填写' }}</td><td>{{ formatDate(order.created_at) }}</td>
            <td><div v-if="order.status === 'pending'" class="order-actions"><button :disabled="busyId === order.id" @click="reviewOrder(order, true)">确认到账</button><button class="reject" :disabled="busyId === order.id" @click="reviewOrder(order, false)">拒绝</button></div><strong v-else>{{ orderStatus(order.status) }}</strong></td>
          </tr>
          <tr v-if="!orders.length"><td colspan="6" class="admin-empty">暂无充值订单</td></tr>
        </tbody>
      </table>
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
  data: () => ({ users: [], orders: [], packages: [], referrals: [], referralSettings: {}, referralStats: {}, referralSaving: false, supportConversations: [], selectedSupportId: '', supportMessages: [], supportReply: '', supportSending: false, packageSavingId: '', paymentSettings: {}, paymentInstructions: '', qrFile: null, paymentSaving: false, search: '', adjustments: {}, loading: false, busyId: '', errorMessage: '' }),
  computed: {
    totalImages() { return this.users.reduce((sum, user) => sum + user.images_generated, 0) },
    totalCredits() { return this.users.reduce((sum, user) => sum + user.credits_used, 0) },
    selectedSupport() { return this.supportConversations.find(item => item.id === this.selectedSupportId) }
  },
  mounted() { this.loadUsers(); this.loadOrders(); this.loadPackages(); this.loadPaymentSettings(); this.loadSupportConversations(); this.loadReferrals() },
  methods: {
    headers(extra = {}) { return { ...extra, Authorization: `Bearer ${this.session.access_token}` } },
    async loadReferrals() {
      try { const response = await fetch('/api/admin/referrals', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取邀请记录失败'); this.referrals = data.referrals || []; this.referralSettings = data.settings || {}; this.referralStats = data.stats || {}; }
      catch (error) { this.errorMessage = error.message }
    },
    async saveReferralSettings() {
      this.referralSaving = true; this.errorMessage = ''
      try { const response = await fetch('/api/admin/referral-settings', { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(this.referralSettings) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存邀请设置失败'); this.referralSettings = data.settings; await this.loadReferrals(); }
      catch (error) { this.errorMessage = error.message }
      finally { this.referralSaving = false }
    },
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
    async loadOrders() {
      try {
        const response = await fetch('/api/admin/recharge-orders', { headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取充值订单失败')
        this.orders = data.orders || []
      } catch (error) { this.errorMessage = error.message }
    },
    async loadSupportConversations() {
      try {
        const response = await fetch('/api/admin/support/conversations', { headers: this.headers() }); const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取客服会话失败')
        this.supportConversations = data.conversations || []
      } catch (error) { this.errorMessage = error.message }
    },
    async selectSupportConversation(item) {
      this.selectedSupportId = item.id; item.unread_admin = 0; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/support/conversations/${item.id}/messages`, { headers: this.headers() }); const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取客服消息失败')
        this.supportMessages = data.messages || []
        this.$nextTick(() => { const box = this.$refs.adminSupportMessages; if (box) box.scrollTop = box.scrollHeight })
      } catch (error) { this.errorMessage = error.message }
    },
    async sendSupportReply() {
      const content = this.supportReply.trim(); if (!content || !this.selectedSupportId || this.supportSending) return
      this.supportSending = true; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/support/conversations/${this.selectedSupportId}/messages`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ content }) }); const data = await response.json()
        if (!response.ok) throw new Error(data.error || '回复发送失败')
        this.supportMessages.push(data.message); this.supportReply = ''
        this.$nextTick(() => { const box = this.$refs.adminSupportMessages; if (box) box.scrollTop = box.scrollHeight })
      } catch (error) { this.errorMessage = error.message }
      finally { this.supportSending = false }
    },
    async toggleSupportStatus() {
      if (!this.selectedSupport) return
      const status = this.selectedSupport.status === 'closed' ? 'open' : 'closed'
      try {
        const response = await fetch(`/api/admin/support/conversations/${this.selectedSupportId}`, { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) }); const data = await response.json()
        if (!response.ok) throw new Error(data.error || '更新会话状态失败')
        this.selectedSupport.status = data.conversation.status
      } catch (error) { this.errorMessage = error.message }
    },
    async loadPaymentSettings() {
      try {
        const response = await fetch('/api/admin/payment-settings', { headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取收款设置失败')
        this.paymentSettings = data.settings || {}; this.paymentInstructions = data.settings?.instructions || ''
      } catch (error) { this.errorMessage = error.message }
    },
    async loadPackages() {
      try {
        const response = await fetch('/api/admin/credit-packages', { headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取充值套餐失败')
        this.packages = data.packages || []
      } catch (error) { this.errorMessage = error.message }
    },
    async savePackage(item) {
      if (!item.name.trim() || Number(item.price) <= 0 || !Number.isInteger(Number(item.credits)) || Number(item.credits) < 1) { this.errorMessage = '请填写有效的套餐名称、价格和算力点数'; return }
      this.packageSavingId = item.id; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/credit-packages/${item.id}`, { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(item) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '保存套餐失败')
        Object.assign(item, data.package)
        if (item.recommended) this.packages.forEach(other => { if (other.id !== item.id) other.recommended = false })
      } catch (error) { this.errorMessage = error.message }
      finally { this.packageSavingId = '' }
    },
    async addPackage() {
      this.packageSavingId = 'new'; this.errorMessage = ''
      try {
        const response = await fetch('/api/admin/credit-packages', { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name: '新套餐', price: 9.9, credits: 50 }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '新增套餐失败')
        this.packages.push(data.package)
      } catch (error) { this.errorMessage = error.message }
      finally { this.packageSavingId = '' }
    },
    async deletePackage(item) {
      if (!window.confirm(`确定删除套餐“${item.name}”吗？已有充值记录的套餐将改为下架并保留历史数据。`)) return
      this.packageSavingId = item.id; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/credit-packages/${item.id}`, { method: 'DELETE', headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '删除套餐失败')
        if (data.archived) { item.active = false; item.recommended = false }
        else this.packages = this.packages.filter(entry => entry.id !== item.id)
      } catch (error) { this.errorMessage = error.message }
      finally { this.packageSavingId = '' }
    },
    selectQr(event) {
      const file = event.target.files?.[0] || null
      if (file && file.size > 5 * 1024 * 1024) { this.errorMessage = '收款码图片不能超过 5MB'; event.target.value = ''; this.qrFile = null; return }
      this.qrFile = file; this.errorMessage = ''
    },
    async savePaymentSettings() {
      if (!this.qrFile && !this.paymentInstructions.trim()) { this.errorMessage = '请选择收款码图片或填写付款说明'; return }
      this.paymentSaving = true; this.errorMessage = ''
      try {
        const body = new FormData(); if (this.qrFile) body.append('qr', this.qrFile); body.append('instructions', this.paymentInstructions)
        const response = await fetch('/api/admin/payment-settings', { method: 'POST', headers: this.headers(), body })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '保存收款设置失败')
        this.paymentSettings = data.settings; this.paymentInstructions = data.settings.instructions || ''; this.qrFile = null
        if (this.$refs.qrInput) this.$refs.qrInput.value = ''
      } catch (error) { this.errorMessage = error.message }
      finally { this.paymentSaving = false }
    },
    async reviewOrder(order, approve) {
      if (approve && !window.confirm(`确认已经收到 ¥${(order.amount_fen / 100).toFixed(2)}，并为 ${order.email} 增加 ${order.credits} 点算力吗？`)) return
      this.busyId = order.id; this.errorMessage = ''
      try {
        const response = await fetch(`/api/admin/recharge-orders/${order.id}/review`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ approve }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '审核订单失败')
        order.status = data.status
        await this.loadUsers()
      } catch (error) { this.errorMessage = error.message }
      finally { this.busyId = '' }
    },
    orderStatus(status) { return ({ paid: '已到账', rejected: '已拒绝', cancelled: '已取消' })[status] || status },
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
