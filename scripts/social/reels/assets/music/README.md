# Reels müzik klasörü

Bu klasöre bırakılan `.mp3` / `.m4a` / `.wav` / `.ogg` dosyaları, reel
oluşturulurken rastgele seçilip arka plan müziği olarak eklenir.

## Lisans

**Sadece ticari kullanıma açık (CC0 / royalty-free) müzik koyun.**
Instagram telif koruması yüzünden lisanssız müzik videonu düşürebilir.

## Önerilen ücretsiz kaynaklar

- **Pixabay Music** — https://pixabay.com/music/ (Pixabay License, ticari OK)
- **Mixkit** — https://mixkit.co/free-stock-music/ (Mixkit License)
- **Uppbeat** — https://uppbeat.io/browse/music (ücretsiz hesapla)
- **YouTube Audio Library** — https://studio.youtube.com/ (Creator Studio → Audio Library, "No attribution required" filtresi)

## Nasıl eklenir

1. Yukarıdaki sitelerden kısa (10–30 sn) bir loop / ambient track indir.
2. `scripts/social/reels/assets/music/` klasörüne at.
3. Commit + push.
4. Cron / manuel tetikleme sırasında otomatik kullanılır.

Birden fazla dosya koyarsan her reel farklı müzikle çıkar.

## Teknik notlar

- Reel süresi 7 sn; müzik daha uzunsa kırpılır (`-shortest`).
- Volume -8dB düşürülür; 0.4 sn fade-in + 0.6 sn fade-out uygulanır.
- Env override: `REELS_MUSIC_FILE=/path/to/song.mp3` (tek dosyayı zorlar).
