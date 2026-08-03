# 共通契約（全班・唯一の正本）

**案件**: AIまるごと採用雑務代行（株式会社NEXT）営業サイト
**仕様書**: `../詳細構成.md`（コピー・構成の正本）
**この契約**: 技術面の正本。班はこれに従う。逸脱する場合は司令塔に確認を上げる。

---

## 1. ファイル担当（1ファイル1班・排他）

| 担当 | ファイル | 内容 |
|---|---|---|
| 司令塔 | `index.html` / `js/main.js` | 構造・コピー・モジュール起動。**班は編集禁止** |
| 班A | `css/style.css` | 全スタイル |
| 班B | `js/hero.js` | Three.jsヒーロー背景 |
| 班C | `js/timeline.js` | タイムライン3状態＋ビジョン消失 |
| 班D | `js/viz.js` | 7機能円環／ROI／カウンタ／reveal |
| 班E | （読み取りのみ） | レビュー・FB |

**自分の担当ファイル以外を書き換えない。** 他のファイルは読んでよい。

---

## 2. 技術スタック（固定）

- **three.js** … importmap経由のESM（`index.html`で定義済み）。`import * as THREE from 'three'`
- **GSAP + ScrollTrigger** … UMDで先読み済み。`window.gsap` / `window.ScrollTrigger` を使う
- **ビルドツールなし。** 素のESモジュール。npm/バンドラは使わない
- **CDN以外の外部通信をしない**

## 3. モジュールIF（固定）

各JSファイルは**名前付きexport `init()`** を1つだけ持つ。引数なし、戻り値なし。

```js
// js/hero.js
export function init() { /* ... */ }
```

`main.js` が以下の順で呼ぶ（班は main.js を編集しない）:
```js
import { init as initHero } from './hero.js';
import { init as initTimeline } from './timeline.js';
import { init as initViz } from './viz.js';
initHero(); initTimeline(); initViz();
```

- **自分の担当要素以外にDOMを追加・削除しない**
- 対象要素が存在しない場合は**何もせず即return**（エラーを投げない）
- `ScrollTrigger.refresh()` は main.js が最後に1回呼ぶ。各班は呼ばない

## 4. デザイントークン（CSS変数・班Aが `:root` に定義、他班も参照）

```css
--bg:      #05070A;   /* 基調（ほぼ黒） */
--bg-2:    #0A0E14;   /* セクション交互背景 */
--ink:     #E8EEF5;   /* 本文 */
--ink-dim: #8A99AB;   /* 補足 */
--accent:  #00D4FF;   /* アクセント1色：シアン */
--accent-2:#2B6CFF;   /* 補助の青（グラデ用のみ） */
--line:    rgba(255,255,255,.08);
--glow:    rgba(0,212,255,.35);
--maxw:    1120px;
```

**禁止**: 黄色・金色・暖色アクセント／明朝体／bounce・elasticイージング。
**書体**: 見出し・本文 `'Zen Kaku Gothic New'`（700/900）、数値・ラベル `'Roboto Mono'`。
**イージング**: `power2.out` / `power3.out` / `none` のみ。動きはゆっくり・等速寄り。

## 5. トーン

- 法人向け。静けさと精度感。派手さより余白
- アニメは**入りは控えめ、要所だけ強く**
- 1画面に情報を詰め込まない

## 6. 共通クラス（班Aが定義、班Dが発火）

| クラス | 意味 |
|---|---|
| `.reveal` | スクロールで下から20px＋フェードイン。班Dが `.is-in` を付与 |
| `.ph` | 未確定数値のプレースホルダ（点線下線＋アクセント色） |
| `.num` | 数値表示（等幅フォント） |
| `[data-count]` | カウントアップ対象。属性値が最終値 |

## 7. レスポンシブ

- ブレークポイント: `768px`（以下をSP扱い）
- **SPでもレイアウトが破綻しないこと。** 横スクロールを発生させない
- `prefers-reduced-motion: reduce` のときはアニメを止め、最終状態を表示する

## 8. パフォーマンス

- 非表示タブでは描画ループを止める（`document.hidden`）
- Three.jsの`pixelRatio`は `Math.min(devicePixelRatio, 2)` で上限
- 画像は `loading="lazy"`（ヒーロー以外）

## 9. WordPress入稿を前提とした制約

- **`<style>`/`<script>`をHTMLにインラインで増やさない**（外部ファイルに置く）
- id/classは `nx-` 接頭辞を付けない代わりに、汎用すぎる名前（`.container` `.title` 等）を避ける
- `body`直下に依存する実装をしない（テーマのラッパーに包まれても動くように）

## 10. 禁止（内容面）

- **未開発機能について「動作している画面」を作らない**（7機能はUIモックを作らない。抽象表現のみ）
- 実在の個人名・企業名をダミーデータに使わない
- 数値を勝手に作らない。未確定は `.ph` プレースホルダのまま残す
