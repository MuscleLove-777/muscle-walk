# 筋肉ウォーク〜ジャンクフード撃滅〜 / Muscle Walk

歩いた歩数で筋肉女がジャンクフードをぶっ飛ばすPWAペドメーターゲーム。
A PWA pedometer game where your muscle girl punches junk food with every step.

- 📱 PWA（ホーム画面に追加可能、オフライン動作）
- 🦾 DeviceMotionで歩数自動カウント、デスクトップは手動 / Space
- 🍕 8種のジャンクフードをKO、コンボシステム搭載
- 💾 累計歩数・KO数をlocalStorage保存
- ✨ 完全クライアント側、外部API・課金一切なし

## URL
公開後: `https://musclelove-777.github.io/muscle-walk/`

## 開発
```
docs/index.html  ← エントリ
docs/game.js     ← Canvas2D + 歩数検出
docs/style.css
docs/manifest.json + sw.js (PWA)
docs/icon-192.png / icon-512.png  ← gen_icons.pyで生成
```

## デプロイ
mainブランチへpushでGitHub Actions → Pagesに自動公開（workflow mode）。

## ブランド
&copy; MuscleLove · X [@MuscleGirlLove7](https://x.com/MuscleGirlLove7) · [Patreon](https://www.patreon.com/cw/MuscleLove)
