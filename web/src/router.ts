import { createRouter, createWebHistory } from 'vue-router'
import PlayView from './views/PlayView.vue'
import SessionView from './views/SessionView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'play', component: PlayView },
    { path: '/sessions/:id', name: 'session', component: SessionView, props: true },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
