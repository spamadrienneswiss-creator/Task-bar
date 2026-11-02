# Task Bar's search helper. Runs in the background and answers one JSON request per line:
#   {"id":1,"op":"files","q":"budget"}  -> files from the Windows search index
#   {"id":2,"op":"apps"}                -> every app in the Start menu (name + AppID)
#   {"id":3,"op":"ping"}
# Each answer is one JSON line: {"id":1,"ok":true,"items":[...]}
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$conn = $null
function Get-Conn {
  if ($script:conn -eq $null -or $script:conn.State -ne 1) {
    $script:conn = New-Object -ComObject ADODB.Connection
    $script:conn.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
  }
  return $script:conn
}

function Find-Files([string]$q) {
  $words = @($q -split '\s+' | Where-Object { $_ -ne '' } | Select-Object -First 5)
  if ($words.Count -eq 0) { return @() }
  $cond = ($words | ForEach-Object { '"' + $_ + '*"' }) -join ' AND '
  $sql = "SELECT TOP 8 System.ItemPathDisplay, System.ItemNameDisplay, System.ItemFolderPathDisplay FROM SYSTEMINDEX " +
         "WHERE SCOPE='file:' AND CONTAINS(System.ItemNameDisplay, '$cond') " +
         "AND System.FileExtension <> '.lnk' AND System.FileExtension <> '.url' " +
         "ORDER BY System.Search.Rank DESC"
  $rs = New-Object -ComObject ADODB.Recordset
  $rs.Open($sql, (Get-Conn))
  $out = New-Object System.Collections.ArrayList
  while (-not $rs.EOF) {
    [void]$out.Add([ordered]@{
      path   = [string]$rs.Fields.Item('System.ItemPathDisplay').Value
      name   = [string]$rs.Fields.Item('System.ItemNameDisplay').Value
      folder = [string]$rs.Fields.Item('System.ItemFolderPathDisplay').Value
    })
    $rs.MoveNext()
  }
  $rs.Close()
  return $out
}

function Get-Apps {
  $out = New-Object System.Collections.ArrayList
  foreach ($a in (Get-StartApps)) { [void]$out.Add([ordered]@{ name = [string]$a.Name; appId = [string]$a.AppID }) }
  return $out
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line.Trim() -eq '') { continue }
  $id = 0
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    switch ($req.op) {
      'files' { $items = Find-Files ([string]$req.q) }
      'apps'  { $items = Get-Apps }
      'ping'  { $items = @() }
      default { throw "unknown op" }
    }
    $json = ConvertTo-Json -InputObject @{ id = $id; ok = $true; items = @($items) } -Compress -Depth 4
  } catch {
    $json = ConvertTo-Json -InputObject @{ id = $id; ok = $false; error = [string]$_.Exception.Message } -Compress
  }
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
