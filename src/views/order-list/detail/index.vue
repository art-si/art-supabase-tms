<template>
  <ArtPageShell
    class="order-detail"
    :loading="detail.loading"
    loading-mode="skeleton"
    :error="detail.error"
    :empty="!detail.data"
    empty-text="暂无订单详情"
    empty-description="请返回订单列表重新选择，或刷新后重试。"
    @retry="loadDetail"
  >
    <ArtPageHeader
      :title="detail.data?.orderNo || '订单详情'"
      :subtitle="
        [detail.data?.originStation, detail.data?.destinationStation].filter(Boolean).join(' → ') ||
        '--'
      "
      show-back
      @back="goBack"
    />

    <section class="order-detail__section order-detail__steps-card art-card-xs">
      <OrderStatusSteps :steps="detail.statusSteps" :active-index="detail.activeStep" />
      <div
        v-if="deliveryAudit.visible && canViewOrderField('proofAttachments')"
        class="order-detail__delivery-audit"
        :class="{ 'is-warning': deliveryAudit.missingSignature }"
      >
        <span class="order-detail__delivery-audit-icon">
          <ArtSvgIcon
            :icon="deliveryAudit.missingSignature ? 'ri:alert-line' : 'ri:verified-badge-line'"
          />
        </span>
        <div class="order-detail__delivery-audit-copy">
          <strong>{{ deliveryAudit.title }}</strong>
          <span>{{ deliveryAudit.description }}</span>
        </div>
        <div v-if="!deliveryAudit.missingSignature" class="order-detail__delivery-audit-meta">
          <span>{{ deliveryAudit.operator }}</span>
          <span>{{ deliveryAudit.proofCount }} 张回单</span>
          <span>{{ deliveryAudit.time }}</span>
        </div>
      </div>
    </section>

    <ArtSectionCard
      v-if="detail.relatedWaybills.length"
      class="order-detail__section order-detail__waybills"
      preserve-content-structure
    >
      <template #header
        ><div class="order-detail__waybill-heading">
          <ArtSectionTitle title="关联运单" />
          <span>共 {{ detail.relatedWaybills.length }} 张执行运单</span>
        </div></template
      >
      <div class="order-detail__waybill-list">
        <button
          v-for="waybill in detail.relatedWaybills"
          :key="waybill.id"
          type="button"
          class="order-detail__waybill-card"
          @click="openWaybillDetail(waybill.id)"
        >
          <span class="order-detail__waybill-icon"
            ><ArtSvgIcon icon="ri:truck-line" aria-hidden="true"
          /></span>
          <span class="order-detail__waybill-copy">
            <strong>{{ waybill.waybillNo }}</strong>
            <small>{{
              [waybill.driverName, waybill.plateNo].filter(Boolean).join(' · ') || '待分配承运资源'
            }}</small>
          </span>
          <ArtDictDisplay dict-code="tmsWaybillStatus" :value="waybill.status" display="tag" />
          <ArtSvgIcon icon="ri:arrow-right-s-line" aria-hidden="true" />
        </button>
      </div>
    </ArtSectionCard>

    <ArtSectionCard class="order-detail__section" preserve-content-structure title="基础信息">
      <ArtDescriptions :data="descriptionData" :items="basicItems" :columns="4" />

      <div class="order-detail__contact-card">
        <div class="order-detail__contact-panel">
          <div class="order-detail__contact-heading">
            <span class="order-detail__contact-mark order-detail__contact-mark--send">寄</span>
            <strong>发货人信息</strong>
          </div>
          <ArtDescriptions
            :data="descriptionData"
            :items="shippingItems"
            :columns="1"
            :border="false"
          />
        </div>
        <div class="order-detail__contact-panel">
          <div class="order-detail__contact-heading">
            <span class="order-detail__contact-mark order-detail__contact-mark--receive">收</span>
            <strong>收货人信息</strong>
          </div>
          <ArtDescriptions
            :data="descriptionData"
            :items="receivingItems"
            :columns="1"
            :border="false"
          />
        </div>
      </div>
    </ArtSectionCard>

    <ArtSectionCard
      v-if="detail.data?.orderConfig?.loadType"
      class="order-detail__section"
      preserve-content-structure
      title="配置信息"
    >
      <ArtDescriptions :data="configurationData" :items="configurationItems" :columns="4" />
      <div
        v-if="canViewOrderField('proofAttachments') && configurationData.attachmentUrls?.length"
        class="order-detail__configuration-files"
      >
        <strong>业务附件</strong>
        <ArtUploadFile :model-value="configurationData.attachmentUrls" readonly multiple />
      </div>
    </ArtSectionCard>

    <ArtSectionCard class="order-detail__section" preserve-content-structure title="货物信息">
      <ArtTable
        :data="detail.cargoItems"
        :columns="detail.cargoColumns"
        :pagination="false"
        row-key="cargoName"
      />
      <div class="order-detail__summary">
        <div>
          <span>总数量</span>
          <strong>{{ formatCompactNumberValue(detail.data?.cargoQuantityTotal, 0) }}</strong>
        </div>
        <div>
          <span>总重量</span>
          <strong>{{ formatCompactNumberValue(detail.data?.cargoWeightTotal) }} kg</strong>
        </div>
        <div>
          <span>总体积</span>
          <strong>{{ formatCompactNumberValue(detail.data?.cargoVolumeTotal, 3) }} 方</strong>
        </div>
      </div>
    </ArtSectionCard>

    <div class="order-detail__finance-grid">
      <ArtSectionCard
        v-if="canViewOrderField('freightAmounts')"
        class="order-detail__section"
        preserve-content-structure
        title="费用信息"
      >
        <ArtDescriptions :data="descriptionData" :items="feeItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard class="order-detail__section" preserve-content-structure title="付款方式">
        <ArtDescriptions :data="descriptionData" :items="paymentItems" :columns="2" />
      </ArtSectionCard>
    </div>

    <div class="order-detail__support-grid">
      <ArtSectionCard class="order-detail__section" preserve-content-structure title="其他信息">
        <ArtDescriptions :data="descriptionData" :items="otherItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard
        class="order-detail__section"
        title="物流信息"
        empty
        empty-title="暂无物流跟踪信息"
        empty-description="产生运输节点后，轨迹会显示在这里。"
        :empty-visual-size="76"
      />
    </div>
  </ArtPageShell>
</template>

<script setup lang="tsx">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { formatWithDayjs } from '@/utils/time'
  import { canViewField, formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import { formatCompactNumberValue } from '@/utils/ui/format'
  import { useUserStore } from '@/store/modules/user'
  import { fetchOrderDetail } from '@tms/api'
  import { formatTransferStationRoute } from '@tms/views/modules/transfer-station-route'
  import OrderStatusSteps from '../modules/order-status-steps.vue'

  defineOptions({ name: 'TmsOrderDetail' })

  type OrderRecord = Api.Tms.Order.OrderRecord
  type CargoItem = Api.Tms.Order.CargoItem
  type OrderConfig = Api.Tms.Order.OrderConfig

  interface StatusStep {
    label: string
    value: string
    timeText?: string
  }

  type OrderStatusValue =
    | 'created'
    | 'pending_load'
    | 'pending_order'
    | 'pending_pickup'
    | 'transporting'
    | 'signed'
    | 'completed'
    | 'cancelled'

  const orderStatusStepValues: OrderStatusValue[] = [
    'created',
    'pending_load',
    'pending_order',
    'pending_pickup',
    'transporting',
    'signed',
    'completed'
  ]
  const orderStatusStepOrder: OrderStatusValue[] = [...orderStatusStepValues, 'cancelled']

  interface DetailGroup {
    loading: boolean
    error: Error | null
    data?: OrderRecord
    statusSteps: ComputedRef<StatusStep[]>
    activeStep: ComputedRef<number>
    cargoItems: ComputedRef<CargoItem[]>
    cargoColumns: ComputedRef<ColumnOption<CargoItem>[]>
    relatedWaybills: ComputedRef<Api.Tms.Waybill.RelatedWaybillSummary[]>
  }

  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const normalizedOrderStatus = computed(() => normalizeOrderStatus(detail.data?.orderStatus))
  const detail: UnwrapNestedRefs<DetailGroup> = reactive<DetailGroup>({
    loading: false,
    error: null,
    data: undefined,
    statusSteps: computed(() => {
      const values: OrderStatusValue[] =
        normalizedOrderStatus.value === 'cancelled'
          ? [...orderStatusStepValues, 'cancelled']
          : orderStatusStepValues

      return values.map((value) => ({
        value,
        label: getOrderStatusLabel(value),
        timeText: getOrderStatusTimeText(value)
      }))
    }),
    activeStep: computed(() => {
      const index = detail.statusSteps.findIndex(
        (item) => item.value === normalizedOrderStatus.value
      )
      return index < 0 ? 0 : index
    }),
    cargoItems: computed(() => detail.data?.cargoItems ?? []),
    relatedWaybills: computed(() => detail.data?.relatedWaybills ?? []),
    cargoColumns: computed<ColumnOption<CargoItem>[]>(() => [
      { type: 'globalIndex', label: '序号', width: 70 },
      { prop: 'cargoName', label: '货物名称', minWidth: 180 },
      { prop: 'specModel', label: '规格型号', minWidth: 150 },
      {
        prop: 'packageType',
        label: '包装',
        width: 130,
        dict: { code: 'tmsCargoUnit', display: 'text' }
      },
      { prop: 'quantity', label: '数量', width: 110 },
      { prop: 'weightKg', label: '重量(kg)', width: 140 },
      { prop: 'volumeM3', label: '体积(方)', width: 140 },
      { prop: 'remark', label: '备注', minWidth: 160 }
    ])
  })

  const descriptionData = computed<Partial<OrderRecord>>(() => detail.data ?? {})
  const configurationData = computed<Partial<OrderConfig>>(() => detail.data?.orderConfig ?? {})
  const configurationItems = computed<ArtDescriptionItem<Partial<OrderConfig>>[]>(() => [
    {
      key: 'loadType',
      label: '运输类型',
      field: 'loadType',
      dictCode: 'tmsOrderLoadType'
    },
    ...(configurationData.value.loadType === 'ftl'
      ? [
          { key: 'vehicleType', label: '车型', field: 'vehicleType' as const },
          {
            key: 'truckCount',
            label: '整车数量',
            value: (data: Partial<OrderConfig>) =>
              data.truckCount == null ? '--' : `${data.truckCount} 车`
          },
          {
            key: 'vehicleMetrics',
            label: '车型规格',
            value: (data: Partial<OrderConfig>) =>
              `${data.vehicleLengthM ?? '--'} 米 / ${data.vehicleVolumeM3 ?? '--'} 方 / ${data.vehicleLoadTons ?? '--'} 吨`
          }
        ]
      : []),
    {
      key: 'billingMode',
      label: '计费模式',
      field: 'billingMode',
      dictCode: 'tmsOrderBillingMode'
    },
    { key: 'billingUnit', label: '计费单位', field: 'billingUnit', dictCode: 'tmsCargoUnit' },
    {
      key: 'cargoCategory',
      label: '货物分类',
      field: 'cargoCategory',
      dictCode: 'tmsOrderCargoCategory'
    },
    ...(configurationData.value.cargoCategory === 'temperature'
      ? [
          {
            key: 'temperature',
            label: '温度阈值',
            value: (data: Partial<OrderConfig>) => `${data.tempMinC} 至 ${data.tempMaxC} ℃`
          }
        ]
      : []),
    { key: 'packaging', label: '包装方式', field: 'packaging', dictCode: 'tmsOrderPackaging' },
    {
      key: 'selfPickup',
      label: '是否自提',
      value: (data: Partial<OrderConfig>) => (data.selfPickup ? '是' : '否')
    },
    {
      key: 'insured',
      label: '是否保价',
      value: (data: Partial<OrderConfig>) => (data.insured ? '保价' : '不保价')
    },
    {
      key: 'transportRequirements',
      label: '运输要求',
      value: (data: Partial<OrderConfig>) =>
        data.transportRequirements
          ?.map(
            (item) =>
              userStore.getDictItemByValue('tmsOrderTransportRequirement', item)?.label || item
          )
          .join('、') || '--'
    },
    {
      key: 'trackingMethod',
      label: '跟踪方式',
      field: 'trackingMethod',
      dictCode: 'tmsOrderTrackingMethod'
    },
    ...(configurationData.value.trackingMethod
      ? [{ key: 'trackingNumber', label: '跟踪编号', field: 'trackingNumber' as const }]
      : []),
    { key: 'remark', label: '备注', field: 'remark', span: 4 }
  ])
  const deliveryAudit = computed(() => {
    const data = detail.data
    const status = normalizedOrderStatus.value
    const signatureTime = data?.signedAt ?? data?.driverWaybillSignedAt
    const proofCount = data?.driverWaybillSignatureProofCount ?? data?.receiptImageUrls?.length ?? 0
    const reachedDelivery = status === 'signed' || status === 'completed'
    const missingSignature = status === 'completed' && !signatureTime

    if (!reachedDelivery) {
      return {
        visible: false,
        missingSignature: false,
        title: '',
        description: '',
        operator: '',
        proofCount,
        time: ''
      }
    }

    if (missingSignature) {
      return {
        visible: true,
        missingSignature: true,
        title: '签收记录缺失',
        description: proofCount
          ? `该订单已完成并发现 ${proofCount} 张回单，但没有独立的确认签收记录，请核对交付凭证。`
          : '该订单已完成，但没有签收时间、操作人或回单凭证，请尽快核对交付过程。',
        operator: '',
        proofCount,
        time: ''
      }
    }

    return {
      visible: true,
      missingSignature: false,
      title: '签收凭证已归档',
      description:
        status === 'completed' ? '交付与完成节点记录完整' : '已完成签收，等待最终确认完成运单',
      operator: data?.driverWaybillSignedBy || data?.dispatchDriverName || '系统记录',
      proofCount,
      time: formatWithDayjs(signatureTime, 'YYYY-MM-DD HH:mm') || '-'
    }
  })
  const basicItems: ArtDescriptionItem<Partial<OrderRecord>>[] = [
    { key: 'orderNo', label: '订单号', field: 'orderNo', copyable: true },
    {
      key: 'createdByName',
      label: '开单人',
      value: (record: Partial<OrderRecord>) => record.createdByName || '—'
    },
    { key: 'createTime', label: '开单时间', field: 'createTime', format: 'datetime' },
    { key: 'originStation', label: '发货站', field: 'originStation' },
    { key: 'destinationStation', label: '到货站', field: 'destinationStation' },
    { key: 'departureAt', label: '发货时间', field: 'departureAt', format: 'datetime' },
    { key: 'arrivalAt', label: '到货时间', field: 'arrivalAt', format: 'datetime' },
    ...(canViewOrderField('routeCoordinates')
      ? [
          {
            key: 'distanceKm',
            label: '公里数',
            value: (data: Partial<OrderRecord>) =>
              data.distanceKm == null ? '--' : `${data.distanceKm} km`
          }
        ]
      : []),
    {
      key: 'transferStation',
      label: '中转站',
      value: (record: Partial<OrderRecord>) =>
        formatTransferStationRoute(record.transferStationNames, record.transferStation)
    },
    {
      key: 'deliveryMethod',
      label: '配送方式',
      field: 'deliveryMethod',
      dictCode: 'tmsOrderDeliveryMethod'
    },
    {
      key: 'orderStatus',
      label: '当前状态',
      value: (data: Partial<OrderRecord>) => normalizeOrderStatus(data.orderStatus),
      dictCode: 'tmsOrderStatus'
    },
    {
      key: 'transportMode',
      label: '运输方式',
      field: 'transportMode',
      dictCode: 'tmsOrderTransportMode'
    }
  ]
  const shippingItems = computed<ArtDescriptionItem<Partial<OrderRecord>>[]>(() => [
    {
      key: 'shippingCustomerName',
      label: '发货方',
      value: (data: Partial<OrderRecord>) => data.shippingCustomer?.customerName || '--'
    },
    { key: 'shippingContactName', label: '姓名', field: 'shippingContactName' },
    ...(canViewOrderField('shipperContact')
      ? [
          {
            key: 'shippingContactPhone',
            label: '手机号',
            field: 'shippingContactPhone',
            copyable: true
          }
        ]
      : []),
    ...(canViewOrderField('shipperAddress')
      ? [
          {
            key: 'shippingRegionPath',
            label: '发货省市区',
            value: (data: Partial<OrderRecord>) => data.shippingRegionPath?.join(' / ') || '--'
          },
          {
            key: 'shippingAddressDetail',
            label: '发货地址',
            field: 'shippingAddressDetail' as const
          }
        ]
      : [])
  ])
  const receivingItems = computed<ArtDescriptionItem<Partial<OrderRecord>>[]>(() => [
    {
      key: 'receivingCustomerName',
      label: '收货方',
      value: (data: Partial<OrderRecord>) => data.receivingCustomer?.customerName || '--'
    },
    { key: 'receivingContactName', label: '姓名', field: 'receivingContactName' },
    ...(canViewOrderField('receiverContact')
      ? [
          {
            key: 'receivingContactPhone',
            label: '手机号',
            field: 'receivingContactPhone',
            copyable: true
          }
        ]
      : []),
    ...(canViewOrderField('receiverAddress')
      ? [
          {
            key: 'receivingRegionPath',
            label: '收货省市区',
            value: (data: Partial<OrderRecord>) => data.receivingRegionPath?.join(' / ') || '--'
          },
          {
            key: 'receivingAddressDetail',
            label: '收货地址',
            field: 'receivingAddressDetail' as const
          }
        ]
      : [])
  ])
  const feeItems = createMoneyDescriptionItems([
    ['transportFee', '基础运费'],
    ['deliveryFee', '配送费'],
    ['unloadingFee', '卸货费'],
    ['collectPaymentFee', '回款费'],
    ['transferFee', '中转费'],
    ['declaredValue', '声明价值'],
    ['insuranceFee', '保费'],
    ['packageFee', '包装费'],
    ['otherFee', '其他费用'],
    ['totalFee', '运费合计', true]
  ])
  const paymentItems = computed<ArtDescriptionItem<Partial<OrderRecord>>[]>(() => [
    {
      key: 'paymentMethod',
      label: '付款方式',
      field: 'paymentMethod',
      dictCode: 'tmsOrderPaymentMethod'
    },
    ...(canViewOrderField('settlementAmounts')
      ? createMoneyDescriptionItems([
          ['cashAmount', '现付'],
          ['collectAmount', '到付'],
          ['monthlyAmount', '月结'],
          ['codAmount', '代收货款'],
          ['handlingFee', '手续费'],
          ['paymentTotal', '付款合计', true]
        ])
      : [])
  ])
  const otherItems = computed<ArtDescriptionItem<Partial<OrderRecord>>[]>(() => [
    { key: 'orderRemark', label: '订单备注', field: 'orderRemark', span: 2 },
    ...(canViewOrderField('proofAttachments')
      ? [
          {
            key: 'imageUrls',
            label: '图片',
            span: 2,
            value: (data: Partial<OrderRecord>) => data.imageUrls,
            render: (value: unknown) => {
              const imageUrls = (value as string[] | undefined) ?? []
              if (!imageUrls.length) return '--'
              return (
                <ArtUploadImage
                  modelValue={imageUrls}
                  size={88}
                  limit={Math.max(imageUrls.length, 1)}
                  multiple
                  readonly
                />
              )
            }
          }
        ]
      : [])
  ])

  onMounted(() => {
    void loadDetail()
  })

  async function loadDetail(): Promise<void> {
    const id = String(route.params.id || '')
    if (!id) {
      detail.error = new Error('缺少订单标识')
      return
    }

    detail.loading = true
    detail.error = null
    try {
      const [{ data }] = await Promise.all([
        fetchOrderDetail(id),
        userStore.ensureDictLoaded('tmsOrderTransportRequirement')
      ])
      detail.data = data ?? undefined
    } catch (error) {
      detail.error = error instanceof Error ? error : new Error('订单详情加载失败')
    } finally {
      detail.loading = false
    }
  }

  function goBack(): void {
    void router.back()
  }

  function openWaybillDetail(waybillId: string): void {
    void router.push({ name: 'TmsWaybillDetail', params: { id: waybillId } })
  }

  function normalizeOrderStatus(status?: string): OrderStatusValue | undefined {
    if (!status) return undefined
    if (status === 'loaded') return 'pending_order'
    return status as OrderStatusValue
  }

  function getOrderStatusLabel(status: OrderStatusValue): string {
    if (status === 'created') return '开单'

    const normalizedStatus = normalizeOrderStatus(status)
    const dictItem = userStore.getDictItemByValue('tmsOrderStatus', normalizedStatus)
    return dictItem?.label || normalizedStatus || '-'
  }

  function getOrderStatusTimeText(status: OrderStatusValue): string {
    if (!isOrderStatusReached(status)) return '-'

    const statusTimeMap: Partial<Record<OrderStatusValue, string | null | undefined>> = {
      created: detail.data?.createTime,
      pending_load: detail.data?.createTime,
      pending_order: detail.data?.dispatchedAt,
      pending_pickup: detail.data?.driverWaybillAcceptedAt,
      transporting: detail.data?.driverWaybillDepartedAt ?? detail.data?.driverWaybillLoadedAt,
      signed: detail.data?.signedAt ?? detail.data?.driverWaybillSignedAt,
      completed: detail.data?.driverWaybillCompletedAt,
      cancelled: detail.data?.updateTime
    }

    const value = statusTimeMap[status] ?? getCurrentStatusFallbackTime(status)
    if (status === 'signed' && normalizedOrderStatus.value === 'completed' && !value) {
      return '记录缺失'
    }
    return formatStepTime(value)
  }

  function isOrderStatusReached(status: OrderStatusValue): boolean {
    const currentStatus = normalizedOrderStatus.value
    if (!currentStatus) return false

    const statusIndex = orderStatusStepOrder.indexOf(status)
    const currentIndex = orderStatusStepOrder.indexOf(currentStatus)
    return statusIndex >= 0 && currentIndex >= 0 && statusIndex <= currentIndex
  }

  function getCurrentStatusFallbackTime(status: OrderStatusValue): string | null | undefined {
    return normalizedOrderStatus.value === status ? detail.data?.updateTime : undefined
  }

  function formatStepTime(value?: string | null): string {
    const date = formatWithDayjs(value, 'YYYY-MM-DD')
    const time = formatWithDayjs(value, 'HH:mm')
    return date && time ? `${date}\n${time}` : '-'
  }

  function createMoneyDescriptionItems(
    items: Array<[key: string, label: string, strong?: boolean]>
  ): ArtDescriptionItem<Partial<OrderRecord>>[] {
    return items.map(([key, label, strong]) => ({
      key,
      label,
      field: key,
      formatter: (value) =>
        formatSensitiveNumberWithAffix(value as number | string | null | undefined, {
          prefix: '¥'
        }),
      className: strong ? 'order-detail__strong' : undefined
    }))
  }

  function canViewOrderField(field: Api.Tms.Order.OrderFieldKey): boolean {
    return canViewField(detail.data?.fieldAccess, field)
  }
</script>

<style scoped lang="scss">
  .order-detail {
    min-height: 100%;
    padding: 12px 16px 18px;
    background: var(--default-box-color);

    &__section {
      padding: 18px 20px;
      margin-bottom: 12px;
    }

    &__configuration-files {
      display: grid;
      gap: var(--art-space-2);
      padding-top: var(--art-space-4);
      margin-top: var(--art-space-4);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__steps-card {
      display: grid;
      gap: 16px;
      margin-top: var(--art-space-3);
    }

    &__waybill-heading {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      justify-content: space-between;

      > span {
        margin-top: 7px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__waybill-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--art-space-3);
      margin-top: var(--art-space-4);
    }

    &__waybill-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;
      padding: var(--art-space-3);
      color: inherit;
      text-align: left;
      cursor: pointer;
      background: var(--el-fill-color-lighter);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        box-shadow 0.18s ease;

      &:hover,
      &:focus-visible {
        outline: none;
        background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
        border-color: var(--theme-color);
      }

      &:focus-visible {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-color) 22%, transparent);
      }
    }

    &__waybill-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 19px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    &__waybill-copy {
      display: grid;
      gap: 3px;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__delivery-audit {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      margin-inline: 12px;
      color: var(--el-color-success-dark-2);
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: var(--el-border-radius-base);

      &.is-warning {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-color: var(--el-color-warning-light-7);
      }
    }

    &__delivery-audit-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      font-size: 19px;
      background: color-mix(in srgb, currentcolor 10%, transparent);
      border-radius: var(--art-control-radius);
    }

    &__delivery-audit-copy {
      display: grid;
      gap: 3px;
      min-width: 0;

      strong {
        color: currentcolor;
      }

      span {
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__delivery-audit-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 12px;
      color: var(--el-text-color-regular);

      span {
        padding: 5px 8px;
        white-space: nowrap;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 999px;
      }
    }

    &__finance-grid,
    &__support-grid {
      display: grid;
      gap: 12px;
      margin-bottom: 12px;

      > .order-detail__section {
        min-width: 0;
        margin-bottom: 0;
      }
    }

    &__finance-grid {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    }

    &__support-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &__contact-card {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      padding: 18px;
      margin-top: 20px;
      background: var(--el-fill-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__contact-panel {
      display: grid;
      gap: 12px;
      min-width: 0;
      color: var(--el-text-color-regular);
    }

    &__contact-heading {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--el-text-color-primary);
    }

    &__contact-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      color: var(--el-color-white);
      border-radius: var(--el-border-radius-base);

      &--send {
        background: var(--el-color-primary);
      }

      &--receive {
        background: var(--el-color-warning);
      }
    }

    &__summary {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding-top: 14px;

      > div {
        display: grid;
        gap: 2px;
        min-width: 128px;
        padding: 10px 12px;
        text-align: right;
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);

        span {
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }

        strong {
          font-size: 13px;
          font-variant-numeric: tabular-nums;
          color: var(--el-text-color-primary);
        }
      }
    }

    :deep(.order-detail__strong) {
      font-weight: 600;
      color: var(--el-color-danger);
    }

    :deep(.art-descriptions) {
      margin-top: 16px;

      .el-descriptions__body {
        background: inherit;
      }
    }
  }

  @media (width <= 992px) {
    .order-detail {
      &__delivery-audit {
        grid-template-columns: auto minmax(0, 1fr);
      }

      &__delivery-audit-meta {
        flex-wrap: wrap;
        grid-column: 2;
      }

      &__finance-grid,
      &__support-grid,
      &__contact-card {
        grid-template-columns: 1fr;
      }
    }
  }

  @media (width <= 640px) {
    .order-detail {
      padding-inline: 10px;

      &__summary {
        display: grid;
        grid-template-columns: 1fr;

        > div {
          min-width: 0;
          text-align: left;
        }
      }

      &__delivery-audit {
        margin-inline: 0;
      }
    }
  }
</style>
