<template>
  <ArtDrawer ref="drawerRef" :show-footer="false" @closed="close">
    <div class="grid min-w-0 gap-4">
      <ArtEntitySummary
        compact
        icon="ri:shield-check-line"
        title="调度资源综合核验"
        description="汇总 TMS 调度提醒与 VMS 证照风险；核验只读取资料，不提交配载或更改业务状态。"
      />
      <ArtSectionCard
        title="核验结果"
        :subtitle="
          result ? `核验时间：${formatWithDayjs(result.checkedAt)}` : '按当前账号与租户范围读取'
        "
        :loading="loading"
        :error="error"
        error-title="综合核验未完成"
        @retry="load"
      >
        <template #actions>
          <ElButton :loading="loading" @click="load"
            ><ArtSvgIcon icon="ri:refresh-line" />重新核验</ElButton
          >
        </template>
        <div v-if="result" class="grid gap-4">
          <ElAlert
            :closable="false"
            show-icon
            :type="
              result.certificateBlocked ? 'error' : result.advisories.length ? 'warning' : 'success'
            "
            :title="
              result.certificateBlocked
                ? '发现证照风险，请先核实处置'
                : result.advisories.length
                  ? '发现调度提醒，请人工核对'
                  : '本次检查未发现上述两类风险'
            "
            description="该结果不代表已完成配载，也不覆盖运力、线路或其他调度校验。"
          />
          <ElTabs v-model="tab">
            <ElTabPane :label="`调度提醒（${result.advisories.length}）`" name="advisories">
              <ArtEmptyState
                v-if="!result.advisories.length"
                title="未发现调度提醒"
                description="以本次读取到的车辆、司机业务资料为准。"
              />
              <div v-else class="grid gap-3">
                <ElAlert
                  v-for="(item, index) in result.advisories"
                  :key="index"
                  type="warning"
                  show-icon
                  :closable="false"
                  :title="item.subjectLabel"
                  :description="item.message"
                />
              </div>
            </ElTabPane>
            <ElTabPane :label="`证照风险（${result.certificateRisks.length}）`" name="certificates">
              <ArtEmptyState
                v-if="!result.certificateRisks.length"
                title="未发现证照阻断项"
                description="检查包含现有规则覆盖的过期和撤销证照。"
              />
              <div v-else class="grid gap-3">
                <ElAlert
                  v-for="(risk, index) in result.certificateRisks"
                  :key="index"
                  type="error"
                  show-icon
                  :closable="false"
                  :title="`${risk.subjectLabel} · ${risk.riskKind === 'revoked' ? '证照已撤销' : '证照已过期'}`"
                >
                  <p
                    >证照类型：<ArtDictDisplay
                      dict-code="vehicleCertificateType"
                      :value="risk.certificateType"
                      display="text"
                  /></p>
                  <p>{{
                    risk.expiresOn
                      ? `有效期至 ${risk.expiresOn}，请在证照管理中核实。`
                      : '请在证照管理中核实有效状态。'
                  }}</p>
                </ElAlert>
              </div>
            </ElTabPane>
          </ElTabs>
          <p class="break-all text-xs text-g-700">核验编号：{{ result.requestId }}</p>
        </div>
      </ArtSectionCard>
      <a
        v-if="error && workspaceUrl"
        :href="workspaceUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="art-icon-label text-theme"
      >
        <ArtSvgIcon icon="ri:external-link-line" />登录业务集成工作空间
      </a>
    </div>
  </ArtDrawer>
</template>
<script setup lang="ts">
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchDispatchPreflight,
    proTransportIntegrationOrigin,
    type DispatchPreflightInput,
    type DispatchPreflightResult
  } from '@tms/api/modules/dispatch-preflight'

  const drawerRef = ref<ArtDrawerExpose>()
  const input = shallowRef<DispatchPreflightInput>()
  const result = shallowRef<DispatchPreflightResult>()
  const loading = ref(false)
  const error = ref('')
  const tab = ref('advisories')
  let revision = 0
  const tenantScope = useTenantScopeStore()
  watch(
    () => tenantScope.effectiveTenantId,
    () => {
      if (!input.value) return
      revision++
      result.value = undefined
      loading.value = false
      error.value = '租户范围已变化，请在当前范围重新选择资源并核验'
    }
  )
  const workspaceUrl = computed(() => {
    try {
      const target = new URL('/api/auth/login', proTransportIntegrationOrigin())
      target.searchParams.set('returnTo', '/applications')
      target.searchParams.set('force_login', '1')
      return target.href
    } catch {
      return undefined
    }
  })
  async function load(): Promise<void> {
    if (!input.value) return
    const current = ++revision
    loading.value = true
    error.value = ''
    result.value = undefined
    try {
      const data = await fetchDispatchPreflight(input.value)
      if (current === revision) result.value = data
    } catch (cause) {
      if (current === revision)
        error.value = cause instanceof Error ? cause.message : '综合核验失败，请稍后重试'
    } finally {
      if (current === revision) loading.value = false
    }
  }
  function close(): void {
    revision++
    input.value = undefined
    result.value = undefined
    error.value = ''
    loading.value = false
  }
  async function handleOpen(value: DispatchPreflightInput): Promise<void> {
    close()
    input.value = value
    tab.value = 'advisories'
    await drawerRef.value?.handleOpen(value, {
      title: '调度资源综合核验',
      size: 'min(760px, 100vw)',
      showFooter: false,
      onOpen: load
    })
  }
  defineExpose({ handleOpen })
</script>
