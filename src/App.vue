<template>
  <FloatBar v-if="isFloat" />
  <MainWindow v-else />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import FloatBar from "./views/FloatBar.vue";
import MainWindow from "./views/MainWindow.vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { unregisterAll, register } from "@tauri-apps/plugin-global-shortcut";
import { emit, listen } from "@tauri-apps/api/event";
import { useTaskStore } from "./stores/tasks";

const w = new URLSearchParams(window.location.search).get("w");
const isFloat = w !== "main";

onMounted(async () => {
  if (!isFloat) return;

  const store = useTaskStore();
  const floatWin = getCurrentWindow();

  // 确保 store 已初始化（快捷键配置从 DB 加载）
  await store.init();

  async function registerAllShortcuts() {
    await unregisterAll().catch(() => {});
    const sc = store.shortcuts;

    // ctrl+alt+h：隐藏/显示悬浮窗
    if (sc.toggleFloat) {
      await register(sc.toggleFloat, async (event) => {
        if (event.state === "Pressed") {
          const visible = await floatWin.isVisible().catch(() => false);
          if (visible) {
            invoke("hide_float_window").catch(console.error);
          } else {
            invoke("show_float_window").catch(console.error);
            emit("user-show-float").catch(() => {});
          }
        }
      }).catch((e) => console.warn(`快捷键 ${sc.toggleFloat} 注册失败:`, e));
    }

    // ctrl+alt+{数字}：显示并选中对应专注任务（固定，不可自定义）
    for (let i = 0; i < 10; i++) {
      const k = `CommandOrControl+Alt+${i}`;
      await register(k, (event) => {
        if (event.state === "Pressed") {
          store.setSelectedIndex(i);
          invoke("show_float_window").catch(console.error);
          emit("user-show-float").catch(() => {});
        }
      }).catch(() => {}); // 数字键可能与系统冲突，静默忽略
    }

    // ctrl+alt+space：计时
    if (sc.timer) {
      await register(sc.timer, async (event) => {
        if (event.state === "Pressed") {
          invoke("show_float_window").catch(console.error);
          emit("user-show-float").catch(() => {});
          emit("toggle-first-timer").catch(() => {});
        }
      }).catch((e) => console.warn(`快捷键 ${sc.timer} 注册失败:`, e));
    }

    // ctrl+alt+m：打开/关闭主界面
    if (sc.openMain) {
      await register(sc.openMain, async (event) => {
        if (event.state === "Pressed") {
          const mainWin = await WebviewWindow.getByLabel("main").catch(() => null);
          if (mainWin) {
            mainWin.close().catch(console.error);
          } else {
            const win = new WebviewWindow("main", {
              url: "/?w=main",
              title: "Next — 任务管理",
              width: 720,
              height: 560,
              center: true,
              decorations: false,
            });
            win.once("tauri://created", () => { win.setFocus().catch(() => {}); });
          }
        }
      }).catch((e) => console.warn(`快捷键 ${sc.openMain} 注册失败:`, e));
    }

    // ctrl+alt+d：切换到对应桌面
    if (sc.switchDesktop) {
      await register(sc.switchDesktop, async (event) => {
        if (event.state === "Pressed") {
          emit("switch-first-desktop").catch(() => {});
        }
      }).catch((e) => console.warn(`快捷键 ${sc.switchDesktop} 注册失败:`, e));
    }
  }

  await registerAllShortcuts();

  // 收到 shortcuts-changed 事件时重新从 DB 加载并重新注册
  listen("shortcuts-changed", async () => {
    await store.reload();
    await registerAllShortcuts();
  }).catch(() => {});
});
</script>