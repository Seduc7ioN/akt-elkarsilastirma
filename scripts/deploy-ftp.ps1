$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
$distDir = Join-Path $root "dist"

if (-not (Test-Path $envFile)) {
  throw ".env dosyasi bulunamadi. Once .env.example dosyasini .env olarak kopyalayin."
}

if (-not (Test-Path $distDir)) {
  throw "dist klasoru bulunamadi. Once npm run build calistirin."
}

$envMap = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $parts = $line.Split("=", 2)
  if ($parts.Length -eq 2) {
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    $envMap[$key] = $value
  }
}

$required = @("FTP_HOST", "FTP_USER", "FTP_PASSWORD", "FTP_REMOTE_DIR")
foreach ($key in $required) {
  if (-not $envMap.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envMap[$key])) {
    throw "$key .env icinde tanimli degil."
  }
}

$ftpHost = $envMap["FTP_HOST"].TrimEnd("/")
$ftpUser = $envMap["FTP_USER"]
$ftpPassword = $envMap["FTP_PASSWORD"]
$remoteRoot = $envMap["FTP_REMOTE_DIR"].TrimEnd("/")

$credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPassword)

function New-FtpDirectory {
  param(
    [string]$Uri,
    [System.Net.NetworkCredential]$Credentials
  )

  try {
    $request = [System.Net.FtpWebRequest]::Create($Uri)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = $Credentials
    $request.UseBinary = $true
    $request.KeepAlive = $false
    $response = $request.GetResponse()
    $response.Close()
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp) {
      $status = [int]$resp.StatusCode
      $resp.Close()
      if ($status -in 550, 521) { return }
    }
  }
}

function Send-FtpFile {
  param(
    [string]$LocalPath,
    [string]$RemoteUri,
    [System.Net.NetworkCredential]$Credentials
  )

  $request = [System.Net.FtpWebRequest]::Create($RemoteUri)
  $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
  $request.Credentials = $Credentials
  $request.UseBinary = $true
  $request.KeepAlive = $false

  $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
  $request.ContentLength = $bytes.Length
  $stream = $request.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()

  $response = $request.GetResponse()
  $response.Close()
}

$allDirs = Get-ChildItem -Path $distDir -Directory -Recurse | Sort-Object FullName
New-FtpDirectory -Uri ("ftp://{0}{1}" -f $ftpHost, $remoteRoot) -Credentials $credentials

foreach ($dir in $allDirs) {
  $relative = $dir.FullName.Substring($distDir.Length).TrimStart('\').Replace('\', '/')
  $remoteDir = "{0}/{1}" -f $remoteRoot, $relative
  New-FtpDirectory -Uri ("ftp://{0}{1}" -f $ftpHost, $remoteDir) -Credentials $credentials
}

$files = Get-ChildItem -Path $distDir -File -Recurse
foreach ($file in $files) {
  $relative = $file.FullName.Substring($distDir.Length).TrimStart('\').Replace('\', '/')
  $remotePath = "{0}/{1}" -f $remoteRoot, $relative
  $remoteUri = "ftp://{0}{1}" -f $ftpHost, $remotePath
  Write-Host "Yukleniyor: $relative"
  Send-FtpFile -LocalPath $file.FullName -RemoteUri $remoteUri -Credentials $credentials
}

Write-Host "FTP deploy tamamlandi."
