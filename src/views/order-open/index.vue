<template>
  <ArtPageShell
    class="order-open"
    :loading="page.loading"
    loading-mode="skeleton"
    :error="page.error"
    @retry="initializePage"
  >
    <div ref="pageRef" class="order-open__content">
      <ArtPageHeader
        title="货物运输单"
        :subtitle="
          isNewOrder ? '填写运输业务信息，保存后进入调度流程。' : '核对并更新运输业务信息。'
        "
        class="order-open__page-header"
      >
        <template #status>
          <ElTag :type="isNewOrder ? 'primary' : 'warning'" effect="plain">
            {{ isNewOrder ? '新建订单' : '编辑订单' }}
          </ElTag>
        </template>
        <template #meta>
          <div class="order-open__document-meta">
            <label class="order-open__document-number">
              <span>运单号</span>
              <ElInput
                v-if="isNewOrder && orderNumberRule && !orderNumberRule.autoEnabled"
                v-model="form.data.orderNo"
                size="small"
                maxlength="50"
                placeholder="请手工填写运单号"
              />
              <strong v-else translate="no">{{
                form.data.orderNo || orderNumberRule?.preview || '保存后自动生成'
              }}</strong>
            </label>
            <span class="order-open__time">
              <ArtSvgIcon icon="ri:calendar-line" aria-hidden="true" />
              {{ page.nowText }}
            </span>
          </div>
        </template>
      </ArtPageHeader>

      <div class="order-open__workflow" aria-label="填单模式">
        <div>
          <strong>{{ fillMode === 'guided' ? '按步骤填写' : '完整表单' }}</strong>
          <span>{{
            fillMode === 'guided' ? '依次完成收发、配置与货物信息' : '在同一页面核对全部信息'
          }}</span>
        </div>
        <ElSegmented
          v-model="fillMode"
          :options="[
            { label: '引导式', value: 'guided' },
            { label: '完整表单', value: 'full' }
          ]"
        />
      </div>
      <nav v-if="fillMode === 'guided'" class="order-open__steps" aria-label="开单步骤">
        <button
          v-for="(label, index) in stepLabels"
          :key="label"
          type="button"
          :class="{ 'is-current': step === index, 'is-complete': step > index }"
          :aria-current="step === index ? 'step' : undefined"
          @click="navigateStep(index)"
        >
          <span>{{ step > index ? '✓' : index + 1 }}</span
          ><strong>{{ label }}</strong>
        </button>
      </nav>

      <div v-show="fillMode === 'full' || step === 0">
        <ArtSectionCard
          class="order-open__section order-open__section--route"
          title="运输路线"
          subtitle="确认始发、到达与配送方式，线路信息将用于后续调度。"
          preserve-content-structure
        >
          <ArtForm
            ref="stationFormRef"
            v-model="form.data"
            :items="form.stationItems"
            :rules="form.rules"
            :span="6"
            :gutter="24"
            label-width="84px"
            root-class="order-open__form"
            :show-reset="false"
            :show-submit="false"
          />
          <div
            v-if="form.data.transferStationIds?.length"
            class="mt-4 border-t border-[var(--el-border-color-light)] pt-4"
          >
            <span class="text-xs font-semibold text-[var(--el-text-color-secondary)]"
              >中转顺序</span
            >
            <div class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="(stationId, index) in form.data.transferStationIds"
                :key="stationId"
                class="flex items-center gap-1 rounded-lg border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-light)] px-2 py-1"
              >
                <span
                  class="flex size-5 items-center justify-center rounded-full bg-[var(--el-color-primary-light-9)] text-xs text-[var(--el-color-primary)]"
                  >{{ index + 1 }}</span
                >
                <strong class="px-1 text-sm">{{
                  findStationOption('transfer', stationId)?.stationName || stationId
                }}</strong>
                <ElButton
                  text
                  size="small"
                  :disabled="index === 0"
                  @click="moveTransferStation(index, -1)"
                  >上移</ElButton
                >
                <ElButton
                  text
                  size="small"
                  :disabled="index === (form.data.transferStationIds?.length ?? 0) - 1"
                  @click="moveTransferStation(index, 1)"
                  >下移</ElButton
                >
              </div>
            </div>
          </div>
        </ArtSectionCard>

        <ArtSectionCard
          class="order-open__section order-open__section--contacts"
          title="收发信息"
          subtitle="选择客户常用地址后仍可按本次运输需要补充联系人与详细地址。"
          preserve-content-structure
        >
          <div class="order-open__contact-grid">
            <div class="order-open__contact-panel">
              <div class="order-open__contact-heading">
                <ArtSectionTitle :show-line="false" class="order-open__contact-title">
                  发货人信息
                </ArtSectionTitle>
                <div class="order-open__contact-actions">
                  <ElButton
                    v-if="canEditContactEndpoint('shipping')"
                    size="small"
                    type="primary"
                    plain
                    @click="openFavoriteRouteSelector"
                  >
                    <ArtSvgIcon icon="ri:route-line" />
                    选择线路
                  </ElButton>
                  <ElButton
                    v-if="canEditContactEndpoint('shipping')"
                    size="small"
                    @click="openCustomerSelector('shipping')"
                  >
                    <ArtSvgIcon icon="ri:map-pin-2-line" />
                    选择地址
                  </ElButton>
                </div>
              </div>
              <ArtForm
                ref="shippingFormRef"
                v-model="form.data"
                :items="form.shippingItems"
                :rules="form.rules"
                :span="24"
                label-width="88px"
                root-class="order-open__form"
                :show-reset="false"
                :show-submit="false"
              />
              <ArtAddressPicker
                v-if="canViewOrderField('shipperAddress')"
                v-model:region-path="form.data.shippingRegionPath"
                v-model:address-detail="form.data.shippingAddressDetail"
                v-model:longitude="form.data.shippingLongitude"
                v-model:latitude="form.data.shippingLatitude"
                :region-api="fetchRegionOptions"
                detail-label="发货地址"
                :detail-span="24"
                label-width="auto"
                :disabled="!canEditOrderField('shipperAddress')"
                hide-region-selector
                show-coordinate-hint
              />
            </div>

            <div class="order-open__swap">
              <ArtIconButton
                v-if="canEditContactEndpoint('shipping') && canEditContactEndpoint('receiving')"
                icon="ri:arrow-left-right-line"
                label="交换发货人与收货人"
                @click="swapContacts"
              />
            </div>

            <div class="order-open__contact-panel">
              <div class="order-open__contact-heading">
                <ArtSectionTitle :show-line="false" class="order-open__contact-title">
                  收货人信息
                </ArtSectionTitle>
                <ElButton
                  v-if="canEditContactEndpoint('receiving')"
                  size="small"
                  @click="openCustomerSelector('receiving')"
                >
                  <ArtSvgIcon icon="ri:map-pin-2-line" />
                  选择地址</ElButton
                >
              </div>
              <ArtForm
                ref="receivingFormRef"
                v-model="form.data"
                :items="form.receivingItems"
                :rules="form.rules"
                :span="24"
                label-width="88px"
                root-class="order-open__form"
                :show-reset="false"
                :show-submit="false"
              />
              <ArtAddressPicker
                v-if="canViewOrderField('receiverAddress')"
                v-model:region-path="form.data.receivingRegionPath"
                v-model:address-detail="form.data.receivingAddressDetail"
                v-model:longitude="form.data.receivingLongitude"
                v-model:latitude="form.data.receivingLatitude"
                :region-api="fetchRegionOptions"
                detail-label="收货地址"
                :detail-span="24"
                label-width="auto"
                :disabled="!canEditOrderField('receiverAddress')"
                hide-region-selector
                show-coordinate-hint
              />
            </div>
          </div>
          <div
            class="my-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] px-4 py-3"
          >
            <div class="min-w-0">
              <strong class="text-sm text-[var(--el-text-color-primary)]">关联客户合同</strong>
              <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]">
                {{
                  contractSummary
                    ? `${contractSummary.contractNo} · ${contractSummary.contractName}`
                    : form.data.contractId
                      ? '已关联合同，摘要暂不可用；可重新选择或移除'
                      : '可选一份与发货客户一致的有效合同'
                }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <ElButton v-if="form.data.contractId" size="small" @click="clearOrderContract"
                >移除关联</ElButton
              >
              <ElButton
                size="small"
                type="primary"
                plain
                :disabled="!form.data.shippingCustomerId"
                @click="openOrderContractSelector"
              >
                {{ form.data.contractId ? '更换合同' : '选择合同' }}
              </ElButton>
            </div>
          </div>
          <div class="order-open__journey">
            <div class="order-open__journey-heading"
              ><div><strong>行程计划</strong><span>地图选点后自动估算驾车距离</span></div>
              <ElButton
                v-if="canEstimateDistance"
                link
                type="primary"
                :loading="distanceLoading"
                @click="calculateDistance"
                >重新计算公里数</ElButton
              ></div
            >
            <div class="order-open__journey-grid">
              <label
                >公里数
                <ElInput
                  :model-value="form.data.distanceKm == null ? '' : `${form.data.distanceKm} km`"
                  readonly
                  :placeholder="distanceStatus"
              /></label>
              <label
                >发货时间
                <ElDatePicker
                  v-model="form.data.departureAt"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ssZ"
                  placeholder="请选择发货时间"
                  class="w-full!"
              /></label>
              <label
                >到货时间
                <ElDatePicker
                  v-model="form.data.arrivalAt"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ssZ"
                  placeholder="请选择到货时间"
                  class="w-full!"
              /></label>
            </div>
          </div>
        </ArtSectionCard>
      </div>

      <div v-show="fillMode === 'full' || step === 1">
        <ArtSectionCard
          class="order-open__section"
          title="配置信息"
          subtitle="零担与整车分别配置车型、计费规则和交接要求。"
          preserve-content-structure
        >
          <OrderConfig
            ref="configRef"
            v-model="form.data.orderConfig"
            :can-edit-attachments="canEditOrderField('proofAttachments')"
            :resource-tenant-id="form.data.tenantId || defaultWriteTenantId || ''"
          />
        </ArtSectionCard>
      </div>

      <div v-show="fillMode === 'full' || step === 2">
        <ArtSectionCard class="order-open__section" preserve-content-structure>
          <template #header
            ><div class="order-open__section-header">
              <ArtSectionTitle :show-line="false">货物信息</ArtSectionTitle>
              <div class="order-open__section-actions">
                <ElButton
                  v-if="canEditOrderField('cargoPricing')"
                  plain
                  @click="openContractDetailSelector"
                >
                  <template #icon><ArtSvgIcon icon="ri:file-list-3-line" /></template>
                  批量选合同明细
                </ElButton>
                <ElButton plain :icon="Collection" @click="openCargoSelector">批量选货物</ElButton>
                <ElButton type="primary" plain :icon="Plus" @click="addCargoItem">添加</ElButton>
              </div>
            </div></template
          >
          <ArtTable
            :data="form.cargoItems"
            :columns="form.cargoColumns"
            :pagination="undefined"
            :show-table-header="false"
            table-layout="fixed"
            empty-height="160px"
            empty-text="尚未添加货物"
            empty-description="可选择常用货物或手动添加货物明细"
          />
          <div class="order-open__cargo-summary">
            <span>总数量：{{ form.cargoQuantityText }}</span>
            <span>总重量：{{ form.cargoWeightText }}kg</span>
            <span>总体积：{{ form.cargoVolumeText }}方</span>
          </div>
        </ArtSectionCard>
      </div>

      <ArtSectionCard
        v-show="fillMode === 'full' || step === 2"
        class="order-open__section"
        preserve-content-structure
        title="结算信息"
        subtitle="集中维护本单应收费用、款项分配与结算方式。"
      >
        <div class="order-open__settlement-grid">
          <section v-if="canViewOrderField('freightAmounts')" class="order-open__settlement-panel">
            <header class="order-open__panel-heading">
              <span class="order-open__panel-icon is-receivable" aria-hidden="true">
                <ArtSvgIcon icon="ri:money-cny-circle-line" />
              </span>
              <div>
                <strong>应收运费</strong>
                <small>录入本单运输及附加服务费用</small>
              </div>
            </header>
            <ArtForm
              ref="feeFormRef"
              v-model="form.data"
              :items="form.feeItems"
              :span="12"
              :gutter="14"
              label-width="76px"
              root-class="order-open__form order-open__form--settlement"
              :show-reset="false"
              :show-submit="false"
            />
            <footer class="order-open__panel-total">
              <span>应收运费合计</span>
              <strong>￥{{ form.totalFeeText }}</strong>
            </footer>
          </section>

          <section
            v-if="canViewOrderField('settlementAmounts')"
            class="order-open__settlement-panel"
          >
            <header class="order-open__panel-heading">
              <span class="order-open__panel-icon is-allocation" aria-hidden="true">
                <ArtSvgIcon icon="ri:wallet-3-line" />
              </span>
              <div>
                <strong>款项分配</strong>
                <small>拆分现付、到付、月结与代收款项</small>
              </div>
            </header>
            <ArtForm
              ref="paymentFormRef"
              v-model="form.data"
              :items="form.paymentItems"
              :span="12"
              :gutter="14"
              label-width="76px"
              root-class="order-open__form order-open__form--settlement"
              :show-reset="false"
              :show-submit="false"
            />
            <footer class="order-open__panel-total">
              <span>款项分配合计</span>
              <strong>￥{{ form.paymentTotalText }}</strong>
            </footer>
          </section>

          <section class="order-open__settlement-panel order-open__settlement-panel--summary">
            <header class="order-open__panel-heading">
              <span class="order-open__panel-icon is-summary" aria-hidden="true">
                <ArtSvgIcon icon="ri:file-list-3-line" />
              </span>
              <div>
                <strong>结算方式</strong>
                <small>确认付款口径与货物声明价值</small>
              </div>
            </header>
            <ArtForm
              ref="settlementFormRef"
              v-model="form.data"
              :items="form.settlementItems"
              :rules="form.rules"
              :span="24"
              label-width="76px"
              root-class="order-open__form order-open__form--settlement-summary"
              :show-reset="false"
              :show-submit="false"
            />
            <dl class="order-open__settlement-overview">
              <div>
                <dt>当前付款方式</dt>
                <dd>{{ form.paymentMethodLabel || '待选择' }}</dd>
              </div>
              <div v-if="canViewOrderField('freightAmounts')">
                <dt>本单应收</dt>
                <dd>￥{{ form.totalFeeText }}</dd>
              </div>
              <div v-if="canViewOrderField('settlementAmounts')">
                <dt>已分配款项</dt>
                <dd>￥{{ form.paymentTotalText }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        v-show="fillMode === 'full' || step === 1"
        class="order-open__section"
        preserve-content-structure
        title="运输信息"
        subtitle="补充运输方式、业务备注与随单图片，便于调度和现场人员核对。"
      >
        <div class="order-open__transport-grid">
          <section class="order-open__transport-panel">
            <ArtSectionTitle :show-line="false">运输方式与备注</ArtSectionTitle>
            <ArtForm
              ref="otherFormRef"
              v-model="form.data"
              :items="form.otherItems"
              :span="24"
              label-width="80px"
              root-class="order-open__form order-open__form--transport"
              :show-reset="false"
              :show-submit="false"
            />
          </section>
          <section
            v-if="canViewOrderField('proofAttachments')"
            class="order-open__transport-panel order-open__transport-panel--upload"
          >
            <ArtSectionTitle :show-line="false">业务附件</ArtSectionTitle>
            <p>可上传货物、包装或交接凭证，最多 3 张。</p>
            <ArtUploadImage
              v-model="form.data.imageUrls"
              title="上传业务图片"
              :size="112"
              :limit="3"
              multiple
              :readonly="!canEditOrderField('proofAttachments')"
            />
          </section>
        </div>
      </ArtSectionCard>

      <ArtStickyActionBar class="order-open__footer">
        <template #summary>
          <div v-if="canViewOrderField('freightAmounts')" class="order-open__footer-total">
            <span>总运费：</span>
            <strong>￥{{ form.totalFeeText }}</strong>
            <ElPopover
              placement="top-start"
              width="280"
              trigger="click"
              popper-class="order-open-fee-popover"
            >
              <template #reference>
                <ElButton link type="primary">
                  明细 <ArtSvgIcon icon="ri:arrow-down-s-line" />
                </ElButton>
              </template>
              <div class="order-open__fee-detail">
                <div class="order-open__fee-detail-title">
                  <span>预估费用明细</span>
                </div>
                <p>实际费用按开单员揽收时称重或测量体积计算，运费四舍五入取整。</p>
                <dl>
                  <dt>基础运费</dt>
                  <dd>￥{{ formatCompactNumberValue(form.data.transportFee) }}</dd>
                  <dt>附加服务费</dt>
                  <dd>￥{{ formatCompactNumberValue(form.extraServiceFee) }}</dd>
                  <dt>计费类型</dt>
                  <dd>{{ form.paymentMethodLabel }}</dd>
                  <dt>重量</dt>
                  <dd>{{ form.cargoWeightText }}kg</dd>
                </dl>
              </div>
            </ElPopover>
            <ElButton type="info" link>查看计费标准</ElButton>
          </div>
        </template>

        <div class="order-open__footer-actions order-open__footer-actions--desktop">
          <ElButton v-if="fillMode === 'guided' && step > 0" size="large" @click="step -= 1"
            >上一步</ElButton
          >
          <ElButton
            v-if="fillMode === 'guided' && step < 2"
            size="large"
            type="primary"
            @click="nextStep"
            >下一步</ElButton
          >
          <ElButton
            v-if="fillMode === 'full' || step === 2"
            v-auth="'TmsOrderOpen:Create'"
            size="large"
            type="primary"
            :loading="page.saving"
            @click="handleSaveOnly"
          >
            {{ isNewOrder ? '仅开单' : '保存修改' }}
          </ElButton>
          <ElButton
            v-auth="'TmsOrderOpen:AiFill'"
            size="large"
            type="primary"
            plain
            @click="openAiOrderDrawer"
          >
            AI智能填单
          </ElButton>
          <ElButton
            v-auth="'TmsOrderOpen:PrintWaybill'"
            size="large"
            plain
            @click="openPrintDialog('waybill')"
          >
            打印运单
          </ElButton>
          <ElButton
            v-auth="'TmsOrderOpen:PrintLabel'"
            size="large"
            plain
            @click="openPrintDialog('label')"
          >
            打印标签
          </ElButton>
          <ElButton
            v-auth="'TmsOrderOpen:DoublePrint'"
            size="large"
            plain
            @click="handleDoublePrint"
            >双打</ElButton
          >
        </div>

        <div class="order-open__footer-actions order-open__footer-actions--mobile">
          <ElButton v-if="fillMode === 'guided' && step > 0" size="large" @click="step -= 1"
            >上一步</ElButton
          >
          <ElButton
            v-if="fillMode === 'guided' && step < 2"
            size="large"
            type="primary"
            @click="nextStep"
            >下一步</ElButton
          >
          <ElButton
            v-if="fillMode === 'full' || step === 2"
            v-auth="'TmsOrderOpen:Create'"
            size="large"
            type="primary"
            :loading="page.saving"
            @click="handleSaveOnly"
          >
            {{ isNewOrder ? '仅开单' : '保存修改' }}
          </ElButton>
          <ElDropdown
            v-if="hasFooterSecondaryActions"
            trigger="click"
            @command="handleFooterCommand"
          >
            <ElButton size="large" plain>
              更多操作
              <ArtSvgIcon icon="ri:arrow-down-s-line" />
            </ElButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem v-if="hasAuth('TmsOrderOpen:AiFill')" command="ai">
                  AI 智能填单
                </ElDropdownItem>
                <ElDropdownItem v-if="hasAuth('TmsOrderOpen:PrintWaybill')" command="print-waybill">
                  打印运单
                </ElDropdownItem>
                <ElDropdownItem v-if="hasAuth('TmsOrderOpen:PrintLabel')" command="print-label">
                  打印标签
                </ElDropdownItem>
                <ElDropdownItem v-if="hasAuth('TmsOrderOpen:DoublePrint')" command="double-print">
                  双打
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </ArtStickyActionBar>

      <component
        :is="customerSelectorComponent"
        v-if="customerSelectorComponent"
        ref="customerDialogRef"
        @select="handleCustomerSelect"
      />
      <component
        :is="favoriteRouteSelectorComponent"
        v-if="favoriteRouteSelectorComponent"
        ref="favoriteRouteDialogRef"
        @select="handleFavoriteRouteSelect"
      />
      <component
        :is="printDialogComponent"
        v-if="printDialogComponent"
        ref="printDialogRef"
        @confirm="handlePrintConfirm"
      />
      <component
        :is="contractDetailSelectorComponent"
        v-if="contractDetailSelectorComponent"
        ref="contractDetailSelectorRef"
        @confirm="handleContractDetailSelectorConfirm"
      />
      <component
        :is="orderContractSelectorComponent"
        v-if="orderContractSelectorComponent"
        ref="orderContractSelectorRef"
        @select="handleOrderContractSelect"
      />
      <component
        :is="cargoSelectorComponent"
        v-if="cargoSelectorComponent"
        ref="cargoSelectorRef"
        @confirm="handleCargoSelectorConfirm"
      />
      <component
        :is="aiOrderDrawerComponent"
        v-if="aiOrderDrawerComponent"
        ref="aiOrderDrawerRef"
        @apply="handleAiOrderApply"
      />
    </div>
  </ArtPageShell>
</template>

<script setup lang="tsx">
  import { normalizeNullableNumber } from '@/utils/form/normalize'
  import { normalizeCoordinatePair } from '@/utils/geo'

  import { getScrollBehavior } from '@/utils/ui/scroll'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import { useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
  import dayjs from 'dayjs'
  import { cloneDeep, isNil, round } from 'lodash-es'
  import type { FormRules } from 'element-plus'
  import {
    ElAutocomplete,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElOption,
    ElSelect
  } from 'element-plus'
  import { Collection, Plus } from '@element-plus/icons-vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import { fetchRegionOptions } from '@/api/region-options'
  import { useAmapDrivingEstimate } from '@/hooks/core/useAmapDrivingEstimate'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { useAmapGeocoder } from '@/hooks/core/useAmapGeocoder'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    useDictionaryOptions,
    type DictionarySelectOption
  } from '@/hooks/core/useDictionaryOptions'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import type { ColumnOption } from '@/types'
  import { formatNameCodeOption } from '@/utils/form'
  import {
    isReadableFieldAccess,
    canEditField,
    canViewField,
    getFieldAccess
  } from '@/utils/field-permission'
  import {
    addOrder,
    editOrder,
    fetchCargoList,
    fetchCustomerDefaultAddress,
    fetchCustomerPriceList,
    fetchOrderDetail,
    fetchOrderContractSummary,
    fetchStationOptions,
    reviewAiOrderArtifact
  } from '@tms/api'
  import { fetchDocumentNumberRulesByKeys } from '@/api/document-number'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { clearFormRefsValidation, validateFormRefs } from '@/utils/form/validation'
  import { formatCompactNumberValue } from '@/utils/ui/format'
  import {
    calculateContractTransportFee,
    mergeOrderContractDetails,
    synchronizeContractCargoFreight
  } from './modules/order-contract-detail'
  import { buildAiOrderFinalPayload } from './modules/ai-order-review'
  import { mergeAiOrderConfig } from './modules/ai-order-config'
  import { printOrderWaybill } from '../modules/waybill-print'
  import type {
    AiAddressReferenceMatch,
    AiOrderApplyPayload,
    AiOrderDrawerExpose
  } from './modules/ai-order-types'
  import {
    createInitialCargoItem,
    createInitialForm,
    createInitialOrderConfig,
    createCustomerPriceBusinessPatch,
    createFavoriteRouteContactPatch,
    calculateOrderCargoSummary,
    getDictLabel,
    moneyValue,
    normalizeOrderPayload,
    parseOrderRegionPath,
    stripOrderRegionPrefix,
    textValue,
    type OrderForm
  } from './modules/order-open-model'
  import OrderConfig from './modules/order-config.vue'

  defineOptions({ name: 'TmsOrderOpen' })

  type OrderRecord = Api.Tms.Order.OrderRecord
  type CargoItem = Api.Tms.Order.CargoItem
  type CargoMaster = Api.Tms.BasicData.Cargo
  type ContractDetail = Api.Tms.BasicData.ContractDetailSelectorItem
  type OrderContractCandidate = import('@tms/api').OrderContractCandidate
  type CustomerItem = Api.Tms.Order.CustomerSelectorItem
  type CustomerAddress = Api.Tms.BasicData.CustomerAddress
  type CustomerPriceCargoItem = Api.Tms.BasicData.CustomerPriceCargoItem
  type FavoriteRoute = Api.Tms.BasicData.FavoriteRoute
  type StationOption = Api.Tms.Order.StationOption
  type SelectorMode = 'shipping' | 'receiving'
  type StationMode = 'origin' | 'destination' | 'transfer'
  type PrintKind = 'waybill' | 'label'
  type FooterCommand = 'ai' | 'print-waybill' | 'print-label' | 'double-print'
  type CargoSuggestionCallback = (items: CargoSuggestion[]) => void

  interface CargoSuggestion extends CargoMaster {
    value: string
  }

  type ContactPatch = Partial<
    Pick<
      OrderForm,
      | 'shippingCustomerId'
      | 'shippingCustomerName'
      | 'shippingAddressId'
      | 'shippingContactName'
      | 'shippingContactPhone'
      | 'shippingAddressDetail'
      | 'shippingRegionPath'
      | 'shippingLongitude'
      | 'shippingLatitude'
      | 'receivingCustomerId'
      | 'receivingCustomerName'
      | 'receivingAddressId'
      | 'receivingContactName'
      | 'receivingContactPhone'
      | 'receivingAddressDetail'
      | 'receivingRegionPath'
      | 'receivingLongitude'
      | 'receivingLatitude'
    >
  >

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: (props?: string | string[]) => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  interface ConfigExpose {
    validate: () => Promise<boolean>
  }

  interface CustomerSelectorExpose {
    handleOpen: (mode: SelectorMode) => Promise<void>
  }

  interface FavoriteRouteSelectorExpose {
    handleOpen: () => Promise<void>
  }

  interface PrintDialogExpose {
    handleOpen: (data: { kind: PrintKind; cargoQuantity: number }) => Promise<void>
  }

  interface CargoSelectorExpose {
    open: () => Promise<void>
  }

  interface ContractDetailSelectorExpose {
    open: (contractId: string) => Promise<void>
  }

  interface OrderContractSelectorExpose {
    open: (customerId: string) => Promise<void>
  }

  interface PageGroup {
    loading: boolean
    saving: boolean
    nowText: ComputedRef<string>
    error: Error | null
  }

  interface CargoSummary {
    quantity: number
    weight: number
    volume: number
  }

  interface AiAddressCoordinateResolution {
    patch: ContactPatch
    failed: boolean
  }

  interface FormGroup {
    data: OrderForm
    stationCaches: Record<StationMode, StationOption[]>
    deliveryMethodOptions: DictionarySelectOption[]
    paymentMethodOptions: DictionarySelectOption[]
    transportModeOptions: DictionarySelectOption[]
    cargoUnitOptions: DictionarySelectOption[]
    stationItems: ComputedRef<FormItem[]>
    shippingItems: ComputedRef<FormItem[]>
    receivingItems: ComputedRef<FormItem[]>
    feeItems: ComputedRef<FormItem[]>
    paymentItems: ComputedRef<FormItem[]>
    settlementItems: ComputedRef<FormItem[]>
    otherItems: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<OrderForm>>
    cargoColumns: ComputedRef<ColumnOption<CargoItem>[]>
    cargoItems: ComputedRef<CargoItem[]>
    cargoSummary: ComputedRef<CargoSummary>
    extraServiceFee: ComputedRef<number>
    paymentMethodLabel: ComputedRef<string>
    cargoQuantityText: ComputedRef<string>
    cargoWeightText: ComputedRef<string>
    cargoVolumeText: ComputedRef<string>
    totalFeeText: ComputedRef<string>
    paymentTotalText: ComputedRef<string>
  }

  const pageRef = ref<HTMLElement>()
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const { brandName, websiteConfig } = useWebsiteConfig()
  const { hasAuth, hasAnyAuth } = useAuth()
  const { geocodeAddress } = useAmapGeocoder()
  const { estimateDrivingRoute } = useAmapDrivingEstimate()
  const loadTypeOptions = useDictionaryOptions('tmsOrderLoadType')
  const billingModeOptions = useDictionaryOptions('tmsOrderBillingMode')
  const cargoCategoryOptions = useDictionaryOptions('tmsOrderCargoCategory')
  const packagingOptions = useDictionaryOptions('tmsOrderPackaging')
  const transportRequirementOptions = useDictionaryOptions('tmsOrderTransportRequirement')
  const trackingMethodOptions = useDictionaryOptions('tmsOrderTrackingMethod')
  const { component: customerSelectorComponent, load: loadCustomerSelector } = useLazyComponent(
    () => import('./modules/customer-selector-dialog.vue')
  )
  const { component: favoriteRouteSelectorComponent, load: loadFavoriteRouteSelector } =
    useLazyComponent(() => import('./modules/favorite-route-selector-dialog.vue'))
  const { component: printDialogComponent, load: loadPrintDialog } = useLazyComponent(
    () => import('./modules/print-count-dialog.vue')
  )
  const { component: contractDetailSelectorComponent, load: loadContractDetailSelector } =
    useLazyComponent(() => import('./modules/contract-detail-multiple-select.vue'))
  const { component: orderContractSelectorComponent, load: loadOrderContractSelector } =
    useLazyComponent(() => import('./modules/order-contract-selector.vue'))
  const { component: cargoSelectorComponent, load: loadCargoSelector } = useLazyComponent(
    () => import('../modules/cargo-multiple-select.vue')
  )
  const { component: aiOrderDrawerComponent, load: loadAiOrderDrawer } = useLazyComponent(
    () => import('./modules/ai-order-drawer.vue')
  )
  const stationFormRef = ref<FormExpose>()
  const shippingFormRef = ref<FormExpose>()
  const receivingFormRef = ref<FormExpose>()
  const feeFormRef = ref<FormExpose>()
  const paymentFormRef = ref<FormExpose>()
  const settlementFormRef = ref<FormExpose>()
  const otherFormRef = ref<FormExpose>()
  const configRef = ref<ConfigExpose>()
  const fillMode = ref<'guided' | 'full'>('guided')
  const step = ref(0)
  const stepLabels = ['收发信息', '配置信息', '货物信息']
  const distanceLoading = ref(false)
  const distanceStatus = ref('请先在发货、收货地址地图选点')
  let distanceRequestId = 0
  const customerDialogRef = ref<CustomerSelectorExpose>()
  const favoriteRouteDialogRef = ref<FavoriteRouteSelectorExpose>()
  const printDialogRef = ref<PrintDialogExpose>()
  const cargoSelectorRef = ref<CargoSelectorExpose>()
  const contractDetailSelectorRef = ref<ContractDetailSelectorExpose>()
  const orderContractSelectorRef = ref<OrderContractSelectorExpose>()
  const contractSummary = ref<NonNullable<OrderRecord['contract']> | null>(null)
  const aiOrderDrawerRef = ref<AiOrderDrawerExpose>()
  const aiArtifactId = ref<string>()
  const initializedOrderId = ref<string>()
  const numberRules = ref<Record<string, Api.SystemManage.DocumentNumberRuleItem>>({})
  const validatedFormRefs = [stationFormRef, shippingFormRef, receivingFormRef, settlementFormRef]

  const dictCodes = [
    'tmsOrderDeliveryMethod',
    'tmsOrderPaymentMethod',
    'tmsOrderTransportMode',
    'tmsCargoUnit',
    'tmsOrderLoadType',
    'tmsOrderBillingMode',
    'tmsOrderCargoCategory',
    'tmsOrderPackaging',
    'tmsOrderTransportRequirement',
    'tmsOrderTrackingMethod',
    'commonBoolean'
  ]

  const isNewOrder = computed(() => !getOrderId())
  const hasFooterSecondaryActions = computed(() =>
    hasAnyAuth([
      'TmsOrderOpen:AiFill',
      'TmsOrderOpen:PrintWaybill',
      'TmsOrderOpen:PrintLabel',
      'TmsOrderOpen:DoublePrint'
    ])
  )
  const orderNumberRule = computed(() => numberRules.value['tms.order'])
  const canEstimateDistance = computed(
    () =>
      normalizeCoordinatePair(form.data.shippingLongitude, form.data.shippingLatitude) !== null &&
      normalizeCoordinatePair(form.data.receivingLongitude, form.data.receivingLatitude) !== null
  )

  const moneyProps = {
    min: 0,
    precision: 2,
    controlsPosition: 'right' as const,
    class: '!w-full'
  }

  const countProps = {
    min: 0,
    precision: 0,
    controlsPosition: 'right' as const,
    class: '!w-full'
  }

  const page = reactive<PageGroup>({
    loading: false,
    saving: false,
    nowText: useDateFormat(
      useNow({ scheduler: (update) => useIntervalFn(update, 1000) }),
      'YYYY/MM/DD HH:mm:ss'
    ),
    error: null
  })

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createInitialForm(),
    stationCaches: {
      origin: [],
      destination: [],
      transfer: []
    },
    deliveryMethodOptions: useDictionaryOptions('tmsOrderDeliveryMethod'),
    paymentMethodOptions: useDictionaryOptions('tmsOrderPaymentMethod'),
    transportModeOptions: useDictionaryOptions('tmsOrderTransportMode'),
    cargoUnitOptions: useDictionaryOptions('tmsCargoUnit'),
    stationItems: computed<FormItem[]>(() => [
      {
        label: '发货站',
        key: 'originStationId',
        type: 'select',
        api: fetchStationOptions,
        resultField: 'data',
        labelField: 'stationName',
        valueField: 'id',
        labelFn: formatStationOption,
        beforeFetch: (params) => ({ ...params, stationType: 'shipping' }),
        afterFetch: (result) => syncStationOptions('origin', result),
        props: {
          filterable: true,
          clearable: true,
          placeholder: '请选择',
          onChange: (value: string) => handleStationChange('origin', value)
        }
      },
      {
        label: '到货站',
        key: 'destinationStationId',
        type: 'select',
        api: fetchStationOptions,
        resultField: 'data',
        labelField: 'stationName',
        valueField: 'id',
        labelFn: formatStationOption,
        beforeFetch: (params) => ({ ...params, stationType: 'arrival' }),
        afterFetch: (result) => syncStationOptions('destination', result),
        props: {
          filterable: true,
          clearable: true,
          placeholder: '请选择',
          onChange: (value: string) => handleStationChange('destination', value)
        }
      },
      {
        label: '中转站',
        key: 'transferStationIds',
        type: 'select',
        api: fetchStationOptions,
        resultField: 'data',
        labelField: 'stationName',
        valueField: 'id',
        labelFn: formatStationOption,
        beforeFetch: (params) => ({ ...params, stationType: 'transfer' }),
        afterFetch: (result) => syncStationOptions('transfer', result),
        props: {
          multiple: true,
          filterable: true,
          clearable: true,
          collapseTags: true,
          collapseTagsTooltip: true,
          placeholder: '选择途经站，可在下方调整顺序',
          onChange: (value: string[]) => handleTransferStationsChange(value)
        }
      },
      {
        label: '配送方式',
        key: 'deliveryMethod',
        type: 'select',
        props: { options: form.deliveryMethodOptions, placeholder: '请选择' }
      }
    ]),
    shippingItems: computed<FormItem[]>(() => [
      {
        label: '发货方',
        key: 'shippingCustomerName',
        type: 'input',
        props: { maxlength: 100, readonly: true, placeholder: '请选择发货方客户' }
      },
      {
        label: '姓名',
        key: 'shippingContactName',
        type: 'input',
        span: 12,
        props: { maxlength: 50, placeholder: '请输入发货人姓名' }
      },
      ...(canViewOrderField('shipperContact')
        ? [
            {
              label: '手机号',
              key: 'shippingContactPhone',
              type: 'input' as const,
              span: 12,
              props: {
                maxlength: 20,
                placeholder: '请输入发货人手机号',
                readonly: !canEditOrderField('shipperContact')
              }
            }
          ]
        : [])
    ]),
    receivingItems: computed<FormItem[]>(() => [
      {
        label: '收货方',
        key: 'receivingCustomerName',
        type: 'input',
        props: { maxlength: 100, readonly: true, placeholder: '请选择收货方客户' }
      },
      {
        label: '姓名',
        key: 'receivingContactName',
        type: 'input',
        span: 12,
        props: { maxlength: 50, placeholder: '请输入收货人姓名' }
      },
      ...(canViewOrderField('receiverContact')
        ? [
            {
              label: '手机号',
              key: 'receivingContactPhone',
              type: 'input' as const,
              span: 12,
              props: {
                maxlength: 20,
                placeholder: '请输入收货人手机号',
                readonly: !canEditOrderField('receiverContact')
              }
            }
          ]
        : [])
    ]),
    feeItems: computed<FormItem[]>(() => {
      const props = { ...moneyProps, disabled: !canEditOrderField('freightAmounts') }
      return [
        { label: '运费', key: 'transportFee', type: 'number', props },
        { label: '配送费', key: 'deliveryFee', type: 'number', props },
        { label: '卸货费', key: 'unloadingFee', type: 'number', props },
        { label: '回款费', key: 'collectPaymentFee', type: 'number', props },
        { label: '中转费', key: 'transferFee', type: 'number', props },
        { label: '保费', key: 'insuranceFee', type: 'number', props },
        { label: '包装费', key: 'packageFee', type: 'number', props },
        { label: '其他费用', key: 'otherFee', type: 'number', props }
      ]
    }),
    paymentItems: computed<FormItem[]>(() =>
      canViewOrderField('settlementAmounts')
        ? [
            { label: '现付', key: 'cashAmount', type: 'number' as const },
            { label: '到付', key: 'collectAmount', type: 'number' as const },
            { label: '月结', key: 'monthlyAmount', type: 'number' as const },
            { label: '代收货款', key: 'codAmount', type: 'number' as const },
            { label: '手续费', key: 'handlingFee', type: 'number' as const }
          ].map((item) => ({
            ...item,
            props: { ...moneyProps, disabled: !canEditOrderField('settlementAmounts') }
          }))
        : []
    ),
    settlementItems: computed<FormItem[]>(() => [
      {
        label: '付款方式',
        key: 'paymentMethod',
        type: 'radioGroup',
        span: 24,
        props: { options: form.paymentMethodOptions }
      },
      ...(canViewOrderField('settlementAmounts')
        ? [
            {
              label: '声明价值',
              key: 'declaredValue',
              type: 'number' as const,
              props: { ...moneyProps, disabled: !canEditOrderField('settlementAmounts') }
            }
          ]
        : [])
    ]),
    otherItems: computed<FormItem[]>(() => [
      {
        label: '运输方式',
        key: 'transportMode',
        type: 'select',
        props: { options: form.transportModeOptions, clearable: true, placeholder: '请选择' }
      },
      {
        label: '订单备注',
        key: 'orderRemark',
        type: 'textarea',
        span: 24,
        props: { maxlength: 200, placeholder: '请输入订单备注' }
      }
    ]),
    rules: computed<FormRules<OrderForm>>(() => ({
      originStationId: [{ required: true, message: '请选择发货站', trigger: 'change' }],
      destinationStationId: [{ required: true, message: '请选择到货站', trigger: 'change' }],
      deliveryMethod: [{ required: true, message: '请选择配送方式', trigger: 'change' }],
      shippingContactName: [{ required: true, message: '请输入发货人姓名', trigger: 'blur' }],
      ...(canEditOrderField('shipperContact')
        ? {
            shippingContactPhone: [
              { required: true, message: '请输入发货人手机号', trigger: 'blur' }
            ]
          }
        : {}),
      receivingContactName: [{ required: true, message: '请输入收货人姓名', trigger: 'blur' }],
      ...(canEditOrderField('receiverContact')
        ? {
            receivingContactPhone: [
              { required: true, message: '请输入收货人手机号', trigger: 'blur' }
            ]
          }
        : {}),
      paymentMethod: [{ required: true, message: '请选择付款方式', trigger: 'change' }]
    })),
    cargoColumns: computed<ColumnOption<CargoItem>[]>(() => [
      { type: 'globalIndex', label: '序号', width: 58 },
      {
        prop: 'cargoName',
        label: '货物名称',
        minWidth: 180,
        formatter: (row) => (
          <ElAutocomplete
            v-model={row.cargoName}
            aria-label="货物名称"
            fetchSuggestions={(keyword, callback) =>
              void fetchCargoSuggestions(keyword, callback as CargoSuggestionCallback)
            }
            triggerOnFocus={true}
            valueKey="value"
            maxlength={80}
            clearable
            placeholder="请选择或输入货物名称"
            onSelect={(item) => handleCargoSelect(row, item)}
          />
        )
      },
      {
        prop: 'cargoCode',
        label: '货物编码',
        width: 130,
        formatter: (row) => row.cargoCode || '-'
      },
      {
        prop: 'specModel',
        label: '规格型号',
        minWidth: 160,
        formatter: (row) => (
          <ElInput
            v-model={row.specModel}
            aria-label="规格型号"
            maxlength={100}
            placeholder="选择货物后可修改"
          />
        )
      },
      {
        prop: 'packageType',
        label: '计量单位',
        width: 150,
        formatter: (row) => (
          <ElSelect
            v-model={row.packageType}
            aria-label="计量单位"
            class="w-full!"
            clearable
            placeholder="请选择"
          >
            {form.cargoUnitOptions.map((item) => (
              <ElOption key={item.value} label={item.label} value={item.value} />
            ))}
          </ElSelect>
        )
      },
      {
        prop: 'quantity',
        label: '数量',
        width: 150,
        formatter: (row) => (
          <ElInputNumber
            v-model={row.quantity}
            aria-label="货物数量"
            {...countProps}
            precision={2}
            controls={false}
            onChange={() => handleCargoQuantityChange(row, row.quantity ?? undefined)}
          />
        )
      },
      {
        prop: 'weightKg',
        label: '重量(kg)',
        width: 150,
        formatter: (row) => (
          <ElInputNumber
            v-model={row.weightKg}
            aria-label="货物重量"
            min={0}
            precision={2}
            controls={false}
            class="w-full!"
          />
        )
      },
      {
        prop: 'volumeM3',
        label: '体积(方)',
        width: 170,
        formatter: (row) => (
          <ElInputNumber
            v-model={row.volumeM3}
            aria-label="货物体积"
            min={0}
            precision={3}
            controls={false}
            class="w-full!"
          />
        )
      },
      ...(canViewOrderField('cargoPricing')
        ? [
            {
              prop: 'unitPrice',
              label: '合同单价(元)',
              width: 145,
              formatter: (row: CargoItem) =>
                row.sourceContractId ? `¥ ${formatCompactNumberValue(row.unitPrice)}` : '-'
            },
            {
              prop: 'freight',
              label: '运费(元)',
              width: 135,
              formatter: (row: CargoItem) =>
                row.sourceContractId ? `¥ ${formatCompactNumberValue(row.freight)}` : '-'
            }
          ]
        : []),
      {
        prop: 'sourceContractNo',
        label: '来源合同',
        minWidth: 150,
        formatter: (row) => row.sourceContractNo || '-'
      },
      {
        prop: 'remark',
        label: '备注',
        minWidth: 170,
        formatter: (row) => (
          <ElInput
            v-model={row.remark}
            aria-label="货物备注"
            maxlength={200}
            placeholder="填写备注"
          />
        )
      },
      {
        prop: 'operation',
        label: '操作',
        width: 90,
        formatter: (row) => (
          <ArtButtonTable
            type="delete"
            permission="TmsOrderOpen:Create"
            label="移除货品"
            onClick={() => removeCargoItem(row)}
          />
        )
      }
    ]),
    cargoItems: computed(() => form.data.cargoItems ?? []),
    cargoSummary: computed(() => calculateOrderCargoSummary(form.data.cargoItems)),
    extraServiceFee: computed(() =>
      round(
        (normalizeNullableNumber(form.data.deliveryFee) ?? 0) +
          (normalizeNullableNumber(form.data.unloadingFee) ?? 0) +
          (normalizeNullableNumber(form.data.collectPaymentFee) ?? 0) +
          (normalizeNullableNumber(form.data.transferFee) ?? 0) +
          (normalizeNullableNumber(form.data.insuranceFee) ?? 0) +
          (normalizeNullableNumber(form.data.packageFee) ?? 0) +
          (normalizeNullableNumber(form.data.otherFee) ?? 0),
        2
      )
    ),
    paymentMethodLabel: computed(() =>
      getDictLabel(form.paymentMethodOptions, form.data.paymentMethod)
    ),
    cargoQuantityText: computed(() => formatCompactNumberValue(form.cargoSummary.quantity, 0)),
    cargoWeightText: computed(() => formatCompactNumberValue(form.cargoSummary.weight, 2)),
    cargoVolumeText: computed(() => formatCompactNumberValue(form.cargoSummary.volume, 3)),
    totalFeeText: computed(() => formatCompactNumberValue(form.data.totalFee, 2)),
    paymentTotalText: computed(() => formatCompactNumberValue(form.data.paymentTotal, 2))
  })

  const feeFields: Array<keyof OrderForm> = [
    'transportFee',
    'deliveryFee',
    'unloadingFee',
    'collectPaymentFee',
    'transferFee',
    'insuranceFee',
    'packageFee',
    'otherFee'
  ]

  const paymentFields: Array<keyof OrderForm> = [
    'cashAmount',
    'collectAmount',
    'monthlyAmount',
    'codAmount',
    'handlingFee'
  ]

  onMounted(async () => {
    await initializePage()
  })

  onActivated(() => {
    void initializePage()
  })

  watch(getOrderId, () => {
    void initializePage()
  })

  function getOrderId(): string {
    return typeof route.query.id === 'string' ? route.query.id : ''
  }

  async function initializePage(): Promise<void> {
    const orderId = getOrderId()
    if (page.loading || (initializedOrderId.value === orderId && !page.error)) return

    page.loading = true
    page.error = null
    try {
      aiArtifactId.value = undefined
      await Promise.all([
        ...dictCodes.map((code) => userStore.ensureDictLoaded(code)),
        loadNumberRules()
      ])
      if (orderId) await loadOrderDetail(orderId)
      else {
        replaceForm(createInitialForm())
        contractSummary.value = null
      }
      fillDefaultOptions()
      await nextTick()
      clearFormRefsValidation(validatedFormRefs)
      initializedOrderId.value = orderId
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('开单信息加载失败')
    } finally {
      page.loading = false
      if (getOrderId() !== orderId) void initializePage()
    }
  }

  async function loadNumberRules(): Promise<void> {
    const { data } = await fetchDocumentNumberRulesByKeys(['tms.order'])
    numberRules.value = Object.fromEntries((data ?? []).map((rule) => [rule.ruleKey, rule]))
  }

  watch(
    () => form.cargoSummary,
    (summary) => {
      Object.assign(form.data, {
        cargoQuantityTotal: summary.quantity,
        cargoWeightTotal: summary.weight,
        cargoVolumeTotal: summary.volume
      })
    },
    { immediate: true }
  )

  watch(
    () =>
      (form.data.cargoItems ?? []).map((item) => [
        item.sourceContractId,
        item.quantity,
        item.unitPrice
      ]),
    syncContractFreightTotals,
    { deep: true, immediate: true }
  )

  function syncContractFreightTotals(): void {
    const result = synchronizeContractCargoFreight(form.data.cargoItems ?? [])
    if (result.hasContractCargo && result.transportFee !== null)
      form.data.transportFee = result.transportFee
  }

  watch(
    () => feeFields.map((field) => form.data[field]),
    () => {
      form.data.totalFee = sumFields(feeFields)
    },
    { immediate: true }
  )

  watch(
    () => paymentFields.map((field) => form.data[field]),
    () => {
      form.data.paymentTotal = sumFields(paymentFields)
    },
    { immediate: true }
  )

  watch(
    () => [
      form.data.shippingLongitude,
      form.data.shippingLatitude,
      form.data.receivingLongitude,
      form.data.receivingLatitude
    ],
    () => {
      if (canEstimateDistance.value) void calculateDistance()
      else {
        distanceRequestId += 1
        form.data.distanceKm = null
        distanceStatus.value = '请先在发货、收货地址地图选点'
      }
    }
  )

  async function calculateDistance(): Promise<void> {
    const shipping = normalizeCoordinatePair(
      form.data.shippingLongitude,
      form.data.shippingLatitude
    )
    const receiving = normalizeCoordinatePair(
      form.data.receivingLongitude,
      form.data.receivingLatitude
    )
    if (!shipping || !receiving) return
    const requestId = ++distanceRequestId
    distanceLoading.value = true
    distanceStatus.value = '正在估算驾车距离…'
    try {
      const result = await estimateDrivingRoute(shipping, receiving)
      if (requestId !== distanceRequestId) return
      form.data.distanceKm = result.distanceKm
      distanceStatus.value = '高德地图估算距离'
    } catch {
      if (requestId !== distanceRequestId) return
      form.data.distanceKm = null
      distanceStatus.value = '暂未获取到路线，可重新计算'
    } finally {
      if (requestId === distanceRequestId) distanceLoading.value = false
    }
  }

  async function loadOrderDetail(id: string): Promise<void> {
    const { data } = await fetchOrderDetail(id)
    if (!data) {
      ElMessage.warning('订单不存在或无权访问')
      await router.replace({ name: 'TmsOrderList' })
      return
    }
    if (data.orderStatus !== 'pending_load') {
      ElMessage.warning('只有待配载订单可以编辑')
      await router.replace({ name: 'TmsOrderList' })
      return
    }

    replaceForm({
      ...createInitialForm(),
      ...cloneDeep(data),
      transferStationIds: data.transferStationIds?.length
        ? [...data.transferStationIds]
        : data.transferStationId
          ? [data.transferStationId]
          : [],
      cargoItems: data.cargoItems?.length ? cloneDeep(data.cargoItems) : [createInitialCargoItem()],
      imageUrls: data.imageUrls ?? [],
      orderConfig: { ...createInitialOrderConfig(), ...data.orderConfig }
    })
    contractSummary.value = null
    if (data.contractId) {
      try {
        contractSummary.value = (await fetchOrderContractSummary(id)).data ?? null
      } catch {
        // 合同摘要加载失败时仍允许核对、编辑订单；卡片展示可重选的反馈。
      }
    }
  }

  function replaceForm(nextForm: OrderForm): void {
    const clonedForm = cloneDeep(nextForm)
    form.data = {
      ...createInitialForm(),
      ...clonedForm,
      shippingAddressDetail: stripOrderRegionPrefix(
        clonedForm.shippingAddressDetail,
        clonedForm.shippingRegionPath ?? []
      ),
      receivingAddressDetail: stripOrderRegionPrefix(
        clonedForm.receivingAddressDetail,
        clonedForm.receivingRegionPath ?? []
      ),
      shippingCustomerName:
        clonedForm.shippingCustomerName || clonedForm.shippingCustomer?.customerName || '',
      receivingCustomerName:
        clonedForm.receivingCustomerName || clonedForm.receivingCustomer?.customerName || ''
    }
  }

  function fillDefaultOptions(): void {
    const patch: Partial<OrderForm> = {}
    if (!form.data.deliveryMethod && form.deliveryMethodOptions.length) {
      patch.deliveryMethod = form.deliveryMethodOptions[0]?.value || ''
    }
    if (!form.data.paymentMethod && form.paymentMethodOptions.length) {
      patch.paymentMethod = form.paymentMethodOptions[0]?.value || ''
    }
    if (!form.data.transportMode && form.transportModeOptions.length) {
      patch.transportMode = form.transportModeOptions[0]?.value || ''
    }
    Object.assign(form.data, patch)
  }

  function syncStationOptions(mode: StationMode, result: unknown): unknown {
    const data = Array.isArray(result)
      ? result
      : ((result as { data?: StationOption[] })?.data ?? [])
    const options = data as StationOption[]
    form.stationCaches[mode] = options
    updateStationSnapshot(mode)
    return result
  }

  function formatStationOption(option: Record<string, unknown>): string {
    return formatNameCodeOption(option, 'stationName', 'regionCode')
  }

  function findStationOption(
    mode: StationMode,
    stationId?: string | null
  ): StationOption | undefined {
    if (!stationId) return undefined
    return form.stationCaches[mode].find((item) => item.id === stationId)
  }

  function handleStationChange(mode: StationMode, value?: string | null): void {
    const stationIdKeyMap: Record<
      StationMode,
      'originStationId' | 'destinationStationId' | 'transferStationId'
    > = {
      origin: 'originStationId',
      destination: 'destinationStationId',
      transfer: 'transferStationId'
    }
    Object.assign(form.data, { [stationIdKeyMap[mode]]: value || null })
    updateStationSnapshot(mode)
  }

  function handleTransferStationsChange(stationIds: string[]): void {
    const ids = stationIds ?? []
    form.data.transferStationIds = ids
    form.data.transferStationId = ids[0] ?? null
    updateStationSnapshot('transfer')
  }

  function moveTransferStation(index: number, step: -1 | 1): void {
    const ids = [...(form.data.transferStationIds ?? [])]
    const nextIndex = index + step
    if (nextIndex < 0 || nextIndex >= ids.length) return
    ;[ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]
    handleTransferStationsChange(ids)
  }

  function updateStationSnapshot(mode: StationMode): void {
    const patchMap: Record<StationMode, Partial<OrderForm>> = {
      origin: {
        originStation: findStationOption('origin', form.data.originStationId)?.stationName || ''
      },
      destination: {
        destinationStation:
          findStationOption('destination', form.data.destinationStationId)?.stationName || ''
      },
      transfer: {
        transferStation:
          findStationOption('transfer', form.data.transferStationId)?.stationName || ''
      }
    }
    Object.assign(form.data, patchMap[mode])
  }

  function addCargoItem(): void {
    form.data.cargoItems = [...(form.data.cargoItems ?? []), createInitialCargoItem()]
  }

  function handleCargoQuantityChange(row: CargoItem, value?: number): void {
    form.data.cargoItems = (form.data.cargoItems ?? []).map((item) =>
      item === row ? { ...item, quantity: normalizeNullableNumber(value) } : item
    )
  }

  async function openCargoSelector(): Promise<void> {
    await loadCargoSelector()
    await cargoSelectorRef.value?.open()
  }

  async function openContractDetailSelector(): Promise<void> {
    if (!form.data.contractId) {
      ElMessage.warning('请先选择一份客户合同')
      return
    }
    await loadContractDetailSelector()
    await contractDetailSelectorRef.value?.open(form.data.contractId)
  }

  async function openOrderContractSelector(): Promise<void> {
    if (!form.data.shippingCustomerId) return
    await loadOrderContractSelector()
    await orderContractSelectorRef.value?.open(form.data.shippingCustomerId)
  }

  function clearOrderContract(): void {
    const hadPricedContractCargo = (form.data.cargoItems ?? []).some(
      (item) => item.sourceContractId && item.unitPrice != null
    )
    form.data.contractId = null
    contractSummary.value = null
    form.data.cargoItems = (form.data.cargoItems ?? []).filter((item) => !item.sourceContractId)
    if (!form.data.cargoItems.length) form.data.cargoItems = [createInitialCargoItem()]
    if (hadPricedContractCargo) form.data.transportFee = 0
  }

  function handleOrderContractSelect(contract: OrderContractCandidate): void {
    if (contract.id !== form.data.contractId) clearOrderContract()
    form.data.contractId = contract.id
    contractSummary.value = {
      id: contract.id,
      contractNo: contract.contractNo,
      contractName: contract.contractName,
      customerId: contract.customerId,
      contractStatus: 'approved'
    }
  }

  function handleContractDetailSelectorConfirm(selectedDetails: ContractDetail[]): void {
    if (
      !form.data.contractId ||
      selectedDetails.some((item) => item.contractId !== form.data.contractId)
    ) {
      ElMessage.warning('请选择当前关联合同的货物明细')
      return
    }
    const result = mergeOrderContractDetails(form.data.cargoItems ?? [], selectedDetails)
    if (!result.addedCount) return
    form.data.cargoItems = result.items
    const transportFee = calculateContractTransportFee(result.items)
    if (transportFee !== null) form.data.transportFee = transportFee
  }

  watch(
    () => form.data.shippingCustomerId,
    (current, previous) => {
      if (!page.loading && previous && current !== previous && form.data.contractId)
        clearOrderContract()
    }
  )

  function handleCargoSelectorConfirm(selectedCargoes: CargoMaster[]): void {
    const currentItems = form.data.cargoItems ?? []
    const existingNames = new Set(
      currentItems.map((item) => textValue(item.cargoName)).filter(Boolean)
    )
    const additions = selectedCargoes
      .filter((item) => item.cargoName && !existingNames.has(item.cargoName))
      .map(createCargoItemFromMaster)
    if (!additions.length) return

    const isSingleEmptyRow = currentItems.length === 1 && !textValue(currentItems[0].cargoName)
    form.data.cargoItems = isSingleEmptyRow ? additions : [...currentItems, ...additions]
  }

  function removeCargoItem(row: CargoItem): void {
    const rows = form.data.cargoItems ?? []
    if (rows.length <= 1) {
      form.data.cargoItems = [createInitialCargoItem()]
      if (row.sourceContractId) form.data.transportFee = 0
      return
    }
    form.data.cargoItems = rows.filter((item) => item !== row)
    if (row.sourceContractId) {
      const transportFee = calculateContractTransportFee(form.data.cargoItems)
      if (transportFee !== null) form.data.transportFee = transportFee
    }
  }

  async function fetchCargoSuggestions(
    keyword: string,
    callback: CargoSuggestionCallback
  ): Promise<void> {
    try {
      const result = await fetchCargoList({
        keyword: textValue(keyword),
        enabled: true,
        from: 0,
        to: 19
      })
      callback((result.data ?? []).map(createCargoSuggestion))
    } catch {
      callback([])
    }
  }

  function createCargoSuggestion(item: CargoMaster): CargoSuggestion {
    return {
      ...item,
      value: item.cargoName
    }
  }

  function createCargoItemFromMaster(cargo: CargoMaster): CargoItem {
    return {
      ...createInitialCargoItem(),
      cargoId: cargo.id ?? null,
      cargoName: cargo.cargoName,
      cargoCode: cargo.cargoCode ?? '',
      specModel: cargo.specModel ?? '',
      packageType: cargo.unit || '',
      quantity: 1,
      unit: cargo.unit || '',
      weightKg: cargo.weightKg ?? null,
      volumeM3: cargo.volumeM3 ?? null
    }
  }

  function handleCargoSelect(row: CargoItem, item: Record<string, unknown>): void {
    const wasContractCargo = Boolean(row.sourceContractId)
    const cargoName = String(item.cargoName ?? item.value ?? '')
    const unit = String(item.unit ?? '')
    const weightKg = typeof item.weightKg === 'number' ? item.weightKg : null
    const volumeM3 = typeof item.volumeM3 === 'number' ? item.volumeM3 : null
    const patch: Partial<CargoItem> = {
      cargoId: item.id ? String(item.id) : null,
      cargoName,
      cargoCode: String(item.cargoCode ?? ''),
      specModel: String(item.specModel ?? ''),
      packageType: unit || row.packageType || '',
      unit: unit || row.unit || '',
      quantity: row.quantity ?? 1,
      weightKg: weightKg ?? row.weightKg ?? null,
      volumeM3: volumeM3 ?? row.volumeM3 ?? null,
      unitPrice: null,
      freight: null,
      sourceContractId: null,
      sourceContractNo: null,
      sourceContractName: null,
      sourceContractDetailKey: null
    }
    Object.assign(row, patch)
    if (wasContractCargo) {
      const transportFee = calculateContractTransportFee(form.data.cargoItems ?? [])
      if (transportFee !== null) form.data.transportFee = transportFee
    }
  }

  async function openCustomerSelector(mode: SelectorMode): Promise<void> {
    await loadCustomerSelector()
    await customerDialogRef.value?.handleOpen(mode)
  }

  async function openFavoriteRouteSelector(): Promise<void> {
    await loadFavoriteRouteSelector()
    await favoriteRouteDialogRef.value?.handleOpen()
  }

  async function handleFavoriteRouteSelect(route: FavoriteRoute): Promise<void> {
    Object.assign(form.data, createFavoriteRouteContactPatch(route))
    await nextTick()
    clearFormRefsValidation(validatedFormRefs)
    ElMessage.success(`已带入常用线路“${route.routeName}”的发货与收货信息`)
  }

  async function handleCustomerSelect(mode: SelectorMode, row: CustomerItem): Promise<void> {
    Object.assign(form.data, await createCustomerContactPatch(mode, row))
    await nextTick()
    const isShipping = mode === 'shipping'
    const contactForm = isShipping ? shippingFormRef.value : receivingFormRef.value
    const contactFields = isShipping
      ? (['shippingContactName', 'shippingContactPhone'] as const)
      : (['receivingContactName', 'receivingContactPhone'] as const)
    const filledFields = contactFields.filter((field) => textValue(form.data[field]))
    if (filledFields.length) contactForm?.clearValidate([...filledFields])
    await applyCustomerPriceTemplate(row.id)
  }

  async function createCustomerContactPatch(
    mode: SelectorMode,
    customer: CustomerItem
  ): Promise<ContactPatch> {
    const address = await fetchDefaultAddress(customer.id, mode)
    return createAddressPatch(mode, customer, address)
  }

  async function fetchDefaultAddress(
    customerId: string,
    mode: SelectorMode
  ): Promise<CustomerAddress | null> {
    const { data } = await fetchCustomerDefaultAddress(customerId, mode)
    return data ?? null
  }

  function createAddressPatch(
    mode: SelectorMode,
    customer: CustomerItem,
    address?: CustomerAddress | null
  ): ContactPatch {
    const contactName = address?.contactName || customer.contactName || customer.customerName
    const effectiveAccess = address?.fieldAccess ?? customer.fieldAccess
    const phoneAccess = getFieldAccess(effectiveAccess, 'contactPhone')
    const addressAccess = getFieldAccess(effectiveAccess, 'addressDetail')
    const canReadPhone = isReadableFieldAccess(phoneAccess)
    const canReadAddress = isReadableFieldAccess(addressAccess)
    const contactPhone = canReadPhone ? address?.contactPhone || customer.contactPhone || '' : ''
    const regionPath = canReadAddress
      ? parseOrderRegionPath(address?.region || customer.region)
      : []
    const addressText = canReadAddress
      ? textValue(address?.addressDetail || customer.addressDetail)
      : ''
    const longitude = canReadAddress ? (address?.longitude ?? customer.longitude ?? null) : null
    const latitude = canReadAddress ? (address?.latitude ?? customer.latitude ?? null) : null

    const patchMap: Record<SelectorMode, ContactPatch> = {
      shipping: {
        shippingCustomerId: customer.id,
        shippingCustomerName: customer.customerName,
        shippingAddressId: address?.id ?? null,
        shippingContactName: contactName,
        shippingContactPhone: contactPhone,
        shippingAddressDetail: addressText,
        shippingRegionPath: regionPath,
        shippingLongitude: longitude,
        shippingLatitude: latitude
      },
      receiving: {
        receivingCustomerId: customer.id,
        receivingCustomerName: customer.customerName,
        receivingAddressId: address?.id ?? null,
        receivingContactName: contactName,
        receivingContactPhone: contactPhone,
        receivingAddressDetail: addressText,
        receivingRegionPath: regionPath,
        receivingLongitude: longitude,
        receivingLatitude: latitude
      }
    }

    return patchMap[mode]
  }

  async function applyCustomerPriceTemplate(customerId: string): Promise<void> {
    try {
      const { data } = await fetchCustomerPriceList({
        customerId,
        from: 0,
        to: 0
      })
      const price = data?.[0]
      if (!price) return

      Object.assign(form.data, createCustomerPriceBusinessPatch(price, form.data.orderRemark))
      if (price.cargoItems?.length) {
        form.data.cargoItems = price.cargoItems.map(createCargoItemFromCustomerPrice)
      }
      await nextTick()
      clearFormRefsValidation(validatedFormRefs)
      ElMessage.success('已带入客户价格维护中的费用与货物信息')
    } catch {
      // 价格模板只是辅助回填，查询失败时保留已选择的客户基础信息。
    }
  }

  function createCargoItemFromCustomerPrice(item: CustomerPriceCargoItem): CargoItem {
    return {
      cargoName: textValue(item.cargoName),
      packageType: textValue(item.unit),
      quantity: normalizeNullableNumber(item.quantity),
      unit: textValue(item.unit),
      weightKg: normalizeNullableNumber(item.weightKg),
      volumeM3: normalizeNullableNumber(item.volumeM3)
    }
  }

  function swapContacts(): void {
    const shipping = {
      id: form.data.shippingCustomerId,
      customerName: form.data.shippingCustomerName,
      addressId: form.data.shippingAddressId,
      name: form.data.shippingContactName,
      phone: form.data.shippingContactPhone,
      address: form.data.shippingAddressDetail,
      regionPath: form.data.shippingRegionPath,
      longitude: form.data.shippingLongitude,
      latitude: form.data.shippingLatitude
    }

    Object.assign(form.data, {
      shippingCustomerId: form.data.receivingCustomerId,
      shippingCustomerName: form.data.receivingCustomerName,
      shippingAddressId: form.data.receivingAddressId,
      shippingContactName: form.data.receivingContactName,
      shippingContactPhone: form.data.receivingContactPhone,
      shippingAddressDetail: form.data.receivingAddressDetail,
      shippingRegionPath: form.data.receivingRegionPath,
      shippingLongitude: form.data.receivingLongitude,
      shippingLatitude: form.data.receivingLatitude,
      receivingCustomerId: shipping.id,
      receivingCustomerName: shipping.customerName,
      receivingAddressId: shipping.addressId,
      receivingContactName: shipping.name,
      receivingContactPhone: shipping.phone,
      receivingAddressDetail: shipping.address,
      receivingRegionPath: shipping.regionPath,
      receivingLongitude: shipping.longitude,
      receivingLatitude: shipping.latitude
    })
  }

  async function openAiOrderDrawer(): Promise<void> {
    await loadAiOrderDrawer()
    await aiOrderDrawerRef.value?.handleOpen({
      options: {
        deliveryMethods: toAiOptions(form.deliveryMethodOptions),
        paymentMethods: toAiOptions(form.paymentMethodOptions),
        transportModes: toAiOptions(form.transportModeOptions),
        cargoUnits: toAiOptions(form.cargoUnitOptions),
        loadTypes: toAiOptions(loadTypeOptions),
        billingModes: toAiOptions(billingModeOptions),
        cargoCategories: toAiOptions(cargoCategoryOptions),
        packagingOptions: toAiOptions(packagingOptions),
        transportRequirements: toAiOptions(transportRequirementOptions),
        trackingMethods: toAiOptions(trackingMethodOptions)
      }
    })
  }

  async function handleAiOrderApply(payload: AiOrderApplyPayload): Promise<void> {
    const draft = payload.analysis.order
    const references = payload.references
    const patch: Partial<OrderForm> = {}

    applyDraftTextFields(patch, draft)
    applyDraftNumberFields(patch, draft)

    const [shippingCoordinates, receivingCoordinates] = await Promise.all([
      resolveAiAddressCoordinates(
        'shipping',
        draft.shippingAddressDetail,
        references.shippingAddress
      ),
      resolveAiAddressCoordinates(
        'receiving',
        draft.receivingAddressDetail,
        references.receivingAddress
      )
    ])
    Object.assign(patch, shippingCoordinates.patch, receivingCoordinates.patch)

    if (references.originStation.id) {
      Object.assign(patch, {
        originStationId: references.originStation.id,
        originStation: references.originStation.label || draft.originStationName || ''
      })
    }
    if (references.destinationStation.id) {
      Object.assign(patch, {
        destinationStationId: references.destinationStation.id,
        destinationStation:
          references.destinationStation.label || draft.destinationStationName || ''
      })
    }
    if (references.transferStation.id) {
      Object.assign(patch, {
        transferStationId: references.transferStation.id,
        transferStationIds: [references.transferStation.id],
        transferStation: references.transferStation.label || draft.transferStationName || ''
      })
    }
    if (references.shippingCustomer.id) {
      Object.assign(patch, {
        shippingCustomerId: references.shippingCustomer.id,
        shippingCustomerName: references.shippingCustomer.label || draft.shippingCustomerName || ''
      })
    }
    if (references.receivingCustomer.id) {
      Object.assign(patch, {
        receivingCustomerId: references.receivingCustomer.id,
        receivingCustomerName:
          references.receivingCustomer.label || draft.receivingCustomerName || ''
      })
    }

    Object.assign(form.data, patch)
    form.data.orderConfig = mergeAiOrderConfig(form.data.orderConfig, draft.orderConfig)
    await stationFormRef.value?.reloadOptions()
    if (draft.cargoItems?.some((item) => textValue(item.cargoName))) {
      form.data.cargoItems = draft.cargoItems.map((item) => ({
        cargoName: textValue(item.cargoName),
        packageType: textValue(item.packageType || item.unit),
        quantity: normalizeNullableNumber(item.quantity),
        unit: textValue(item.unit || item.packageType),
        weightKg: normalizeNullableNumber(item.weightKg),
        volumeM3: normalizeNullableNumber(item.volumeM3)
      }))
    }

    await nextTick()
    clearFormRefsValidation(validatedFormRefs)
    aiArtifactId.value = payload.analysis.artifactId
    ElMessage.success('AI 识别结果已填入，请检查后保存订单')
    const failedAddressLabels = [
      shippingCoordinates.failed ? '发货地址' : '',
      receivingCoordinates.failed ? '收货地址' : ''
    ].filter(Boolean)
    if (failedAddressLabels.length) {
      ElMessage.warning(`${failedAddressLabels.join('、')}未能定位，请通过客户地址选择地图位置`)
    }
  }

  async function resolveAiAddressCoordinates(
    mode: SelectorMode,
    address: string | null | undefined,
    reference: AiAddressReferenceMatch
  ): Promise<AiAddressCoordinateResolution> {
    const normalizedAddress = textValue(address)
    if (!normalizedAddress) return { patch: {}, failed: false }

    const coordinate = normalizeCoordinatePair(reference.longitude, reference.latitude)
    if (coordinate) {
      return {
        patch: createCoordinatePatch(
          mode,
          reference.id ?? null,
          coordinate.longitude,
          coordinate.latitude
        ),
        failed: false
      }
    }

    try {
      const location = await geocodeAddress(normalizedAddress)
      return location
        ? {
            patch: createCoordinatePatch(
              mode,
              reference.id ?? null,
              location.longitude,
              location.latitude
            ),
            failed: false
          }
        : { patch: createCoordinatePatch(mode, reference.id ?? null, null, null), failed: true }
    } catch {
      return { patch: createCoordinatePatch(mode, reference.id ?? null, null, null), failed: true }
    }
  }

  function createCoordinatePatch(
    mode: SelectorMode,
    addressId: string | null,
    longitude: number | null,
    latitude: number | null
  ): ContactPatch {
    return mode === 'shipping'
      ? {
          shippingAddressId: addressId,
          shippingLongitude: longitude,
          shippingLatitude: latitude
        }
      : {
          receivingAddressId: addressId,
          receivingLongitude: longitude,
          receivingLatitude: latitude
        }
  }

  function applyDraftTextFields(
    patch: Partial<OrderForm>,
    draft: Api.Tms.Order.AiOrderDraft
  ): void {
    const fieldMap: Array<[keyof OrderForm, string | null | undefined]> = [
      ['deliveryMethod', draft.deliveryMethod],
      ['shippingCustomerName', draft.shippingCustomerName],
      ['shippingContactName', draft.shippingContactName],
      ['shippingContactPhone', draft.shippingContactPhone],
      ['shippingAddressDetail', draft.shippingAddressDetail],
      ['receivingCustomerName', draft.receivingCustomerName],
      ['receivingContactName', draft.receivingContactName],
      ['receivingContactPhone', draft.receivingContactPhone],
      ['receivingAddressDetail', draft.receivingAddressDetail],
      ['paymentMethod', draft.paymentMethod],
      ['transportMode', draft.transportMode],
      ['orderRemark', draft.orderRemark]
    ]

    fieldMap.forEach(([key, value]) => {
      const normalized = textValue(value)
      if (normalized) Object.assign(patch, { [key]: normalized })
    })
  }

  function applyDraftNumberFields(
    patch: Partial<OrderForm>,
    draft: Api.Tms.Order.AiOrderDraft
  ): void {
    const fieldMap: Array<[keyof OrderForm, number | null | undefined]> = [
      ['transportFee', draft.transportFee],
      ['deliveryFee', draft.deliveryFee],
      ['unloadingFee', draft.unloadingFee],
      ['collectPaymentFee', draft.collectPaymentFee],
      ['transferFee', draft.transferFee],
      ['declaredValue', draft.declaredValue],
      ['insuranceFee', draft.insuranceFee],
      ['packageFee', draft.packageFee],
      ['otherFee', draft.otherFee],
      ['cashAmount', draft.cashAmount],
      ['collectAmount', draft.collectAmount],
      ['monthlyAmount', draft.monthlyAmount],
      ['codAmount', draft.codAmount],
      ['handlingFee', draft.handlingFee]
    ]

    fieldMap.forEach(([key, value]) => {
      if (!isNil(value)) Object.assign(patch, { [key]: moneyValue(value) })
    })
  }

  function toAiOptions(options: DictionarySelectOption[]): Api.Tms.Order.AiOrderOption[] {
    return options.filter((item) => item.value)
  }

  async function validateContactStep(): Promise<boolean> {
    const valid = await validateFormRefs(
      [stationFormRef, shippingFormRef, receivingFormRef],
      pageRef
    )
    if (!valid) return false
    if (canEditOrderField('shipperAddress') && !textValue(form.data.shippingAddressDetail)) {
      ElMessage.warning('请填写发货详细地址')
      return false
    }
    if (canEditOrderField('receiverAddress') && !textValue(form.data.receivingAddressDetail)) {
      ElMessage.warning('请填写收货详细地址')
      return false
    }
    if (
      form.data.departureAt &&
      form.data.arrivalAt &&
      dayjs(form.data.arrivalAt).isBefore(dayjs(form.data.departureAt))
    ) {
      ElMessage.warning('到货时间不能早于发货时间')
      return false
    }
    return true
  }

  async function validateConfigStep(): Promise<boolean> {
    return (await configRef.value?.validate()) ?? false
  }

  async function validateCargoStep(): Promise<boolean> {
    const valid = await validateFormRefs([settlementFormRef], pageRef)
    if (!valid) return false
    const hasCargoName = (form.data.cargoItems ?? []).some((item) => textValue(item.cargoName))
    if (!hasCargoName) {
      ElMessage.warning('请至少填写一条货物名称')
      return false
    }

    return true
  }

  async function validateForms(): Promise<boolean> {
    if (!(await validateContactStep())) {
      step.value = 0
      return false
    }
    if (!(await validateConfigStep())) {
      step.value = 1
      return false
    }
    if (!(await validateCargoStep())) {
      step.value = 2
      return false
    }
    if (
      isNewOrder.value &&
      orderNumberRule.value &&
      !orderNumberRule.value.autoEnabled &&
      !textValue(form.data.orderNo)
    ) {
      ElMessage.warning('当前运单号规则为手工填写，请输入运单号')
      return false
    }

    return true
  }

  async function nextStep(): Promise<void> {
    const valid = step.value === 0 ? await validateContactStep() : await validateConfigStep()
    if (!valid) return
    step.value = Math.min(step.value + 1, 2)
    pageRef.value?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' })
  }

  function navigateStep(index: number): void {
    if (index <= step.value) step.value = index
    else if (index === step.value + 1) void nextStep()
  }

  async function handleSaveOnly(): Promise<void> {
    if (page.saving) return
    const valid = await validateForms()
    if (!valid) return

    page.saving = true
    try {
      const payload = normalizePayload()
      const editingOrderId = getOrderId()
      let savedOrderId: string | undefined
      if (editingOrderId) {
        const { data } = await editOrder({ ...payload, id: editingOrderId })
        savedOrderId = data?.id || editingOrderId
        ElMessage.success('订单修改成功')
      } else {
        const { data } = await addOrder({ ...payload, id: undefined })
        savedOrderId = data?.id
        ElMessage.success('开单成功')
      }
      await recordAiOrderReview(savedOrderId)
      await router.push({ name: 'TmsPendingWaybillList' })
    } catch {
      // API 层已提示错误，页面保留当前输入。
    } finally {
      page.saving = false
    }
  }

  async function recordAiOrderReview(orderId?: string): Promise<void> {
    if (!aiArtifactId.value || !orderId) return

    const { error } = await reviewAiOrderArtifact({
      action: 'review',
      artifactId: aiArtifactId.value,
      entityId: orderId,
      outcome: 'applied',
      finalPayload: buildAiOrderFinalPayload(form.data)
    })
    if (error) {
      ElMessage.warning('订单已保存，但 AI 质量记录失败；不会影响正式订单')
      return
    }
    aiArtifactId.value = undefined
  }

  async function openPrintDialog(kind: PrintKind): Promise<void> {
    await loadPrintDialog()
    await printDialogRef.value?.handleOpen({
      kind,
      cargoQuantity: Math.max(1, form.cargoSummary.quantity)
    })
  }

  function handleDoublePrint(): void {
    void openPrintDialog('waybill')
  }

  function handleFooterCommand(command: FooterCommand): void {
    const handlers: Record<FooterCommand, () => void> = {
      ai: () => void openAiOrderDrawer(),
      'print-waybill': () => void openPrintDialog('waybill'),
      'print-label': () => void openPrintDialog('label'),
      'double-print': handleDoublePrint
    }
    handlers[command]()
  }

  function handlePrintConfirm(kind: PrintKind, count: number): void {
    if (kind === 'label') {
      ElMessage.info('标签打印模板尚未配置')
      return
    }
    const order = normalizePayload()
    const orderId = getOrderId()
    const detailUrl = orderId
      ? new URL(
          router.resolve({ name: 'TmsOrderDetail', params: { id: orderId } }).href,
          window.location.href
        ).href
      : undefined
    printOrderWaybill(
      { ...order, id: orderId || undefined },
      {
        brandName: brandName.value,
        logoUrl: websiteConfig.value.logoUrl,
        detailUrl,
        copies: count,
        label: (dictCode, value) =>
          userStore.getDictItemByValue(dictCode, value ?? undefined)?.label || value || ''
      }
    )
  }

  function normalizePayload(): OrderRecord {
    syncContractFreightTotals()
    return normalizeOrderPayload({
      form: toRaw(form.data),
      stationNames: {
        origin: findStationOption('origin', form.data.originStationId)?.stationName,
        destination: findStationOption('destination', form.data.destinationStationId)?.stationName,
        transfer: findStationOption('transfer', form.data.transferStationId)?.stationName
      }
    })
  }

  function sumFields(fields: Array<keyof OrderForm>): number {
    return round(
      fields.reduce(
        (sum, field) => sum + (normalizeNullableNumber(form.data[field] as number) ?? 0),
        0
      ),
      2
    )
  }

  function canViewOrderField(field: Api.Tms.Order.OrderFieldKey): boolean {
    return isNewOrder.value || canViewField(form.data.fieldAccess, field)
  }

  function canEditOrderField(field: Api.Tms.Order.OrderFieldKey): boolean {
    return isNewOrder.value || canEditField(form.data.fieldAccess, field)
  }

  function canEditContactEndpoint(mode: SelectorMode): boolean {
    return mode === 'shipping'
      ? canEditOrderField('shipperContact') && canEditOrderField('shipperAddress')
      : canEditOrderField('receiverContact') && canEditOrderField('receiverAddress')
  }
</script>

<style scoped lang="scss" src="./modules/order-open.scss"></style>
