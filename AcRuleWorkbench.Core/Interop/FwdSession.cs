using System;
using rri.fwd;

namespace AcRuleWorkbench.Core.Interop;

public sealed class FwdSession : IDisposable
{
    private bool _disposed;

    public FwdSession(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("FWD path is required.", nameof(path));

        SafeHandle = SafeFwdHandle.OpenReadOnly(path);
        Client = new Fwd(SafeHandle.DangerousGetHandle(), ownHandle: false, isReadonly: true);
    }

    public SafeFwdHandle SafeHandle { get; }

    public Fwd Client { get; }

    public void Dispose()
    {
        if (_disposed)
            return;

        Client.Dispose();
        SafeHandle.Dispose();
        _disposed = true;
    }
}
