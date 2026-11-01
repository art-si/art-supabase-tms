<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="SERVICE CASES"
      title="投诉咨询"
      description="统一受理运输服务反馈，按服务单号、运单与问题类型追踪处理状态。"
      icon="ri:customer-service-2-line"
      :tags="[
        { label: '按月自动编号', type: 'primary' },
        { label: '状态可追踪', type: 'info' }
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
      header-actions-placement="workspace"
      :search-bar-props="{ span: 8, labelWidth: 82, showExpand: true, defaultExpanded: false }"
      :table-props="{
        rowKey: 'id',
        emptyText: '暂无投诉咨询',
        emptyDescription: '新增一条投诉或咨询后，可在此跟踪处理状态。'
      }"
      focusable
    />
    <ServiceCaseDialog ref="formDialogRef" @success="refresh" />
    <ArtDialog
      ref="detailDialogRef"
      size="xl"
      :show-footer="false"
      @open="
        () => {
          activeDetailTab = 'base'
        }
      "
    >
      <template v-if="detail">
        <ElTabs v-model="activeDetailTab">
          <ElTabPane name="base" label="基础信息">
            <ArtDescriptions :data="detail" :items="baseDetailItems" :columns="3" />
          </ElTabPane>
          <ElTabPane name="content" label="内容与处理">
            <ArtDescriptions :data="detail" :items="contentDetailItems" :columns="1" />
            <ArtSectionTitle class="mt-5">附件</ArtSectionTitle>
            <ArtUploadFile
              v-if="detail.attachments.length"
              :model-value="detail.attachments"
              title="附件"
              :limit="10"
              multiple
              readonly
            />
            <ArtEmptyState
              v-else
              title="暂无附件"
              description="补充案例附件后，可在此预览。"
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

  import { storeToRefs } from 'pinia'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
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
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import {
    deleteTmsBasicRecords,
    fetchServiceCaseList,
    type ServiceCaseRecord,
    type ServiceCaseSearch
  } from '@tms/api'
  import ServiceCaseDialog from './modules/service-case-dialog.vue'

  defineOptions({ name: 'TmsServiceCase' })

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const tableRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard('tms_service_case', '投诉咨询记录')
  const formDialogRef = ref<InstanceType<typeof ServiceCaseDialog>>()
  const detailDialogRef = ref<ArtDialogExpose<ServiceCaseRecord>>()
  const detail = ref<ServiceCaseRecord>()
  const search = ref<ServiceCaseSearch>({
    serviceNo: '',
    waybillNo: '',
    complaintType: '',
    serviceType: '',
    status: ''
  })

  onMounted(() => {
    void Promise.all(
      ['tmsServiceType', 'tmsComplaintType', 'tmsServiceCaseStatus'].map((code) =>
        userStore.ensureDictLoaded(code)
      )
    )
  })

  const serviceTypeOptions = computed(() => getDictMap.value.tmsServiceType ?? [])
  const complaintTypeOptions = computed(() => getDictMap.value.tmsComplaintType ?? [])
  const statusOptions = computed(() => getDictMap.value.tmsServiceCaseStatus ?? [])
  const complaintLabels = (values: string[]) =>
    values
      .map(
        (value) =>
          complaintTypeOptions.value.find((option) => option.value === value)?.label || value
      )
      .join('、') || '—'

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '服务单号',
      key: 'serviceNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入服务单号' }
    },
    {
      label: '运单号',
      key: 'waybillNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入运单号' }
    },
    {
      label: '投诉类型',
      key: 'complaintType',
      type: 'select',
      props: { options: complaintTypeOptions.value, clearable: true, filterable: true }
    },
    {
      label: '服务类型',
      key: 'serviceType',
      type: 'select',
      props: { options: serviceTypeOptions.value, clearable: true }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: { options: statusOptions.value, clearable: true }
    }
  ])

  const detailItems: ArtDescriptionItem<ServiceCaseRecord>[] = [
    { key: 'organizationName', label: '所属组织', field: 'organizationName' },
    { key: 'serviceNo', label: '服务单号', field: 'serviceNo', copyable: true },
    { key: 'serviceType', label: '服务类型', field: 'serviceType', dictCode: 'tmsServiceType' },
    {
      key: 'complaintTypes',
      label: '投诉类型',
      value: (row: ServiceCaseRecord) => complaintLabels(row.complaintTypes)
    },
    { key: 'title', label: '标题', field: 'title', span: 2 },
    { key: 'waybillNo', label: '运单号', field: 'waybillNo' },
    { key: 'contactName', label: '联系人', field: 'contactName' },
    { key: 'contactPhone', label: '联系电话', field: 'contactPhone' },
    { key: 'status', label: '状态', field: 'status', dictCode: 'tmsServiceCaseStatus' },
    {
      key: 'submittedAt',
      label: '提交时间',
      value: (row: ServiceCaseRecord) => formatWithDayjs(row.submittedAt, 'YYYY-MM-DD HH:mm')
    },
    { key: 'submittedBy', label: '提交人', field: 'submittedBy' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 },
    {
      key: 'content',
      label: '内容',
      field: 'content',
      span: 3,
      render: (value) => <span class="whitespace-pre-wrap break-words">{String(value || '—')}</span>
    }
  ]

  const activeDetailTab = ref('base')
  const baseDetailItems = detailItems.filter((item) => !['content', 'remark'].includes(item.key))
  const contentDetailItems = detailItems
    .filter((item) => ['content', 'remark'].includes(item.key))
    .map((item) => ({ ...item, span: 1 }))

  const columnsFactory = (): ColumnOption<ServiceCaseRecord>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    { prop: 'organizationName', label: '所属组织', minWidth: 175, showOverflowTooltip: true },
    {
      prop: 'serviceNo',
      label: '服务单号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => (
        <button
          type="button"
          class="font-medium text-[var(--el-color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
          onClick={() => void showDetail(row)}
        >
          {row.serviceNo}
        </button>
      )
    },
    {
      prop: 'serviceType',
      label: '服务类型',
      width: 110,
      dict: { code: 'tmsServiceType', display: 'auto' }
    },
    {
      prop: 'complaintTypes',
      label: '投诉类型',
      minWidth: 190,
      showOverflowTooltip: true,
      formatter: (row) => complaintLabels(row.complaintTypes)
    },
    { prop: 'title', label: '标题', minWidth: 210, showOverflowTooltip: true },
    { prop: 'waybillNo', label: '运单号', minWidth: 160, showOverflowTooltip: true },
    {
      prop: 'submittedAt',
      label: '提交时间',
      width: 166,
      formatter: (row) => formatWithDayjs(row.submittedAt, 'YYYY-MM-DD HH:mm')
    },
    { prop: 'submittedBy', label: '提交人', width: 125, showOverflowTooltip: true },
    { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      dict: { code: 'tmsServiceCaseStatus', display: 'auto' }
    },
    {
      prop: 'operation',
      label: '操作',
      width: 126,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="TmsServiceCase:View"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="TmsServiceCase:Edit"
            onClick={() => void formDialogRef.value?.handleOpen(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsServiceCase:Add',
      type: 'add',
      label: '新增投诉咨询',
      onClick: () => void formDialogRef.value?.handleOpen()
    },
    {
      permission: 'TmsServiceCase:Delete',
      type: 'delete',
      confirm: false,
      onClick: async ({ selectedRows, api }) => {
        const resources = (selectedRows as ServiceCaseRecord[]).map((row) => ({
          id: row.id,
          label: row.serviceNo || '投诉咨询记录'
        }))
        await deleteRecords({
          resources,
          permission: 'TmsServiceCase:Delete',
          remove: () =>
            deleteTmsBasicRecords(
              'tms_service_case',
              resources.map((resource) => resource.id)
            ),
          onDeleted: async () => {
            await api.refreshRemove()
          }
        })
      }
    },
    {
      permission: 'TmsServiceCase:Export',
      type: 'export',
      exportFilename: '投诉咨询',
      exportSheetName: '服务记录',
      exportColumns: [
        { key: 'organizationName', title: '所属组织' },
        { key: 'serviceNo', title: '服务单号' },
        { key: 'serviceType', title: '服务类型' },
        { key: 'complaintTypes', title: '投诉类型' },
        { key: 'title', title: '标题' },
        { key: 'waybillNo', title: '运单号' },
        { key: 'submittedAt', title: '提交时间' },
        { key: 'submittedBy', title: '提交人' },
        { key: 'remark', title: '备注' },
        { key: 'status', title: '状态' }
      ],
      exportApi: async ({ maxRows }) => ({
        data: (await fetchServiceCaseList({ ...search.value, from: 0, to: maxRows - 1 })).data ?? []
      })
    }
  ])

  const fetchTable = (params: ServiceCaseSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchServiceCaseList({ ...params, from, to })
  }

  const showDetail = async (row: ServiceCaseRecord): Promise<void> => {
    detail.value = row
    await detailDialogRef.value?.handleOpen(row, { title: `服务详情 · ${row.serviceNo}` })
  }

  const refresh = (mode: 'add' | 'edit'): void => {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }
</script>
