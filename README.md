# 發文變多，討論也變多了嗎？

輔仁大學「資料分析與視覺化應用」HW3 · News visualization。這是供組員接手的第一版，主圖比較 2026 年 9 月 30 日動員公文曝光前後，泛藍與泛綠社群的發文數和網路討論聲量。

**先看成品**　從 GitHub 的 **Code → Download ZIP** 下載並解壓，直接用 Chrome、Safari 或 Edge 開啟 `index.html`。所有必要檔案都在 repo 內，離線可用。組員修改與繳交分工請見 [HANDOFF.md](HANDOFF.md)。

## 原圖的問題與改版

原圖把兩期放在不同的雙軸長條圖。曝光前的聲量軸最高 6 萬，曝光後最高 20 萬。同樣是泛綠，聲量從 51,415 增至 58,435 則，讀者卻可能因後一根柱子看起來較矮而判斷為下降。[TPOC 原文](https://www.tpoc.com.tw/ArticlePage/aa371fd2-ba0e-49a8-8300-bfac13055fb0) · [原始社群圖](https://api.tpoc.com.tw/resources/site/064f1470-dfcf-4916-8546-a4c01da7acef.jpg)

新版把兩期畫在同一座標系。橫軸為兩天的發文篇數，縱軸為兩天的討論聲量。每支箭頭由曝光前的空心點指向曝光後的實心點。點選端點（或用 Tab 選取後按 Enter／空白鍵），可讀出兩種指標的數字與占比。占比的分母為當期兩方在該指標的合計。

## 製作流程

1. 對照文章與三張圖，把每日聲量、全期合計、陣營分期與候選人指標轉錄成 CSV，每列附來源。
2. 用 `build_data.py` 從 CSV 擷取繪圖所需的觀測值並產生 `chart-data.js`。
3. 使用原生 JavaScript 與 SVG 繪圖。顏色代表社群，座標代表發文與聲量，箭頭方向代表時間順序。
4. 在可展開的候選人區塊讀取 P/N（正面聲量除以負面聲量）。以每 20 份負面聲量換算，沈伯洋約對應 5 份正面，蔣萬安約 12 份。這是比值示意；原圖每人只提供一組 P/N。[候選人原圖](https://api.tpoc.com.tw/resources/site/2705b7e1-2713-4d52-a69d-18e67a6615b8.jpg)

## 繳交素材

- [GitHub 專案](https://github.com/victorien1963/1151VIS-HW3-415085047-YEN-TING-YA)
- 專案截圖與 YouTube 影片連結待組員完成錄影後補入。
- [TronClass 作業頁](https://elearn2.fju.edu.tw/course/403380/learning-activity#/3155608)
