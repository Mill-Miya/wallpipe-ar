# WallPipe AR — generic AR pipe demonstration

壁の向こうにあるような配管・バルブを3Dで可視化する、企業・製品に依存しない技術学習用Webデモです。

## できること

- 給水・空調・工場の3つの配管模式図を表示する
- 2つのバルブの開閉と流れの表示を切り替える
- **3D / AR表示**でGLBモデルを回転・拡大し、対応する端末ではOSのARビューアーを起動する
- **2Dデモ**で、実際のカメラ映像に配管を手動で重ねる（空間認識はなし）
- マーカーは使わない

## 技術と制約

- 画面・ロジック: HTML / CSS / JavaScript / Canvas
- 3Dアセット: `assets/*.glb`（Python生成、企業固有の製品データを使用しない）
- 3D/ARビューアー: オープンソースの [model-viewer](https://modelviewer.dev/) 4.4.0（Apache-2.0）、無料CDNから読み込み
- iPhoneではSafariからAR Quick Look、Android対応端末ではWebXRまたはScene Viewerを使用予定
- `ar-placement="wall"` を指定したが、**iPhoneでの垂直面認識・壁固定は未検証**。機種やOSによって配置方式が異なる場合がある。
- AR起動後はOSのビューアーになるため、Webページ内のバルブ操作ボタンをARの上に表示できない。ARに入る前に開閉状態を選択する。
- カメラ映像はブラウザ内だけで表示し、アプリからサーバーに送信しない。
- 実際の壁の中の配管を検出しない。流量・圧力の物理演算を行わない。

## 公開（GitHub Pages）

1. 新しい専用公開リポジトリ（例: `wallpipe-ar`）を作る。
2. このフォルダの `index.html` と `assets/` を**リポジトリ直下**に配置する。アプリの実行に `tools/` は不要。
3. `Settings` → `Pages` → `Build and deployment` → `Deploy from a branch` → `main` → `/(root)` → `Save`。
4. `https://<GitHubユーザー名>.github.io/wallpipe-ar/` のようなHTTPS URLが発行される（例のURLは実在する公開先ではない）。
5. iPhoneのSafariでURLを開き、3D/AR表示を選んで試す。

GitHub Pagesの通常公開サイトは誰でも閲覧できます。企業固有情報、設計図、個人情報を配置しないでください。

## PCで実行

```
cd WallPipe_AR
python -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開く。3DモデルとCDNはインターネット接続が必要。`file://` 直開きでは3Dモデルを読み込めない場合がある。

## ディレクトリ

- `index.html`: Webアプリ本体（CSS/JS埋め込み）
- `assets/`: 状態別の汎用3DモデルGLB（3設備 × 開閉4通り × 流れ2通り = 24個）
- `tools/generate_models.py`: 3Dモデルの再生成コード（開発者向け。`pip install trimesh numpy`）

## 商用利用・制作物表示

独立した非公式技術デモです。第三者による設計・保守の判断に使用しないでください。