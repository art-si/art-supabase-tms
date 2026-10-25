<template>
  <ArtDialog ref="dialogRef" size="lg" :loading="opening" :show-fullscreen-button="false">
    <ArtAsyncState :error="loadError" @retry="loadOptions">
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
    </ArtAsyncState>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { fetchWorkflowUserOptions } from '@/api/workflow'
  import { fetchOrderDetail } from '@tms/api/modules/order'
  import type { ArtUserSelectOption } from '@/components/core/forms/art-user-select/types'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import {
    normalizeNonNullableText,
    normalizeNullableNumber,
    normalizeNullableText
  } from '@/utils/form/normalize'
  import {
    createOrderException,
    type OrderExceptionCreate
  } from '@tms/api/modules/order-exceptions'

  interface OrderContext {
    orderId: string
    orderNo: string
    tenantId?: string
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OrderContext>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const users = ref<ArtUserSelectOption[]>([])
  const opening = ref(false)
  const loadError = ref('')
  const context = ref<OrderContext>()
  let loadVersion = 0
  const initial = (): OrderExceptionCreate => ({
    orderId: '',
    exceptionType: 'delay',
    stage: 'transit',
    description: '',
    occurredAt: dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
    estimatedLoss: undefined,
    responsibleUserId: undefined
  })
  const form = ref(initial())
  const rules: FormRules<OrderExceptionCreate> = {
    exceptionType: [{ required: true, message: '请选择异常类型', trigger: 'change' }],
    stage: [{ required: true, message: '请选择发生节点', trigger: 'change' }],
    occurredAt: [{ required: true, message: '请选择发生时间', trigger: 'change' }],
    description: [
      { required: true, whitespace: true, message: '请填写异常描述', trigger: 'blur' },
      { min: 2, max: 2000, message: '异常描述需为 2 至 2000 字', trigger: 'blur' }
    ]
  }
  const items = computed<FormItem[]>(() => [
    {
      key: 'responsibleUserId',
      label: '责任 / 跟进人',
      type: 'userSelect',
      span: 24,
      props: { options: users.value, placeholder: '选择订单所属租户的跟进人（可暂不指定）' }
    },
    {
      key: 'exceptionType',
      label: '异常类型',
      type: 'select',
      props: {
        options: [
          { label: '延误', value: 'delay' },
          { label: '破损', value: 'damage' },
          { label: '丢货', value: 'lost' },
          { label: '扣货', value: 'detained' }
        ]
      }
    },
    {
      key: 'stage',
      label: '发生节点',
      type: 'select',
      props: {
        options: [
          { label: '提货', value: 'pickup' },
          { label: '在途', value: 'transit' },
          { label: '签收', value: 'delivery' }
        ]
      }
    },
    {
      key: 'occurredAt',
      label: '发生时间',
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        placeholder: '选择实际发生时间'
      }
    },
    {
      key: 'estimatedLoss',
      label: '损失预估',
      type: 'number',
      props: { min: 0, precision: 2, controlsPosition: 'right', placeholder: '待核实' },
      description: '单位：元；未核实留空，无损失填 0。'
    },
    {
      key: 'description',
      label: '异常描述',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 2000,
        showWordLimit: true,
        placeholder: '记录异常现象、影响及已知情况'
      }
    }
  ])
  async function submit(): Promise<boolean> {
    try {
      if (opening.value || loadError.value) return false
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await createOrderException({
        ...form.value,
        description: normalizeNonNullableText(form.value.description),
        estimatedLoss: normalizeNullableNumber(form.value.estimatedLoss),
        responsibleUserId: normalizeNullableText(form.value.responsibleUserId)
      })
      ElMessage.success('异常已登记')
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '异常登记失败，请检查填写内容后重试')
      return false
    }
  }
  async function loadOptions(): Promise<void> {
    const order = context.value
    if (!order) return
    const version = ++loadVersion
    opening.value = true
    loadError.value = ''
    try {
      const tenantId = order.tenantId || (await fetchOrderDetail(order.orderId)).data?.tenantId
      if (!tenantId) throw new Error('未能确认订单所属租户，请刷新订单后重试')
      const result = await fetchWorkflowUserOptions({ tenantId }, { showErrorMessage: false })
      if (result.error)
        throw new Error('跟进人读取失败，请稍后重新打开登记窗口', { cause: result.error })
      if (version !== loadVersion) return
      users.value = (result.data ?? []).map((user) => ({
        value: user.id,
        label: user.nickName || user.userName || user.userEmail,
        userName: user.userName ?? undefined,
        nickName: user.nickName ?? undefined,
        userEmail: user.userEmail,
        avatar: user.avatar ?? undefined
      }))
    } catch (error) {
      if (version === loadVersion)
        loadError.value = getFriendlySupabaseErrorMessage(error, '登记窗口加载失败，请重试')
    } finally {
      if (version === loadVersion) opening.value = false
    }
  }
  async function handleOpen(order: OrderContext): Promise<void> {
    context.value = order
    users.value = []
    loadError.value = ''
    opening.value = true
    form.value = { ...initial(), orderId: order.orderId }
    await dialogRef.value?.handleOpen(order, {
      title: '登记运输异常',
      subtitle: `订单 ${order.orderNo} · 核实系统提示后登记，进入异常处理流程。`,
      onOpen: loadOptions,
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
