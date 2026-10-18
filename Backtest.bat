@echo off
rem Backtest uygulamasini baslatir: gerekirse paketleri kurar, veri yoksa indirir, tarayicida acar.
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist data\bars-dukascopy if not exist data\bars (
  echo Veri bulunamadi, Dukascopy'den indiriliyor. Ilk seferde yaklasik 1,5 saat surebilir...
  call npm run data:dukascopy
)
call npm run build
node server\index.mjs --open
