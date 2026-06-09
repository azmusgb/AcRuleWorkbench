# TODO - Recommended changes implementation

## Plan (approved)
Implement remaining recommended work by updating:
- `AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerExport.cs` (viewer export + extraction pipeline)
- related helpers for UDF/private-tree decoding
- related helpers for resource export

Then:
- build/test
- commit on `blackboxai/` branch
- push and open a PR

## Steps
- [ ] Create branch `blackboxai/` (after checking current git state)
- [ ] Inspect and edit `FormWorksExtractionClient.ViewerExport.cs` to implement the recommended extraction pipeline improvements
- [ ] Inspect and edit UDF/private-tree decoding helpers as required to complete canonical UDF body parsing + caller/callee graph
- [ ] Inspect and edit resource export helpers as required
- [ ] Run unit tests
- [ ] Build the solution
- [ ] Stage changes, commit with meaningful message
- [ ] Push branch to origin
- [ ] Open PR to target branch

