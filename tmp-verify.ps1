$t = '2820ccb73be928ac3494b0d131cceebda52fc1ab9392e2ea3cdb5dfa0fa14800'   # admin session (minted)
$b = 'http://127.0.0.1:3000'

function hit($p) {
  $c = "course_session=$t"
  Write-Host "GET $p " -NoNewline
  try {
    $r = Invoke-RestMethod -Uri ($b + $p) -Method Get -Headers @{ Cookie = $c } -TimeoutSec 10
    Write-Host "OK status=$($r.status) :: $($r.error -replace '\s+',' ' -replace '<[^>]+>','' -replace '\n',' ')[0..3] -join ' '"
  } catch {
    $e = $_.Exception
    $msg = ''
    if ($e.Response) {
      $msg = (Invoke-RestMethod -Uri ($b + $p) -Method Get -Headers @{ Cookie = $c } -TimeoutSec 10 -ErrorAction SilentlyContinue) -replace '\s+',' ' -replace '<[^>]+>','' -replace '\n',' '
    } else {
      $msg = $e.Message -replace '\s+',' ' -replace '<[^>]+>','' -replace '\n',' '
    }
    Write-Host "ERR ($($e.GetType().FullName)) :: $msg"
  }
}

hit('/api/me')
hit('/api/dashboard')
hit('/api/system-reset/requests')
hit('/api/system-reset/requests?force=1')
hit('/api/backup')
hit('/api/session-reminders/record')
