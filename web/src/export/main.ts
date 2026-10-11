import { createApp, h } from 'vue'
import '../style.css'
import type { Comparison } from '../comparison'
import ExportPage from './ExportPage.vue'

/**
 * The exported comparison page (`web/export.html`, built by `deno task build:export`): the
 * Compare dialog's table on its own, filled from the JSON the server writes into the page.
 */
const data: Comparison & { title: string } = JSON.parse(
  document.getElementById('comparison')!.textContent!,
)
// The title names the tab only: the page is the table alone, without the dialog's header.
document.title = data.title
createApp(() => h(ExportPage, { models: data.models, rows: data.rows })).mount('#app')
