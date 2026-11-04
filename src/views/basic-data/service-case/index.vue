<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="SERVICE CASES"
      title="投诉咨询"
      description="统一受理运输服务反馈，按服务单号、运单与问题类型追踪处理状态。"
      icon="ri:customer-service-2-line"
      :tags="[
        { label: '按月自动编号', type: 'primary' },
        { label: '状态可追踪', type: 'info' }
      ]"
    >
      <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
    </BusinessWorkspaceHeader>
    <ArtTableQuery
      ref="tableRef"
      v-model="search"
      :search-items="searchItems"
      :api-fn="fetchTable"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 8, labelWidth: 82, showExpand: true, defaultExpanded: false }"
      :table-props="{
        rowKey: 'id',
        emptyText: '暂无投诉咨询',
        emptyDescription: '新增一条投诉或咨询后，可在此跟踪处理状态。'
      }"
      focusable
    />
    <ServiceCaseDialog ref="formDialogRef" @success="refresh" />
    <ArtDialog
      ref="detailDialogRef"
      size="xl"
      :show-footer="false"
      @open="
        () => {
          activeDetailTab = 'base'
        }
      "
    >
      <template v-if="detail">
        <ElTabs v-model="activeDetailTab">
          <ElTabPane name="base" label="基础信息">
            <ArtDescriptions :data="detail" :items="baseDetailItems" :columns="3" />
          </ElTabPane>
          <ElTabPane name="content" label="内容与处理">
            <ArtDescriptions :data="detail" :items="contentDetailItems" :columns="1" />
            <ArtSectionTitle class="mt-5">附件</ArtSectionTitle>
            <ArtUploadFile
              v-if="detail.attachments.length"
              :model-value="detail.attachments"
              :file-names="attachmentNames"
              title="附件"
              :limit="10"
              multiple
              readonly
            />
            <ArtEmptyState
              v-else
              title="暂无附件"
              description="补充案例附件后，可在此预览。"
              :visual-size="72"
              size="compact"
            />
          </ElTabPane>
          <ElTabPane name="conversation" label="沟通记录">
            <div
              v-if="repliesLoading"
              class="py-6 text-center text-sm text-[var(--el-text-color-secondary)]"
              >正在加载沟通记录…</div
            >
            <div v-else-if="repliesError" class="flex items-center gap-3 py-6 text-sm">
              <span>{{ repliesError }}</span
              ><ElButton link type="primary" @click="loadReplies">重试</ElButton>
            </div>
            <ElScrollbar v-else max-height="320px" class="mb-5">
              <div v-if="replies.length" class="space-y-3 pr-2">
                <article
                  v-for="reply in replies"
                  :key="reply.id"
                  class="rounded-md border border-[var(--el-border-color-light)] p-4"
                >
                  <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <strong class="text-[var(--el-text-color-primary)]">{{
                      reply.authorName
                    }}</strong>
                    <span class="text-[var(--el-text-color-secondary)]">{{
                      formatWithDayjs(reply.createTime, 'YYYY-MM-DD HH:mm')
                    }}</span>
                    <span v-if="reply.replyToId" class="text-[var(--el-text-color-secondary)]"
                      >回复上一条沟通</span
                    >
                  </div>
                  <p
                    class="whitespace-pre-wrap break-words text-sm text-[var(--el-text-color-regular)]"
                    >{{ reply.content }}</p
                  >
                  <div v-if="reply.mentions.length" class="mt-2 flex flex-wrap gap-2">
                    <ElTag
                      v-for="mention in reply.mentions"
                      :key="`${mention.kind}:${mention.id}`"
                      size="small"
                      effect="plain"
                      >@{{ mention.label }}</ElTag
                    >
                  </div>
                  <ArtUploadFile
                    v-if="reply.attachments.length"
                    class="mt-3"
                    :model-value="reply.attachments"
                    :file-names="attachmentNames"
                    title="回复附件"
                    :limit="10"
                    multiple
                    readonly
                  />
                  <ElButton
                    v-auth="'TmsServiceCase:Reply'"
                    class="mt-2"
                    link
                    type="primary"
                    @click="replyTo = reply"
                    >回复</ElButton
                  >
                </article>
              </div>
              <ArtEmptyState
                v-else
                title="暂无沟通记录"
                description="可回复这条服务单，补充处理过程和附件。"
                :visual-size="72"
                size="compact"
              />
            </ElScrollbar>
            <div
              v-if="hasAuth('TmsServiceCase:Reply')"
              class="border-t border-[var(--el-border-color-light)] pt-4"
            >
              <div
                v-if="replyTo"
                class="mb-3 flex items-center gap-2 text-sm text-[var(--el-text-color-secondary)]"
              >
                <span>回复 {{ replyTo.authorName }}</span
                ><ElButton link @click="replyTo = null">取消引用</ElButton>
              </div>
              <ArtForm
                ref="replyFormRef"
                v-model="replyForm"
                :items="replyItems"
                :rules="replyRules"
                :span="12"
                :gutter="16"
                label-width="100px"
              />
              <div class="mt-3 flex justify-end"
                ><ElButton
                  type="primary"
                  :loading="replySaving"
                  :disabled="!!mentionOptionsError"
                  v-auth="'TmsServiceCase:Reply'"
                  @click="submitReply"
                  >发送回复</ElButton
                ></div
              >
              <p v-if="mentionOptionsError" class="mt-2 text-sm text-[var(--el-color-danger)]"
                >{{ mentionOptionsError }}
                <ElButton link type="primary" @click="loadMentionOptions">重试</ElButton></p
              >
            </div>
          </ElTabPane>
        </ElTabs>
      </template>
    </ArtDialog>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import type { MasterDataDeleteGuardOpenOptions } from '@/components/business/master-data-delete-guard/index.vue'

  import { storeToRefs } from 'pinia'
  import { uniq } from 'lodash-es'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { FormRules } from 'element-plus'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import { fetchAttachmentDisplayNames } from '@/api/attachments'
  import { getFileExtension } from '@/utils/file/attachment'
  import {
    deleteTmsBasicRecords,
    addServiceCaseReply,
    fetchServiceCaseReplies,
    fetchServiceCaseReplyDependencies,
    fetchServiceCaseMentionOptions,
    fetchServiceCaseList,
    fetchServiceCaseWaybillOptions,
    type ServiceCaseWaybillOption,
    type ServiceCaseReply,
    type ServiceCaseMention,
    type ServiceCaseRecord,
    type ServiceCaseSearch
  } from '@tms/api'
  import ServiceCaseDialog from './modules/service-case-dialog.vue'

  defineOptions({ name: 'TmsServiceCase' })

  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { getDictMap } = storeToRefs(userStore)
  const tableRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard('tms_service_case', '投诉咨询记录')
  const route = useRoute()
  const formDialogRef = ref<InstanceType<typeof ServiceCaseDialog>>()
  const detailDialogRef = ref<ArtDialogExpose<ServiceCaseRecord>>()
  const detail = ref<ServiceCaseRecord>()
  const detailWaybill = ref<ServiceCaseWaybillOption>()
  const detailWaybillError = ref(false)
  const replies = ref<ServiceCaseReply[]>([])
  const attachmentNames = ref<Record<string, string>>({})
  const repliesLoading = ref(false)
  const repliesError = ref('')
  const replyTo = ref<ServiceCaseReply | null>(null)
  const replySaving = ref(false)
  const replyFormRef = ref<InstanceType<typeof ArtForm>>()
  interface ReplyForm {
    content: string
    attachments: string[]
    userIds: string[]
    organizationIds: string[]
    roleIds: string[]
  }
  const emptyReplyForm = (): ReplyForm => ({
    content: '',
    attachments: [],
    userIds: [],
    organizationIds: [],
    roleIds: []
  })
  const replyForm = ref<ReplyForm>(emptyReplyForm())
  type MentionOption = { label: string; value: string }
  const mentionOptions = ref<{
    users: MentionOption[]
    organizations: MentionOption[]
    roles: MentionOption[]
  }>({ users: [], organizations: [], roles: [] })
  const mentionOptionsError = ref('')
  const replyRules: FormRules<ReplyForm> = {
    content: [{ required: true, message: '请输入回复内容', trigger: 'blur' }]
  }
  const replyItems = computed<FormItem[]>(() => [
    {
      key: 'content',
      label: '回复内容',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 3000,
        showWordLimit: true,
        placeholder: '记录处理过程或回复内容'
      }
    },
    {
      key: 'userIds',
      label: '@用户',
      type: 'select',
      props: {
        options: mentionOptions.value.users,
        multiple: true,
        filterable: true,
        clearable: true,
        collapseTags: true,
        placeholder: '选择要提及的用户'
      }
    },
    {
      key: 'organizationIds',
      label: '@部门',
      type: 'select',
      props: {
        options: mentionOptions.value.organizations,
        multiple: true,
        filterable: true,
        clearable: true,
        collapseTags: true,
        placeholder: '选择要提及的部门'
      }
    },
    {
      key: 'roleIds',
      label: '@角色',
      type: 'select',
      props: {
        options: mentionOptions.value.roles,
        multiple: true,
        filterable: true,
        clearable: true,
        collapseTags: true,
        placeholder: '选择要提及的角色'
      }
    },
    {
      key: 'attachments',
      label: '附件和图片',
      type: 'uploadFile',
      span: 24,
      props: {
        resourceTenantId: detail.value?.tenantId || '',
        title: '选择或拖入附件、图片',
        limit: 10,
        multiple: true,
        fileSize: 10 * 1024 * 1024
      }
    }
  ])
  let detailRevision = 0
  const loadReplies = async (): Promise<void> => {
    const current = detail.value
    if (!current) return
    const revision = ++detailRevision
    repliesLoading.value = true
    repliesError.value = ''
    try {
      const result = await fetchServiceCaseReplies(current.id, current.tenantId)
      if (result.error) throw result.error
      const rows = result.data ?? []
      const urls = uniq([...current.attachments, ...rows.flatMap((reply) => reply.attachments)])
      const names = Object.fromEntries(
        urls.map((url, index) => [url, `附件 ${index + 1}.${getFileExtension(url) || '文件'}`])
      )
      try {
        Object.assign(names, await fetchAttachmentDisplayNames(urls, current.tenantId))
      } catch (error) {
        if (revision === detailRevision)
          notifyFriendlyError(error, '附件原文件名暂不可用，已按序号显示', 'warning')
      }
      if (revision === detailRevision) {
        attachmentNames.value = names
        replies.value = rows
      }
    } catch {
      if (revision === detailRevision) repliesError.value = '沟通记录加载失败，请重试。'
    } finally {
      if (revision === detailRevision) repliesLoading.value = false
    }
  }
  const loadMentionOptions = async (): Promise<void> => {
    const current = detail.value
    if (!current) return
    mentionOptionsError.value = ''
    try {
      const options = await fetchServiceCaseMentionOptions(current.id)
      if (detail.value?.id === current.id) mentionOptions.value = options
    } catch {
      if (detail.value?.id === current.id)
        mentionOptionsError.value = '提及对象加载失败，请重试后发送回复。'
    }
  }
  const selectedMentions = (): ServiceCaseMention[] => {
    const selected = [
      { kind: 'user' as const, ids: replyForm.value.userIds, options: mentionOptions.value.users },
      {
        kind: 'organization' as const,
        ids: replyForm.value.organizationIds,
        options: mentionOptions.value.organizations
      },
      { kind: 'role' as const, ids: replyForm.value.roleIds, options: mentionOptions.value.roles }
    ]
    return selected.flatMap(({ kind, ids, options }) =>
      ids.flatMap((id) => {
        const option = options.find((item) => item.value === id)
        return option ? [{ kind, id, label: option.label }] : []
      })
    )
  }
  const submitReply = async (): Promise<void> => {
    const current = detail.value
    if (!current || replySaving.value || mentionOptionsError.value) return
    try {
      if (!(await validateArtFormForSubmit(replyFormRef.value))) return
    } catch (error) {
      notifyFriendlyError(error, '回复校验未完成，请稍后重试', 'warning')
      return
    }
    replySaving.value = true
    try {
      await addServiceCaseReply({
        tenantId: current.tenantId,
        serviceCaseId: current.id,
        replyToId: replyTo.value?.id || null,
        content: replyForm.value.content.trim(),
        attachments: replyForm.value.attachments,
        mentions: selectedMentions()
      })
      replyForm.value = emptyReplyForm()
      replyTo.value = null
      await loadReplies()
    } catch (error) {
      notifyFriendlyError(error, '回复保存失败，请重试')
    } finally {
      replySaving.value = false
    }
  }
  const search = ref<ServiceCaseSearch>({
    serviceNo: '',
    waybillNo: '',
    complaintType: '',
    serviceType: '',
    status: ''
  })

  onMounted(() => {
    void Promise.all(
      ['tmsServiceType', 'tmsComplaintType', 'tmsServiceCaseStatus'].map((code) =>
        userStore.ensureDictLoaded(code)
      )
    )
    void openRouteDetail()
  })

  let lastRouteDetailId = ''
  const openRouteDetail = async (): Promise<void> => {
    const id = typeof route.query.serviceCaseId === 'string' ? route.query.serviceCaseId : ''
    if (!id || id === lastRouteDetailId) return
    lastRouteDetailId = id
    try {
      const result = await fetchServiceCaseList({ recordId: id, from: 0, to: 0 })
      if (result.error || !result.data?.[0]) throw result.error ?? new Error('服务单未找到')
      await showDetail(result.data[0])
    } catch (error) {
      notifyFriendlyError(error, '服务单打开失败，请返回列表重试')
    }
  }
  watch(
    () => route.query.serviceCaseId,
    () => void openRouteDetail()
  )

  const serviceTypeOptions = computed(() => getDictMap.value.tmsServiceType ?? [])
  const complaintTypeOptions = computed(() => getDictMap.value.tmsComplaintType ?? [])
  const statusOptions = computed(() => getDictMap.value.tmsServiceCaseStatus ?? [])
  const complaintLabels = (values: string[]) =>
    values
      .map((value) =>
        getDictionaryDisplayLabel(
          complaintTypeOptions.value.find((option) => option.value === value),
          value,
          { unknownText: '待核对' }
        )
      )
      .join('、') || '—'
  const exportDictLabel = (code: string, value: unknown): string =>
    getDictionaryDisplayLabel(
      userStore.getDictDisplayItemByValue(code, String(value ?? '')),
      value,
      { emptyText: '', unknownText: '待核对' }
    )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '服务单号',
      key: 'serviceNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入服务单号' }
    },
    {
      label: '运单号',
      key: 'waybillNo',
      type: 'input',
      props: { clearable: true, placeholder: '请输入运单号' }
    },
    {
      label: '投诉类型',
      key: 'complaintType',
      type: 'select',
      props: { options: complaintTypeOptions.value, clearable: true, filterable: true }
    },
    {
      label: '服务类型',
      key: 'serviceType',
      type: 'select',
      props: { options: serviceTypeOptions.value, clearable: true }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: { options: statusOptions.value, clearable: true }
    }
  ])

  const detailItems: ArtDescriptionItem<ServiceCaseRecord>[] = [
    { key: 'organizationName', label: '所属组织', field: 'organizationName' },
    { key: 'serviceNo', label: '服务单号', field: 'serviceNo', copyable: true },
    { key: 'serviceType', label: '服务类型', field: 'serviceType', dictCode: 'tmsServiceType' },
    {
      key: 'complaintTypes',
      label: '投诉类型',
      value: (row: ServiceCaseRecord) => complaintLabels(row.complaintTypes)
    },
    { key: 'title', label: '标题', field: 'title', span: 2 },
    { key: 'waybillNo', label: '运单号', field: 'waybillNo' },
    {
      key: 'dispatchWaybillNo',
      label: '调度运单号',
      value: () =>
        detailWaybill.value?.waybillNo || (detailWaybillError.value ? '关联运单暂不可见' : '—')
    },
    {
      key: 'routeName',
      label: '线路',
      value: () =>
        detailWaybill.value
          ? `${detailWaybill.value.originStation || '—'} → ${detailWaybill.value.destinationStation || '—'}`
          : '—'
    },
    { key: 'plateNo', label: '车牌号', value: () => detailWaybill.value?.dispatchPlateNo || '—' },
    {
      key: 'driverName',
      label: '司机',
      value: () => detailWaybill.value?.dispatchDriverName || '—'
    },
    {
      key: 'driverPhone',
      label: '手机号',
      value: () => detailWaybill.value?.dispatchDriverPhone || '—'
    },
    { key: 'contactName', label: '联系人', field: 'contactName' },
    { key: 'contactPhone', label: '联系电话', field: 'contactPhone' },
    { key: 'status', label: '状态', field: 'status', dictCode: 'tmsServiceCaseStatus' },
    {
      key: 'submittedAt',
      label: '提交时间',
      value: (row: ServiceCaseRecord) => formatWithDayjs(row.submittedAt, 'YYYY-MM-DD HH:mm')
    },
    { key: 'submittedBy', label: '提交人', field: 'submittedBy' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 },
    {
      key: 'content',
      label: '内容',
      field: 'content',
      span: 3,
      render: (value) => <span class="whitespace-pre-wrap break-words">{String(value || '—')}</span>
    }
  ]

  const activeDetailTab = ref('base')
  const baseDetailItems = detailItems.filter((item) => !['content', 'remark'].includes(item.key))
  const contentDetailItems = detailItems
    .filter((item) => ['content', 'remark'].includes(item.key))
    .map((item) => ({ ...item, span: 1 }))

  const columnsFactory = (): ColumnOption<ServiceCaseRecord>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    { prop: 'organizationName', label: '所属组织', minWidth: 175, showOverflowTooltip: true },
    {
      prop: 'serviceNo',
      label: '服务单号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => (
        <button
          type="button"
          class="font-medium text-[var(--el-color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
          onClick={() => void showDetail(row)}
        >
          {row.serviceNo}
        </button>
      )
    },
    {
      prop: 'serviceType',
      label: '服务类型',
      width: 110,
      dict: { code: 'tmsServiceType', display: 'auto' }
    },
    {
      prop: 'complaintTypes',
      label: '投诉类型',
      minWidth: 190,
      showOverflowTooltip: true,
      formatter: (row) => complaintLabels(row.complaintTypes)
    },
    { prop: 'title', label: '标题', minWidth: 210, showOverflowTooltip: true },
    { prop: 'waybillNo', label: '运单号', minWidth: 160, showOverflowTooltip: true },
    {
      prop: 'submittedAt',
      label: '提交时间',
      width: 166,
      formatter: (row) => formatWithDayjs(row.submittedAt, 'YYYY-MM-DD HH:mm')
    },
    { prop: 'submittedBy', label: '提交人', width: 125, showOverflowTooltip: true },
    { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '状态',
      width: 105,
      dict: { code: 'tmsServiceCaseStatus', display: 'auto' }
    },
    {
      prop: 'operation',
      label: '操作',
      width: 126,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="TmsServiceCase:View"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="TmsServiceCase:Edit"
            onClick={() => void formDialogRef.value?.handleOpen(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsServiceCase:Add',
      type: 'add',
      label: '新增投诉咨询',
      onClick: () => void formDialogRef.value?.handleOpen()
    },
    {
      permission: 'TmsServiceCase:Delete',
      type: 'delete',
      confirm: false,
      onClick: async ({ selectedRows, api }) => {
        const resources = (selectedRows as ServiceCaseRecord[]).map((row) => ({
          id: row.id,
          label: row.serviceNo || '投诉咨询记录'
        }))
        await deleteRecords({
          resources,
          permission: 'TmsServiceCase:Delete',
          inspectReferences: async (snapshot) => {
            if (!deleteGuardRef.value) throw new Error('删除检查尚未就绪，请刷新后重试。')
            const options: MasterDataDeleteGuardOpenOptions = {
              resourceLabel: '投诉咨询记录',
              resources: snapshot,
              fetchDependencies: async (ids) => {
                const result = await fetchServiceCaseReplyDependencies(ids)
                if (result.error) throw result.error
                return (result.data ?? []).map((reply) => ({
                  resourceId: reply.serviceCaseId,
                  dependencyCode: 'service_case_reply',
                  recordId: reply.id,
                  targetId: reply.serviceCaseId,
                  recordNo: reply.authorName,
                  recordSummary: reply.content.slice(0, 60),
                  recordStatus: '已回复',
                  createdAt: reply.createTime,
                  cleanupAllowed: false
                }))
              },
              dependencyMeta: {
                service_case_reply: {
                  label: '沟通回复',
                  unit: '条',
                  description: '此服务单已有沟通记录，请先保留业务历史。',
                  actionLabel: '查看服务单',
                  routePath: '/tms/basic-data/service-case',
                  routeQuery: (reply) => ({ serviceCaseId: reply.resourceId }),
                  canNavigate: () => hasAuth('TmsServiceCase:View'),
                  order: 1
                }
              }
            }
            return deleteGuardRef.value.inspect(options)
          },
          remove: () =>
            deleteTmsBasicRecords(
              'tms_service_case',
              resources.map((resource) => resource.id)
            ),
          onDeleted: async () => {
            await api.refreshRemove()
          }
        })
      }
    },
    {
      permission: 'TmsServiceCase:Export',
      type: 'export',
      exportFilename: '投诉咨询',
      exportSheetName: '服务记录',
      exportColumns: [
        { key: 'organizationName', title: '所属组织' },
        { key: 'serviceNo', title: '服务单号' },
        {
          key: 'serviceType',
          title: '服务类型',
          formatter: (value) => exportDictLabel('tmsServiceType', value)
        },
        {
          key: 'complaintTypes',
          title: '投诉类型',
          formatter: (value) => complaintLabels(Array.isArray(value) ? value.map(String) : [])
        },
        { key: 'title', title: '标题' },
        { key: 'waybillNo', title: '运单号' },
        { key: 'submittedAt', title: '提交时间' },
        { key: 'submittedBy', title: '提交人' },
        { key: 'remark', title: '备注' },
        {
          key: 'status',
          title: '状态',
          formatter: (value) => exportDictLabel('tmsServiceCaseStatus', value)
        }
      ],
      exportApi: async ({ maxRows }) => {
        await Promise.all(
          ['tmsServiceType', 'tmsComplaintType', 'tmsServiceCaseStatus'].map((code) =>
            userStore.ensureDictLoaded(code)
          )
        )
        return {
          data:
            (await fetchServiceCaseList({ ...search.value, from: 0, to: maxRows - 1 })).data ?? []
        }
      }
    }
  ])

  const fetchTable = (params: ServiceCaseSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchServiceCaseList({ ...params, from, to })
  }

  const showDetail = async (row: ServiceCaseRecord): Promise<void> => {
    detail.value = row
    detailWaybill.value = undefined
    detailWaybillError.value = false
    mentionOptions.value = { users: [], organizations: [], roles: [] }
    replies.value = []
    attachmentNames.value = {}
    replyTo.value = null
    replyForm.value = emptyReplyForm()
    await detailDialogRef.value?.handleOpen(row, {
      title: `服务详情 · ${row.serviceNo}`,
      onOpen: async () => {
        await Promise.all([
          loadReplies(),
          loadMentionOptions(),
          (async () => {
            if (!row.waybillId) return
            try {
              const result = await fetchServiceCaseWaybillOptions(row.tenantId, {
                keyword: '',
                page: 1,
                pageSize: 1,
                filters: {},
                recordId: row.waybillId
              })
              if (result.error) throw result.error
              if (!result.data[0]) throw new Error('关联运单不可见')
              if (detail.value?.id === row.id) detailWaybill.value = result.data?.[0]
            } catch {
              if (detail.value?.id === row.id) detailWaybillError.value = true
            }
          })()
        ])
      }
    })
  }

  const refresh = (mode: 'add' | 'edit'): void => {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }
</script>
