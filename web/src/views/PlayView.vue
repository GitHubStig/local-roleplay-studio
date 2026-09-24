<template>
  <div class="flex">
    <main class="flex flex-1 flex-col gap-4 p-4">
      <section
        class="flex flex-1 items-center justify-center rounded-lg border border-neutral-800 text-neutral-500"
      >
        Scene image
      </section>
      <textarea
        class="h-24 resize-none rounded-lg border border-neutral-800 bg-neutral-900 p-3"
        placeholder="Your Action…"
        disabled
      />
    </main>
    <aside class="w-80 border-l border-neutral-800 p-4 text-neutral-500">Turn Log</aside>
  </div>
</template>
