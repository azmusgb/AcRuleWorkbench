using System;
using DllInteropHarness.Core;

namespace DllInteropHarness.Api.V1;

internal sealed class WorkbenchSnapshotCache
{
    private readonly IDllClient _client;
    private readonly object _gate = new object();
    private WorkbenchSnapshot? _current;

    public WorkbenchSnapshotCache(IDllClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
    }

    public WorkbenchSnapshot? Current
    {
        get
        {
            lock (_gate)
                return _current;
        }
    }

    public WorkbenchSnapshot GetOrBuild(string fwdPath, string processName, bool requireNativeOk)
    {
        lock (_gate)
        {
            if (_current != null
                && string.Equals(_current.FwdPath, fwdPath, StringComparison.OrdinalIgnoreCase)
                && string.Equals(_current.Rules.ProcessName, processName, StringComparison.OrdinalIgnoreCase))
            {
                return _current;
            }

            _current = WorkbenchSnapshotBuilder.Build(_client, fwdPath, processName, requireNativeOk);
            return _current;
        }
    }

    public WorkbenchSnapshot Rebuild(string fwdPath, string processName, bool requireNativeOk)
    {
        lock (_gate)
        {
            _current = WorkbenchSnapshotBuilder.Build(_client, fwdPath, processName, requireNativeOk);
            return _current;
        }
    }
}
