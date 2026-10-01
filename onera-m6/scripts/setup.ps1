$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workRoot = Join-Path $projectRoot 'work'
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

function Get-VerifiedDownload($Url, $Target, $Sha256) {
    if (-not (Test-Path -LiteralPath $Target)) {
        & curl.exe --ssl-no-revoke -fL --max-time 180 -o $Target $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    }
    $actualHash = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash
    if ($actualHash -ne $Sha256) { throw "Unexpected SHA256: $Target ($actualHash)" }
}

Get-VerifiedDownload `
    'https://github.com/su2code/SU2/releases/download/v8.5.0/SU2-v8.5.0-win64-omp.zip' `
    (Join-Path $workRoot 'su2-win64.zip') `
    '4466fe21aedb5e0bad57afd45f829acbdec6ec79fe8c3f8954ddea06a4b4bc11'
Get-VerifiedDownload `
    'https://raw.githubusercontent.com/su2code/Tutorials/master/compressible_flow/Inviscid_ONERAM6/mesh_ONERAM6_inv_ffd.su2' `
    (Join-Path $workRoot 'mesh_ONERAM6_inv_ffd.su2') `
    '4293af48a08165633c872bf12c4dbc896a398e338f0165182acb4e1f696130e4'

$solverExe = Join-Path $workRoot 'su2/bin/bin/SU2_CFD.exe'
if (-not (Test-Path -LiteralPath $solverExe)) {
    $outerArchive = Join-Path $workRoot 'su2'
    if (-not (Test-Path -LiteralPath (Join-Path $outerArchive 'win64-omp.zip'))) {
        Expand-Archive -LiteralPath (Join-Path $workRoot 'su2-win64.zip') -DestinationPath $outerArchive
    }
    Expand-Archive -LiteralPath (Join-Path $outerArchive 'win64-omp.zip') -DestinationPath (Join-Path $outerArchive 'bin')
}
& python -m pip install --use-feature=truststore --target (Join-Path $workRoot 'python-deps') numpy==2.2.6 scipy==1.15.3 matplotlib==3.10.1
if ($LASTEXITCODE -ne 0) { throw 'Python dependencies could not be installed.' }
Write-Output 'Ready: python onera-m6/scripts/run_solver.py --fresh'
