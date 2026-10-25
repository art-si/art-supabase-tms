<template>
  <ArtDialog ref="dialogRef" size="md" :show-fullscreen-button="false">
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="rules"
      :span="12"
      :gutter="20"
      label-width="96px"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import {
    fetchMonthlyPlans,
    saveMonthlyPlan,
    type MonthlyPlans,
    type MonthlyPlanInput
  } from '@tms/api/modules/monthly-plan'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const scope = useTenantScopeStore()
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const data = ref<MonthlyPlans>({ metrics: [], records: [] })
  const ready = ref(false)
  const form = ref<MonthlyPlanInput>({
    month: '',
    metricCode: '',
    budget: null,
    target: null,
    remark: '',
    tenantId: '',
    expectedRevision: 0
  })
  const selected = computed(() =>
    data.value.metrics.find((item) => item.code === form.value.metricCode)
  )
  const items = computed<FormItem[]>(() => [
    {
      key: 'metricCode',
      label: '经营指标',
      type: 'select',
      span: 24,
      options: data.value.metrics.map((item) => ({
        label: `${item.category} · ${item.label}`,
        value: item.code
      })),
      props: { filterable: true, clearable: false }
    },
    {
      key: 'budget',
      label: `预算（${selected.value?.unit || '—'}）`,
      type: 'number',
      props: {
        class: 'w-full!',
        min: selected.value?.minimum ?? undefined,
        max: selected.value?.maximum ?? undefined,
        precision: form.value.metricCode === 'orders' ? 0 : 2,
        controls: false,
        placeholder: '未编制可留空'
      }
    },
    {
      key: 'target',
      label: `目标（${selected.value?.unit || '—'}）`,
      type: 'number',
      props: {
        class: 'w-full!',
        min: selected.value?.minimum ?? undefined,
        max: selected.value?.maximum ?? undefined,
        precision: form.value.metricCode === 'orders' ? 0 : 2,
        controls: false,
        placeholder: '未设定可留空'
      }
    },
    {
      key: 'remark',
      label: '编制说明',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 1000,
        showWordLimit: true,
        placeholder: '填写预算依据或目标说明'
      }
    }
  ])
  const rules: FormRules = {
    metricCode: [{ required: true, message: '请选择经营指标', trigger: 'change' }]
  }
  watch(
    () => form.value.metricCode,
    (code) => {
      const record = data.value.records.find(
        (item) => item.tenant_id === form.value.tenantId && item.metric_code === code
      )
      Object.assign(form.value, {
        budget: record?.budget ?? null,
        target: record?.target ?? null,
        remark: record?.remark ?? '',
        expectedRevision: record?.revision ?? 0
      })
    }
  )
  watch(
    () => scope.revision,
    () => {
      ready.value = false
      void dialogRef.value?.handleClose(true)
    }
  )

  async function submit(): Promise<boolean> {
    if (!ready.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await saveMonthlyPlan(form.value)
      ElMessage.success('预算与目标已保存')
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '预算保存失败，请关闭后重新打开并核对最新数据')
      return false
    }
  }

  async function handleOpen(month: string): Promise<void> {
    const tenantId = defaultWriteTenantId.value
    if (!tenantId) {
      ElMessage.warning('无法确定预算所属租户，请刷新后重试')
      return
    }
    ready.value = false
    form.value = {
      month,
      metricCode: '',
      budget: null,
      target: null,
      remark: '',
      tenantId,
      expectedRevision: 0
    }
    const revision = scope.revision
    await dialogRef.value?.handleOpen(undefined, {
      title: '维护预算与目标',
      subtitle: `${month.slice(0, 7)} 自然月预算 · 留空表示未编制，零表示明确为零`,
      loading: true,
      onOpen: async (_data, api) => {
        try {
          const result = await fetchMonthlyPlans(month)
          if (scope.revision !== revision) return
          data.value = result
          form.value.metricCode = result.metrics[0]?.code ?? ''
          ready.value = true
        } catch (error) {
          notifyFriendlyError(error, '预算读取失败，请关闭后重新打开重试')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
