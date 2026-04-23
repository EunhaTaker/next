<template>
  <FloatBar v-if="isFloat" />
  <MainWindow v-else />
</template>

<script setup lang="ts">
import FloatBar from "./views/FloatBar.vue";
import MainWindow from "./views/MainWindow.vue";

// /?w=float → 悬浮窗，/?w=main → 管理窗口
// 加载的是同一个 / 路径（Vite 正常响应），query 参数由 WebView 完整保留
const w = new URLSearchParams(window.location.search).get("w");
const isFloat = w !== "main";
</script>