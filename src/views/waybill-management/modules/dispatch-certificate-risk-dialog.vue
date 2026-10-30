<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="grid min-w-0 gap-4">
      <ElAlert
        :title="hasRevoked ? '证件已作废，当前配载已拦截' : '证件已过期，当前配载已拦截'"
        :description="
          hasRevoked
            ? '请先登记关联的有效新证。已作废证件不能通过填写原因强制派车。'
            : '请先完成换证。确需派车时，具备证件风险放行权限的人员须填写原因；系统会记录操作人与原因。'
        "
        type="error"
        :closable="false"
        show-icon
      />
      <div class="overflow-hidden rounded-md border border-[var(--el-border-color-light)]">
        <div
          v-for="(risk, index) in risks"
          :key="`${risk.subjectType}-${risk.subjectLabel}-${risk.certificateType}-${index}`"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--el-border-color-lighter)] px-4 py-3 text-sm last:border-b-0"
        >
          <ElTag type="danger" effect="light">{{
            risk.subjectType === 'vehicle' ? '车辆' : '司机'
          }}</ElTag>
          <strong class="text-[var(--el-text-color-primary)]">{{ risk.subjectLabel }}</strong>
          <span class="text-[var(--el-text-color-regular)]">{{ risk.certificateType }}</span>
          <span v-if="risk.certificateNo" class="text-[var(--el-text-color-secondary)]">{{
            risk.certificateNo
          }}</span>
          <span class="ml-auto tabular-nums text-[var(--el-color-danger)]">
            {{
              risk.riskKind === 'revoked'
                ? `${risk.revokedOn || ''} 已作废`
                : `${risk.expiresOn} 到期`
            }}
          </span>
        </div>
      </div>
      <div v-if="allowOverride" class="grid gap-2">
        <label
          for="dispatch-certificate-override-reason"
          class="text-sm font-medium text-[var(--el-text-color-primary)]"
          >强制派车原因 <span class="text-[var(--el-color-danger)]">*</span></label
        >
        <ElInput
          id="dispatch-certificate-override-reason"
          v-model="reason"
          type="textarea"
          :rows="3"
          :maxlength="300"
          show-word-limit
          placeholder="请说明业务必要性、临时处置及后续换证责任（至少 10 字）"
          aria-describedby="dispatch-certificate-override-help"
        />
        <span
          id="dispatch-certificate-override-help"
          class="text-xs text-[var(--el-text-color-secondary)]"
          >确认后将继续本次配载，并记录强制派车审计日志。</span
        >
      </div>
      <ElAlert
        v-else-if="!hasRevoked"
        title="当前账号无强制派车权限，请联系车管完成换证或由有权限的调度负责人处理。"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { ElMessage } from 'element-plus'
  import type { DispatchCertificateRiskCheck } from '@tms/api'

  defineOptions({ name: 'TmsDispatchCertificateRiskDialog' })

  const { hasAuth } = useAuth()
  const dialogRef = ref<ArtDialogExpose<DispatchCertificateRiskCheck>>()
  const risks = ref<DispatchCertificateRiskCheck['risks']>([])
  const reason = ref('')
  const allowOverride = ref(false)
  const hasRevoked = computed(() => risks.value.some((risk) => risk.riskKind === 'revoked'))
  let submitOverride: ((reason: string) => Promise<boolean>) | undefined

  async function handleOpen(
    check: DispatchCertificateRiskCheck,
    onOverride: (reason: string) => Promise<boolean>
  ): Promise<void> {
    risks.value = check.risks
    reason.value = ''
    allowOverride.value =
      !hasRevoked.value &&
      check.canOverride &&
      hasAuth('TmsPendingWaybillList:OverrideCertificateRisk')
    submitOverride = onOverride
    await dialogRef.value?.handleOpen(check, {
      title: hasRevoked.value ? '证件作废 · 派车风险拦截' : '证件过期 · 派车风险拦截',
      subtitle: `${check.risks.length} 项证件风险需处理`,
      confirmText: '记录原因并强制派车',
      showConfirmButton: allowOverride.value,
      cancelText: '返回调整',
      contentMaxHeight: '68vh',
      onConfirm: async () => {
        if (!allowOverride.value || !submitOverride) return false
        if (reason.value.trim().length < 10) {
          ElMessage.warning('请填写至少 10 字的强制派车原因')
          return false
        }
        return await submitOverride(reason.value.trim())
      },
      onReset: () => {
        submitOverride = undefined
      }
    })
  }

  defineExpose({ handleOpen })
</script>
