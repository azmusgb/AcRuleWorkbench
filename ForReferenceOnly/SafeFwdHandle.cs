using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using rri.fwd.Wrapper;

namespace DllInteropHarness.Core.Interop;

public sealed class SafeFwdHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    private SafeFwdHandle()
        : base(ownsHandle: true)
    {
    }

    public static SafeFwdHandle OpenReadOnly(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("FWD path is required.", nameof(path));

        IntPtr nativeHandle = FWD.OpenReadOnly(path);

        if (nativeHandle == IntPtr.Zero)
            throw new InvalidOperationException($"FWD.OpenReadOnly returned a null handle for '{path}'.");

        var safeHandle = new SafeFwdHandle();
        safeHandle.SetHandle(nativeHandle);
        return safeHandle;
    }

    public HandleRef ToHandleRef(object owner)
    {
        if (IsClosed || IsInvalid)
            throw new ObjectDisposedException(nameof(SafeFwdHandle));

        return new HandleRef(owner, handle);
    }

    protected override bool ReleaseHandle()
    {
        if (handle == IntPtr.Zero || handle == new IntPtr(-1))
            return true;

        try
        {
            FWD.Close(new HandleRef(this, handle));
            handle = IntPtr.Zero;
            return true;
        }
        catch
        {
            return false;
        }
    }
}
