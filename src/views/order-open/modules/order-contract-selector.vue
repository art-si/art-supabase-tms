<template>
  <ArtTableSingleSelect
    ref="selectRef"
    v-model="selectedId"
    v-model:selected-data="selectedRows"
    :api-fn="fetchRows"
    :columns="columns"
    title="选择客户合同"
    row-key="id"
    label-key="contractNo"
    description-key="contractName"
    search-placeholder="搜索合同编号、纸质编号、名称或助记码"
    empty-text="暂无可用合同"
    empty-description="请确认发货客户已有审批通过且在有效期内的合同。"
    dialog-width="xl"
    @confirm="confirm"
  >
    <template #trigger></template>
  </ArtTableSingleSelect>
</template>

<script setup lang="ts">
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { fetchOrderContractCandidates, type OrderContractCandidate } from '@tms/api'
  import { formatWithDayjs } from '@/utils/time'

  defineOptions({ name: 'TmsOrderContractSelector' })
  const emit = defineEmits<{ select: [contract: OrderContractCandidate] }>()
  const selectRef = ref<ArtDataSelectExpose>()
  const selectedId = ref<string | number>()
  const selectedRows = ref<DataSelectRecord[]>([])
  const customerId = ref('')
  const columns: DataSelectColumn[] = [
    { prop: 'contractNo', label: '合同编号', minWidth: 180 },
    { prop: 'contractName', label: '合同名称', minWidth: 220 },
    { prop: 'paperContractNo', label: '纸质合同编号', minWidth: 160 },
    { prop: 'mnemonicCode', label: '助记码', minWidth: 120 },
    {
      prop: 'contractCategory',
      label: '合同类别',
      minWidth: 120,
      dict: { code: 'tmsContractCategory', display: 'text' }
    },
    {
      prop: 'transportMode',
      label: '运输方式',
      minWidth: 120,
      dict: { code: 'tmsContractTransportMode', display: 'text' }
    },
    { prop: 'carrierName', label: '承运商', minWidth: 180 },
    { prop: 'customerName', label: '客户/货主', minWidth: 180 },
    { prop: 'contactName', label: '业务联系人', minWidth: 120 },
    { prop: 'customerSignatory', label: '客户签约人', minWidth: 120 },
    { prop: 'handler', label: '经办人', minWidth: 120 },
    {
      prop: 'signTime',
      label: '签约日期',
      width: 130,
      formatter: (row) => formatWithDayjs(row.signTime, 'YYYY-MM-DD') || '—'
    },
    { prop: 'effectiveDate', label: '生效日期', width: 130 },
    { prop: 'expiryDate', label: '到期日期', width: 130 }
  ]

  async function fetchRows(params: DataSelectFetchParams) {
    const rows = await fetchOrderContractCandidates(customerId.value, params.keyword)
    return {
      data: rows.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
      total: rows.length
    }
  }

  async function open(id: string): Promise<void> {
    customerId.value = id
    selectedId.value = undefined
    selectedRows.value = []
    await selectRef.value?.open()
  }

  function confirm(_value: unknown, rows: DataSelectRecord[]): void {
    const contract = rows[0] as OrderContractCandidate | undefined
    if (contract) emit('select', contract)
  }

  defineExpose({ open })
</script>
