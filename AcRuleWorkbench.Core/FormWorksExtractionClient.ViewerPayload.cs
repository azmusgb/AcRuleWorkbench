using System;

namespace AcRuleWorkbench.Core;

public sealed partial class FormWorksExtractionClient : IFormWorksExtractionClient
{
    private static string ViewerPayloadSplitMarker => "viewer-payload-v93";
}
