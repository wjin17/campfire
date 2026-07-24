# Polls the Windows System Media Transport Controls (GSMTC) every 500ms and
# emits one compact JSON line per tick on stdout, matching Campfire's
# now-playing schema. Spawned by src/main/index.ts on win32 only.

[CmdletBinding()]
param()

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSession,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT {
  param($WinRtTask, [Type]$ResultType)
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

function Write-Line {
  param([string]$Text)
  [Console]::Out.WriteLine($Text)
  [Console]::Out.Flush()
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$manager = Await-WinRT ($managerType::RequestAsync()) $managerType

while ($true) {
  try {
    $session = $manager.GetCurrentSession()
    if ($null -ne $session) {
      $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
      $props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) $propsType
      $timeline = $session.GetTimelineProperties()
      $playback = $session.GetPlaybackInfo()
      $isPlaying = $playback.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing

      $payload = [PSCustomObject]@{
        source   = 'smtc'
        title    = $props.Title
        artist   = $props.Artist
        position = [math]::Round($timeline.Position.TotalSeconds, 3)
        duration = [math]::Round($timeline.EndTime.TotalSeconds, 3)
        playing  = $isPlaying
        ts       = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      }

      Write-Line ($payload | ConvertTo-Json -Compress)
    }
  } catch {
    # No active session, or WinRT call failed transiently — skip this tick.
  }

  Start-Sleep -Milliseconds 500
}
