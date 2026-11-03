<template>
  <div class="min-w-0">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p class="m-0 text-sm text-[var(--art-text-gray-600)]">
        {{
          kind === 'contact'
            ? '维护承运商联系人；默认联系人同步到承运商基础资料。'
            : '维护开票账户；默认账户在承运商分配时带出。'
        }}
      </p>
      <ElButton type="primary" :disabled="readonly" @click="openEditor()"> 新增 </ElButton>
    </div>
    <ArtTable
      :data="rows"
      :columns="columns"
      :pagination="false"
      empty-text="暂无记录，点击新增维护"
      empty-height="180px"
    />
    <ArtDialog ref="editorRef" size="md">
      <ArtForm
        ref="formRef"
        v-model="draft"
        :items="formItems"
        :rules="rules"
        :span="12"
        :gutter="16"
        label-width="110px"
      />
    </ArtDialog>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="ts">
  import { h } from 'vue'
  import { ElButton, ElTag } from 'element-plus'
  import type { FormRules } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import { fetchCarrierBillingAccountReferences } from '@tms/api'
  import { useAuth } from '@/hooks/core/useAuth'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'

  type Contact = Api.Tms.BasicData.CarrierContact
  type Account = Api.Tms.BasicData.CarrierBillingAccount
  type Child = Contact & Account
  type ChildRow = Contact | Account

  const props = defineProps<{
    kind: 'contact' | 'billing'
    readonly?: boolean
    originalRows?: ChildRow[]
  }>()
  const rows = defineModel<(Contact | Account)[]>({ required: true })
  const editorRef = ref<ArtDialogExpose>()
  const deleteGuardRef = ref<{
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }>()
  const { hasAuth } = useAuth()
  const formRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const editingIndex = ref<number | null>(null)
  const draft = ref<Partial<Child>>({})

  const columns = computed<ColumnOption<ChildRow>[]>(() => [
    ...(props.kind === 'contact'
      ? [
          { prop: 'name', label: '姓名', minWidth: 110 },
          { prop: 'alias', label: '别名', minWidth: 100 },
          { prop: 'position', label: '职位', minWidth: 110 },
          { prop: 'department', label: '部门', minWidth: 110 },
          { prop: 'mobile', label: '手机号', minWidth: 125 },
          { prop: 'landline', label: '固定电话', minWidth: 125 },
          { prop: 'email', label: '邮箱', minWidth: 150 },
          { prop: 'qq', label: 'QQ', minWidth: 110 },
          { prop: 'role', label: '角色', minWidth: 110 }
        ]
      : [
          { prop: 'invoiceTitle', label: '开票名称', minWidth: 160 },
          { prop: 'taxNo', label: '纳税人识别号', minWidth: 170 },
          { prop: 'bankName', label: '开户行', minWidth: 150 },
          { prop: 'bankAccount', label: '银行账号', minWidth: 170 },
          { prop: 'bankBranch', label: '支行', minWidth: 140 },
          { prop: 'remark', label: '备注', minWidth: 150 }
        ]),
    {
      prop: 'isDefault',
      label: '默认',
      width: 78,
      formatter: (row) =>
        row.isDefault ? h(ElTag, { type: 'success', effect: 'plain' }, () => '默认') : '—'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 180,
      fixed: 'right',
      formatter: (row) => {
        const index = rows.value.indexOf(row)
        return h('div', { class: 'flex gap-1' }, [
          h(
            ElButton,
            {
              link: true,
              type: 'primary',
              disabled: props.readonly,
              onClick: () => void openEditor(index)
            },
            () => '编辑'
          ),
          h(
            ElButton,
            {
              link: true,
              type: 'primary',
              disabled: props.readonly,
              onClick: () => copyRow(index)
            },
            () => '复制'
          ),
          h(
            ElButton,
            {
              link: true,
              type: 'danger',
              disabled: props.readonly,
              onClick: () => removeRow(index)
            },
            () => '删除'
          )
        ])
      }
    }
  ])

  const formItems = computed<FormItem[]>(() =>
    props.kind === 'contact'
      ? [
          { key: 'name', label: '姓名', type: 'input', props: { maxlength: 50 } },
          { key: 'alias', label: '别名', type: 'input', props: { maxlength: 50 } },
          { key: 'position', label: '职位', type: 'input', props: { maxlength: 50 } },
          { key: 'department', label: '部门', type: 'input', props: { maxlength: 50 } },
          { key: 'mobile', label: '手机号', type: 'input', props: { maxlength: 20 } },
          { key: 'landline', label: '固定电话', type: 'input', props: { maxlength: 20 } },
          { key: 'email', label: '邮箱', type: 'input', props: { maxlength: 100 } },
          { key: 'qq', label: 'QQ', type: 'input', props: { maxlength: 20 } },
          { key: 'role', label: '角色', type: 'input', props: { maxlength: 50 } },
          { key: 'isDefault', label: '默认联系人', type: 'switch', span: 12 }
        ]
      : [
          { key: 'invoiceTitle', label: '开票名称', type: 'input', props: { maxlength: 100 } },
          { key: 'taxNo', label: '纳税人识别号', type: 'input', props: { maxlength: 40 } },
          { key: 'bankName', label: '开户行', type: 'input', props: { maxlength: 100 } },
          { key: 'bankAccount', label: '银行账号', type: 'input', props: { maxlength: 50 } },
          { key: 'bankBranch', label: '支行', type: 'input', props: { maxlength: 100 } },
          {
            key: 'remark',
            label: '备注',
            type: 'input',
            span: 24,
            props: { maxlength: 500, type: 'textarea', rows: 2 }
          },
          { key: 'isDefault', label: '默认开票账户', type: 'switch', span: 12 }
        ]
  )
  const rules = computed<FormRules>(() =>
    props.kind === 'contact'
      ? { name: [{ required: true, message: '请输入姓名', trigger: 'blur' }] }
      : { invoiceTitle: [{ required: true, message: '请输入开票名称', trigger: 'blur' }] }
  )

  const openEditor = async (index?: number): Promise<void> => {
    editingIndex.value = index ?? null
    draft.value =
      index === undefined ? { isDefault: rows.value.length === 0 } : { ...rows.value[index] }
    await editorRef.value?.handleOpen(undefined, {
      title: index === undefined ? '新增记录' : '编辑记录',
      contentMaxHeight: '65vh',
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        const next = [...rows.value]
        const entry = { ...draft.value } as Contact | Account
        if (entry.isDefault)
          next.forEach((row) => {
            row.isDefault = false
          })
        if (editingIndex.value === null) next.push(entry)
        else next[editingIndex.value] = entry
        if (next.length && !next.some((row) => row.isDefault)) next[0].isDefault = true
        rows.value = next
        return true
      }
    })
    formRef.value?.clearValidate()
  }

  const copyRow = (index: number): void => {
    const copy = { ...rows.value[index], id: undefined, isDefault: false }
    rows.value = [...rows.value, copy]
  }

  const inspectReferences = async (row: ChildRow): Promise<boolean> => {
    if (!row.id) return false
    if (!deleteGuardRef.value) {
      ElMessage.error('关联检查尚未就绪，请稍后重试。')
      return true
    }
    const isBilling = props.kind === 'billing'
    const label = isBilling ? (row as Account).invoiceTitle : (row as Contact).name
    return await deleteGuardRef.value.inspect({
      resourceLabel: isBilling ? '开票账户' : '联系人',
      resources: [{ id: row.id, label }],
      dependencyMeta: {
        tms_waybill: {
          label: '关联运单',
          unit: '条',
          order: 1,
          description: '该运单保留了分配时的开票账户快照，请核对历史后处理。',
          actionLabel: '查看运单',
          routeName: 'TmsWaybillDetail',
          routeParams: (record) => ({ id: record.targetId }),
          canNavigate: () => hasAuth('TmsLoadedWaybillList:View')
        }
      },
      fetchDependencies: async () => {
        if (!isBilling || !row.id) return []
        const result = await fetchCarrierBillingAccountReferences(row.id)
        if (result.error) throw result.error
        return (result.data ?? []).map((waybill) => ({
          resourceId: row.id!,
          dependencyCode: 'tms_waybill',
          recordId: waybill.waybillId,
          targetId: waybill.waybillId,
          recordNo: waybill.waybillNo,
          recordStatus: waybill.status,
          createdAt: waybill.createTime,
          cleanupAllowed: false
        }))
      }
    })
  }

  const removeRow = async (index: number): Promise<void> => {
    const row = rows.value[index]
    if (!row || (await inspectReferences(row))) return
    const next = rows.value.filter((_, rowIndex) => rowIndex !== index)
    if (next.length && !next.some((row) => row.isDefault)) next[0].isDefault = true
    rows.value = next
  }

  const recheckRemoved = async (): Promise<boolean> => {
    for (const original of props.originalRows ?? []) {
      if (original.id && !rows.value.some((row) => row.id === original.id)) {
        if (await inspectReferences(original)) return true
      }
    }
    return false
  }
  defineExpose({ recheckRemoved })
</script>
