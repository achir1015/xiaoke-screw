# CLAUDE.md — 小柯機器人螺絲3D產生器（xiaoke-screw）

## 與使用者合作

- 一律用繁體中文回覆（App 按鈕原名可保留英文）。
- 開發者署名：吳玉柱 先生 與 Claude AI Opus 5.5。
- 推送、建 repo、發佈 Release 等對外動作先問過使用者；commit 作者用 GitHub noreply 信箱，任何檔案都不放使用者 email。

## 專案是什麼

原創（MIT）的參數化螺絲／螺帽產生器，參考 123DScrew（ACME 類梯形牙、TOL 公差）、threadlib、easy-bolt 的概念，但程式全部自寫。
同系列的 `../../xiaoke-tray`（托盤生成器）提供了桌面外殼（electron/）、語音教學與更新（src/xiaoke.ts）的寫法。

- 幾何：`src/geom/`，manifold-3d（WASM）在 Web Worker 裡建模。
  - `thread.ts`：牙型折線 → 沿螺旋線的「螺旋帶」網格（牙型點每格抬升 導程×角度比例，整圈錯開一個導程），兩端用軸心扇形封口、再以布林切成長度。相位以 z = 0 為準，母牙切刀＝同一螺紋加大 clearance。
  - `parts.ts`：螺絲（10 種頭、5 種起子槽）、螺帽（7 種）、墊圈、螺紋桿、嵌件、支柱。座標：頭部承面 z = 0，頭在 z < 0。
  - `build.ts`：組合圖（螺帽放在螺距整數倍才會咬合）與列印排版（底面貼平台、一列排開）。
  - `params.ts`：參數、規格表（ISO 粗牙／細牙、UNC、Tr 梯形、T8 四線、列印大牙）。
- 畫面：`index.html`、`src/main.ts`（表單由 GROUPS 宣告產生）、`src/viewer.ts`（three.js，剖面、旋入動畫）、`src/export.ts`（STL、3MF）。
- `window.xkApp`：教學與 e2e 用的操作介面。

## 指令（Node 22：`%LOCALAPPDATA%\nvm\v22.22.3\node.exe`，PATH 裡的是 20）

```bash
node node_modules/vitest/vitest.mjs run          # 幾何測試（含公母牙不干涉）
node node_modules/typescript/bin/tsc            # 型別檢查
node node_modules/vite/bin/vite.js build        # 產生 dist/
node e2e/desktop.mjs [--bambu]                  # 桌面冒煙（XK_EXE= 測打包版）
CSC_IDENTITY_AUTO_DISCOVERY=false node node_modules/electron-builder/cli.js --win nsis portable --x64 --publish never
python scripts/make_icon.py                     # 圖示
```

## 狀態

- 2026-11-18 Windows v1.0.0 完成：安裝檔 release/、已 /S 安裝到 %LOCALAPPDATA%\Programs\XiaokeScrew（桌面＋開始選單捷徑）、e2e 18 項通過。
- 2026-11-18 公開 repo https://github.com/achir1015/xiaoke-screw（main），v1.0.0 Release 手動上傳 win 安裝版＋免安裝版（無 CI）；e2e/update-check.mjs 實測程式內更新讀得到。發佈說明在 .github/release-notes.md。
- 2026-11-18 v1.1.0 Mac 版：`.github/workflows/build.yml` 推 package.json 版本即建 win＋mac-arm64＋mac-x64 並發 Release（notes 在 .github/release-notes.md）；Mac ad-hoc 簽章（build/adhoc-sign.cjs）、保留 appMenu／editMenu。Intel Mac 實機 `scripts/mac-install-test.sh <dmg> --bambu` 18 項通過（測試資料夾 ~/Developer/xiaoke-screw-test）。Windows 程式內更新 1.0.0→1.1.0 實測成功（e2e/update-install.mjs），仍裝在個人資料夾。等 CI：`GITHUB_TOKEN=… node e2e/wait-ci.mjs`。
- 2026-11-18 線上版 https://achir1015.github.io/xiaoke-screw/：`.github/workflows/pages.yml` 推 main（src、public、index.html、package.json 等）自動部署（Pages build_type=workflow）；綠鈕改下載 3MF、左下有桌面版連結、更新比 version.json。手機寬度（<820px）版面：標題→預覽→參數。實測 live 站建模＋3MF 下載正常。等部署：`WF=pages.yml node e2e/wait-ci.mjs`。
- 2026-11-18 v1.2.0 iPhone／iPad：ios/（XcodeGen，com.achir.xiaokescrew，顯示名「小柯螺絲」，LocalServer 埠 48301）照抄 xiaoke-tray。Mac 上 ~/Developer/xiaoke-screw（從 Windows 用 `tar --force-local` 傳 package.json＋dist＋ios），`osascript ios/run-in-terminal.applescript "bash ~/Developer/xiaoke-screw/ios/build-ipa.sh"`，完成看 ios/build/ipa.done。安裝頁 public/ios/（manifest.plist 的 bundle-version 要跟版本改）；.ipa 手動上傳 Release，檔名固定 xiaoke-screw-ios.ipa。iPhone 15 Pro Max devicectl 安裝＋啟動成功；iPhone 17 Pro Max／iPad Pro 13 模擬器截圖確認（模擬器冷啟動要十幾秒才出畫面）。圖示與 QR 由 scripts/make_icon.py 一起產生。
- 2026-11-18 Android（掛在 v1.2.0，未升版）：android/ 照抄 xiaoke-tray（無 Gradle build.py，SDK/JDK 在 local.properties，不進 git），com.achir.xiaokescrew「小柯螺絲」；3MF 存「下載/小柯螺絲」；返回鍵 window.__xkBack（關教學）。金鑰 android/xiaokescrew.jks（alias xiaokescrew、密碼 android，不進 git、沒放 Secret，遺失就無法覆蓋安裝）。SM-S9380 e2e/android.mjs 14 項全過（debug 版＋adb forward tcp:9335 localabstract:webview_devtools_remote_<pid>）。APK 手動上傳 Release，檔名 XiaokeScrew-<版本>-android.apk（Bridge.java 的更新靠這個檔名）。
- 六平台全部完成（Win、Mac、線上、iPhone、iPad、Android）；2026-11-18 使用者回報 iPhone／iPad 實機安裝測試完成。
- 發佈新版：改 package.json 版本＋release-notes＋public/ios/manifest.plist bundle-version → 推 main（CI 建 Win＋Mac、Pages 更新）→ Mac 建 .ipa 上傳 xiaoke-screw-ios.ipa → `python android/build.py` 上傳 APK。
- 沒有 gh CLI：用 `git credential fill` 取 token 打 GitHub API。

## 坑

- NSIS 靜默安裝後會自動開啟 App，單一實例會讓 e2e 連不上：先關掉。
- Bambu Studio 已經開著兩個以上視窗時，新開的實例會卡在「正在載入配置」。
- Mac 透過 SSH 不能 screencapture（沒有螢幕錄製權限）。
- 第一次開啟會自動播放教學（?noguide 可略過）；教學結束會還原原本的參數。
