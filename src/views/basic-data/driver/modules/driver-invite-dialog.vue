<template>
  <ArtDialog ref="dialogRef" size="md">
    <ElAlert
      class="mb-4"
      type="info"
      show-icon
      :closable="false"
      title="先登记手机号，再补齐司机证件资料；扫码注册与微信资料回填将在服务接入后开放。"
    />
    <div v-if="targetInvitation" class="driver-invite__target">
      <div class="driver-invite__target-header">
        <strong>{{ targetInvitation.phone || '手机号已隐藏' }}</strong>
        <ElTag
          :type="targetInvitation.status === 'profile_created' ? 'success' : 'info'"
          effect="light"
        >
          {{ targetInvitation.status === 'profile_created' ? '档案已建立' : '待补充档案' }}
        </ElTag>
      </div>
      <dl class="driver-invite__facts">
        <div
          ><dt>邀请人</dt><dd>{{ targetInvitation.requestedByName || '暂无' }}</dd></div
        >
        <div
          ><dt>登记时间</dt
          ><dd>{{ formatWithDayjs(targetInvitation.requestedAt, 'YYYY-MM-DD HH:mm') }}</dd></div
        >
      </dl>
      <p>证件认证以司机档案中的审核结果为准。</p>
    </div>
    <ArtForm
      v-else
      ref="formRef"
      :model-value="form"
      @update:model-value="replaceReactiveModel(form, $event)"
      :items="items"
      :rules="rules"
      :span="24"
      label-width="100px"
      :show-reset="false"
      :show-submit="false"
    />
    <div v-if="!targetInvitation" class="driver-invite__recent">
      <strong>最近邀请</strong>
      <span v-if="loading">加载中…</span>
      <div v-else-if="error" class="driver-invite__recent-row">
        <span>邀请记录加载失败</span
        ><ElButton link type="primary" @click="loadRecent">重试</ElButton>
      </div>
      <span v-else-if="!recent.length">暂无邀请记录</span>
      <div v-for="item in recent" :key="item.id" class="driver-invite__recent-row">
        <span>{{ item.phone || '手机号已隐藏' }} · {{ item.requestedByName || '邀请人未知' }}</span>
        <span>{{ item.status === 'profile_created' ? '档案已建立' : '待补充档案' }}</span>
      </div>
    </div>
    <template #footer="{ loading: submitLoading, api }">
      <template v-if="targetInvitation"
        ><ElButton type="primary" @click="api.handleClose()">关闭</ElButton></template
      >
      <template v-else>
        <ElButton @click="api.handleClose()">取消</ElButton>
        <ElButton :loading="submitLoading" @click="confirmInvitation('request', api.handleConfirm)"
          >立即添加</ElButton
        >
        <ElButton
          type="primary"
          :loading="submitLoading"
          @click="confirmInvitation('profile', api.handleConfirm)"
          >添加并补充认证资料</ElButton
        >
      </template>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElAlert, ElButton, ElMessage, ElTag, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { formatWithDayjs } from '@/utils/time'
  import { useUserStore } from '@/store/modules/user'
  import {
    createDriverInvitation,
    fetchCarrierOptions,
    fetchDriverInvitation,
    fetchDriverInvitations,
    type DriverInvitation
  } from '@tms/api'

  const emit = defineEmits<{
    (
      event: 'profile',
      data: { phone: string; driverOwnership: string; carrierId: string | null }
    ): void
  }>()
  const { getDictMap } = storeToRefs(useUserStore())
  const dialogRef = ref<ArtDialogExpose<undefined>>()
  const formRef = ref<{ validate: () => Promise<boolean> }>()
  const form = reactive({ phone: '', driverOwnership: 'self', carrierId: '' })
  const recent = ref<DriverInvitation[]>([])
  const targetInvitation = ref<DriverInvitation | null>(null)
  const loading = ref(false)
  const error = ref(false)
  const submitMode = ref<'request' | 'profile'>('request')
  const confirmInvitation = (mode: 'request' | 'profile', handleConfirm: () => void): void => {
    submitMode.value = mode
    handleConfirm()
  }
  const items = computed<FormItem[]>(() => [
    {
      label: '司机手机号',
      key: 'phone',
      type: 'input',
      props: { placeholder: '请输入司机手机号', maxlength: 16 }
    },
    {
      label: '司机归属',
      key: 'driverOwnership',
      type: 'select',
      props: { options: getDictMap.value.tmsDriverOwnership ?? [] }
    },
    {
      label: '所属承运商',
      key: 'carrierId',
      type: 'select',
      hidden: form.driverOwnership !== 'carrier',
      api: fetchCarrierOptions,
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      props: { filterable: true, clearable: true, placeholder: '请选择承运商' }
    }
  ])
  const rules = computed<FormRules>(() => ({
    phone: [
      { required: true, message: '请输入司机手机号', trigger: 'blur' },
      { pattern: /^\+?[0-9]{7,15}$/, message: '请输入有效手机号', trigger: 'blur' }
    ],
    driverOwnership: [{ required: true, message: '请选择司机归属', trigger: 'change' }],
    carrierId:
      form.driverOwnership === 'carrier'
        ? [{ required: true, message: '请选择承运商', trigger: 'change' }]
        : []
  }))

  const loadRecent = async (): Promise<void> => {
    loading.value = true
    error.value = false
    try {
      const result = await fetchDriverInvitations()
      if (result.error) {
        error.value = true
        return
      }
      recent.value = result.data.slice(0, 5)
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }

  const open = async (targetId?: string): Promise<void> => {
    Object.assign(form, { phone: '', driverOwnership: 'self', carrierId: '' })
    targetInvitation.value = null
    if (targetId) {
      const result = await fetchDriverInvitation(targetId)
      if (!result.data) {
        ElMessage.warning('邀请记录不可查看或已不存在，请返回司机列表重试。')
        return
      }
      targetInvitation.value = result.data
    }
    submitMode.value = 'request'
    await dialogRef.value?.handleOpen(undefined, {
      title: targetInvitation.value ? '邀请详情' : '邀请司机',
      subtitle: '登记手机号与归属；认证资料可在司机档案中补齐',
      onOpen: targetInvitation.value ? undefined : loadRecent,
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        const payload = {
          phone: form.phone.trim(),
          driverOwnership: form.driverOwnership,
          carrierId: form.driverOwnership === 'carrier' ? form.carrierId || null : null
        }
        try {
          await createDriverInvitation(payload)
          if (submitMode.value === 'profile') emit('profile', payload)
          return true
        } catch (cause) {
          notifyFriendlyError(cause, '邀请登记失败，请核对手机号后重试')
          return false
        }
      }
    })
  }
  defineExpose({ open })
</script>

<style scoped lang="scss">
  .driver-invite {
    &__recent {
      display: grid;
      gap: 8px;
      margin-top: 16px;
      font-size: 12px;
      color: var(--art-gray-700);
    }

    &__recent strong {
      font-size: 13px;
      color: var(--art-gray-900);
    }

    &__recent-row {
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }

    &__target {
      display: grid;
      gap: 12px;
      font-size: 13px;
      color: var(--art-gray-800);

      &-header {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      strong {
        font-size: 16px;
        color: var(--art-gray-900);
      }

      dl {
        display: grid;
        gap: 10px;
        padding: 12px;
        margin: 0;
        background: var(--art-gray-100);
        border-radius: var(--art-surface-radius);
      }

      dl div {
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }

      dt,
      dd {
        margin: 0;
      }

      dt {
        color: var(--art-gray-600);
      }

      p {
        margin: 0;
        color: var(--art-gray-700);
      }
    }
  }
</style>
