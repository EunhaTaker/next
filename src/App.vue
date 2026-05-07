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
import { emit } from "@tauri-apps/api/event";
import { useTaskStore } from "./stores/tasks";

const w = new URLSearchParams(window.location.search).get("w");
const isFloat = w !== "main";

onMounted(async () => {
  // 只在悬浮窗上下文中注册全局快捷键
  if (isFloat) {
    const store = useTaskStore();
    const floatWin = getCurrentWindow();

    // 每次启动先清空，避免崩溃重启后旧 handler 仍占用导致失效
    await unregisterAll().catch(() => {});

    // ctrl+alt+h：隐藏/显示悬浮窗
    const toggleH = "CommandOrControl+Alt+H";
    try {
      await register(toggleH, async (event) => {
        if (event.state === "Pressed") {
          const visible = await floatWin.isVisible().catch(() => false);
          if (visible) {
            invoke("hide_float_window").catch(console.error);
          } else {
            invoke("show_float_window").catch(console.error);
            emit("user-show-float").catch(() => {});
          }
        }
      });
      console.log(`✅ 快捷键注册成功: ${toggleH}`);
    } catch (e) {
      console.warn(`❌ 快捷键 ${toggleH} 注册失败:`, e);
    }

    // ctrl+alt+{数字}：显示并选中对应专注任务
    for (let i = 0; i < 10; i++) {
      const k = `CommandOrControl+Alt+${i}`;
      try {
        await register(k, (event) => {
          if (event.state === "Pressed") {
            store.setSelectedIndex(i);
            invoke("show_float_window").catch(console.error);
            emit("user-show-float").catch(() => {});
          }
        });
        console.log(`✅ 快捷键注册成功: ${k}`);
      } catch (e) {
        console.warn(`❌ 快捷键 ${k} 注册失败:`, e);
      }
    }

    // ctrl+alt+space：对第一个专注任务开始/暂停计时
    const timerKey = "CommandOrControl+Alt+Space";
    try {
      await register(timerKey, async (event) => {
        if (event.state === "Pressed") {
          invoke("show_float_window").catch(console.error);
          emit("user-show-float").catch(() => {});
          emit("toggle-first-timer").catch(() => {});
        }
      });
      console.log(`✅ 快捷键注册成功: ${timerKey}`);
    } catch (e) {
      console.warn(`❌ 快捷键 ${timerKey} 注册失败:`, e);
    }

    // ctrl+alt+m：打开/关闭主界面
    const mainKey = "CommandOrControl+Alt+M";
    try {
      await register(mainKey, async (event) => {
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
            // 窗口就绪后立即置顶获焦
            win.once("tauri://created", () => {
              win.setFocus().catch(() => {});
            });
          }
        }
      });
      console.log(`✅ 快捷键注册成功: ${mainKey}`);
    } catch (e) {
      console.warn(`❌ 快捷键 ${mainKey} 注册失败:`, e);
    }

    // ctrl+alt+d：切换到第一个任务/子任务对应桌面
    const deskKey = "CommandOrControl+Alt+D";
    try {
      await register(deskKey, async (event) => {
        if (event.state === "Pressed") {
          emit("switch-first-desktop").catch(() => {});
        }
      });
      console.log(`✅ 快捷键注册成功: ${deskKey}`);
    } catch (e) {
      console.warn(`❌ 快捷键 ${deskKey} 注册失败:`, e);
    }
  }
});
</script>