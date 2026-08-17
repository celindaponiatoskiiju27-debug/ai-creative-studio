import Vue from 'vue'
import App from './App.vue'
import '../styles.css'
import './api.css'
import './auth.css'
import './profile.css'
import './motion.css'
import './admin.css'
import './canvas.css'
Vue.config.productionTip=false
new Vue({render:h=>h(App)}).$mount('#app')
