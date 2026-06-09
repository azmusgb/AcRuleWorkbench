using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Diagnostics;
using Newtonsoft.Json;
using AcRuleWorkbench.Core.Interop;
using Microsoft.Extensions.Logging;
using rri.fwd;
using rri.ocr2;
namespace AcRuleWorkbench.Core;

public sealed partial class FormWorksExtractionClient : IFormWorksExtractionClient
{
    private static AcRelationshipReport BuildRelationshipReport(AcRuleReport rules, bool includeRules)
    {
        var report = new AcRelationshipReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName
        };
        report.Warnings.AddRange(rules.Warnings);

        if (includeRules)
            report.Rules.AddRange(rules.Rules);

        foreach (AcRuleSummary rule in rules.Rules)
        {
            foreach (AcRuleRelationship rel in ClassifyRuleRelationships(rule))
                AddRelationship(report.Relationships, rel);
        }

        report.RebuildCounts();
        return report;
    }

private static IEnumerable<AcRuleRelationship> ClassifyRuleRelationships(AcRuleSummary rule)
    {
        string function = rule.FunctionName ?? string.Empty;

        foreach (var param in rule.Parameters)
        {
            string key = param.Key ?? string.Empty;
            foreach (string value in param.Value.Where(v => !string.IsNullOrWhiteSpace(v)))
            {
                ParameterClassification classification = ClassifyParameter(function, key, value);

                yield return new AcRuleRelationship
                {
                    ScopePath = rule.ScopePath,
                    ScopeType = rule.ScopeType,
                    ScopeName = rule.ScopeName,
                    RuleIndex = rule.RuleIndex,
                    RuleGuid = rule.RuleGuid,
                    RuleName = rule.RuleName,
                    FunctionName = rule.FunctionName,
                    Kind = classification.Kind,
                    TargetType = classification.TargetType,
                    Target = value,
                    ParameterName = key,
                    ParameterRole = classification.ParameterRole,
                    IsOptionParameter = classification.IsOptionParameter,
                    Confidence = classification.IsOptionParameter ? "High" : "Medium",
                    RelationshipReason = classification.ParameterRole,
                    Evidence = $"{key}={value}"
                };
            }
        }

        if (string.Equals(function, "_IRejectFields", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string message in GetParameterValues(rule, "RejectString"))
            {
                yield return new AcRuleRelationship
                {
                    ScopePath = rule.ScopePath,
                    ScopeType = rule.ScopeType,
                    ScopeName = rule.ScopeName,
                    RuleIndex = rule.RuleIndex,
                    RuleGuid = rule.RuleGuid,
                    RuleName = rule.RuleName,
                    FunctionName = rule.FunctionName,
                    Kind = "EmitsRejectMessage",
                    TargetType = "RejectMessage",
                    Target = message,
                    ParameterName = "RejectString",
                    ParameterRole = "RejectMessage",
                    Confidence = "High",
                    RelationshipReason = "RejectString parameter",
                    Evidence = message
                };
            }
        }

        foreach (AcRuleRelationship disabledRelationship in ClassifyDisabledRelationships(rule))
            yield return disabledRelationship;

        foreach (string source in rule.Sources)
        {
            yield return new AcRuleRelationship
            {
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                Kind = source.Equals("_Disabled", StringComparison.OrdinalIgnoreCase) ? "DisabledBySource" : "UsesSource",
                TargetType = "Source",
                Target = source,
                ParameterName = "_Sources",
                ParameterRole = "SourceTag",
                Confidence = "High",
                RelationshipReason = source.Equals("_Disabled", StringComparison.OrdinalIgnoreCase) ? "Direct disabled source" : "Rule source tag",
                Evidence = source
            };
        }
    }

private static IEnumerable<AcRuleRelationship> ClassifyDisabledRelationships(AcRuleSummary rule)
    {
        if (rule.DisabledState == AcDisabledStates.DisabledDirect)
        {
            yield return new AcRuleRelationship
            {
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                Kind = "DisablesRuleBlock",
                TargetType = "RuleBlock",
                Target = rule.RuleName ?? ("#" + rule.RuleIndex),
                ParameterName = "_Sources",
                ParameterRole = "DisabledMarker",
                Confidence = "High",
                RelationshipReason = "Direct disabled marker",
                Evidence = rule.DisabledReason ?? "Rule contains direct disabled marker."
            };
        }

        if (rule.DisabledState == AcDisabledStates.DisabledInherited ||
            rule.DisabledState == AcDisabledStates.PossiblyDisabledInherited ||
            rule.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly)
        {
            yield return new AcRuleRelationship
            {
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                Kind = rule.DisabledState == AcDisabledStates.DisabledInherited
                    ? "DisabledInheritedFrom"
                    : rule.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly
                        ? "PossibleDisabledSequenceOnlyFrom"
                        : "PossiblyDisabledInheritedFrom",
                TargetType = "Rule",
                Target = rule.DisabledAncestorRuleName ?? (rule.DisabledAncestorRuleIndex.HasValue ? "#" + rule.DisabledAncestorRuleIndex.Value : "Unknown ancestor"),
                ParameterName = "DisabledAncestorRuleIndex",
                ParameterRole = rule.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly ? "DisabledSequenceFallback" : "DisabledInheritance",
                Confidence = rule.DisabledConfidence,
                RelationshipReason = "Disabled inheritance",
                Evidence = rule.DisabledReason
            };
        }
    }

    private static ParameterClassification ClassifyParameter(string functionName, string parameterName, string value)
    {
        string f = functionName ?? string.Empty;
        string p = parameterName ?? string.Empty;
        string v = value ?? string.Empty;

        if (p.Equals("RejectString", StringComparison.OrdinalIgnoreCase))
        {
            return new ParameterClassification
            {
                TargetType = "RejectMessage",
                Kind = "EmitsRejectMessage",
                ParameterRole = "RejectMessage"
            };
        }

        AcFunctionCatalog.Classification? catalog = AcFunctionCatalog.TryClassify(f, p);
        if (catalog != null)
        {
            return new ParameterClassification
            {
                TargetType = catalog.TargetType,
                Kind = catalog.RelationshipKind,
                ParameterRole = catalog.ParameterRole,
                IsOptionParameter = catalog.IsOptionParameter
            };
        }

        if (IsAttributeParameter(p))
        {
            return new ParameterClassification
            {
                TargetType = "Attribute",
                Kind = DetermineAttributeRelationshipKind(f),
                ParameterRole = "AttributeParameter"
            };
        }

        if (IsOptionParameter(p, v))
        {
            return new ParameterClassification
            {
                TargetType = IsRejectCodeOption(v) ? "RejectCode" : "Option",
                Kind = IsRejectCodeOption(v) ? "UsesRejectCode" : "UsesOption",
                ParameterRole = "OptionParameter",
                IsOptionParameter = true
            };
        }

        if (p.StartsWith("_ParamList", StringComparison.OrdinalIgnoreCase) || p.IndexOf("Field", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            bool looksField = v.Contains(".") || LooksLikeFieldName(v);
            if (looksField)
            {
                return new ParameterClassification
                {
                    TargetType = "Field",
                    Kind = DetermineFieldRelationshipKind(f, p),
                    ParameterRole = "FieldParameter"
                };
            }
        }

        if (p.IndexOf("Page", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return new ParameterClassification
            {
                TargetType = "Page",
                Kind = "UsesPage",
                ParameterRole = "PageParameter"
            };
        }

        return new ParameterClassification
        {
            TargetType = "Parameter",
            Kind = "UsesParameter",
            ParameterRole = "GenericParameter"
        };
    }

private static bool IsAttributeParameter(string parameterName)
    {
        return parameterName.Equals("AttrName", StringComparison.OrdinalIgnoreCase) ||
               parameterName.EndsWith("Attr", StringComparison.OrdinalIgnoreCase) ||
               parameterName.Equals("AttributeName", StringComparison.OrdinalIgnoreCase);
    }

private static bool IsOptionParameter(string parameterName, string value)
    {
        if (parameterName.IndexOf("OMRIndex", StringComparison.OrdinalIgnoreCase) >= 0)
            return true;

        if (KnownOptionNames.Contains(value, StringComparer.OrdinalIgnoreCase))
            return true;

        return false;
    }

private static bool IsRejectCodeOption(string value)
    {
        return value.Equals("RejectCode", StringComparison.OrdinalIgnoreCase) ||
               value.EndsWith("RejectCode", StringComparison.OrdinalIgnoreCase);
    }

    private static string DetermineAttributeRelationshipKind(string functionName)
    {
        string f = functionName ?? string.Empty;

        if (f.IndexOf("Clear", StringComparison.OrdinalIgnoreCase) >= 0)
            return "ClearsAttribute";
        if (f.IndexOf("Set", StringComparison.OrdinalIgnoreCase) >= 0)
            return "WritesAttribute";
        if (f.IndexOf("Get", StringComparison.OrdinalIgnoreCase) >= 0 || f.IndexOf("Test", StringComparison.OrdinalIgnoreCase) >= 0)
            return "ReadsAttribute";

        return "UsesAttribute";
    }

private static string DetermineFieldRelationshipKind(string functionName, string parameterName)
    {
        string f = functionName ?? string.Empty;
        string p = parameterName ?? string.Empty;

        if (f.IndexOf("Reject", StringComparison.OrdinalIgnoreCase) >= 0)
            return "RejectsField";
        if (f.Equals("Copy", StringComparison.OrdinalIgnoreCase) && p.EndsWith("1", StringComparison.OrdinalIgnoreCase))
            return "WritesField";
        if (f.Equals("Formatf", StringComparison.OrdinalIgnoreCase) ||
            f.Equals("DeleteLines", StringComparison.OrdinalIgnoreCase) ||
            f.StartsWith("LimitLine", StringComparison.OrdinalIgnoreCase) ||
            f.Equals("FormatDate", StringComparison.OrdinalIgnoreCase))
            return "MutatesField";
        if (f.IndexOf("SetFieldAttr", StringComparison.OrdinalIgnoreCase) >= 0)
            return "WritesFieldAttribute";
        if (f.IndexOf("ClearFieldAttr", StringComparison.OrdinalIgnoreCase) >= 0)
            return "ClearsFieldAttribute";

        return "UsesField";
    }

private static bool LooksLikeFieldName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (KnownOptionNames.Contains(value, StringComparer.OrdinalIgnoreCase))
            return false;

        if (value.StartsWith("temp", StringComparison.OrdinalIgnoreCase))
            return true;

        if (value.IndexOf('_') >= 0)
            return true;

        return value.Any(char.IsUpper) && value.Any(char.IsLower);
    }

private static IEnumerable<string> GetParameterValues(AcRuleSummary rule, string key)
    {
        return rule.Parameters.TryGetValue(key, out var values) ? values : Enumerable.Empty<string>();
    }

private static void AddRelationship(List<AcRuleRelationship> relationships, AcRuleRelationship candidate)
    {
        if (relationships.Any(r =>
            string.Equals(r.ScopePath, candidate.ScopePath, StringComparison.OrdinalIgnoreCase) &&
            r.RuleIndex == candidate.RuleIndex &&
            string.Equals(r.Kind, candidate.Kind, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(r.TargetType, candidate.TargetType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(r.Target, candidate.Target, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(r.ParameterName, candidate.ParameterName, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        relationships.Add(candidate);
    }

private static void ApplyRelationshipFilters(AcRelationshipReport report, AcTraceOptions options)
    {
        var filtered = report.Relationships.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(options.Field))
            filtered = filtered.Where(r => r.TargetType == "Field" && ContainsIgnoreCase(r.Target, options.Field.Trim()));

        if (!string.IsNullOrWhiteSpace(options.Attr))
            filtered = filtered.Where(r => r.TargetType == "Attribute" && ContainsIgnoreCase(r.Target, options.Attr.Trim()));

        if (!string.IsNullOrWhiteSpace(options.RelationshipKind))
            filtered = filtered.Where(r => ContainsIgnoreCase(r.Kind, options.RelationshipKind.Trim()));

        if (!string.IsNullOrWhiteSpace(options.Term))
        {
            string term = options.Term.Trim();
            filtered = filtered.Where(r =>
                ContainsIgnoreCase(r.ScopePath, term) ||
                ContainsIgnoreCase(r.ScopeName, term) ||
                ContainsIgnoreCase(r.RuleName, term) ||
                ContainsIgnoreCase(r.FunctionName, term) ||
                ContainsIgnoreCase(r.Kind, term) ||
                ContainsIgnoreCase(r.TargetType, term) ||
                ContainsIgnoreCase(r.Target, term) ||
                ContainsIgnoreCase(r.ParameterRole, term) ||
                ContainsIgnoreCase(r.Evidence, term));
        }

        var kept = filtered.ToList();
        report.Relationships.Clear();
        report.Relationships.AddRange(kept);

        if (options.IncludeRules)
        {
            var keys = new HashSet<string>(report.Relationships.Select(r => r.ScopePath + "#" + r.RuleIndex), StringComparer.OrdinalIgnoreCase);
            report.Rules.RemoveAll(r => !keys.Contains(r.ScopePath + "#" + r.RuleIndex));
        }
    }
}
