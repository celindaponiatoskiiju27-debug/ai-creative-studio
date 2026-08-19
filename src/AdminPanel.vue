<template>
  <section class="admin-view">
    <div v-if="orderAlert" class="order-alert"><div><strong>🔔 {{ orderAlert }}</strong><span>请核对付款单号与截图后再确认到账</span></div><button @click="scrollToOrders">立即查看</button><button class="close" @click="orderAlert = ''">×</button></div>
    <aside class="admin-side-nav">
      <div class="admin-side-title"><b>管理后台</b><span>ADMIN CONSOLE</span></div>
      <button v-for="item in adminNavItems" :key="item.id" :class="{ active: adminActiveSection === item.id }" @click="switchAdminSection(item.id)"><span>{{ item.icon }}</span><em>{{ item.name }}</em><i v-if="item.id === 'billing' && pendingOrderCount">{{ pendingOrderCount }}</i></button>
    </aside>
    <main class="admin-page-content">
    <div v-show="adminActiveSection === 'users'" class="admin-heading">
      <div><h2>用户与算力管理</h2><p>查看用户余额、累计消耗和生成情况</p></div>
      <input v-model.trim="search" placeholder="搜索用户邮箱" @keyup.enter="loadUsers" />
      <button @click="loadUsers">搜索</button><button v-if="notificationPermission !== 'granted'" class="notification-enable" @click="enableNotifications">开启订单桌面提醒</button>
    </div>
    <p v-if="errorMessage" class="api-error">{{ errorMessage }}</p>
    <section v-show="adminActiveSection === 'announcement'" v-if="announcementData" class="announcement-admin-card">
      <div class="admin-section-title"><div><h3>全站公告与维护通知</h3><p>发布后所有用户都会在页面顶部看到，可设置生效时间和自动结束时间</p></div><button :disabled="announcementSaving" @click="saveAnnouncement">{{ announcementSaving ? '保存中…' : '保存并发布' }}</button></div>
      <div class="announcement-form"><label class="announcement-toggle"><input v-model="announcementData.active" type="checkbox" /> 启用全站公告</label><label>通知类型<select v-model="announcementData.level"><option value="info">普通通知</option><option value="warning">重要提醒</option><option value="critical">故障 / 紧急</option><option value="success">活动 / 恢复</option></select></label><label class="announcement-title">标题<input v-model="announcementData.title" maxlength="80" placeholder="例如：视频生成服务维护通知" /></label><label class="announcement-content">通知内容<textarea v-model="announcementData.content" maxlength="500" placeholder="说明影响范围、预计恢复时间或用户需要采取的操作"></textarea></label><label>开始时间（可选）<input v-model="announcementData.starts_at" type="datetime-local" /></label><label>结束时间（可选）<input v-model="announcementData.ends_at" type="datetime-local" /></label></div>
    </section>
    <section v-show="adminActiveSection === 'overview'" class="system-health-card" :class="systemHealth.status">
      <div class="health-main"><span class="health-dot"></span><div><h3>{{ healthStatusName }}</h3><p>最近检查：{{ formatDate(systemHealth.checkedAt) }} · 服务运行 {{ uptimeText }}</p></div><button @click="loadSystemHealth(false)">立即检查</button></div>
      <div class="health-metrics"><div><span>近 1 小时失败</span><b>{{ systemHealth.metrics.failedHour || 0 }}</b></div><div><span>生成中任务</span><b>{{ systemHealth.metrics.pending || 0 }}</b></div><div><span>超时任务</span><b>{{ systemHealth.metrics.stale || 0 }}</b></div><div><span>今日预算</span><b>{{ systemHealth.metrics.dayPercent || 0 }}%</b></div><div><span>本月预算</span><b>{{ systemHealth.metrics.monthPercent || 0 }}%</b></div></div>
      <div v-if="systemHealth.alerts.length" class="health-alert-list"><p v-for="item in systemHealth.alerts" :key="item.code" :class="item.level"><b>{{ item.level === 'critical' ? '严重' : '提醒' }}</b>{{ item.message }}</p></div>
      <div class="health-actions"><span>Supabase {{ providerStatus('supabase') }} · 图片 {{ providerStatus('image') }} · 文案 {{ providerStatus('text') }} · 视频 {{ providerStatus('video') }}</span><button v-if="systemHealth.metrics.stale" :disabled="healthCleaning" @click="cleanupStaleTasks">{{ healthCleaning ? '清理中…' : '清理超时任务并退款' }}</button></div>
    </section>
    <div v-show="adminActiveSection === 'overview'" class="admin-stats">
      <article><span>用户数量</span><b>{{ users.length }}</b></article>
      <article><span>累计生成图片</span><b>{{ totalImages }}</b></article>
      <article><span>累计消耗算力</span><b>{{ totalCredits }}</b></article>
    </div>
    <section v-show="adminActiveSection === 'overview'" class="feedback-admin-card">
      <div class="admin-section-title"><div><h3>生成质量反馈</h3><p>查看用户对文案、图片、GIF 和视频结果的真实评价</p></div><button @click="loadGenerationFeedback">刷新评价</button></div>
      <div class="feedback-admin-stats"><div><span>评价总数</span><b>{{ feedbackReport().stats.total || 0 }}</b></div><div><span>满意率</span><b>{{ feedbackReport().stats.satisfactionRate || 0 }}%</b></div><div><span>有帮助</span><b class="positive">{{ feedbackReport().stats.helpful || 0 }}</b></div><div><span>不满意</span><b class="negative">{{ feedbackReport().stats.unhelpful || 0 }}</b></div></div>
      <div class="feedback-admin-list"><article v-for="item in feedbackReport().feedback.filter(row => !row.helpful).slice(0,20)" :key="item.id"><div><b>{{ item.email || '未知用户' }}</b><span>{{ analyticsActionName(item.action) }} · {{ formatDate(item.created_at) }}</span></div><p>{{ item.reason || '用户未填写原因' }}</p><small>{{ item.prompt || '无提示词记录' }}</small></article><p v-if="!feedbackReport().feedback.some(row => !row.helpful)" class="feedback-empty">暂无不满意反馈</p></div>
    </section>
    <section v-show="adminActiveSection === 'community'" class="community-admin-card">
      <div class="admin-section-title"><div><h3>灵感广场审核</h3><p>只有审核通过的站内生成作品才会公开展示；被举报内容可直接下架</p></div><button @click="loadCommunityAdmin">刷新作品</button></div>
      <div class="community-admin-stats"><div><span>待审核</span><b>{{ communityAdminPosts.filter(item => item.status === 'pending').length }}</b></div><div><span>已公开</span><b>{{ communityAdminPosts.filter(item => item.status === 'approved').length }}</b></div><div><span>待处理举报</span><b>{{ communityAdminReports.length }}</b></div></div>
      <div class="community-admin-grid"><article v-for="post in communityAdminPosts" :key="post.id" :class="post.status"><div class="community-admin-media"><video v-if="post.media_type === 'video'" :src="post.asset_url" controls /><img v-else :src="post.asset_url" :alt="post.title" /></div><div class="community-admin-info"><h4>{{ post.title }}</h4><p>{{ post.email }} · {{ post.category }} · {{ post.status }}</p><blockquote>{{ post.prompt || '无提示词' }}</blockquote><small v-if="communityReportCount(post.id)">{{ communityReportCount(post.id) }} 条待处理举报</small><div><button v-if="post.status !== 'approved'" @click="reviewCommunityPost(post,'approved')">通过</button><button v-if="post.status === 'pending'" class="reject" @click="reviewCommunityPost(post,'rejected')">拒绝</button><button v-if="post.status === 'approved'" class="remove" @click="reviewCommunityPost(post,'removed')">下架</button></div></div></article><p v-if="!communityAdminPosts.length" class="admin-empty">暂无社区作品</p></div>
    </section>
    <section v-show="adminActiveSection === 'models'" class="model-admin-card">
      <div class="admin-section-title"><div><h3>模型管理</h3><p>管理用户端下拉框、调用顺序和停用状态；密钥仍在 Render 环境变量中管理</p></div><div class="section-actions"><button @click="addModel">＋ 新增模型</button><button class="secondary" @click="loadModels">刷新</button></div></div>
      <div class="model-admin-notice">排序数字越小，越优先作为故障切换的备用模型。缺少对应供应商密钥时，即使启用也会在用户端自动置灰。</div>
      <div class="model-admin-grid">
        <article v-for="item in modelConfigs" :key="item.databaseId" :class="{ inactive: !item.enabled }">
          <div class="model-admin-top"><label>功能<select v-model="item.type"><option value="image">图片生成</option><option value="text">文案 / 润色</option><option value="video">GIF / 视频</option></select></label><label>供应商<select v-model="item.provider"><option value="openai">OpenAI 兼容</option><option v-if="item.type === 'text' || item.type === 'video'" value="aliyun">阿里云百炼</option><option v-if="item.type === 'video'" value="fal">fal.ai</option></select></label></div>
          <label>显示名称<input v-model.trim="item.name" maxlength="80" /></label><label>模型 ID<input v-model.trim="item.id" maxlength="200" /></label>
          <label v-if="item.type === 'video'">文生视频模型 ID（可选）<input v-model.trim="item.textModel" maxlength="200" /></label><label>说明<input v-model.trim="item.description" maxlength="300" /></label>
          <div class="model-admin-options"><label><input v-model="item.enabled" type="checkbox" /> 启用</label><label>消耗算力<input v-model.number="item.creditCost" type="number" min="0" max="10000" /></label><label>排序<input v-model.number="item.sortOrder" type="number" min="0" max="10000" /></label><span :class="item.available ? 'ready' : 'unavailable'">{{ item.available ? '当前可用' : '当前不可用' }}</span></div>
          <div class="model-admin-actions"><button :disabled="modelSavingId === item.databaseId" @click="saveModel(item)">{{ modelSavingId === item.databaseId ? '保存中…' : '保存' }}</button><button class="delete-package" :disabled="modelSavingId === item.databaseId" @click="deleteModel(item)">删除</button></div>
        </article><p v-if="!modelConfigs.length" class="admin-empty">暂无模型，请点击“新增模型”</p>
      </div>
    </section>
    <section v-show="adminActiveSection === 'overview'" class="business-dashboard">
      <div class="admin-section-title"><div><h3>经营数据分析</h3><p>到账收入减已批准退款为净收入；预估毛利尚未包含服务器、支付手续费、税费和人工成本</p></div><div class="analytics-period"><button v-for="days in [7,30,90]" :key="days" :class="{ active: analyticsDays === days }" @click="changeAnalyticsDays(days)">{{ days }}天</button><button @click="loadAnalytics">刷新</button></div></div>
      <div v-if="analyticsLoading" class="analytics-loading">正在统计经营数据…</div>
      <template v-else>
        <div class="analytics-kpis"><article><span>净收入</span><b>¥{{ money(analytics.metrics.netRevenueFen) }}</b><small>到账 ¥{{ money(analytics.metrics.revenueFen) }} · 退款 ¥{{ money(analytics.metrics.refundFen) }}</small></article><article><span>预估 AI 成本</span><b>¥{{ money(analytics.metrics.estimatedCostFen) }}</b><small>仅统计已完成生成</small></article><article class="profit"><span>预估毛利</span><b>¥{{ money(analytics.metrics.estimatedGrossProfitFen) }}</b><small>毛利率 {{ analyticsMargin }}%</small></article><article><span>新增用户</span><b>{{ analytics.metrics.newUsers || 0 }}</b><small>累计用户 {{ analytics.metrics.totalUsers || 0 }}</small></article><article><span>付费用户</span><b>{{ analytics.metrics.payingUsers || 0 }}</b><small>新用户付费转化 {{ percent(analytics.metrics.newUserConversionRate) }}</small></article><article><span>复购率</span><b>{{ percent(analytics.metrics.repeatPurchaseRate) }}</b><small>{{ analytics.metrics.paidOrders || 0 }} 笔到账订单</small></article><article><span>成功生成</span><b>{{ analytics.metrics.completedGenerations || 0 }}</b><small>成功率 {{ percent(analytics.metrics.successRate) }}</small></article></div>
        <div class="analytics-panels"><article class="trend-panel"><h4>每日收入、成本与生成趋势</h4><div class="trend-chart"><div v-for="row in analytics.trend" :key="row.date" class="trend-column" :title="`${row.date}：净收入 ¥${money(row.revenueFen-row.refundFen)}，成本 ¥${money(row.costFen)}，生成 ${row.generations}`"><div class="bars"><i class="revenue" :style="{ height: trendHeight(row.revenueFen - row.refundFen, 'money') + '%' }"></i><i class="cost" :style="{ height: trendHeight(row.costFen, 'money') + '%' }"></i><i class="generation" :style="{ height: trendHeight(row.generations, 'generation') + '%' }"></i></div><small>{{ row.date.slice(5) }}</small></div></div><div class="trend-legend"><span class="revenue">净收入</span><span class="cost">预估成本</span><span class="generation">生成次数</span></div></article><article class="feature-panel"><h4>功能使用与成本</h4><table><thead><tr><th>功能</th><th>成功</th><th>失败</th><th>消耗算力</th><th>预估成本</th></tr></thead><tbody><tr v-for="item in analytics.byAction" :key="item.action"><td>{{ analyticsActionName(item.action) }}</td><td>{{ item.completed }}</td><td>{{ item.failed }}</td><td>{{ item.credits }}</td><td>¥{{ money(item.estimatedCostFen) }}</td></tr><tr v-if="!analytics.byAction.length"><td colspan="5">所选周期暂无生成数据</td></tr></tbody></table></article></div>
        <p class="analytics-freshness">数据更新时间：{{ formatDate(analytics.freshness) }}。预估成本取后台配置值，不等同于供应商最终账单。</p>
      </template>
    </section>
    <section v-show="adminActiveSection === 'cost'" class="cost-control-card" :class="{ danger: costBudgetDanger }">
      <div class="admin-section-title"><div><h3>API 成本监控与预算熔断</h3><p>金额为预估成本；达到每日或每月上限后，系统会在调用第三方接口前自动停止生成</p></div><button @click="loadCostControl">刷新成本</button></div>
      <div class="cost-stats">
        <div><span>今日预估成本</span><b>¥{{ money(costStats.dayUsedFen) }}</b><small>上限 ¥{{ money(costSettings.daily_limit_fen) }}</small><i><em :style="{ width: budgetPercent(costStats.dayUsedFen, costSettings.daily_limit_fen) + '%' }"></em></i></div>
        <div><span>本月预估成本</span><b>¥{{ money(costStats.monthUsedFen) }}</b><small>上限 ¥{{ money(costSettings.monthly_limit_fen) }}</small><i><em :style="{ width: budgetPercent(costStats.monthUsedFen, costSettings.monthly_limit_fen) + '%' }"></em></i></div>
        <div><span>生成总开关</span><b :class="costSettings.active ? 'enabled' : 'disabled'">{{ costSettings.active ? '运行中' : '已熔断' }}</b><small>紧急情况下可手动关闭所有生成</small></div>
      </div>
      <div class="cost-settings-form">
        <label class="master-switch"><input v-model="costSettings.active" type="checkbox" /> 启用全站 AI 生成</label>
        <label>每日预算（元）<input v-model.number="costDailyYuan" type="number" min="0" step="1" /></label>
        <label>每月预算（元）<input v-model.number="costMonthlyYuan" type="number" min="0" step="1" /></label>
      </div>
      <div class="risk-settings-grid">
        <label>单用户每日次数<input v-model.number="costSettings.per_user_daily_request_limit" type="number" min="0" step="1" /><small>0 表示不限</small></label>
        <label>单用户每日成本（元）<input v-model.number="costUserDailyYuan" type="number" min="0" step="1" /><small>0 表示不限</small></label>
        <label>同时进行任务数<input v-model.number="costSettings.max_pending_per_user" type="number" min="1" max="100" step="1" /></label>
        <label>两次提交间隔（秒）<input v-model.number="costSettings.min_interval_seconds" type="number" min="0" step="1" /></label>
        <label>每小时失败上限<input v-model.number="costSettings.failure_hour_limit" type="number" min="0" step="1" /><small>0 表示不限</small></label>
      </div>
      <div class="action-cost-grid"><article v-for="item in costActions" :key="item.id" :class="{ disabled: isCostActionDisabled(item.id) }"><div><b>{{ item.name }}</b><label><input :checked="!isCostActionDisabled(item.id)" type="checkbox" @change="toggleCostAction(item.id, $event.target.checked)" /> 允许调用</label></div><label>单次预估成本（元）<input v-model.number="costActionYuan[item.id]" type="number" min="0" step="0.01" /></label><small>本月累计 ¥{{ money(costStats.byAction && costStats.byAction[item.id]) }}</small></article></div>
      <button class="cost-save" :disabled="costSaving" @click="saveCostControl">{{ costSaving ? '保存中…' : '保存成本与熔断设置' }}</button>
      <p class="cost-note">建议先按供应商账单保守填写，并每周校准一次。预算填写 0 表示该周期不设上限。</p>
    </section>
    <section v-show="adminActiveSection === 'system'" class="lifecycle-card">
      <div class="admin-section-title"><div><h3>数据备份与生命周期</h3><p>先导出业务备份，再清理过期云端作品；订单、算力流水和协议记录不会自动删除</p></div><button @click="loadLifecycle">刷新预览</button></div>
      <div class="lifecycle-stats"><div><span>待清理作品文件</span><b>{{ lifecyclePreview.assetFiles || 0 }}</b><small>{{ lifecyclePreview.assetRecords || 0 }} 条生成记录涉及文件</small></div><div><span>待清理客服会话</span><b>{{ lifecyclePreview.closedSupport || 0 }}</b><small>仅已关闭且超过保留期</small></div><div><span>上次清理</span><b class="date">{{ formatDate(lifecycleSettings.last_cleanup_at) }}</b><small>建议清理前下载备份</small></div></div>
      <div class="lifecycle-settings"><label>云端作品保留天数<input v-model.number="lifecycleSettings.generated_asset_days" type="number" min="7" max="3650" /></label><label>已关闭客服记录保留天数<input v-model.number="lifecycleSettings.closed_support_days" type="number" min="30" max="3650" /></label><button :disabled="lifecycleSaving" @click="saveLifecycle">{{ lifecycleSaving ? '保存中…' : '保存保留策略' }}</button></div>
      <div class="lifecycle-actions"><button class="export" :disabled="lifecycleExporting" @click="exportBusinessData">{{ lifecycleExporting ? '正在导出…' : '下载业务数据备份（JSON）' }}</button><button class="cleanup" :disabled="lifecycleCleaning || !(lifecyclePreview.assetFiles || lifecyclePreview.closedSupport)" @click="cleanupExpiredData">{{ lifecycleCleaning ? '正在清理…' : '清理预览中的过期数据' }}</button></div>
      <p class="lifecycle-note">业务备份包含敏感用户和订单信息，请保存到加密磁盘，不要上传到公开网盘或发送给无关人员。备份文件记录作品链接，不包含图片、GIF和视频的实际文件内容。</p>
    </section>
    <section v-show="adminActiveSection === 'risk'" class="content-safety-card">
      <div class="admin-section-title"><div><h3>内容审核与拦截记录</h3><p>在扣算力和调用第三方模型之前拦截明显高风险提示词；通用规则由系统维护</p></div><button @click="loadContentSafety">刷新记录</button></div>
      <div class="safety-settings"><label class="safety-switch"><input v-model="safetySettings.active" type="checkbox" /> 启用生成前内容审核</label><label>自定义禁用词（每行一个）<textarea v-model="safetyTermsText" maxlength="5000" placeholder="例如：需要额外禁止的品牌仿冒词或业务风险词"></textarea></label><button :disabled="safetySaving" @click="saveContentSafety">{{ safetySaving ? '保存中…' : '保存审核设置' }}</button></div>
      <div class="safety-table-wrap"><table><thead><tr><th>时间</th><th>用户</th><th>功能</th><th>风险类型</th><th>内容片段</th></tr></thead><tbody><tr v-for="item in moderationEvents" :key="item.id"><td>{{ formatDate(item.created_at) }}</td><td>{{ item.email }}</td><td>{{ analyticsActionName(item.source) }}</td><td><b>{{ item.category }}</b></td><td><p>{{ item.content_excerpt }}</p></td></tr><tr v-if="!moderationEvents.length"><td colspan="5">暂无内容拦截记录</td></tr></tbody></table></div>
      <p class="safety-note">当前审核重点覆盖明确的未成年人色情、伪造证件、诈骗盗取、露骨色情、极端暴力和危险违法活动。自动审核不能替代人工判断，上传图片本身暂未进行视觉识别。</p>
    </section>
    <section v-show="adminActiveSection === 'growth'" class="referral-admin-card">
      <div class="admin-section-title"><div><h3>邀请奖励与预算</h3><p>控制双方奖励、每月总预算和单个邀请人的奖励人数</p></div><button @click="loadReferrals">刷新记录</button></div>
      <div class="referral-admin-stats"><div><span>邀请总数</span><b>{{ referralStats.total || 0 }}</b></div><div><span>已发奖励</span><b>{{ referralStats.rewarded || 0 }}</b></div><div><span>本月已用预算</span><b>{{ referralStats.monthSpent || 0 }} 点</b></div><div><span>本月剩余预算</span><b>{{ Math.max(0, (referralSettings.monthly_budget || 0) - (referralStats.monthSpent || 0)) }} 点</b></div></div>
      <div class="referral-settings-form"><label><input v-model="referralSettings.active" type="checkbox" /> 启用邀请活动</label><label>邀请人奖励<input v-model.number="referralSettings.inviter_reward" type="number" min="0" step="1" /></label><label>新用户奖励<input v-model.number="referralSettings.invitee_reward" type="number" min="0" step="1" /></label><label>全站每月预算<input v-model.number="referralSettings.monthly_budget" type="number" min="0" step="1" /></label><label>每人每日奖励人数<input v-model.number="referralSettings.per_inviter_daily_limit" type="number" min="0" step="1" /></label><label>每人每月奖励人数<input v-model.number="referralSettings.per_inviter_monthly_limit" type="number" min="0" step="1" /></label><button :disabled="referralSaving" @click="saveReferralSettings">{{ referralSaving ? '保存中…' : '保存邀请设置' }}</button></div>
      <div class="referral-records"><div v-for="item in referrals" :key="item.id"><span><b>{{ item.inviter_email }}</b> 邀请 {{ item.invitee_email }}<small v-if="item.review_reason">{{ item.review_reason }}</small></span><em>{{ item.status }}</em><strong>{{ item.status === 'rewarded' ? `-${item.inviter_reward + item.invitee_reward} 点预算` : '未发放' }}</strong><small>{{ formatDate(item.created_at) }}</small></div><p v-if="!referrals.length">暂无邀请记录</p></div>
    </section>
    <section v-show="adminActiveSection === 'support'" class="support-admin-card">
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
    <section v-show="adminActiveSection === 'billing'" class="package-settings-card">
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
    <section v-show="adminActiveSection === 'billing'" class="payment-settings-card">
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
    <section v-show="adminActiveSection === 'system'" class="audit-card">
      <div class="admin-section-title"><div><h3>管理员操作审计</h3><p>记录充值、退款和人工调整算力等关键操作，日志不可由前端修改</p></div><button @click="loadAuditLogs">刷新日志</button></div>
      <div class="audit-table-wrap"><table><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>目标</th><th>详情</th><th>IP</th></tr></thead><tbody><tr v-for="item in auditLogs()" :key="item.id"><td>{{ formatDate(item.created_at) }}</td><td>{{ item.admin_email }}</td><td><b>{{ auditActionName(item.action) }}</b></td><td>{{ item.target_type }} · {{ item.target_id }}</td><td><code>{{ auditDetails(item.details) }}</code></td><td>{{ item.ip_address || '—' }}</td></tr><tr v-if="!auditLogs().length"><td colspan="6">暂无管理员操作记录</td></tr></tbody></table></div>
    </section>
    <div v-show="adminActiveSection === 'billing'" ref="orderSection" class="admin-table-wrap recharge-admin" :class="{ 'has-pending': pendingOrderCount }">
      <div class="admin-section-title"><div><h3>充值订单 <em v-if="pendingOrderCount" class="pending-order-badge">{{ pendingOrderCount }} 条待审核</em></h3><p>确认收到款项后再批准，系统只会到账一次</p></div><button @click="loadOrders(false)">刷新订单</button></div>
      <table class="admin-table">
        <thead><tr><th>订单号 / 用户</th><th>套餐</th><th>金额</th><th>付款备注</th><th>提交时间</th><th>状态 / 操作</th></tr></thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td><b>{{ order.order_no }}</b><small>{{ order.email }}</small></td><td>{{ order.credits }} 点</td><td>¥{{ (order.amount_fen / 100).toFixed(2) }}</td><td>{{ order.payment_reference || '未填写' }}<a v-if="order.payment_proof_url" :href="order.payment_proof_url" target="_blank">查看付款截图</a></td><td>{{ formatDate(order.created_at) }}</td>
            <td><div v-if="order.status === 'pending'" class="order-actions"><button :disabled="busyId === order.id" @click="reviewOrder(order, true)">确认到账</button><button class="reject" :disabled="busyId === order.id" @click="reviewOrder(order, false)">拒绝</button></div><strong v-else>{{ orderStatus(order.status) }}</strong></td>
          </tr>
          <tr v-if="!orders.length"><td colspan="6" class="admin-empty">暂无充值订单</td></tr>
        </tbody>
      </table>
    </div>
    <div v-show="adminActiveSection === 'billing'" class="admin-table-wrap refund-admin">
      <div class="admin-section-title"><div><h3>退款申请</h3><p>请先完成实际退款，再点击确认退款；系统随后扣回相应算力</p></div><button @click="loadRefunds">刷新退款</button></div>
      <table class="admin-table"><thead><tr><th>用户</th><th>退款金额</th><th>扣回算力</th><th>原因</th><th>申请时间</th><th>状态 / 操作</th></tr></thead><tbody>
        <tr v-for="item in refunds" :key="item.id"><td>{{ item.email }}</td><td>¥{{ (item.requested_amount_fen / 100).toFixed(2) }}</td><td>{{ item.requested_credits }} 点</td><td>{{ item.reason }}</td><td>{{ formatDate(item.created_at) }}</td><td><div v-if="item.status === 'pending'" class="order-actions"><button :disabled="busyId === item.id" @click="reviewRefund(item,true)">确认已退款</button><button class="reject" :disabled="busyId === item.id" @click="reviewRefund(item,false)">拒绝</button></div><strong v-else>{{ item.status === 'approved' ? '已退款' : '已拒绝' }}</strong></td></tr>
        <tr v-if="!refunds.length"><td colspan="6" class="admin-empty">暂无退款申请</td></tr>
      </tbody></table>
    </div>
    <div v-show="adminActiveSection === 'users'" class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>用户</th><th>剩余算力</th><th>累计消耗</th><th>图片数</th><th>最近使用</th><th>调整算力</th><th>生成风控</th></tr></thead>
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
            <td><div class="user-risk-action"><small v-if="isUserBlocked(user)">限制至 {{ formatDate(user.generation_blocked_until) }}<br />{{ user.generation_block_reason }}</small><button :class="{ unblock: isUserBlocked(user) }" :disabled="busyId === user.id" @click="toggleUserBlock(user)">{{ isUserBlocked(user) ? '解除限制' : '限制生成' }}</button></div></td>
          </tr>
          <tr v-if="!loading && !users.length"><td colspan="7" class="admin-empty">暂无用户</td></tr>
        </tbody>
      </table>
    </div>
    </main>
  </section>
</template>

<script>
export default {
  name: 'AdminPanel',
  props: { session: { type: Object, required: true } },
  data: () => ({ users: [], orders: [], refunds: [], packages: [], referrals: [], referralSettings: {}, referralStats: {}, referralSaving: false, analyticsDays: 30, analyticsLoading: false, analytics: { metrics: {}, byAction: [], trend: [], freshness: null }, costSettings: { active: true, daily_limit_fen: 0, monthly_limit_fen: 0, action_costs: {}, disabled_actions: [] }, costStats: { dayUsedFen: 0, monthUsedFen: 0, byAction: {} }, costDailyYuan: 0, costMonthlyYuan: 0, costUserDailyYuan: 0, costActionYuan: {}, costSaving: false, costActions: [{ id: 'copy_generation', name: '电商文案' }, { id: 'prompt_enhance', name: 'AI 润色' }, { id: 'image_generation', name: '图片生成' }, { id: 'image_edit', name: '图生图' }, { id: 'gif_generation', name: 'GIF 动图' }, { id: 'video_generation', name: '视频生成' }], systemHealth: { status: 'healthy', checkedAt: null, uptimeSeconds: 0, configured: {}, metrics: {}, alerts: [] }, healthCleaning: false, healthPollingTimer: null, lastHealthAlert: '', lifecycleSettings: { generated_asset_days: 90, closed_support_days: 365, last_cleanup_at: null }, lifecyclePreview: { assetRecords: 0, assetFiles: 0, closedSupport: 0 }, lifecycleSaving: false, lifecycleCleaning: false, lifecycleExporting: false, safetySettings: { active: true, custom_blocked_terms: [] }, safetyTermsText: '', safetySaving: false, moderationEvents: [], supportConversations: [], selectedSupportId: '', supportMessages: [], supportReply: '', supportSending: false, packageSavingId: '', paymentSettings: {}, paymentInstructions: '', qrFile: null, paymentSaving: false, search: '', adjustments: {}, loading: false, busyId: '', errorMessage: '', orderAlert: '', knownPendingOrderIds: [], orderPollingTimer: null, notificationPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission, originalTitle: document.title }),
  computed: {
    adminNavItems() { return [{ id: 'overview', icon: '⌂', name: '数据概览' }, { id: 'announcement', icon: '◉', name: '公告管理' }, { id: 'models', icon: '◇', name: '模型管理' }, { id: 'community', icon: '◎', name: '广场审核' }, { id: 'users', icon: '♙', name: '用户管理' }, { id: 'billing', icon: '¥', name: '充值与套餐' }, { id: 'growth', icon: '↗', name: '邀请增长' }, { id: 'support', icon: '☏', name: '人工客服' }, { id: 'cost', icon: '◫', name: '成本控制' }, { id: 'risk', icon: '!', name: '内容风控' }, { id: 'system', icon: '⚙', name: '系统与审计' }] },
    adminActiveSection() { return this.adjustments._adminTab || 'overview' },
    announcementData() { return this.adjustments._announcement || null },
    announcementSaving() { return Boolean(this.adjustments._announcementSaving) },
    communityAdminPosts() { return this.adjustments._communityPosts || [] },
    communityAdminReports() { return this.adjustments._communityReports || [] },
    modelConfigs() { return this.adjustments._modelConfigs || [] },
    modelSavingId() { return this.adjustments._modelSavingId || '' },
    totalImages() { return this.users.reduce((sum, user) => sum + user.images_generated, 0) },
    totalCredits() { return this.users.reduce((sum, user) => sum + user.credits_used, 0) },
    selectedSupport() { return this.supportConversations.find(item => item.id === this.selectedSupportId) },
    pendingOrderCount() { return this.orders.filter(item => item.status === 'pending').length },
    costBudgetDanger() { return this.budgetPercent(this.costStats.dayUsedFen, this.costSettings.daily_limit_fen) >= 80 || this.budgetPercent(this.costStats.monthUsedFen, this.costSettings.monthly_limit_fen) >= 80 },
    healthStatusName() { return ({ healthy: '系统运行正常', warning: '系统需要关注', critical: '系统存在严重异常' })[this.systemHealth.status] || '正在检查系统' },
    uptimeText() { const seconds = Number(this.systemHealth.uptimeSeconds || 0); const days = Math.floor(seconds / 86400); const hours = Math.floor(seconds % 86400 / 3600); return days ? `${days} 天 ${hours} 小时` : `${hours} 小时 ${Math.floor(seconds % 3600 / 60)} 分钟` },
    analyticsMargin() { const revenue = Number(this.analytics.metrics.netRevenueFen || 0); return revenue ? Math.round(Number(this.analytics.metrics.estimatedGrossProfitFen || 0) / revenue * 100) : 0 }
  },
  mounted() { this.loadModels(); this.loadUsers(); this.loadOrders(false); this.loadRefunds(); this.loadPackages(); this.loadPaymentSettings(); this.loadSupportConversations(); this.loadReferrals(); this.loadAuditLogs(); this.loadGenerationFeedback(); this.loadAnnouncement(); this.loadAnalytics(); this.loadCostControl(); this.loadLifecycle(); this.loadContentSafety(); this.loadSystemHealth(false); this.orderPollingTimer = setInterval(() => this.loadOrders(true), 15000); this.healthPollingTimer = setInterval(() => this.loadSystemHealth(true), 30000) },
  beforeDestroy() { if (this.orderPollingTimer) clearInterval(this.orderPollingTimer); if (this.healthPollingTimer) clearInterval(this.healthPollingTimer); document.title = this.originalTitle },
  methods: {
    switchAdminSection(section) { this.$set(this.adjustments, '_adminTab', section); if (section === 'community') this.loadCommunityAdmin(); if (section === 'models') this.loadModels(); window.scrollTo({ top: 0, behavior: 'smooth' }) },
    async loadModels() { try { const response = await fetch('/api/admin/models', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取模型失败'); const availability = new Map(Object.values(data.catalog || {}).flat().map(item => [`${item.type}:${item.provider}:${item.id}`, item.available])); this.$set(this.adjustments, '_modelConfigs', (data.models || []).map(item => ({ ...item, available: availability.get(`${item.type}:${item.provider}:${item.id}`) === true }))) } catch (error) { this.errorMessage = error.message } },
    async addModel() { const draft = { type: 'image', provider: 'openai', id: `new-model-${Date.now()}`, name: '新模型', description: '', textModel: '', enabled: false, sortOrder: 100 }; try { const response = await fetch('/api/admin/models', { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(draft) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '新增模型失败'); await this.loadModels() } catch (error) { this.errorMessage = error.message } },
    async saveModel(item) { this.$set(this.adjustments, '_modelSavingId', item.databaseId); try { const response = await fetch(`/api/admin/models/${item.databaseId}`, { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(item) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存模型失败'); await this.loadModels() } catch (error) { this.errorMessage = error.message } finally { this.$set(this.adjustments, '_modelSavingId', '') } },
    async deleteModel(item) { if (!window.confirm(`确认删除模型“${item.name}”吗？`)) return; this.$set(this.adjustments, '_modelSavingId', item.databaseId); try { const response = await fetch(`/api/admin/models/${item.databaseId}`, { method: 'DELETE', headers: this.headers() }); if (!response.ok && response.status !== 204) { const data = await response.json(); throw new Error(data.error || '删除模型失败') } await this.loadModels() } catch (error) { this.errorMessage = error.message } finally { this.$set(this.adjustments, '_modelSavingId', '') } },
    communityReportCount(postId) { return this.communityAdminReports.filter(item => item.post_id === postId).length },
    async loadCommunityAdmin() { try { const response=await fetch('/api/admin/community',{headers:this.headers()}); const data=await response.json(); if(!response.ok) throw new Error(data.error || '读取社区作品失败'); this.$set(this.adjustments,'_communityPosts',data.posts || []); this.$set(this.adjustments,'_communityReports',data.reports || []) } catch(error){ this.errorMessage=error.message } },
    async reviewCommunityPost(post,status) { const reason=status === 'approved' ? '' : (window.prompt(status === 'removed' ? '请输入下架原因：' : '请输入拒绝原因：') || '不符合公开展示要求'); if(!window.confirm(`确认${status === 'approved' ? '通过' : (status === 'removed' ? '下架' : '拒绝')}该作品吗？`)) return; try { const response=await fetch(`/api/admin/community/${post.id}`,{method:'PATCH',headers:this.headers({'Content-Type':'application/json'}),body:JSON.stringify({status,reason})}); const data=await response.json(); if(!response.ok) throw new Error(data.error || '审核失败'); Object.assign(post,data.post); await this.loadCommunityAdmin() } catch(error){ this.errorMessage=error.message } },
    headers(extra = {}) { return { ...extra, Authorization: `Bearer ${this.session.access_token}` } },
    announcementInput(value) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) },
    async loadAnnouncement() { try { const response = await fetch('/api/admin/site-announcement', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取全站公告失败'); data.announcement.starts_at = this.announcementInput(data.announcement.starts_at); data.announcement.ends_at = this.announcementInput(data.announcement.ends_at); this.$set(this.adjustments, '_announcement', data.announcement); this.$set(this.adjustments, '_announcementSaving', false) } catch (error) { this.errorMessage = error.message } },
    async saveAnnouncement() { this.$set(this.adjustments, '_announcementSaving', true); this.errorMessage = ''; try { const item = this.announcementData; const body = { ...item, starts_at: item.starts_at ? new Date(item.starts_at).toISOString() : null, ends_at: item.ends_at ? new Date(item.ends_at).toISOString() : null }; const response = await fetch('/api/admin/site-announcement', { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存全站公告失败'); await this.loadAnnouncement() } catch (error) { this.errorMessage = error.message } finally { this.$set(this.adjustments, '_announcementSaving', false) } },
    auditLogs() { return this._auditLogs || [] },
    feedbackReport() { return this._feedbackReport || { stats: {}, feedback: [] } },
    async loadGenerationFeedback() { try { const response = await fetch('/api/admin/generation-feedback', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取生成质量反馈失败'); this._feedbackReport = data; this.$forceUpdate() } catch (error) { this.errorMessage = error.message } },
    auditActionName(action) { return ({ adjust_credits: '调整算力', approve_recharge: '确认充值到账', reject_recharge: '拒绝充值', approve_refund: '确认退款', reject_refund: '拒绝退款' })[action] || action },
    auditDetails(details) { const value = JSON.stringify(details || {}); return value.length > 160 ? `${value.slice(0, 160)}…` : value },
    async loadAuditLogs() { try { const response = await fetch('/api/admin/audit-logs', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取管理员审计日志失败'); this._auditLogs = data.logs || []; this.$forceUpdate() } catch (error) { this.errorMessage = error.message } },
    percent(value) { return `${(Number(value || 0) * 100).toFixed(1)}%` },
    analyticsActionName(action) { return ({ copy_generation: '电商文案', prompt_enhance: 'AI 润色', image_generation: '图片生成', image_edit: '图生图', gif_generation: 'GIF 动图', video_generation: '视频生成' })[action] || action },
    trendHeight(value, type) { const values = (this.analytics.trend || []).map(row => type === 'generation' ? Number(row.generations || 0) : Math.max(0, type === 'money' ? Number(row.revenueFen || 0) - Number(row.refundFen || 0) : Number(row.costFen || 0))); const max = Math.max(1, ...values); return Math.max(Number(value) > 0 ? 4 : 0, Math.round(Math.max(0, Number(value || 0)) / max * 100)) },
    changeAnalyticsDays(days) { this.analyticsDays = days; this.loadAnalytics() },
    async loadAnalytics() {
      this.analyticsLoading = true
      try { const response = await fetch(`/api/admin/business-analytics?days=${this.analyticsDays}`, { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取经营数据失败'); this.analytics = data }
      catch (error) { this.errorMessage = error.message }
      finally { this.analyticsLoading = false }
    },
    providerStatus(name) { return this.systemHealth.configured?.[name] ? '✓' : '未配置' },
    async loadSystemHealth(notify = false) {
      try {
        const response = await fetch('/api/admin/system-health', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '系统检查失败'); this.systemHealth = data
        const fingerprint = (data.alerts || []).filter(item => item.level === 'critical').map(item => item.code).sort().join(',')
        if (notify && fingerprint && fingerprint !== this.lastHealthAlert && this.notificationPermission === 'granted') new Notification('灵境 AI：系统异常提醒', { body: data.alerts.filter(item => item.level === 'critical').map(item => item.message).join('；'), tag: 'lingjing-system-health', requireInteraction: true })
        this.lastHealthAlert = fingerprint
      } catch (error) { this.systemHealth = { ...this.systemHealth, status: 'critical', checkedAt: new Date().toISOString(), alerts: [{ level: 'critical', code: 'health_check', message: error.message }] } }
    },
    async cleanupStaleTasks() {
      if (!window.confirm(`确认将 ${this.systemHealth.metrics.stale} 个超过 20 分钟的任务标记为失败，并自动退回用户算力吗？`)) return
      this.healthCleaning = true; this.errorMessage = ''
      try { const response = await fetch('/api/admin/system-health/cleanup-stale', { method: 'POST', headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '清理超时任务失败'); await Promise.all([this.loadSystemHealth(false), this.loadUsers()]); window.alert(`已清理并退款 ${data.cleaned} 个超时任务`) }
      catch (error) { this.errorMessage = error.message }
      finally { this.healthCleaning = false }
    },
    async loadLifecycle() {
      try { const response = await fetch('/api/admin/data-lifecycle', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取数据保留策略失败'); this.lifecycleSettings = data.settings; this.lifecyclePreview = data.preview }
      catch (error) { this.errorMessage = error.message }
    },
    async saveLifecycle() {
      this.lifecycleSaving = true; this.errorMessage = ''
      try { const response = await fetch('/api/admin/data-lifecycle', { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(this.lifecycleSettings) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存数据保留策略失败'); this.lifecycleSettings = data.settings; await this.loadLifecycle() }
      catch (error) { this.errorMessage = error.message }
      finally { this.lifecycleSaving = false }
    },
    async exportBusinessData() {
      this.lifecycleExporting = true; this.errorMessage = ''
      try { const response = await fetch('/api/admin/data-export', { headers: this.headers() }); if (!response.ok) { const data = await response.json(); throw new Error(data.error || '导出备份失败') } const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `lingjing-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000) }
      catch (error) { this.errorMessage = error.message }
      finally { this.lifecycleExporting = false }
    },
    async cleanupExpiredData() {
      const message = `即将永久删除 ${this.lifecyclePreview.assetFiles || 0} 个过期作品文件和 ${this.lifecyclePreview.closedSupport || 0} 个已关闭客服会话。\n\n请先点击“下载业务数据备份”。此操作不能撤销，是否继续？`
      if (!window.confirm(message) || window.prompt('请输入“确认清理”继续：') !== '确认清理') return
      this.lifecycleCleaning = true; this.errorMessage = ''
      try { const response = await fetch('/api/admin/data-lifecycle/cleanup', { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ confirm: 'CLEANUP_EXPIRED_DATA' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '清理过期数据失败'); window.alert(`清理完成：${data.cleaned.assetFiles} 个作品文件，${data.cleaned.closedSupport} 个客服会话`); await this.loadLifecycle() }
      catch (error) { this.errorMessage = error.message }
      finally { this.lifecycleCleaning = false }
    },
    async loadContentSafety() {
      try {
        const response = await fetch('/api/admin/content-safety', { headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取内容审核设置失败')
        this.safetySettings = data.settings || { active: true, custom_blocked_terms: [] }
        this.safetyTermsText = (this.safetySettings.custom_blocked_terms || []).join('\n')
        this.moderationEvents = data.events || []
      } catch (error) { this.errorMessage = error.message }
    },
    async saveContentSafety() {
      this.safetySaving = true; this.errorMessage = ''
      try {
        const customBlockedTerms = this.safetyTermsText.split(/\r?\n|，|,/).map(item => item.trim()).filter(Boolean)
        const response = await fetch('/api/admin/content-safety', {
          method: 'PATCH',
          headers: this.headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ active: this.safetySettings.active, custom_blocked_terms: customBlockedTerms })
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '保存内容审核设置失败')
        this.safetySettings = data.settings
        this.safetyTermsText = (data.settings.custom_blocked_terms || []).join('\n')
        await this.loadContentSafety()
      } catch (error) { this.errorMessage = error.message }
      finally { this.safetySaving = false }
    },
    money(fen) { return (Number(fen || 0) / 100).toFixed(2) },
    budgetPercent(used, limit) { return Number(limit) > 0 ? Math.min(100, Math.round(Number(used || 0) / Number(limit) * 100)) : 0 },
    isCostActionDisabled(action) { return (this.costSettings.disabled_actions || []).includes(action) },
    toggleCostAction(action, enabled) { const current = new Set(this.costSettings.disabled_actions || []); enabled ? current.delete(action) : current.add(action); this.costSettings.disabled_actions = [...current] },
    async loadCostControl() {
      try { const response = await fetch('/api/admin/cost-control', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取成本设置失败'); this.costSettings = data.settings; this.costStats = data.stats; this.costDailyYuan = Number(data.settings.daily_limit_fen || 0) / 100; this.costMonthlyYuan = Number(data.settings.monthly_limit_fen || 0) / 100; this.costUserDailyYuan = Number(data.settings.per_user_daily_cost_limit_fen || 0) / 100; this.costActionYuan = Object.fromEntries(this.costActions.map(item => [item.id, Number(data.settings.action_costs?.[item.id] || 0) / 100])); }
      catch (error) { this.errorMessage = error.message }
    },
    async saveCostControl() {
      const values = [this.costDailyYuan, this.costMonthlyYuan, this.costUserDailyYuan, ...Object.values(this.costActionYuan)]; if (!values.every(value => Number.isFinite(Number(value)) && Number(value) >= 0)) { this.errorMessage = '预算和成本不能为负数'; return }
      this.costSaving = true; this.errorMessage = ''
      try { const body = { ...this.costSettings, daily_limit_fen: Math.round(Number(this.costDailyYuan) * 100), monthly_limit_fen: Math.round(Number(this.costMonthlyYuan) * 100), per_user_daily_cost_limit_fen: Math.round(Number(this.costUserDailyYuan) * 100), action_costs: Object.fromEntries(this.costActions.map(item => [item.id, Math.round(Number(this.costActionYuan[item.id] || 0) * 100)])) }; const response = await fetch('/api/admin/cost-control', { method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存成本设置失败'); this.costSettings = data.settings; await this.loadCostControl(); }
      catch (error) { this.errorMessage = error.message }
      finally { this.costSaving = false }
    },
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
    async loadOrders(notifyNew = false) {
      try {
        const response = await fetch('/api/admin/recharge-orders', { headers: this.headers() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '读取充值订单失败')
        const orders = data.orders || []; const pendingIds = orders.filter(item => item.status === 'pending').map(item => item.id); const newOrders = notifyNew ? orders.filter(item => item.status === 'pending' && !this.knownPendingOrderIds.includes(item.id)) : [];
        this.orders = orders; this.knownPendingOrderIds = pendingIds; document.title = pendingIds.length ? `(${pendingIds.length}条待审核) ${this.originalTitle}` : this.originalTitle;
        if (newOrders.length) this.notifyNewOrders(newOrders)
      } catch (error) { this.errorMessage = error.message }
    },
    notifyNewOrders(orders) {
      this.orderAlert = `收到 ${orders.length} 笔新充值订单！`;
      try { const AudioCtx = window.AudioContext || window.webkitAudioContext; const ctx = new AudioCtx(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.frequency.setValueAtTime(880, ctx.currentTime); oscillator.frequency.setValueAtTime(1175, ctx.currentTime + 0.18); gain.gain.setValueAtTime(0.18, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); oscillator.start(); oscillator.stop(ctx.currentTime + 0.5); }
      catch (_error) {}
      if (this.notificationPermission === 'granted') { const first = orders[0]; new Notification('灵境 AI：收到新充值订单', { body: `${first.email || '用户'} 提交 ¥${(first.amount_fen / 100).toFixed(2)} 充值${orders.length > 1 ? `，另有 ${orders.length - 1} 笔` : ''}`, tag: 'lingjing-recharge-order', requireInteraction: true }); }
    },
    async enableNotifications() { if (typeof Notification === 'undefined') return; this.notificationPermission = await Notification.requestPermission(); if (this.notificationPermission === 'granted') new Notification('订单提醒已开启', { body: '有新充值订单时会在桌面通知你。' }); },
    scrollToOrders() { this.switchAdminSection('billing'); this.$nextTick(() => this.$refs.orderSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })); this.orderAlert = ''; },
    async loadRefunds() {
      try { const response = await fetch('/api/admin/refunds', { headers: this.headers() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取退款申请失败'); this.refunds = data.refunds || [] }
      catch (error) { this.errorMessage = error.message }
    },
    async reviewRefund(item, approve) {
      const message = approve ? `请确认你已经实际向用户退款 ¥${(item.requested_amount_fen / 100).toFixed(2)}。确认后系统将扣回 ${item.requested_credits} 点算力。` : '请输入拒绝退款的原因：';
      const adminNote = approve ? (window.confirm(message) ? '管理员确认已完成实际退款' : null) : window.prompt(message); if (adminNote === null) return;
      this.busyId = item.id; this.errorMessage = '';
      try { const response = await fetch(`/api/admin/refunds/${item.id}/review`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ approve, adminNote }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '退款审核失败'); item.status = data.status; await this.loadUsers(); await this.loadOrders(); }
      catch (error) { this.errorMessage = error.message }
      finally { this.busyId = '' }
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
        await Promise.all([this.loadUsers(), this.loadOrders(false)])
      } catch (error) { this.errorMessage = error.message }
      finally { this.busyId = '' }
    },
    orderStatus(status) { return ({ paid: '已到账', rejected: '已拒绝', cancelled: '已取消' })[status] || status },
    isUserBlocked(user) { return Boolean(user.generation_blocked_until && new Date(user.generation_blocked_until) > new Date()) },
    async toggleUserBlock(user) {
      const blocked = this.isUserBlocked(user); let hours = 24; let reason = ''
      if (!blocked) { hours = Number(window.prompt('限制多少小时？', '24')); if (!Number.isFinite(hours) || hours <= 0) return; reason = window.prompt('请输入限制原因：', '异常频繁调用') || '异常频繁调用'; if (!window.confirm(`确认限制 ${user.email} 的生成功能 ${hours} 小时吗？`)) return }
      else if (!window.confirm(`确认解除 ${user.email} 的生成限制吗？`)) return
      this.busyId = user.id; this.errorMessage = ''
      try { const response = await fetch(`/api/admin/users/${user.id}/generation-block`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ block: !blocked, hours, reason }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '更新账号风控失败'); Object.assign(user, data.block) }
      catch (error) { this.errorMessage = error.message }
      finally { this.busyId = '' }
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
