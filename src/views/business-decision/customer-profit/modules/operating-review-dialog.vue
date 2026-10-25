<template>
  <ArtDialog
    ref="dialogRef"
    size="md"
    :show-fullscreen-button="false"
    :loading="loading"
    confirm-text="保存复盘"
    @close="invalidateRequest"
  >
    <ArtAsyncState :error="loadError" @retry="loadReview">
      <ElAlert v-if="saveError" type="error" :closable="false" class="mb-4" :title="saveError">
        <p>已保留本次填写。若记录已被修改，可放弃本次填写并载入最新内容。</p>
        <ElButton class="mt-2" size="small" @click="loadReview"> 放弃本次填写并重新加载 </ElButton>
      </ElAlert>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="24"
        label-width="100px"
        :show-reset="false"
        :show-submit="false"
      />
    </ArtAsyncState>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { nextTick, ref } from 'vue'
  import { ElAlert, ElButton, ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import {
    getCustomerOperatingReview,
    saveCustomerOperatingReview
  } from '@tms/api/modules/customer-operating-review'

  interface ReviewContext {
    customerId: string
    customerName: string
    periodStart: string
    periodEnd: string
  }
  interface ReviewForm {
    strategy: string
    improvement: string
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<ReviewContext>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = ref<ReviewContext>()
  const form = ref<ReviewForm>({ strategy: '', improvement: '' })
  const loading = ref(false)
  const ready = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const expectedUpdatedAt = ref<string | null>(null)
  let requestVersion = 0
  const rules: FormRules<ReviewForm> = {
    strategy: [
      { required: true, whitespace: true, message: '请填写客户策略', trigger: 'blur' },
      { min: 2, max: 2000, message: '客户策略需为 2 至 2000 字', trigger: 'blur' }
    ],
    improvement: [
      { required: true, whitespace: true, message: '请填写改善措施', trigger: 'blur' },
      { min: 2, max: 2000, message: '改善措施需为 2 至 2000 字', trigger: 'blur' }
    ]
  }
  const items: FormItem[] = [
    {
      key: 'strategy',
      label: '客户策略',
      type: 'input',
      props: { type: 'textarea', rows: 4, maxlength: 2000, showWordLimit: true },
      description: '结合本期营收、毛利及应收风险，记录客户维护、报价或合作策略。'
    },
    {
      key: 'improvement',
      label: '改善措施',
      type: 'input',
      props: { type: 'textarea', rows: 4, maxlength: 2000, showWordLimit: true },
      description: '写明计划采取的措施、责任安排和复核时间，便于后续跟进。'
    }
  ]
  function invalidateRequest(): void {
    requestVersion++
    ready.value = false
  }
  async function loadReview(): Promise<void> {
    const current = context.value
    if (!current) return
    const version = ++requestVersion
    loading.value = true
    dialogRef.value?.setOptions({ confirmDisabled: true })
    ready.value = false
    loadError.value = ''
    try {
      const review = await getCustomerOperatingReview(
        current.customerId,
        current.periodStart,
        current.periodEnd
      )
      if (version !== requestVersion) return
      form.value = { strategy: review?.strategy ?? '', improvement: review?.improvement ?? '' }
      expectedUpdatedAt.value = review?.updatedAt ?? null
      saveError.value = ''
      ready.value = true
      await nextTick()
      if (version === requestVersion) formRef.value?.clearValidate()
    } catch (error) {
      if (version === requestVersion)
        loadError.value = getFriendlySupabaseErrorMessage(error, '经营复盘加载失败，请重试')
    } finally {
      if (version === requestVersion) {
        loading.value = false
        dialogRef.value?.setOptions({ confirmDisabled: !ready.value || !!loadError.value })
      }
    }
  }
  async function submit(): Promise<boolean> {
    const current = context.value
    if (!current || !ready.value || loading.value || loadError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await saveCustomerOperatingReview({
        customerId: current.customerId,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
        ...form.value,
        expectedUpdatedAt: expectedUpdatedAt.value
      })
      ElMessage.success('客户经营复盘已保存')
      emit('success')
      return true
    } catch (error) {
      saveError.value = getFriendlySupabaseErrorMessage(error, '经营复盘保存失败，请稍后重试')
      return false
    }
  }
  async function handleOpen(data: ReviewContext): Promise<void> {
    invalidateRequest()
    context.value = { ...data }
    form.value = { strategy: '', improvement: '' }
    expectedUpdatedAt.value = null
    loadError.value = ''
    saveError.value = ''
    loading.value = true
    await dialogRef.value?.handleOpen(data, {
      title: '客户经营复盘',
      confirmDisabled: true,
      subtitle: `${data.customerName} · ${data.periodStart} 至 ${data.periodEnd}`,
      onOpen: loadReview,
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
