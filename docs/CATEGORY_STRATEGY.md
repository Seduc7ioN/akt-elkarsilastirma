# Category Strategy

Bu proje artik tam katalog mantigina geciyor.

## Departmanlar

- Erkek
- Kadin
- Cocuk

## Ana kategoriler

- Ust Giyim
- Alt Giyim
- Dis Giyim

## Ornek alt kategoriler

- Tisort
- Gomlek
- Sweat
- Pantolon
- Hirka
- Kase Kaban
- Mont
- Ceket
- Sort
- Etek
- Triko

## Veri modeline eklenen alanlar

- `department`
- `age_group`
- `main_category`
- `sub_category`
- `product_type`

## Mantik

Adaptor bu alanlari dogrudan verirse onu kullaniriz.
Vermezse import asamasinda title, category ve gender verisinden heuristik olarak cikaririz.
