<template>
  <ArtDialog ref="dialogRef" size="md">
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="rules"
      :span="12"
      label-width="100px"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNonNullableText, normalizeNullableNumber } from '@/utils/form/normalize'
  import {
    transitionOrderException,
    type OrderExceptionAction,
    type OrderExceptionStatus
  } from '@tms/api/modules/order-exceptions'

  interface TransitionContext {
    id: string
    orderNo: string
    status: OrderExceptionStatus
    action: OrderExceptionAction
  }
  interface TransitionForm {
    note: string
    damageAmount: number | undefined
    claimAmount: number | undefined
  }
  const titles: Record<OrderExceptionAction, string> = {
    start: '开始处理',
    resolve: '登记处理结果',
    close: '确认结案',
    reopen: '退回处理'
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<TransitionContext>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = ref<TransitionContext>()
  const form = ref<TransitionForm>({ note: '', damageAmount: undefined, claimAmount: undefined })
  const rules: FormRules<TransitionForm> = {
    note: [
      { required: true, whitespace: true, message: '请填写处理说明', trigger: 'blur' },
      { min: 2, max: 2000, message: '处理说明需为 2 至 2000 字', trigger: 'blur' }
    ]
  }
  const items = computed<FormItem[]>(() => [
    ...(context.value?.action === 'resolve'
      ? (['damageAmount', 'claimAmount'] as const).map((key) => ({
          key,
          label: key === 'damageAmount' ? '货损金额' : '理赔金额',
          type: 'number' as const,
          description: '单位：元；未核实请留空，无损失填 0。',
          props: { min: 0, precision: 2, controlsPosition: 'right', placeholder: '待核实' }
        }))
      : []),
    {
      key: 'note',
      label: '处理说明',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 2000, showWordLimit: true },
      description: '记录核实结论、处理措施或结案依据。理赔登记不会自动生成付款。'
    }
  ])
  async function submit(): Promise<boolean> {
    try {
      if (!context.value || !(await validateArtFormForSubmit(formRef.value))) return false
      await transitionOrderException({
        id: context.value.id,
        expectedStatus: context.value.status,
        action: context.value.action,
        note: normalizeNonNullableText(form.value.note),
        damageAmount:
          context.value.action === 'resolve'
            ? normalizeNullableNumber(form.value.damageAmount)
            : null,
        claimAmount:
          context.value.action === 'resolve'
            ? normalizeNullableNumber(form.value.claimAmount)
            : null
      })
      ElMessage.success('异常处理状态已更新')
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '异常处理失败，请刷新台账后重试')
      return false
    }
  }
  async function handleOpen(data: TransitionContext): Promise<void> {
    context.value = data
    form.value = { note: '', damageAmount: undefined, claimAmount: undefined }
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(data, {
      title: titles[data.action],
      subtitle: `订单 ${data.orderNo} · ${data.action === 'close' ? '结案后不可继续修改，请核实处理结果。' : '提交后保留操作记录。'}`,
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
