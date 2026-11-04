<template>
  <ArtPageShell
    class="rate-card-detail"
    :loading="page.loading"
    loading-mode="skeleton"
    :error="page.error"
    :empty="!detail.data"
    empty-text="暂无承运商协议价详情"
    empty-description="请返回承运商协议价列表重新选择，或刷新后重试。"
    @retry="loadPage"
  >
    <ArtPageHeader
      :title="detail.data?.quoteNo || '承运商协议价详情'"
      :subtitle="detail.data?.carrier?.companyName || '--'"
      show-back
      @back="goBack"
    />

    <section class="rate-card-detail__summary art-card-xs" aria-label="承运商协议价概览">
      <article
        ><span>协议价编号</span><strong>{{ detail.data?.quoteNo || '--' }}</strong></article
      >
      <article
        ><span>承运商</span
        ><strong>{{ detail.data?.carrier?.companyName || '--' }}</strong></article
      >
      <article
        ><span>货物明细</span><strong>{{ cargoItems.length }} 项</strong></article
      >
      <article v-if="canViewSensitiveField('costAmounts')"
        ><span>成本合计</span
        ><strong>{{
          formatSensitiveNumberWithAffix(detail.data?.totalFee, { prefix: '¥ ' })
        }}</strong></article
      >
    </section>

    <div class="rate-card-detail__content">
      <ArtSectionCard class="rate-card-detail__section" preserve-content-structure title="运输路线">
        <div class="rate-card-detail__route">
          <div class="rate-card-detail__route-point"
            ><span>始发地</span><strong>{{ detail.data?.originRegion || '--' }}</strong></div
          >
          <span class="rate-card-detail__route-arrow" aria-hidden="true">→</span>
          <div class="rate-card-detail__route-point"
            ><span>目的地</span><strong>{{ detail.data?.destinationRegion || '--' }}</strong></div
          >
        </div>
        <ArtDescriptions :data="descriptionData" :items="routeItems" :columns="4" />
      </ArtSectionCard>

      <ArtSectionCard
        class="rate-card-detail__section"
        preserve-content-structure
        title="承运主体与运力"
      >
        <div class="rate-card-detail__split">
          <article class="rate-card-detail__panel">
            <div class="rate-card-detail__panel-heading"
              ><b>承</b
              ><div><strong>承运商信息</strong><span>协议价对应的承运主体与联系人</span></div></div
            >
            <ArtDescriptions :data="descriptionData" :items="carrierItems" :columns="1" />
          </article>
          <article class="rate-card-detail__panel">
            <div class="rate-card-detail__panel-heading"
              ><b class="is-orange">车</b
              ><div><strong>司机与车辆</strong><span>执行本协议价线路的运力信息</span></div></div
            >
            <ArtDescriptions :data="descriptionData" :items="capacityItems" :columns="2" />
          </article>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        class="rate-card-detail__section"
        preserve-content-structure
        title="货物与拆分成本"
      >
        <ArtTable
          :data="cargoItems"
          :columns="cargoColumns"
          :pagination="undefined"
          empty-text="暂无货物明细"
          empty-description="当前承运商协议价未维护货物或拆分成本。"
          empty-height="150px"
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-if="canViewSensitiveField('costAmounts')"
        class="rate-card-detail__section"
        preserve-content-structure
        title="成本与计费"
      >
        <ArtDescriptions :data="descriptionData" :items="costItems" :columns="4" />
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
  import { formatAuditActorName } from '@/utils/business/audit-actor-display'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { fetchCarrierPriceDetail } from '@tms/api'

  import {
    canViewField,
    formatSensitiveNumber,
    formatSensitiveNumberWithAffix
  } from '@/utils/field-permission'
  import { formatCompactNumberValue, formatDateTimeValue } from '@/utils/ui/format'

  defineOptions({ name: 'TmsCarrierPriceDetail' })

  type CarrierPrice = Api.Tms.BasicData.CarrierPrice
  type CargoItem = Api.Tms.BasicData.CarrierPriceCargoItem
  type CarrierPriceFieldKey = Api.Tms.BasicData.CarrierPriceFieldKey

  const route = useRoute()
  const router = useRouter()
  const page = reactive({ loading: false, error: null as Error | null })
  const detail = reactive<{ data?: CarrierPrice }>({ data: undefined })
  const descriptionData = computed<Partial<CarrierPrice>>(() => detail.data ?? {})
  const cargoItems = computed(() => detail.data?.cargoItems ?? [])

  const routeItems: ArtDescriptionItem<Partial<CarrierPrice>>[] = [
    { key: 'quoteNo', label: '协议价编号', field: 'quoteNo', copyable: true },
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
      key: 'transportMode',
      label: '运输方式',
      field: 'transportMode',
      dictCode: 'tmsCarrierPriceTransportMode',
      dictDisplay: 'text'
    },
    {
      key: 'billingMethod',
      label: '计费方式',
      field: 'billingMethod',
      dictCode: 'tmsCustomerPriceBillingMethod',
      dictDisplay: 'text'
    },
    {
      key: 'cargoSummary',
      label: '货物汇总',
      value: (data: Partial<CarrierPrice>) =>
        `${formatSensitiveNumber(data.cargoQuantityTotal, { maximumFractionDigits: 2 })} 件 / ${formatSensitiveNumber(data.cargoVolumeTotal, { maximumFractionDigits: 2 })} m³ / ${formatSensitiveNumber(data.cargoWeightTotal, { maximumFractionDigits: 2 })} kg`
    }
  ]
  const carrierItems = computed<ArtDescriptionItem<Partial<CarrierPrice>>[]>(() => [
    { key: 'carrierName', label: '承运商', value: () => detail.data?.carrier?.companyName },
    {
      key: 'carrierCode',
      label: '承运商编码',
      value: () => detail.data?.carrier?.carrierCode,
      copyable: true
    },
    { key: 'contactName', label: '联系人', field: 'contactName' },
    ...(canViewSensitiveField('contactPhones')
      ? [
          {
            key: 'contactPhone',
            label: '联系电话',
            field: 'contactPhone',
            copyable: true
          } satisfies ArtDescriptionItem<Partial<CarrierPrice>>
        ]
      : [])
  ])
  const capacityItems = computed<ArtDescriptionItem<Partial<CarrierPrice>>[]>(() => [
    { key: 'driverName', label: '司机', field: 'driverName' },
    ...(canViewSensitiveField('contactPhones')
      ? [
          {
            key: 'driverPhone',
            label: '司机电话',
            field: 'driverPhone',
            copyable: true
          } satisfies ArtDescriptionItem<Partial<CarrierPrice>>
        ]
      : []),
    { key: 'plateNo', label: '车牌号', field: 'plateNo', copyable: true },
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
    }
  ])
  const costItems: ArtDescriptionItem<Partial<CarrierPrice>>[] = createMoneyItems([
    ['transportCost', '运输成本'],
    ['splitTransportFee', '拆分运输费'],
    ['loadingFee', '装卸费'],
    ['packageFee', '包装费'],
    ['otherFee', '其他费用'],
    ['totalFee', '成本合计']
  ])
  const paymentItems: ArtDescriptionItem<Partial<CarrierPrice>>[] = createMoneyItems([
    ['cashAmount', '现付'],
    ['prepaidAmount', '预付'],
    ['collectAmount', '到付'],
    ['periodicAmount', '回付/月结'],
    ['paymentTotal', '付款合计']
  ])
  const auditItems: ArtDescriptionItem<Partial<CarrierPrice>>[] = [
    { key: 'remark', label: '备注', field: 'remark', span: 4 },
    {
      key: 'createBy',
      label: '创建人',
      field: 'createBy',
      value: (row) => formatAuditActorName(row.createBy)
    },
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
    { prop: 'orderNo', label: '订单号', minWidth: 140 },
    { prop: 'cargoName', label: '货物名称', minWidth: 160 },
    { prop: 'cargoCode', label: '货物编码', minWidth: 140 },
    { prop: 'specModel', label: '规格型号', minWidth: 140 },
    {
      prop: 'quantity',
      label: '数量',
      minWidth: 90,
      align: 'right',
      formatter: (row) => formatSensitiveNumber(row.quantity, { maximumFractionDigits: 2 })
    },
    { prop: 'unit', label: '单位', minWidth: 90, dict: { code: 'tmsCargoUnit', display: 'text' } },
    {
      prop: 'volumeM3',
      label: '体积(m³)',
      minWidth: 110,
      align: 'right',
      formatter: (row) => formatSensitiveNumber(row.volumeM3, { maximumFractionDigits: 2 })
    },
    {
      prop: 'weightKg',
      label: '重量(kg)',
      minWidth: 110,
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
    ...(canViewSensitiveField('costAmounts')
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
          } as ColumnOption<CargoItem>,
          {
            prop: 'splitTransportFee',
            label: '拆分运费(元)',
            minWidth: 130,
            align: 'right',
            formatter: (row) => formatSensitiveNumber(row.splitTransportFee)
          } as ColumnOption<CargoItem>,
          {
            prop: 'loadingFee',
            label: '装卸费(元)',
            minWidth: 120,
            align: 'right',
            formatter: (row) => formatSensitiveNumber(row.loadingFee)
          } as ColumnOption<CargoItem>,
          {
            prop: 'packageFee',
            label: '包装费(元)',
            minWidth: 120,
            align: 'right',
            formatter: (row) => formatSensitiveNumber(row.packageFee)
          } as ColumnOption<CargoItem>
        ]
      : [])
  ])

  onMounted(() => void loadPage())

  async function loadPage(): Promise<void> {
    const id = String(route.params.id || '')
    if (!id) {
      page.error = new Error('缺少承运商协议价标识')
      return
    }
    page.loading = true
    page.error = null
    try {
      const { data } = await fetchCarrierPriceDetail(id)
      detail.data = data ?? undefined
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('承运商协议价详情加载失败')
    } finally {
      page.loading = false
    }
  }

  function goBack(): void {
    void router.push({ name: 'TmsCarrierPrice' })
  }
  function canViewSensitiveField(field: CarrierPriceFieldKey): boolean {
    return canViewField(detail.data?.fieldAccess, field)
  }
  function createMoneyItems(
    entries: Array<[keyof CarrierPrice, string]>
  ): ArtDescriptionItem<Partial<CarrierPrice>>[] {
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
