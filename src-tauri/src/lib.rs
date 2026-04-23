use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DesktopInfo {
    pub index: usize,
    pub name: String,
    pub is_current: bool,
}

/// 创建悬浮窗
fn create_float_window(app: &tauri::AppHandle) {
    // 如果已存在则直接显示
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.show();
        return;
    }

    // 获取主显示器尺寸
    let monitor = app
        .primary_monitor()
        .unwrap_or(None)
        .or_else(|| app.available_monitors().ok()?.into_iter().next());

    let (screen_width, screen_height) = match monitor {
        Some(m) => {
            let size = m.size();
            let scale = m.scale_factor();
            (
                (size.width as f64 / scale) as u32,
                (size.height as f64 / scale) as u32,
            )
        }
        None => (1920, 1080),
    };

    let win_w: u32 = 260;
    let win_h: u32 = 500;
    let x = (screen_width - win_w) as i32 - 16;
    let y = ((screen_height - win_h) / 2) as i32;

    if let Ok(win) = WebviewWindowBuilder::new(app, "float", WebviewUrl::App("/?w=float".into()))
        .title("Next")
        .inner_size(win_w as f64, win_h as f64)
        .position(x as f64, y as f64)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .transparent(true)
        .build()
    {
        // 用 Win32 SetWindowRgn 把窗口裁剪为圆角矩形
        // 圆角外部区域完全透明（OS 层级），无需依赖 WebView2 透明
        #[cfg(target_os = "windows")]
        apply_round_region(&win, win_w, win_h, 14);
    }
}

/// 通过 Win32 API 将窗口区域裁剪为圆角矩形
#[cfg(target_os = "windows")]
fn apply_round_region(win: &tauri::WebviewWindow, width: u32, height: u32, radius: i32) {
    extern "system" {
        fn CreateRoundRectRgn(x1: i32, y1: i32, x2: i32, y2: i32, cx: i32, cy: i32) -> isize;
        fn SetWindowRgn(hwnd: isize, hrgn: isize, bredraw: i32) -> i32;
    }
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            // cx/cy 是椭圆直径（=半径*2）
            let rgn = CreateRoundRectRgn(0, 0, width as i32, height as i32, radius * 2, radius * 2);
            SetWindowRgn(hwnd.0 as isize, rgn, 1);
        }
    }
}

/// 创建管理窗口
fn create_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/?w=main".into()))
        .title("Next — 任务管理")
        .inner_size(720.0, 560.0)
        .center()
        .resizable(true)
        .decorations(true)
        .build();
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    create_main_window(&app);
}

#[tauri::command]
fn hide_float_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn show_float_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.show();
    }
}

/// 动态调整悬浮窗高度，同时刷新圆角 region
#[tauri::command]
fn resize_float_window(app: tauri::AppHandle, height: u32) {
    let win_w: u32 = 260;
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: win_w,
            height,
        }));
        #[cfg(target_os = "windows")]
        apply_round_region(&win, win_w, height, 14);
    }
}

/// 将悬浮窗贴靠到左侧或右侧屏幕边缘，保留当前 Y 位置
#[tauri::command]
fn snap_float_window(app: tauri::AppHandle, side: String) {
    let Some(win) = app.get_webview_window("float") else { return };

    let monitor = app
        .primary_monitor()
        .unwrap_or(None)
        .or_else(|| app.available_monitors().ok()?.into_iter().next());

    let (screen_w, _) = match monitor {
        Some(m) => {
            let size = m.size();
            let scale = m.scale_factor();
            (
                (size.width as f64 / scale) as i32,
                (size.height as f64 / scale) as i32,
            )
        }
        None => (1920, 1080),
    };

    let win_w: i32 = 260;
    let margin: i32 = 16;

    let x = if side == "left" {
        margin
    } else {
        screen_w - win_w - margin
    };

    // 读取当前逻辑 Y 位置，保持不变
    let cur_pos = win.outer_position().ok();
    let scale = win.scale_factor().unwrap_or(1.0);
    let y = cur_pos.map(|p| (p.y as f64 / scale) as i32).unwrap_or(0);

    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition {
        x: x as f64,
        y: y as f64,
    }));
}


#[tauri::command]
fn get_desktops() -> Vec<DesktopInfo> {
    let current_idx = winvd::get_current_desktop()
        .ok()
        .and_then(|d| winvd::get_desktops().ok()?.into_iter().position(|x| x == d));

    winvd::get_desktops()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(i, d)| DesktopInfo {
            index: i,
            name: d.get_name().unwrap_or_else(|_| format!("桌面 {}", i + 1)),
            is_current: current_idx == Some(i),
        })
        .collect()
}

/// 切换到指定虚拟桌面
#[tauri::command]
fn switch_to_desktop(index: usize) -> Result<(), String> {
    winvd::switch_desktop(index as u32).map_err(|e| format!("{:?}", e))
}

/// 重命名虚拟桌面
#[tauri::command]
fn rename_desktop(index: usize, name: String) -> Result<(), String> {
    let desktops = winvd::get_desktops().map_err(|e| format!("{:?}", e))?;
    desktops
        .get(index)
        .ok_or_else(|| format!("桌面 {} 不存在", index))?
        .set_name(&name)
        .map_err(|e| format!("{:?}", e))
}


pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 启动时创建悬浮窗
            create_float_window(app.handle());

            // 系统托盘菜单
            let show_item = MenuItemBuilder::with_id("show_main", "打开管理窗口").build(app)?;
            let toggle_float =
                MenuItemBuilder::with_id("toggle_float", "显示/隐藏悬浮窗").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&toggle_float)
                .separator()
                .item(&quit_item)
                .build()?;

            // 从 icon 文件加载托盘图标（避免 default_window_icon 为 None 时 panic）
            let icon = Image::from_path("icons/32x32.png")
                .or_else(|_| Image::from_path("icons/128x128.png"))
                .map_err(|e| {
                    eprintln!("Warning: Could not load tray icon: {e}");
                })
                .ok();

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Next — 任务焦点")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_main" => create_main_window(app),
                    "toggle_float" => {
                        if let Some(win) = app.get_webview_window("float") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        create_main_window(app);
                    }
                });

            if let Some(img) = icon {
                tray_builder = tray_builder.icon(img);
            }

            tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            hide_float_window,
            show_float_window,
            resize_float_window,
            snap_float_window,
            get_desktops,
            switch_to_desktop,
            rename_desktop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
