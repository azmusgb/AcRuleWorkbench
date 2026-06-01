using System;

namespace AcRuleWorkbench;

internal sealed class ApiRouteNotFoundException : Exception
{
    public ApiRouteNotFoundException(string route)
        : base("Route not found: " + route)
    {
        Route = route;
    }

    public string Route { get; }
}
