<script setup lang="ts">
import type { ProfileSettings } from '~/composables/useAuth'

const auth = useAuth()
const status = ref('Load, edit, and save your profile defaults.')
const saving = ref(false)

const form = reactive<ProfileSettings>(auth.emptyProfile())

function setForm(profile: ProfileSettings) {
  form.establishmentName = profile.establishmentName
  form.officeAddress = profile.officeAddress
  form.officePhone = profile.officePhone
  form.officeEmail = profile.officeEmail
  form.orn = profile.orn
  form.dedLicense = profile.dedLicense
  form.poBox = profile.poBox
  form.logoDataUrl = profile.logoDataUrl
  form.stampDataUrl = profile.stampDataUrl
}

onMounted(() => {
  auth.hydrate()
  if (auth.currentUser.value?.profile) {
    setForm(auth.currentUser.value.profile)
  }
})

watch(
  () => auth.currentUser.value?.profile,
  (profile) => {
    if (profile) {
      setForm(profile)
    }
  }
)

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

async function onAssetInput(event: Event, key: 'logoDataUrl' | 'stampDataUrl') {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    form[key] = null
    return
  }

  form[key] = await fileToDataUrl(file)
  status.value = `${key === 'logoDataUrl' ? 'Logo' : 'Stamp'} selected. Save to keep changes.`
}

function clearAsset(key: 'logoDataUrl' | 'stampDataUrl') {
  form[key] = null
}

function saveProfile() {
  saving.value = true
  try {
    auth.updateProfile({ ...form })
    status.value = 'Profile settings saved to local storage.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Could not save profile settings.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Profile Settings</h2>
    <p class="mt-2 text-sm text-slate-600">
      Stored in your browser local storage and used as defaults in Form I.
    </p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <label class="text-sm font-semibold sm:col-span-2">
        Establishment Name
        <input v-model="form.establishmentName" type="text" class="field-control mt-1" >
      </label>

      <label class="text-sm font-semibold sm:col-span-2">
        Office Address
        <input v-model="form.officeAddress" type="text" class="field-control mt-1" >
      </label>

      <label class="text-sm font-semibold">
        Office Phone
        <input v-model="form.officePhone" type="text" class="field-control mt-1" >
      </label>

      <label class="text-sm font-semibold">
        Office Email
        <input v-model="form.officeEmail" type="email" class="field-control mt-1" >
      </label>

      <label class="text-sm font-semibold">
        ORN
        <input v-model="form.orn" type="text" class="field-control mt-1" >
      </label>

      <label class="text-sm font-semibold">
        DED License
        <input v-model="form.dedLicense" type="text" class="field-control mt-1" >
      </label>

      <label class="text-sm font-semibold">
        PO Box
        <input v-model="form.poBox" type="text" class="field-control mt-1" >
      </label>

      <div class="sm:col-span-2 grid gap-3 md:grid-cols-2">
        <label class="text-sm font-semibold">
          Logo
          <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(event) => onAssetInput(event, 'logoDataUrl')" >
          <span class="mt-1 block text-xs text-slate-500">{{ form.logoDataUrl ? 'Saved' : 'Not set' }}</span>
          <img
            v-if="form.logoDataUrl"
            :src="form.logoDataUrl"
            alt="Logo preview"
            class="mt-2 h-24 w-auto rounded-md border border-slate-200 object-contain bg-gray-700 p-2"
          >
          <button v-if="form.logoDataUrl" type="button" class="btn-ghost mt-2" @click="clearAsset('logoDataUrl')">Clear Logo</button>
           <div class="text-xs text-red-500 italic">Note: logo should be light in color and transparent.</div>
        </label>
       
        <label class="text-sm font-semibold">
          Stamp
          <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(event) => onAssetInput(event, 'stampDataUrl')" >
          <span class="mt-1 block text-xs text-slate-500">{{ form.stampDataUrl ? 'Saved' : 'Not set' }}</span>
          <img
            v-if="form.stampDataUrl"
            :src="form.stampDataUrl"
            alt="Stamp preview"
            class="mt-2 h-24 w-auto rounded-md border border-slate-200 object-contain bg-white p-1"
          >
          <button v-if="form.stampDataUrl" type="button" class="btn-ghost mt-2" @click="clearAsset('stampDataUrl')">Clear Stamp</button>
        </label>
      </div>
    </div>

    <div class="mt-5">
      <button class="btn-primary disabled:opacity-60" :disabled="saving" @click="saveProfile">
        {{ saving ? 'Saving...' : 'Save Profile Settings' }}
      </button>
    </div>
  </section>
</template>
