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
          <small>每生成 1 张图片消耗 1 点</small>
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
          <button class="ghost-btn">帮助中心</button
          ><button class="primary-small">获取算力</button>
        </div>
      </header>
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
          <button class="generate-btn" :disabled="loading" @click="generate">
            <span>✦</span><b>{{ loading ? "正在生成" : (page === 'video' ? (videoMode === 'image' ? "生成动图" : "生成视频") : "立即生成") }}</b
            ><small>消耗 {{ page === 'video' ? videoCredits : count }} 算力</small>
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
            <button class="history-btn">◷ 生成记录</button>
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
      <section v-else class="placeholder-view">
        <div class="placeholder-icon">✦</div>
        <h2>{{ pages[page][0] }}</h2>
        <p>完整功能即将上线，敬请期待。</p>
        <button class="primary-small" @click="go('image')">返回创作</button>
      </section>
    </main>
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
        { id: "image", name: "图片生成", icon: "▧" },
        { id: "video", name: "视频生成", icon: "▷", new: true },
        { id: "canvas", name: "AI 画布", icon: "⌘" },
        { label: "资产" },
        { id: "works", name: "我的作品", icon: "◫" },
        { id: "favorites", name: "我的收藏", icon: "♡" },
      ],
      pages: {
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
      ratio: "1:1",
      count: 1,
      state: "empty",
      loading: false,
      modelOpen: false,
      menuOpen: false,
      uploadName: "",
      uploadFile: null,
      results: [],
      resultType: "image",
      favorites: JSON.parse(localStorage.getItem("ai-favorites") || "[]"),
      errorMessage: "",
      authReady: false,
      session: null,
      profile: null,
      authSubscription: null,
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
      return this.videoMode === 'image' ? 5 : 8;
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
      if (!this.session) { this.errorMessage = "请先登录后再生成"; return; }
      if (this.credits < this.count) { this.errorMessage = "算力不足，请减少生成数量或充值"; return; }
      if (!this.prompt.trim()) { this.errorMessage = "请输入画面描述"; return; }
      if (this.page === "video" && this.videoMode === 'image' && !this.uploadFile) { this.errorMessage = "请先上传一张静态图片"; return; }
      const requiredCredits = this.page === 'video' ? this.videoCredits : this.count;
      if (this.credits < requiredCredits) { this.errorMessage = "算力不足，请充值后再试"; return; }
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
