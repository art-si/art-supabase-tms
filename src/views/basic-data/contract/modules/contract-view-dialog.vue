<template>
  <ArtDialog
    ref="dialogRef"
    class="contract-view-dialog"
    size="xl"
    :loading="page.loading"
    :show-footer="false"
  >
    <ArtAsyncState
      :error="page.error"
      :empty="!detail.data && !page.loading"
      error-title="合同详情加载失败"
      empty-text="暂无合同详情"
      empty-description="请关闭弹窗后重新选择，或重试加载。"
      @retry="loadPage"
    >
      <div v-if="detail.data" class="contract-view-dialog__content">
        <ArtEntitySummary
          icon="ri:file-shield-2-line"
          eyebrow="运输合同详情"
          :title="detail.data.contractName || '未命名合同'"
          :description="detail.data.contractNo || '--'"
        >
          <template #aside>
            <ElTag type="primary">{{ statusLabel }}</ElTag>
          </template>
        </ArtEntitySummary>

        <ElTabs v-model="activeTab" class="contract-view-dialog__tabs">
          <ElTabPane label="基础信息" name="basic">
            <ArtSectionCard preserve-content-structure>
              <ArtDescriptions :data="descriptionData" :items="basicItems" :columns="3" />
            </ArtSectionCard>
          </ElTabPane>
          <ElTabPane label="计费与履约" name="fulfillment">
            <ArtSectionCard preserve-content-structure>
              <ArtDescriptions :data="descriptionData" :items="fulfillmentItems" :columns="3" />
            </ArtSectionCard>
          </ElTabPane>
          <ElTabPane label="运输与合同约定" name="terms">
            <ArtSectionCard preserve-content-structure>
              <ArtDescriptions :data="descriptionData" :items="termsItems" :columns="2" />
            </ArtSectionCard>
          </ElTabPane>
          <ElTabPane label="运输明细" name="details">
            <ArtSectionCard preserve-content-structure>
              <ArtTable
                :data="detail.data.transportDetails || []"
                :columns="transportDetailColumns"
                :pagination="undefined"
                empty-text="暂无运输合同明细"
                empty-description="当前合同尚未维护按货物拆分的数量和价格。"
                empty-height="160px"
              />
            </ArtSectionCard>
          </ElTabPane>
          <ElTabPane label="合同附件" name="attachments">
            <ArtSectionCard preserve-content-structure>
              <div v-if="detail.data.attachments?.length" class="contract-view-dialog__attachments">
                <ArtAttachmentLink
                  v-for="attachment in detail.data.attachments"
                  :key="`${attachment.url}-${attachment.name}`"
                  :file="attachment"
                />
              </div>
              <ArtEmptyState
                v-else
                title="暂无附件"
                description="当前合同未上传附件。"
                :visual-size="72"
                size="compact"
              />
            </ArtSectionCard>
          </ElTabPane>
          <ElTabPane label="审批流程" name="workflow">
            <ArtSectionCard preserve-content-structure>
              <WorkflowBusinessHistory
                business-type="tms_contract"
                :business-id="detail.data.id || contractId"
              />
            </ArtSectionCard>
          </ElTabPane>
        </ElTabs>
      </div>
    </ArtAsyncState>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElTabPane, ElTabs, ElTag } from 'element-plus'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtAttachmentLink from '@/components/core/media/art-file-viewer/attachment-link.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import WorkflowBusinessHistory from '@/components/business/workflow-business-history/index.vue'
  import type { ColumnOption } from '@/types'
  import { fetchContractDetail } from '@tms/api'
  import { formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'TmsContractViewDialog' })

  type Contract = Api.Tms.BasicData.Contract
  type ContractTransportDetail = Api.Tms.BasicData.ContractTransportDetail

  const userStore = useUserStore()
  const dialogRef = ref<ArtDialogExpose<string>>()
  const activeTab = ref('basic')
  const contractId = ref('')
  const page = reactive<{ loading: boolean; error: Error | null }>({ loading: false, error: null })
  const detail = reactive<{ data?: Contract }>({ data: undefined })
  const descriptionData = computed(() => detail.data ?? {})
  const statusLabel = computed(() =>
    getDictionaryDisplayLabel(
      userStore.getDictDisplayItemByValue('tmsContractStatus', detail.data?.contractStatus),
      detail.data?.contractStatus
    )
  )
  const basicItems: ArtDescriptionItem<Partial<Contract>>[] = [
    { key: 'contractNo', label: '合同编号', field: 'contractNo', copyable: true },
    { key: 'paperContractNo', label: '纸质合同编号', field: 'paperContractNo' },
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
    {
      key: 'partyName',
      label: '合同相对方',
      value: () => detail.data?.carrier?.companyName || detail.data?.customer?.customerName || '--'
    },
    { key: 'contactName', label: '业务联系人', field: 'contactName' },
    { key: 'customerSignatory', label: '客户签约人', field: 'customerSignatory' },
    { key: 'handler', label: '经办人', field: 'handler' },
    { key: 'signTime', label: '签约日期', field: 'signTime' },
    { key: 'effectiveDate', label: '生效日期', field: 'effectiveDate' },
    { key: 'expiryDate', label: '到期日期', field: 'expiryDate' }
  ]
  const fulfillmentItems: ArtDescriptionItem<Partial<Contract>>[] = [
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
    {
      key: 'contractAmount',
      label: '合同金额',
      value: () => formatSensitiveNumberWithAffix(detail.data?.contractAmount, { prefix: '¥ ' })
    },
    { key: 'agreedTransportQuantity', label: '约定运输量', field: 'agreedTransportQuantity' },
    {
      key: 'isCompleted',
      label: '履约状态',
      value: () => (detail.data?.isCompleted ? '已完成' : '履约中')
    },
    { key: 'waybillNo', label: '关联运单号', field: 'waybillNo' }
  ]
  const termsItems: ArtDescriptionItem<Partial<Contract>>[] = [
    { key: 'transportRoute', label: '运输路线', field: 'transportRoute', span: 2 },
    { key: 'shipperName', label: '发货方', field: 'shipperName' },
    { key: 'payerName', label: '付款方', field: 'payerName' },
    { key: 'consigneeName', label: '收货方', field: 'consigneeName' },
    {
      key: 'specialTransportRequirements',
      label: '运输特殊要求',
      field: 'specialTransportRequirements',
      span: 2
    },
    { key: 'otherDeductionTerms', label: '其他扣款约定', field: 'otherDeductionTerms', span: 2 },
    { key: 'contractDescription', label: '合同说明摘要', field: 'contractDescription', span: 2 }
  ]
  const transportDetailColumns: ColumnOption<ContractTransportDetail>[] = [
    { prop: 'cargoDescription', label: '货物名称', minWidth: 180 },
    { prop: 'cargoCode', label: '货物编码', width: 140 },
    {
      prop: 'unit',
      label: '计量单位',
      width: 110,
      dict: { code: 'tmsCargoUnit', display: 'text' }
    },
    { prop: 'contractQuantity', label: '合同数量', width: 120, align: 'right' },
    {
      prop: 'transportUnitPrice',
      label: '合同单价',
      width: 130,
      align: 'right',
      formatter: (row) => formatSensitiveNumberWithAffix(row.transportUnitPrice, { prefix: '¥ ' })
    },
    {
      prop: 'freight',
      label: '明细运费',
      width: 130,
      align: 'right',
      formatter: (row) => formatSensitiveNumberWithAffix(row.freight, { prefix: '¥ ' })
    }
  ]

  onMounted(() => {
    void Promise.all([
      userStore.ensureDictLoaded('tmsContractStatus'),
      userStore.ensureDictLoaded('tmsContractCategory'),
      userStore.ensureDictLoaded('tmsContractBusinessType'),
      userStore.ensureDictLoaded('tmsContractTransportMode'),
      userStore.ensureDictLoaded('tmsContractBillingMethod'),
      userStore.ensureDictLoaded('tmsCargoUnit')
    ])
  })

  async function loadPage(): Promise<void> {
    if (!contractId.value) return
    page.loading = true
    page.error = null
    try {
      const response = await fetchContractDetail(contractId.value)
      detail.data = response.data ?? undefined
      if (!detail.data) throw new Error('合同详情不存在')
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('合同详情加载失败')
    } finally {
      page.loading = false
    }
  }

  async function open(id: string): Promise<void> {
    contractId.value = id
    detail.data = undefined
    activeTab.value = 'basic'
    await dialogRef.value?.handleOpen(undefined, {
      title: '查看合同',
      subtitle: '查看合同相对方、履约条款、运输明细和审批流程',
      contentMaxHeight: '78vh',
      loading: false
    })
    await loadPage()
  }

  defineExpose({ open })
</script>

<style scoped lang="scss">
  .contract-view-dialog {
    &__tabs {
      margin-top: 18px;

      :deep(.el-tabs__header) {
        margin-bottom: 16px;
      }
    }

    &__attachments {
      display: grid;
      gap: 8px;
    }
  }
</style>
