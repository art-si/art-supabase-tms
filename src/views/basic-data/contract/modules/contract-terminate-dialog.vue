<template>
  <ArtDialog ref="dialogRef" size="sm">
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="rules"
      :span="24"
      label-width="88px"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { terminateContract } from '@tms/api'

  type Contract = Api.Tms.BasicData.Contract
  const emit = defineEmits<{ (event: 'success'): void }>()
  const dialogRef = ref<ArtDialogExpose<Contract>>()
  const formRef = ref<{ validate: () => Promise<boolean> }>()
  const form = reactive({ reason: '' })
  const items: FormItem[] = [
    {
      key: 'reason',
      label: '终止原因',
      type: 'input',
      span: 24,
      description: '原因会随合同记录保存，供后续追溯。',
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '请填写终止原因'
      }
    }
  ]
  const rules: FormRules = {
    reason: [{ required: true, whitespace: true, message: '请填写终止原因', trigger: 'blur' }]
  }

  const open = async (contract: Contract): Promise<void> => {
    if (!contract.id || contract.contractStatus !== 'approved') return
    form.reason = ''
    await dialogRef.value?.handleOpen(contract, {
      title: '终止运输合同',
      subtitle: `${contract.contractNo || contract.contractName} · 终止后停止到期提醒，已有业务记录保留。`,
      confirmText: '确认终止',
      onConfirm: async () => {
        try {
          if (!(await validateArtFormForSubmit(formRef.value))) return false
          await terminateContract(contract.id!, form.reason.trim())
          emit('success')
          return true
        } catch (error) {
          notifyFriendlyError(error, '合同终止失败，请检查状态和权限后重试')
          return false
        }
      }
    })
  }

  defineExpose({ open })
</script>
