<template>
  <div class="min-w-0">
    <div
      v-if="!canView"
      class="rounded-lg border border-dashed p-6 text-center text-sm text-[var(--art-text-gray-600)]"
    >
      暂无该类关联记录的查看权限，请联系管理员授权。
    </div>
    <div
      v-else-if="!carrierId"
      class="rounded-lg border border-dashed p-6 text-center text-sm text-[var(--art-text-gray-600)]"
    >
      保存承运商后可查看关联记录。
    </div>
    <div v-else>
      <div v-if="loadError" class="mb-3 flex items-center gap-2 rounded-lg border p-3 text-sm">
        <span>{{ loadError }}</span>
        <ElButton link type="primary" @click="load">重试</ElButton>
      </div>
      <ArtTable
        :data="records"
        :columns="columns"
        :loading="loading"
        :pagination="false"
        :empty-text="emptyText"
        empty-height="180px"
      />
      <p v-if="total > records.length" class="mt-2 text-xs text-[var(--art-text-gray-600)]">
        当前显示前 {{ records.length }} 条，共 {{ total }} 条。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { h } from 'vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { getVehicleTypeFallbackLabel } from '@/utils/business/vehicle-type-display'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchCarrierPriceList,
    fetchCarrierStatements,
    fetchCarrierWaybills,
    fetchDriverListByCarrierId,
    fetchTmsVehicleReferences
  } from '@tms/api'

  type RelatedKind = 'drivers' | 'vehicles' | 'waybills' | 'prices' | 'statements'
  interface RelatedRow {
    id?: string
    driverName?: string | null
    phone?: string | null
    licenseType?: string | null
    enabled?: boolean
    plateNo?: string | null
    vehicleType?: string | null
    companyName?: string | null
    operationStatus?: string | null
    waybillNo?: string
    originCity?: string | null
    destinationCity?: string | null
    status?: string
    quoteNo?: string | null
    originRegion?: string | null
    destinationRegion?: string | null
    totalFee?: number | string | null
    statementNo?: string
    periodStart?: string
    periodEnd?: string
    settledAmount?: number | null
  }
  const props = defineProps<{ kind: RelatedKind; carrierId?: string }>()
  const { hasAuth } = useAuth()
  const permissionByKind: Record<RelatedKind, string> = {
    drivers: 'TmsCarrier:View',
    vehicles: 'TmsCarrier:View',
    waybills: 'TmsCarrier:View',
    prices: 'TmsCarrierPrice:View',
    statements: 'FinanceCarrierSettlement:View'
  }
  const canView = computed(() => hasAuth(permissionByKind[props.kind]))
  const records = ref<RelatedRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const loadError = ref('')
  const emptyText = computed(() => (loadError.value ? '加载失败' : '暂无关联记录'))
  const columns = computed<ColumnOption<RelatedRow>[]>(() => {
    switch (props.kind) {
      case 'drivers':
        return [
          { prop: 'driverName', label: '司机姓名', minWidth: 150 },
          { prop: 'phone', label: '联系电话', minWidth: 150 },
          {
            prop: 'licenseType',
            label: '准驾车型',
            minWidth: 120,
            dict: { code: 'tmsDriverLicenseType', display: 'text' }
          },
          {
            prop: 'enabled',
            label: '状态',
            minWidth: 90,
            dict: {
              code: 'commonBoolean',
              display: 'text',
              value: (row) => (row.enabled == null ? null : String(row.enabled))
            }
          }
        ]
      case 'vehicles':
        return [
          { prop: 'plateNo', label: '车牌号', minWidth: 150 },
          {
            prop: 'vehicleType',
            label: '车型',
            minWidth: 130,
            formatter: (row) =>
              h(ArtDictDisplay, {
                dictCode: 'vehicleType',
                value: row.vehicleType,
                display: 'text',
                unknownText: getVehicleTypeFallbackLabel(row.vehicleType, { unknownText: '待核对' })
              })
          },
          { prop: 'companyName', label: '所属公司', minWidth: 180 },
          {
            prop: 'operationStatus',
            label: '运营状态',
            minWidth: 120,
            dict: { code: 'vehicleOperationStatus', display: 'text' }
          }
        ]
      case 'waybills':
        return [
          { prop: 'waybillNo', label: '运单号', minWidth: 180 },
          { prop: 'originCity', label: '发货城市', minWidth: 130 },
          { prop: 'destinationCity', label: '收货城市', minWidth: 130 },
          {
            prop: 'status',
            label: '状态',
            minWidth: 110,
            dict: { code: 'tmsWaybillStatus', display: 'tag' }
          }
        ]
      case 'prices':
        return [
          { prop: 'quoteNo', label: '协议价编号', minWidth: 180 },
          { prop: 'originRegion', label: '始发地', minWidth: 140 },
          { prop: 'destinationRegion', label: '目的地', minWidth: 140 },
          { prop: 'totalFee', label: '总费用', minWidth: 130 }
        ]
      case 'statements':
        return [
          { prop: 'statementNo', label: '对账单号', minWidth: 180 },
          { prop: 'periodStart', label: '开始日期', minWidth: 130 },
          { prop: 'periodEnd', label: '结束日期', minWidth: 130 },
          {
            prop: 'status',
            label: '状态',
            minWidth: 110,
            dict: { code: 'tmsSettlementStatus', display: 'tag' }
          },
          { prop: 'settledAmount', label: '结算金额', minWidth: 130 }
        ]
    }
    return []
  })

  const load = async (): Promise<void> => {
    if (!props.carrierId || !canView.value) {
      records.value = []
      total.value = 0
      return
    }
    const carrierId = props.carrierId
    loading.value = true
    loadError.value = ''
    try {
      const result =
        props.kind === 'drivers'
          ? await fetchDriverListByCarrierId(carrierId)
          : props.kind === 'vehicles'
            ? await fetchTmsVehicleReferences({ carrierId, from: 0, to: 199 })
            : props.kind === 'waybills'
              ? await fetchCarrierWaybills(carrierId)
              : props.kind === 'prices'
                ? await fetchCarrierPriceList({ carrierId, from: 0, to: 199 })
                : await fetchCarrierStatements(carrierId)
      if (carrierId !== props.carrierId) return
      if (result.error) throw result.error
      records.value = (result.data ?? []).map((row) => ({ ...row }))
      total.value =
        'total' in result ? Number(result.total ?? records.value.length) : records.value.length
    } catch {
      if (carrierId !== props.carrierId) return
      records.value = []
      total.value = 0
      loadError.value = '关联记录加载失败，请检查权限或网络后重试。'
    } finally {
      loading.value = false
    }
  }
  watch(
    () => [props.kind, props.carrierId, canView.value],
    () => void load(),
    { immediate: true }
  )
</script>
