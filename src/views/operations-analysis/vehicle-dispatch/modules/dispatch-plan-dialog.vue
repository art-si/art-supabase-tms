<template>
  <ArtDialog
    ref="dialogRef"
    size="md"
    :show-fullscreen-button="false"
    :loading="loading"
    confirm-text="保存计划"
    @close="invalidate"
  >
    <ArtAsyncState :error="loadError" @retry="loadPlan">
      <ElAlert
        v-if="plan"
        class="mb-4"
        type="info"
        :closable="false"
        :title="
          plan?.waybillNo ? '当前运单：' + plan.waybillNo : '暂无在执行运单，可单独维护维修计划'
        "
      />
      <ElAlert v-if="saveError" class="mb-4" type="error" :closable="false" :title="saveError">
        <ElButton class="mt-2" size="small" @click="loadPlan">放弃本次填写并重新加载</ElButton>
      </ElAlert>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="12"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </ArtAsyncState>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import { ElAlert, ElButton, ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import {
    getVehicleDispatchPlan,
    saveVehicleDispatchPlan,
    type VehicleDispatchPlan
  } from '@tms/api/modules/vehicle-dispatch-plan'

  interface PlanContext {
    vehicleId: string
    plate: string
  }
  interface PlanForm {
    expectedReturnAt: string | null
    maintenanceAt: string | null
    maintenanceNote: string
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<PlanContext>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = ref<PlanContext>()
  const plan = ref<VehicleDispatchPlan>()
  const form = ref<PlanForm>({ expectedReturnAt: null, maintenanceAt: null, maintenanceNote: '' })
  const loading = ref(false)
  const ready = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  let requestVersion = 0
  const dateProps = {
    class: 'w-full!',
    type: 'datetime',
    format: 'YYYY-MM-DD HH:mm',
    valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
    clearable: true
  }
  const items = computed<FormItem[]>(() => [
    {
      key: 'expectedReturnAt',
      label: '预计回场',
      type: 'date',
      props: { ...dateProps, disabled: !plan.value?.waybillId, 'aria-label': '预计回场' },
      description: '仅绑定上方当前运单。更换任务后不会沿用旧任务的预计回场时间。'
    },
    {
      key: 'maintenanceAt',
      label: '预约维修时间',
      type: 'date',
      props: { ...dateProps, 'aria-label': '预约维修时间' },
      description: '用于调度安排；实际维修仍在车辆维修保养业务中登记。'
    },
    {
      key: 'maintenanceNote',
      span: 24,
      label: '维修计划事项',
      type: 'input',
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 1000,
        showWordLimit: true,
        'aria-label': '维修计划事项'
      },
      description: '填写维修项目、预约地点或配合要求；取消计划时同时清空时间和事项。'
    }
  ])
  const rules: FormRules<PlanForm> = {
    maintenanceNote: [
      {
        trigger: 'blur',
        validator: (_rule, value, callback) => {
          const note = typeof value === 'string' ? value.trim() : ''
          if (Boolean(form.value.maintenanceAt) !== Boolean(note) || (note && note.length < 2))
            callback(new Error('维修时间与至少2字的计划事项需同时填写或同时清空'))
          else callback()
        }
      }
    ]
  }
  function invalidate(): void {
    requestVersion++
    ready.value = false
  }
  async function loadPlan(): Promise<void> {
    const current = context.value
    if (!current) return
    const version = ++requestVersion
    loading.value = true
    ready.value = false
    loadError.value = ''
    dialogRef.value?.setOptions({ confirmDisabled: true })
    try {
      const result = await getVehicleDispatchPlan(current.vehicleId)
      if (version !== requestVersion) return
      plan.value = result
      form.value = {
        expectedReturnAt: result.expectedReturnAt,
        maintenanceAt: result.maintenanceAt,
        maintenanceNote: result.maintenanceNote
      }
      saveError.value = ''
      ready.value = true
      await nextTick()
      if (version === requestVersion) formRef.value?.clearValidate()
    } catch (error) {
      if (version === requestVersion)
        loadError.value = getFriendlySupabaseErrorMessage(error, '调度计划加载失败，请重试')
    } finally {
      if (version === requestVersion) {
        loading.value = false
        dialogRef.value?.setOptions({ confirmDisabled: !ready.value })
      }
    }
  }
  async function submit(): Promise<boolean> {
    if (!context.value || !plan.value || !ready.value || loading.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await saveVehicleDispatchPlan({
        vehicleId: context.value.vehicleId,
        waybillId: plan.value.waybillId,
        ...form.value,
        expectedUpdatedAt: plan.value.updatedAt
      })
      ElMessage.success('调度计划已保存')
      emit('success')
      return true
    } catch (error) {
      saveError.value = getFriendlySupabaseErrorMessage(error, '调度计划保存失败，请重试')
      return false
    }
  }
  async function handleOpen(data: PlanContext): Promise<void> {
    invalidate()
    context.value = { ...data }
    plan.value = undefined
    form.value = { expectedReturnAt: null, maintenanceAt: null, maintenanceNote: '' }
    loadError.value = ''
    saveError.value = ''
    loading.value = true
    await dialogRef.value?.handleOpen(data, {
      title: '车辆调度计划',
      subtitle: data.plate,
      confirmDisabled: true,
      onOpen: loadPlan,
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
