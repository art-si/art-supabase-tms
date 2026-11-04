<template>
  <ArtDialog ref="dialogRef" size="xl" :show-fullscreen-button="true">
    <ArtAsyncState v-if="loading || loadError" :error="loadError ? '异常运费加载失败，请重试' : null" @retry="loadData" />
    <div v-else class="space-y-5">
      <div class="rounded-[var(--custom-radius)] bg-[var(--art-gray-100)] p-4 text-sm text-[var(--art-gray-700)]">
        <strong class="text-[var(--art-gray-900)]">{{ order?.orderNo }}</strong>
        <span class="ml-3">{{ order?.originStation || '始发站' }} → {{ order?.destinationStation || '到货站' }}</span>
        <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <span>运单：{{ order?.waybillNo || '—' }}</span>
          <span>司机：{{ order?.dispatchDriverName || '—' }}</span>
          <span>车牌：{{ order?.dispatchPlateNo || '—' }}</span>
        </div>
      </div>
      <div v-if="documents.length" class="space-y-2">
        <ArtSectionTitle>已有异常运费</ArtSectionTitle>
        <div v-for="document in documents" :key="document.id" class="flex flex-wrap justify-between gap-2 border-b border-[var(--art-gray-200)] py-2 text-sm">
          <span>{{ document.documentNo }} · {{ ownershipLabel(document.ownership) }}</span>
          <strong class="tabular-nums">¥{{ Number(document.totalAmount).toFixed(2) }}</strong>
        </div>
      </div>
      <ArtForm ref="formRef" v-model="form" :items="formItems" :rules="formRules" :span="12" />
      <section>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <ArtSectionTitle>异常事件</ArtSectionTitle>
          <ElButton v-auth="'TmsOrderList:EditFreight'" @click="addLine">添加事件</ElButton>
        </div>
        <p class="my-2 text-sm text-[var(--art-gray-700)]">每项记录费用项目、金额、发生时间与凭证。保存后生成独立单号。</p>
        <ArtTable :data="form.lines" :columns="columns" row-key="key" class="mt-3">
          <template #expenseItemId="{ row }">
            <ElSelect v-model="row.expenseItemId" filterable class="w-full" placeholder="选择费用项目" aria-label="费用项目">
              <ElOption v-for="item in expenseItems" :key="item.id" :label="item.itemName" :value="item.id" />
            </ElSelect>
          </template>
          <template #amount="{ row }"><ElInputNumber v-model="row.amount" :min="0.01" :precision="2" :controls="false" class="w-full!" aria-label="异常金额" /></template>
          <template #occurredAt="{ row }"><ElDatePicker v-model="row.occurredAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" class="w-full!" aria-label="发生时间" /></template>
          <template #description="{ row }"><ElInput v-model="row.description" maxlength="500" type="textarea" :rows="2" aria-label="异常说明" /></template>
          <template #attachments="{ row }"><ArtUploadFile v-model="row.attachments" multiple :limit="6" :file-size="20 * 1024 * 1024" :resource-tenant-id="order?.tenantId || ''" /></template>
          <template #operation="{ row }"><ArtIconButton icon="ri:delete-bin-line" tone="danger" label="移除事件" @click="removeLine(row.key)" /></template>
        </ArtTable>
        <div class="mt-3 text-right text-sm text-[var(--art-gray-700)]">合计 <strong class="ml-2 text-lg tabular-nums text-[var(--el-color-primary)]">¥{{ totalAmount.toFixed(2) }}</strong></div>
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { ColumnOption } from '@/types'
  import { fetchOrderQuoteExpenseItems, type OrderQuoteExpenseItem } from '@tms/api'
  import { fetchAbnormalFreightDocuments, saveAbnormalFreightDocument, type AbnormalFreightDocument, type AbnormalFreightOwnership } from '@tms/api/modules/abnormal-freight'

  defineOptions({ name: 'TmsOrderFreightDialog' })
  type OrderRecord = Api.Tms.Order.OrderRecord
  type Line = { key: string; expenseItemId: string; amount: number; description: string; occurredAt: string; attachments: string[] }
  type Form = { ownership: AbnormalFreightOwnership; lines: Line[] }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OrderRecord>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const order = ref<OrderRecord | null>(null)
  const form = ref<Form>({ ownership: 'customer_receivable', lines: [] })
  const documents = ref<AbnormalFreightDocument[]>([])
  const expenseItems = ref<OrderQuoteExpenseItem[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  const formItems: FormItem[] = [
    { key: 'ownership', label: '费用承担方', type: 'select', span: 12, options: [
      { label: '客户应收', value: 'customer_receivable' },
      { label: '承运商扣款', value: 'carrier_deduction' },
      { label: '我方承担', value: 'own' }
    ], description: '客户应收计入客户费用；承运商扣款用于应付抵减。' }
  ]
  const formRules: FormRules<Form> = { ownership: [{ required: true, message: '请选择费用承担方', trigger: 'change' }] }
  const columns: ColumnOption<Line>[] = [
    { prop: 'expenseItemId', label: '费用项目', minWidth: 150, useSlot: true },
    { prop: 'amount', label: '金额（元）', width: 145, useSlot: true },
    { prop: 'occurredAt', label: '发生时间', width: 190, useSlot: true },
    { prop: 'description', label: '异常说明', minWidth: 190, useSlot: true },
    { prop: 'attachments', label: '附件', minWidth: 190, useSlot: true },
    { prop: 'operation', label: '操作', width: 70, useSlot: true }
  ]
  const totalAmount = computed(() => form.value.lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0))
  const ownershipLabel = (value: AbnormalFreightOwnership) => ({ customer_receivable: '客户应收', carrier_deduction: '承运商扣款', own: '我方承担' })[value]
  function addLine() { form.value.lines.push({ key: crypto.randomUUID(), expenseItemId: '', amount: 0, description: '', occurredAt: dayjs().format(), attachments: [] }) }
  function removeLine(key: string) { form.value.lines = form.value.lines.filter((line) => line.key !== key) }
  async function loadData() {
    if (!order.value?.id) return
    loading.value = true
    loadError.value = false
    try {
      const [documentsResult, itemsResult] = await Promise.all([
        fetchAbnormalFreightDocuments(order.value.id),
        fetchOrderQuoteExpenseItems(order.value.tenantId || '')
      ])
      documents.value = documentsResult.data || []
      expenseItems.value = itemsResult.data || []
    } catch { loadError.value = true }
    finally { loading.value = false }
  }
  async function handleSubmit(): Promise<boolean> {
    if (!order.value?.id || !(await validateArtFormForSubmit(formRef.value))) return false
    if (!form.value.lines.length) { ElMessage.warning('请至少添加一项异常事件'); return false }
    for (const [index, line] of form.value.lines.entries()) {
      if (!expenseItems.value.some((item) => item.id === line.expenseItemId) || !Number.isFinite(line.amount) || line.amount <= 0 || !line.occurredAt || !line.description.trim()) {
        ElMessage.warning('请完善第 ' + (index + 1) + ' 项异常事件的费用项目、金额、时间和说明')
        return false
      }
    }
    try {
      await saveAbnormalFreightDocument({ orderId: order.value.id, ownership: form.value.ownership, lines: form.value.lines.map(({ key: _key, ...line }) => line) })
      ElMessage.success('异常运费已保存')
      emit('success')
      return true
    } catch (error) { notifyFriendlyError(error, '异常运费保存失败，请重试'); return false }
  }
  async function handleOpen(row: OrderRecord): Promise<void> {
    if (!row.id) return
    order.value = row
    documents.value = []
    expenseItems.value = []
    form.value = { ownership: 'customer_receivable', lines: [] }
    addLine()
    await dialogRef.value?.handleOpen(row, { title: '异常运费', subtitle: '登记独立异常费用单，保留订单与调度信息快照。', onOpen: loadData, onConfirm: handleSubmit })
  }
  defineExpose({ handleOpen })
</script>
