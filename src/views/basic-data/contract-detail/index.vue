<template>
  <ArtPageShell
    class="contract-detail"
    :loading="page.loading"
    loading-mode="skeleton"
    :error="page.error"
    :empty="!detail.data"
    empty-text="暂无合同详情"
    empty-description="请返回合同列表重新选择，或刷新后重试。"
    @retry="loadPage"
  >
    <ArtPageHeader
      :title="detail.data?.contractName || '合同详情'"
      :subtitle="detail.data?.contractNo || '--'"
      show-back
      @back="goBack"
    />

    <section class="contract-detail__summary art-card-xs" aria-label="合同概览">
      <article>
        <span>合同状态</span>
        <ElTag
          v-if="detail.data?.contractStatus"
          :type="contractLifecycleMeta[getContractLifecycleStatus(detail.data)].type"
          effect="light"
        >
          {{ contractLifecycleMeta[getContractLifecycleStatus(detail.data)].label }}
        </ElTag>
        <strong v-else>--</strong>
      </article>
      <article v-if="canViewSensitiveField('contractAmount')">
        <span>合同金额</span>
        <strong>{{
          formatSensitiveNumberWithAffix(detail.data?.contractAmount, { prefix: '¥ ' })
        }}</strong>
      </article>
      <article>
        <span>合同相对方</span>
        <strong>{{ partyName }}</strong>
      </article>
      <article>
        <span>运输明细</span>
        <strong>{{ transportDetails.length }} 行</strong>
      </article>
    </section>

    <div class="contract-detail__content">
      <ArtSectionCard class="contract-detail__section" preserve-content-structure title="基础信息">
        <ArtDescriptions
          :label-width="132"
          :data="descriptionData"
          :items="baseDescriptionItems"
          :columns="4"
        >
          <template #item-contractStatus>
            <ElTag
              v-if="detail.data?.contractStatus"
              :type="contractLifecycleMeta[getContractLifecycleStatus(detail.data)].type"
            >
              {{ contractLifecycleMeta[getContractLifecycleStatus(detail.data)].label }}
            </ElTag>
            <span v-else>--</span>
          </template>
        </ArtDescriptions>
      </ArtSectionCard>

      <ArtSectionCard
        class="contract-detail__section"
        preserve-content-structure
        title="计费与履约"
      >
        <ArtDescriptions
          :label-width="132"
          :data="descriptionData"
          :items="fulfillmentDescriptionItems"
          :columns="4"
        />
      </ArtSectionCard>

      <ArtSectionCard
        class="contract-detail__section"
        preserve-content-structure
        title="运输合同明细"
      >
        <ArtTable
          :data="transportDetails"
          :columns="transportDetailColumns"
          :pagination="undefined"
          empty-text="暂无运输合同明细"
          empty-description="当前合同尚未维护按货物拆分的数量和价格。"
          empty-height="160px"
        />
      </ArtSectionCard>

      <ArtSectionCard
        class="contract-detail__section"
        preserve-content-structure
        title="运输路线与合同约定"
      >
        <ArtDescriptions
          :label-width="132"
          :data="descriptionData"
          :items="termsDescriptionItems"
          :columns="4"
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-if="canViewSensitiveField('attachments')"
        class="contract-detail__section"
        preserve-content-structure
        title="合同附件"
      >
        <div v-if="attachments.length" class="contract-detail__attachments">
          <ArtAttachmentLink
            v-for="attachment in attachments"
            :key="`${attachment.url}-${attachment.name}`"
            :file="attachment"
          />
        </div>
        <span v-else>--</span>
      </ArtSectionCard>

      <section v-if="detail.data?.id" class="contract-detail__section art-card-xs">
        <WorkflowBusinessHistory business-type="tms_contract" :business-id="detail.data.id" />
      </section>
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { ElTag } from 'element-plus'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtAttachmentLink from '@/components/core/media/art-file-viewer/attachment-link.vue'
  import WorkflowBusinessHistory from '@/components/business/workflow-business-history/index.vue'
  import type { ColumnOption } from '@/types'
  import { fetchContractDetail } from '@tms/api'
  import {
    contractLifecycleMeta,
    getContractLifecycleStatus
  } from '../contract/modules/contract-lifecycle'
  import {
    canViewField,
    formatSensitiveNumber,
    formatSensitiveNumberWithAffix
  } from '@/utils/field-permission'

  defineOptions({ name: 'TmsContractDetail' })

  type Contract = Api.Tms.BasicData.Contract
  type ContractFieldKey = Api.Tms.BasicData.ContractFieldKey

  interface PageState {
    loading: boolean
    error: Error | null
  }

  interface DetailState {
    data?: Contract
  }

  const route = useRoute()
  const router = useRouter()

  const page = reactive<PageState>({ loading: false, error: null })
  const detail = reactive<DetailState>({ data: undefined })
  const descriptionData = computed<Partial<Contract>>(() => detail.data ?? {})
  const fieldAccess = computed(() => detail.data?.fieldAccess)
  const canViewSensitiveField = (field: ContractFieldKey): boolean =>
    canViewField(fieldAccess.value, field)
  const baseDescriptionItems = computed<ArtDescriptionItem<Partial<Contract>>[]>(() => [
    {
      key: 'contractStatus',
      label: '审核状态',
      field: 'contractStatus',
      dictCode: 'tmsContractStatus',
      dictDisplay: 'text'
    },
    { key: 'contractNo', label: '合同编号', field: 'contractNo', copyable: true },
    { key: 'paperContractNo', label: '纸质合同编号', field: 'paperContractNo', copyable: true },
    { key: 'mnemonicCode', label: '助记码', field: 'mnemonicCode' },
    { key: 'contractName', label: '合同名称', field: 'contractName', span: 3 },
    {
      key: 'contractCategory',
      label: '合同类别',
      field: 'contractCategory',
      dictCode: 'tmsContractCategory',
      dictDisplay: 'text'
    },
    {
      key: 'businessContractType',
      label: '业务合同分类',
      field: 'businessContractType',
      dictCode: 'tmsContractBusinessType',
      dictDisplay: 'text'
    },
    {
      key: 'transportMode',
      label: '运输方式',
      field: 'transportMode',
      dictCode: 'tmsContractTransportMode',
      dictDisplay: 'text'
    },
    { key: 'partyName', label: '合同相对方', value: () => partyName.value },
    { key: 'contactName', label: '联系人姓名', field: 'contactName' },
    ...(canViewSensitiveField('partyContactPhone')
      ? [
          {
            key: 'partyContactPhone',
            label: '联系电话',
            field: 'partyContactPhone'
          }
        ]
      : []),
    { key: 'customerSignatory', label: '客户签约人', field: 'customerSignatory' },
    { key: 'waybillNo', label: '运单号', field: 'waybillNo', copyable: true },
    { key: 'handler', label: '经办人', field: 'handler' }
  ])

  const fulfillmentDescriptionItems = computed<ArtDescriptionItem<Partial<Contract>>[]>(() => [
    {
      key: 'billingMethod',
      label: '计费方式',
      field: 'billingMethod',
      dictCode: 'tmsContractBillingMethod',
      dictDisplay: 'text'
    },
    {
      key: 'billingUnit',
      label: '计费单位',
      field: 'billingUnit',
      dictCode: 'tmsCargoUnit',
      dictDisplay: 'text'
    },
    ...(canViewSensitiveField('contractAmount')
      ? [
          {
            key: 'contractAmount',
            label: '合同金额',
            field: 'contractAmount',
            formatter: (_value: unknown, data: Partial<Contract>) =>
              formatSensitiveNumberWithAffix(data.contractAmount)
          }
        ]
      : []),
    ...(canViewSensitiveField('transportUnitPrice')
      ? [
          {
            key: 'transportUnitPrice',
            label: '运输单价',
            field: 'transportUnitPrice',
            formatter: (_value: unknown, data: Partial<Contract>) =>
              formatSensitiveNumberWithAffix(data.transportUnitPrice)
          }
        ]
      : []),
    ...(canViewSensitiveField('roadConsumptionRate')
      ? [
          {
            key: 'roadConsumptionRate',
            label: '路耗标准',
            field: 'roadConsumptionRate',
            formatter: (_value: unknown, data: Partial<Contract>) =>
              formatSensitiveNumberWithAffix(data.roadConsumptionRate, {
                suffix: '%',
                numberFormat: { maximumFractionDigits: 4 }
              })
          }
        ]
      : []),
    ...(canViewSensitiveField('lossDeductionPrice')
      ? [
          {
            key: 'lossDeductionPrice',
            label: '亏扣价',
            field: 'lossDeductionPrice',
            formatter: (_value: unknown, data: Partial<Contract>) =>
              formatSensitiveNumberWithAffix(data.lossDeductionPrice)
          }
        ]
      : []),
    { key: 'signTime', label: '签订时间', field: 'signTime', format: 'datetime' },
    { key: 'effectiveDate', label: '生效日期', field: 'effectiveDate', format: 'date' },
    { key: 'expiryDate', label: '到期日期', field: 'expiryDate', format: 'date' },
    ...(detail.data?.contractStatus === 'terminated'
      ? [
          {
            key: 'terminatedAt',
            label: '终止时间',
            field: 'terminatedAt',
            format: 'datetime' as const
          },
          { key: 'terminationReason', label: '终止原因', field: 'terminationReason', span: 3 }
        ]
      : []),
    {
      key: 'isCompleted',
      label: '是否完成',
      field: 'isCompleted',
      formatter: (value) => (value === true ? '是' : '否')
    },
    {
      key: 'agreedTransportQuantity',
      label: '合同约定运输量',
      field: 'agreedTransportQuantity',
      formatter: (value) =>
        formatSensitiveNumber(value as number | null | undefined, { maximumFractionDigits: 4 })
    }
  ])

  const termsDescriptionItems: ArtDescriptionItem<Partial<Contract>>[] = [
    { key: 'transportRoute', label: '运输路线', field: 'transportRoute', span: 2 },
    { key: 'shipperName', label: '发货方', field: 'shipperName' },
    { key: 'consigneeName', label: '收货方', field: 'consigneeName' },
    { key: 'payerName', label: '付款方', field: 'payerName' },
    {
      key: 'specialTransportRequirements',
      label: '运输特殊要求',
      field: 'specialTransportRequirements',
      span: 3
    },
    { key: 'otherDeductionTerms', label: '其他扣款约定', field: 'otherDeductionTerms', span: 4 },
    { key: 'contractDescription', label: '合同说明摘要', field: 'contractDescription', span: 4 }
  ]

  const attachments = computed(() => detail.data?.attachments ?? [])
  const transportDetails = computed(() => detail.data?.transportDetails ?? [])
  const partyName = computed(
    () => detail.data?.customer?.customerName || detail.data?.carrier?.companyName || '--'
  )
  const transportDetailColumns = computed<
    ColumnOption<Api.Tms.BasicData.ContractTransportDetail>[]
  >(() => [
    { type: 'globalIndex', label: '行号', width: 68 },
    { prop: 'cargoDescription', label: '货物描述', minWidth: 180, showOverflowTooltip: true },
    { prop: 'cargoCode', label: '货物编码', minWidth: 130 },
    {
      prop: 'contractQuantity',
      label: '合同数量',
      minWidth: 120,
      align: 'right',
      formatter: (row) => formatSensitiveNumber(row.contractQuantity, { maximumFractionDigits: 4 })
    },
    { prop: 'unit', label: '计量单位', minWidth: 110, dict: { code: 'tmsCargoUnit' } },
    ...(canViewSensitiveField('transportDetailsPricing')
      ? [
          {
            prop: 'transportUnitPrice',
            label: '运输单价(元)',
            minWidth: 140,
            align: 'right' as const,
            formatter: (row: Api.Tms.BasicData.ContractTransportDetail) =>
              formatSensitiveNumberWithAffix(row.transportUnitPrice)
          },
          {
            prop: 'freight',
            label: '运费(元)',
            minWidth: 130,
            align: 'right' as const,
            formatter: (row: Api.Tms.BasicData.ContractTransportDetail) =>
              formatSensitiveNumberWithAffix(row.freight)
          }
        ]
      : [])
  ])

  onMounted(() => {
    void loadPage()
  })

  const loadPage = async (): Promise<void> => {
    const id = String(route.params.id || '')
    if (!id) {
      page.error = new Error('缺少合同标识')
      return
    }

    page.loading = true
    page.error = null
    try {
      const { data } = await fetchContractDetail(id)
      detail.data = data ?? undefined
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('合同详情加载失败')
    } finally {
      page.loading = false
    }
  }

  const goBack = (): void => {
    void router.push('/tms/basic-data/contract')
  }
</script>

<style scoped lang="scss">
  .contract-detail {
    min-height: 100%;
    padding: 16px;
    background: var(--default-box-color);

    &__content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 12px;
    }

    &__summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 12px;
      overflow: hidden;

      article {
        display: grid;
        gap: 6px;
        min-width: 0;
        padding: 16px 20px;

        &:not(:last-child) {
          border-right: 1px solid var(--el-border-color-lighter);
        }

        > span {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }

        > strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 18px;
          font-variant-numeric: tabular-nums;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }

        :deep(.el-tag) {
          width: fit-content;
        }
      }
    }

    &__section {
      padding: 20px;
    }

    &__attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
    }

    @media (width <= 768px) {
      padding: var(--art-space-3);

      &__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        article:nth-child(2) {
          border-right: 0;
        }

        article:nth-child(-n + 2) {
          border-bottom: 1px solid var(--el-border-color-lighter);
        }
      }
    }

    @media (width <= 520px) {
      &__summary {
        grid-template-columns: 1fr;

        article {
          border-right: 0 !important;

          &:not(:last-child) {
            border-bottom: 1px solid var(--el-border-color-lighter);
          }
        }
      }
    }
  }
</style>
