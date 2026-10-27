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
  import { nextTick, ref } from 'vue'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { addReceivableCollection } from '@tms/api/modules/receivable-collections'

  interface CollectionContext {
    documentId: string
    documentNo: string
  }
  interface CollectionForm {
    contactedAt: string
    method: string
    note: string
    nextFollowUp: string
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<CollectionContext>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = ref<CollectionContext>()
  const form = ref<CollectionForm>({ contactedAt: '', method: '', note: '', nextFollowUp: '' })
  const rules: FormRules<CollectionForm> = {
    contactedAt: [{ required: true, message: '请选择实际联系时间', trigger: 'change' }],
    method: [
      { required: true, whitespace: true, message: '请填写联系渠道或方式', trigger: 'blur' },
      { max: 80, message: '联系方式不能超过 80 字', trigger: 'blur' }
    ],
    note: [
      { required: true, whitespace: true, message: '请填写沟通结果', trigger: 'blur' },
      { min: 2, max: 2000, message: '沟通结果需为 2 至 2000 字', trigger: 'blur' }
    ]
  }
  const items: FormItem[] = [
    {
      key: 'contactedAt',
      label: '联系时间',
      type: 'date',
      props: { type: 'datetime', valueFormat: 'YYYY-MM-DDTHH:mm:ssZ', placeholder: '实际联系时间' }
    },
    {
      key: 'method',
      label: '联系方式',
      type: 'input',
      props: { maxlength: 80, placeholder: '填写实际渠道，如电话或现场沟通' }
    },
    {
      key: 'note',
      label: '沟通结果',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 2000, showWordLimit: true },
      description: '记录已发生的联系、客户反馈和约定事项。保存后如需更正，请追加说明。'
    },
    {
      key: 'nextFollowUp',
      label: '下次跟进',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', placeholder: '选填跟进日期' },
      description: '仅记录跟进安排，不自动发送消息。'
    }
  ]
  async function submit(): Promise<boolean> {
    try {
      if (!context.value || !(await validateArtFormForSubmit(formRef.value))) return false
      if (
        !dayjs(form.value.contactedAt).isValid() ||
        dayjs(form.value.contactedAt).isAfter(dayjs())
      ) {
        ElMessage.warning('联系时间应为已发生的实际时间')
        return false
      }
      if (
        form.value.nextFollowUp &&
        dayjs(form.value.nextFollowUp).isBefore(dayjs(form.value.contactedAt), 'day')
      ) {
        ElMessage.warning('下次跟进日期不能早于联系日期')
        return false
      }
      await addReceivableCollection({ documentId: context.value.documentId, ...form.value })
      ElMessage.success('催收记录已保存')
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '催收登记失败，请检查内容后重试')
      return false
    }
  }
  async function handleOpen(data: CollectionContext): Promise<void> {
    context.value = data
    form.value = {
      contactedAt: dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
      method: '',
      note: '',
      nextFollowUp: ''
    }
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(data, {
      title: '登记催收',
      subtitle: `应收单 ${data.documentNo} · 保存已发生的沟通记录`,
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
