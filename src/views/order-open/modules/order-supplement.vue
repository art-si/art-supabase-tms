<template>
  <div>
    <div v-if="showPayable" class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <strong>应付运费</strong>
        <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
          >维护本单应付费用及司机、承运商结算约定。</p
        >
      </div>
      <div class="text-sm"
        >合计（元）<strong class="ml-3 text-lg text-[var(--el-color-primary)]">{{
          total
        }}</strong></div
      >
    </div>
    <ArtForm
      ref="formRef"
      v-model="config"
      :items="items"
      :span="8"
      :gutter="20"
      label-position="top"
    />
  </div>
</template>

<script setup lang="ts">
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { createInitialOrderConfig, moneyValue } from './order-open-model'

  const config = defineModel<Api.Tms.Order.OrderConfig>({ required: true })
  const props = defineProps<{
    section: 'payable' | 'loading'
    canViewAmounts: boolean
    canEditAmounts: boolean
    canViewProof: boolean
    canEditProof: boolean
    resourceTenantId: string
  }>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const methods = useDictionaryOptions('tmsOrderPaymentMethod')
  const payableMethods = computed(() =>
    methods.filter((item) =>
      ['cash', 'monthly', 'collect', 'installments', 'receipt_payment'].includes(item.value)
    )
  )
  const showPayable = computed(() => props.section === 'payable' && props.canViewAmounts)
  const feeFields = [
    ['driverFreight', '应付司机运费'],
    ['carrierFreight', '应付承运商运费'],
    ['tripSubsidy', '单趟补贴'],
    ['freight', '运费'],
    ['operationFee', '操作费'],
    ['commissionFee', '提成费'],
    ['otherFee', '其他费用']
  ] as const
  const total = computed(() =>
    formatCurrencyValue(
      feeFields.reduce((sum, [key]) => sum + moneyValue(config.value.payable?.[key]), 0)
    )
  )
  const items = computed<FormItem[]>(() => {
    if (props.section === 'payable') {
      if (!props.canViewAmounts) return []
      return [
        ...feeFields.map(([key, label]): FormItem => ({
          key: `payable.${key}`,
          label: `${label}（元）`,
          type: 'number',
          props: {
            min: 0,
            precision: 2,
            controlsPosition: 'right',
            class: 'w-full!',
            disabled: !props.canEditAmounts
          }
        })),
        { key: 'payableMethods', label: '应付结算方式', type: 'divider', span: 24 },
        ...(['driver', 'carrier'] as const).map((party): FormItem => ({
          key: `payable.${party}SettlementMethod`,
          label: party === 'driver' ? '应付司机结算方式' : '应付承运商结算方式',
          type: 'select',
          span: 12,
          props: {
            options: payableMethods.value,
            disabled: !props.canEditAmounts,
            placeholder: '请选择付款方式'
          },
          formItemProps: {
            rules: [{ required: true, message: '请选择结算方式', trigger: 'change' }]
          }
        }))
      ]
    }
    const time = (key: string, label: string): FormItem => ({
      key: `loading.${key}`,
      label,
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        class: 'w-full!',
        disabled: !props.canEditProof,
        placeholder: `请选择${label}`
      }
    })
    const weight = (key: string, label: string): FormItem => ({
      key: `loading.${key}`,
      label,
      type: 'number',
      props: { min: 0, precision: 3, class: 'w-full!', disabled: !props.canEditProof }
    })
    const images = (key: string, label: string): FormItem => ({
      key: `loading.${key}`,
      label,
      type: 'uploadFile',
      span: 12,
      hidden: !props.canViewProof,
      props: {
        multiple: true,
        limit: 6,
        accept: '.png,.jpg,.jpeg,.webp,.pdf',
        resourceTenantId: props.resourceTenantId,
        disabled: !props.canEditProof,
        title: `上传${label}`,
        fileSize: 10 * 1024 * 1024
      }
    })
    return [
      { key: 'loadSection', label: '装货信息', type: 'divider', span: 24 },
      time('loadedAt', '装货时间'),
      weight('loadedWeightTon', '装货重量（吨）'),
      images('loadTicketUrls', '装货磅单'),
      images('loadPhotoUrls', '装货照片'),
      { key: 'unloadSection', label: '卸货信息', type: 'divider', span: 24 },
      time('unloadedAt', '卸货时间'),
      weight('unloadedWeightTon', '卸货重量（吨）'),
      images('unloadTicketUrls', '卸货磅单'),
      images('unloadPhotoUrls', '卸货照片'),
      { key: 'signSection', label: '签收信息', type: 'divider', span: 24 },
      time('signedAt', '签收时间'),
      {
        key: 'loading.signerName',
        label: '签收人',
        type: 'input',
        props: { maxlength: 50, disabled: !props.canEditProof }
      },
      {
        key: 'loading.remark',
        label: '备注',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 2,
          maxlength: 500,
          showWordLimit: true,
          disabled: !props.canEditProof
        }
      }
    ]
  })
  watch(
    () => config.value,
    (value) => {
      const defaults = createInitialOrderConfig()
      if (!value.payable || !value.loading)
        config.value = {
          ...defaults,
          ...value,
          payable: { ...defaults.payable, ...value.payable },
          loading: { ...defaults.loading, ...value.loading }
        }
    },
    { immediate: true }
  )
  defineExpose({ validate: () => formRef.value?.validate() ?? Promise.resolve(true) })
</script>
