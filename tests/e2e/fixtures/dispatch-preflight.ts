import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTheme } from '@/hooks/core/useTheme'
import DispatchAdvisoryNotice from '@tms/views/waybill-management/modules/dispatch-advisory-notice.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(
  defineComponent({
    setup: () => {
      useTheme()
      return () =>
        h('main', { class: 'min-h-screen bg-[var(--el-bg-color-page)] p-6' }, [
          h('h1', { class: 'mb-4 text-lg font-semibold' }, '配载调度 · 综合核验验收'),
          h(DispatchAdvisoryNotice, {
            orderId: '22222222-2222-4222-8222-222222222222',
            orderTenantId: '55555555-5555-4555-8555-555555555555',
            vehicleId: '33333333-3333-4333-8333-333333333333',
            driverId: '44444444-4444-4444-8444-444444444444'
          })
        ])
    }
  })
)
app.use(store)
useUserStore().setUserInfo({
  userId: '11111111-1111-4111-8111-111111111111',
  authUserId: '11111111-1111-4111-8111-111111111111',
  tenantId: '55555555-5555-4555-8555-555555555555',
  platformSuper: !new URLSearchParams(window.location.search).has('readonly')
})
useUserStore().setDictMap({
  vehicleCertificateType: [
    {
      code: 'vehicleCertificateType',
      name: '道路运输证',
      value: 'road_transport',
      label: '道路运输证',
      status: '1'
    }
  ]
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'TmsPendingWaybillList', component: { template: '<div />' } }]
})
app.use(router)
app.use(language)
setupGlobDirectives(app)
app.mount('#app')
