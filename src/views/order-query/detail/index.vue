<template>
  <ArtPageShell
    class="order-query-detail"
    :loading="orderLoading"
    loading-mode="skeleton"
    :error="orderError"
    :empty="!order"
    empty-text="未找到运输订单"
    empty-description="请返回订单综合查询重新选择，或刷新后重试。"
    @retry="loadOrder"
  >
    <ArtPageHeader
      :title="order?.orderNo || '运输订单综合查询'"
      :subtitle="routeSummary"
      show-back
      @back="goBack"
    >
      <template #status>
        <ArtDictDisplay
          v-if="order"
          dict-code="tmsOrderStatus"
          :value="order.orderStatus"
          display="tag"
        />
      </template>
    </ArtPageHeader>

    <template v-if="order">
      <div class="mt-4 grid min-w-0 gap-4">
        <div class="grid min-w-0 gap-4 lg:grid-cols-2">
          <ArtSectionCard title="车辆跟踪" subtitle="当前执行优先，历史关系见下方明细">
            <div class="flex min-w-0 flex-col gap-2">
              <BusinessRecordLink
                :label="trackedVehicle?.plateNo || order.dispatchPlateNo || '待派车'"
                :to="
                  (trackedVehicle?.vehicleId || order.dispatchVehicleId) &&
                  hasAuth('VehicleQuery:View')
                    ? `/vms/vehicle-query/detail/${trackedVehicle?.vehicleId || order.dispatchVehicleId}`
                    : undefined
                "
                :description="
                  trackedVehicle ? trackingDescription(trackedVehicle) : '尚无执行运单关联'
                "
              />
              <span class="text-xs text-[var(--art-gray-600)]">
                主车辆取订单派车摘要；多车关系以执行运单为准。
              </span>
            </div>
          </ArtSectionCard>

          <ArtSectionCard title="司机跟踪" subtitle="当前执行优先，历史承运关系见下方明细">
            <div class="flex min-w-0 flex-col gap-2">
              <BusinessRecordLink
                :label="trackedDriver?.driverName || order.dispatchDriverName || '待分配司机'"
                :to="
                  (trackedDriver?.driverId || order.dispatchDriverId) &&
                  hasAuth('TmsDriverQuery:View')
                    ? `/tms/driver-query/detail/${trackedDriver?.driverId || order.dispatchDriverId}`
                    : undefined
                "
                :description="
                  trackedDriver ? trackingDescription(trackedDriver) : '尚无执行运单关联'
                "
              />
              <span class="text-xs text-[var(--art-gray-600)]">
                主司机取订单派车摘要；多司机关系以执行运单为准。
              </span>
            </div>
          </ArtSectionCard>
        </div>

        <ArtSectionCard title="订单概览" subtitle="订单身份、客户与运输线路">
          <ArtDescriptions :data="order" :items="basicItems" :columns="3" />
        </ArtSectionCard>

        <ArtSectionCard
          title="执行运单 · 车辆 · 司机"
          subtitle="一条执行运单形成一条承运关系；合单或拆单不会复制订单金额"
          :loading="relationsLoading"
          :error="relationsError"
          :empty="!relations.length"
          empty-title="暂无执行关系"
          empty-description="订单尚未形成可查看的执行运单。"
          @retry="loadRelations"
        >
          <ArtTable
            :data="relations"
            :columns="relationColumns"
            :pagination="false"
            :row-key="relationRowKey"
          />
          <div v-if="relationTotal > relationPageSize" class="mt-4 flex justify-end">
            <ElPagination
              v-model:current-page="relationPage"
              :page-size="relationPageSize"
              :total="relationTotal"
              layout="total, prev, pager, next"
              @current-change="loadRelations"
            />
          </div>
        </ArtSectionCard>

        <div class="grid min-w-0 gap-4 xl:grid-cols-2">
          <ArtSectionCard
            v-if="canViewField(order.fieldAccess, 'freightAmounts')"
            title="订单费用"
            subtitle="订单报价和付款约定；实际支出以执行运单费用流水为准"
          >
            <ArtDescriptions :data="order" :items="feeItems" :columns="2" />
          </ArtSectionCard>

          <ArtSectionCard title="回单与签收" subtitle="回单证据归属执行运单，可从运单继续穿透">
            <div class="grid min-w-0 gap-3">
              <div class="flex flex-wrap items-center gap-3 text-sm">
                <span>签收时间：{{ formatWithDayjs(order.signedAt) || '待签收' }}</span>
                <span v-if="canViewField(order.fieldAccess, 'proofAttachments')">
                  订单回单：{{ order.receiptImageUrls?.length || 0 }} 张
                </span>
              </div>
              <div v-if="order.relatedWaybills?.length" class="flex flex-wrap gap-2">
                <BusinessRecordLink
                  v-for="waybill in order.relatedWaybills"
                  :key="waybill.id"
                  :label="waybill.waybillNo"
                  title="查看执行运单的回单和费用"
                  :to="
                    hasAuth('TmsLoadedWaybillList:View')
                      ? `/tms/waybill-management/detail/${waybill.id}`
                      : undefined
                  "
                  compact
                />
              </div>
              <p v-else class="m-0 text-sm text-[var(--art-gray-600)]">
                暂无执行运单；产生签收回单后可在这里继续查询。
              </p>
            </div>
          </ArtSectionCard>
        </div>

        <div class="grid min-w-0 gap-4 xl:grid-cols-2">
          <ArtSectionCard title="合同与报价" subtitle="合同由开单时明确关联，报价按原有权限展示">
            <div class="grid gap-3 text-sm">
              <div v-if="contractLoading" class="text-[var(--art-gray-600)]">正在核对关联合同…</div>
              <div v-else-if="contractError" class="flex flex-wrap items-center gap-2">
                <span class="text-[var(--art-danger)]">{{ contractError }}</span>
                <ElButton text type="primary" @click="loadContract">重试</ElButton>
              </div>
              <BusinessRecordLink
                v-else-if="contract"
                :label="contract.contractNo || contract.contractName"
                :description="contract.contractName"
                :to="
                  hasAuth('TmsContract:View')
                    ? `/tms/basic-data/contract-detail/${contract.id}`
                    : undefined
                "
              />
              <p v-else class="m-0 text-[var(--art-gray-600)]">这张订单未关联客户合同。</p>
              <template v-if="canLoadQuote">
                <div v-if="quoteLoading" class="text-[var(--art-gray-600)]">正在加载报价…</div>
                <div v-else-if="quoteError" class="flex flex-wrap items-center gap-2">
                  <span class="text-[var(--art-danger)]">{{ quoteError }}</span>
                  <ElButton text type="primary" @click="loadQuote">重试</ElButton>
                </div>
                <template v-else-if="quote">
                  <div class="flex flex-wrap items-center gap-3">
                    <strong>订单报价</strong>
                    <ElTag size="small" :type="quote.status === 'submitted' ? 'success' : 'info'">
                      {{ quote.status === 'submitted' ? '已提交' : '草稿' }}
                    </ElTag>
                    <strong class="text-base">{{
                      formatSensitiveNumberWithAffix(quote.totalAmount, { prefix: '¥' })
                    }}</strong>
                  </div>
                  <div class="text-[var(--art-gray-600)]">
                    提交时间：{{ formatWithDayjs(quote.submittedAt) || '尚未提交' }}
                  </div>
                </template>
                <p v-else class="m-0 text-[var(--art-gray-600)]">尚无订单报价记录。</p>
              </template>
              <p v-else class="m-0 text-[var(--art-gray-600)]"> 报价信息需订单报价及金额权限。 </p>
            </div>
          </ArtSectionCard>

          <ArtSectionCard
            title="客户对账与应收"
            subtitle="仅列此订单的对账明细；收款按整张对账单核销"
            :loading="financeLoading"
            :error="financeError"
            @retry="loadFinance"
          >
            <template v-if="finance && !finance.statementsAvailable">
              <p class="m-0 text-sm text-[var(--art-gray-600)]">没有客户对账查看权限。</p>
            </template>
            <template v-else-if="finance?.statementsAvailable">
              <ArtTable
                v-if="finance.statements.length"
                :data="finance.statements"
                :columns="statementColumns"
                :pagination="false"
                row-key="id"
              />
              <p v-else class="m-0 text-sm text-[var(--art-gray-600)]">
                尚无关联的客户对账明细，无法据此确认应收或回款。
              </p>
              <p class="mb-0 mt-3 text-xs leading-5 text-[var(--art-gray-600)]">
                对账行金额来自订单归属明细；整张对账单的已结算额不能直接算作本订单回款。
                <span v-if="finance.statementTotal > finance.statements.length">
                  当前显示最近 {{ finance.statements.length }} / {{ finance.statementTotal }} 条。
                </span>
              </p>
            </template>
          </ArtSectionCard>
        </div>

        <ArtSectionCard
          title="订单异常"
          subtitle="已登记的运输异常工单；系统推断提示需在异常台账核实"
          :loading="financeLoading"
          :error="financeError"
          :empty="!!finance && finance.exceptions.length === 0"
          empty-title="暂无已登记异常"
          empty-description="当前订单没有人工登记的运输异常工单。"
          @retry="loadFinance"
        >
          <ArtTable
            v-if="finance?.exceptions.length"
            :data="finance.exceptions"
            :columns="exceptionColumns"
            :pagination="false"
            row-key="id"
          />
          <p
            v-if="finance && finance.exceptionTotal > finance.exceptions.length"
            class="mb-0 mt-3 text-xs text-[var(--art-gray-600)]"
          >
            当前显示最近 {{ finance.exceptions.length }} / {{ finance.exceptionTotal }} 条。
          </p>
        </ArtSectionCard>
      </div>
    </template>

    <template #empty-action>
      <ElButton type="primary" plain @click="goBack">返回订单综合查询</ElButton>
    </template>
  </ArtPageShell>
</template>

<script setup lang="tsx">
  import type { ColumnOption } from '@/types'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { canViewField, formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import { formatWithDayjs } from '@/utils/time'
  import { financePaths } from '@/router/business-paths'
  import {
    fetchOrderMainlineFinance,
    type OrderMainlineFinance,
    type OrderMainlineException,
    type OrderStatementLine
  } from '@/api/transport-mainline-finance'
  import {
    fetchTransportMainlineRelations,
    type TransportMainlineRelation
  } from '@/api/transport-mainline'
  import { fetchOrderContractSummary, fetchOrderDetail, fetchOrderQuote } from '@tms/api'

  defineOptions({ name: 'TmsOrderQueryDetail' })

  type OrderRecord = Api.Tms.Order.OrderRecord
  const route = useRoute()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const order = ref<OrderRecord>()
  const orderLoading = ref(false)
  const orderError = ref<string | null>(null)
  const relations = ref<TransportMainlineRelation[]>([])
  const relationTotal = ref(0)
  const relationPage = ref(1)
  const relationPageSize = 20
  const relationRowKey = (row: TransportMainlineRelation): string =>
    `${row.orderId}:${row.waybillId || 'pending'}`
  const relationsLoading = ref(false)
  const relationsError = ref<string | null>(null)
  const finance = ref<OrderMainlineFinance | null>(null)
  const financeLoading = ref(false)
  const financeError = ref<string | null>(null)
  const quote = ref<Api.Tms.Order.OrderQuoteRecord | null>(null)
  const contract = ref<NonNullable<OrderRecord['contract']> | null>(null)
  const contractLoading = ref(false)
  const contractError = ref<string | null>(null)
  const quoteLoading = ref(false)
  const quoteError = ref<string | null>(null)
  let orderGeneration = 0
  let contractGeneration = 0
  let financeGeneration = 0
  let quoteGeneration = 0
  let relationsGeneration = 0
  const isCurrentOrder = (id: string, generation: number): boolean =>
    generation === orderGeneration && order.value?.id === id
  const canLoadQuote = computed(
    () => hasAuth('TmsOrderList:Quote') && order.value?.fieldAccess?.freightAmounts === 'edit'
  )
  const routeSummary = computed(() =>
    order.value
      ? [order.value.originStation, order.value.destinationStation].filter(Boolean).join(' → ') ||
        '订单运输主线'
      : '订单运输主线'
  )
  const trackedVehicle = computed(
    () =>
      relations.value.find((item) => item.waybillStatus === 'transporting' && item.vehicleId) ||
      relations.value.find((item) => item.vehicleId)
  )
  const trackedDriver = computed(
    () =>
      relations.value.find((item) => item.waybillStatus === 'transporting' && item.driverId) ||
      relations.value.find((item) => item.driverId)
  )

  const basicItems = computed<ArtDescriptionItem<OrderRecord>[]>(() => [
    { key: 'orderNo', label: '订单号', field: 'orderNo', copyable: true },
    { key: 'orderStatus', label: '订单状态', field: 'orderStatus', dictCode: 'tmsOrderStatus' },
    {
      key: 'createTime',
      label: '开单时间',
      value: (data: OrderRecord) => formatWithDayjs(data.createTime) || '--'
    },
    {
      key: 'shippingCustomer',
      label: '发货客户',
      value: (data: OrderRecord) => data.shippingCustomer?.customerName || '--'
    },
    {
      key: 'receivingCustomer',
      label: '收货客户',
      value: (data: OrderRecord) => data.receivingCustomer?.customerName || '--'
    },
    {
      key: 'paymentMethod',
      label: '付款方式',
      field: 'paymentMethod',
      dictCode: 'tmsOrderPaymentMethod'
    },
    { key: 'originStation', label: '发货站', field: 'originStation' },
    { key: 'destinationStation', label: '到货站', field: 'destinationStation' },
    {
      key: 'deliveryMethod',
      label: '交付方式',
      field: 'deliveryMethod',
      dictCode: 'tmsOrderDeliveryMethod'
    },
    ...(canViewField(order.value?.fieldAccess, 'shipperContact')
      ? [{ key: 'shippingContactName', label: '发货联系人', field: 'shippingContactName' as const }]
      : []),
    ...(canViewField(order.value?.fieldAccess, 'receiverContact')
      ? [
          {
            key: 'receivingContactName',
            label: '收货联系人',
            field: 'receivingContactName' as const
          }
        ]
      : []),
    {
      key: 'orderRemark',
      label: '订单备注',
      field: 'orderRemark',
      span: 3
    }
  ])

  const moneyItem = (key: keyof OrderRecord, label: string): ArtDescriptionItem<OrderRecord> => ({
    key: String(key),
    label,
    value: (data: OrderRecord) =>
      formatSensitiveNumberWithAffix(data[key] as number | string | null | undefined, {
        prefix: '¥'
      })
  })
  const feeItems = computed<ArtDescriptionItem<OrderRecord>[]>(() => [
    moneyItem('transportFee', '基础运费'),
    moneyItem('deliveryFee', '配送费'),
    moneyItem('unloadingFee', '卸货费'),
    moneyItem('insuranceFee', '保险费'),
    moneyItem('otherFee', '其他费用'),
    moneyItem('totalFee', '订单运费合计'),
    ...(canViewField(order.value?.fieldAccess, 'settlementAmounts')
      ? [moneyItem('paymentTotal', '约定付款合计')]
      : [])
  ])

  const relationColumns: ColumnOption<TransportMainlineRelation>[] = [
    {
      prop: 'waybillNo',
      label: '执行运单',
      minWidth: 175,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.waybillNo || '待派车'}
          to={
            row.waybillId && hasAuth('TmsLoadedWaybillList:View')
              ? `/tms/waybill-management/detail/${row.waybillId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'waybillStatus',
      label: '执行状态',
      width: 115,
      dict: { code: 'tmsWaybillStatus', display: 'auto' }
    },
    {
      prop: 'plateNo',
      label: '车辆',
      minWidth: 150,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.plateNo || '待分配车辆'}
          to={
            row.vehicleId && hasAuth('VehicleQuery:View')
              ? `/vms/vehicle-query/detail/${row.vehicleId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'driverName',
      label: '司机',
      minWidth: 140,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.driverName || '待分配司机'}
          to={
            row.driverId && hasAuth('TmsDriverQuery:View')
              ? `/tms/driver-query/detail/${row.driverId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'departedAt',
      label: '发车时间',
      width: 165,
      formatter: (row) => formatWithDayjs(row.departedAt) || '--'
    },
    {
      prop: 'completedAt',
      label: '完成时间',
      width: 165,
      formatter: (row) => formatWithDayjs(row.completedAt) || '--'
    }
  ]

  const statementColumns: ColumnOption<OrderStatementLine>[] = [
    {
      prop: 'statementNo',
      label: '客户对账单',
      minWidth: 170,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.statementNo}
          to={
            hasAuth('FinanceCustomerSettlement:View')
              ? { path: financePaths.customerSettlement, query: { recordId: row.statementId } }
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'status',
      label: '状态',
      minWidth: 110,
      dict: { code: 'tmsSettlementStatus', display: 'tag' }
    },
    { prop: 'waybillNo', label: '执行运单', minWidth: 160 },
    {
      prop: 'lineAmount',
      label: '本订单对账行',
      minWidth: 135,
      formatter: (row) =>
        row.lineAmount === null
          ? '—'
          : formatSensitiveNumberWithAffix(row.lineAmount, { prefix: '¥' })
    },
    {
      prop: 'isActive',
      label: '明细状态',
      width: 100,
      formatter: (row) => (row.isActive ? '有效' : '已停用')
    }
  ]

  const exceptionColumns: ColumnOption<OrderMainlineException>[] = [
    {
      prop: 'exceptionType',
      label: '异常类型',
      minWidth: 130,
      dict: { code: 'tmsOrderExceptionType', display: 'text' }
    },
    {
      prop: 'stage',
      label: '发生节点',
      minWidth: 120,
      dict: { code: 'tmsOrderExceptionStage', display: 'text' }
    },
    { prop: 'description', label: '异常描述', minWidth: 220 },
    {
      prop: 'status',
      label: '处理状态',
      minWidth: 110,
      formatter: (row) => exceptionStatusLabel(row.status)
    },
    {
      prop: 'occurredAt',
      label: '发生时间',
      minWidth: 165,
      formatter: (row) => formatWithDayjs(row.occurredAt) || '—'
    }
  ]

  function trackingDescription(row: TransportMainlineRelation): string {
    const stage = row.waybillStatus === 'transporting' ? '正在运输' : '最近关联'
    return `${stage} · ${row.waybillNo || '待派车'}${row.departedAt ? ` · ${formatWithDayjs(row.departedAt)}` : ''}`
  }

  function exceptionStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: '待处理',
      in_progress: '处理中',
      resolved: '待结案',
      closed: '已结案'
    }
    return labels[status] || status
  }

  async function loadOrder(): Promise<void> {
    const generation = ++orderGeneration
    contractGeneration += 1
    financeGeneration += 1
    quoteGeneration += 1
    relationsGeneration += 1
    const id = String(route.params.id || '')
    order.value = undefined
    relations.value = []
    relationTotal.value = 0
    relationPage.value = 1
    finance.value = null
    quote.value = null
    contract.value = null
    contractError.value = null
    financeError.value = null
    quoteError.value = null
    relationsError.value = null
    contractLoading.value = false
    financeLoading.value = false
    quoteLoading.value = false
    relationsLoading.value = false
    orderLoading.value = false
    if (!id) {
      orderError.value = '缺少订单标识，请返回订单综合查询重新选择。'
      return
    }
    orderLoading.value = true
    orderError.value = null
    try {
      const result = await fetchOrderDetail(id, { showErrorMessage: false })
      if (generation !== orderGeneration) return
      if (result.error) throw result.error
      order.value = result.data ?? undefined
      if (order.value) {
        await Promise.all([
          ...(order.value.contractId ? [loadContract()] : []),
          loadRelations(),
          loadFinance(),
          ...(canLoadQuote.value ? [loadQuote()] : [])
        ])
      }
    } catch {
      if (generation !== orderGeneration) return
      order.value = undefined
      orderError.value = '订单综合信息加载失败，请刷新后重试。'
    } finally {
      if (generation === orderGeneration) orderLoading.value = false
    }
  }

  async function loadContract(): Promise<void> {
    const id = order.value?.id
    if (!id) return
    const generation = orderGeneration
    const requestId = ++contractGeneration
    contractLoading.value = true
    contractError.value = null
    try {
      const result = await fetchOrderContractSummary(id)
      if (!isCurrentOrder(id, generation) || requestId !== contractGeneration) return
      contract.value = result.data ?? null
    } catch {
      if (!isCurrentOrder(id, generation) || requestId !== contractGeneration) return
      contractError.value = '关联合同加载失败，请重试。'
    } finally {
      if (isCurrentOrder(id, generation) && requestId === contractGeneration)
        contractLoading.value = false
    }
  }

  async function loadFinance(): Promise<void> {
    const id = order.value?.id
    if (!id) return
    const generation = orderGeneration
    const requestId = ++financeGeneration
    financeLoading.value = true
    financeError.value = null
    try {
      const result = await fetchOrderMainlineFinance(id)
      if (!isCurrentOrder(id, generation) || requestId !== financeGeneration) return
      finance.value = result
    } catch {
      if (!isCurrentOrder(id, generation) || requestId !== financeGeneration) return
      finance.value = null
      financeError.value = '订单对账与异常信息加载失败，请重试。'
    } finally {
      if (isCurrentOrder(id, generation) && requestId === financeGeneration)
        financeLoading.value = false
    }
  }

  async function loadQuote(): Promise<void> {
    const id = order.value?.id
    if (!id || !canLoadQuote.value) return
    const generation = orderGeneration
    const requestId = ++quoteGeneration
    quoteLoading.value = true
    quoteError.value = null
    try {
      const result = await fetchOrderQuote(id, { showErrorMessage: false })
      if (!isCurrentOrder(id, generation) || requestId !== quoteGeneration) return
      quote.value = result.data?.quote ?? null
    } catch {
      if (!isCurrentOrder(id, generation) || requestId !== quoteGeneration) return
      quote.value = null
      quoteError.value = '订单报价加载失败，请重试。'
    } finally {
      if (isCurrentOrder(id, generation) && requestId === quoteGeneration)
        quoteLoading.value = false
    }
  }

  async function loadRelations(): Promise<void> {
    const id = order.value?.id
    if (!id) return
    const generation = orderGeneration
    const requestId = ++relationsGeneration
    relationsLoading.value = true
    relationsError.value = null
    try {
      const from = (relationPage.value - 1) * relationPageSize
      const result = await fetchTransportMainlineRelations({
        orderIds: [id],
        from,
        to: from + relationPageSize - 1
      })
      if (!isCurrentOrder(id, generation) || requestId !== relationsGeneration) return
      relations.value = result.data
      relationTotal.value = result.total
    } catch {
      if (!isCurrentOrder(id, generation) || requestId !== relationsGeneration) return
      relations.value = []
      relationTotal.value = 0
      relationsError.value = '执行关系加载失败，请重试。'
    } finally {
      if (isCurrentOrder(id, generation) && requestId === relationsGeneration)
        relationsLoading.value = false
    }
  }

  function goBack(): void {
    void router.push('/tms/order-query')
  }

  onMounted(loadOrder)
  watch(() => route.params.id, loadOrder)
</script>

<style scoped lang="scss">
  .order-query-detail {
    min-height: 100%;
    padding: var(--art-space-4);
    background: var(--default-box-color);
  }
</style>
