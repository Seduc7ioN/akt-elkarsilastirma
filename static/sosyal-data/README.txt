Bu dizin Instagram icerikleri icin kullanilir.

Kurulum (bir kez):
  1) Parola hash'i olustur (ornek parola: "gizli123"):
     Linux/macOS:  echo -n "gizli123" | sha256sum
     Windows PS:   [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("gizli123"))).Replace("-","").ToLower()

  2) Cikan hex string'i tek satir olarak .auth dosyasina yaz ve FTP ile
     /sosyal-data/.auth yoluna yukle.

Pipeline burayi doldurur:
  - index.json  (son icerikler listesi)
  - <stamp>-<template>/cover.png
  - <stamp>-<template>/reel.mp4

Yonetici paneli: https://<site>/sosyal.php
