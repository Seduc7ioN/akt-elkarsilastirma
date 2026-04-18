$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
$distDir = Join-Path $root "dist"

if (-not (Test-Path $distDir)) {
  throw "dist klasoru bulunamadi. Once npm run build calistirin."
}

$envMap = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line.Split("=", 2)
    if ($parts.Length -eq 2) {
      $envMap[$parts[0].Trim()] = $parts[1].Trim().Trim('"')
    }
  }
}

$required = @("FTP_HOST", "FTP_USER", "FTP_PASSWORD", "FTP_REMOTE_DIR")
foreach ($key in $required) {
  $fromEnv = [System.Environment]::GetEnvironmentVariable($key)
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    $envMap[$key] = $fromEnv
  }
  if (-not $envMap.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envMap[$key])) {
    throw "$key ne .env'de ne de ortam degiskeninde tanimli."
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
    [System.Net.NetworkCredential]$Credentials,
    [int]$MaxAttempts = 4
  )

  $attempt = 0
  $lastError = $null
  while ($attempt -lt $MaxAttempts) {
    $attempt++
    try {
      $request = [System.Net.FtpWebRequest]::Create($RemoteUri)
      $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
      $request.Credentials = $Credentials
      $request.UseBinary = $true
      $request.KeepAlive = $false
      $request.Timeout = 60000
      $request.ReadWriteTimeout = 60000

      $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
      $request.ContentLength = $bytes.Length
      $stream = $request.GetRequestStream()
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Close()

      $response = $request.GetResponse()
      $response.Close()
      return
    } catch {
      $lastError = $_
      Write-Host ("  ! Deneme {0}/{1} basarisiz: {2}" -f $attempt, $MaxAttempts, $_.Exception.Message)
      Start-Sleep -Seconds ([math]::Min(10, 2 * $attempt))
    }
  }
  throw $lastError
}

$allDirs = Get-ChildItem -Path $distDir -Directory -Recurse | Sort-Object FullName
New-FtpDirectory -Uri ("ftp://{0}{1}" -f $ftpHost, $remoteRoot) -Credentials $credentials

foreach ($dir in $allDirs) {
  $relative = $dir.FullName.Substring($distDir.Length).TrimStart('\').Replace('\', '/')
  $remoteDir = "{0}/{1}" -f $remoteRoot, $relative
  New-FtpDirectory -Uri ("ftp://{0}{1}" -f $ftpHost, $remoteDir) -Credentials $credentials
}

$files = Get-ChildItem -Path $distDir -File -Recurse
$failed = New-Object System.Collections.Generic.List[object]
foreach ($file in $files) {
  $relative = $file.FullName.Substring($distDir.Length).TrimStart('\').Replace('\', '/')
  $remotePath = "{0}/{1}" -f $remoteRoot, $relative
  $remoteUri = "ftp://{0}{1}" -f $ftpHost, $remotePath
  Write-Host "Yukleniyor: $relative"
  try {
    Send-FtpFile -LocalPath $file.FullName -RemoteUri $remoteUri -Credentials $credentials
  } catch {
    Write-Host ("  !! Basarisiz, ikinci tura birakildi: {0}" -f $relative)
    $failed.Add([pscustomobject]@{ Local = $file.FullName; Uri = $remoteUri; Relative = $relative })
  }
}

if ($failed.Count -gt 0) {
  Write-Host ("Ikinci tur: {0} dosya tekrar deneniyor..." -f $failed.Count)
  Start-Sleep -Seconds 5
  $stillFailed = New-Object System.Collections.Generic.List[string]
  foreach ($f in $failed) {
    try {
      # eksik dizin varsa yeniden olustur
      $parent = ($f.Relative -replace '/[^/]*$', '')
      if ($parent -and $parent -ne $f.Relative) {
        New-FtpDirectory -Uri ("ftp://{0}{1}/{2}" -f $ftpHost, $remoteRoot, $parent) -Credentials $credentials
      }
      Send-FtpFile -LocalPath $f.Local -RemoteUri $f.Uri -Credentials $credentials
      Write-Host ("  OK (2. tur): {0}" -f $f.Relative)
    } catch {
      Write-Host ("  HALA BASARISIZ: {0} -> {1}" -f $f.Relative, $_.Exception.Message)
      $stillFailed.Add($f.Relative)
    }
  }
  if ($stillFailed.Count -gt 0) {
    throw ("Deploy tamamlanamadi, {0} dosya yuklenemedi." -f $stillFailed.Count)
  }
}

Write-Host "FTP deploy tamamlandi."
