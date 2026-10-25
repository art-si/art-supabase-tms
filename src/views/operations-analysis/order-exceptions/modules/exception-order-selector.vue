<template>
  <ArtTableSingleSelect
    ref="selectorRef"
    title="选择异常订单"
    :api-fn="fetchRows"
    :columns="columns"
    row-key="id"
    label-key="orderNo"
    search-placeholder="搜索发货客户或联系人"
    empty-text="暂无可选订单"
    empty-description="请调整搜索条件，并确认具有订单查看权限。"
    :show-trigger="false"
    show-pagination
    :page-size="10"
    @confirm="confirm"
  />
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectFetchParams,
    DataSelectColumn
  } from '@/components/core/forms/art-data-select/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { isPlainObjectRecord } from '@/utils/type-guards'
  import { fetchOrderList } from '@tms/api/modules/order'
  const selectorRef = ref<ArtDataSelectExpose>()
  const emit = defineEmits<{
    select: [order: { orderId: string; orderNo: string; tenantId?: string }]
  }>()
  const columns: DataSelectColumn[] = [
    { prop: 'orderNo', label: '订单号', minWidth: 180 },
    { prop: 'shippingCustomerName', label: '发货客户', minWidth: 180 },
    { prop: 'receivingCustomerName', label: '收货客户', minWidth: 180 }
  ]
  async function fetchRows(params: DataSelectFetchParams) {
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    const result = await fetchOrderList({ from, to, shippingKeyword: params.keyword })
    if (result.error) throw new Error('订单读取失败，请检查查看权限后重试', { cause: result.error })
    return {
      data: (result.data ?? []).map((row) => ({
        id: row.id,
        orderNo: row.orderNo,
        tenantId: row.tenantId,
        shippingCustomerName: row.shippingCustomer?.customerName || row.shippingContactName,
        receivingCustomerName: row.receivingCustomer?.customerName || row.receivingContactName
      })),
      total: result.total ?? 0
    }
  }
  function confirm(_key: unknown, rows: unknown[]): void {
    const row = rows[0]
    if (!isPlainObjectRecord(row) || typeof row.id !== 'string' || typeof row.orderNo !== 'string')
      return
    emit('select', {
      orderId: row.id,
      orderNo: row.orderNo,
      tenantId: typeof row.tenantId === 'string' ? row.tenantId : undefined
    })
  }
  defineExpose({ handleOpen: () => selectorRef.value?.open() })
</script>
