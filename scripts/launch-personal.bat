@echo off
REM AudioTranscriptionApp（完成版）をデスクトップアイコンから起動するためのランチャー。
REM デスクトップショートカットの「リンク先」はこのファイルを指定する想定。
REM npm run dev:personal を実行し、開発モードでElectronウィンドウを起動する。

chcp 65001 >nul
cd /d "%~dp0.."

title AudioTranscriptionApp（完成版）
echo AudioTranscriptionApp（完成版）を起動しています...
echo （共通ライブラリの再ビルド等が入るため、ウインドウが開くまで少し時間がかかることがあります）
echo.

call npm run dev:personal

if errorlevel 1 (
  echo.
  echo ==============================================
  echo 起動中にエラーが発生しました。上のログを確認してください。
  echo ==============================================
  pause
)
