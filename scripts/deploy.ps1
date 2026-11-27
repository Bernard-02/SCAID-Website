# 前台上線（user 2026-11-27；同 SCCD 的上傳包，但直接同步到 S3、不先出包）：重編 CSS → 網站要用的檔同步到 S3 → 清 CloudFront 快取
# 用法（專案根目錄）：
#   powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -DryRun   只列出會傳／會刪哪些檔，不重編、不動 S3
#   powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1           真的傳
#   …deploy.ps1 -AllFonts   字體整個重傳一次（下面「字體」那段：已經在 S3 上的字檔 sync 不會重傳＝快取設定還是舊的，換了快取設定之後跑一次）
# 金鑰：aws configure --profile scaid（存在 %USERPROFILE%\.aws、不在 repo）；IAM 使用者 scaid＝後台 Directus 用的同一個
# 只傳 $FILES 那幾樣（scripts/ 裡有後台的 token，不能整個資料夾傳）。bucket 裡其他路徑——後台的舊副本 Directus/、Directus11/——
# 不傳也不刪：sync 的 --delete 只刪「被 include 到、本機沒有」的檔
param([switch]$DryRun, [switch]$AllFonts)
$ErrorActionPreference = 'Stop'
$aws = 'C:\Program Files\Amazon\AWSCLIV2\aws.exe'
$bucket = 's3://scaid.usc.edu.tw'
$distribution = 'E3CYJ5880KIXQ3'
$p = '--profile', 'scaid', '--region', 'ap-northeast-2'
$FILES = 'index.html', 'pages/*', 'css/output.css', 'js/*', 'images/*', 'objects/*', 'website-icons/*'   # fonts/ 另外傳（下面）

Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $DryRun) {
  npm run build:css
  if ($LASTEXITCODE) { throw 'build:css 失敗' }
}

$filters = @('--exclude', '*') + ($FILES | ForEach-Object { '--include', $_ }) + @('--exclude', '*.mp4', '--exclude', 'Directus*')
# no-cache＝瀏覽器每次都問一下有沒有新版（CSS／JS 檔名不帶版本號；同 SCCD）
$sync = @('s3', 'sync', '.', $bucket, '--delete', '--cache-control', 'no-cache') + $filters + $p
if ($DryRun) { $sync += '--dryrun' }
& $aws @sync
if ($LASTEXITCODE) { throw 's3 sync 失敗' }
# 字體：網址都帶內容雜湊（font.css 裡每片 woff2、各頁連 font.css、typography.css 連 JetBrains Mono 都有 ?v=）＝同一個網址的內容不會變
# → 讓瀏覽器長期快取（老訪客不用每一片都再問一次）。sync 只傳變了的檔：快取設定改了、舊的字檔要 -AllFonts 整個重傳一次才會換
$font = if ($AllFonts) { @('s3', 'cp', 'fonts', "$bucket/fonts", '--recursive') } else { @('s3', 'sync', 'fonts', "$bucket/fonts", '--delete') }
$font += @('--cache-control', 'public, max-age=31536000, immutable') + $p
if ($DryRun) { $font += '--dryrun' }
& $aws @font
if ($LASTEXITCODE) { throw 's3 字體上傳失敗' }
if (-not $DryRun) {
  & $aws cloudfront create-invalidation --distribution-id $distribution --paths '/*' --query 'Invalidation.Id' --output text @p
  if ($LASTEXITCODE) { throw '清快取失敗' }
  Write-Host '上傳完成；CloudFront 清快取約 1～5 分鐘生效'
}
