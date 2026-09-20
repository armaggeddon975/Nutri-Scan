# Empacotamento do ZIP de auditoria.
#
# Ate a v0.7.0 isto era feito a mao, colando comandos no terminal. O problema
# nao e o trabalho: e que um passo esquecido produz um pacote com conteudo
# errado e ninguem percebe, porque o ZIP so e aberto pelo auditor, depois da
# entrega. O achado B1 da auditoria externa da v0.6.7 foi exatamente isso -
# artefatos declarados no CHANGELOG que nao estavam no pacote.
#
# O script monta o pacote, VALIDA o resultado e so entao grava o hash. Se a
# validacao falhar, o ZIP e apagado: um pacote invalido no disco acaba sendo
# entregue por engano.
#
# `Compress-Archive` do PowerShell 5.1 grava barra invertida nos caminhos de
# subpasta, o que quebra a leitura em Linux e macOS. Por isso o nome de cada
# entrada e escrito a mao via System.IO.Compression.

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$versao = (Get-Content (Join-Path $raiz "package.json") -Raw | ConvertFrom-Json).version
$nome = "nutriscan-v$versao-auditoria.zip"
$destino = Join-Path $raiz "releases\$nome"

$pastasExcluidas = @(".git", "node_modules", "dist", "coverage", "logs", "caches", ".claude", "releases", ".pgdata")
$arquivosExcluidos = @(".env", ".env.local")

Write-Output "[RUN] empacotando $nome"

if (Test-Path $destino) {
    Remove-Item $destino -Force
}

# --- selecao dos arquivos -------------------------------------------------

$selecionados = New-Object System.Collections.ArrayList

Get-ChildItem -Path $raiz -Recurse -File -Force | ForEach-Object {
    $relativo = $_.FullName.Substring($raiz.Length + 1).Replace("\", "/")

    # Cada segmento do caminho, e nao so o primeiro. `backend/node_modules/`
    # comeca com "backend" e passaria por uma checagem de raiz - foi assim que
    # a primeira versao deste script montou um pacote com 3586 entradas em vez
    # de 149.
    $segmentos = $relativo.Split("/")
    $pastaDoCaminho = $segmentos[0..($segmentos.Length - 2)]
    $proibida = $false
    foreach ($segmento in $pastaDoCaminho) {
        if ($pastasExcluidas -contains $segmento) { $proibida = $true }
    }
    if ($proibida) { return }
    if ($arquivosExcluidos -contains $_.Name) { return }
    if ($_.Extension -eq ".zip") { return }
    if ($relativo -eq "backend/.env") { return }
    if ($relativo -eq "E2E_LAST_RUN.json") { return }

    [void]$selecionados.Add([PSCustomObject]@{ Caminho = $_.FullName; Entrada = $relativo })
}

if ($selecionados.Count -eq 0) {
    throw "nenhum arquivo selecionado - a lista de exclusao esta errada"
}

# --- montagem -------------------------------------------------------------

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fluxo = [System.IO.File]::Open($destino, [System.IO.FileMode]::CreateNew)
try {
    $zip = New-Object System.IO.Compression.ZipArchive($fluxo, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($item in $selecionados) {
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $item.Caminho, $item.Entrada, [System.IO.Compression.CompressionLevel]::Optimal)
        }
    } finally {
        $zip.Dispose()
    }
} finally {
    $fluxo.Dispose()
}

# --- validacao ------------------------------------------------------------
#
# Le o ZIP GRAVADO, e nao a lista em memoria. Validar a intencao em vez do
# artefato deixaria passar qualquer erro de escrita.

$problemas = New-Object System.Collections.ArrayList
$zip = [System.IO.Compression.ZipFile]::OpenRead($destino)
try {
    $entradas = $zip.Entries | ForEach-Object { $_.FullName }

    foreach ($entrada in $entradas) {
        if ($entrada.Contains("\")) {
            [void]$problemas.Add("caminho com barra invertida: $entrada")
        }
        foreach ($segmento in $entrada.Split("/")) {
            if ($pastasExcluidas -contains $segmento) {
                [void]$problemas.Add("pasta proibida no pacote: $entrada")
            }
        }
        if ($entrada.EndsWith(".zip")) {
            [void]$problemas.Add("ZIP aninhado: $entrada")
        }
        if ($entrada -eq ".env" -or $entrada.EndsWith("/.env") -or $entrada.EndsWith("/.env.local")) {
            [void]$problemas.Add("arquivo de ambiente no pacote: $entrada")
        }
    }

    $obrigatorios = @("CLAUDE.md", "CHANGELOG.md", "AUDIT_REPORT.md", "E2E_REPORT.md", "package.json")
    foreach ($obrigatorio in $obrigatorios) {
        if ($entradas -notcontains $obrigatorio) {
            [void]$problemas.Add("arquivo obrigatorio ausente: $obrigatorio")
        }
    }

    $total = $entradas.Count
} finally {
    $zip.Dispose()
}

if ($problemas.Count -gt 0) {
    Remove-Item $destino -Force
    Write-Output "[FAIL] pacote invalido - ZIP removido"
    $problemas | ForEach-Object { Write-Output "  $_" }
    exit 1
}

# --- hash -----------------------------------------------------------------

$hash = (Get-FileHash $destino -Algorithm SHA256).Hash.ToLower()
$somas = Join-Path $raiz "releases\SHA256SUMS.txt"

$linhas = @()
if (Test-Path $somas) {
    $linhas = @(Get-Content $somas | Where-Object { $_ -notmatch [regex]::Escape($nome) -and $_.Trim() -ne "" })
}
$linhas += "$hash  $nome"
$linhas | Sort-Object | Set-Content $somas -Encoding UTF8

Write-Output "[OK] $nome"
Write-Output "  entradas: $total"
Write-Output "  sha256:   $hash"
