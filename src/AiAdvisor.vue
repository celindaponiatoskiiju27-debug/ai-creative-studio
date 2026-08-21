<template>
  <section class="advisor-shell">
    <aside class="advisor-sessions">
      <div class="advisor-side-head"><div><b>对话记录</b><small>方案会自动保存</small></div><button @click="newChat">＋ 新对话</button></div>
      <div v-if="!session" class="advisor-login-tip"><b>登录后保存对话</b><p>你可以先浏览功能，发送消息时再登录。</p><button @click="$emit('login')">登录 / 注册</button></div>
      <template v-else>
        <button v-for="item in sessions" :key="item.id" class="advisor-session" :class="{active:currentId===item.id}" @click="openSession(item.id)"><span>{{ item.title }}</span><small>{{ formatTime(item.updated_at) }}</small><i title="删除" @click.stop="removeSession(item.id)">×</i></button>
        <p v-if="!sessions.length" class="advisor-no-session">还没有历史对话</p>
      </template>
    </aside>
    <main class="advisor-main">
      <header class="advisor-head"><div class="advisor-avatar">AI</div><div><h2>电商 AI 顾问</h2><p>商品定位、运营方案、投放策略与内容诊断</p></div><label>对话模型<select v-model="modelId"><option v-for="item in textModels" :key="item.id" :value="item.id" :disabled="!item.available">{{ item.name }}{{ item.available?'':'（不可用）' }}</option></select></label></header>
      <div ref="messages" class="advisor-messages">
        <div v-if="!messages.length" class="advisor-welcome"><span>✦</span><h2>今天想讨论什么电商问题？</h2><p>告诉我你的商品、平台、目标人群和当前困难，我会与你一起拆解方案。</p><div><button v-for="item in suggestions" :key="item" @click="draft=item">{{ item }}</button></div></div>
        <article v-for="item in messages" :key="item.id" :class="['advisor-message',item.role]"><div>{{ item.role==='assistant'?'AI':avatar }}</div><section><small>{{ item.role==='assistant' ? (item.model_id || '电商顾问') : '你' }}</small><p>{{ item.content }}</p></section></article>
        <article v-if="sending" class="advisor-message assistant"><div>AI</div><section><small>正在思考</small><p class="advisor-typing"><i/><i/><i/></p></section></article>
      </div>
      <footer class="advisor-composer"><p v-if="error">{{ error }}</p><div><textarea v-model="draft" maxlength="3000" placeholder="例如：我卖的是通勤女装，主要做小红书，预算每天300元，帮我设计一套冷启动方案" @keydown.enter.exact.prevent="send"/><button :disabled="sending||!draft.trim()" @click="send">{{ sending?'回复中…':'发送' }}</button></div><small>每次回复消耗 {{ creditCost }} 点算力 · AI建议仅供经营决策参考，请结合真实数据判断</small></footer>
    </main>
  </section>
</template>

<script>
export default {
  name:'AiAdvisor',
  props:{session:Object,textModels:{type:Array,default:()=>[]},profile:Object},
  data:()=>({sessions:[],currentId:'',messages:[],draft:'',sending:false,error:'',modelId:'qwen-plus',suggestions:['帮我分析这个商品适合什么人群','设计一套小红书7天冷启动方案','我的商品点击率低，该怎么优化','帮我规划一次618促销活动']}),
  computed:{creditCost(){return Math.max(0,Number(this.textModels.find(item=>item.id===this.modelId)?.creditCost??1))},avatar(){return String(this.profile?.email||'我').slice(0,1).toUpperCase()}},
  watch:{session:{immediate:true,handler(value){if(value)this.loadSessions();else{this.sessions=[];this.messages=[];this.currentId=''}}},textModels:{immediate:true,handler(items){this.modelId=items.find(item=>item.available&&item.id==='qwen-plus')?.id||items.find(item=>item.available)?.id||items[0]?.id||'qwen-plus'}}},
  methods:{
    headers(extra={}){return{...extra,Authorization:`Bearer ${this.session?.access_token||''}`}},
    formatTime(value){if(!value)return'';const date=new Date(value);return date.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})},
    scrollBottom(){this.$nextTick(()=>{if(this.$refs.messages)this.$refs.messages.scrollTop=this.$refs.messages.scrollHeight})},
    async loadSessions(){try{const response=await fetch('/api/chat/sessions',{headers:this.headers(),cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'读取对话失败');this.sessions=data.sessions||[];if(this.currentId&&!this.sessions.some(item=>item.id===this.currentId))this.currentId=''}catch(error){this.error=error.message}},
    async openSession(id){this.currentId=id;this.error='';try{const response=await fetch(`/api/chat/sessions/${id}/messages`,{headers:this.headers(),cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'读取消息失败');this.messages=data.messages||[];this.scrollBottom()}catch(error){this.error=error.message}},
    newChat(){this.currentId='';this.messages=[];this.draft='';this.error=''},
    async removeSession(id){if(!confirm('确定删除这段对话吗？'))return;try{const response=await fetch(`/api/chat/sessions/${id}`,{method:'DELETE',headers:this.headers()});const data=response.status===204?{}:await response.json();if(!response.ok)throw new Error(data.error||'删除失败');if(this.currentId===id)this.newChat();await this.loadSessions()}catch(error){this.error=error.message}},
    async send(){const content=this.draft.trim();if(!content||this.sending)return;if(!this.session){this.$emit('login');return}if(Number(this.profile?.credits||0)<this.creditCost){this.$emit('recharge');return}this.sending=true;this.error='';this.draft='';const temp={id:`temp-${Date.now()}`,role:'user',content};this.messages.push(temp);this.scrollBottom();try{const response=await fetch('/api/chat/messages',{method:'POST',headers:this.headers({'Content-Type':'application/json'}),body:JSON.stringify({sessionId:this.currentId||null,content,modelId:this.modelId})});const data=await response.json();if(!response.ok)throw new Error(data.error||'AI顾问回复失败');this.currentId=data.session.id;this.messages=this.messages.filter(item=>item.id!==temp.id);this.messages.push(data.userMessage,data.assistantMessage);this.$emit('credits',data.credits);await this.loadSessions();this.scrollBottom()}catch(error){this.error=error.message;this.draft=content;this.messages=this.messages.filter(item=>item.id!==temp.id);this.$emit('refresh-credits')}finally{this.sending=false}
    }
  }
}
</script>
