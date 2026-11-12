import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ChainView from './chain/ChainView.vue'
import QueueView from './views/QueueView.vue'
import SettingsView from './views/SettingsView.vue'
import StoryboardView from './storyboard/StoryboardView.vue'
import RoleplayView from './roleplay/RoleplayView.vue'
import ScenarioView from './scenario/ScenarioView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    // A Scenario by its id, or a typed Brief as `?brief=`.
    { path: '/scenario/:id?', name: 'scenario', component: ScenarioView, props: true },
    { path: '/sessions/:id', name: 'session', component: ChainView, props: true },
    { path: '/storyboards/:id', name: 'storyboard', component: StoryboardView, props: true },
    { path: '/roleplay/:id', name: 'roleplay', component: RoleplayView, props: true },
    { path: '/queue', name: 'queue', component: QueueView },
    // Drawn over the screen it was opened from (`App`), at a section's address: `/settings/images`.
    { path: '/settings/:section?', name: 'settings', component: SettingsView, props: true },
  ],
})
