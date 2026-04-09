<script setup lang="ts">
import type { ProfileSettings } from '../composables/useAuth'
import type { UserRole } from '../composables/useAuth'

const auth = useAuth()
const status = ref('Load, edit, and save your profile defaults.')
const saving = ref(false)
const roleBusyId = ref('')

type UserItem = {
  id: string
  name: string
  email: string
  role: UserRole
  profile: ProfileSettings
}

const users = ref<UserItem[]>([])
const roleDrafts = ref<Record<string, UserRole>>({})

const isAdmin = computed(() => auth.currentUser.value?.role === 'admin')

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
  void (async () => {
    await auth.hydrate()
    if (auth.currentUser.value?.profile) {
      setForm(auth.currentUser.value.profile)
    }

    if (isAdmin.value) {
      await loadUsersForRoleManagement()
    }
  })()
})

watch(
  () => auth.currentUser.value?.profile,
  (profile) => {
    if (profile) {
      setForm(profile)
    }
  }
)

watch(
  () => auth.currentUser.value?.role,
  (role) => {
    if (role === 'admin') {
      void loadUsersForRoleManagement()
      return
    }
    users.value = []
    roleDrafts.value = {}
  }
)

async function loadUsersForRoleManagement() {
  try {
    const list = await auth.listUsers()
    users.value = list
    roleDrafts.value = list.reduce((accumulator, user) => {
      accumulator[user.id] = user.role
      return accumulator
    }, {} as Record<string, UserRole>)
  } catch (error) {
    console.error(error)
    status.value = error instanceof Error ? error.message : 'Could not load users for role management.'
  }
}

async function saveUserRole(userId: string) {
  const role = roleDrafts.value[userId]
  if (!role) {
    status.value = 'Select a role before saving.'
    return
  }

  roleBusyId.value = userId
  try {
    const updated = await auth.updateUserRole(userId, role)
    users.value = users.value.map((item) => (item.id === userId ? { ...item, role: updated.role } : item))

    if (updated.id === auth.currentUser.value?.id) {
      await auth.hydrate()
    }

    status.value = `Updated role for ${updated.name}.`
  } catch (error) {
    console.error(error)
    status.value = error instanceof Error ? error.message : 'Could not update user role.'
    const existing = users.value.find((item) => item.id === userId)
    if (existing) {
      roleDrafts.value[userId] = existing.role
    }
  } finally {
    roleBusyId.value = ''
  }
}

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

async function saveProfile() {
  saving.value = true
  try {
    await auth.updateProfile({ ...form })
    status.value = 'Profile settings saved to database.'
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
      Saved to your account and used as defaults in Form I.
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

    <div v-if="isAdmin" class="mt-8 rounded-2xl border border-slate-200 bg-white/80 p-4">
      <h3 class="module-title text-xl font-bold">User Roles</h3>
      <p class="mt-1 text-sm text-slate-600">Admin can manage account roles for article permissions.</p>

      <div class="mt-4 overflow-x-auto">
        <table class="min-w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-slate-600">
              <th class="px-2 py-2 font-semibold">Name</th>
              <th class="px-2 py-2 font-semibold">Email</th>
              <th class="px-2 py-2 font-semibold">Role</th>
              <th class="px-2 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-slate-100"
            >
              <td class="px-2 py-2 text-slate-800">{{ user.name }}</td>
              <td class="px-2 py-2 text-slate-600">{{ user.email }}</td>
              <td class="px-2 py-2">
                <select v-model="roleDrafts[user.id]" class="field-control !w-40">
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </td>
              <td class="px-2 py-2">
                <button
                  type="button"
                  class="btn-secondary"
                  :disabled="roleBusyId === user.id || roleDrafts[user.id] === user.role"
                  @click="saveUserRole(user.id)"
                >
                  {{ roleBusyId === user.id ? 'Saving...' : 'Save Role' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
