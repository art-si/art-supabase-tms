<template>
  <ArtDrawer ref="drawerRef" size="min(96vw, 1120px)">
    <div v-if="waybill" class="space-y-4 pb-4">
      <div
        class="grid gap-4 rounded-lg border border-[var(--el-border-color-lighter)] bg-[var(--art-gray-100)] px-4 py-3 text-sm md:grid-cols-3"
        aria-label="当前调度运单"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)]"
            aria-hidden="true"
          >
            <ArtSvgIcon icon="ri:truck-line" />
          </span>
          <div class="min-w-0">
            <span class="text-[var(--el-text-color-secondary)]">调度子单</span>
            <strong
              class="mt-0.5 block truncate font-semibold text-[var(--el-text-color-primary)]"
              :title="waybill.waybillNo || ''"
              >{{ waybill.waybillNo }}</strong
            >
          </div>
        </div>
        <div class="min-w-0">
          <span class="text-[var(--el-text-color-secondary)]">原始运单</span>
          <strong
            class="mt-0.5 block truncate font-medium text-[var(--el-text-color-primary)]"
            :title="sourceOrderText"
            >{{ sourceOrderText }}</strong
          >
        </div>
        <div class="min-w-0">
          <span class="text-[var(--el-text-color-secondary)]">运输线路</span>
          <strong
            class="mt-0.5 block truncate font-medium text-[var(--el-text-color-primary)]"
            :title="routeText"
            >{{ routeText }}</strong
          >
        </div>
      </div>

      <div
        v-if="loadFailed"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--el-color-danger-light-7)] bg-[var(--el-color-danger-light-9)] p-4"
        role="alert"
      >
        <span>预约详情加载失败，请重试。</span>
        <ElButton type="primary" plain @click="load">重新加载</ElButton>
      </div>

      <div v-if="!loadFailed" class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <ArtSectionTitle :title="`${title}明细 · ${form.entries.length} 条`" />
        </div>
        <ElButton v-if="canAdd" v-auth="permissions.add" type="primary" plain @click="addEntry">
          <ArtSvgIcon icon="ri:add-line" aria-hidden="true" />
          新增预约
        </ElButton>
      </div>

      <div v-if="!loadFailed" class="space-y-4">
        <section
          v-for="(entry, index) in form.entries"
          :key="entry.localKey"
          class="rounded-lg border border-[var(--el-border-color-lighter)] bg-[var(--default-box-color)] p-4"
          :class="{ 'appointment-entry--readonly': !canEditEntry(entry) }"
          :aria-label="`第 ${index + 1} 条预约`"
        >
          <div
            class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--el-border-color-lighter)] pb-3"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--el-color-primary-light-9)] font-semibold text-[var(--el-color-primary)]"
              >
                {{ index + 1 }}
              </span>
              <div class="min-w-0">
                <strong class="block font-semibold text-[var(--el-text-color-primary)]">
                  {{ entry.id ? `预约 ${index + 1}` : `新预约 ${index + 1}` }}
                </strong>
                <small class="text-[var(--el-text-color-secondary)]">
                  最后更新：{{ entry.updateTime ? displayTime(entry.updateTime) : '尚未保存' }}
                </small>
              </div>
              <ArtDictDisplay
                v-if="entry.id"
                dict-code="tmsAppointmentStatus"
                :value="entry.status"
                display="tag"
              />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <ElButton
                v-if="entry.id && entry.status === 'confirming' && canConfirm"
                v-auth="permissions.confirm"
                size="small"
                type="primary"
                plain
                @click="changeStatus(entry, 'confirm')"
                >确认预约</ElButton
              >
              <ElButton
                v-if="entry.id && entry.status === 'confirmed' && canComplete"
                v-auth="permissions.complete"
                size="small"
                type="success"
                plain
                @click="changeStatus(entry, 'complete')"
                >标记完结</ElButton
              >
              <ElButton
                v-if="(entry.id ? canDelete : canAdd) && entry.status !== 'completed'"
                v-auth="entry.id ? permissions.delete : permissions.add"
                size="small"
                type="danger"
                link
                @click="removeEntry(entry, index)"
                >删除</ElButton
              >
            </div>
          </div>

          <ArtForm
            ref="formRefs"
            :model-value="form"
            :items="entryItems(entry, index)"
            :span="8"
            :gutter="16"
            :disabled="saving"
            label-position="top"
            root-class="p-0! md:p-0!"
          >
            <template #[`entries.${index}.selectedWaybillIds`]>
              <div class="flex w-full flex-col gap-2">
                <ElTag
                  v-for="id in entry.selectedWaybillIds"
                  :key="id"
                  size="small"
                  type="info"
                  class="max-w-full self-start"
                >
                  <span class="block truncate" :title="candidateName(id)">{{
                    candidateName(id)
                  }}</span>
                </ElTag>
                <ElButton
                  v-if="canEditEntry(entry)"
                  size="small"
                  type="primary"
                  plain
                  class="mt-1 w-full!"
                  @click="chooseChildren(entry)"
                >
                  <ArtSvgIcon icon="ri:list-check-2" aria-hidden="true" />
                  选择子单
                </ElButton>
              </div>
            </template>
            <template #[`arrival_${entry.localKey}Actions`]>
              <ElButton
                v-if="canArrival && entry.status !== 'completed'"
                v-auth="permissions.arrival"
                size="small"
                type="primary"
                plain
                @click="saveArrival(entry)"
                >保存到场信息</ElButton
              >
            </template>
          </ArtForm>
        </section>
      </div>

      <ArtEmptyState
        v-if="!loadFailed && !form.entries.length"
        class="rounded-lg border border-dashed border-[var(--el-border-color)]"
        title="暂无预约记录"
        description="选择上方“新增预约”安排司机、车辆和进场时间。"
        size="compact"
        :visual-size="72"
      />
    </div>
    <AppointmentChildDialog ref="childDialogRef" @select="applySelectedChildren" />
  </ArtDrawer>
  <MasterDataDeleteGuard ref="deleteGuardRef" />
</template>

<script setup lang="ts">
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import dayjs from 'dayjs'
  import { ElMessage, type FormItemRule } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import {
    changeAppointmentStatus,
    deleteAppointment,
    fetchAppointmentCandidates,
    fetchAppointmentWorkspace,
    recordAppointmentArrival,
    saveAppointment
  } from '@tms/api'
  import type {
    AppointmentCandidate,
    AppointmentKind,
    AppointmentListRow,
    AppointmentRecord,
    AppointmentSavePayload
  } from '@tms/api'
  import AppointmentChildDialog from './appointment-child-dialog.vue'

  defineOptions({ name: 'TmsAppointmentDrawer' })

  interface AppointmentPermissions {
    add: string
    edit: string
    delete: string
    confirm: string
    complete: string
    arrival: string
  }

  interface EditableEntry extends Omit<
    AppointmentRecord,
    'kind' | 'scheduledAt' | 'arrivalPlateNo' | 'dockName' | 'remark' | 'driverPhone' | 'status'
  > {
    localKey: string
    status: AppointmentRecord['status'] | 'new'
    driverPhone: string
    scheduledAt: string
    remark: string
    arrivalPlateNo: string
    dockName: string
  }

  const props = defineProps<{ kind: AppointmentKind; permissions: AppointmentPermissions }>()
  const emit = defineEmits<{ (event: 'success'): void }>()
  const { hasAuth } = useAuth()
  const drawerRef = ref<ArtDrawerExpose<AppointmentListRow>>()
  const childDialogRef = ref<{
    handleOpen: (options: {
      candidates: AppointmentCandidate[]
      selectedIds: string[]
      anchorWaybillId: string
    }) => Promise<void>
  }>()
  const formRefs = ref<InstanceType<typeof ArtForm>[]>([])
  const waybill = ref<AppointmentListRow | null>(null)
  const candidates = ref<AppointmentCandidate[]>([])
  const form = reactive<{ entries: EditableEntry[] }>({ entries: [] })
  const saving = ref(false)
  const loadFailed = ref(false)
  const selectingEntry = ref<EditableEntry | null>(null)

  const title = computed(() => (props.kind === 'pickup' ? '提货预约' : '送货预约'))
  const { deleteGuardRef, deleteRecord } = useRecordDeleteGuard('tms_waybill_appointment', title)
  const canAdd = computed(() => hasAuth(props.permissions.add))
  const canEdit = computed(() => hasAuth(props.permissions.edit))
  const canDelete = computed(() => hasAuth(props.permissions.delete))
  const canConfirm = computed(() => hasAuth(props.permissions.confirm))
  const canComplete = computed(() => hasAuth(props.permissions.complete))
  const canArrival = computed(() => hasAuth(props.permissions.arrival))
  const sourceOrderText = computed(
    () =>
      (waybill.value?.sourceOrderNos ?? [waybill.value?.orderNo]).filter(Boolean).join('、') || '-'
  )
  const routeText = computed(
    () =>
      [waybill.value?.originStation, waybill.value?.destinationStation]
        .filter(Boolean)
        .join(' → ') || '-'
  )

  const requiredRule: FormItemRule = { required: true, message: '请填写此项', trigger: 'blur' }
  const requiredChildrenRule: FormItemRule = {
    required: true,
    type: 'array',
    min: 1,
    message: '请至少选择一张子单',
    trigger: 'change'
  }
  const phoneRule: FormItemRule = {
    required: true,
    pattern: /^[+\d()\s-]{6,24}$/,
    message: '请输入有效联系电话',
    trigger: 'blur'
  }

  const displayTime = (value: string): string => dayjs(value).format('YYYY-MM-DD HH:mm')
  const toLocal = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm:ss',
    emptyText: '',
    invalidText: ''
  })
  const toIso = (value: string | null): string | null => (value ? dayjs(value).toISOString() : null)
  const candidateName = (id: string): string =>
    candidates.value.find((candidate) => candidate.id === id)?.waybillNo || '未找到子单'
  const canEditEntry = (entry: EditableEntry): boolean =>
    entry.status !== 'completed' && (entry.id ? canEdit.value : canAdd.value)

  function entryItems(entry: EditableEntry, index: number): FormItem[] {
    const key = (field: string) => `entries.${index}.${field}`
    const disabled = !canEditEntry(entry)
    const arrivalDisabled = !canArrival.value || entry.status === 'completed'
    const dateProps = {
      type: 'datetime',
      valueFormat: 'YYYY-MM-DD HH:mm:ss',
      format: 'YYYY-MM-DD HH:mm',
      class: 'w-full!'
    }
    return [
      { key: `driver_${entry.localKey}`, label: '司机与车辆安排', type: 'divider', span: 24 },
      {
        key: key('driverName'),
        label: '司机姓名',
        type: 'input',
        formItemProps: { rules: requiredRule },
        props: { disabled, maxlength: 60, placeholder: '请输入司机姓名' }
      },
      {
        key: key('driverPhone'),
        label: '联系电话',
        type: 'input',
        formItemProps: { rules: phoneRule },
        props: { disabled, maxlength: 24, placeholder: '请输入联系电话' }
      },
      {
        key: key('plateNo'),
        label: '车牌号',
        type: 'input',
        formItemProps: { rules: requiredRule },
        props: { disabled, maxlength: 24, placeholder: '请输入车牌号' }
      },
      {
        key: key('loadCapacityTon'),
        label: '载重（吨）',
        type: 'number',
        props: {
          disabled,
          min: 0.01,
          precision: 2,
          controls: false,
          class: 'w-full!',
          placeholder: '可选'
        }
      },
      {
        key: key('vehicleLengthM'),
        label: '车长（米）',
        type: 'number',
        props: {
          disabled,
          min: 0.01,
          precision: 2,
          controls: false,
          class: 'w-full!',
          placeholder: '可选'
        }
      },
      {
        key: key('scheduledAt'),
        label: '进场日期与时间',
        type: 'date',
        formItemProps: { rules: requiredRule },
        props: { ...dateProps, disabled, placeholder: '请选择预约进场时间' }
      },
      {
        key: key('remark'),
        label: '备注',
        type: 'input',
        span: 24,
        props: { disabled, maxlength: 300, showWordLimit: true, placeholder: '可补充预约要求' }
      },
      {
        key: key('selectedWaybillIds'),
        label: `已选择子单 · ${entry.selectedWaybillIds.length} 张`,
        type: 'appointmentChildren',
        span: 24,
        formItemProps: { rules: requiredChildrenRule }
      },
      ...(entry.id
        ? [
            { key: `arrival_${entry.localKey}`, label: '到场信息', type: 'divider', span: 24 },
            {
              key: key('arrivalPlateNo'),
              label: '到场车牌',
              type: 'input',
              props: { disabled: arrivalDisabled, maxlength: 24, placeholder: '默认使用预约车牌' }
            },
            {
              key: key('arrivedAt'),
              label: '进场时间',
              type: 'date',
              props: { ...dateProps, disabled: arrivalDisabled, placeholder: '请选择进场时间' }
            },
            ...(props.kind === 'pickup'
              ? [
                  {
                    key: key('loadingStartedAt'),
                    label: '装货开始时间',
                    type: 'date',
                    props: { ...dateProps, disabled: arrivalDisabled, placeholder: '可选' }
                  },
                  {
                    key: key('loadingFinishedAt'),
                    label: '装货结束时间',
                    type: 'date',
                    props: { ...dateProps, disabled: arrivalDisabled, placeholder: '可选' }
                  },
                  {
                    key: key('departedAt'),
                    label: '离场时间',
                    type: 'date',
                    props: { ...dateProps, disabled: arrivalDisabled, placeholder: '可选' }
                  }
                ]
              : [
                  {
                    key: key('dockName'),
                    label: '月台信息',
                    type: 'input',
                    props: {
                      disabled: arrivalDisabled,
                      maxlength: 100,
                      placeholder: '请输入月台或卸货位'
                    }
                  }
                ])
          ]
        : [])
    ]
  }
  function toEditable(record: AppointmentRecord): EditableEntry {
    return {
      ...record,
      localKey: record.id,
      driverPhone: record.driverPhone || '',
      scheduledAt: toLocal(record.scheduledAt),
      remark: record.remark || '',
      arrivalPlateNo: record.arrivalPlateNo || '',
      dockName: record.dockName || '',
      arrivedAt: toLocal(record.arrivedAt),
      loadingStartedAt: toLocal(record.loadingStartedAt),
      loadingFinishedAt: toLocal(record.loadingFinishedAt),
      departedAt: toLocal(record.departedAt)
    }
  }

  async function load(): Promise<void> {
    if (!waybill.value?.id) return
    form.entries = []
    candidates.value = []
    loadFailed.value = false
    drawerRef.value?.setLoading(true)
    try {
      const [nextCandidates, records] = await Promise.all([
        fetchAppointmentCandidates(waybill.value.id),
        fetchAppointmentWorkspace(props.kind, waybill.value.id)
      ])
      candidates.value = nextCandidates
      form.entries = records.map(toEditable)
      if (!form.entries.length && canAdd.value) addEntry()
      await nextTick()
      formRefs.value.forEach((instance) => instance.clearValidate())
    } catch {
      loadFailed.value = true
    } finally {
      drawerRef.value?.setLoading(false)
    }
  }

  async function handleOpen(row: AppointmentListRow): Promise<void> {
    waybill.value = row
    await drawerRef.value?.handleOpen(row, {
      title: `${title.value} · ${row.waybillNo}`,
      subtitle: '按子单维护司机、车辆、预约时间和到场记录',
      confirmText: '保存预约',
      showFooter: canAdd.value || canEdit.value,
      onOpen: load,
      onConfirm: handleSave
    })
  }

  function addEntry(): void {
    if (!waybill.value?.id || !canAdd.value) return
    form.entries.push({
      localKey: crypto.randomUUID(),
      id: '',
      anchorWaybillId: waybill.value.id,
      selectedWaybillIds: [waybill.value.id],
      driverName: '',
      driverPhone: '',
      plateNo: '',
      loadCapacityTon: null,
      vehicleLengthM: null,
      scheduledAt: toLocal(
        props.kind === 'pickup'
          ? waybill.value.plannedDepartureTime || null
          : waybill.value.plannedArrivalTime || null
      ),
      status: 'new',
      remark: '',
      arrivalPlateNo: '',
      arrivedAt: '',
      dockName: '',
      loadingStartedAt: '',
      loadingFinishedAt: '',
      departedAt: '',
      updateTime: ''
    })
  }

  function chooseChildren(entry: EditableEntry): void {
    selectingEntry.value = entry
    void childDialogRef.value?.handleOpen({
      candidates: candidates.value,
      selectedIds: entry.selectedWaybillIds,
      anchorWaybillId: entry.anchorWaybillId
    })
  }

  function applySelectedChildren(ids: string[]): void {
    if (selectingEntry.value) selectingEntry.value.selectedWaybillIds = ids
  }

  async function removeEntry(entry: EditableEntry, index: number): Promise<void> {
    if (!entry.id) {
      if (!canAdd.value) return
      form.entries.splice(index, 1)
      return
    }
    if (entry.status === 'completed') return
    const id = entry.id
    await deleteRecord({
      resource: {
        id,
        label: [waybill.value?.waybillNo, entry.plateNo, entry.scheduledAt]
          .filter(Boolean)
          .join(' · ')
      },
      permission: props.permissions.delete,
      remove: () => deleteAppointment(id),
      onDeleted: async () => {
        emit('success')
        await load()
      }
    })
  }

  async function handleSave(): Promise<boolean> {
    if (!waybill.value || saving.value) return false
    if (loadFailed.value) {
      ElMessage.warning('请先重新加载预约详情')
      return false
    }
    if (!form.entries.length) return true
    const valid = (
      await Promise.all(formRefs.value.map((instance) => instance.validate().catch(() => false)))
    ).every(Boolean)
    if (!valid) return false
    saving.value = true
    let savedCount = 0
    try {
      for (const entry of form.entries) {
        if (!canEditEntry(entry)) continue
        const payload: AppointmentSavePayload = {
          id: entry.id || undefined,
          kind: props.kind,
          anchorWaybillId: entry.anchorWaybillId,
          selectedWaybillIds: entry.selectedWaybillIds,
          driverName: entry.driverName.trim(),
          driverPhone: entry.driverPhone.trim(),
          plateNo: entry.plateNo.trim(),
          loadCapacityTon: entry.loadCapacityTon,
          vehicleLengthM: entry.vehicleLengthM,
          scheduledAt: toIso(entry.scheduledAt) || '',
          remark: entry.remark.trim()
        }
        const result = await saveAppointment(payload)
        if (!entry.id && result.data) {
          entry.id = result.data
          entry.status = 'confirming'
          entry.updateTime = new Date().toISOString()
        }
        savedCount += 1
      }
      emit('success')
      return true
    } catch {
      if (savedCount) {
        emit('success')
        ElMessage.warning('部分预约已保存，请检查未完成的记录后重试')
      }
      return false
    } finally {
      saving.value = false
    }
  }

  async function changeStatus(entry: EditableEntry, action: 'confirm' | 'complete'): Promise<void> {
    if (!entry.id || saving.value) return
    saving.value = true
    try {
      await changeAppointmentStatus(entry.id, action)
      emit('success')
      await load()
    } catch {
      // The API boundary already showed the error; keep the current record visible.
    } finally {
      saving.value = false
    }
  }

  async function saveArrival(entry: EditableEntry): Promise<void> {
    if (!entry.id || saving.value) return
    if (
      !entry.arrivedAt &&
      (entry.loadingStartedAt ||
        entry.loadingFinishedAt ||
        entry.departedAt ||
        entry.dockName.trim())
    ) {
      ElMessage.warning('请先填写进场时间')
      return
    }
    if (props.kind === 'delivery' && entry.arrivedAt && !entry.dockName.trim()) {
      ElMessage.warning('请填写月台信息')
      return
    }
    if (entry.loadingFinishedAt && !entry.loadingStartedAt) {
      ElMessage.warning('请先填写装货开始时间')
      return
    }
    const times = [
      entry.arrivedAt,
      entry.loadingStartedAt,
      entry.loadingFinishedAt,
      entry.departedAt
    ].filter(Boolean)
    if (times.some((time, index) => index > 0 && dayjs(time).isBefore(dayjs(times[index - 1])))) {
      ElMessage.warning('到场、装货和离场时间应按实际发生顺序填写')
      return
    }
    saving.value = true
    try {
      await recordAppointmentArrival(entry.id, {
        arrivalPlateNo: entry.arrivalPlateNo.trim(),
        arrivedAt: toIso(entry.arrivedAt),
        dockName: entry.dockName.trim(),
        loadingStartedAt: toIso(entry.loadingStartedAt),
        loadingFinishedAt: toIso(entry.loadingFinishedAt),
        departedAt: toIso(entry.departedAt)
      })
      emit('success')
      await load()
    } catch {
      // The API boundary already showed the error; keep the entered arrival details.
    } finally {
      saving.value = false
    }
  }

  defineExpose({ handleOpen })
</script>

<style scoped>
  .appointment-entry--readonly :deep(.el-input.is-disabled .el-input__inner) {
    color: var(--el-text-color-regular);
    -webkit-text-fill-color: var(--el-text-color-regular);
  }

  .appointment-entry--readonly :deep(.el-input.is-disabled .el-input__inner::placeholder) {
    color: var(--el-text-color-placeholder);
    -webkit-text-fill-color: var(--el-text-color-placeholder);
  }
</style>
