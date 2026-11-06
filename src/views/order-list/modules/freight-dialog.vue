<template>
  <ArtDialog
    ref="dialogRef"
    size="xl"
    :loading="loading"
    :confirm-disabled="!formRef?.readyToSubmit || loading || loadError"
    :show-fullscreen-button="true"
    @close="invalidateLoad"
  >
    <ArtAsyncState v-if="loadError" error="异常运费加载失败，请重试" @retry="loadData" />
    <div v-else class="space-y-4">
      <ArtEntitySummary icon="ri:truck-line" :title="order?.orderNo" compact>
        <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <strong>{{ order?.orderNo }}</strong>
          <span class="text-sm text-[var(--art-gray-700)]">{{ routeDescription }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--art-gray-700)]">
          <span>运单：{{ order?.waybillNo || '—' }}</span>
          <span>司机：{{ order?.dispatchDriverName || '—' }}</span>
          <span>车牌：{{ order?.dispatchPlateNo || '—' }}</span>
        </div>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="formRules"
        :span="24"
        :gutter="12"
        label-position="top"
        class="freight-dialog__form"
      >
        <template #lines>
          <ArtSectionCard
            title="异常事件"
            :show-scrollbar="false"
            :empty="!form.lines.length"
            empty-title="暂无异常事件"
            empty-description="点击右上角「添加事件」，选择本次需要登记的费用项目。"
            class="w-full"
          >
            <template #actions>
              <ElButton
                v-auth="'TmsOrderList:EditFreight'"
                type="primary"
                plain
                :disabled="form.lines.length >= 20 || loading"
                @click="expensePickerRef?.open()"
              >
                <ArtSvgIcon icon="ri:add-line" aria-hidden="true" />
                添加事件
              </ElButton>
            </template>
            <p class="mb-2 text-xs text-[var(--art-gray-700)] sm:hidden">
              左右滑动表格，填写金额、发生时间与异常说明。
            </p>
            <ArtTable ref="tableRef" :data="form.lines" :columns="columns" row-key="key">
              <template #expenseItemId="{ row }">
                <div class="min-w-0 py-1 leading-5">
                  <div class="break-words font-medium text-[var(--art-gray-900)]">
                    {{ row.expenseItem.itemName }}
                  </div>
                  <div class="break-all text-xs text-[var(--art-gray-700)]">
                    {{ row.expenseItem.itemCode }}
                  </div>
                </div>
              </template>
              <template #amount="{ row }">
                <ElInputNumber
                  v-model="row.amount"
                  :min="0"
                  :max="9999999999.99"
                  :precision="2"
                  :controls="false"
                  placeholder="请输入金额"
                  class="w-full!"
                  aria-label="异常金额"
                />
              </template>
              <template #occurredAt="{ row }">
                <ElDatePicker
                  v-model="row.occurredAt"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ssZ"
                  format="YYYY-MM-DD HH:mm"
                  placeholder="选择发生时间"
                  class="w-full!"
                  aria-label="发生时间"
                />
              </template>
              <template #description="{ row }">
                <ElInput
                  v-model="row.description"
                  maxlength="500"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  :input-style="{ lineHeight: '20px' }"
                  placeholder="填写异常原因及情况"
                  aria-label="异常说明"
                />
              </template>
              <template #attachments="{ row }">
                <ArtUploadFile
                  v-model="row.attachments"
                  multiple
                  :limit="6"
                  :file-size="20 * 1024 * 1024"
                  :show-tip="false"
                  :resource-tenant-id="expenseTenantId"
                />
              </template>
              <template #operation="{ row }">
                <ArtIconButton
                  v-auth="'TmsOrderList:EditFreight'"
                  icon="ri:delete-bin-line"
                  tone="danger"
                  label="移除事件"
                  @click="removeLine(row.key)"
                />
              </template>
            </ArtTable>
            <template #footer>
              <div
                class="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--art-gray-700)]"
              >
                <span>已添加 {{ form.lines.length }} / 20 项</span>
                <div class="flex items-center gap-2">
                  <span>合计</span>
                  <strong class="text-lg tabular-nums text-[var(--el-color-primary)]">
                    {{ formatCurrencyValue(totalAmount) }}
                  </strong>
                </div>
              </div>
            </template>
          </ArtSectionCard>
        </template>
      </ArtForm>

      <ArtSectionCard v-if="documents.length" title="已有异常运费" :show-scrollbar="false">
        <div
          v-for="document in documents"
          :key="document.id"
          class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--art-gray-200)] py-2 text-sm last:border-0"
        >
          <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span class="break-words font-medium">{{ document.documentNo }}</span>
            <ArtDictDisplay dict-code="tmsAbnormalFreightOwnership" :value="document.ownership" />
            <ArtDictDisplay dict-code="tmsAbnormalFreightStatus" :value="document.status" />
          </div>
          <strong class="tabular-nums">{{ formatCurrencyValue(document.totalAmount) }}</strong>
        </div>
      </ArtSectionCard>
    </div>

    <ArtTreeMultipleSelect
      ref="expensePickerRef"
      :api-fn="loadExpenseItems"
      :show-trigger="false"
      reset-draft-on-open
      title="选择费用项目"
      subtitle="可多选启用的记账项目；分组仅用于浏览，已添加项目无需重复选择。"
      row-key="id"
      label-key="itemName"
      description-key="itemCode"
      :disabled-key="isExpenseItemDisabled"
      search-placeholder="搜索费用项目名称或编码"
      empty-text="暂无可用费用项目"
      empty-description="请先在费用项目中维护当前工作台租户的启用项目。"
      dialog-width="lg"
      @confirm="addExpenseItems"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { useWindowSize } from '@vueuse/core'
  import { ElMessage, type FormRules } from 'element-plus'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { resolveTenantWorkspaceId } from '@/utils/tenant-scope-context'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtTreeMultipleSelect from '@/components/core/forms/art-data-select/tree-multiple.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectApiFn,
    DataSelectModelValue
  } from '@/components/core/forms/art-data-select/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import type { ColumnOption } from '@/types'
  import {
    fetchAbnormalFreightDocuments,
    fetchAbnormalFreightExpenseItems,
    saveAbnormalFreightDocument,
    type AbnormalFreightExpenseItem,
    type AbnormalFreightDocument,
    type AbnormalFreightOwnership
  } from '@tms/api/modules/abnormal-freight'

  defineOptions({ name: 'TmsOrderFreightDialog' })
  type OrderRecord = Api.Tms.Order.OrderRecord
  type Line = {
    key: string
    expenseItemId: string
    expenseItem: Pick<AbnormalFreightExpenseItem, 'id' | 'itemName' | 'itemCode'>
    amount: number | undefined
    description: string
    occurredAt: string
    attachments: string[]
  }
  type Form = { ownership: AbnormalFreightOwnership; lines: Line[] }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OrderRecord>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const tableRef = ref<ArtTableExpose<Line>>()
  const expensePickerRef = ref<ArtDataSelectExpose>()
  const order = ref<OrderRecord | null>(null)
  const form = ref<Form>({ ownership: 'customer_receivable', lines: [] })
  const documents = ref<AbnormalFreightDocument[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  const tenantScopeStore = useTenantScopeStore()
  const userStore = useUserStore()
  const expenseTenantId = computed(() =>
    resolveTenantWorkspaceId(tenantScopeStore.effectiveTenantId, userStore.getUserInfo.tenantId)
  )
  const { width: viewportWidth } = useWindowSize()
  let loadVersion = 0
  const routeDescription = computed(
    () =>
      `${order.value?.originStation || '始发站'} → ${order.value?.destinationStation || '到货站'}`
  )
  const ownershipOptions = useDictionaryOptions('tmsAbnormalFreightOwnership')
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'ownership',
      label: '费用承担方',
      type: 'select',
      span: viewportWidth.value < 640 ? 24 : 12,
      options: [...ownershipOptions],
      description: '客户应收计入客户费用；承运商扣款用于应付抵减。'
    },
    { key: 'lines', label: '', span: 24, labelWidth: 0 }
  ])
  const formRules: FormRules<Pick<Form, 'ownership'>> = {
    ownership: [{ required: true, message: '请选择费用承担方', trigger: 'change' }]
  }
  const columns: ColumnOption<Line>[] = [
    { prop: 'expenseItemId', label: '费用项目', minWidth: 160, useSlot: true, required: true },
    {
      prop: 'amount',
      label: '金额（元）',
      width: 150,
      useSlot: true,
      required: true,
      requiredMessage: '请输入异常金额',
      headerTooltip: '必填，金额须大于 0，最多保留两位小数。',
      rules: {
        validator: ({ value }) =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value > 0 &&
          value <= 9999999999.99,
        message: '异常金额须大于 0，且不超过 9,999,999,999.99 元'
      }
    },
    {
      prop: 'occurredAt',
      label: '发生时间',
      width: 205,
      useSlot: true,
      required: true,
      requiredMessage: '请选择发生时间'
    },
    {
      prop: 'description',
      label: '异常说明',
      minWidth: 200,
      useSlot: true,
      required: true,
      requiredMessage: '请填写异常说明',
      rules: {
        validator: ({ value }) => typeof value === 'string' && Boolean(value.trim()),
        message: '请填写异常说明'
      }
    },
    {
      prop: 'attachments',
      label: '附件',
      minWidth: 220,
      useSlot: true,
      headerTooltip: '每项最多上传 6 个附件，单个文件不超过 20 MB。'
    },
    { prop: 'operation', label: '操作', width: 64, useSlot: true, fixed: 'right' }
  ]
  const totalAmount = computed(() =>
    form.value.lines.reduce((sum, line) => sum + (line.amount || 0), 0)
  )
  const loadExpenseItems: DataSelectApiFn<AbnormalFreightExpenseItem> = async () => {
    const tenantId = expenseTenantId.value
    if (!tenantId) throw new Error('当前租户信息缺失，请刷新页面后重试')
    const result = await fetchAbnormalFreightExpenseItems(tenantId)
    return { data: result.data || [] }
  }
  const isExpenseItemDisabled = (item: AbnormalFreightExpenseItem): boolean =>
    !item.isEnabled ||
    !item.isSelectable ||
    form.value.lines.some((line) => line.expenseItemId === item.id)

  function addExpenseItems(
    _value: DataSelectModelValue,
    items: AbnormalFreightExpenseItem[]
  ): void {
    const newItems = items.filter((item) => !isExpenseItemDisabled(item))
    if (form.value.lines.length + newItems.length > 20) {
      ElMessage.warning(`最多添加 20 项异常事件，本次还可添加 ${20 - form.value.lines.length} 项`)
      return
    }
    form.value.lines.push(
      ...newItems.map((expenseItem) => ({
        key: crypto.randomUUID(),
        expenseItemId: expenseItem.id,
        expenseItem: {
          id: expenseItem.id,
          itemName: expenseItem.itemName,
          itemCode: expenseItem.itemCode
        },
        amount: undefined,
        description: '',
        occurredAt: dayjs().format(),
        attachments: []
      }))
    )
  }
  function removeLine(key: string): void {
    form.value.lines = form.value.lines.filter((line) => line.key !== key)
  }
  function invalidateLoad(): void {
    loadVersion++
    loading.value = false
    expensePickerRef.value?.close()
  }
  async function loadData(): Promise<void> {
    if (!order.value?.id) return
    const version = ++loadVersion
    loading.value = true
    loadError.value = false
    try {
      const result = await fetchAbnormalFreightDocuments(order.value.id)
      if (version === loadVersion) documents.value = result.data || []
    } catch {
      if (version === loadVersion) loadError.value = true
    } finally {
      if (version === loadVersion) loading.value = false
    }
  }
  async function handleSubmit(): Promise<boolean> {
    if (loading.value || loadError.value || !order.value?.id) return false
    if (!formRef.value?.readyToSubmit) {
      ElMessage.warning('表单控件仍在加载，请稍后再提交')
      return false
    }
    if (!(await validateArtFormForSubmit(formRef.value))) {
      ElMessage.warning('请检查费用承担方')
      return false
    }
    if (!form.value.lines.length) {
      ElMessage.warning('请至少添加一项异常事件')
      return false
    }
    const validation = await tableRef.value?.validate()
    if (!validation || !validation.valid) {
      ElMessage.warning(validation?.firstError?.message || '请完善异常事件明细')
      return false
    }
    if (totalAmount.value > 9999999999.99) {
      ElMessage.warning('异常运费总额不能超过 9,999,999,999.99 元')
      return false
    }
    try {
      const result = await saveAbnormalFreightDocument({
        orderId: order.value.id,
        ownership: form.value.ownership,
        lines: form.value.lines.map((line) => ({
          expenseItemId: line.expenseItemId,
          amount: Number(line.amount),
          description: line.description,
          occurredAt: line.occurredAt,
          attachments: line.attachments
        }))
      })
      ElMessage.success(
        result.data?.status === 'approved'
          ? '异常运费已生效，订单费用已更新'
          : '异常运费已提交，审批通过后更新订单费用'
      )
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '异常运费保存失败，请重试')
      return false
    }
  }
  async function handleOpen(row: OrderRecord): Promise<void> {
    if (!row.id) return
    invalidateLoad()
    order.value = row
    documents.value = []
    form.value = { ownership: 'customer_receivable', lines: [] }
    await dialogRef.value?.handleOpen(row, {
      title: '异常运费',
      subtitle: '登记异常费用，提交后按审批结果更新订单费用。',
      confirmText: '提交异常运费',
      onOpen: loadData,
      onConfirm: handleSubmit
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .freight-dialog__form {
    :deep(.el-form-item) {
      margin-bottom: var(--art-space-3);
    }

    :deep(.el-form-item__label) {
      height: auto;
      margin-bottom: var(--art-space-1);
      line-height: 20px;
    }
  }
</style>
