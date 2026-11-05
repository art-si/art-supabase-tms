<template>
  <ArtSectionCard
    v-if="visible"
    :title="section === 'payable' ? '承运对账回写' : '运输装卸回写'"
    :subtitle="
      section === 'payable'
        ? '按关联调度运单展示承运对账明细。'
        : '按调度运单展示现场装卸与签收记录。'
    "
    :loading="loading"
    :error="error"
    :empty="loaded && !hasRows"
    :empty-title="section === 'payable' ? '暂无承运对账' : '暂无装卸签收记录'"
    :empty-description="
      section === 'payable'
        ? '执行运单产生对账后会在这里显示。'
        : '现场完成装卸或签收后会在这里显示。'
    "
    @retry="load"
  >
    <template v-if="section === 'payable'">
      <ArtTable
        :data="data.carrierReconciliation"
        :columns="reconciliationColumns"
        :pagination="false"
        row-key="statementId"
      />
    </template>
    <template v-else>
      <div class="grid min-w-0 gap-5">
        <section v-if="operations.length">
          <ArtSectionTitle :show-line="false">装卸作业</ArtSectionTitle>
          <ArtTable
            :data="operations"
            :columns="operationColumns"
            :pagination="false"
            row-key="id"
          />
          <div v-if="showProof" class="mt-3 grid min-w-0 gap-3">
            <div
              v-for="item in operations"
              :key="item.id"
              class="min-w-0 border-t border-[var(--el-border-color-lighter)] pt-3"
            >
              <strong class="text-sm"
                >{{ item.waybillNo }} ·
                {{ item.operationType === 'loading' ? '装货' : '卸货' }}凭证</strong
              >
              <div class="mt-2 grid gap-3 md:grid-cols-2">
                <ArtUploadFile
                  v-if="item.weighbridgeTicketUrls?.length"
                  :model-value="item.weighbridgeTicketUrls"
                  readonly
                  multiple
                  title="磅单"
                />
                <ArtUploadFile
                  v-if="item.photoUrls?.length"
                  :model-value="item.photoUrls"
                  readonly
                  multiple
                  title="现场照片"
                />
              </div>
            </div>
          </div>
        </section>
        <section v-if="data.signatures.length">
          <ArtSectionTitle :show-line="false">签收记录</ArtSectionTitle>
          <ArtTable
            :data="data.signatures"
            :columns="signatureColumns"
            :pagination="false"
            row-key="waybillId"
          />
          <div v-if="showProof" class="mt-3 grid min-w-0 gap-3">
            <div
              v-for="item in data.signatures"
              :key="item.waybillId"
              class="min-w-0 border-t border-[var(--el-border-color-lighter)] pt-3"
            >
              <strong class="text-sm">{{ item.waybillNo }} · 签收凭证</strong>
              <div class="mt-2 grid gap-3 md:grid-cols-2">
                <ArtUploadFile
                  v-if="item.receiptUrls?.length"
                  :model-value="item.receiptUrls"
                  readonly
                  multiple
                  title="回单"
                />
                <ArtUploadFile
                  v-if="item.signatureUrls?.length"
                  :model-value="item.signatureUrls"
                  readonly
                  multiple
                  title="签名"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import type { ColumnOption } from '@/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { fetchOrderExecutionSupplement } from '@tms/api'

  defineOptions({ name: 'TmsOrderExecutionSupplement' })
  type Supplement = Api.Tms.Order.OrderExecutionSupplement
  type Operation = Api.Tms.Order.OrderExecutionEvidence
  type Signature = Api.Tms.Order.OrderExecutionSignature
  type Reconciliation = Api.Tms.Order.OrderCarrierReconciliation
  const props = defineProps<{
    orderId?: string | null
    section: 'payable' | 'loading'
    showAmounts: boolean
    showProof: boolean
  }>()
  const visible = computed(() =>
    props.section === 'payable' ? props.showAmounts : props.showProof
  )
  const emptyData = (): Supplement => ({
    loading: [],
    unloading: [],
    signatures: [],
    carrierReconciliation: []
  })
  const data = ref<Supplement>(emptyData())
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)
  let request = 0
  const operations = computed(() => [...data.value.loading, ...data.value.unloading])
  const hasRows = computed(() =>
    props.section === 'payable'
      ? data.value.carrierReconciliation.length > 0
      : operations.value.length > 0 || data.value.signatures.length > 0
  )
  const operationColumns: ColumnOption<Operation>[] = [
    { prop: 'waybillNo', label: '调度运单号', minWidth: 180 },
    {
      prop: 'operationType',
      label: '作业',
      width: 90,
      formatter: (row) => (row.operationType === 'loading' ? '装货' : '卸货')
    },
    {
      prop: 'operationStatus',
      label: '状态',
      width: 100,
      formatter: (row) =>
        row.operationStatus === 'completed'
          ? '已完成'
          : row.operationStatus === 'checked_in'
            ? '已签到'
            : '待处理'
    },
    {
      prop: 'completedAt',
      label: '完成时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.completedAt) || '—'
    },
    {
      prop: 'weightTon',
      label: '重量（吨）',
      width: 120,
      align: 'right',
      formatter: (row) => (row.weightTon == null ? '—' : String(row.weightTon))
    },
    { prop: 'remark', label: '备注', minWidth: 180 }
  ]
  const signatureColumns: ColumnOption<Signature>[] = [
    { prop: 'waybillNo', label: '调度运单号', minWidth: 180 },
    {
      prop: 'signedAt',
      label: '签收时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.signedAt) || '—'
    },
    { prop: 'signerName', label: '签收人', minWidth: 130 },
    { prop: 'signatureRemark', label: '备注', minWidth: 180 }
  ]
  const reconciliationColumns: ColumnOption<Reconciliation>[] = [
    { prop: 'statementNo', label: '承运对账单', minWidth: 180 },
    { prop: 'waybillNo', label: '调度运单号', minWidth: 180 },
    { prop: 'carrierName', label: '承运商', minWidth: 160 },
    {
      prop: 'status',
      label: '状态',
      width: 120,
      dict: { code: 'tmsSettlementStatus', display: 'text' }
    },
    {
      prop: 'lineAmount',
      label: '本单对账金额',
      width: 140,
      align: 'right',
      formatter: (row) => (row.lineAmount == null ? '—' : formatCurrencyValue(row.lineAmount))
    }
  ]
  async function load(): Promise<void> {
    const id = props.orderId
    if (!id || !visible.value) return
    const current = ++request
    loading.value = true
    error.value = null
    try {
      const result = await fetchOrderExecutionSupplement(id)
      if (current !== request) return
      const response = result.data
      if (
        !response ||
        !Array.isArray(response.loading) ||
        !Array.isArray(response.unloading) ||
        !Array.isArray(response.signatures) ||
        !Array.isArray(response.carrierReconciliation)
      )
        throw new Error('订单执行信息返回格式无效')
      data.value = response
      loaded.value = true
    } catch {
      if (current !== request) return
      data.value = emptyData()
      error.value = '关联执行记录加载失败，请重试。'
      loaded.value = false
    } finally {
      if (current === request) loading.value = false
    }
  }
  watch(
    () => [props.orderId, visible.value] as const,
    () => {
      request += 1
      data.value = emptyData()
      loaded.value = false
      if (props.orderId && visible.value) void load()
    },
    { immediate: true }
  )
</script>
