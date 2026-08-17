<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <a class="brand" href="#" @click.prevent="go('image')"
        ><span class="brand-mark">✦</span><span>灵境 AI</span></a
      >
      <nav class="main-nav">
        <template v-for="item in nav">
          <p v-if="item.label" :key="item.label" class="nav-label">
            {{ item.label }}
          </p>
          <button
            v-else
            :key="item.id"
            class="nav-item"
            :class="{ active: page === item.id }"
            @click="go(item.id)"
          >
            <span>{{ item.icon }}</span
            >{{ item.name }}<em v-if="item.new">NEW</em>
          </button>
        </template>
      </nav>
      <div class="sidebar-bottom">
        <div class="credit-card">
          <div><span>账户算力</span><b>{{ credits }}</b></div>
          <div class="progress"><i :style="{ width: creditProgress }" /></div>
          <small>图片低至 2 点，动图 6 点</small>
        </div>
        <button class="profile" :title="profileEmail">
          <span class="avatar">{{ avatarText }}</span
          ><span><b>{{ displayName }}</b><small>{{ accountLabel }} · {{ profileEmail }}</small></span
          ><i @click.stop="logout">退出</i>
        </button>
      </div>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <button class="menu-btn" @click="menuOpen = true">☰</button>
        <div>
          <h1>{{ pages[page][0] }}</h1>
          <p>{{ pages[page][1] }}</p>
        </div>
        <div class="top-actions">
          <button v-if="session" class="credit-pill"><span>✦</span> {{ credits }} 点</button>
          <button v-if="session" class="ghost-btn" @click="logout">退出登录</button>
          <button class="ghost-btn" @click="openSupport">帮助中心</button
          ><button class="primary-small" @click="openRecharge">获取算力</button>
        </div>
      </header>
      <section v-if="page === 'copy'" class="copywriter-view">
        <div class="copy-form-card">
          <div class="copy-intro"><span>AI</span><div><b>电商文案生成器</b><small>填写商品信息，快速生成可直接使用的营销文案</small></div></div>
          <div class="field"><label>商品名称</label><input v-model="copyProduct" class="copy-input" maxlength="100" placeholder="例如：夏季冰丝防晒衣" /></div>
          <div class="field"><label>核心卖点</label><textarea v-model="copyFeatures" class="copy-textarea" maxlength="1000" placeholder="例如：UPF50+、冰凉透气、轻薄不闷汗、男女同款"></textarea></div>
          <div class="copy-grid">
            <div class="field"><label>投放平台</label><select v-model="copyPlatform" class="copy-input"><option>淘宝 / 天猫</option><option>拼多多</option><option>抖音 / 快手</option><option>小红书</option><option>微信公众号</option></select></div>
            <div class="field"><label>文案风格</label><select v-model="copyStyle" class="copy-input"><option>突出卖点</option><option>种草分享</option><option>促销转化</option><option>专业可信</option><option>轻松幽默</option></select></div>
          </div>
          <button class="generate-btn" :class="{ loading: copyLoading }" :disabled="copyLoading" :aria-busy="copyLoading ? 'true' : 'false'" @click="generateCopy">
            <span v-if="copyLoading" class="button-spinner" aria-hidden="true"></span><span v-else>✦</span>
            <b>{{ copyLoading ? '文案生成中，请稍候…' : '生成电商文案' }}</b><small v-if="!copyLoading">消耗 1 算力</small>
          </button>
          <p v-if="copyError" class="api-error">{{ copyError }}</p>
        </div>
        <div class="copy-result-card">
          <div class="copy-result-header"><div><h2>生成结果</h2><span>由 GPT-5.4 生成</span></div><div class="copy-header-actions"><button v-if="copyResult" class="history-btn" @click="copyCopyResult">{{ copyCopied ? '已复制' : '复制文案' }}</button><button class="history-btn" @click="openHistory(true)">◷ 文案历史</button></div></div>
          <div v-if="copyLoading" class="loading-state"><div class="loader"><i /><i /><i /></div><h3>正在分析商品卖点</h3><p>AI 正在为目标平台组织高转化文案…</p></div>
          <div v-else-if="!copyResult" class="copy-empty"><div class="placeholder-icon">文</div><h3>让好商品更会表达</h3><p>填写左侧商品资料，生成标题、卖点和营销正文</p></div>
          <pre v-else class="copy-output">{{ copyResult }}</pre>
        </div>
      </section>
      <section v-if="page === 'image' || page === 'video'" class="creator-view">
        <div class="control-panel">
          <div v-if="page === 'video'" class="mode-tabs video-mode-tabs">
            <button
              v-for="m in videoModes"
              :key="m.id"
              class="mode-tab"
              :class="{ active: videoMode === m.id }"
              @click="selectVideoMode(m.id)"
            >
              {{ m.name }}
            </button>
          </div>
          <div v-if="false" class="mode-tabs">
            <button
              v-for="m in modes"
              :key="m.id"
              class="mode-tab"
              :class="{ active: mode === m.id }"
              @click="mode = m.id"
            >
              {{ m.name }}
            </button>
          </div>
          <div class="field">
            <div class="field-label">
              <label>画面描述</label><button @click="enhance">✦ AI 润色</button>
            </div>
            <div class="prompt-box">
              <textarea
                v-model="prompt"
                maxlength="1000"
                placeholder="描述你想生成的画面，例如：傍晚的海边，一座极简玻璃屋，暖色灯光，电影感构图……"
              />
              <div class="prompt-tools">
                <button @click="randomize">⌁ 随机灵感</button
                ><span
                  ><i>{{ prompt.length }}</i
                  >/1000</span
                >
              </div>
            </div>
          </div>
          <div v-if="page === 'video' && videoMode === 'image'" class="field upload-field">
            <label>待生成动图的图片</label
            ><label class="upload-box"
              ><input type="file" accept="image/png,image/jpeg,image/webp" @change="upload" /><span
                >＋</span
              ><b>{{ uploadName || "上传一张静态图片" }}</b
              ><small>支持 JPG、PNG、WebP，最大 10MB</small></label
            >
          </div>
          <div v-if="page === 'image'" class="field">
            <label>选择模型</label
            ><button class="select-card" @click="modelOpen = !modelOpen">
              <span class="model-icon">✦</span
              ><span
                ><b>{{ model.name }}</b
                ><small>{{ model.desc }}</small></span
              ><i>⌄</i>
            </button>
            <div v-if="modelOpen" class="model-menu">
              <button v-for="m in models" :key="m.name" @click="selectModel(m)">
                <b>{{ m.name }}</b
                ><small>{{ m.desc }}</small>
              </button>
            </div>
          </div>
          <div v-if="page === 'image'" class="field reference-field">
            <div class="field-label">
              <label>参考图片 <small>可选，最多4张，可修改或合成</small></label>
              <button v-if="referenceImages.length" @click="clearReferenceImages">清空图片</button>
            </div>
            <label v-if="!referenceImages.length" class="reference-picker">
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="selectReferenceImages" />
              <span>＋</span><b>选择参考图片</b><small>可一次选择多张图片进行合成</small>
            </label>
            <div v-else class="reference-list">
              <div v-for="(item, index) in referenceImages" :key="item.url" class="reference-thumb">
                <img :src="item.url" :alt="`参考图片 ${index + 1}`" />
                <button type="button" title="删除这张图片" @click="removeReferenceImage(index)">×</button>
                <span>{{ index + 1 }}</span>
              </div>
              <label v-if="referenceImages.length < 4" class="reference-add">＋<small>继续添加</small><input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="selectReferenceImages" /></label>
            </div>
          </div>
          <div class="field">
            <label>画面比例</label>
            <div class="ratio-grid">
              <button
                v-for="r in ratios"
                :key="r.value"
                class="ratio"
                :class="{ active: ratio === r.value }"
                @click="ratio = r.value"
              >
                <i :class="r.icon" /><span>{{ r.value }}</span>
              </button>
            </div>
          </div>
          <div v-if="page === 'image'" class="settings-row">
            <span>生成数量</span>
            <div class="stepper">
              <button @click="count = Math.max(1, count - 1)">−</button
              ><b>{{ count }}</b
              ><button @click="count = Math.min(4, count + 1)">＋</button>
            </div>
          </div>
          <button class="generate-btn" :class="{ loading }" :disabled="loading" :aria-busy="loading ? 'true' : 'false'" @click="generate">
            <span v-if="loading" class="button-spinner" aria-hidden="true"></span>
            <span v-else>✦</span>
            <b>{{ loading ? "生成中，请稍候…" : (page === 'video' ? (videoMode === 'image' ? "生成动图" : "生成视频") : "立即生成") }}</b
            ><small v-if="!loading">消耗 {{ requiredCredits }} 算力</small>
          </button>
          <p v-if="errorMessage" class="api-error">{{ errorMessage }}</p>
          <p class="safe-note">
            生成内容须遵守平台规范，请勿上传侵权或敏感素材
          </p>
        </div>
        <div class="result-panel">
          <div class="result-header">
            <div>
              <h2>创作结果</h2>
              <span>{{ meta }}</span>
            </div>
            <button class="history-btn" @click="openHistory(false)">◷ 生成记录</button>
          </div>
          <div v-if="state === 'empty'" class="empty-state">
            <div class="magic-orb"><i /><span>✦</span></div>
            <h3>让灵感，在这里发生</h3>
            <p>输入画面描述并选择模型<br />AI 会为你生成独一无二的作品</p>
            <div class="idea-chips">
              <button
                v-for="(idea, i) in ideas"
                :key="idea"
                @click="prompt = idea"
              >
                {{ ideaNames[i] }}
              </button>
            </div>
          </div>
          <div v-else-if="state === 'loading'" class="loading-state">
            <div class="loader"><i /><i /><i /></div>
            <h3>正在构思你的作品</h3>
            <p>AI 正在理解描述并绘制画面…</p>
          </div>
          <div v-else class="result-grid">
            <article
              v-for="(image, i) in results"
              :key="i"
              class="result-card"
              :class="resultClass"
            >
              <video v-if="resultType === 'video'" :src="image" autoplay loop muted playsinline controls />
              <img v-else :src="image" :alt="`AI 生成作品 ${i + 1}`" />
              <div class="result-actions">
                <button @click="toggleFavorite(image)">{{ favorites.includes(image) ? "♥" : "♡" }}</button><button @click="download(image, i)">↓</button>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section v-else-if="page !== 'copy'" class="placeholder-view">
        <div class="placeholder-icon">✦</div>
        <h2>{{ pages[page][0] }}</h2>
        <p>完整功能即将上线，敬请期待。</p>
        <button class="primary-small" @click="go('image')">返回创作</button>
      </section>
    </main>
    <div v-if="rechargeOpen" class="recharge-overlay" @click.self="rechargeOpen = false">
      <section class="recharge-modal">
        <header><div><h2>充值算力</h2><p>选择适合你的套餐，充值算力长期有效</p></div><button @click="rechargeOpen = false">×</button></header>
        <div class="package-grid">
          <button v-for="item in packages" :key="item.id" :class="{ selected: selectedPackage === item.id }" @click="selectedPackage = item.id">
            <em v-if="item.recommended">推荐</em><b>{{ item.name }}</b><strong>¥{{ item.price }}</strong><span>{{ item.credits }} 点算力</span><small>约 ¥{{ (item.price / item.credits).toFixed(3) }}/点</small>
          </button>
        </div>
        <div class="payment-box">
          <a v-if="billing.paymentQrUrl" class="payment-qr-link" :href="billing.paymentQrUrl" target="_blank" title="点击查看大图"><img :src="billing.paymentQrUrl" alt="微信付款二维码" /><small>扫码支付 · 点击查看大图</small></a>
          <div><b>当前为人工审核充值</b><p>{{ billing.instructions || '提交订单后，请联系管理员完成付款审核。' }}</p><input v-model.trim="paymentReference" maxlength="200" placeholder="付款备注或转账单号（选填）" /></div>
        </div>
        <p v-if="rechargeMessage" :class="rechargeError ? 'api-error' : 'recharge-success'">{{ rechargeMessage }}</p>
        <button class="generate-btn" :class="{ loading: rechargeLoading }" :disabled="rechargeLoading || !selectedPackage" @click="createRechargeOrder">
          <span v-if="rechargeLoading" class="button-spinner"></span><span v-else>✦</span><b>{{ rechargeLoading ? '正在提交…' : '提交充值订单' }}</b>
        </button>
        <div v-if="rechargeOrders.length" class="order-list"><h3>最近订单</h3><div v-for="order in rechargeOrders" :key="order.id"><span>{{ order.order_no }}</span><b>¥{{ (order.amount_fen / 100).toFixed(2) }} / {{ order.credits }}点</b><em :class="order.status">{{ orderStatus(order.status) }}</em></div></div>
      </section>
    </div>
    <div v-if="historyOpen" class="recharge-overlay" @click.self="historyOpen = false">
      <section class="history-modal">
        <header><div><h2>{{ historyOnlyCopy ? '文案历史记录' : '生成记录' }}</h2><p>{{ historyOnlyCopy ? '查看和复制最近生成的电商文案' : '最近 50 条创作与算力消耗记录' }}</p></div><button @click="historyOpen = false">×</button></header>
        <div v-if="historyLoading" class="history-loading">正在读取记录…</div>
        <p v-else-if="historyError" class="api-error">{{ historyError }}</p>
        <div v-else-if="displayedHistoryRecords.length" class="history-list">
          <article v-for="record in displayedHistoryRecords" :key="record.id">
            <div class="history-icon">{{ historyIcon(record.action) }}</div>
            <div class="history-info"><div><b>{{ historyName(record.action) }}</b><em :class="record.status">{{ historyStatus(record.status) }}</em></div><p>{{ record.prompt || '未记录描述' }}</p><small>{{ formatHistoryDate(record.created_at) }} · {{ record.image_count }} 个结果</small></div>
            <strong>-{{ record.credits }} 点</strong>
            <div v-if="record.output_urls && record.output_urls.length" class="history-assets">
              <div v-for="(asset, index) in record.output_urls" :key="asset" class="history-asset">
                <video v-if="record.action === 'video_generation'" :src="asset" controls preload="metadata" />
                <img v-else :src="asset" :alt="`${historyName(record.action)}作品 ${index + 1}`" loading="lazy" />
                <button @click="downloadHistory(asset, record, index)">↓ 下载</button>
              </div>
            </div>
            <div v-else-if="record.output_text" class="history-copy-output"><pre>{{ record.output_text }}</pre><button @click="copyHistoryText(record)">{{ copiedHistoryId === record.id ? '已复制' : '复制文案' }}</button></div>
            <p v-else-if="record.status === 'completed'" class="history-no-asset">{{ record.action === 'copy_generation' ? '该文案生成于正文保存功能上线之前，暂无正文备份。' : '该记录生成于作品云端保存功能上线之前，暂无文件备份。' }}</p>
          </article>
        </div>
        <div v-else class="history-empty">暂时没有生成记录，完成第一次创作后会显示在这里。</div>
      </section>
    </div>
    <div v-if="supportOpen" class="recharge-overlay" @click.self="closeSupport">
      <section class="support-modal">
        <header><div><h2>人工客服</h2><p>请描述遇到的问题，客服会在后台回复</p></div><button @click="closeSupport">×</button></header>
        <div ref="supportMessages" class="support-messages">
          <div v-if="supportLoading" class="history-loading">正在读取消息…</div>
          <div v-else-if="!supportMessages.length" class="support-welcome"><b>你好，有什么可以帮你？</b><p>可以咨询充值、算力、生成失败或作品保存等问题。</p></div>
          <article v-for="message in supportMessages" :key="message.id" :class="message.sender_role"><div><b>{{ message.sender_role === 'admin' ? '人工客服' : '我' }}</b><p>{{ message.content }}</p><small>{{ formatHistoryDate(message.created_at) }}</small></div></article>
        </div>
        <p v-if="supportError" class="api-error">{{ supportError }}</p>
        <div class="support-composer"><textarea v-model="supportDraft" maxlength="2000" placeholder="请输入你的问题…" @keydown.ctrl.enter.prevent="sendSupportMessage"></textarea><button :disabled="supportSending || !supportDraft.trim()" @click="sendSupportMessage">{{ supportSending ? '发送中…' : '发送' }}</button></div>
      </section>
    </div>
    <AuthModal v-if="authReady && !session" />
    <div
      class="overlay"
      :class="{ show: menuOpen }"
      @click="menuOpen = false"
    />
  </div>
</template>
<script>
import AuthModal from './AuthModal.vue'
import { supabase, supabaseConfigured } from './supabase'

export default {
  name: "App",
  components: { AuthModal },
  data() {
    const models = [{ name: "GPT Image 2", desc: "OpenAI 新一代高质量图片模型" }];
    return {
      nav: [
        { label: "创作" },
        { id: "copy", name: "电商文案", icon: "文", new: true },
        { id: "image", name: "图片生成", icon: "▧" },
        { id: "video", name: "视频生成", icon: "▷", new: true },
        { id: "canvas", name: "AI 画布", icon: "⌘" },
        { label: "资产" },
        { id: "works", name: "我的作品", icon: "◫" },
        { id: "favorites", name: "我的收藏", icon: "♡" },
      ],
      pages: {
        copy: ["电商文案", "为电商商品生成高转化营销内容"],
        image: ["图片生成", "把你的想象变成画面"],
        video: ["视频生成", "选择让图片动起来，或直接用文字生成视频"],
        canvas: ["AI 画布", "无限空间，自由创作"],
        works: ["我的作品", "管理你的创作资产"],
        favorites: ["我的收藏", "灵感随时回看"],
      },
      modes: [
        { id: "text", name: "文生图" },
        { id: "image", name: "图生图" },
      ],
      videoModes: [
        { id: "image", name: "图片生成 GIF" },
        { id: "text", name: "文字生成视频" },
      ],
      videoMode: "image",
      models,
      model: models[0],
      ratios: [
        { value: "1:1", icon: "square" },
        { value: "4:3", icon: "landscape" },
        { value: "3:4", icon: "portrait" },
        { value: "16:9", icon: "wide" },
        { value: "9:16", icon: "tall" },
      ],
      ideas: [
        "雨后的未来都市街道，霓虹灯倒映在水面，电影感，广角镜头，超高细节",
        "极简主义香水产品摄影，冰川蓝色背景，柔和侧光，高端商业广告",
        "身穿白色机能风外套的少女站在云端，日系动画，清透色彩，细腻线条",
      ],
      ideaNames: ["梦幻城市", "产品摄影", "动漫角色"],
      page: "image",
      mode: "text",
      prompt: "",
      copyProduct: "",
      copyFeatures: "",
      copyPlatform: "淘宝 / 天猫",
      copyStyle: "突出卖点",
      copyResult: "",
      copyLoading: false,
      copyError: "",
      copyCopied: false,
      ratio: "1:1",
      count: 1,
      state: "empty",
      loading: false,
      modelOpen: false,
      menuOpen: false,
      uploadName: "",
      uploadFile: null,
      referenceImages: [],
      results: [],
      resultType: "image",
      favorites: JSON.parse(localStorage.getItem("ai-favorites") || "[]"),
      errorMessage: "",
      authReady: false,
      session: null,
      profile: null,
      authSubscription: null,
      rechargeOpen: false,
      rechargeLoading: false,
      rechargeMessage: "",
      rechargeError: false,
      selectedPackage: "popular",
      paymentReference: "",
      packages: [],
      rechargeOrders: [],
      billing: {},
      historyOpen: false,
      historyLoading: false,
      historyRecords: [],
      historyError: "",
      copiedHistoryId: "",
      historyOnlyCopy: false,
      supportOpen: false,
      supportLoading: false,
      supportSending: false,
      supportMessages: [],
      supportDraft: "",
      supportError: "",
      supportTimer: null,
    };
  },
  computed: {
    meta() {
      return this.state === "empty"
        ? "等待你的灵感"
        : this.state === "loading"
          ? "AI 正在生成"
          : `已生成 ${this.results.length} 张 · ${this.model.name}`;
    },
    credits() {
      return this.profile?.credits ?? 0;
    },
    profileEmail() {
      return this.profile?.email || this.session?.user?.email || '未登录';
    },
    displayName() {
      return this.profileEmail === '未登录' ? '访客' : this.profileEmail.split('@')[0];
    },
    avatarText() {
      return this.displayName.slice(0, 1).toUpperCase();
    },
    accountLabel() {
      return this.profile?.is_admin ? '管理员' : '注册用户';
    },
    creditProgress() {
      return `${Math.min(100, Math.max(0, this.credits * 10))}%`;
    },
    resultClass() {
      return {
        wide: ["16:9", "4:3"].includes(this.ratio),
        portrait: ["3:4", "9:16"].includes(this.ratio),
      };
    },
    videoCredits() {
      return this.videoMode === 'image' ? 6 : 25;
    },
    requiredCredits() {
      if (this.page === 'video') return this.videoCredits;
      return (this.referenceImages.length ? 3 : 2) * this.count;
    },
    displayedHistoryRecords() {
      return this.historyOnlyCopy ? this.historyRecords.filter(record => record.action === 'copy_generation') : this.historyRecords;
    },
  },
  async mounted() {
    if (!supabaseConfigured) { this.authReady = true; return }
    const { data } = await supabase.auth.getSession()
    this.session = data.session
    if (this.session) await this.loadProfile()
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      this.session = session
      this.profile = null
      if (session) await this.loadProfile()
    })
    this.authSubscription = listener.subscription
    this.authReady = true
  },
  beforeDestroy() {
    this.authSubscription?.unsubscribe()
    if (this.supportTimer) clearInterval(this.supportTimer)
    this.referenceImages.forEach(item => URL.revokeObjectURL(item.url))
  },
  methods: {
    async loadProfile() {
      try {
        const response = await fetch('/api/me', { headers: this.authHeaders() })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '无法读取用户信息')
        this.profile = data.user
      } catch (error) { this.errorMessage = error.message }
    },
    authHeaders(extra = {}) {
      return { ...extra, Authorization: `Bearer ${this.session?.access_token || ''}` }
    },
    async openRecharge() {
      if (!this.session) { this.errorMessage = '请先登录后再充值'; return; }
      this.rechargeOpen = true; this.rechargeMessage = ''; this.rechargeError = false;
      try {
        const [configResponse, ordersResponse] = await Promise.all([
          fetch('/api/billing/config'), fetch('/api/billing/orders', { headers: this.authHeaders() })
        ]);
        const config = await configResponse.json(); const orders = await ordersResponse.json();
        if (!configResponse.ok) throw new Error(config.error || '无法读取充值套餐');
        if (!ordersResponse.ok) throw new Error(orders.error || '无法读取充值订单');
        this.billing = config; this.packages = config.packages || []; this.rechargeOrders = orders.orders || [];
        if (!this.packages.some(item => item.id === this.selectedPackage)) this.selectedPackage = this.packages[0]?.id || '';
      } catch (error) { this.rechargeMessage = error.message; this.rechargeError = true; }
    },
    async createRechargeOrder() {
      if (this.rechargeLoading || !this.selectedPackage) return;
      this.rechargeLoading = true; this.rechargeMessage = ''; this.rechargeError = false;
      try {
        const response = await fetch('/api/billing/orders', {
          method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ packageId: this.selectedPackage, paymentReference: this.paymentReference })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '充值订单提交失败');
        this.rechargeOrders.unshift(data.order); this.paymentReference = '';
        this.rechargeMessage = `订单 ${data.order.order_no} 已提交，请完成付款并等待管理员审核。`;
      } catch (error) { this.rechargeMessage = error.message; this.rechargeError = true; }
      finally { this.rechargeLoading = false; }
    },
    orderStatus(status) { return ({ pending: '待审核', paid: '已到账', rejected: '未通过', cancelled: '已取消' })[status] || status; },
    async openHistory(onlyCopy = false) {
      if (!this.session) { this.errorMessage = '请先登录后查看生成记录'; return; }
      this.historyOnlyCopy = onlyCopy; this.historyOpen = true; this.historyLoading = true; this.historyError = '';
      try {
        const response = await fetch('/api/usage', { headers: this.authHeaders() }); const data = await response.json();
        if (!response.ok) throw new Error(data.error || '读取生成记录失败');
        this.historyRecords = data.records || [];
      } catch (error) { this.historyError = error.message; }
      finally { this.historyLoading = false; }
    },
    historyName(action) { return ({ copy_generation: '电商文案', image_generation: '图片生成', image_edit: '图生图 / 多图合成', gif_generation: 'GIF 动图', video_generation: '视频生成' })[action] || '图片生成'; },
    historyIcon(action) { return ({ copy_generation: '文', image_generation: '图', image_edit: '改', gif_generation: '动', video_generation: '视' })[action] || '图'; },
    historyStatus(status) { return ({ pending: '生成中', completed: '成功', failed: '失败已退款' })[status] || status; },
    formatHistoryDate(value) { return value ? new Date(value).toLocaleString('zh-CN') : ''; },
    downloadHistory(url, record, index) {
      const link = document.createElement('a'); link.href = url;
      link.download = `lingjing-${record.action}-${new Date(record.created_at).getTime()}-${index + 1}`;
      link.target = '_blank'; link.click();
    },
    async copyHistoryText(record) {
      await navigator.clipboard.writeText(record.output_text || ''); this.copiedHistoryId = record.id;
      setTimeout(() => { if (this.copiedHistoryId === record.id) this.copiedHistoryId = ''; }, 1500);
    },
    async openSupport() {
      if (!this.session) { this.errorMessage = '请先登录后联系人工客服'; return; }
      this.supportOpen = true; this.supportLoading = true; this.supportError = '';
      await this.loadSupportMessages(); this.supportLoading = false;
      if (this.supportTimer) clearInterval(this.supportTimer)
      this.supportTimer = setInterval(() => { if (this.supportOpen && !this.supportSending) this.loadSupportMessages(false) }, 10000)
    },
    closeSupport() {
      this.supportOpen = false; if (this.supportTimer) clearInterval(this.supportTimer); this.supportTimer = null;
    },
    async loadSupportMessages(showError = true) {
      try {
        const response = await fetch('/api/support/conversation', { headers: this.authHeaders() }); const data = await response.json();
        if (!response.ok) throw new Error(data.error || '读取客服消息失败');
        this.supportMessages = data.messages || [];
        this.$nextTick(() => { const box = this.$refs.supportMessages; if (box) box.scrollTop = box.scrollHeight; });
      } catch (error) { if (showError) this.supportError = error.message; }
    },
    async sendSupportMessage() {
      const content = this.supportDraft.trim(); if (!content || this.supportSending) return;
      this.supportSending = true; this.supportError = '';
      try {
        const response = await fetch('/api/support/messages', { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ content }) }); const data = await response.json();
        if (!response.ok) throw new Error(data.error || '消息发送失败');
        this.supportMessages.push(data.message); this.supportDraft = '';
        this.$nextTick(() => { const box = this.$refs.supportMessages; if (box) box.scrollTop = box.scrollHeight; });
      } catch (error) { this.supportError = error.message; }
      finally { this.supportSending = false; }
    },
    async generateCopy() {
      if (this.copyLoading) return;
      if (!this.session) { this.copyError = "请先登录后再生成"; return; }
      if (this.credits < 1) { this.copyError = "算力不足，请充值后再试"; return; }
      if (!this.copyProduct.trim()) { this.copyError = "请填写商品名称"; return; }
      if (!this.copyFeatures.trim()) { this.copyError = "请填写商品核心卖点"; return; }
      this.copyLoading = true; this.copyError = ""; this.copyCopied = false;
      try {
        const response = await fetch('/api/copy/generate', {
          method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ product: this.copyProduct, features: this.copyFeatures, platform: this.copyPlatform, style: this.copyStyle })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '文案生成失败');
        this.copyResult = data.copy;
        if (typeof data.credits === 'number') this.profile = { ...this.profile, credits: data.credits };
      } catch (error) { this.copyError = error.message; }
      finally { this.copyLoading = false; }
    },
    async copyCopyResult() {
      await navigator.clipboard.writeText(this.copyResult);
      this.copyCopied = true;
      setTimeout(() => { this.copyCopied = false; }, 1500);
    },
    async logout() { if (supabase) await supabase.auth.signOut() },
    go(p) {
      this.page = p;
      this.mode = 'text';
      this.menuOpen = false;
    },
    selectVideoMode(mode) {
      this.videoMode = mode;
      this.errorMessage = '';
      this.state = 'empty';
      this.results = [];
    },
    randomize() {
      this.prompt = this.ideas[Math.floor(Math.random() * this.ideas.length)];
    },
    enhance() {
      this.prompt = `${this.prompt.trim() || this.ideas[0]}，专业构图，柔和体积光，丰富层次，超高细节，8K 质感`;
    },
    selectModel(m) {
      this.model = m;
      this.modelOpen = false;
    },
    upload(e) {
      this.uploadFile = e.target.files[0] || null;
      this.uploadName = this.uploadFile?.name || "";
    },
    selectReferenceImages(e) {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (!files.length) return;
      if (files.some(file => file.size > 10 * 1024 * 1024)) { this.errorMessage = "每张参考图片不能超过 10MB"; return; }
      const available = 4 - this.referenceImages.length;
      this.referenceImages.push(...files.slice(0, available).map(file => ({ file, url: URL.createObjectURL(file) })));
      this.errorMessage = files.length > available ? "最多只能选择4张参考图片" : "";
    },
    removeReferenceImage(index) {
      const [removed] = this.referenceImages.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
    },
    clearReferenceImages() {
      this.referenceImages.forEach(item => URL.revokeObjectURL(item.url));
      this.referenceImages = [];
      this.errorMessage = "";
    },
    toggleFavorite(image) {
      this.favorites = this.favorites.includes(image) ? this.favorites.filter((item) => item !== image) : [image, ...this.favorites];
      localStorage.setItem("ai-favorites", JSON.stringify(this.favorites));
    },
    download(image, index) {
      const link = document.createElement("a");
      link.href = image;
      const extension = this.resultType === 'video' ? 'mp4' : (this.resultType === 'gif' ? 'gif' : 'png');
      link.download = `lingjing-ai-${Date.now()}-${index + 1}.${extension}`;
      link.click();
    },
    async generate() {
      if (this.loading) return;
      if (!this.session) { this.errorMessage = "请先登录后再生成"; return; }
      if (!this.prompt.trim()) { this.errorMessage = "请输入画面描述"; return; }
      if (this.page === "video" && this.videoMode === 'image' && !this.uploadFile) { this.errorMessage = "请先上传一张静态图片"; return; }
      if (this.credits < this.requiredCredits) { this.errorMessage = "算力不足，请充值后再试"; return; }
      this.errorMessage = "";
      this.loading = true;
      this.state = "loading";
      try {
        let response;
        if (this.page === "video") {
          const body = new FormData();
          if (this.uploadFile) body.append("image", this.uploadFile);
          body.append("mode", this.videoMode);
          body.append("outputFormat", this.videoMode === 'image' ? 'gif' : 'mp4');
          body.append("prompt", this.prompt); body.append("ratio", this.ratio);
          response = await fetch("/api/videos/generate", { method: "POST", headers: this.authHeaders(), body });
        } else if (this.referenceImages.length) {
          const body = new FormData();
          this.referenceImages.forEach(item => body.append("images", item.file));
          body.append("prompt", this.prompt);
          body.append("ratio", this.ratio);
          body.append("count", String(this.count));
          response = await fetch("/api/images/edit", { method: "POST", headers: this.authHeaders(), body });
        } else {
          response = await fetch("/api/images/generate", { method: "POST", headers: this.authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ prompt: this.prompt, ratio: this.ratio, count: this.count }) });
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "生成失败");
        this.results = this.page === 'video'
          ? (this.videoMode === 'image' ? (data.gifs || []) : (data.videos || []))
          : data.images;
        this.resultType = this.page === 'video'
          ? (this.videoMode === 'image' ? 'gif' : 'video')
          : 'image';
        if (typeof data.credits === 'number') this.profile = { ...this.profile, credits: data.credits };
        this.state = "done";
      } catch (error) {
        this.errorMessage = error.message;
        this.state = this.results.length ? "done" : "empty";
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.reference-field small { margin-left: 5px; color: #a0a3ad; font-size: 10px; font-weight: 400; }
.reference-picker { height: 82px !important; margin: 0 !important; padding: 0 14px; border: 1px dashed #d9d7e4; border-radius: 12px; display: flex !important; align-items: center; gap: 10px; cursor: pointer; }
.reference-picker:hover { border-color: #8a70ff; background: #faf9ff; }
.reference-picker input, .reference-add input { display: none; }
.reference-picker span { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; background: #f0ecff; color: #7657ff; font-size: 20px; }
.reference-picker b { font-size: 12px; }
.reference-picker small { margin-left: auto; }
.reference-list { min-height: 82px; padding: 8px; border: 1px solid #e9eaf0; border-radius: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: #fafaff; }
.reference-thumb { position: relative; width: 64px; height: 64px; }
.reference-thumb img { width: 100%; height: 100%; border-radius: 9px; object-fit: cover; }
.reference-thumb button { position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: #25262c; color: #fff; line-height: 20px; cursor: pointer; }
.reference-thumb span { position: absolute; left: 4px; bottom: 4px; width: 18px; height: 18px; border-radius: 5px; display: grid; place-items: center; background: #17181dcc; color: #fff; font-size: 9px; }
.reference-add { width: 64px; height: 64px; margin: 0 !important; border: 1px dashed #cfcbe1; border-radius: 9px; display: flex !important; flex-direction: column; align-items: center; justify-content: center; color: #7657ff; font-size: 20px; cursor: pointer; }
.reference-add small { margin: 3px 0 0; font-size: 9px; }
.generate-btn.loading { pointer-events: none; cursor: wait; opacity: .82; transform: none; }
.button-spinner { width: 17px; height: 17px; border: 2px solid #ffffff66; border-top-color: #fff; border-radius: 50%; animation: button-spin .7s linear infinite; }
@keyframes button-spin { to { transform: rotate(360deg); } }
.copywriter-view { height: calc(100vh - 82px); min-height: 650px; padding: 22px; display: grid; grid-template-columns: minmax(360px, 440px) 1fr; gap: 18px; }
.copy-form-card, .copy-result-card { padding: 22px; border: 1px solid #e9eaf0; border-radius: 18px; background: #fff; box-shadow: 0 4px 18px #24254108; overflow: auto; }
.copy-intro { padding: 15px; border-radius: 13px; display: flex; align-items: center; gap: 12px; background: linear-gradient(120deg,#f1edff,#faf9ff); }
.copy-intro > span { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; background: linear-gradient(145deg,#6748ff,#a57cff); color: #fff; font-weight: 800; }
.copy-intro > div { display: flex; flex-direction: column; gap: 5px; }.copy-intro b { font-size: 14px; }.copy-intro small { color: #858993; font-size: 10px; }
.copy-input, .copy-textarea { width: 100%; border: 1px solid #e9eaf0; border-radius: 11px; outline: 0; background: #fff; font: 12px/1.6 inherit; transition: .2s; }
.copy-input { height: 43px; padding: 0 12px; }.copy-textarea { height: 125px; padding: 11px 12px; resize: vertical; }
.copy-input:focus, .copy-textarea:focus { border-color: #9179ff; box-shadow: 0 0 0 3px #7657ff12; }.copy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.copy-result-card { display: flex; flex-direction: column; }.copy-result-header { height: 42px; display: flex; align-items: flex-start; justify-content: space-between; }.copy-result-header h2 { margin: 0 8px 0 0; display: inline; font-size: 15px; }.copy-result-header span { color: #858993; font-size: 10px; }
.copy-header-actions{display:flex;gap:7px;align-items:center}
.copy-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }.copy-empty h3 { margin: 20px 0 8px; }.copy-empty p { color: #989ba4; font-size: 12px; }
.copy-output { flex: 1; margin: 15px 0 0; padding: 22px; border: 1px solid #eeebfa; border-radius: 14px; overflow: auto; background: #faf9ff; color: #292735; white-space: pre-wrap; word-break: break-word; font: 13px/1.9 "PingFang SC","Microsoft YaHei",sans-serif; }
.recharge-overlay{position:fixed;inset:0;z-index:100;background:#11131a99;display:grid;place-items:center;padding:20px}.recharge-modal{width:min(820px,100%);max-height:92vh;overflow:auto;padding:25px;border-radius:20px;background:#fff;box-shadow:0 30px 90px #1117}.recharge-modal>header{display:flex;justify-content:space-between;align-items:flex-start}.recharge-modal h2{margin:0 0 6px}.recharge-modal header p{margin:0;color:#858993;font-size:12px}.recharge-modal header button{border:0;background:transparent;font-size:26px;cursor:pointer}.package-grid{margin:22px 0;display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.package-grid button{position:relative;min-height:142px;padding:17px 8px 12px;border:1px solid #e9eaf0;border-radius:13px;background:#fff;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer}.package-grid button.selected{border:2px solid #7657ff;background:#f8f6ff}.package-grid button>em{position:absolute;top:-9px;padding:3px 9px;border-radius:10px;background:#7657ff;color:#fff;font-size:9px;font-style:normal}.package-grid strong{font-size:22px}.package-grid span{color:#7657ff;font-size:12px}.package-grid small{color:#999;font-size:9px}.payment-box{padding:20px;border-radius:13px;background:#f7f7fa;display:flex;gap:24px;align-items:center}.payment-qr-link{flex:0 0 240px;display:flex;flex-direction:column;align-items:center;gap:7px;color:#7657ff;text-decoration:none;font-size:11px}.payment-qr-link img{width:240px;height:240px;padding:6px;object-fit:contain;background:#fff;border-radius:10px;box-shadow:0 4px 16px #2221}.payment-qr-link small{font-size:10px}.payment-box>div{flex:1}.payment-box p{margin:7px 0;color:#777b85;font-size:11px}.payment-box input{width:100%;height:38px;padding:0 11px;border:1px solid #dddfe6;border-radius:9px;background:#fff}.recharge-success{color:#17894c;font-size:12px}.order-list{margin-top:20px}.order-list h3{font-size:13px}.order-list>div{padding:9px 0;border-top:1px solid #eee;display:grid;grid-template-columns:1fr auto 60px;gap:10px;font-size:10px}.order-list em{text-align:right;font-style:normal}.order-list em.paid{color:#17894c}.order-list em.pending{color:#d38316}.order-list em.rejected{color:#d33}@media(max-width:700px){.package-grid{grid-template-columns:repeat(2,1fr)}.payment-box{align-items:stretch;flex-direction:column}.payment-qr-link{flex-basis:auto;align-self:center}.payment-qr-link img{width:min(280px,75vw);height:min(280px,75vw)}.order-list>div{grid-template-columns:1fr}.order-list em{text-align:left}}
.history-modal{width:min(820px,100%);max-height:90vh;overflow:auto;padding:24px;border-radius:20px;background:#fff;box-shadow:0 30px 90px #1117}.history-modal>header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:1px solid #eee}.history-modal h2{margin:0 0 6px}.history-modal header p{margin:0;color:#858993;font-size:12px}.history-modal header button{border:0;background:transparent;font-size:26px;cursor:pointer}.history-list article{padding:15px 0;border-bottom:1px solid #f0f1f4;display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center}.history-icon{width:42px;height:42px;border-radius:11px;background:#f0ecff;color:#7657ff;display:grid;place-items:center;font-weight:700}.history-info{min-width:0}.history-info>div{display:flex;align-items:center;gap:8px}.history-info em{padding:2px 7px;border-radius:8px;background:#fff3dc;color:#b36b00;font-size:9px;font-style:normal}.history-info em.completed{background:#eaf8ef;color:#17894c}.history-info em.failed{background:#fff0f0;color:#c44}.history-info p{margin:6px 0;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.history-info small{color:#999;font-size:9px}.history-list article>strong{color:#7657ff;font-size:12px}.history-assets{grid-column:2/-1;display:grid;grid-template-columns:repeat(4,minmax(90px,1fr));gap:8px}.history-asset{position:relative;aspect-ratio:1;overflow:hidden;border-radius:10px;background:#17181d}.history-asset img,.history-asset video{width:100%;height:100%;object-fit:cover}.history-asset button{position:absolute;right:6px;bottom:6px;height:27px;padding:0 9px;border:0;border-radius:7px;background:#15161dcc;color:#fff;font-size:9px;cursor:pointer}.history-no-asset{grid-column:2/-1;margin:0;padding:10px;border-radius:8px;background:#f7f7f9;color:#999;font-size:10px}.history-loading,.history-empty{padding:70px 20px;text-align:center;color:#999;font-size:12px}@media(max-width:560px){.history-list article{grid-template-columns:36px 1fr}.history-icon{width:36px;height:36px}.history-list article>strong{grid-column:2}.history-assets{grid-column:1/-1;grid-template-columns:repeat(2,1fr)}.history-no-asset{grid-column:1/-1}}
.history-copy-output{grid-column:2/-1;position:relative;padding:14px;border-radius:10px;background:#faf9ff;border:1px solid #eeebfa}.history-copy-output pre{max-height:240px;margin:0;padding-right:80px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11px/1.75 "PingFang SC","Microsoft YaHei",sans-serif}.history-copy-output button{position:absolute;right:10px;top:10px;height:28px;padding:0 10px;border:0;border-radius:7px;background:#7657ff;color:#fff;font-size:9px;cursor:pointer}@media(max-width:560px){.history-copy-output{grid-column:1/-1}.history-copy-output pre{padding-right:0;padding-top:35px}}
.support-modal{width:min(640px,100%);height:min(720px,90vh);padding:22px;border-radius:20px;background:#fff;box-shadow:0 30px 90px #1117;display:flex;flex-direction:column}.support-modal>header{display:flex;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid #eee}.support-modal h2{margin:0 0 5px}.support-modal header p{margin:0;color:#858993;font-size:11px}.support-modal header button{border:0;background:transparent;font-size:26px;cursor:pointer}.support-messages{flex:1;overflow:auto;padding:18px 4px;display:flex;flex-direction:column;gap:12px}.support-welcome{margin:auto;text-align:center;color:#777}.support-welcome p{font-size:11px}.support-messages article{display:flex}.support-messages article.user{justify-content:flex-end}.support-messages article>div{max-width:78%;padding:10px 12px;border-radius:12px;background:#f1f2f5}.support-messages article.user>div{background:#7657ff;color:#fff}.support-messages article b{font-size:10px}.support-messages article p{margin:5px 0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.55}.support-messages article small{font-size:8px;opacity:.65}.support-composer{padding-top:12px;border-top:1px solid #eee;display:flex;gap:9px}.support-composer textarea{flex:1;height:72px;padding:10px;border:1px solid #dfe1e7;border-radius:10px;resize:none;font:12px/1.5 inherit}.support-composer button{width:78px;border:0;border-radius:10px;background:#7657ff;color:#fff;cursor:pointer}.support-composer button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:900px){.copywriter-view{grid-template-columns:1fr;height:auto}.copy-result-card{min-height:520px}}@media(max-width:560px){.copywriter-view{padding:10px}.copy-form-card,.copy-result-card{padding:16px}.copy-grid{grid-template-columns:1fr}}
</style>
