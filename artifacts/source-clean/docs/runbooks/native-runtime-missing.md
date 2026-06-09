# Runbook: Native Runtime Missing

This runbook addresses native FormWorks/DCM runtime availability for read-only inspection.

1. Confirm x86 build output is being used.
2. Run:

   ```powershell
   .\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd -Configuration Debug -Platform x86
   ```

3. Confirm managed DLLs exist in `lib`, including:
   - `rrifwd_net.dll`
   - `rribase_net.dll`
   - `rridc_net.dll`
   - `rriwf2_net.dll`
   - `FormWorks.Core.dll`
4. Confirm native x86 DLLs exist in `rri_bin`, including:
   - `rrifwd.dll`
   - `rribase.dll`
   - `rridc.dll`
   - `rriwf2.dll`
5. Confirm `scripts/runtime-path.generated.ps1` exists.
6. Re-run dependency setup if folders or PATH helper are missing:

   ```powershell
   .\scripts\setup-dcm-deps.ps1
   ```

7. Restart FW Companion.
