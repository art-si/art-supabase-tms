<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="TRANSPORT AGREEMENTS"
      title="运输协议"
      description="统一登记托运、承运与车辆信息，核查证件和双方签署资料。"
      icon="ri:file-text-line"
      :tags="[
        { label: '承运商与车辆档案联动', type: 'primary' },
        { label: '证件资料', type: 'info' }
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
        emptyText: '暂无运输协议',
        emptyDescription: '登记协议后，可按承运方和车辆追溯签署资料。'
      }"
      focusable
    />
    <TransportAgreementDialog ref="formDialogRef" @success="refresh" />
    <ArtDialog
      ref="detailDialogRef"
      size="xl"
      :show-footer="false"
      @open="
        () => {
          activeDetailTab = 'transport'
        }
      "
    >
      <template v-if="detail">
        <ElTabs v-model="activeDetailTab">
          <ElTabPane name="transport" label="运输与协议">
            <ArtDescriptions :data="detail" :items="transportItems" :columns="3" />
            <ArtSectionTitle class="mt-5">协议内容</ArtSectionTitle>
            <div
              class="prose max-w-none break-words rounded-md bg-[var(--el-fill-color-extra-light)] px-5 py-4 text-sm leading-7 text-[var(--el-text-color-primary)]"
              v-html="safeContent"
            />
          </ElTabPane>
          <ElTabPane name="documents" label="证件附件">
            <ArtEmptyState
              v-if="
                !detail.idCardImages.length &&
                !detail.registrationImages.length &&
                !detail.driverLicenseImage &&
                !detail.roadPermitImage
              "
              title="暂无证件附件"
              description="补充证件材料后，可在此查看。"
              :visual-size="72"
              size="compact"
            />
            <div v-else class="grid gap-5 md:grid-cols-2">
              <div>
                <div class="mb-2 text-sm font-medium">身份证</div>
                <ArtUploadImage
                  v-if="detail.idCardImages.length"
                  :model-value="detail.idCardImages"
                  title="身份证"
                  :limit="3"
                  multiple
                  readonly
                />
                <ArtEmptyState
                  v-else
                  title="未上传身份证"
                  description="请在协议档案中补充。"
                  :visual-size="56"
                  size="compact"
                />
              </div>
              <div>
                <div class="mb-2 text-sm font-medium">行驶证</div>
                <ArtUploadImage
                  v-if="detail.registrationImages.length"
                  :model-value="detail.registrationImages"
                  title="行驶证"
                  :limit="3"
                  multiple
                  readonly
                />
                <ArtEmptyState
                  v-else
                  title="未上传行驶证"
                  description="请在协议档案中补充。"
                  :visual-size="56"
                  size="compact"
                />
              </div>
              <div>
                <div class="mb-2 text-sm font-medium">驾驶证</div>
                <ArtUploadImage
                  v-if="detail.driverLicenseImage"
                  :model-value="detail.driverLicenseImage"
                  title="驾驶证"
                  :limit="1"
                  readonly
                />
                <ArtEmptyState
                  v-else
                  title="未上传驾驶证"
                  description="请在协议档案中补充。"
                  :visual-size="56"
                  size="compact"
                />
              </div>
              <div>
                <div class="mb-2 text-sm font-medium">道路运输证</div>
                <ArtUploadImage
                  v-if="detail.roadPermitImage"
                  :model-value="detail.roadPermitImage"
                  title="道路运输证"
                  :limit="1"
                  readonly
                />
                <ArtEmptyState
                  v-else
                  title="未上传道路运输证"
                  description="请在协议档案中补充。"
                  :visual-size="56"
                  size="compact"
                />
              </div>
            </div>
          </ElTabPane>
          <ElTabPane name="signing" label="签署信息">
            <ArtDescriptions :data="detail" :items="signatureItems" :columns="3" />
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
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import {
    deleteTmsBasicRecords,
    fetchBasicRecordCarrierOptions,
    fetchTransportAgreementList,
    type TransportAgreementRecord,
    type TransportAgreementSearch
  } from '@tms/api'
  import TransportAgreementDialog from './modules/transport-agreement-dialog.vue'

  defineOptions({ name: 'TmsTransportAgreement' })

  const tableRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard(
    'tms_transport_agreement',
    '运输协议'
  )
  const formDialogRef = ref<InstanceType<typeof TransportAgreementDialog>>()
  const activeDetailTab = ref('transport')
  const detailDialogRef = ref<ArtDialogExpose<TransportAgreementRecord>>()
  const detail = ref<TransportAgreementRecord>()
  const safeContent = computed(() => DOMPurify.sanitize(detail.value?.contentHtml || ''))
  const search = ref<TransportAgreementSearch>({
    agreementNo: '',
    shipperName: '',
    carrierId: '',
    plateNo: ''
  })

  const searchItems: SearchFormItem[] = [
    {
      label: '协议号',
      key: 'agreementNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入协议号' }
    },
    {
      label: '托运方',
      key: 'shipperName',
      type: 'input',
      props: { clearable: true, placeholder: '请输入托运方' }
    },
    {
      label: '承运方',
      key: 'carrierId',
      type: 'select',
      api: () => fetchBasicRecordCarrierOptions(),
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      props: { filterable: true, clearable: true, placeholder: '请选择承运商' }
    },
    {
      label: '车牌号',
      key: 'plateNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入车牌号' }
    }
  ]
  const transportItems: ArtDescriptionItem<TransportAgreementRecord>[] = [
    { key: 'agreementNo', label: '协议号', field: 'agreementNo', copyable: true },
    { key: 'shipperName', label: '托运方', field: 'shipperName' },
    { key: 'carrierName', label: '承运方', field: 'carrierName' },
    { key: 'contactPhone', label: '联系电话', field: 'contactPhone' },
    { key: 'plateNo', label: '车牌号', field: 'plateNo' },
    { key: 'startsOn', label: '协议开始时间', field: 'startsOn' },
    { key: 'endsOn', label: '协议结束时间', field: 'endsOn' },
    { key: 'status', label: '协议状态', field: 'status', dictCode: 'tmsTransportAgreementStatus' },
    { key: 'vehicleType', label: '车型', field: 'vehicleType' },
    {
      key: 'vehicleLengthM',
      label: '车长',
      value: (row: TransportAgreementRecord) =>
        row.vehicleLengthM == null ? '车辆档案未维护' : `${row.vehicleLengthM} m`
    },
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (row: TransportAgreementRecord) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    }
  ]
  const signatureItems: ArtDescriptionItem<TransportAgreementRecord>[] = [
    { key: 'partyASeal', label: '甲方（盖章）', field: 'partyASeal' },
    { key: 'partyARepresentative', label: '甲方代表人', field: 'partyARepresentative' },
    { key: 'partyASignedOn', label: '甲方签订日期', field: 'partyASignedOn' },
    { key: 'partyBSeal', label: '乙方（盖章）', field: 'partyBSeal' },
    { key: 'partyBRepresentative', label: '乙方代表人', field: 'partyBRepresentative' },
    { key: 'partyBSignedOn', label: '乙方签订日期', field: 'partyBSignedOn' }
  ]

  const columnsFactory = (): ColumnOption<TransportAgreementRecord>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    {
      prop: 'agreementNo',
      label: '协议号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => (
        <button
          type="button"
          class="font-medium text-[var(--el-color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
          onClick={() => void showDetail(row)}
        >
          {row.agreementNo}
        </button>
      )
    },
    { prop: 'shipperName', label: '托运方', minWidth: 185, showOverflowTooltip: true },
    { prop: 'carrierName', label: '承运方', minWidth: 185, showOverflowTooltip: true },
    { prop: 'contactPhone', label: '联系电话', width: 145 },
    { prop: 'plateNo', label: '车牌号', width: 125 },
    { prop: 'startsOn', label: '协议开始时间', width: 130 },
    { prop: 'endsOn', label: '协议结束时间', width: 130 },
    {
      prop: 'status',
      label: '协议状态',
      width: 110,
      dict: { code: 'tmsTransportAgreementStatus', display: 'auto' }
    },
    { prop: 'vehicleType', label: '车型', width: 110 },
    {
      prop: 'vehicleLengthM',
      label: '车长',
      width: 105,
      formatter: (row) => (row.vehicleLengthM == null ? '—' : `${row.vehicleLengthM} m`)
    },
    { prop: 'partyASignedOn', label: '甲方签订日期', width: 130 },
    { prop: 'partyBSignedOn', label: '乙方签订日期', width: 130 },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 166,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
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
            permission="TmsTransportAgreement:View"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="TmsTransportAgreement:Edit"
            onClick={() => void formDialogRef.value?.handleOpen(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsTransportAgreement:Add',
      type: 'add',
      label: '新增运输协议',
      onClick: () => void formDialogRef.value?.handleOpen()
    },
    {
      permission: 'TmsTransportAgreement:Delete',
      type: 'delete',
      confirm: false,
      onClick: async ({ selectedRows, api }) => {
        const resources = (selectedRows as TransportAgreementRecord[]).map((row) => ({
          id: row.id,
          label: row.agreementNo || '运输协议'
        }))
        await deleteRecords({
          resources,
          permission: 'TmsTransportAgreement:Delete',
          remove: () =>
            deleteTmsBasicRecords(
              'tms_transport_agreement',
              resources.map((resource) => resource.id)
            ),
          onDeleted: async () => {
            await api.refreshRemove()
          }
        })
      }
    },
    {
      permission: 'TmsTransportAgreement:Export',
      type: 'export',
      exportFilename: '运输协议',
      exportSheetName: '协议记录',
      exportColumns: [
        { key: 'agreementNo', title: '协议号' },
        { key: 'shipperName', title: '托运方' },
        { key: 'carrierName', title: '承运方' },
        { key: 'contactPhone', title: '联系电话' },
        { key: 'plateNo', title: '车牌号' },
        { key: 'vehicleType', title: '车型' },
        { key: 'vehicleLengthM', title: '车长（米）' },
        { key: 'partyASignedOn', title: '甲方签订日期' },
        { key: 'partyBSignedOn', title: '乙方签订日期' }
      ],
      exportApi: async ({ maxRows }) => ({
        data:
          (await fetchTransportAgreementList({ ...search.value, from: 0, to: maxRows - 1 })).data ??
          []
      })
    }
  ])
  const fetchTable = (params: TransportAgreementSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchTransportAgreementList({ ...params, from, to })
  }
  const showDetail = async (row: TransportAgreementRecord): Promise<void> => {
    detail.value = row
    await detailDialogRef.value?.handleOpen(row, { title: `运输协议 · ${row.agreementNo}` })
  }
  const refresh = (mode: 'add' | 'edit'): void => {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }
</script>
