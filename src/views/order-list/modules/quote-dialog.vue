<template>
  <ArtDialog :loading="reloadLoading" ref="dialogRef" size="xl" :show-fullscreen-button="true">
    <ArtAsyncState
      v-if="loadError"
      error="报价信息加载失败，请重试"
      error-title="报价信息加载失败"
      error-description="请重新加载后核对最新报价信息。"
      @retry="loadQuote"
    />
    <div v-else-if="order" class="space-y-4 pb-2">
      <ArtEntitySummary icon="ri:file-list-3-line" :title="order.orderNo" compact>
        <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <strong>{{ order.orderNo }}</strong>
          <span class="text-sm text-[var(--art-gray-700)]">
            {{ order.originStation || '始发站未填' }} →
            {{ order.destinationStation || '到货站未填' }}
          </span>
        </div>
        <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--art-gray-700)]">
          <span>报价单号：{{ quoteNo || '保存后生成' }}</span>
          <span>发货方：{{ order.shippingContactName || '—' }}</span>
          <span>收货方：{{ order.receivingContactName || '—' }}</span>
        </div>
        <template #aside>
          <ArtDictDisplay
            v-if="quoteStatus === 'draft' || quoteStatus === 'submitted'"
            dict-code="tmsOrderQuoteStatus"
            :value="quoteStatus"
          />
          <ElTag v-else-if="quoteStatus === 'pending_approval'" type="warning" effect="plain"
            >审批中</ElTag
          >
          <ElTag v-else-if="quoteStatus === 'approved'" type="success" effect="plain">已生效</ElTag>
          <ElTag v-else-if="quoteStatus === 'rejected'" type="danger" effect="plain">已驳回</ElTag>
        </template>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form"
        v-model:active-tab="activeTab"
        class="quote-dialog__form"
        :items="formItems"
        :rules="amountRules"
        :span="8"
        :gutter="12"
        label-position="top"
      >
        <template #supplementaryItems>
          <ArtSectionCard
            title="补充费用"
            subtitle="从费用项目树中多选添加，再逐项填写金额和说明。"
            :show-scrollbar="false"
            :empty="!form.supplementaryItems.length"
            empty-title="暂无补充费用"
            empty-description="点击右上角「添加费用」，选择需要计入报价的费用项目。"
          >
            <template #actions>
              <ElButton
                v-auth="'TmsOrderList:Quote'"
                type="primary"
                plain
                :disabled="quoteLocked || reloadLoading"
                @click="expensePickerRef?.open()"
              >
                <ArtSvgIcon icon="ri:add-line" aria-hidden="true" />
                添加费用
              </ElButton>
            </template>
            <ArtTable
              v-if="form.supplementaryItems.length"
              ref="expenseTableRef"
              :data="form.supplementaryItems"
              :columns="expenseColumns"
              row-key="code"
              :height="form.supplementaryItems.length > 5 ? 320 : undefined"
            >
              <template #code="{ row }">
                <div class="min-w-0 py-1 leading-5">
                  <div class="break-words font-medium text-[var(--art-gray-900)]">
                    {{ expenseLabel(row.code) }}
                  </div>
                  <div class="break-all text-xs text-[var(--art-gray-700)]">
                    {{ expenseCode(row.code) }}
                  </div>
                </div>
              </template>
              <template #amount="{ row }"
                ><ElInputNumber
                  v-model="row.amount"
                  v-bind="moneyProps"
                  placeholder="请输入金额"
                  :aria-label="expenseLabel(row.code) + '金额（元）'"
              /></template>
              <template #remark="{ row }"
                ><ElInput
                  v-model="row.remark"
                  maxlength="200"
                  :aria-label="expenseLabel(row.code) + '备注'"
                  placeholder="费用说明（选填）"
              /></template>
              <template #operation="{ row }"
                ><ArtIconButton
                  v-auth="'TmsOrderList:Quote'"
                  icon="ri:delete-bin-line"
                  tone="danger"
                  :label="'移除' + expenseLabel(row.code)"
                  @click="removeExpenseItem(row.code)"
              /></template>
            </ArtTable>
            <template #footer>
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span class="text-[var(--art-gray-700)]">
                  已添加 {{ form.supplementaryItems.length }} 项
                </span>
                <div class="flex items-baseline gap-3">
                  <span class="text-[var(--art-gray-700)]">报价合计（含税）</span>
                  <strong class="text-lg tabular-nums text-[var(--el-color-primary)]">
                    ¥{{
                      formatNumberValue(totalAmount, 'zh-CN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })
                    }}
                  </strong>
                </div>
              </div>
            </template>
          </ArtSectionCard>
        </template>
        <template #attachmentUrls>
          <section>
            <ArtSectionTitle>报价附件</ArtSectionTitle>
            <p class="mb-3 mt-1 text-sm text-[var(--art-gray-600)]">
              可附报价清单或说明文件，最多 6 个，单个不超过 20 MB。
            </p>
            <ArtUploadFile
              ref="attachmentRef"
              v-model="form.attachmentUrls"
              multiple
              :limit="6"
              :file-size="20 * 1024 * 1024"
              :resource-tenant-id="order.tenantId || ''"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,image/*"
            /> </section
        ></template>
      </ArtForm>
    </div>

    <ArtTreeMultipleSelect
      ref="expensePickerRef"
      :data="expenseItems"
      :show-trigger="false"
      reset-draft-on-open
      title="选择补充费用项目"
      subtitle="可多选启用的记账项目；分组仅用于浏览，已添加的项目无需重复选择。"
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

    <template #footer="{ loading, api }">
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <ElButton :disabled="loading" @click="api.handleClose()">返回</ElButton>
        <ElButton
          v-auth="'TmsOrderList:Quote'"
          :loading="loading && submitMode === 'save'"
          :disabled="loading || reloadLoading || loadError || !order || quoteLocked"
          @click="handleFooterConfirm(api, 'save')"
        >
          保存报价
        </ElButton>
        <ElButton
          v-auth="'TmsOrderList:Quote'"
          type="primary"
          :loading="loading && submitMode === 'submit'"
          :disabled="loading || reloadLoading || loadError || !order || quoteLocked"
          @click="handleFooterConfirm(api, 'submit')"
        >
          提交报价
        </ElButton>
      </div>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatNumberValue } from '@/utils/ui/format'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { cloneDeep, isEqual, round, toNumber } from 'lodash-es'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtTreeMultipleSelect from '@/components/core/forms/art-data-select/tree-multiple.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectModelValue
  } from '@/components/core/forms/art-data-select/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import TreeUtils from '@/utils/tree'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import { fetchOrderQuote, saveOrderQuote } from '@tms/api'
  import {
    fetchAbnormalFreightExpenseItems,
    type AbnormalFreightExpenseItem
  } from '@tms/api/modules/abnormal-freight'

  defineOptions({ name: 'TmsOrderQuoteDialog' })

  type OrderRecord = Api.Tms.Order.OrderRecord
  type QuotePayload = Api.Tms.Order.OrderQuotePayload
  type AmountKey =
    | 'transportFee'
    | 'unloadingFee'
    | 'deliveryFee'
    | 'insuranceFee'
    | 'taxFee'
    | 'prepayment'
    | 'arrivalPayment'
    | 'collectPayment'
  type SupplementaryItem = QuotePayload['supplementaryItems'][number]
  type EditableItem = Omit<SupplementaryItem, 'amount'> & { amount: number | null | undefined }
  type QuoteForm = Omit<QuotePayload, AmountKey | 'supplementaryItems'> &
    Record<AmountKey, number | null | undefined> & { supplementaryItems: EditableItem[] }
  type SubmitMode = 'save' | 'submit'
  type FooterApi = Pick<ArtDialogExpose<OrderRecord>, 'handleConfirm' | 'confirmLoading'>

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<OrderRecord>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('feeSection')
  const expenseTableRef = ref<ArtTableExpose<EditableItem>>()
  const expensePickerRef = ref<ArtDataSelectExpose>()
  const attachmentRef = ref<{ hasPendingUpload: () => boolean }>()
  const orderId = ref('')
  const order = ref<OrderRecord | null>(null)
  const quoteStatus = ref<
    'draft' | 'submitted' | 'pending_approval' | 'approved' | 'rejected' | ''
  >('')
  const quoteLocked = computed(
    () => quoteStatus.value === 'pending_approval' || quoteStatus.value === 'approved'
  )
  const quoteNo = ref('')
  const expenseItems = ref<AbnormalFreightExpenseItem[]>([])
  const expenseTree = new TreeUtils({ parentKey: 'parentId' })
  const expenseOptions = computed(() => expenseTree.treeToList(expenseItems.value))
  const form = ref<QuoteForm>(createInitialForm())
  const loadError = ref(false)
  const reloadLoading = ref(false)
  const submitMode = ref<SubmitMode>('save')
  let loadRequestId = 0

  const totalAmount = computed(() =>
    round(
      moneyValue(form.value.transportFee) +
        moneyValue(form.value.unloadingFee) +
        moneyValue(form.value.deliveryFee) +
        moneyValue(form.value.insuranceFee) +
        moneyValue(form.value.taxFee) +
        form.value.supplementaryItems.reduce((sum, item) => sum + moneyValue(item.amount), 0),
      2
    )
  )

  const moneyProps = {
    min: 0,
    max: 9999999999.99,
    precision: 2,
    controls: false,
    class: 'w-full!'
  }
  const formItems: FormItem[] = [
    { key: 'feeSection', label: '报价费用', type: 'tab' },
    { key: 'transportFee', label: '运输费（元）', type: 'number', props: moneyProps },
    { key: 'unloadingFee', label: '卸货费（元）', type: 'number', props: moneyProps },
    { key: 'deliveryFee', label: '送货费（元）', type: 'number', props: moneyProps },
    { key: 'insuranceFee', label: '保险费（元）', type: 'number', props: moneyProps },
    { key: 'taxFee', label: '税费（元）', type: 'number', props: moneyProps },
    { key: 'supplementaryItems', label: '', span: 24, labelWidth: 0 },
    { key: 'paymentSection', label: '付款与附件', type: 'tab' },
    { key: 'prepayment', label: '预付款（元）', type: 'number', props: moneyProps },
    { key: 'arrivalPayment', label: '货到付款（元）', type: 'number', props: moneyProps },
    { key: 'collectPayment', label: '代收货款（元）', type: 'number', props: moneyProps },
    {
      key: 'remark',
      label: '报价备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true }
    },
    { key: 'attachmentUrls', label: '', span: 24, labelWidth: 0 }
  ]

  const validAmount = (value: unknown): boolean =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 9999999999.99 &&
    round(value, 2) === value
  const amountRules: FormRules<QuoteForm> = Object.fromEntries(
    [
      'transportFee',
      'unloadingFee',
      'deliveryFee',
      'insuranceFee',
      'taxFee',
      'prepayment',
      'arrivalPayment',
      'collectPayment'
    ].map((key) => [
      key,
      [
        {
          validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) =>
            callback(
              value === undefined || value === null || validAmount(value)
                ? undefined
                : new Error('费用金额须为非负数，最多保留两位小数')
            ),
          trigger: ['blur', 'change']
        }
      ]
    ])
  )
  const expenseColumns: ColumnOption<EditableItem>[] = [
    { prop: 'code', label: '费用项目', minWidth: 150, useSlot: true },
    {
      prop: 'amount',
      label: '金额（元）',
      width: 165,
      useSlot: true,
      required: true,
      headerTooltip: '金额须为非负数，最多保留两位小数；计入本次报价总额。',
      rules: {
        validator: ({ value }) => validAmount(value),
        message: ({ rowIndex }) =>
          '第 ' + (rowIndex + 1) + ' 项补充费用须为非负数，最多保留两位小数'
      }
    },
    { prop: 'remark', label: '费用说明', minWidth: 220, useSlot: true },
    { prop: 'operation', label: '操作', width: 68, fixed: 'right', useSlot: true }
  ]

  function createInitialForm(): QuoteForm {
    return {
      transportFee: undefined,
      unloadingFee: undefined,
      deliveryFee: undefined,
      insuranceFee: undefined,
      taxFee: undefined,
      supplementaryItems: [],
      prepayment: undefined,
      arrivalPayment: undefined,
      collectPayment: undefined,
      remark: '',
      attachmentUrls: []
    }
  }

  function moneyValue(value?: number | string | null): number {
    const amount = toNumber(value ?? 0)
    return Number.isFinite(amount) ? amount : 0
  }

  function initialOrderAmount(value?: number | string | null): number | undefined {
    const amount = moneyValue(value)
    return amount > 0 ? amount : undefined
  }

  function createPayload(values: QuoteForm): QuotePayload {
    return {
      ...values,
      transportFee: moneyValue(values.transportFee),
      unloadingFee: moneyValue(values.unloadingFee),
      deliveryFee: moneyValue(values.deliveryFee),
      insuranceFee: moneyValue(values.insuranceFee),
      taxFee: moneyValue(values.taxFee),
      prepayment: moneyValue(values.prepayment),
      arrivalPayment: moneyValue(values.arrivalPayment),
      collectPayment: moneyValue(values.collectPayment),
      supplementaryItems: values.supplementaryItems.map((item) => ({
        ...item,
        amount: Number(item.amount)
      }))
    }
  }

  function expenseLabel(code: string): string {
    const option = expenseOptions.value.find((item) => item.id === code)
    return option?.itemName || code
  }

  function expenseCode(code: string): string {
    return expenseOptions.value.find((item) => item.id === code)?.itemCode || code
  }

  const isExpenseItemDisabled = (item: AbnormalFreightExpenseItem): boolean =>
    !item.isEnabled ||
    !item.isSelectable ||
    form.value.supplementaryItems.some((line) => line.code === item.id)

  function addExpenseItems(_keys: DataSelectModelValue, items: AbnormalFreightExpenseItem[]): void {
    if (quoteLocked.value) return
    form.value.supplementaryItems.push(
      ...items
        .filter((item) => !isExpenseItemDisabled(item))
        .map((item) => ({
          code: item.id,
          amount: undefined,
          remark: ''
        }))
    )
  }

  function removeExpenseItem(code: string): void {
    form.value.supplementaryItems = form.value.supplementaryItems.filter(
      (item) => item.code !== code
    )
  }

  async function loadQuote(): Promise<void> {
    if (!orderId.value) return
    const requestId = ++loadRequestId
    const currentOrderId = orderId.value
    reloadLoading.value = true
    loadError.value = false
    try {
      const [result] = await Promise.all([
        fetchOrderQuote(currentOrderId, { showErrorMessage: false }),
        userStore.ensureDictLoaded('tmsOrderQuoteStatus')
      ])
      if (requestId !== loadRequestId) return
      const context = result.data
      if (!context) throw new Error('报价数据不可用')
      const tenantId = defaultWriteTenantId.value
      if (!tenantId) throw new Error('当前租户信息缺失，请刷新页面后重试')
      const expenseResult = await fetchAbnormalFreightExpenseItems(tenantId)
      if (requestId !== loadRequestId) return
      expenseItems.value = expenseResult.data || []
      order.value = { ...context.order, tenantId }
      quoteStatus.value = context.quote?.status || ''
      quoteNo.value = context.quote?.quoteNo || ''
      form.value = context.quote
        ? {
            transportFee: moneyValue(context.quote.transportFee),
            unloadingFee: moneyValue(context.quote.unloadingFee),
            deliveryFee: moneyValue(context.quote.deliveryFee),
            insuranceFee: moneyValue(context.quote.insuranceFee),
            taxFee: moneyValue(context.quote.taxFee),
            supplementaryItems: context.quote.supplementaryItems.map((item) => ({ ...item })),
            prepayment: moneyValue(context.quote.prepayment),
            arrivalPayment: moneyValue(context.quote.arrivalPayment),
            collectPayment: moneyValue(context.quote.collectPayment),
            remark: context.quote.remark || '',
            attachmentUrls: [...context.quote.attachmentUrls]
          }
        : {
            ...createInitialForm(),
            transportFee: initialOrderAmount(context.order.transportFee),
            unloadingFee: initialOrderAmount(context.order.unloadingFee),
            deliveryFee: initialOrderAmount(context.order.deliveryFee),
            insuranceFee: initialOrderAmount(context.order.insuranceFee)
          }
    } catch {
      if (requestId === loadRequestId) loadError.value = true
    } finally {
      if (requestId === loadRequestId) reloadLoading.value = false
    }
  }

  function validateAmounts(): boolean {
    if (totalAmount.value > 9999999999.99) {
      ElMessage.warning('报价总额不能超过 9,999,999,999.99 元')
      return false
    }
    return true
  }

  async function handleSubmit(): Promise<boolean> {
    if (!orderId.value || loadError.value || reloadLoading.value || !order.value) return false
    const currentOrderId = orderId.value
    const requestId = loadRequestId
    const formSnapshot = cloneDeep(form.value)
    const mode = submitMode.value
    const isCurrent = () => currentOrderId === orderId.value && requestId === loadRequestId
    if (attachmentRef.value?.hasPendingUpload()) {
      ElMessage.warning('请等待附件上传完成后再保存报价')
      return false
    }
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const result = await expenseTableRef.value?.validate({ focus: false })
      if (result && !result.valid) {
        await formRef.value?.focusField('supplementaryItems')
        if (result.firstError) await expenseTableRef.value?.validateField(result.firstError.prop)
        ElMessage.warning(result.firstError?.message || '请检查补充费用金额')
        return false
      }
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    if (!isCurrent() || loadError.value || reloadLoading.value) return false
    if (attachmentRef.value?.hasPendingUpload()) {
      ElMessage.warning('请等待附件上传完成后再保存报价')
      return false
    }
    if (!isEqual(formSnapshot, form.value) || mode !== submitMode.value) {
      ElMessage.warning('报价内容已变化，请检查后重新提交')
      return false
    }
    if (!validateAmounts()) return false
    if (submitMode.value === 'submit' && totalAmount.value <= 0) {
      await formRef.value?.focusField('transportFee')
      ElMessage.warning('提交报价前请填写费用金额')
      return false
    }
    const payload = createPayload(formSnapshot)
    try {
      await saveOrderQuote(currentOrderId, payload, mode === 'submit', { showErrorMessage: false })
      emit('success')
      if (!isCurrent()) return false
      if (!isEqual(formSnapshot, form.value)) {
        ElMessage.warning(
          mode === 'submit'
            ? '本次报价已提交，后续修改尚未保存，请检查报价状态后再办理'
            : '本次报价已保存，后续修改尚未保存，请检查后再次保存'
        )
        return false
      }
      ElMessage.success(mode === 'submit' ? '报价已提交到系统' : '报价已保存')
      return true
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '报价保存失败，请检查费用、附件和网络后重试')
      return false
    }
  }

  function handleFooterConfirm(api: FooterApi, mode: SubmitMode): void {
    if (api.confirmLoading.value || reloadLoading.value) return
    submitMode.value = mode
    void api.handleConfirm()
  }

  async function handleOpen(row: OrderRecord): Promise<void> {
    activeTab.value = 'feeSection'
    if (!row.id) return
    orderId.value = row.id
    order.value = row
    form.value = createInitialForm()
    quoteStatus.value = ''
    quoteNo.value = ''
    expenseItems.value = []
    loadError.value = false
    await dialogRef.value?.handleOpen(row, {
      title: `报价 · ${row.orderNo}`,
      subtitle: '填写完整报价；生效时替换订单原费用，已批准的客户异常应收另行累计。',
      onOpen: async (_row, api) => {
        api.setLoading(true)
        try {
          await loadQuote()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onClose: () => {
        loadRequestId += 1
        orderId.value = ''
        order.value = null
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .quote-dialog__form {
    :deep(.el-form-item) {
      margin-bottom: var(--art-space-3);
    }

    :deep(.el-form-item--label-top .el-form-item__label) {
      margin-bottom: var(--art-space-1);
    }
  }
</style>
