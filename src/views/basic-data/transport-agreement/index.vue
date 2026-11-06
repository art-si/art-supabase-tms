<template>
  <div
    :class="
      embedded ? 'flex h-[460px] min-w-0 flex-col' : 'business-workspace-page art-full-height'
    "
  >
    <BusinessWorkspaceHeader
      v-if="!embedded"
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
      :header-actions-placement="embedded ? 'table' : 'workspace'"
      :search-bar-props="{ span: 8, labelWidth: 82, showExpand: true, defaultExpanded: false }"
      :table-props="{
        rowKey: 'id',
        emptyText: '暂无运输协议',
        emptyDescription: '登记协议后，可按承运方和车辆追溯签署资料。'
      }"
      :focusable="!embedded"
    />
    <TransportAgreementDialog ref="formDialogRef" :customer="customer" @success="refresh" />
    <ContractDocumentPreview ref="previewRef" />
    <ContractSigningDialog ref="signingRef" />
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
          <ElTabPane name="documents" label="证件与附件">
            <div v-if="detail.attachments.length" class="mb-5">
              <div class="mb-2 text-sm font-medium">协议附件</div>
              <ArtUploadFile :model-value="detail.attachments" multiple readonly />
            </div>
            <ArtEmptyState
              v-if="
                !detail.idCardImages.length &&
                !detail.registrationImages.length &&
                !detail.driverLicenseImages.length &&
                !detail.roadPermitImages.length &&
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
                  :limit="5"
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
                  :limit="5"
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
                  v-if="detail.driverLicenseImages.length || detail.driverLicenseImage"
                  :model-value="
                    detail.driverLicenseImages.length
                      ? detail.driverLicenseImages
                      : detail.driverLicenseImage
                        ? [detail.driverLicenseImage]
                        : []
                  "
                  title="驾驶证"
                  :limit="5"
                  multiple
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
                  v-if="detail.roadPermitImages.length || detail.roadPermitImage"
                  :model-value="
                    detail.roadPermitImages.length
                      ? detail.roadPermitImages
                      : detail.roadPermitImage
                        ? [detail.roadPermitImage]
                        : []
                  "
                  title="道路运输证"
                  :limit="5"
                  multiple
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
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'

  import DOMPurify from 'dompurify'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    formatVehicleTypeDisplay,
    getVehicleTypeFallbackLabel
  } from '@/utils/business/vehicle-type-display'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ContractDocumentPreview from '@/components/business/contract-document-preview/index.vue'
  import type { ContractDocument } from '@/components/business/contract-document-preview/types'
  import ContractSigningDialog from '@/components/business/contract-signing-dialog/index.vue'
  import type { ContractSigningInput } from '@/components/business/contract-signing-dialog/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
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
    fetchTransportAgreementDetail,
    fetchTransportAgreementList,
    signTransportAgreement,
    submitTransportAgreementForApproval,
    type TransportAgreementRecord,
    type TransportAgreementSearch
  } from '@tms/api'
  import TransportAgreementDialog from './modules/transport-agreement-dialog.vue'

  defineOptions({ name: 'TmsTransportAgreement' })
  const props = defineProps<{ embedded?: boolean; customer?: Api.Tms.BasicData.Customer }>()
  const route = useRoute()
  const isStandaloneRoute = () =>
    !props.embedded &&
    (route.name === 'TmsTransportAgreement' || route.path === '/tms/basic-data/transport-agreement')
  const routeRecordId = computed(() =>
    isStandaloneRoute() && typeof route.query.recordId === 'string'
      ? route.query.recordId
      : undefined
  )
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { hasAuth } = useAuth()

  const tableRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard(
    'tms_transport_agreement',
    '运输协议'
  )
  const formDialogRef = ref<InstanceType<typeof TransportAgreementDialog>>()
  const previewRef = ref<InstanceType<typeof ContractDocumentPreview>>()
  const signingRef = ref<InstanceType<typeof ContractSigningDialog>>()
  const submittingId = ref('')
  const activeDetailTab = ref('transport')
  const detailDialogRef = ref<ArtDialogExpose<TransportAgreementRecord>>()
  const detail = ref<TransportAgreementRecord>()
  let recordLoadVersion = 0
  const safeContent = computed(() => DOMPurify.sanitize(detail.value?.contentHtml || ''))
  const signedOn = (signedAt: string | null, legacyOn: string): string | null =>
    signedAt ? formatWithDayjs(signedAt, 'YYYY-MM-DD') : legacyOn || null
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
    { key: 'partyBRepresentative', label: '乙方代表人', field: 'partyBRepresentative' },
    { key: 'contactPhone', label: '联系电话', field: 'contactPhone' },
    { key: 'plateNo', label: '车牌号', field: 'plateNo' },
    { key: 'startsOn', label: '协议开始时间', field: 'startsOn' },
    { key: 'endsOn', label: '协议结束时间', field: 'endsOn' },
    { key: 'status', label: '协议状态', field: 'status', dictCode: 'tmsTransportAgreementStatus' },
    {
      key: 'approvalStatus',
      label: '审批状态',
      field: 'approvalStatus',
      dictCode: 'tmsTransportAgreementApprovalStatus'
    },
    {
      key: 'vehicleType',
      label: '车型',
      field: 'vehicleType',
      render: (_value, row) => (
        <ArtDictDisplay
          dictCode="vehicleType"
          value={row.vehicleType}
          display="text"
          unknownText={getVehicleTypeFallbackLabel(row.vehicleType, { unknownText: '待核对' })}
        />
      )
    },
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
    {
      key: 'partyASignedOn',
      label: '甲方签订日期',
      value: (row: TransportAgreementRecord) => signedOn(row.partyASignedAt, row.partyASignedOn)
    },
    { key: 'partyBSeal', label: '乙方（盖章）', field: 'partyBSeal' },
    { key: 'partyBRepresentative', label: '乙方代表人', field: 'partyBRepresentative' },
    {
      key: 'partyBSignedOn',
      label: '乙方签订日期',
      value: (row: TransportAgreementRecord) => signedOn(row.partyBSignedAt, row.partyBSignedOn)
    }
  ]

  const columnsFactory = (): ColumnOption<TransportAgreementRecord>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    {
      prop: 'agreementNo',
      label: '协议号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) =>
        hasAuth('TmsTransportAgreement:View') ? (
          <button
            type="button"
            class="font-medium text-[var(--el-color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
            onClick={() => void showDetail(row)}
          >
            {row.agreementNo}
          </button>
        ) : (
          row.agreementNo
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
    {
      prop: 'approvalStatus',
      label: '审批状态',
      width: 110,
      dict: { code: 'tmsTransportAgreementApprovalStatus', display: 'auto' }
    },
    {
      prop: 'vehicleType',
      label: '车型',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="vehicleType"
          value={row.vehicleType}
          display="text"
          unknownText={getVehicleTypeFallbackLabel(row.vehicleType, { unknownText: '待核对' })}
        />
      )
    },
    {
      prop: 'vehicleLengthM',
      label: '车长',
      width: 105,
      formatter: (row) => (row.vehicleLengthM == null ? '—' : `${row.vehicleLengthM} m`)
    },
    {
      prop: 'partyASignedOn',
      label: '甲方签订日期',
      width: 130,
      formatter: (row) => signedOn(row.partyASignedAt, row.partyASignedOn) || '—'
    },
    {
      prop: 'partyBSignedOn',
      label: '乙方签订日期',
      width: 130,
      formatter: (row) => signedOn(row.partyBSignedAt, row.partyBSignedOn) || '—'
    },
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
            permission="TmsTransportAgreement:View"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            type="view"
            icon="ri:file-search-line"
            label="预览协议"
            permission="TmsTransportAgreement:Preview"
            onClick={() => void preview(row)}
          />
          {canEdit(row) && (
            <ArtButtonTable
              type="edit"
              permission="TmsTransportAgreement:Edit"
              onClick={() => void openEdit(row)}
            />
          )}
          <ArtButtonMore
            list={moreActions(row)}
            onClick={(item) => void runMoreAction(row, item)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const canEdit = (row: TransportAgreementRecord): boolean =>
    row.status === 'pending_signed' && ['draft', 'rejected'].includes(row.approvalStatus)

  const canSubmit = (row: TransportAgreementRecord): boolean =>
    row.status === 'pending_signed' && ['draft', 'rejected'].includes(row.approvalStatus)

  const canSign = (row: TransportAgreementRecord): boolean =>
    row.approvalStatus === 'approved' && row.status === 'pending_signed'

  const moreActions = (row: TransportAgreementRecord): ButtonMoreItem[] => [
    ...(canSubmit(row)
      ? [
          {
            key: 'submit',
            label: '提交审批',
            icon: 'ri:send-plane-line',
            auth: 'TmsTransportAgreement:Submit',
            disabled: submittingId.value === row.id
          }
        ]
      : []),
    ...(canSign(row)
      ? [
          {
            key: 'sign',
            label: '签署协议',
            icon: 'ri:quill-pen-line',
            auth: 'TmsTransportAgreement:Sign'
          }
        ]
      : [])
  ]

  const runMoreAction = async (
    row: TransportAgreementRecord,
    item: ButtonMoreItem
  ): Promise<void> => {
    if (item.key === 'submit') await submitApproval(row)
    if (item.key === 'sign') await openSigning(row)
  }

  const submitApproval = async (row: TransportAgreementRecord): Promise<void> => {
    if (!canSubmit(row) || !hasAuth('TmsTransportAgreement:Submit') || submittingId.value) return
    submittingId.value = row.id
    try {
      await submitTransportAgreementForApproval(row.id)
      await tableRef.value?.refreshUpdate()
    } catch (error) {
      notifyFriendlyError(error, '提交审批失败，请检查协议内容后重试')
    } finally {
      submittingId.value = ''
    }
  }

  const openSigning = async (row: TransportAgreementRecord): Promise<void> => {
    if (!canSign(row) || !hasAuth('TmsTransportAgreement:Sign')) return
    await signingRef.value?.handleOpen({
      title: '签署运输协议',
      documentNo: row.agreementNo,
      tenantId: row.tenantId,
      partyAName: row.shipperName,
      partyBName: row.carrierName,
      onSubmit: async (input: ContractSigningInput) => {
        await signTransportAgreement(row.id, input)
        await tableRef.value?.refreshUpdate()
      }
    })
  }

  const loadCurrentRecord = async (
    row: TransportAgreementRecord,
    fallbackMessage: string
  ): Promise<TransportAgreementRecord | undefined> => {
    const requestVersion = ++recordLoadVersion
    try {
      const result = await fetchTransportAgreementDetail(row.id)
      if (requestVersion !== recordLoadVersion) return
      if (result.error) throw result.error
      if (!result.data) throw new Error('运输协议不存在或已超出当前租户范围')
      return result.data
    } catch (error) {
      if (requestVersion === recordLoadVersion) notifyFriendlyError(error, fallbackMessage)
    }
  }

  const openEdit = async (row: TransportAgreementRecord): Promise<void> => {
    if (!canEdit(row) || !hasAuth('TmsTransportAgreement:Edit')) return
    await formDialogRef.value?.handleOpen(row)
  }

  const preview = async (row: TransportAgreementRecord): Promise<void> => {
    if (!hasAuth('TmsTransportAgreement:Preview')) return
    const current = await loadCurrentRecord(row, '协议证照读取失败，请稍后重试')
    if (!current) return
    const document: ContractDocument = {
      title: '货物运输协议',
      documentNo: current.agreementNo,
      startsOn: current.startsOn,
      endsOn: current.endsOn,
      partyA: {
        label: '托运方',
        name: current.shipperName,
        representative: current.partyARepresentative,
        signatureUrl: current.partyASignatureUrl,
        sealUrl: current.partyASealUrl,
        signedOn: signedOn(current.partyASignedAt, current.partyASignedOn)
      },
      partyB: {
        label: '承运方',
        name: current.carrierName,
        representative: current.partyBRepresentative,
        signatureUrl: current.partyBSignatureUrl,
        sealUrl: current.partyBSealUrl,
        signedOn: signedOn(current.partyBSignedAt, current.partyBSignedOn)
      },
      facts: [
        { label: '联系电话', value: current.contactPhone || '—' },
        { label: '车牌号码', value: current.plateNo || '—' },
        {
          label: '车型及车长',
          value: [
            formatVehicleTypeDisplay(
              current.vehicleType,
              userStore.getDictItemByValue('vehicleType', current.vehicleType || '')
            ),
            current.vehicleLengthM == null ? '' : `${current.vehicleLengthM} m`
          ]
            .filter(Boolean)
            .join(' · ')
        }
      ],
      contentHtml: current.contentHtml,
      attachments: current.attachments,
      certificateGroups: [
        { label: '身份证', urls: current.idCardImages },
        {
          label: '驾驶证',
          urls: current.driverLicenseImages.length
            ? current.driverLicenseImages
            : current.driverLicenseImage
              ? [current.driverLicenseImage]
              : []
        },
        { label: '行驶证', urls: current.registrationImages },
        {
          label: '道路运输证',
          urls: current.roadPermitImages.length
            ? current.roadPermitImages
            : current.roadPermitImage
              ? [current.roadPermitImage]
              : []
        }
      ]
    }
    await previewRef.value?.handleOpen(document)
  }
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
        {
          key: 'vehicleType',
          title: '车型',
          formatter: (value: unknown) =>
            formatVehicleTypeDisplay(
              value,
              userStore.getDictItemByValue('vehicleType', typeof value === 'string' ? value : '')
            )
        },
        { key: 'vehicleLengthM', title: '车长（米）' },
        {
          key: 'partyASignedOn',
          title: '甲方签订日期',
          formatter: (_value: unknown, row: Record<string, unknown>) =>
            signedOn(
              typeof row.partyASignedAt === 'string' ? row.partyASignedAt : null,
              typeof row.partyASignedOn === 'string' ? row.partyASignedOn : ''
            ) || '—'
        },
        {
          key: 'partyBSignedOn',
          title: '乙方签订日期',
          formatter: (_value: unknown, row: Record<string, unknown>) =>
            signedOn(
              typeof row.partyBSignedAt === 'string' ? row.partyBSignedAt : null,
              typeof row.partyBSignedOn === 'string' ? row.partyBSignedOn : ''
            ) || '—'
        }
      ],
      exportApi: async ({ maxRows }) => {
        await userStore.ensureDictLoaded('vehicleType')
        const result = await fetchTransportAgreementList({
          ...search.value,
          from: 0,
          to: maxRows - 1,
          customerId: props.customer?.id,
          recordId: routeRecordId.value
        })
        if (result.error) throw result.error
        return { data: result.data ?? [] }
      }
    }
  ])
  const fetchTable = (params: TransportAgreementSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchTransportAgreementList({
      ...params,
      from,
      to,
      customerId: props.customer?.id,
      recordId: routeRecordId.value
    })
  }
  const showDetail = async (row: TransportAgreementRecord): Promise<void> => {
    if (!hasAuth('TmsTransportAgreement:View')) return
    const current = await loadCurrentRecord(row, '运输协议详情读取失败，请稍后重试')
    if (!current) return
    detail.value = current
    await detailDialogRef.value?.handleOpen(current, {
      title: `运输协议 · ${current.agreementNo}`
    })
  }
  const refresh = (mode: 'add' | 'edit'): void => {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }
  watch(routeRecordId, () => {
    if (!isStandaloneRoute()) return
    ++recordLoadVersion
    void nextTick().then(() => tableRef.value?.refreshCreate())
  })
  watch(
    () => [props.customer?.id, tenantScopeStore.effectiveTenantId],
    () => {
      ++recordLoadVersion
    }
  )
</script>
