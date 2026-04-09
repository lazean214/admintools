<script setup lang="ts">
const whatsappNumber = '971506422370'
const contactReason = ref<'bug' | 'request' | 'other'>('bug')
const subject = ref('')
const details = ref('')
const copyStatus = ref('')

const reasonLabel = computed(() => {
  if (contactReason.value === 'bug') {
    return 'Bug Report'
  }
  if (contactReason.value === 'request') {
    return 'Feature Request'
  }
  return 'General Message'
})

const whatsappHref = computed(() => {
  const lines = [
    `Hello, I would like to send a ${reasonLabel.value}.`,
    `Subject: ${subject.value.trim() || 'N/A'}`,
    `Details: ${details.value.trim() || 'N/A'}`
  ]

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`
})

async function copyNumber() {
  try {
    await navigator.clipboard.writeText(`+${whatsappNumber}`)
    copyStatus.value = 'WhatsApp number copied.'
  } catch (error) {
    console.error(error)
    copyStatus.value = 'Could not copy number. Please copy it manually.'
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Contact</h2>
    <p class="mt-2 text-sm text-slate-600">
      Send bug reports and feature requests directly through WhatsApp.
    </p>

    <div class="mt-4 rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
      <p>
        Hi, my name is Neil, I am an IT professional, programmer, and photographer.
      </p>
      <p class="mt-2">
        I have been working in the real estate industry for years and developed these tools for free.
      </p>
      <p class="mt-2">
        These tools help admins who do not have access to paid tools needed for their tasks.
      </p>
      <p class="mt-2">
        I am open to comments and suggestions to make these tools better, and I am always looking for ways to expand the suite with more helpful utilities.
      </p>
      <p class="mt-2">
        I am also open for commission projects.
      </p>
    </div>

    <div class="mt-4 rounded-2xl bg-white/70 p-4">
      <p class="text-sm text-slate-700">
        WhatsApp: <span class="font-semibold text-slate-900">+{{ whatsappNumber }}</span>
      </p>
      <button type="button" class="btn-secondary mt-3" @click="copyNumber">
        Copy Number
      </button>
      <p v-if="copyStatus" class="status-pill mt-3">{{ copyStatus }}</p>
    </div>

    <div class="mt-4 rounded-2xl bg-white/70 p-4">
      <h3 class="module-title text-lg font-bold">Quick Message</h3>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="text-sm font-semibold">
          Message Type
          <select v-model="contactReason" class="field-control mt-1">
            <option value="bug">Bug Report</option>
            <option value="request">Feature Request</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label class="text-sm font-semibold">
          Subject
          <input v-model="subject" type="text" class="field-control mt-1" placeholder="Short summary" >
        </label>

        <label class="text-sm font-semibold sm:col-span-2">
          Details
          <textarea
            v-model="details"
            class="field-control mt-1 min-h-32"
            placeholder="Tell me what happened or what you need"
          ></textarea>
        </label>
      </div>

      <a
        :href="whatsappHref"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-primary mt-5 inline-flex"
      >
        Contact on WhatsApp
      </a>
    </div>
  </section>
</template>
