<template>
  <ArtDialog ref="dialogRef" size="sm" :confirm-disabled="!formRef?.readyToSubmit">
    <ArtForm ref="formRef" v-model="form" :items="items" :span="24" label-position="top" />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'

  defineOptions({ name: 'TmsOrderPrintCountDialog' })

  type PrintKind = 'waybill' | 'label'
  type PrintCountOption = 'cargo_quantity' | '1' | '2' | '3' | 'custom'

  interface PrintOpenData {
    kind: PrintKind
    cargoQuantity: number
  }

  interface FormGroup {
    option: PrintCountOption
    customCount: number | null
  }

  const emit = defineEmits<{
    (event: 'confirm', kind: PrintKind, count: number): void
  }>()

  const dialogRef = ref<ArtDialogExpose<PrintOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const printKind = ref<PrintKind>('waybill')
  const form = reactive<FormGroup>({
    option: '1',
    customCount: null
  })

  const items = computed<FormItem[]>(() => [
    {
      key: 'option',
      label: '打印数量',
      type: 'radioGroup',
      options: [
        ...(printKind.value === 'label' ? [{ label: '同货品数量', value: 'cargo_quantity' }] : []),
        { label: '1张', value: '1' },
        { label: '2张', value: '2' },
        { label: '3张', value: '3' },
        { label: '自定义', value: 'custom' }
      ]
    },
    {
      key: 'customCount',
      label: '自定义打印数量',
      type: 'number',
      hidden: form.option !== 'custom',
      props: {
        min: 1,
        max: 100,
        precision: 0,
        controlsPosition: 'right',
        placeholder: '请输入打印数量'
      }
    }
  ])
  function resolveCount(data?: PrintOpenData): number {
    if (form.option === 'cargo_quantity') return Math.max(1, Math.floor(data?.cargoQuantity || 1))
    if (form.option === 'custom') return Math.max(0, Math.floor(form.customCount || 0))
    return Number(form.option)
  }

  async function handleOpen(data: PrintOpenData): Promise<void> {
    printKind.value = data.kind
    form.option = data.kind === 'label' ? 'cargo_quantity' : '1'
    form.customCount = null

    await dialogRef.value?.handleOpen(data, {
      title: data.kind === 'waybill' ? '打印运单' : '打印标签',
      subtitle:
        data.kind === 'waybill'
          ? '确认运单打印份数，便于交接、留档和随车携带'
          : '按货物数量或自定义份数生成标签',
      onConfirm: (openData) => {
        const count = resolveCount(openData)
        if (count < 1) {
          ElMessage.warning('请输入打印数量')
          return false
        }
        if (count > 100) {
          ElMessage.warning('单次最多打印 100 张')
          return false
        }
        emit('confirm', data.kind, count)
        return true
      }
    })
  }

  defineExpose({ handleOpen })
</script>
