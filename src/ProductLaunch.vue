<template>
  <section class="listing-kit-view">
    <div class="listing-kit-hero">
      <div><span>AI LISTING KIT</span><h2>一个商品链接，生成整套上架素材</h2><p>先核对商品事实，再生成主图、详情页结构、标题与卖点，避免 AI 凭空编造参数。</p></div>
      <div class="listing-kit-promise"><b>约 5 分钟</b><small>3 张主图 · 详情页 · 标题 · 卖点</small></div>
    </div>

    <div class="listing-kit-layout">
      <aside class="listing-kit-form">
        <div class="kit-steps"><span v-for="(item,index) in steps" :key="item" :class="{ active: step >= index + 1, current: step === index + 1 }"><i>{{ index + 1 }}</i>{{ item }}</span></div>

        <template v-if="step === 1">
          <label class="kit-field"><b>商品链接</b><div class="kit-url-row"><input v-model.trim="productUrl" placeholder="粘贴淘宝、天猫、京东、拼多多等公开商品链接" @keyup.enter="analyze" /><button :disabled="analyzing" @click="analyze">{{ analyzing ? '解析中…' : '解析商品' }}</button></div><small>只读取公开商品信息；解析失败也可以手动填写，不影响继续生成。</small></label>
          <div class="kit-platforms"><b>准备上架到</b><div><button v-for="item in platforms" :key="item" :class="{ active: platform === item }" @click="platform = item">{{ item }}</button></div></div>
          <div class="kit-safe-note">不会登录你的电商账号，也不会自动发布商品。生成内容需由你确认后再使用。</div>
        </template>

        <template v-else-if="step === 2">
          <div class="kit-review-title"><div><b>确认商品事实</b><small>带 * 的内容会成为生成依据</small></div><button @click="step = 1">修改链接</button></div>
          <label class="kit-field"><b>商品名称 *</b><input v-model.trim="facts.name" maxlength="120" placeholder="请输入准确商品名称" /></label>
          <div class="kit-two-cols"><label class="kit-field"><b>品牌</b><input v-model.trim="facts.brand" maxlength="60" placeholder="无品牌可留空" /></label><label class="kit-field"><b>类目</b><input v-model.trim="facts.category" maxlength="60" placeholder="例如：男装 / 休闲裤" /></label></div>
          <label class="kit-field"><b>规格与材质</b><input v-model.trim="facts.specs" maxlength="240" placeholder="只填写能够确认的规格、材质、颜色" /></label>
          <label class="kit-field"><b>核心卖点 *</b><textarea v-model.trim="facts.features" maxlength="1000" placeholder="每行一个真实卖点，不要填写无法证明的功效或认证"></textarea></label>
          <label class="kit-field"><b>目标人群</b><input v-model.trim="facts.audience" maxlength="100" placeholder="例如：20-35 岁通勤男性" /></label>
          <label class="kit-upload"><input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="chooseImages" /><span>＋</span><b>补充商品原图（最多 4 张）</b><small>强烈建议上传，能更好地保持商品外观一致</small></label>
          <div v-if="sourceImages.length" class="kit-source-images"><figure v-for="(item,index) in sourceImages" :key="item.url"><img :src="item.url" /><button @click="removeImage(index)">×</button></figure></div>
          <button class="kit-next" @click="confirmFacts">确认事实并查看交付清单 →</button>
        </template>

        <template v-else>
          <div class="kit-summary"><span>商品</span><b>{{ facts.name }}</b><small>{{ platform }} · {{ facts.category || '未填写类目' }}</small></div>
          <div class="kit-deliverables"><b>本次交付</b><ul><li>3 张不同定位的商品主图</li><li>1 套详情页结构与模块文案</li><li>5 个商品标题与核心卖点</li><li>平台合规自检与风险提示</li><li>ZIP 素材包下载</li></ul></div>
          <div class="kit-cost"><span>预计消耗</span><b>{{ estimatedCredits }} 算力</b><small>按当前可用模型估算，实际扣费以生成结果为准；失败任务自动退还。</small></div>
          <button class="kit-next kit-generate" :disabled="generating" @click="generateKit"><span v-if="generating" class="button-spinner"></span>{{ generating ? progressText : '✦ 开始生成整套素材' }}</button>
          <button class="kit-back" :disabled="generating" @click="step = 2">返回修改商品资料</button>
        </template>
        <p v-if="error" class="api-error">{{ error }}</p>
      </aside>

      <main class="listing-kit-result">
        <div class="kit-result-head"><div><h3>素材包预览</h3><span>{{ statusLabel }}</span></div><button v-if="completed" :disabled="downloading" @click="downloadPack">{{ downloading ? '打包中…' : '↓ 下载 ZIP 素材包' }}</button></div>
        <div v-if="!generating && !hasResult" class="kit-empty"><div>包</div><h3>从商品链接开始</h3><p>系统会先提取商品事实，由你确认后才生成素材。</p><div><span>主图 ×3</span><span>详情页</span><span>标题文案</span><span>合规检查</span></div></div>
        <div v-else class="kit-output">
          <div class="kit-progress"><i :style="{ width: progress + '%' }"></i></div>
          <section><header><b>商品主图</b><small>{{ images.length }}/3</small></header><div class="kit-image-grid"><article v-for="(url,index) in images" :key="url"><img :src="url" /><span>{{ imageLabels[index] }}</span><button @click="downloadOne(url,index)">↓</button></article><article v-for="n in Math.max(0,3-images.length)" :key="`placeholder-${n}`" class="placeholder"><span>{{ generating ? '生成中…' : '待生成' }}</span></article></div></section>
          <section class="kit-copy-output"><header><b>标题与卖点</b><button v-if="copy" @click="copyText">{{ copied ? '已复制' : '复制' }}</button></header><pre>{{ copy || (generating ? '正在根据商品事实生成平台文案…' : '等待生成') }}</pre></section>
          <section class="kit-detail-output"><header><b>详情页结构</b></header><div v-if="detailBlocks.length"><article v-for="(block,index) in detailBlocks" :key="index"><span>0{{ index + 1 }}</span><div><b>{{ block.title }}</b><p>{{ block.content }}</p></div></article></div><p v-else>{{ generating ? '正在规划详情页模块…' : '等待生成' }}</p></section>
          <section class="kit-compliance"><header><b>上架前检查</b></header><ul><li>商品名称、规格、材质需与实物一致</li><li>不得使用“第一、顶级、100%有效”等无法证明的绝对化表述</li><li>品牌、肖像、字体和图片版权需取得合法授权</li><li>不同平台规则可能更新，发布前请再次人工核验</li></ul></section>
        </div>
      </main>
    </div>
  </section>
</template>

<script>
import JSZip from 'jszip'

export default {
  name: 'ProductLaunch',
  props: { session: Object, profile: Object, textModels: Array, imageModels: Array },
  data: () => ({
    step: 1, steps: ['粘贴链接', '确认事实', '生成素材'], productUrl: '', analyzing: false,
    platforms: ['淘宝 / 天猫', '拼多多', '抖音电商', '小红书', '闲鱼'], platform: '淘宝 / 天猫',
    facts: { name: '', brand: '', category: '', specs: '', features: '', audience: '' },
    sourceImages: [], images: [], copy: '', detailBlocks: [], generating: false, downloading: false,
    progress: 0, progressText: '', error: '', copied: false, imageLabels: ['白底主图', '卖点场景图', '使用场景图']
  }),
  computed: {
    authHeaders() { return this.session?.access_token ? { Authorization: `Bearer ${this.session.access_token}` } : {} },
    selectedTextModel() { return (this.textModels || []).find(item => item.available) || {} },
    hasLocalReferences() { return this.sourceImages.some(item => item.file) },
    selectedImageModel() { return (this.imageModels || []).find(item => item.available && (this.hasLocalReferences ? item.supportsEdit : item.supportsGenerate !== false)) || {} },
    estimatedCredits() { return Number(this.selectedTextModel.creditCost || 1) + Number(this.selectedImageModel.creditCost || (this.hasLocalReferences ? 3 : 2)) * 3 },
    hasResult() { return Boolean(this.copy || this.images.length || this.detailBlocks.length) },
    completed() { return !this.generating && Boolean(this.copy) && this.images.length > 0 },
    statusLabel() { return this.generating ? this.progressText : this.completed ? '素材包已完成，可逐项检查' : '尚未开始生成' }
  },
  beforeDestroy() { this.sourceImages.forEach(item => item.local && URL.revokeObjectURL(item.url)) },
  methods: {
    requireLogin() { if (this.session) return true; this.$emit('login'); return false },
    async analyze() {
      if (!this.requireLogin()) return
      if (!/^https?:\/\//i.test(this.productUrl)) { this.error = '请输入以 http:// 或 https:// 开头的完整商品链接'; return }
      this.analyzing = true; this.error = ''
      try {
        const response = await fetch('/api/product-kit/analyze', { method: 'POST', headers: { ...this.authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: this.productUrl }) })
        const data = await response.json(); if (!response.ok) throw new Error(data.error || '商品链接解析失败')
        this.facts = { ...this.facts, ...data.product }
        this.sourceImages = (data.product.images || []).slice(0, 4).map(url => ({ url, local: false }))
        this.step = 2
        if (data.warning) this.error = data.warning
      } catch (error) {
        this.error = `${error.message}。你仍可以手动填写商品信息继续生成。`; this.step = 2
      } finally { this.analyzing = false }
    },
    chooseImages(event) {
      const files = [...(event.target.files || [])]; event.target.value = ''
      for (const file of files) {
        if (this.sourceImages.length >= 4) break
        if (!/^image\//.test(file.type) || file.size > 10 * 1024 * 1024) continue
        this.sourceImages.push({ file, url: URL.createObjectURL(file), local: true })
      }
    },
    removeImage(index) { const item = this.sourceImages[index]; if (item?.local) URL.revokeObjectURL(item.url); this.sourceImages.splice(index, 1) },
    confirmFacts() {
      if (!this.facts.name) { this.error = '请填写准确的商品名称'; return }
      if (!this.facts.features) { this.error = '请至少填写一条真实卖点'; return }
      this.error = ''; this.step = 3
    },
    factsText() { return [`商品名称：${this.facts.name}`, `品牌：${this.facts.brand || '未提供'}`, `类目：${this.facts.category || '未提供'}`, `规格材质：${this.facts.specs || '未提供'}`, `真实卖点：${this.facts.features}`, `目标人群：${this.facts.audience || '未提供'}`].join('\n') },
    async generateKit() {
      if (!this.requireLogin() || this.generating) return
      if (Number(this.profile?.credits || 0) < this.estimatedCredits) { this.$emit('recharge'); return }
      this.generating = true; this.error = ''; this.images = []; this.copy = ''; this.detailBlocks = []; this.progress = 8; this.progressText = '正在生成标题与卖点…'
      try {
        const copyResponse = await fetch('/api/copy/generate', { method: 'POST', headers: { ...this.authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ product: this.facts.name, features: `${this.factsText()}\n要求额外给出“详情页结构”，按首屏价值、核心卖点、规格说明、使用场景、购买保障五个模块输出。`, platform: this.platform, style: '真实可信、突出差异化', modelId: this.selectedTextModel.id }) })
        const copyData = await copyResponse.json(); if (!copyResponse.ok) throw new Error(copyData.error || '文案生成失败')
        this.copy = copyData.copy; this.detailBlocks = this.buildDetailBlocks(); this.progress = 32; this.$emit('credits', copyData.credits)
        const prompts = [
          `${this.factsText()}。制作纯净白底电商主图，单件商品居中，准确保持商品外观、颜色、包装和比例，柔和棚拍光，高级真实摄影，不添加文字、Logo或不存在的配件。`,
          `${this.factsText()}。制作突出核心卖点的电商场景主图，商品是绝对主体，准确保持商品外观，画面有清晰视觉层级并预留文案区域，不生成乱码，不虚构功能。`,
          `${this.factsText()}。面向${this.facts.audience || '目标消费者'}制作真实使用场景图，准确保持商品外观和规格，自然光，可信生活方式摄影，不夸大功效。`
        ]
        for (let i = 0; i < prompts.length; i += 1) {
          this.progressText = `正在生成第 ${i + 1}/3 张主图…`
          let response
          if (this.hasLocalReferences) {
            const form = new FormData(); this.sourceImages.filter(item => item.file).forEach(item => form.append('images', item.file)); form.append('prompt', prompts[i]); form.append('ratio', '1:1'); form.append('count', '1'); form.append('modelId', this.selectedImageModel.id)
            response = await fetch('/api/images/edit', { method: 'POST', headers: this.authHeaders, body: form })
          } else {
            response = await fetch('/api/images/generate', { method: 'POST', headers: { ...this.authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompts[i], ratio: '1:1', count: 1, modelId: this.selectedImageModel.id }) })
          }
          const data = await response.json(); if (!response.ok) throw new Error(data.error || `第 ${i + 1} 张主图生成失败`)
          if (data.images?.[0]) this.images.push(data.images[0])
          this.progress = 32 + (i + 1) * 20; this.$emit('credits', data.credits)
        }
        this.progress = 100; this.progressText = '素材包生成完成'; this.$emit('refresh-credits')
      } catch (error) { this.error = error.message; this.progressText = '部分任务未完成，已完成内容仍可下载'; this.$emit('refresh-credits') }
      finally { this.generating = false }
    },
    buildDetailBlocks() { return [
      { title: '首屏价值', content: `${this.facts.name}｜面向${this.facts.audience || '目标用户'}的清晰商品定位` },
      { title: '核心卖点', content: this.facts.features },
      { title: '规格说明', content: this.facts.specs || '请在发布前补充准确的尺寸、材质、颜色和包装清单' },
      { title: '使用场景', content: `围绕${this.facts.audience || '目标用户'}的真实需求展示商品，避免无法证明的效果承诺` },
      { title: '购买保障', content: '请依据店铺实际售后政策填写发货、退换和服务承诺' }
    ] },
    async copyText() { await navigator.clipboard.writeText(this.copy); this.copied = true; setTimeout(() => { this.copied = false }, 1200) },
    async downloadOne(url, index) { const blob = await fetch(url).then(r => r.blob()); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `主图-${index + 1}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) },
    async downloadPack() {
      this.downloading = true; this.error = ''
      try {
        const zip = new JSZip(); const folder = zip.folder(this.safeName(this.facts.name))
        for (let i = 0; i < this.images.length; i += 1) { const blob = await fetch(this.images[i]).then(r => { if (!r.ok) throw new Error('图片下载失败'); return r.blob() }); folder.file(`主图-${i + 1}-${this.imageLabels[i] || '商品图'}.png`, blob) }
        folder.file('商品标题与卖点.txt', `AI 生成内容，请人工核验后使用\n\n${this.copy}`)
        folder.file('详情页结构.txt', this.detailBlocks.map((item,index) => `${index + 1}. ${item.title}\n${item.content}`).join('\n\n'))
        folder.file('上架检查.txt', `平台：${this.platform}\n来源链接：${this.productUrl}\n\n发布前请核验商品事实、广告法表述、品牌授权、图片版权、字体版权和平台最新规则。`)
        const blob = await zip.generateAsync({ type: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${this.safeName(this.facts.name)}-上架素材包.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500)
      } catch (error) { this.error = `打包失败：${error.message}` } finally { this.downloading = false }
    },
    safeName(value) { return String(value || '商品').replace(/[\\/:*?"<>|]/g, '-').slice(0, 50) }
  }
}
</script>

<style scoped>
.listing-kit-view{padding:28px;max-width:1540px;margin:auto}.listing-kit-hero{display:flex;justify-content:space-between;align-items:center;padding:34px 38px;border:1px solid #2a2d35;border-radius:24px;background:linear-gradient(125deg,#12151b,#191d25 62%,#12282a);color:#fff;margin-bottom:22px}.listing-kit-hero span{color:#22d3c5;font-size:12px;letter-spacing:2px}.listing-kit-hero h2{font-size:30px;margin:8px 0}.listing-kit-hero p{color:#aeb5c2}.listing-kit-promise{text-align:right;padding:17px 22px;border:1px solid #365456;border-radius:16px;background:#142225}.listing-kit-promise b{display:block;font-size:22px;color:#55eadf}.listing-kit-promise small{color:#b8c8c8}.listing-kit-layout{display:grid;grid-template-columns:440px minmax(0,1fr);gap:20px}.listing-kit-form,.listing-kit-result{background:#fff!important;border:1px solid #e5e7eb;border-radius:22px;padding:22px;color:#111827!important}.listing-kit-form button,.listing-kit-result button{color:#344054}.kit-steps{display:flex;gap:8px;margin-bottom:24px}.kit-steps span{flex:1;color:#9ca3af;font-size:12px;border-bottom:2px solid #e5e7eb;padding-bottom:12px}.kit-steps span.active{color:#111827;border-color:#21bdb1}.kit-steps i{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#edf0f3;margin-right:6px;font-style:normal}.kit-steps .active i{background:#d8fbf7;color:#087f77}.kit-field{display:block;margin:16px 0}.kit-field>b,.kit-platforms>b{display:block;font-size:13px;margin-bottom:8px;color:#111827}.kit-field input,.kit-field textarea{width:100%;box-sizing:border-box;border:1px solid #dce1e8;border-radius:12px;padding:13px 14px;font:inherit;outline:none;background:#fff!important;color:#111827!important}.kit-field input:focus,.kit-field textarea:focus{border-color:#21bdb1;box-shadow:0 0 0 3px #21bdb119}.kit-field textarea{min-height:120px;resize:vertical}.kit-field small{display:block;margin-top:7px;color:#8a93a2}.kit-url-row{display:flex;gap:8px}.kit-url-row input{min-width:0}.kit-url-row button,.kit-next{border:0;border-radius:12px;background:#11151b!important;color:#fff!important;font-weight:700;padding:0 18px;white-space:nowrap}.kit-platforms div{display:flex;gap:8px;flex-wrap:wrap}.kit-platforms button{border:1px solid #dfe3e8;background:#fff!important;color:#344054!important;border-radius:10px;padding:9px 12px}.kit-platforms button.active{border-color:#21bdb1;background:#e9fffc!important;color:#087f77!important}.kit-safe-note{padding:12px;border-radius:12px;background:#f7f8fa;color:#6b7280;font-size:12px;margin-top:20px}.kit-two-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kit-review-title{display:flex;justify-content:space-between}.kit-review-title small{display:block;color:#8a93a2;margin-top:4px}.kit-review-title button,.kit-back{border:0;background:none;color:#087f77!important}.kit-upload{display:flex;align-items:center;gap:10px;border:1px dashed #aeb7c2;border-radius:14px;padding:14px;cursor:pointer}.kit-upload input{display:none}.kit-upload span{font-size:24px;color:#13a89d}.kit-upload small{display:block;color:#8a93a2}.kit-source-images{display:flex;gap:8px;margin:12px 0}.kit-source-images figure{position:relative;margin:0}.kit-source-images img{width:68px;height:68px;object-fit:cover;border-radius:10px}.kit-source-images button{position:absolute;right:-5px;top:-5px;border:0;border-radius:50%;background:#111;color:#fff!important}.kit-next{width:100%;height:50px;margin-top:20px;background:linear-gradient(135deg,#18a89e,#10151b)!important}.kit-generate{display:flex;align-items:center;justify-content:center;gap:8px}.kit-back{display:block;margin:13px auto}.kit-summary,.kit-deliverables,.kit-cost{padding:15px;border-radius:14px;background:#f7f9fa;margin-bottom:12px}.kit-summary span,.kit-cost span{font-size:11px;color:#7c8490}.kit-summary b,.kit-cost b{display:block;margin:4px 0}.kit-summary small,.kit-cost small{color:#7c8490}.kit-deliverables ul{padding-left:20px;margin:10px 0 0;line-height:1.9;color:#4b5563}.listing-kit-result{min-height:650px}.kit-result-head{display:flex;justify-content:space-between;align-items:center}.kit-result-head h3{margin:0;color:#111827!important}.kit-result-head span{font-size:12px;color:#7c8490}.kit-result-head button{border:0;border-radius:10px;padding:10px 14px;background:#11151b!important;color:#fff!important}.kit-empty{height:560px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8a93a2}.kit-empty>div:first-child{display:grid;place-items:center;width:68px;height:68px;border-radius:20px;background:#e9fffc;color:#0b9d93;font-size:26px}.kit-empty h3{color:#111827!important}.kit-empty div:last-child{display:flex;gap:8px}.kit-empty div span{padding:7px 10px;background:#f5f6f8;border-radius:99px;font-size:12px}.kit-output{margin-top:18px}.kit-progress{height:4px;background:#edf0f3;border-radius:9px;overflow:hidden}.kit-progress i{display:block;height:100%;background:#19b5aa;transition:width .4s}.kit-output section{margin-top:20px;padding:17px;border:1px solid #e8ebef;border-radius:16px}.kit-output header{display:flex;justify-content:space-between;margin-bottom:12px}.kit-image-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.kit-image-grid article{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#f3f5f7}.kit-image-grid img{width:100%;height:100%;object-fit:cover}.kit-image-grid span{position:absolute;left:7px;bottom:7px;background:#000b;color:#fff;border-radius:7px;padding:4px 7px;font-size:11px}.kit-image-grid button{position:absolute;right:7px;top:7px;border:0;border-radius:8px;padding:6px 8px}.kit-image-grid .placeholder{display:grid;place-items:center;color:#9ca3af}.kit-image-grid .placeholder span{position:static;background:none;color:inherit}.kit-copy-output pre{white-space:pre-wrap;font:13px/1.8 inherit;color:#374151;max-height:290px;overflow:auto}.kit-copy-output button{border:0;border-radius:8px;padding:6px 10px}.kit-detail-output article{display:flex;gap:12px;padding:11px 0;border-top:1px solid #eef0f3}.kit-detail-output article>span{font-weight:800;color:#18a89e}.kit-detail-output p{margin:4px 0;color:#6b7280;font-size:13px}.kit-compliance{background:#fffbeb}.kit-compliance ul{margin:0;padding-left:20px;color:#725f29;font-size:12px;line-height:1.8}@media(max-width:900px){.listing-kit-view{padding:14px}.listing-kit-hero{padding:24px;align-items:flex-start}.listing-kit-promise{display:none}.listing-kit-layout{grid-template-columns:1fr}.kit-two-cols{grid-template-columns:1fr}.kit-image-grid{grid-template-columns:1fr}.listing-kit-result{min-height:420px}}
</style>
