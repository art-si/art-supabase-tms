import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import DispatchDialog from '@tms/views/waybill-management/modules/dispatch-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const order = {
  id: '22222222-2222-4222-8222-222222222222',
  tenantId,
  orderNo: 'TEST-DISPATCH-001'
} as Api.Tms.Waybill.WaybillRecord

const Preview = defineComponent({
  setup() {
    const dialog = ref<{
      handleOpen: (data: { rows: (typeof order)[]; mode: 'single' }) => Promise<void>
    }>()
    return () =>
      h('main', { class: 'min-h-screen bg-[var(--el-bg-color-page)] p-6' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => dialog.value?.handleOpen({ rows: [order], mode: 'single' })
          },
          '打开调度配载'
        ),
        h(DispatchDialog, { ref: dialog })
      ])
  }
})

const app = createApp(Preview)
app.use(store)
const dictionary = (code: string, entries: Array<[string, string]>) =>
  entries.map(([value, label]) => ({ code, name: label, value, label, status: '1' }))
useUserStore().setDictMap({
  tmsDispatchOperatorMode: dictionary('tmsDispatchOperatorMode', [
    ['carrier', '承运方'],
    ['self_operated', '自营司机'],
    ['individual_driver', '个体司机']
  ]),
  tmsDriverOwnership: dictionary('tmsDriverOwnership', [
    ['self', '自营'],
    ['individual', '个体'],
    ['carrier', '承运商']
  ]),
  tmsDriverType: dictionary('tmsDriverType', [
    ['primary', '主驾'],
    ['secondary', '副驾']
  ]),
  tmsDriverAuthStatus: dictionary('tmsDriverAuthStatus', [
    ['verified', '已认证'],
    ['unverified', '未认证']
  ]),
  tmsTransportAgreementStatus: dictionary('tmsTransportAgreementStatus', [
    ['signed', '已签署'],
    ['pending_signed', '待签署']
  ])
})
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#dispatch-candidate-selector-preview')
