[CmdletBinding()]
param(
    [string]$TreeJson = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'ac-rule-viewer.tree.json')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $TreeJson -PathType Leaf)) {
    throw "Tree sidecar not found: $TreeJson"
}

$json = Get-Content -LiteralPath $TreeJson -Raw | ConvertFrom-Json
$nodes = @($json.Nodes)
$rules = @($nodes | Where-Object { $_.IsRuleNode })
$additional = @($rules | Where-Object { $_.Attributes._AdditionalRule -eq 'true' -or $_.Category -eq 'AdditionalRule' })
$placed = @($rules | Where-Object { -not ($_.Attributes._AdditionalRule -eq 'true' -or $_.Category -eq 'AdditionalRule') })

$byScope = $rules | Group-Object ScopePath | ForEach-Object {
    $scopeRules = @($_.Group)
    $scopeAdditional = @($scopeRules | Where-Object { $_.Attributes._AdditionalRule -eq 'true' -or $_.Category -eq 'AdditionalRule' })
    [pscustomobject]@{
        ScopePath = $_.Name
        RuleCount = $scopeRules.Count
        PlacedRuleCount = $scopeRules.Count - $scopeAdditional.Count
        AdditionalRuleCount = $scopeAdditional.Count
    }
} | Sort-Object AdditionalRuleCount -Descending, ScopePath

[pscustomobject]@{
    TreeJson = (Resolve-Path -LiteralPath $TreeJson).Path
    RuleCount = $rules.Count
    PlacedRuleCount = $placed.Count
    AdditionalRuleCount = $additional.Count
    ByScope = $byScope
} | ConvertTo-Json -Depth 5
