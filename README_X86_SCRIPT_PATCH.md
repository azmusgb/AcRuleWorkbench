# AC Rule Workbench x86 Script Patch

This patch updates the script layer so the FormWorks/DCM workbench builds and runs as 32-bit/x86.

## Why

The FormWorks native runtime DLLs used by `rrifwd_net` / `rribase_net` are 32-bit in this environment. The launcher must use:

```text
AcRuleWorkbench\bin\x86\<Configuration>\net48\AcRuleWorkbench.exe
```

and native DLLs must be loaded from:

```text
rri_bin
```

Managed wrapper DLLs remain in:

```text
lib
```

## Updated files

```text
AcRuleWorkbench/scripts/build.ps1
AcRuleWorkbench/scripts/build-and-doctor.ps1
AcRuleWorkbench/scripts/start-workbench.ps1
AcRuleWorkbench/scripts/start-workbench.cmd
AcRuleWorkbench/scripts/start-api.ps1
AcRuleWorkbench/scripts/start-api.cmd
AcRuleWorkbench/scripts/run-doctor.ps1
AcRuleWorkbench/scripts/run-harness.ps1
AcRuleWorkbench/scripts/setup-dcm-deps.ps1
AcRuleWorkbench/scripts/new-evidence-baseline.ps1
AcRuleWorkbench/scripts/package-split-deliverables.ps1
```

## Main commands

Build and validate x86 layout:

```powershell
.\scripts\build-and-doctor.ps1 -Configuration Debug -Platform x86
```

Start the workbench:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting
```

Run doctor:

```powershell
.\scripts\run-doctor.ps1 -Configuration Debug -RequireNativeOk
```

Start API only:

```powershell
.\scripts\start-api.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting -Build
```

Generate evidence baseline:

```powershell
.\scripts\new-evidence-baseline.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Configuration Debug
```

## Expected runtime shape

```text
AcRuleWorkbench\bin\x86\Debug\net48\
  AcRuleWorkbench.exe
  AcRuleWorkbench.Core.dll
  rribase_net.dll
  rrifwd_net.dll
  rridc_net.dll
  rriwf2_net.dll
  FormWorks.Core.dll
  FormWorks.Versioning.dll
```

Native DLLs are loaded from PATH using:

```text
rri_bin\rribase.dll
rri_bin\rrifwd.dll
rri_bin\rridc.dll
rri_bin\rriwf2.dll
```

If `-CopyNativeToOutput` is passed to `build-and-doctor.ps1` or `start-workbench.ps1`, the native DLLs are also copied beside the EXE.
