<template>
  <div
    :class="
      embedded ? 'flex h-[460px] min-w-0 flex-col' : 'business-workspace-page art-full-height'
    "
  >
    <BusinessWorkspaceHeader
      v-if="!embedded"
      eyebrow="ELECTRONIC CONTRACTS"
      title="电子合同"
      description="管理合同有效期、签署双方与电子附件，通过合同号快速核查完整内容。"
      icon="ri:file-shield-2-line"
      :tags="[
        { label: '按月自动编号', type: 'primary' },
        { label: '签署状态', type: 'info' }
      ]"
    >
      <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
    </BusinessWorkspaceHeader>
    <ArtTableQuery
      ref="tableRef"
      v-model="search"
      :search-items="searchItems"
      :api-fn="fetchTable"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      :header-actions-placement="embedded ? 'table' : 'workspace'"
      :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
      :table-props="{
        rowKey: 'id',
        emptyText: '暂无电子合同',
        emptyDescription: '创建合同后，系统自动生成合同号并保留双方与有效期信息。'
      }"
      :focusable="!embedded"
    />
    <ElectronicContractDialog
      ref="formDialogRef"
      :customer="customer"
      @success="
        (action) => (action === 'create' ? tableRef?.refreshCreate() : tableRef?.refreshUpdate())
      "
    />
    <ContractDocumentPreview ref="previewDialogRef" />
    <ContractSigningDialog ref="signingDialogRef" />
    <ArtDialog
      ref="detailDialogRef"
      size="xl"
      :show-footer="false"
      @closed="clearDetailQuery"
      @open="
        () => {
          activeDetailTab = 'identity'
        }
      "
    >
      <template v-if="detail">
        <ElTabs v-model="activeDetailTab">
          <ElTabPane name="identity" label="合同摘要">
            <ArtDescriptions :data="detail" :items="detailItems" :columns="3" />
          </ElTabPane>
          <ElTabPane name="parties" label="签署双方">
            <ArtDescriptions :data="detail" :items="partyItems" :columns="3" />
          </ElTabPane>
          <ElTabPane name="content" label="正文与附件">
            <div
              class="prose max-w-none break-words rounded-md bg-[var(--el-fill-color-extra-light)] px-5 py-4 text-sm leading-7 text-[var(--el-text-color-primary)]"
              v-html="safeContent"
            />
            <ArtSectionTitle class="mt-5">附件</ArtSectionTitle>
            <ArtUploadFile
              v-if="detail.attachments.length"
              :model-value="detail.attachments"
              title="合同附件"
              :limit="10"
              multiple
              readonly
            />
            <ArtEmptyState
              v-else
              title="暂无附件"
              description="上传合同附件后，可在此预览。"
              :visual-size="72"
              size="compact"
            />
          </ElTabPane>
        </ElTabs>
      </template>
    </ArtDialog>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'

  import DOMPurify from 'dompurify'
  import { RouterLink } from 'vue-router'
  import { storeToRefs } from 'pinia'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ContractDocumentPreview from '@/components/business/contract-document-preview/index.vue'
  import type { ContractDocument } from '@/components/business/contract-document-preview/types'
  import ContractSigningDialog from '@/components/business/contract-signing-dialog/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import type { ColumnOption } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    copyElectronicContract,
    deleteTmsBasicRecords,
    fetchElectronicContractDetail,
    fetchElectronicContractList,
    signElectronicContract,
    submitElectronicContractForApproval,
    terminateElectronicContract,
    type ElectronicContractRecord,
    type ElectronicContractSearch
  } from '@tms/api'
  import ElectronicContractDialog from './modules/electronic-contract-dialog.vue'

  defineOptions({ name: 'TmsElectronicContract' })
  const props = defineProps<{ embedded?: boolean; customer?: Api.Tms.BasicData.Customer }>()

  const route = useRoute()
  const router = useRouter()
  const isDetailRoute = () =>
    props.embedded
      ? route.path === '/tms/basic-data/customer'
      : route.name === 'TmsElectronicContract' ||
        route.path === '/tms/basic-data/electronic-contract'
  const routeRecordId = computed(() =>
    !props.embedded && isDetailRoute() && typeof route.query.recordId === 'string'
      ? route.query.recordId
      : undefined
  )
  const detailRouteId = computed(() => {
    if (!isDetailRoute()) return undefined
    return typeof route.query.contractId === 'string' ? route.query.contractId : routeRecordId.value
  })
  const { confirmAction } = useArtFeedback()
  const terminatingId = ref<string | null>(null)
  const submittingId = ref<string | null>(null)
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { getDictMap } = storeToRefs(userStore)
  const tableRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard(
    'tms_electronic_contract',
    '电子合同'
  )
  const formDialogRef = ref<InstanceType<typeof ElectronicContractDialog>>()
  const previewDialogRef = ref<InstanceType<typeof ContractDocumentPreview>>()
  const signingDialogRef = ref<InstanceType<typeof ContractSigningDialog>>()
  const activeDetailTab = ref('identity')
  const detailDialogRef = ref<ArtDialogExpose<ElectronicContractRecord>>()
  const detail = ref<ElectronicContractRecord>()
  const safeContent = computed(() => DOMPurify.sanitize(detail.value?.contentHtml || ''))
  const search = ref<ElectronicContractSearch>({
    contractNo: '',
    contractName: '',
    status: ''
  })

  onMounted(() => void userStore.ensureDictLoaded('tmsElectronicContractStatus'))
  const statusOptions = computed(() => getDictMap.value.tmsElectronicContractStatus ?? [])
  const settlementCycleOptions = useDictionaryOptions('tmsElectronicContractSettlementCycle')

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '合同号',
      key: 'contractNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入合同号' }
    },
    {
      label: '合同名称',
      key: 'contractName',
      type: 'input',
      props: { clearable: true, placeholder: '请输入合同名称' }
    },
    {
      label: '合同状态',
      key: 'status',
      type: 'select',
      props: { options: statusOptions.value, clearable: true }
    }
  ])

  const detailItems: ArtDescriptionItem<ElectronicContractRecord>[] = [
    { key: 'contractNo', label: '合同号', field: 'contractNo', copyable: true },
    { key: 'contractName', label: '合同名称', field: 'contractName' },
    {
      key: 'status',
      label: '合同状态',
      field: 'status',
      dictCode: 'tmsElectronicContractStatus'
    },
    { key: 'startsOn', label: '起始日期', field: 'startsOn' },
    { key: 'endsOn', label: '终止日期', field: 'endsOn' },
    {
      key: 'approvalStatus',
      label: '审批状态',
      field: 'approvalStatus',
      dictCode: 'tmsElectronicContractApprovalStatus'
    },
    {
      key: 'settlementCycle',
      label: '结算周期',
      field: 'settlementCycle',
      dictCode: 'tmsElectronicContractSettlementCycle'
    },
    {
      key: 'cycleStartDay',
      label: '每期起始日',
      value: (row) => (row.cycleStartDay ? `${row.cycleStartDay} 日` : '-')
    },
    { key: 'paymentTermDays', label: '账期', value: (row) => `${row.paymentTermDays} 天` },
    { key: 'taxRate', label: '税率', value: (row) => `${Number((row.taxRate * 100).toFixed(2))}%` },
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (row: ElectronicContractRecord) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    }
  ]
  const partyItems: ArtDescriptionItem<ElectronicContractRecord>[] = [
    { key: 'partyACompany', label: '甲方公司', field: 'partyACompany' },
    { key: 'partyARepresentative', label: '甲方代表人', field: 'partyARepresentative' },
    { key: 'partyASubject', label: '甲方主体', field: 'partyASubject' },
    { key: 'partyBCompany', label: '乙方公司', field: 'partyBCompany' },
    { key: 'partyBRepresentative', label: '乙方代表人', field: 'partyBRepresentative' },
    { key: 'partyBSubject', label: '乙方主体', field: 'partyBSubject' }
  ]

  const columnsFactory = (): ColumnOption<ElectronicContractRecord>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    {
      prop: 'contractNo',
      label: '合同号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) =>
        hasAuth('TmsElectronicContract:View') ? (
          <RouterLink
            class="font-semibold text-[var(--el-color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
            to={{
              name: route.name ?? 'TmsElectronicContract',
              query: { ...route.query, contractId: row.id }
            }}
            title={`查看合同 ${row.contractNo}`}
          >
            {row.contractNo}
          </RouterLink>
        ) : (
          <span class="font-semibold text-[var(--el-text-color-primary)]">{row.contractNo}</span>
        )
    },
    { prop: 'contractName', label: '合同名称', minWidth: 210, showOverflowTooltip: true },
    { prop: 'partyACompany', label: '甲方公司', minWidth: 195, showOverflowTooltip: true },
    { prop: 'partyASubject', label: '甲方主体', minWidth: 165, showOverflowTooltip: true },
    { prop: 'partyBCompany', label: '乙方公司', minWidth: 195, showOverflowTooltip: true },
    { prop: 'partyBSubject', label: '乙方主体', minWidth: 165, showOverflowTooltip: true },
    { prop: 'startsOn', label: '起始日期', width: 120 },
    { prop: 'endsOn', label: '终止日期', width: 120 },
    {
      prop: 'status',
      label: '合同状态',
      width: 112,
      dict: { code: 'tmsElectronicContractStatus', display: 'auto' }
    },
    {
      prop: 'approvalStatus',
      label: '审批状态',
      width: 112,
      dict: { code: 'tmsElectronicContractApprovalStatus', display: 'auto' }
    },
    { prop: 'createBy', label: '创建人', width: 125, showOverflowTooltip: true },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 166,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 200,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="TmsElectronicContract:View"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            type="view"
            icon="ri:file-search-line"
            label="预览合同"
            permission="TmsElectronicContract:Preview"
            onClick={() => void preview(row)}
          />
          {canEdit(row) && (
            <ArtButtonTable
              type="edit"
              permission="TmsElectronicContract:Edit"
              onClick={() => void formDialogRef.value?.handleOpen(row)}
            />
          )}
          <ArtButtonMore
            list={getMoreActions(row)}
            onClick={(item) => void runMoreAction(row, item)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsElectronicContract:Add',
      type: 'add',
      label: '创建合同',
      onClick: () => void formDialogRef.value?.handleOpen()
    },
    {
      permission: 'TmsElectronicContract:Copy',
      key: 'copy',
      label: '复制',
      icon: 'ri:file-copy-line',
      selectionRequired: true,
      disabled: ({ selectedCount }) => selectedCount !== 1,
      onClick: async ({ selectedRows, api }) => {
        await copyElectronicContract((selectedRows as ElectronicContractRecord[])[0].id)
        await api.refreshCreate()
      }
    },
    {
      permission: 'TmsElectronicContract:Delete',
      type: 'delete',
      confirm: false,
      onClick: async ({ selectedRows, api }) => {
        const resources = (selectedRows as ElectronicContractRecord[]).map((row) => ({
          id: row.id,
          label: row.contractNo || row.contractName || '电子合同'
        }))
        await deleteRecords({
          resources,
          permission: 'TmsElectronicContract:Delete',
          remove: () =>
            deleteTmsBasicRecords(
              'tms_electronic_contract',
              resources.map((resource) => resource.id)
            ),
          onDeleted: async () => {
            await api.refreshRemove()
          }
        })
      }
    }
  ])

  const fetchTable = (params: ElectronicContractSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchElectronicContractList({
      ...params,
      from,
      to,
      customerId: props.customer?.id,
      recordId: routeRecordId.value
    })
  }

  const showDetail = async (row: ElectronicContractRecord): Promise<void> => {
    if (!hasAuth('TmsElectronicContract:View')) return
    await router.push({
      name: route.name ?? 'TmsElectronicContract',
      query: { ...route.query, contractId: row.id }
    })
  }

  const canEdit = (row: ElectronicContractRecord): boolean =>
    row.status === 'pending_signed' &&
    (row.approvalStatus === 'draft' || row.approvalStatus === 'rejected')

  const getMoreActions = (row: ElectronicContractRecord): ButtonMoreItem[] => [
    ...(canEdit(row)
      ? [
          {
            key: 'submit',
            label: '提交审批',
            auth: 'TmsElectronicContract:Submit',
            icon: 'ri:send-plane-line',
            disabled: submittingId.value === row.id
          }
        ]
      : []),
    ...(row.status === 'pending_signed' && row.approvalStatus === 'approved'
      ? [
          {
            key: 'sign',
            label: '签署合同',
            auth: 'TmsElectronicContract:Sign',
            icon: 'ri:quill-pen-line'
          }
        ]
      : []),
    ...(row.status !== 'terminated'
      ? [
          {
            key: 'terminate',
            label: '终止合同',
            auth: 'TmsElectronicContract:Terminate',
            icon: 'ri:stop-circle-line',
            disabled: terminatingId.value === row.id
          }
        ]
      : [])
  ]

  const runMoreAction = async (
    row: ElectronicContractRecord,
    item: ButtonMoreItem
  ): Promise<void> => {
    if (item.key === 'submit') await submitApproval(row)
    if (item.key === 'sign') await openSigning(row)
    if (item.key === 'terminate') await terminate(row)
  }

  const toDocument = (row: ElectronicContractRecord): ContractDocument => ({
    title: row.contractName,
    documentNo: row.contractNo,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    partyA: {
      name: row.partyACompany,
      representative: row.partyARepresentative,
      signatureUrl: row.partyASignatureUrl,
      sealUrl: row.partyASealUrl,
      signedOn: row.partyASignedAt
    },
    partyB: {
      name: row.partyBCompany,
      representative: row.partyBRepresentative,
      signatureUrl: row.partyBSignatureUrl,
      sealUrl: row.partyBSealUrl,
      signedOn: row.partyBSignedAt
    },
    contentHtml: row.contentHtml,
    attachments: row.attachments,
    settlementText: `${settlementCycleOptions.find((option) => option.value === row.settlementCycle)?.label ?? row.settlementCycle}${row.cycleStartDay ? `（每期 ${row.cycleStartDay} 日起）` : ''} · 账期 ${row.paymentTermDays} 天 · 税率 ${Number((row.taxRate * 100).toFixed(2))}%`
  })

  const preview = async (row: ElectronicContractRecord): Promise<void> => {
    if (!hasAuth('TmsElectronicContract:Preview')) return
    try {
      const result = await fetchElectronicContractDetail(row.id)
      if (!result.data) throw new Error('电子合同已不存在或无权查看')
      await previewDialogRef.value?.handleOpen(toDocument(result.data))
    } catch (error) {
      notifyFriendlyError(error, '合同预览加载失败，请刷新列表后重试')
    }
  }

  const submitApproval = async (row: ElectronicContractRecord): Promise<void> => {
    if (submittingId.value || !hasAuth('TmsElectronicContract:Submit') || !canEdit(row)) return
    submittingId.value = row.id
    try {
      await submitElectronicContractForApproval(row.id)
      await tableRef.value?.refreshUpdate()
    } catch (error) {
      notifyFriendlyError(error, '提交审批失败，请检查审批流程是否已配置并启用后重试')
    } finally {
      submittingId.value = null
    }
  }

  const openSigning = async (row: ElectronicContractRecord): Promise<void> => {
    if (
      !hasAuth('TmsElectronicContract:Sign') ||
      row.approvalStatus !== 'approved' ||
      row.status !== 'pending_signed'
    )
      return
    try {
      const result = await fetchElectronicContractDetail(row.id)
      const record = result.data
      if (!record) throw new Error('电子合同已不存在或无权查看')
      await signingDialogRef.value?.handleOpen({
        title: record.contractName,
        documentNo: record.contractNo,
        tenantId: record.tenantId,
        partyAName: record.partyACompany,
        partyBName: record.partyBCompany,
        onSubmit: async (input) => {
          await signElectronicContract(record.id, input)
          await tableRef.value?.refreshUpdate()
        }
      })
    } catch (error) {
      notifyFriendlyError(error, '签署窗口加载失败，请刷新列表后重试')
    }
  }

  watch(
    detailRouteId,
    async (value) => {
      if (!value) {
        detail.value = undefined
        await detailDialogRef.value?.handleClose(true)
        return
      }
      if (!hasAuth('TmsElectronicContract:View')) return
      detail.value = undefined
      await nextTick()
      if (detailRouteId.value !== value) return
      await detailDialogRef.value?.handleOpen(undefined, {
        title: '电子合同',
        loading: true,
        onOpen: async (_data, api) => {
          try {
            const result = await fetchElectronicContractDetail(value)
            if (detailRouteId.value !== value) return
            if (!result.data) throw new Error('电子合同已不存在或无权查看')
            detail.value = result.data
            api.setOptions({ title: `电子合同 · ${result.data.contractNo}` })
          } catch (error) {
            notifyFriendlyError(error, '电子合同详情加载失败，请刷新列表后重试')
            await api.handleClose(true)
          } finally {
            api.setLoading(false)
          }
        }
      })
    },
    { immediate: true }
  )

  const clearDetailQuery = (): void => {
    if (!isDetailRoute() || (!route.query.contractId && !routeRecordId.value)) return
    const query = { ...route.query }
    delete query.contractId
    if (routeRecordId.value) delete query.recordId
    void router.replace({ name: route.name ?? 'TmsElectronicContract', query })
  }

  const terminate = async (row: ElectronicContractRecord): Promise<void> => {
    try {
      await confirmAction(`确定终止合同“${row.contractNo}”吗？终止后状态将不可恢复。`, '终止合同', {
        confirmButtonText: '终止合同',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }
    if (terminatingId.value) return
    terminatingId.value = row.id
    try {
      await terminateElectronicContract(row.id)
      await tableRef.value?.refreshUpdate()
    } catch (error) {
      notifyFriendlyError(error, '电子合同终止失败，请核对权限和状态后重试')
    } finally {
      terminatingId.value = null
    }
  }
</script>
