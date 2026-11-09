<template>
  <ArtDrawer
    ref="drawerRef"
    size="min(96vw, 1040px)"
    header-icon="ri:arrow-go-back-line"
    :on-confirm="submit"
    :confirm-text="mode === 'empty' ? '生成返程空载运单' : step === 2 ? '创建返程运输单' : '下一步'"
    :confirm-loading="saving"
  >
    <div class="return-trip-drawer space-y-4 pb-4">
      <ArtEntitySummary icon="ri:arrow-go-back-line" :title="source?.orderNo" compact>
        <strong>{{ source?.orderNo }}</strong>
        <p class="mt-0.5!">{{ source?.originStation }} → {{ source?.destinationStation }}</p>
      </ArtEntitySummary>
      <nav v-if="mode === 'load'" class="flex flex-wrap gap-2" aria-label="返程开单步骤">
        <button
          v-for="(label, index) in steps"
          :key="label"
          type="button"
          class="flex min-w-36 flex-1 items-center gap-2 rounded-[var(--art-control-radius)] border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
          :class="
            step === index
              ? 'border-[var(--el-color-primary)] bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)]'
              : 'border-[var(--el-border-color-light)]'
          "
          :aria-label="`${index + 1} · ${label}`"
          :aria-current="step === index ? 'step' : undefined"
          :disabled="index > step"
          @click="step = index"
        >
          <span
            class="grid size-5 shrink-0 place-items-center rounded-full border border-current text-xs font-semibold"
            aria-hidden="true"
            >{{ index + 1 }}</span
          >
          <span class="truncate">{{ label }}</span>
        </button>
      </nav>
      <ArtSectionCard
        v-if="loadError"
        title="基础资料加载失败"
        :error="loadError"
        @retry="loadOptions"
      />
      <template v-else>
        <ElAlert
          v-if="!candidates.length"
          type="warning"
          title="暂无可用的正向调度运单，请先完成正向配载后重试。"
          :closable="false"
          show-icon
        />
        <ArtSectionCard
          v-if="mode === 'empty'"
          title="返程空载"
          subtitle="从正向调度运单直接生成空载返程；系统自动编制下一段 R 序号。"
          preserve-content-structure
        >
          <ArtForm
            v-model="sourceChoice"
            :items="sourceItems"
            class="return-trip-drawer__form"
            :span="12"
            :gutter="12"
            label-position="top"
          />
          <ArtForm
            ref="emptyFormRef"
            v-model="emptyReturn"
            :items="emptyReturnItems"
            class="return-trip-drawer__form"
            :span="12"
            :gutter="12"
            label-position="top"
          />
          <p v-if="selectedSource" class="px-4 text-sm text-[var(--el-text-color-secondary)]">
            原始运单：<strong class="text-[var(--el-text-color-primary)]">{{
              selectedSource.waybillNo
            }}</strong>
            · 系统会从本趟下一段 R 序号继续编号。
          </p>
        </ArtSectionCard>
        <template v-else>
          <ArtSectionCard
            v-show="step === 0"
            title="收发信息"
            subtitle="返程始发地与原单目的地一致；请核对本次联系人及地址。"
            preserve-content-structure
          >
            <ArtForm
              v-model="sourceChoice"
              :items="sourceItems"
              class="return-trip-drawer__form"
              :span="12"
              :gutter="12"
              label-position="top"
            />
            <div
              v-if="selectedSource"
              class="mb-3 rounded-[var(--art-control-radius)] border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-light)] px-3 py-2 text-sm text-[var(--el-text-color-regular)]"
            >
              将沿用调度单 <strong>{{ selectedSource.waybillNo }}</strong>
              <span v-if="selectedSource.driverName || selectedSource.plateNo">
                · {{ selectedSource.driverName || '司机待核对' }} /
                {{ selectedSource.plateNo || '车辆待核对' }}
              </span>
            </div>
            <div class="mb-2 flex flex-wrap items-center gap-4 px-4 text-sm">
              <div v-for="endpoint in addressEndpoints" :key="endpoint.mode" class="art-icon-label">
                <span>{{ endpoint.label }}地址</span>
                <ArtButtonMore
                  :list="addressActions"
                  trigger="click"
                  @click="handleAddressAction(endpoint.mode, $event.key)"
                >
                  <template #trigger>
                    <ArtIconButton
                      icon="ri:map-pin-2-line"
                      :label="`${endpoint.label}地址操作`"
                      :title="`${endpoint.label}地址操作`"
                    />
                  </template>
                </ArtButtonMore>
              </div>
            </div>
            <ArtForm
              ref="contactFormRef"
              v-model="form"
              :items="contactItems"
              class="return-trip-drawer__form"
              :span="12"
              :gutter="12"
              label-position="top"
            >
              <template #shippingAddressPicker>
                <ArtAddressPicker
                  v-model:region-path="form.shippingRegionPath"
                  v-model:address-detail="form.shippingAddressDetail"
                  v-model:longitude="form.shippingLongitude"
                  v-model:latitude="form.shippingLatitude"
                  :region-api="fetchRegionOptions"
                  detail-label="发货地址"
                  :detail-span="24"
                  label-width="auto"
                  hide-region-selector
                  show-coordinate-hint
                />
              </template>
              <template #receivingAddressPicker>
                <ArtAddressPicker
                  v-model:region-path="form.receivingRegionPath"
                  v-model:address-detail="form.receivingAddressDetail"
                  v-model:longitude="form.receivingLongitude"
                  v-model:latitude="form.receivingLatitude"
                  :region-api="fetchRegionOptions"
                  detail-label="收货地址"
                  :detail-span="24"
                  label-width="auto"
                  hide-region-selector
                  show-coordinate-hint
                />
              </template>
            </ArtForm>
            <div v-if="form.transferStationIds?.length" class="flex flex-wrap gap-2 px-4 pb-2">
              <div
                v-for="(stationId, index) in form.transferStationIds"
                :key="stationId"
                class="art-icon-label rounded-[var(--art-control-radius)] border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-light)] px-2 py-1 text-sm"
              >
                <span class="font-semibold">{{ index + 1 }}.</span>
                <span>{{ stationName(stationId) }}</span>
                <ElButton link :disabled="index === 0" @click="moveWaypoint(index, -1)"
                  >上移</ElButton
                >
                <ElButton
                  link
                  :disabled="index === (form.transferStationIds?.length ?? 0) - 1"
                  @click="moveWaypoint(index, 1)"
                  >下移</ElButton
                >
                <ArtIconButton
                  icon="ri:close-line"
                  :label="`移除途经点 ${index + 1}`"
                  @click="removeWaypoint(index)"
                />
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 px-4 pb-3">
              <ElButton
                plain
                :disabled="(form.transferStationIds?.length ?? 0) >= 3"
                @click="addWaypoint"
              >
                <ArtSvgIcon icon="ri:add-line" />添加途经点（{{
                  form.transferStationIds?.length ?? 0
                }}/3）
              </ElButton>
              <ElButton
                v-if="canEstimateDistance"
                link
                :loading="distanceLoading"
                @click="calculateDistance"
              >
                重新估算路线
              </ElButton>
              <span class="text-xs text-[var(--el-text-color-secondary)]" role="status">{{
                distanceStatus
              }}</span>
            </div>
          </ArtSectionCard>
          <ArtSectionCard
            v-show="step === 1"
            title="配置信息"
            subtitle="核对返程车型、计费规则与交接设置。"
            preserve-content-structure
          >
            <OrderConfig
              ref="configRef"
              v-model="form.orderConfig"
              :can-edit-attachments="true"
              :resource-tenant-id="source?.tenantId || workspaceTenantId"
            />
          </ArtSectionCard>
          <ArtSectionCard
            v-show="step === 2"
            title="货物信息"
            subtitle="返程货物和运费独立归属新订单。"
            preserve-content-structure
          >
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <ElButton plain @click="cargoSelectorRef?.open()">
                <ArtSvgIcon icon="ri:checkbox-multiple-line" />选择货物
              </ElButton>
              <ElButton plain @click="addCargo">
                <ArtSvgIcon icon="ri:add-line" />添加货物
              </ElButton>
              <ElButton
                plain
                :disabled="!form.contractId"
                @click="contractDetailSelectorRef?.open(form.contractId || '')"
              >
                <ArtSvgIcon icon="ri:file-list-3-line" />批量选合同明细
              </ElButton>
              <ElButton
                plain
                :disabled="!form.shippingCustomerId"
                @click="contractSelectorRef?.open(form.shippingCustomerId || '')"
                ><ArtSvgIcon icon="ri:file-list-3-line" />选择客户合同</ElButton
              >
              <span v-if="form.contractId" class="text-sm text-[var(--el-text-color-secondary)]">{{
                contractLabel
              }}</span>
            </div>
            <div
              v-for="(item, index) in form.cargoItems"
              :key="index"
              class="mb-3 rounded-[var(--art-control-radius)] border border-[var(--el-border-color-light)] p-3"
            >
              <div class="mb-2 flex items-center justify-between"
                ><strong>货物 {{ index + 1 }}</strong
                ><ElButton link type="danger" @click="removeCargo(index)">移除</ElButton></div
              >
              <ArtForm
                v-model="form.cargoItems[index]"
                :items="cargoItems"
                class="return-trip-drawer__form"
                :span="8"
                :gutter="12"
                label-position="top"
              />
            </div>
            <ElTabs v-model="settlementTab">
              <ElTabPane label="应收信息" name="receivable">
                <ArtForm
                  v-model="form"
                  :items="feeItems"
                  class="return-trip-drawer__form"
                  :span="8"
                  :gutter="12"
                  label-position="top"
                />
                <p class="px-4 pb-3 text-right text-sm">
                  应收运费合计
                  <strong class="ml-2 text-lg text-[var(--el-color-primary)]"
                    >￥{{ receivableTotal }}</strong
                  >
                  <span class="ml-4 text-[var(--el-text-color-secondary)]"
                    >款项分配：￥{{ paymentTotal }}</span
                  >
                </p>
              </ElTabPane>
              <ElTabPane label="应付信息" name="payable">
                <OrderSupplement
                  ref="payableRef"
                  v-model="form.orderConfig"
                  section="payable"
                  :can-view-amounts="true"
                  :can-edit-amounts="true"
                  :can-view-proof="true"
                  :can-edit-proof="true"
                  :resource-tenant-id="source?.tenantId || workspaceTenantId"
                />
              </ElTabPane>
              <ElTabPane label="装卸货信息" name="loading">
                <OrderSupplement
                  ref="loadingRef"
                  v-model="form.orderConfig"
                  section="loading"
                  :can-view-amounts="true"
                  :can-edit-amounts="true"
                  :can-view-proof="true"
                  :can-edit-proof="true"
                  :resource-tenant-id="source?.tenantId || workspaceTenantId"
                />
              </ElTabPane>
            </ElTabs>
          </ArtSectionCard>
        </template>
      </template>
    </div>
    <CargoSelector ref="cargoSelectorRef" @confirm="selectCargo" />
    <ContractSelector ref="contractSelectorRef" @select="selectContract" />
    <ContractDetailSelector ref="contractDetailSelectorRef" @confirm="selectContractDetails" />
    <CustomerAddressDialog ref="addressRecognitionRef" @selected="handleRecognizedAddress" />
    <CustomerSelectorDialog ref="customerSelectorRef" @select="handleCustomerSelect" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { normalizeCoordinatePair } from '@/utils/geo'
  import { fetchRegionOptions } from '@/api/region-options'
  import {
    useAmapDrivingEstimate,
    type AmapRouteCoordinate
  } from '@/hooks/core/useAmapDrivingEstimate'
  import { useAmapGeocoder } from '@/hooks/core/useAmapGeocoder'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { resolveTenantWorkspaceId } from '@/utils/tenant-scope-context'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { fetchCustomerDefaultAddress, fetchCustomerOptions } from '@tms/api/modules/customer'
  import { fetchStationOptions } from '@tms/api/modules/station'
  import {
    createReturnOrder,
    createEmptyReturnTrip,
    fetchReturnTripCandidates,
    type ReturnTripCandidate
  } from '@tms/api/modules/return-trip'
  import {
    createInitialCargoItem,
    createInitialForm,
    createCustomerSelectorContactPatch,
    moneyValue,
    normalizeOrderPayload,
    parseOrderRegionPath,
    type OrderForm
  } from '../../../order-open/modules/order-open-model'
  import OrderConfig from '../../../order-open/modules/order-config.vue'
  import OrderSupplement from '../../../order-open/modules/order-supplement.vue'
  import CargoSelector from '../../../modules/cargo-multiple-select.vue'
  import ContractSelector from '../../../order-open/modules/order-contract-selector.vue'
  import ContractDetailSelector from '../../../order-open/modules/contract-detail-multiple-select.vue'
  import {
    calculateContractTransportFee,
    mergeOrderContractDetails,
    synchronizeContractCargoFreight
  } from '../../../order-open/modules/order-contract-detail'
  import CustomerSelectorDialog from '../../../order-open/modules/customer-selector-dialog.vue'
  import CustomerAddressDialog from '../../../basic-data/customer-address/modules/customer-address-dialog.vue'
  import type { OrderContractCandidate } from '@tms/api'

  type OrderRecord = Api.Tms.Order.OrderRecord
  type CargoMaster = Api.Tms.BasicData.Cargo
  type CustomerAddress = Api.Tms.BasicData.CustomerAddress
  type CustomerItem = Api.Tms.Order.CustomerSelectorItem
  type StationOption = Api.Tms.Order.StationOption
  type ContractDetail = Api.Tms.BasicData.ContractDetailSelectorItem
  type SelectorMode = 'shipping' | 'receiving'
  type ReturnForm = OrderForm & { cargoItems: Api.Tms.Order.CargoItem[] }
  const tenantScopeStore = useTenantScopeStore()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { estimateDrivingRoute } = useAmapDrivingEstimate()
  const { geocodeAddress } = useAmapGeocoder()
  const workspaceTenantId = computed(() =>
    resolveTenantWorkspaceId(tenantScopeStore.effectiveTenantId, userStore.getUserInfo.tenantId)
  )
  const createReturnForm = (): ReturnForm => ({
    ...createInitialForm(),
    cargoItems: [createInitialCargoItem()]
  })
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const contactFormRef = ref<InstanceType<typeof ArtForm>>()
  const emptyFormRef = ref<InstanceType<typeof ArtForm>>()
  const configRef = ref<InstanceType<typeof OrderConfig>>()
  const payableRef = ref<InstanceType<typeof OrderSupplement>>()
  const loadingRef = ref<InstanceType<typeof OrderSupplement>>()
  const cargoSelectorRef = ref<{ open: () => Promise<void> }>()
  const contractSelectorRef = ref<{ open: (customerId: string) => Promise<void> }>()
  const contractDetailSelectorRef = ref<{ open: (contractId: string) => Promise<void> }>()
  const customerSelectorRef = ref<InstanceType<typeof CustomerSelectorDialog>>()
  const addressRecognitionRef = ref<InstanceType<typeof CustomerAddressDialog>>()
  const recognitionEndpoint = ref<SelectorMode>('shipping')
  const addressEndpoints: Array<{ mode: SelectorMode; label: string }> = [
    { mode: 'shipping', label: '发货' },
    { mode: 'receiving', label: '收货' }
  ]
  const addressActions = [
    {
      key: 'recognize',
      label: '地址识别',
      icon: 'ri:magic-line',
      auth: 'TmsOrderList:AddReturnTrip'
    },
    {
      key: 'select',
      label: '选择地址',
      icon: 'ri:map-pin-2-line',
      auth: 'TmsOrderList:AddReturnTrip'
    }
  ]
  const source = ref<OrderRecord>()
  const mode = ref<'load' | 'empty'>('load')
  const emptyReturn = reactive({ originStation: '', destinationStation: '', remark: '' })
  const emptyReturnItems: FormItem[] = [
    {
      key: 'originStation',
      label: '返程始发地',
      type: 'input',
      formItemProps: { rules: [{ required: true, whitespace: true, message: '请填写返程始发地' }] }
    },
    {
      key: 'destinationStation',
      label: '返程目的地',
      type: 'input',
      formItemProps: { rules: [{ required: true, whitespace: true, message: '请填写返程目的地' }] }
    },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500 }
    }
  ]
  const form = ref<ReturnForm>(createReturnForm())
  const paymentMethodOptions = useDictionaryOptions('tmsOrderPaymentMethod')
  const cargoUnitOptions = useDictionaryOptions('tmsCargoUnit')
  const transportModeOptions = useDictionaryOptions('tmsOrderTransportMode')
  const sourceChoice = reactive({ waybillId: '' })
  const candidates = ref<ReturnTripCandidate[]>([])
  const selectedSource = computed(() =>
    candidates.value.find((candidate) => candidate.id === sourceChoice.waybillId)
  )
  const customers = ref<Api.Tms.BasicData.CustomerOption[]>([])
  const transferStations = ref<StationOption[]>([])
  const showWaypointSelect = ref(false)
  const distanceLoading = ref(false)
  const distanceStatus = ref('请先在发货、收货地址地图选点')
  let distanceRequestId = 0
  const contractLabel = ref('')
  const step = ref(0)
  const settlementTab = ref('receivable')
  const steps = ['收发信息', '配置信息', '货物信息']
  watch([step, mode], ([value, currentMode]) =>
    drawerRef.value?.setOptions({
      confirmText:
        currentMode === 'empty' ? '生成返程空载运单' : value === 2 ? '创建返程运输单' : '下一步'
    })
  )
  const saving = ref(false)
  const loadError = ref('')
  let optionsRequestId = 0
  const customerOptions = computed(() =>
    customers.value.map((row) => ({ label: row.customerName, value: row.id }))
  )
  const sourceItems = computed<FormItem[]>(() => [
    {
      key: 'waybillId',
      label: '正向调度单',
      type: 'select',
      span: 12,
      description: '所有返程统一关联这张正向调度运单，系统自动递增 R 序号。',
      formItemProps: { rules: [{ required: true, message: '请选择正向调度运单' }] },
      props: {
        options: candidates.value.map((row) => ({ label: row.waybillNo, value: row.id })),
        placeholder: '请选择正向调度运单'
      }
    }
  ])
  const contactItems = computed<FormItem[]>(() => [
    { key: 'originStation', label: '始发地', type: 'input', props: { disabled: true } },
    {
      key: 'destinationStation',
      label: '目的地',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写返程目的地' }] }
    },
    {
      key: 'transferStationIds',
      label: '途经点',
      type: 'select',
      hidden: !showWaypointSelect.value && !(form.value.transferStationIds?.length ?? 0),
      span: 24,
      props: {
        options: transferStations.value.map((station) => ({
          label: station.stationName,
          value: station.id
        })),
        multiple: true,
        multipleLimit: 3,
        filterable: true,
        clearable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        placeholder: '选择1～3个途经点，下方可调整顺序',
        onChange: handleWaypointChange
      }
    },
    {
      key: 'shippingCustomerId',
      label: '返程发货客户',
      type: 'select',
      formItemProps: { rules: [{ required: true, message: '请选择发货客户' }] },
      props: { options: customerOptions.value, filterable: true }
    },
    {
      key: 'receivingCustomerId',
      label: '返程收货客户',
      type: 'select',
      props: { options: customerOptions.value, filterable: true, clearable: true }
    },
    {
      key: 'shippingContactName',
      label: '发货联系人',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写发货联系人' }] }
    },
    {
      key: 'shippingContactPhone',
      label: '发货电话',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写发货电话' }] }
    },
    { key: 'shippingAddressPicker', label: '', span: 24 },
    {
      key: 'receivingContactName',
      label: '收货联系人',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写收货联系人' }] }
    },
    {
      key: 'receivingContactPhone',
      label: '收货电话',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写收货电话' }] }
    },
    { key: 'receivingAddressPicker', label: '', span: 24 },
    {
      key: 'distanceKm',
      label: '驾车距离',
      type: 'input',
      props: {
        modelValue: form.value.distanceKm == null ? '' : `${form.value.distanceKm} km`,
        readonly: true,
        placeholder: distanceStatus.value
      }
    },
    {
      key: 'departureAt',
      label: '计划发车',
      type: 'date',
      props: { type: 'datetime', valueFormat: 'YYYY-MM-DDTHH:mm:ssZ', class: 'w-full!' }
    },
    {
      key: 'arrivalAt',
      label: '计划到达',
      type: 'date',
      props: { type: 'datetime', valueFormat: 'YYYY-MM-DDTHH:mm:ssZ', class: 'w-full!' }
    }
  ])
  const cargoItems: FormItem[] = [
    {
      key: 'cargoName',
      label: '货物名称',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写货物名称' }] }
    },
    {
      key: 'specModel',
      label: '规格型号',
      type: 'input',
      props: { maxlength: 100 }
    },
    {
      key: 'quantity',
      label: '数量',
      type: 'number',
      props: { min: 0, precision: 0, controls: false, class: 'w-full!' }
    },
    { key: 'unit', label: '单位', type: 'input' },
    { key: 'packageType', label: '计量单位', type: 'select', props: { options: cargoUnitOptions } },
    {
      key: 'weightKg',
      label: '重量（千克）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    },
    {
      key: 'volumeM3',
      label: '体积（立方米）',
      type: 'number',
      props: { min: 0, precision: 3, controls: false, class: 'w-full!' }
    },
    {
      key: 'unitPrice',
      label: '合同单价（元）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    },
    {
      key: 'freight',
      label: '运费（元）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    },
    { key: 'remark', label: '货物备注', type: 'input', props: { maxlength: 200 } }
  ]
  const receivableFeeFields = [
    ['transportFee', '运费'],
    ['deliveryFee', '配送费'],
    ['unloadingFee', '卸货费'],
    ['collectPaymentFee', '回款费'],
    ['transferFee', '中转费'],
    ['insuranceFee', '保费'],
    ['packageFee', '包装费'],
    ['otherFee', '其他费用']
  ] as const
  const receivableTotal = computed(() =>
    formatCurrencyValue(
      receivableFeeFields.reduce((sum, [key]) => sum + moneyValue(form.value[key]), 0)
    )
  )
  const paymentTotal = computed(() =>
    formatCurrencyValue(
      moneyValue(form.value.cashAmount) +
        moneyValue(form.value.collectAmount) +
        moneyValue(form.value.monthlyAmount) +
        moneyValue(form.value.codAmount) +
        moneyValue(form.value.handlingFee)
    )
  )
  const feeItems: FormItem[] = [
    ...receivableFeeFields.map(([key, label]): FormItem => ({
      key,
      label: `${label}（元）`,
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    })),
    { key: 'allocationDivider', label: '款项分配', type: 'divider', span: 24 },
    ...(
      [
        ['cashAmount', '现付'],
        ['collectAmount', '到付'],
        ['monthlyAmount', '月结'],
        ['codAmount', '代收货款'],
        ['handlingFee', '手续费']
      ] as const
    ).map(([key, label]): FormItem => ({
      key,
      label: `${label}（元）`,
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    })),
    {
      key: 'declaredValue',
      label: '声明价值（元）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    },
    {
      key: 'paymentMethod',
      label: '付款方式',
      type: 'select',
      props: {
        options: paymentMethodOptions
      }
    },
    {
      key: 'transportMode',
      label: '运输方式',
      type: 'select',
      props: { options: transportModeOptions }
    },
    {
      key: 'orderRemark',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500 }
    }
  ]
  const canEstimateDistance = computed(() =>
    Boolean(
      normalizeCoordinatePair(form.value.shippingLongitude, form.value.shippingLatitude) &&
      normalizeCoordinatePair(form.value.receivingLongitude, form.value.receivingLatitude)
    )
  )
  function stationName(id: string): string {
    return transferStations.value.find((station) => station.id === id)?.stationName || id
  }
  function handleWaypointChange(ids: string[]): void {
    const selected = ids.slice(0, 3)
    form.value.transferStationIds = selected
    form.value.transferStationId = selected[0] ?? null
    form.value.transferStation = selected[0] ? stationName(selected[0]) : ''
  }
  function addWaypoint(): void {
    if ((form.value.transferStationIds?.length ?? 0) >= 3) return
    showWaypointSelect.value = true
  }
  function removeWaypoint(index: number): void {
    handleWaypointChange((form.value.transferStationIds ?? []).filter((_id, i) => i !== index))
  }
  function moveWaypoint(index: number, direction: -1 | 1): void {
    const ids = [...(form.value.transferStationIds ?? [])]
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= ids.length) return
    ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
    handleWaypointChange(ids)
  }
  async function handleAddressAction(mode: SelectorMode, action: string | number): Promise<void> {
    if (!hasAuth('TmsOrderList:AddReturnTrip')) return
    if (action === 'select') {
      await customerSelectorRef.value?.handleOpen(mode)
      return
    }
    recognitionEndpoint.value = mode
    await addressRecognitionRef.value?.handleOpen(undefined, {
      customerId:
        (mode === 'shipping' ? form.value.shippingCustomerId : form.value.receivingCustomerId) ||
        undefined,
      customerName:
        mode === 'shipping' ? form.value.shippingCustomerName : form.value.receivingCustomerName,
      selectOnly: true,
      addressType: mode
    })
  }
  function handleRecognizedAddress(address: CustomerAddress): void {
    if (!hasAuth('TmsOrderList:AddReturnTrip')) return
    const isShipping = recognitionEndpoint.value === 'shipping'
    Object.assign(
      form.value,
      isShipping
        ? {
            shippingAddressId: null,
            shippingContactName: address.contactName,
            shippingContactPhone: address.contactPhone,
            shippingRegionPath: parseOrderRegionPath(address.region),
            shippingAddressDetail: address.addressDetail,
            shippingLongitude: address.longitude,
            shippingLatitude: address.latitude
          }
        : {
            receivingAddressId: null,
            receivingContactName: address.contactName,
            receivingContactPhone: address.contactPhone,
            receivingRegionPath: parseOrderRegionPath(address.region),
            receivingAddressDetail: address.addressDetail,
            receivingLongitude: address.longitude,
            receivingLatitude: address.latitude
          }
    )
  }
  async function handleCustomerSelect(mode: SelectorMode, customer: CustomerItem): Promise<void> {
    try {
      const result = await fetchCustomerDefaultAddress(customer.id, mode)
      if (result.error) return
      Object.assign(form.value, createCustomerSelectorContactPatch(mode, customer, result.data))
      contactFormRef.value?.clearValidate()
    } catch {
      ElMessage.error('常用地址加载失败，请重新选择或手动填写')
    }
  }
  watch(
    () => [
      form.value.shippingLongitude,
      form.value.shippingLatitude,
      form.value.receivingLongitude,
      form.value.receivingLatitude,
      form.value.transferStationIds?.join('|'),
      transferStations.value
        .map((station) => `${station.id}:${station.longitude}:${station.latitude}`)
        .join('|')
    ],
    () => {
      if (canEstimateDistance.value) void calculateDistance()
      else {
        ++distanceRequestId
        form.value.distanceKm = null
        distanceStatus.value = '请先在发货、收货地址地图选点'
      }
    }
  )
  async function calculateDistance(): Promise<void> {
    const origin = normalizeCoordinatePair(
      form.value.shippingLongitude,
      form.value.shippingLatitude
    )
    const destination = normalizeCoordinatePair(
      form.value.receivingLongitude,
      form.value.receivingLatitude
    )
    if (!origin || !destination) return
    const requestId = ++distanceRequestId
    distanceLoading.value = true
    distanceStatus.value = '正在估算驾车距离…'
    let waypointMissing = false
    try {
      const ids = [...(form.value.transferStationIds ?? [])]
      const points = await Promise.all(
        ids.map(async (id) => {
          const station = transferStations.value.find((item) => item.id === id)
          if (!station) return null
          const coordinate = normalizeCoordinatePair(station.longitude, station.latitude)
          if (coordinate) return coordinate
          return geocodeAddress(
            [station.region, station.addressDetail || station.stationName].filter(Boolean).join(' ')
          )
        })
      )
      if (requestId !== distanceRequestId) return
      if (points.some((point) => !point)) {
        waypointMissing = true
        throw new Error('途经点定位失败')
      }
      const estimate = await estimateDrivingRoute(
        origin,
        destination,
        points.filter((point): point is AmapRouteCoordinate => point !== null)
      )
      if (requestId !== distanceRequestId) return
      form.value.distanceKm = estimate.distanceKm
      distanceStatus.value = ids.length ? '高德地图途经点路线估算距离' : '高德地图估算距离'
    } catch {
      if (requestId !== distanceRequestId) return
      form.value.distanceKm = null
      distanceStatus.value = waypointMissing
        ? '途经点定位失败，请检查站点名称或补充坐标'
        : '暂未获取到路线，可重新计算'
    } finally {
      if (requestId === distanceRequestId) distanceLoading.value = false
    }
  }
  async function handleOpen(row: OrderRecord, nextMode: 'load' | 'empty' = 'load'): Promise<void> {
    if (!row.id) return
    if (row.returnSourceOrderId) {
      ElMessage.warning('请从正向运输单新增返程，所有返程将关联同一张正向调度运单')
      return
    }
    ++optionsRequestId
    source.value = row
    mode.value = nextMode
    Object.assign(emptyReturn, {
      originStation: row.destinationStation || '',
      destinationStation: row.originStation || '',
      remark: ''
    })
    step.value = 0
    settlementTab.value = 'receivable'
    contractLabel.value = ''
    sourceChoice.waybillId = ''
    candidates.value = []
    customers.value = []
    transferStations.value = []
    showWaypointSelect.value = false
    ++distanceRequestId
    distanceLoading.value = false
    distanceStatus.value = '请先在发货、收货地址地图选点'
    loadError.value = ''
    const defaults = createReturnForm()
    form.value = {
      ...defaults,
      originStation: row.destinationStation || '',
      destinationStation: row.originStation || '',
      originStationId: row.destinationStationId || null,
      destinationStationId: row.originStationId || null,
      shippingAddressId: row.receivingAddressId || null,
      receivingAddressId: row.shippingAddressId || null,
      shippingRegionPath: cloneDeep(row.receivingRegionPath || []),
      receivingRegionPath: cloneDeep(row.shippingRegionPath || []),
      shippingLongitude: row.receivingLongitude ?? null,
      shippingLatitude: row.receivingLatitude ?? null,
      receivingLongitude: row.shippingLongitude ?? null,
      receivingLatitude: row.shippingLatitude ?? null,
      shippingContactName: row.receivingContactName || '',
      shippingContactPhone: row.receivingContactPhone || '',
      shippingAddressDetail: row.receivingAddressDetail || '',
      receivingContactName: row.shippingContactName || '',
      receivingContactPhone: row.shippingContactPhone || '',
      receivingAddressDetail: row.shippingAddressDetail || '',
      shippingCustomerId: row.receivingCustomerId || null,
      shippingCustomerName: row.receivingCustomerName || '',
      receivingCustomerId: row.shippingCustomerId || null,
      receivingCustomerName: row.shippingCustomerName || '',
      orderConfig: {
        ...cloneDeep(row.orderConfig || defaults.orderConfig),
        payable: defaults.orderConfig.payable,
        loading: defaults.orderConfig.loading,
        attachmentUrls: []
      },
      cargoItems: [createInitialCargoItem()]
    }
    await drawerRef.value?.handleOpen(null, {
      title: nextMode === 'empty' ? '新增返程空载' : '新增返程运输单',
      subtitle:
        nextMode === 'empty'
          ? '选择正向调度运单，直接生成返程空载调度运单'
          : '收发信息 · 配置信息 · 货物信息'
    })
    await loadOptions()
  }
  async function loadOptions(): Promise<void> {
    if (!source.value?.id) return
    const requestId = ++optionsRequestId
    const sourceOrderId = source.value.id
    const tenantId = source.value.tenantId || workspaceTenantId.value
    loadError.value = ''
    drawerRef.value?.setLoading(true)
    try {
      const [nextCandidates, customerResult, stationResult] = await Promise.all([
        fetchReturnTripCandidates(sourceOrderId),
        fetchCustomerOptions({ tenantId }),
        fetchStationOptions({ tenantId, stationType: 'transfer' })
      ])
      if (requestId !== optionsRequestId || source.value?.id !== sourceOrderId) return
      if (customerResult.error) throw customerResult.error
      if (stationResult.error) throw stationResult.error
      candidates.value = nextCandidates.filter(
        (row) => row.status !== 'cancelled' && row.canAddReturn && row.driverId && row.vehicleId
      )
      customers.value = customerResult.data ?? []
      transferStations.value = stationResult.data ?? []
      sourceChoice.waybillId = candidates.value[0]?.id || ''
    } catch {
      if (requestId === optionsRequestId) loadError.value = '请检查网络或权限后重试。'
    } finally {
      if (requestId === optionsRequestId) drawerRef.value?.setLoading(false)
    }
  }
  function addCargo(): void {
    form.value.cargoItems = [...(form.value.cargoItems ?? []), createInitialCargoItem()]
  }
  function removeCargo(index: number): void {
    form.value.cargoItems = (form.value.cargoItems ?? []).filter((_, i) => i !== index)
  }
  function selectCargo(rows: CargoMaster[]): void {
    const existing = (form.value.cargoItems ?? []).filter((item) => item.cargoName)
    form.value.cargoItems = [
      ...existing,
      ...rows.map((row) => ({
        ...createInitialCargoItem(),
        cargoId: row.id,
        cargoName: row.cargoName,
        cargoCode: row.cargoCode || '',
        unit: row.unit || '',
        weightKg: row.weightKg || null,
        volumeM3: row.volumeM3 || null
      }))
    ]
  }
  function selectContract(row: OrderContractCandidate): void {
    if (form.value.contractId !== row.id) {
      const hadPricedCargo = (form.value.cargoItems ?? []).some(
        (item) => item.sourceContractId && item.unitPrice != null
      )
      form.value.cargoItems = (form.value.cargoItems ?? []).filter((item) => !item.sourceContractId)
      if (!form.value.cargoItems.length) form.value.cargoItems = [createInitialCargoItem()]
      if (hadPricedCargo) form.value.transportFee = 0
    }
    form.value.contractId = row.id
    contractLabel.value = `${row.contractNo} · ${row.contractName}`
  }
  function selectContractDetails(details: ContractDetail[]): void {
    if (
      !form.value.contractId ||
      details.some((detail) => detail.contractId !== form.value.contractId)
    ) {
      ElMessage.warning('请选择当前关联合同的货物明细')
      return
    }
    const result = mergeOrderContractDetails(form.value.cargoItems ?? [], details)
    if (!result.addedCount) return
    form.value.cargoItems = result.items
    const transportFee = calculateContractTransportFee(result.items)
    if (transportFee !== null) form.value.transportFee = transportFee
  }
  watch(
    () =>
      (form.value.cargoItems ?? []).map((item) => [
        item.sourceContractId,
        item.quantity,
        item.unitPrice
      ]),
    () => {
      const result = synchronizeContractCargoFreight(form.value.cargoItems ?? [])
      if (result.hasContractCargo && result.transportFee !== null)
        form.value.transportFee = result.transportFee
    },
    { deep: true }
  )
  async function submit(): Promise<boolean> {
    if (saving.value || loadError.value || !source.value?.id) return false
    if (!selectedSource.value) {
      ElMessage.warning(
        candidates.value.length
          ? '请先选择正向调度运单'
          : '暂无可用的正向调度运单，请先完成正向配载后重试'
      )
      return false
    }
    if (mode.value === 'empty') {
      if (!(await validateArtFormForSubmit(emptyFormRef.value))) return false
      saving.value = true
      try {
        await createEmptyReturnTrip(selectedSource.value.id, {
          originStation: emptyReturn.originStation.trim(),
          destinationStation: emptyReturn.destinationStation.trim(),
          remark: normalizeNullableText(emptyReturn.remark)
        })
        emit('success')
        return true
      } catch {
        return false
      } finally {
        saving.value = false
      }
    }
    if (step.value === 0) {
      if (!(await validateArtFormForSubmit(contactFormRef.value))) return false
      if (!form.value.shippingAddressDetail?.trim() || !form.value.receivingAddressDetail?.trim()) {
        ElMessage.warning('请填写返程发货和收货地址')
        return false
      }
      step.value = 1
      return false
    }
    if (step.value === 1) {
      if (!(await configRef.value?.validate())) return false
      step.value = 2
      return false
    }
    if (
      !(form.value.cargoItems ?? []).some(
        (item) => item.cargoName?.trim() && Number(item.quantity) > 0
      )
    ) {
      ElMessage.warning('请至少填写一项有名称和数量的返程货物')
      return false
    }
    if (!(await payableRef.value?.validate())) {
      settlementTab.value = 'payable'
      return false
    }
    if (!(await loadingRef.value?.validate())) {
      settlementTab.value = 'loading'
      return false
    }
    saving.value = true
    try {
      const payload = normalizeOrderPayload({
        form: form.value,
        stationNames: {
          origin: form.value.originStation,
          destination: form.value.destinationStation,
          transfer: form.value.transferStation || undefined
        }
      })
      payload.dispatchDriverId = null
      payload.dispatchVehicleId = null
      await createReturnOrder(source.value.id, selectedSource.value.id, payload)
      emit('success')
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .return-trip-drawer {
    &__form {
      :deep(.el-form-item) {
        margin-bottom: var(--art-space-3);
      }

      :deep(.el-form-item--label-top .el-form-item__label) {
        margin-bottom: var(--art-space-1);
      }
    }
  }
</style>
