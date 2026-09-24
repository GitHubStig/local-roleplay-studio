<template>
  <div class="flex">
    <main class="flex flex-1 flex-col gap-4 p-4">
      <section
        class="flex flex-1 items-center justify-center rounded-lg border border-line text-muted"
      >
        Scene image
      </section>
      <textarea
        class="h-24 resize-none rounded-lg border border-line bg-surface p-3"
        placeholder="Your Action…"
        disabled
      />
    </main>
    <aside class="w-80 border-l border-line p-4 text-muted">Turn Log</aside>
  </div>
</template>
