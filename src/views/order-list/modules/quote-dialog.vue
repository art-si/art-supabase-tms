<template>
  <ArtDialog :loading="reloadLoading" ref="dialogRef" size="xl" :show-fullscreen-button="true">
    <ArtAsyncState
      v-if="loadError || reloadLoading"
      :error="loadError ? '报价信息加载失败，请重试' : null"
      error-title="报价信息加载失败"
      error-description="请重新加载后核对最新报价信息。"
      @retry="loadQuote"
    />
    <div v-else-if="order" class="space-y-5 pb-2">
      <section class="rounded-[var(--custom-radius)] bg-[var(--art-gray-100)] p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <strong class="text-base text-[var(--art-gray-900)]">{{ order.orderNo }}</strong>
            <span class="text-sm text-[var(--art-gray-700)]">报价单号：{{ quoteNo || '保存后生成' }}</span>
            <ArtDictDisplay v-if="quoteStatus === 'draft' || quoteStatus === 'submitted'" dict-code="tmsOrderQuoteStatus" :value="quoteStatus" />
            <ElTag v-else-if="quoteStatus === 'pending_approval'" type="warning" effect="plain">审批中</ElTag>
            <ElTag v-else-if="quoteStatus === 'approved'" type="success" effect="plain">已生效</ElTag>
            <ElTag v-else-if="quoteStatus === 'rejected'" type="danger" effect="plain">已驳回</ElTag>
          </div>
          <span class="text-sm text-[var(--art-gray-700)]">
            {{ order.originStation || '始发站未填' }} →
            {{ order.destinationStation || '到货站未填' }}
          </span>
        </div>
        <div class="grid gap-3 text-sm md:grid-cols-2">
          <div class="min-w-0">
            <span class="text-[var(--art-gray-600)]">发货方</span>
            <p class="mt-1 break-words text-[var(--art-gray-900)]">
              {{ order.shippingContactName || '—' }} · {{ order.shippingContactPhone || '—' }}
            </p>
            <p class="mt-1 break-words text-[var(--art-gray-700)]">
              {{ order.shippingAddressDetail || '未填写发货地址' }}
            </p>
          </div>
          <div class="min-w-0">
            <span class="text-[var(--art-gray-600)]">收货方</span>
            <p class="mt-1 break-words text-[var(--art-gray-900)]">
              {{ order.receivingContactName || '—' }} · {{ order.receivingContactPhone || '—' }}
            </p>
            <p class="mt-1 break-words text-[var(--art-gray-700)]">
              {{ order.receivingAddressDetail || '未填写收货地址' }}
            </p>
          </div>
        </div>
        <div
          class="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--art-gray-200)] pt-3 text-sm text-[var(--art-gray-700)]"
        >
          <span>发货：{{ formatWithDayjs(order.departureAt) || '—' }}</span>
          <span>到货：{{ formatWithDayjs(order.arrivalAt) || '—' }}</span>
          <span>数量：{{ order.cargoQuantityTotal ?? 0 }}</span>
          <span>重量：{{ order.cargoWeightTotal ?? 0 }} kg</span>
          <span>体积：{{ order.cargoVolumeTotal ?? 0 }} m³</span>
        </div>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form"
        v-model:active-tab="activeTab"
        :items="formItems"
        :rules="amountRules"
        :span="8"
        :gutter="16"
      >
        <template #supplementaryItems>
          <section>
            <ArtSectionTitle>补充费用</ArtSectionTitle>
            <p class="mb-3 mt-3 text-sm text-[var(--art-gray-700)]">
              选择一项后立即加入下方，可继续选择其他费用。
            </p>
            <div class="rounded-[var(--custom-radius)] bg-[var(--art-gray-100)] p-3 sm:p-4">
              <ElSelect
                v-model="selectedExpenseCode"
                filterable
                class="w-full"
                placeholder="选择要添加的费用项"
                aria-label="添加补充费用项"
                :disabled="form.supplementaryItems.length >= expenseOptions.length"
                @change="addExpenseItem"
              >
                <ElOption
                  v-for="option in expenseOptions"
                  :key="option.id"
                  :label="`${option.itemName}（${option.itemCode}）`"
                  :value="option.id"
                  :disabled="form.supplementaryItems.some((item) => item.code === option.id)"
                />
              </ElSelect>
              <ArtTable
                v-if="form.supplementaryItems.length"
                ref="expenseTableRef"
                :data="form.supplementaryItems"
                :columns="expenseColumns"
                row-key="code"
                class="mt-3"
                :height="form.supplementaryItems.length > 5 ? 320 : undefined"
              >
                <template #code="{ row }">{{ expenseLabel(row.code) }}</template>
                <template #amount="{ row }"
                  ><ElInputNumber
                    v-model="row.amount"
                    v-bind="moneyProps"
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
                    icon="ri:delete-bin-line"
                    tone="danger"
                    :label="'移除' + expenseLabel(row.code)"
                    @click="removeExpenseItem(row.code)"
                /></template>
              </ArtTable>
              <ArtEmptyState
                v-else
                title="暂无补充费用"
                description="可从上方选择费用项。"
                size="compact"
                :visual-size="64"
              />
            </div>
            <div
              class="mt-3 flex flex-wrap items-baseline justify-end gap-x-3 border-t border-[var(--art-gray-200)] pt-3 text-sm"
            >
              <span class="text-[var(--art-gray-700)]">报价费用与补充费用合计（含税）</span>
              <strong class="text-lg tabular-nums text-[var(--el-color-primary)]">
                ¥{{
                  formatNumberValue(totalAmount, 'zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })
                }}
              </strong>
            </div>
          </section>
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
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import { useUserStore } from '@/store/modules/user'
  import { fetchOrderQuote, fetchOrderQuoteExpenseItems, saveOrderQuote, type OrderQuoteExpenseItem } from '@tms/api'

  defineOptions({ name: 'TmsOrderQuoteDialog' })

  type OrderRecord = Api.Tms.Order.OrderRecord
  type QuotePayload = Api.Tms.Order.OrderQuotePayload
  type SubmitMode = 'save' | 'submit'
  type FooterApi = Pick<ArtDialogExpose<OrderRecord>, 'handleConfirm' | 'confirmLoading'>

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const dialogRef = ref<ArtDialogExpose<OrderRecord>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('feeSection')
  type SupplementaryItem = QuotePayload['supplementaryItems'][number]
  const expenseTableRef = ref<ArtTableExpose<SupplementaryItem>>()
  const attachmentRef = ref<{ hasPendingUpload: () => boolean }>()
  const orderId = ref('')
  const order = ref<OrderRecord | null>(null)
  const quoteStatus = ref<'draft' | 'submitted' | 'pending_approval' | 'approved' | 'rejected' | ''>('')
  const quoteLocked = computed(() => quoteStatus.value === 'pending_approval' || quoteStatus.value === 'approved')
  const quoteNo = ref('')
  const expenseOptions = ref<OrderQuoteExpenseItem[]>([])
  const form = ref<QuotePayload>(createInitialForm())
  const selectedExpenseCode = ref('')
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
  const amountRules: FormRules<QuotePayload> = Object.fromEntries(
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
              validAmount(value) ? undefined : new Error('费用金额须为非负数，最多保留两位小数')
            ),
          trigger: ['blur', 'change']
        }
      ]
    ])
  )
  const expenseColumns: ColumnOption<SupplementaryItem>[] = [
    { prop: 'code', label: '费用项目', minWidth: 150, useSlot: true },
    {
      prop: 'amount',
      label: '金额（元）',
      width: 190,
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

  function createInitialForm(): QuotePayload {
    return {
      transportFee: 0,
      unloadingFee: 0,
      deliveryFee: 0,
      insuranceFee: 0,
      taxFee: 0,
      supplementaryItems: [],
      prepayment: 0,
      arrivalPayment: 0,
      collectPayment: 0,
      remark: '',
      attachmentUrls: []
    }
  }

  function moneyValue(value?: number | string | null): number {
    const amount = toNumber(value ?? 0)
    return Number.isFinite(amount) ? amount : 0
  }

  function expenseLabel(code: string): string {
    const option = expenseOptions.value.find((item) => item.id === code)
    return option?.itemName || code
  }

  function addExpenseItem(code: string): void {
    if (code && !form.value.supplementaryItems.some((item) => item.code === code)) {
      form.value.supplementaryItems.push({ code, amount: 0, remark: '' })
    }
    selectedExpenseCode.value = ''
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
      const expenseResult = await fetchOrderQuoteExpenseItems(context.order.tenantId || '')
      if (requestId !== loadRequestId) return
      expenseOptions.value = expenseResult.data || []
      order.value = context.order
      quoteStatus.value = (context.quote?.status as typeof quoteStatus.value) || ''
      quoteNo.value = (context.quote as typeof context.quote & { quoteNo?: string })?.quoteNo || ''
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
            transportFee: moneyValue(context.order.transportFee),
            unloadingFee: moneyValue(context.order.unloadingFee),
            deliveryFee: moneyValue(context.order.deliveryFee),
            insuranceFee: moneyValue(context.order.insuranceFee)
          }
      selectedExpenseCode.value = ''
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
    const payload = cloneDeep(form.value)
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
    if (!isEqual(payload, form.value) || mode !== submitMode.value) {
      ElMessage.warning('报价内容已变化，请检查后重新提交')
      return false
    }
    if (!validateAmounts()) return false
    if (submitMode.value === 'submit' && totalAmount.value <= 0) {
      await formRef.value?.focusField('transportFee')
      ElMessage.warning('提交报价前请填写费用金额')
      return false
    }
    try {
      await saveOrderQuote(currentOrderId, payload, mode === 'submit', { showErrorMessage: false })
      emit('success')
      if (!isCurrent()) return false
      if (!isEqual(payload, form.value)) {
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
    expenseOptions.value = []
    selectedExpenseCode.value = ''
    loadError.value = false
    await dialogRef.value?.handleOpen(row, {
      title: `报价 · ${row.orderNo}`,
      subtitle: '填写费用、付款安排和补充说明；提交后按审批配置处理。',
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
