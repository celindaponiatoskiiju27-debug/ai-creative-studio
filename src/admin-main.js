import Vue from 'vue'
import AdminApp from './AdminApp.vue'
import '../styles.css'
import './api.css'
import './auth.css'
import './admin.css'
import './admin-shell.css'

Vue.config.productionTip = false
new Vue({ render: h => h(AdminApp) }).$mount('#admin-app')
