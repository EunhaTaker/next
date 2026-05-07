# Next — 任务管理

基于 Tauri 2 + Vue 3 + TypeScript 的桌面任务管理应用。

## 开发运行

```shell
npm run tauri dev
```

## 打包构建

```shell
npm run tauri build
```

产物位置：
- 安装程序（推荐）：`src-tauri\target\release\bundle\nsis\*.exe`
- MSI 包：`src-tauri\target\release\bundle\msi\*.msi`

> **注意**：首次 build 前需确保已安装 MSVC 工具链（Visual Studio Build Tools）。

## 清除编译缓存

仅清除 Rust 缓存（前端不受影响）：

```shell
cargo clean --manifest-path src-tauri/Cargo.toml
```

全部清除（包括前端）：

```shell
cargo clean --manifest-path src-tauri/Cargo.toml
Remove-Item -Recurse -Force node_modules
npm install
```
