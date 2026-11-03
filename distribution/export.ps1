<#
  配布用リポジトリ（cpslab/handson-2026-m5-child）に、子機のコードを書き出す（講師用）

  使い方（リポジトリ直下で実行）:
    .\distribution\export.ps1          # 書き出して、コミットまでする（push はしない）
    .\distribution\export.ps1 -Push    # 書き出して、push までする

  - 書き出すのは -Ref のコミットの中身（既定は origin/develop = マージ済みのもの）。
    手元で書き換えて、まだコミットしていない内容（自分の MY_NAME など）は出ない。
  - ブランチごとの中身:
      全ブランチ   … distribution/common/ と child/platformio.ini
      step1-hello  … distribution/step1-hello/src/
      step2-sensor … distribution/step2-sensor/src/
      step3-mqtt   … child/src/ と child/include/secrets.example.h（完成版）
#>
param(
    [string]$Ref = "origin/develop",
    [string]$Repo = "https://github.com/cpslab/handson-2026-m5-child.git",
    [switch]$Push
)

$root = Split-Path $PSScriptRoot -Parent

# git が失敗したら止める（PowerShell 5.1 は外部コマンドの失敗で止まらないため）
function Invoke-Git {
    & git.exe @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') が失敗しました" }
}

# ===== 書き出す元（-Ref のコミット）を一時フォルダに取り出す =====
Invoke-Git -C $root fetch -q origin
$rev = (& git.exe -C $root rev-parse --short $Ref).Trim()
$tmp = Join-Path ([IO.Path]::GetTempPath()) "handson-2026-m5-export"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force "$tmp\src" | Out-Null
Invoke-Git -C $root archive --format=tar -o "$tmp\src.tar" $Ref child distribution
tar -xf "$tmp\src.tar" -C "$tmp\src"
if ($LASTEXITCODE -ne 0) { throw "tar の展開に失敗しました" }
$src = "$tmp\src"

# ===== 配布用リポジトリを clone する =====
$work = "$tmp\dist"
Invoke-Git clone -q $Repo $work

$steps = [ordered]@{
    "step1-hello"  = @("distribution\step1-hello\src")
    "step2-sensor" = @("distribution\step2-sensor\src")
    "step3-mqtt"   = @("child\src", "child\include\secrets.example.h")
}

foreach ($branch in $steps.Keys) {
    # ブランチがあれば続きから、なければ新しく（履歴なしで）つくる
    & git.exe -C $work rev-parse -q --verify "origin/$branch" *> $null
    if ($LASTEXITCODE -eq 0) {
        Invoke-Git -C $work checkout -q -B $branch "origin/$branch"
    } else {
        Invoke-Git -C $work checkout -q --orphan $branch
    }

    # 中身をいったん空にして、書き出す元からコピーし直す
    Invoke-Git -C $work read-tree --empty
    Get-ChildItem -Force $work | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

    Copy-Item -Recurse -Force "$src\distribution\common\*" $work
    Copy-Item "$src\child\platformio.ini" $work
    foreach ($path in $steps[$branch]) {
        $dest = if ($path -like "*\src") { "$work\src" } else { "$work\include" }
        New-Item -ItemType Directory -Force $dest | Out-Null
        if ($path -like "*\src") {
            Copy-Item -Recurse -Force "$src\$path\*" $dest
        } else {
            Copy-Item -Force "$src\$path" $dest
        }
    }

    Invoke-Git -C $work add -A
    & git.exe -C $work diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$branch : 変更なし"
        continue
    }
    Invoke-Git -C $work commit -q -m "update: handson-2026-m5 の $rev から書き出す"
    Write-Host "$branch : コミットしました"
}

if ($Push) {
    Invoke-Git -C $work push -q origin @($steps.Keys)
    Write-Host "push しました: $Repo"
} else {
    Write-Host ""
    Write-Host "まだ push していません。中身を確かめてから push してください:"
    Write-Host "  cd $work"
    Write-Host "  git push origin $(@($steps.Keys) -join ' ')"
}
