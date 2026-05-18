param(
  [string]$WorkbookPath = "..\Workout Plan Summer 2026.xlsx",
  [string]$OutputPath = ".\data\workouts.js"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-PathOrThrow {
  param([string]$PathValue)
  $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction SilentlyContinue
  if (-not $resolved) {
    throw "Path not found: $PathValue"
  }
  return $resolved.ProviderPath
}

function Read-ZipEntryText {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [string]$EntryPath
  )

  $entry = $Zip.GetEntry($EntryPath)
  if (-not $entry) {
    throw "Workbook entry not found: $EntryPath"
  }

  $stream = $entry.Open()
  try {
    $reader = New-Object System.IO.StreamReader($stream)
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Load-Xml {
  param([string]$Text)
  $xml = New-Object System.Xml.XmlDocument
  $xml.PreserveWhitespace = $false
  $xml.LoadXml($Text)
  return $xml
}

function Get-CellColumnIndex {
  param([string]$CellReference)
  $letters = ([regex]::Match($CellReference, "^[A-Z]+")).Value
  $index = 0
  foreach ($char in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$char - [int][char]"A" + 1)
  }
  return $index - 1
}

function Convert-CellValue {
  param(
    [System.Xml.XmlNode]$Cell,
    [string[]]$SharedStrings
  )

  $type = $Cell.GetAttribute("t")
  $valueNode = $Cell.SelectSingleNode("*[local-name()='v']")

  if ($type -eq "inlineStr") {
    $textNode = $Cell.SelectSingleNode("*[local-name()='is']//*[local-name()='t']")
    if ($textNode) { return $textNode.InnerText }
    return $null
  }

  if (-not $valueNode) {
    return $null
  }

  $raw = $valueNode.InnerText
  if ($type -eq "s") {
    $sharedIndex = [int]$raw
    if ($sharedIndex -ge 0 -and $sharedIndex -lt $SharedStrings.Count) {
      return $SharedStrings[$sharedIndex]
    }
    return $null
  }

  if ($raw -match "^-?\d+$") {
    return [int]$raw
  }

  $number = 0.0
  if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return $number
  }

  return $raw
}

function Read-WorksheetRows {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [string]$SheetPath,
    [string[]]$SharedStrings
  )

  $xml = Load-Xml (Read-ZipEntryText -Zip $Zip -EntryPath $SheetPath)
  $rowNodes = $xml.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")
  $rows = @()

  foreach ($rowNode in $rowNodes) {
    $values = @()
    $maxColumn = -1
    foreach ($cell in $rowNode.SelectNodes("*[local-name()='c']")) {
      $columnIndex = Get-CellColumnIndex $cell.GetAttribute("r")
      while ($values.Count -le $columnIndex) {
        $values += $null
      }
      $values[$columnIndex] = Convert-CellValue -Cell $cell -SharedStrings $SharedStrings
      if ($columnIndex -gt $maxColumn) {
        $maxColumn = $columnIndex
      }
    }

    if ($maxColumn -ge 0) {
      $rows += ,$values
    }
  }

  return $rows
}

function Normalize-Focus {
  param([object]$Value)
  if ($null -eq $Value) { return $null }

  $text = "$Value".Trim()
  if ($text.Length -eq 0) { return $null }

  $map = @{
    "Full Body Power" = "Full Body"
    "Repeat Runs (intervals)" = "Repeat Runs"
    "Game Speed Conditioning" = "Game Speed"
    "Passing & Scanning" = "Passing, Scanning & Decisions"
  }

  if ($map.ContainsKey($text)) {
    return $map[$text]
  }

  return $text
}

function Get-Text {
  param([object]$Value)
  if ($null -eq $Value) { return $null }
  $text = "$Value".Trim()
  if ($text.Length -eq 0) { return $null }
  return $text
}

function Get-NumberOrText {
  param([object]$Value)
  if ($null -eq $Value) { return $null }
  if ($Value -is [int] -or $Value -is [double]) { return $Value }
  $text = "$Value".Trim()
  if ($text.Length -eq 0) { return $null }
  return $text
}

function Get-YoutubeEmbedUrl {
  param([object]$Value)
  $url = Get-Text $Value
  if (-not $url) { return $null }

  $videoId = $null
  if ($url -match "youtu\.be/([^?&/]+)") {
    $videoId = $Matches[1]
  } elseif ($url -match "[?&]v=([^?&]+)") {
    $videoId = $Matches[1]
  } elseif ($url -match "youtube\.com/shorts/([^?&/]+)") {
    $videoId = $Matches[1]
  }

  if (-not $videoId) { return $null }
  return "https://www.youtube.com/embed/$videoId"
}

function Convert-ToStableIdPart {
  param([object]$Value)
  if ($null -eq $Value) { return "none" }
  $text = "$Value".ToLowerInvariant().Trim()
  if ($text.Length -eq 0) { return "none" }
  $text = [regex]::Replace($text, "[^a-z0-9]+", "-").Trim("-")
  if ($text.Length -eq 0) { return "none" }
  return $text
}

function Get-ExerciseId {
  param(
    [object]$Category,
    [object]$Phase,
    [object]$Sequence,
    [object]$Movement
  )
  return @(
    Convert-ToStableIdPart $Category
    Convert-ToStableIdPart $Phase
    Convert-ToStableIdPart $Sequence
    Convert-ToStableIdPart $Movement
  ) -join "__"
}

function Get-Cell {
  param(
    [object[]]$Row,
    [int]$Index
  )
  if ($Index -lt $Row.Count) {
    return $Row[$Index]
  }
  return $null
}

$workbookFullPath = Resolve-PathOrThrow $WorkbookPath
$outputFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$outputDirectory = Split-Path -Parent $outputFullPath

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tempWorkbookPath = Join-Path ([System.IO.Path]::GetTempPath()) ("workout-plan-{0}.xlsx" -f ([guid]::NewGuid().ToString("N")))
[System.IO.File]::Copy($workbookFullPath, $tempWorkbookPath, $true)

$zip = [System.IO.Compression.ZipFile]::OpenRead($tempWorkbookPath)
try {
  $sharedStrings = @()
  if ($zip.GetEntry("xl/sharedStrings.xml")) {
    $sharedXml = Load-Xml (Read-ZipEntryText -Zip $zip -EntryPath "xl/sharedStrings.xml")
    foreach ($item in $sharedXml.SelectNodes("//*[local-name()='si']")) {
      $parts = @()
      foreach ($textNode in $item.SelectNodes(".//*[local-name()='t']")) {
        $parts += $textNode.InnerText
      }
      $sharedStrings += ($parts -join "")
    }
  }

  $workbookXml = Load-Xml (Read-ZipEntryText -Zip $zip -EntryPath "xl/workbook.xml")
  $relsXml = Load-Xml (Read-ZipEntryText -Zip $zip -EntryPath "xl/_rels/workbook.xml.rels")

  $rels = @{}
  foreach ($rel in $relsXml.SelectNodes("//*[local-name()='Relationship']")) {
    $target = $rel.GetAttribute("Target")
    if (-not $target.StartsWith("/")) {
      $target = "xl/$target"
    } else {
      $target = $target.TrimStart("/")
    }
    $rels[$rel.GetAttribute("Id")] = $target
  }

  $sheets = @{}
  foreach ($sheet in $workbookXml.SelectNodes("//*[local-name()='sheet']")) {
    $name = $sheet.GetAttribute("name")
    $rid = $sheet.GetAttribute("r:id")
    $sheets[$name] = Read-WorksheetRows -Zip $zip -SheetPath $rels[$rid] -SharedStrings $sharedStrings
  }
} finally {
  $zip.Dispose()
  Remove-Item -LiteralPath $tempWorkbookPath -Force -ErrorAction SilentlyContinue
}

if (-not $sheets.ContainsKey("Schedule")) {
  throw "Schedule sheet not found."
}
if (-not $sheets.ContainsKey("Exercises")) {
  throw "Exercises sheet not found."
}

$exerciseRows = $sheets["Exercises"]
$exercises = @()
for ($i = 1; $i -lt $exerciseRows.Count; $i++) {
  $row = $exerciseRows[$i]
  $category = Get-Text (Get-Cell $row 0)
  $phase = Get-Text (Get-Cell $row 1)
  $movement = Get-Text (Get-Cell $row 2)

  if (-not $movement) {
    continue
  }

  if (-not $category -and $phase -eq "Mobility") {
    $category = "Strength"
  }

  $reference = Get-Text (Get-Cell $row 7)
  $sequence = Get-NumberOrText (Get-Cell $row 4)
  $exercises += [ordered]@{
    exerciseId = Get-ExerciseId -Category $category -Phase $phase -Sequence $sequence -Movement $movement
    category = $category
    phase = $phase
    normalizedPhase = Normalize-Focus $phase
    movement = $movement
    target = Get-Text (Get-Cell $row 3)
    sequence = $sequence
    sets = Get-NumberOrText (Get-Cell $row 5)
    reps = Get-NumberOrText (Get-Cell $row 6)
    reference = $reference
    embedUrl = Get-YoutubeEmbedUrl $reference
  }
}

$scheduleRows = $sheets["Schedule"]
$dayNames = @()
for ($column = 1; $column -le 7; $column++) {
  $dayNames += Get-Text (Get-Cell $scheduleRows[0] $column)
}

$areaRows = @(
  @{ row = 1; key = "strength"; title = "Strength"; category = "Strength" },
  @{ row = 2; key = "technical"; title = "Technical Soccer"; category = "Technical" },
  @{ row = 3; key = "conditioning"; title = "Conditioning"; category = "Conditioning" }
)

$days = @()
for ($column = 1; $column -le 7; $column++) {
  $dayName = $dayNames[$column - 1]
  if (-not $dayName) {
    continue
  }

  $areas = @()
  foreach ($area in $areaRows) {
    $rawFocus = Get-Text (Get-Cell $scheduleRows[$area.row] $column)
    $normalizedFocus = Normalize-Focus $rawFocus
    $isRest = $rawFocus -and $rawFocus.ToUpperInvariant() -eq "REST"
    $matches = @()

    if ($normalizedFocus -and -not $isRest) {
      $matches = @(
        $exercises | Where-Object {
          $_.category -eq $area.category -and $_.normalizedPhase -eq $normalizedFocus
        } | Sort-Object @{ Expression = {
          if ($null -eq $_.sequence) { 999 } elseif ($_.sequence -is [int] -or $_.sequence -is [double]) { $_.sequence } else { 998 }
        }}, movement
      )
    }

    $status = "assigned"
    if (-not $rawFocus) {
      $status = "empty"
    } elseif ($isRest) {
      $status = "rest"
    } elseif ($matches.Count -eq 0) {
      $status = "no-routine"
    }

    $areas += [ordered]@{
      key = $area.key
      title = $area.title
      category = $area.category
      focus = $rawFocus
      normalizedFocus = $normalizedFocus
      status = $status
      exercises = $matches
    }
  }

  $days += [ordered]@{
    day = $dayName
    dayIndex = $column - 1
    areas = $areas
  }
}

$payload = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  sourceWorkbook = Split-Path -Leaf $workbookFullPath
  days = $days
  exercises = $exercises
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$json = $payload | ConvertTo-Json -Depth 20
$content = "window.WORKOUT_DATA = $json;`n"
[System.IO.File]::WriteAllText($outputFullPath, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "Wrote $outputFullPath"
Write-Host "Days: $($days.Count)"
Write-Host "Exercises: $($exercises.Count)"
