<template>
  <ArtDialog ref="dialogRef">
    <div class="dispatch-dialog">
      <ElAlert
        v-if="dialog.mode === 'merge'"
        type="warning"
        :closable="false"
        show-icon
        :title="`合并 ${dialog.rows.length} 张原始运输单，生成 1 张调度执行单；各原始单仍独立对账`"
      />
      <ElAlert
        v-else-if="dialog.rows.length > 1"
        type="info"
        :closable="false"
        show-icon
        :title="`本次将批量配载 ${dialog.rows.length} 条运单`"
      />
      <div v-else class="dispatch-dialog__order">
        <span>运单号：{{ dialog.rows[0]?.orderNo || '-' }}</span>
      </div>

      <ArtForm v-model="form.data" :items="dispatchModeItems" :span="24" label-position="top" />

      <section
        v-if="dialog.mode === 'single' && form.data.dispatchMode === 'self_operated'"
        class="dispatch-dialog__advisor art-card-xs"
      >
        <header>
          <div>
            <span class="dispatch-dialog__advisor-icon"
              ><ArtSvgIcon icon="ri:sparkling-2-line"
            /></span>
            <div>
              <strong>AI 调度推荐</strong>
              <small>综合车辆资格、当前占用、线路经验、准点率与载重利用率</small>
            </div>
          </div>
          <ElButton type="primary" plain :loading="advisor.loading" @click="loadRecommendations">
            {{ advisor.data ? '重新推荐' : '生成推荐' }}
          </ElButton>
        </header>

        <ElAlert
          v-if="advisor.error"
          type="warning"
          :closable="false"
          show-icon
          :title="advisor.error"
        />

        <template v-else-if="advisor.data">
          <p class="dispatch-dialog__advisor-summary">{{ advisor.data.summary }}</p>
          <div v-if="advisor.data.recommendations.length" class="dispatch-dialog__recommendations">
            <article
              v-for="item in advisor.data.recommendations"
              :key="item.vehicle.id"
              :class="{ 'is-first': item.rank === 1 }"
            >
              <div class="dispatch-dialog__recommendation-main">
                <span class="dispatch-dialog__recommendation-rank">#{{ item.rank }}</span>
                <div>
                  <strong>{{ item.vehicle.plateNo }}</strong>
                  <small>
                    {{ item.vehicle.companyName || '公司未维护' }} ·
                    {{ item.vehicle.primaryDriver.driverName }}
                  </small>
                </div>
                <ElTag :type="item.score >= 75 ? 'success' : 'primary'" effect="light">
                  推荐分 {{ item.score }}
                </ElTag>
                <ElButton type="primary" link @click="applyRecommendation(item)">采用</ElButton>
              </div>
              <div class="dispatch-dialog__recommendation-reasons">
                <span class="art-icon-label" v-for="reason in item.reasons" :key="reason">
                  <ArtSvgIcon icon="ri:checkbox-circle-line" />{{ reason }}
                </span>
                <span v-for="warning in item.warnings" :key="warning" class="is-warning">
                  <ArtSvgIcon icon="ri:error-warning-line" />{{ warning }}
                </span>
              </div>
              <footer>
                <span>置信度 {{ Math.round(item.confidence * 100) }}%</span>
                <span>同线路 {{ item.metrics.routeTrips }} 单</span>
                <span
                  v-if="item.metrics.onTimeRate !== null && item.metrics.onTimeRate !== undefined"
                >
                  准点率 {{ Math.round(item.metrics.onTimeRate * 100) }}%
                </span>
              </footer>
            </article>
          </div>
          <ArtAiFeedback
            :run-id="advisor.data.runId"
            context-label="AI 调度推荐"
            class="dispatch-dialog__feedback"
          />
        </template>

        <ArtEmptyState
          v-else
          title="暂无调度建议"
          description="生成后只提供候选建议，不会自动配载或改变订单状态。"
          size="compact"
          :visual-size="64"
        />
      </section>

      <ArtForm
        ref="formRef"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        label-width="112px"
        root-class="dispatch-dialog__form"
      >
      </ArtForm>

      <div v-if="form.selectedCarrier" class="dispatch-dialog__selection art-card-xs">
        <strong>{{ form.selectedCarrier.companyName }}</strong>
        <span>渠道：{{ formatCarrierChannels(form.selectedCarrier) }}</span>
        <span>联系人：{{ formatValue(form.selectedCarrier.contactName) }}</span>
        <span>联系电话：{{ formatValue(form.selectedCarrier.contactPhone) }}</span>
      </div>

      <div v-if="selectedDriver" class="dispatch-dialog__selection art-card-xs">
        <strong>{{ selectedDriver.driverName }}</strong>
        <span
          >司机归属：<ArtDictDisplay
            dict-code="tmsDriverOwnership"
            :value="selectedDriver.driverOwnership"
        /></span>
        <span
          >司机类型：<ArtDictDisplay dict-code="tmsDriverType" :value="selectedDriver.driverType"
        /></span>
        <span>车牌号：{{ formatValue(selectedDriver.plateNo) }}</span>
        <span>所属承运商：{{ formatValue(selectedDriver.carrierName) }}</span>
        <span>所属公司：{{ formatValue(selectedDriver.companyName) }}</span>
        <span>联系电话：{{ formatValue(selectedDriver.phone) }}</span>
        <span>认证：{{ formatDriverAuth(selectedDriver) }}</span>
        <span v-if="form.data.dispatchMode === 'individual_driver'">
          协议：<ArtDictDisplay
            dict-code="tmsTransportAgreementStatus"
            :value="selectedDriver.agreementStatus || 'pending_signed'"
          />
          · {{ formatValue(selectedDriver.agreementStartsOn) }} 至
          {{ formatValue(selectedDriver.agreementEndsOn) }}
        </span>
        <div
          v-if="form.data.dispatchMode === 'individual_driver'"
          class="dispatch-dialog__agreement-actions"
        >
          <ElButton
            v-if="selectedDriver.agreementStatus !== 'signed'"
            v-auth="'TmsPendingWaybillList:RemindSignature'"
            type="primary"
            link
            @click="remindAgreement('signature')"
          >
            提醒签署
          </ElButton>
          <ElButton
            v-if="selectedDriver.agreementStatus === 'signed'"
            v-auth="'TmsPendingWaybillList:RemindRevision'"
            type="warning"
            link
            @click="remindAgreement('revision')"
          >
            提醒修改
          </ElButton>
          <ElButton
            v-if="selectedDriver.agreementId"
            v-auth="'TmsPendingWaybillList:ViewAgreement'"
            type="primary"
            link
            @click="openAgreement"
          >
            查看协议
          </ElButton>
        </div>
      </div>

      <div v-if="form.selectedVehicle" class="dispatch-dialog__vehicle art-card-xs">
        <div>
          <span>车牌号</span>
          <strong>{{ formatValue(form.selectedVehicle.plateNo) }}</strong>
        </div>
        <div>
          <span>车型</span>
          <strong>
            <ArtDictDisplay dict-code="vehicleType" :value="form.selectedVehicle.vehicleType" />
          </strong>
        </div>
        <div>
          <span>车长/载重</span>
          <strong>{{ formatVehicleLength(form.selectedVehicle) }}</strong>
        </div>
        <div>
          <span>司机</span>
          <strong>{{ formatValue(form.data.dispatchDriverName) }}</strong>
        </div>
        <div>
          <span>司机电话</span>
          <strong>{{ formatValue(form.data.dispatchDriverPhone) }}</strong>
        </div>
      </div>
    </div>
  </ArtDialog>

  <ArtDialog ref="agreementDialogRef" size="xl" :show-footer="false">
    <template v-if="agreementDetail">
      <div class="dispatch-dialog__agreement-detail">
        <div class="dispatch-dialog__agreement-meta">
          <span>协议号：{{ agreementDetail.agreementNo }}</span>
          <span>托运方：{{ agreementDetail.shipperName }}</span>
          <span>承运方：{{ agreementDetail.carrierName }}</span>
          <span
            >有效期：{{ formatValue(agreementDetail.startsOn) }} 至
            {{ formatValue(agreementDetail.endsOn) }}</span
          >
        </div>
        <div class="prose max-w-none break-words text-sm leading-7" v-html="safeAgreementContent" />
        <div class="dispatch-dialog__agreement-images">
          <ArtUploadImage
            v-if="agreementDetail.idCardImages.length"
            :model-value="agreementDetail.idCardImages"
            title="身份证"
            :limit="3"
            multiple
            readonly
          />
          <ArtUploadImage
            v-if="agreementDetail.registrationImages.length"
            :model-value="agreementDetail.registrationImages"
            title="行驶证"
            :limit="3"
            multiple
            readonly
          />
        </div>
      </div>
    </template>
  </ArtDialog>
  <DispatchCertificateRiskDialog ref="certificateRiskDialogRef" />
</template>

<script setup lang="ts">
  import { h } from 'vue'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    isPrivateAttachmentPath,
    signPrivateAttachmentPaths
  } from '@/utils/supabase/private-attachment'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import DOMPurify from 'dompurify'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { resolveTenantWorkspaceId } from '@/utils/tenant-scope-context'
  import { carrierSelections } from '@tms/views/basic-data/carrier/modules/carrier-selection'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { FormRules } from 'element-plus'
  import { trim } from 'lodash-es'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtAiFeedback from '@/components/core/base/art-ai-feedback/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import TmsDataSourceEmptyActions from '../../components/tms-data-source-empty-actions.vue'
  import DispatchCertificateRiskDialog from './dispatch-certificate-risk-dialog.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import {
    dispatchWaybill,
    dispatchWaybillBatch,
    fetchCarrierBillingAccountsForDispatch,
    checkDispatchCertificateRisk,
    recommendDispatchResourcesByAi,
    mergeWaybills
  } from '@tms/api'
  import {
    fetchDispatchAgreement,
    fetchDispatchCandidates,
    remindDispatchAgreement,
    type DispatchAgreementDetail,
    type DispatchCarrierCandidate,
    type DispatchDriverCandidate,
    type DispatchVehicleCandidate
  } from '@tms/api'

  defineOptions({ name: 'TmsWaybillDispatchDialog' })
  const configuredDispatchModeOptions = useDictionaryOptions('tmsDispatchOperatorMode')
  const authStatusOptions = useDictionaryOptions('tmsDriverAuthStatus')
  const dispatchModeOptions = computed(() =>
    configuredDispatchModeOptions.filter((option) =>
      ['carrier', 'self_operated', 'individual_driver'].includes(option.value)
    )
  )

  type WaybillRecord = Api.Tms.Waybill.WaybillRecord
  type DispatchVehicleOption = Api.Tms.Waybill.DispatchVehicleOption
  type DispatchPayload = Api.Tms.Waybill.WaybillDispatchPayload
  type DispatchRecommendation = Api.Tms.Waybill.DispatchRecommendation
  type DispatchRecommendationResponse = Api.Tms.Waybill.DispatchRecommendationResponse

  interface DialogOpenData {
    rows: WaybillRecord[]
    mode: 'single' | 'batch' | 'merge'
  }

  interface DialogGroup {
    rows: WaybillRecord[]
    mode: 'single' | 'batch' | 'merge'
  }

  interface FormGroup {
    data: DispatchPayload
    selectedCarriers: DataSelectRecord[]
    selectedCarrier: ComputedRef<DispatchCarrierCandidate | undefined>
    selectedDrivers: DataSelectRecord[]
    selectedIndividuals: DataSelectRecord[]
    selectedIndividual: ComputedRef<DispatchDriverCandidate | undefined>
    selectedVehicles: DataSelectRecord[]
    selectedVehicle: ComputedRef<DispatchVehicleCandidate | DispatchVehicleOption | undefined>
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<DispatchPayload>>
    carrierColumns: ComputedRef<DataSelectColumn[]>
    driverColumns: ComputedRef<DataSelectColumn[]>
    individualColumns: ComputedRef<DataSelectColumn[]>
    vehicleColumns: ComputedRef<DataSelectColumn[]>
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface AdvisorGroup {
    loading: boolean
    data: DispatchRecommendationResponse | null
    error: string
  }

  const emit = defineEmits<{
    success: []
  }>()

  const { confirmAction } = useArtFeedback()
  const tenantScopeStore = useTenantScopeStore()
  const userStore = useUserStore()
  const formatCarrierChannels = (carrier: {
    dispatchChannels?: readonly string[]
    dispatchChannel?: string
  }): string =>
    carrierSelections(carrier.dispatchChannels, carrier.dispatchChannel)
      .map((channel) =>
        userStore.getDictLabelByValue('tmsCarrierDispatchChannel', channel, channel)
      )
      .join('、') || '—'
  const dialogRef = ref<ArtDialogExpose<DialogOpenData>>()
  const agreementDialogRef = ref<ArtDialogExpose<DispatchAgreementDetail>>()
  const certificateRiskDialogRef = ref<InstanceType<typeof DispatchCertificateRiskDialog>>()
  const agreementDetail = ref<DispatchAgreementDetail | null>(null)
  const safeAgreementContent = computed(() =>
    DOMPurify.sanitize(agreementDetail.value?.contentHtml || '')
  )
  const formRef = ref<FormExpose>()
  const carrierBillingAccounts = ref<Api.Tms.BasicData.CarrierBillingAccount[]>([])
  const carrierBillingLoading = ref(false)
  const carrierBillingError = ref('')
  const linkedVehicleLoading = ref(false)
  const linkedVehicleMessage = ref('')
  let linkedVehicleRequestId = 0

  const dialog: UnwrapNestedRefs<DialogGroup> = reactive<DialogGroup>({
    rows: [],
    mode: 'single'
  })

  const advisor: UnwrapNestedRefs<AdvisorGroup> = reactive<AdvisorGroup>({
    loading: false,
    data: null,
    error: ''
  })

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createInitialForm(),
    selectedCarriers: [],
    selectedCarrier: computed(
      () => form.selectedCarriers[0] as DispatchCarrierCandidate | undefined
    ),
    selectedDrivers: [],
    selectedIndividuals: [],
    selectedIndividual: computed(
      () => form.selectedIndividuals[0] as DispatchDriverCandidate | undefined
    ),
    selectedVehicles: [],
    selectedVehicle: computed(
      () => form.selectedVehicles[0] as DispatchVehicleCandidate | DispatchVehicleOption | undefined
    ),
    items: computed<FormItem[]>(() => [
      {
        label: '承运方',
        key: 'dispatchCarrierId',
        type: 'dataSelect',
        span: 24,
        hidden: form.data.dispatchMode !== 'carrier',
        props: {
          mode: 'table',
          multiple: false,
          modelValue: form.data.dispatchCarrierId ?? undefined,
          'onUpdate:modelValue': (value: unknown) =>
            (form.data.dispatchCarrierId = String(value ?? '')),
          selectedData: form.selectedCarriers,
          'onUpdate:selectedData': (value: typeof form.selectedCarriers) => {
            form.selectedCarriers = value
          },
          title: '选择承运方',
          placeholder: '请选择承运方',
          searchPlaceholder: '请输入承运方名称或联系人',
          rowKey: 'id',
          labelKey: 'companyName',
          descriptionKey: 'contactName',
          emptyText: '暂无可调度承运方',
          emptyDescription: '请先在承运商管理中维护并启用承运方。',
          apiFn: fetchCarrierSelectData,
          columns: form.carrierColumns,
          showPagination: true,
          onConfirm: handleCarrierConfirm,
          onClear: handleCarrierClear,
          showSelectedPanel: false
        }
      },
      {
        label: '开票账户',
        key: 'carrierBillingAccountId',
        type: 'select',
        span: 24,
        hidden: form.data.dispatchMode !== 'carrier',
        options: carrierBillingAccounts.value.map((account) => ({
          value: account.id,
          label: `${account.invoiceTitle}${account.bankName ? ` · ${account.bankName}` : ''}${account.isDefault ? '（默认）' : ''}`
        })),
        props: {
          clearable: true,
          filterable: true,
          loading: carrierBillingLoading.value,
          disabled: !form.data.dispatchCarrierId || carrierBillingLoading.value,
          placeholder: '未维护开票账户时可留空'
        },
        description:
          carrierBillingError.value || '选择承运方后自动带出默认账户；可改选该承运方的其他账户。'
      },
      {
        label: form.data.dispatchMode === 'individual_driver' ? '个体司机' : '自营司机',
        key: 'dispatchDriverId',
        type: 'dataSelect',
        span: form.data.dispatchMode === 'self_operated' ? 12 : 24,
        hidden: form.data.dispatchMode === 'carrier',
        description: '仅显示已启用、未列入黑名单且当前未占用的司机；证件风险将在提交前核验。',
        props: {
          mode: 'table',
          multiple: false,
          modelValue: form.data.dispatchDriverId ?? undefined,
          'onUpdate:modelValue': (value: unknown) =>
            (form.data.dispatchDriverId = String(value ?? '')),
          selectedData: selectedDriverRows.value,
          'onUpdate:selectedData': (value: typeof selectedDriverRows.value) => {
            selectedDriverRows.value = value
          },
          title: form.data.dispatchMode === 'individual_driver' ? '选择个体司机' : '选择自营司机',
          placeholder:
            form.data.dispatchMode === 'individual_driver' ? '请选择个体司机' : '请选择自营司机',
          searchPlaceholder: '请输入司机姓名',
          rowKey: 'id',
          labelKey: 'driverName',
          descriptionKey: 'phone',
          emptyText:
            form.data.dispatchMode === 'individual_driver' ? '暂无个体司机档案' : '暂无可调度司机',
          emptyDescription: '当前没有可调度司机；请检查启用状态、黑名单和任务占用。',
          apiFn:
            form.data.dispatchMode === 'individual_driver'
              ? fetchIndividualSelectData
              : fetchDriverSelectData,
          columns:
            form.data.dispatchMode === 'individual_driver'
              ? form.individualColumns
              : form.driverColumns,
          showPagination: true,
          onConfirm: handleDriverConfirm,
          onClear: handleDriverClear,
          showSelectedPanel: false
        }
      },
      {
        label: '车辆',
        key: 'dispatchVehicleId',
        type: 'dataSelect',
        span: 12,
        hidden: form.data.dispatchMode !== 'self_operated',
        description: linkedVehicleLoading.value
          ? '正在核对司机关联车辆是否可配载…'
          : linkedVehicleMessage.value || '选择司机后自动带入可配载的关联车辆，也可手动改选。',
        props: {
          mode: 'table',
          multiple: false,
          disabled: linkedVehicleLoading.value,
          modelValue: form.data.dispatchVehicleId,
          'onUpdate:modelValue': (value: typeof form.data.dispatchVehicleId) => {
            form.data.dispatchVehicleId = value
          },
          selectedData: form.selectedVehicles,
          'onUpdate:selectedData': (value: typeof form.selectedVehicles) => {
            form.selectedVehicles = value
          },
          title: '选择配载车辆',
          placeholder: '请选择车辆',
          searchPlaceholder: '请输入车牌号或车型',
          rowKey: 'id',
          labelKey: 'plateNo',
          descriptionKey: 'vehicleType',
          emptyText: '暂无可配载车辆',
          emptyDescription: '当前没有符合配载条件的车辆，请先完善车辆档案并确认车辆处于可用状态。',
          apiFn: fetchVehicleSelectData,
          columns: form.vehicleColumns,
          showPagination: true,
          onConfirm: handleVehicleConfirm,
          onClear: handleVehicleClear,
          showSelectedPanel: false
        },
        slots: { empty: () => h(TmsDataSourceEmptyActions, { source: 'vehicle' }) }
      },
      {
        label: '计划发车时间',
        key: 'plannedDepartureTime',
        type: 'date',
        span: 12,
        props: {
          type: 'datetime',
          valueFormat: 'YYYY-MM-DD HH:mm:ss',
          placeholder: '请选择计划发车时间',
          class: '!w-full'
        }
      },
      {
        label: '计划到达时间',
        key: 'plannedArrivalTime',
        type: 'date',
        span: 12,
        props: {
          type: 'datetime',
          valueFormat: 'YYYY-MM-DD HH:mm:ss',
          placeholder: '请选择计划到达时间',
          class: '!w-full'
        }
      },
      {
        label: '配载备注',
        key: 'dispatchRemark',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 200,
          showWordLimit: true,
          placeholder: '请输入配载备注'
        }
      }
    ]),
    rules: computed<FormRules<DispatchPayload>>(() => ({
      dispatchCarrierId:
        form.data.dispatchMode === 'carrier'
          ? [{ required: true, message: '请选择承运方', trigger: 'change' }]
          : [],
      dispatchDriverId:
        form.data.dispatchMode !== 'carrier'
          ? [{ required: true, message: '请选择司机', trigger: 'change' }]
          : [],
      dispatchVehicleId:
        form.data.dispatchMode === 'self_operated'
          ? [{ required: true, message: '请选择车辆', trigger: 'change' }]
          : [],
      plannedDepartureTime: [{ required: true, message: '请选择计划发车时间', trigger: 'change' }],
      plannedArrivalTime: [{ required: true, message: '请选择计划到达时间', trigger: 'change' }]
    })),
    carrierColumns: computed<DataSelectColumn[]>(() => [
      { prop: 'companyName', label: '承运方名称', minWidth: 190 },
      {
        prop: 'dispatchChannel',
        label: '支持渠道',
        minWidth: 110,
        formatter: (carrier) => formatCarrierChannels(carrier)
      },
      { prop: 'contactName', label: '联系人', minWidth: 110 },
      { prop: 'contactPhone', label: '联系电话', minWidth: 135 }
    ]),
    driverColumns: computed<DataSelectColumn[]>(() => [
      ...driverCandidateColumns(),
      { prop: 'licenseType', label: '驾照类型', minWidth: 105 },
      { prop: 'licenseExpireDate', label: '到期日期', minWidth: 125 }
    ]),
    individualColumns: computed<DataSelectColumn[]>(() => [
      ...driverCandidateColumns(),
      { prop: 'agreementStartsOn', label: '协议开始时间', minWidth: 125 },
      { prop: 'agreementEndsOn', label: '协议结束时间', minWidth: 125 },
      {
        prop: 'agreementStatus',
        label: '协议状态',
        minWidth: 110,
        dict: { code: 'tmsTransportAgreementStatus', display: 'auto' }
      }
    ]),
    vehicleColumns: computed<DataSelectColumn[]>(() => [
      { prop: 'plateNo', label: '车牌号', minWidth: 130 },
      {
        prop: 'vehicleType',
        label: '车型',
        width: 120,
        dict: { code: 'vehicleType', display: 'text' }
      },
      { prop: 'specLengthM', label: '车长（米）', width: 115 },
      { prop: 'loadTons', label: '载重（吨）', width: 115 }
    ])
  })
  const selectedDriverRows = computed<DataSelectRecord[]>({
    get: () =>
      form.data.dispatchMode === 'individual_driver'
        ? form.selectedIndividuals
        : form.selectedDrivers,
    set: (rows) => {
      if (form.data.dispatchMode === 'individual_driver') form.selectedIndividuals = rows
      else form.selectedDrivers = rows
    }
  })
  const selectedDriver = computed(
    () => selectedDriverRows.value[0] as DispatchDriverCandidate | undefined
  )

  function formatDriverAuth(driver: DispatchDriverCandidate): string {
    const label = (value: string | null | undefined) =>
      authStatusOptions.find((option) => option.value === (value || 'unverified'))?.label ||
      '未认证'
    return `身份${label(driver.identityAuthStatus)} · 驾驶证${label(driver.licenseAuthStatus)} · 从业资格${label(driver.qualificationAuthStatus)}`
  }

  type DriverCandidateWithPreview = DispatchDriverCandidate & { portraitPreviewUrl?: string | null }

  function portraitCell(driver: DriverCandidateWithPreview) {
    const portraitUrl =
      driver.portraitPreviewUrl ||
      (driver.portraitUrl && !isPrivateAttachmentPath(driver.portraitUrl)
        ? driver.portraitUrl
        : null)
    return defineComponent({
      render: () =>
        portraitUrl
          ? h('img', {
              src: portraitUrl,
              alt: `${driver.driverName}的照片`,
              width: 36,
              height: 36,
              class: 'h-9 w-9 rounded-[var(--el-border-radius-base)] object-cover'
            })
          : h(
              'span',
              {
                class:
                  'inline-flex h-9 w-9 items-center justify-center rounded-[var(--el-border-radius-base)] bg-[var(--art-gray-100)] text-[var(--art-gray-600)]',
                'aria-label': '暂无照片'
              },
              '—'
            )
    })
  }

  function driverCandidateColumns(): DataSelectColumn[] {
    return [
      {
        prop: 'portraitUrl',
        label: '照片',
        width: 72,
        formatter: (row) => portraitCell(row as DriverCandidateWithPreview)
      },
      { prop: 'driverName', label: '司机姓名', minWidth: 120 },
      { prop: 'phone', label: '联系电话', minWidth: 130 },
      {
        prop: 'driverOwnership',
        label: '司机归属',
        minWidth: 105,
        dict: { code: 'tmsDriverOwnership', display: 'text' }
      },
      {
        prop: 'identityAuthStatus',
        label: '认证状态',
        minWidth: 280,
        formatter: (row) => formatDriverAuth(row as DispatchDriverCandidate)
      },
      { prop: 'plateNo', label: '车牌号', minWidth: 125, formatter: (row) => row.plateNo || '—' },
      {
        prop: 'driverType',
        label: '司机类型',
        minWidth: 105,
        dict: { code: 'tmsDriverType', display: 'text' }
      },
      {
        prop: 'carrierName',
        label: '所属承运商',
        minWidth: 160,
        formatter: (row) => row.carrierName || '—'
      },
      {
        prop: 'companyName',
        label: '所属公司',
        minWidth: 160,
        formatter: (row) => row.companyName || '—'
      }
    ]
  }

  async function handleOpen(data: DialogOpenData): Promise<void> {
    resetForm(data)
    await dialogRef.value?.handleOpen(data, {
      title: data.mode === 'merge' ? '合单调度' : data.mode === 'batch' ? '批量调度' : '调度配载',
      subtitle: '选择承运方、自营司机与车辆，或个体司机，并核对计划时间。',
      size: 'lg',
      contentMaxHeight: '76vh',
      confirmText: data.mode === 'merge' ? '确认合单并配载' : '确认配载',
      onOpen: async () => {
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  function candidateParams(params: DataSelectFetchParams) {
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    const tenantId =
      dialog.rows[0]?.tenantId ||
      resolveTenantWorkspaceId(tenantScopeStore.effectiveTenantId, userStore.getUserInfo.tenantId)
    if (!tenantId) throw new Error('运单缺少所属租户，请刷新列表后重试')
    return { tenantId, keyword: params.keyword, from, to }
  }

  async function fetchCarrierSelectData(params: DataSelectFetchParams) {
    return await fetchDispatchCandidates<DispatchCarrierCandidate>({
      ...candidateParams(params),
      kind: 'carrier'
    })
  }

  async function fetchDriverSelectData(params: DataSelectFetchParams) {
    return await fetchDriverCandidateData(params, 'driver')
  }

  async function fetchIndividualSelectData(params: DataSelectFetchParams) {
    return await fetchDriverCandidateData(params, 'individual_driver')
  }

  async function fetchDriverCandidateData(
    params: DataSelectFetchParams,
    kind: 'driver' | 'individual_driver'
  ) {
    const result = await fetchDispatchCandidates<DriverCandidateWithPreview>({
      ...candidateParams(params),
      kind
    })
    const paths = result.data
      .map((driver) => driver.portraitUrl)
      .filter((path): path is string => Boolean(path && isPrivateAttachmentPath(path)))
    if (paths.length) {
      try {
        const previews = await signPrivateAttachmentPaths('tms-driver-private', paths)
        for (const driver of result.data) {
          if (driver.portraitUrl)
            driver.portraitPreviewUrl = previews.get(driver.portraitUrl) ?? null
        }
      } catch (error) {
        notifyFriendlyError(error, '司机照片暂时无法预览，仍可按姓名选择司机')
      }
    }
    return result
  }

  async function fetchVehicleSelectData(params: DataSelectFetchParams) {
    return await fetchDispatchCandidates<DispatchVehicleCandidate>({
      ...candidateParams(params),
      kind: 'vehicle'
    })
  }

  const dispatchModeItems = computed<FormItem[]>(() => [
    {
      key: 'dispatchMode',
      label: '调度对象',
      type: 'radioGroup',
      options: dispatchModeOptions.value,
      props: { optionType: 'button', onChange: handleModeChange }
    }
  ])
  function handleModeChange(): void {
    ++linkedVehicleRequestId
    linkedVehicleLoading.value = false
    linkedVehicleMessage.value = ''
    Object.assign(form.data, {
      dispatchCarrierId: null,
      carrierBillingAccountId: null,
      dispatchAgreementId: null,
      dispatchDriverId: null,
      dispatchVehicleId: '',
      dispatchPlateNo: '',
      dispatchVehicleType: '',
      dispatchVehicleLength: '',
      dispatchDriverName: '',
      dispatchDriverPhone: ''
    })
    form.selectedCarriers = []
    carrierBillingAccounts.value = []
    carrierBillingError.value = ''
    form.selectedDrivers = []
    form.selectedIndividuals = []
    form.selectedVehicles = []
    formRef.value?.clearValidate()
  }

  function handleCarrierConfirm(_value: unknown, rows: DataSelectRecord[]): void {
    const carrier = rows[0] as DispatchCarrierCandidate | undefined
    form.data.dispatchCarrierId = carrier?.id ?? null
    form.data.carrierBillingAccountId = null
    carrierBillingAccounts.value = []
    if (carrier?.id) void loadCarrierBillingAccounts(carrier.id)
  }

  async function loadCarrierBillingAccounts(carrierId: string): Promise<void> {
    carrierBillingLoading.value = true
    carrierBillingError.value = ''
    try {
      const result = await fetchCarrierBillingAccountsForDispatch(carrierId)
      if (form.data.dispatchCarrierId !== carrierId) return
      if (result.error) throw result.error
      carrierBillingAccounts.value = result.data ?? []
      form.data.carrierBillingAccountId =
        carrierBillingAccounts.value.find((account) => account.isDefault)?.id ?? null
    } catch (error) {
      if (form.data.dispatchCarrierId !== carrierId) return
      carrierBillingError.value = getFriendlySupabaseErrorMessage(
        error,
        '开票账户加载失败；可先完成调度，稍后在承运商档案中检查账户。'
      )
    } finally {
      carrierBillingLoading.value = false
    }
  }

  function handleCarrierClear(): void {
    form.data.dispatchCarrierId = null
    form.data.carrierBillingAccountId = null
    carrierBillingAccounts.value = []
    form.selectedCarriers = []
  }

  function handleDriverConfirm(_value: unknown, rows: DataSelectRecord[]): void {
    const driver = rows[0] as DispatchDriverCandidate | undefined
    if (
      form.data.dispatchMode === 'self_operated' &&
      form.selectedVehicle?.id !== driver?.vehicleId
    ) {
      form.selectedVehicles = []
      applyVehicle(undefined)
    }
    selectedDriverRows.value = rows
    form.data.dispatchDriverId = driver?.id ?? null
    form.data.dispatchAgreementId = driver?.agreementId ?? null
    form.data.dispatchDriverName = driver?.driverName ?? ''
    form.data.dispatchDriverPhone = driver?.phone ?? ''
    if (form.data.dispatchMode === 'individual_driver' || !form.selectedVehicle) {
      form.data.dispatchPlateNo = driver?.plateNo ?? ''
    }
    const requestId = ++linkedVehicleRequestId
    linkedVehicleMessage.value = ''
    if (form.data.dispatchMode === 'self_operated' && driver) {
      if (driver.vehicleId && form.selectedVehicle?.id !== driver.vehicleId) {
        void resolveLinkedVehicle(driver, requestId)
      } else if (!driver.vehicleId) {
        linkedVehicleMessage.value = '司机档案未关联可配载车辆，请手动选择车辆。'
      }
    }
  }

  async function resolveLinkedVehicle(
    driver: DispatchDriverCandidate,
    requestId: number
  ): Promise<void> {
    linkedVehicleLoading.value = true
    try {
      const result = await fetchDispatchCandidates<DispatchVehicleCandidate>({
        ...candidateParams({ page: 1, pageSize: 100, keyword: driver.plateNo || '', filters: {} }),
        kind: 'vehicle'
      })
      if (requestId !== linkedVehicleRequestId || form.data.dispatchDriverId !== driver.id) return
      if (result.error) throw result.error
      const vehicle = result.data.find((candidate) => candidate.id === driver.vehicleId)
      if (vehicle) {
        form.selectedVehicles = [vehicle as DataSelectRecord]
        applyVehicle(vehicle)
      } else {
        linkedVehicleMessage.value = '司机关联车辆当前不可配载，请手动选择可用车辆。'
      }
    } catch (error) {
      if (requestId !== linkedVehicleRequestId || form.data.dispatchDriverId !== driver.id) return
      linkedVehicleMessage.value = '关联车辆加载失败，请手动选择车辆或重选司机后重试。'
      notifyFriendlyError(error, linkedVehicleMessage.value)
    } finally {
      if (requestId === linkedVehicleRequestId) linkedVehicleLoading.value = false
    }
  }

  function handleDriverClear(): void {
    ++linkedVehicleRequestId
    linkedVehicleLoading.value = false
    linkedVehicleMessage.value = ''
    form.data.dispatchDriverId = null
    form.data.dispatchAgreementId = null
    form.data.dispatchDriverName = ''
    form.data.dispatchDriverPhone = ''
    if (form.data.dispatchMode === 'self_operated') {
      form.selectedVehicles = []
      applyVehicle(undefined)
    } else {
      form.data.dispatchPlateNo = ''
    }
    selectedDriverRows.value = []
  }

  function handleVehicleConfirm(_value: unknown, rows: DataSelectRecord[]): void {
    const vehicle = rows[0] as DispatchVehicleCandidate | undefined
    applyVehicle(vehicle)
    linkedVehicleMessage.value = ''
  }

  function handleVehicleClear(): void {
    applyVehicle(undefined)
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (linkedVehicleLoading.value) {
        ElMessage.warning('正在核对司机关联车辆，请稍候再提交')
        return false
      }
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        form.data.dispatchMode === 'individual_driver' &&
        form.selectedIndividual?.agreementStatus !== 'signed'
      ) {
        ElMessage.warning('请先完成个体司机运输协议签署后再调度')
        return false
      }
      const payload = normalizePayload()
      if (payload.dispatchMode !== 'carrier') {
        const check = await checkDispatchCertificateRisk(
          payload.dispatchMode === 'self_operated' ? payload.dispatchVehicleId : null,
          payload.dispatchDriverId
        )
        if (check.blocked) {
          await certificateRiskDialogRef.value?.handleOpen(check, async (reason) => {
            try {
              await submitPayload({
                ...payload,
                certificateRiskOverride: true,
                certificateRiskOverrideReason: reason
              })
              dialogRef.value?.handleClose(true)
              emit('success')
              return true
            } catch (error) {
              notifyFriendlyError(error, '强制派车失败，请核对权限和证件状态后重试')
              return false
            }
          })
          return false
        }
      }
      await submitPayload(payload)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '证件风险检查或运单调度失败，请重试；未完成检查前不会派车')
      return false
    }
  }

  async function submitPayload(payload: DispatchPayload): Promise<void> {
    if (dialog.mode === 'batch') {
      await dispatchWaybillBatch(dialog.rows, payload)
    } else if (dialog.mode === 'merge') {
      await mergeWaybills(dialog.rows, payload)
    } else {
      await dispatchWaybill(dialog.rows[0], payload)
    }
  }

  function resetForm(data: DialogOpenData): void {
    ++linkedVehicleRequestId
    linkedVehicleLoading.value = false
    linkedVehicleMessage.value = ''
    Object.assign(dialog, {
      rows: data.rows,
      mode: data.mode
    })
    Object.assign(form.data, createInitialForm())
    form.selectedCarriers = []
    carrierBillingAccounts.value = []
    carrierBillingError.value = ''
    form.selectedDrivers = []
    form.selectedIndividuals = []
    form.selectedVehicles = []
    agreementDetail.value = null
    Object.assign(advisor, { loading: false, data: null, error: '' })
  }

  async function loadRecommendations(): Promise<void> {
    const orderId = String(dialog.rows[0]?.id || '')
    if (!orderId || advisor.loading) return

    advisor.loading = true
    advisor.error = ''
    try {
      const { data, error } = await recommendDispatchResourcesByAi(orderId, 3)
      if (error) throw error
      if (!data) throw new Error('推荐服务未返回结果')
      advisor.data = data
    } catch (error) {
      advisor.error = getFriendlySupabaseErrorMessage(error, 'AI 调度推荐生成失败，请稍后重试')
    } finally {
      advisor.loading = false
    }
  }

  function applyRecommendation(item: DispatchRecommendation): void {
    const vehicle: DispatchVehicleOption = {
      id: item.vehicle.id,
      carrierId: item.vehicle.carrierId,
      plateNo: item.vehicle.plateNo,
      companyName: item.vehicle.companyName || undefined,
      vehicleType: item.vehicle.vehicleType || undefined,
      tonnageOrSeat: item.vehicle.tonnageOrSeat,
      overallLength: item.vehicle.overallLength,
      primaryDriverId: item.vehicle.primaryDriver.id,
      primaryDriver: {
        id: item.vehicle.primaryDriver.id,
        driverName: item.vehicle.primaryDriver.driverName,
        phone: item.vehicle.primaryDriver.phone || undefined,
        licenseType: item.vehicle.primaryDriver.licenseType || undefined,
        enabled: true
      }
    }
    form.selectedVehicles = [vehicle as DataSelectRecord]
    form.selectedDrivers = [vehicle.primaryDriver as DataSelectRecord]
    applyVehicle(vehicle)
    form.data.dispatchDriverId = vehicle.primaryDriverId ?? null
    form.data.dispatchDriverName = vehicle.primaryDriver?.driverName ?? ''
    form.data.dispatchDriverPhone = vehicle.primaryDriver?.phone ?? ''
    ElMessage.success(`已采用 ${vehicle.plateNo}，请确认计划时间后提交配载`)
  }

  function createInitialForm(): DispatchPayload {
    return {
      ids: [],
      dispatchMode: 'self_operated',
      dispatchCarrierId: null,
      carrierBillingAccountId: null,
      dispatchAgreementId: null,
      dispatchVehicleId: '',
      dispatchDriverId: null,
      dispatchPlateNo: '',
      dispatchVehicleType: '',
      dispatchVehicleLength: '',
      dispatchDriverName: '',
      dispatchDriverPhone: '',
      plannedDepartureTime: '',
      plannedArrivalTime: '',
      dispatchRemark: ''
    }
  }

  function applyVehicle(vehicle?: DispatchVehicleCandidate | DispatchVehicleOption): void {
    Object.assign(form.data, {
      dispatchVehicleId: vehicle?.id || '',
      dispatchPlateNo: vehicle?.plateNo || '',
      dispatchVehicleType: vehicle?.vehicleType || '',
      dispatchVehicleLength: formatVehicleLength(vehicle)
    })
  }

  function normalizePayload(): DispatchPayload {
    const ids = dialog.rows.map((row) => String(row.id || '')).filter(Boolean)
    return {
      ...toRaw(form.data),
      dispatchCarrierId: form.data.dispatchMode === 'carrier' ? form.data.dispatchCarrierId : null,
      carrierBillingAccountId:
        form.data.dispatchMode === 'carrier'
          ? carrierBillingError.value
            ? undefined
            : form.data.carrierBillingAccountId
          : null,
      dispatchAgreementId:
        form.data.dispatchMode === 'individual_driver' ? form.data.dispatchAgreementId : null,
      dispatchVehicleId:
        form.data.dispatchMode === 'self_operated' ? form.data.dispatchVehicleId : '',
      dispatchDriverId: form.data.dispatchMode === 'carrier' ? null : form.data.dispatchDriverId,
      id: dialog.mode === 'single' ? ids[0] : undefined,
      ids: dialog.mode === 'batch' ? ids : undefined,
      dispatchRemark: normalizeNullableText(form.data.dispatchRemark)
    }
  }

  function formatVehicleLength(vehicle?: DispatchVehicleCandidate | DispatchVehicleOption): string {
    if (!vehicle) return ''
    if ('specLengthM' in vehicle && vehicle.specLengthM) return `${vehicle.specLengthM}m`
    if ('tonnageOrSeat' in vehicle && vehicle.tonnageOrSeat) return vehicle.tonnageOrSeat
    if ('overallLength' in vehicle && vehicle.overallLength) return `${vehicle.overallLength}mm`
    return ''
  }

  async function remindAgreement(action: 'signature' | 'revision'): Promise<void> {
    const driver = form.selectedIndividual
    if (!driver) return
    try {
      await confirmAction(
        action === 'revision'
          ? '提醒修改协议将使当前协议失效，确认继续吗？'
          : '确认提醒该司机签署运输协议？',
        { confirmButtonText: action === 'revision' ? '提醒修改' : '提醒签署' }
      )
    } catch {
      return
    }
    try {
      const result = await remindDispatchAgreement(driver.id, action)
      ElMessage.success(
        result.data?.deliveryMode === 'internal_followup'
          ? '司机未绑定站内账号，已通知档案负责人线下联系'
          : '已向司机发送站内通知'
      )
      if (action === 'revision') driver.agreementStatus = 'revision_requested'
    } catch {
      // API 层已展示明确的业务错误，避免重复提示。
    }
  }

  async function openAgreement(): Promise<void> {
    const id = form.selectedIndividual?.agreementId
    if (!id) return
    agreementDetail.value = null
    await agreementDialogRef.value?.handleOpen(undefined, {
      title: '运输协议',
      contentMaxHeight: '76vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          const result = await fetchDispatchAgreement(id)
          if (!result.data) throw new Error('运输协议已不存在或无权查看')
          agreementDetail.value = result.data
          api.setOptions({ title: `运输协议 · ${result.data.agreementNo}` })
        } finally {
          api.setLoading(false)
        }
      }
    })
  }

  function formatValue(value?: string | number | null): string {
    const text = trim(String(value ?? ''))
    return text || '-'
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .dispatch-dialog {
    display: grid;
    gap: 16px;

    &__mode {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
      align-items: center;
      padding: 4px 6px 14px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      > span {
        font-size: 14px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
    }

    &__selection {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 18px;
      align-items: center;
      padding: 14px 16px;
      font-size: 13px;
      color: var(--el-text-color-regular);

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }
    }

    &__agreement-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      width: 100%;
    }

    &__agreement-detail {
      display: grid;
      gap: 20px;
      min-width: 0;
    }

    &__agreement-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 20px;
      font-size: 13px;
      color: var(--el-text-color-regular);
    }

    &__agreement-images {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    &__order {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      margin: 0 6px;
      color: var(--el-text-color-regular);
    }

    &__advisor {
      display: grid;
      gap: 12px;
      padding: 14px;
      margin: 0 6px;
      border: 1px solid var(--el-color-primary-light-8);

      > header {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;

        > div {
          display: flex;
          gap: 10px;
          align-items: center;

          > div {
            display: grid;
            gap: 3px;
          }
        }

        strong {
          color: var(--el-text-color-primary);
        }

        small {
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__advisor-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);

      .art-svg-icon {
        font-size: 20px;
      }
    }

    &__advisor-summary {
      margin: 0;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    &__recommendations {
      display: grid;
      gap: 10px;

      article {
        display: grid;
        gap: 9px;
        padding: 12px;
        background: var(--el-fill-color-lighter);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: var(--el-border-radius-base);

        &.is-first {
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-7);
        }

        > footer {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 16px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__recommendation-main {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }
      }
    }

    &__recommendation-rank {
      font-weight: 700;
      color: var(--el-color-primary);
    }

    &__recommendation-reasons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      font-size: 12px;
      color: var(--el-text-color-regular);

      span {
        display: inline-flex;
        gap: 4px;
        align-items: center;

        .art-svg-icon {
          color: var(--el-color-success);
        }

        &.is-warning .art-svg-icon {
          color: var(--el-color-warning);
        }
      }
    }

    &__vehicle {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px 18px;
      padding: 16px;
      background: var(--el-fill-color-lighter);

      div {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      span {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }

      strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    :deep(.dispatch-dialog__form) {
      padding: 0;

      > .el-form > .el-row {
        margin-right: 0 !important;
        margin-left: 0 !important;
      }
    }
  }

  @media (width <= 768px) {
    .dispatch-dialog {
      &__agreement-meta,
      &__agreement-images {
        grid-template-columns: 1fr;
      }

      &__advisor {
        > header {
          align-items: flex-start;

          > div {
            align-items: flex-start;
          }
        }
      }

      &__recommendation-main {
        grid-template-columns: auto minmax(0, 1fr) auto;

        .el-tag {
          display: none;
        }
      }

      &__vehicle {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
