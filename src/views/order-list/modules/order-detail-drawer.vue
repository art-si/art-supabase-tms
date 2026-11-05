<template>
  <ArtDrawer
    ref="drawerRef"
    size="xl"
    :show-footer="false"
    :show-form-focus-button="false"
    @closed="orderId = ''"
  >
    <OrderDetail v-if="orderId" :key="orderId" :order-id="orderId" embedded />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'

  const OrderDetail = defineAsyncComponent(() => import('../detail/index.vue'))
  const drawerRef = ref<ArtDrawerExpose>()
  const orderId = ref('')

  async function handleOpen(id: string, orderNo?: string): Promise<void> {
    if (!id) return
    orderId.value = id
    await drawerRef.value?.handleOpen(undefined, {
      title: orderNo ? `运单详情 · ${orderNo}` : '运单详情',
      subtitle: '查看收发信息、配置信息、货物信息及应收信息',
      headerIcon: 'ri:file-list-3-line'
    })
  }

  defineExpose({ handleOpen })
</script>
