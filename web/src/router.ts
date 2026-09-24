import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import SessionView from './views/SessionView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/sessions/:id', name: 'session', component: SessionView, props: true },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
