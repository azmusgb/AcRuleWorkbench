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
    private static void PopulateResourceDetails(Fwd fwd, FwdInspectionOptions options, FwdInspectionReport report)
    {
        if ((!options.IncludeResourceConfigs && !options.IncludeResourcePrivateTrees) || report.Resources.Count == 0)
            return;

        int maxDepth = Math.Max(1, options.MaxPrivateTreeDepth);
        int maxNodes = Math.Max(1, options.MaxPrivateTreeNodes);

        foreach (ResourceBucket bucket in report.Resources)
        {
            var detail = new ResourceTypeDetail { Type = bucket.Type };

            if (bucket.Names.Count == 0)
            {
                report.ResourceTypeDetails.Add(detail);
                continue;
            }

            if (options.IncludeResourceConfigs)
            {
                try
                {
                    object? typeConfig = fwd.GetResourceTypeConfig(bucket.Type);
                    detail.TypeAttributes.AddRange(ReadAttrEntries(typeConfig));
                }
                catch (Exception ex)
                {
                    report.Warnings.Add($"Could not read type config for resource type '{bucket.Type}': {ex.Message}");
                }
            }

            foreach (string resourceName in bucket.Names)
            {
                var resource = new ResourceDetail
                {
                    Type = bucket.Type,
                    Name = resourceName,
                    Category = ClassifyResourceCategory(bucket.Type)
                };

                if (options.IncludeResourceConfigs)
                {
                    try
                    {
                        object? fullConfig = fwd.GetResourceConfig(bucket.Type, resourceName);
                        resource.FullAttributes.AddRange(ReadAttrEntries(fullConfig));
                    }
                    catch (Exception ex)
                    {
                        resource.Warnings.Add($"Could not read full config: {ex.Message}");
                    }

                    try
                    {
                        object? publicConfig = fwd.GetResourcePublicConfig(bucket.Type, resourceName);
                        resource.PublicAttributes.AddRange(ReadAttrEntries(publicConfig));
                    }
                    catch (Exception ex)
                    {
                        resource.Warnings.Add($"Could not read public config: {ex.Message}");
                    }
                }

                if (options.IncludeResourcePrivateTrees)
                {
                    try
                    {
                        object? privateNode = fwd.GetResourceNodePrivate(bucket.Type, resourceName);
                        if (privateNode != null)
                        {
                            int visited = 0;
                            resource.PrivateTree = ReadResourcePrivateTreeNode(privateNode, resourceName, resourceName, 0, maxDepth, maxNodes, ref visited);

                            if (privateNode is IDisposable disposable)
                                disposable.Dispose();
                        }
                    }
                    catch (Exception ex)
                    {
                        resource.Warnings.Add($"Could not read private STC tree: {ex.Message}");
                    }
                }

                detail.Resources.Add(resource);
            }

            report.ResourceTypeDetails.Add(detail);
        }

        BuildResourceDependencyMap(report);
    }

private static void BuildResourceDependencyMap(FwdInspectionReport report)
    {
        var knownResources = report.ResourceTypeDetails
            .SelectMany(rt => rt.Resources.Select(r => new { r.Type, r.Name }))
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .ToList();

        if (knownResources.Count == 0)
            return;

        foreach (ResourceTypeDetail type in report.ResourceTypeDetails)
        {
            foreach (ResourceDetail resource in type.Resources)
            {
                foreach (ResourceAttrEntry attr in resource.FullAttributes.Concat(resource.PublicAttributes))
                {
                    foreach (var other in knownResources)
                    {
                        if (string.Equals(other.Type, resource.Type, StringComparison.OrdinalIgnoreCase)
                            && string.Equals(other.Name, resource.Name, StringComparison.OrdinalIgnoreCase))
                            continue;

                        if (ContainsIgnoreCase(attr.Value, other.Name))
                        {
                            report.ResourceDependencies.Add(new ResourceDependencyEdge
                            {
                                ResourceType = other.Type,
                                ResourceName = other.Name,
                                ScopePath = resource.Type + "/" + resource.Name,
                                RuleIndex = -1,
                                RuleName = resource.Name,
                                FunctionName = null,
                                Kind = "ResourceConfigReference"
                            });
                        }
                    }
                }
            }
        }
    }

private static IEnumerable<ResourceAttrEntry> ReadAttrEntries(object? attrCollection)
    {
        if (attrCollection == null)
            return Array.Empty<ResourceAttrEntry>();

        var results = new List<ResourceAttrEntry>();

        if (attrCollection is IDictionary dictionary)
        {
            foreach (DictionaryEntry entry in dictionary)
            {
                string key = Convert.ToString(entry.Key) ?? string.Empty;
                string value = Convert.ToString(entry.Value) ?? string.Empty;
                results.Add(new ResourceAttrEntry
                {
                    Key = key,
                    Value = Truncate(value, 4000),
                    ValueType = entry.Value?.GetType().Name ?? string.Empty
                });
            }
            return results;
        }

        try
        {
            object? keysObj = GetPropertyValue(attrCollection, "Keys");
            IEnumerable keys = keysObj as IEnumerable ?? Array.Empty<object>();

            foreach (object keyObj in keys)
            {
                string key = Convert.ToString(keyObj) ?? string.Empty;
                string value;
                try
                {
                    object? raw = InvokeMethod(attrCollection, "Print", key);
                    value = Convert.ToString(raw) ?? string.Empty;
                }
                catch { value = string.Empty; }

                string typeName = string.Empty;
                try
                {
                    MethodInfo? getTypeName = attrCollection.GetType().GetMethod("TypeName", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(string) }, null);
                    if (getTypeName != null)
                        typeName = Convert.ToString(getTypeName.Invoke(attrCollection, new object[] { key })) ?? string.Empty;
                }
                catch
                {
                    typeName = string.Empty;
                }

                results.Add(new ResourceAttrEntry
                {
                    Key = key ?? string.Empty,
                    Value = Truncate(value.Trim(), 4000),
                    ValueType = typeName
                });
            }
        }
        catch
        {
            // If this object does not expose enumerable keys/print access, return empty entries.
        }

        return results;
    }

private static ResourcePrivateNode ReadResourcePrivateTreeNode(
        object node,
        string name,
        string path,
        int depth,
        int maxDepth,
        int maxNodes,
        ref int visited)
    {
        visited++;
        var summary = new ResourcePrivateNode
        {
            Name = name,
            Path = path,
            Depth = depth
        };

        try
        {
            object? isCollection = GetPropertyValue(node, "IsCollection");
            if (isCollection is bool b)
                summary.IsCollection = b;
        }
        catch (Exception ex)
        {
            summary.Warnings.Add("Could not read IsCollection: " + ex.Message);
        }

        try
        {
            object? size = GetPropertyValue(node, "Size");
            if (size != null)
                summary.Size = Convert.ToInt32(size);
        }
        catch
        {
            // Size isn't guaranteed on all node types.
        }

        try
        {
            object? value = GetPropertyValue(node, "Value");
            if (value is string text && !string.IsNullOrWhiteSpace(text))
                summary.ValuePreview = Truncate(text.Replace("\0", string.Empty), 500);
        }
        catch
        {
            // Value is optional for many node types.
        }

        try
        {
            object? data = GetPropertyValue(node, "Data");
            if (data is byte[] bytes && bytes.Length > 0)
            {
                summary.DataLength = bytes.Length;
                summary.RawDataBytes = bytes;
                summary.IsBinaryPayload = bytes.Any(b => b == 0) || bytes.Any(b => b < 9);
                using var sha = SHA256.Create();
                summary.DataSha256 = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }
        catch
        {
            // Data is optional.
        }

        if (depth >= maxDepth || visited >= maxNodes)
            return summary;

        string[] childNames = Array.Empty<string>();
        try
        {
            object? rawChildren = GetPropertyValue(node, "ChildNames");
            if (rawChildren is string[] names)
                childNames = names;
        }
        catch (Exception ex)
        {
            summary.Warnings.Add("Could not read ChildNames: " + ex.Message);
        }

        foreach (string childName in childNames.Where(c => !string.IsNullOrWhiteSpace(c)))
        {
            if (visited >= maxNodes)
                break;

            object? child = null;
            try
            {
                try
                {
                    child = InvokeMethod(node, "GetChildHandle", childName, false);
                }
                catch
                {
                    child = InvokeMethod(node, "GetChildNode", childName, false);
                }

                if (child == null)
                    continue;

                string childPath = path + "/" + childName;
                summary.Children.Add(ReadResourcePrivateTreeNode(child, childName, childPath, depth + 1, maxDepth, maxNodes, ref visited));
            }
            catch (Exception ex)
            {
                summary.Warnings.Add($"Could not traverse child '{childName}': {ex.Message}");
            }
            finally
            {
                if (child is IDisposable disposable)
                    disposable.Dispose();
            }
        }

        return summary;
    }

private static string ClassifyResourceCategory(string resourceType)
    {
        string t = resourceType ?? string.Empty;
        if (ContainsIgnoreCase(t, "table") || ContainsIgnoreCase(t, "selection")) return "Table";
        if (ContainsIgnoreCase(t, "date")) return "DateFormat";
        if (ContainsIgnoreCase(t, "udf") || ContainsIgnoreCase(t, "function")) return "UDFOrFunction";
        if (ContainsIgnoreCase(t, "regex") || ContainsIgnoreCase(t, "expr") || ContainsIgnoreCase(t, "charset")) return "ExpressionOrCharset";
        if (ContainsIgnoreCase(t, "store") || ContainsIgnoreCase(t, "template")) return "StoreOrTemplate";
        return "Unknown";
    }
}
