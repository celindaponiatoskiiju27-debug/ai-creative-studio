<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <a class="brand" href="#" @click.prevent="go('home')"
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
        <div v-if="session" class="credit-card">
          <div><span>账户算力</span><b>{{ credits }}</b></div>
          <div class="progress"><i :style="{ width: creditProgress }" /></div>
          <small>图片低至 2 点，动图 6 点</small>
        </div>
        <button class="profile" :title="profileEmail" @click="session ? accountOpen = true : requestLogin('登录后可使用个人账户功能')">
          <span class="avatar">{{ avatarText }}</span
          ><span><b>{{ displayName }}</b><small>{{ accountLabel }} · {{ profileEmail }}</small></span
          ><i v-if="session" @click.stop="logout">退出</i><i v-else>登录</i>
        </button>
        <div class="sidebar-legal"><button @click="openLegal('terms')">用户协议</button><button @click="openLegal('privacy')">隐私政策</button><button @click="openLegal('refund')">退款规则</button></div>
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
          <button v-if="session" class="ghost-btn" @click="openInvite">邀请新用户</button>
          <button v-if="session" class="ghost-btn" @click="logout">退出登录</button>
          <button v-else class="ghost-btn" @click="requestLogin('登录后可使用完整功能')">登录 / 注册</button>
          <button class="ghost-btn" @click="onboardingOpen = true">新手引导</button>
          <button class="ghost-btn" @click="openSupport">帮助中心</button
          ><button class="primary-small" @click="openRecharge">获取算力</button>
        </div>
      </header>
      <div v-if="$data.siteAnnouncement" class="site-announcement" :class="$data.siteAnnouncement.level"><div><b>{{ $data.siteAnnouncement.title }}</b><span>{{ $data.siteAnnouncement.content }}</span></div><button aria-label="关闭公告" @click="dismissAnnouncement">×</button></div>
      <div v-if="session && credits <= 2" class="low-credit-banner"><span>当前仅剩 <b>{{ credits }}</b> 点算力，可能不足以完成下一次创作。</span><button @click="openRecharge">查看算力套餐</button></div>
      <section v-if="page === 'home'" class="landing-view">
        <div class="landing-hero">
          <div class="landing-copy">
            <span class="landing-tag">专为电商创作者打造</span>
            <h2>一站生成文案、商品图<br />动图与营销视频</h2>
            <p>不用学习复杂工具，从商品卖点到可发布素材，几分钟完成整套电商内容创作。</p>
            <div class="landing-actions"><button class="landing-primary" @click="go('image')">免费开始创作</button><button @click="go('copy')">先生成电商文案</button></div>
            <small>注册即送体验算力 · 使用生成能力时才需要登录</small>
          </div>
          <div class="landing-showcase">
            <div class="showcase-main"><span>AI 商品视觉</span><b>让一张商品图<br />拥有更多可能</b><button @click="go('video')">让图片动起来 →</button></div>
            <div class="showcase-chip copy-chip">高转化文案</div><div class="showcase-chip image-chip">商品主图</div><div class="showcase-chip video-chip">GIF / 视频</div>
          </div>
        </div>
        <div class="landing-features">
          <article><span>文</span><h3>电商文案</h3><p>根据商品卖点和投放平台，快速生成标题、卖点与营销正文。</p><button @click="go('copy')">立即体验</button></article>
          <article><span>图</span><h3>图片生成与修改</h3><p>支持文字生成图片、多图合成和通过描述修改现有商品素材。</p><button @click="go('image')">立即体验</button></article>
          <article><span>动</span><h3>GIF 与视频</h3><p>上传静态图片生成 GIF 动图，也可以直接用文字生成营销视频。</p><button @click="go('video')">立即体验</button></article>
          <article><span>设</span><h3>电商画布</h3><p>拖拽商品图和营销文字，快速制作主图、海报与社媒封面。</p><button @click="go('canvas')">立即体验</button></article>
        </div>
        <div class="landing-bottom"><div><span>按需使用，更适合刚起步的商家</span><h3>先免费体验，满意后再获取更多算力</h3><p>生成失败自动退还算力，作品自动保存到云端。</p></div><button @click="openRecharge">查看算力套餐</button></div>
      </section>
      <section v-if="page === 'copy'" class="copywriter-view">
        <div class="copy-form-card">
          <div class="copy-intro"><span>AI</span><div><b>电商文案生成器</b><small>填写商品信息，快速生成可直接使用的营销文案</small></div></div>
          <div class="starter-templates"><span>快速开始</span><button v-for="item in copyTemplates" :key="item.name" @click="applyCopyTemplate(item)">{{ item.name }}</button></div>
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
          <p class="usage-warning">仅限合法电商营销使用。严禁用于虚假宣传、诈骗引流、仿冒品牌、侵害版权或肖像权等违规行为。</p>
          <p v-if="copyError" class="api-error">{{ copyError }}</p>
        </div>
        <div class="copy-result-card">
          <div v-if="copyResult && copyUsageId" class="generation-feedback"><span>这次结果有帮助吗？</span><button :class="{ active: feedbackSelections[copyUsageId] === true }" @click="sendGenerationFeedback(copyUsageId,true)">👍 有帮助</button><button :class="{ active: feedbackSelections[copyUsageId] === false }" @click="sendGenerationFeedback(copyUsageId,false)">👎 不满意</button></div>
          <div class="copy-result-header"><div><h2>生成结果</h2><span>由 GPT-5.4 生成</span></div><div class="copy-header-actions"><button v-if="copyResult" class="history-btn" @click="copyCopyResult">{{ copyCopied ? '已复制' : '复制文案' }}</button><button class="history-btn" @click="openHistory(true)">◷ 文案历史</button></div></div>
          <div v-if="copyLoading" class="loading-state"><div class="loader"><i /><i /><i /></div><h3>正在分析商品卖点</h3><p>AI 正在为目标平台组织高转化文案…</p></div>
          <div v-else-if="!copyResult" class="copy-empty"><div class="placeholder-icon">文</div><h3>让好商品更会表达</h3><p>填写左侧商品资料，生成标题、卖点和营销正文</p></div>
          <div v-else class="copy-output-wrap"><span class="ai-content-label">AI 生成内容</span><pre class="copy-output">{{ copyResult }}</pre></div>
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
              <label>画面描述</label><button type="button" title="每天前 3 次免费，之后每次消耗 1 点算力" :disabled="enhanceLoading" :aria-busy="enhanceLoading ? 'true' : 'false'" @click="enhance"><span v-if="enhanceLoading" class="button-spinner" aria-hidden="true"></span>{{ enhanceLoading ? '润色中…' : '✦ AI 润色（每日3次免费）' }}</button>
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
            <div class="starter-templates prompt-templates"><span>电商模板</span><button v-for="item in imageTemplates" :key="item.name" @click="applyImageTemplate(item)">{{ item.name }}</button></div>
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
          <p class="usage-warning">仅限合法电商及创意用途。严禁制作虚假宣传、诈骗引流、色情暴力、仿冒侵权、虚假凭证等违规内容；使用者应在发布前自行核验。</p>
        </div>
        <div class="result-panel">
          <div class="result-header">
            <div>
              <h2>创作结果</h2>
              <span>{{ meta }}</span>
            </div>
            <button class="history-btn" @click="openHistory(false)">◷ 生成记录</button>
          </div>
          <div class="result-usage-tip">作品仅供合法电商及创意使用，请勿用于欺诈、侵权或其他违法违规场景。</div>
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
              <span class="ai-content-label media-label">AI 生成</span>
              <video v-if="resultType === 'video'" :src="image" autoplay loop muted playsinline controls />
              <img v-else :src="image" :alt="`AI 生成作品 ${i + 1}`" />
              <div class="result-actions">
                <button @click="toggleFavorite(image, resultType, prompt)">{{ isFavorite(image) ? "♥" : "♡" }}</button><button @click="download(image, i)">↓</button>
              </div>
            </article>
          </div>
          <div v-if="state === 'done' && currentUsageId" class="generation-feedback media-feedback"><span>这次结果有帮助吗？</span><button :class="{ active: feedbackSelections[currentUsageId] === true }" @click="sendGenerationFeedback(currentUsageId,true)">👍 有帮助</button><button :class="{ active: feedbackSelections[currentUsageId] === false }" @click="sendGenerationFeedback(currentUsageId,false)">👎 不满意</button></div>
        </div>
      </section>
      <section v-else-if="page === 'canvas'" class="design-view">
        <aside class="design-controls">
          <div class="design-block">
            <h3>画布尺寸</h3>
            <div class="design-presets">
              <button v-for="preset in designPresets" :key="preset.id" :class="{ active: designPreset === preset.id }" @click="selectDesignPreset(preset)"><b>{{ preset.name }}</b><small>{{ preset.width }} × {{ preset.height }}</small></button>
            </div>
          </div>
          <div class="design-block">
            <h3>商品图片</h3>
            <label class="design-upload"><input type="file" accept="image/*" @change="uploadDesignProduct" /><span>＋ 上传商品图</span><small>上传后可在画布中拖动</small></label>
            <div v-if="designProductImage" class="design-scale"><label>商品图大小 <b>{{ Math.round(designImageScale * 100) }}%</b></label><input v-model.number="designImageScale" type="range" min="0.15" max="1.2" step="0.01" @input="drawDesignCanvas" /><button @click="removeDesignProduct">移除商品图</button></div>
          </div>
          <div class="design-block">
            <h3>营销文字</h3>
            <input v-model="designTitle" maxlength="30" placeholder="商品标题，例如：夏日清凉上新" @input="drawDesignCanvas" />
            <input v-model="designPrice" maxlength="16" placeholder="价格，例如：¥99 起" @input="drawDesignCanvas" />
            <textarea v-model="designSellingPoint" maxlength="80" placeholder="核心卖点，例如：轻薄透气｜限时优惠" @input="drawDesignCanvas"></textarea>
            <div class="design-color-row"><label>文字颜色 <input v-model="designTextColor" type="color" @input="drawDesignCanvas" /></label><label>背景颜色 <input v-model="designBackgroundColor" type="color" @input="clearDesignBackground" /></label></div>
          </div>
          <div class="design-block">
            <h3>AI 商品背景 <small>消耗 2 算力</small></h3>
            <textarea v-model="designBackgroundPrompt" maxlength="500" placeholder="例如：米白色高级摄影棚，柔和日光，简洁展台"></textarea>
            <button class="design-ai-btn" :disabled="designBgLoading" @click="generateDesignBackground"><span v-if="designBgLoading" class="button-spinner"></span>{{ designBgLoading ? '背景生成中…' : '✦ 生成 AI 背景' }}</button>
          </div>
        </aside>
        <div class="design-workspace">
          <div class="design-stage-wrap">
            <canvas ref="designCanvas" class="design-canvas" :width="designWidth" :height="designHeight" @mousedown="startDesignDrag" @mousemove="moveDesignDrag" @mouseup="endDesignDrag" @mouseleave="endDesignDrag" @touchstart.prevent="startDesignDrag" @touchmove.prevent="moveDesignDrag" @touchend="endDesignDrag"></canvas>
          </div>
          <p class="design-tip">提示：商品图、标题、价格和卖点都可以直接拖动调整位置</p>
          <p v-if="designMessage" class="design-message" :class="{ error: designError }">{{ designMessage }}</p>
          <div class="design-actions"><button @click="saveDesignDraft">保存草稿</button><button @click="resetDesign">清空画布</button><button class="primary" @click="exportDesign">↓ 导出 PNG</button></div>
        </div>
      </section>
      <section v-else-if="page === 'community'" class="community-view">
        <div class="community-hero"><div><span>COMMUNITY</span><h2>灵感广场</h2><p>浏览用户主动公开的电商作品，收藏灵感或一键生成同款。</p></div><button v-if="session" @click="go('works')">发布我的作品</button></div>
        <div class="community-toolbar"><div><button v-for="category in communityCategories" :key="category" :class="{ active: communityCategory === category }" @click="communityCategory = category; loadCommunity()">{{ category }}</button></div><select v-model="communitySort" @change="loadCommunity"><option value="latest">最新发布</option><option value="popular">热门收藏</option></select></div>
        <div class="community-notice">作品均由用户主动发布。参考作品前请尊重作者设置，严禁用于侵权、欺诈或其他违法用途。</div>
        <div v-if="communityLoading" class="asset-state"><div class="loader"><i /><i /><i /></div><h3>正在加载灵感作品</h3></div>
        <div v-else-if="communityError" class="asset-state error"><h3>读取失败</h3><p>{{ communityError }}</p><button @click="loadCommunity">重新加载</button></div>
        <div v-else-if="communityPosts.length" class="community-grid"><article v-for="post in communityPosts" :key="post.id"><div class="community-media"><video v-if="post.media_type === 'video'" :src="post.asset_url" controls preload="metadata" /><img v-else :src="post.asset_url" :alt="post.title" loading="lazy" /><span>{{ post.media_type === 'video' ? '视频' : (post.media_type === 'gif' ? 'GIF' : '图片') }}</span></div><div class="community-card-body"><h3>{{ post.title }}</h3><p><b>{{ post.author }}</b><span>{{ post.category }}</span></p><blockquote v-if="post.prompt">{{ post.prompt }}</blockquote><blockquote v-else>{{ post.prompt_visibility === 'hidden' ? '作者未公开提示词' : '点击生成同款后获取参考提示词' }}</blockquote><div><button :class="{ liked: post.favorited }" @click="favoriteCommunityPost(post)">♡ {{ post.favorite_count }}</button><button class="remix" @click="remixCommunityPost(post)">生成同款 · {{ post.remix_count }}</button><button class="report" @click="reportCommunityPost(post)">举报</button></div></div></article></div>
        <div v-else class="asset-state"><div class="placeholder-icon">◎</div><h3>这个分类还没有公开作品</h3><p>发布第一件作品，审核通过后会展示在这里。</p><button @click="go('works')">选择我的作品</button></div>
      </section>
      <section v-else-if="page === 'works' || page === 'favorites'" class="asset-view">
        <div class="asset-toolbar">
          <div><h2>{{ page === 'works' ? '我的作品' : '我的收藏' }}</h2><p>{{ page === 'works' ? '云端保存最近生成的内容，随时查看和下载' : '收藏喜欢的作品，登录后可跨设备查看' }}</p></div>
          <div class="asset-filters"><button v-for="filter in assetFilters" :key="filter.id" :class="{ active: assetFilter === filter.id }" @click="assetFilter = filter.id">{{ filter.name }}</button></div>
        </div>
        <div class="asset-usage-tip">下载或发布作品即表示你承诺仅将其用于合法用途，并自行核验广告、版权、商标及肖像授权。</div>
        <div v-if="assetLoading" class="asset-state"><div class="loader"><i /><i /><i /></div><h3>正在读取云端资产</h3></div>
        <div v-else-if="assetError" class="asset-state error"><h3>读取失败</h3><p>{{ assetError }}</p><button @click="loadAssetPage(page)">重新加载</button></div>
        <div v-else-if="displayedAssetItems.length" class="asset-grid">
          <article v-for="(item, index) in displayedAssetItems" :key="item.id || item.url">
            <div class="asset-preview">
              <span class="ai-content-label media-label">AI 生成</span>
              <video v-if="item.type === 'video'" :src="item.url" controls preload="metadata" />
              <img v-else-if="item.type !== 'text'" :src="item.url" :alt="item.prompt || 'AI 作品'" loading="lazy" />
              <pre v-else>{{ item.text }}</pre>
              <span>{{ assetTypeName(item.type) }}</span>
            </div>
            <div class="asset-info"><p>{{ item.prompt || (item.type === 'text' ? '电商文案' : '未记录描述') }}</p><small>{{ formatHistoryDate(item.createdAt) }}</small></div>
            <div class="asset-actions">
              <button v-if="page === 'works' && item.type !== 'text'" class="publish-community" @click="publishToCommunity(item)">发布到广场</button>
              <button v-if="item.type === 'text'" @click="copyAssetText(item)">{{ copiedAssetId === item.id ? '已复制' : '复制文案' }}</button>
              <button v-else @click="downloadAsset(item, index)">↓ 下载</button>
              <button v-if="item.type !== 'text'" :class="{ liked: isFavorite(item.url) }" @click="toggleFavorite(item.url, item.type, item.prompt)">{{ isFavorite(item.url) ? '♥ 取消收藏' : '♡ 收藏' }}</button>
            </div>
          </article>
        </div>
        <div v-else class="asset-state"><div class="placeholder-icon">{{ page === 'works' ? '作' : '藏' }}</div><h3>{{ assetFilter === 'all' ? (page === 'works' ? '还没有云端作品' : '还没有收藏作品') : '该分类暂时没有内容' }}</h3><p>完成生成后，作品会自动保存在这里。</p><button @click="go('image')">开始创作</button></div>
      </section>
      <section v-else-if="page !== 'copy' && page !== 'canvas' && page !== 'works' && page !== 'favorites'" class="placeholder-view">
        <div class="placeholder-icon">✦</div>
        <h2>{{ pages[page][0] }}</h2>
        <p>完整功能即将上线，敬请期待。</p>
        <button class="primary-small" @click="go('image')">返回创作</button>
      </section>
    </main>
    <div v-if="inviteOpen" class="recharge-overlay" @click.self="inviteOpen = false">
      <section class="invite-modal">
        <header><div><h2>邀请新用户，双方得算力</h2><p>新用户通过你的链接注册并完成首次真实充值后发放奖励</p></div><button @click="inviteOpen = false">×</button></header>
        <div class="invite-code-box"><span>我的邀请码</span><strong>{{ inviteData.code || '读取中…' }}</strong><button @click="copyInviteLink">{{ inviteCopied ? '已复制邀请链接' : '复制邀请链接' }}</button></div>
        <div v-if="inviteData.settings" class="invite-rules"><div><b>＋{{ inviteData.settings.inviter_reward }}</b><span>邀请人奖励</span></div><div><b>＋{{ inviteData.settings.invitee_reward }}</b><span>新用户奖励</span></div><div><b>{{ inviteData.settings.per_inviter_monthly_limit }} 人</b><span>每月奖励上限</span></div></div>
        <p class="invite-note">仅限此前未注册的新用户。首笔真实充值审核到账后发放；相同注册 IP、相同付款凭证、超过每日/月度人数或全站预算的邀请不发奖励。</p>
        <div class="invite-list"><h3>邀请记录</h3><div v-for="item in inviteData.referrals || []" :key="item.id"><span>{{ formatHistoryDate(item.created_at) }}</span><b>{{ referralStatus(item.status) }}</b><em v-if="item.status === 'rewarded'">＋{{ item.inviter_reward }} 点</em></div><p v-if="!(inviteData.referrals || []).length">还没有邀请记录，复制链接发给朋友吧。</p></div>
      </section>
    </div>
    <div v-if="rechargeOpen" class="recharge-overlay" @click.self="rechargeOpen = false">
      <section class="recharge-modal">
        <header><div><h2>内测充值算力</h2><p>当前仅开放小额人工充值，请确认订单与退款规则</p></div><button @click="rechargeOpen = false">×</button></header>
        <div class="package-grid">
          <button v-for="item in packages" :key="item.id" :class="{ selected: selectedPackage === item.id }" @click="selectedPackage = item.id">
            <em v-if="item.recommended">推荐</em><b>{{ item.name }}</b><strong>¥{{ item.price }}</strong><span>{{ item.credits }} 点算力</span><small>约 ¥{{ (item.price / item.credits).toFixed(3) }}/点</small>
          </button>
        </div>
        <div class="payment-box">
          <a v-if="billing.paymentQrUrl" class="payment-qr-link" :href="billing.paymentQrUrl" target="_blank" title="点击查看大图"><img :src="billing.paymentQrUrl" alt="微信付款二维码" /><small>扫码支付 · 点击查看大图</small></a>
          <div><b>当前为内测人工充值</b><p>{{ billing.instructions || '提交订单后，请等待管理员核对到账。' }}</p><input v-model.trim="paymentReference" maxlength="200" placeholder="付款单号或付款备注（必填）" /><label class="payment-proof-input">上传付款截图（必填）<input ref="paymentProofInput" type="file" accept="image/png,image/jpeg,image/webp" @change="selectPaymentProof" /></label><small>{{ paymentProof ? paymentProof.name : '支持 PNG、JPG、WebP，最大 5MB' }}</small></div>
        </div>
        <label class="refund-agreement"><input v-model="refundAgreement" type="checkbox" /> 我已确认套餐金额与算力数量，并阅读<button type="button" @click="openLegal('refund')">《充值与退款规则》</button>：未使用算力可申请退款，已消耗算力及赠送算力不折现。</label>
        <p v-if="rechargeMessage" :class="rechargeError ? 'api-error' : 'recharge-success'">{{ rechargeMessage }}</p>
        <button class="generate-btn" :class="{ loading: rechargeLoading }" :disabled="rechargeLoading || !selectedPackage || !refundAgreement" @click="createRechargeOrder">
          <span v-if="rechargeLoading" class="button-spinner"></span><span v-else>✦</span><b>{{ rechargeLoading ? '正在提交…' : '提交充值订单' }}</b>
        </button>
        <div v-if="rechargeOrders.length" class="order-list"><h3>最近订单</h3><div v-for="order in rechargeOrders" :key="order.id"><span>{{ order.order_no }}<small v-if="order.status === 'pending'">请勿重复付款或提交，管理员审核后自动到账</small></span><b>¥{{ (order.amount_fen / 100).toFixed(2) }} / {{ order.credits }}点</b><em :class="order.status">{{ orderStatus(order.status) }}</em><button v-if="['paid','partially_refunded'].includes(order.status) && !(order.refund_requests || []).some(item => item.status === 'pending')" @click="requestRefund(order)">申请退款</button></div></div>
        <details v-if="creditTransactions.length" class="credit-ledger"><summary>查看算力流水</summary><div v-for="item in creditTransactions" :key="item.id"><span>{{ item.description || item.type }}</span><b :class="{ plus: item.amount > 0 }">{{ item.amount > 0 ? '+' : '' }}{{ item.amount }}</b><small>余额 {{ item.balance_after }} · {{ formatHistoryDate(item.created_at) }}</small></div></details>
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
                <span class="ai-content-label media-label">{{ record.ai_label || 'AI 生成' }}</span>
                <video v-if="record.action === 'video_generation'" :src="asset" controls preload="metadata" />
                <img v-else :src="asset" :alt="`${historyName(record.action)}作品 ${index + 1}`" loading="lazy" />
                <button @click="downloadHistory(asset, record, index)">↓ 下载</button>
              </div>
            </div>
            <div v-else-if="record.output_text" class="history-copy-output"><span class="ai-content-label">{{ record.ai_label || 'AI 生成内容' }}</span><pre>{{ record.output_text }}</pre><button @click="copyHistoryText(record)">{{ copiedHistoryId === record.id ? '已复制' : '复制文案' }}</button></div>
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
    <AuthModal v-if="authReady && (passwordRecovery || (!session && authOpen))" :recovery-mode="passwordRecovery" @close="closeAuthModal" @recovered="finishPasswordRecovery" @legal="openLegal" />
    <AccountModal v-if="session && profile && accountOpen" :profile="profile" :session="session" @close="accountOpen = false" @works="accountOpen = false; go('works')" @recharge="accountOpen = false; openRecharge()" @logout="accountOpen = false; logout()" />
    <LegalModal v-if="legalOpen" :initial-tab="legalTab" @close="legalOpen = false" />
    <div v-if="onboardingOpen" class="onboarding-overlay" @click.self="closeOnboarding">
      <section class="onboarding-modal">
        <header><div><span>✦</span><h2>3步完成第一件电商作品</h2><p>无需先学习复杂提示词，选择模板就能开始</p></div><button @click="closeOnboarding">×</button></header>
        <div class="onboarding-steps"><article><b>1</b><div><h3>选择创作类型</h3><p>文案适合商品标题与详情页；图片适合主图和宣传素材；GIF与视频让商品展示更生动。</p></div></article><article><b>2</b><div><h3>套用模板并修改</h3><p>选择下面的行业模板，再替换商品名称、卖点和画面要求，不需要从空白开始。</p></div></article><article><b>3</b><div><h3>登录并生成</h3><p>浏览和填写内容无需登录，点击生成时再登录。生成结果会自动保存在“我的作品”。</p></div></article></div>
        <div class="onboarding-choices"><button @click="startOnboarding('copy')"><span>文</span><b>先生成电商文案</b><small>消耗低，最快体验</small></button><button @click="startOnboarding('image')"><span>图</span><b>先生成商品图片</b><small>适合主图和海报</small></button><button @click="startOnboarding('video')"><span>动</span><b>让商品图片动起来</b><small>上传图片生成 GIF</small></button></div>
        <label><input v-model="hideOnboarding" type="checkbox" /> 下次不再自动显示</label>
      </section>
    </div>
    <div
      class="overlay"
      :class="{ show: menuOpen }"
      @click="menuOpen = false"
    />
  </div>
</template>
<script>
import AuthModal from './AuthModal.vue'
import AccountModal from './AccountModal.vue'
import LegalModal from './LegalModal.vue'
import { supabase, supabaseConfigured } from './supabase'

export default {
  name: "App",
  components: { AuthModal, AccountModal, LegalModal },
  data() {
    const models = [{ name: "GPT Image 2", desc: "OpenAI 新一代高质量图片模型" }];
    return {
      nav: [
        { id: "home", name: "产品首页", icon: "⌂" },
        { label: "创作" },
        { id: "copy", name: "电商文案", icon: "文", new: true },
        { id: "image", name: "图片生成", icon: "▧" },
        { id: "video", name: "视频生成", icon: "▷", new: true },
        { id: "canvas", name: "电商设计", icon: "⌘", new: true },
        { id: "community", name: "灵感广场", icon: "◎", new: true },
        { label: "资产" },
        { id: "works", name: "我的作品", icon: "◫" },
        { id: "favorites", name: "我的收藏", icon: "♡" },
      ],
      pages: {
        home: ["灵境 AI", "为电商商家提供一站式 AI 内容创作"],
        copy: ["电商文案", "为电商商品生成高转化营销内容"],
        image: ["图片生成", "把你的想象变成画面"],
        video: ["视频生成", "选择让图片动起来，或直接用文字生成视频"],
        canvas: ["电商设计", "快速制作商品主图与营销海报"],
        community: ["灵感广场", "浏览真实作品，参考提示词并生成同款"],
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
      copyTemplates: [
        { name: '服装种草', product: '夏季冰丝防晒衣', features: 'UPF50+防晒、冰凉透气、轻薄不闷汗、多色可选', platform: '小红书', style: '种草分享' },
        { name: '美妆促销', product: '持妆水润气垫', features: '轻薄遮瑕、持妆12小时、水润不卡粉、便携补妆', platform: '抖音 / 快手', style: '促销转化' },
        { name: '家居卖点', product: '人体工学护腰座椅', features: '多点支撑、可调腰托、透气网布、静音滚轮', platform: '淘宝 / 天猫', style: '专业可信' },
      ],
      imageTemplates: [
        { name: '白底主图', prompt: '单件商品居中展示，纯白无缝背景，柔和棚拍光线，清晰边缘，高级电商产品摄影，不出现文字与标志', ratio: '1:1' },
        { name: '促销场景', prompt: '商品放置在精致展台中央，品牌感电商促销场景，明亮氛围光，画面预留营销文字区域，不出现乱码', ratio: '1:1' },
        { name: '小红书封面', prompt: '生活方式产品分享画面，自然日光，干净温暖的家居背景，真实摄影质感，构图适合小红书封面', ratio: '3:4' },
        { name: '横版广告', prompt: '高端商业产品广告，商品位于画面右侧，左侧大面积留白，层次丰富的光影，高清摄影', ratio: '16:9' },
      ],
      onboardingOpen: !localStorage.getItem('lingjing-onboarding-hidden'),
      hideOnboarding: false,
      anonymousId: localStorage.getItem('lingjing-anonymous-id') || (crypto.randomUUID ? crypto.randomUUID() : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      page: "home",
      mode: "text",
      prompt: "",
      copyProduct: "",
      copyFeatures: "",
      copyPlatform: "淘宝 / 天猫",
      copyStyle: "突出卖点",
      copyResult: "",
      copyUsageId: "",
      copyLoading: false,
      enhanceLoading: false,
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
      currentUsageId: "",
      feedbackSelections: {},
      resultType: "image",
      favorites: [],
      assetFilters: [{ id: 'all', name: '全部' }, { id: 'image', name: '图片' }, { id: 'gif', name: 'GIF' }, { id: 'video', name: '视频' }, { id: 'text', name: '文案' }],
      assetFilter: 'all',
      assetLoading: false,
      assetError: '',
      copiedAssetId: '',
      errorMessage: "",
      authReady: false,
      authOpen: false,
      accountOpen: false,
      passwordRecovery: window.location.hash.includes('type=recovery'),
      legalOpen: false,
      legalTab: 'terms',
      session: null,
      profile: null,
      authSubscription: null,
      rechargeOpen: false,
      rechargeLoading: false,
      rechargeMessage: "",
      rechargeError: false,
      selectedPackage: "popular",
      paymentReference: "",
      paymentProof: null,
      refundAgreement: false,
      creditTransactions: [],
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
      communityPosts: [],
      communityLoading: false,
      communityError: "",
      communityCategory: "全部",
      communitySort: "latest",
      communityCategories: ["全部", "美妆", "服装", "食品", "家居", "数码", "其他"],
      supportTimer: null,
      inviteOpen: false,
      inviteLoading: false,
      inviteCopied: false,
      inviteData: { referrals: [] },
      designPresets: [
        { id: 'taobao', name: '淘宝主图', width: 800, height: 800 },
        { id: 'redbook', name: '小红书封面', width: 900, height: 1200 },
        { id: 'douyin', name: '抖音竖图', width: 1080, height: 1440 },
        { id: 'banner', name: '横版海报', width: 1200, height: 628 },
      ],
      designPreset: 'taobao',
      designWidth: 800,
      designHeight: 800,
      designTitle: '好物焕新季',
      designPrice: '¥99 起',
      designSellingPoint: '品质甄选｜限时优惠',
      designTextColor: '#171821',
      designBackgroundColor: '#f4efe8',
      designBackgroundPrompt: '',
      designProductImage: null,
      designProductSource: '',
      designBackgroundImage: null,
      designBackgroundSource: '',
      designImageScale: 0.62,
      designImageX: 0.5,
      designImageY: 0.59,
      designImageRect: null,
      designTextRects: {},
      designActiveElement: '',
      designDragOffset: { x: 0, y: 0 },
      designTitleX: 0.065,
      designTitleY: 0.07,
      designPriceX: 0.065,
      designPriceY: 0.245,
      designSellingPointX: 0.065,
      designSellingPointY: 0.335,
      designDragging: false,
      designBgLoading: false,
      designMessage: '',
      designError: false,
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
      const records = this.historyRecords.filter(record => record.action !== 'prompt_enhance');
      return this.historyOnlyCopy ? records.filter(record => record.action === 'copy_generation') : records;
    },
    workAssetItems() {
      const items = [];
      this.historyRecords.filter(record => record.status === 'completed' && record.action !== 'prompt_enhance').forEach(record => {
        if (record.output_text) items.push({ id: `${record.id}-text`, type: 'text', text: record.output_text, prompt: record.prompt, createdAt: record.created_at });
        (record.output_urls || []).forEach((url, index) => items.push({ id: `${record.id}-${index}`, usageId: record.id, url, type: record.action === 'video_generation' ? 'video' : (record.action === 'gif_generation' ? 'gif' : 'image'), prompt: record.prompt, createdAt: record.created_at }));
      });
      return items;
    },
    favoriteAssetItems() {
      return this.favorites.map(item => ({ id: item.id, url: item.asset_url, type: item.media_type, prompt: item.prompt, createdAt: item.created_at }));
    },
    displayedAssetItems() {
      const items = this.page === 'favorites' ? this.favoriteAssetItems : this.workAssetItems;
      return this.assetFilter === 'all' ? items : items.filter(item => item.type === this.assetFilter);
    },
  },
  async mounted() {
    localStorage.setItem('lingjing-anonymous-id', this.anonymousId); this.trackEvent('page_view', { page: this.page }); if (this.onboardingOpen) this.trackEvent('onboarding_view'); this.loadSiteAnnouncement()
    this.loadDesignDraft()
    if (!supabaseConfigured) { this.authReady = true; return }
    const { data } = await supabase.auth.getSession()
    this.session = data.session
    if (this.session) { await this.loadProfile(); await this.loadFavorites().catch(error => { this.assetError = error.message; }); }
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.passwordRecovery = true
      this.session = session
      this.profile = null
      if (session) { this.authOpen = false; await this.loadProfile(); await this.loadFavorites().catch(error => { this.assetError = error.message; }); }
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
    async loadSiteAnnouncement() { try { const response = await fetch('/api/site-announcement'); const data = await response.json(); const item = data.announcement; if (item && localStorage.getItem('lingjing-dismissed-announcement') !== item.updated_at) this.$set(this.$data, 'siteAnnouncement', item) } catch (_error) {} },
    dismissAnnouncement() { if (this.$data.siteAnnouncement?.updated_at) localStorage.setItem('lingjing-dismissed-announcement', this.$data.siteAnnouncement.updated_at); this.$delete(this.$data, 'siteAnnouncement') },
    trackEvent(eventType, metadata = {}) { fetch('/api/events', { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ eventType, anonymousId: this.anonymousId, metadata }) }).catch(() => {}) },
    closeOnboarding() { if (this.hideOnboarding) localStorage.setItem('lingjing-onboarding-hidden', '1'); this.onboardingOpen = false },
    startOnboarding(page) { this.trackEvent('onboarding_start', { page }); this.page = page; if (page === 'copy') this.applyCopyTemplate(this.copyTemplates[0]); else if (page === 'image') this.applyImageTemplate(this.imageTemplates[0]); else { this.videoMode = 'image'; this.prompt = '让商品保持外观一致，镜头缓慢推进，光影轻微流动，动作自然稳定'; } this.closeOnboarding(); this.menuOpen = false },
    applyCopyTemplate(item) { this.trackEvent('template_select', { type: 'copy', name: item.name }); this.copyProduct = item.product; this.copyFeatures = item.features; this.copyPlatform = item.platform; this.copyStyle = item.style },
    applyImageTemplate(item) { this.trackEvent('template_select', { type: 'image', name: item.name }); this.prompt = item.prompt; this.ratio = item.ratio; this.page = 'image' },
    requestLogin(message = '请先登录后继续') {
      this.trackEvent('login_prompt', { page: this.page })
      this.errorMessage = message
      this.authOpen = true
      return false
    },
    openLegal(tab = 'terms') { this.legalTab = tab; this.legalOpen = true; },
    async closeAuthModal() { if (this.passwordRecovery && supabase) await supabase.auth.signOut(); this.passwordRecovery = false; this.authOpen = false; },
    finishPasswordRecovery() { this.passwordRecovery = false; this.authOpen = false; window.history.replaceState({}, document.title, window.location.pathname + window.location.search); },
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
    async loadFavorites() {
      if (!this.session) { this.favorites = []; return; }
      const response = await fetch('/api/favorites', { headers: this.authHeaders() }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || '读取收藏失败');
      this.favorites = data.favorites || [];
    },
    async openInvite() {
      if (!this.session) { this.requestLogin('请先登录后邀请好友'); return; }
      this.inviteOpen = true; this.inviteLoading = true;
      try { const response = await fetch('/api/referrals/me', { headers: this.authHeaders() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取邀请信息失败'); this.inviteData = data; }
      catch (error) { this.errorMessage = error.message; }
      finally { this.inviteLoading = false; }
    },
    async copyInviteLink() {
      const link = `${window.location.origin}/?ref=${encodeURIComponent(this.inviteData.code || '')}`; await navigator.clipboard.writeText(link); this.inviteCopied = true; setTimeout(() => { this.inviteCopied = false; }, 1500);
    },
    referralStatus(status) { return ({ pending: '待新用户首次充值', rewarded: '奖励已发放', budget_limited: '已达预算上限', disabled: '活动已关闭', rejected: '未通过风控' })[status] || status; },
    async loadAssetPage(page) {
      if (!this.session) { this.requestLogin('请先登录后查看个人资产'); return; }
      this.assetLoading = true; this.assetError = '';
      try {
        if (page === 'works') {
          const response = await fetch('/api/usage', { headers: this.authHeaders() }); const data = await response.json();
          if (!response.ok) throw new Error(data.error || '读取作品失败'); this.historyRecords = data.records || [];
        } else await this.loadFavorites();
      } catch (error) { this.assetError = error.message; }
      finally { this.assetLoading = false; }
    },
    async openRecharge() {
      if (!this.session) { this.requestLogin('请先登录后再充值'); return; }
      this.trackEvent('recharge_open', { credits: this.credits })
      this.rechargeOpen = true; this.rechargeMessage = ''; this.rechargeError = false;
      try {
        const [configResponse, ordersResponse, transactionsResponse] = await Promise.all([
          fetch('/api/billing/config'), fetch('/api/billing/orders', { headers: this.authHeaders() }), fetch('/api/billing/transactions', { headers: this.authHeaders() })
        ]);
        const config = await configResponse.json(); const orders = await ordersResponse.json(); const transactions = await transactionsResponse.json();
        if (!configResponse.ok) throw new Error(config.error || '无法读取充值套餐');
        if (!ordersResponse.ok) throw new Error(orders.error || '无法读取充值订单');
        if (!transactionsResponse.ok) throw new Error(transactions.error || '无法读取算力流水');
        this.billing = config; this.packages = config.packages || []; this.rechargeOrders = orders.orders || [];
        this.creditTransactions = transactions.transactions || [];
        if (!this.packages.some(item => item.id === this.selectedPackage)) this.selectedPackage = this.packages[0]?.id || '';
      } catch (error) { this.rechargeMessage = error.message; this.rechargeError = true; }
    },
    async createRechargeOrder() {
      if (this.rechargeLoading || !this.selectedPackage) return;
      if (!this.paymentReference.trim()) { this.rechargeMessage = '请填写付款单号或付款备注'; this.rechargeError = true; return; }
      if (!this.paymentProof) { this.rechargeMessage = '请上传付款截图'; this.rechargeError = true; return; }
      if (!this.refundAgreement) { this.rechargeMessage = '请先阅读并确认退款规则'; this.rechargeError = true; return; }
      this.rechargeLoading = true; this.rechargeMessage = ''; this.rechargeError = false;
      try {
        const body = new FormData(); body.append('packageId', this.selectedPackage); body.append('paymentReference', this.paymentReference); body.append('proof', this.paymentProof); body.append('acceptedTerms', 'true');
        const response = await fetch('/api/billing/orders', { method: 'POST', headers: this.authHeaders(), body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '充值订单提交失败');
        this.rechargeOrders.unshift(data.order); this.paymentReference = ''; this.paymentProof = null; this.refundAgreement = false; if (this.$refs.paymentProofInput) this.$refs.paymentProofInput.value = '';
        this.trackEvent('recharge_order', { package: data.order.package_id, amountFen: data.order.amount_fen })
        this.rechargeMessage = `订单 ${data.order.order_no} 已提交，请完成付款并等待管理员审核。`;
      } catch (error) { this.rechargeMessage = error.message; this.rechargeError = true; }
      finally { this.rechargeLoading = false; }
    },
    selectPaymentProof(event) { const file = event.target.files?.[0] || null; if (file && file.size > 5 * 1024 * 1024) { this.rechargeMessage = '付款截图不能超过 5MB'; this.rechargeError = true; event.target.value = ''; this.paymentProof = null; return; } this.paymentProof = file; },
    async requestRefund(order) {
      const reason = window.prompt('请填写退款原因（至少 5 个字）。系统将按当前未使用算力计算可退款金额：'); if (!reason) return;
      try { const response = await fetch(`/api/billing/orders/${order.id}/refund`, { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ reason }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '退款申请失败'); order.refund_requests = [data.refund, ...(order.refund_requests || [])]; this.rechargeMessage = `退款申请已提交，预计退款 ¥${(data.refund.requested_amount_fen / 100).toFixed(2)}，管理员确认实际退款后扣回 ${data.refund.requested_credits} 点算力。`; this.rechargeError = false; }
      catch (error) { this.rechargeMessage = error.message; this.rechargeError = true; }
    },
    orderStatus(status) { return ({ pending: '待审核', paid: '已到账', rejected: '未通过', cancelled: '已取消', partially_refunded: '部分退款', refunded: '已退款' })[status] || status; },
    async openHistory(onlyCopy = false) {
      if (!this.session) { this.requestLogin('请先登录后查看生成记录'); return; }
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
      link.download = `AI生成内容-lingjing-${record.action}-${new Date(record.created_at).getTime()}-${index + 1}`;
      link.target = '_blank'; link.click();
    },
    async copyHistoryText(record) {
      await navigator.clipboard.writeText(`【${record.ai_label || 'AI生成内容'}】\n${record.output_text || ''}`); this.copiedHistoryId = record.id;
      setTimeout(() => { if (this.copiedHistoryId === record.id) this.copiedHistoryId = ''; }, 1500);
    },
    async openSupport() {
      if (!this.session) { this.requestLogin('请先登录后联系人工客服'); return; }
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
      if (!this.session) { this.copyError = "请先登录后再生成"; this.requestLogin(this.copyError); return; }
      if (this.credits < 1) { this.copyError = "算力不足，请充值后再试"; await this.openRecharge(); return; }
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
        this.copyUsageId = data.usageId || '';
        this.trackEvent('generation_success', { type: 'copy' })
        if (typeof data.credits === 'number') this.profile = { ...this.profile, credits: data.credits };
      } catch (error) { this.copyError = error.message; await this.loadProfile().catch(() => {}); }
      finally { this.copyLoading = false; }
    },
    async copyCopyResult() {
      await navigator.clipboard.writeText(`【AI生成内容】\n${this.copyResult}`);
      this.copyCopied = true;
      setTimeout(() => { this.copyCopied = false; }, 1500);
    },
    async sendGenerationFeedback(usageId, helpful) {
      if (!usageId || !this.session) return;
      let reason = '';
      if (!helpful) reason = window.prompt('哪里不满意？可选填，例如：不符合商品、画面变形、文字质量差') || '';
      try {
        const response = await fetch(`/api/usage/${usageId}/feedback`, { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ helpful, reason }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '提交评价失败');
        this.$set(this.feedbackSelections, usageId, helpful);
      } catch (error) { this.errorMessage = error.message; }
    },
    async logout() { if (supabase) await supabase.auth.signOut() },
    go(p) {
      if (!this.session && ['works', 'favorites'].includes(p)) { this.requestLogin('请先登录后查看个人资产'); return; }
      this.page = p;
      const pageName = this.pages[p]?.[0] || '灵境 AI';
      document.title = p === 'home' ? '灵境 AI｜电商文案、商品图、GIF 与视频生成' : `${pageName}｜灵境 AI`;
      const description = document.querySelector('meta[name="description"]');
      if (description) description.content = this.pages[p]?.[1] || '灵境 AI 一站式电商 AI 内容创作平台';
      this.mode = 'text';
      this.menuOpen = false;
      if (p === 'canvas') this.$nextTick(this.drawDesignCanvas);
      if (['works', 'favorites'].includes(p)) { this.assetFilter = 'all'; this.loadAssetPage(p); }
      if (p === 'community') this.loadCommunity();
    },
    selectDesignPreset(preset) {
      this.designPreset = preset.id;
      this.designWidth = preset.width;
      this.designHeight = preset.height;
      this.$nextTick(this.drawDesignCanvas);
    },
    loadDesignImage(source) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片读取失败，请更换图片后重试'));
        image.src = source;
      });
    },
    async uploadDesignProduct(event) {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { this.designMessage = '商品图片不能超过 8MB'; this.designError = true; return; }
      try {
        const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        this.designProductImage = await this.loadDesignImage(source);
        this.designProductSource = source;
        this.designImageX = 0.5; this.designImageY = 0.59; this.designImageScale = 0.62;
        this.designMessage = ''; this.designError = false; this.drawDesignCanvas();
      } catch (error) { this.designMessage = error.message || '商品图片读取失败'; this.designError = true; }
    },
    removeDesignProduct() {
      this.designProductImage = null; this.designProductSource = ''; this.designImageRect = null; this.drawDesignCanvas();
    },
    clearDesignBackground() {
      this.designBackgroundImage = null; this.designBackgroundSource = ''; this.drawDesignCanvas();
    },
    drawCover(ctx, image, width, height) {
      const scale = Math.max(width / image.width, height / image.height);
      const w = image.width * scale; const h = image.height * scale;
      ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    },
    drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
      const chars = Array.from(text || ''); let line = ''; let lineIndex = 0; let widest = 0;
      for (let index = 0; index < chars.length; index += 1) {
        const test = line + chars[index];
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, y + lineIndex * lineHeight); widest = Math.max(widest, ctx.measureText(line).width); line = chars[index]; lineIndex += 1;
          if (lineIndex >= maxLines) break;
        } else line = test;
      }
      if (line && lineIndex < maxLines) { ctx.fillText(line, x, y + lineIndex * lineHeight); widest = Math.max(widest, ctx.measureText(line).width); lineIndex += 1; }
      return { width: Math.min(maxWidth, widest), height: Math.max(lineHeight, lineIndex * lineHeight) };
    },
    drawDesignCanvas() {
      const canvas = this.$refs.designCanvas; if (!canvas) return;
      const ctx = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height;
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = this.designBackgroundColor; ctx.fillRect(0, 0, w, h);
      if (this.designBackgroundImage) this.drawCover(ctx, this.designBackgroundImage, w, h);
      const shade = ctx.createLinearGradient(0, 0, 0, h * 0.5); shade.addColorStop(0, 'rgba(255,255,255,.72)'); shade.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h * 0.55);
      if (this.designProductImage) {
        const image = this.designProductImage; const maxW = w * this.designImageScale; const maxH = h * this.designImageScale;
        const scale = Math.min(maxW / image.width, maxH / image.height); const imageW = image.width * scale; const imageH = image.height * scale;
        const x = this.designImageX * w - imageW / 2; const y = this.designImageY * h - imageH / 2;
        ctx.shadowColor = 'rgba(20,20,30,.22)'; ctx.shadowBlur = Math.round(w * 0.025); ctx.shadowOffsetY = Math.round(w * 0.012); ctx.drawImage(image, x, y, imageW, imageH); ctx.shadowColor = 'transparent';
        this.designImageRect = { x, y, width: imageW, height: imageH };
      } else this.designImageRect = null;
      ctx.textBaseline = 'top'; ctx.fillStyle = this.designTextColor;
      const titleX = this.designTitleX * w; const titleY = this.designTitleY * h;
      ctx.font = `800 ${Math.round(w * 0.075)}px system-ui, sans-serif`; const titleSize = this.drawWrappedText(ctx, this.designTitle, titleX, titleY, w * 0.87, w * 0.087, 2);
      ctx.fillStyle = '#ff3d57'; const priceX = this.designPriceX * w; const priceY = this.designPriceY * h; ctx.font = `900 ${Math.round(w * 0.065)}px system-ui, sans-serif`; ctx.fillText(this.designPrice, priceX, priceY); const priceSize = { width: ctx.measureText(this.designPrice || ' ').width, height: w * 0.078 };
      ctx.fillStyle = this.designTextColor; ctx.globalAlpha = 0.78; const sellingX = this.designSellingPointX * w; const sellingY = this.designSellingPointY * h; ctx.font = `600 ${Math.round(w * 0.03)}px system-ui, sans-serif`; const sellingSize = this.drawWrappedText(ctx, this.designSellingPoint, sellingX, sellingY, w * 0.87, w * 0.043, 2); ctx.globalAlpha = 1;
      this.designTextRects = {
        title: { x: titleX, y: titleY, width: Math.max(titleSize.width, w * 0.12), height: titleSize.height },
        price: { x: priceX, y: priceY, width: Math.max(priceSize.width, w * 0.1), height: priceSize.height },
        sellingPoint: { x: sellingX, y: sellingY, width: Math.max(sellingSize.width, w * 0.15), height: sellingSize.height }
      };
      const selectedRect = this.designActiveElement === 'product' ? this.designImageRect : this.designTextRects[this.designActiveElement];
      if (selectedRect) { ctx.save(); ctx.strokeStyle = '#7656ff'; ctx.lineWidth = Math.max(2, w * 0.003); ctx.setLineDash([w * 0.012, w * 0.008]); ctx.strokeRect(selectedRect.x - 8, selectedRect.y - 8, selectedRect.width + 16, selectedRect.height + 16); ctx.restore(); }
    },
    designPointer(event) {
      const canvas = this.$refs.designCanvas; const rect = canvas.getBoundingClientRect(); const point = event.touches?.[0] || event.changedTouches?.[0] || event;
      return { x: (point.clientX - rect.left) * canvas.width / rect.width, y: (point.clientY - rect.top) * canvas.height / rect.height };
    },
    startDesignDrag(event) {
      const point = this.designPointer(event); const hit = rect => rect && point.x >= rect.x - 10 && point.x <= rect.x + rect.width + 10 && point.y >= rect.y - 10 && point.y <= rect.y + rect.height + 10;
      this.designActiveElement = ['sellingPoint', 'price', 'title'].find(name => hit(this.designTextRects[name])) || (hit(this.designImageRect) ? 'product' : '');
      const activeRect = this.designActiveElement === 'product' ? this.designImageRect : this.designTextRects[this.designActiveElement];
      if (activeRect) this.designDragOffset = { x: point.x - activeRect.x, y: point.y - activeRect.y };
      this.designDragging = Boolean(this.designActiveElement); this.drawDesignCanvas();
    },
    moveDesignDrag(event) {
      if (!this.designDragging) return; const point = this.designPointer(event);
      const rect = this.designActiveElement === 'product' ? this.designImageRect : this.designTextRects[this.designActiveElement];
      const left = point.x - this.designDragOffset.x; const top = point.y - this.designDragOffset.y;
      const x = Math.max(0.01, Math.min(0.98, left / this.designWidth)); const y = Math.max(0.01, Math.min(0.98, top / this.designHeight));
      if (this.designActiveElement === 'product') { this.designImageX = Math.max(0, Math.min(1, (left + rect.width / 2) / this.designWidth)); this.designImageY = Math.max(0, Math.min(1, (top + rect.height / 2) / this.designHeight)); }
      if (this.designActiveElement === 'title') { this.designTitleX = x; this.designTitleY = y; }
      if (this.designActiveElement === 'price') { this.designPriceX = x; this.designPriceY = y; }
      if (this.designActiveElement === 'sellingPoint') { this.designSellingPointX = x; this.designSellingPointY = y; }
      this.drawDesignCanvas();
    },
    endDesignDrag() { this.designDragging = false; },
    async generateDesignBackground() {
      if (this.designBgLoading) return;
      if (!this.session) { this.requestLogin('请先登录后生成 AI 商品背景'); return; }
      if (!this.designBackgroundPrompt.trim()) { this.designMessage = '请先描述想要的商品背景'; this.designError = true; return; }
      if (this.credits < 2) { this.designMessage = '算力不足，生成背景需要 2 点算力'; this.designError = true; await this.openRecharge(); return; }
      this.designBgLoading = true; this.designMessage = ''; this.designError = false;
      try {
        const ratio = this.designWidth > this.designHeight ? '16:9' : (this.designWidth < this.designHeight ? '3:4' : '1:1');
        const response = await fetch('/api/images/generate', { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prompt: `${this.designBackgroundPrompt.trim()}。纯净电商摄影背景，预留商品摆放空间，不出现商品、人物、文字、标志和水印`, ratio, count: 1 }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'AI 背景生成失败');
        this.designBackgroundSource = data.images?.[0] || ''; this.designBackgroundImage = await this.loadDesignImage(this.designBackgroundSource);
        if (typeof data.credits === 'number') this.profile = { ...this.profile, credits: data.credits };
        this.designMessage = 'AI 背景已生成并应用'; this.drawDesignCanvas();
      } catch (error) { this.designMessage = error.message; this.designError = true; }
      finally { this.designBgLoading = false; }
    },
    saveDesignDraft() {
      try {
        localStorage.setItem('lingjing-design-draft', JSON.stringify({ preset: this.designPreset, width: this.designWidth, height: this.designHeight, title: this.designTitle, price: this.designPrice, sellingPoint: this.designSellingPoint, textColor: this.designTextColor, backgroundColor: this.designBackgroundColor, backgroundPrompt: this.designBackgroundPrompt, productSource: this.designProductSource, backgroundSource: this.designBackgroundSource, imageScale: this.designImageScale, imageX: this.designImageX, imageY: this.designImageY, titleX: this.designTitleX, titleY: this.designTitleY, priceX: this.designPriceX, priceY: this.designPriceY, sellingPointX: this.designSellingPointX, sellingPointY: this.designSellingPointY }));
        this.designMessage = '草稿已保存在当前浏览器'; this.designError = false;
      } catch (_error) { this.designMessage = '商品图较大，浏览器空间不足，请先导出成品'; this.designError = true; }
    },
    async loadDesignDraft() {
      try {
        const draft = JSON.parse(localStorage.getItem('lingjing-design-draft') || 'null'); if (!draft) return;
        this.designPreset = draft.preset || 'taobao'; this.designWidth = draft.width || 800; this.designHeight = draft.height || 800; this.designTitle = draft.title || ''; this.designPrice = draft.price || ''; this.designSellingPoint = draft.sellingPoint || ''; this.designTextColor = draft.textColor || '#171821'; this.designBackgroundColor = draft.backgroundColor || '#f4efe8'; this.designBackgroundPrompt = draft.backgroundPrompt || ''; this.designImageScale = draft.imageScale || 0.62; this.designImageX = draft.imageX ?? 0.5; this.designImageY = draft.imageY ?? 0.59; this.designTitleX = draft.titleX ?? 0.065; this.designTitleY = draft.titleY ?? 0.07; this.designPriceX = draft.priceX ?? 0.065; this.designPriceY = draft.priceY ?? 0.245; this.designSellingPointX = draft.sellingPointX ?? 0.065; this.designSellingPointY = draft.sellingPointY ?? 0.335;
        if (draft.productSource) { this.designProductSource = draft.productSource; this.designProductImage = await this.loadDesignImage(draft.productSource); }
        if (draft.backgroundSource) { this.designBackgroundSource = draft.backgroundSource; this.designBackgroundImage = await this.loadDesignImage(draft.backgroundSource); }
      } catch (_error) { localStorage.removeItem('lingjing-design-draft'); }
    },
    resetDesign() {
      if (!window.confirm('确定清空当前画布吗？')) return;
      this.designTitle = ''; this.designPrice = ''; this.designSellingPoint = ''; this.designTitleX = 0.065; this.designTitleY = 0.07; this.designPriceX = 0.065; this.designPriceY = 0.245; this.designSellingPointX = 0.065; this.designSellingPointY = 0.335; this.designActiveElement = ''; this.designProductImage = null; this.designProductSource = ''; this.designBackgroundImage = null; this.designBackgroundSource = ''; this.designBackgroundColor = '#f4efe8'; this.designMessage = ''; localStorage.removeItem('lingjing-design-draft'); this.drawDesignCanvas();
    },
    exportDesign() {
      const canvas = this.$refs.designCanvas; if (!canvas) return;
      try { this.designActiveElement = ''; this.drawDesignCanvas(); const link = document.createElement('a'); link.download = `lingjing-design-${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click(); this.designMessage = 'PNG 已导出'; this.designError = false; }
      catch (_error) { this.designMessage = '背景图片暂不允许跨域导出，请重新生成或使用纯色背景'; this.designError = true; }
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
    async enhance() {
      if (this.enhanceLoading) return;
      if (!this.session) { this.requestLogin("请先登录后再使用 AI 润色"); return; }
      const prompt = this.prompt.trim();
      if (!prompt) { this.errorMessage = "请先输入需要润色的画面描述"; return; }
      this.enhanceLoading = true;
      this.errorMessage = "";
      try {
        const response = await fetch('/api/prompt/enhance', {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'AI 润色失败');
        this.prompt = data.prompt;
        if (typeof data.credits === 'number') this.profile = { ...this.profile, credits: data.credits };
      } catch (error) {
        this.errorMessage = error.message;
      } finally {
        this.enhanceLoading = false;
      }
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
    async loadCommunity() {
      this.communityLoading = true; this.communityError = '';
      try { const response = await fetch(`/api/community/posts?category=${encodeURIComponent(this.communityCategory)}&sort=${this.communitySort}`, { headers: this.authHeaders() }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取灵感广场失败'); this.communityPosts = data.posts || [] }
      catch (error) { this.communityError = error.message }
      finally { this.communityLoading = false }
    },
    async publishToCommunity(item) {
      const title = window.prompt('请填写作品标题：', (item.prompt || '我的电商创意作品').slice(0,40)); if (!title) return
      const category = window.prompt('请选择分类：美妆、服装、食品、家居、数码、其他', '其他') || '其他'
      const visibilityInput = window.prompt('提示词公开方式：输入 1 完全公开，2 仅生成同款可用，3 不公开', '1'); const promptVisibility = visibilityInput === '2' ? 'remix_only' : (visibilityInput === '3' ? 'hidden' : 'full')
      if (!window.confirm('发布后所有用户都能看到该作品。确认你拥有素材使用权且内容不包含隐私信息吗？')) return
      try { const response = await fetch('/api/community/posts', { method: 'POST', headers: this.authHeaders({ 'Content-Type':'application/json' }), body: JSON.stringify({ usageId:item.usageId, assetUrl:item.url, mediaType:item.type, title, category, promptVisibility }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '发布失败'); window.alert(data.message) }
      catch (error) { this.assetError = error.message }
    },
    async favoriteCommunityPost(post) {
      if (!this.session) { this.requestLogin('请先登录后收藏社区作品'); return }
      try { const response = await fetch(`/api/community/posts/${post.id}/favorite`, { method:'POST', headers:this.authHeaders() }); const data=await response.json(); if(!response.ok) throw new Error(data.error || '收藏失败'); post.favorited=data.favorited; post.favorite_count=data.favoriteCount }
      catch(error){ this.communityError=error.message }
    },
    async remixCommunityPost(post) {
      if (!this.session) { this.requestLogin('请先登录后生成同款'); return }
      try { const response=await fetch(`/api/community/posts/${post.id}/remix`,{method:'POST',headers:this.authHeaders()}); const data=await response.json(); if(!response.ok) throw new Error(data.error || '读取同款参数失败'); if(!data.prompt){ window.alert('作者未公开提示词，你可以参考画面自行描述。'); return } this.prompt=data.prompt; this.go(data.mediaType === 'video' ? 'video' : 'image') }
      catch(error){ this.communityError=error.message }
    },
    async reportCommunityPost(post) {
      if (!this.session) { this.requestLogin('请先登录后举报'); return } const reason=window.prompt('请填写举报原因：'); if(!reason) return
      try { const response=await fetch(`/api/community/posts/${post.id}/report`,{method:'POST',headers:this.authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({reason})}); const data=await response.json(); if(!response.ok) throw new Error(data.error || '举报失败'); window.alert(data.message) }
      catch(error){ this.communityError=error.message }
    },
    isFavorite(url) { return this.favorites.some(item => item.asset_url === url); },
    async toggleFavorite(assetUrl, mediaType = 'image', prompt = '') {
      if (!this.session) { this.requestLogin('请先登录后收藏作品'); return; }
      try {
        const response = await fetch('/api/favorites/toggle', { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ assetUrl, mediaType, prompt }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || '收藏操作失败');
        if (data.favorited) this.favorites = [data.favorite, ...this.favorites.filter(item => item.asset_url !== assetUrl)];
        else this.favorites = this.favorites.filter(item => item.asset_url !== assetUrl);
      } catch (error) { this.errorMessage = error.message; }
    },
    assetTypeName(type) { return ({ image: '图片', gif: 'GIF 动图', video: '视频', text: '电商文案' })[type] || '作品'; },
    async copyAssetText(item) {
      await navigator.clipboard.writeText(item.text || ''); this.copiedAssetId = item.id;
      setTimeout(() => { if (this.copiedAssetId === item.id) this.copiedAssetId = ''; }, 1500);
    },
    downloadAsset(item, index) {
      const link = document.createElement('a'); link.href = item.url; link.target = '_blank';
      link.download = `AI生成内容-lingjing-${item.type}-${Date.now()}-${index + 1}.${item.type === 'video' ? 'mp4' : (item.type === 'gif' ? 'gif' : 'png')}`; link.click();
    },
    download(image, index) {
      const link = document.createElement("a");
      link.href = image;
      const extension = this.resultType === 'video' ? 'mp4' : (this.resultType === 'gif' ? 'gif' : 'png');
      link.download = `AI生成内容-lingjing-${Date.now()}-${index + 1}.${extension}`;
      link.click();
    },
    async generate() {
      if (this.loading) return;
      if (!this.session) { this.requestLogin("请先登录后再生成"); return; }
      if (this.credits < this.requiredCredits) { this.errorMessage = `算力不足，本次需要 ${this.requiredCredits} 点`; await this.openRecharge(); return; }
      if (!this.prompt.trim()) { this.errorMessage = "请输入画面描述"; return; }
      if (this.page === "video" && this.videoMode === 'image' && !this.uploadFile) { this.errorMessage = "请先上传一张静态图片"; return; }
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
        this.currentUsageId = data.usageId || '';
        this.trackEvent('generation_success', { type: this.page === 'video' ? (this.videoMode === 'image' ? 'gif' : 'video') : (this.referenceImages.length ? 'image_edit' : 'image') })
        this.resultType = this.page === 'video'
          ? (this.videoMode === 'image' ? 'gif' : 'video')
          : 'image';
        if (typeof data.credits === 'number') this.profile = { ...this.profile, credits: data.credits };
        this.state = "done";
      } catch (error) {
        this.errorMessage = error.message;
        await this.loadProfile().catch(() => {});
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
.copy-output-wrap{position:relative;flex:1;min-height:0}.copy-output-wrap .copy-output{height:calc(100% - 15px);padding-top:46px}.ai-content-label{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#f0ecff;color:#6847e8;font-size:10px;font-weight:700;line-height:1.2}.copy-output-wrap>.ai-content-label{position:absolute;z-index:2;left:14px;top:29px}.media-label{position:absolute;z-index:3;left:8px;top:8px;background:#171820c9;color:#fff;backdrop-filter:blur(5px)}
.usage-warning,.result-usage-tip,.asset-usage-tip{color:#8a6415;background:#fff9e8;border:1px solid #f2dfab;border-radius:9px;font-size:10px;line-height:1.65}.usage-warning{margin:10px 0 0;padding:9px 11px}.result-usage-tip{margin:0 0 12px;padding:8px 11px}.asset-usage-tip{margin:0 0 14px;padding:9px 12px}
.low-credit-banner{margin:10px 22px 0;padding:9px 13px;border:1px solid #f0d18b;border-radius:10px;background:#fff9e8;color:#775718;display:flex;align-items:center;justify-content:space-between;font-size:11px}.low-credit-banner button{height:30px;padding:0 10px;border:0;border-radius:7px;background:#7657ff;color:#fff;cursor:pointer}.starter-templates{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:12px 0}.starter-templates>span{color:#858993;font-size:10px}.starter-templates button{height:28px;padding:0 9px;border:1px solid #ded8ff;border-radius:8px;background:#f8f6ff;color:#6847e8;font-size:10px;cursor:pointer}.prompt-templates{margin:8px 0 0}.onboarding-overlay{position:fixed;inset:0;z-index:150;background:#11131aa8;display:grid;place-items:center;padding:18px}.onboarding-modal{width:min(760px,100%);max-height:92vh;overflow:auto;padding:26px;border-radius:22px;background:#fff;box-shadow:0 30px 100px #1118}.onboarding-modal>header{display:flex;justify-content:space-between}.onboarding-modal>header>div>span{width:40px;height:40px;border-radius:12px;background:linear-gradient(145deg,#6847ff,#9e75ff);color:#fff;display:grid;place-items:center}.onboarding-modal h2{margin:13px 0 5px}.onboarding-modal header p{margin:0;color:#858993;font-size:11px}.onboarding-modal header button{align-self:flex-start;border:0;background:none;font-size:27px;cursor:pointer}.onboarding-steps{margin:20px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.onboarding-steps article{padding:14px;border:1px solid #ececf1;border-radius:12px;display:flex;gap:10px}.onboarding-steps article>b{flex:0 0 27px;height:27px;border-radius:50%;background:#ede8ff;color:#6847e8;display:grid;place-items:center}.onboarding-steps h3{margin:3px 0 6px;font-size:12px}.onboarding-steps p{margin:0;color:#797d87;font-size:9px;line-height:1.65}.onboarding-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.onboarding-choices button{padding:16px;border:1px solid #e4e2ec;border-radius:13px;background:#fff;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer}.onboarding-choices button:hover{border-color:#8368ff;background:#faf9ff}.onboarding-choices span{width:36px;height:36px;border-radius:10px;background:#ede8ff;color:#6847e8;display:grid;place-items:center;font-weight:800}.onboarding-choices small{color:#90939b}.onboarding-modal>label{display:block;margin-top:15px;color:#858993;font-size:10px}@media(max-width:650px){.onboarding-steps,.onboarding-choices{grid-template-columns:1fr}.low-credit-banner{margin:8px 10px 0}.onboarding-modal{padding:18px}}
.recharge-overlay{position:fixed;inset:0;z-index:100;background:#11131a99;display:grid;place-items:center;padding:20px}.recharge-modal{width:min(820px,100%);max-height:92vh;overflow:auto;padding:25px;border-radius:20px;background:#fff;box-shadow:0 30px 90px #1117}.recharge-modal>header{display:flex;justify-content:space-between;align-items:flex-start}.recharge-modal h2{margin:0 0 6px}.recharge-modal header p{margin:0;color:#858993;font-size:12px}.recharge-modal header button{border:0;background:transparent;font-size:26px;cursor:pointer}.package-grid{margin:22px 0;display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.package-grid button{position:relative;min-height:142px;padding:17px 8px 12px;border:1px solid #e9eaf0;border-radius:13px;background:#fff;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer}.package-grid button.selected{border:2px solid #7657ff;background:#f8f6ff}.package-grid button>em{position:absolute;top:-9px;padding:3px 9px;border-radius:10px;background:#7657ff;color:#fff;font-size:9px;font-style:normal}.package-grid strong{font-size:22px}.package-grid span{color:#7657ff;font-size:12px}.package-grid small{color:#999;font-size:9px}.payment-box{padding:20px;border-radius:13px;background:#f7f7fa;display:flex;gap:24px;align-items:center}.payment-qr-link{flex:0 0 240px;display:flex;flex-direction:column;align-items:center;gap:7px;color:#7657ff;text-decoration:none;font-size:11px}.payment-qr-link img{width:240px;height:240px;padding:6px;object-fit:contain;background:#fff;border-radius:10px;box-shadow:0 4px 16px #2221}.payment-qr-link small{font-size:10px}.payment-box>div{flex:1}.payment-box p{margin:7px 0;color:#777b85;font-size:11px}.payment-box input{width:100%;height:38px;padding:0 11px;border:1px solid #dddfe6;border-radius:9px;background:#fff}.recharge-success{color:#17894c;font-size:12px}.order-list{margin-top:20px}.order-list h3{font-size:13px}.order-list>div{padding:9px 0;border-top:1px solid #eee;display:grid;grid-template-columns:1fr auto 60px;gap:10px;font-size:10px}.order-list em{text-align:right;font-style:normal}.order-list em.paid{color:#17894c}.order-list em.pending{color:#d38316}.order-list em.rejected{color:#d33}@media(max-width:700px){.package-grid{grid-template-columns:repeat(2,1fr)}.payment-box{align-items:stretch;flex-direction:column}.payment-qr-link{flex-basis:auto;align-self:center}.payment-qr-link img{width:min(280px,75vw);height:min(280px,75vw)}.order-list>div{grid-template-columns:1fr}.order-list em{text-align:left}}
.history-modal{width:min(820px,100%);max-height:90vh;overflow:auto;padding:24px;border-radius:20px;background:#fff;box-shadow:0 30px 90px #1117}.history-modal>header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:1px solid #eee}.history-modal h2{margin:0 0 6px}.history-modal header p{margin:0;color:#858993;font-size:12px}.history-modal header button{border:0;background:transparent;font-size:26px;cursor:pointer}.history-list article{padding:15px 0;border-bottom:1px solid #f0f1f4;display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center}.history-icon{width:42px;height:42px;border-radius:11px;background:#f0ecff;color:#7657ff;display:grid;place-items:center;font-weight:700}.history-info{min-width:0}.history-info>div{display:flex;align-items:center;gap:8px}.history-info em{padding:2px 7px;border-radius:8px;background:#fff3dc;color:#b36b00;font-size:9px;font-style:normal}.history-info em.completed{background:#eaf8ef;color:#17894c}.history-info em.failed{background:#fff0f0;color:#c44}.history-info p{margin:6px 0;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.history-info small{color:#999;font-size:9px}.history-list article>strong{color:#7657ff;font-size:12px}.history-assets{grid-column:2/-1;display:grid;grid-template-columns:repeat(4,minmax(90px,1fr));gap:8px}.history-asset{position:relative;aspect-ratio:1;overflow:hidden;border-radius:10px;background:#17181d}.history-asset img,.history-asset video{width:100%;height:100%;object-fit:cover}.history-asset button{position:absolute;right:6px;bottom:6px;height:27px;padding:0 9px;border:0;border-radius:7px;background:#15161dcc;color:#fff;font-size:9px;cursor:pointer}.history-no-asset{grid-column:2/-1;margin:0;padding:10px;border-radius:8px;background:#f7f7f9;color:#999;font-size:10px}.history-loading,.history-empty{padding:70px 20px;text-align:center;color:#999;font-size:12px}@media(max-width:560px){.history-list article{grid-template-columns:36px 1fr}.history-icon{width:36px;height:36px}.history-list article>strong{grid-column:2}.history-assets{grid-column:1/-1;grid-template-columns:repeat(2,1fr)}.history-no-asset{grid-column:1/-1}}
.history-copy-output{grid-column:2/-1;position:relative;padding:14px;border-radius:10px;background:#faf9ff;border:1px solid #eeebfa}.history-copy-output pre{max-height:240px;margin:0;padding-right:80px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11px/1.75 "PingFang SC","Microsoft YaHei",sans-serif}.history-copy-output button{position:absolute;right:10px;top:10px;height:28px;padding:0 10px;border:0;border-radius:7px;background:#7657ff;color:#fff;font-size:9px;cursor:pointer}@media(max-width:560px){.history-copy-output{grid-column:1/-1}.history-copy-output pre{padding-right:0;padding-top:35px}}
.support-modal{width:min(640px,100%);height:min(720px,90vh);padding:22px;border-radius:20px;background:#fff;box-shadow:0 30px 90px #1117;display:flex;flex-direction:column}.support-modal>header{display:flex;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid #eee}.support-modal h2{margin:0 0 5px}.support-modal header p{margin:0;color:#858993;font-size:11px}.support-modal header button{border:0;background:transparent;font-size:26px;cursor:pointer}.support-messages{flex:1;overflow:auto;padding:18px 4px;display:flex;flex-direction:column;gap:12px}.support-welcome{margin:auto;text-align:center;color:#777}.support-welcome p{font-size:11px}.support-messages article{display:flex}.support-messages article.user{justify-content:flex-end}.support-messages article>div{max-width:78%;padding:10px 12px;border-radius:12px;background:#f1f2f5}.support-messages article.user>div{background:#7657ff;color:#fff}.support-messages article b{font-size:10px}.support-messages article p{margin:5px 0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.55}.support-messages article small{font-size:8px;opacity:.65}.support-composer{padding-top:12px;border-top:1px solid #eee;display:flex;gap:9px}.support-composer textarea{flex:1;height:72px;padding:10px;border:1px solid #dfe1e7;border-radius:10px;resize:none;font:12px/1.5 inherit}.support-composer button{width:78px;border:0;border-radius:10px;background:#7657ff;color:#fff;cursor:pointer}.support-composer button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:900px){.copywriter-view{grid-template-columns:1fr;height:auto}.copy-result-card{min-height:520px}}@media(max-width:560px){.copywriter-view{padding:10px}.copy-form-card,.copy-result-card{padding:16px}.copy-grid{grid-template-columns:1fr}}
</style>
