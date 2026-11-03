<template>
  <ArtPageShell
    class="rate-card-detail"
    :loading="page.loading"
    loading-mode="skeleton"
    :error="page.error"
    :empty="!detail.data"
    empty-text="暂无客户协议价详情"
    empty-description="请返回客户协议价列表重新选择，或刷新后重试。"
    @retry="loadPage"
  >
    <ArtPageHeader
      :title="detail.data?.customer?.customerName || '客户协议价详情'"
      :subtitle="routeSubtitle"
      show-back
      @back="goBack"
    />

    <section class="rate-card-detail__summary art-card-xs" aria-label="客户协议价概览">
      <article
        ><span>客户编码</span
        ><strong>{{ detail.data?.customer?.customerCode || '--' }}</strong></article
      >
      <article
        ><span>运输类型</span><strong>{{ transportTypeLabel }}</strong></article
      >
      <article
        ><span>货物明细</span><strong>{{ cargoItems.length }} 项</strong></article
      >
      <article v-if="canViewSensitiveField('quoteAmounts')"
        ><span>协议价合计</span
        ><strong>{{
          formatSensitiveNumberWithAffix(detail.data?.totalFee, { prefix: '¥ ' })
        }}</strong></article
      >
    </section>

    <div class="rate-card-detail__content">
      <ArtSectionCard
        class="rate-card-detail__section"
        preserve-content-structure
        title="客户与运输路线"
      >
        <div class="rate-card-detail__route">
          <div class="rate-card-detail__route-point"
            ><span>始发地</span><strong>{{ detail.data?.originRegion || '--' }}</strong></div
          >
          <span class="rate-card-detail__route-arrow" aria-hidden="true">→</span>
          <div class="rate-card-detail__route-point"
            ><span>目的地</span><strong>{{ detail.data?.destinationRegion || '--' }}</strong></div
          >
        </div>
        <ArtDescriptions :data="descriptionData" :items="baseItems" :columns="4" />
      </ArtSectionCard>

      <ArtSectionCard
        class="rate-card-detail__section"
        preserve-content-structure
        title="收发货信息"
      >
        <div class="rate-card-detail__split">
          <article class="rate-card-detail__panel">
            <div class="rate-card-detail__panel-heading"
              ><b>发</b
              ><div><strong>发货信息</strong><span>客户默认或已指定的发货地址</span></div></div
            >
            <ArtDescriptions :data="descriptionData" :items="shippingItems" :columns="1" />
          </article>
          <article class="rate-card-detail__panel">
            <div class="rate-card-detail__panel-heading"
              ><b class="is-green">收</b
              ><div><strong>收货信息</strong><span>本协议价对应的收货地址</span></div></div
            >
            <ArtDescriptions :data="descriptionData" :items="receivingItems" :columns="1" />
          </article>
        </div>
      </ArtSectionCard>

      <ArtSectionCard class="rate-card-detail__section" preserve-content-structure title="货物信息">
        <ArtTable
          :data="cargoItems"
          :columns="cargoColumns"
          :pagination="undefined"
          empty-text="暂无货物明细"
          empty-description="当前客户协议价未维护货物明细。"
          empty-height="150px"
        />
      </ArtSectionCard>

      <ArtSectionCard
        class="rate-card-detail__section"
        preserve-content-structure
        title="车辆与结算费用"
      >
        <ArtDescriptions :data="descriptionData" :items="vehicleItems" :columns="4" />
        <template v-if="canViewSensitiveField('quoteAmounts')">
          <div class="rate-card-detail__section-gap" aria-hidden="true"></div>
          <ArtDescriptions :data="descriptionData" :items="feeItems" :columns="4" />
        </template>
      </ArtSectionCard>

      <ArtSectionCard
        v-if="canViewSensitiveField('paymentAmounts')"
        class="rate-card-detail__section"
        preserve-content-structure
        title="付款方式"
      >
        <ArtDescriptions :data="descriptionData" :items="paymentItems" :columns="4" />
      </ArtSectionCard>

      <ArtSectionCard
        class="rate-card-detail__section"
        preserve-content-structure
        title="备注与审计信息"
      >
        <ArtDescriptions :data="descriptionData" :items="auditItems" :columns="4" />
      </ArtSectionCard>
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { formatCoordinateValue } from '@/utils/ui/coordinates'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { fetchCustomerPriceDetail } from '@tms/api'
  import { useUserStore } from '@/store/modules/user'
  import { formatRateAddress } from '../modules/rate-card-detail'
  import {
    canViewField,
    formatSensitiveNumber,
    formatSensitiveNumberWithAffix
  } from '@/utils/field-permission'
  import { formatCompactNumberValue, formatDateTimeValue } from '@/utils/ui/format'

  defineOptions({ name: 'TmsCustomerPriceDetail' })

  type CustomerPrice = Api.Tms.BasicData.CustomerPrice
  type CargoItem = Api.Tms.BasicData.CustomerPriceCargoItem
  type CustomerPriceFieldKey = Api.Tms.BasicData.CustomerPriceFieldKey

  const route = useRoute()
  const router = useRouter()
  const { getDictMap } = storeToRefs(useUserStore())
  const page = reactive({ loading: false, error: null as Error | null })
  const detail = reactive<{ data?: CustomerPrice }>({ data: undefined })
  const descriptionData = computed<Partial<CustomerPrice>>(() => detail.data ?? {})
  const cargoItems = computed(() => detail.data?.cargoItems ?? [])
  const routeSubtitle = computed(() =>
    detail.data
      ? `${detail.data.originRegion || '--'} → ${detail.data.destinationRegion || '--'}`
      : '--'
  )
  const transportTypeLabel = computed(() =>
    getDictLabel('tmsCustomerPriceTransportType', detail.data?.transportType)
  )

  const baseItems: ArtDescriptionItem<Partial<CustomerPrice>>[] = [
    { key: 'customerName', label: '客户名称', value: () => detail.data?.customer?.customerName },
    {
      key: 'customerCode',
      label: '客户编码',
      value: () => detail.data?.customer?.customerCode,
      copyable: true
    },
    {
      key: 'contractName',
      label: '关联合同名称',
      value: () => detail.data?.contract?.contractName
    },
    {
      key: 'contractNo',
      label: '关联合同编号',
      value: () => detail.data?.contract?.contractNo,
      copyable: true
    },
    {
      key: 'agreementStatus',
      label: '协议状态',
      field: 'agreementStatus',
      dictCode: 'tmsPriceAgreementStatus',
      dictDisplay: 'auto'
    },
    {
      key: 'effectiveFrom',
      label: '生效日期',
      field: 'effectiveFrom',
      formatter: (value) => formatDateTimeValue(value as string | null, { format: 'YYYY-MM-DD' })
    },
    {
      key: 'effectiveTo',
      label: '失效日期',
      field: 'effectiveTo',
      formatter: (value) => formatDateTimeValue(value as string | null, { format: 'YYYY-MM-DD' })
    },
    {
      key: 'distanceKm',
      label: '线路里程',
      field: 'distanceKm',
      formatter: (value) =>
        value == null || value === ''
          ? '--'
          : `${formatCompactNumberValue(value as number | string, 2)} km`
    },
    {
      key: 'transportType',
      label: '运输类型',
      field: 'transportType',
      dictCode: 'tmsCustomerPriceTransportType',
      dictDisplay: 'text'
    },
    {
      key: 'cargoType',
      label: '货物类型',
      field: 'cargoType',
      dictCode: 'tmsCustomerPriceCargoType',
      dictDisplay: 'text'
    }
  ]
  const shippingItems = computed<ArtDescriptionItem<Partial<CustomerPrice>>[]>(() => [
    { key: 'shippingContactName', label: '联系人', field: 'shippingContactName' },
    ...(canViewSensitiveField('contactPhones')
      ? [
          {
            key: 'shippingContactPhone',
            label: '联系电话',
            field: 'shippingContactPhone',
            copyable: true
          } satisfies ArtDescriptionItem<Partial<CustomerPrice>>
        ]
      : []),
    ...(canViewSensitiveField('addressDetails')
      ? [
          {
            key: 'shippingAddress',
            label: '详细地址',
            value: (data: Partial<CustomerPrice>) =>
              formatRateAddress(data.originRegion, data.shippingAddressDetail)
          } satisfies ArtDescriptionItem<Partial<CustomerPrice>>,
          {
            key: 'shippingCoordinate',
            label: '经纬度',
            value: (data: Partial<CustomerPrice>) =>
              formatCoordinateValue(data.shippingLongitude, data.shippingLatitude)
          } satisfies ArtDescriptionItem<Partial<CustomerPrice>>
        ]
      : [])
  ])
  const receivingItems = computed<ArtDescriptionItem<Partial<CustomerPrice>>[]>(() => [
    { key: 'receivingContactName', label: '联系人', field: 'receivingContactName' },
    ...(canViewSensitiveField('contactPhones')
      ? [
          {
            key: 'receivingContactPhone',
            label: '联系电话',
            field: 'receivingContactPhone',
            copyable: true
          } satisfies ArtDescriptionItem<Partial<CustomerPrice>>
        ]
      : []),
    ...(canViewSensitiveField('addressDetails')
      ? [
          {
            key: 'receivingAddress',
            label: '详细地址',
            value: (data: Partial<CustomerPrice>) =>
              formatRateAddress(data.destinationRegion, data.receivingAddressDetail)
          } satisfies ArtDescriptionItem<Partial<CustomerPrice>>,
          {
            key: 'receivingCoordinate',
            label: '经纬度',
            value: (data: Partial<CustomerPrice>) =>
              formatCoordinateValue(data.receivingLongitude, data.receivingLatitude)
          } satisfies ArtDescriptionItem<Partial<CustomerPrice>>
        ]
      : [])
  ])
  const vehicleItems: ArtDescriptionItem<Partial<CustomerPrice>>[] = [
    {
      key: 'vehicleType',
      label: '车型',
      field: 'vehicleType',
      dictCode: 'tmsCustomerPriceVehicleType',
      dictDisplay: 'text'
    },
    {
      key: 'vehicleLength',
      label: '车长',
      field: 'vehicleLength',
      dictCode: 'tmsCustomerPriceVehicleLength',
      dictDisplay: 'text'
    },
    {
      key: 'vehicleCount',
      label: '车辆数',
      field: 'vehicleCount',
      formatter: (value) =>
        formatSensitiveNumber(value as number | null, { maximumFractionDigits: 0 })
    },
    {
      key: 'billingMethod',
      label: '计费方式',
      field: 'billingMethod',
      dictCode: 'tmsCustomerPriceBillingMethod',
      dictDisplay: 'text'
    }
  ]
  const feeItems: ArtDescriptionItem<Partial<CustomerPrice>>[] = createMoneyItems([
    ['transportFee', '运输费'],
    ['insuranceFee', '保险费'],
    ['packageFee', '包装费'],
    ['loadingFee', '装卸费'],
    ['transferFee', '中转费'],
    ['fuelFee', '燃油费'],
    ['serviceFee', '服务费'],
    ['otherFee', '其他费用'],
    ['totalFee', '费用合计']
  ])
  const paymentItems: ArtDescriptionItem<Partial<CustomerPrice>>[] = createMoneyItems([
    ['cashAmount', '现付'],
    ['prepaidAmount', '预付'],
    ['collectAmount', '到付'],
    ['periodicAmount', '回付/月结'],
    ['paymentTotal', '付款合计']
  ])
  const auditItems: ArtDescriptionItem<Partial<CustomerPrice>>[] = [
    { key: 'remark', label: '备注', field: 'remark', span: 4 },
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      field: 'createTime',
      formatter: (value) => formatDateTimeValue(value as string | null)
    },
    { key: 'updateBy', label: '更新人', field: 'updateBy' },
    {
      key: 'updateTime',
      label: '更新时间',
      field: 'updateTime',
      formatter: (value) => formatDateTimeValue(value as string | null)
    }
  ]
  const cargoColumns = computed<ColumnOption<CargoItem>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 68 },
    { prop: 'cargoName', label: '货物名称', minWidth: 180 },
    { prop: 'cargoCode', label: '货物编码', minWidth: 140 },
    { prop: 'specModel', label: '规格型号', minWidth: 140 },
    {
      prop: 'quantity',
      label: '数量',
      minWidth: 100,
      align: 'right',
      formatter: (row) => formatSensitiveNumber(row.quantity, { maximumFractionDigits: 2 })
    },
    { prop: 'unit', label: '单位', minWidth: 100, dict: { code: 'tmsCargoUnit', display: 'text' } },
    {
      prop: 'volumeM3',
      label: '体积(m³)',
      minWidth: 120,
      align: 'right',
      formatter: (row) => formatSensitiveNumber(row.volumeM3, { maximumFractionDigits: 2 })
    },
    {
      prop: 'weightKg',
      label: '重量(kg)',
      minWidth: 120,
      align: 'right',
      formatter: (row) => formatSensitiveNumber(row.weightKg, { maximumFractionDigits: 2 })
    },
    {
      prop: 'sourceContract',
      label: '来源合同',
      minWidth: 210,
      formatter: (row) =>
        [row.sourceContractName, row.sourceContractNo].filter(Boolean).join(' · ') || '-'
    },
    ...(canViewSensitiveField('quoteAmounts')
      ? [
          {
            prop: 'unitPrice',
            label: '协议单价（元）',
            minWidth: 135,
            align: 'right',
            formatter: (row) => formatSensitiveNumber(row.unitPrice)
          } as ColumnOption<CargoItem>,
          {
            prop: 'freight',
            label: '货物运费（元）',
            minWidth: 135,
            align: 'right',
            formatter: (row) => formatSensitiveNumber(row.freight)
          } as ColumnOption<CargoItem>
        ]
      : [])
  ])

  onMounted(() => void loadPage())

  async function loadPage(): Promise<void> {
    const id = String(route.params.id || '')
    if (!id) {
      page.error = new Error('缺少客户协议价标识')
      return
    }
    page.loading = true
    page.error = null
    try {
      const { data } = await fetchCustomerPriceDetail(id)
      detail.data = data ?? undefined
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('客户协议价详情加载失败')
    } finally {
      page.loading = false
    }
  }

  function goBack(): void {
    void router.push({ name: 'TmsCustomerPrice' })
  }
  function canViewSensitiveField(field: CustomerPriceFieldKey): boolean {
    return canViewField(detail.data?.fieldAccess, field)
  }
  function getDictLabel(code: keyof typeof getDictMap.value, value?: string | null): string {
    if (!value) return '--'
    const item = getDictMap.value[code]?.find(
      (option) => option.value === value || option.label === value
    )
    return item?.label || item?.name || value
  }
  function createMoneyItems(
    entries: Array<[keyof CustomerPrice, string]>
  ): ArtDescriptionItem<Partial<CustomerPrice>>[] {
    return entries.map(([key, label]) => ({
      key: String(key),
      label,
      field: String(key),
      formatter: (value) =>
        formatSensitiveNumberWithAffix(value as number | string | null, { prefix: '¥ ' })
    }))
  }
</script>

<style scoped lang="scss" src="../modules/rate-card-detail.scss"></style>
