import { computed, h, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import type { FormRules } from 'element-plus'
import type { FormItem } from '@/components/core/forms/art-form/index.vue'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
import { useAmapDrivingEstimate } from '@/hooks/core/useAmapDrivingEstimate'
import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
import { normalizeCoordinatePair } from '@/utils/geo'
import { fetchPriceContractOptions } from '@tms/api'

interface AgreementTerms {
  id?: string
  tenantId?: string
  customerId?: string | null
  carrierId?: string | null
  contractId?: string | null
  contract?: { id: string; contractNo: string; contractName: string } | null
  agreementStatus?: string
  effectiveFrom?: string | null
  effectiveTo?: string | null
  distanceKm?: number | string | null
  shippingLongitude?: number | string | null
  shippingLatitude?: number | string | null
  receivingLongitude?: number | string | null
  receivingLatitude?: number | string | null
}

export function useAgreementPriceTerms(
  kind: 'customer' | 'carrier',
  form: Ref<AgreementTerms>,
  loading: Ref<boolean>,
  canEditAddress: () => boolean
) {
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const statuses = useDictionaryOptions('tmsPriceAgreementStatus')
  const { estimateDrivingRoute } = useAmapDrivingEstimate()
  const configItems = shallowRef<FormItem[]>([])
  const configRules = shallowRef<FormRules>({})
  const distanceLoading = ref(false)
  const distanceHint = ref('地图选点后自动估算驾车距离，也可手工填写。')
  let request = 0
  let manualRevision = 0
  const resourceTenantId = computed(() => form.value.tenantId || defaultWriteTenantId.value || '')
  const subjectId = computed(
    () => (kind === 'customer' ? form.value.customerId : form.value.carrierId) || ''
  )
  const contractApi = computed(() => {
    const subject = subjectId.value
    const tenantId = resourceTenantId.value
    return async (params: DataSelectFetchParams) => {
      if (!subject) return { data: [], total: 0 }
      return fetchPriceContractOptions({ kind, subjectId: subject, tenantId, ...params })
    }
  })
  const agreementItems = computed<FormItem[]>(() => [
    {
      key: 'contractId',
      label: '关联合同',
      type: 'dataSelect',
      span: 12,
      description: '选填；未关联合同代表临时报价。',
      props: {
        apiFn: contractApi.value,
        mode: 'table',
        rowKey: 'id',
        labelKey: 'contractName',
        descriptionKey: 'contractNo',
        selectedData: form.value.contract ? [form.value.contract] : [],
        title: '参选关联合同',
        placeholder: subjectId.value
          ? '选择关联合同（可为空）'
          : `请先选择${kind === 'customer' ? '客户' : '承运商'}`,
        disabled: !subjectId.value,
        showPagination: true,
        showTableHeader: true,
        columns: [
          { prop: 'contractNo', label: '合同编号', minWidth: 160 },
          { prop: 'contractName', label: '合同名称', minWidth: 200 },
          {
            prop: 'contractStatus',
            label: '合同状态',
            width: 110,
            dict: { code: 'tmsContractStatus' }
          },
          { prop: 'effectiveDate', label: '生效日期', minWidth: 120 },
          { prop: 'expiryDate', label: '到期日期', minWidth: 120 }
        ],
        onChange: (_value: unknown, rows: NonNullable<AgreementTerms['contract']>[]) => {
          form.value.contract = rows[0] || null
        }
      }
    },
    { key: 'agreementStatus', label: '协议状态', type: 'select', span: 12, options: statuses },
    {
      key: 'effectiveFrom',
      label: '生效日期',
      type: 'date',
      span: 12,
      props: { valueFormat: 'YYYY-MM-DD', clearable: true, class: 'w-full!' }
    },
    {
      key: 'effectiveTo',
      label: '失效日期',
      type: 'date',
      span: 12,
      props: { valueFormat: 'YYYY-MM-DD', clearable: true, class: 'w-full!' }
    },
    {
      key: 'distanceKm',
      label: () => h('strong', '预估公里数'),
      type: canEditAddress() ? 'number' : 'input',
      span: 12,
      description: distanceHint.value,
      props: {
        min: 0,
        precision: 2,
        controls: false,
        class: 'w-full! font-semibold',
        disabled: !canEditAddress(),
        onChange: () => {
          manualRevision++
          distanceHint.value = '已手工修改；下次更换收发货地址后重新估算。'
        }
      }
    }
  ])
  const agreementRules = computed<FormRules>(() => ({
    agreementStatus: [{ required: true, message: '请选择协议状态', trigger: 'change' }],
    effectiveTo: [
      {
        validator: (_rule, _value, callback) =>
          callback(
            form.value.effectiveFrom &&
              form.value.effectiveTo &&
              form.value.effectiveTo < form.value.effectiveFrom
              ? new Error('失效日期不能早于生效日期')
              : undefined
          ),
        trigger: 'change'
      }
    ]
  }))
  async function calculateDistance(): Promise<void> {
    const current = ++request
    const manual = manualRevision
    const origin = normalizeCoordinatePair(
      form.value.shippingLongitude,
      form.value.shippingLatitude
    )
    const destination = normalizeCoordinatePair(
      form.value.receivingLongitude,
      form.value.receivingLatitude
    )
    if (!origin || !destination) {
      distanceLoading.value = false
      distanceHint.value = '收发货地址缺少地图坐标，请地图选点或手工填写公里数。'
      return
    }
    distanceLoading.value = true
    distanceHint.value = '正在估算驾车距离；您仍可手工填写。'
    try {
      const result = await estimateDrivingRoute(origin, destination)
      if (current !== request || manual !== manualRevision) return
      form.value.distanceKm = result.distanceKm
      distanceHint.value = '已根据收发货地址估算驾车距离，可手工修改。'
    } catch {
      if (current === request && manual === manualRevision)
        distanceHint.value = '驾车距离估算失败，可重新计算或手工填写。'
    } finally {
      if (current === request) distanceLoading.value = false
    }
  }
  watch(
    () => [
      form.value.id,
      form.value.tenantId,
      form.value.shippingLongitude,
      form.value.shippingLatitude,
      form.value.receivingLongitude,
      form.value.receivingLatitude
    ],
    () => {
      request++
      distanceLoading.value = false
      if (!loading.value && canEditAddress()) {
        form.value.distanceKm = null
        void calculateDistance()
      }
    }
  )
  watch(subjectId, (value, previous) => {
    if (!loading.value && value !== previous) {
      form.value.contractId = null
      form.value.contract = null
    }
  })
  onBeforeUnmount(() => {
    request++
  })
  const handleConfigSchema = (items: FormItem[], rules: FormRules): void => {
    configItems.value = items
    configRules.value = rules
  }
  return {
    agreementItems,
    agreementRules,
    configItems,
    configRules,
    handleConfigSchema,
    resourceTenantId,
    calculateDistance,
    distanceLoading
  }
}
