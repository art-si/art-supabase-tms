<template>
  <ArtPageShell
    class="driver-query-detail"
    :loading="driverLoading"
    loading-mode="skeleton"
    :error="driverError"
    :empty="!driver"
    empty-text="未找到司机档案"
    empty-description="请返回司机综合查询重新选择，或刷新后重试。"
    @retry="loadDriver"
  >
    <ArtPageHeader
      :title="driver?.driverName || '司机综合查询'"
      :subtitle="driver?.carrier?.companyName || '所属承运商待补充'"
      show-back
      @back="goBack"
    />

    <template v-if="driver">
      <div class="mt-4 grid min-w-0 gap-4">
        <ArtSectionCard title="司机档案" subtitle="档案归属与驾驶资质">
          <ArtDescriptions :data="driver" :items="profileItems" :columns="3" />
        </ArtSectionCard>

        <ArtSectionCard
          title="风险关注"
          subtitle="根据驾照有效期、当前页可见资质和待处理记录生成提醒"
          :empty="!riskSignals.length"
          empty-title="当前可见记录暂无提醒"
          empty-description="无权限或尚未关联的数据不计入判断；请结合各区块的权限与分页状态核对。"
        >
          <div class="flex flex-wrap gap-2">
            <ElTag
              v-for="signal in riskSignals"
              :key="signal.label"
              :type="signal.type"
              effect="light"
            >
              {{ signal.label }}
            </ElTag>
          </div>
        </ArtSectionCard>

        <ArtSectionCard
          title="当前出车"
          subtitle="已发车且尚未完成的车辆与订单，独立于下方历史记录分页"
          :loading="currentRelationsLoading"
          :error="currentRelationsError"
          :empty="!currentRelations.length"
          empty-title="当前暂无在运记录"
          empty-description="新运单发车后，会在这里显示对应订单和车辆。"
          @retry="loadCurrentRelations"
        >
          <div class="grid gap-3 lg:grid-cols-2">
            <div
              v-for="relation in currentRelations"
              :key="relation.waybillId || relation.orderId"
              class="grid min-w-0 gap-3 rounded-[var(--el-border-radius-base)] bg-[var(--el-fill-color-light)] p-4 sm:grid-cols-2"
            >
              <div class="min-w-0">
                <span class="text-xs text-[var(--el-text-color-secondary)]">运输订单</span>
                <BusinessRecordLink
                  :label="relation.orderNo"
                  :to="
                    hasAuth('TmsOrderQuery:View')
                      ? `/tms/order-query/detail/${relation.orderId}`
                      : undefined
                  "
                  compact
                />
              </div>
              <div class="min-w-0">
                <span class="text-xs text-[var(--el-text-color-secondary)]">承运车辆</span>
                <BusinessRecordLink
                  :label="relation.plateNo || '待分配'"
                  :to="
                    relation.vehicleId && hasAuth('VehicleQuery:View')
                      ? `/vms/vehicle-query/detail/${relation.vehicleId}`
                      : undefined
                  "
                  compact
                />
              </div>
            </div>
          </div>
          <div v-if="currentRelationTotal > currentRelationPageSize" class="mt-4 flex justify-end">
            <ElPagination
              v-model:current-page="currentRelationPage"
              :page-size="currentRelationPageSize"
              :total="currentRelationTotal"
              layout="total, prev, pager, next"
              @current-change="loadCurrentRelations"
            />
          </div>
        </ArtSectionCard>

        <ArtSectionCard
          v-if="canViewField(driver.fieldAccess, 'identityDocuments')"
          title="司机证件"
          subtitle="仅展示有权查看的身份证和驾驶证影像"
          :empty="!documentImages.length"
          empty-title="暂无证件影像"
          empty-description="请在司机资料中补充身份证或驾驶证影像。"
        >
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="document in documentImages" :key="document.title" class="min-w-0">
              <div class="mb-2 text-sm font-medium">{{ document.title }}</div>
              <ArtUploadImage
                :model-value="document.url"
                :resource-tenant-id="driver.tenantId || ''"
                :title="document.title"
                :limit="1"
                readonly
              />
            </div>
          </div>
        </ArtSectionCard>

        <div class="grid min-w-0 gap-4 xl:grid-cols-2">
          <ArtSectionCard
            title="驾驶资质"
            subtitle="关联员工档案中的资质与到期信息"
            :loading="qualification.loading"
            :error="qualification.error"
            :empty="!qualification.records.length"
            :empty-title="qualificationEmptyTitle"
            :empty-description="qualificationEmptyDescription"
            @retry="loadQualifications"
          >
            <ArtTable
              :data="qualification.records"
              :columns="qualificationColumns"
              :pagination="false"
              row-key="id"
            />
            <ElPagination
              v-if="qualification.total > qualificationPageSize"
              v-model:current-page="qualification.page"
              class="mt-4 flex justify-end"
              :page-size="qualificationPageSize"
              :total="qualification.total"
              layout="total, prev, pager, next"
              @current-change="loadQualifications"
            />
          </ArtSectionCard>

          <ArtSectionCard
            title="培训记录"
            subtitle="关联员工档案中有权查看的职业培训"
            :loading="training.loading"
            :error="training.error"
            :empty="!training.records.length"
            :empty-title="trainingEmptyTitle"
            :empty-description="trainingEmptyDescription"
            @retry="loadTraining"
          >
            <ArtTable
              :data="training.records"
              :columns="trainingColumns"
              :pagination="false"
              row-key="id"
            />
          </ArtSectionCard>
        </div>

        <DriverCompensationPanel v-if="driver.id" :driver-id="driver.id" />

        <ArtSectionCard
          title="关联车辆"
          subtitle="档案分配关系；实际承运车辆以执行记录为准"
          :empty="!driver.assignedVehicles?.length"
          empty-title="暂无关联车辆"
          empty-description="请在司机资料中维护车辆分配。"
        >
          <div class="flex flex-wrap gap-2">
            <BusinessRecordLink
              v-for="vehicle in driver.assignedVehicles"
              :key="vehicle.id"
              :label="vehicle.plateNo"
              :to="
                hasAuth('VehicleQuery:View') ? `/vms/vehicle-query/detail/${vehicle.id}` : undefined
              "
            />
          </div>
        </ArtSectionCard>

        <ArtSectionCard
          title="承运订单与车辆"
          subtitle="按执行运单关联；同一订单可有多车、多司机"
          :loading="relationsLoading"
          :error="relationsError"
          :empty="!relations.length"
          empty-title="暂无承运记录"
          empty-description="该司机尚无可查看的执行运单。"
          @retry="loadRelations"
        >
          <ArtTable
            :data="relations"
            :columns="relationColumns"
            :pagination="false"
            :row-key="relationRowKey"
          />
          <div v-if="relationTotal > relationPageSize" class="mt-4 flex justify-end">
            <ElPagination
              v-model:current-page="relationPage"
              :page-size="relationPageSize"
              :total="relationTotal"
              layout="total, prev, pager, next"
              @current-change="loadRelations"
            />
          </div>
        </ArtSectionCard>

        <div class="grid min-w-0 gap-4 2xl:grid-cols-2">
          <ArtSectionCard
            title="违章扣分"
            subtitle="仅统计已关联该司机且有权核对身份的车辆违章"
            :loading="safety.violation.loading"
            :error="safety.violation.error"
            :empty="!safety.violation.records.length"
            :empty-title="safety.violation.available ? '暂无关联违章' : '暂无查看权限'"
            :empty-description="
              safety.violation.available
                ? '关联司机身份的违章记录会显示在这里。'
                : '需获得车辆违章查看及司机身份字段权限。'
            "
            @retry="loadSafety('violation')"
          >
            <ArtTable
              :data="safety.violation.records"
              :columns="violationColumns"
              :pagination="false"
              row-key="id"
            />
            <ElPagination
              v-if="safety.violation.total > safetyPageSize"
              v-model:current-page="safety.violation.page"
              class="mt-4 flex justify-end"
              :page-size="safetyPageSize"
              :total="safety.violation.total"
              layout="total, prev, pager, next"
              @current-change="loadSafety('violation')"
            />
          </ArtSectionCard>

          <ArtSectionCard
            title="事故记录"
            subtitle="仅统计已关联该司机且有权核对身份的车辆事故"
            :loading="safety.accident.loading"
            :error="safety.accident.error"
            :empty="!safety.accident.records.length"
            :empty-title="safety.accident.available ? '暂无关联事故' : '暂无查看权限'"
            :empty-description="
              safety.accident.available
                ? '关联司机身份的事故记录会显示在这里。'
                : '需获得车辆事故查看及司机信息字段权限。'
            "
            @retry="loadSafety('accident')"
          >
            <ArtTable
              :data="safety.accident.records"
              :columns="accidentColumns"
              :pagination="false"
              row-key="id"
            />
            <ElPagination
              v-if="safety.accident.total > safetyPageSize"
              v-model:current-page="safety.accident.page"
              class="mt-4 flex justify-end"
              :page-size="safetyPageSize"
              :total="safety.accident.total"
              layout="total, prev, pager, next"
              @current-change="loadSafety('accident')"
            />
          </ArtSectionCard>
        </div>

        <MainlineCostsPanel v-if="driver.id" scope="driver" :record-id="driver.id" />
      </div>
    </template>

    <template #empty-action>
      <ElButton type="primary" plain @click="goBack">返回司机综合查询</ElButton>
    </template>
  </ArtPageShell>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import type { ColumnOption } from '@/types'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import MainlineCostsPanel from '@/components/business/mainline-costs-panel/index.vue'
  import DriverCompensationPanel from '../modules/driver-compensation-panel.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { canViewField } from '@/utils/field-permission'
  import { formatWithDayjs } from '@/utils/time'
  import {
    fetchDriverQualificationPage,
    fetchDriverSafetyPage,
    fetchDriverTrainingResult,
    type DriverQualification,
    type DriverSafetyKind,
    type DriverSafetyRecord,
    type DriverTraining
  } from '@/api/driver-mainline'
  import {
    fetchCurrentDriverMainlineRelations,
    fetchTransportMainlineRelations,
    type TransportMainlineRelation
  } from '@/api/transport-mainline'
  import { fetchDriverDetail } from '@tms/api'

  defineOptions({ name: 'TmsDriverQueryDetail' })

  type Driver = Api.Tms.BasicData.Driver
  const route = useRoute()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const driver = ref<Driver>()
  const driverLoading = ref(false)
  const driverError = ref<string | null>(null)
  const relations = ref<TransportMainlineRelation[]>([])
  const currentRelations = ref<TransportMainlineRelation[]>([])
  const currentRelationTotal = ref(0)
  const currentRelationPage = ref(1)
  const currentRelationPageSize = 20
  const currentRelationsLoading = ref(false)
  const currentRelationsError = ref<string | null>(null)
  const relationTotal = ref(0)
  const relationPage = ref(1)
  const relationPageSize = 20
  const relationRowKey = (row: TransportMainlineRelation): string =>
    `${row.orderId}:${row.waybillId || 'pending'}`
  const relationsLoading = ref(false)
  const relationsError = ref<string | null>(null)
  const safetyPageSize = 20
  interface SafetyState {
    records: DriverSafetyRecord[]
    total: number
    available: boolean
    loading: boolean
    error: string | null
    page: number
  }
  const newSafetyState = (): SafetyState => ({
    records: [],
    total: 0,
    available: false,
    loading: false,
    error: null,
    page: 1
  })
  const safety = reactive<Record<DriverSafetyKind, SafetyState>>({
    violation: newSafetyState(),
    accident: newSafetyState()
  })
  const qualificationPageSize = 20
  const qualification = reactive({
    records: [] as DriverQualification[],
    total: 0,
    available: false,
    linkedEmployee: false,
    loading: false,
    error: null as string | null,
    page: 1
  })
  const training = reactive({
    records: [] as DriverTraining[],
    available: false,
    loading: false,
    error: null as string | null
  })
  let requestId = 0
  let relationRequestId = 0
  let currentRelationRequestId = 0

  const documentImages = computed(() => {
    const current = driver.value
    if (!current || !canViewField(current.fieldAccess, 'identityDocuments')) return []
    return [
      { title: '身份证正面', url: current.idCardFrontUrl },
      { title: '身份证反面', url: current.idCardBackUrl },
      { title: '驾驶证正面', url: current.driverLicenseFrontUrl },
      { title: '驾驶证反面', url: current.driverLicenseBackUrl }
    ].filter((item): item is { title: string; url: string } => Boolean(item.url))
  })

  const qualificationEmptyTitle = computed(() => {
    if (!qualification.available) return '暂无查看权限'
    if (!qualification.linkedEmployee) return '未关联员工档案'
    return '暂无资质记录'
  })
  const qualificationEmptyDescription = computed(() => {
    if (!qualification.available) return '需获得人事资质查看权限。'
    if (!qualification.linkedEmployee) return '请先在司机档案关联对应员工。'
    return '请在人事资质管理中维护驾驶资质。'
  })
  const trainingEmptyTitle = computed(() => {
    if (!driver.value?.employeeId) return '未关联员工档案'
    return training.available ? '暂无培训记录' : '暂无查看权限'
  })
  const trainingEmptyDescription = computed(() => {
    if (!driver.value?.employeeId) return '请先在司机档案关联对应员工。'
    return training.available
      ? '请在员工档案中维护职业培训记录。'
      : '需获得员工档案查看及职业经历字段权限。'
  })

  const riskSignals = computed<Array<{ label: string; type: 'danger' | 'warning' }>>(() => {
    const signals: Array<{ label: string; type: 'danger' | 'warning' }> = []
    const expiry = driver.value?.licenseExpireDate
    if (expiry && dayjs(expiry).isValid()) {
      const days = dayjs(expiry).startOf('day').diff(dayjs().startOf('day'), 'day')
      if (days < 0) signals.push({ label: '驾照已到期', type: 'danger' })
      else if (days <= 30) signals.push({ label: `驾照 ${days} 天后到期`, type: 'warning' })
    }
    const expiringQualifications = qualification.records.filter((record) => {
      if (!record.expiryDate || !dayjs(record.expiryDate).isValid()) return false
      return dayjs(record.expiryDate).startOf('day').diff(dayjs().startOf('day'), 'day') <= 30
    }).length
    if (qualification.available && expiringQualifications) {
      signals.push({
        label: `当前页 ${expiringQualifications} 项资质已到期或临近到期`,
        type: 'warning'
      })
    }
    for (const kind of ['violation', 'accident'] as const) {
      const state = safety[kind]
      if (!state.available) continue
      const pending = state.records.filter((record) => !record.processed).length
      if (pending) {
        signals.push({
          label: `当前页 ${pending} 条${kind === 'violation' ? '违章' : '事故'}待处理`,
          type: 'warning'
        })
      }
    }
    return signals
  })
  const profileItems = computed<ArtDescriptionItem<Driver>[]>(() => {
    const access = driver.value?.fieldAccess
    return [
      { key: 'name', label: '司机姓名', field: 'driverName' },
      {
        key: 'carrier',
        label: '所属承运商',
        value: (row: Driver) => row.carrier?.companyName || '—'
      },
      { key: 'type', label: '司机类型', field: 'driverType', dictCode: 'tmsDriverType' },
      { key: 'license', label: '驾照类型', field: 'licenseType', dictCode: 'tmsDriverLicenseType' },
      { key: 'expiry', label: '驾照到期', field: 'licenseExpireDate' },
      {
        key: 'status',
        label: '状态',
        value: (row: Driver) =>
          row.enabled === undefined ? '' : row.enabled ? 'enabled' : 'disabled',
        dictCode: 'commonEnabledStatus'
      },
      ...(canViewField(access, 'contactPhone')
        ? [{ key: 'phone', label: '联系电话', field: 'phone' }]
        : []),
      ...(canViewField(access, 'idCardNo')
        ? [{ key: 'idCard', label: '身份证号', field: 'idCardNo' }]
        : []),
      ...(canViewField(access, 'homeAddress')
        ? [{ key: 'address', label: '家庭住址', field: 'homeAddress' }]
        : []),
      ...(canViewField(access, 'emergencyContact')
        ? [
            { key: 'emergencyName', label: '紧急联系人', field: 'emergencyContactName' },
            { key: 'emergencyPhone', label: '紧急联系电话', field: 'emergencyContactPhone' }
          ]
        : [])
    ]
  })

  const relationColumns: ColumnOption<TransportMainlineRelation>[] = [
    {
      prop: 'orderNo',
      label: '运输订单',
      minWidth: 180,
      fixed: 'left',
      formatter: (row) => (
        <BusinessRecordLink
          label={row.orderNo}
          to={
            row.orderId && hasAuth('TmsOrderQuery:View')
              ? `/tms/order-query/detail/${row.orderId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'waybillNo',
      label: '执行运单',
      minWidth: 170,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.waybillNo || '待生成执行运单'}
          to={
            row.waybillId && hasAuth('TmsLoadedWaybillList:View')
              ? `/tms/waybill-management/detail/${row.waybillId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'plateNo',
      label: '承运车辆',
      minWidth: 150,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.plateNo || '待分配'}
          to={
            row.vehicleId && hasAuth('VehicleQuery:View')
              ? `/vms/vehicle-query/detail/${row.vehicleId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'waybillStatus',
      label: '运单状态',
      width: 115,
      dict: { code: 'tmsWaybillStatus', display: 'tag' }
    },
    {
      prop: 'departedAt',
      label: '发车时间',
      width: 175,
      formatter: (row) => (row.departedAt ? formatWithDayjs(row.departedAt) : '—')
    },
    {
      prop: 'completedAt',
      label: '完成时间',
      width: 175,
      formatter: (row) => (row.completedAt ? formatWithDayjs(row.completedAt) : '—')
    }
  ]

  const safetyVehicleColumn: ColumnOption<DriverSafetyRecord> = {
    prop: 'plateNo',
    label: '车辆',
    minWidth: 125,
    formatter: (row) => (
      <BusinessRecordLink
        label={row.plateNo}
        to={
          row.vehicleId && hasAuth('VehicleQuery:View')
            ? `/vms/vehicle-query/detail/${row.vehicleId}`
            : undefined
        }
        compact
      />
    )
  }
  const safetyProcessedColumn: ColumnOption<DriverSafetyRecord> = {
    prop: 'processed',
    label: '处理状态',
    width: 110,
    dict: { code: 'vehicleRecordProcessed', display: 'auto', value: (row) => String(row.processed) }
  }
  const violationColumns: ColumnOption<DriverSafetyRecord>[] = [
    safetyVehicleColumn,
    {
      prop: 'occurredAt',
      label: '违章时间',
      minWidth: 160,
      formatter: (row) => formatWithDayjs(row.occurredAt)
    },
    { prop: 'summary', label: '违章行为', minWidth: 170, formatter: (row) => row.summary || '—' },
    {
      prop: 'penaltyPoints',
      label: '扣分',
      width: 85,
      formatter: (row) => row.penaltyPoints ?? '—'
    },
    safetyProcessedColumn
  ]
  const accidentColumns: ColumnOption<DriverSafetyRecord>[] = [
    safetyVehicleColumn,
    {
      prop: 'occurredAt',
      label: '事故时间',
      minWidth: 160,
      formatter: (row) => formatWithDayjs(row.occurredAt)
    },
    { prop: 'summary', label: '事故概况', minWidth: 170, formatter: (row) => row.summary || '—' },
    {
      prop: 'damageLevel',
      label: '损失等级',
      minWidth: 100,
      formatter: (row) => row.damageLevel || '—'
    },
    safetyProcessedColumn
  ]
  const qualificationColumns: ColumnOption<DriverQualification>[] = [
    { prop: 'name', label: '资质名称', minWidth: 160 },
    {
      prop: 'status',
      label: '有效状态',
      minWidth: 100,
      dict: { code: 'hrQualificationStatus', display: 'auto' }
    },
    {
      prop: 'verificationStatus',
      label: '核验状态',
      minWidth: 110,
      dict: { code: 'hrQualificationVerificationStatus', display: 'auto' }
    },
    {
      prop: 'expiryDate',
      label: '到期日',
      minWidth: 125,
      formatter: (row) => row.expiryDate || '—'
    }
  ]
  const trainingColumns: ColumnOption<DriverTraining>[] = [
    { prop: 'name', label: '培训名称', minWidth: 170 },
    {
      prop: 'startDate',
      label: '开始日期',
      minWidth: 120,
      formatter: (row) => row.startDate || '—'
    },
    { prop: 'endDate', label: '结束日期', minWidth: 120, formatter: (row) => row.endDate || '—' },
    { prop: 'result', label: '培训结果', minWidth: 120, formatter: (row) => row.result || '—' }
  ]

  const loadDriver = async (): Promise<void> => {
    const id = String(route.params.id || '')
    if (!id) {
      driverError.value = '缺少司机档案标识，请返回列表重新选择。'
      return
    }
    const current = ++requestId
    driverLoading.value = true
    driverError.value = null
    try {
      const result = await fetchDriverDetail(id, { showErrorMessage: false })
      if (current !== requestId) return
      if (result.error) throw result.error
      driver.value = result.data ?? undefined
      if (driver.value) {
        void Promise.all([
          loadCurrentRelations(),
          loadRelations(),
          loadQualifications(),
          loadTraining(),
          loadSafety('violation'),
          loadSafety('accident')
        ])
      }
    } catch {
      if (current === requestId) {
        driver.value = undefined
        driverError.value = '司机档案加载失败，请重试。'
      }
    } finally {
      if (current === requestId) driverLoading.value = false
    }
  }

  const loadRelations = async (): Promise<void> => {
    const driverId = driver.value?.id
    if (!driverId) return
    const current = ++relationRequestId
    relationsLoading.value = true
    relationsError.value = null
    try {
      const from = (relationPage.value - 1) * relationPageSize
      const result = await fetchTransportMainlineRelations({
        driverId,
        from,
        to: from + relationPageSize - 1
      })
      if (current !== relationRequestId || driver.value?.id !== driverId) return
      relations.value = result.data
      relationTotal.value = result.total
    } catch {
      if (current === relationRequestId && driver.value?.id === driverId) {
        relationsError.value = '承运记录加载失败，请重试。'
      }
    } finally {
      if (current === relationRequestId && driver.value?.id === driverId) {
        relationsLoading.value = false
      }
    }
  }

  const loadCurrentRelations = async (): Promise<void> => {
    const driverId = driver.value?.id
    if (!driverId) return
    const current = ++currentRelationRequestId
    currentRelationsLoading.value = true
    currentRelationsError.value = null
    try {
      const from = (currentRelationPage.value - 1) * currentRelationPageSize
      const result = await fetchCurrentDriverMainlineRelations(
        driverId,
        from,
        from + currentRelationPageSize - 1
      )
      if (current !== currentRelationRequestId || driver.value?.id !== driverId) return
      currentRelations.value = result.data
      currentRelationTotal.value = result.total
    } catch {
      if (current === currentRelationRequestId && driver.value?.id === driverId) {
        currentRelationsError.value = '当前出车加载失败，请重试。'
      }
    } finally {
      if (current === currentRelationRequestId && driver.value?.id === driverId) {
        currentRelationsLoading.value = false
      }
    }
  }

  const loadSafety = async (kind: DriverSafetyKind): Promise<void> => {
    const driverId = driver.value?.id
    if (!driverId) return
    const state = safety[kind]
    state.loading = true
    state.error = null
    try {
      const from = (state.page - 1) * safetyPageSize
      const result = await fetchDriverSafetyPage(driverId, kind, from, from + safetyPageSize - 1)
      if (driver.value?.id !== driverId) return
      state.records = result.data
      state.total = result.total
      state.available = result.available
    } catch {
      if (driver.value?.id === driverId) state.error = '安全记录加载失败，请重试。'
    } finally {
      if (driver.value?.id === driverId) state.loading = false
    }
  }

  const loadQualifications = async (): Promise<void> => {
    const driverId = driver.value?.id
    if (!driverId) return
    qualification.loading = true
    qualification.error = null
    try {
      const from = (qualification.page - 1) * qualificationPageSize
      const result = await fetchDriverQualificationPage(
        driverId,
        from,
        from + qualificationPageSize - 1
      )
      if (driver.value?.id !== driverId) return
      qualification.records = result.data
      qualification.total = result.total
      qualification.available = result.available
      qualification.linkedEmployee = result.linkedEmployee
    } catch {
      if (driver.value?.id === driverId) qualification.error = '司机资质加载失败，请重试。'
    } finally {
      if (driver.value?.id === driverId) qualification.loading = false
    }
  }

  const loadTraining = async (): Promise<void> => {
    const employeeId = driver.value?.employeeId
    if (!employeeId || !hasAuth('Hr:Employee:View')) return
    training.loading = true
    training.error = null
    try {
      const result = await fetchDriverTrainingResult(employeeId)
      if (driver.value?.employeeId !== employeeId) return
      training.records = result.data
      training.available = result.available
    } catch {
      if (driver.value?.employeeId === employeeId) training.error = '培训记录加载失败，请重试。'
    } finally {
      if (driver.value?.employeeId === employeeId) training.loading = false
    }
  }

  const goBack = (): void => {
    void router.push('/tms/driver-query')
  }
  watch(
    () => route.params.id,
    () => {
      currentRelationPage.value = 1
      currentRelations.value = []
      currentRelationTotal.value = 0
      currentRelationRequestId++
      relationPage.value = 1
      relations.value = []
      relationRequestId++
      safety.violation = newSafetyState()
      safety.accident = newSafetyState()
      qualification.records = []
      qualification.total = 0
      qualification.available = false
      qualification.linkedEmployee = false
      qualification.page = 1
      training.records = []
      training.available = false
      void loadDriver()
    },
    { immediate: true }
  )
</script>

<style scoped>
  .driver-query-detail {
    min-width: 0;
    padding: var(--art-space-4);
    background: var(--default-box-color);
  }
</style>
