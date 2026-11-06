import { h } from 'vue'
import { ElNotification, ElScrollbar } from 'element-plus'
import type { DispatchPlanResult } from '@tms/api'

/** Non-modal, persistent feedback survives the dispatch dialog closing. */
export function notifyDispatchAdvisories(result: DispatchPlanResult | null | undefined): void {
  const warnings = result?.warnings
  if (!warnings?.length) return
  ElNotification({
    title: '配载已提交 · 风险提醒',
    type: 'warning',
    duration: 0,
    message: h(ElScrollbar, { maxHeight: 320 }, () =>
      h('div', { class: 'grid gap-3 py-2' }, [
        h('p', { class: 'm-0' }, '以下风险仅作提醒，本次配载已完成，请在实际运输前核对。'),
        ...warnings.map((warning) =>
          h('p', { class: 'm-0 break-words' }, [
            warning.executionIndex ? `批次 ${warning.executionIndex} · ` : '',
            `${warning.subjectLabel}：${warning.message}`
          ])
        )
      ])
    )
  })
}
