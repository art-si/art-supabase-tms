<template>
  <div class="business-workspace-page art-full-height min-w-0 gap-3">
    <BusinessWorkspaceHeader
      eyebrow="COMPANY CERTIFICATION"
      title="公司认证信息"
      description="集中维护企业资质、委托、开户和运输许可资料，按申请记录跟踪审核结果。"
      icon="ri:verified-badge-line"
    />

    <ArtSectionCard
      title="认证工作区"
      subtitle="资料变更保留独立申请记录，审核结果以服务端状态为准。"
      :loading="loading"
      :error="loadError ? '请检查网络或权限后重试。' : null"
      error-title="认证资料加载失败"
      @retry="loadRecords"
    >
      <div v-if="canView" class="min-w-0">
        <div v-if="tenantScope.isAllTenants" class="mb-4 flex flex-wrap items-center gap-3">
          <span class="text-sm text-[var(--el-text-color-regular)]">查看租户</span>
          <ElSelect v-model="selectedTenantId" clearable placeholder="全部租户" class="w-60!">
            <ElOption
              v-for="tenant in tenantScope.tenantOptions"
              :key="tenant.id"
              :label="tenant.tenantName"
              :value="tenant.id"
            />
          </ElSelect>
          <span class="text-xs text-[var(--el-text-color-secondary)]">{{
            selectedTenantId ? '仅显示所选租户' : `共 ${tenantCount} 个租户有认证记录`
          }}</span>
        </div>

        <ElTabs v-model="activeSection" class="certification-tabs">
          <ElTabPane
            v-for="section in sections"
            :key="section.key"
            :name="section.key"
            :label="section.label"
          />
        </ElTabs>

        <div
          class="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] pb-4"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-[var(--el-text-color-primary)]">{{
                activeMeta.label
              }}</h2>
              <ElTag
                v-if="currentRecord || !tenantScope.isAllTenants"
                :type="statusTone(currentRecord?.status, currentRecord?.effectiveCertified)"
                effect="light"
                size="small"
                >{{ statusLabel(currentRecord?.status, currentRecord?.effectiveCertified) }}</ElTag
              >
            </div>
            <p class="mt-1 text-sm text-[var(--el-text-color-regular)]">{{
              activeMeta.description
            }}</p>
            <p v-if="currentRecord" class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
              申请时间 {{ formatWithDayjs(currentRecord.submittedAt) }}
              <span v-if="tenantScope.isAllTenants">
                · {{ currentRecord.tenantName || tenantLabel(currentRecord.tenantId) }}</span
              >
              <span v-if="currentRecord.reviewedAt">
                · 审核时间 {{ formatWithDayjs(currentRecord.reviewedAt) }}</span
              >
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <ElButton v-if="canReview && currentRecord?.status === 'pending'" @click="openReview"
              >审核申请</ElButton
            >
            <ElButton
              v-if="canSubmit && currentRecord?.status !== 'pending'"
              type="primary"
              @click="openApplication"
              >{{ currentRecord ? '变更申请' : '申请认证' }}</ElButton
            >
          </div>
        </div>

        <div
          v-if="tenantScope.isAllTenants && !selectedTenantId && sectionRecords.length"
          class="mt-4 grid gap-3"
        >
          <button
            v-for="record in sectionRecords"
            :key="record.id"
            type="button"
            class="certification-tenant-row flex w-full items-center justify-between gap-4 rounded-md px-4 py-3 text-left"
            @click="selectedTenantId = record.tenantId"
          >
            <span
              class="min-w-0 truncate text-sm font-medium text-[var(--el-text-color-primary)]"
              >{{ record.tenantName || tenantLabel(record.tenantId) }}</span
            >
            <span class="shrink-0 text-xs text-[var(--el-text-color-regular)]"
              >{{ statusLabel(record.status, record.effectiveCertified) }} →</span
            >
          </button>
        </div>
        <template v-else-if="currentRecord">
          <ElAlert
            v-if="currentRecord.status === 'rejected' && currentRecord.reviewNote"
            class="mt-4"
            :title="`审核未通过：${currentRecord.reviewNote}`"
            type="warning"
            show-icon
            :closable="false"
          />
          <ElAlert
            v-else-if="currentRecord.status === 'pending'"
            class="mt-4"
            title="申请已提交，正在等待审核。审核完成后可发起资料变更。"
            type="info"
            show-icon
            :closable="false"
          />
          <ElAlert
            v-else-if="currentRecord.status === 'approved' && isProviderSection"
            class="mt-4"
            title="申请资料已完成内部审核。钱包开户、身份验证或正式签章仍需等待外部服务结果；当前不代表认证已完成。"
            type="info"
            show-icon
            :closable="false"
          />
          <p class="mt-5 text-sm font-semibold text-[var(--el-text-color-primary)]">{{
            currentRecord.status === 'pending' ? '待审核申请资料' : '最近一次申请资料'
          }}</p>
          <dl class="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="field in displayFields"
              :key="field.key"
              class="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] py-3"
            >
              <dt class="shrink-0 text-sm text-[var(--el-text-color-regular)]">{{
                field.label
              }}</dt>
              <dd
                class="min-w-0 break-all text-right text-sm font-medium text-[var(--el-text-color-primary)]"
                >{{ field.value }}</dd
              >
            </div>
          </dl>
          <div
            v-if="displayAttachments.length"
            class="mt-6 border-t border-[var(--el-border-color-lighter)] pt-5"
          >
            <h3 class="mb-3 text-sm font-semibold text-[var(--el-text-color-primary)]">申请附件</h3>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div v-for="attachment in displayAttachments" :key="attachment.label">
                <p class="mb-2 text-sm text-[var(--el-text-color-regular)]">{{
                  attachment.label
                }}</p>
                <ArtUploadImage
                  v-if="attachment.kind === 'image'"
                  :model-value="attachment.value"
                  :title="attachment.label"
                  :size="104"
                  readonly
                />
                <ArtUploadFile
                  v-else
                  :model-value="attachment.values"
                  :title="attachment.label"
                  readonly
                />
              </div>
            </div>
          </div>
          <p
            v-else-if="!canViewSensitive && activeSection !== 'e_signature'"
            class="mt-5 text-xs text-[var(--el-text-color-secondary)]"
          >
            敏感证照附件仅供待审核申请的提交人和授权查看人员访问。
          </p>
          <div class="mt-6 border-t border-[var(--el-border-color-lighter)] pt-5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-[var(--el-text-color-primary)]">申请记录</h3>
              <ElButton v-if="historyError" link type="primary" @click="loadHistory">重试</ElButton>
            </div>
            <p v-if="historyLoading" class="mt-3 text-sm text-[var(--el-text-color-secondary)]"
              >正在读取申请记录…</p
            >
            <p v-else-if="historyError" class="mt-3 text-sm text-[var(--el-color-danger)]"
              >申请记录加载失败，请重试。</p
            >
            <ol v-else class="mt-3 grid gap-2">
              <li
                v-for="entry in history"
                :key="entry.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--el-border-color-lighter)] px-3 py-2"
              >
                <span class="text-sm text-[var(--el-text-color-primary)]"
                  >{{ formatWithDayjs(entry.submittedAt) }} ·
                  {{ statusLabel(entry.status, false, entry.section) }}</span
                >
                <span class="text-xs text-[var(--el-text-color-secondary)]">{{
                  entry.reviewNote ||
                  (entry.reviewedAt ? `审核于 ${formatWithDayjs(entry.reviewedAt)}` : '待审核')
                }}</span>
              </li>
            </ol>
          </div>
        </template>
        <ArtEmptyState
          v-else
          class="my-8"
          title="暂无认证申请"
          description="提交该类资料后，可在这里查看申请和审核状态。"
          :visual-size="80"
          size="compact"
        />
      </div>
      <ArtEmptyState
        v-else
        title="暂无公司认证查看权限"
        description="请联系管理员在角色权限中授权公司认证查看。"
      />
    </ArtSectionCard>

    <ArtDialog ref="dialogRef" size="xl" :on-confirm="submitApplication">
      <ElAlert
        v-if="activeSection === 'account' || activeSection === 'e_signature'"
        class="mb-5"
        :title="
          activeSection === 'account'
            ? '当前仅受理开户资料，钱包开立与线上电子签需等待服务接入。'
            : '当前仅受理企业电子签资料，身份验证和正式签章需等待服务接入。'
        "
        type="info"
        show-icon
        :closable="false"
      />
      <ArtForm
        :model-value="forms[activeSection]"
        :items="[]"
        custom-layout
        label-position="top"
        :show-reset="false"
        :show-submit="false"
        class="certification-form"
      >
        <ElFormItem
          v-if="tenantScope.isAllTenants && !currentRecord"
          label="目标租户"
          required
          class="max-w-80"
        >
          <ElSelect v-model="formTenantId" placeholder="请选择目标租户" filterable>
            <ElOption
              v-for="tenant in tenantScope.tenantOptions"
              :key="tenant.id"
              :label="tenant.tenantName"
              :value="tenant.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-else-if="tenantScope.isAllTenants" label="目标租户" class="max-w-80">
          <ElInput :model-value="tenantLabel(formTenantId)" disabled />
        </ElFormItem>

        <template v-if="activeSection === 'enterprise'">
          <div class="certification-form-grid">
            <ElFormItem label="企业名称" required
              ><ElInput v-model="forms.enterprise.companyName" maxlength="100"
            /></ElFormItem>
            <ElFormItem label="企业简称" required
              ><ElInput v-model="forms.enterprise.shortName" maxlength="50"
            /></ElFormItem>
            <ElFormItem label="统一社会信用代码" required
              ><ElInput v-model="forms.enterprise.socialCreditCode" maxlength="18"
            /></ElFormItem>
            <ElFormItem label="注册资本（万元）"
              ><ElInput v-model="forms.enterprise.registeredCapital" maxlength="18"
            /></ElFormItem>
            <ElFormItem label="法定代表人" required
              ><ElInput v-model="forms.enterprise.legalRepresentative" maxlength="40"
            /></ElFormItem>
            <ElFormItem label="法定代表人身份证号" required
              ><ElInput
                v-model="forms.enterprise.legalRepresentativeIdNo"
                maxlength="18"
                autocomplete="off"
            /></ElFormItem>
            <ElFormItem label="营业期限"
              ><div class="flex w-full items-center gap-3"
                ><ElDatePicker
                  v-model="forms.enterprise.businessLicenseExpiresOn"
                  type="date"
                  value-format="YYYY-MM-DD"
                  :disabled="forms.enterprise.businessLicenseLongTerm"
                  class="min-w-0 flex-1!"
                /><ElCheckbox v-model="forms.enterprise.businessLicenseLongTerm"
                  >长期有效</ElCheckbox
                ></div
              ></ElFormItem
            >
            <ElFormItem label="身份证有效期"
              ><div class="flex w-full items-center gap-3"
                ><ElDatePicker
                  v-model="forms.enterprise.legalIdExpiresOn"
                  type="date"
                  value-format="YYYY-MM-DD"
                  :disabled="forms.enterprise.legalIdLongTerm"
                  class="min-w-0 flex-1!"
                /><ElCheckbox v-model="forms.enterprise.legalIdLongTerm">长期有效</ElCheckbox></div
              ></ElFormItem
            >
            <ElFormItem label="邀请码"
              ><ElInput v-model="forms.enterprise.invitationCode" maxlength="40"
            /></ElFormItem>
            <ElFormItem label="法定代表人详细地址"
              ><ElInput v-model="forms.enterprise.legalAddress" maxlength="200"
            /></ElFormItem>
          </div>
          <div class="certification-upload-grid">
            <ElFormItem label="营业执照" required
              ><ArtUploadImage
                v-model="forms.enterprise.businessLicenseUrl"
                title="营业执照"
                :limit="1"
                :resource-tenant-id="formTenantId"
                :upload-request="uploadImage"
                :show-resource-picker="false"
            /></ElFormItem>
            <ElFormItem label="身份证人像面" required
              ><ArtUploadImage
                v-model="forms.enterprise.idFrontUrl"
                title="身份证人像面"
                :limit="1"
                :resource-tenant-id="formTenantId"
                :upload-request="uploadImage"
                :show-resource-picker="false"
            /></ElFormItem>
            <ElFormItem label="身份证国徽面" required
              ><ArtUploadImage
                v-model="forms.enterprise.idBackUrl"
                title="身份证国徽面"
                :limit="1"
                :resource-tenant-id="formTenantId"
                :upload-request="uploadImage"
                :show-resource-picker="false"
            /></ElFormItem>
          </div>
        </template>

        <template v-else-if="activeSection === 'authorization'">
          <div class="certification-form-grid">
            <ElFormItem label="被授权人姓名" required
              ><ElInput v-model="forms.authorization.authorizerName" maxlength="40"
            /></ElFormItem>
            <ElFormItem label="被授权人身份证号" required
              ><ElInput
                v-model="forms.authorization.authorizedPersonIdNo"
                maxlength="18"
                autocomplete="off"
            /></ElFormItem>
          </div>
          <div class="certification-upload-grid">
            <ElFormItem label="授权委托书" required
              ><ArtUploadImage
                v-model="forms.authorization.authorizationUrl"
                title="授权委托书"
                :limit="1"
                :resource-tenant-id="formTenantId"
                :upload-request="uploadImage"
                :show-resource-picker="false"
            /></ElFormItem>
            <ElFormItem label="身份证人像面" required
              ><ArtUploadImage
                v-model="forms.authorization.idFrontUrl"
                title="身份证人像面"
                :limit="1"
                :resource-tenant-id="formTenantId"
                :upload-request="uploadImage"
                :show-resource-picker="false"
            /></ElFormItem>
            <ElFormItem label="身份证国徽面" required
              ><ArtUploadImage
                v-model="forms.authorization.idBackUrl"
                title="身份证国徽面"
                :limit="1"
                :resource-tenant-id="formTenantId"
                :upload-request="uploadImage"
                :show-resource-picker="false"
            /></ElFormItem>
          </div>
        </template>

        <template v-else-if="activeSection === 'account'">
          <div class="certification-form-grid">
            <ElFormItem label="开户许可证" required
              ><ArtUploadFile
                v-model="forms.account.openingPermitUrls"
                title="上传开户许可证"
                accept=".pdf,image/*"
                :limit="3"
                multiple
                :resource-tenant-id="formTenantId"
                :upload-request="uploadDocument"
                :show-resource-picker="false"
                :file-size="15 * 1024 * 1024"
            /></ElFormItem>
            <ElFormItem label="线上支付确认书" required
              ><ArtUploadFile
                v-model="forms.account.agreementUrls"
                title="上传已签署协议"
                accept=".pdf,image/*"
                :limit="3"
                multiple
                :resource-tenant-id="formTenantId"
                :upload-request="uploadDocument"
                :show-resource-picker="false"
                :file-size="15 * 1024 * 1024"
            /></ElFormItem>
            <ElFormItem label="联系邮箱" required
              ><ElInput v-model="forms.account.email" type="email" maxlength="120"
            /></ElFormItem>
          </div>
          <p class="text-xs text-[var(--el-text-color-secondary)]"
            >协议模板尚未由企业法务提供，当前请上传已确认的协议文件。</p
          >
        </template>

        <template v-else-if="activeSection === 'road_permit'">
          <div class="certification-form-grid">
            <ElFormItem label="业户名称" required
              ><ElInput v-model="forms.road_permit.operatorName" maxlength="100"
            /></ElFormItem>
            <ElFormItem label="许可证号" required
              ><ElInput v-model="forms.road_permit.permitNo" maxlength="80"
            /></ElFormItem>
            <ElFormItem label="有效期至" required
              ><div class="flex w-full items-center gap-3"
                ><ElDatePicker
                  v-model="forms.road_permit.expiresOn"
                  type="date"
                  value-format="YYYY-MM-DD"
                  :disabled="forms.road_permit.longTerm"
                  class="min-w-0 flex-1!"
                /><ElCheckbox v-model="forms.road_permit.longTerm">长期有效</ElCheckbox></div
              ></ElFormItem
            >
          </div>
          <ElFormItem label="道路运输经营许可证" required
            ><ArtUploadImage
              v-model="forms.road_permit.permitImageUrl"
              title="道路运输经营许可证"
              :limit="1"
              :resource-tenant-id="formTenantId"
              :upload-request="uploadImage"
              :show-resource-picker="false"
          /></ElFormItem>
        </template>

        <template v-else>
          <div class="certification-form-grid">
            <ElFormItem label="法人是签署受托人"
              ><ElRadioGroup v-model="forms.e_signature.legalIsDelegate"
                ><ElRadio :value="true">是</ElRadio
                ><ElRadio :value="false">否</ElRadio></ElRadioGroup
              ></ElFormItem
            >
            <ElFormItem label="认证方式"
              ><ElRadioGroup v-model="forms.e_signature.authMethod"
                ><ElRadio value="phone">手机号认证</ElRadio
                ><ElRadio value="face">人脸认证</ElRadio></ElRadioGroup
              ></ElFormItem
            >
            <ElFormItem label="公司名称" required
              ><ElInput v-model="forms.e_signature.companyName" maxlength="100"
            /></ElFormItem>
            <ElFormItem label="统一社会信用代码" required
              ><ElInput v-model="forms.e_signature.socialCreditCode" maxlength="18"
            /></ElFormItem>
            <ElFormItem label="法人姓名" required
              ><ElInput v-model="forms.e_signature.legalName" maxlength="40"
            /></ElFormItem>
            <ElFormItem label="身份证号" required
              ><ElInput v-model="forms.e_signature.legalIdNo" maxlength="18" autocomplete="off"
            /></ElFormItem>
            <ElFormItem label="法人手机号" required
              ><ElInput v-model="forms.e_signature.legalPhone" maxlength="11" autocomplete="off"
            /></ElFormItem>
          </div>
          <p class="text-xs text-[var(--el-text-color-secondary)]"
            >短信验证码与人脸认证需由签章服务提供；本页提交后状态仅为待审核。</p
          >
          <ElCheckbox v-model="esigAcknowledged" class="mt-3! whitespace-normal!"
            >我已知悉此处仅提交申请资料，正式电子签协议、身份核验和签章须在服务接入后另行完成。</ElCheckbox
          >
        </template>
      </ArtForm>
    </ArtDialog>

    <ArtDialog ref="reviewDialogRef" width="580px" :on-confirm="submitReview">
      <ElAlert
        class="mb-5"
        title="本次操作只审核所选申请资料。开户与电子签的服务认证结果须由外部服务返回。"
        type="info"
        show-icon
        :closable="false"
      />
      <ArtForm
        :model-value="reviewForm"
        :items="[]"
        custom-layout
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <ElFormItem label="审核结果" required>
          <ElRadioGroup v-model="reviewForm.decision">
            <ElRadio value="approved">资料通过</ElRadio>
            <ElRadio value="rejected">驳回申请</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="审核说明" :required="reviewForm.decision === 'rejected'">
          <ElInput
            v-model="reviewForm.note"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="驳回时请写明需要补正的资料"
          />
        </ElFormItem>
      </ArtForm>
    </ArtDialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { formatWithDayjs } from '@/utils/time'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import {
    fetchCompanyCertification,
    fetchCompanyCertificationHistory,
    reviewCompanyCertification,
    submitCompanyCertification,
    uploadCompanyCertificationAttachment,
    type CertificationPayloadBySection,
    type CertificationHistoryEntry,
    type CertificationRequest,
    type CertificationSection,
    type CertificationStatus
  } from '@tms/api/modules/company-certification'

  defineOptions({ name: 'TmsCompanyCertification' })
  const sections: { key: CertificationSection; label: string; description: string }[] = [
    { key: 'enterprise', label: '企业资质信息', description: '营业执照、法人身份与企业基本信息。' },
    { key: 'authorization', label: '授权委托书', description: '被授权人身份及授权凭证。' },
    { key: 'account', label: '开户认证', description: '开户许可证和线上支付确认书的申请资料。' },
    {
      key: 'road_permit',
      label: '道路运输经营许可证',
      description: '道路运输经营许可与有效期限。'
    },
    { key: 'e_signature', label: '企业电子签', description: '签章主体与认证方式申请资料。' }
  ]
  const activeSection = ref<CertificationSection>('enterprise')
  const activeMeta = computed(() => sections.find((item) => item.key === activeSection.value)!)
  const userStore = useUserStore()
  const tenantScope = useTenantScopeStore()
  const { hasAuth } = useAuth()
  const canView = computed(() => hasAuth('TmsCompanyCertification:View'))
  const canSubmit = computed(() => canView.value && hasAuth('TmsCompanyCertification:Submit'))
  const canReview = computed(
    () => userStore.isPlatformSuper && hasAuth('TmsCompanyCertification:Review')
  )
  const canViewSensitive = computed(() => hasAuth('TmsCompanyCertification:ViewSensitive'))
  const selectedTenantId = ref<string | null>(null)
  const records = ref<CertificationRequest[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  const dialogRef = ref<ArtDialogExpose>()
  const reviewDialogRef = ref<ArtDialogExpose>()
  const formTenantId = ref('')
  const submitting = ref(false)
  const reviewing = ref(false)
  const reviewRequestId = ref('')
  const reviewForm = reactive<{ decision: 'approved' | 'rejected'; note: string }>({
    decision: 'approved',
    note: ''
  })
  const esigAcknowledged = ref(false)
  const history = ref<CertificationHistoryEntry[]>([])
  const historyLoading = ref(false)
  const historyError = ref(false)
  let historySequence = 0

  const uploadImage = (file: File) =>
    uploadCompanyCertificationAttachment(file, formTenantId.value, 'image')
  const uploadDocument = (file: File) =>
    uploadCompanyCertificationAttachment(file, formTenantId.value, 'document')

  const emptyForms = (): CertificationPayloadBySection => ({
    enterprise: {
      companyName: '',
      shortName: '',
      socialCreditCode: '',
      registeredCapital: '',
      legalRepresentative: '',
      legalRepresentativeIdNo: '',
      businessLicenseExpiresOn: null,
      businessLicenseLongTerm: false,
      businessLicenseUrl: '',
      idFrontUrl: '',
      idBackUrl: '',
      legalIdExpiresOn: null,
      legalIdLongTerm: false,
      invitationCode: '',
      legalAddress: ''
    },
    authorization: {
      authorizerName: '',
      authorizedPersonIdNo: '',
      authorizationUrl: '',
      idFrontUrl: '',
      idBackUrl: ''
    },
    account: { openingPermitUrls: [], agreementUrls: [], email: '', agreementMode: 'upload' },
    road_permit: {
      operatorName: '',
      permitNo: '',
      expiresOn: null,
      longTerm: false,
      permitImageUrl: ''
    },
    e_signature: {
      legalIsDelegate: true,
      companyName: '',
      socialCreditCode: '',
      legalName: '',
      legalIdNo: '',
      authMethod: 'phone',
      legalPhone: ''
    }
  })
  const forms = reactive<CertificationPayloadBySection>(emptyForms())
  const tenantCount = computed(() => new Set(records.value.map((item) => item.tenantId)).size)
  const sectionRecords = computed(() =>
    records.value.filter((item) => item.section === activeSection.value)
  )
  const readTenantId = computed(() =>
    tenantScope.isAllTenants ? selectedTenantId.value : tenantScope.effectiveTenantId
  )
  const currentRecord = computed(() =>
    readTenantId.value
      ? sectionRecords.value.find((item) => item.tenantId === readTenantId.value)
      : undefined
  )
  const isProviderSection = computed(
    () => activeSection.value === 'account' || activeSection.value === 'e_signature'
  )
  const tenantLabel = (tenantId: string): string =>
    tenantScope.tenantOptions.find((item) => item.id === tenantId)?.tenantName || tenantId

  function statusLabel(
    status?: CertificationStatus,
    effectiveCertified?: boolean,
    section: CertificationSection = activeSection.value
  ): string {
    if (effectiveCertified && status === 'pending') return '已认证 · 变更审核中'
    if (effectiveCertified && status === 'rejected') return '已认证 · 变更未通过'
    if (effectiveCertified) return '已认证'
    if (status === 'approved')
      return section === 'account' || section === 'e_signature'
        ? '资料审核通过 · 待服务认证'
        : '已认证'
    if (status === 'pending') return '审核中'
    if (status === 'rejected') return '未通过'
    return '未认证'
  }
  function statusTone(
    status?: CertificationStatus,
    effectiveCertified?: boolean
  ): 'success' | 'warning' | 'danger' | 'info' {
    if (effectiveCertified) return 'success'
    if (status === 'approved') return isProviderSection.value ? 'warning' : 'success'
    if (status === 'pending') return 'warning'
    if (status === 'rejected') return 'danger'
    return 'info'
  }

  async function loadRecords(): Promise<void> {
    loading.value = true
    loadError.value = false
    try {
      const result = await fetchCompanyCertification(tenantScope.effectiveTenantId)
      if (result.error) throw result.error
      records.value = result.data ?? []
    } catch (error) {
      loadError.value = true
      notifyFriendlyError(error, '认证资料加载失败，请稍后重试。')
    } finally {
      loading.value = false
    }
  }
  async function loadHistory(): Promise<void> {
    const sequence = ++historySequence
    const tenantId = readTenantId.value
    if (!tenantId || !canView.value) {
      history.value = []
      historyError.value = false
      historyLoading.value = false
      return
    }
    historyLoading.value = true
    historyError.value = false
    try {
      const result = await fetchCompanyCertificationHistory(tenantId, activeSection.value)
      if (result.error) throw result.error
      if (sequence === historySequence) history.value = result.data ?? []
    } catch (error) {
      if (sequence === historySequence) {
        historyError.value = true
        notifyFriendlyError(error, '申请记录加载失败，请重试。')
      }
    } finally {
      if (sequence === historySequence) historyLoading.value = false
    }
  }
  onMounted(() => void loadRecords())
  watch([readTenantId, activeSection, canView], () => void loadHistory(), { immediate: true })
  watch(
    () => tenantScope.effectiveTenantId,
    () => {
      selectedTenantId.value = null
      void loadRecords()
    }
  )

  const displayFields = computed(() => {
    const payload = currentRecord.value?.payload ?? {}
    const show = (key: string, label: string, value: unknown) => ({
      key,
      label,
      value: value === null || value === undefined || value === '' ? '—' : String(value)
    })
    if (activeSection.value === 'enterprise')
      return [
        show('companyName', '企业名称', payload.companyName),
        show('shortName', '企业简称', payload.shortName),
        show('socialCreditCode', '统一社会信用代码', payload.socialCreditCode),
        show('registeredCapital', '注册资本（万元）', payload.registeredCapital),
        show('legalRepresentative', '法定代表人', payload.legalRepresentative),
        show('legalRepresentativeIdNo', '法人身份证号', payload.legalRepresentativeIdNo),
        show(
          'businessLicenseExpiresOn',
          '营业期限',
          payload.businessLicenseLongTerm ? '长期有效' : payload.businessLicenseExpiresOn
        ),
        show(
          'legalIdExpiresOn',
          '身份证有效期',
          payload.legalIdLongTerm ? '长期有效' : payload.legalIdExpiresOn
        ),
        show('legalAddress', '法定代表人地址', payload.legalAddress)
      ]
    if (activeSection.value === 'authorization')
      return [
        show('authorizerName', '被授权人姓名', payload.authorizerName),
        show('authorizedPersonIdNo', '被授权人身份证号', payload.authorizedPersonIdNo)
      ]
    if (activeSection.value === 'account')
      return [
        show('email', '联系邮箱', payload.email),
        show('agreementMode', '确认书方式', '上传协议')
      ]
    if (activeSection.value === 'road_permit')
      return [
        show('operatorName', '业户名称', payload.operatorName),
        show('permitNo', '许可证号', payload.permitNo),
        show('expiresOn', '有效期至', payload.longTerm ? '长期有效' : payload.expiresOn)
      ]
    return [
      show('companyName', '公司名称', payload.companyName),
      show('socialCreditCode', '统一社会信用代码', payload.socialCreditCode),
      show('legalName', '法人姓名', payload.legalName),
      show('legalIdNo', '身份证号', payload.legalIdNo),
      show('legalPhone', '法人手机号', payload.legalPhone),
      show('authMethod', '认证方式', payload.authMethod === 'face' ? '人脸认证' : '手机号认证')
    ]
  })

  const displayAttachments = computed(() => {
    const payload = currentRecord.value?.payload ?? {}
    const image = (label: string, value?: string) =>
      value ? { label, kind: 'image' as const, value, values: [] } : null
    const files = (label: string, values?: string[]) =>
      values?.length ? { label, kind: 'file' as const, value: '', values } : null
    const items =
      activeSection.value === 'enterprise'
        ? [
            image('营业执照', payload.businessLicenseUrl),
            image('身份证人像面', payload.idFrontUrl),
            image('身份证国徽面', payload.idBackUrl)
          ]
        : activeSection.value === 'authorization'
          ? [
              image('授权委托书', payload.authorizationUrl),
              image('身份证人像面', payload.idFrontUrl),
              image('身份证国徽面', payload.idBackUrl)
            ]
          : activeSection.value === 'account'
            ? [
                files('开户许可证', payload.openingPermitUrls),
                files('线上支付确认书', payload.agreementUrls)
              ]
            : activeSection.value === 'road_permit'
              ? [image('道路运输经营许可证', payload.permitImageUrl)]
              : []
    return items.filter((item) => item !== null)
  })

  function openApplication(): void {
    Object.assign(forms, emptyForms())
    esigAcknowledged.value = false
    // Sensitive identifiers may be masked by the read RPC; never resubmit them as if complete.
    const payload = currentRecord.value?.payload
    if (payload && activeSection.value === 'enterprise') {
      forms.enterprise.companyName = payload.companyName ?? ''
      forms.enterprise.shortName = payload.shortName ?? ''
      forms.enterprise.socialCreditCode = payload.socialCreditCode ?? ''
      forms.enterprise.registeredCapital = payload.registeredCapital ?? ''
      forms.enterprise.legalRepresentative = payload.legalRepresentative ?? ''
      forms.enterprise.businessLicenseExpiresOn = payload.businessLicenseExpiresOn ?? null
      forms.enterprise.businessLicenseLongTerm = payload.businessLicenseLongTerm ?? false
      forms.enterprise.legalIdExpiresOn = payload.legalIdExpiresOn ?? null
      forms.enterprise.legalIdLongTerm = payload.legalIdLongTerm ?? false
      forms.enterprise.invitationCode = payload.invitationCode ?? ''
      forms.enterprise.legalAddress = payload.legalAddress ?? ''
      forms.enterprise.businessLicenseUrl = payload.businessLicenseUrl ?? ''
      forms.enterprise.idFrontUrl = payload.idFrontUrl ?? ''
      forms.enterprise.idBackUrl = payload.idBackUrl ?? ''
    } else if (payload && activeSection.value === 'authorization') {
      forms.authorization.authorizerName = payload.authorizerName ?? ''
      forms.authorization.authorizationUrl = payload.authorizationUrl ?? ''
      forms.authorization.idFrontUrl = payload.idFrontUrl ?? ''
      forms.authorization.idBackUrl = payload.idBackUrl ?? ''
    } else if (payload && activeSection.value === 'account') {
      forms.account.email = payload.email ?? ''
      forms.account.openingPermitUrls = payload.openingPermitUrls ?? []
      forms.account.agreementUrls = payload.agreementUrls ?? []
    } else if (payload && activeSection.value === 'road_permit') {
      forms.road_permit.operatorName = payload.operatorName ?? ''
      forms.road_permit.permitNo = payload.permitNo ?? ''
      forms.road_permit.expiresOn = payload.expiresOn ?? null
      forms.road_permit.longTerm = payload.longTerm ?? false
      forms.road_permit.permitImageUrl = payload.permitImageUrl ?? ''
    } else if (payload && activeSection.value === 'e_signature') {
      forms.e_signature.legalIsDelegate = payload.legalIsDelegate ?? true
      forms.e_signature.companyName = payload.companyName ?? ''
      forms.e_signature.socialCreditCode = payload.socialCreditCode ?? ''
      forms.e_signature.legalName = payload.legalName ?? ''
      forms.e_signature.authMethod = payload.authMethod ?? 'phone'
    }
    formTenantId.value =
      currentRecord.value?.tenantId ||
      selectedTenantId.value ||
      tenantScope.effectiveTenantId ||
      userStore.getUserInfo.tenantId ||
      ''
    void dialogRef.value?.handleOpen(undefined, {
      title: `${currentRecord.value ? '变更申请' : '申请认证'} · ${activeMeta.value.label}`,
      subtitle: '提交后进入待审核状态，原有审核结果不会被直接改写。'
    })
  }

  function openReview(): void {
    if (!canReview.value || !currentRecord.value || currentRecord.value.status !== 'pending') return
    reviewRequestId.value = currentRecord.value.id
    reviewForm.decision = 'approved'
    reviewForm.note = ''
    void reviewDialogRef.value?.handleOpen(undefined, {
      title: `审核申请 · ${activeMeta.value.label}`,
      subtitle: currentRecord.value.tenantName || tenantLabel(currentRecord.value.tenantId),
      confirmText: '确认审核'
    })
  }

  async function submitReview(): Promise<boolean> {
    if (reviewing.value || !canReview.value || !reviewRequestId.value) return false
    if (reviewForm.decision === 'rejected' && reviewForm.note.trim().length < 5) {
      ElMessage.warning('驳回时请填写至少5字的补正原因')
      return false
    }
    reviewing.value = true
    try {
      const result = await reviewCompanyCertification(
        reviewRequestId.value,
        reviewForm.decision,
        reviewForm.note.trim()
      )
      if (result.error) throw result.error
      ElMessage.success(reviewForm.decision === 'approved' ? '申请资料审核通过' : '申请已驳回')
      await loadRecords()
      await loadHistory()
      return true
    } catch (error) {
      notifyFriendlyError(error, '审核失败，请刷新申请状态后重试。')
      return false
    } finally {
      reviewing.value = false
    }
  }

  function valid(): boolean {
    if (!formTenantId.value) {
      ElMessage.warning('请选择目标租户')
      return false
    }
    if (activeSection.value === 'enterprise') {
      const value = forms.enterprise
      if (
        !value.companyName ||
        !value.shortName ||
        !value.socialCreditCode ||
        !value.legalRepresentative ||
        !value.legalRepresentativeIdNo ||
        !value.businessLicenseUrl ||
        !value.idFrontUrl ||
        !value.idBackUrl
      ) {
        ElMessage.warning('请填写企业信息并上传必需证件')
        return false
      }
      if (!value.registeredCapital.trim() || !value.legalAddress.trim()) {
        ElMessage.warning('请填写注册资本和法定代表人详细地址')
        return false
      }
      if (!value.businessLicenseLongTerm && !value.businessLicenseExpiresOn) {
        ElMessage.warning('请选择营业执照有效期或勾选长期有效')
        return false
      }
      if (!value.legalIdLongTerm && !value.legalIdExpiresOn) {
        ElMessage.warning('请选择法人身份证有效期或勾选长期有效')
        return false
      }
    } else if (activeSection.value === 'authorization') {
      const value = forms.authorization
      if (
        !value.authorizerName ||
        !value.authorizedPersonIdNo ||
        !value.authorizationUrl ||
        !value.idFrontUrl ||
        !value.idBackUrl
      ) {
        ElMessage.warning('请填写被授权人信息并上传必需证件')
        return false
      }
    } else if (activeSection.value === 'account') {
      const value = forms.account
      if (!value.openingPermitUrls.length || !value.agreementUrls.length || !value.email) {
        ElMessage.warning('请上传开户资料并填写联系邮箱')
        return false
      }
    } else if (activeSection.value === 'road_permit') {
      const value = forms.road_permit
      if (
        !value.operatorName ||
        !value.permitNo ||
        (!value.longTerm && !value.expiresOn) ||
        !value.permitImageUrl
      ) {
        ElMessage.warning('请填写许可证信息并上传证件')
        return false
      }
    } else {
      const value = forms.e_signature
      if (!esigAcknowledged.value) {
        ElMessage.warning('请先确认已知悉电子签服务接入说明')
        return false
      }
      if (
        !value.companyName ||
        !value.socialCreditCode ||
        !value.legalName ||
        !value.legalIdNo ||
        !value.legalPhone
      ) {
        ElMessage.warning('请填写企业电子签申请资料')
        return false
      }
    }
    return true
  }

  async function submitApplication(): Promise<boolean> {
    if (submitting.value || !valid()) return false
    submitting.value = true
    try {
      const section = activeSection.value
      const result = await submitCompanyCertification(formTenantId.value, section, forms[section])
      if (result.error) throw result.error
      ElMessage.success('认证申请已提交，等待审核')
      await loadRecords()
      await loadHistory()
      return true
    } catch (error) {
      notifyFriendlyError(error, '认证申请提交失败，请检查资料后重试。')
      return false
    } finally {
      submitting.value = false
    }
  }
</script>

<style scoped lang="scss">
  .certification-tabs :deep(.el-tabs__header) {
    margin-bottom: 18px;
  }

  .certification-tenant-row {
    background: var(--default-box-color);
    border: 1px solid var(--el-border-color-lighter);
    transition:
      border-color var(--art-motion-fast),
      background-color var(--art-motion-fast);

    &:hover,
    &:focus-visible {
      background: var(--el-color-primary-light-9);
      border-color: var(--theme-color);
    }

    &:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }
  }

  .certification-form-grid,
  .certification-upload-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 20px;
  }

  .certification-upload-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-top: 10px;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  @media (width <= 700px) {
    .certification-form-grid,
    .certification-upload-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
