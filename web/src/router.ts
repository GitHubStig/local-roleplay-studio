import { createRouter, createWebHistory } from 'vue-router'
import PlayView from './views/PlayView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'play', component: PlayView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
