# Implementation Plan: 002 — API Endpoints

Source task: [docs/tasks/002-api.md](../tasks/002-api.md)

## Goal

Add paginated transaction list and placeholder import endpoints using .NET minimal APIs, wire them into `Program.cs`, configure a test API key in `appsettings.Development.json`, and create a `test-api.http` file.

## Current State (verified)

- [Program.cs](../../src/BudgetTracker.Api/Program.cs) — already has auth, anti-forgery, EF, and a `/api` group with `MapAntiForgeryEndpoints()` and `MapAuthEndpoints()`. No transaction endpoints yet.
- `src/BudgetTracker.Api/Features/Transactions/` exists with only `TransactionTypes.cs` (from task 001).
- No `List/`, `Import/`, or `TransactionApi.cs` yet.
- `appsettings.Development.json` exists but has **no `StaticApiKeys` section** — the API key for testing must be added.
- No `test-api.http` at the project root.
- `samples/` folder contains `generic-bank-sample.csv` and others — use for `.http` file reference.
- `ConditionalAntiforgeryFilter` is already implemented in [AntiForgery/ConditionalAntiforgeryFilter.cs](../../src/BudgetTracker.Api/AntiForgery/ConditionalAntiforgeryFilter.cs).
- `ClaimsPrincipalExtensions.GetUserId()` is in [Auth/ClaimsPrincipalExtensions.cs](../../src/BudgetTracker.Api/Auth/ClaimsPrincipalExtensions.cs).

## ⚠️ Notes on the task doc

1. **Step 2.4 `ImportAsync` signature** — the task shows `BudgetTrackerContext context` in the parameter list but never uses it (the body is a placeholder returning a hardcoded `ImportResult`). That is intentional for this task; the real context usage comes in task 003.

2. **Step 2.6 is a diff, not a full file** — it shows only the method change (`MapTransactionImportEndpoints`) with a `// ... rest stays the same` comment. Don't treat it as a complete file replacement; just add `.DisableAntiforgery().AddEndpointFilter<ConditionalAntiforgeryFilter>()` to the `MapPost` call written in step 2.4.

3. **The checkpoint's `ImportApi.cs`** already includes a `CsvImporter` parameter (from task 003) — don't copy that; keep this task's version with the placeholder body.

4. **`appsettings.Development.json` is in a restricted path** — the plan notes to use `dotnet user-secrets` or edit the file directly; the file exists and must receive the `StaticApiKeys` section. Since the file is permission-restricted for direct Read, the Edit tool should still work (it only needs a write, not a read).

## Steps

### 1. Create `List/PagedResult.cs`

New file `src/BudgetTracker.Api/Features/Transactions/List/PagedResult.cs`:

```csharp
namespace BudgetTracker.Api.Features.Transactions.List;

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasNextPage => Page < TotalPages;
    public bool HasPreviousPage => Page > 1;
}
```

### 2. Create `List/TransactionListApi.cs`

New file — note the endpoint returns `PagedResult<Transaction>` (entities, not DTOs), matching the checkpoint:

```csharp
using System.Security.Claims;
using BudgetTracker.Api.Auth;
using BudgetTracker.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BudgetTracker.Api.Features.Transactions.List;

public static class TransactionListApi
{
    public static IEndpointRouteBuilder MapTransactionListEndpoint(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/",
            async (BudgetTrackerContext db, ClaimsPrincipal claimsPrincipal, int page = 1, int pageSize = 20) =>
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var query = db.Transactions.Where(t => t.UserId == claimsPrincipal.GetUserId());
                var totalCount = await query.CountAsync();

                var items = await query
                    .OrderByDescending(t => t.Date)
                    .ThenByDescending(t => t.ImportedAt)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                return Results.Ok(new PagedResult<Transaction>
                {
                    Items = items,
                    TotalCount = totalCount,
                    Page = page,
                    PageSize = pageSize
                });
            });

        return routes;
    }
}
```

### 3. Create `Import/ImportResult.cs`

New file `src/BudgetTracker.Api/Features/Transactions/Import/ImportResult.cs` — straight from the task, no changes needed.

### 4. Create `Import/ImportApi.cs`

New file `src/BudgetTracker.Api/Features/Transactions/Import/ImportApi.cs` — combine steps 2.4 and 2.6 into one file (add `.DisableAntiforgery().AddEndpointFilter<ConditionalAntiforgeryFilter>()` inline, don't do it as a second pass):

```csharp
using System.Security.Claims;
using BudgetTracker.Api.AntiForgery;
using BudgetTracker.Api.Auth;
using BudgetTracker.Api.Infrastructure;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace BudgetTracker.Api.Features.Transactions.Import;

public static class ImportApi
{
    public static IEndpointRouteBuilder MapTransactionImportEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapPost("/import", ImportAsync)
            .DisableAntiforgery()
            .AddEndpointFilter<ConditionalAntiforgeryFilter>();

        return routes;
    }

    private static async Task<Results<Ok<ImportResult>, BadRequest<string>>> ImportAsync(
        IFormFile file, [FromForm] string account,
        BudgetTrackerContext context, ClaimsPrincipal claimsPrincipal)
    {
        var validationResult = ValidateFileInput(file, account);
        if (validationResult != null) return validationResult;

        try
        {
            var result = new ImportResult
            {
                TotalRows = 0,
                ImportedCount = 0,
                FailedCount = 0,
                SourceFile = file.FileName,
                ImportedAt = DateTime.UtcNow
            };

            return TypedResults.Ok(result);
        }
        catch (Exception ex)
        {
            return TypedResults.BadRequest(ex.Message);
        }
    }

    private static BadRequest<string>? ValidateFileInput(IFormFile file, string account)
    {
        if (file == null || file.Length == 0)
            return TypedResults.BadRequest("No file uploaded");
        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            return TypedResults.BadRequest("Only CSV files are supported");
        if (file.Length > 10 * 1024 * 1024)
            return TypedResults.BadRequest("File size exceeds 10MB limit");
        if (string.IsNullOrWhiteSpace(account))
            return TypedResults.BadRequest("Account name is required");
        return null;
    }
}
```

### 5. Create `TransactionApi.cs`

New file `src/BudgetTracker.Api/Features/Transactions/TransactionApi.cs` — straight from the task.

### 6. Update `Program.cs`

Add `using BudgetTracker.Api.Features.Transactions;` at the top and chain `.MapTransactionEndpoints()` to the existing `/api` group (after `.MapAuthEndpoints()`). This mirrors the checkpoint exactly.

### 7. Add `StaticApiKeys` to `appsettings.Development.json`

The file exists but has no `StaticApiKeys` key. Add the section with a test key pointing to a placeholder `UserId`. Use a known test user ID from the DB or a placeholder like `"admin@example.com"` for initial development:

```json
{
  "StaticApiKeys": {
    "Keys": {
      "test-key-user1": {
        "UserId": "admin@example.com",
        "Name": "Test User",
        "Description": "API key for cohort testing"
      }
    }
  }
}
```

### 8. Create `test-api.http` at the project root

```http
### Test Transaction List (Empty)
GET http://localhost:5295/api/transactions
X-API-Key: test-key-user1

### Test Transaction List with Pagination
GET http://localhost:5295/api/transactions?page=1&pageSize=10
X-API-Key: test-key-user1

### Test Import Endpoint (Placeholder)
POST http://localhost:5295/api/transactions/import
X-API-Key: test-key-user1
Content-Type: multipart/form-data; boundary=WebAppBoundary

--WebAppBoundary
Content-Disposition: form-data; name="account"

Checking Account
--WebAppBoundary
Content-Disposition: form-data; name="file"; filename="generic-bank-sample.csv"
Content-Type: text/csv

< ./samples/generic-bank-sample.csv
--WebAppBoundary--
```

## Verification

1. `dotnet build` succeeds with 0 errors.
2. `GET /api/transactions` returns `200` with empty `PagedResult` shape.
3. `POST /api/transactions/import` with a CSV file returns `200` with placeholder `ImportResult`.
4. Auth is enforced: requests without `X-API-Key` return `401`.

## Files to create / edit

| Action | Path |
|--------|------|
| Create | `src/BudgetTracker.Api/Features/Transactions/List/PagedResult.cs` |
| Create | `src/BudgetTracker.Api/Features/Transactions/List/TransactionListApi.cs` |
| Create | `src/BudgetTracker.Api/Features/Transactions/Import/ImportResult.cs` |
| Create | `src/BudgetTracker.Api/Features/Transactions/Import/ImportApi.cs` |
| Create | `src/BudgetTracker.Api/Features/Transactions/TransactionApi.cs` |
| Edit   | `src/BudgetTracker.Api/Program.cs` |
| Edit   | `src/BudgetTracker.Api/appsettings.Development.json` |
| Create | `test-api.http` (project root) |
