# Runbook: Native runtime missing

1. Confirm x86 build output is being used.
2. Run `AcRuleWorkbench.exe doctor`.
3. Confirm `rrifwd_net.dll`, `rribase_net.dll`, `rridc_net.dll`, and native `rrifwd` dependencies are present or on PATH.
4. Re-run `scripts/setup-dcm-deps.ps1` if PATH/bootstrap files are missing.
5. Restart the workbench.
